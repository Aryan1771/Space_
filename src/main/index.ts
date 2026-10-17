import { app } from "electron";
import { SpaceBrowserApp } from "./browser";

app.setName("Space_");
app.setAppUserModelId("com.space.browser");
app.commandLine.appendSwitch("enable-features", "DocumentPictureInPictureAPI,WebAuthentication,WebAuthenticationCable");
app.commandLine.appendSwitch("lang", "en-US");

const browserApp = new SpaceBrowserApp();

void browserApp.start();
