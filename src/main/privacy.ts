import { parse } from "tldts";

export function isThirdParty(requestUrl: string, pageUrl: string): boolean {
  try {
    const request = new URL(requestUrl).hostname;
    const page = new URL(pageUrl).hostname;
    return (parse(request, { allowPrivateDomains: true }).domain ?? request) !==
      (parse(page, { allowPrivateDomains: true }).domain ?? page);
  } catch { return true; }
}

export function shouldBlockCookies(requestUrl: string, pageUrl: string, policy: string): boolean {
  return policy === "block-all" || (policy === "block-third-party" && isThirdParty(requestUrl, pageUrl));
}

export function canUpgrade(url: string): boolean {
  try {
    const value = new URL(url);
    return value.protocol === "http:" && value.hostname !== "localhost" &&
      !value.hostname.endsWith(".localhost") && !/^127\./.test(value.hostname) &&
      value.hostname !== "[::1]" && !/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(value.hostname);
  } catch { return false; }
}
