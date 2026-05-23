import Anthropic from '@anthropic-ai/sdk';
import { writeAIForensicArtifact } from '../services/aiForensics.js';

const MODEL_MAP = {
  claude_sonnet_4_6: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  claude_sonnet_4_5: 'claude-sonnet-4-5-20250929',
};

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
    const parseError = new Error(`AI returned malformed JSON. The response may have been cut off. ${error.message}`);
    parseError.status = 502;
    throw parseError;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createMessageWithRetries(anthropic, payload, attempts = 3, signal) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (signal?.aborted) throw new Error('Cancelled');
    try {
      const message = await anthropic.messages.create(payload, signal ? { signal } : undefined);
      return { message, attemptsUsed: attempt + 1 };
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw new Error('Cancelled');
      const status = error.status || error.response?.status;
      const retryable = [408, 429, 500, 502, 503, 504].includes(status);
      if (!retryable || attempt === attempts - 1) throw error;
      const retryAfter = error.headers?.['retry-after'] || error.response?.headers?.get?.('retry-after');
      const delay = retryAfter
        ? Math.min(Math.max(Number(retryAfter) * 1000, 2000), 65000)
        : Math.min(10000 * 2 ** attempt, 65000) + Math.floor(Math.random() * 1500);
      console.warn('Internal AI invoke retrying after transient error', { status, attempt: attempt + 1, delay });
      await sleep(delay);
    }
  }
  throw lastError;
}

function jsonInstruction(responseJsonSchema, schemaMode) {
  if (!responseJsonSchema) return '';
  if (schemaMode === 'base44_parity') {
    const fields = Object.keys(responseJsonSchema.properties || {});
    const required = responseJsonSchema.required || [];
    return `\n\nReturn the analysis as valid JSON with these fields: ${fields.join(', ')}. Required fields: ${required.join(', ')}. Use a string for summary and arrays of prose paragraphs for the other fields.`;
  }
  return `\n\nReturn ONLY valid JSON matching this JSON schema. Do not wrap in markdown.\n${JSON.stringify(responseJsonSchema, null, 2)}`;
}

export async function aiInvokeInternal({
  prompt,
  response_json_schema,
  model,
  max_tokens = Number(process.env.ANTHROPIC_MAX_TOKENS || 8192),
  temperature = 0.3,
  schema_mode = 'strict',
  forensicCaptureId,
  invocationAttempt = 1,
  signal,
}) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const wantsJson = !!response_json_schema;
  const resolvedModel = MODEL_MAP[model] || process.env.ANTHROPIC_MODEL || model || 'claude-sonnet-4-6';
  const providerMessage = `${prompt}${jsonInstruction(response_json_schema, schema_mode)}`;
  const attemptPrefix = `attempt-${invocationAttempt}`;
  writeAIForensicArtifact(forensicCaptureId, `${attemptPrefix}-prompt.txt`, prompt);
  writeAIForensicArtifact(forensicCaptureId, `${attemptPrefix}-schema.json`, response_json_schema || null);
  writeAIForensicArtifact(forensicCaptureId, `${attemptPrefix}-provider-message.txt`, providerMessage);
  writeAIForensicArtifact(forensicCaptureId, `${attemptPrefix}-request-config.json`, {
    requested_model_alias: model,
    resolved_model_id: resolvedModel,
    temperature,
    max_tokens,
    schema_mode,
    structured_response_requested: wantsJson,
    configured_transport_attempts: Number(process.env.ANTHROPIC_ATTEMPTS || 3),
  });
  const { message: msg, attemptsUsed } = await createMessageWithRetries(anthropic, {
    model: resolvedModel,
    max_tokens,
    temperature,
    messages: [{
      role: 'user',
      content: providerMessage,
    }],
  }, Number(process.env.ANTHROPIC_ATTEMPTS || 3), signal);
  const text = msg.content?.map((p) => p.type === 'text' ? p.text : '').join('\n').trim() || '';
  writeAIForensicArtifact(forensicCaptureId, `${attemptPrefix}-provider-metadata.json`, {
    resolved_model_id: resolvedModel,
    stop_reason: msg.stop_reason,
    transport_attempts_used: attemptsUsed,
    usage: msg.usage,
  });
  writeAIForensicArtifact(forensicCaptureId, `${attemptPrefix}-raw-provider-response.txt`, text);
  if (!wantsJson) return text;
  if (msg.stop_reason === 'max_tokens') {
    throw new Error('AI response was cut off before it finished. Try again, or use a smaller/batched analysis request.');
  }
  const parsed = parseJsonOrThrow(text);
  writeAIForensicArtifact(forensicCaptureId, `${attemptPrefix}-parsed-result.json`, parsed);
  return parsed;
}
