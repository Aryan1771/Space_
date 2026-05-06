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
  define(Navigator.prototype, "vendor", "Google Inc.");

  const uaData = {
    brands: [
      { brand: "Google Chrome", version: "142" },
      { brand: "Chromium", version: "142" },
      { brand: "Not_A Brand", version: "99" }
    ],
    mobile: false,
    platform: "Windows",
    getHighEntropyValues: async (hints = []) => {
      const values = {
        architecture: "x86",
        bitness: "64",
        brands: uaData.brands,
        fullVersionList: [
          { brand: "Google Chrome", version: "142.0.0.0" },
          { brand: "Chromium", version: "142.0.0.0" },
          { brand: "Not_A Brand", version: "99.0.0.0" }
        ],
        mobile: false,
        model: "",
        platform: "Windows",
        platformVersion: "15.0.0",
        uaFullVersion: "142.0.0.0",
        wow64: false
      };
      return Object.fromEntries(hints.map((hint) => [hint, values[hint]]).filter(([, value]) => value !== undefined));
    },
    toJSON: () => ({ brands: uaData.brands, mobile: false, platform: "Windows" })
  };
  define(Navigator.prototype, "userAgentData", uaData);

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
