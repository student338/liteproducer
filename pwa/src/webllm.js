/**
 * WebLLM integration module for liteproducer.
 * Provides local LLM inference via WebAssembly using @mlc-ai/web-llm.
 */

let engine = null;
let isLoaded = false;
let currentModel = null;

/**
 * Initialize and load a WebLLM model.
 * @param {string} modelId - The model identifier from MLC model list.
 * @param {function} onProgress - Progress callback (progress object).
 * @returns {Promise<void>}
 */
export async function loadModel(modelId, onProgress) {
  const { CreateMLCEngine } = await import('@mlc-ai/web-llm');

  if (engine && currentModel === modelId) {
    return; // Already loaded
  }

  if (engine) {
    await unloadModel();
  }

  engine = await CreateMLCEngine(modelId, {
    initProgressCallback: (progress) => {
      if (onProgress) onProgress(progress);
    },
  });

  currentModel = modelId;
  isLoaded = true;
}

/**
 * Unload the currently loaded model and free resources.
 */
export async function unloadModel() {
  if (engine) {
    try {
      await engine.unload();
    } catch (e) {
      console.warn('Error unloading WebLLM engine:', e);
    }
    engine = null;
    currentModel = null;
    isLoaded = false;
  }
}

/**
 * Check if a model is currently loaded.
 * @returns {boolean}
 */
export function isModelLoaded() {
  return isLoaded;
}

/**
 * Get the currently loaded model ID.
 * @returns {string|null}
 */
export function getLoadedModel() {
  return currentModel;
}

/**
 * Generate a streaming chat completion using the loaded WebLLM model.
 * @param {Array} messages - Array of {role, content} message objects.
 * @param {function} onToken - Callback invoked with each token string.
 * @param {AbortSignal} signal - Optional abort signal.
 * @returns {Promise<string>} - The complete generated text.
 */
export async function generateStreaming(messages, onToken, signal) {
  if (!engine || !isLoaded) {
    throw new Error('No WebLLM model loaded. Please load a model first.');
  }

  let fullText = '';
  let aborted = false;

  if (signal) {
    signal.addEventListener('abort', () => { aborted = true; });
  }

  const chunks = await engine.chat.completions.create({
    messages,
    temperature: 0.8,
    max_tokens: 4096,
    stream: true,
  });

  for await (const chunk of chunks) {
    if (aborted) break;
    const delta = chunk.choices[0]?.delta?.content || '';
    if (delta) {
      fullText += delta;
      if (onToken) onToken(delta);
    }
  }

  return fullText;
}

/**
 * Generate a non-streaming chat completion.
 * @param {Array} messages - Array of {role, content} message objects.
 * @returns {Promise<string>} - The complete generated text.
 */
export async function generate(messages) {
  if (!engine || !isLoaded) {
    throw new Error('No WebLLM model loaded. Please load a model first.');
  }

  const response = await engine.chat.completions.create({
    messages,
    temperature: 0.8,
    max_tokens: 4096,
  });

  return response.choices[0]?.message?.content || '';
}
