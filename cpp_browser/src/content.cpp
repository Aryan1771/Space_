#include "content.h"

#include <algorithm>
#include <cctype>

namespace safe_gx::content {
namespace {

std::string lower(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char ch) { return static_cast<char>(std::tolower(ch)); });
    return value;
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

std::string compact_space(const std::string& value) {
    std::string output;
    bool last_space = false;
    for (unsigned char ch : value) {
        const bool is_space = std::isspace(ch) != 0;
        if (is_space) {
            if (!last_space) {
                output.push_back(' ');
            }
            last_space = true;
        } else {
            output.push_back(static_cast<char>(ch));
            last_space = false;
        }
    }
    const auto begin = output.find_first_not_of(' ');
    if (begin == std::string::npos) {
        return "";
    }
    const auto end = output.find_last_not_of(' ');
    return output.substr(begin, end - begin + 1);
}

std::string strip_tags(const std::string& value) {
    std::string output;
    bool in_tag = false;
    bool skip_script_or_style = false;
    std::string tag_name;
    const std::string low = lower(value);

    for (size_t index = 0; index < value.size(); ++index) {
        if (!in_tag && value[index] == '<') {
            in_tag = true;
            tag_name.clear();
            size_t name_start = index + 1;
            if (name_start < value.size() && value[name_start] == '/') {
                ++name_start;
            }
            while (name_start < value.size() && std::isspace(static_cast<unsigned char>(value[name_start]))) {
                ++name_start;
            }
            size_t name_end = name_start;
            while (name_end < value.size() && std::isalpha(static_cast<unsigned char>(value[name_end]))) {
                ++name_end;
            }
            tag_name = low.substr(name_start, name_end - name_start);
            if (tag_name == "script" || tag_name == "style") {
                const std::string close_tag = "</" + tag_name + ">";
                const auto close_pos = low.find(close_tag, index);
                if (close_pos != std::string::npos) {
                    index = close_pos + close_tag.size() - 1;
                    in_tag = false;
                    skip_script_or_style = false;
                    output.push_back(' ');
                    continue;
                }
                skip_script_or_style = true;
            }
            output.push_back(' ');
            continue;
        }
        if (in_tag) {
            if (value[index] == '>') {
                in_tag = false;
                skip_script_or_style = false;
            }
            continue;
        }
        if (!skip_script_or_style) {
            output.push_back(value[index]);
        }
    }
    return compact_space(decode_entities(output));
}

std::string resolve_url(const std::string& base, const std::string& href) {
    if (href.rfind("http://", 0) == 0 || href.rfind("https://", 0) == 0) {
        return href;
    }
    if (href.empty() || href[0] == '#') {
        return "";
    }
    const auto parsed = base.find("://");
    if (parsed == std::string::npos) {
        return "";
    }
    const auto host_end = base.find('/', parsed + 3);
    const std::string origin = host_end == std::string::npos ? base : base.substr(0, host_end);
    if (href[0] == '/') {
        return origin + href;
    }
    const std::string folder = host_end == std::string::npos ? origin + "/" : base.substr(0, base.find_last_of('/') + 1);
    return folder + href;
}

int count_substrings(const std::string& value, const std::string& needle) {
    int count = 0;
    size_t pos = 0;
    while ((pos = value.find(needle, pos)) != std::string::npos) {
        ++count;
        pos += needle.size();
    }
    return count;
}

std::string extract_title(const std::string& html) {
    const std::string low = lower(html);
    const auto open = low.find("<title");
    if (open == std::string::npos) {
        return "";
    }
    const auto open_end = low.find('>', open);
    const auto close = low.find("</title>", open_end == std::string::npos ? open : open_end);
    if (open_end == std::string::npos || close == std::string::npos) {
        return "";
    }
    return strip_tags(html.substr(open_end + 1, close - open_end - 1));
}

std::string attribute_value(const std::string& tag, const std::string& name) {
    const std::string low = lower(tag);
    const auto attr = low.find(name);
    if (attr == std::string::npos) {
        return "";
    }
    const auto equals = low.find('=', attr + name.size());
    if (equals == std::string::npos) {
        return "";
    }
    size_t value_start = equals + 1;
    while (value_start < tag.size() && std::isspace(static_cast<unsigned char>(tag[value_start]))) {
        ++value_start;
    }
    if (value_start >= tag.size()) {
        return "";
    }
    const char quote = tag[value_start] == '\'' || tag[value_start] == '"' ? tag[value_start++] : ' ';
    size_t value_end = value_start;
    if (quote == ' ') {
        while (value_end < tag.size() && !std::isspace(static_cast<unsigned char>(tag[value_end])) && tag[value_end] != '>') {
            ++value_end;
        }
    } else {
        value_end = tag.find(quote, value_start);
        if (value_end == std::string::npos) {
            value_end = tag.size();
        }
    }
    return tag.substr(value_start, value_end - value_start);
}

}  // namespace

ReaderDocument ReaderDocument::from_html(const std::string& url, const std::string& html) {
    ReaderDocument document;
    document.url = url;
    document.raw_html = html;

    document.title = extract_title(html);
    if (document.title.empty()) {
        document.title = "Untitled page";
    }

    const std::string low = lower(html);
    document.script_count = count_substrings(low, "<script");
    document.iframe_count = count_substrings(low, "<iframe");
    document.password_field_count = count_substrings(low, "password");
    document.form_count = count_substrings(low, "<form");
    document.meta_refresh_count = count_substrings(low, "http-equiv=\"refresh") + count_substrings(low, "http-equiv='refresh") + count_substrings(low, "http-equiv=refresh");

    size_t anchor = 0;
    while ((anchor = low.find("<a", anchor)) != std::string::npos) {
        const auto tag_end = html.find('>', anchor);
        if (tag_end == std::string::npos) {
            break;
        }
        const std::string tag = html.substr(anchor, tag_end - anchor + 1);
        const std::string href = resolve_url(url, attribute_value(tag, "href"));
        if (href.empty()) {
            anchor = tag_end + 1;
            continue;
        }
        const auto close = low.find("</a>", tag_end);
        const std::string label_html = close == std::string::npos ? href : html.substr(tag_end + 1, close - tag_end - 1);
        Link link;
        link.url = href;
        link.label = strip_tags(label_html);
        if (link.label.empty()) {
            link.label = href;
        }
        if (link.label.size() > 120) {
            link.label.resize(120);
        }
        document.links.push_back(link);
        if (document.links.size() >= 300) {
            break;
        }
        anchor = close == std::string::npos ? tag_end + 1 : close + 4;
    }

    document.text = strip_tags(html);
    if (document.text.empty()) {
        document.text = "This page did not expose readable text.";
    }
    return document;
}

std::string ReaderDocument::host() const {
    const auto scheme = url.find("://");
    if (scheme == std::string::npos) {
        return "";
    }
    const auto start = scheme + 3;
    const auto end = url.find('/', start);
    std::string value = end == std::string::npos ? url.substr(start) : url.substr(start, end - start);
    const auto colon = value.find(':');
    if (colon != std::string::npos) {
        value = value.substr(0, colon);
    }
    return lower(value);
}

}  // namespace safe_gx::content
