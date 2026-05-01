# Space_

This repository has been reset to build a browser from its own base instead of depending on Chromium, WebKit, Gecko, Qt WebEngine, or an embedded browser control.

The current version is a C++17 browser-engine foundation with a native Windows UI inspired by Opera GX. It fetches pages, tokenizes HTML, builds a small DOM, creates a simple layout tree, paints a readable page view, and marks pages with a safety status.

## Current State

This is not yet a Chrome-level browser. A browser that runs all modern websites normally needs:

- HTML parser and DOM
- CSS parser, cascade, layout, and painting
- JavaScript engine and Web APIs
- Event loop and timers
- Networking, cookies, cache, storage, permissions, and sandboxing
- Media, canvas, fonts, accessibility, downloads, extensions, and GPU rendering

This repo now starts that work cleanly. The next milestones should be a native GUI window, CSS block layout, then JavaScript.

## Build

```powershell
.\build.ps1
.\build\Space_.exe
```

## App Icon

Add your Windows icon at:

```text
assets/app.ico
```

When that file exists, `build.ps1` embeds it into `build/Space_.exe`. The code also includes an `AppIcon::apply_to_window(HWND)` helper so the same icon can be applied to the native title bar when the GUI window layer is added.

In VS Code:

- Open this repository folder.
- Press `Ctrl+Shift+B` to build.
- Run `Terminal > Run Task > Run Space_`.
- Use `Run and Debug > Debug Space_`.

## UI

- Left sidebar inspired by Opera GX
- Custom-drawn sidebar icons instead of text labels
- Tab strip with new-tab button
- Browser navigation bar with back, forward, reload, home, address, safety badge, and Go
- Hideable right panel with safety, extensions, settings, history, and links views
- Multiple built-in themes: Opera GX, GX Red, Neon Green, and Chrome Light
- Click `GX` in the sidebar to cycle themes
- Settings panel can cycle themes and hide the panel
- History panel can open entries, delete individual entries, or clear full tab history
- Links panel can open discovered page links
- Uses `assets/app.ico` for the executable and title-bar icon

Google is the default search provider. The current engine does not yet implement the full CSS/JavaScript/Web API stack that Google's normal browser interface needs, so Google may show a simplified fallback page. The tick/cross is calculated for each loaded website from the safety scanner, not from Google itself.

## Architecture

- `src/main.cpp` contains the native UI shell and all first-pass engine modules.
- `NetworkService` fetches pages through Windows networking APIs loaded dynamically.
- `HtmlTokenizer` converts HTML into tokens.
- `HtmlTreeBuilder` builds a minimal DOM.
- `LayoutEngine` creates readable lines from the DOM.
- `SafetyScanner` returns `Safe`, `Warning`, `Risky`, or `Unknown`.
- `BrowserShell` owns navigation history and user commands.

The code is intentionally dependency-light so the base stays ours.
