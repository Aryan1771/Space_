# Space_

Space_ is a Chromium-based desktop browser built with Electron, React, Tailwind, and TypeScript. It combines an Opera GX-inspired UI with Brave-style Shields, GX customization surfaces, AI sidebar tools, and performance controls.

## Implemented

- Electron Chromium pages, browser tabs and windows, and regular/private profiles.
- Browser controls and local pages for settings, history, bookmarks, downloads, extensions, and mods.
- Global and per-site ad/tracker filters using bundled EasyList and EasyPrivacy snapshots, plus per-site request counts in the native Shields menu.
- Third-party cookie blocking based on registrable domains, optional all-cookie blocking, HTTPS upgrades, and tracking-parameter cleanup.
- Six theme presets, a custom accent color, and validated local color mods.
- Passkeys are left available to Chromium websites. Space_ does not supply an independent password vault.

## License / EULA

Space_ is property of SWD7. Its source is available under the custom non-commercial terms in `installer/LICENSE.txt`. Free redistribution is allowed; selling Space_ or charging for its download or redistribution is prohibited. Because of this restriction, the license is source-available and is not OSI-approved open source.

The installer displays the full EULA from `installer/LICENSE.txt`.

## Feature Coverage

The feature table distinguishes implemented functionality from scaffolding. Tor, VPN, cross-device sync, hard RAM caps, hard CPU caps, and remote mod marketplace are intentionally not shown as working features until real infrastructure exists.

| Area | Status | Notes |
| --- | --- | --- |
| Shields | Implemented | Bundled EasyList/EasyPrivacy rules, per-site toggles, cookies, HTTPS upgrade, script blocking, and request counters. Fingerprint randomization and consent popup removal are not implemented. |
| Private windows | Implemented | Separate in-memory session per private window; history is not recorded, and its storage is cleared when closed. It does not provide network anonymity. |
| Mods | Limited | Theme presets and validated JSON color mods are supported. Opera GX wallpaper, shader, audio, and marketplace mods are not implemented. |
| Password manager | Not included | Passkeys use the platform in regular website tabs; Space_ does not manage or sync passwords. |
| Performance controls | Limited | Chromium background throttling is enabled. OS CPU/RAM caps and bandwidth limiting are not implemented. |
| Sign-in compatibility | Site-dependent | Removing spoofed browser identity and restoring WebAuthn avoids two app-created blockers. Some providers still reject embedded Chromium browsers; this cannot bypass a provider's policy. |
| Remaining GX/Brave features | Partial | Not all Opera GX and Brave features listed above are implemented. Verify the individual controls before relying on them. |

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
release\Space_-Setup-0.2.1.exe
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

## Code signing

The installer build is ready for Windows Authenticode signing, but a trusted signature requires a real code-signing certificate issued to the publisher. A self-signed certificate will not build SmartScreen or antivirus trust for public distribution.

Signing workflow:

1. Obtain a Windows code-signing certificate for the publisher through an appropriate certificate provider.
2. Configure Electron Builder signing secrets with `CSC_LINK` and `CSC_KEY_PASSWORD`, or install the certificate in the Windows certificate store.
3. Rebuild with `npm run installer`.
4. Verify with:

```powershell
Get-AuthenticodeSignature release\Space_-Setup-0.2.1.exe
```

If the status is `NotSigned`, SmartScreen or antivirus products such as McAfee can still warn or quarantine the installer because the file has no trusted publisher reputation.

## Sharing Space_

For friends or public downloads, upload the installer:

```powershell
release\Space_-Setup-0.2.1.exe
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
