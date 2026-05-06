import { app } from "electron";
import { SpaceBrowserApp } from "./browser";

const chromeLikeUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

app.setName("Space_");
app.setAppUserModelId("com.space.browser");
app.commandLine.appendSwitch("enable-features", "DocumentPictureInPictureAPI,WebAuthentication,WebAuthenticationCable");
app.commandLine.appendSwitch("disable-blink-features", "AutomationControlled");
app.commandLine.appendSwitch("user-agent", chromeLikeUserAgent);
app.commandLine.appendSwitch("lang", "en-US");

const browserApp = new SpaceBrowserApp();

void browserApp.start();
