# Space_

Space_ is a native C++ Windows browser shell with an Opera GX-inspired interface. It uses Microsoft WebView2 for real website compatibility, so normal sites such as Google, YouTube, ChatGPT, WhatsApp Web, Discord, Telegram, and Twitch render like they do in modern browsers.

The app itself is not Python. The window, sidebar, navigation chrome, icon handling, theme system, and panel behavior are implemented in C++/Win32.

## Features

- Native Windows C++ app named `Space_`
- Uses `assets/app.ico` for the executable and title bar icon
- Chromium/WebView2 page engine for modern website compatibility
- Opera GX-style left sidebar with custom drawn icons
- Social sidebar apps: ChatGPT, WhatsApp Web, Telegram, Discord, and Twitch
- Sidebar app panel with pin/unpin, reload, open-in-main-tab, and close controls
- Browser navigation bar with back, forward, reload, home, address field, Go, and Enter-to-search
- Google search from the address bar
- Safety badge that shows `Tick` for HTTPS pages and `Risk` for insecure or failed pages
- Multiple built-in themes: GX dark, GX red, neon green, and Chrome light
- VS Code build/run/debug tasks configured for MSVC

## Requirements

- Windows 10 or Windows 11
- Microsoft Edge WebView2 Runtime. Most Windows 10/11 systems already have it; if not, install the Evergreen Runtime from Microsoft.
- Visual Studio 2022 Community or Build Tools with `Desktop development with C++`

`build.ps1` downloads the WebView2 SDK into `deps/` automatically when missing. That folder is ignored by Git.

## Build And Run

From PowerShell in this repo:

```powershell
.\build.ps1
.\build\Space_.exe
```

In VS Code:

- Open `C:\Users\aryan\Documents\GitHub\WebBrowser`
- Press `Ctrl+Shift+B` to build
- Run `Terminal > Run Task > Run Space_`
- Or use `Run and Debug > Debug Space_`

## Notes

This version intentionally uses WebView2 so the browser is actually usable on normal websites today. Building a fully independent Chrome-level engine from scratch would require a complete HTML/CSS/JavaScript engine, networking stack, media pipeline, sandboxing, storage, accessibility, and years of work.
