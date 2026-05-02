export type ThemeId =
  | "gx-red"
  | "neon-green"
  | "electric-blue"
  | "cyber-yellow"
  | "dark"
  | "light";

export type SidebarAppType = "system" | "social" | "ai";

export interface ShieldConfig {
  ads: boolean;
  trackers: boolean;
  cookies: "block-third-party" | "allow" | "block-all";
  fingerprinting: boolean;
  httpsUpgrade: boolean;
  scripts: boolean;
  consentBlock: boolean;
}

export interface SiteShieldRule {
  hostname: string;
  overrides: Partial<ShieldConfig>;
}

export interface PerformanceProfile {
  backgroundTabPolicy: "balanced" | "limit" | "aggressive";
  suspendThresholdMinutes: number;
  throttleNetworkPreset: "off" | "light" | "medium";
  animationLevel: "full" | "reduced";
}

export interface SidebarApp {
  id: string;
  name: string;
  icon: string;
  url: string;
  type: SidebarAppType;
  resizable: boolean;
  defaultPinned: boolean;
}

export interface ModManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  themeTokens?: Record<string, string>;
  sounds?: Record<string, string>;
  cursors?: Record<string, string>;
  wallpaper?: {
    type: "image" | "video";
    path: string;
  };
  shaders?: string[];
  sidebarLayout?: string[];
  icons?: Record<string, string>;
}

export interface AppSettings {
  theme: ThemeId;
  sidebarApps: string[];
  customAiUrl: string;
  startPageWidgets: string[];
  shieldDefaults: ShieldConfig;
  siteShieldRules: SiteShieldRule[];
  performanceProfile: PerformanceProfile;
  downloadsPath: string;
  enableExperimentalExtensions: boolean;
  soundsEnabled: boolean;
  notes: string[];
  speedDial: Array<{ id: string; title: string; url: string }>;
}

export interface TabRecord {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  loading: boolean;
  private: boolean;
  shieldState: ShieldConfig;
  workspaceId: string;
  islandId: string | null;
  isPinned: boolean;
  isMuted: boolean;
  isSplitParticipant: boolean;
  isSuspended: boolean;
  lastActiveAt: number;
}

export interface BookmarkRecord {
  id: string;
  title: string;
  url: string;
  createdAt: number;
}

export interface HistoryRecord {
  id: string;
  title: string;
  url: string;
  visitedAt: number;
}

export interface DownloadRecord {
  id: string;
  fileName: string;
  url: string;
  status: "progressing" | "completed" | "cancelled" | "interrupted";
  receivedBytes: number;
  totalBytes: number;
  savePath?: string;
}

export interface BrowserStateSnapshot {
  tabs: TabRecord[];
  activeTabId: string | null;
  bookmarks: BookmarkRecord[];
  history: HistoryRecord[];
  downloads: DownloadRecord[];
  settings: AppSettings;
  sidebarOpen: boolean;
  sidebarPinned: boolean;
  activeSidebarAppId: string | null;
}

export interface AiActionPayload {
  action: "summarize" | "explain" | "rewrite" | "translate" | "code";
  providerId: string;
}
