import csv
import json
import time
import collections
from datetime import datetime
from pathlib import Path

import serial
import matplotlib.pyplot as plt

try:
    import obsws_python as obs
except ImportError:
    obs = None


# =========================================================
# USER SETTINGS
# =========================================================

SERIAL_PORT = "COM5"
SERIAL_BAUD = 115200

# Calibration file
CAL_FILE = Path("emg_calibration.json")

# Default calibration if no saved file exists
REST = 90.0
MAX_CONTRACT = 3000.0

# OBS WebSocket settings
OBS_ENABLED = True
OBS_HOST = "192.168.0.33"   # or "127.0.0.1" / "localhost"
OBS_PORT = 4455
OBS_PASSWORD = ""           # empty if no password

# Graph / output
PUBLISH_HZ = 30
PLOT_SECONDS = 10

WRITE_OBS_TXT = True
OBS_TXT_PATH = Path("emg_level.txt")

OUTPUT_DIR = Path("emg_sessions")
OUTPUT_DIR.mkdir(exist_ok=True)

# Signal feel
ALPHA_ENV = 0.25
ATTACK = 0.60
RELEASE = 0.20


# =========================================================
# LOAD SAVED CALIBRATION
# =========================================================

if CAL_FILE.exists():
    try:
        data = json.loads(CAL_FILE.read_text())
        REST = float(data.get("REST", REST))
        MAX_CONTRACT = float(data.get("MAX_CONTRACT", MAX_CONTRACT))
        print(f"Loaded calibration: REST={REST:.1f}, MAX={MAX_CONTRACT:.1f}")
    except Exception as e:
        print(f"Could not load calibration file: {e}")


# =========================================================
# HELPERS
# =========================================================

def clamp(x, lo, hi):
    return lo if x < lo else hi if x > hi else x


def get_latest_numeric_line(ser):
    """Drain serial buffer and use only the newest numeric line."""
    latest = None

    waiting = ser.in_waiting
    if waiting:
        chunk = ser.read(waiting).decode(errors="ignore")
        for line in chunk.splitlines():
            s = line.strip()
            if s and (s[0].isdigit() or s[0] == "-"):
                latest = s

    if latest is None:
        s = ser.readline().decode(errors="ignore").strip()
        if s and (s[0].isdigit() or s[0] == "-"):
            latest = s

    return latest


def connect_obs():
    if not OBS_ENABLED:
        print("OBS: disabled in script settings.")
        return None

    if obs is None:
        print("OBS: obsws-python is not installed.")
        return None

    try:
        client = obs.ReqClient(
            host=OBS_HOST,
            port=OBS_PORT,
            password=OBS_PASSWORD,
            timeout=3
        )
        print(f"OBS: connected successfully to {OBS_HOST}:{OBS_PORT}")

        try:
            version = client.get_version()
            print(f"OBS: version check succeeded -> {version}")
        except Exception as e:
            print(f"OBS: connected, but version check failed -> {e}")

        return client

    except Exception as e:
        print(f"OBS: connection failed -> {e}")
        return None


def get_obs_recording_state(obs_client):
    if obs_client is None:
        return False, "DISCONNECTED"

    try:
        status = obs_client.get_record_status()
        active = getattr(status, "output_active", False)
        state = getattr(status, "output_state", "UNKNOWN")
        return bool(active), f"CONNECTED / {state}"
    except Exception as e:
        return False, f"ERROR: {e}"


def new_session_csv():
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = OUTPUT_DIR / f"emg_session_{stamp}.csv"
    f = path.open("w", newline="", encoding="utf-8")

    writer = csv.DictWriter(
        f,
        fieldnames=[
            "unix_time",
            "iso_time",
            "t_rel_s",
            "raw_env",
            "env_smooth",
            "level_pct",
            "rest_cal",
            "max_cal",
            "obs_recording",
            "obs_state",
            "marker",
        ],
    )
    writer.writeheader()
    return path, f, writer


def write_row(writer, t0_perf, raw_env, env_smooth, level_pct,
              rest_cal, max_cal, obs_recording, obs_state, marker=""):

    now = time.time()
    perf_now = time.perf_counter()

    writer.writerow({
        "unix_time": f"{now:.6f}",
        "iso_time": datetime.now().isoformat(timespec="milliseconds"),
        "t_rel_s": f"{perf_now - t0_perf:.6f}",
        "raw_env": "" if raw_env is None else f"{raw_env:.3f}",
        "env_smooth": "" if env_smooth is None else f"{env_smooth:.3f}",
        "level_pct": "" if level_pct is None else f"{level_pct:.3f}",
        "rest_cal": f"{rest_cal:.3f}",
        "max_cal": f"{max_cal:.3f}",
        "obs_recording": int(bool(obs_recording)),
        "obs_state": obs_state,
        "marker": marker,
    })


# =========================================================
# MAIN
# =========================================================

def main():
    global REST, MAX_CONTRACT

    # Runtime values accessible to key handler
    state = {
        "raw": None,
        "env_s": None,
        "level_s": 0.0,
    }

    print(f"Serial: opening {SERIAL_PORT} @ {SERIAL_BAUD} ...")
    ser = serial.Serial(SERIAL_PORT, SERIAL_BAUD, timeout=0.05)
    time.sleep(1.2)
    ser.reset_input_buffer()
    print("Serial: connected.")

    obs_client = connect_obs()
    obs_recording, obs_state = get_obs_recording_state(obs_client)
    last_obs_recording = obs_recording

    print(f"OBS status at startup: {obs_state}")
    if obs_client is None:
        print("WARNING: OBS not connected. EMG graph/overlay will run, but OBS session CSV start/stop will not auto-trigger.")

    dt = 1.0 / PUBLISH_HZ
    max_points = int(PLOT_SECONDS * PUBLISH_HZ)
    level_buf = collections.deque([0.0] * max_points, maxlen=max_points)

    plt.ion()
    fig, ax = plt.subplots()
    line, = ax.plot([], [], linewidth=2)

    ax.set_title("Foot EMG Level")
    ax.set_ylabel("Level (%)")
    ax.set_ylim(0, 100)

    def on_key(event):
        global REST, MAX_CONTRACT

        env_now = state.get("env_s")

        if env_now is None:
            print("Calibration: no ENV value yet.")
            return

        if event.key == "r":
            REST = env_now
            print(f"Calibration: REST set to {REST:.1f}")

        elif event.key == "m":
            MAX_CONTRACT = env_now
            print(f"Calibration: MAX_CONTRACT set to {MAX_CONTRACT:.1f}")

        elif event.key == "c":
            CAL_FILE.write_text(json.dumps({
                "REST": REST,
                "MAX_CONTRACT": MAX_CONTRACT
            }, indent=2))
            print(f"Calibration saved: REST={REST:.1f}, MAX={MAX_CONTRACT:.1f}")

    fig.canvas.mpl_connect("key_press_event", on_key)

    env_s = None
    level_s = 0.0
    last_pub = time.time()

    session_file = None
    session_writer = None
    session_path = None
    session_t0 = None

    print("Running. Ctrl+C to stop.")
    print(f"Session CSV folder: {OUTPUT_DIR.resolve()}")
    print("Calibration keys: R = set REST, M = set MAX, C = save calibration")
    print("Waiting for OBS recording start...")

    try:
        while True:
            s = get_latest_numeric_line(ser)
            if s is None:
                continue

            try:
                raw = float(s)
            except ValueError:
                continue

            if env_s is None:
                env_s = raw

            env_s = ALPHA_ENV * raw + (1 - ALPHA_ENV) * env_s

            denom = MAX_CONTRACT - REST
            if abs(denom) < 1:
                denom = 1.0

            level = ((env_s - REST) / denom) * 100.0
            level = clamp(level, 0.0, 100.0)

            a = ATTACK if level > level_s else RELEASE
            level_s = a * level + (1 - a) * level_s

            state["raw"] = raw
            state["env_s"] = env_s
            state["level_s"] = level_s

            now = time.time()
            if now - last_pub >= dt:
                last_pub = now

                obs_recording, obs_state = get_obs_recording_state(obs_client)

                # OBS recording START
                if obs_recording and not last_obs_recording:
                    session_path, session_file, session_writer = new_session_csv()
                    session_t0 = time.perf_counter()

                    write_row(
                        session_writer,
                        session_t0,
                        raw,
                        env_s,
                        level_s,
                        REST,
                        MAX_CONTRACT,
                        obs_recording,
                        obs_state,
                        marker="RECORD_START"
                    )
                    session_file.flush()

                    print(f"OBS: recording started -> logging to {session_path}")

                # OBS recording STOP
                elif not obs_recording and last_obs_recording:
                    if session_writer is not None:
                        write_row(
                            session_writer,
                            session_t0,
                            raw,
                            env_s,
                            level_s,
                            REST,
                            MAX_CONTRACT,
                            obs_recording,
                            obs_state,
                            marker="RECORD_STOP"
                        )
                        session_file.flush()
                        session_file.close()

                        print(f"OBS: recording stopped -> closed {session_path}")

                        session_file = None
                        session_writer = None
                        session_path = None
                        session_t0 = None

                last_obs_recording = obs_recording

                # Write EMG row only while OBS is recording
                if obs_recording and session_writer is not None:
                    write_row(
                        session_writer,
                        session_t0,
                        raw,
                        env_s,
                        level_s,
                        REST,
                        MAX_CONTRACT,
                        obs_recording,
                        obs_state,
                        marker=""
                    )
                    session_file.flush()

                # Update graph
                level_buf.append(level_s)
                xs = list(range(len(level_buf)))
                ys = list(level_buf)

                line.set_data(xs, ys)
                ax.set_xlim(0, max(10, len(level_buf)))
                ax.set_ylim(0, 100)

                ax.set_xlabel(
                    f"RAW:{raw:.0f}  ENV:{env_s:.1f}  LEVEL:{level_s:.1f}%  "
                    f"REST:{REST:.0f} MAX:{MAX_CONTRACT:.0f}  |  OBS:{obs_state}"
                )

                fig.canvas.draw_idle()
                fig.canvas.flush_events()
                plt.pause(0.001)

                if WRITE_OBS_TXT:
                    OBS_TXT_PATH.write_text(f"{level_s:.1f}%")

    except KeyboardInterrupt:
        print("\nStopping script...")

        if session_writer is not None and session_file is not None:
            write_row(
                session_writer,
                session_t0,
                state.get("raw"),
                state.get("env_s"),
                state.get("level_s"),
                REST,
                MAX_CONTRACT,
                last_obs_recording,
                obs_state,
                marker="SCRIPT_STOP"
            )
            session_file.flush()
            session_file.close()
            print(f"Session closed: {session_path}")

    ser.close()
    print("Serial: closed.")
    print("Stopped.")


if __name__ == "__main__":
    main()