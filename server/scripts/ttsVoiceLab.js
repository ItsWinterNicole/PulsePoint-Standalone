const API_BASE = process.env.API_BASE || 'http://localhost:8787/api';

const sampleText = `This was a remarkably efficient session — just over eight minutes from first contact to climax — that delivered a satisfaction score of ten and intensity of nine. What makes it stand out is how much physiological work your body packed into that short window. Mild THC, a post-shower body, a relaxed mood, and a full day of abstinence converged to create what your profile would predict as near-ideal conditions. The build was gradual but compressed, your sympathetic system climbed steadily from eighty beats per minute to a peak of one hundred fifteen at the exact moment of climax, and your feet and legs narrated almost every arousal transition in real time.`;

const femininePhysiologyNarrator = `Read in a warm, calm, clinically intelligent tone.
Sound like a distinctly feminine, thoughtful physiology podcast narrator with excellent bedside manner.
Use relaxed pacing and natural conversational rhythm.
Be soothing, emotionally grounded, and subtly expressive.
Add gentle, audible enthusiasm at meaningful turning points, especially when describing notable physiological shifts, climax approach, release, or recovery.
Let those key moments sound a little more alive, impressed, and engaged, while returning to calm narration afterward.
Keep the delivery intimate and human, but not overtly flirtatious or performative.
Maintain consistent tone, pacing, and emotional energy across all segments.
Do not sound robotic, flat, exaggerated, overly cheerful, customer-service-like, melodramatic, or clinical-dictation-like.`;

const presets = [
  {
    name: 'feminine-key-events-lift-096',
    speed: 0.96,
    instructions: femininePhysiologyNarrator,
  },
  {
    name: 'feminine-more-enthusiastic-turning-points-096',
    speed: 0.96,
    instructions: `${femininePhysiologyNarrator}
At the most meaningful turning points, let the voice brighten slightly with genuine interest and warmth, as if recognizing something physiologically important.`,
  },
  {
    name: 'feminine-more-lift-097',
    speed: 0.97,
    instructions: `${femininePhysiologyNarrator}
Use a touch more feminine liveliness and forward motion, while staying calm, intelligent, and never bubbly.`,
  },
];

async function generatePreset({ name, instructions, speed }) {
  const response = await fetch(`${API_BASE}/functions/openaiTTS`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: sampleText,
      voice: process.env.TTS_VOICE || 'nova',
      speed: Number(process.env.TTS_SPEED || speed || 0.96),
      instructions,
    }),
  });
  if (!response.ok) {
    throw new Error(`${name}: ${response.status} ${await response.text()}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const path = `data/tts-voice-lab-${name}.mp3`;
  await import('node:fs/promises').then((fs) => fs.writeFile(path, bytes));
  console.log(`${path} (${bytes.length} bytes)`);
}

for (const preset of presets) {
  await generatePreset(preset);
}
