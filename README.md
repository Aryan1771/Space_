# Space_

Space_ is a Chromium-based desktop browser built with Electron, React, Tailwind, and TypeScript. It combines an Opera GX-inspired UI with Brave-style Shields, GX customization surfaces, AI sidebar tools, and performance controls.

## What Is Included

- Chromium-backed browsing through Electron.
- Opera GX-style browser chrome with a neon sidebar, tab strip, address bar, start page, speed dial, widgets, and GX-style feature panels.
- Brave-style Shields controls for ads, trackers, cookies, HTTPS upgrade, fingerprinting hardening, scripts, and consent blocking.
- Sidebar apps for settings, history, bookmarks, downloads, notes, music, social apps, and AI tools.
- Theme presets: GX Red, Neon Green, Electric Blue, Cyber Yellow, Dark Mode, and Light Mode.
- GX Mods scaffold with local import/export for JSON mod manifests.
- GX Control scaffold for background tab behavior, suspension policy, network presets, and animation levels.
- Utilities for screenshots, cleaner actions, downloads, bookmarks, private tabs, auto Picture-in-Picture for playing videos, and Tor/VPN/sync surfaces marked as future work.

## Run Space_

For a normal Windows app launch, use the packaged executable after building:

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
