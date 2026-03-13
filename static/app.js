/* liteproducer – frontend logic */

(function () {
  'use strict';

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  const endpointEl    = $('endpoint');
  const apiKeyEl      = $('api-key');
  const modelEl       = $('model');
  const titleEl       = $('title');
  const genreEl       = $('genre');
  const numChEl       = $('num-chapters');
  const plotEl        = $('plot');

  const btnStart      = $('btn-start');
  const btnCancel     = $('btn-cancel');
  const btnContinuous = $('btn-continuous');
  const contBadge     = $('continuous-badge');

  const statusBar     = $('status-bar');
  const chipsEl       = $('chapter-chips');
  const previewEl     = $('preview-content');
  const livePreview   = $('live-preview');

  const instrInput    = $('instruction-input');
  const btnInstruct   = $('btn-instruct');

  const btnRefresh    = $('btn-refresh');
  const bookList      = $('book-list');

  // ── Config persistence (localStorage) ──────────────────────────────────
  const CONFIG_KEY = 'liteproducer_config';
  const configFields = [endpointEl, apiKeyEl, modelEl, titleEl, genreEl, numChEl, plotEl];

  function saveConfig() {
    const cfg = {};
    configFields.forEach(el => { cfg[el.id] = el.value; });
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); } catch (e) { console.warn('Failed to save config', e); }
  }

  function loadConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) return;
      const cfg = JSON.parse(raw);
      configFields.forEach(el => {
        if (cfg[el.id] !== undefined) el.value = cfg[el.id];
      });
    } catch (e) { console.warn('Failed to load config', e); }
  }

  configFields.forEach(el => {
    el.addEventListener('input', saveConfig);
  });

  // ── State ─────────────────────────────────────────────────────────────────
  let sessionId      = null;
  let evtSource      = null;
  let continuous     = false;
  let running        = false;
  let cursor         = null;
  let chipMap        = {};       // chapter num → chip element
  let seenBooks      = new Set();

  // ── Helpers ───────────────────────────────────────────────────────────────
  function setStatus(msg, cls) {
    statusBar.textContent = msg;
    statusBar.className   = 'status-bar ' + (cls || 'status-idle');
  }

  function appendPreview(text, cls) {
    if (cursor) cursor.remove();
    cursor = null;

    if (cls === 'section-header') {
      const span = document.createElement('span');
      span.className = 'section-header';
      span.textContent = '\n' + text + '\n';
      previewEl.appendChild(span);
    } else {
      previewEl.insertAdjacentText('beforeend', text);
    }

    // Blinking cursor
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
    btnStart.disabled      = isRunning;
    btnCancel.disabled     = !isRunning;
    instrInput.disabled    = !isRunning;
    btnInstruct.disabled   = !isRunning;
    btnContinuous.disabled = isRunning;
  }

  function buildChips(headings) {
    chipsEl.innerHTML = '';
    chipMap = {};
    headings.forEach((h, i) => {
      const ch  = document.createElement('div');
      ch.className   = 'chip';
      ch.textContent = `Ch ${i + 1}: ${h}`;
      chipsEl.appendChild(ch);
      chipMap[i + 1] = ch;
    });
  }

  function markChip(num, state) {
    const ch = chipMap[num];
    if (ch) ch.className = 'chip ' + state;
  }

  // ── Book library ──────────────────────────────────────────────────────────
  async function refreshBooks() {
    try {
      const res  = await fetch('/api/books');
      const data = await res.json();
      renderBooks(data.books || []);
    } catch (e) {
      console.error('Failed to fetch books', e);
    }
  }

  function renderBooks(files) {
    if (!files.length) {
      bookList.innerHTML = '<li class="empty">No books yet.</li>';
      return;
    }
    bookList.innerHTML = '';
    files.forEach(f => {
      const li  = document.createElement('li');
      li.className = 'book-item';
      const isNew = !seenBooks.has(f);
      if (isNew) seenBooks.add(f);
      li.innerHTML = `
        <span class="book-name">📄 ${f}</span>
        ${isNew ? '<span class="book-new">NEW</span>' : ''}
        <a href="/books/${encodeURIComponent(f)}" class="btn btn-secondary btn-sm" download>⬇ Download</a>
      `;
      bookList.appendChild(li);
    });
  }

  // ── SSE event handling ────────────────────────────────────────────────────
  function handleEvent(evtType, evtData) {
    switch (evtType) {

      case 'status': {
        const phase = evtData.phase || '';
        const cls   = phase === 'done'  ? 'status-done'
                    : phase === 'error' ? 'status-error'
                    :                     'status-active';
        setStatus(evtData.msg, cls);
        break;
      }

      case 'log':
        appendPreview('\n' + evtData + '\n', 'dim');
        break;

      case 'outline_done':
        buildChips(evtData.headings || []);
        break;

      case 'chapter_start':
        appendPreview(`\n── ${evtData.heading} ──\n`, 'section-header');
        markChip(evtData.num, 'active');
        break;

      case 'chapter_done':
        markChip(evtData.num, 'done');
        break;

      case 'token':
        appendPreview(evtData.text);
        break;

      case 'pdf_ready':
        removeCursor();
        appendPreview(`\n\n✅ PDF saved: ${evtData.filename}\n`);
        refreshBooks();
        break;

      case 'done':
        removeCursor();
        setRunning(false);
        sessionId  = null;
        if (evtSource) { evtSource.close(); evtSource = null; }
        if (continuous) {
          setStatus('Continuous mode: starting next book in 3 s…', 'status-active');
          setTimeout(startGeneration, 3000);
        } else {
          setStatus('Done! Your book is ready.', 'status-done');
        }
        break;
    }
  }

  // ── Start generation ──────────────────────────────────────────────────────
  async function startGeneration() {
    const endpoint = endpointEl.value.trim();
    if (!endpoint) {
      alert('Please enter a Chat Completions endpoint URL.');
      return;
    }

    // Reset preview
    previewEl.textContent = '';
    chipsEl.innerHTML     = '';
    removeCursor();
    setStatus('Connecting…', 'status-active');
    setRunning(true);

    const payload = {
      endpoint,
      api_key:      apiKeyEl.value.trim(),
      model:        modelEl.value.trim()    || 'gpt-3.5-turbo',
      title:        titleEl.value.trim(),
      genre:        genreEl.value.trim()    || 'fantasy',
      num_chapters: parseInt(numChEl.value) || 5,
      plot:         plotEl.value.trim(),
    };

    let data;
    try {
      const res = await fetch('/api/start', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unknown error');
    } catch (e) {
      setStatus('Error: ' + e.message, 'status-error');
      setRunning(false);
      return;
    }

    sessionId = data.session_id;

    evtSource = new EventSource(`/api/events/${sessionId}`);
    const MAX_RECONNECT_ATTEMPTS = 3;
    let errorCount = 0;
    evtSource.onmessage = ev => {
      errorCount = 0;
      try {
        const obj = JSON.parse(ev.data);
        handleEvent(obj.event, obj.data);
      } catch (_) {}
    };
    evtSource.onerror = () => {
      if (!evtSource) return;
      if (evtSource.readyState === EventSource.CONNECTING && ++errorCount <= MAX_RECONNECT_ATTEMPTS) return;
      if (running) {
        setStatus('Connection lost. Check server.', 'status-error');
        setRunning(false);
      }
      evtSource.close();
      evtSource = null;
    };
  }

  // ── Send instruction ──────────────────────────────────────────────────────
  async function sendInstruction() {
    const text = instrInput.value.trim();
    if (!text || !sessionId) return;
    instrInput.value = '';

    try {
      await fetch(`/api/instruct/${sessionId}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ instruction: text }),
      });
      appendPreview(`\n[Instruction queued: "${text}"]\n`);
    } catch (e) {
      console.error('Failed to send instruction', e);
    }
  }

  // ── Cancel ────────────────────────────────────────────────────────────────
  async function cancelGeneration() {
    if (!sessionId) return;
    try {
      await fetch(`/api/cancel/${sessionId}`, { method: 'POST' });
    } catch (_) {}
    setStatus('Cancelling…', 'status-active');
  }

  // ── Continuous mode ───────────────────────────────────────────────────────
  function toggleContinuous() {
    continuous = !continuous;
    if (continuous) {
      contBadge.className   = 'badge badge--on';
      contBadge.innerHTML   = 'Continuous: <strong>ON</strong>';
    } else {
      contBadge.className   = 'badge badge--off';
      contBadge.innerHTML   = 'Continuous: <strong>OFF</strong>';
    }
  }

  // ── Wire up events ────────────────────────────────────────────────────────
  btnStart.addEventListener('click',      startGeneration);
  btnCancel.addEventListener('click',     cancelGeneration);
  btnContinuous.addEventListener('click', toggleContinuous);
  btnRefresh.addEventListener('click',    refreshBooks);

  btnInstruct.addEventListener('click', sendInstruction);
  instrInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendInstruction();
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  loadConfig();
  refreshBooks();
})();
