# Safe GX Browser

A custom Python browser framework that avoids Chromium. It uses Python's standard library to fetch HTML, renders a reader-style page view in Tkinter, and adds a normal-browser shell with tabs, tab islands, an Opera GX-inspired sidebar, themes, and site safety verification.

## Current Features

- Custom non-Chromium HTML fetcher and reader renderer
- Browser-style navigation bar with back, forward, reload, home, address/search, and Go
- Google search as the default home/search provider
- Site verification badge:
  - Green tick: no obvious risk detected
  - Yellow warning: only low-risk findings detected
  - Red cross: risky, failed, or unsupported site
  - Unknown: loading or not scanned
- Opera GX-inspired sidebar
- Sidebar panels for safety, links, history, extensions, player placeholder, settings, and more
- Social shortcuts for ChatGPT, Twitch, WhatsApp, Discord, and Telegram
- Tabs with per-tab URL, history, page state, findings, and verification
- Tab islands that can be created from the right-click menu or by dragging one tab onto another
- Rename, collapse, expand, move-to-island, and ungroup island actions
- Theme presets: Opera Dark, Chrome Light, and System Default
- Custom theme editor with color fields and optional gradients
- Theme persistence in `browser_settings.json`

## Important Limitation

This browser does not run JavaScript and does not use a full browser engine. Many modern websites will appear simplified or may not work, especially social apps and complex login pages. That is intentional for this version: the goal is to build a custom framework first, then improve rendering and reputation data over time.

## Run

```bash
python main.py
```

No external Python packages are required.

## C++ Framework Prototype

The `cpp_browser` folder contains a C++17 prototype organized more like Chromium: browser shell, networking, content reader, and security scanning are separate modules.

Build it from PowerShell:

```powershell
cd cpp_browser
.\build.ps1
.\build\safe_gx_browser.exe
```

In VS Code:

- Open this repository folder.
- Press `Ctrl+Shift+B` and choose `Build Safe GX Browser C++`.
- Use `Terminal > Run Task > Run Safe GX Browser C++` to run it.
- Use `Run and Debug > Debug Safe GX Browser C++` to debug with GDB.

The VS Code setup uses the existing MSYS2 UCRT64 toolchain at `C:\msys64\ucrt64\bin`. Do not delete MSYS2 unless you replace it with another C++ compiler and update `.vscode` plus `cpp_browser/build.ps1`.

## Safety Model

The verification badge uses local heuristic checks. It currently looks for problems such as:

- Non-HTTPS pages
- Password fields or forms on insecure pages
- Suspicious brand impersonation domains
- Risky top-level domains
- URL shorteners
- IP-address websites
- Misleading link labels
- Scam-like urgency wording
- Heavy script or iframe usage
- Load failures and unsupported content types

The green tick means no obvious risk was detected by the current framework. It does not guarantee that a website is safe.

## Adding Safety Data Later

The scanning framework is separated from the UI:

- `BrowserExtension` adds checks.
- `Finding` describes a warning.
- `ScanResult` stores findings and the derived verification state.
- `VerificationState` is `safe`, `warning`, `risky`, or `unknown`.

Future reputation feeds, allowlists, blocklists, or AI classifiers can plug into this structure without changing the browser shell.
