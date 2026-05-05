import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  BadgeCheck,
  Bot,
  Bookmark,
  BrainCircuit,
  Brush,
  CircleUserRound,
  Clock3,
  Code2,
  Cookie,
  Cpu,
  Download,
  ExternalLink,
  Eye,
  Fingerprint,
  Gamepad2,
  Gauge,
  History,
  Home,
  Camera,
  Languages,
  LayoutDashboard,
  MessageCircleMore,
  MessagesSquare,
  MonitorPlay,
  MousePointer2,
  Music4,
  Network,
  NotebookTabs,
  Orbit,
  PackageOpen,
  Palette,
  PanelLeft,
  PanelRightOpen,
  Pin,
  PlaySquare,
  Plus,
  Puzzle,
  RefreshCcw,
  Search,
  Send,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  SplitSquareHorizontal,
  Star,
  Store,
  Trash2,
  Volume2,
  WandSparkles,
  Wallpaper,
  CloudSun,
  X,
  Zap
} from "lucide-react";
import { sidebarApps } from "@shared/defaults";
import type { AppSettings, BrowserStateSnapshot, TabRecord, ThemeId } from "@shared/types";

const emptyState: BrowserStateSnapshot = {
  tabs: [],
  activeTabId: null,
  bookmarks: [],
  history: [],
  downloads: [],
  settings: {
    theme: "gx-red",
    sidebarApps: [],
    customAiUrl: "https://chat.openai.com",
    startPageWidgets: [],
    shieldDefaults: {
      ads: true,
      trackers: true,
      cookies: "block-third-party",
      fingerprinting: true,
      httpsUpgrade: true,
      scripts: false,
      consentBlock: true
    },
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
    notes: [],
    speedDial: []
  },
  sidebarOpen: false,
  sidebarPinned: false,
  activeSidebarAppId: null,
  utilityDockOpen: false
};

const themeClassMap: Record<ThemeId, string> = {
  "gx-red": "theme-gx-red",
  "neon-green": "theme-neon-green",
  "electric-blue": "theme-electric-blue",
  "cyber-yellow": "theme-cyber-yellow",
  dark: "theme-dark",
  light: "theme-light"
};

const themeOptions: Array<{ id: ThemeId; name: string; hint: string }> = [
  { id: "gx-red", name: "GX Red", hint: "Default red neon" },
  { id: "neon-green", name: "Neon Green", hint: "Matrix glow" },
  { id: "electric-blue", name: "Electric Blue", hint: "Clean cyber blue" },
  { id: "cyber-yellow", name: "Cyber Yellow", hint: "High contrast" },
  { id: "dark", name: "Dark Mode", hint: "Quiet focus" },
  { id: "light", name: "Light Mode", hint: "Daylight chrome" }
];

const featureGroups: Array<{ title: string; Icon: LucideIcon; status: string; items: string[] }> = [
  {
    title: "Core Browser",
    Icon: LayoutDashboard,
    status: "Chromium tabs",
    items: ["Tab islands", "Pin tabs", "Tab preview", "Split screen", "Tab search", "Workspaces"]
  },
  {
    title: "Brave-Style Shields",
    Icon: ShieldCheck,
    status: "On by default",
    items: ["Ads", "Trackers", "Cookies", "HTTPS upgrade", "Scripts", "Consent filters"]
  },
  {
    title: "GX Mods",
    Icon: WandSparkles,
    status: "Local mods",
    items: ["Colors", "Sounds", "Cursors", "Shaders", "Wallpapers", "Import/export"]
  },
  {
    title: "Sidebar Apps",
    Icon: PanelLeft,
    status: "Resizable",
    items: ["Settings", "History", "Downloads", "Notes", "Music", "Social + AI panels"]
  },
  {
    title: "GX Control",
    Icon: Gauge,
    status: "Behavior controls",
    items: ["Tab sleep", "Timer throttling", "Network presets", "Animation levels", "Private sessions"]
  },
  {
    title: "AI Tools",
    Icon: BrainCircuit,
    status: "Sidebar powered",
    items: ["Summarize", "Explain", "Rewrite", "Translate", "Generate code", "Custom AI URL"]
  },
  {
    title: "Utilities",
    Icon: Puzzle,
    status: "Built in",
    items: ["Screenshot", "GX Cleaner", "Video pop-out", "Downloads", "Chrome extensions", "Sync scaffold"]
  },
  {
    title: "Future Rails",
    Icon: Network,
    status: "Truthful v1",
    items: ["VPN scaffold", "Tor unavailable", "Sync unavailable", "Marketplace scaffold", "Extension experiment"]
  }
];

const settingsSections = [
  "Appearance",
  "Themes",
  "Mods",
  "Sounds",
  "Sidebar",
  "Home Page",
  "Tabs",
  "Privacy",
  "Performance",
  "AI",
  "Advanced"
];

type UtilityPanel = "all" | "shields" | "tabs" | "history" | "performance" | "ai" | "utilities" | "settings";

const defaultSpeedDial = [
  { id: "speedtest", title: "Speedtest", url: "https://www.speedtest.net", color: "#ffffff" },
  { id: "reddit", title: "reddit", url: "https://www.reddit.com", color: "#ffffff" },
  { id: "keybr", title: "keybr.com", url: "https://www.keybr.com", color: "#e41313" },
  { id: "stackoverflow", title: "stackoverflow", url: "https://stackoverflow.com", color: "#ffffff" },
  { id: "youtube", title: "youtube.com", url: "https://www.youtube.com", color: "#f0191f" },
  { id: "google", title: "Google", url: "https://www.google.com", color: "#ffffff" },
  { id: "gmail", title: "Gmail", url: "https://mail.google.com", color: "#ffffff" },
  { id: "outlook", title: "outlook.live.com", url: "https://outlook.live.com", color: "#38a8e8" },
  { id: "hackerrank", title: "hackerrank.com", url: "https://www.hackerrank.com", color: "#f5f6f9" },
  { id: "leetcode", title: "leetcode.com", url: "https://leetcode.com", color: "#f5f6f9" },
  { id: "wikipedia", title: "Wikipedia", url: "https://www.wikipedia.org", color: "#ffffff" },
  { id: "spotify", title: "Spotify", url: "https://open.spotify.com", color: "#ffffff" },
  { id: "mega", title: "mega.io", url: "https://mega.io", color: "#f05a44" },
  { id: "xbox", title: "XBOX", url: "https://www.xbox.com", color: "#ffffff" },
  { id: "replit", title: "replit.com", url: "https://replit.com", color: "#f5f6f9" },
  { id: "hackernews", title: "news.ycombinator", url: "https://news.ycombinator.com", color: "#ff7a00" },
  { id: "pinterest", title: "Pinterest", url: "https://www.pinterest.com", color: "#ffffff" },
  { id: "github", title: "GitHub", url: "https://github.com", color: "#ffffff" },
  { id: "chess", title: "chess.com", url: "https://www.chess.com", color: "#24a853" },
  { id: "amazon", title: "amazon", url: "https://www.amazon.com", color: "#ff9900" },
  { id: "steam", title: "STEAM", url: "https://store.steampowered.com", color: "#ffffff" }
];

export function App() {
  const [snapshot, setSnapshot] = useState<BrowserStateSnapshot>(emptyState);
  const [address, setAddress] = useState("https://www.google.com");
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const [tabSearch, setTabSearch] = useState("");
  const [activeUtilityPanel, setActiveUtilityPanel] = useState<UtilityPanel>("all");

  useEffect(() => {
    window.space.getSnapshot().then((data) => {
      setSnapshot(data);
      const active = data.tabs.find((tab: TabRecord) => tab.id === data.activeTabId);
      setAddress(active?.url ?? "https://www.google.com");
    });
    return window.space.onSnapshot((data: BrowserStateSnapshot) => {
      setSnapshot(data);
      const active = data.tabs.find((tab: TabRecord) => tab.id === data.activeTabId);
      if (active) setAddress(active.url);
    });
  }, []);

  const activeTab = snapshot.tabs.find((tab) => tab.id === snapshot.activeTabId) ?? null;
  const filteredTabs = useMemo(() => {
    const value = tabSearch.trim().toLowerCase();
    if (!value) return snapshot.tabs;
    return snapshot.tabs.filter((tab) => `${tab.title} ${tab.url}`.toLowerCase().includes(value));
  }, [snapshot.tabs, tabSearch]);

  const activeSidebarApp = sidebarApps.find((app) => app.id === snapshot.activeSidebarAppId) ?? null;
  const sidebarAppGroups = useMemo(
    () => [
      { label: "System", items: sidebarApps.filter((app) => app.type === "system" && snapshot.settings.sidebarApps.includes(app.id)) },
      { label: "Social", items: sidebarApps.filter((app) => app.type === "social" && snapshot.settings.sidebarApps.includes(app.id)) },
      { label: "AI", items: sidebarApps.filter((app) => app.type === "ai" && snapshot.settings.sidebarApps.includes(app.id)) }
    ],
    [snapshot.settings.sidebarApps]
  );

  async function navigate() {
    if (!activeTab) return;
    await window.space.navigate(activeTab.id, address);
  }

  async function patchSettings(patch: Partial<AppSettings>) {
    await window.space.patchSettings(patch);
  }

  async function patchPerformance(patch: Partial<AppSettings["performanceProfile"]>) {
    await patchSettings({ performanceProfile: { ...snapshot.settings.performanceProfile, ...patch } });
  }

  async function toggleUtilityPanel(panel: UtilityPanel) {
    const shouldOpen = !(snapshot.utilityDockOpen && activeUtilityPanel === panel);
    setActiveUtilityPanel(panel);
    await window.space.setUtilityDockOpen(shouldOpen);
  }

  const showUtilityPanel = (panel: UtilityPanel) => activeUtilityPanel === "all" || activeUtilityPanel === panel;

  return (
    <div className={`app-shell ${themeClassMap[snapshot.settings.theme]}`}>
      <div className="backdrop-grid" />
      <aside className="space-sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">S_</div>
          <div>
            <div className="brand-title">Space_</div>
            <div className="brand-subtitle">GX + Shields</div>
          </div>
        </div>

        <div className="sidebar-section">
          {sidebarAppGroups.map((group) => (
            <div className="sidebar-group" key={group.label}>
              <div className="rail-group-label">{group.label}</div>
              {group.items.map((app) => {
                const Icon = iconComponent(app.icon);
                return (
              <button
                key={app.id}
                className={`sidebar-app ${snapshot.activeSidebarAppId === app.id ? "active" : ""}`}
                title={app.name}
                aria-label={app.name}
                onClick={() => void window.space.openSidebarApp(app.id)}
              >
                    <span className="sidebar-app-icon">
                      <Icon size={21} strokeWidth={2.2} />
                    </span>
                    <span className="sidebar-app-label">{app.name}</span>
              </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <button className="ghost-button" onClick={() => void patchSettings({ theme: nextTheme(snapshot.settings.theme) })}>
            <Palette size={18} />
          </button>
          <button className="ghost-button" onClick={() => void window.space.tabAction("private-window")}>
            <Shield size={18} />
          </button>
        </div>
      </aside>

      {snapshot.sidebarOpen && (
        <div className={`sidebar-panel-toolbar ${snapshot.sidebarPinned ? "docked" : "overlay"}`} style={{ left: 64, width: sidebarWidth }}>
          <div className="sidebar-panel-title">
            <strong>{activeSidebarApp?.name ?? "Panel"}</strong>
            <span>{snapshot.sidebarPinned ? "Docked" : "Overlay"}</span>
          </div>
          <input
            type="range"
            min={320}
            max={520}
            value={sidebarWidth}
            onChange={(event) => {
              const value = Number(event.target.value);
              setSidebarWidth(value);
              void window.space.resizeSidebar(value, snapshot.sidebarPinned);
            }}
            title="Resize panel"
          />
          <div className="sidebar-toolbar-actions">
            <button onClick={() => void window.space.tabAction("toggle-sidebar-pin")} title={snapshot.sidebarPinned ? "Unpin panel" : "Pin panel"}>
              <Pin size={16} />
            </button>
            <button onClick={() => void window.space.tabAction("close-sidebar")} title="Close panel">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <main className="browser-chrome" style={{ marginLeft: snapshot.sidebarOpen && snapshot.sidebarPinned ? sidebarWidth : 0 }}>
        <header className="top-chrome">
          <div className="window-title-row">
            <div className="window-title">Space_ - {activeTab?.title ?? "New Tab"}</div>
            <div className="window-controls-placeholder">GX Workspace Alpha</div>
          </div>

          <div className="tab-strip">
            <div className="tab-cluster">
              {snapshot.tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`tab-pill ${tab.id === snapshot.activeTabId ? "active" : ""} ${tab.isPinned ? "pinned" : ""}`}
                  onClick={() => void window.space.tabAction("activate", { tabId: tab.id })}
                >
                  <span className="tab-title">{tab.title}</span>
                  <span className="tab-actions">
                  <span className="tab-meta">{tab.isPinned ? "PIN" : tab.isSplitParticipant ? "SPLIT" : tab.isSuspended ? "SLEEP" : tab.islandId ?? "WEB"}</span>
                    <span
                      className="tab-close"
                      role="button"
                      title="Close tab"
                      onClick={(event) => {
                        event.stopPropagation();
                        void window.space.tabAction("close", { tabId: tab.id });
                      }}
                    >
                      <X size={14} />
                    </span>
                  </span>
                </button>
              ))}
            </div>
              <button className="new-tab-button" onClick={() => void window.space.tabAction("new")}>
              <Plus size={19} />
            </button>
          </div>

          <div className="toolbar">
            <div className="toolbar-actions">
              <button className="circle-button" onClick={() => activeTab && void window.space.tabAction("back", { tabId: activeTab.id })}>
                <ArrowLeft size={18} />
              </button>
              <button className="circle-button" onClick={() => activeTab && void window.space.tabAction("forward", { tabId: activeTab.id })}>
                <ArrowRight size={18} />
              </button>
              <button className="circle-button" onClick={() => activeTab && void window.space.tabAction("reload", { tabId: activeTab.id })}>
                <RefreshCcw size={18} />
              </button>
              <button className="circle-button" onClick={() => activeTab && void window.space.navigate(activeTab.id, "https://www.google.com")}>
                <Home size={18} />
              </button>
            </div>

            <div className="address-shell">
              <button className={`shield-pill ${activeTab?.shieldState.httpsUpgrade ? "on" : "off"}`} onClick={() => void toggleUtilityPanel("shields")}>
                <span className="shield-click-zone">
                <ShieldCheck size={17} />
                Shields
                </span>
              </button>
              <input value={address} onChange={(event) => setAddress(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void navigate()} />
              <button
                className={`toolbar-utility ${snapshot.settings.autoPictureInPicture ? "active" : ""}`}
                onClick={() => activeTab && void window.space.requestPictureInPicture(activeTab.id)}
                title="Pop out playing video"
              >
                <MonitorPlay size={18} />
              </button>
              <button className="toolbar-utility" onClick={() => activeTab && void window.space.toggleBookmark?.(activeTab.id)}>
                <Star size={18} />
              </button>
              <button className="toolbar-utility" onClick={() => void window.space.openSidebarApp("downloads")}>
                <Download size={18} />
              </button>
              <button className="toolbar-utility" onClick={() => void window.space.openSidebarApp("settings")}>
                <CircleUserRound size={18} />
              </button>
              <button className={`toolbar-utility ${snapshot.utilityDockOpen ? "active" : ""}`} onClick={() => void toggleUtilityPanel("all")} title="Toggle right controls">
                <PanelRightOpen size={18} />
              </button>
            </div>

            <button className="go-button" onClick={() => void navigate()}>
              Go
            </button>
          </div>
        </header>

        <section className={`workspace-body ${snapshot.utilityDockOpen ? "with-utility" : "utility-collapsed"}`}>
          <div className="start-surface">
            <section className="gx-home">
              <div className="gx-search-card">
                <div className="search-provider-mark">G</div>
                <input
                  value={address === "space://start" ? "" : address}
                  onChange={(event) => setAddress(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && void navigate()}
                  placeholder="Search the web"
                />
              </div>

              <div className="home-widgets">
                <button className="profile-widget">
                  <div className="widget-avatar">S_</div>
                  <strong>Aryboss1234</strong>
                  <span>GX ME</span>
                </button>
                <button className="weather-widget">
                  <CloudSun size={28} />
                  <strong>28 C</strong>
                  <span>Ghaziabad</span>
                </button>
              </div>

              <div className="speed-dial-wall">
                {[...defaultSpeedDial, ...snapshot.settings.speedDial.filter((entry) => !defaultSpeedDial.some((dial) => dial.url === entry.url))].map((entry) => {
                  const tileColor = "color" in entry && typeof entry.color === "string" ? entry.color : "#ffffff";
                  return (
                  <button
                    key={entry.id}
                    className="gx-dial"
                    style={{ "--tile": tileColor } as React.CSSProperties}
                    onClick={() => activeTab && void window.space.navigate(activeTab.id, entry.url)}
                  >
                    <span>{entry.title}</span>
                  </button>
                  );
                })}
              </div>
            </section>

            <div className="settings-preview-strip">
              {featureGroups.slice(0, 4).map(({ title, Icon }) => (
                <button key={title} onClick={() => void toggleUtilityPanel(title.includes("Shields") ? "shields" : "settings")}>
                  <Icon size={18} />
                  {title}
                </button>
              ))}
            </div>

            <div className="content-grid start-secondary">
              <section className="glass-panel">
                <div className="panel-header">
                  <h2>Speed Dial</h2>
                  <span>{snapshot.settings.speedDial.length} shortcuts</span>
                </div>
                <div className="speed-dial-grid">
                  {snapshot.settings.speedDial.map((entry) => (
                    <button key={entry.id} className="dial-card" onClick={() => activeTab && void window.space.navigate(activeTab.id, entry.url)}>
                      <div className="dial-badge">{entry.title.slice(0, 1)}</div>
                      <strong>{entry.title}</strong>
                      <span>{entry.url}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="glass-panel">
                <div className="panel-header">
                  <h2>GX Corner</h2>
                  <span>Gaming feed</span>
                </div>
                <div className="feed-list">
                  <article className="feed-card">
                    <strong>Daily drop</strong>
                    <p>Launch titles, bundle deals, and hardware promos belong here in the live feed integration.</p>
                  </article>
                  <article className="feed-card">
                    <strong>Live wallpaper</strong>
                    <p>Video backgrounds, shader overlays, and mood presets are scaffolded into the mod system.</p>
                  </article>
                </div>
              </section>

              <section className="glass-panel">
                <div className="panel-header">
                  <h2>Widgets</h2>
                  <span>Weather, stats, news</span>
                </div>
                <div className="widget-stack">
                  <div className="widget-card">
                    <span>System load</span>
                    <strong>{snapshot.settings.performanceProfile.backgroundTabPolicy.toUpperCase()}</strong>
                  </div>
                  <div className="widget-card">
                    <span>Shields</span>
                    <strong>{snapshot.settings.shieldDefaults.ads ? "ARMED" : "MANUAL"}</strong>
                  </div>
                  <div className="widget-card">
                    <span>Mods</span>
                    <strong>LOCAL + BUILT-IN</strong>
                  </div>
                </div>
              </section>
            </div>

            <div className="customization-grid start-secondary">
              <section className="glass-panel">
                <div className="panel-header">
                  <h2>Themes</h2>
                  <span>Built-in presets</span>
                </div>
                <div className="theme-grid">
                  {themeOptions.map((theme) => (
                    <button
                      className={`theme-card ${snapshot.settings.theme === theme.id ? "active" : ""} theme-swatch-${theme.id}`}
                      key={theme.id}
                      onClick={() => void patchSettings({ theme: theme.id })}
                    >
                      <span>{theme.name}</span>
                      <strong>{theme.hint}</strong>
                    </button>
                  ))}
                </div>
              </section>

              <section className="glass-panel">
                <div className="panel-header">
                  <h2>Mod Everything</h2>
                  <span>Local GX mod system</span>
                </div>
                <div className="mod-grid">
                  {[
                    ["Colors", Brush],
                    ["Sounds", Volume2],
                    ["Cursors", MousePointer2],
                    ["Shaders", Zap],
                    ["Wallpapers", Wallpaper],
                    ["Marketplace", Store]
                  ].map(([label, Icon]) => {
                    const ModIcon = Icon as LucideIcon;
                    return (
                      <button className="mod-tile" key={String(label)}>
                        <ModIcon size={20} />
                        <span>{String(label)}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="inline-actions">
                  <button onClick={() => void window.space.importMods()}>
                    <PackageOpen size={17} />
                    Import
                  </button>
                  <button onClick={() => void window.space.exportMods()}>
                    <Download size={17} />
                    Export
                  </button>
                </div>
              </section>
            </div>
          </div>

          {snapshot.utilityDockOpen ? (
          <div className={`utility-dock panel-${activeUtilityPanel}`}>
            <div className="utility-dock-header">
              <strong>{activeUtilityPanel === "all" ? "Controls" : panelTitle(activeUtilityPanel)}</strong>
              <button onClick={() => void window.space.setUtilityDockOpen(false)} title="Collapse right controls">
                <X size={16} />
              </button>
            </div>
            {showUtilityPanel("shields") && (
            <section className="glass-panel compact">
              <div className="panel-header">
                <h2>Shields</h2>
                <span>Per-site control</span>
              </div>
              <div className="toggle-grid">
                {renderShieldToggle("Ads", snapshot.settings.shieldDefaults.ads, (value) => window.space.setGlobalShields({ ads: value }))}
                {renderShieldToggle("Trackers", snapshot.settings.shieldDefaults.trackers, (value) => window.space.setGlobalShields({ trackers: value }))}
                {renderShieldToggle("HTTPS", snapshot.settings.shieldDefaults.httpsUpgrade, (value) => window.space.setGlobalShields({ httpsUpgrade: value }))}
                {renderShieldToggle("Cookies", snapshot.settings.shieldDefaults.cookies !== "allow", (value) =>
                  window.space.setGlobalShields({ cookies: value ? "block-third-party" : "allow" })
                )}
                {renderShieldToggle("Fingerprint", snapshot.settings.shieldDefaults.fingerprinting, (value) =>
                  window.space.setGlobalShields({ fingerprinting: value })
                )}
                {renderShieldToggle("Scripts", snapshot.settings.shieldDefaults.scripts, (value) => window.space.setGlobalShields({ scripts: value }))}
              </div>
            </section>
            )}

            {showUtilityPanel("tabs") && (
            <section className="glass-panel compact">
              <div className="panel-header">
                <h2>Tabs</h2>
                <span>Search and islands</span>
              </div>
              <input className="embedded-input" placeholder="Search open tabs" value={tabSearch} onChange={(event) => setTabSearch(event.target.value)} />
              <div className="tab-search-results">
                {filteredTabs.slice(0, 6).map((tab) => (
                  <button key={tab.id} className="search-result" onClick={() => void window.space.tabAction("activate", { tabId: tab.id })}>
                    <strong>{tab.title}</strong>
                    <span>{tab.url}</span>
                  </button>
                ))}
              </div>
              <div className="inline-actions">
                <button onClick={() => activeTab && void window.space.tabAction("pin", { tabId: activeTab.id })}>
                  <Pin size={17} />
                  Pin
                </button>
                <button onClick={() => activeTab && void window.space.tabAction("split", { tabId: activeTab.id })}>
                  <SplitSquareHorizontal size={17} />
                  Split
                </button>
              </div>
            </section>
            )}

            {showUtilityPanel("history") && (
            <section className="glass-panel compact">
              <div className="panel-header">
                <h2>History</h2>
                <span>{snapshot.history.length} saved</span>
              </div>
              <div className="mini-list">
                {snapshot.history.slice(0, 4).map((entry) => (
                  <div className="mini-row" key={entry.id}>
                    <button onClick={() => activeTab && void window.space.navigate(activeTab.id, entry.url)}>
                      <strong>{entry.title}</strong>
                      <span>{entry.url}</span>
                    </button>
                    <button className="icon-danger" title="Delete history item" onClick={() => void window.space.deleteHistory(entry.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {snapshot.history.length === 0 && <div className="empty-note">No browsing history yet.</div>}
              </div>
              <div className="inline-actions">
                <button onClick={() => void window.space.openSidebarApp("history")}>
                  <History size={17} />
                  Open
                </button>
                <button onClick={() => void window.space.clearHistory()}>
                  <Trash2 size={17} />
                  Clear All
                </button>
              </div>
            </section>
            )}

            {showUtilityPanel("performance") && (
            <section className="glass-panel compact">
              <div className="panel-header">
                <h2>GX Control</h2>
                <span>{snapshot.settings.performanceProfile.backgroundTabPolicy}</span>
              </div>
              <div className="profile-buttons">
                {(["balanced", "limit", "aggressive"] as const).map((policy) => (
                  <button
                    key={policy}
                    className={snapshot.settings.performanceProfile.backgroundTabPolicy === policy ? "active" : ""}
                    onClick={() => void patchPerformance({ backgroundTabPolicy: policy })}
                  >
                    <Cpu size={17} />
                    {policy}
                  </button>
                ))}
              </div>
              <div className="metric-strip">
                <span>Sleep after {snapshot.settings.performanceProfile.suspendThresholdMinutes}m</span>
                <span>Network {snapshot.settings.performanceProfile.throttleNetworkPreset}</span>
              </div>
            </section>
            )}

            {showUtilityPanel("ai") && (
            <section className="glass-panel compact">
              <div className="panel-header">
                <h2>AI Actions</h2>
                <span>Active page</span>
              </div>
              <div className="tool-grid">
                {[
                  ["summarize", Sparkles],
                  ["explain", Eye],
                  ["rewrite", WandSparkles],
                  ["translate", Languages],
                  ["code", Code2]
                ].map(([action, Icon]) => {
                  const ActionIcon = Icon as LucideIcon;
                  return (
                    <button className="tool-button" key={String(action)} onClick={() => void window.space.runAiAction({ action: action as any, providerId: "chatgpt" })}>
                      <ActionIcon size={17} />
                      {String(action)}
                    </button>
                  );
                })}
              </div>
            </section>
            )}

            {showUtilityPanel("utilities") && (
            <section className="glass-panel compact">
              <div className="panel-header">
                <h2>Utilities</h2>
                <span>Browser tools</span>
              </div>
              <div className="tool-grid">
                <button className="tool-button" onClick={() => activeTab && void window.space.requestPictureInPicture(activeTab.id)}>
                  <MonitorPlay size={17} />
                  Video Pop-out
                </button>
                <button
                  className={`tool-button ${snapshot.settings.autoPictureInPicture ? "active" : ""}`}
                  onClick={() => void patchSettings({ autoPictureInPicture: !snapshot.settings.autoPictureInPicture })}
                >
                  <PlaySquare size={17} />
                  Auto PiP {snapshot.settings.autoPictureInPicture ? "ON" : "OFF"}
                </button>
                <button className="tool-button" onClick={() => void window.space.takeScreenshot()}>
                  <Camera size={17} />
                  Screenshot
                </button>
                <button className="tool-button" onClick={() => void window.space.runCleaner(["cache", "cookies", "storage"])}>
                  <Trash2 size={17} />
                  Cleaner
                </button>
                <button className="tool-button" onClick={() => void window.space.openSidebarApp("music")}>
                  <Music4 size={17} />
                  Music
                </button>
                <button className="tool-button" onClick={() => void window.space.tabAction("tor-window")}>
                  <Shield size={17} />
                  Tor
                </button>
              </div>
              <div className="metric-strip">
                <span>Transparent PiP opacity {Math.round((snapshot.settings.pictureInPictureOpacity ?? 0.92) * 100)}%</span>
                <span>Auto opens when leaving a playing video tab</span>
              </div>
            </section>
            )}

            {showUtilityPanel("settings") && (
            <section className="glass-panel compact">
              <div className="panel-header">
                <h2>Settings</h2>
                <span>{settingsSections.length} sections</span>
              </div>
              <div className="settings-chip-grid">
                {settingsSections.map((section) => (
                  <button key={section} onClick={() => void window.space.openSidebarApp("settings")}>
                    {section}
                  </button>
                ))}
              </div>
            </section>
            )}
          </div>
          ) : (
            <button className="right-dock-peek" onClick={() => void toggleUtilityPanel("all")} title="Open controls">
              <PanelRightOpen size={18} />
            </button>
          )}
        </section>
      </main>
    </div>
  );
}

function panelTitle(panel: UtilityPanel) {
  const titles: Record<UtilityPanel, string> = {
    all: "Controls",
    shields: "Shields",
    tabs: "Tabs",
    history: "History",
    performance: "GX Control",
    ai: "AI Actions",
    utilities: "Utilities",
    settings: "Settings"
  };
  return titles[panel];
}

function nextTheme(theme: ThemeId): ThemeId {
  const values: ThemeId[] = ["gx-red", "neon-green", "electric-blue", "cyber-yellow", "dark", "light"];
  return values[(values.indexOf(theme) + 1) % values.length];
}

function renderShieldToggle(label: string, active: boolean, onChange: (value: boolean) => void) {
  return (
    <button className={`shield-toggle ${active ? "active" : ""}`} onClick={() => void onChange(!active)}>
      <span>{shieldIcon(label)}{label}</span>
      <strong>{active ? "ON" : "OFF"}</strong>
    </button>
  );
}

function shieldIcon(label: string) {
  const common = { size: 16, strokeWidth: 2.2 };
  if (label === "Cookies") return <Cookie {...common} />;
  if (label === "Fingerprint") return <Fingerprint {...common} />;
  if (label === "HTTPS") return <BadgeCheck {...common} />;
  return <Shield {...common} />;
}

function iconComponent(icon: string): LucideIcon {
  const icons: Record<string, LucideIcon> = {
    "sliders-horizontal": SlidersHorizontal,
    history: History,
    star: Bookmark,
    download: Download,
    "notebook-tabs": NotebookTabs,
    "music-4": Music4,
    "message-circle-more": MessageCircleMore,
    "messages-square": MessagesSquare,
    send: Send,
    instagram: Camera,
    "at-sign": AtSign,
    "gamepad-2": Gamepad2,
    "play-square": PlaySquare,
    "panel-right-open": PanelRightOpen,
    sparkles: Sparkles,
    bot: Bot,
    stars: Sparkles,
    orbit: Orbit
  };
  return icons[icon] ?? ExternalLink;
}
