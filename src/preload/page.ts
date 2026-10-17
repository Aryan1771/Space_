import { contextBridge, ipcRenderer } from "electron";

const pageChannels = {
  zoom: "page:zoom",
  sidebarDragStart: "sidebar:drag-start",
  sidebarDragEnd: "sidebar:drag-end",
  sidebarDragPointer: "sidebar:drag-pointer"
} as const;

contextBridge.exposeInMainWorld("__spaceBrowser", {
  zoom: (direction: number) => ipcRenderer.send(pageChannels.zoom, direction)
});

let sidebarResizeActive = false;
const pageWindow = globalThis as typeof globalThis & {
  addEventListener: (type: string, listener: (event: { screenX: number }) => void, options?: { passive?: boolean }) => void;
};
ipcRenderer.on(pageChannels.sidebarDragStart, () => { sidebarResizeActive = true; });
ipcRenderer.on(pageChannels.sidebarDragEnd, () => { sidebarResizeActive = false; });
pageWindow.addEventListener("pointermove", (event) => {
  if (sidebarResizeActive) ipcRenderer.send(pageChannels.sidebarDragPointer, event.screenX);
}, { passive: true });
pageWindow.addEventListener("pointerup", () => {
  if (sidebarResizeActive) ipcRenderer.send(pageChannels.sidebarDragEnd);
}, { passive: true });
