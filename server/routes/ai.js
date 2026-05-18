import express from 'express';
import Anthropic from '@anthropic-ai/sdk';

export const aiRouter = express.Router();

const MODEL_MAP = {
  claude_sonnet_4_6: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',
  claude_sonnet_4_5: 'claude-sonnet-4-5-20250929',
};

function stripCodeFence(text = '') {
  const trimmed = String(text).trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

aiRouter.post('/invoke', async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });
    }
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { prompt, response_json_schema, model, add_context_from_internet, ...rest } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    const wantsJson = !!response_json_schema;
    const modelName = MODEL_MAP[model] || process.env.ANTHROPIC_MODEL || model || 'claude-sonnet-4-5-20250929';
    const jsonInstruction = wantsJson
      ? `\n\nReturn ONLY valid JSON matching this JSON schema. Do not wrap in markdown.\n${JSON.stringify(response_json_schema, null, 2)}`
      : '';

    const msg = await anthropic.messages.create({
      model: modelName,
      max_tokens: rest.max_tokens || 4096,
      temperature: rest.temperature ?? 0.3,
      messages: [{ role: 'user', content: `${prompt}${jsonInstruction}` }],
    });

    const text = msg.content?.map((p) => p.type === 'text' ? p.text : '').join('\n').trim() || '';
    if (!wantsJson) return res.json(text);

    try {
      return res.json(JSON.parse(stripCodeFence(text)));
    } catch {
      return res.json({ raw: text });
    }
  } catch (error) {
    console.error('AI invoke failed:', error);
    res.status(error.status || 502).json({ error: error.message || String(error) });
  }
});
