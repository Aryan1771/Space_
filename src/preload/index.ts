import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/ipc";
import type { AiActionPayload, BrowserStateSnapshot, SiteShieldRule } from "../shared/types";

const api = {
  getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.browserSnapshot) as Promise<BrowserStateSnapshot>,
  onSnapshot: (listener: (snapshot: BrowserStateSnapshot) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, snapshot: BrowserStateSnapshot) => listener(snapshot);
    ipcRenderer.on(IPC_CHANNELS.browserSnapshot, wrapped);
    return () => ipcRenderer.off(IPC_CHANNELS.browserSnapshot, wrapped);
  },
  tabAction: (action: string, payload?: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.tabAction, { action, payload }),
  navigate: (tabId: string, value: string) => ipcRenderer.invoke(IPC_CHANNELS.navigate, { tabId, value }),
  openSidebarApp: (appId: string) => ipcRenderer.invoke(IPC_CHANNELS.sidebarOpen, { appId }),
  resizeSidebar: (width: number, pinned: boolean) => ipcRenderer.invoke(IPC_CHANNELS.sidebarResize, { width, pinned }),
  patchSettings: (patch: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.settingsPatch, patch),
  setGlobalShields: (patch: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.shieldSetGlobal, patch),
  setSiteShields: (rule: SiteShieldRule) => ipcRenderer.invoke(IPC_CHANNELS.shieldSetSite, rule),
  toggleBookmark: (tabId: string) => ipcRenderer.invoke(IPC_CHANNELS.bookmarksToggle, { tabId }),
  clearHistory: () => ipcRenderer.invoke(IPC_CHANNELS.historyClear),
  deleteHistory: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.historyDelete, { id }),
  importMods: () => ipcRenderer.invoke(IPC_CHANNELS.modsImport),
  exportMods: () => ipcRenderer.invoke(IPC_CHANNELS.modsExport),
  toggleMod: (modId: string, enabled: boolean) => ipcRenderer.invoke(IPC_CHANNELS.modsToggle, { modId, enabled }),
  runAiAction: (payload: AiActionPayload) => ipcRenderer.invoke(IPC_CHANNELS.aiRun, payload),
  takeScreenshot: () => ipcRenderer.invoke(IPC_CHANNELS.screenshot),
  runCleaner: (targets: string[]) => ipcRenderer.invoke(IPC_CHANNELS.cleaner, targets)
};

contextBridge.exposeInMainWorld("space", api);

declare global {
  interface Window {
    space: typeof api;
  }
}
