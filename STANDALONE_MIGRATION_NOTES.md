# PulsePoint Standalone Migration — First Local Backend Patch

This patch keeps the React app flow intact and replaces Base44 access with a local compatibility shim.

## What changed

- `src/api/base44Client.js` now exports a local `base44` shim.
- `vite.config.js` no longer uses `@base44/vite-plugin`.
- Added a local Express backend in `server/`.
- Added generic SQLite-backed entity storage.
- Added CSV import script for Base44 exports.
- Added local replacements for:
  - `base44.entities.*`
  - `base44.auth.*`
  - `base44.functions.invoke(...)`
  - `base44.integrations.Core.InvokeLLM(...)`
  - `base44.integrations.Core.UploadFile(...)`

## First run

```bash
npm install
copy .env.example .env
```

Edit `.env` and add API keys.

Unzip the Base44 database export CSVs into:

```txt
data/imports/
```

Then import:

```bash
npm run import:csv
```

Run backend:

```bash
npm run server
```

Run frontend in another terminal:

```bash
npm run dev
```

Or run both:

```bash
npm run dev:all
```

## AI preservation note

The app still calls `base44.integrations.Core.InvokeLLM(...)` from the UI, but the shim now routes that to `/api/ai/invoke`, which calls Anthropic directly.

Existing prompts and JSON schemas remain in the original components.

## Important model note

The old code uses `claude_sonnet_4_6`. The local backend maps that symbolic name to `ANTHROPIC_MODEL` from `.env`.

Set `ANTHROPIC_MODEL` to the current Claude Sonnet model you want to preserve behavior with.
