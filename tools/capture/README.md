# Capture Helpers

This folder keeps the helper software used by PulsePoint Live Capture next to the app.

## Heart Rate

`heart-rate/` contains the standalone Node relay and OBS overlay assets used with HeartRateOnStream telemetry.

- PulsePoint now starts the same relay behavior inside `npm run server` by default.
- `server.js` remains available when you want to run the relay separately at `ws://127.0.0.1:8765`.
- `recordings/` is created locally when the relay writes HR CSV data.
- `overlay.html` and `control.html` are OBS/browser helper surfaces.

Install and run the standalone relay from the repo root only when you need that fallback:

```bash
npm run capture:hr:install
npm run capture:hr
```

## EMG

`emg/` contains Python helpers and overlay HTML used with the MyoWare EMG workflow.

- use `emg_dual_obs.py` for dual-channel capture
- use `emg_single.py` for single-channel capture
- `emb_obs_sessions.py` is the earlier OBS-aware session logger retained with the helper set
- output text files, calibration JSON, and EMG CSV exports stay local and are ignored by git

Install Python requirements in the Python environment used for the capture scripts:

```bash
npm run capture:emg:install
```

Run dual-channel or single-channel EMG from the repo root:

```bash
npm run capture:emg:dual
npm run capture:emg:single
```

The Python files keep serial port, OBS host, OBS password, and calibration settings near the top because those values are hardware- and workstation-specific.

## PulsePoint Paths

The local API still defaults to the older sibling-folder layout so an existing capture setup keeps working. The embedded relay writes HR CSVs into the configured `HR_RECORDINGS_DIR`.

To have PulsePoint read repo-local helper output, set:

```bash
HR_RECORDINGS_DIR=./tools/capture/heart-rate/recordings
EMG_TEXT_DIR=./tools/capture/emg
EMG_SESSIONS_DIR=./tools/capture/emg/emg_sessions
```

Do not commit recordings, live text feeds, calibration files, or exported telemetry.
