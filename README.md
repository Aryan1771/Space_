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
- Utilities for screenshots, cleaner actions, downloads, bookmarks, private tabs, and Tor/VPN/sync surfaces marked as future work.

## Run Space_

Double-click:

```powershell
run-space.bat
```

Or run from VS Code:

```powershell
npm install
npm run build
npm start
```

The VS Code task **Run Space_** builds and launches the Electron app.

## Development

```powershell
npm install
npm run dev
```

## Production build

```powershell
npm run build
npm start
```
