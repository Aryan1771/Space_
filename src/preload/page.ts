import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/ipc";

contextBridge.exposeInMainWorld("__spaceBrowser", {
  zoom: (direction: number) => ipcRenderer.send(IPC_CHANNELS.pageZoom, direction)
});

let sidebarResizeActive = false;
const pageWindow = globalThis as typeof globalThis & {
  addEventListener: (type: string, listener: (event: { screenX: number }) => void, options?: { passive?: boolean }) => void;
};
ipcRenderer.on(IPC_CHANNELS.sidebarDragStart, () => { sidebarResizeActive = true; });
ipcRenderer.on(IPC_CHANNELS.sidebarDragEnd, () => { sidebarResizeActive = false; });
pageWindow.addEventListener("pointermove", (event) => {
  if (sidebarResizeActive) ipcRenderer.send(IPC_CHANNELS.sidebarDragPointer, event.screenX);
}, { passive: true });
pageWindow.addEventListener("pointerup", () => {
  if (sidebarResizeActive) ipcRenderer.send(IPC_CHANNELS.sidebarDragEnd);
}, { passive: true });
