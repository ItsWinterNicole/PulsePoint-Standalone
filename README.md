# PulsePoint Standalone

PulsePoint is a local-first physiology analysis app for reviewing sessions with heart-rate data, event notes, video synchronization, AI analysis, live capture, and premium TTS narration.

The project began as a Base44 app and now runs as a standalone local web app with a local API server. It is designed for private experimentation, careful timeline review, and rich post-session analysis.

## Core Features

- Session library with detailed subjective metrics, notes, media, and physiology markers.
- Heart-rate CSV import with timeline visualization, peak/phase markers, and AI-assisted phase suggestions.
- Video Sync Player for aligning local video with HR data and timestamped event annotations.
- Live Capture page for real-time HR telemetry, optional EMG telemetry, voice annotation, and capture presets.
- AI Session Analysis, Cascade Analysis, Profiler, Insights, and journal/storyline generation.
- Premium TTS narration with Nova voice settings, presets, server-side rendering, and audio export library.
- Background job processing for heavier AI/TTS tasks so work can continue when the browser is hidden or refreshed.
- PWA support for installing on mobile and using through Tailscale on a private tailnet.

## Local Setup

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

At minimum, configure API keys used by the AI and TTS features:

```bash
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
```

Run the local API server in one terminal:

```bash
npm run server
```

Run the Vite app in another terminal:

```bash
npm run dev -- --host
```

Default local URLs:

- App: `http://localhost:5173`
- API: `http://localhost:8787`

## Useful Commands

Build the frontend:

```bash
npm run build
```

Run only the local API:

```bash
npm run server
```

Expose privately through Tailscale Serve, for example:

```bash
tailscale serve --bg --set-path /pulse http://127.0.0.1:5173
```

## Data And Privacy

PulsePoint is intended to be local-first. Session records, uploaded files, generated audio, and background job records are stored locally by the standalone server. Treat the workspace and `data/` directory as sensitive.

Important local data areas:

- `data/uploads/` stores generated and uploaded files.
- `ProcessingJob` records track backend AI/TTS job status and results.
- Browser local storage may contain active TTS job IDs and TTS preferences.

## Background Jobs

Heavy work such as premium TTS exports and long AI analysis can run on the backend as background jobs. The frontend starts a job, polls status, and can reconnect to active jobs after refresh or focus changes.

This helps avoid duplicate OpenAI/Claude requests when Android or Chrome refreshes an installed app while a render is still running.

## Notes

- Nova is the primary tuned TTS voice for the app experience.
- TTS quality depends on the selected export format and server-side renderer.
- For private mobile testing, Tailscale is the recommended path.
- Restart `npm run server` after backend route or job changes.
