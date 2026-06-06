/**
 * llama.cpp integration module for liteproducer.
 * Provides local LLM inference via a background Web Worker running
 * llama.cpp compiled to WebAssembly. Supports .gguf and .safetensors model files.
 */

let worker = null;
let isLoaded = false;
let currentModel = null;
let generateResolve = null;
let generateReject = null;
let tokenCallback = null;

/**
 * Ensure the background worker is initialized.
 */
function ensureWorker() {
  if (worker) return;
  worker = new Worker(new URL('./llamacpp-worker.js', import.meta.url), { type: 'module' });
  worker.addEventListener('message', handleWorkerMessage);
}

/**
 * Internal message handler for worker responses.
 */
let loadResolve = null;
let loadReject = null;
let progressCallback = null;

function handleWorkerMessage(e) {
  const { type } = e.data;

  switch (type) {
    case 'load-progress':
      if (progressCallback) {
        progressCallback({ progress: e.data.progress, text: e.data.text });
      }
      break;

    case 'load-complete':
      currentModel = e.data.model;
      isLoaded = true;
      if (loadResolve) { loadResolve(); loadResolve = null; loadReject = null; }
      break;

    case 'load-error':
      isLoaded = false;
      currentModel = null;
      if (loadReject) { loadReject(new Error(e.data.error)); loadResolve = null; loadReject = null; }
      break;

    case 'token':
      if (tokenCallback) tokenCallback(e.data.token);
      break;

    case 'generate-complete':
      if (generateResolve) { generateResolve(e.data.text); generateResolve = null; generateReject = null; }
      break;

    case 'generate-error':
      if (generateReject) { generateReject(new Error(e.data.error)); generateResolve = null; generateReject = null; }
      break;

    case 'unloaded':
      isLoaded = false;
      currentModel = null;
      break;
  }
}

/**
 * Load a model from a File (.gguf / .safetensors) or a URL.
 * @param {object} options - { file?: File, url?: string }
 * @param {function} onProgress - Progress callback ({ progress: 0-1, text: string }).
 * @returns {Promise<void>}
 */
export async function loadModel(options, onProgress) {
  ensureWorker();

  if (isLoaded) {
    await unloadModel();
  }

  progressCallback = onProgress || null;

  return new Promise((resolve, reject) => {
    loadResolve = resolve;
    loadReject = reject;
    worker.postMessage({ type: 'load', payload: options });
  });
}

/**
 * Unload the currently loaded model and free resources.
 */
export async function unloadModel() {
  if (!worker) return;

  return new Promise((resolve) => {
    const handler = (e) => {
      if (e.data.type === 'unloaded') {
        worker.removeEventListener('message', handler);
        resolve();
      }
    };
    worker.addEventListener('message', handler);
    worker.postMessage({ type: 'unload' });
    isLoaded = false;
    currentModel = null;
  });
}

/**
 * Check if a model is currently loaded.
 * @returns {boolean}
 */
export function isModelLoaded() {
  return isLoaded;
}

/**
 * Get the currently loaded model name.
 * @returns {string|null}
 */
export function getLoadedModel() {
  return currentModel;
}

/**
 * Generate a streaming chat completion using the loaded llama.cpp model.
 * @param {Array} messages - Array of {role, content} message objects.
 * @param {function} onToken - Callback invoked with each token string.
 * @param {AbortSignal} signal - Optional abort signal.
 * @returns {Promise<string>} - The complete generated text.
 */
export async function generateStreaming(messages, onToken, signal) {
  if (!worker || !isLoaded) {
    throw new Error('No model loaded. Please load a .gguf model first.');
  }

  tokenCallback = onToken || null;

  if (signal) {
    signal.addEventListener('abort', () => {
      worker.postMessage({ type: 'abort' });
    });
  }

  return new Promise((resolve, reject) => {
    generateResolve = resolve;
    generateReject = reject;
    worker.postMessage({
      type: 'generate',
      payload: { messages, temperature: 0.8, max_tokens: 4096 },
    });
  });
}

/**
 * Generate a non-streaming chat completion.
 * @param {Array} messages - Array of {role, content} message objects.
 * @returns {Promise<string>} - The complete generated text.
 */
export async function generate(messages) {
  return generateStreaming(messages, null, null);
}
