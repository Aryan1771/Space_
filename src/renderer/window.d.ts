import type { AiActionPayload, BrowserStateSnapshot, SiteShieldRule } from "@shared/types";

declare global {
  interface Window {
    space: {
      getSnapshot: () => Promise<BrowserStateSnapshot>;
      onSnapshot: (listener: (snapshot: BrowserStateSnapshot) => void) => () => void;
      tabAction: (action: string, payload?: Record<string, unknown>) => Promise<unknown>;
      navigate: (tabId: string, value: string) => Promise<unknown>;
      openSidebarApp: (appId: string) => Promise<unknown>;
      resizeSidebar: (width: number, pinned: boolean) => Promise<unknown>;
      setUtilityDockOpen: (open: boolean) => Promise<unknown>;
      patchSettings: (patch: Record<string, unknown>) => Promise<unknown>;
      setGlobalShields: (patch: Record<string, unknown>) => Promise<unknown>;
      setSiteShields: (rule: SiteShieldRule) => Promise<unknown>;
      toggleBookmark: (tabId: string) => Promise<unknown>;
      clearHistory: () => Promise<unknown>;
      deleteHistory: (id: string) => Promise<unknown>;
      importMods: () => Promise<unknown>;
      exportMods: () => Promise<unknown>;
      toggleMod: (modId: string, enabled: boolean) => Promise<unknown>;
      runAiAction: (payload: AiActionPayload) => Promise<unknown>;
      requestPictureInPicture: (tabId?: string) => Promise<unknown>;
      takeScreenshot: () => Promise<unknown>;
      runCleaner: (targets: string[]) => Promise<unknown>;
    };
  }
}

export {};
