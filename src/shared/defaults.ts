import type { AppSettings, ModManifest, ShieldConfig, SidebarApp } from "./types";

export const defaultShieldConfig: ShieldConfig = {
  ads: true,
  trackers: true,
  cookies: "block-third-party",
  fingerprinting: true,
  httpsUpgrade: true,
  scripts: false,
  consentBlock: true
};

export const defaultSettings: AppSettings = {
  theme: "gx-red",
  sidebarApps: [
    "settings",
    "mods",
    "history",
    "bookmarks",
    "downloads",
    "extensions",
    "notes",
    "music",
    "spotify",
    "chatgpt",
    "discord",
    "whatsapp",
    "telegram",
    "twitch",
    "youtube",
    "reddit",
    "claude",
    "gemini",
    "perplexity"
  ],
  customAiUrl: "https://chat.openai.com/",
  startPageWidgets: ["weather", "system", "news", "gaming-feed"],
  shieldDefaults: defaultShieldConfig,
  siteShieldRules: [],
  performanceProfile: {
    backgroundTabPolicy: "balanced",
    suspendThresholdMinutes: 20,
    throttleNetworkPreset: "off",
    animationLevel: "full"
  },
  downloadsPath: "",
  enableExperimentalExtensions: false,
  soundsEnabled: true,
  autoPictureInPicture: true,
  pictureInPictureOpacity: 0.92,
  forceDarkPages: false,
  forceDarkSiteRules: {},
  notes: [],
  hiddenSpeedDialIds: [],
  pinnedExtensions: [],
  speedDial: [
    { id: "google", title: "Google", url: "https://www.google.com" },
    { id: "youtube", title: "YouTube", url: "https://www.youtube.com" },
    { id: "twitch", title: "Twitch", url: "https://www.twitch.tv" },
    { id: "github", title: "GitHub", url: "https://github.com" }
  ]
};

export const sidebarApps: SidebarApp[] = [
  { id: "settings", name: "Settings", icon: "sliders-horizontal", url: "space://settings", type: "system", resizable: true, defaultPinned: true },
  { id: "mods", name: "Mods", icon: "wand-sparkles", url: "space://mods", type: "system", resizable: true, defaultPinned: false },
  { id: "history", name: "History", icon: "history", url: "space://history", type: "system", resizable: true, defaultPinned: false },
  { id: "bookmarks", name: "Bookmarks", icon: "star", url: "space://bookmarks", type: "system", resizable: true, defaultPinned: false },
  { id: "downloads", name: "Downloads", icon: "download", url: "space://downloads", type: "system", resizable: true, defaultPinned: false },
  { id: "extensions", name: "Extensions", icon: "puzzle", url: "space://extensions", type: "system", resizable: true, defaultPinned: false },
  { id: "notes", name: "Notes", icon: "notebook-tabs", url: "space://notes", type: "system", resizable: true, defaultPinned: false },
  { id: "music", name: "Music", icon: "music-4", url: "https://music.youtube.com", type: "system", resizable: true, defaultPinned: false },
  { id: "spotify", name: "Spotify", icon: "music-4", url: "https://open.spotify.com", type: "social", resizable: true, defaultPinned: true },
  { id: "discord", name: "Discord", icon: "message-circle-more", url: "https://discord.com/app", type: "social", resizable: true, defaultPinned: true },
  { id: "whatsapp", name: "WhatsApp", icon: "messages-square", url: "https://web.whatsapp.com", type: "social", resizable: true, defaultPinned: true },
  { id: "telegram", name: "Telegram", icon: "send", url: "https://web.telegram.org", type: "social", resizable: true, defaultPinned: true },
  { id: "instagram", name: "Instagram", icon: "instagram", url: "https://www.instagram.com", type: "social", resizable: true, defaultPinned: false },
  { id: "x", name: "X", icon: "at-sign", url: "https://x.com", type: "social", resizable: true, defaultPinned: false },
  { id: "twitch", name: "Twitch", icon: "gamepad-2", url: "https://www.twitch.tv", type: "social", resizable: true, defaultPinned: true },
  { id: "youtube", name: "YouTube", icon: "play-square", url: "https://www.youtube.com", type: "social", resizable: true, defaultPinned: true },
  { id: "reddit", name: "Reddit", icon: "panel-right-open", url: "https://www.reddit.com", type: "social", resizable: true, defaultPinned: false },
  { id: "chatgpt", name: "ChatGPT", icon: "sparkles", url: "https://chat.openai.com", type: "ai", resizable: true, defaultPinned: true },
  { id: "claude", name: "Claude", icon: "bot", url: "https://claude.ai", type: "ai", resizable: true, defaultPinned: true },
  { id: "gemini", name: "Gemini", icon: "stars", url: "https://gemini.google.com", type: "ai", resizable: true, defaultPinned: true },
  { id: "perplexity", name: "Perplexity", icon: "orbit", url: "https://www.perplexity.ai", type: "ai", resizable: true, defaultPinned: true }
];

export const builtInMods: ModManifest[] = [
  {
    id: "gx-red-default",
    name: "GX Red",
    version: "1.0.0",
    author: "Space_",
    description: "Default red neon profile.",
    themeTokens: {
      accent: "#ff355e",
      accentAlt: "#ff7a8f",
      bg: "#09070d"
    },
    shaders: ["glow", "scanlines"]
  },
  {
    id: "electric-blue-default",
    name: "Electric Blue",
    version: "1.0.0",
    author: "Space_",
    description: "High-voltage blue glow.",
    themeTokens: {
      accent: "#3f8cff",
      accentAlt: "#8bc3ff",
      bg: "#07101f"
    },
    shaders: ["glow"]
  }
];
