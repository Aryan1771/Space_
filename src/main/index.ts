import { app } from "electron";
import { SpaceBrowserApp } from "./browser";

app.commandLine.appendSwitch("enable-features", "DocumentPictureInPictureAPI");

const browserApp = new SpaceBrowserApp();

void browserApp.start();
