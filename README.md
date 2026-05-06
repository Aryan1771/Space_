# Space_

Space_ is a Chromium-based desktop browser built with Electron, React, Tailwind, and TypeScript. It combines an Opera GX-inspired UI with Brave-style Shields, GX customization surfaces, AI sidebar tools, and performance controls.

## What Is Included

- Chromium-backed browsing through Electron.
- Opera GX-style browser chrome with a neon sidebar, tab strip, address bar, start page, editable Speed Dial, widgets, and GX-style feature panels.
- Brave-style Shields controls for ads, trackers, URL tracking cleanup, cookies, HTTPS upgrade, fingerprinting hardening, scripts, and consent blocking.
- Local Space_ pages for settings, mods, history, bookmarks, downloads, and extensions.
- Sidebar apps for local browser pages, notes, music, social apps, and AI tools.
- Theme presets: GX Red, Neon Green, Electric Blue, Cyber Yellow, Dark Mode, and Light Mode.
- GX Mods scaffold with local import/export for JSON mod manifests.
- GX Control scaffold for background tab behavior, suspension policy, network presets, and animation levels.
- Utilities for screenshots, cleaner actions, downloads, bookmarks, private tabs, auto Picture-in-Picture for playing videos, Wayback Machine, Speedreader, DevTools, Chrome Web Store browsing, and Load Unpacked developer extensions.

## License / EULA

Space_ is the property of SWD7. It is free and open-source software for personal, educational, and development use. You may inspect, modify, and share Space_ for free, but you may not sell it, redistribute it for money, charge money for redistribution, rent it, sublicense it for money, or misrepresent yourself as SWD7 or as the official owner of Space_.

The installer displays the full EULA from `installer/LICENSE.txt`.

## Feature Coverage

Space_ does not fake server-backed or OS-kernel features. Tor, VPN, cross-device sync, hard RAM caps, hard CPU caps, and remote mod marketplace are intentionally not shown as working features until real infrastructure exists.

| Area | Status | Notes |
| --- | --- | --- |
| Chromium browsing | Working | Real Electron Chromium BrowserViews render standard websites. |
| Tabs | Partial | New, close, restore, pin, drag reorder, detach, split view, and island metadata exist; collapsible island UI is still future work. |
| Speed Dial | Working | Add, edit, delete, recolor, favicon tiles, hover actions. |
| Local browser pages | Working | `space://settings`, `space://mods`, `space://history`, `space://bookmarks`, `space://downloads`, and `space://extensions`. |
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

## Browser Shortcuts

Space_ supports the normal daily browser shortcuts:

- `Ctrl+T` new tab, `Ctrl+Shift+T` restore closed tab, `Ctrl+W` close tab.
- `Ctrl+N` new window, `Ctrl+Shift+N` private window.
- `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle tabs, `Ctrl+1` through `Ctrl+8` select numbered tabs, `Ctrl+9` jumps to the last tab.
- `Alt+Left` / `Alt+Right` go back and forward. Hold or right-click the back/forward buttons to open tab history.
- `Ctrl+L` or `Alt+D` focuses the address bar, `Ctrl+R` or `F5` reloads.
- `Ctrl++`, `Ctrl+-`, `Ctrl+0`, and `Ctrl` + mouse wheel zoom pages.
- `Ctrl+D` bookmarks the current page, `Ctrl+H` opens History, `Ctrl+J` opens Downloads, `Ctrl+B` opens Bookmarks.
- `Ctrl+U` opens view source, `Ctrl+P` prints, `Ctrl+S` saves the current page, `F11` toggles fullscreen.
- Middle-click a tab to close it. Middle-click a normal page link to open it in a new tab.

## Code Signing

The installer build is ready for Windows Authenticode signing, but a trusted signature requires a real code-signing certificate issued to the publisher. A self-signed certificate will not build SmartScreen or antivirus trust for friends and public downloads.

Recommended path:

1. Buy an OV or EV Windows code-signing certificate for `SWD7` from a trusted CA.
2. Configure Electron Builder signing secrets with `CSC_LINK` and `CSC_KEY_PASSWORD`, or install the certificate in the Windows certificate store.
3. Rebuild with `npm run installer`.
4. Verify with:

```powershell
Get-AuthenticodeSignature release\Space_-Setup-0.1.0.exe
```

If the status is `NotSigned`, SmartScreen or antivirus products such as McAfee can still warn or quarantine the installer because the file has no trusted publisher reputation.

## Sharing Space_

For friends or public downloads, upload the installer:

```powershell
release\Space_-Setup-0.1.0.exe
```

For a portable ZIP, compress the entire folder below and share that ZIP:

```powershell
release\win-unpacked
```

Do not upload only `Space_.exe`; Electron apps need the files beside the executable. If sharing source code, upload the full repository except `node_modules`, then users can run `npm install` and `npm run installer`.

## Development

```powershell
npm install
npm run dev
```

## Production build

```powershell
npm run pack
```
