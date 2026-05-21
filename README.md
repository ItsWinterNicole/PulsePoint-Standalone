# PulsePoint Standalone

PulsePoint is a private, local-first tool for reviewing sexual arousal and stimulation sessions with physiology data, recorded media, timestamped observations, AI analysis, and narrated audio summaries.

At its heart, PulsePoint is for the **"what happened here?"** pass after a recorded session:

- review video alongside heart-rate data
- annotate key moments in stimulation, physical findings, sensation, climax approach, climax, and recovery
- compare those observations with subjective notes, journal entries, and profile context
- ask AI to synthesize the physiology and the story without losing the human context

It began as a Base44 app and now runs as a standalone local web app with a local API server. The goal is a careful, private analysis workspace rather than a generic health dashboard. 🫀

## What PulsePoint Does

### 🎥 Review and annotate

- Session detail pages for subjective metrics, notes, physiology markers, media, and post-session review.
- A Video Sync Player that aligns local video with heart-rate data and timestamped event notes.
- AI-assisted event tagging for observations such as stimulation changes, physical findings, sensation, and other context.

### 📈 Follow the signals

- Heart-rate CSV import and timeline visualization.
- Live Capture telemetry with current HR, trend lines, phase watch, and optional EMG data.
- EMG import and visualization for MyoWare-derived signal data when available.
- Session, trend, cascade, insight, profiler, and comparison views for longitudinal analysis.

### 🧠 Add interpretation

- AI Session Analysis, Cascade Analysis, Profiler, Insights, phase suggestions, and journal/storyline generation.
- Shared profile context so analysis can use session details, event timelines, notes, journal entries, and the saved Profile page.
- Background jobs for heavier AI and audio work so long tasks can keep moving while the UI changes focus.

### 🎧 Listen back

- Tuned Nova TTS narration with a centralized Settings & Status page.
- Premium server-side audio rendering and an Audio Library for completed exports.
- Downloadable audio for slower, more immersive review away from the screen.

## The Current Capture Stack

PulsePoint can work from manually entered sessions and imported files alone. The richer live-capture workflow uses a small hardware/software chain:

### Required for the core app

- Node.js and npm
- a local browser
- PulsePoint frontend and local API server

### Used for heart-rate capture

- **HeartRateOnStream** for live heart-rate telemetry
- the currently tested wearable source is a **Samsung Galaxy Watch 7**
- the in-repo heart-rate relay under [`tools/capture/heart-rate`](tools/capture/heart-rate)

The heart-rate relay receives live telemetry, exposes the WebSocket feed used by Live Capture, and writes HR CSV recordings when the OBS-driven recording flow is active.

### Used for EMG capture

- **MyoWare EMG** hardware
- a serial-connected microcontroller feed for the MyoWare signal
- the in-repo Python helpers and OBS overlays under [`tools/capture/emg`](tools/capture/emg)

PulsePoint treats EMG as optional. HR can stand alone. EMG appears in Live Capture and analysis only when the signal source is live or session data has been attached.

### Used for recorded media

- **OBS Studio** is the current recording and automation center
- OBS is **not strictly required** for PulsePoint review or imported-session workflows
- OBS is strongly useful when you want live session creation, synchronized capture timing, overlays, and a clean video record to review later

In the current live workflow, OBS recording start is the natural session boundary: HR/EMG helper tools can log around that recording window, and PulsePoint can turn the finished capture into a new session for review. 🎬

## Capture Helper Code Lives Here Now

The HeartRate and EMG helper source used by this setup has been copied into the repo so the software pieces live together:

- [`tools/capture/heart-rate`](tools/capture/heart-rate)
- [`tools/capture/emg`](tools/capture/emg)
- [`tools/capture/README.md`](tools/capture/README.md)

Only source code, helper overlays, and local dependency metadata belong there. Recordings, text feeds, EMG session exports, calibration files, and generated telemetry are intentionally ignored.

The standalone API still keeps the existing sibling-folder defaults for capture data so a working setup does not silently break. When ready, point `.env` at the in-repo helper output paths or run the in-repo helpers directly.

## Local Setup

Install PulsePoint dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

At minimum, configure the provider keys for the AI and TTS features you want:

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

## Capture Helper Setup

### Heart-rate relay

Install the heart-rate helper dependencies once:

```bash
npm run capture:hr:install
```

Run the relay:

```bash
npm run capture:hr
```

The relay package and OBS overlay files live in `tools/capture/heart-rate/`.

### EMG helpers

The EMG scripts are Python helpers. Install their Python requirements in the environment you use for the MyoWare capture scripts:

```bash
py -m pip install -r tools/capture/emg/requirements.txt
```

Run the helper that matches the setup:

```bash
py tools/capture/emg/emg_dual_obs.py
```

or

```bash
py tools/capture/emg/emg_single.py
```

Those scripts still expose their practical hardware and OBS knobs near the top of each file, including serial port, OBS host, and calibration behavior.

## Useful Commands

Build the frontend:

```bash
npm run build
```

Run the frontend and backend separately:

```bash
npm run server
npm run dev -- --host
```

Expose privately through Tailscale Serve, for example:

```bash
tailscale serve --bg --set-path /pulse http://127.0.0.1:5173
```

## Settings & Status

The Settings & Status page centralizes:

- Nova TTS tuning and presets
- background task visibility and cancellation
- stale or hung job review
- provider cost-report visibility when optional admin reporting keys are configured

The app uses ordinary OpenAI and Anthropic API keys for TTS and AI work. Optional admin reporting keys can add cost-report visibility:

```bash
OPENAI_ADMIN_API_KEY=your_openai_admin_key
ANTHROPIC_ADMIN_API_KEY=your_anthropic_admin_key
```

## Data and Privacy

PulsePoint is intentionally local-first. Treat the workspace and `data/` directory as sensitive.

Important local data areas:

- `data/uploads/` stores generated and uploaded files.
- `ProcessingJob` records track backend AI/TTS job status and results.
- browser local storage may contain active TTS job IDs and TTS preferences.
- capture helper output folders can contain raw physiology telemetry and session exports.

## Local Configuration

`server/config.js` centralizes local paths. The defaults keep the current sibling-folder capture layout working, while `.env` can override it:

- `DATABASE_PATH`, `UPLOAD_DIR`, and `TTS_RENDER_DIR` control local app storage.
- `HR_CAPTURE_WS_URL` points Live Capture at the heart-rate relay WebSocket.
- `HR_RECORDINGS_DIR` points at heart-rate CSV recordings.
- `EMG_TEXT_DIR` points at live EMG telemetry text files.
- `EMG_SESSIONS_DIR` points at EMG CSV session exports.
- `BACKGROUND_JOB_CONCURRENCY` keeps local background queue throughput explicit.

For the repo-local capture helpers, these are the matching output locations:

```bash
HR_RECORDINGS_DIR=./tools/capture/heart-rate/recordings
EMG_TEXT_DIR=./tools/capture/emg
EMG_SESSIONS_DIR=./tools/capture/emg/emg_sessions
```

## Notes

- Nova is the primary tuned TTS voice for the app experience. 🎙️
- Premium TTS quality depends on the selected engine, export format, and server-side renderer.
- For private mobile testing, Tailscale is the recommended path.
- Restart `npm run server` after backend route or job changes.
