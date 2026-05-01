#pragma once

#include <string>

namespace safe_gx::net {

struct HttpResponse {
    std::string requested_url;
    std::string final_url;
    std::string body;
};

class HttpClient {
public:
    HttpResponse get(const std::string& url) const;
};

}  // namespace safe_gx::net
