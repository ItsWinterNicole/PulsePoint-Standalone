function localAiConfig() {
  return {
    provider: String(process.env.LOCAL_LLM_PROVIDER || 'ollama').trim().toLowerCase(),
    baseUrl: String(process.env.LOCAL_LLM_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, ''),
    model: String(process.env.LOCAL_LLM_MODEL || '').trim(),
    timeoutMs: Math.max(15000, Number(process.env.LOCAL_LLM_TIMEOUT_MS || 300000)),
  };
}

function timeoutSignal(ms, parentSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Local LLM request timed out.')), ms);
  const abort = () => controller.abort(new Error('Cancelled'));
  parentSignal?.addEventListener?.('abort', abort, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      parentSignal?.removeEventListener?.('abort', abort);
    },
  };
}

function stripCodeFence(text = '') {
  const trimmed = String(text).trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function extractJsonObject(text = '') {
  const stripped = stripCodeFence(text);
  const first = stripped.indexOf('{');
  const last = stripped.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return stripped;
  return stripped.slice(first, last + 1);
}

function parseJsonOrThrow(text = '') {
  try {
    return JSON.parse(extractJsonObject(text));
  } catch (error) {
    const parseError = new Error(`Local Sarah returned malformed JSON. ${error.message}`);
    parseError.status = 502;
    throw parseError;
  }
}

async function fetchJson(url, options = {}, timeoutMs = 8000) {
  const { signal, cleanup } = timeoutSignal(timeoutMs, options.signal);
  try {
    const response = await fetch(url, { ...options, signal });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const message = data?.error?.message || data?.error || data?.message || `Local LLM request failed: ${response.status}`;
      throw new Error(message);
    }
    return data;
  } finally {
    cleanup();
  }
}

export function getLocalTextSynthesisConfig() {
  const config = localAiConfig();
  return {
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model || null,
    configured: Boolean(config.model),
    timeoutMs: config.timeoutMs,
  };
}

export async function getLocalTextSynthesisHealth() {
  const config = localAiConfig();
  if (!config.model) {
    return {
      ok: false,
      configured: false,
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: null,
      error: 'LOCAL_LLM_MODEL is not configured.',
    };
  }
  try {
    if (config.provider === 'openai_compatible') {
      const data = await fetchJson(`${config.baseUrl}/v1/models`, {}, 8000);
      const models = Array.isArray(data?.data) ? data.data.map((item) => item.id).filter(Boolean) : [];
      return {
        ok: models.length ? models.includes(config.model) || true : true,
        configured: true,
        provider: config.provider,
        baseUrl: config.baseUrl,
        model: config.model,
        availableModels: models.slice(0, 20),
      };
    }
    const data = await fetchJson(`${config.baseUrl}/api/tags`, {}, 8000);
    const models = Array.isArray(data?.models) ? data.models.map((item) => item.name || item.model).filter(Boolean) : [];
    return {
      ok: true,
      configured: true,
      provider: 'ollama',
      baseUrl: config.baseUrl,
      model: config.model,
      modelAvailable: models.includes(config.model),
      availableModels: models.slice(0, 20),
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      error: error?.message || String(error),
    };
  }
}

async function invokeOllama({ prompt, schema, signal }) {
  const config = localAiConfig();
  const data = await fetchJson(`${config.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      format: 'json',
      options: { temperature: 0.2 },
      messages: [{
        role: 'user',
        content: `${prompt}\n\nReturn only valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}`,
      }],
    }),
    signal,
  }, config.timeoutMs);
  return parseJsonOrThrow(data?.message?.content || data?.response || data);
}

async function invokeOpenAiCompatible({ prompt, schema, signal }) {
  const config = localAiConfig();
  const data = await fetchJson(`${config.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: `${prompt}\n\nReturn only valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}`,
      }],
    }),
    signal,
  }, config.timeoutMs);
  return parseJsonOrThrow(data?.choices?.[0]?.message?.content || data);
}

export async function invokeLocalTextSynthesis({ prompt, response_json_schema, signal }) {
  const config = localAiConfig();
  if (!config.model) throw new Error('LOCAL_LLM_MODEL is not configured.');
  if (!prompt) throw new Error('Local synthesis prompt is required.');
  if (config.provider === 'openai_compatible') {
    return invokeOpenAiCompatible({ prompt, schema: response_json_schema, signal });
  }
  if (config.provider !== 'ollama') {
    throw new Error(`Unsupported LOCAL_LLM_PROVIDER: ${config.provider}`);
  }
  return invokeOllama({ prompt, schema: response_json_schema, signal });
}
