#include "net.h"

#include <stdexcept>
#include <vector>
#include <windows.h>
#include <wininet.h>

namespace safe_gx::net {

HttpResponse HttpClient::get(const std::string& url) const {
    HINTERNET internet = InternetOpenA("SafeGXBrowserCpp/0.1", INTERNET_OPEN_TYPE_PRECONFIG, nullptr, nullptr, 0);
    if (!internet) {
        throw std::runtime_error("Could not initialize WinINet.");
    }

    HINTERNET request = InternetOpenUrlA(
        internet,
        url.c_str(),
        "Accept: text/html,*/*\r\n",
        0,
        INTERNET_FLAG_RELOAD | INTERNET_FLAG_NO_CACHE_WRITE | INTERNET_FLAG_SECURE,
        0);
    if (!request) {
        InternetCloseHandle(internet);
        throw std::runtime_error("Could not open URL.");
    }

    std::string body;
    std::vector<char> buffer(8192);
    DWORD bytes_read = 0;
    while (InternetReadFile(request, buffer.data(), static_cast<DWORD>(buffer.size()), &bytes_read) && bytes_read > 0) {
        body.append(buffer.data(), bytes_read);
        if (body.size() > 1500000) {
            InternetCloseHandle(request);
            InternetCloseHandle(internet);
            throw std::runtime_error("The page is too large for this browser core.");
        }
    }

    char final_url_buffer[4096] = {};
    DWORD final_url_size = sizeof(final_url_buffer);
    std::string final_url = url;
    if (HttpQueryInfoA(request, HTTP_QUERY_CONTENT_LOCATION, final_url_buffer, &final_url_size, nullptr)) {
        final_url = final_url_buffer;
    }

    HttpResponse response;
    response.requested_url = url;
    response.final_url = final_url.empty() ? url : final_url;
    response.body = body;

    InternetCloseHandle(request);
    InternetCloseHandle(internet);
    return response;
}

}  // namespace safe_gx::net
