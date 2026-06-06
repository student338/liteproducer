/**
 * llama.cpp Web Worker for liteproducer.
 * Runs llama.cpp WASM in a background thread to perform LLM inference
 * on .gguf model files loaded from the user's device or a URL.
 *
 * Communication protocol (postMessage):
 *   Main → Worker:
 *     { type: 'load', payload: { url?: string, file?: File } }
 *     { type: 'generate', payload: { messages, temperature, max_tokens } }
 *     { type: 'abort' }
 *     { type: 'unload' }
 *
 *   Worker → Main:
 *     { type: 'load-progress', progress: number, text: string }
 *     { type: 'load-complete', model: string }
 *     { type: 'load-error', error: string }
 *     { type: 'token', token: string }
 *     { type: 'generate-complete', text: string }
 *     { type: 'generate-error', error: string }
 *     { type: 'unloaded' }
 */

let llamaModule = null;
let llamaContext = null;
let modelLoaded = false;
let aborted = false;

/**
 * Load the llama.cpp WASM module.
 * The llama.cpp WASM bindings are expected to be available at runtime
 * in the /llama-cpp/ public directory. Users must place the compiled
 * llama.cpp WASM files there (llama.js + llama.wasm).
 */
async function initModule() {
  if (llamaModule) return llamaModule;

  /* global importScripts */
  // Dynamically import the llama.cpp WASM module from the public directory.
  // This uses a dynamic import with a string variable to prevent bundler resolution.
  const modulePath = '/llama-cpp/llama.js';
  const mod = await import(/* @vite-ignore */ modulePath);
  const createModule = mod.default || mod.createModule || mod;
  llamaModule = await (typeof createModule === 'function' ? createModule() : createModule);
  return llamaModule;
}

/**
 * Load a model from either a URL or a File object.
 */
async function loadModel(payload) {
  try {
    self.postMessage({ type: 'load-progress', progress: 0, text: 'Initializing llama.cpp WASM…' });

    await initModule();

    self.postMessage({ type: 'load-progress', progress: 0.1, text: 'Loading model file…' });

    let modelData;
    let modelName;

    if (payload.file) {
      // Load from File object (user uploaded .gguf/.safetensors)
      modelName = payload.file.name;
      const arrayBuffer = await payload.file.arrayBuffer();
      modelData = new Uint8Array(arrayBuffer);

      self.postMessage({ type: 'load-progress', progress: 0.5, text: `Read ${modelName} (${Math.round(modelData.length / 1024 / 1024)}MB)` });
    } else if (payload.url) {
      // Load from URL with progress tracking
      modelName = payload.url.split('/').pop() || 'model.gguf';

      const response = await fetch(payload.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch model: HTTP ${response.status}`);
      }

      const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;

        const progress = contentLength > 0 ? 0.1 + (received / contentLength) * 0.6 : 0.3;
        const mb = (received / 1024 / 1024).toFixed(1);
        const totalMb = contentLength > 0 ? (contentLength / 1024 / 1024).toFixed(1) : '?';
        self.postMessage({
          type: 'load-progress',
          progress,
          text: `Downloading… ${mb}MB / ${totalMb}MB`,
        });
      }

      modelData = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        modelData.set(chunk, offset);
        offset += chunk.length;
      }
    } else {
      throw new Error('No model file or URL provided.');
    }

    self.postMessage({ type: 'load-progress', progress: 0.75, text: 'Loading model into llama.cpp…' });

    // Write model to WASM filesystem and load it
    const modelPath = '/model.gguf';
    llamaModule.FS.writeFile(modelPath, modelData);

    // Free the JS-side buffer
    modelData = null;

    // Create context with the model
    llamaContext = llamaModule.createContext(modelPath, {
      n_ctx: 4096,
      n_batch: 512,
      n_threads: navigator.hardwareConcurrency || 4,
    });

    modelLoaded = true;
    self.postMessage({ type: 'load-progress', progress: 1.0, text: 'Model loaded!' });
    self.postMessage({ type: 'load-complete', model: modelName });
  } catch (e) {
    modelLoaded = false;
    self.postMessage({ type: 'load-error', error: e.message || String(e) });
  }
}

/**
 * Generate text from messages using the loaded model.
 */
async function generate(payload) {
  if (!modelLoaded || !llamaContext) {
    self.postMessage({ type: 'generate-error', error: 'No model loaded.' });
    return;
  }

  aborted = false;

  try {
    const { messages, temperature = 0.8, max_tokens = 4096 } = payload;

    // Format messages into a prompt string (ChatML format)
    let prompt = '';
    for (const msg of messages) {
      if (msg.role === 'system') {
        prompt += `<|im_start|>system\n${msg.content}<|im_end|>\n`;
      } else if (msg.role === 'user') {
        prompt += `<|im_start|>user\n${msg.content}<|im_end|>\n`;
      } else if (msg.role === 'assistant') {
        prompt += `<|im_start|>assistant\n${msg.content}<|im_end|>\n`;
      }
    }
    prompt += '<|im_start|>assistant\n';

    let fullText = '';

    // Use streaming generation
    llamaContext.generate(prompt, {
      temperature,
      max_tokens,
      onToken: (token) => {
        if (aborted) return false; // Returning false stops generation
        fullText += token;
        self.postMessage({ type: 'token', token });
        return true;
      },
    });

    self.postMessage({ type: 'generate-complete', text: fullText });
  } catch (e) {
    self.postMessage({ type: 'generate-error', error: e.message || String(e) });
  }
}

/**
 * Unload the model and free resources.
 */
function unloadModel() {
  if (llamaContext) {
    try {
      llamaContext.free();
    } catch (e) { /* ignore */ }
    llamaContext = null;
  }
  modelLoaded = false;
  self.postMessage({ type: 'unloaded' });
}

// -- Message handler ----------------------------------------------------------
self.addEventListener('message', (e) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'load':
      loadModel(payload);
      break;
    case 'generate':
      generate(payload);
      break;
    case 'abort':
      aborted = true;
      break;
    case 'unload':
      unloadModel();
      break;
    default:
      console.warn('[llamacpp-worker] Unknown message type:', type);
  }
});
