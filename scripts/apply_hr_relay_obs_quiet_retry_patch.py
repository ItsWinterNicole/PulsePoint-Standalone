from pathlib import Path

path = Path("server/services/hrRelay.js")
if not path.exists():
    raise SystemExit("Run this from the PulsePoint-Standalone repo root. Missing server/services/hrRelay.js")

text = path.read_text(encoding="utf-8")

if "HR_RELAY_OBS_QUIET_RETRY_V1" in text:
    print("HR relay OBS quiet retry v1 already appears to be applied. No changes made.")
    raise SystemExit(0)

backup = path.with_suffix(".js.bak-obs-quiet-retry-v1")
backup.write_text(text, encoding="utf-8")

text = text.replace(
'''const DEFAULT_CONFIG = {
  buildRiseMin: 4,
''',
'''// HR_RELAY_OBS_QUIET_RETRY_V1
const OBS_RETRY_LOG_INTERVAL_MS = Number(process.env.HR_OBS_RETRY_LOG_INTERVAL_MS || 60000);

const DEFAULT_CONFIG = {
  buildRiseMin: 4,
''',
1,
)

text = text.replace(
'''    this.obsReconnectTimer = null;
    this.appWss = null;
''',
'''    this.obsReconnectTimer = null;
    this.obsRetryCount = 0;
    this.obsLastRetryLogAt = 0;
    this.obsLastErrorMessage = null;
    this.obsWasEverConnected = false;
    this.appWss = null;
''',
1,
)

text = text.replace(
'''  connectObs() {
    clearTimeout(this.obsReconnectTimer);
    this.obsSocket = new this.WebSocket(liveCaptureConfig.hrObsWsUrl);
    this.obsSocket.on('open', () => {
      this.obsConnected = true;
      this.obsError = null;
      console.log(`PulsePoint HR relay connected to OBS at ${liveCaptureConfig.hrObsWsUrl}`);
      this.broadcastRelayStatus();
    });
    this.obsSocket.on('close', () => {
      this.obsConnected = false;
      this.obsIdentified = false;
      console.log('PulsePoint HR relay OBS websocket disconnected, retrying...');
      this.broadcastRelayStatus();
      this.obsReconnectTimer = setTimeout(() => this.connectObs(), 1500);
      this.obsReconnectTimer.unref?.();
    });
    this.obsSocket.on('error', (error) => {
      this.obsError = error.message || String(error);
      console.warn(`PulsePoint HR relay OBS websocket error: ${error.message || error}`);
      this.broadcastRelayStatus();
    });
    this.obsSocket.on('message', (raw) => this.handleObsMessage(raw));
  }
''',
'''  logObsRetry(reason, { force = false } = {}) {
    const now = Date.now();
    const shouldLog = force || !this.obsLastRetryLogAt || (now - this.obsLastRetryLogAt) >= OBS_RETRY_LOG_INTERVAL_MS;
    if (!shouldLog) return;
    this.obsLastRetryLogAt = now;
    const suffix = this.obsRetryCount > 1 ? `attempt ${this.obsRetryCount}` : 'standing by';
    console.warn(`PulsePoint HR relay OBS unavailable (${reason}); ${suffix}. Retrying quietly...`);
  }

  scheduleObsReconnect(reason = 'disconnected') {
    this.obsRetryCount += 1;
    this.logObsRetry(reason);
    this.broadcastRelayStatus();
    clearTimeout(this.obsReconnectTimer);
    this.obsReconnectTimer = setTimeout(() => this.connectObs(), 1500);
    this.obsReconnectTimer.unref?.();
  }

  connectObs() {
    clearTimeout(this.obsReconnectTimer);
    this.obsSocket = new this.WebSocket(liveCaptureConfig.hrObsWsUrl);
    this.obsSocket.on('open', () => {
      this.obsConnected = true;
      this.obsError = null;
      const retryText = this.obsRetryCount ? ` after ${this.obsRetryCount} retry attempt${this.obsRetryCount === 1 ? '' : 's'}` : '';
      console.log(`PulsePoint HR relay connected to OBS at ${liveCaptureConfig.hrObsWsUrl}${retryText}`);
      this.obsRetryCount = 0;
      this.obsLastRetryLogAt = 0;
      this.obsLastErrorMessage = null;
      this.obsWasEverConnected = true;
      this.broadcastRelayStatus();
    });
    this.obsSocket.on('close', () => {
      const reason = this.obsLastErrorMessage || (this.obsWasEverConnected ? 'websocket disconnected' : 'OBS not listening yet');
      this.obsConnected = false;
      this.obsIdentified = false;
      this.scheduleObsReconnect(reason);
    });
    this.obsSocket.on('error', (error) => {
      this.obsError = error.message || String(error);
      this.obsLastErrorMessage = this.obsError;
      this.logObsRetry(this.obsError, { force: this.obsRetryCount === 0 });
      this.broadcastRelayStatus();
    });
    this.obsSocket.on('message', (raw) => this.handleObsMessage(raw));
  }
''',
1,
)

path.write_text(text, encoding="utf-8")
print("Applied HR relay OBS quiet retry v1.")
print("Changed:")
print("- OBS connection retry continues in the background")
print("- ECONNREFUSED / disconnected logs are throttled")
print("- reconnect still logs immediately once OBS is available")
print("- optional HR_OBS_RETRY_LOG_INTERVAL_MS env var controls repeat-log interval")
print("Backup written to", backup)
