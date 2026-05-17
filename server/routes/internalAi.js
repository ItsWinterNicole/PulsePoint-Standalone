import Anthropic from '@anthropic-ai/sdk';

const MODEL_MAP = {
  claude_sonnet_4_6: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',
  claude_sonnet_4_5: 'claude-sonnet-4-5-20250929',
};

function stripCodeFence(text = '') {
  const trimmed = String(text).trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

export async function aiInvokeInternal({ prompt, response_json_schema, model, max_tokens = 4096, temperature = 0.3 }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const wantsJson = !!response_json_schema;
  const msg = await anthropic.messages.create({
    model: MODEL_MAP[model] || process.env.ANTHROPIC_MODEL || model || 'claude-sonnet-4-5-20250929',
    max_tokens,
    temperature,
    messages: [{ role: 'user', content: `${prompt}${wantsJson ? `\n\nReturn ONLY valid JSON matching this schema:\n${JSON.stringify(response_json_schema)}` : ''}` }],
  });
  const text = msg.content?.map((p) => p.type === 'text' ? p.text : '').join('\n').trim() || '';
  if (!wantsJson) return text;
  try { return JSON.parse(stripCodeFence(text)); } catch { return { raw: text }; }
}
