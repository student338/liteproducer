/**
 * liteproducer PWA — Main application module.
 * Standalone client-side app that calls OpenAI-compatible APIs directly
 * or uses a background llama.cpp worker for local inference (.gguf/.safetensors).
 */
import { loadModel, unloadModel, isModelLoaded, generateStreaming as llamacppGenerate } from './llamacpp.js';
import { buildPDF, downloadPDF } from './pdf.js';

// -- Register Service Worker --------------------------------------------------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((err) => {
    console.warn('SW registration failed:', err);
  });
}

// -- DOM refs -----------------------------------------------------------------
const $ = (id) => document.getElementById(id);

const endpointEl = $('endpoint');
const apiKeyEl = $('api-key');
const modelEl = $('model');
const systemPromptEl = $('system-prompt');
const titleEl = $('title');
const genreEl = $('genre');
const numChEl = $('num-chapters');
const plotEl = $('plot');
const superPromptEl = $('super-prompt');
const numBooksTotalEl = $('num-books-total');
const derivativeFile = $('derivative-file');
const fileNameLabel = $('derivative-file-name');
const btnClearUpload = $('btn-clear-upload');
const themeSelect = $('theme-select');

const btnStart = $('btn-start');
const btnCancel = $('btn-cancel');
const btnContinuous = $('btn-continuous');
const contBadge = $('continuous-badge');

const statusBar = $('status-bar');
const chipsEl = $('chapter-chips');
const previewEl = $('preview-content');
const livePreview = $('live-preview');

const instrInput = $('instruction-input');
const btnInstruct = $('btn-instruct');

const btnRefresh = $('btn-refresh');
const bookList = $('book-list');

// llama.cpp elements
const llamacppStatusEl = $('llamacpp-status');
const llamacppProgressContainer = $('llamacpp-progress-container');
const llamacppProgress = $('llamacpp-progress');
const llamacppProgressText = $('llamacpp-progress-text');
const btnLoadLlamacpp = $('btn-load-llamacpp');
const btnUnloadLlamacpp = $('btn-unload-llamacpp');
const useLlamacppCheckbox = $('use-llamacpp');
const llamacppFileInput = $('llamacpp-file');
const llamacppUrlInput = $('llamacpp-url');
const llamacppFileName = $('llamacpp-file-name');

// -- Config persistence (localStorage) ----------------------------------------
const CONFIG_KEY = 'liteproducer_config';
const THEME_KEY = 'liteproducer_theme';
const BOOKS_KEY = 'liteproducer_books';
const configFields = [endpointEl, apiKeyEl, modelEl, systemPromptEl, titleEl, genreEl, numChEl, plotEl, superPromptEl, numBooksTotalEl];

function saveConfig() {
  const cfg = {};
  configFields.forEach((el) => { cfg[el.id] = el.value; });
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return;
    const cfg = JSON.parse(raw);
    configFields.forEach((el) => {
      if (cfg[el.id] !== undefined) el.value = cfg[el.id];
    });
  } catch (e) { /* ignore */ }
}

configFields.forEach((el) => el.addEventListener('input', saveConfig));

// -- Theme management ---------------------------------------------------------
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeSelect.value = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignore */ }
}

function loadTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) { applyTheme(saved); return; }
  } catch (e) { /* ignore */ }
  applyTheme('dark');
}

themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));

// -- State --------------------------------------------------------------------
let continuous = false;
let running = false;
let cursor = null;
let chipMap = {};
let abortController = null;
let derivativeContent = null;
let booksTarget = 1;
let booksGenerated = 0;
let generatedBooks = []; // {title, chapters, filename, blob}
let pendingInstruction = '';

// -- Helpers ------------------------------------------------------------------
function setStatus(msg, cls) {
  statusBar.textContent = msg;
  statusBar.className = 'status-bar ' + (cls || 'status-idle');
}

function appendPreview(text, cls) {
  if (cursor) cursor.remove();
  cursor = null;

  if (cls === 'section-header' || cls === 'summary-header') {
    const span = document.createElement('span');
    span.className = cls;
    span.textContent = '\n' + text + '\n';
    previewEl.appendChild(span);
  } else {
    previewEl.insertAdjacentText('beforeend', text);
  }

  cursor = document.createElement('span');
  cursor.className = 'cursor';
  previewEl.appendChild(cursor);

  livePreview.scrollTop = livePreview.scrollHeight;
}

function removeCursor() {
  if (cursor) { cursor.remove(); cursor = null; }
}

function setRunning(isRunning) {
  running = isRunning;
  btnStart.disabled = isRunning;
  btnCancel.disabled = !isRunning;
  instrInput.disabled = !isRunning;
  btnInstruct.disabled = !isRunning;
  btnContinuous.disabled = isRunning;
}

function buildChips(headings) {
  chipsEl.innerHTML = '';
  chipMap = {};
  headings.forEach((h, i) => {
    const ch = document.createElement('div');
    ch.className = 'chip';
    ch.textContent = `Ch ${i + 1}: ${h}`;
    chipsEl.appendChild(ch);
    chipMap[i + 1] = ch;
  });
}

function markChip(num, state) {
  const ch = chipMap[num];
  if (ch) ch.className = 'chip ' + state;
}

// -- File handling (client-side) ----------------------------------------------
derivativeFile.addEventListener('change', () => {
  const file = derivativeFile.files[0];
  if (!file) return;

  fileNameLabel.textContent = file.name;
  btnClearUpload.style.display = '';

  const reader = new FileReader();
  reader.onload = (e) => {
    derivativeContent = e.target.result;
    const chars = derivativeContent.length;
    fileNameLabel.textContent = `${file.name}  (${Math.round(chars / 1000)}k chars)`;
  };
  reader.onerror = () => {
    fileNameLabel.textContent = `${file.name}  [Error reading file]`;
    derivativeContent = null;
  };
  reader.readAsText(file);
});

btnClearUpload.addEventListener('click', () => {
  derivativeFile.value = '';
  fileNameLabel.textContent = 'No file selected';
  btnClearUpload.style.display = 'none';
  derivativeContent = null;
});

// -- Book library (localStorage-based) ----------------------------------------
function loadBooks() {
  try {
    const raw = localStorage.getItem(BOOKS_KEY);
    if (raw) generatedBooks = JSON.parse(raw);
  } catch (e) { /* ignore */ }
}

function saveBooksMetadata() {
  try {
    const meta = generatedBooks.map((b) => ({ title: b.title, filename: b.filename, date: b.date }));
    localStorage.setItem(BOOKS_KEY, JSON.stringify(meta));
  } catch (e) { /* ignore */ }
}

function renderBooks() {
  if (!generatedBooks.length) {
    bookList.innerHTML = '<li class="empty">No books yet.</li>';
    return;
  }
  bookList.innerHTML = '';
  generatedBooks.forEach((book, idx) => {
    const li = document.createElement('li');
    li.className = 'book-item';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'book-name';
    nameSpan.textContent = '📄 ' + (book.filename || book.title);

    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary btn-sm';
    btn.textContent = '⬇ Download';
    btn.addEventListener('click', () => {
      if (book.blob) {
        downloadPDF(book.blob, book.filename);
      } else {
        alert('PDF data not available. Books are stored in memory during the current session.');
      }
    });

    li.appendChild(nameSpan);
    li.appendChild(btn);
    bookList.appendChild(li);
  });
}

// -- LLM completion (API or llama.cpp) -----------------------------------------
async function chatCompletion(messages, onToken, signal) {
  if (useLlamacppCheckbox.checked && isModelLoaded()) {
    return await llamacppGenerate(messages, onToken, signal);
  }

  // Remote API call
  const endpoint = endpointEl.value.trim();
  const apiKey = apiKeyEl.value.trim();
  const model = modelEl.value.trim() || 'gpt-3.5-turbo';

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.8,
      max_tokens: 4096,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break;
      try {
        const obj = JSON.parse(data);
        const token = obj.choices?.[0]?.delta?.content || '';
        if (token) {
          fullText += token;
          if (onToken) onToken(token);
        }
      } catch (e) { /* skip malformed */ }
    }
  }

  return fullText;
}

// -- Generation engine --------------------------------------------------------
const DEFAULT_SYSTEM_PROMPT = `You are a highly creative and skilled novelist. You write engaging, vivid, and well-structured prose. Follow the user's instructions precisely regarding genre, plot, characters, and style.`;

async function generateBook(isAutoRestart = false) {
  const endpoint = endpointEl.value.trim();
  const useLocal = useLlamacppCheckbox.checked && isModelLoaded();

  if (!useLocal && !endpoint) {
    alert('Please enter a Chat Completions endpoint URL or load a local .gguf model.');
    return;
  }

  if (!isAutoRestart) {
    booksTarget = parseInt(numBooksTotalEl.value) || 1;
    booksGenerated = 0;
  }

  previewEl.textContent = '';
  chipsEl.innerHTML = '';
  removeCursor();
  setStatus('Generating…', 'status-active');
  setRunning(true);

  abortController = new AbortController();
  const signal = abortController.signal;

  try {
    const systemPrompt = systemPromptEl.value.trim() || DEFAULT_SYSTEM_PROMPT;
    const title = titleEl.value.trim();
    const genre = genreEl.value.trim();
    const numChapters = parseInt(numChEl.value) || 5;
    const plot = plotEl.value.trim();
    const superPrompt = superPromptEl.value.trim();
    const derivative = derivativeContent ? derivativeContent.substring(0, 6000) : '';

    let fullSystem = systemPrompt;
    if (superPrompt) {
      fullSystem += `\n\nCreative Seed (use this as the generative foundation for all aspects of the story): ${superPrompt}`;
    }
    if (derivative) {
      fullSystem += `\n\nDerivative Source Material (draw inspiration from this):\n${derivative}`;
    }

    // Step 1: Generate outline
    setStatus('Generating outline…', 'status-active');
    appendPreview('[Generating outline…]\n', 'summary-header');

    const outlinePrompt = `Create an outline for a ${genre || 'fiction'} novel${title ? ` titled "${title}"` : ''}` +
      ` with exactly ${numChapters} chapters.` +
      (plot ? `\n\nPlot synopsis: ${plot}` : '') +
      `\n\nRespond ONLY with a JSON object in this format:\n{"title": "Book Title", "chapters": [{"heading": "Chapter 1 Title", "summary": "Brief summary"}]}`;

    const outlineMessages = [
      { role: 'system', content: fullSystem },
      { role: 'user', content: outlinePrompt },
    ];

    let outlineText = '';
    const outlineResult = await chatCompletion(outlineMessages, (token) => {
      outlineText += token;
    }, signal);

    // Parse outline JSON
    let outline;
    try {
      const jsonMatch = outlineResult.match(/\{[\s\S]*\}/);
      outline = JSON.parse(jsonMatch ? jsonMatch[0] : outlineResult);
    } catch (e) {
      outline = {
        title: title || 'Untitled',
        chapters: Array.from({ length: numChapters }, (_, i) => ({
          heading: `Chapter ${i + 1}`,
          summary: '',
        })),
      };
    }

    const bookTitle = outline.title || title || 'Untitled';
    const chapters = outline.chapters || [];
    const headings = chapters.map((c) => c.heading);
    buildChips(headings);
    appendPreview(`\n[Outline: "${bookTitle}" — ${chapters.length} chapters]\n`);

    // Step 2: Generate each chapter
    const completedChapters = [];
    const conversationHistory = [
      { role: 'system', content: fullSystem },
      { role: 'user', content: outlinePrompt },
      { role: 'assistant', content: JSON.stringify(outline) },
    ];

    for (let i = 0; i < chapters.length; i++) {
      if (signal.aborted) break;

      const ch = chapters[i];
      markChip(i + 1, 'active');
      setStatus(`Writing chapter ${i + 1} of ${chapters.length}: ${ch.heading}`, 'status-active');
      appendPreview(`\n-- ${ch.heading} --\n`, 'section-header');

      let chapterPrompt = `Write chapter ${i + 1}: "${ch.heading}"\nSummary: ${ch.summary}\n\nWrite the full chapter text. Be detailed and engaging. Aim for at least 1000 words.`;

      // Inject pending instruction
      if (pendingInstruction) {
        chapterPrompt += `\n\n[User instruction: ${pendingInstruction}]`;
        pendingInstruction = '';
      }

      conversationHistory.push({ role: 'user', content: chapterPrompt });

      let chapterText = '';
      const result = await chatCompletion(conversationHistory, (token) => {
        chapterText += token;
        appendPreview(token);
      }, signal);

      conversationHistory.push({ role: 'assistant', content: result });
      completedChapters.push({ heading: ch.heading, text: result });
      markChip(i + 1, 'done');
    }

    if (signal.aborted) {
      setStatus('Cancelled.', 'status-error');
      setRunning(false);
      return;
    }

    // Step 3: Generate PDF
    setStatus('Building PDF…', 'status-active');
    const blob = buildPDF(bookTitle, completedChapters);
    const safeName = bookTitle.replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_');
    const filename = `${safeName}_${Date.now()}.pdf`;

    const bookEntry = { title: bookTitle, filename, blob, date: new Date().toISOString() };
    generatedBooks.unshift(bookEntry);
    saveBooksMetadata();
    renderBooks();

    // Auto-download
    downloadPDF(blob, filename);
    appendPreview(`\n\n[PDF saved: ${filename}]\n`);

    // Done
    removeCursor();
    setRunning(false);
    booksGenerated++;

    if (continuous) {
      setStatus('Continuous mode: starting next book in 3s…', 'status-active');
      setTimeout(() => generateBook(true), 3000);
    } else if (booksGenerated < booksTarget) {
      setStatus(`Batch: book ${booksGenerated} of ${booksTarget} done — starting next in 3s…`, 'status-active');
      setTimeout(() => generateBook(true), 3000);
    } else {
      setStatus(
        booksTarget > 1 ? `Done! Generated ${booksGenerated} book${booksGenerated > 1 ? 's' : ''}.` : 'Done! Your book is ready.',
        'status-done'
      );
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      setStatus('Cancelled.', 'status-error');
    } else {
      setStatus('Error: ' + e.message, 'status-error');
      console.error(e);
    }
    removeCursor();
    setRunning(false);
  }
}

// -- Send instruction ---------------------------------------------------------
function sendInstruction() {
  const text = instrInput.value.trim();
  if (!text || !running) return;
  instrInput.value = '';
  pendingInstruction = text;
  appendPreview(`\n[Instruction queued: "${text}"]\n`);
}

// -- Cancel -------------------------------------------------------------------
function cancelGeneration() {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  setStatus('Cancelling…', 'status-active');
}

// -- Continuous mode ----------------------------------------------------------
function toggleContinuous() {
  continuous = !continuous;
  if (continuous) {
    contBadge.className = 'badge badge--on';
    contBadge.innerHTML = 'Continuous: <strong>ON</strong>';
  } else {
    contBadge.className = 'badge badge--off';
    contBadge.innerHTML = 'Continuous: <strong>OFF</strong>';
  }
}

// -- llama.cpp controls -------------------------------------------------------
let selectedModelFile = null;

llamacppFileInput.addEventListener('change', () => {
  const file = llamacppFileInput.files[0];
  if (!file) return;
  selectedModelFile = file;
  llamacppFileName.textContent = file.name;
});

btnLoadLlamacpp.addEventListener('click', async () => {
  const url = llamacppUrlInput.value.trim();
  const file = selectedModelFile;

  if (!file && !url) {
    alert('Please select a .gguf/.safetensors file or enter a model URL.');
    return;
  }

  btnLoadLlamacpp.disabled = true;
  llamacppStatusEl.textContent = 'Loading…';
  llamacppProgressContainer.style.display = '';

  try {
    const options = file ? { file } : { url };
    await loadModel(options, (progress) => {
      const pct = Math.round((progress.progress || 0) * 100);
      llamacppProgress.value = pct;
      llamacppProgressText.textContent = `${pct}%`;
      llamacppStatusEl.textContent = progress.text || `Loading… ${pct}%`;
    });

    llamacppStatusEl.textContent = `✅ Loaded: ${file ? file.name : url.split('/').pop()}`;
    llamacppProgressContainer.style.display = 'none';
    btnLoadLlamacpp.style.display = 'none';
    btnUnloadLlamacpp.style.display = '';
    useLlamacppCheckbox.checked = true;
  } catch (e) {
    llamacppStatusEl.textContent = `❌ Error: ${e.message}`;
    llamacppProgressContainer.style.display = 'none';
  }
  btnLoadLlamacpp.disabled = false;
});

btnUnloadLlamacpp.addEventListener('click', async () => {
  await unloadModel();
  llamacppStatusEl.textContent = 'Not loaded';
  btnLoadLlamacpp.style.display = '';
  btnUnloadLlamacpp.style.display = 'none';
  useLlamacppCheckbox.checked = false;
});

// -- Wire up events -----------------------------------------------------------
btnStart.addEventListener('click', () => generateBook(false));
btnCancel.addEventListener('click', cancelGeneration);
btnContinuous.addEventListener('click', toggleContinuous);
btnRefresh.addEventListener('click', renderBooks);
btnInstruct.addEventListener('click', sendInstruction);
instrInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendInstruction(); });

// -- Init ---------------------------------------------------------------------
loadTheme();
loadConfig();
loadBooks();
renderBooks();
