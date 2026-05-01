#include <algorithm>
#include <cctype>
#include <iostream>
#include <map>
#include <memory>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include <windows.h>
#include <windowsx.h>
#include <wininet.h>

#include "resource.h"

namespace browser {

constexpr const char* kAppName = "Space_";
constexpr const char* kUserAgent = "Space_/0.1";

std::string lower(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char ch) {
        return static_cast<char>(std::tolower(ch));
    });
    return value;
}

std::string trim(const std::string& value) {
    const auto begin = value.find_first_not_of(" \t\r\n");
    if (begin == std::string::npos) {
        return "";
    }
    const auto end = value.find_last_not_of(" \t\r\n");
    return value.substr(begin, end - begin + 1);
}

std::string collapse_space(const std::string& value) {
    std::string output;
    bool previous_space = false;
    for (unsigned char ch : value) {
        const bool space = std::isspace(ch) != 0;
        if (space) {
            if (!previous_space) {
                output.push_back(' ');
            }
            previous_space = true;
        } else {
            output.push_back(static_cast<char>(ch));
            previous_space = false;
        }
    }
    return trim(output);
}

std::string decode_entities(std::string value) {
    const std::vector<std::pair<std::string, std::string>> entities = {
        {"&nbsp;", " "}, {"&amp;", "&"}, {"&lt;", "<"}, {"&gt;", ">"}, {"&quot;", "\""}, {"&#39;", "'"}};
    for (const auto& entity : entities) {
        size_t pos = 0;
        while ((pos = value.find(entity.first, pos)) != std::string::npos) {
            value.replace(pos, entity.first.size(), entity.second);
            pos += entity.second.size();
        }
    }
    return value;
}

bool starts_with(const std::string& value, const std::string& prefix) {
    return value.rfind(prefix, 0) == 0;
}

std::string host_from_url(const std::string& url) {
    const auto scheme = url.find("://");
    if (scheme == std::string::npos) {
        return "";
    }
    const auto host_begin = scheme + 3;
    const auto path_begin = url.find('/', host_begin);
    std::string host = path_begin == std::string::npos ? url.substr(host_begin) : url.substr(host_begin, path_begin - host_begin);
    const auto port = host.find(':');
    if (port != std::string::npos) {
        host = host.substr(0, port);
    }
    return lower(host);
}

std::string origin_from_url(const std::string& url) {
    const auto scheme = url.find("://");
    if (scheme == std::string::npos) {
        return "";
    }
    const auto path_begin = url.find('/', scheme + 3);
    return path_begin == std::string::npos ? url : url.substr(0, path_begin);
}

std::string resolve_url(const std::string& base, const std::string& href) {
    if (starts_with(href, "http://") || starts_with(href, "https://")) {
        return href;
    }
    if (href.empty() || starts_with(href, "#") || starts_with(lower(href), "javascript:")) {
        return "";
    }
    if (href[0] == '/') {
        return origin_from_url(base) + href;
    }
    const auto slash = base.find_last_of('/');
    const std::string folder = slash == std::string::npos ? origin_from_url(base) + "/" : base.substr(0, slash + 1);
    return folder + href;
}

std::string google_search_url(const std::string& query) {
    std::string encoded;
    for (unsigned char ch : query) {
        if (std::isalnum(ch)) {
            encoded.push_back(static_cast<char>(ch));
        } else if (std::isspace(ch)) {
            encoded.push_back('+');
        } else {
            encoded.push_back('_');
        }
    }
    return "https://www.google.com/search?q=" + encoded;
}

std::string normalize_input(const std::string& value) {
    const std::string input = trim(value);
    if (input.empty()) {
        return google_search_url("browser from scratch");
    }
    if (starts_with(input, "http://") || starts_with(input, "https://")) {
        return input;
    }
    if (input.find('.') != std::string::npos && input.find(' ') == std::string::npos) {
        return "https://" + input;
    }
    return google_search_url(input);
}

struct HttpResponse {
    std::string url;
    std::string body;
    long status = 0;
};

class NetworkService {
public:
    HttpResponse get(const std::string& url) const {
        WinInet api;
        HINTERNET session = api.internet_open(kUserAgent, INTERNET_OPEN_TYPE_PRECONFIG, nullptr, nullptr, 0);
        if (!session) {
            throw std::runtime_error("Could not start network session.");
        }

        HINTERNET request = api.internet_open_url(
            session,
            url.c_str(),
            "Accept: text/html,*/*\r\nUser-Agent: Space_/0.1\r\n",
            0,
            INTERNET_FLAG_RELOAD | INTERNET_FLAG_NO_CACHE_WRITE,
            0);
        if (!request) {
            api.internet_close(session);
            throw std::runtime_error("Could not open URL.");
        }

        std::string body;
        std::vector<char> buffer(16384);
        DWORD bytes_read = 0;
        while (api.internet_read(request, buffer.data(), static_cast<DWORD>(buffer.size()), &bytes_read) && bytes_read > 0) {
            body.append(buffer.data(), bytes_read);
            if (body.size() > 3'000'000) {
                api.internet_close(request);
                api.internet_close(session);
                throw std::runtime_error("Page is too large for the first engine version.");
            }
        }

        HttpResponse response;
        response.url = url;
        response.body = body;
        api.internet_close(request);
        api.internet_close(session);
        return response;
    }

private:
    struct WinInet {
        HMODULE dll = nullptr;
        decltype(&InternetOpenA) internet_open = nullptr;
        decltype(&InternetOpenUrlA) internet_open_url = nullptr;
        decltype(&InternetReadFile) internet_read = nullptr;
        decltype(&InternetCloseHandle) internet_close = nullptr;

        WinInet() {
            dll = LoadLibraryA("wininet.dll");
            if (!dll) {
                throw std::runtime_error("Could not load wininet.dll.");
            }
#if defined(__GNUC__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wcast-function-type"
#endif
            internet_open = reinterpret_cast<decltype(internet_open)>(GetProcAddress(dll, "InternetOpenA"));
            internet_open_url = reinterpret_cast<decltype(internet_open_url)>(GetProcAddress(dll, "InternetOpenUrlA"));
            internet_read = reinterpret_cast<decltype(internet_read)>(GetProcAddress(dll, "InternetReadFile"));
            internet_close = reinterpret_cast<decltype(internet_close)>(GetProcAddress(dll, "InternetCloseHandle"));
#if defined(__GNUC__)
#pragma GCC diagnostic pop
#endif
            if (!internet_open || !internet_open_url || !internet_read || !internet_close) {
                throw std::runtime_error("Missing required wininet.dll functions.");
            }
        }
    };
};

class AppIcon {
public:
    static HICON load_large() {
        return load_icon(32, 32);
    }

    static HICON load_small() {
        return load_icon(16, 16);
    }

    static void apply_to_window(HWND window) {
        if (!window) {
            return;
        }
        if (HICON large = load_large()) {
            SendMessage(window, WM_SETICON, ICON_BIG, reinterpret_cast<LPARAM>(large));
        }
        if (HICON small = load_small()) {
            SendMessage(window, WM_SETICON, ICON_SMALL, reinterpret_cast<LPARAM>(small));
        }
    }

private:
    static HICON load_icon(int width, int height) {
        HICON icon = reinterpret_cast<HICON>(LoadImage(
            GetModuleHandle(nullptr),
            MAKEINTRESOURCE(IDI_APP_ICON),
            IMAGE_ICON,
            width,
            height,
            LR_DEFAULTCOLOR));
        if (icon) {
            return icon;
        }
        return reinterpret_cast<HICON>(LoadImage(
            nullptr,
            "assets\\app.ico",
            IMAGE_ICON,
            width,
            height,
            LR_LOADFROMFILE | LR_DEFAULTCOLOR));
    }
};

enum class TokenType { StartTag, EndTag, Text };

struct Token {
    TokenType type = TokenType::Text;
    std::string name;
    std::string text;
    std::map<std::string, std::string> attributes;
};

class HtmlTokenizer {
public:
    explicit HtmlTokenizer(std::string source) : source_(std::move(source)) {}

    std::vector<Token> tokenize() {
        std::vector<Token> tokens;
        while (position_ < source_.size()) {
            if (source_[position_] == '<') {
                if (starts_with_at("<!--")) {
                    skip_until("-->");
                    continue;
                }
                Token tag = read_tag();
                if (!tag.name.empty()) {
                    const bool skip_raw_text =
                        tag.type == TokenType::StartTag &&
                        (tag.name == "script" || tag.name == "style" || tag.name == "noscript");
                    tokens.push_back(std::move(tag));
                    if (skip_raw_text) {
                        const std::string close_tag = "</" + tokens.back().name + ">";
                        const std::string lowered_source = lower(source_);
                        const auto close = lowered_source.find(close_tag, position_);
                        if (close == std::string::npos) {
                            position_ = source_.size();
                        } else {
                            position_ = close;
                        }
                    }
                }
            } else {
                Token text;
                text.type = TokenType::Text;
                text.text = decode_entities(read_text());
                if (!trim(text.text).empty()) {
                    tokens.push_back(std::move(text));
                }
            }
        }
        return tokens;
    }

private:
    bool starts_with_at(const std::string& needle) const {
        return source_.compare(position_, needle.size(), needle) == 0;
    }

    void skip_until(const std::string& needle) {
        const auto found = source_.find(needle, position_ + needle.size());
        position_ = found == std::string::npos ? source_.size() : found + needle.size();
    }

    std::string read_text() {
        const auto begin = position_;
        const auto end = source_.find('<', begin);
        position_ = end == std::string::npos ? source_.size() : end;
        return source_.substr(begin, position_ - begin);
    }

    Token read_tag() {
        const auto close = source_.find('>', position_);
        if (close == std::string::npos) {
            position_ = source_.size();
            return {};
        }

        std::string inside = trim(source_.substr(position_ + 1, close - position_ - 1));
        position_ = close + 1;
        if (inside.empty() || inside[0] == '!' || inside[0] == '?') {
            return {};
        }

        Token token;
        if (inside[0] == '/') {
            token.type = TokenType::EndTag;
            inside = trim(inside.substr(1));
        } else {
            token.type = TokenType::StartTag;
        }

        std::istringstream stream(inside);
        stream >> token.name;
        token.name = lower(token.name);
        if (!token.name.empty() && token.name.back() == '/') {
            token.name.pop_back();
        }

        std::string rest;
        std::getline(stream, rest);
        parse_attributes(rest, token.attributes);
        return token;
    }

    static void parse_attributes(const std::string& source, std::map<std::string, std::string>& attributes) {
        size_t pos = 0;
        while (pos < source.size()) {
            while (pos < source.size() && std::isspace(static_cast<unsigned char>(source[pos]))) {
                ++pos;
            }
            size_t name_begin = pos;
            while (pos < source.size() && (std::isalnum(static_cast<unsigned char>(source[pos])) || source[pos] == '-' || source[pos] == '_')) {
                ++pos;
            }
            if (name_begin == pos) {
                ++pos;
                continue;
            }
            std::string name = lower(source.substr(name_begin, pos - name_begin));
            while (pos < source.size() && std::isspace(static_cast<unsigned char>(source[pos]))) {
                ++pos;
            }
            std::string value;
            if (pos < source.size() && source[pos] == '=') {
                ++pos;
                while (pos < source.size() && std::isspace(static_cast<unsigned char>(source[pos]))) {
                    ++pos;
                }
                if (pos < source.size() && (source[pos] == '"' || source[pos] == '\'')) {
                    const char quote = source[pos++];
                    const auto value_end = source.find(quote, pos);
                    value = source.substr(pos, value_end == std::string::npos ? std::string::npos : value_end - pos);
                    pos = value_end == std::string::npos ? source.size() : value_end + 1;
                } else {
                    const auto value_begin = pos;
                    while (pos < source.size() && !std::isspace(static_cast<unsigned char>(source[pos]))) {
                        ++pos;
                    }
                    value = source.substr(value_begin, pos - value_begin);
                }
            }
            attributes[name] = decode_entities(value);
        }
    }

    std::string source_;
    size_t position_ = 0;
};

struct Node {
    std::string name;
    std::string text;
    std::map<std::string, std::string> attributes;
    std::vector<std::unique_ptr<Node>> children;
    Node* parent = nullptr;
};

class HtmlTreeBuilder {
public:
    std::unique_ptr<Node> build(const std::vector<Token>& tokens) {
        auto root = std::make_unique<Node>();
        root->name = "document";
        Node* current = root.get();

        for (const Token& token : tokens) {
            if (token.type == TokenType::Text) {
                auto text = std::make_unique<Node>();
                text->name = "#text";
                text->text = collapse_space(token.text);
                text->parent = current;
                if (!text->text.empty()) {
                    current->children.push_back(std::move(text));
                }
                continue;
            }
            if (token.type == TokenType::StartTag) {
                auto element = std::make_unique<Node>();
                element->name = token.name;
                element->attributes = token.attributes;
                element->parent = current;
                Node* raw = element.get();
                current->children.push_back(std::move(element));
                if (!is_void_element(token.name)) {
                    current = raw;
                }
                continue;
            }
            if (token.type == TokenType::EndTag) {
                while (current->parent && current->name != token.name) {
                    current = current->parent;
                }
                if (current->parent) {
                    current = current->parent;
                }
            }
        }
        return root;
    }

private:
    static bool is_void_element(const std::string& name) {
        static const std::vector<std::string> voids = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"};
        return std::find(voids.begin(), voids.end(), name) != voids.end();
    }

};

struct Document {
    std::string url;
    std::string title = "Untitled";
    std::unique_ptr<Node> root;
    std::vector<std::pair<std::string, std::string>> links;
    int script_count = 0;
    int iframe_count = 0;
    int password_count = 0;
};

class DocumentLoader {
public:
    Document load(const std::string& url, const std::string& html) const {
        HtmlTokenizer tokenizer(html);
        std::vector<Token> tokens = tokenizer.tokenize();
        Document document;
        document.url = url;
        document.root = HtmlTreeBuilder().build(tokens);
        walk(*document.root, document);
        if (document.title.empty()) {
            document.title = "Untitled";
        }
        return document;
    }

private:
    static void walk(const Node& node, Document& document) {
        if (node.name == "title") {
            document.title = collect_text(node);
        }
        if (node.name == "a") {
            const auto href = node.attributes.find("href");
            if (href != node.attributes.end()) {
                const std::string resolved = resolve_url(document.url, href->second);
                if (!resolved.empty()) {
                    std::string label = collect_text(node);
                    if (label.empty()) {
                        label = resolved;
                    }
                    document.links.push_back({label, resolved});
                }
            }
        }
        if (node.name == "script") {
            ++document.script_count;
        }
        if (node.name == "iframe") {
            ++document.iframe_count;
        }
        if (node.name == "input") {
            const auto type = node.attributes.find("type");
            if (type != node.attributes.end() && lower(type->second) == "password") {
                ++document.password_count;
            }
        }
        for (const auto& child : node.children) {
            walk(*child, document);
        }
    }

    static std::string collect_text(const Node& node) {
        if (node.name == "#text") {
            return node.text;
        }
        std::string text;
        for (const auto& child : node.children) {
            const std::string child_text = collect_text(*child);
            if (!child_text.empty()) {
                if (!text.empty()) {
                    text.push_back(' ');
                }
                text += child_text;
            }
        }
        return collapse_space(text);
    }
};

class LayoutEngine {
public:
    std::vector<std::string> layout(const Document& document, size_t width = 100) const {
        std::vector<std::string> lines;
        emit_node(*document.root, lines, 0, width);
        if (lines.empty()) {
            lines.push_back("(This page did not expose readable text.)");
        }
        return lines;
    }

private:
    static bool block_element(const std::string& name) {
        static const std::vector<std::string> blocks = {"body", "main", "article", "section", "header", "footer", "div", "p", "li", "h1", "h2", "h3", "h4", "ul", "ol", "table", "tr"};
        return std::find(blocks.begin(), blocks.end(), name) != blocks.end();
    }

    static void emit_wrapped(const std::string& text, std::vector<std::string>& lines, size_t indent, size_t width) {
        std::istringstream words(text);
        std::string word;
        std::string line(indent, ' ');
        while (words >> word) {
            if (line.size() + word.size() + 1 > width && line.size() > indent) {
                lines.push_back(line);
                line = std::string(indent, ' ');
            }
            if (line.size() > indent) {
                line.push_back(' ');
            }
            line += word;
        }
        if (line.size() > indent) {
            lines.push_back(line);
        }
    }

    static void emit_node(const Node& node, std::vector<std::string>& lines, size_t indent, size_t width) {
        if (node.name == "#text") {
            emit_wrapped(node.text, lines, indent, width);
            return;
        }
        if (node.name == "script" || node.name == "style" || node.name == "head" || node.name == "noscript") {
            return;
        }
        if (node.name == "h1" || node.name == "h2") {
            lines.push_back("");
        }
        for (const auto& child : node.children) {
            emit_node(*child, lines, node.name == "li" ? indent + 2 : indent, width);
        }
        if (block_element(node.name)) {
            lines.push_back("");
        }
    }
};

enum class SafetyState { Safe, Warning, Risky, Unknown };

struct SafetyResult {
    SafetyState state = SafetyState::Unknown;
    std::vector<std::string> findings;
};

class SafetyScanner {
public:
    SafetyResult scan(const Document& document) const {
        SafetyResult result;
        const std::string host = host_from_url(document.url);
        if (!starts_with(document.url, "https://")) {
            result.findings.push_back("HIGH: connection is not HTTPS");
        }
        if (document.url.find('@') != std::string::npos) {
            result.findings.push_back("HIGH: URL contains @");
        }
        if (host.find("xn--") != std::string::npos) {
            result.findings.push_back("MEDIUM: internationalized domain may hide lookalike characters");
        }
        if (document.password_count > 0 && !starts_with(document.url, "https://")) {
            result.findings.push_back("CRITICAL: password input on insecure page");
        }
        if (document.iframe_count > 0) {
            result.findings.push_back("LOW: embedded frames found");
        }
        if (document.script_count > 30) {
            result.findings.push_back("LOW: heavy script usage");
        }

        bool risky = false;
        bool warning = false;
        for (const std::string& finding : result.findings) {
            if (starts_with(finding, "CRITICAL") || starts_with(finding, "HIGH") || starts_with(finding, "MEDIUM")) {
                risky = true;
            }
            if (starts_with(finding, "LOW")) {
                warning = true;
            }
        }
        result.state = risky ? SafetyState::Risky : warning ? SafetyState::Warning : SafetyState::Safe;
        return result;
    }
};

std::string badge(SafetyState state) {
    switch (state) {
        case SafetyState::Safe:
            return "[TICK] SAFE";
        case SafetyState::Warning:
            return "[!] CHECK";
        case SafetyState::Risky:
            return "[X] RISK";
        case SafetyState::Unknown:
            return "[?] UNKNOWN";
    }
    return "[?] UNKNOWN";
}

COLORREF rgb(int r, int g, int b) {
    return RGB(r, g, b);
}

std::wstring widen(const std::string& value) {
    if (value.empty()) {
        return L"";
    }
    const int size = MultiByteToWideChar(CP_UTF8, 0, value.c_str(), -1, nullptr, 0);
    if (size <= 0) {
        return L"";
    }
    std::wstring wide(static_cast<size_t>(size - 1), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, value.c_str(), -1, wide.data(), size);
    return wide;
}

std::string narrow(const std::wstring& value) {
    if (value.empty()) {
        return "";
    }
    const int size = WideCharToMultiByte(CP_UTF8, 0, value.c_str(), -1, nullptr, 0, nullptr, nullptr);
    if (size <= 0) {
        return "";
    }
    std::string text(static_cast<size_t>(size - 1), '\0');
    WideCharToMultiByte(CP_UTF8, 0, value.c_str(), -1, text.data(), size, nullptr, nullptr);
    return text;
}

void fill_rect(HDC dc, const RECT& rect, COLORREF color) {
    HBRUSH brush = CreateSolidBrush(color);
    FillRect(dc, &rect, brush);
    DeleteObject(brush);
}

void draw_text(HDC dc, const std::string& text, RECT rect, COLORREF color, UINT format, int size = 16, int weight = FW_NORMAL) {
    SetBkMode(dc, TRANSPARENT);
    SetTextColor(dc, color);
    HFONT font = CreateFontA(size, 0, 0, 0, weight, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, "Segoe UI");
    HGDIOBJ old_font = SelectObject(dc, font);
    const std::wstring wide = widen(text);
    DrawTextW(dc, wide.c_str(), -1, &rect, format);
    SelectObject(dc, old_font);
    DeleteObject(font);
}

void draw_button(HDC dc, const RECT& rect, const std::string& label, COLORREF bg, COLORREF fg, bool active = false) {
    fill_rect(dc, rect, bg);
    if (active) {
        HPEN pen = CreatePen(PS_SOLID, 2, fg);
        HGDIOBJ old = SelectObject(dc, pen);
        MoveToEx(dc, rect.left, rect.bottom - 2, nullptr);
        LineTo(dc, rect.right, rect.bottom - 2);
        SelectObject(dc, old);
        DeleteObject(pen);
    }
    RECT text_rect = rect;
    draw_text(dc, label, text_rect, fg, DT_CENTER | DT_VCENTER | DT_SINGLELINE, 15, FW_SEMIBOLD);
}

struct Theme {
    std::string name;
    COLORREF window;
    COLORREF sidebar;
    COLORREF topbar;
    COLORREF tab;
    COLORREF active_tab;
    COLORREF page;
    COLORREF panel;
    COLORREF address;
    COLORREF accent;
    COLORREF text;
    COLORREF muted;
    COLORREF safe;
    COLORREF warning;
    COLORREF risk;
};

struct Page {
    Document document;
    SafetyResult safety;
    std::vector<std::string> layout;
};

std::vector<Theme> themes() {
    return {
        {"Opera GX", rgb(7, 8, 14), rgb(3, 4, 8), rgb(14, 16, 25), rgb(28, 32, 48), rgb(38, 45, 70), rgb(10, 12, 18), rgb(18, 22, 35), rgb(4, 6, 12), rgb(54, 105, 255), rgb(245, 247, 255), rgb(150, 162, 195), rgb(23, 210, 126), rgb(245, 196, 66), rgb(255, 74, 105)},
        {"GX Red", rgb(10, 7, 11), rgb(5, 3, 5), rgb(20, 13, 19), rgb(39, 25, 35), rgb(66, 35, 52), rgb(12, 10, 14), rgb(24, 18, 25), rgb(8, 5, 8), rgb(255, 45, 85), rgb(255, 245, 248), rgb(196, 148, 160), rgb(30, 215, 126), rgb(247, 190, 66), rgb(255, 65, 88)},
        {"Neon Green", rgb(5, 10, 8), rgb(2, 6, 5), rgb(10, 19, 16), rgb(18, 39, 31), rgb(25, 62, 47), rgb(7, 13, 11), rgb(12, 24, 20), rgb(4, 9, 7), rgb(48, 230, 150), rgb(238, 255, 247), rgb(143, 188, 169), rgb(30, 230, 146), rgb(240, 201, 79), rgb(255, 75, 98)},
        {"Chrome Light", rgb(246, 248, 252), rgb(235, 239, 247), rgb(246, 248, 252), rgb(225, 230, 239), rgb(255, 255, 255), rgb(255, 255, 255), rgb(243, 246, 251), rgb(255, 255, 255), rgb(26, 115, 232), rgb(32, 33, 36), rgb(95, 99, 104), rgb(24, 128, 56), rgb(176, 96, 0), rgb(217, 48, 37)},
    };
}

struct BrowserTab {
    std::string title = "New tab";
    std::string url = google_search_url("browser from scratch");
    Page page;
    std::vector<std::string> history;
    int history_index = -1;
};

enum class PanelMode { None, Safety, Extensions, Settings, History, Links };

class OperaLikeWindow {
public:
    int run(HINSTANCE instance, int show) {
        instance_ = instance;
        WNDCLASSW wc{};
        wc.lpfnWndProc = &OperaLikeWindow::window_proc;
        wc.hInstance = instance;
        wc.lpszClassName = L"SpaceBrowserWindow";
        wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
        wc.hbrBackground = nullptr;
        wc.hIcon = AppIcon::load_large();
        RegisterClassW(&wc);

        window_ = CreateWindowExW(
            0,
            wc.lpszClassName,
            L"Space_",
            WS_OVERLAPPEDWINDOW,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            1320,
            840,
            nullptr,
            nullptr,
            instance,
            this);
        if (!window_) {
            return 1;
        }
        AppIcon::apply_to_window(window_);
        create_controls();
        ShowWindow(window_, show);
        UpdateWindow(window_);
        navigate(google_search_url("browser from scratch"));

        MSG msg{};
        while (GetMessage(&msg, nullptr, 0, 0)) {
            TranslateMessage(&msg);
            DispatchMessage(&msg);
        }
        return static_cast<int>(msg.wParam);
    }

private:
    static constexpr int kSidebarWidth = 62;
    static constexpr int kTabHeight = 48;
    static constexpr int kNavHeight = 56;
    static constexpr int kPanelWidth = 330;

    static LRESULT CALLBACK window_proc(HWND hwnd, UINT message, WPARAM wparam, LPARAM lparam) {
        OperaLikeWindow* self = nullptr;
        if (message == WM_NCCREATE) {
            auto* create = reinterpret_cast<CREATESTRUCT*>(lparam);
            self = static_cast<OperaLikeWindow*>(create->lpCreateParams);
            SetWindowLongPtr(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(self));
        } else {
            self = reinterpret_cast<OperaLikeWindow*>(GetWindowLongPtr(hwnd, GWLP_USERDATA));
        }
        if (!self) {
            return DefWindowProc(hwnd, message, wparam, lparam);
        }
        return self->handle(hwnd, message, wparam, lparam);
    }

    LRESULT handle(HWND hwnd, UINT message, WPARAM wparam, LPARAM lparam) {
        switch (message) {
            case WM_SIZE:
                layout_controls();
                InvalidateRect(hwnd, nullptr, TRUE);
                return 0;
            case WM_COMMAND:
                if (reinterpret_cast<HWND>(lparam) == address_ && HIWORD(wparam) == EN_UPDATE) {
                    return 0;
                }
                if (reinterpret_cast<HWND>(lparam) == address_ && HIWORD(wparam) == EN_KILLFOCUS) {
                    return 0;
                }
                return 0;
            case WM_KEYDOWN:
                if (wparam == VK_RETURN && GetFocus() == address_) {
                    navigate(address_text());
                    return 0;
                }
                return 0;
            case WM_CTLCOLOREDIT:
                SetTextColor(reinterpret_cast<HDC>(wparam), theme().text);
                SetBkColor(reinterpret_cast<HDC>(wparam), theme().address);
                return reinterpret_cast<LRESULT>(edit_brush());
            case WM_LBUTTONDOWN:
                on_click(GET_X_LPARAM(lparam), GET_Y_LPARAM(lparam));
                return 0;
            case WM_PAINT:
                paint();
                return 0;
            case WM_DESTROY:
                PostQuitMessage(0);
                return 0;
        }
        return DefWindowProc(hwnd, message, wparam, lparam);
    }

    void create_controls() {
        address_ = CreateWindowExW(
            0,
            L"EDIT",
            L"",
            WS_CHILD | WS_VISIBLE | ES_AUTOHSCROLL,
            0,
            0,
            100,
            28,
            window_,
            reinterpret_cast<HMENU>(1001),
            instance_,
            nullptr);
        HFONT font = CreateFontA(18, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, "Segoe UI");
        SendMessage(address_, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);
        tabs_.push_back(BrowserTab{});
        active_tab_ = 0;
        layout_controls();
    }

    void layout_controls() {
        RECT client{};
        GetClientRect(window_, &client);
        const int panel = panel_ == PanelMode::None ? 0 : kPanelWidth;
        MoveWindow(
            address_,
            kSidebarWidth + 320,
            kTabHeight + 12,
            std::max(240, static_cast<int>(client.right) - kSidebarWidth - panel - 405),
            32,
            TRUE);
    }

    HBRUSH edit_brush() {
        static HBRUSH brush = nullptr;
        if (brush) {
            DeleteObject(brush);
        }
        brush = CreateSolidBrush(theme().address);
        SetTextColor(GetDC(address_), theme().text);
        return brush;
    }

    std::string address_text() const {
        int length = GetWindowTextLengthW(address_);
        std::wstring text(static_cast<size_t>(length), L'\0');
        GetWindowTextW(address_, text.data(), length + 1);
        return narrow(text);
    }

    void set_address(const std::string& text) {
        SetWindowTextW(address_, widen(text).c_str());
    }

    Theme theme() const {
        return themes()[theme_index_ % themes().size()];
    }

    BrowserTab& active() {
        return tabs_[active_tab_];
    }

    void navigate(const std::string& input, bool add_history = true) {
        BrowserTab& tab = active();
        const std::string url = normalize_input(input);
        tab.url = url;
        tab.title = "Loading...";
        set_address(url);
        InvalidateRect(window_, nullptr, TRUE);
        try {
            HttpResponse response = network_.get(url);
            tab.page.document = loader_.load(url, response.body);
            tab.page.safety = scanner_.scan(tab.page.document);
            tab.page.layout = layout_.layout(tab.page.document, 110);
            tab.title = tab.page.document.title.empty() ? "Untitled" : tab.page.document.title;
        } catch (const std::exception& error) {
            tab.page = {};
            tab.page.document.url = url;
            tab.page.document.title = "Load failed";
            tab.page.safety.state = SafetyState::Risky;
            tab.page.safety.findings.push_back(std::string("HIGH: load failed: ") + error.what());
            tab.page.layout = {error.what()};
            tab.title = "Load failed";
        }
        if (add_history) {
            tab.history.resize(static_cast<size_t>(tab.history_index + 1));
            tab.history.push_back(url);
            tab.history_index = static_cast<int>(tab.history.size()) - 1;
        }
        SetWindowTextW(window_, widen("Space_ - " + tab.title).c_str());
        InvalidateRect(window_, nullptr, TRUE);
    }

    void back() {
        BrowserTab& tab = active();
        if (tab.history_index > 0) {
            --tab.history_index;
            navigate(tab.history[tab.history_index], false);
        }
    }

    void forward() {
        BrowserTab& tab = active();
        if (tab.history_index < static_cast<int>(tab.history.size()) - 1) {
            ++tab.history_index;
            navigate(tab.history[tab.history_index], false);
        }
    }

    void new_tab() {
        tabs_.push_back(BrowserTab{});
        active_tab_ = tabs_.size() - 1;
        navigate(google_search_url("browser from scratch"));
    }

    void on_click(int x, int y) {
        if (x < kSidebarWidth) {
            const int item = y / 40;
            switch (item) {
                case 0:
                    navigate(google_search_url("browser from scratch"));
                    break;
                case 1:
                    panel_ = PanelMode::Safety;
                    break;
                case 2:
                    panel_ = PanelMode::Links;
                    break;
                case 3:
                    panel_ = PanelMode::History;
                    break;
                case 4:
                    panel_ = PanelMode::Extensions;
                    break;
                case 5:
                    panel_ = PanelMode::Settings;
                    break;
                case 6:
                    theme_index_ = (theme_index_ + 1) % themes().size();
                    break;
                default:
                    panel_ = panel_ == PanelMode::None ? PanelMode::Safety : PanelMode::None;
                    break;
            }
            layout_controls();
            InvalidateRect(window_, nullptr, TRUE);
            return;
        }
        if (y < kTabHeight) {
            const int tab_start = kSidebarWidth + 12;
            const int index = (x - tab_start) / 150;
            if (index >= 0 && index < static_cast<int>(tabs_.size())) {
                active_tab_ = static_cast<size_t>(index);
                set_address(active().url);
                InvalidateRect(window_, nullptr, TRUE);
                return;
            }
            if (x > tab_start + static_cast<int>(tabs_.size()) * 150 && x < tab_start + static_cast<int>(tabs_.size()) * 150 + 42) {
                new_tab();
                return;
            }
        }
        if (y >= kTabHeight && y < kTabHeight + kNavHeight) {
            if (hit(x, y, back_rect())) back();
            else if (hit(x, y, forward_rect())) forward();
            else if (hit(x, y, reload_rect())) navigate(active().url, false);
            else if (hit(x, y, home_rect())) navigate(google_search_url("browser from scratch"));
            else if (hit(x, y, go_rect())) navigate(address_text());
        }
    }

    bool hit(int x, int y, const RECT& rect) const {
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    RECT back_rect() const { return {kSidebarWidth + 16, kTabHeight + 10, kSidebarWidth + 58, kTabHeight + 44}; }
    RECT forward_rect() const { return {kSidebarWidth + 64, kTabHeight + 10, kSidebarWidth + 106, kTabHeight + 44}; }
    RECT reload_rect() const { return {kSidebarWidth + 112, kTabHeight + 10, kSidebarWidth + 154, kTabHeight + 44}; }
    RECT home_rect() const { return {kSidebarWidth + 160, kTabHeight + 10, kSidebarWidth + 230, kTabHeight + 44}; }
    RECT badge_rect() const { return {kSidebarWidth + 238, kTabHeight + 10, kSidebarWidth + 312, kTabHeight + 44}; }
    RECT go_rect() const {
        RECT client{};
        GetClientRect(window_, &client);
        const int panel = panel_ == PanelMode::None ? 0 : kPanelWidth;
        return {client.right - panel - 62, kTabHeight + 10, client.right - panel - 14, kTabHeight + 44};
    }

    void paint() {
        PAINTSTRUCT ps{};
        HDC dc = BeginPaint(window_, &ps);
        RECT client{};
        GetClientRect(window_, &client);
        Theme t = theme();
        fill_rect(dc, client, t.window);
        paint_sidebar(dc, client, t);
        paint_tabs(dc, client, t);
        paint_nav(dc, client, t);
        paint_page(dc, client, t);
        if (panel_ != PanelMode::None) {
            paint_panel(dc, client, t);
        }
        EndPaint(window_, &ps);
    }

    void paint_sidebar(HDC dc, const RECT& client, const Theme& t) {
        RECT sidebar{0, 0, kSidebarWidth, client.bottom};
        fill_rect(dc, sidebar, t.sidebar);
        const std::vector<std::string> labels = {"O", "S", "L", "H", "X", "T", "GX", "..."};
        for (size_t i = 0; i < labels.size(); ++i) {
            RECT r{10, static_cast<LONG>(12 + i * 40), kSidebarWidth - 10, static_cast<LONG>(44 + i * 40)};
            draw_button(dc, r, labels[i], t.sidebar, t.accent, false);
        }
        RECT brand{8, client.bottom - 42, kSidebarWidth - 8, client.bottom - 10};
        draw_text(dc, "Space_", brand, t.accent, DT_CENTER | DT_VCENTER | DT_SINGLELINE, 13, FW_BOLD);
    }

    void paint_tabs(HDC dc, const RECT& client, const Theme& t) {
        RECT top{kSidebarWidth, 0, client.right, kTabHeight};
        fill_rect(dc, top, t.topbar);
        int x = kSidebarWidth + 12;
        for (size_t i = 0; i < tabs_.size(); ++i) {
            RECT tab{x, 8, x + 140, 42};
            draw_button(dc, tab, tabs_[i].title.substr(0, 18), i == active_tab_ ? t.active_tab : t.tab, t.text, i == active_tab_);
            x += 150;
        }
        RECT add{x, 8, x + 38, 42};
        draw_button(dc, add, "+", t.tab, t.text, false);
    }

    void paint_nav(HDC dc, const RECT& client, const Theme& t) {
        RECT nav{kSidebarWidth, kTabHeight, client.right, kTabHeight + kNavHeight};
        fill_rect(dc, nav, t.topbar);
        draw_button(dc, back_rect(), "<", t.topbar, t.text);
        draw_button(dc, forward_rect(), ">", t.topbar, t.text);
        draw_button(dc, reload_rect(), "R", t.topbar, t.text);
        draw_button(dc, home_rect(), "Home", t.topbar, t.text);
        const SafetyState state = active().page.safety.state;
        COLORREF badge_color = state == SafetyState::Safe ? t.safe : state == SafetyState::Warning ? t.warning : state == SafetyState::Risky ? t.risk : t.muted;
        draw_button(dc, badge_rect(), state == SafetyState::Safe ? "Tick" : state == SafetyState::Risky ? "Risk" : "Check", badge_color, RGB(255, 255, 255));
        draw_button(dc, go_rect(), "Go", t.topbar, t.text);
    }

    void paint_page(HDC dc, const RECT& client, const Theme& t) {
        const int panel = panel_ == PanelMode::None ? 0 : kPanelWidth;
        RECT page{kSidebarWidth, kTabHeight + kNavHeight, client.right - panel, client.bottom};
        fill_rect(dc, page, t.page);
        RECT title{page.left + 24, page.top + 22, page.right - 24, page.top + 56};
        draw_text(dc, active().page.document.title, title, t.text, DT_LEFT | DT_SINGLELINE | DT_VCENTER, 24, FW_BOLD);
        int y = page.top + 72;
        for (const auto& line : active().page.layout) {
            if (y > page.bottom - 24) break;
            if (!line.empty()) {
                RECT r{page.left + 26, y, page.right - 28, y + 24};
                draw_text(dc, line, r, t.text, DT_LEFT | DT_SINGLELINE | DT_END_ELLIPSIS, 17);
                y += 24;
            } else {
                y += 8;
            }
        }
    }

    void paint_panel(HDC dc, const RECT& client, const Theme& t) {
        RECT panel{client.right - kPanelWidth, kTabHeight + kNavHeight, client.right, client.bottom};
        fill_rect(dc, panel, t.panel);
        std::string title = "Safety";
        std::vector<std::string> lines;
        if (panel_ == PanelMode::Extensions) {
            title = "Extensions";
            lines = {"Built-in safety scanner", "Theme manager", "Sidebar launcher", "Extension API coming next"};
        } else if (panel_ == PanelMode::Settings) {
            title = "Settings";
            lines = {"Theme: " + theme().name, "Click GX in sidebar to cycle themes.", "Icon: assets/app.ico", "Engine: custom C++ base"};
        } else if (panel_ == PanelMode::History) {
            title = "History";
            lines = active().history;
        } else if (panel_ == PanelMode::Links) {
            title = "Links";
            for (const auto& link : active().page.document.links) {
                lines.push_back(link.first + " -> " + link.second);
                if (lines.size() > 20) break;
            }
        } else {
            lines.push_back("Verification: " + badge(active().page.safety.state));
            if (active().page.safety.findings.empty()) lines.push_back("No obvious risk detected.");
            for (const auto& finding : active().page.safety.findings) lines.push_back(finding);
        }
        RECT heading{panel.left + 18, panel.top + 18, panel.right - 18, panel.top + 52};
        draw_text(dc, title, heading, t.text, DT_LEFT | DT_SINGLELINE | DT_VCENTER, 22, FW_BOLD);
        int y = panel.top + 66;
        for (const auto& line : lines) {
            RECT row{panel.left + 18, y, panel.right - 18, y + 48};
            draw_text(dc, line, row, t.text, DT_LEFT | DT_WORDBREAK, 16);
            y += 52;
            if (y > panel.bottom - 20) break;
        }
    }

    HINSTANCE instance_ = nullptr;
    HWND window_ = nullptr;
    HWND address_ = nullptr;
    NetworkService network_;
    DocumentLoader loader_;
    LayoutEngine layout_;
    SafetyScanner scanner_;
    std::vector<BrowserTab> tabs_;
    size_t active_tab_ = 0;
    size_t theme_index_ = 0;
    PanelMode panel_ = PanelMode::Safety;
};

class BrowserShell {
public:
    void run() {
        SetConsoleTitleA(kAppName);
        std::cout << kAppName << "\n";
        std::cout << "No Chromium. No embedded browser. First engine foundation.\n";
        navigate(google_search_url("browser from scratch"));
        help();

        std::string line;
        while (true) {
            std::cout << "\nbrowser> ";
            if (!std::getline(std::cin, line)) {
                break;
            }
            if (!command(line)) {
                break;
            }
        }
    }

private:
    bool command(const std::string& line) {
        std::istringstream input(trim(line));
        std::string verb;
        input >> verb;
        if (verb.empty()) {
            return true;
        }
        if (verb == "quit" || verb == "exit") {
            return false;
        }
        if (verb == "help") {
            help();
        } else if (verb == "open") {
            std::string rest;
            std::getline(input, rest);
            navigate(normalize_input(rest));
        } else if (verb == "search") {
            std::string rest;
            std::getline(input, rest);
            navigate(google_search_url(trim(rest)));
        } else if (verb == "back") {
            back();
        } else if (verb == "forward") {
            forward();
        } else if (verb == "reload") {
            if (!history_.empty()) {
                navigate(history_[history_index_], false);
            }
        } else if (verb == "safety") {
            print_safety();
        } else if (verb == "dom") {
            if (current_.document.root) {
                print_dom(*current_.document.root, 0);
            }
        } else {
            std::cout << "Unknown command. Type help.\n";
        }
        return true;
    }

    void navigate(const std::string& url, bool add_history = true) {
        std::cout << "\nLoading " << url << "\n";
        try {
            HttpResponse response = network_.get(url);
            current_.document = loader_.load(url, response.body);
            current_.safety = scanner_.scan(current_.document);
            current_.layout = layout_.layout(current_.document);
        } catch (const std::exception& error) {
            current_ = {};
            current_.document.url = url;
            current_.document.title = "Load failed";
            current_.safety.state = SafetyState::Risky;
            current_.safety.findings.push_back(std::string("HIGH: load failed: ") + error.what());
            current_.layout = {error.what()};
        }

        if (add_history) {
            history_.resize(static_cast<size_t>(history_index_ + 1));
            history_.push_back(url);
            history_index_ = static_cast<int>(history_.size()) - 1;
        }
        paint();
    }

    void back() {
        if (history_index_ <= 0) {
            std::cout << "No back history.\n";
            return;
        }
        --history_index_;
        navigate(history_[history_index_], false);
    }

    void forward() {
        if (history_index_ >= static_cast<int>(history_.size()) - 1) {
            std::cout << "No forward history.\n";
            return;
        }
        ++history_index_;
        navigate(history_[history_index_], false);
    }

    void paint() const {
        std::cout << "\n" << badge(current_.safety.state) << "  " << current_.document.title << "\n";
        std::cout << current_.document.url << "\n";
        std::cout << "------------------------------------------------------------\n";
        size_t count = 0;
        for (const std::string& line : current_.layout) {
            if (++count > 45) {
                std::cout << "... trimmed ...\n";
                break;
            }
            if (!line.empty()) {
                std::cout << line << "\n";
            }
        }
    }

    void print_safety() const {
        std::cout << badge(current_.safety.state) << "\n";
        if (current_.safety.findings.empty()) {
            std::cout << "No obvious risk detected. This is not a guarantee of safety.\n";
            return;
        }
        for (const std::string& finding : current_.safety.findings) {
            std::cout << finding << "\n";
        }
    }

    static void print_dom(const Node& node, int depth) {
        std::cout << std::string(static_cast<size_t>(depth) * 2, ' ') << node.name;
        if (node.name == "#text") {
            std::cout << ": " << node.text.substr(0, 80);
        }
        std::cout << "\n";
        for (const auto& child : node.children) {
            print_dom(*child, depth + 1);
        }
    }

    static void help() {
        std::cout << "\nCommands:\n";
        std::cout << "  open <url-or-domain>\n";
        std::cout << "  search <words>\n";
        std::cout << "  back | forward | reload\n";
        std::cout << "  safety | dom | help | quit\n";
    }

    NetworkService network_;
    DocumentLoader loader_;
    LayoutEngine layout_;
    SafetyScanner scanner_;
    Page current_;
    std::vector<std::string> history_;
    int history_index_ = -1;
};

}  // namespace browser

int WINAPI WinMain(HINSTANCE instance, HINSTANCE, LPSTR, int show) {
    return browser::OperaLikeWindow().run(instance, show);
}
