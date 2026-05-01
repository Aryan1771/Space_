import html
import ipaddress
import json
import math
import re
import socket
import ssl
import sys
import threading
import tkinter as tk
from dataclasses import asdict, dataclass, field
from difflib import SequenceMatcher
from enum import Enum
from html.parser import HTMLParser
from pathlib import Path
from tkinter import colorchooser, messagebox, simpledialog
from urllib.parse import quote_plus, urljoin, urlparse
from urllib.request import Request, urlopen


APP_NAME = "Safe GX Browser"
HOME_URL = "https://duckduckgo.com/html/?q=safe+browser"
SEARCH_URL = "https://duckduckgo.com/html/?q={query}"
USER_AGENT = "SafeGXBrowser/1.0 (+https://example.local)"
MAX_PAGE_BYTES = 1_500_000
SETTINGS_PATH = Path(__file__).with_name("browser_settings.json")


class VerificationState(str, Enum):
    SAFE = "safe"
    WARNING = "warning"
    RISKY = "risky"
    UNKNOWN = "unknown"


@dataclass
class Finding:
    level: str
    title: str
    detail: str


@dataclass
class ScanResult:
    findings: list[Finding] = field(default_factory=list)
    state: VerificationState = VerificationState.UNKNOWN
    summary: str = "Not scanned yet."


@dataclass
class PageData:
    url: str
    final_url: str = ""
    status: str = ""
    title: str = "New tab"
    text: str = ""
    links: list[tuple[str, str]] = field(default_factory=list)
    forms: list[dict[str, str]] = field(default_factory=list)
    scripts: int = 0
    iframes: int = 0
    meta_refreshes: int = 0
    password_fields: int = 0
    raw_html: str = ""


@dataclass
class Theme:
    name: str
    source: str
    sidebar_bg: str
    sidebar_accent: str
    topbar_bg: str
    tab_bg: str
    active_tab_bg: str
    address_bg: str
    page_bg: str
    panel_bg: str
    text_color: str
    muted_text: str
    border_color: str
    safe_color: str
    warning_color: str
    risky_color: str
    unknown_color: str
    topbar_gradient_start: str = ""
    topbar_gradient_end: str = ""
    sidebar_gradient_start: str = ""
    sidebar_gradient_end: str = ""


@dataclass
class TabState:
    id: int
    title: str = "New tab"
    url: str = HOME_URL
    history: list[str] = field(default_factory=list)
    history_index: int = -1
    page: PageData = field(default_factory=lambda: PageData(url=HOME_URL))
    scan: ScanResult = field(default_factory=ScanResult)
    loading: bool = False
    error: str = ""


@dataclass
class TabIsland:
    id: int
    name: str
    color: str
    collapsed: bool = False
    tab_ids: list[int] = field(default_factory=list)


PRESET_THEMES = {
    "Opera Dark": Theme(
        name="Opera Dark",
        source="preset",
        sidebar_bg="#05060a",
        sidebar_accent="#3e6dff",
        topbar_bg="#11131b",
        tab_bg="#171a25",
        active_tab_bg="#23283a",
        address_bg="#090b10",
        page_bg="#0f1117",
        panel_bg="#151924",
        text_color="#f5f7ff",
        muted_text="#9ba6c4",
        border_color="#2a3150",
        safe_color="#19d27f",
        warning_color="#f0c64a",
        risky_color="#ff4f6d",
        unknown_color="#8b95b7",
        topbar_gradient_start="#11131b",
        topbar_gradient_end="#1b2240",
        sidebar_gradient_start="#020309",
        sidebar_gradient_end="#080d1f",
    ),
    "Chrome Light": Theme(
        name="Chrome Light",
        source="preset",
        sidebar_bg="#f1f3f4",
        sidebar_accent="#1a73e8",
        topbar_bg="#f8fafd",
        tab_bg="#e8eaed",
        active_tab_bg="#ffffff",
        address_bg="#ffffff",
        page_bg="#ffffff",
        panel_bg="#f7f9fc",
        text_color="#202124",
        muted_text="#5f6368",
        border_color="#d6d9df",
        safe_color="#188038",
        warning_color="#b06000",
        risky_color="#d93025",
        unknown_color="#5f6368",
    ),
    "System Default": Theme(
        name="System Default",
        source="preset",
        sidebar_bg="#ececec",
        sidebar_accent="#2457d6",
        topbar_bg="#f0f0f0",
        tab_bg="#d9d9d9",
        active_tab_bg="#ffffff",
        address_bg="#ffffff",
        page_bg="#ffffff",
        panel_bg="#f4f4f4",
        text_color="#111111",
        muted_text="#555555",
        border_color="#c8c8c8",
        safe_color="#147d42",
        warning_color="#9a6500",
        risky_color="#b00020",
        unknown_color="#666666",
    ),
}


DEFAULT_CUSTOM_THEME = Theme(**{**asdict(PRESET_THEMES["Opera Dark"]), "name": "Custom", "source": "custom"})
SOCIAL_SHORTCUTS = {
    "AI": "https://chat.openai.com/",
    "TW": "https://www.twitch.tv/",
    "WA": "https://web.whatsapp.com/",
    "DC": "https://discord.com/app",
    "TG": "https://web.telegram.org/",
}
ISLAND_COLORS = ["#3e6dff", "#aa5cff", "#19d27f", "#ff8a3d", "#ff4f6d", "#23b7d9"]


def color_lerp(start: str, end: str, factor: float) -> str:
    def split(value: str) -> tuple[int, int, int]:
        value = value.lstrip("#")
        return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)

    a = split(start)
    b = split(end)
    return "#" + "".join(f"{round(a[i] + (b[i] - a[i]) * factor):02x}" for i in range(3))


class ReaderHTMLParser(HTMLParser):
    def __init__(self, base_url: str):
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.title_parts: list[str] = []
        self.text_parts: list[str] = []
        self.links: list[tuple[str, str]] = []
        self.forms: list[dict[str, str]] = []
        self.scripts = 0
        self.iframes = 0
        self.meta_refreshes = 0
        self.password_fields = 0
        self._tag_stack: list[str] = []
        self._skip_depth = 0
        self._current_link: dict[str, str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = {name.lower(): value or "" for name, value in attrs}
        tag = tag.lower()
        self._tag_stack.append(tag)

        if tag in {"script", "style", "noscript", "svg"}:
            self._skip_depth += 1
        if tag == "script":
            self.scripts += 1
        elif tag == "iframe":
            self.iframes += 1
        elif tag == "meta" and attrs_dict.get("http-equiv", "").lower() == "refresh":
            self.meta_refreshes += 1
        elif tag == "input" and attrs_dict.get("type", "").lower() == "password":
            self.password_fields += 1
        elif tag == "form":
            action = attrs_dict.get("action", "")
            method = attrs_dict.get("method", "get").upper()
            self.forms.append({"action": urljoin(self.base_url, action), "method": method})
        elif tag == "a":
            href = attrs_dict.get("href", "").strip()
            if href and not href.startswith(("#", "javascript:", "mailto:", "tel:")):
                self._current_link = {"href": urljoin(self.base_url, href), "text": ""}

        if tag in {"p", "br", "div", "section", "article", "header", "footer", "li", "tr", "h1", "h2", "h3"}:
            self.text_parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "a" and self._current_link:
            label = " ".join(self._current_link["text"].split()) or self._current_link["href"]
            self.links.append((label[:120], self._current_link["href"]))
            self._current_link = None

        if tag in {"script", "style", "noscript", "svg"} and self._skip_depth:
            self._skip_depth -= 1
        if self._tag_stack:
            self._tag_stack.pop()

    def handle_data(self, data: str) -> None:
        clean = " ".join(data.split())
        if not clean:
            return
        if self._tag_stack and self._tag_stack[-1] == "title":
            self.title_parts.append(clean)
            return
        if self._current_link is not None:
            self._current_link["text"] += f" {clean}"
        if self._skip_depth == 0:
            self.text_parts.append(html.unescape(clean))
            self.text_parts.append(" ")

    def page_data(self, url: str, raw_html: str) -> PageData:
        text = re.sub(r"\n{3,}", "\n\n", "".join(self.text_parts)).strip()
        title = " ".join(self.title_parts).strip() or "Untitled page"
        unique_links = []
        seen = set()
        for label, href in self.links:
            if href not in seen:
                unique_links.append((label, href))
                seen.add(href)
        return PageData(
            url=url,
            final_url=url,
            title=title[:140],
            text=text or "This page did not expose readable text.",
            links=unique_links[:300],
            forms=self.forms,
            scripts=self.scripts,
            iframes=self.iframes,
            meta_refreshes=self.meta_refreshes,
            password_fields=self.password_fields,
            raw_html=raw_html,
        )


class BrowserExtension:
    name = "Extension"

    def scan(self, page: PageData) -> list[Finding]:
        return []


class ScamDetectorExtension(BrowserExtension):
    name = "Scam detector"
    known_brands = {
        "amazon": "amazon.com",
        "apple": "apple.com",
        "facebook": "facebook.com",
        "google": "google.com",
        "instagram": "instagram.com",
        "microsoft": "microsoft.com",
        "netflix": "netflix.com",
        "paypal": "paypal.com",
        "whatsapp": "whatsapp.com",
        "youtube": "youtube.com",
    }
    risky_tlds = {"zip", "mov", "click", "country", "gq", "tk", "top", "work", "xyz"}
    shorteners = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly"}

    def scan(self, page: PageData) -> list[Finding]:
        findings: list[Finding] = []
        parsed = urlparse(page.final_url or page.url)
        host = (parsed.hostname or "").lower().rstrip(".")
        scheme = parsed.scheme.lower()

        if scheme != "https":
            findings.append(Finding("high", "Connection is not HTTPS", "Information sent to this site may be visible or modified in transit."))
        if "@" in page.url:
            findings.append(Finding("high", "URL contains @", "Attackers use @ to hide the real destination in a long address."))
        if self._is_ip_address(host):
            findings.append(Finding("medium", "Site uses an IP address", "Scam pages often avoid a normal domain name."))
        if host.startswith("xn--") or ".xn--" in host:
            findings.append(Finding("medium", "Internationalized domain", "This domain may use characters that look like trusted brand letters."))

        labels = host.split(".")
        if labels and labels[-1] in self.risky_tlds:
            findings.append(Finding("medium", "Risky top-level domain", f"The .{labels[-1]} domain is commonly abused in throwaway scam campaigns."))
        if host in self.shorteners:
            findings.append(Finding("medium", "Shortened URL", "Short links hide the final destination until you open them."))
        if labels and ("-" in labels[0] or sum(ch.isdigit() for ch in labels[0]) >= 3):
            findings.append(Finding("low", "Unusual domain shape", "Many hyphens or numbers in a domain can be a sign of impersonation."))

        brand_finding = self._brand_impersonation(host)
        if brand_finding:
            findings.append(brand_finding)

        suspicious_words = self._count_suspicious_words(page.text)
        if suspicious_words >= 4:
            findings.append(Finding("medium", "Scam-like wording", "The page repeatedly uses urgency, prizes, account warnings, or payment pressure."))
        elif suspicious_words >= 2:
            findings.append(Finding("low", "Pressure-language detected", "The page contains wording often seen in phishing and fake support pages."))
        return findings

    def _brand_impersonation(self, host: str) -> Finding | None:
        host_without_www = host.removeprefix("www.")
        domain_label = host_without_www.split(".")[0]
        for brand, official_domain in self.known_brands.items():
            if host_without_www == official_domain or host_without_www.endswith(f".{official_domain}"):
                return None
            ratio = SequenceMatcher(None, domain_label, brand).ratio()
            if brand in domain_label or ratio >= 0.78:
                return Finding("high", "Possible brand impersonation", f"This domain resembles {brand}, but the official domain is {official_domain}.")
        return None

    @staticmethod
    def _is_ip_address(host: str) -> bool:
        try:
            ipaddress.ip_address(host)
            return True
        except ValueError:
            return False

    @staticmethod
    def _count_suspicious_words(text: str) -> int:
        terms = [
            "act now", "account suspended", "bank details", "claim prize", "confirm your password",
            "gift card", "limited time", "login immediately", "password expired", "payment failed",
            "security alert", "verify your account", "winner", "you have won",
        ]
        lower_text = text.lower()
        return sum(1 for term in terms if term in lower_text)


class SiteProblemsExtension(BrowserExtension):
    name = "Site problem checker"

    def scan(self, page: PageData) -> list[Finding]:
        findings: list[Finding] = []
        parsed_page = urlparse(page.final_url or page.url)
        page_host = (parsed_page.hostname or "").lower()

        if page.password_fields and parsed_page.scheme != "https":
            findings.append(Finding("critical", "Password field on insecure page", "Do not enter passwords unless the page uses HTTPS."))
        if page.forms:
            insecure_forms = [form for form in page.forms if urlparse(form["action"]).scheme != "https"]
            if insecure_forms:
                findings.append(Finding("high", "Form submits insecurely", "At least one form sends data without HTTPS protection."))
        if page.meta_refreshes:
            findings.append(Finding("low", "Automatic redirect found", "Meta refresh redirects can be used to bounce visitors through misleading pages."))
        if page.iframes:
            findings.append(Finding("low", "Embedded frames found", "Frames can load login boxes, ads, or trackers from other sites."))
        if page.scripts >= 15:
            findings.append(Finding("low", "Heavy script usage", f"The page references {page.scripts} scripts; this browser does not run them."))

        mismatched_links = 0
        for label, href in page.links[:100]:
            label_host = self._host_in_text(label)
            href_host = (urlparse(href).hostname or "").lower()
            if label_host and href_host and label_host != href_host and not href_host.endswith(f".{label_host}"):
                mismatched_links += 1
        if mismatched_links:
            findings.append(Finding("medium", "Misleading link labels", f"{mismatched_links} link label(s) mention a different domain than the real destination."))

        external_hosts = {
            (urlparse(href).hostname or "").lower()
            for _, href in page.links[:200]
            if (urlparse(href).hostname or "").lower() and (urlparse(href).hostname or "").lower() != page_host
        }
        if len(external_hosts) > 25:
            findings.append(Finding("low", "Many external domains", f"This page links to {len(external_hosts)} different external domains."))
        return findings

    @staticmethod
    def _host_in_text(text: str) -> str:
        match = re.search(r"\b([a-z0-9-]+\.)+[a-z]{2,}\b", text.lower())
        return match.group(0).removeprefix("www.") if match else ""


def normalize_url(value: str) -> str:
    value = value.strip()
    if not value:
        return HOME_URL
    parsed = urlparse(value)
    if parsed.scheme in {"http", "https"}:
        return value
    if "." in value and " " not in value:
        return f"https://{value}"
    return SEARCH_URL.format(query=quote_plus(value))


def fetch_page(url: str) -> PageData:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,*/*;q=0.8"})
    context = ssl.create_default_context()
    with urlopen(request, timeout=12, context=context) as response:
        status = getattr(response, "status", "")
        final_url = response.geturl()
        content_type = response.headers.get("content-type", "")
        raw = response.read(MAX_PAGE_BYTES + 1)

    if len(raw) > MAX_PAGE_BYTES:
        raise ValueError("The page is too large for this basic reader browser.")
    if "text/html" not in content_type and "application/xhtml" not in content_type and not raw.lstrip().startswith(b"<"):
        raise ValueError(f"Unsupported content type: {content_type or 'unknown'}")

    charset = "utf-8"
    match = re.search(r"charset=([\w.-]+)", content_type, re.IGNORECASE)
    if match:
        charset = match.group(1)
    raw_html = raw.decode(charset, errors="replace")

    parser = ReaderHTMLParser(final_url)
    parser.feed(raw_html)
    page = parser.page_data(final_url, raw_html)
    page.url = url
    page.final_url = final_url
    page.status = str(status)
    return page


def derive_scan_result(findings: list[Finding], loaded: bool = True) -> ScanResult:
    if not loaded:
        return ScanResult(findings=findings, state=VerificationState.RISKY, summary="The page did not load or could not be scanned.")
    levels = {finding.level for finding in findings}
    if levels & {"critical", "high", "medium"}:
        return ScanResult(findings=findings, state=VerificationState.RISKY, summary="Risk signals were detected. Be careful with this site.")
    if "low" in levels:
        return ScanResult(findings=findings, state=VerificationState.WARNING, summary="Only low-risk warnings were detected.")
    return ScanResult(findings=findings, state=VerificationState.SAFE, summary="No obvious risk detected. This is not a guarantee of safety.")


class SafeGXBrowser(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        socket.setdefaulttimeout(12)
        self.title(APP_NAME)
        self.geometry("1320x820")
        self.minsize(980, 620)

        self.extensions: list[BrowserExtension] = [ScamDetectorExtension(), SiteProblemsExtension()]
        self.tabs: dict[int, TabState] = {}
        self.tab_order: list[int] = []
        self.islands: dict[int, TabIsland] = {}
        self.active_tab_id: int | None = None
        self.next_tab_id = 1
        self.next_island_id = 1
        self.drag_tab_id: int | None = None
        self.link_targets: list[str] = []
        self.current_panel = "Safety"

        self.settings = self.load_settings()
        self.theme = self.load_theme()

        self._build_ui()
        self.new_tab(HOME_URL)

    def load_settings(self) -> dict:
        if not SETTINGS_PATH.exists():
            return {"theme_name": "Opera Dark", "custom_theme": asdict(DEFAULT_CUSTOM_THEME)}
        try:
            return json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {"theme_name": "Opera Dark", "custom_theme": asdict(DEFAULT_CUSTOM_THEME)}

    def save_settings(self) -> None:
        payload = {
            "theme_name": self.settings.get("theme_name", "Opera Dark"),
            "custom_theme": self.settings.get("custom_theme", asdict(DEFAULT_CUSTOM_THEME)),
        }
        SETTINGS_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def load_theme(self) -> Theme:
        theme_name = self.settings.get("theme_name", "Opera Dark")
        if theme_name == "Custom":
            data = {**asdict(DEFAULT_CUSTOM_THEME), **self.settings.get("custom_theme", {})}
            return Theme(**data)
        return PRESET_THEMES.get(theme_name, PRESET_THEMES["Opera Dark"])

    def _build_ui(self) -> None:
        self.configure(bg=self.theme.page_bg)
        self.columnconfigure(1, weight=1)
        self.rowconfigure(0, weight=1)

        self.sidebar = tk.Canvas(self, width=64, highlightthickness=0, bd=0)
        self.sidebar.grid(row=0, column=0, sticky="ns")
        self.sidebar_frame = tk.Frame(self.sidebar, bg=self.theme.sidebar_bg)
        self.sidebar_window = self.sidebar.create_window(0, 0, anchor="nw", window=self.sidebar_frame, width=64)
        self.sidebar.bind("<Configure>", lambda event: self._paint_sidebar())

        self.main = tk.Frame(self, bg=self.theme.page_bg)
        self.main.grid(row=0, column=1, sticky="nsew")
        self.main.columnconfigure(0, weight=1)
        self.main.rowconfigure(2, weight=1)

        self.tab_canvas = tk.Canvas(self.main, height=46, highlightthickness=0, bd=0)
        self.tab_canvas.grid(row=0, column=0, sticky="ew")
        self.tab_frame = tk.Frame(self.tab_canvas, bg=self.theme.topbar_bg)
        self.tab_canvas.create_window(0, 0, anchor="nw", window=self.tab_frame)
        self.tab_canvas.bind("<Configure>", lambda event: self._paint_topbar())

        self.navbar = tk.Canvas(self.main, height=54, highlightthickness=0, bd=0)
        self.navbar.grid(row=1, column=0, sticky="ew")
        self.nav_frame = tk.Frame(self.navbar, bg=self.theme.topbar_bg)
        self.navbar.create_window(0, 0, anchor="nw", window=self.nav_frame)
        self.navbar.bind("<Configure>", lambda event: self._paint_navbar())

        self.content = tk.Frame(self.main, bg=self.theme.page_bg)
        self.content.grid(row=2, column=0, sticky="nsew")
        self.content.columnconfigure(0, weight=1)
        self.content.rowconfigure(0, weight=1)

        self.reader_frame = tk.Frame(self.content, bg=self.theme.page_bg)
        self.reader_frame.grid(row=0, column=0, sticky="nsew")
        self.reader_frame.columnconfigure(0, weight=1)
        self.reader_frame.rowconfigure(1, weight=1)

        self.page_title_var = tk.StringVar(value="New tab")
        self.page_title = tk.Label(self.reader_frame, textvariable=self.page_title_var, anchor="w", font=("Segoe UI", 16, "bold"))
        self.page_title.grid(row=0, column=0, sticky="ew", padx=20, pady=(18, 8))

        self.page_text = tk.Text(self.reader_frame, wrap="word", padx=18, pady=18, font=("Segoe UI", 10), undo=False, bd=0)
        self.page_text.grid(row=1, column=0, sticky="nsew", padx=(20, 0), pady=(0, 20))
        self.text_scroll = tk.Scrollbar(self.reader_frame, command=self.page_text.yview)
        self.text_scroll.grid(row=1, column=1, sticky="ns", pady=(0, 20), padx=(0, 20))
        self.page_text.configure(yscrollcommand=self.text_scroll.set)

        self.panel = tk.Frame(self.content, width=330, bg=self.theme.panel_bg)
        self.panel.grid(row=0, column=1, sticky="ns")
        self.panel.grid_remove()
        self.panel.grid_propagate(False)
        self.panel.columnconfigure(0, weight=1)
        self.panel.rowconfigure(1, weight=1)

        self.panel_title_var = tk.StringVar(value="Safety")
        self.panel_title = tk.Label(self.panel, textvariable=self.panel_title_var, anchor="w", font=("Segoe UI", 13, "bold"))
        self.panel_title.grid(row=0, column=0, sticky="ew", padx=14, pady=(14, 8))
        self.panel_body = tk.Frame(self.panel, bg=self.theme.panel_bg)
        self.panel_body.grid(row=1, column=0, sticky="nsew", padx=12, pady=(0, 12))
        self.panel_body.columnconfigure(0, weight=1)
        self.panel_body.rowconfigure(0, weight=1)

        self.status_var = tk.StringVar(value="Ready")
        self.status = tk.Label(self.main, textvariable=self.status_var, anchor="w", padx=12, pady=4)
        self.status.grid(row=3, column=0, sticky="ew")

        self._build_sidebar()
        self._build_navbar()
        self.apply_theme()

    def _build_sidebar(self) -> None:
        for widget in self.sidebar_frame.winfo_children():
            widget.destroy()
        buttons = [
            ("O", "Home", lambda: self.navigate(HOME_URL)),
            ("S", "Safety", lambda: self.open_panel("Safety")),
            ("L", "Links", lambda: self.open_panel("Links")),
            ("H", "History", lambda: self.open_panel("History")),
            ("X", "Extensions", lambda: self.open_panel("Extensions")),
            ("AI", "ChatGPT", lambda: self.navigate(SOCIAL_SHORTCUTS["AI"])),
            ("TW", "Twitch", lambda: self.navigate(SOCIAL_SHORTCUTS["TW"])),
            ("WA", "WhatsApp", lambda: self.navigate(SOCIAL_SHORTCUTS["WA"])),
            ("DC", "Discord", lambda: self.navigate(SOCIAL_SHORTCUTS["DC"])),
            ("TG", "Telegram", lambda: self.navigate(SOCIAL_SHORTCUTS["TG"])),
            ("P", "Player", lambda: self.open_panel("Player")),
            ("T", "Themes", lambda: self.open_panel("Settings")),
            ("...", "More", lambda: self.open_panel("More")),
        ]
        for index, (label, tooltip, command) in enumerate(buttons):
            btn = tk.Button(
                self.sidebar_frame,
                text=label,
                command=command,
                width=4,
                relief="flat",
                bd=0,
                font=("Segoe UI", 9, "bold"),
                cursor="hand2",
            )
            btn.grid(row=index, column=0, padx=10, pady=(12 if index == 0 else 5, 0), sticky="ew")
            btn.bind("<Enter>", lambda _event, tip=tooltip: self.status_var.set(tip))
            btn.bind("<Leave>", lambda _event: self.status_var.set("Ready"))

    def _build_navbar(self) -> None:
        for widget in self.nav_frame.winfo_children():
            widget.destroy()
        controls = [
            ("<", self.go_back),
            (">", self.go_forward),
            ("R", self.reload),
            ("Home", lambda: self.navigate(HOME_URL)),
        ]
        for index, (label, command) in enumerate(controls):
            tk.Button(self.nav_frame, text=label, command=command, relief="flat", bd=0, width=6, cursor="hand2").grid(row=0, column=index, padx=(10 if index == 0 else 4, 0), pady=10)

        self.verify_var = tk.StringVar(value="? Unknown")
        self.verify_badge = tk.Label(self.nav_frame, textvariable=self.verify_var, font=("Segoe UI", 10, "bold"), padx=10, pady=6)
        self.verify_badge.grid(row=0, column=4, padx=(10, 4), pady=10)

        self.address_var = tk.StringVar(value=HOME_URL)
        self.address = tk.Entry(self.nav_frame, textvariable=self.address_var, relief="flat", font=("Segoe UI", 11), bd=0)
        self.address.grid(row=0, column=5, sticky="ew", padx=6, ipady=7)
        self.address.bind("<Return>", lambda _event: self.navigate(self.address_var.get()))
        self.nav_frame.columnconfigure(5, weight=1)

        tk.Button(self.nav_frame, text="Go", command=lambda: self.navigate(self.address_var.get()), relief="flat", bd=0, width=6, cursor="hand2").grid(row=0, column=6, padx=(4, 10), pady=10)

    def _paint_gradient(self, canvas: tk.Canvas, start: str, end: str, fallback: str) -> None:
        canvas.delete("gradient")
        width = max(canvas.winfo_width(), 1)
        height = max(canvas.winfo_height(), 1)
        if not start or not end:
            canvas.configure(bg=fallback)
            return
        steps = max(16, min(width, 120))
        for step in range(steps):
            x0 = math.floor(width * step / steps)
            x1 = math.ceil(width * (step + 1) / steps)
            canvas.create_rectangle(x0, 0, x1, height, fill=color_lerp(start, end, step / max(steps - 1, 1)), outline="", tags="gradient")
        canvas.tag_lower("gradient")

    def _paint_sidebar(self) -> None:
        self.sidebar.itemconfigure(self.sidebar_window, height=self.sidebar.winfo_height())
        self._paint_gradient(self.sidebar, self.theme.sidebar_gradient_start, self.theme.sidebar_gradient_end, self.theme.sidebar_bg)

    def _paint_topbar(self) -> None:
        self.tab_canvas.itemconfigure(1, width=self.tab_canvas.winfo_width())
        self._paint_gradient(self.tab_canvas, self.theme.topbar_gradient_start, self.theme.topbar_gradient_end, self.theme.topbar_bg)

    def _paint_navbar(self) -> None:
        self.navbar.itemconfigure(1, width=self.navbar.winfo_width())
        self._paint_gradient(self.navbar, self.theme.topbar_gradient_start, self.theme.topbar_gradient_end, self.theme.topbar_bg)

    def apply_theme(self) -> None:
        theme = self.theme
        self.configure(bg=theme.page_bg)
        for frame in [self.sidebar_frame, self.main, self.tab_frame, self.nav_frame, self.content, self.reader_frame]:
            frame.configure(bg=theme.page_bg if frame in {self.content, self.reader_frame} else theme.topbar_bg)
        self.sidebar_frame.configure(bg=theme.sidebar_bg)
        self.panel.configure(bg=theme.panel_bg)
        self.panel_body.configure(bg=theme.panel_bg)
        self.page_title.configure(bg=theme.page_bg, fg=theme.text_color)
        self.page_text.configure(bg=theme.page_bg, fg=theme.text_color, insertbackground=theme.text_color)
        self.status.configure(bg=theme.topbar_bg, fg=theme.muted_text)
        self.panel_title.configure(bg=theme.panel_bg, fg=theme.text_color)
        self.address.configure(bg=theme.address_bg, fg=theme.text_color, insertbackground=theme.text_color)

        for widget in self.sidebar_frame.winfo_children():
            widget.configure(bg=theme.sidebar_bg, fg=theme.sidebar_accent, activebackground=theme.tab_bg, activeforeground=theme.text_color)
        for widget in self.nav_frame.winfo_children():
            if isinstance(widget, tk.Button):
                widget.configure(bg=theme.topbar_bg, fg=theme.text_color, activebackground=theme.active_tab_bg, activeforeground=theme.text_color)
        self._paint_sidebar()
        self._paint_topbar()
        self._paint_navbar()
        self.render_tabs()
        self.update_verify_badge()
        self.open_panel(self.current_panel, force_refresh=True)

    def new_tab(self, url: str = HOME_URL) -> int:
        tab_id = self.next_tab_id
        self.next_tab_id += 1
        tab = TabState(id=tab_id, url=url)
        self.tabs[tab_id] = tab
        self.tab_order.append(tab_id)
        self.active_tab_id = tab_id
        self.render_tabs()
        self.navigate(url, add_history=True)
        return tab_id

    def close_tab(self, tab_id: int) -> None:
        if len(self.tab_order) == 1:
            self.new_tab(HOME_URL)
        if tab_id in self.tab_order:
            index = self.tab_order.index(tab_id)
            self.tab_order.remove(tab_id)
            self.tabs.pop(tab_id, None)
            for island in list(self.islands.values()):
                if tab_id in island.tab_ids:
                    island.tab_ids.remove(tab_id)
                if not island.tab_ids:
                    self.islands.pop(island.id, None)
            if self.active_tab_id == tab_id:
                self.active_tab_id = self.tab_order[min(index, len(self.tab_order) - 1)] if self.tab_order else None
        self.render_tabs()
        self.display_active_tab()

    def active_tab(self) -> TabState | None:
        if self.active_tab_id is None:
            return None
        return self.tabs.get(self.active_tab_id)

    def select_tab(self, tab_id: int) -> None:
        if tab_id in self.tabs:
            self.active_tab_id = tab_id
            self.render_tabs()
            self.display_active_tab()

    def render_tabs(self) -> None:
        for widget in self.tab_frame.winfo_children():
            widget.destroy()
        column = 0
        rendered = set()
        for island in self.islands.values():
            visible_tabs = [tab_id for tab_id in island.tab_ids if tab_id in self.tabs]
            if not visible_tabs:
                continue
            label = tk.Label(self.tab_frame, text=f"{island.name}", bg=island.color, fg="#ffffff", padx=10, pady=8, cursor="hand2")
            label.grid(row=0, column=column, padx=(8, 2), pady=7)
            label.bind("<Button-3>", lambda event, island_id=island.id: self.show_island_menu(event, island_id))
            label.bind("<ButtonRelease-1>", lambda _event, island_id=island.id: self.drop_on_island(island_id))
            column += 1
            if island.collapsed:
                rendered.update(visible_tabs)
                continue
            for tab_id in visible_tabs:
                self._render_tab_button(tab_id, column)
                rendered.add(tab_id)
                column += 1
        for tab_id in self.tab_order:
            if tab_id in rendered:
                continue
            self._render_tab_button(tab_id, column)
            column += 1
        add_btn = tk.Button(self.tab_frame, text="+", command=lambda: self.new_tab(HOME_URL), relief="flat", bd=0, width=4, cursor="hand2")
        add_btn.grid(row=0, column=column, padx=6, pady=7)
        self._style_tab_widgets()

    def _render_tab_button(self, tab_id: int, column: int) -> None:
        tab = self.tabs[tab_id]
        active = tab_id == self.active_tab_id
        frame = tk.Frame(self.tab_frame, bd=0, highlightthickness=1, highlightbackground=self.theme.border_color, cursor="hand2")
        frame.grid(row=0, column=column, padx=3, pady=7)
        frame.configure(bg=self.theme.active_tab_bg if active else self.theme.tab_bg)
        title = tab.title[:22] + ("..." if len(tab.title) > 22 else "")
        label = tk.Label(frame, text=title, padx=10, pady=7, cursor="hand2")
        label.pack(side="left")
        close = tk.Button(frame, text="x", command=lambda tab_id=tab_id: self.close_tab(tab_id), relief="flat", bd=0, width=2, cursor="hand2")
        close.pack(side="right")
        for widget in (frame, label):
            widget.bind("<Button-1>", lambda _event, tab_id=tab_id: self.start_tab_drag(tab_id))
            widget.bind("<ButtonRelease-1>", lambda event, tab_id=tab_id: self.finish_tab_drag(event, tab_id))
            widget.bind("<Button-3>", lambda event, tab_id=tab_id: self.show_tab_menu(event, tab_id))

    def _style_tab_widgets(self) -> None:
        for widget in self.tab_frame.winfo_children():
            if isinstance(widget, tk.Button):
                widget.configure(bg=self.theme.tab_bg, fg=self.theme.text_color, activebackground=self.theme.active_tab_bg, activeforeground=self.theme.text_color)
            if isinstance(widget, tk.Frame):
                for child in widget.winfo_children():
                    child.configure(
                        bg=widget.cget("bg"),
                        fg=self.theme.text_color,
                        activebackground=self.theme.active_tab_bg if isinstance(child, tk.Button) else widget.cget("bg"),
                        activeforeground=self.theme.text_color,
                    )

    def start_tab_drag(self, tab_id: int) -> None:
        self.drag_tab_id = tab_id

    def finish_tab_drag(self, event: tk.Event, target_tab_id: int) -> None:
        if self.drag_tab_id and self.drag_tab_id != target_tab_id:
            self.create_island_with_tabs(self.drag_tab_id, target_tab_id)
        else:
            self.select_tab(target_tab_id)
        self.drag_tab_id = None

    def drop_on_island(self, island_id: int) -> None:
        if self.drag_tab_id and island_id in self.islands:
            self.add_tab_to_island(self.drag_tab_id, island_id)
        self.drag_tab_id = None

    def show_tab_menu(self, event: tk.Event, tab_id: int) -> None:
        menu = tk.Menu(self, tearoff=False)
        menu.add_command(label="New tab", command=lambda: self.new_tab(HOME_URL))
        menu.add_command(label="Close tab", command=lambda: self.close_tab(tab_id))
        menu.add_separator()
        menu.add_command(label="Create island", command=lambda: self.create_island_with_tabs(tab_id))
        for island in self.islands.values():
            menu.add_command(label=f"Move to {island.name}", command=lambda island_id=island.id: self.add_tab_to_island(tab_id, island_id))
        menu.tk_popup(event.x_root, event.y_root)

    def show_island_menu(self, event: tk.Event, island_id: int) -> None:
        island = self.islands[island_id]
        menu = tk.Menu(self, tearoff=False)
        menu.add_command(label="Rename island", command=lambda: self.rename_island(island_id))
        menu.add_command(label="Collapse" if not island.collapsed else "Expand", command=lambda: self.toggle_island(island_id))
        menu.add_command(label="Ungroup island", command=lambda: self.ungroup_island(island_id))
        menu.tk_popup(event.x_root, event.y_root)

    def create_island_with_tabs(self, *tab_ids: int) -> None:
        tab_ids = tuple(dict.fromkeys(tab_id for tab_id in tab_ids if tab_id in self.tabs))
        if not tab_ids:
            return
        island_id = self.next_island_id
        self.next_island_id += 1
        color = ISLAND_COLORS[(island_id - 1) % len(ISLAND_COLORS)]
        self.islands[island_id] = TabIsland(id=island_id, name=f"Island {island_id}", color=color, tab_ids=list(tab_ids))
        for other in self.islands.values():
            if other.id != island_id:
                other.tab_ids = [tab_id for tab_id in other.tab_ids if tab_id not in tab_ids]
        self.render_tabs()

    def add_tab_to_island(self, tab_id: int, island_id: int) -> None:
        if tab_id not in self.tabs or island_id not in self.islands:
            return
        for island in self.islands.values():
            if tab_id in island.tab_ids:
                island.tab_ids.remove(tab_id)
        if tab_id not in self.islands[island_id].tab_ids:
            self.islands[island_id].tab_ids.append(tab_id)
        self.render_tabs()

    def rename_island(self, island_id: int) -> None:
        island = self.islands.get(island_id)
        if not island:
            return
        name = simpledialog.askstring("Rename island", "Island name:", initialvalue=island.name, parent=self)
        if name:
            island.name = name.strip()[:28] or island.name
            self.render_tabs()

    def toggle_island(self, island_id: int) -> None:
        if island_id in self.islands:
            self.islands[island_id].collapsed = not self.islands[island_id].collapsed
            self.render_tabs()

    def ungroup_island(self, island_id: int) -> None:
        self.islands.pop(island_id, None)
        self.render_tabs()

    def navigate(self, value: str, add_history: bool = True) -> None:
        tab = self.active_tab()
        if tab is None:
            return
        url = normalize_url(value)
        tab.url = url
        tab.loading = True
        tab.error = ""
        tab.title = "Loading..."
        tab.scan = ScanResult(state=VerificationState.UNKNOWN, summary="Loading and scanning...")
        self.address_var.set(url)
        self.status_var.set(f"Loading {url}")
        self.display_active_tab()
        threading.Thread(target=self._load_page_worker, args=(tab.id, url, add_history), daemon=True).start()

    def _load_page_worker(self, tab_id: int, url: str, add_history: bool) -> None:
        try:
            page = fetch_page(url)
            scan = self.scan_page(page)
            self.after(0, self._display_page, tab_id, page, scan, add_history)
        except Exception as exc:
            page = PageData(url=url, final_url=url, title="Could not load page", text=f"Could not load {url}\n\n{exc}")
            findings = [Finding("high", "Load failed", str(exc))]
            self.after(0, self._display_page, tab_id, page, derive_scan_result(findings, loaded=False), add_history)

    def _display_page(self, tab_id: int, page: PageData, scan: ScanResult, add_history: bool) -> None:
        tab = self.tabs.get(tab_id)
        if not tab:
            return
        tab.page = page
        tab.scan = scan
        tab.url = page.final_url or page.url
        tab.title = page.title
        tab.loading = False
        tab.error = "" if scan.state != VerificationState.RISKY else scan.summary
        if add_history:
            tab.history = tab.history[: tab.history_index + 1]
            tab.history.append(tab.url)
            tab.history_index = len(tab.history) - 1
        if self.active_tab_id == tab_id:
            self.display_active_tab()
        self.render_tabs()

    def scan_page(self, page: PageData) -> ScanResult:
        findings: list[Finding] = []
        for extension in self.extensions:
            findings.extend(extension.scan(page))
        return derive_scan_result(findings)

    def display_active_tab(self) -> None:
        tab = self.active_tab()
        if not tab:
            return
        self.address_var.set(tab.url)
        self.page_title_var.set(tab.title)
        self._write_text(self.page_text, "Loading page..." if tab.loading else tab.page.text)
        self.status_var.set("Loading..." if tab.loading else f"{tab.scan.state.value.title()}: {tab.scan.summary}")
        self.update_verify_badge()
        self.open_panel(self.current_panel, force_refresh=True)

    def update_verify_badge(self) -> None:
        tab = self.active_tab()
        state = tab.scan.state if tab else VerificationState.UNKNOWN
        labels = {
            VerificationState.SAFE: "✓ Safe",
            VerificationState.WARNING: "! Check",
            VerificationState.RISKY: "✕ Risk",
            VerificationState.UNKNOWN: "? Unknown",
        }
        colors = {
            VerificationState.SAFE: self.theme.safe_color,
            VerificationState.WARNING: self.theme.warning_color,
            VerificationState.RISKY: self.theme.risky_color,
            VerificationState.UNKNOWN: self.theme.unknown_color,
        }
        self.verify_var.set(labels[state])
        self.verify_badge.configure(bg=colors[state], fg="#ffffff")

    def _write_text(self, widget: tk.Text, value: str) -> None:
        widget.configure(state="normal")
        widget.delete("1.0", tk.END)
        widget.insert(tk.END, value)
        widget.configure(state="disabled")

    def go_back(self) -> None:
        tab = self.active_tab()
        if tab and tab.history_index > 0:
            tab.history_index -= 1
            self.navigate(tab.history[tab.history_index], add_history=False)

    def go_forward(self) -> None:
        tab = self.active_tab()
        if tab and tab.history_index < len(tab.history) - 1:
            tab.history_index += 1
            self.navigate(tab.history[tab.history_index], add_history=False)

    def reload(self) -> None:
        tab = self.active_tab()
        if tab:
            self.navigate(tab.url, add_history=False)

    def open_panel(self, panel_name: str, force_refresh: bool = False) -> None:
        if self.current_panel == panel_name and self.panel.winfo_ismapped() and not force_refresh:
            self.panel.grid_remove()
            return
        self.current_panel = panel_name
        self.panel.grid()
        self.panel_title_var.set(panel_name)
        for widget in self.panel_body.winfo_children():
            widget.destroy()
        builders = {
            "Safety": self._panel_safety,
            "Links": self._panel_links,
            "History": self._panel_history,
            "Extensions": self._panel_extensions,
            "Player": self._panel_player,
            "Settings": self._panel_settings,
            "More": self._panel_more,
        }
        builders.get(panel_name, self._panel_safety)()

    def _panel_text(self, content: str) -> tk.Text:
        text = tk.Text(self.panel_body, wrap="word", padx=10, pady=10, bd=0, height=10)
        text.grid(row=0, column=0, sticky="nsew")
        text.configure(bg=self.theme.panel_bg, fg=self.theme.text_color, insertbackground=self.theme.text_color)
        self._write_text(text, content)
        return text

    def _panel_safety(self) -> None:
        tab = self.active_tab()
        if not tab:
            self._panel_text("No active tab.")
            return
        severity_score = {"critical": 4, "high": 3, "medium": 2, "low": 1}
        findings = sorted(tab.scan.findings, key=lambda item: severity_score.get(item.level, 0), reverse=True)
        lines = [f"Verification: {tab.scan.state.value.title()}", tab.scan.summary, ""]
        if findings:
            for finding in findings:
                lines.append(f"[{finding.level.upper()}] {finding.title}\n{finding.detail}\n")
        else:
            lines.append("No current findings.")
        lines.append("The tick means no obvious risk was detected by this basic framework, not guaranteed safety.")
        self._panel_text("\n".join(lines))

    def _panel_links(self) -> None:
        tab = self.active_tab()
        self.link_targets = []
        listbox = tk.Listbox(self.panel_body, activestyle="dotbox", bd=0)
        listbox.grid(row=0, column=0, sticky="nsew")
        listbox.configure(bg=self.theme.panel_bg, fg=self.theme.text_color, selectbackground=self.theme.sidebar_accent)
        if tab:
            for label, href in tab.page.links:
                listbox.insert(tk.END, label)
                self.link_targets.append(href)
        listbox.bind("<Double-Button-1>", lambda _event: self._open_panel_link(listbox))
        tk.Button(self.panel_body, text="Open selected", command=lambda: self._open_panel_link(listbox), relief="flat").grid(row=1, column=0, sticky="ew", pady=(8, 0))

    def _open_panel_link(self, listbox: tk.Listbox) -> None:
        selection = listbox.curselection()
        if selection:
            self.navigate(self.link_targets[selection[0]])

    def _panel_history(self) -> None:
        tab = self.active_tab()
        lines = tab.history if tab else []
        self._panel_text("\n".join(lines) if lines else "This tab has no history yet.")

    def _panel_extensions(self) -> None:
        lines = ["Enabled extensions:", ""]
        for extension in self.extensions:
            lines.append(f"- {extension.name}")
        lines.extend(["", "New reputation data can plug into the scan framework later."])
        self._panel_text("\n".join(lines))

    def _panel_player(self) -> None:
        self._panel_text("Player placeholder\n\nThis panel is reserved for media controls in a future version.")

    def _panel_more(self) -> None:
        lines = [
            APP_NAME,
            "",
            "Custom non-Chromium reader framework.",
            "No JavaScript execution.",
            "Use the sidebar for safety, links, history, extensions, shortcuts, and themes.",
        ]
        self._panel_text("\n".join(lines))

    def _panel_settings(self) -> None:
        frame = self.panel_body
        frame.columnconfigure(1, weight=1)
        tk.Label(frame, text="Theme preset", anchor="w").grid(row=0, column=0, sticky="ew", pady=4)
        theme_var = tk.StringVar(value=self.settings.get("theme_name", "Opera Dark"))
        option = tk.OptionMenu(frame, theme_var, "Opera Dark", "Chrome Light", "System Default", "Custom")
        option.grid(row=0, column=1, sticky="ew", pady=4)
        rows = [
            ("Sidebar", "sidebar_bg"),
            ("Accent", "sidebar_accent"),
            ("Top bar", "topbar_bg"),
            ("Tab", "tab_bg"),
            ("Active tab", "active_tab_bg"),
            ("Address", "address_bg"),
            ("Page", "page_bg"),
            ("Panel", "panel_bg"),
            ("Text", "text_color"),
            ("Safe", "safe_color"),
            ("Warning", "warning_color"),
            ("Risky", "risky_color"),
            ("Top gradient start", "topbar_gradient_start"),
            ("Top gradient end", "topbar_gradient_end"),
            ("Side gradient start", "sidebar_gradient_start"),
            ("Side gradient end", "sidebar_gradient_end"),
        ]
        custom_data = {**asdict(DEFAULT_CUSTOM_THEME), **self.settings.get("custom_theme", {})}
        entries: dict[str, tk.Entry] = {}
        for index, (label, key) in enumerate(rows, start=1):
            tk.Label(frame, text=label, anchor="w").grid(row=index, column=0, sticky="ew", pady=2)
            value = tk.StringVar(value=custom_data.get(key, ""))
            entry = tk.Entry(frame, textvariable=value, bd=0)
            entry.grid(row=index, column=1, sticky="ew", pady=2, ipady=4)
            entries[key] = entry
            tk.Button(frame, text="Pick", command=lambda var=value: self.pick_color(var), relief="flat").grid(row=index, column=2, padx=(4, 0))

        def apply_selected() -> None:
            self.settings["theme_name"] = theme_var.get()
            if theme_var.get() == "Custom":
                data = {**asdict(DEFAULT_CUSTOM_THEME)}
                for key, entry in entries.items():
                    data[key] = entry.get().strip()
                data["name"] = "Custom"
                data["source"] = "custom"
                self.settings["custom_theme"] = data
            self.theme = self.load_theme()
            self.save_settings()
            self.apply_theme()

        tk.Button(frame, text="Apply theme", command=apply_selected, relief="flat").grid(row=len(rows) + 1, column=0, columnspan=3, sticky="ew", pady=(12, 0))
        for widget in frame.winfo_children():
            if isinstance(widget, tk.Label):
                widget.configure(bg=self.theme.panel_bg, fg=self.theme.text_color)
            elif isinstance(widget, tk.Button):
                widget.configure(bg=self.theme.tab_bg, fg=self.theme.text_color, activebackground=self.theme.active_tab_bg)
            elif isinstance(widget, tk.Entry):
                widget.configure(bg=self.theme.address_bg, fg=self.theme.text_color, insertbackground=self.theme.text_color)

    def pick_color(self, var: tk.StringVar) -> None:
        color = colorchooser.askcolor(color=var.get() or "#ffffff", parent=self)
        if color and color[1]:
            var.set(color[1])


def show_startup_warning(app: SafeGXBrowser) -> None:
    messagebox.showinfo(
        APP_NAME,
        "This is a custom non-Chromium reader browser. The tick/cross comes from local safety checks and does not guarantee that a site is safe.",
        parent=app,
    )


if __name__ == "__main__":
    browser = SafeGXBrowser()
    browser.after(250, lambda: show_startup_warning(browser))
    sys.exit(browser.mainloop())
