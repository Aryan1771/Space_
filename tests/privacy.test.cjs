const assert = require("node:assert/strict");
const { isThirdParty, shouldBlockCookies, canUpgrade } = require("../dist/main/privacy.js");

assert.equal(isThirdParty("https://cdn.example.co.uk/a.js", "https://www.example.co.uk"), false);
assert.equal(isThirdParty("https://tracker.other.com/a.js", "https://www.example.com"), true);
assert.equal(isThirdParty("https://a.github.io/a.js", "https://b.github.io"), true);
assert.equal(shouldBlockCookies("https://cdn.example.com/x", "https://www.example.com", "block-third-party"), false);
assert.equal(shouldBlockCookies("https://tracker.other/x", "https://example.com", "block-third-party"), true);
assert.equal(shouldBlockCookies("https://example.com/x", "https://example.com", "block-all"), true);
assert.equal(shouldBlockCookies("https://tracker.other/x", "https://example.com", "allow"), false);
assert.equal(shouldBlockCookies("invalid", "https://example.com", "block-third-party"), true);
assert.equal(canUpgrade("http://example.com/path"), true);
assert.equal(canUpgrade("http://localhost:3000"), false);
assert.equal(canUpgrade("http://192.168.1.10"), false);
assert.equal(canUpgrade("https://example.com"), false);
console.log("Privacy policy checks passed.");
