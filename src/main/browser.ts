import { app, BrowserView, BrowserWindow, dialog, ipcMain, session, shell } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { ElectronBlocker } from "@cliqz/adblocker-electron";
import { parse as parseDomain } from "tldts";
import { appStore } from "./store";
import { IPC_CHANNELS } from "../shared/ipc";
import { defaultSettings, defaultShieldConfig, sidebarApps } from "../shared/defaults";
import type {
  AiActionPayload,
  AppSettings,
  BookmarkRecord,
  BrowserStateSnapshot,
  DownloadRecord,
  HistoryRecord,
  ModManifest,
  ShieldConfig,
  SiteShieldRule,
  TabRecord
} from "../shared/types";

type BrowserTab = {
  record: TabRecord;
  view: BrowserView;
  partition: string;
};

const blockedHosts = ["doubleclick.net", "googleadservices.com", "googlesyndication.com"];
const adBlockLists = "https://easylist.to/easylist/easylist.txt";
const trackingParams = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "si",
  "spm"
];
const railWidth = 64;
const chromeHeight = 86;
const sidebarHeaderHeight = 58;
const sidebarResizeGutter = 10;
const chromeLikeUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

export class SpaceBrowserApp {
  private mainWindow: BrowserWindow | null = null;
  private sidebarView: BrowserView | null = null;
  private tabs = new Map<string, BrowserTab>();
  private downloads: DownloadRecord[] = [];
  private closedTabs: TabRecord[] = [];
  private activeTabId: string | null = null;
  private sidebarOpen = false;
  private sidebarPinned = false;
  private sidebarWidth = 380;
  private activeSidebarAppId: string | null = null;
  private utilityDockOpen = false;
  private blocker: ElectronBlocker | null = null;
  private readonly rendererUrl = process.env.VITE_DEV_SERVER_URL;

  async start() {
    await app.whenReady();
    await this.loadBlocker();
    this.configureSession(session.defaultSession);
    this.configureSession(session.fromPartition("persist:space-sidebar"), { sidebar: true });
    this.registerProtocols();
    this.createWindow();
    this.registerIpc();
    this.registerAppEvents();
    await this.createTab({ url: "space://start", private: false });
  }

  private async loadBlocker() {
    try {
      this.blocker = await ElectronBlocker.fromLists(fetch, [adBlockLists]);
    } catch {
      this.blocker = null;
    }
  }

  private registerProtocols() {
    app.setName("Space_");
  }

  private createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1600,
      height: 980,
      minWidth: 760,
      minHeight: 520,
      title: "Space_",
      frame: false,
      backgroundColor: "#09070d",
      autoHideMenuBar: true,
      icon: path.join(app.getAppPath(), "assets", "app.ico"),
      webPreferences: {
        preload: path.join(app.getAppPath(), "dist", "preload", "index.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    this.mainWindow.on("resize", () => this.layoutViews());
    this.mainWindow.on("maximize", () => this.publishSnapshot());
    this.mainWindow.on("unmaximize", () => this.publishSnapshot());
    this.mainWindow.on("restore", () => this.publishSnapshot());
    this.mainWindow.on("closed", () => {
      this.mainWindow = null;
    });
    this.mainWindow.webContents.on("page-title-updated", (event) => {
      event.preventDefault();
    });
    this.bindBrowserShortcuts(this.mainWindow.webContents);
    this.mainWindow.webContents.on("did-finish-load", () => {
      this.layoutViews();
      this.updateWindowTitle();
    });

    if (this.rendererUrl) {
      void this.mainWindow.loadURL(this.rendererUrl);
    } else {
      void this.mainWindow.loadFile(path.join(app.getAppPath(), "dist", "renderer", "index.html"));
    }
  }

  private registerAppEvents() {
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        app.quit();
      }
    });

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow();
        await this.createTab({ url: "space://start", private: false });
      }
    });
  }

  private registerIpc() {
    ipcMain.handle(IPC_CHANNELS.browserSnapshot, () => this.snapshot());
    ipcMain.handle(IPC_CHANNELS.tabAction, async (_event, { action, payload }) => this.handleTabAction(action, payload ?? {}));
    ipcMain.handle(IPC_CHANNELS.tabReorder, async (_event, { tabId, targetTabId }) => {
      if (typeof tabId === "string" && typeof targetTabId === "string") this.reorderTab(tabId, targetTabId);
    });
    ipcMain.handle(IPC_CHANNELS.navigate, async (_event, { tabId, value }) => this.navigate(tabId, value));
    ipcMain.handle(IPC_CHANNELS.sidebarOpen, async (_event, { appId }) => this.openSidebarApp(appId));
    ipcMain.handle(IPC_CHANNELS.sidebarResize, async (_event, { width, pinned }) => {
      this.sidebarWidth = this.clampSidebarWidth(width);
      this.sidebarPinned = pinned;
      this.layoutViews();
      this.publishSnapshot();
    });
    ipcMain.handle(IPC_CHANNELS.uiSetUtilityDock, async (_event, { open }) => {
      this.utilityDockOpen = Boolean(open);
      this.layoutViews();
      this.publishSnapshot();
    });
    ipcMain.handle(IPC_CHANNELS.windowControl, async (_event, { action }) => this.controlWindow(action));
    ipcMain.handle(IPC_CHANNELS.settingsPatch, async (_event, patch) => {
      const settings = { ...this.getSettings(), ...patch } as AppSettings;
      appStore.set("settings", settings);
      this.publishSnapshot();
    });
    ipcMain.handle(IPC_CHANNELS.shieldSetGlobal, async (_event, patch) => {
      const settings = this.getSettings();
      appStore.set("settings", { ...settings, shieldDefaults: { ...settings.shieldDefaults, ...patch } });
      this.publishSnapshot();
    });
    ipcMain.handle(IPC_CHANNELS.shieldSetSite, async (_event, rule: SiteShieldRule) => {
      const settings = this.getSettings();
      const rest = settings.siteShieldRules.filter((entry: SiteShieldRule) => entry.hostname !== rule.hostname);
      appStore.set("settings", { ...settings, siteShieldRules: [...rest, rule] });
      this.publishSnapshot();
    });
    ipcMain.handle(IPC_CHANNELS.bookmarksToggle, async (_event, { tabId }) => this.toggleBookmark(tabId));
    ipcMain.handle(IPC_CHANNELS.historyClear, async () => {
      appStore.set("history", []);
      this.publishSnapshot();
    });
    ipcMain.handle(IPC_CHANNELS.historyDelete, async (_event, { id }) => {
      const history = appStore.get("history") ?? [];
      appStore.set(
        "history",
        history.filter((entry: HistoryRecord) => entry.id !== id)
      );
      this.publishSnapshot();
    });
    ipcMain.handle(IPC_CHANNELS.modsImport, async () => this.importMods());
    ipcMain.handle(IPC_CHANNELS.modsExport, async () => this.exportMods());
    ipcMain.handle(IPC_CHANNELS.modsToggle, async (_event, { modId, enabled }) => {
      const mods = (appStore.get("mods") ?? []).map((mod: ModManifest & { enabled: boolean }) => (mod.id === modId ? { ...mod, enabled } : mod));
      appStore.set("mods", mods);
      this.publishSnapshot();
    });
    ipcMain.handle(IPC_CHANNELS.aiRun, async (_event, payload: AiActionPayload) => this.runAiAction(payload));
    ipcMain.handle(IPC_CHANNELS.pipRequest, async (_event, { tabId }) => this.requestPictureInPicture(typeof tabId === "string" ? tabId : undefined));
    ipcMain.handle(IPC_CHANNELS.extensionLoadUnpacked, async () => this.loadUnpackedExtension());
    ipcMain.handle(IPC_CHANNELS.extensionOpenStore, async (_event, { tabId }) => this.openChromeWebStore(typeof tabId === "string" ? tabId : undefined));
    ipcMain.handle(IPC_CHANNELS.screenshot, async () => this.takeScreenshot());
    ipcMain.handle(IPC_CHANNELS.cleaner, async (_event, targets: string[]) => this.runCleaner(targets));
  }

  private getSettings() {
    const stored = appStore.get("settings") ?? {};
    return {
      ...defaultSettings,
      ...stored,
      shieldDefaults: { ...defaultSettings.shieldDefaults, ...(stored as Partial<AppSettings>).shieldDefaults },
      performanceProfile: { ...defaultSettings.performanceProfile, ...(stored as Partial<AppSettings>).performanceProfile },
      sidebarApps: (stored as Partial<AppSettings>).sidebarApps ?? defaultSettings.sidebarApps,
      startPageWidgets: (stored as Partial<AppSettings>).startPageWidgets ?? defaultSettings.startPageWidgets,
      siteShieldRules: (stored as Partial<AppSettings>).siteShieldRules ?? defaultSettings.siteShieldRules,
      notes: (stored as Partial<AppSettings>).notes ?? defaultSettings.notes,
      hiddenSpeedDialIds: (stored as Partial<AppSettings>).hiddenSpeedDialIds ?? defaultSettings.hiddenSpeedDialIds,
      speedDial: (stored as Partial<AppSettings>).speedDial ?? defaultSettings.speedDial
    } as AppSettings;
  }

  private createPartition(isPrivate: boolean) {
    return isPrivate ? `space-private-${Date.now()}-${Math.random()}` : `persist:space-default`;
  }

  private async createTab(input: { url: string; private: boolean; pinned?: boolean; split?: boolean }) {
    const previousActive = this.activeTabId ? this.tabs.get(this.activeTabId) ?? null : null;
    const id = `tab-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const partition = this.createPartition(input.private);
    const tabSession = session.fromPartition(partition, { cache: !input.private });
    this.configureSession(tabSession);

    const view = new BrowserView({
      webPreferences: {
        partition,
        sandbox: true,
        backgroundThrottling: this.getSettings().performanceProfile.backgroundTabPolicy !== "aggressive"
      }
    });
    view.webContents.setUserAgent(chromeLikeUserAgent);

    if (this.blocker) {
      this.blocker.enableBlockingInSession(tabSession);
    }

    const shieldState = this.resolveShieldState(input.url);
    const record: TabRecord = {
      id,
      title: "New Tab",
      url: input.url,
      loading: true,
      private: input.private,
      shieldState,
      workspaceId: "primary",
      islandId: parseDomain(input.url).domain ?? "general",
      isPinned: Boolean(input.pinned),
      isMuted: false,
      isSplitParticipant: Boolean(input.split),
      isSuspended: false,
      lastActiveAt: Date.now()
    };

    const browserTab: BrowserTab = { record, view, partition };
    this.tabs.set(id, browserTab);
    this.bindViewEvents(browserTab, tabSession);
    this.mainWindow?.addBrowserView(view);
    void this.requestPictureInPictureForTab(previousActive, true);
    this.activeTabId = id;

    if (this.isInternalSpaceUrl(input.url)) {
      this.setTabToInternalPage(browserTab, input.url);
      this.layoutViews();
      this.publishSnapshot();
      this.updateWindowTitle();
      return;
    }

    await this.loadTabUrl(browserTab, this.normalizeUrl(input.url));
    this.layoutViews();
    this.publishSnapshot();
  }

  private bindViewEvents(tab: BrowserTab, tabSession: Electron.Session) {
    const wc = tab.view.webContents;
    this.bindBrowserShortcuts(wc);
    wc.setWindowOpenHandler((details) => {
      const url = details.url;
      void this.createTab({ url, private: tab.record.private });
      return { action: "deny" };
    });
    wc.on("page-title-updated", (_event, title) => {
      tab.record.title = title || "New Tab";
      this.updateWindowTitle();
      this.publishSnapshot();
    });
    wc.on("did-start-loading", () => {
      tab.record.loading = true;
      this.publishSnapshot();
    });
    wc.on("did-stop-loading", async () => {
      tab.record.loading = false;
      tab.record.url = wc.getURL();
      tab.record.favicon = this.buildFaviconUrl(wc.getURL());
      tab.record.shieldState = this.resolveShieldState(wc.getURL());
      void this.installPageEnhancements(tab);
      this.recordHistory(tab.record);
      this.applyPerformancePolicy(tab.record.id);
      this.updateWindowTitle();
      this.publishSnapshot();
    });
    wc.on("did-navigate", (_event, url) => {
      tab.record.url = url;
      tab.record.shieldState = this.resolveShieldState(url);
      this.publishSnapshot();
    });
    wc.on("found-in-page", () => this.publishSnapshot());
    wc.setBackgroundThrottling(this.getSettings().performanceProfile.backgroundTabPolicy !== "aggressive");
    tabSession.on("will-download", (_event, item) => {
      const entry: DownloadRecord = {
        id: `${Date.now()}`,
        fileName: item.getFilename(),
        url: item.getURL(),
        status: "progressing",
        receivedBytes: 0,
        totalBytes: item.getTotalBytes()
      };
      this.downloads = [entry, ...this.downloads];
      item.on("updated", () => {
        entry.receivedBytes = item.getReceivedBytes();
        entry.totalBytes = item.getTotalBytes();
        this.publishSnapshot();
      });
      item.once("done", (_evt, state) => {
        entry.status = state === "completed" ? "completed" : state === "cancelled" ? "cancelled" : "interrupted";
        entry.savePath = item.getSavePath();
        this.publishSnapshot();
      });
    });
  }

  private async installPageEnhancements(tab: BrowserTab) {
    if (tab.record.url.startsWith("space://")) return;
    await tab.view.webContents
      .executeJavaScript(
        `
        (() => {
          if (window.__spaceBrowserEnhancements) return true;
          window.__spaceBrowserEnhancements = true;
          document.addEventListener("auxclick", (event) => {
            if (event.button !== 1) return;
            const anchor = event.target && event.target.closest ? event.target.closest("a[href]") : null;
            if (!anchor || anchor.target || event.defaultPrevented) return;
            const href = anchor.href;
            if (!href || href.startsWith("javascript:")) return;
            event.preventDefault();
            window.open(href, "_blank", "noopener,noreferrer");
          }, true);
          return true;
        })();
      `,
        true
      )
      .catch(() => {});
  }

  private bindBrowserShortcuts(wc: Electron.WebContents) {
    wc.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") return;
      const key = input.key.toLowerCase();
      const ctrl = input.control || input.meta;
      if (ctrl && input.shift && key === "t") {
        event.preventDefault();
        void this.restoreClosedTab();
        return;
      }
      if (ctrl && input.shift && key === "n") {
        event.preventDefault();
        void this.createTab({ url: "space://start", private: true });
        return;
      }
      if (input.alt && input.shift && key === "n") {
        event.preventDefault();
        if (this.mainWindow) {
          void dialog.showMessageBox(this.mainWindow, {
            type: "info",
            title: "Space_ Private Window with Tor",
            message: "Tor routing is not enabled in this v1 build. Private windows use isolated in-memory browsing."
          });
        }
        return;
      }
      if (ctrl && key === "t") {
        event.preventDefault();
        void this.createTab({ url: "space://start", private: false });
        return;
      }
      if (ctrl && key === "w") {
        event.preventDefault();
        if (this.activeTabId) this.closeTab(this.activeTabId);
        return;
      }
      if (ctrl && key === "n") {
        event.preventDefault();
        this.openDetachedWindow("space://start", "Start Page");
      }
    });
  }

  private configureSession(tabSession: Electron.Session, options: { sidebar?: boolean } = {}) {
    const settings = this.getSettings();
    tabSession.webRequest.onBeforeRequest((details, callback) => {
      const merged = this.resolveShieldState(details.url);
      if (merged.httpsUpgrade && details.url.startsWith("http://")) {
        callback({ redirectURL: details.url.replace("http://", "https://") });
        return;
      }
      const cleanedUrl = merged.trackers ? this.stripTrackingParams(details.url) : details.url;
      if (cleanedUrl !== details.url) {
        callback({ redirectURL: cleanedUrl });
        return;
      }
      if ((merged.ads || merged.trackers) && blockedHosts.some((host) => details.url.includes(host))) {
        callback({ cancel: true });
        return;
      }
      callback({});
    });

    tabSession.webRequest.onBeforeSendHeaders((details, callback) => {
      const merged = this.resolveShieldState(details.url);
      details.requestHeaders["User-Agent"] = chromeLikeUserAgent;
      const requestContext = details as Electron.OnBeforeSendHeadersListenerDetails & { initiator?: string; referrer?: string };
      if (this.shouldStripCookies(details.url, requestContext.initiator ?? requestContext.referrer, merged.cookies)) {
        delete details.requestHeaders.Cookie;
      }
      callback({ requestHeaders: details.requestHeaders });
    });

    tabSession.setPermissionRequestHandler((_wc, permission, callback) => {
      if (options.sidebar && permission === "media") {
        callback(false);
        return;
      }
      callback(permission !== "notifications");
    });
    tabSession.setPermissionCheckHandler((_wc, permission) => {
      if (options.sidebar && permission === "media") return false;
      return permission !== "notifications";
    });

    if (settings.performanceProfile.throttleNetworkPreset !== "off") {
      // Scaffolding for devtools-network throttling; policy is reflected in UI/state.
    }
  }

  private resolveShieldState(url: string): ShieldConfig {
    const settings = this.getSettings();
    let resolved = { ...settings.shieldDefaults };
    const hostname = this.hostFor(url);
    const site = settings.siteShieldRules.find((entry: SiteShieldRule) => entry.hostname === hostname);
    if (site) {
      resolved = { ...resolved, ...site.overrides };
    }
    return resolved;
  }

  private hostFor(url: string) {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  }

  private shouldStripCookies(url: string, initiator: string | undefined, cookiePolicy: ShieldConfig["cookies"]) {
    if (cookiePolicy === "allow") return false;
    if (cookiePolicy === "block-all") return true;
    if (!initiator) return false;
    try {
      const requestHost = new URL(url).hostname;
      const initiatorHost = new URL(initiator).hostname;
      return requestHost !== initiatorHost;
    } catch {
      return false;
    }
  }

  private normalizeUrl(value: string) {
    const trimmed = value.trim();
    if (trimmed.startsWith("space://")) return trimmed;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return this.stripTrackingParams(trimmed);
    if (trimmed.includes(".") && !trimmed.includes(" ")) return this.stripTrackingParams(`https://${trimmed}`);
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }

  private stripTrackingParams(value: string) {
    try {
      const url = new URL(value);
      let changed = false;
      for (const param of trackingParams) {
        if (url.searchParams.has(param)) {
          url.searchParams.delete(param);
          changed = true;
        }
      }
      return changed ? url.toString() : value;
    } catch {
      return value;
    }
  }

  private isInternalStartUrl(value: string) {
    return value.trim().toLowerCase() === "space://start";
  }

  private isInternalSpaceUrl(value: string) {
    return value.trim().toLowerCase().startsWith("space://");
  }

  private setTabToInternalPage(tab: BrowserTab, url = "space://start") {
    tab.record.url = url;
    tab.record.title = this.internalPageTitle(url, tab.record.private);
    tab.record.loading = false;
    tab.record.favicon = undefined;
    tab.record.shieldState = { ...this.getSettings().shieldDefaults };
  }

  private internalPageTitle(url: string, isPrivate: boolean) {
    const value = url.trim().toLowerCase();
    if (value.startsWith("space://settings")) return "Settings";
    if (value.startsWith("space://extensions")) return "Extensions";
    if (value.startsWith("space://mods")) return "Mods";
    if (value.startsWith("space://history")) return "History";
    if (value.startsWith("space://bookmarks")) return "Bookmarks";
    if (value.startsWith("space://downloads")) return "Downloads";
    if (value.startsWith("space://notes")) return "Notes";
    return isPrivate ? "Private Start" : "Start Page";
  }

  private async handleTabAction(action: string, payload: Record<string, unknown>) {
    if (action === "new") return this.createTab({ url: typeof payload.url === "string" ? payload.url : "space://start", private: Boolean(payload.private) });
    if (action === "new-window") return this.openDetachedWindow("space://start", "Start Page");
    if (action === "close" && typeof payload.tabId === "string") return this.closeTab(payload.tabId);
    if (action === "detach" && typeof payload.tabId === "string") return this.detachTab(payload.tabId);
    if (action === "activate" && typeof payload.tabId === "string") return this.activateTab(payload.tabId);
    if (action === "restore-closed") return this.restoreClosedTab();
    if (action === "pin" && typeof payload.tabId === "string") return this.togglePin(payload.tabId);
    if (action === "back" && typeof payload.tabId === "string") return this.goBack(payload.tabId);
    if (action === "forward" && typeof payload.tabId === "string") return this.goForward(payload.tabId);
    if (action === "reload" && typeof payload.tabId === "string") return this.reloadTab(payload.tabId);
    if (action === "private-window") return this.createTab({ url: "space://start", private: true });
    if (action === "split" && typeof payload.tabId === "string") return this.splitTab(payload.tabId);
    if (action === "devtools" && typeof payload.tabId === "string") return this.openDevTools(payload.tabId);
    if (action === "wayback" && typeof payload.tabId === "string") return this.openWayback(payload.tabId);
    if (action === "speedreader" && typeof payload.tabId === "string") return this.applySpeedreader(payload.tabId);
    if (action === "close-sidebar") return this.closeSidebar();
    if (action === "toggle-sidebar-pin") return this.toggleSidebarPin();
  }

  private async navigate(tabId: string, value: string) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    const url = this.normalizeUrl(value);
    if (this.isInternalSpaceUrl(url)) {
      this.setTabToInternalPage(tab, url);
      this.activeTabId = tabId;
      this.layoutViews();
      this.publishSnapshot();
      this.updateWindowTitle();
      return;
    }

    tab.record.loading = true;
    tab.record.url = url;
    await this.loadTabUrl(tab, url);
    this.activeTabId = tabId;
    this.layoutViews();
    this.publishSnapshot();
  }

  private activateTab(tabId: string) {
    if (!this.tabs.has(tabId)) return;
    const previousActive = this.activeTabId && this.activeTabId !== tabId ? this.tabs.get(this.activeTabId) ?? null : null;
    void this.requestPictureInPictureForTab(previousActive, true);
    this.activeTabId = tabId;
    const tab = this.tabs.get(tabId)!;
    tab.record.lastActiveAt = Date.now();
    this.layoutViews();
    this.updateWindowTitle();
    this.publishSnapshot();
  }

  private closeTab(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    this.closedTabs.unshift({ ...tab.record });
    this.mainWindow?.removeBrowserView(tab.view);
    tab.view.webContents.close();
    this.tabs.delete(tabId);
    const next = [...this.tabs.keys()][0] ?? null;
    this.activeTabId = next;
    if (!next) {
      void this.createTab({ url: "space://start", private: false });
      return;
    }
    this.layoutViews();
    this.updateWindowTitle();
    this.publishSnapshot();
  }

  private async restoreClosedTab() {
    const entry = this.closedTabs.shift();
    if (!entry) return;
    await this.createTab({ url: entry.url, private: entry.private, pinned: entry.isPinned });
  }

  private togglePin(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    tab.record.isPinned = !tab.record.isPinned;
    this.publishSnapshot();
  }

  private goBack(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (tab?.view.webContents.navigationHistory.canGoBack()) {
      tab.view.webContents.navigationHistory.goBack();
    }
  }

  private goForward(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (tab?.view.webContents.navigationHistory.canGoForward()) {
      tab.view.webContents.navigationHistory.goForward();
    }
  }

  private reloadTab(tabId: string) {
    const tab = this.tabs.get(tabId);
    tab?.view.webContents.reload();
  }

  private async splitTab(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    tab.record.isSplitParticipant = true;
    await this.createTab({ url: tab.record.url, private: tab.record.private, split: true });
  }

  private openDevTools(tabId: string) {
    const tab = this.tabs.get(tabId);
    tab?.view.webContents.openDevTools({ mode: "detach" });
  }

  private async openWayback(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (!tab || tab.record.url.startsWith("space://")) return;
    await this.navigate(tabId, `https://web.archive.org/web/*/${tab.record.url}`);
  }

  private async applySpeedreader(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (!tab || tab.record.url.startsWith("space://")) return;
    await tab.view.webContents
      .executeJavaScript(
        `
        (() => {
          document.documentElement.classList.toggle("space-speedreader");
          let style = document.getElementById("space-speedreader-style");
          if (!style) {
            style = document.createElement("style");
            style.id = "space-speedreader-style";
            style.textContent = \`
              html.space-speedreader body { max-width: 860px !important; margin: 0 auto !important; padding: 32px !important; line-height: 1.7 !important; background: #11131a !important; color: #f4f6ff !important; }
              html.space-speedreader header, html.space-speedreader nav, html.space-speedreader aside, html.space-speedreader footer, html.space-speedreader iframe, html.space-speedreader [role="banner"], html.space-speedreader [role="navigation"], html.space-speedreader [aria-label*="ad" i] { display: none !important; }
              html.space-speedreader article, html.space-speedreader main, html.space-speedreader p { color: #f4f6ff !important; font-family: Georgia, "Times New Roman", serif !important; }
              html.space-speedreader a { color: #8bc3ff !important; }
              html.space-speedreader img, html.space-speedreader video { max-width: 100% !important; height: auto !important; }
            \`;
            document.head.append(style);
          }
          return document.documentElement.classList.contains("space-speedreader");
        })();
      `,
        true
      )
      .catch(() => {});
  }

  private reorderTab(tabId: string, targetTabId: string) {
    if (tabId === targetTabId || !this.tabs.has(tabId) || !this.tabs.has(targetTabId)) return;
    const moving = this.tabs.get(tabId)!;
    const reordered = new Map<string, BrowserTab>();
    for (const [id, tab] of this.tabs) {
      if (id === tabId) continue;
      if (id === targetTabId) reordered.set(tabId, moving);
      reordered.set(id, tab);
    }
    this.tabs = reordered;
    this.publishSnapshot();
  }

  private detachTab(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    const url = tab.record.url;
    const title = tab.record.title;
    this.closeTab(tabId);
    this.openDetachedWindow(url, title);
  }

  private openDetachedWindow(url: string, title: string) {
    const detachedWindow = new BrowserWindow({
      width: 1180,
      height: 780,
      minWidth: 900,
      minHeight: 620,
      frame: false,
      title: `Space_ - ${title}`,
      backgroundColor: "#08070d",
      icon: path.join(app.getAppPath(), "assets", "app.ico")
    });
    const detachedView = new BrowserView({
      webPreferences: {
        partition: "persist:space-default",
        sandbox: true
      }
    });
    detachedView.webContents.setUserAgent(chromeLikeUserAgent);
    detachedWindow.addBrowserView(detachedView);
    const layout = () => {
      const [width, height] = detachedWindow.getContentSize();
      detachedView.setBounds({ x: 0, y: 0, width, height });
      detachedView.setAutoResize({ width: true, height: true });
    };
    detachedWindow.on("resize", layout);
    layout();
    detachedView.webContents.setWindowOpenHandler((details) => {
      this.openDetachedWindow(details.url, "New Window");
      return { action: "deny" };
    });
    void detachedView.webContents.loadURL(this.isInternalStartUrl(url) ? "https://www.google.com" : this.normalizeUrl(url));
  }

  private controlWindow(action: unknown) {
    if (!this.mainWindow) return;
    if (action === "minimize") this.mainWindow.minimize();
    if (action === "maximize") {
      if (this.mainWindow.isMaximized()) this.mainWindow.unmaximize();
      else this.mainWindow.maximize();
    }
    if (action === "close") this.mainWindow.close();
    this.publishSnapshot();
  }

  private openSidebarApp(appId: string) {
    if (this.activeSidebarAppId === appId && this.sidebarOpen) {
      this.closeSidebar();
      return;
    }

    this.activeSidebarAppId = appId;
    this.sidebarOpen = true;
    if (!this.mainWindow) return;

    if (!this.sidebarView) {
      this.sidebarView = new BrowserView({
        webPreferences: {
          partition: "persist:space-sidebar",
          sandbox: true
        }
      });
      this.sidebarView.webContents.setUserAgent(chromeLikeUserAgent);
      this.sidebarView.webContents.on("dom-ready", () => {
        void this.disableSidebarPasskeys();
      });
      this.sidebarView.webContents.setWindowOpenHandler((details) => {
        void this.createTab({ url: details.url, private: false });
        return { action: "deny" };
      });
      this.mainWindow.addBrowserView(this.sidebarView);
    }

    const appEntry = sidebarApps.find((entry) => entry.id === appId);
    if (!appEntry) return;
    if (appEntry.type === "social" || appEntry.type === "ai") {
      this.sidebarWidth = this.clampSidebarWidth(Math.max(this.sidebarWidth, 640));
    }

    if (!appEntry.url.startsWith("space://")) {
      void this.loadSidebarUrl(appEntry.url);
    }
    this.layoutViews();
    this.publishSnapshot();
  }

  private async loadTabUrl(tab: BrowserTab, url: string) {
    try {
      await tab.view.webContents.loadURL(url);
    } catch (error) {
      if (this.isAbortedNavigation(error)) return;
      tab.record.loading = false;
      tab.record.title = "Load failed";
      this.publishSnapshot();
      throw error;
    }
  }

  private async loadSidebarUrl(url: string) {
    if (!this.sidebarView) return;
    try {
      await this.sidebarView.webContents.loadURL(url);
      await this.disableSidebarPasskeys();
    } catch (error) {
      if (this.isAbortedNavigation(error)) return;
      throw error;
    }
  }

  private async disableSidebarPasskeys() {
    if (!this.sidebarView || this.sidebarView.webContents.isDestroyed()) return;
    await this.sidebarView.webContents
      .executeJavaScript(
        `
        (() => {
          if (window.__spaceSidebarPasskeyGuard) return true;
          window.__spaceSidebarPasskeyGuard = true;
          const message = "Passkeys are disabled in Space_ sidebar panels. Open this service in a full tab if you want to use Windows passkey sign-in.";
          try {
            if (navigator.credentials) {
              const proto = Object.getPrototypeOf(navigator.credentials);
              const nativeGet = navigator.credentials.get ? navigator.credentials.get.bind(navigator.credentials) : null;
              const nativeCreate = navigator.credentials.create ? navigator.credentials.create.bind(navigator.credentials) : null;
              Object.defineProperty(proto, "get", {
                configurable: true,
                value(options) {
                  if (options && options.publicKey) return Promise.reject(new DOMException(message, "NotAllowedError"));
                  return nativeGet ? nativeGet(options) : Promise.resolve(null);
                }
              });
              Object.defineProperty(proto, "create", {
                configurable: true,
                value(options) {
                  if (options && options.publicKey) return Promise.reject(new DOMException(message, "NotAllowedError"));
                  return nativeCreate ? nativeCreate(options) : Promise.resolve(null);
                }
              });
            }
            Object.defineProperty(window, "PublicKeyCredential", { configurable: true, value: undefined });
          } catch {}
          return true;
        })();
      `,
        true
      )
      .catch(() => {});
  }

  private async requestPictureInPicture(tabId?: string) {
    const tab = tabId ? this.tabs.get(tabId) : this.activeTabId ? this.tabs.get(this.activeTabId) : null;
    const result = await this.requestPictureInPictureForTab(tab ?? null, false);
    if (!result.ok && this.mainWindow) {
      dialog.showMessageBox(this.mainWindow, {
        type: "info",
        title: "Space_ Picture in Picture",
        message: result.reason ?? "No active playing video was found on this page."
      });
    }
    return result;
  }

  private async requestPictureInPictureForTab(tab: BrowserTab | null, automatic: boolean): Promise<{ ok: boolean; reason?: string; mode?: string }> {
    if (!tab) return { ok: false, reason: "No active tab." };
    const settings = this.getSettings();
    if (automatic && !settings.autoPictureInPicture) {
      return { ok: false, reason: "Auto Picture in Picture is off." };
    }
    if (tab.record.url.startsWith("space://")) {
      return { ok: false, reason: "Picture in Picture needs a web page with a playing video." };
    }

    const opacity = Math.max(0.55, Math.min(1, settings.pictureInPictureOpacity ?? 0.92));
    const script = `
      (async () => {
        const videos = Array.from(document.querySelectorAll("video"))
          .filter((video) => !video.paused && !video.ended && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0)
          .sort((a, b) => (b.videoWidth * b.videoHeight) - (a.videoWidth * a.videoHeight));
        const video = videos[0];
        if (!video) return { ok: false, reason: "No active playing video was found on this page." };
        video.disablePictureInPicture = false;

        if ("documentPictureInPicture" in window && window.documentPictureInPicture && window.documentPictureInPicture.requestWindow) {
          if (window.__spacePipWindow && !window.__spacePipWindow.closed) {
            return { ok: true, mode: "document-picture-in-picture" };
          }
          const placeholder = document.createComment("space-picture-in-picture-placeholder");
          video.parentNode && video.parentNode.insertBefore(placeholder, video);
          const pipWindow = await window.documentPictureInPicture.requestWindow({
            width: Math.min(720, Math.max(360, video.videoWidth || 520)),
            height: Math.min(420, Math.max(220, video.videoHeight || 300))
          });
          window.__spacePipWindow = pipWindow;
          pipWindow.document.body.innerHTML =
            '<style>html,body{width:100%;height:100%;margin:0;overflow:hidden;background:rgba(0,0,0,.18);}video{width:100%;height:100%;object-fit:contain;background:rgba(0,0,0,.18);}</style>';
          video.dataset.spacePipOpacity = video.style.opacity || "";
          video.style.opacity = "${opacity}";
          pipWindow.document.body.append(video);
          pipWindow.addEventListener("pagehide", () => {
            video.style.opacity = video.dataset.spacePipOpacity || "";
            delete video.dataset.spacePipOpacity;
            if (placeholder.parentNode) {
              placeholder.parentNode.insertBefore(video, placeholder);
              placeholder.remove();
            }
          }, { once: true });
          return { ok: true, mode: "transparent-document-picture-in-picture" };
        }

        if (document.pictureInPictureElement === video) return { ok: true, mode: "native-picture-in-picture" };
        await video.requestPictureInPicture();
        return { ok: true, mode: "native-picture-in-picture" };
      })();
    `;

    try {
      return (await tab.view.webContents.executeJavaScript(script, true)) as { ok: boolean; reason?: string; mode?: string };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : "Picture in Picture could not start." };
    }
  }

  private isAbortedNavigation(error: unknown) {
    return Boolean(
      error &&
        typeof error === "object" &&
        ((error as { code?: string; errno?: number }).code === "ERR_ABORTED" || (error as { errno?: number }).errno === -3)
    );
  }

  private closeSidebar() {
    this.sidebarOpen = false;
    this.activeSidebarAppId = null;
    this.layoutViews();
    this.publishSnapshot();
  }

  private toggleSidebarPin() {
    this.sidebarPinned = !this.sidebarPinned;
    this.layoutViews();
    this.publishSnapshot();
  }

  private activeSidebarUsesBrowserView() {
    const appEntry = sidebarApps.find((entry) => entry.id === this.activeSidebarAppId);
    return Boolean(appEntry && !appEntry.url.startsWith("space://"));
  }

  private clampSidebarWidth(width: number) {
    const [windowWidth] = this.mainWindow?.getContentSize() ?? [1600, 980];
    const available = windowWidth - railWidth - 260;
    const maxWidth = Math.max(360, Math.min(900, available));
    return Math.max(360, Math.min(maxWidth, width));
  }

  private layoutViews() {
    if (!this.mainWindow) return;
    const [width, height] = this.mainWindow.getContentSize();
    this.sidebarWidth = this.clampSidebarWidth(this.sidebarWidth);
    const dockedSidebarWidth = this.sidebarOpen && this.sidebarPinned ? this.sidebarWidth : 0;
    const panelWidth = this.sidebarOpen ? this.sidebarWidth : 0;
    const contentX = railWidth + dockedSidebarWidth;
    const mainWidth = width - contentX;
    const browserWidth = Math.max(240, mainWidth);
    const splitTabs = [...this.tabs.values()].filter((tab) => tab.record.isSplitParticipant);
    const active = this.activeTabId ? this.tabs.get(this.activeTabId) : null;
    const showBrowserSurface = !(active?.record.url.startsWith("space://"));
    const visibleViews: BrowserView[] = [];

    for (const tab of this.tabs.values()) {
      const isActive = this.activeTabId === tab.record.id || (splitTabs.length > 0 && tab.record.isSplitParticipant);
      const shouldShow = isActive && showBrowserSurface;
      tab.view.setBounds({ x: contentX, y: chromeHeight, width: browserWidth, height: height - chromeHeight });
      tab.view.webContents.setAudioMuted(tab.record.isMuted);
      tab.view.setAutoResize({ width: true, height: true });
      tab.view.webContents.setBackgroundThrottling(this.getSettings().performanceProfile.backgroundTabPolicy === "balanced");
      tab.view.webContents.setVisualZoomLevelLimits(1, 3).catch(() => {});
      if (!shouldShow) {
        tab.view.setBounds({ x: -20000, y: -20000, width: 10, height: 10 });
      } else {
        visibleViews.push(tab.view);
      }
    }

    if (splitTabs.length >= 2) {
      const visible = splitTabs.slice(0, 2);
      const splitWidth = Math.floor(browserWidth / 2);
      visible[0].view.setBounds({ x: contentX, y: chromeHeight, width: splitWidth, height: height - chromeHeight });
      visible[1].view.setBounds({ x: contentX + splitWidth, y: chromeHeight, width: browserWidth - splitWidth, height: height - chromeHeight });
      visibleViews.push(visible[0].view, visible[1].view);
    }

    for (const view of visibleViews) {
      this.mainWindow.setTopBrowserView(view);
      view.webContents.focus();
    }

    if (this.sidebarView) {
      if (this.sidebarOpen && this.activeSidebarUsesBrowserView()) {
        this.sidebarView.setBounds({ x: railWidth, y: sidebarHeaderHeight, width: Math.max(320, panelWidth - sidebarResizeGutter), height: height - sidebarHeaderHeight });
        this.sidebarView.setAutoResize({ height: true });
        this.mainWindow.setTopBrowserView(this.sidebarView);
      } else {
        this.sidebarView.setBounds({ x: -10000, y: -10000, width: 10, height: 10 });
      }
    }
  }

  private updateWindowTitle() {
    if (!this.mainWindow) return;
    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : null;
    this.mainWindow.setTitle(tab ? `Space_ - ${tab.record.title}` : "Space_");
  }

  private recordHistory(tab: TabRecord) {
    if (tab.private) return;
    const history = appStore.get("history") ?? [];
    const entry: HistoryRecord = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      title: tab.title,
      url: tab.url,
      visitedAt: Date.now()
    };
    appStore.set("history", [entry, ...history].slice(0, 400));
  }

  private toggleBookmark(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    const bookmarks = appStore.get("bookmarks") ?? [];
    const existing = bookmarks.find((entry: BookmarkRecord) => entry.url === tab.record.url);
    if (existing) {
      appStore.set("bookmarks", bookmarks.filter((entry: BookmarkRecord) => entry.id !== existing.id));
    } else {
      const bookmark: BookmarkRecord = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        title: tab.record.title,
        url: tab.record.url,
        createdAt: Date.now()
      };
      appStore.set("bookmarks", [bookmark, ...bookmarks]);
    }
    this.publishSnapshot();
  }

  private async importMods() {
    if (!this.mainWindow) return;
    const result = await dialog.showOpenDialog(this.mainWindow, {
      properties: ["openFile"],
      filters: [{ name: "JSON Mods", extensions: ["json"] }]
    });
    if (result.canceled || result.filePaths.length === 0) return;
    const raw = await fs.readFile(result.filePaths[0], "utf8");
    const mod = JSON.parse(raw) as ModManifest;
    const mods = appStore.get("mods") ?? [];
    appStore.set("mods", [...mods.filter((entry: ModManifest & { enabled: boolean }) => entry.id !== mod.id), { ...mod, enabled: true }]);
    this.publishSnapshot();
  }

  private async exportMods() {
    if (!this.mainWindow) return;
    const result = await dialog.showSaveDialog(this.mainWindow, {
      defaultPath: "space-mods.json",
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (result.canceled || !result.filePath) return;
    await fs.writeFile(result.filePath, JSON.stringify(appStore.get("mods") ?? [], null, 2), "utf8");
  }

  private async runAiAction(payload: AiActionPayload) {
    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : null;
    if (!tab) return;
    const selected = await tab.view.webContents.executeJavaScript("window.getSelection ? String(window.getSelection()) : ''", true).catch(() => "");
    const url = tab.record.url;
    const title = tab.record.title;
    const appEntry = sidebarApps.find((entry) => entry.id === payload.providerId);
    const targetUrl = appEntry?.url ?? this.getSettings().customAiUrl;
    this.openSidebarApp(payload.providerId);
    if (this.sidebarView) {
      const query = encodeURIComponent(`${payload.action.toUpperCase()}\n\nTitle: ${title}\nURL: ${url}\n\n${selected || "Use the current page context."}`);
      if (targetUrl.includes("chat.openai.com")) {
        await this.loadSidebarUrl(`${targetUrl}/?q=${query}`);
      }
    }
  }

  private async takeScreenshot() {
    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : null;
    if (!tab || !this.mainWindow) return;
    const image = await tab.view.webContents.capturePage();
    const result = await dialog.showSaveDialog(this.mainWindow, {
      defaultPath: `space-shot-${Date.now()}.png`,
      filters: [{ name: "PNG", extensions: ["png"] }]
    });
    if (!result.canceled && result.filePath) {
      await fs.writeFile(result.filePath, image.toPNG());
      shell.showItemInFolder(result.filePath);
    }
  }

  private async runCleaner(targets: string[]) {
    const tabSessions = new Set([...this.tabs.values()].map((entry) => session.fromPartition(entry.partition)));
    for (const tabSession of tabSessions) {
      if (targets.includes("cache")) await tabSession.clearCache();
      if (targets.includes("cookies")) await tabSession.clearStorageData({ storages: ["cookies"] });
      if (targets.includes("storage")) await tabSession.clearStorageData();
    }
  }

  private async loadUnpackedExtension() {
    if (!this.mainWindow) return;
    const result = await dialog.showOpenDialog(this.mainWindow, {
      title: "Load unpacked extension",
      properties: ["openDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) return;
    try {
      await session.defaultSession.loadExtension(result.filePaths[0], { allowFileAccess: true });
      await dialog.showMessageBox(this.mainWindow, {
        type: "info",
        title: "Extension loaded",
        message: "The unpacked extension was loaded for this Space_ session."
      });
    } catch (error) {
      await dialog.showMessageBox(this.mainWindow, {
        type: "error",
        title: "Extension could not be loaded",
        message: error instanceof Error ? error.message : "Space_ could not load this unpacked extension."
      });
    }
  }

  private async openChromeWebStore(tabId?: string) {
    const url = "https://chromewebstore.google.com/";
    const target = tabId ? this.tabs.get(tabId) : this.activeTabId ? this.tabs.get(this.activeTabId) : null;
    if (target) {
      await this.navigate(target.record.id, url);
      return;
    }
    await this.createTab({ url, private: false });
  }

  private applyPerformancePolicy(tabId: string) {
    const profile = this.getSettings().performanceProfile;
    const now = Date.now();
    for (const [id, tab] of this.tabs) {
      if (id === tabId) continue;
      if (profile.backgroundTabPolicy === "aggressive" && now - tab.record.lastActiveAt > profile.suspendThresholdMinutes * 60_000) {
        tab.record.isSuspended = true;
        tab.view.webContents.setBackgroundThrottling(false);
      }
    }
  }

  private buildFaviconUrl(url: string) {
    try {
      const { origin } = new URL(url);
      return `${origin}/favicon.ico`;
    } catch {
      return undefined;
    }
  }

  private snapshot(): BrowserStateSnapshot {
    return {
      tabs: [...this.tabs.values()]
        .map((entry) => ({ ...entry.record })),
      activeTabId: this.activeTabId,
      bookmarks: appStore.get("bookmarks") ?? [],
      history: appStore.get("history") ?? [],
      downloads: this.downloads,
      settings: this.getSettings(),
      sidebarOpen: this.sidebarOpen,
      sidebarPinned: this.sidebarPinned,
      sidebarWidth: this.sidebarWidth,
      activeSidebarAppId: this.activeSidebarAppId,
      utilityDockOpen: this.utilityDockOpen,
      isMaximized: this.mainWindow?.isMaximized() ?? false
    };
  }

  private publishSnapshot() {
    if (!this.mainWindow) return;
    this.mainWindow.webContents.send(IPC_CHANNELS.browserSnapshot, this.snapshot());
  }
}
