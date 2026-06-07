# PulsePoint Android APK Build

This is a Capacitor Android shell for the existing PulsePoint Standalone web app.

The APK packages the React UI. It does not move the Node/SQLite backend, AI keys, TTS rendering, uploads, or private session data into Android. Keep running the PulsePoint API on the trusted desktop/laptop, then point the APK at that API.

## What Works In This First Pass

- Installable Android project under `android/`.
- Packaged Vite web bundle synced into the Android app.
- LAN/Tailscale API targeting with `VITE_API_BASE`.
- Relative `/api` and `/uploads` paths resolved for Capacitor where the app already uses the shared helpers.
- Android manifest declares internet, camera, microphone, media read, and notification permissions.
- Android backup is disabled by default because PulsePoint data is sensitive.

## Known Limits

- A JDK and Android SDK are required to produce the final `.apk`. This machine did not have `java` or `JAVA_HOME` available during setup.
- The APK still needs the local PulsePoint server for data, AI, uploads, audio exports, and live capture routes.
- Direct Polar H10 through Web Bluetooth may not work in Android WebView even though it works in Chrome/PWA. Pulsoid and server-backed relay paths are better first-device APK tests.
- Local notification behavior in WebView may need a native Capacitor notification plugin later. This pass keeps the existing web/PWA notification behavior intact.

## Desktop API

Start the local API on the PulsePoint machine:

```powershell
npm run server
```

Find the desktop LAN IP:

```powershell
ipconfig
```

Use the IPv4 address for the active Wi-Fi/Ethernet adapter. Example:

```text
192.168.1.42
```

From the Android phone, the API base would be:

```text
http://192.168.1.42:8787/api
```

For Tailscale, use the machine's Tailscale HTTPS or MagicDNS route instead.

## Build A Debug APK

Install Android Studio first. During setup, install:

- Android SDK
- Android SDK Platform Tools
- Android SDK Build Tools
- A JDK, or Android Studio's bundled JDK

Then set `JAVA_HOME` if Gradle cannot find Java. Typical Android Studio bundled JDK path:

```powershell
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
```

Build for an emulator using Android's host-loopback address:

```powershell
$env:VITE_API_BASE="http://10.0.2.2:8787/api"
npm run android:apk:debug
```

Build for a real phone on the same LAN:

```powershell
$env:VITE_API_BASE="http://YOUR_DESKTOP_IPV4:8787/api"
npm run android:apk:debug
```

The debug APK will land here:

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

## Open In Android Studio

```powershell
$env:VITE_API_BASE="http://YOUR_DESKTOP_IPV4:8787/api"
npm run android:open
```

Android Studio can then run the app on an emulator or plugged-in phone.

## Sanity Test

Before installing the APK, verify the phone can reach the desktop API in Chrome:

```text
http://YOUR_DESKTOP_IPV4:8787/api/health
```

Expected JSON:

```json
{ "ok": true, "app": "PulsePoint Standalone API" }
```

If that fails, fix Windows firewall, LAN isolation, VPN routing, or Tailscale before debugging the APK.
