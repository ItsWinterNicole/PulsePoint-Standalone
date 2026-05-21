import csv
import json
import time
import collections
from datetime import datetime
from pathlib import Path

import serial
import matplotlib.pyplot as plt
import matplotlib as mpl

# Stop matplotlib stealing common shortcut keys
mpl.rcParams["keymap.fullscreen"] = []
mpl.rcParams["keymap.quit"] = []
mpl.rcParams["keymap.save"] = []

try:
    import obsws_python as obs
except ImportError:
    obs = None


# ================= SETTINGS =================

SERIAL_PORT = "COM5"      # change if needed
SERIAL_BAUD = 115200

CAL_FILE = Path("emg_calibration_single.json")

# Starting defaults — recalibrate with R/M/C
REST = 100.0
MAX_CONTRACT = 1000.0

# Clipping control
HEADROOM = 1.35        # raises effective max above calibrated max
DISPLAY_MAX = 150.0    # allows above-100 detail instead of hard clipping

# OBS
OBS_ENABLED = True
OBS_HOST = "192.168.0.33"
OBS_PORT = 4455
OBS_PASSWORD = ""

# Output files
LEVEL_TXT = Path("emg_level.txt")
OUTPUT_DIR = Path("emg_sessions")
OUTPUT_DIR.mkdir(exist_ok=True)

# Plot / update
PUBLISH_HZ = 30
PLOT_SECONDS = 20      # longer window helps slower contractions

# Signal tuning for slower contractions
# ENV from MyoWare is already smoothed, so these are overlay/analysis filters.
ALPHA_ENV = 0.12       # lower = smoother/slower; 0.10–0.18 good range
ALPHA_TREND = 0.035    # slow contraction trend line
ATTACK = 0.30          # slower rise than foot/toe version
RELEASE = 0.22         # controlled fall

# Optional noise gate
NOISE_FLOOR_PCT = 1.0  # values below this treated as 0-ish


# ================= LOAD CALIBRATION =================

if CAL_FILE.exists():
    try:
        data = json.loads(CAL_FILE.read_text())
        REST = float(data.get("REST", REST))
        MAX_CONTRACT = float(data.get("MAX_CONTRACT", MAX_CONTRACT))
        HEADROOM = float(data.get("HEADROOM", HEADROOM))
        print(f"Loaded calibration: REST={REST:.1f}, MAX={MAX_CONTRACT:.1f}, HEADROOM={HEADROOM:.2f}")
    except Exception as e:
        print(f"Could not load calibration: {e}")


# ================= HELPERS =================

def clamp(x, lo, hi):
    return lo if x < lo else hi if x > hi else x


def norm_with_headroom(env, rest, max_val):
    """
    Linear normalization with headroom and extended display range.
    100% = effective max after headroom.
    Values may exceed 100 up to DISPLAY_MAX.
    """
    if max_val <= rest + 10:
        return 0.0

    effective_max = rest + ((max_val - rest) * HEADROOM)
    denom = effective_max - rest

    pct = ((env - rest) / denom) * 100.0
    pct = clamp(pct, 0.0, DISPLAY_MAX)

    if pct < NOISE_FLOOR_PCT:
        pct = 0.0

    return pct


def get_latest_numeric_line(ser):
    """
    Backlog-proof serial reader.
    Drains serial buffer and returns only newest numeric line.
    """
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
        print("OBS disabled.")
        return None

    if obs is None:
        print("OBS package missing. Install with: py -m pip install obsws-python")
        return None

    try:
        client = obs.ReqClient(
            host=OBS_HOST,
            port=OBS_PORT,
            password=OBS_PASSWORD,
            timeout=3
        )
        print(f"OBS connected: {OBS_HOST}:{OBS_PORT}")
        return client
    except Exception as e:
        print(f"OBS connection failed: {e}")
        return None


def get_obs_state(client):
    if client is None:
        return False, "DISCONNECTED"

    try:
        status = client.get_record_status()
        active = bool(getattr(status, "output_active", False))
        paused = bool(getattr(status, "output_paused", False))

        if active and paused:
            return True, "RECORDING_PAUSED"
        if active:
            return True, "RECORDING"
        return False, "STOPPED"

    except Exception as e:
        return False, f"OBS_ERROR:{e}"


def new_csv():
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = OUTPUT_DIR / f"emg_single_{stamp}.csv"
    f = path.open("w", newline="", encoding="utf-8")
    writer = csv.writer(f)

    writer.writerow([
        "time_s",
        "unix_time",
        "iso_time",
        "raw_env",
        "env_smooth",
        "level_pct",
        "trend_pct",
        "rest",
        "max_contract",
        "headroom",
        "display_max",
        "obs_recording",
        "obs_state",
        "marker"
    ])

    return path, f, writer


def write_csv_row(writer, t0, raw, env_s, level_pct, trend_pct,
                  obs_recording, obs_state, marker=""):
    t = time.perf_counter() - t0
    now = time.time()

    writer.writerow([
        f"{t:.3f}",
        f"{now:.6f}",
        datetime.now().isoformat(timespec="milliseconds"),
        f"{raw:.1f}",
        f"{env_s:.1f}",
        f"{level_pct:.1f}",
        f"{trend_pct:.1f}",
        f"{REST:.1f}",
        f"{MAX_CONTRACT:.1f}",
        f"{HEADROOM:.2f}",
        f"{DISPLAY_MAX:.1f}",
        int(bool(obs_recording)),
        obs_state,
        marker
    ])


# ================= MAIN =================

def main():
    global REST, MAX_CONTRACT, HEADROOM

    print(f"Opening serial {SERIAL_PORT} @ {SERIAL_BAUD}...")
    ser = serial.Serial(SERIAL_PORT, SERIAL_BAUD, timeout=0.05)
    time.sleep(1.2)
    ser.reset_input_buffer()
    print("Serial connected.")

    obs_client = connect_obs()
    recording, obs_state = get_obs_state(obs_client)
    last_recording = recording
    print(f"OBS state: {obs_state}")

    dt = 1.0 / PUBLISH_HZ
    max_points = int(PLOT_SECONDS * PUBLISH_HZ)

    level_buf = collections.deque([0.0] * max_points, maxlen=max_points)
    trend_buf = collections.deque([0.0] * max_points, maxlen=max_points)

    raw = 0.0
    env_s = None
    level_s = 0.0
    trend_s = 0.0

    csv_file = None
    csv_writer = None
    csv_path = None
    session_t0 = None

    plt.ion()
    fig, ax = plt.subplots()
    line_level, = ax.plot([], [], label="Level")
    line_trend, = ax.plot([], [], label="Slow trend")

    ax.legend(loc="upper right")
    ax.set_title("Single EMG — Slow Contraction Tuned")
    ax.set_ylabel("Level (%)")
    ax.set_ylim(0, DISPLAY_MAX)

    def save_calibration():
        CAL_FILE.write_text(json.dumps({
            "REST": REST,
            "MAX_CONTRACT": MAX_CONTRACT,
            "HEADROOM": HEADROOM
        }, indent=2))
        print(f"Saved calibration: REST={REST:.1f}, MAX={MAX_CONTRACT:.1f}, HEADROOM={HEADROOM:.2f}")

    def on_key(event):
        global REST, MAX_CONTRACT, HEADROOM
        nonlocal env_s

        key = event.key.lower() if event.key else ""

        if env_s is None:
            print("No EMG data yet.")
            return

        if key == "r":
            REST = env_s
            print(f"Set REST: {REST:.1f}")

        elif key == "m":
            MAX_CONTRACT = env_s
            print(f"Set MAX_CONTRACT: {MAX_CONTRACT:.1f}")

        elif key == "c":
            save_calibration()

        elif key == "up":
            HEADROOM += 0.05
            print(f"HEADROOM increased: {HEADROOM:.2f}")

        elif key == "down":
            HEADROOM = max(1.0, HEADROOM - 0.05)
            print(f"HEADROOM decreased: {HEADROOM:.2f}")

    fig.canvas.mpl_connect("key_press_event", on_key)

    print("Running single EMG.")
    print("Keys:")
    print("  R = set rest")
    print("  M = set max contraction")
    print("  C = save calibration")
    print("  Up Arrow = increase headroom")
    print("  Down Arrow = decrease headroom")
    print("Waiting for OBS recording start...")

    last_pub = time.time()

    try:
        while True:
            s = get_latest_numeric_line(ser)
            if not s:
                continue

            try:
                raw = float(s)
            except ValueError:
                continue

            if env_s is None:
                env_s = raw
                trend_s = 0.0

            # Smooth the incoming ENV signal.
            env_s = ALPHA_ENV * raw + (1 - ALPHA_ENV) * env_s

            # Normalize with headroom and extended ceiling.
            level_raw = norm_with_headroom(env_s, REST, MAX_CONTRACT)

            # Attack/release smoothing.
            a = ATTACK if level_raw > level_s else RELEASE
            level_s = a * level_raw + (1 - a) * level_s

            # Slow trend for lower-frequency contractions.
            trend_s = ALPHA_TREND * level_s + (1 - ALPHA_TREND) * trend_s

            now = time.time()

            if now - last_pub >= dt:
                last_pub = now

                recording, obs_state = get_obs_state(obs_client)

                if recording and not last_recording:
                    csv_path, csv_file, csv_writer = new_csv()
                    session_t0 = time.perf_counter()

                    write_csv_row(
                        csv_writer, session_t0,
                        raw, env_s, level_s, trend_s,
                        recording, obs_state,
                        marker="RECORD_START"
                    )
                    csv_file.flush()
                    print(f"Recording started -> {csv_path}")

                elif not recording and last_recording:
                    if csv_writer is not None:
                        write_csv_row(
                            csv_writer, session_t0,
                            raw, env_s, level_s, trend_s,
                            recording, obs_state,
                            marker="RECORD_STOP"
                        )
                        csv_file.flush()
                        csv_file.close()

                        print(f"Recording stopped -> saved {csv_path}")

                        csv_writer = None
                        csv_file = None
                        csv_path = None
                        session_t0 = None

                last_recording = recording

                if recording and csv_writer is not None:
                    write_csv_row(
                        csv_writer, session_t0,
                        raw, env_s, level_s, trend_s,
                        recording, obs_state,
                        marker=""
                    )
                    csv_file.flush()

                level_buf.append(level_s)
                trend_buf.append(trend_s)

                xs = list(range(len(level_buf)))
                line_level.set_data(xs, list(level_buf))
                line_trend.set_data(xs, list(trend_buf))

                ax.set_xlim(0, max(10, len(level_buf)))
                ax.set_ylim(0, DISPLAY_MAX)

                ax.set_xlabel(
                    f"RAW:{raw:.0f} ENV:{env_s:.1f} "
                    f"LEVEL:{level_s:.1f}% TREND:{trend_s:.1f}% "
                    f"cal:{REST:.0f}/{MAX_CONTRACT:.0f} "
                    f"headroom:{HEADROOM:.2f} | OBS:{obs_state}"
                )

                fig.canvas.draw_idle()
                fig.canvas.flush_events()
                plt.pause(0.001)

                # OBS overlay gets level; trend is in CSV/plot.
                LEVEL_TXT.write_text(f"{level_s:.1f}")

    except KeyboardInterrupt:
        print("\nStopping...")

        if csv_writer is not None and csv_file is not None:
            write_csv_row(
                csv_writer, session_t0,
                raw, env_s, level_s, trend_s,
                last_recording, obs_state,
                marker="SCRIPT_STOP"
            )
            csv_file.flush()
            csv_file.close()
            print(f"Closed active CSV: {csv_path}")

    ser.close()
    print("Serial closed.")


if __name__ == "__main__":
    main()