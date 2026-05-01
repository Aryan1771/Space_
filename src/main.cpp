#include <algorithm>
#include <cctype>
#include <iostream>
#include <map>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include <windows.h>
#include <wininet.h>

namespace browser {

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
        HINTERNET session = api.internet_open("ScratchBrowser/0.1", INTERNET_OPEN_TYPE_PRECONFIG, nullptr, nullptr, 0);
        if (!session) {
            throw std::runtime_error("Could not start network session.");
        }

        HINTERNET request = api.internet_open_url(
            session,
            url.c_str(),
            "Accept: text/html,*/*\r\nUser-Agent: ScratchBrowser/0.1\r\n",
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

struct Page {
    Document document;
    SafetyResult safety;
    std::vector<std::string> layout;
};

class BrowserShell {
public:
    void run() {
        std::cout << "Browser From Scratch\n";
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

int main() {
    browser::BrowserShell().run();
    return 0;
}
