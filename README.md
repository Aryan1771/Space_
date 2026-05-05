# Space_

Space_ is a Chromium-based desktop browser built with Electron, React, Tailwind, and TypeScript. It combines an Opera GX-inspired UI with Brave-style Shields, GX customization surfaces, AI sidebar tools, and performance controls.

## What Is Included

- Chromium-backed browsing through Electron.
- Opera GX-style browser chrome with a neon sidebar, tab strip, address bar, start page, editable Speed Dial, widgets, and GX-style feature panels.
- Brave-style Shields controls for ads, trackers, URL tracking cleanup, cookies, HTTPS upgrade, fingerprinting hardening, scripts, and consent blocking.
- Sidebar apps for settings, history, bookmarks, downloads, notes, music, social apps, and AI tools.
- Theme presets: GX Red, Neon Green, Electric Blue, Cyber Yellow, Dark Mode, and Light Mode.
- GX Mods scaffold with local import/export for JSON mod manifests.
- GX Control scaffold for background tab behavior, suspension policy, network presets, and animation levels.
- Utilities for screenshots, cleaner actions, downloads, bookmarks, private tabs, auto Picture-in-Picture for playing videos, Wayback Machine, Speedreader, DevTools, Chrome Web Store browsing, and Load Unpacked developer extensions.

## Feature Coverage

Space_ does not fake server-backed or OS-kernel features. Tor, VPN, cross-device sync, hard RAM caps, hard CPU caps, and remote mod marketplace are intentionally not shown as working features until real infrastructure exists.

| Area | Status | Notes |
| --- | --- | --- |
| Chromium browsing | Working | Real Electron Chromium BrowserViews render standard websites. |
| Tabs | Partial | New, close, restore, pin, drag reorder, detach, split view, and island metadata exist; collapsible island UI is still future work. |
| Speed Dial | Working | Add, edit, delete, recolor, favicon tiles, hover actions. |
| Sidebar apps | Working | System, social, music, and AI apps open in resizable/pinnable panels. |
| Themes/RGB | Working | Six presets with shared accent/glow tokens. |
| GX Mods | Partial | Local JSON import/export works; online marketplace is not connected. |
| GX Cleaner | Working | Cache, cookies, and storage clearing. |
| GX Control | Partial | Tab sleep/throttling behavior controls exist; true OS CPU/RAM caps need a native helper. |
| Ad/tracker blocking | Working | EasyList blocker and request interception. |
| URL tracking protection | Working | Common tracking parameters are stripped before navigation. |
| Cookie blocking | Working | Third-party cookies are blocked by default while first-party login cookies remain available. |
| HTTPS upgrade | Working | HTTP requests upgrade to HTTPS where possible. |
| Fingerprinting protection | Partial | Best-effort hardening only, not Brave-equivalent parity. |
| Script blocking | Partial | Global/per-site shield model exists; fine-grained script UI is still being expanded. |
| Extensions | Partial | Chrome Web Store opens; developer Load Unpacked extensions can be loaded for the session. |
| Wayback/Speedreader/DevTools | Working/Partial | Wayback and DevTools are working; Speedreader is a basic reader CSS mode. |
| Tor/VPN/Sync | Removed | Not included until real network and account infrastructure exists. |

## Browser Settings Baseline

The local `space://settings` page is modeled after common settings categories from major browsers:

- Chrome-style sections: search engine, startup/homepage, site permissions, cookies and site data, extensions/themes, downloads, accessibility, system, and reset settings.
- Firefox-style sections: General, Home, Search, Privacy & Security, Sync, AI controls, and experimental Labs-style settings.
- Brave-style sections: global Shields, site-specific Shields, privacy/security, WebRTC/privacy services, extensions, and sync.
- Opera/Opera GX-style sections: sidebar setup, messengers, Speed Dial, themes, wallpapers, sounds, advanced browser/start-page options, and performance controls.

## Run Space_

For a normal Windows app launch, use the packaged executable after building. This opens directly as a desktop app and does not use a command prompt:

```powershell
release\win-unpacked\Space_.exe
```

To create the installer:

```powershell
npm install
npm run installer
```

The installer is created at:

```powershell
release\Space_-Setup-0.1.0.exe
```

The installed desktop and Start Menu shortcuts launch `Space_` directly without opening a command prompt.

## Development

```powershell
npm install
npm run dev
```

## Production build

```powershell
npm run pack
```
