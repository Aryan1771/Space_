(() => {
  const define = (target, key, value) => {
    try {
      Object.defineProperty(target, key, { configurable: true, get: () => value });
    } catch {}
  };

  define(Navigator.prototype, "webdriver", undefined);
  define(Navigator.prototype, "languages", ["en-US", "en"]);
  define(Navigator.prototype, "platform", "Win32");
  define(Navigator.prototype, "hardwareConcurrency", Math.max(4, navigator.hardwareConcurrency || 8));
  define(Navigator.prototype, "deviceMemory", navigator.deviceMemory || 8);

  if (!window.chrome) {
    Object.defineProperty(window, "chrome", {
      configurable: true,
      value: {
        app: {},
        runtime: {},
        webstore: {},
        csi: () => ({}),
        loadTimes: () => ({})
      }
    });
  }
})();
