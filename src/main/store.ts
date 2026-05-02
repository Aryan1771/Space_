import Store from "electron-store";
import { builtInMods, defaultSettings } from "../shared/defaults";
import type { AppSettings, BookmarkRecord, HistoryRecord, ModManifest } from "../shared/types";

type PersistedData = {
  settings: AppSettings;
  bookmarks: BookmarkRecord[];
  history: HistoryRecord[];
  mods: Array<ModManifest & { enabled: boolean }>;
};

export const appStore = new Store<PersistedData>({
  name: "space-browser",
  defaults: {
    settings: defaultSettings,
    bookmarks: [],
    history: [],
    mods: builtInMods.map((mod) => ({ ...mod, enabled: true }))
  }
}) as unknown as {
  get: <K extends keyof PersistedData>(key: K) => PersistedData[K];
  set: <K extends keyof PersistedData>(key: K, value: PersistedData[K]) => void;
};
