import { useEffect, useMemo, useRef, useState } from "react";
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
  KeyRound,
  Languages,
  LayoutDashboard,
  MessageCircleMore,
  MessagesSquare,
  Minus,
  MonitorPlay,
  MousePointer2,
  Music4,
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
  Rocket,
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
  Copy,
  Edit3,
  Image as ImageIcon,
  MapPin,
  Save,
  Square,
  PinOff,
  X,
  Zap
} from "lucide-react";
import { sidebarApps } from "@shared/defaults";
import type { AppSettings, BrowserStateSnapshot, ExtensionRecord, TabRecord, ThemeId } from "@shared/types";

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
    hiddenSpeedDialIds: [],
    pinnedExtensions: [],
    speedDial: []
  },
  sidebarOpen: false,
  sidebarPinned: false,
  sidebarWidth: 380,
  activeSidebarAppId: null,
  utilityDockOpen: false,
  isMaximized: false
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
    items: ["Screenshot", "GX Cleaner", "Video pop-out", "Downloads", "Chrome extensions", "Developer extensions"]
  }
];

const settingsSections = [
  "Appearance",
  "Autofill and Passwords",
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

type UtilityPanel = "shields" | "tabs" | "history" | "performance" | "ai" | "utilities" | "settings";
type SpeedDialEntry = { id: string; title: string; url: string; color?: string };
type SpeedDialDraft = SpeedDialEntry & { isNew?: boolean; sourceDefaultId?: string };
type WeatherState = { status: "idle" | "loading" | "ready" | "error"; temperature?: number; city?: string; label: string; latitude?: number; longitude?: number };
type TooltipState = { text: string; left: number; top: number } | null;
type FeatureStatus = "working" | "partial" | "planned" | "removed";
type LocalPageId = "start" | "settings" | "mods" | "history" | "downloads" | "bookmarks" | "extensions" | "notes";

const localPageTabs: Array<{ id: Exclude<LocalPageId, "start" | "notes">; label: string; url: string }> = [
  { id: "mods", label: "Mods", url: "space://mods" },
  { id: "history", label: "History", url: "space://history" },
  { id: "downloads", label: "Downloads", url: "space://downloads" },
  { id: "settings", label: "Settings", url: "space://settings" },
  { id: "bookmarks", label: "Bookmarks", url: "space://bookmarks" },
  { id: "extensions", label: "Extensions", url: "space://extensions" }
];

const utilityPanels: Array<{ id: UtilityPanel; label: string; Icon: LucideIcon; tip: string }> = [
  { id: "shields", label: "Shields", Icon: ShieldCheck, tip: "Privacy and site protections" },
  { id: "tabs", label: "Tabs", Icon: LayoutDashboard, tip: "Search tabs, pin tabs, and split view" },
  { id: "history", label: "History", Icon: History, tip: "Recent pages and quick cleanup" },
  { id: "performance", label: "GX Control", Icon: Cpu, tip: "Tab sleep and performance behavior" },
  { id: "ai", label: "AI", Icon: Sparkles, tip: "Summarize, explain, rewrite, translate, and code" },
  { id: "utilities", label: "Tools", Icon: Puzzle, tip: "Screenshot, cleaner, PiP, extensions, and DevTools" },
  { id: "settings", label: "Settings", Icon: SlidersHorizontal, tip: "Jump to settings sections" }
];

const featureAudit: Array<{ group: string; items: Array<{ name: string; status: FeatureStatus; note: string }> }> = [
  {
    group: "GX Gaming",
    items: [
      { name: "GX Control", status: "partial", note: "Tab sleep, timer throttling, network presets; OS hard CPU/RAM caps need native service work." },
      { name: "GX Cleaner", status: "working", note: "Clears cache, cookies, and site storage." },
      { name: "Hot Tabs Killer", status: "planned", note: "Tab kill exists through close; live CPU/RAM ranking is next." },
      { name: "GX Corner", status: "partial", note: "Start page section is present; live gaming feeds are local placeholders." },
      { name: "Twitch and Discord", status: "working", note: "Available as resizable sidebar web apps." }
    ]
  },
  {
    group: "Customization",
    items: [
      { name: "Themes and RGB", status: "working", note: "Six theme presets and shared accent/glow variables." },
      { name: "GX Mods", status: "partial", note: "Local JSON import/export; remote marketplace is not connected." },
      { name: "Speed Dial editing", status: "working", note: "Add, edit, delete, recolor, and favicon tiles." },
      { name: "Sidebar customization", status: "partial", note: "Pinned/resizable panels and app list; reorder UI is next." },
      { name: "Animated wallpapers", status: "planned", note: "Wallpaper hooks are in mod schema; video picker is next." }
    ]
  },
  {
    group: "Brave-Style Shields",
    items: [
      { name: "Ad and tracker blocking", status: "working", note: "EasyList blocker plus request interception." },
      { name: "Cookie blocking", status: "working", note: "Third-party cookie stripping by default, without breaking first-party login." },
      { name: "HTTPS upgrade", status: "working", note: "HTTP requests are upgraded when Shields allow it." },
      { name: "URL tracking protection", status: "working", note: "Common tracking parameters are stripped before navigation." },
      { name: "Script blocking", status: "partial", note: "Per-site/global toggle is present; fine-grained script UI still needs expansion." },
      { name: "Fingerprinting protection", status: "partial", note: "Best-effort hardening only; not Brave parity yet." },
      { name: "Wayback Machine", status: "working", note: "Active page can be opened in the Internet Archive." },
      { name: "Speedreader", status: "partial", note: "Reader CSS mode exists; full article extraction is future work." },
      { name: "Tor and VPN", status: "removed", note: "Removed from UI rather than faking network infrastructure." }
    ]
  },
  {
    group: "Browser",
    items: [
      { name: "Chromium websites", status: "working", note: "Real Electron Chromium BrowserViews render normal sites." },
      { name: "Extensions", status: "partial", note: "Chrome Web Store opens and developer Load Unpacked is available." },
      { name: "Developer Tools", status: "working", note: "Chromium DevTools opens for the active tab." },
      { name: "Picture in Picture", status: "working", note: "Manual and auto PiP hooks are present." },
      { name: "Split tabs and tab islands", status: "partial", note: "Split and island metadata are present; full collapsible islands need a deeper tab strip pass." },
      { name: "Private windows", status: "partial", note: "Private in-memory tabs exist; separate private BrowserWindow polish is next." }
    ]
  }
];

const featureTotals = featureAudit.flatMap((group) => group.items).reduce(
  (totals, item) => ({ ...totals, [item.status]: totals[item.status] + 1 }),
  { working: 0, partial: 0, planned: 0, removed: 0 } as Record<FeatureStatus, number>
);
const featureTotalCount = Object.values(featureTotals).reduce((sum, count) => sum + count, 0);
const featureCompletion = Math.round(((featureTotals.working + featureTotals.partial * 0.5) / featureTotalCount) * 100);

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
  const [utilityWidth, setUtilityWidth] = useState(372);
  const [tabSearch, setTabSearch] = useState("");
  const [activeUtilityPanel, setActiveUtilityPanel] = useState<UtilityPanel>("shields");
  const [resizingSidebar, setResizingSidebar] = useState(false);
  const [resizingUtility, setResizingUtility] = useState(false);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [speedDialDraft, setSpeedDialDraft] = useState<SpeedDialDraft | null>(null);
  const [weather, setWeather] = useState<WeatherState>({ status: "idle", label: "Use location" });
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [extensionsOpen, setExtensionsOpen] = useState(false);
  const [extensions, setExtensions] = useState<ExtensionRecord[]>([]);
  const lastDragTarget = useRef<string | null>(null);
  const sidebarPinnedRef = useRef(false);
  const utilityDockRef = useRef<HTMLDivElement | null>(null);
  const leftToolbarRef = useRef<HTMLDivElement | null>(null);
  const leftPanelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    window.space.getSnapshot().then((data) => {
      setSnapshot(data);
      const active = data.tabs.find((tab: TabRecord) => tab.id === data.activeTabId);
      setAddress(active?.url ?? "https://www.google.com");
      setSidebarWidth(data.sidebarWidth ?? 380);
    });
    window.space.listExtensions().then(setExtensions).catch(() => setExtensions([]));
    return window.space.onSnapshot((data: BrowserStateSnapshot) => {
      setSnapshot(data);
      const active = data.tabs.find((tab: TabRecord) => tab.id === data.activeTabId);
      if (active) setAddress(active.url);
      if (data.sidebarOpen) setSidebarWidth(data.sidebarWidth ?? 380);
    });
  }, []);

  useEffect(() => {
    sidebarPinnedRef.current = snapshot.sidebarPinned;
  }, [snapshot.sidebarPinned]);

  useEffect(() => {
    if (!resizingSidebar) return;
    function handleMove(event: MouseEvent) {
      const nextWidth = Math.max(360, Math.min(Math.max(360, window.innerWidth - 220), event.clientX - 64));
      setSidebarWidth(nextWidth);
      void window.space.resizeSidebar(nextWidth, sidebarPinnedRef.current);
    }
    function stopResize() {
      setResizingSidebar(false);
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", stopResize, { once: true });
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", stopResize);
    };
  }, [resizingSidebar]);

  useEffect(() => {
    if (!resizingUtility) return;
    function handleMove(event: MouseEvent) {
      const maxWidth = Math.min(680, Math.max(340, window.innerWidth - 112));
      const nextWidth = Math.max(320, Math.min(maxWidth, window.innerWidth - event.clientX - 14));
      setUtilityWidth(nextWidth);
    }
    function stopResize() {
      setResizingUtility(false);
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", stopResize, { once: true });
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", stopResize);
    };
  }, [resizingUtility]);

  useEffect(() => {
    function closeFloatingPanels(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      const inUtility = utilityDockRef.current?.contains(target);
      if (snapshot.utilityDockOpen && !inUtility && !(target instanceof Element && target.closest(".right-dock-peek"))) {
        void window.space.setUtilityDockOpen(false);
      }
      if (extensionsOpen && target instanceof Element && !target.closest(".extensions-popover") && !target.closest(".extensions-toolbar-button")) {
        setExtensionsOpen(false);
      }
      const inLeftOverlay = leftToolbarRef.current?.contains(target) || leftPanelRef.current?.contains(target);
      const inRail = target instanceof Element && target.closest(".space-sidebar");
      if (snapshot.sidebarOpen && !snapshot.sidebarPinned && !inLeftOverlay && !inRail) {
        void window.space.tabAction("close-sidebar");
      }
    }
    document.addEventListener("pointerdown", closeFloatingPanels, true);
    return () => document.removeEventListener("pointerdown", closeFloatingPanels, true);
  }, [extensionsOpen, snapshot.sidebarOpen, snapshot.sidebarPinned, snapshot.utilityDockOpen]);

  useEffect(() => {
    function showTooltip(event: PointerEvent) {
      const element = event.target instanceof Element ? event.target.closest("[data-tip]") : null;
      const text = element?.getAttribute("data-tip");
      if (!element || !text) return;
      const rect = element.getBoundingClientRect();
      setTooltip({
        text,
        left: Math.max(12, Math.min(window.innerWidth - 12, rect.left + rect.width / 2)),
        top: Math.max(12, rect.top - 10)
      });
    }
    function hideTooltip() {
      setTooltip(null);
    }
    document.addEventListener("pointerover", showTooltip);
    document.addEventListener("pointerout", hideTooltip);
    window.addEventListener("scroll", hideTooltip, true);
    return () => {
      document.removeEventListener("pointerover", showTooltip);
      document.removeEventListener("pointerout", hideTooltip);
      window.removeEventListener("scroll", hideTooltip, true);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadWeather(latitude: number, longitude: number) {
      setWeather({ status: "loading", label: "Loading weather" });
      try {
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&timezone=auto`;
        const weatherResponse = await fetch(weatherUrl);
        const weatherData = (await weatherResponse.json()) as { current?: { temperature_2m?: number } };
        if (cancelled) return;
        const temp = weatherData.current?.temperature_2m;
        const gpsLabel = `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
        setWeather({
          status: "ready",
          temperature: typeof temp === "number" ? temp : undefined,
          city: gpsLabel,
          label: typeof temp === "number" ? `${Math.round(temp)} C` : "Weather",
          latitude,
          longitude
        });
      } catch {
        if (!cancelled) setWeather({ status: "error", label: "Weather unavailable" });
      }
    }

    if (!("geolocation" in navigator)) {
      setWeather({ status: "error", label: "Location unavailable" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => void loadWeather(position.coords.latitude, position.coords.longitude),
      () => setWeather({ status: "error", label: "Enable location" }),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 900000 }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const activeTab = snapshot.tabs.find((tab) => tab.id === snapshot.activeTabId) ?? null;
  const activeLocalPage = getLocalPageId(activeTab?.url);
  const activeTabIsStart = !activeTab || activeLocalPage === "start";
  const activeTabIsLocal = Boolean(activeLocalPage);
  const speedDialEntries = useMemo(() => {
    const hidden = new Set(snapshot.settings.hiddenSpeedDialIds ?? []);
    const custom = snapshot.settings.speedDial.filter((entry) => !defaultSpeedDial.some((dial) => dial.id === entry.id || dial.url === entry.url));
    return [...defaultSpeedDial.filter((entry) => !hidden.has(entry.id)), ...custom];
  }, [snapshot.settings.hiddenSpeedDialIds, snapshot.settings.speedDial]);
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

  function openSpeedDialEditor(entry?: SpeedDialEntry) {
    if (!entry) {
      setSpeedDialDraft({ id: `custom-${Date.now()}`, title: "", url: "https://", color: "#ffffff", isNew: true });
      return;
    }
    const isDefault = defaultSpeedDial.some((dial) => dial.id === entry.id);
    setSpeedDialDraft({ ...entry, sourceDefaultId: isDefault ? entry.id : undefined });
  }

  async function saveSpeedDial() {
    if (!speedDialDraft?.title.trim() || !speedDialDraft.url.trim()) return;
    const normalized = {
      id: speedDialDraft.sourceDefaultId ? `custom-${Date.now()}` : speedDialDraft.id,
      title: speedDialDraft.title.trim(),
      url: speedDialDraft.url.trim(),
      color: speedDialDraft.color || "#ffffff"
    };
    if (speedDialDraft.sourceDefaultId) {
      await patchSettings({
        hiddenSpeedDialIds: [...new Set([...(snapshot.settings.hiddenSpeedDialIds ?? []), speedDialDraft.sourceDefaultId])],
        speedDial: [...snapshot.settings.speedDial, normalized]
      });
      setSpeedDialDraft(null);
      return;
    }
    const exists = snapshot.settings.speedDial.some((item) => item.id === normalized.id);
    await patchSettings({
      speedDial: exists ? snapshot.settings.speedDial.map((item) => (item.id === normalized.id ? normalized : item)) : [...snapshot.settings.speedDial, normalized]
    });
    setSpeedDialDraft(null);
  }

  async function deleteSpeedDial(entry: { id: string; url: string }) {
    const isDefault = defaultSpeedDial.some((dial) => dial.id === entry.id);
    if (isDefault) {
      await patchSettings({ hiddenSpeedDialIds: [...new Set([...(snapshot.settings.hiddenSpeedDialIds ?? []), entry.id])] });
      return;
    }
    await patchSettings({ speedDial: snapshot.settings.speedDial.filter((item) => item.id !== entry.id) });
  }

  async function patchPerformance(patch: Partial<AppSettings["performanceProfile"]>) {
    await patchSettings({ performanceProfile: { ...snapshot.settings.performanceProfile, ...patch } });
  }

  async function toggleUtilityPanel(panel: UtilityPanel) {
    const shouldOpen = !(snapshot.utilityDockOpen && activeUtilityPanel === panel);
    setActiveUtilityPanel(panel);
    await window.space.setUtilityDockOpen(shouldOpen);
  }

  async function toggleExtensionsPopover() {
    const nextOpen = !extensionsOpen;
    setExtensionsOpen(nextOpen);
    if (nextOpen) {
      setExtensions(await window.space.listExtensions());
    }
  }

  async function toggleExtensionPin(extensionId: string) {
    const current = snapshot.settings.pinnedExtensions ?? [];
    const next = current.includes(extensionId) ? current.filter((id) => id !== extensionId) : [...current, extensionId];
    await patchSettings({ pinnedExtensions: next });
    setExtensions((items) => items.map((item) => (item.id === extensionId ? { ...item, pinned: !item.pinned } : item)));
  }

  function openWeatherDetails() {
    if (!activeTab) return;
    const url =
      weather.latitude && weather.longitude
        ? `https://open-meteo.com/en/docs?latitude=${weather.latitude}&longitude=${weather.longitude}&current=temperature_2m`
        : "https://open-meteo.com/en/docs";
    void window.space.navigate(activeTab.id, url);
  }

  const showUtilityPanel = (panel: UtilityPanel) => activeUtilityPanel === panel;

  async function openSidebarTarget(app: (typeof sidebarApps)[number]) {
    if (app.url.startsWith("space://") && activeTab) {
      await window.space.navigate(activeTab.id, app.url);
      await window.space.tabAction("close-sidebar");
      return;
    }
    await window.space.openSidebarApp(app.id);
  }

  return (
    <div className={`app-shell ${themeClassMap[snapshot.settings.theme]}`}>
      <div className="backdrop-grid" />
      <aside className="space-sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <SpaceLogoMark />
          </div>
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
                data-tip={app.name}
                aria-label={app.name}
                onClick={() => void openSidebarTarget(app)}
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
        <div ref={leftToolbarRef} className={`sidebar-panel-toolbar ${snapshot.sidebarPinned ? "docked" : "overlay"}`} style={{ left: 64, width: sidebarWidth }}>
          <div className="sidebar-panel-title">
            <strong>{activeSidebarApp?.name ?? "Panel"}</strong>
            <span>{snapshot.sidebarPinned ? "Docked" : "Overlay"}</span>
          </div>
          <div className="sidebar-toolbar-actions">
            <button onClick={() => void window.space.tabAction("toggle-sidebar-pin")} title={snapshot.sidebarPinned ? "Unpin panel" : "Pin panel"} data-tip={snapshot.sidebarPinned ? "Unpin panel" : "Pin panel"}>
              {snapshot.sidebarPinned ? <PinOff size={16} /> : <Pin size={16} />}
            </button>
            <button onClick={() => void window.space.tabAction("close-sidebar")} title="Close panel" data-tip="Close panel">
              <X size={16} />
            </button>
          </div>
          <div className="sidebar-drag-resizer" onMouseDown={() => setResizingSidebar(true)} title="Drag to resize sidebar" />
        </div>
      )}

      {snapshot.sidebarOpen && (
        <div
          className="sidebar-full-resizer"
          style={{ left: 64 + sidebarWidth - 10 }}
          onMouseDown={() => setResizingSidebar(true)}
          title="Drag to resize panel"
          data-tip="Resize panel"
        />
      )}

      {snapshot.sidebarOpen && activeSidebarApp?.url.startsWith("space://") && (
        <aside ref={leftPanelRef} className={`sidebar-native-panel ${snapshot.sidebarPinned ? "docked" : "overlay"}`} style={{ left: 64, width: sidebarWidth }}>
          {renderSidebarPanel({
            appId: activeSidebarApp.id,
            snapshot,
            activeTab,
            patchSettings,
            patchPerformance,
            navigateInActiveTab: (url: string) => activeTab && window.space.navigate(activeTab.id, url)
          })}
        </aside>
      )}

      <main className="browser-chrome" style={{ marginLeft: snapshot.sidebarOpen && snapshot.sidebarPinned ? sidebarWidth : 0 }}>
        <header className="top-chrome">
          <div className="window-title-row">
            <div className="window-title">Space_ - {activeTab?.title ?? "New Tab"}</div>
          </div>

          <div className="tab-strip">
            <div className="tab-cluster">
              {snapshot.tabs.map((tab) => (
                <button
                  key={tab.id}
                  draggable
                  className={`tab-pill ${tab.id === snapshot.activeTabId ? "active" : ""} ${tab.isPinned ? "pinned" : ""}`}
                  onClick={() => void window.space.tabAction("activate", { tabId: tab.id })}
                  onMouseDown={(event) => {
                    if (event.button === 1) {
                      event.preventDefault();
                      void window.space.tabAction("close", { tabId: tab.id });
                    }
                  }}
                  onDragStart={(event) => {
                    setDraggedTabId(tab.id);
                    lastDragTarget.current = tab.id;
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", tab.id);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    const sourceId = draggedTabId ?? event.dataTransfer.getData("text/plain");
                    if (!sourceId || sourceId === tab.id || lastDragTarget.current === tab.id) return;
                    lastDragTarget.current = tab.id;
                    void window.space.reorderTab(sourceId, tab.id);
                  }}
                  onDragEnd={(event) => {
                    const leftWindow =
                      event.clientX < 0 ||
                      event.clientY < 0 ||
                      event.clientX > window.innerWidth ||
                      event.clientY > window.innerHeight ||
                      event.clientY > 112;
                    if (leftWindow) void window.space.tabAction("detach", { tabId: tab.id });
                    setDraggedTabId(null);
                    lastDragTarget.current = null;
                  }}
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
              <button className="new-tab-button" onClick={() => void window.space.tabAction("new")} title="New tab" data-tip="New tab">
              <Plus size={19} />
            </button>
            <div className="window-controls">
              <button onClick={() => void window.space.windowControl("minimize")} title="Minimize" data-tip="Minimize">
                <Minus size={14} />
              </button>
              <button onClick={() => void window.space.windowControl("maximize")} title={snapshot.isMaximized ? "Restore" : "Maximize"} data-tip={snapshot.isMaximized ? "Restore" : "Maximize"}>
                {snapshot.isMaximized ? <Copy size={13} /> : <Square size={13} />}
              </button>
              <button className="close-window" onClick={() => void window.space.windowControl("close")} title="Close" data-tip="Close">
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="toolbar">
            <div className="toolbar-actions">
              <button className="circle-button" onClick={() => activeTab && void window.space.tabAction("back", { tabId: activeTab.id })} title="Back" data-tip="Back">
                <ArrowLeft size={18} />
              </button>
              <button className="circle-button" onClick={() => activeTab && void window.space.tabAction("forward", { tabId: activeTab.id })} title="Forward" data-tip="Forward">
                <ArrowRight size={18} />
              </button>
              <button className="circle-button" onClick={() => activeTab && void window.space.tabAction("reload", { tabId: activeTab.id })} title="Reload" data-tip="Reload">
                <RefreshCcw size={18} />
              </button>
              <button className="circle-button" onClick={() => activeTab && void window.space.navigate(activeTab.id, "https://www.google.com")} title="Home" data-tip="Home">
                <Home size={18} />
              </button>
            </div>

            <div className="address-shell">
              <button className={`shield-pill ${activeTab?.shieldState.httpsUpgrade ? "on" : "off"}`} onClick={() => void toggleUtilityPanel("shields")} title="Open Shields controls" data-tip="Shields">
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
                data-tip="Picture in picture"
              >
                <MonitorPlay size={18} />
              </button>
              <button className="toolbar-utility" onClick={() => activeTab && void window.space.toggleBookmark?.(activeTab.id)} title="Bookmark this page" data-tip="Bookmark">
                <Star size={18} />
              </button>
              {(snapshot.settings.pinnedExtensions ?? []).slice(0, 4).map((id) => {
                const extension = extensions.find((item) => item.id === id);
                if (!extension) return null;
                return (
                  <button key={id} className="toolbar-utility pinned-extension-button" title={extension.name} data-tip={extension.name}>
                    <Puzzle size={18} />
                  </button>
                );
              })}
              <button className="toolbar-utility extensions-toolbar-button" onClick={() => void toggleExtensionsPopover()} title="Extensions" data-tip="Extensions">
                <Puzzle size={18} />
              </button>
              <button className="toolbar-utility" onClick={() => void window.space.openSidebarApp("downloads")} title="Downloads" data-tip="Downloads">
                <Download size={18} />
              </button>
              <button className="toolbar-utility" onClick={() => void window.space.tabAction("new-window")} title="New window" data-tip="New window">
                <ExternalLink size={18} />
              </button>
              <button className="toolbar-utility" onClick={() => activeTab && void window.space.navigate(activeTab.id, "space://settings")} title="Settings" data-tip="Settings">
                <CircleUserRound size={18} />
              </button>
              <button className={`toolbar-utility ${snapshot.utilityDockOpen ? "active" : ""}`} onClick={() => void toggleUtilityPanel("shields")} title="Toggle right controls" data-tip="Controls">
                <PanelRightOpen size={18} />
              </button>
            </div>

            <button className="go-button" onClick={() => void navigate()}>
              Go
            </button>
            {extensionsOpen && (
              <section className="extensions-popover">
                <div className="popover-header">
                  <strong>Extensions</strong>
                  <button onClick={() => setExtensionsOpen(false)} title="Close extensions" data-tip="Close">
                    <X size={15} />
                  </button>
                </div>
                <div className="popover-note">
                  <strong>No access needed</strong>
                  <span>Loaded extensions can be pinned beside the address bar.</span>
                </div>
                <div className="extension-list">
                  {extensions.length === 0 && <div className="empty-note">No unpacked extensions loaded yet.</div>}
                  {extensions.map((extension) => (
                    <div className="extension-popover-row" key={extension.id}>
                      <Puzzle size={17} />
                      <span>{extension.name}</span>
                      <button
                        onClick={() => void toggleExtensionPin(extension.id)}
                        title={extension.pinned ? "Unpin extension" : "Pin extension"}
                        data-tip={extension.pinned ? "Unpin from toolbar" : "Pin to toolbar"}
                      >
                        {extension.pinned ? <PinOff size={17} /> : <Pin size={17} />}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="popover-footer">
                  <button onClick={() => activeTab && void window.space.navigate(activeTab.id, "space://extensions")}>Manage extensions</button>
                  <button onClick={() => activeTab && void window.space.openChromeWebStore(activeTab.id)}>Chrome Web Store</button>
                </div>
              </section>
            )}
          </div>
        </header>

        <section className={`workspace-body ${activeTabIsLocal ? "local-active" : "web-active"} ${snapshot.utilityDockOpen ? "with-utility" : "utility-collapsed"}`}>
          {activeTabIsStart && <div className="start-surface">
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
                <button className="profile-widget" onClick={() => activeTab && void window.space.navigate(activeTab.id, "https://accounts.google.com/")} title="Sign in with Google" data-tip="Google account">
                  <div className="widget-avatar">
                    <SpaceLogoMark />
                  </div>
                  <strong>Space_ Account</strong>
                  <span>Google sign-in</span>
                </button>
                <button className="weather-widget" onClick={() => openWeatherDetails()} title={weather.status === "error" ? weather.label : "Live weather from Open-Meteo"} data-tip="Open live Open-Meteo weather details">
                  <CloudSun size={28} />
                  <strong>{weather.label}</strong>
                  <span><MapPin size={13} /> {weather.city ?? "GPS location"}</span>
                </button>
              </div>

              <div className="speed-dial-wall">
                {speedDialEntries.map((entry) => {
                  const tileColor = "color" in entry && typeof entry.color === "string" ? entry.color : "#ffffff";
                  return (
                  <div
                    key={entry.id}
                    className="gx-dial"
                    role="button"
                    tabIndex={0}
                    style={{ "--tile": tileColor } as React.CSSProperties}
                    onClick={() => activeTab && void window.space.navigate(activeTab.id, entry.url)}
                    onAuxClick={(event) => {
                      if (event.button === 1) {
                        event.preventDefault();
                        void window.space.tabAction("new", { private: false, url: entry.url });
                      }
                    }}
                    onKeyDown={(event) => event.key === "Enter" && activeTab && void window.space.navigate(activeTab.id, entry.url)}
                  >
                    <span className="dial-logo-wrap">
                      <img className="dial-favicon" src={faviconForUrl(entry.url)} alt="" loading="lazy" />
                    </span>
                    <strong>{entry.title}</strong>
                    <small>{hostLabel(entry.url)}</small>
                    <span className="dial-edit-actions">
                      <button
                        type="button"
                        title="Edit Speed Dial"
                        data-tip="Edit"
                        onClick={(event) => {
                          event.stopPropagation();
                          openSpeedDialEditor(entry);
                        }}
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        type="button"
                        title="Delete Speed Dial"
                        data-tip="Delete"
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteSpeedDial(entry);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </div>
                  );
                })}
                <button className="gx-dial add-dial" onClick={() => openSpeedDialEditor()} style={{ "--tile": "#202432" } as React.CSSProperties}>
                  <span><Plus size={24} /> Add site</span>
                </button>
              </div>
            </section>
          </div>}

          {activeLocalPage && activeLocalPage !== "start" && (
            <SpaceLocalPage
              pageId={activeLocalPage}
              snapshot={snapshot}
              activeTab={activeTab}
              patchSettings={patchSettings}
              patchPerformance={patchPerformance}
            />
          )}

          {snapshot.utilityDockOpen ? (
          <div ref={utilityDockRef} className={`utility-dock panel-${activeUtilityPanel}`} style={{ width: utilityWidth }}>
            <div className="utility-resizer" onMouseDown={() => setResizingUtility(true)} title="Drag to resize controls" data-tip="Resize controls" />
            <div className="utility-dock-header">
              <strong>{panelTitle(activeUtilityPanel)}</strong>
              <button onClick={() => void window.space.setUtilityDockOpen(false)} title="Collapse right controls" data-tip="Close controls">
                <X size={16} />
              </button>
            </div>
            <div className="control-switcher" aria-label="Controls sections">
              {utilityPanels.map(({ id, label, Icon, tip }) => (
                <button
                  key={id}
                  className={activeUtilityPanel === id ? "active" : ""}
                  onClick={() => setActiveUtilityPanel(id)}
                  title={tip}
                  data-tip={tip}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
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
                  {activeTab?.isPinned ? <PinOff size={17} /> : <Pin size={17} />}
                  {activeTab?.isPinned ? "Unpin" : "Pin"}
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
                <button className="tool-button" onClick={() => activeTab && void window.space.tabAction("speedreader", { tabId: activeTab.id })}>
                  <Eye size={17} />
                  Speedreader
                </button>
                <button className="tool-button" onClick={() => activeTab && void window.space.tabAction("wayback", { tabId: activeTab.id })}>
                  <Clock3 size={17} />
                  Wayback
                </button>
                <button className="tool-button" onClick={() => activeTab && void window.space.tabAction("devtools", { tabId: activeTab.id })}>
                  <Code2 size={17} />
                  DevTools
                </button>
                <button className="tool-button" onClick={() => void window.space.openSidebarApp("music")}>
                  <Music4 size={17} />
                  Music
                </button>
                <button className="tool-button" onClick={() => activeTab && void window.space.openChromeWebStore(activeTab.id)}>
                  <Store size={17} />
                  Chrome Web Store
                </button>
                <button className="tool-button" onClick={() => void window.space.loadUnpackedExtension()}>
                  <PackageOpen size={17} />
                  Load Unpacked
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
                  <button key={section} onClick={() => activeTab && void window.space.navigate(activeTab.id, `space://settings#${section.toLowerCase().replaceAll(" ", "-")}`)}>
                    {section}
                  </button>
                ))}
              </div>
            </section>
            )}
          </div>
          ) : (
            <button className="right-dock-peek" onClick={() => void toggleUtilityPanel("shields")} title="Open controls" data-tip="Open controls">
              <PanelRightOpen size={18} />
            </button>
          )}
        </section>
      </main>
      {speedDialDraft && (
        <div className="modal-backdrop" onMouseDown={() => setSpeedDialDraft(null)}>
          <section className="speed-dial-editor" onMouseDown={(event) => event.stopPropagation()}>
            <div className="native-panel-heading">
              <ImageIcon size={22} />
              <div>
                <strong>{speedDialDraft.isNew ? "Add Speed Dial" : "Edit Speed Dial"}</strong>
                <span>Customize the tile that appears on the start page</span>
              </div>
            </div>
            <label className="setting-line">
              Name
              <input value={speedDialDraft.title} onChange={(event) => setSpeedDialDraft({ ...speedDialDraft, title: event.target.value })} autoFocus />
            </label>
            <label className="setting-line">
              Address
              <input value={speedDialDraft.url} onChange={(event) => setSpeedDialDraft({ ...speedDialDraft, url: event.target.value })} />
            </label>
            <label className="setting-line">
              Tile color
              <input type="color" value={speedDialDraft.color ?? "#ffffff"} onChange={(event) => setSpeedDialDraft({ ...speedDialDraft, color: event.target.value })} />
            </label>
            <div className="speed-dial-preview" style={{ "--tile": speedDialDraft.color ?? "#ffffff" } as React.CSSProperties}>
              <img src={faviconForUrl(speedDialDraft.url)} alt="" />
              <strong>{speedDialDraft.title || "New site"}</strong>
              <span>{hostLabel(speedDialDraft.url)}</span>
            </div>
            <div className="inline-actions editor-actions">
              {!speedDialDraft.isNew && (
                <button
                  className="danger-action"
                  onClick={() => {
                    void deleteSpeedDial(speedDialDraft);
                    setSpeedDialDraft(null);
                  }}
                >
                  <Trash2 size={17} />
                  Delete
                </button>
              )}
              <button onClick={() => setSpeedDialDraft(null)}>
                <X size={17} />
                Cancel
              </button>
              <button className="primary-button" onClick={() => void saveSpeedDial()}>
                <Save size={17} />
                Save
              </button>
            </div>
          </section>
        </div>
      )}
      {tooltip && (
        <div className="floating-tooltip" style={{ left: tooltip.left, top: tooltip.top }}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

function panelTitle(panel: UtilityPanel) {
  const titles: Record<UtilityPanel, string> = {
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

function faviconForUrl(url: string) {
  try {
    const target = new URL(url.startsWith("http") ? url : `https://${url}`);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(target.hostname)}&sz=64`;
  } catch {
    return "";
  }
}

function hostLabel(url: string) {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function getLocalPageId(url?: string): LocalPageId | null {
  if (!url?.startsWith("space://")) return null;
  const raw = url.replace("space://", "").split(/[?#]/)[0] || "start";
  if (["start", "settings", "mods", "history", "downloads", "bookmarks", "extensions", "notes"].includes(raw)) return raw as LocalPageId;
  return "start";
}

type SidebarPanelProps = {
  appId: string;
  snapshot: BrowserStateSnapshot;
  activeTab: TabRecord | null;
  patchSettings: (patch: Partial<AppSettings>) => Promise<void>;
  patchPerformance: (patch: Partial<AppSettings["performanceProfile"]>) => Promise<void>;
  navigateInActiveTab: (url: string) => Promise<unknown> | false | null;
};

function SpaceLocalPage({
  pageId,
  snapshot,
  activeTab,
  patchSettings,
  patchPerformance
}: Pick<SidebarPanelProps, "snapshot" | "activeTab" | "patchSettings" | "patchPerformance"> & { pageId: LocalPageId }) {
  const content = (() => {
    if (pageId === "settings") return renderSidebarPanel({ appId: "settings", snapshot, activeTab, patchSettings, patchPerformance, navigateInActiveTab: (url) => activeTab && window.space.navigate(activeTab.id, url) });
    if (pageId === "history") return renderSidebarPanel({ appId: "history", snapshot, activeTab, patchSettings, patchPerformance, navigateInActiveTab: (url) => activeTab && window.space.navigate(activeTab.id, url) });
    if (pageId === "bookmarks") return renderSidebarPanel({ appId: "bookmarks", snapshot, activeTab, patchSettings, patchPerformance, navigateInActiveTab: (url) => activeTab && window.space.navigate(activeTab.id, url) });
    if (pageId === "downloads") return renderSidebarPanel({ appId: "downloads", snapshot, activeTab, patchSettings, patchPerformance, navigateInActiveTab: (url) => activeTab && window.space.navigate(activeTab.id, url) });
    if (pageId === "extensions") return <ExtensionsPage snapshot={snapshot} activeTab={activeTab} patchSettings={patchSettings} />;
    if (pageId === "mods") return <ModsPage snapshot={snapshot} patchSettings={patchSettings} />;
    return renderSidebarPanel({ appId: "notes", snapshot, activeTab, patchSettings, patchPerformance, navigateInActiveTab: (url) => activeTab && window.space.navigate(activeTab.id, url) });
  })();
  const title = localPageTabs.find((entry) => entry.id === pageId)?.label ?? "Notes";
  return (
    <div className={`local-page local-page-${pageId}`}>
      <div className="local-page-hero">
        <div>
          <span className="eyebrow">SPACE_</span>
          <h1>{title}</h1>
          <p>{localPageDescription(pageId)}</p>
        </div>
        <div className="settings-search-shell">
          <Search size={18} />
          <input placeholder={`Search ${title.toLowerCase()}`} />
        </div>
      </div>
      <div className="local-page-tabs">
        {localPageTabs.map((entry) => (
          <button
            key={entry.id}
            className={entry.id === pageId ? "active" : ""}
            onClick={() => activeTab && void window.space.navigate(activeTab.id, entry.url)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {pageId === "settings" && (
        <div className="settings-category-strip">
          {settingsSections.map((section) => (
            <a key={section} href={`#${section.toLowerCase().replaceAll(" ", "-")}`}>
              {section}
            </a>
          ))}
        </div>
      )}
      {content}
    </div>
  );
}

function localPageDescription(pageId: LocalPageId) {
  const copy: Record<LocalPageId, string> = {
    start: "Your customizable speed dial and launch surface.",
    settings: "Appearance, privacy, Shields, sidebar, performance, startup, languages, site permissions, and advanced controls.",
    mods: "Mod everything in Space_: themes, colors, sounds, wallpapers, cursors, shaders, and local mod import/export.",
    history: "Search, reopen, and delete individual browsing history entries.",
    downloads: "Review downloaded files and clean download-related browser data.",
    bookmarks: "Manage saved pages and quickly reopen bookmarked websites.",
    extensions: "Open the Chrome Web Store and load developer extensions for this session.",
    notes: "Keep quick local notes inside the browser."
  };
  return copy[pageId];
}

function ExtensionsPage({ snapshot, activeTab, patchSettings }: Pick<SidebarPanelProps, "snapshot" | "activeTab" | "patchSettings">) {
  return (
    <div className="native-panel-content management-page-body">
      <section className="native-section">
        <div className="panel-header">
          <h3>Extensions</h3>
          <span>Developer mode</span>
        </div>
        <div className="extension-toolbar">
          <button onClick={() => activeTab && void window.space.openChromeWebStore(activeTab.id)}>
            <Store size={17} />
            Chrome Web Store
          </button>
          <button onClick={() => void window.space.loadUnpackedExtension()}>
            <PackageOpen size={17} />
            Load unpacked
          </button>
          <button onClick={() => void patchSettings({ enableExperimentalExtensions: !snapshot.settings.enableExperimentalExtensions })}>
            <Puzzle size={17} />
            Developer mode {snapshot.settings.enableExperimentalExtensions ? "On" : "Off"}
          </button>
        </div>
      </section>
      <section className="extension-card">
        <div className="dial-logo-wrap"><Puzzle size={22} /></div>
        <div>
          <strong>Developer Extensions</strong>
          <span>Loaded unpacked extensions are registered with Electron for the current Space_ session.</span>
        </div>
        <button onClick={() => void window.space.loadUnpackedExtension()}>Load</button>
      </section>
      <section className="extension-card">
        <div className="dial-logo-wrap"><Store size={22} /></div>
        <div>
          <strong>Chrome Web Store</strong>
          <span>Browse extensions and themes in a normal Chromium tab.</span>
        </div>
        <button onClick={() => activeTab && void window.space.openChromeWebStore(activeTab.id)}>Open</button>
      </section>
    </div>
  );
}

function ModsPage({ snapshot, patchSettings }: Pick<SidebarPanelProps, "snapshot" | "patchSettings">) {
  return (
    <div className="mods-page-body">
      <section className="mod-command-center">
        <div className="mod-orb">
          <SpaceLogoMark />
          <strong>53%</strong>
        </div>
        <div className="mod-spokes">
          {[
            ["Interface", Brush, "66%"],
            ["Sounds", Volume2, snapshot.settings.soundsEnabled ? "On" : "Off"],
            ["Effects", Zap, "0%"],
            ["Wallpapers", Wallpaper, "GX"],
            ["Cursors", MousePointer2, "Default"]
          ].map(([label, Icon, value]) => {
            const ModIcon = Icon as LucideIcon;
            return (
              <button className="mod-spoke" key={String(label)}>
                <ModIcon size={20} />
                <strong>{String(value)}</strong>
                <span>{String(label)}</span>
              </button>
            );
          })}
        </div>
      </section>
      <aside className="mod-side-panel">
        <h3>Mod Everything</h3>
        <button onClick={() => void patchSettings({ theme: nextTheme(snapshot.settings.theme) })}>Cycle theme</button>
        <button onClick={() => void patchSettings({ soundsEnabled: !snapshot.settings.soundsEnabled })}>Toggle sounds</button>
        <button onClick={() => void window.space.importMods()}>Import mod JSON</button>
        <button onClick={() => void window.space.exportMods()}>Export mods</button>
      </aside>
      <section className="native-section mod-theme-section">
        <h3>Themes</h3>
        <div className="theme-grid native-theme-grid">
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
    </div>
  );
}

function renderSidebarPanel({ appId, snapshot, activeTab, patchSettings, patchPerformance, navigateInActiveTab }: SidebarPanelProps) {
  if (appId === "settings") {
    return (
      <div className="native-panel-content">
        <div className="native-panel-heading">
          <SlidersHorizontal size={22} />
          <div>
            <strong>Settings</strong>
            <span>Appearance, privacy, extensions, performance</span>
          </div>
        </div>

        <section className="native-section" id="appearance">
          <h3>Appearance</h3>
          <div className="theme-grid native-theme-grid">
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

        <section className="native-section" id="account">
          <h3>Space_ Account</h3>
          <p className="panel-note">Use a Google account for web sign-ins and Space_ profile setup. Full Space_ cloud sync needs a future account server.</p>
          <div className="inline-actions">
            <button onClick={() => activeTab && void window.space.navigate(activeTab.id, "https://accounts.google.com/")}>
              <CircleUserRound size={17} />
              Sign in with Google
            </button>
            <button onClick={() => activeTab && void window.space.navigate(activeTab.id, "https://myaccount.google.com/")}>
              <ExternalLink size={17} />
              Manage account
            </button>
          </div>
        </section>

        <section className="native-section" id="autofill-and-passwords">
          <h3>Autofill and Passwords</h3>
          <div className="password-manager-card">
            <div>
              <KeyRound size={24} />
              <strong>Password manager</strong>
              <span>Chromium can save site credentials in the browser profile. Space_ surfaces the setting here and keeps local profile data on this PC.</span>
            </div>
            <div className="settings-toggle-list compact-list">
              <button className="active" data-tip="Let Chromium offer to save passwords for websites you sign in to.">
                <BadgeCheck size={18} />
                <strong>Offer to save passwords</strong>
                <span>On</span>
              </button>
              <button className="active" data-tip="Let websites use passkeys in normal full tabs. Sidebar message panels keep passkeys disabled to avoid surprise popups.">
                <Fingerprint size={18} />
                <strong>Passkeys in full tabs</strong>
                <span>On</span>
              </button>
              <button data-tip="Space_ sync needs a future account server, so passwords stay local for now.">
                <CloudSun size={18} />
                <strong>Password sync</strong>
                <span>Local only</span>
              </button>
            </div>
          </div>
        </section>

        <section className="native-section" id="privacy">
          <h3>Shields</h3>
          <div className="toggle-grid">
            {renderShieldToggle("Ads", snapshot.settings.shieldDefaults.ads, (value) => window.space.setGlobalShields({ ads: value }))}
            {renderShieldToggle("Trackers", snapshot.settings.shieldDefaults.trackers, (value) => window.space.setGlobalShields({ trackers: value }))}
            {renderShieldToggle("HTTPS", snapshot.settings.shieldDefaults.httpsUpgrade, (value) => window.space.setGlobalShields({ httpsUpgrade: value }))}
            {renderShieldToggle("Cookies", snapshot.settings.shieldDefaults.cookies !== "allow", (value) =>
              window.space.setGlobalShields({ cookies: value ? "block-third-party" : "allow" })
            )}
            {renderShieldToggle("Scripts", snapshot.settings.shieldDefaults.scripts, (value) => window.space.setGlobalShields({ scripts: value }))}
          </div>
        </section>

        <section className="native-section" id="performance">
          <h3>Performance</h3>
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
          <label className="setting-line">
            Tab sleep minutes
            <input
              type="number"
              min={5}
              max={240}
              value={snapshot.settings.performanceProfile.suspendThresholdMinutes}
              onChange={(event) => void patchPerformance({ suspendThresholdMinutes: Number(event.target.value) })}
            />
          </label>
        </section>

        <section className="native-section" id="advanced">
          <h3>Extensions</h3>
          <div className="inline-actions">
            <button onClick={() => activeTab && void window.space.openChromeWebStore(activeTab.id)}>
              <Store size={17} />
              Chrome Web Store
            </button>
            <button onClick={() => void window.space.loadUnpackedExtension()}>
              <PackageOpen size={17} />
              Load unpacked
            </button>
          </div>
          <p className="panel-note">Chrome Web Store browsing opens in the active tab. Developer mode loads unpacked extensions for this Space_ session.</p>
        </section>

        <section className="native-section" id="sidebar">
          <h3>Sidebar</h3>
          <div className="settings-toggle-list">
            {sidebarApps.map((app) => {
              const enabled = snapshot.settings.sidebarApps.includes(app.id);
              return (
                <button
                  key={app.id}
                  className={enabled ? "active" : ""}
                  onClick={() => {
                    const nextApps = enabled
                      ? snapshot.settings.sidebarApps.filter((id) => id !== app.id)
                      : [...snapshot.settings.sidebarApps, app.id];
                    void patchSettings({ sidebarApps: nextApps });
                  }}
                >
                  <span>{app.name}</span>
                  <strong>{enabled ? "Shown" : "Hidden"}</strong>
                </button>
              );
            })}
          </div>
        </section>

        <section className="native-section" id="mods">
          <h3>Mods and Sounds</h3>
          <div className="inline-actions">
            <button onClick={() => void patchSettings({ soundsEnabled: !snapshot.settings.soundsEnabled })}>
              <Volume2 size={17} />
              Sounds {snapshot.settings.soundsEnabled ? "On" : "Off"}
            </button>
            <button onClick={() => void window.space.importMods()}>
              <PackageOpen size={17} />
              Import mod
            </button>
            <button onClick={() => void window.space.exportMods()}>
              <Download size={17} />
              Export mods
            </button>
          </div>
        </section>

        <section className="native-section" id="home-page">
          <h3>Home Page</h3>
          <div className="inline-actions">
            <button onClick={() => activeTab && void window.space.navigate(activeTab.id, "space://start")}>
              <Home size={17} />
              Open start page
            </button>
            <button onClick={() => void patchSettings({ hiddenSpeedDialIds: [], speedDial: [] })}>
              <RefreshCcw size={17} />
              Reset Speed Dial
            </button>
          </div>
        </section>

        <section className="native-section" id="downloads">
          <h3>Downloads and Data</h3>
          <div className="inline-actions">
            <button onClick={() => void window.space.runCleaner(["cache"])}>
              <Trash2 size={17} />
              Clear cache
            </button>
            <button onClick={() => void window.space.runCleaner(["cookies", "storage"])}>
              <Cookie size={17} />
              Clear cookies and site data
            </button>
            <button onClick={() => void window.space.clearHistory()}>
              <History size={17} />
              Clear history
            </button>
          </div>
        </section>

        <section className="native-section" id="tabs">
          <h3>Tabs and Startup</h3>
          <div className="inline-actions">
            <button onClick={() => void window.space.tabAction("restore-closed")}>
              <Clock3 size={17} />
              Reopen closed tab
            </button>
            <button onClick={() => activeTab && void window.space.tabAction("split", { tabId: activeTab.id })}>
              <SplitSquareHorizontal size={17} />
              Split active tab
            </button>
            <button onClick={() => activeTab && void window.space.tabAction("pin", { tabId: activeTab.id })}>
              {activeTab?.isPinned ? <PinOff size={17} /> : <Pin size={17} />}
              {activeTab?.isPinned ? "Unpin active tab" : "Pin active tab"}
            </button>
          </div>
        </section>

        <section className="native-section" id="languages">
          <h3>Languages, Accessibility, System</h3>
          <p className="panel-note">Language, accessibility, default-browser registration, protocol handlers, and hardware acceleration toggles are listed here for parity with Chrome, Firefox, Brave, and Opera. These need native settings bindings before they can safely change Chromium process behavior.</p>
        </section>

        <section className="native-section">
          <h3>GX + Brave Feature Coverage</h3>
          <div className="coverage-meter">
            <div>
              <strong>{featureCompletion}% v1 coverage</strong>
              <span>{featureTotals.working} working, {featureTotals.partial} partial, {featureTotals.planned} planned, {featureTotals.removed} removed</span>
            </div>
            <div className="coverage-track" aria-label="Feature coverage">
              <span style={{ width: `${featureCompletion}%` }} />
            </div>
          </div>
          <div className="feature-audit">
            {featureAudit.map((group) => (
              <div className="feature-audit-group" key={group.group}>
                <strong>{group.group}</strong>
                {group.items.map((item) => (
                  <div className="feature-audit-row" key={item.name}>
                    <span className={`status-dot ${item.status}`}>{item.status}</span>
                    <div>
                      <b>{item.name}</b>
                      <small>{item.note}</small>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (appId === "history") {
    return (
      <div className="native-panel-content">
        <div className="native-panel-heading">
          <History size={22} />
          <div>
            <strong>History</strong>
            <span>{snapshot.history.length} saved visits</span>
          </div>
        </div>
        <div className="inline-actions">
          <button onClick={() => void window.space.clearHistory()}>
            <Trash2 size={17} />
            Clear all
          </button>
        </div>
        <div className="native-list">
          {snapshot.history.map((entry) => (
            <div className="native-row" key={entry.id}>
              <button onClick={() => void navigateInActiveTab(entry.url)}>
                <strong>{entry.title}</strong>
                <span>{entry.url}</span>
              </button>
              <button className="icon-danger" title="Delete history item" data-tip="Delete" onClick={() => void window.space.deleteHistory(entry.id)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {snapshot.history.length === 0 && <p className="panel-note">No browsing history yet.</p>}
        </div>
      </div>
    );
  }

  if (appId === "bookmarks") {
    return (
      <div className="native-panel-content">
        <div className="native-panel-heading">
          <Bookmark size={22} />
          <div>
            <strong>Bookmarks</strong>
            <span>{snapshot.bookmarks.length} saved pages</span>
          </div>
        </div>
        <div className="native-list">
          {snapshot.bookmarks.map((entry) => (
            <button className="native-link-row" key={entry.id} onClick={() => void navigateInActiveTab(entry.url)}>
              <strong>{entry.title}</strong>
              <span>{entry.url}</span>
            </button>
          ))}
          {snapshot.bookmarks.length === 0 && <p className="panel-note">Use the star in the address bar to save pages.</p>}
        </div>
      </div>
    );
  }

  if (appId === "downloads") {
    return (
      <div className="native-panel-content">
        <div className="native-panel-heading">
          <Download size={22} />
          <div>
            <strong>Downloads</strong>
            <span>{snapshot.downloads.length} files</span>
          </div>
        </div>
        <div className="native-list">
          {snapshot.downloads.map((entry) => (
            <div className="native-link-row" key={entry.id}>
              <strong>{entry.fileName}</strong>
              <span>{entry.status} - {Math.round((entry.receivedBytes / Math.max(1, entry.totalBytes)) * 100)}%</span>
            </div>
          ))}
          {snapshot.downloads.length === 0 && <p className="panel-note">Downloads will appear here.</p>}
        </div>
      </div>
    );
  }

  if (appId === "notes") {
    return (
      <div className="native-panel-content">
        <div className="native-panel-heading">
          <NotebookTabs size={22} />
          <div>
            <strong>Notes</strong>
            <span>Quick local notes</span>
          </div>
        </div>
        <textarea
          className="notes-editor"
          value={(snapshot.settings.notes ?? []).join("\n")}
          onChange={(event) => void patchSettings({ notes: event.target.value.split("\n").filter(Boolean) })}
          placeholder="Type a note and it will be saved locally."
        />
      </div>
    );
  }

  return null;
}

function SpaceLogoMark() {
  return (
    <span className="space-logo-symbol" aria-hidden="true">
      <Shield size={29} strokeWidth={2.2} />
      <Rocket size={17} strokeWidth={2.4} />
    </span>
  );
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
    "wand-sparkles": WandSparkles,
    star: Bookmark,
    download: Download,
    puzzle: Puzzle,
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
