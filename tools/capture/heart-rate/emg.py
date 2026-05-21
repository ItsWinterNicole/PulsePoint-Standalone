import time
import collections
import serial
import matplotlib.pyplot as plt

PORT = "COM5"
BAUD = 115200

# Calibration
REST = 90.0
MAX = 3000.0

# Display
PLOT_SECONDS = 6
PUBLISH_HZ = 30   # plenty for overlay

# Light smoothing only
ALPHA_ENV = 0.25
ATTACK = 0.60
RELEASE = 0.20

WRITE_OBS_TXT = True
OBS_TXT_PATH = "emg_level.txt"

def clamp(x, lo, hi):
    return lo if x < lo else hi if x > hi else x

ser = serial.Serial(PORT, BAUD, timeout=0.05)
time.sleep(1.2)  # UNO R4 resets on open
ser.reset_input_buffer()

dt = 1.0 / PUBLISH_HZ
max_points = int(PLOT_SECONDS * PUBLISH_HZ)

buf = collections.deque([0.0] * max_points, maxlen=max_points)

env_s = None
level_s = 0.0
last_pub = time.time()

plt.ion()
fig, ax = plt.subplots()
line, = ax.plot([], [], linewidth=2)
ax.set_title("Foot EMG Level")
ax.set_ylabel("%")
ax.set_ylim(0, 100)

print("Running latest-sample meter. Ctrl+C to stop.")

def get_latest_numeric_line():
    """Drain serial buffer and return only the newest valid numeric line."""
    latest = None

    # Read all currently available bytes
    waiting = ser.in_waiting
    if waiting:
        chunk = ser.read(waiting).decode(errors="ignore")
        lines = chunk.splitlines()
        for s in lines:
            s = s.strip()
            if not s:
                continue
            if s[0].isdigit() or s[0] == '-':
                latest = s

    # Fallback: try one normal readline if buffer was empty
    if latest is None:
        s = ser.readline().decode(errors="ignore").strip()
        if s and (s[0].isdigit() or s[0] == '-'):
            latest = s

    return latest

try:
    while True:
        s = get_latest_numeric_line()
        if s is None:
            continue

        try:
            raw = float(s)
        except ValueError:
            continue

        if env_s is None:
            env_s = raw

        # Light smoothing
        env_s = ALPHA_ENV * raw + (1 - ALPHA_ENV) * env_s

        denom = (MAX - REST) if (MAX - REST) != 0 else 1.0
        level = ((env_s - REST) / denom) * 100.0
        level = clamp(level, 0.0, 100.0)

        a = ATTACK if level > level_s else RELEASE
        level_s = a * level + (1 - a) * level_s

        now = time.time()
        if now - last_pub >= dt:
            last_pub = now

            buf.append(level_s)

            xs = list(range(len(buf)))
            ys = list(buf)
            line.set_data(xs, ys)
            ax.set_xlim(0, max(10, len(buf)))
            ax.set_ylim(0, 100)

            ax.set_xlabel(f"RAW:{raw:.0f}  ENV:{env_s:.1f}  LEVEL:{level_s:.1f}%")
            fig.canvas.draw_idle()
            fig.canvas.flush_events()
            plt.pause(0.001)

            if WRITE_OBS_TXT:
                with open(OBS_TXT_PATH, "w") as f:
                    f.write(f"{level_s:.1f}%")

except KeyboardInterrupt:
    pass

ser.close()
print("Stopped.")