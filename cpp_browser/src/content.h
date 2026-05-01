#pragma once

#include <string>
#include <vector>

namespace safe_gx::content {

struct Link {
    std::string label;
    std::string url;
};

struct ReaderDocument {
    std::string url;
    std::string title;
    std::string text;
    std::string raw_html;
    std::vector<Link> links;
    int script_count = 0;
    int iframe_count = 0;
    int meta_refresh_count = 0;
    int password_field_count = 0;
    int form_count = 0;

    static ReaderDocument from_html(const std::string& url, const std::string& html);
    std::string host() const;
};

}  // namespace safe_gx::content
