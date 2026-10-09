# Privacy & child safety

## What the app does

- No accounts, advertising, analytics, tracking, chat, social features, or external links in child mode.
- No camera, photo library or location access.
- **Microphone: off by default.** It is used only by the "Say it!" speaking practice, and only after a parent turns it on in the parent area (the browser also asks for permission).
  - The child's recording stays in memory as a temporary blob so the child can hear themselves, and is discarded right after. It is never written to storage, exported or sent anywhere.
  - Word recognition is used **only when the browser can run it on the device** (`SpeechRecognition` with `processLocally`). Cloud speech services are never used, and if on-device recognition is unavailable the activity simply works without it.
  - Recognition can only celebrate. It never marks the child wrong.
  - Only a number is stored per practised word (how it was practised: recognised, self-checked, or said aloud without the mic), for the parent dashboard.
  - "Prepare word recognition on this device" lets the parent ask the browser to download its own on-device language pack. This is the only optional download, and it happens only at the parent's request.
- Learning data, drawings and settings are stored **only in this browser/app's IndexedDB** on the device.
- There are **no network requests at runtime**. Fonts, art, audio and content are bundled. Network downloads happen only at build time on the developer's machine.
- The child profile is minimal: an optional nickname and an optional age band. No real name, birthday, email, photo or location.
- The parent PIN is stored as a salted SHA-256 hash.
- Parent-gated: settings, export, import, reset, delete-all, extra screen time. Destructive actions need a typed confirmation word.
- Export contains learning progress only (no drawings, no PIN).

## Not claimed

No legal compliance (COPPA, GDPR/GDPR-K, Egypt PDPL, Google Play Families) is claimed. Before any public release:

1. Review the Google Play Families policy and Designed for Families requirements.
2. Review COPPA (if offered in the US) and GDPR for children (EU/UK), and Egypt's Personal Data Protection Law 151/2020.
3. Publish a privacy policy that matches the behaviour above.
4. Re-check third-party asset licenses (ASSETS_LICENSES.md), especially the TTS voices.
