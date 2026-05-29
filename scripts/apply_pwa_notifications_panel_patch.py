from pathlib import Path

path = Path("src/pages/SettingsStatus.jsx")
if not path.exists():
    raise SystemExit("Run this from the PulsePoint-Standalone repo root. Missing src/pages/SettingsStatus.jsx")

text = path.read_text(encoding="utf-8")

if "PWA_LOCAL_NOTIFICATIONS_V1" in text:
    print("PulsePoint local notifications v1 already appears to be applied. No changes made.")
    raise SystemExit(0)

backup = path.with_suffix(".jsx.bak-pwa-local-notifications-v1")
backup.write_text(text, encoding="utf-8")

text = text.replace(
'''  Activity,
  CircleDollarSign,
''',
'''  Activity,
  BellRing,
  CircleDollarSign,
''',
1,
)

helper_anchor = '''function isPossiblyStale(job) {
  if (!["queued", "running"].includes(job?.status)) return false;
  const updated = new Date(job?.progress?.updatedAt || job?.updatedAt || 0).getTime();
  return Number.isFinite(updated) && Date.now() - updated > 10 * 60 * 1000;
}

function ProviderCard({ status }) {
'''
helper_insert = '''function isPossiblyStale(job) {
  if (!["queued", "running"].includes(job?.status)) return false;
  const updated = new Date(job?.progress?.updatedAt || job?.updatedAt || 0).getTime();
  return Number.isFinite(updated) && Date.now() - updated > 10 * 60 * 1000;
}

// PWA_LOCAL_NOTIFICATIONS_V1
function getNotificationSupport() {
  if (typeof window === "undefined") return { supported: false, reason: "Unavailable during server render." };
  if (!("Notification" in window)) return { supported: false, reason: "This browser does not expose the Notification API." };
  if (!window.isSecureContext) return { supported: false, reason: "Notifications require HTTPS or localhost." };
  return { supported: true, reason: "Local browser notifications are available." };
}

async function showPulsePointNotification({ title, body, route = "/settings" }) {
  const options = {
    body,
    tag: "pulsepoint-test-notification",
    renotify: true,
    icon: "/icons/pulsepoint-192.png",
    badge: "/icons/pulsepoint-192.png",
    data: { route },
  };

  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.ready;
    if (registration?.showNotification) {
      await registration.showNotification(title, options);
      return;
    }
  }

  const notification = new Notification(title, options);
  notification.onclick = () => {
    window.focus();
    if (route) window.location.assign(route);
    notification.close();
  };
}

function ProviderCard({ status }) {
'''
if helper_anchor not in text:
    raise SystemExit("Patch failed: could not find isPossiblyStale helper anchor.")
text = text.replace(helper_anchor, helper_insert, 1)

state_anchor = '''  const [jobsError, setJobsError] = useState("");
  const [clearing, setClearing] = useState(false);
  const [stoppingIds, setStoppingIds] = useState(() => new Set());

  const loadProviders = async () => {
'''
state_insert = '''  const [jobsError, setJobsError] = useState("");
  const [clearing, setClearing] = useState(false);
  const [stoppingIds, setStoppingIds] = useState(() => new Set());
  const notificationSupport = useMemo(() => getNotificationSupport(), []);
  const [notificationPermission, setNotificationPermission] = useState(() => (
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  ));
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationBusy, setNotificationBusy] = useState(false);

  const loadProviders = async () => {
'''
if state_anchor not in text:
    raise SystemExit("Patch failed: could not find SettingsStatus state anchor.")
text = text.replace(state_anchor, state_insert, 1)

use_effect_anchor = '''  useEffect(() => {
    loadProviders();
  }, []);

  useEffect(() => {
'''
use_effect_insert = '''  useEffect(() => {
    loadProviders();
  }, []);

  useEffect(() => {
    if (!notificationSupport.supported || typeof Notification === "undefined") return;
    setNotificationPermission(Notification.permission);
  }, [notificationSupport.supported]);

  const requestNotifications = async () => {
    if (!notificationSupport.supported || typeof Notification === "undefined") {
      setNotificationMessage(notificationSupport.reason);
      return;
    }
    setNotificationBusy(true);
    setNotificationMessage("");
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      setNotificationMessage(
        permission === "granted"
          ? "Notifications are enabled for this browser/app install."
          : permission === "denied"
            ? "Notifications are blocked. Re-enable them from browser or Android app/site settings."
            : "Notification permission was left undecided."
      );
    } catch (error) {
      setNotificationMessage(error?.message || "Could not request notification permission.");
    } finally {
      setNotificationBusy(false);
    }
  };

  const sendTestNotification = async () => {
    if (!notificationSupport.supported) {
      setNotificationMessage(notificationSupport.reason);
      return;
    }
    if (Notification.permission !== "granted") {
      setNotificationMessage("Enable notifications first, then send a test.");
      setNotificationPermission(Notification.permission);
      return;
    }
    setNotificationBusy(true);
    setNotificationMessage("");
    try {
      await showPulsePointNotification({
        title: "PulsePoint is ready 🫀",
        body: "Local notifications are working. Tapping this should open Settings & Status.",
        route: "/settings",
      });
      setNotificationMessage("Test notification sent.");
    } catch (error) {
      setNotificationMessage(error?.message || "Could not send the test notification.");
    } finally {
      setNotificationBusy(false);
    }
  };

  useEffect(() => {
'''
if use_effect_anchor not in text:
    raise SystemExit("Patch failed: could not find provider load useEffect anchor.")
text = text.replace(use_effect_anchor, use_effect_insert, 1)

section_anchor = '''      <TTSSettingsPanel />

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
'''
section_insert = '''      <TTSSettingsPanel />

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <BellRing className="h-4 w-4" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Notifications</h2>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Enable local PulsePoint notifications for app-like alerts. This is browser/PWA notification support, not full remote push delivery yet.
            </p>
          </div>
          <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${notificationPermission === "granted" ? "bg-emerald-500/10 text-emerald-300" : notificationPermission === "denied" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
            {notificationSupport.supported ? notificationPermission : "unsupported"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div className="rounded-lg bg-muted/25 px-3 py-3 text-sm text-muted-foreground">
            <p>{notificationSupport.reason}</p>
            <p className="mt-1 text-xs">
              Use this first for local completion/test alerts. True background push can be added later with VAPID keys, subscription storage, and backend send routes.
            </p>
            {notificationMessage && <p className="mt-2 text-xs font-semibold text-foreground">{notificationMessage}</p>}
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            <button
              type="button"
              onClick={requestNotifications}
              disabled={notificationBusy || !notificationSupport.supported || notificationPermission === "granted"}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {notificationBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
              Enable
            </button>
            <button
              type="button"
              onClick={sendTestNotification}
              disabled={notificationBusy || !notificationSupport.supported || notificationPermission !== "granted"}
              className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted/80 disabled:opacity-50"
            >
              {notificationBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
              Send Test
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
'''
if section_anchor not in text:
    raise SystemExit("Patch failed: could not find TTSSettingsPanel insertion anchor.")
text = text.replace(section_anchor, section_insert, 1)

path.write_text(text, encoding="utf-8")
print("Applied PulsePoint local notifications v1.")
print("Backup written to", backup)
