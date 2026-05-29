from pathlib import Path

main_path = Path("src/main.jsx")
sw_path = Path("public/sw.js")

missing = [str(path) for path in [main_path, sw_path] if not path.exists()]
if missing:
    raise SystemExit("Run this from the PulsePoint-Standalone repo root. Missing: " + ", ".join(missing))

main = main_path.read_text(encoding="utf-8")
sw = sw_path.read_text(encoding="utf-8")

if "PWA_NO_FOCUS_RELOAD_V1" in main or "PWA_NO_FOCUS_RELOAD_V1" in sw:
    print("PulsePoint PWA no-focus-reload v1 already appears to be applied. No changes made.")
    raise SystemExit(0)

main_backup = main_path.with_suffix(".jsx.bak-pwa-no-focus-reload-v1")
sw_backup = sw_path.with_suffix(".js.bak-pwa-no-focus-reload-v1")
main_backup.write_text(main, encoding="utf-8")
sw_backup.write_text(sw, encoding="utf-8")

# Remove the automatic reload-on-controllerchange behavior introduced by the PWA full-send patch.
old_controller_block = '''
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
'''
new_controller_block = '''
  // PWA_NO_FOCUS_RELOAD_V1
  // Do not auto-reload on service-worker controller changes. Android/Chrome can
  // check for SW updates when the installed app regains focus, and an automatic
  // reload here can interrupt live capture, Motion Lab analysis, AI jobs, or TTS.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.dispatchEvent(new CustomEvent('pulsepoint:pwa-controller-changed'));
  });
'''

if old_controller_block in main:
    main = main.replace(old_controller_block, new_controller_block, 1)
elif "navigator.serviceWorker.addEventListener('controllerchange'" in main and "window.location.reload" in main:
    raise SystemExit("Patch stopped: found controllerchange reload logic, but not in expected shape. Please inspect src/main.jsx.")
elif "PWA_FULL_SEND_V1" in main:
    main = main.replace(
        "const PWA_FULL_SEND_V1 = true;\n",
        "const PWA_FULL_SEND_V1 = true;\nconst PWA_NO_FOCUS_RELOAD_V1 = true;\n",
        1,
    )
else:
    main += '''

// PWA_NO_FOCUS_RELOAD_V1
// Guardrail: app focus should never force a page reload. Service worker updates
// should be user-initiated or applied on a natural app restart.
'''

# Make update detection passive: notify the app, but don't force activation/reload.
if "const PWA_FULL_SEND_V1 = true;\nconst PWA_NO_FOCUS_RELOAD_V1 = true;" not in main and "const PWA_FULL_SEND_V1 = true;" in main:
    main = main.replace(
        "const PWA_FULL_SEND_V1 = true;\n",
        "const PWA_FULL_SEND_V1 = true;\nconst PWA_NO_FOCUS_RELOAD_V1 = true;\n",
        1,
    )

# Stop the service worker from immediately taking over on install/update.
# skipWaiting is still supported via the PULSEPOINT_SKIP_WAITING message if a future UI chooses to apply an update deliberately.
sw = sw.replace(
'''// PWA_FULL_SEND_V1
const CACHE_NAME = "pulsepoint-shell-v3";
''',
'''// PWA_FULL_SEND_V1
// PWA_NO_FOCUS_RELOAD_V1
const CACHE_NAME = "pulsepoint-shell-v4";
''',
1,
)

sw = sw.replace(
'''    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
''',
'''    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
''',
1,
)

# If running against older sw.js, handle the old cache name and old install block too.
sw = sw.replace(
'''const CACHE_NAME = "pulsepoint-shell-v2";
''',
'''// PWA_NO_FOCUS_RELOAD_V1
const CACHE_NAME = "pulsepoint-shell-v4";
''',
1,
)
sw = sw.replace(
'''const CACHE_NAME = "pulsepoint-shell-v3";
''',
'''// PWA_NO_FOCUS_RELOAD_V1
const CACHE_NAME = "pulsepoint-shell-v4";
''',
1,
)
sw = sw.replace(
'''.then(() => self.skipWaiting())''',
'''.then(() => undefined)''',
1,
)

main_path.write_text(main, encoding="utf-8")
sw_path.write_text(sw, encoding="utf-8")

print("Applied PulsePoint PWA no-focus-reload v1.")
print("Changed:")
print("- src/main.jsx no longer reloads automatically on service-worker controllerchange")
print("- public/sw.js no longer calls skipWaiting automatically during install/update")
print("- service worker cache bumped to pulsepoint-shell-v4")
print("- future updates can still be applied intentionally through PULSEPOINT_SKIP_WAITING")
print(f"Backups written to {main_backup} and {sw_backup}")
