import { app, BrowserView, BrowserWindow, dialog, ipcMain, Menu, session, shell } from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { ElectronBlocker, Request } from "@cliqz/adblocker-electron";
import { canUpgrade, shouldBlockCookies } from "./privacy";
import { parse as parseDomain } from "tldts";
import { z } from "zod";
import { appStore } from "./store";
import { IPC_CHANNELS } from "../shared/ipc";
import { defaultSettings, defaultShieldConfig, sidebarApps } from "../shared/defaults";
import type {
  AiActionPayload,
  AppSettings,
  BookmarkRecord,
  BrowserStateSnapshot,
  DownloadRecord,
  ExtensionRecord,
  HistoryRecord,
  ModManifest,
  NavigationHistoryEntry,
  ShieldConfig,
  SiteShieldRule,
  TabRecord
} from "../shared/types";

type BrowserTab = {
  record: TabRecord;
  view: BrowserView;
  partition: string;
};

const colorModSchema = z.object({
  id: z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9._-]*$/i),
  name: z.string().min(1).max(80),
  version: z.string().min(1).max(32),
  author: z.string().min(1).max(80),
  description: z.string().max(240),
  enabled: z.boolean().optional(),
  themeTokens: z.object({
    accent: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    accentAlt: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    bg: z.string().regex(/^#[0-9a-f]{6}$/i).optional()
  }).strict().optional(),
  shaders: z.array(z.string().max(64)).max(16).optional()
}).strip();

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
const forceDarkStyle = `
  html.space-force-dark {
    color-scheme: dark !important;
    background: #05070c !important;
  }
  html.space-force-dark body {
    background: #05070c !important;
    color: #f8fafc !important;
  }
  html.space-force-dark :where(body, main, article, section, aside, header, footer, nav, div, form, table, tbody, thead, tr, td, th, ul, ol, li, p, span, label, summary, details):not([class*="logo" i]):not([id*="logo" i]) {
    background-color: transparent !important;
    color: #f8fafc !important;
    border-color: #475569 !important;
    text-shadow: none !important;
  }
  html.space-force-dark :where(main, article, section, aside, header, footer, nav, form, table, dialog, [role="dialog"], [role="menu"], [role="listbox"], [class*="card" i], [class*="panel" i], [class*="modal" i], [class*="popover" i], [class*="dropdown" i]) {
    background-color: #0b1220 !important;
    color: #f8fafc !important;
  }
  html.space-force-dark :where(input, textarea, select, button, [contenteditable="true"]) {
    background-color: #111827 !important;
    color: #ffffff !important;
    border-color: #64748b !important;
    caret-color: #ffffff !important;
  }
  html.space-force-dark :where(a, a *, [role="link"], [role="link"] *) {
    color: #8ecbff !important;
  }
  html.space-force-dark :where(h1, h2, h3, h4, h5, h6, strong, b) {
    color: #ffffff !important;
  }
  html.space-force-dark :where(small, time, code, pre, blockquote) {
    color: #dbeafe !important;
  }
  html.space-force-dark :where(svg, img, video, canvas, picture, iframe) {
    filter: none !important;
  }
  html.space-force-dark ::selection {
    background: #38bdf8 !important;
    color: #020617 !important;
  }
`;

export class SpaceBrowserApp {
  private static controllers = new Set<SpaceBrowserApp>();
  private static channels = new Set<string>();
  private static pageZoomHandlerRegistered = false;
  private static downloadSessions = new WeakSet<Electron.Session>();
  private handlers = new Map<string, (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any>();
  private privateWindow = false;
  private privatePartition = `space-private-${randomUUID()}`;
  private privateShieldRules = new Map<string, SiteShieldRule>();
  private privateForceDarkRules = new Map<string, boolean>();

  private handleIpc(channel: string, handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any) {
    this.handlers.set(channel, handler);
    if (SpaceBrowserApp.channels.has(channel)) return;
    SpaceBrowserApp.channels.add(channel);
    ipcMain.handle(channel, (event, ...args) => {
      const owner = [...SpaceBrowserApp.controllers].find(controller =>
        controller.mainWindow?.webContents === event.sender);
      if (!owner || event.senderFrame !== event.sender.mainFrame) throw new Error("Untrusted IPC sender");
      return owner.handlers.get(channel)?.(event, ...args);
    });
  }
  private mainWindow: BrowserWindow | null = null;
  private sidebarView: BrowserView | null = null;
  private tabs = new Map<string, BrowserTab>();
  private downloads: DownloadRecord[] = [];
  private closedTabs: TabRecord[] = [];
  private activeTabId: string | null = null;
  private sidebarOpen = false;
  private sidebarPinned = false;
  private sidebarWidth = 380;
  private sidebarResizeActive = false;
  private sidebarResizeSnapshotTimer: ReturnType<typeof setTimeout> | null = null;
  private utilityDockWidth = 372;
  private activeSidebarAppId: string | null = null;
  private utilityDockOpen = false;
  private blocker: ElectronBlocker | null = null;
  private trackerBlocker: ElectronBlocker | null = null;
  private snapshotTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly rendererUrl = process.env.VITE_DEV_SERVER_URL;
  private static configuredSessions = new WeakSet<Electron.Session>();

  async start() {
    await app.whenReady();
    await this.loadBlocker();
    this.configureSession(session.defaultSession);
    this.configureSession(session.fromPartition("persist:space-sidebar"), { sidebar: true });
    this.registerPageZoomHandler();
    this.registerProtocols();
    this.createWindow();
    this.registerIpc();
    this.registerAppEvents();
    await this.createTab({ url: "space://start", private: false });
  }

  private async loadBlocker() {
    try {
      const directory = path.join(app.getAppPath(), "assets", "filters");
      this.blocker = ElectronBlocker.parse(await fs.readFile(path.join(directory, "easylist.txt"), "utf8"));
      this.trackerBlocker = ElectronBlocker.parse(await fs.readFile(path.join(directory, "easyprivacy.txt"), "utf8"));
    } catch (error) {
      throw new Error(`Bundled privacy filters could not be loaded: ${String(error)}`);
    }
  }

  private registerProtocols() {
    app.setName("Space_");
  }

  private registerPageZoomHandler() {
    if (SpaceBrowserApp.pageZoomHandlerRegistered) return;
    SpaceBrowserApp.pageZoomHandlerRegistered = true;
    ipcMain.on(IPC_CHANNELS.pageZoom, (event, delta: unknown) => {
      if (event.senderFrame !== event.sender.mainFrame || typeof delta !== "number" || !Number.isFinite(delta)) return;
      for (const controller of SpaceBrowserApp.controllers) {
        const tab = [...controller.tabs.values()].find(entry => entry.view.webContents === event.sender);
        if (tab) {
          controller.adjustZoom(tab.record.id, Math.max(-0.1, Math.min(0.1, delta)));
          return;
        }
      }
    });
  }

  private createWindow() {
    SpaceBrowserApp.controllers.add(this);
    this.mainWindow = new BrowserWindow({
      width: 1600,
      height: 980,
      minWidth: 760,
      minHeight: 520,
      title: "Space_",
      frame: false,
      backgroundColor: "#09070d",
      autoHideMenuBar: true,
      icon: this.appIconPath(),
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
      for (const tab of this.tabs.values()) tab.view.webContents.close();
      this.sidebarView?.webContents.close();
      this.tabs.clear();
      if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
      SpaceBrowserApp.controllers.delete(this);
      if (this.privateWindow) void session.fromPartition(this.privatePartition).clearStorageData();
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
    this.handleIpc(IPC_CHANNELS.browserSnapshot, () => this.snapshot());
    this.handleIpc(IPC_CHANNELS.tabAction, async (_event, { action, payload }) => this.handleTabAction(action, payload ?? {}));
    this.handleIpc(IPC_CHANNELS.tabReorder, async (_event, { tabId, targetTabId }) => {
      if (typeof tabId === "string" && typeof targetTabId === "string") this.reorderTab(tabId, targetTabId);
    });
    this.handleIpc(IPC_CHANNELS.navigationHistory, async (_event, { tabId }) => (typeof tabId === "string" ? this.getNavigationHistory(tabId) : []));
    this.handleIpc(IPC_CHANNELS.navigate, async (_event, { tabId, value }) => this.navigate(tabId, value));
    this.handleIpc(IPC_CHANNELS.sidebarOpen, async (_event, { appId }) => this.openSidebarApp(appId));
    this.handleIpc(IPC_CHANNELS.sidebarResize, async (_event, { width, pinned }) => {
      const pinChanged = this.sidebarPinned !== pinned;
      this.sidebarWidth = this.clampSidebarWidth(width);
      this.sidebarPinned = pinned;
      this.layoutViews();
      if (pinChanged) this.publishSnapshot();
    });
    this.handleIpc(IPC_CHANNELS.sidebarDragStart, async () => {
      this.sidebarResizeActive = true;
      for (const tab of this.tabs.values()) tab.view.webContents.send(IPC_CHANNELS.sidebarDragStart);
    });
    this.handleIpc(IPC_CHANNELS.sidebarDragEnd, async () => this.stopSidebarResize());
    ipcMain.on(IPC_CHANNELS.sidebarDragPointer, (event, screenX: unknown) => {
      if (!this.sidebarResizeActive || typeof screenX !== "number" || !Number.isFinite(screenX)) return;
      const tab = [...this.tabs.values()].find(entry => entry.view.webContents === event.sender);
      if (!tab) return;
      const contentX = this.mainWindow?.getContentBounds().x ?? 0;
      this.sidebarWidth = this.clampSidebarWidth(screenX - contentX - railWidth);
      this.layoutViews();
      if (!this.sidebarResizeSnapshotTimer) {
        this.sidebarResizeSnapshotTimer = setTimeout(() => {
          this.sidebarResizeSnapshotTimer = null;
          this.publishSnapshot();
        }, 40);
      }
    });
    ipcMain.on(IPC_CHANNELS.sidebarDragEnd, (event) => {
      if ([...this.tabs.values()].some(tab => tab.view.webContents === event.sender)) this.stopSidebarResize();
    });
    this.handleIpc(IPC_CHANNELS.uiSetUtilityDock, async (_event, { open, width }) => {
      const nextOpen = Boolean(open);
      const visibilityChanged = this.utilityDockOpen !== nextOpen;
      this.utilityDockOpen = nextOpen;
      if (typeof width === "number" && Number.isFinite(width)) {
        this.utilityDockWidth = Math.max(320, Math.min(680, Math.round(width)));
      }
      this.layoutViews();
      if (visibilityChanged) this.publishSnapshot();
    });
    this.handleIpc(IPC_CHANNELS.windowControl, async (_event, { action }) => this.controlWindow(action));
    this.handleIpc(IPC_CHANNELS.settingsPatch, async (_event, patch) => {
      const previous = this.getSettings();
      const settings = { ...previous, ...patch } as AppSettings;
      appStore.set("settings", settings);
      if (
        Object.prototype.hasOwnProperty.call(patch, "forceDarkPages") ||
        Object.prototype.hasOwnProperty.call(patch, "forceDarkSiteRules")
      ) {
        void this.applyForceDarkToAllViews();
      }
      this.publishSnapshot();
    });
    this.handleIpc(IPC_CHANNELS.shieldSetGlobal, async (_event, patch) => {
      const settings = this.getSettings();
      appStore.set("settings", { ...settings, shieldDefaults: { ...settings.shieldDefaults, ...patch } });
      this.publishSnapshot();
    });
    this.handleIpc(IPC_CHANNELS.shieldSetSite, async (_event, rule: SiteShieldRule) => {
      if (!/^[a-z0-9.-]+$/i.test(rule.hostname) || !rule.hostname.includes(".")) return;
      if (this.privateWindow) {
        this.privateShieldRules.set(rule.hostname, rule);
        this.publishSnapshot();
        return;
      }
      const settings = this.getSettings();
      const rest = settings.siteShieldRules.filter((entry: SiteShieldRule) => entry.hostname !== rule.hostname);
      appStore.set("settings", { ...settings, siteShieldRules: [...rest, rule] });
      this.publishSnapshot();
    });
    this.handleIpc(IPC_CHANNELS.bookmarksToggle, async (_event, { tabId }) => this.toggleBookmark(tabId));
    this.handleIpc(IPC_CHANNELS.historyClear, async () => {
      appStore.set("history", []);
      this.publishSnapshot();
    });
    this.handleIpc(IPC_CHANNELS.historyDelete, async (_event, { id }) => {
      const history = appStore.get("history") ?? [];
      appStore.set(
        "history",
        history.filter((entry: HistoryRecord) => entry.id !== id)
      );
      this.publishSnapshot();
    });
    this.handleIpc(IPC_CHANNELS.modsImport, async () => this.importMods());
    this.handleIpc(IPC_CHANNELS.modsExport, async () => this.exportMods());
    this.handleIpc(IPC_CHANNELS.modsToggle, async (_event, { modId, enabled }) => {
      const mods = (appStore.get("mods") ?? []).map((mod: ModManifest & { enabled: boolean }) => (mod.id === modId ? { ...mod, enabled } : mod));
      appStore.set("mods", mods);
      this.publishSnapshot();
    });
    this.handleIpc(IPC_CHANNELS.aiRun, async (_event, payload: AiActionPayload) => this.runAiAction(payload));
    this.handleIpc(IPC_CHANNELS.pipRequest, async (_event, { tabId }) => this.requestPictureInPicture(typeof tabId === "string" ? tabId : undefined));
    this.handleIpc(IPC_CHANNELS.extensionsList, async () => this.listExtensions());
    this.handleIpc(IPC_CHANNELS.extensionLoadUnpacked, async () => this.loadUnpackedExtension());
    this.handleIpc(IPC_CHANNELS.extensionOpenStore, async (_event, { tabId }) => this.openChromeWebStore(typeof tabId === "string" ? tabId : undefined));
    this.handleIpc(IPC_CHANNELS.screenshot, async () => this.takeScreenshot());
    this.handleIpc(IPC_CHANNELS.cleaner, async (_event, targets: string[]) => this.runCleaner(targets));
  }

  private getSettings() {
    const stored = appStore.get("settings") ?? {};
    return {
      ...defaultSettings,
      ...stored,
      shieldDefaults: { ...defaultSettings.shieldDefaults, ...(stored as Partial<AppSettings>).shieldDefaults },
      performanceProfile: { ...defaultSettings.performanceProfile, ...(stored as Partial<AppSettings>).performanceProfile },
      sidebarApps: this.mergeSidebarApps((stored as Partial<AppSettings>).sidebarApps),
      startPageWidgets: (stored as Partial<AppSettings>).startPageWidgets ?? defaultSettings.startPageWidgets,
      siteShieldRules: (stored as Partial<AppSettings>).siteShieldRules ?? defaultSettings.siteShieldRules,
      notes: (stored as Partial<AppSettings>).notes ?? defaultSettings.notes,
      hiddenSpeedDialIds: (stored as Partial<AppSettings>).hiddenSpeedDialIds ?? defaultSettings.hiddenSpeedDialIds,
      pinnedExtensions: (stored as Partial<AppSettings>).pinnedExtensions ?? defaultSettings.pinnedExtensions,
      forceDarkPages: (stored as Partial<AppSettings>).forceDarkPages ?? defaultSettings.forceDarkPages,
      forceDarkSiteRules: (stored as Partial<AppSettings>).forceDarkSiteRules ?? defaultSettings.forceDarkSiteRules,
      speedDial: (stored as Partial<AppSettings>).speedDial ?? defaultSettings.speedDial
    } as AppSettings;
  }

  private mergeSidebarApps(storedApps?: string[]) {
    if (!storedApps) return defaultSettings.sidebarApps;
    const known = new Set(sidebarApps.map((entry) => entry.id));
    const cleaned = storedApps.filter((id) => known.has(id));
    return cleaned;
  }

  private createPartition(isPrivate: boolean) {
    return isPrivate ? this.privatePartition : "persist:space-default";
  }

  private async createTab(input: { url: string; private: boolean; pinned?: boolean; split?: boolean }) {
    input.private = this.privateWindow || input.private;
    const previousActive = this.activeTabId ? this.tabs.get(this.activeTabId) ?? null : null;
    const id = `tab-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const partition = this.createPartition(input.private);
    const tabSession = session.fromPartition(partition, { cache: !input.private });
    this.configureSession(tabSession);

    const view = new BrowserView({
      webPreferences: {
        partition,
        preload: path.join(app.getAppPath(), "dist", "preload", "page.js"),
        sandbox: true,
        backgroundThrottling: true
      }
    });
    view.webContents.setUserAgent(this.compatibleUserAgent(view.webContents.getUserAgent()));
    view.webContents.setZoomFactor(1);
    view.webContents.setVisualZoomLevelLimits(0.25, 5).catch(() => {});
    view.webContents.setBackgroundThrottling(true);
    view.setAutoResize({ width: true, height: true });

    const shieldState = this.resolveShieldState(input.url);
    const record: TabRecord = {
      id,
      title: "New Tab",
      url: input.url,
      loading: true,
      private: input.private,
      shieldState,
      blocked: { ads: 0, trackers: 0, scripts: 0 },
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

  private compatibleUserAgent(userAgent: string) {
    return userAgent.replace(/\s+Space_\/[\w.-]+/g, "").replace(/\s+Electron\/[\w.-]+/g, "");
  }

  private isExplicitPopup(features: string) {
    return /(?:^|[,\s])(width|height|left|top|popup)(?:\s*=|\s*(?:,|$))/i.test(features);
  }

  private bindViewEvents(tab: BrowserTab, tabSession: Electron.Session) {
    const wc = tab.view.webContents;
    this.bindBrowserShortcuts(wc);
    wc.on("focus", () => this.collapseTransientOverlays());
    wc.setWindowOpenHandler((details) => {
      if (this.isExplicitPopup(details.features)) {
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            width: 1000,
            height: 760,
            autoHideMenuBar: true,
            webPreferences: {
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
              partition: tab.partition
            }
          }
        };
      }
      const url = details.url;
      void this.createTab({ url, private: tab.record.private });
      return { action: "deny" };
    });
    wc.on("context-menu", (_event, params) => this.showPageContextMenu(tab, params));
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
      if (!tab.record.islandName) tab.record.islandId = parseDomain(tab.record.url).domain ?? "general";
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
      if (!tab.record.islandName) tab.record.islandId = parseDomain(url).domain ?? "general";
      tab.record.shieldState = this.resolveShieldState(url);
      this.publishSnapshot();
    });
    wc.on("found-in-page", () => this.publishSnapshot());
    wc.setBackgroundThrottling(true);
    if (SpaceBrowserApp.downloadSessions.has(tabSession)) return;
    SpaceBrowserApp.downloadSessions.add(tabSession);
    tabSession.on("will-download", (_event, item, downloadContents) => {
      const owner = [...SpaceBrowserApp.controllers].find(controller =>
        [...controller.tabs.values()].some(entry => entry.view.webContents.id === downloadContents.id));
      if (!owner) return;
      const entry: DownloadRecord = {
        id: `${Date.now()}`,
        fileName: item.getFilename(),
        url: item.getURL(),
        status: "progressing",
        receivedBytes: 0,
        totalBytes: item.getTotalBytes()
      };
      owner.downloads = [entry, ...owner.downloads];
      item.on("updated", () => {
        entry.receivedBytes = item.getReceivedBytes();
        entry.totalBytes = item.getTotalBytes();
        owner.publishSnapshot();
      });
      item.once("done", (_evt, state) => {
        entry.status = state === "completed" ? "completed" : state === "cancelled" ? "cancelled" : "interrupted";
        entry.savePath = item.getSavePath();
        owner.publishSnapshot();
      });
    });
  }

  private collapseTransientOverlays() {
    let changed = false;
    if (this.sidebarOpen && !this.sidebarPinned) {
      this.sidebarOpen = false;
      this.activeSidebarAppId = null;
      changed = true;
    }
    if (this.utilityDockOpen) {
      this.utilityDockOpen = false;
      changed = true;
    }
    if (changed) {
      this.layoutViews();
      this.publishSnapshot();
    }
  }

  private async installPageEnhancements(tab: BrowserTab) {
    if (tab.record.url.startsWith("space://")) return;
    await tab.view.webContents
      .executeJavaScript(
        `
        (() => {
          if (window.__spaceBrowserEnhancements) return true;
          window.__spaceBrowserEnhancements = true;
          let zoomDelta = 0;
          let zoomFrame = 0;
          document.addEventListener("wheel", (event) => {
            if (!(event.ctrlKey || event.metaKey)) return;
            event.preventDefault();
            zoomDelta += event.deltaY < 0 ? 1 : -1;
            if (zoomFrame) return;
            zoomFrame = window.setTimeout(() => {
              const steps = Math.max(-3, Math.min(3, zoomDelta));
              zoomDelta = 0;
              zoomFrame = 0;
              if (steps) window.__spaceBrowser?.zoom(steps * 0.1);
            }, 60);
          }, { capture: true, passive: false });
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
    await this.applyForceDarkToTab(tab);
  }

  private showPageContextMenu(tab: BrowserTab, params: Electron.ContextMenuParams) {
    this.showWebContentsContextMenu(tab.view.webContents, tab.record.url, tab.record.private, params);
  }

  private showWebContentsContextMenu(webContents: Electron.WebContents, pageUrl: string, isPrivate: boolean, params: Electron.ContextMenuParams) {
    if (pageUrl.startsWith("space://")) return;
    const hostname = this.hostnameForForceDark(pageUrl);
    const settings = this.getSettings();
    const siteValue = hostname ? settings.forceDarkSiteRules[hostname] : undefined;
    const effective = this.resolveForceDarkForUrl(pageUrl, settings);
    const menu = Menu.buildFromTemplate([
      ...(params.linkURL
        ? [
            {
              label: "Open link in new tab",
              click: () => void this.createTab({ url: params.linkURL, private: isPrivate })
            }
          ]
        : []),
      {
        label: hostname ? `Force dark pages on ${hostname}` : "Force dark pages on this site",
        type: "checkbox",
        checked: effective,
        enabled: Boolean(hostname),
        click: () => {
          if (!hostname) return;
          this.setForceDarkForSite(hostname, !effective);
          void this.applyForceDarkToContents(webContents, !effective);
        }
      },
      {
        label: "Use global Force Dark default for this site",
        enabled: Boolean(hostname) && siteValue !== undefined,
        click: () => {
          if (!hostname) return;
          this.clearForceDarkForSite(hostname);
          void this.applyForceDarkToContents(webContents, this.getSettings().forceDarkPages);
        }
      },
      { type: "separator" },
      { role: "copy", enabled: params.selectionText.length > 0 },
      { role: "selectAll" },
      { type: "separator" },
      {
        label: "Inspect",
        click: () => webContents.inspectElement(params.x, params.y)
      }
    ]);
    menu.popup({ window: this.mainWindow ?? undefined });
  }

  private setForceDarkForSite(hostname: string, enabled: boolean) {
    if (this.privateWindow) {
      this.privateForceDarkRules.set(hostname, enabled);
      this.publishSnapshot();
      return;
    }
    const settings = this.getSettings();
    const forceDarkSiteRules = { ...settings.forceDarkSiteRules, [hostname]: enabled };
    appStore.set("settings", { ...settings, forceDarkSiteRules });
    void this.applyForceDarkToAllViews();
    this.publishSnapshot();
  }

  private clearForceDarkForSite(hostname: string) {
    if (this.privateWindow) {
      this.privateForceDarkRules.delete(hostname);
      this.publishSnapshot();
      return;
    }
    const settings = this.getSettings();
    const forceDarkSiteRules = { ...settings.forceDarkSiteRules };
    delete forceDarkSiteRules[hostname];
    appStore.set("settings", { ...settings, forceDarkSiteRules });
    void this.applyForceDarkToAllViews();
    this.publishSnapshot();
  }

  private hostnameForForceDark(value: string) {
    try {
      const hostname = new URL(value).hostname.toLowerCase();
      return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
    } catch {
      return null;
    }
  }

  private resolveForceDarkForUrl(value: string, settings = this.getSettings()) {
    const hostname = this.hostnameForForceDark(value);
    if (this.privateWindow && hostname && this.privateForceDarkRules.has(hostname)) {
      return this.privateForceDarkRules.get(hostname)!;
    }
    if (hostname && Object.prototype.hasOwnProperty.call(settings.forceDarkSiteRules, hostname)) {
      return Boolean(settings.forceDarkSiteRules[hostname]);
    }
    return Boolean(settings.forceDarkPages);
  }

  private async applyForceDarkToTab(tab: BrowserTab) {
    if (tab.record.url.startsWith("space://")) return;
    await this.applyForceDarkToContents(tab.view.webContents, this.resolveForceDarkForUrl(tab.record.url));
  }

  private async applyForceDarkToAllViews() {
    await Promise.all([...this.tabs.values()].map((tab) => this.applyForceDarkToTab(tab)));
  }

  private async applyForceDarkToContents(webContents: Electron.WebContents, enabled: boolean) {
    if (webContents.isDestroyed()) return;
    await webContents
      .executeJavaScript(
        `
        (() => {
          const styleId = "space-force-dark-style";
          let style = document.getElementById(styleId);
          if (!style) {
            style = document.createElement("style");
            style.id = styleId;
            style.textContent = ${JSON.stringify(forceDarkStyle)};
            document.documentElement.append(style);
          }
          document.documentElement.classList.toggle("space-force-dark", ${JSON.stringify(enabled)});
          return document.documentElement.classList.contains("space-force-dark");
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
        this.openDetachedWindow("https://www.google.com", "Private Window", true);
        return;
      }
      if (ctrl && (key === "+" || key === "=")) {
        event.preventDefault();
        if (this.activeTabId) this.adjustZoom(this.activeTabId, 0.1);
        return;
      }
      if (ctrl && key === "-") {
        event.preventDefault();
        if (this.activeTabId) this.adjustZoom(this.activeTabId, -0.1);
        return;
      }
      if (ctrl && key === "0") {
        event.preventDefault();
        if (this.activeTabId) this.setZoom(this.activeTabId, 0);
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
        return;
      }
      if (ctrl && key === "d") {
        event.preventDefault();
        if (this.activeTabId) void this.toggleBookmark(this.activeTabId);
        return;
      }
      if (ctrl && key === "h") {
        event.preventDefault();
        this.navigateToLocalPage("space://history");
        return;
      }
      if (ctrl && key === "j") {
        event.preventDefault();
        this.navigateToLocalPage("space://downloads");
        return;
      }
      if (ctrl && key === "b") {
        event.preventDefault();
        this.navigateToLocalPage("space://bookmarks");
        return;
      }
      if (ctrl && key === "u") {
        event.preventDefault();
        if (this.activeTabId) void this.viewSource(this.activeTabId);
        return;
      }
      if (ctrl && key === "p") {
        event.preventDefault();
        if (this.activeTabId) void this.printTab(this.activeTabId);
        return;
      }
      if (ctrl && key === "s") {
        event.preventDefault();
        if (this.activeTabId) void this.savePage(this.activeTabId);
        return;
      }
      if ((ctrl && key === "l") || (input.alt && key === "d")) {
        event.preventDefault();
        this.mainWindow?.webContents.send(IPC_CHANNELS.uiFocusAddress);
        return;
      }
      if ((ctrl && key === "r") || key === "f5") {
        event.preventDefault();
        if (this.activeTabId) this.reloadTab(this.activeTabId);
        return;
      }
      if (input.alt && key === "arrowleft") {
        event.preventDefault();
        if (this.activeTabId) this.goBack(this.activeTabId);
        return;
      }
      if (input.alt && key === "arrowright") {
        event.preventDefault();
        if (this.activeTabId) this.goForward(this.activeTabId);
        return;
      }
      if (ctrl && key === "tab") {
        event.preventDefault();
        this.activateAdjacentTab(input.shift ? -1 : 1);
        return;
      }
      if (ctrl && /^[1-9]$/.test(key)) {
        event.preventDefault();
        this.activateTabByNumber(Number(key));
        return;
      }
      if (key === "f11") {
        event.preventDefault();
        if (this.mainWindow) this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
      }
    });
  }

  private configureSession(tabSession: Electron.Session, options: { sidebar?: boolean } = {}) {
    if (SpaceBrowserApp.configuredSessions.has(tabSession)) return;
    SpaceBrowserApp.configuredSessions.add(tabSession);
    const pageFor = (details: Electron.OnBeforeRequestListenerDetails | Electron.OnBeforeSendHeadersListenerDetails) =>
      details.resourceType === "mainFrame" ? details.url : details.webContents?.getURL() || details.url;
    tabSession.webRequest.onBeforeRequest((details, callback) => {
      const pageUrl = pageFor(details);
      const merged = this.resolveShieldState(pageUrl);
      const tab = [...SpaceBrowserApp.controllers].flatMap(controller => [...controller.tabs.values()])
        .find(entry => entry.view.webContents.id === details.webContentsId);
      if (details.resourceType === "mainFrame" && tab) tab.record.blocked = { ads: 0, trackers: 0, scripts: 0 };
      if (merged.httpsUpgrade && details.resourceType === "mainFrame" && canUpgrade(details.url)) {
        callback({ redirectURL: details.url.replace("http://", "https://") });
        return;
      }
      const cleanedUrl = merged.trackers && details.resourceType === "mainFrame" ? this.stripTrackingParams(details.url) : details.url;
      if (cleanedUrl !== details.url) {
        callback({ redirectURL: cleanedUrl });
        return;
      }
      const request = Request.fromRawDetails({ url: details.url, sourceUrl: pageUrl, type: details.resourceType, _originalRequestDetails: details });
      const reason = merged.scripts && details.resourceType === "script" ? "scripts"
        : merged.trackers && this.trackerBlocker?.match(request).match ? "trackers"
        : merged.ads && this.blocker?.match(request).match ? "ads" : null;
      if (reason) {
        if (tab) {
          tab.record.blocked ??= { ads: 0, trackers: 0, scripts: 0 };
          tab.record.blocked[reason]++;
          if (!this.snapshotTimer) this.snapshotTimer = setTimeout(() => {
            this.snapshotTimer = null;
            this.publishSnapshot();
          }, 150);
        }
        callback({ cancel: true });
        return;
      }
      callback({});
    });

    tabSession.webRequest.onBeforeSendHeaders((details, callback) => {
      const pageUrl = pageFor(details);
      const merged = this.resolveShieldState(pageUrl);
      delete details.requestHeaders["X-Client-Data"];
      if (shouldBlockCookies(details.url, pageUrl, merged.cookies)) {
        for (const key of Object.keys(details.requestHeaders)) if (key.toLowerCase() === "cookie") delete details.requestHeaders[key];
      }
      callback({ requestHeaders: details.requestHeaders });
    });

    tabSession.webRequest.onHeadersReceived((details, callback) => {
      const pageUrl = details.resourceType === "mainFrame" ? details.url : details.webContents?.getURL() || details.url;
      const headers = { ...details.responseHeaders };
      if (shouldBlockCookies(details.url, pageUrl, this.resolveShieldState(pageUrl).cookies)) {
        for (const key of Object.keys(headers)) if (key.toLowerCase() === "set-cookie") delete headers[key];
      }
      callback({ responseHeaders: headers });
    });
    const grantedPermissions = new Set<string>();
    tabSession.setPermissionRequestHandler(async (wc, permission, callback, details) => {
      if (!wc || wc.isDestroyed() || !["media", "geolocation", "notifications", "fullscreen"].includes(permission)) return callback(false);
      if (permission === "fullscreen") return callback(true);
      const origin = details.requestingUrl || wc.getURL();
      if (!origin.startsWith("https://")) return callback(false);
      let grantKey: string;
      try { grantKey = `${new URL(origin).origin}|${permission}`; }
      catch { return callback(false); }
      if (grantedPermissions.has(grantKey)) return callback(true);
      const result = await dialog.showMessageBox({ type: "question", title: "Site permission",
        message: `${this.hostFor(origin)} wants to use ${permission}.`, buttons: ["Block", "Allow for this session"], defaultId: 0, cancelId: 0 });
      const allowed = result.response === 1 && !wc.isDestroyed();
      if (allowed) grantedPermissions.add(grantKey);
      callback(allowed);
    });
    tabSession.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
      permission === "fullscreen" || grantedPermissions.has(`${requestingOrigin}|${permission}`));
  }

  private resolveShieldState(url: string): ShieldConfig {
    const settings = this.getSettings();
    let resolved = { ...settings.shieldDefaults };
    const hostname = this.hostFor(url);
    const site = this.privateWindow ? this.privateShieldRules.get(hostname) : settings.siteShieldRules.find((entry: SiteShieldRule) => entry.hostname === hostname);
    if (site) {
      resolved = { ...resolved, ...site.overrides };
    }
    return resolved;
  }

  private showShieldsMenu() {
    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : null;
    if (!tab || !this.mainWindow) return;
    const hostname = this.hostFor(tab.record.url);
    const state = this.resolveShieldState(tab.record.url);
    const blocked = tab.record.blocked ?? { ads: 0, trackers: 0, scripts: 0 };
    const findRule = () => this.privateWindow ? this.privateShieldRules.get(hostname) :
      this.getSettings().siteShieldRules.find((rule: SiteShieldRule) => rule.hostname === hostname);
    const setSite = (key: keyof ShieldConfig, value: boolean | string) => {
      if (!hostname) return;
      const overrides = { ...(findRule()?.overrides ?? {}), [key]: value };
      if (this.privateWindow) this.privateShieldRules.set(hostname, { hostname, overrides });
      else {
        const settings = this.getSettings();
        const rest = settings.siteShieldRules.filter((rule: SiteShieldRule) => rule.hostname !== hostname);
        appStore.set("settings", { ...settings, siteShieldRules: [...rest, { hostname, overrides }] });
      }
      tab.record.shieldState = this.resolveShieldState(tab.record.url);
      this.publishSnapshot();
    };
    const checkbox = (label: string, key: keyof ShieldConfig, count?: number) => ({
      label: count === undefined ? label : `${label}  (${count})`,
      type: "checkbox" as const,
      checked: Boolean(state[key]),
      enabled: Boolean(hostname) && !tab.record.url.startsWith("space://"),
      click: () => setSite(key, key === "cookies" ? (state.cookies === "allow" ? "block-third-party" : "allow") : !Boolean(state[key]))
    });
    const menu = Menu.buildFromTemplate([
      { label: hostname || "Local page", enabled: false },
      { label: `${blocked.ads + blocked.trackers + blocked.scripts} requests blocked on this page`, enabled: false },
      { type: "separator" },
      checkbox("Block ads", "ads", blocked.ads),
      checkbox("Block trackers", "trackers", blocked.trackers),
      checkbox("Block third party cookies", "cookies"),
      checkbox("Upgrade HTTP to HTTPS", "httpsUpgrade"),
      checkbox("Block JavaScript (may break the page)", "scripts", blocked.scripts),
      { type: "separator" },
      { label: "Use default site settings", enabled: Boolean(findRule()), click: () => {
        if (!hostname) return;
        if (this.privateWindow) this.privateShieldRules.delete(hostname);
        else {
          const settings = this.getSettings();
          appStore.set("settings", { ...settings, siteShieldRules: settings.siteShieldRules.filter((rule: SiteShieldRule) => rule.hostname !== hostname) });
        }
        tab.record.shieldState = this.resolveShieldState(tab.record.url);
        this.publishSnapshot();
      } }
    ]);
    menu.popup({ window: this.mainWindow });
  }

  private hostFor(url: string) {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  }

  private normalizeUrl(value: string) {
    const trimmed = value.trim();
    if (trimmed.startsWith("space://")) return trimmed;
    if (trimmed.startsWith("view-source:")) return trimmed;
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
    if (action === "shields-menu") return this.showShieldsMenu();
    if (action === "close" && typeof payload.tabId === "string") return this.closeTab(payload.tabId);
    if (action === "detach" && typeof payload.tabId === "string") return this.detachTab(payload.tabId);
    if (action === "activate" && typeof payload.tabId === "string") return this.activateTab(payload.tabId);
    if (action === "restore-closed") return this.restoreClosedTab();
    if (action === "pin" && typeof payload.tabId === "string") return this.togglePin(payload.tabId);
    if (action === "group-tabs" && Array.isArray(payload.tabIds) && typeof payload.name === "string") {
      const name = payload.name.trim().slice(0, 32);
      const ids = payload.tabIds.filter((id): id is string => typeof id === "string").slice(0, 32);
      if (name && ids.length > 1) {
        const groupId = `island-${randomUUID()}`;
        for (const id of ids) {
          const tab = this.tabs.get(id);
          if (tab) {
            tab.record.islandId = groupId;
            tab.record.islandName = name;
          }
        }
        this.publishSnapshot();
      }
      return;
    }
    if (action === "next-tab") return this.activateAdjacentTab(1);
    if (action === "previous-tab") return this.activateAdjacentTab(-1);
    if (action === "back" && typeof payload.tabId === "string") return this.goBack(payload.tabId);
    if (action === "forward" && typeof payload.tabId === "string") return this.goForward(payload.tabId);
    if (action === "history-go" && typeof payload.tabId === "string" && typeof payload.index === "number") return this.goToHistoryIndex(payload.tabId, payload.index);
    if (action === "reload" && typeof payload.tabId === "string") return this.reloadTab(payload.tabId);
    if (action === "zoom-in" && typeof payload.tabId === "string") return this.adjustZoom(payload.tabId, 0.1);
    if (action === "zoom-out" && typeof payload.tabId === "string") return this.adjustZoom(payload.tabId, -0.1);
    if (action === "zoom-reset" && typeof payload.tabId === "string") return this.setZoom(payload.tabId, 0);
    if (action === "activate-number" && typeof payload.index === "number") return this.activateTabByNumber(payload.index);
    if (action === "local-page" && typeof payload.url === "string") return this.navigateToLocalPage(payload.url);
    if (action === "view-source" && typeof payload.tabId === "string") return this.viewSource(payload.tabId);
    if (action === "print" && typeof payload.tabId === "string") return this.printTab(payload.tabId);
    if (action === "save-page" && typeof payload.tabId === "string") return this.savePage(payload.tabId);
    if (action === "fullscreen") return this.mainWindow?.setFullScreen(!this.mainWindow.isFullScreen());
    if (action === "private-window") return this.openDetachedWindow("https://www.google.com", "Private Window", true);
    if (action === "split" && typeof payload.tabId === "string") return this.splitTab(payload.tabId);
    if (action === "devtools" && typeof payload.tabId === "string") return this.openDevTools(payload.tabId);
    if (action === "wayback" && typeof payload.tabId === "string") return this.openWayback(payload.tabId);
    if (action === "speedreader" && typeof payload.tabId === "string") return this.applySpeedreader(payload.tabId);
    if (action === "extension-open" && typeof payload.extensionId === "string") return this.openExtensionAction(payload.extensionId);
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
    const idsBeforeClose = [...this.tabs.keys()];
    const closingIndex = idsBeforeClose.indexOf(tabId);
    if (!tab.record.private) this.closedTabs.unshift({ ...tab.record });
    this.closedTabs = this.closedTabs.slice(0, 25);
    this.mainWindow?.removeBrowserView(tab.view);
    tab.view.webContents.close();
    this.tabs.delete(tabId);
    const remaining = [...this.tabs.keys()];
    const next = remaining[Math.min(Math.max(closingIndex, 0), remaining.length - 1)] ?? null;
    if (this.activeTabId === tabId) this.activeTabId = next;
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

  private activateAdjacentTab(direction: 1 | -1) {
    if (!this.activeTabId || this.tabs.size < 2) return;
    const ids = [...this.tabs.keys()];
    const currentIndex = ids.indexOf(this.activeTabId);
    if (currentIndex < 0) return;
    const nextIndex = (currentIndex + direction + ids.length) % ids.length;
    this.activateTab(ids[nextIndex]);
  }

  private activateTabByNumber(index: number) {
    const ids = [...this.tabs.keys()];
    if (!ids.length) return;
    const target = index === 9 ? ids[ids.length - 1] : ids[index - 1];
    if (target) this.activateTab(target);
  }

  private navigateToLocalPage(url: string) {
    if (!this.activeTabId) return;
    void this.navigate(this.activeTabId, url);
  }

  private async viewSource(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (!tab || tab.record.url.startsWith("space://")) return;
    await this.createTab({ url: `view-source:${tab.record.url}`, private: tab.record.private });
  }

  private async printTab(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    tab.view.webContents.print({ silent: false, printBackground: true });
  }

  private async savePage(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (!tab || tab.record.url.startsWith("space://") || !this.mainWindow) return;
    const safeTitle = (tab.record.title || "Space page").replace(/[<>:"/\\|?*\x00-\x1F]/g, "").slice(0, 80) || "Space page";
    const result = await dialog.showSaveDialog(this.mainWindow, {
      title: "Save page",
      defaultPath: `${safeTitle}.html`,
      filters: [{ name: "Web page", extensions: ["html"] }]
    });
    if (result.canceled || !result.filePath) return;
    await tab.view.webContents.savePage(result.filePath, "HTMLComplete").catch(() => {});
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

  private getNavigationHistory(tabId: string): NavigationHistoryEntry[] {
    const tab = this.tabs.get(tabId);
    if (!tab || this.isInternalSpaceUrl(tab.record.url)) return [];
    const history = tab.view.webContents.navigationHistory;
    const activeIndex = history.getActiveIndex();
    return history
      .getAllEntries()
      .map((entry, index) => ({
        index,
        title: entry.title || this.titleFromUrl(entry.url),
        url: entry.url,
        active: index === activeIndex
      }))
      .filter((entry) => entry.url && !entry.url.startsWith("about:blank"));
  }

  private goToHistoryIndex(tabId: string, index: number) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    const history = tab.view.webContents.navigationHistory;
    if (index >= 0 && index < history.length()) {
      history.goToIndex(index);
    }
  }

  private adjustZoom(tabId: string, delta: number) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    const current = tab.view.webContents.getZoomFactor();
    this.setZoom(tabId, Math.round((current + delta) * 100) / 100);
  }

  private setZoom(tabId: string, level: number) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    const next = Math.max(0.5, Math.min(3, level === 0 ? 1 : level));
    tab.view.webContents.setZoomFactor(next);
  }

  private titleFromUrl(value: string) {
    try {
      const url = new URL(value);
      return url.hostname.replace(/^www\./, "") || value;
    } catch {
      return value;
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
    const isPrivate = tab.record.private;
    this.closeTab(tabId);
    this.openDetachedWindow(url, title, isPrivate);
  }

  private openDetachedWindow(url: string, _title: string, isPrivate = false) {
    const controller = new SpaceBrowserApp();
    controller.privateWindow = isPrivate;
    controller.blocker = this.blocker;
    controller.trackerBlocker = this.trackerBlocker;
    controller.createWindow();
    controller.registerIpc();
    void controller.createTab({ url, private: isPrivate });
  }

  private appIconPath() {
    return path.join(app.getAppPath(), "assets", "app-256.ico");
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
          partition: this.privateWindow ? this.privatePartition : "persist:space-sidebar",
          sandbox: true
        }
      });
      this.sidebarView.setAutoResize({ height: true });
      this.sidebarView.webContents.setUserAgent(this.compatibleUserAgent(this.sidebarView.webContents.getUserAgent()));
      this.configureSession(this.sidebarView.webContents.session, { sidebar: true });
      this.sidebarView.webContents.on("did-stop-loading", () => {
        if (!this.sidebarView) return;
        void this.applyForceDarkToContents(this.sidebarView.webContents, this.resolveForceDarkForUrl(this.sidebarView.webContents.getURL()));
      });
      this.sidebarView.webContents.on("context-menu", (_event, params) => {
        if (!this.sidebarView) return;
        this.showWebContentsContextMenu(this.sidebarView.webContents, this.sidebarView.webContents.getURL(), false, params);
      });
      this.sidebarView.webContents.setWindowOpenHandler((details) => {
        if (this.isExplicitPopup(details.features)) {
          return {
            action: "allow",
            overrideBrowserWindowOptions: {
              width: 960,
              height: 720,
              autoHideMenuBar: true,
              webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
                partition: this.privateWindow ? this.privatePartition : "persist:space-sidebar"
              }
            }
          };
        }
        void this.createTab({ url: details.url, private: this.privateWindow });
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
    if (this.sidebarView.webContents.getURL() === url && !this.sidebarView.webContents.isLoading()) return;
    try {
      await this.sidebarView.webContents.loadURL(url);
      await this.applyForceDarkToContents(this.sidebarView.webContents, this.resolveForceDarkForUrl(url));
    } catch (error) {
      if (this.isAbortedNavigation(error)) return;
      throw error;
    }
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

  private stopSidebarResize() {
    this.sidebarResizeActive = false;
    if (this.sidebarResizeSnapshotTimer) clearTimeout(this.sidebarResizeSnapshotTimer);
    this.sidebarResizeSnapshotTimer = null;
    for (const tab of this.tabs.values()) tab.view.webContents.send(IPC_CHANNELS.sidebarDragEnd);
    this.publishSnapshot();
  }

  private layoutViews() {
    if (!this.mainWindow) return;
    const [width, height] = this.mainWindow.getContentSize();
    this.sidebarWidth = this.clampSidebarWidth(this.sidebarWidth);
    const dockedSidebarWidth = this.sidebarOpen ? this.sidebarWidth : 0;
    const panelWidth = this.sidebarOpen ? this.sidebarWidth : 0;
    const contentX = railWidth + dockedSidebarWidth;
    const mainWidth = width - contentX;
    const dockWidth = this.utilityDockOpen ? Math.min(this.utilityDockWidth, Math.max(0, mainWidth - 240)) : 0;
    const browserWidth = Math.max(240, mainWidth - dockWidth);
    const splitTabs = [...this.tabs.values()].filter((tab) => tab.record.isSplitParticipant);
    const active = this.activeTabId ? this.tabs.get(this.activeTabId) : null;
    const showBrowserSurface = !(active?.record.url.startsWith("space://"));
    const visibleViews: BrowserView[] = [];

    for (const tab of this.tabs.values()) {
      const isActive = this.activeTabId === tab.record.id || (splitTabs.length > 0 && tab.record.isSplitParticipant);
      const shouldShow = isActive && showBrowserSurface;
      if (tab.view.webContents.isAudioMuted() !== tab.record.isMuted) tab.view.webContents.setAudioMuted(tab.record.isMuted);
      if (!shouldShow) {
        this.setViewBounds(tab.view, { x: -20000, y: -20000, width: 10, height: 10 });
      } else {
        visibleViews.push(tab.view);
        if (splitTabs.length < 2 || !tab.record.isSplitParticipant) {
          this.setViewBounds(tab.view, { x: contentX, y: chromeHeight, width: browserWidth, height: height - chromeHeight });
        }
      }
    }

    if (showBrowserSurface && splitTabs.length >= 2) {
      const visible = splitTabs.slice(0, 2);
      const splitWidth = Math.floor(browserWidth / 2);
      this.setViewBounds(visible[0].view, { x: contentX, y: chromeHeight, width: splitWidth, height: height - chromeHeight });
      this.setViewBounds(visible[1].view, { x: contentX + splitWidth, y: chromeHeight, width: browserWidth - splitWidth, height: height - chromeHeight });
      visibleViews.push(visible[0].view, visible[1].view);
    }

    for (const view of visibleViews) {
      this.mainWindow.setTopBrowserView(view);
    }

    if (this.sidebarView) {
      if (this.sidebarOpen && this.activeSidebarUsesBrowserView()) {
        this.setViewBounds(this.sidebarView, { x: railWidth, y: sidebarHeaderHeight, width: Math.max(320, panelWidth - sidebarResizeGutter), height: height - sidebarHeaderHeight });
        this.mainWindow.setTopBrowserView(this.sidebarView);
      } else {
        this.setViewBounds(this.sidebarView, { x: -10000, y: -10000, width: 10, height: 10 });
      }
    }
  }

  private setViewBounds(view: BrowserView, bounds: Electron.Rectangle) {
    const current = view.getBounds();
    if (current.x !== bounds.x || current.y !== bounds.y || current.width !== bounds.width || current.height !== bounds.height) {
      view.setBounds(bounds);
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
    try {
      const raw = await fs.readFile(result.filePaths[0], "utf8");
      if (Buffer.byteLength(raw, "utf8") > 256_000) throw new Error("Mod files must be smaller than 256 KB.");
      const parsed: unknown = JSON.parse(raw);
      const imported = z.array(colorModSchema).min(1).max(50).parse(Array.isArray(parsed) ? parsed : [parsed]);
      const installed = new Map((appStore.get("mods") ?? []).map((mod: ModManifest & { enabled: boolean }) => [mod.id, mod]));
      for (const mod of imported) installed.set(mod.id, { ...mod, enabled: true });
      appStore.set("mods", [...installed.values()]);
      this.publishSnapshot();
    } catch (error) {
      await dialog.showMessageBox(this.mainWindow, {
        type: "error",
        title: "Appearance mod could not be imported",
        message: error instanceof Error ? error.message : "The selected JSON is not a valid appearance mod."
      });
    }
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
      await this.extensionSession().loadExtension(result.filePaths[0], { allowFileAccess: true });
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

  private listExtensions(): ExtensionRecord[] {
    const pinned = new Set(this.getSettings().pinnedExtensions ?? []);
    const extensions = this.extensionSession().extensions.getAllExtensions();
    return extensions.map((extension) => ({
      id: extension.id,
      name: extension.name,
      version: extension.version,
      enabled: true,
      pinned: pinned.has(extension.id)
    }));
  }

  private extensionSession() {
    return session.fromPartition("persist:space-default");
  }

  private async openExtensionAction(id: string) {
    const extension = this.extensionSession().extensions.getExtension(id);
    if (!extension) return;
    const popup = extension.manifest.action?.default_popup ?? extension.manifest.browser_action?.default_popup;
    if (!popup) {
      if (this.mainWindow) await dialog.showMessageBox(this.mainWindow, {
        type: "info",
        title: extension.name,
        message: "This extension does not declare a browser action popup. Its background and content scripts remain active."
      });
      return;
    }
    await this.createTab({ url: new URL(popup, `chrome-extension://${extension.id}/`).toString(), private: false });
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
        tab.view.webContents.setBackgroundThrottling(true);
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
        .map((entry) => ({ ...entry.record, shieldState: this.resolveShieldState(entry.record.url) })),
      activeTabId: this.activeTabId,
      bookmarks: appStore.get("bookmarks") ?? [],
      history: this.privateWindow ? [] : appStore.get("history") ?? [],
      downloads: this.downloads,
      settings: this.getSettings(),
      mods: appStore.get("mods") ?? [],
      sidebarOpen: this.sidebarOpen,
      sidebarPinned: this.sidebarPinned,
      sidebarWidth: this.sidebarWidth,
      activeSidebarAppId: this.activeSidebarAppId,
      utilityDockOpen: this.utilityDockOpen,
      isMaximized: this.mainWindow?.isMaximized() ?? false
    };
  }

  private publishSnapshot() {
    if (!this.mainWindow || this.mainWindow.isDestroyed() || this.mainWindow.webContents.isDestroyed()) return;
    this.mainWindow.webContents.send(IPC_CHANNELS.browserSnapshot, this.snapshot());
  }
}
