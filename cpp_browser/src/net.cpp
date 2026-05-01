#include "net.h"

#include <stdexcept>
#include <vector>
#include <windows.h>
#include <wininet.h>

namespace safe_gx::net {
namespace {

struct WinInetApi {
    HMODULE module = nullptr;
    decltype(&InternetOpenA) internet_open = nullptr;
    decltype(&InternetOpenUrlA) internet_open_url = nullptr;
    decltype(&InternetReadFile) internet_read_file = nullptr;
    decltype(&HttpQueryInfoA) http_query_info = nullptr;
    decltype(&InternetCloseHandle) internet_close_handle = nullptr;

    WinInetApi() {
        module = LoadLibraryA("wininet.dll");
        if (!module) {
            throw std::runtime_error("Could not load wininet.dll.");
        }
#if defined(__GNUC__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wcast-function-type"
#endif
        internet_open = reinterpret_cast<decltype(internet_open)>(GetProcAddress(module, "InternetOpenA"));
        internet_open_url = reinterpret_cast<decltype(internet_open_url)>(GetProcAddress(module, "InternetOpenUrlA"));
        internet_read_file = reinterpret_cast<decltype(internet_read_file)>(GetProcAddress(module, "InternetReadFile"));
        http_query_info = reinterpret_cast<decltype(http_query_info)>(GetProcAddress(module, "HttpQueryInfoA"));
        internet_close_handle = reinterpret_cast<decltype(internet_close_handle)>(GetProcAddress(module, "InternetCloseHandle"));
#if defined(__GNUC__)
#pragma GCC diagnostic pop
#endif
        if (!internet_open || !internet_open_url || !internet_read_file || !http_query_info || !internet_close_handle) {
            throw std::runtime_error("Could not load required WinINet functions.");
        }
    }
};

}  // namespace

HttpResponse HttpClient::get(const std::string& url) const {
    const WinInetApi api;
    HINTERNET internet = api.internet_open("SafeGXBrowserCpp/0.1", INTERNET_OPEN_TYPE_PRECONFIG, nullptr, nullptr, 0);
    if (!internet) {
        throw std::runtime_error("Could not initialize WinINet.");
    }

    HINTERNET request = api.internet_open_url(
        internet,
        url.c_str(),
        "Accept: text/html,*/*\r\n",
        0,
        INTERNET_FLAG_RELOAD | INTERNET_FLAG_NO_CACHE_WRITE | INTERNET_FLAG_SECURE,
        0);
    if (!request) {
        api.internet_close_handle(internet);
        throw std::runtime_error("Could not open URL.");
    }

    std::string body;
    std::vector<char> buffer(8192);
    DWORD bytes_read = 0;
    while (api.internet_read_file(request, buffer.data(), static_cast<DWORD>(buffer.size()), &bytes_read) && bytes_read > 0) {
        body.append(buffer.data(), bytes_read);
        if (body.size() > 1500000) {
            api.internet_close_handle(request);
            api.internet_close_handle(internet);
            throw std::runtime_error("The page is too large for this browser core.");
        }
    }

    char final_url_buffer[4096] = {};
    DWORD final_url_size = sizeof(final_url_buffer);
    std::string final_url = url;
    if (api.http_query_info(request, HTTP_QUERY_CONTENT_LOCATION, final_url_buffer, &final_url_size, nullptr)) {
        final_url = final_url_buffer;
    }

    HttpResponse response;
    response.requested_url = url;
    response.final_url = final_url.empty() ? url : final_url;
    response.body = body;

    api.internet_close_handle(request);
    api.internet_close_handle(internet);
    return response;
}

}  // namespace safe_gx::net
