#define NOMINMAX
#include <windows.h>
#include <windowsx.h>
#include <shellapi.h>
#include <wrl.h>

#include <algorithm>
#include <cmath>
#include <cwctype>
#include <string>
#include <vector>

#include "resource.h"
#include "WebView2.h"

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;

namespace {

constexpr wchar_t kAppName[] = L"Space_";
constexpr wchar_t kHomeUrl[] = L"https://www.google.com/";
constexpr int kSidebarWidth = 68;
constexpr int kTopHeight = 104;
constexpr int kPanelWidth = 430;

struct Theme {
    COLORREF window;
    COLORREF sidebar;
    COLORREF sidebarHot;
    COLORREF top;
    COLORREF tab;
    COLORREF activeTab;
    COLORREF address;
    COLORREF panel;
    COLORREF text;
    COLORREF muted;
    COLORREF accent;
    COLORREF safe;
    COLORREF risk;
};

const std::vector<Theme>& Themes() {
    static const std::vector<Theme> themes = {
        {RGB(8,9,16), RGB(2,3,7), RGB(24,31,55), RGB(14,16,26), RGB(28,32,50), RGB(38,45,72), RGB(4,6,12), RGB(18,20,31), RGB(245,247,255), RGB(142,154,190), RGB(54,106,255), RGB(18,208,122), RGB(255,70,98)},
        {RGB(12,6,10), RGB(5,3,5), RGB(39,19,31), RGB(22,13,21), RGB(44,26,39), RGB(71,37,58), RGB(8,4,8), RGB(24,14,22), RGB(255,244,249), RGB(204,148,168), RGB(255,45,85), RGB(27,211,126), RGB(255,71,96)},
        {RGB(5,10,8), RGB(2,6,5), RGB(14,38,30), RGB(10,20,17), RGB(18,40,32), RGB(26,64,50), RGB(4,9,7), RGB(12,23,18), RGB(238,255,247), RGB(142,188,169), RGB(48,230,150), RGB(30,230,146), RGB(255,75,98)},
        {RGB(246,248,252), RGB(235,239,247), RGB(222,231,248), RGB(246,248,252), RGB(225,230,239), RGB(255,255,255), RGB(255,255,255), RGB(243,246,251), RGB(32,33,36), RGB(95,99,104), RGB(26,115,232), RGB(24,128,56), RGB(217,48,37)},
    };
    return themes;
}

std::wstring Trim(std::wstring value) {
    while (!value.empty() && std::iswspace(value.front())) value.erase(value.begin());
    while (!value.empty() && std::iswspace(value.back())) value.pop_back();
    return value;
}

std::wstring NormalizeUrl(std::wstring text) {
    text = Trim(text);
    if (text.empty()) return kHomeUrl;
    if (text.rfind(L"http://", 0) == 0 || text.rfind(L"https://", 0) == 0) return text;
    if (text.find(L'.') != std::wstring::npos && text.find(L' ') == std::wstring::npos) return L"https://" + text;
    for (auto& ch : text) {
        if (ch == L' ') ch = L'+';
    }
    return L"https://www.google.com/search?q=" + text;
}

void Fill(HDC dc, RECT r, COLORREF color) {
    HBRUSH brush = CreateSolidBrush(color);
    FillRect(dc, &r, brush);
    DeleteObject(brush);
}

void RoundFill(HDC dc, RECT r, COLORREF fill, COLORREF border, int radius = 12) {
    HBRUSH brush = CreateSolidBrush(fill);
    HPEN pen = CreatePen(PS_SOLID, 1, border);
    auto oldBrush = SelectObject(dc, brush);
    auto oldPen = SelectObject(dc, pen);
    RoundRect(dc, r.left, r.top, r.right, r.bottom, radius, radius);
    SelectObject(dc, oldPen);
    SelectObject(dc, oldBrush);
    DeleteObject(pen);
    DeleteObject(brush);
}

void Text(HDC dc, const std::wstring& text, RECT r, COLORREF color, int size = 16, int weight = FW_NORMAL, UINT format = DT_CENTER | DT_VCENTER | DT_SINGLELINE) {
    SetBkMode(dc, TRANSPARENT);
    SetTextColor(dc, color);
    HFONT font = CreateFontW(size, 0, 0, 0, weight, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Segoe UI");
    auto old = SelectObject(dc, font);
    DrawTextW(dc, text.c_str(), -1, &r, format);
    SelectObject(dc, old);
    DeleteObject(font);
}

void Icon(HDC dc, RECT r, COLORREF color, int kind, bool active = false) {
    if (active) RoundFill(dc, {r.left - 6, r.top - 4, r.right + 6, r.bottom + 4}, RGB(32,39,72), RGB(45,61,130), 8);

    HPEN pen = CreatePen(PS_SOLID, 2, color);
    auto oldPen = SelectObject(dc, pen);
    auto oldBrush = SelectObject(dc, GetStockObject(HOLLOW_BRUSH));
    int cx = (r.left + r.right) / 2;
    int cy = (r.top + r.bottom) / 2;

    switch (kind) {
        case 0:
            Ellipse(dc, cx - 12, cy - 12, cx + 12, cy + 12);
            MoveToEx(dc, cx - 5, cy + 7, nullptr); LineTo(dc, cx + 9, cy - 8);
            break;
        case 1:
            MoveToEx(dc, cx, cy - 14, nullptr); LineTo(dc, cx + 12, cy - 7); LineTo(dc, cx + 9, cy + 9);
            LineTo(dc, cx, cy + 14); LineTo(dc, cx - 9, cy + 9); LineTo(dc, cx - 12, cy - 7); LineTo(dc, cx, cy - 14);
            break;
        case 2:
            Arc(dc, cx - 13, cy - 13, cx + 13, cy + 13, cx - 8, cy - 8, cx - 13, cy + 2);
            MoveToEx(dc, cx, cy - 7, nullptr); LineTo(dc, cx, cy); LineTo(dc, cx + 8, cy + 5);
            break;
        case 3:
            Rectangle(dc, cx - 12, cy - 9, cx + 12, cy + 12);
            Rectangle(dc, cx - 5, cy - 15, cx + 5, cy - 8);
            break;
        case 4:
            Ellipse(dc, cx - 11, cy - 11, cx + 11, cy + 11);
            for (int i = 0; i < 8; ++i) {
                double a = i * 3.14159 / 4.0;
                MoveToEx(dc, cx + (int)(std::cos(a) * 15), cy + (int)(std::sin(a) * 15), nullptr);
                LineTo(dc, cx + (int)(std::cos(a) * 18), cy + (int)(std::sin(a) * 18));
            }
            break;
        case 5:
            Ellipse(dc, cx - 12, cy - 12, cx + 12, cy + 12);
            Ellipse(dc, cx - 4, cy - 4, cx + 4, cy + 4);
            break;
        case 6:
            for (int i = 0; i < 6; ++i) {
                double a = i * 3.14159 / 3.0;
                int x = cx + (int)(std::cos(a) * 14);
                int y = cy + (int)(std::sin(a) * 14);
                MoveToEx(dc, cx, cy, nullptr); LineTo(dc, x, y); Ellipse(dc, x - 3, y - 3, x + 3, y + 3);
            }
            break;
        case 7:
            RoundRect(dc, cx - 14, cy - 11, cx + 14, cy + 11, 12, 12);
            MoveToEx(dc, cx - 5, cy + 10, nullptr); LineTo(dc, cx - 12, cy + 16);
            break;
        case 8:
            MoveToEx(dc, cx - 15, cy - 2, nullptr); LineTo(dc, cx + 15, cy - 13); LineTo(dc, cx + 5, cy + 14);
            LineTo(dc, cx - 2, cy + 4); LineTo(dc, cx - 15, cy - 2);
            break;
        case 9:
            RoundRect(dc, cx - 15, cy - 10, cx + 15, cy + 10, 10, 10);
            Ellipse(dc, cx - 8, cy - 3, cx - 4, cy + 1); Ellipse(dc, cx + 4, cy - 3, cx + 8, cy + 1);
            break;
        case 10:
            Rectangle(dc, cx - 13, cy - 11, cx + 13, cy + 11);
            MoveToEx(dc, cx - 6, cy - 5, nullptr); LineTo(dc, cx - 6, cy + 5);
            MoveToEx(dc, cx + 6, cy - 5, nullptr); LineTo(dc, cx + 6, cy + 5);
            break;
        default:
            Ellipse(dc, cx - 10, cy - 2, cx - 6, cy + 2); Ellipse(dc, cx - 2, cy - 2, cx + 2, cy + 2); Ellipse(dc, cx + 6, cy - 2, cx + 10, cy + 2);
            break;
    }

    SelectObject(dc, oldBrush);
    SelectObject(dc, oldPen);
    DeleteObject(pen);
}

class SpaceWindow {
public:
    int Run(HINSTANCE hInstance, int show) {
        hInst_ = hInstance;

        WNDCLASSW wc{};
        wc.lpfnWndProc = WndProc;
        wc.hInstance = hInstance;
        wc.lpszClassName = L"SpaceBrowserWindow";
        wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
        wc.hIcon = LoadIcon(hInstance, MAKEINTRESOURCE(IDI_APP_ICON));
        wc.hbrBackground = nullptr;
        RegisterClassW(&wc);

        hwnd_ = CreateWindowW(wc.lpszClassName, kAppName, WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, 1500, 900, nullptr, nullptr, hInstance, this);
        SetWindowTextW(hwnd_, kAppName);
        SendMessageW(hwnd_, WM_SETICON, ICON_BIG, (LPARAM)LoadIconW(hInstance, MAKEINTRESOURCE(IDI_APP_ICON)));
        SendMessageW(hwnd_, WM_SETICON, ICON_SMALL, (LPARAM)LoadImageW(hInstance, MAKEINTRESOURCE(IDI_APP_ICON), IMAGE_ICON, 16, 16, LR_DEFAULTCOLOR));

        CreateControls();
        ShowWindow(hwnd_, show);
        UpdateWindow(hwnd_);
        InitWebViews();

        MSG msg{};
        while (GetMessageW(&msg, nullptr, 0, 0)) {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        return (int)msg.wParam;
    }

private:
    static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
        SpaceWindow* self = nullptr;
        if (msg == WM_NCCREATE) {
            self = (SpaceWindow*)((CREATESTRUCT*)lp)->lpCreateParams;
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, (LONG_PTR)self);
        } else {
            self = (SpaceWindow*)GetWindowLongPtrW(hwnd, GWLP_USERDATA);
        }
        return self ? self->Handle(msg, wp, lp) : DefWindowProcW(hwnd, msg, wp, lp);
    }

    LRESULT Handle(UINT msg, WPARAM wp, LPARAM lp) {
        switch (msg) {
            case WM_SIZE:
                Resize();
                InvalidateRect(hwnd_, nullptr, TRUE);
                return 0;
            case WM_LBUTTONDOWN:
                OnClick(GET_X_LPARAM(lp), GET_Y_LPARAM(lp));
                return 0;
            case WM_CTLCOLOREDIT:
                SetTextColor((HDC)wp, theme().text);
                SetBkColor((HDC)wp, theme().address);
                return (LRESULT)editBrush();
            case WM_ERASEBKGND:
                return 1;
            case WM_PAINT:
                Paint();
                return 0;
            case WM_DESTROY:
                if (editFont_) DeleteObject(editFont_);
                if (editBrush_) DeleteObject(editBrush_);
                PostQuitMessage(0);
                return 0;
        }
        return DefWindowProcW(hwnd_, msg, wp, lp);
    }

    const Theme& theme() const {
        return Themes()[themeIndex_ % Themes().size()];
    }

    void CreateControls() {
        address_ = CreateWindowW(L"EDIT", kHomeUrl, WS_CHILD | WS_VISIBLE | ES_AUTOHSCROLL, 0, 0, 100, 30, hwnd_, (HMENU)100, hInst_, nullptr);
        editFont_ = CreateFontW(18, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Segoe UI");
        SendMessageW(address_, WM_SETFONT, (WPARAM)editFont_, TRUE);
        SetWindowLongPtrW(address_, GWLP_USERDATA, (LONG_PTR)this);
        oldAddressProc_ = (WNDPROC)SetWindowLongPtrW(address_, GWLP_WNDPROC, (LONG_PTR)AddressProc);
    }

    void InitWebViews() {
        LPWSTR version = nullptr;
        if (FAILED(GetAvailableCoreWebView2BrowserVersionString(nullptr, &version))) {
            if (MessageBoxW(hwnd_, L"Space_ needs the Microsoft Edge WebView2 Runtime to display modern websites. Open the Microsoft download page now?", kAppName, MB_ICONINFORMATION | MB_YESNO) == IDYES) {
                ShellExecuteW(hwnd_, L"open", L"https://developer.microsoft.com/microsoft-edge/webview2/", nullptr, nullptr, SW_SHOWNORMAL);
            }
            return;
        }
        if (version) CoTaskMemFree(version);

        HRESULT hr = CreateCoreWebView2EnvironmentWithOptions(nullptr, L".space_webview", nullptr,
            Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
                [this](HRESULT result, ICoreWebView2Environment* env) -> HRESULT {
                    if (FAILED(result)) {
                        MessageBoxW(hwnd_, L"Space_ could not start the WebView2 browser engine.", kAppName, MB_ICONERROR);
                        return result;
                    }
                    env_ = env;
                    CreateMainWebView();
                    CreateSideWebView();
                    return S_OK;
                }).Get());

        if (FAILED(hr)) {
            MessageBoxW(hwnd_, L"Space_ could not create the WebView2 browser environment.", kAppName, MB_ICONERROR);
        }
    }

    void CreateMainWebView() {
        env_->CreateCoreWebView2Controller(hwnd_,
            Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                [this](HRESULT hr, ICoreWebView2Controller* controller) -> HRESULT {
                    if (FAILED(hr)) return hr;
                    mainController_ = controller;
                    mainController_->get_CoreWebView2(&mainWeb_);

                    ComPtr<ICoreWebView2Settings> settings;
                    if (SUCCEEDED(mainWeb_->get_Settings(&settings)) && settings) {
                        settings->put_IsScriptEnabled(TRUE);
                        settings->put_AreDefaultContextMenusEnabled(TRUE);
                        settings->put_AreDevToolsEnabled(TRUE);
                        settings->put_IsZoomControlEnabled(TRUE);
                    }

                    EventRegistrationToken token{};
                    mainWeb_->add_SourceChanged(Callback<ICoreWebView2SourceChangedEventHandler>(
                        [this](ICoreWebView2*, ICoreWebView2SourceChangedEventArgs*) -> HRESULT {
                            UpdateAddressAndSafety();
                            return S_OK;
                        }).Get(), &token);

                    mainWeb_->add_NavigationCompleted(Callback<ICoreWebView2NavigationCompletedEventHandler>(
                        [this](ICoreWebView2*, ICoreWebView2NavigationCompletedEventArgs* args) -> HRESULT {
                            BOOL ok = FALSE;
                            args->get_IsSuccess(&ok);
                            loadFailed_ = !ok;
                            UpdateAddressAndSafety();
                            return S_OK;
                        }).Get(), &token);

                    mainWeb_->add_DocumentTitleChanged(Callback<ICoreWebView2DocumentTitleChangedEventHandler>(
                        [this](ICoreWebView2*, IUnknown*) -> HRESULT {
                            LPWSTR title = nullptr;
                            if (SUCCEEDED(mainWeb_->get_DocumentTitle(&title)) && title && wcslen(title) > 0) {
                                tabTitle_ = title;
                                CoTaskMemFree(title);
                            }
                            SetWindowTextW(hwnd_, kAppName);
                            InvalidateRect(hwnd_, nullptr, TRUE);
                            return S_OK;
                        }).Get(), &token);

                    mainWeb_->Navigate(kHomeUrl);
                    Resize();
                    SetWindowTextW(hwnd_, kAppName);
                    return S_OK;
                }).Get());
    }

    void CreateSideWebView() {
        env_->CreateCoreWebView2Controller(hwnd_,
            Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                [this](HRESULT hr, ICoreWebView2Controller* controller) -> HRESULT {
                    if (FAILED(hr)) return hr;
                    sideController_ = controller;
                    sideController_->get_CoreWebView2(&sideWeb_);
                    sideController_->put_IsVisible(FALSE);
                    Resize();
                    return S_OK;
                }).Get());
    }

    void Resize() {
        if (!hwnd_) return;
        RECT client{};
        GetClientRect(hwnd_, &client);
        int panel = sideVisible_ ? kPanelWidth : 0;
        RECT address = AddressRect(client);
        int addressWidth = std::max<int>(220, static_cast<int>(address.right - address.left - 24));
        int addressHeight = static_cast<int>(address.bottom - address.top - 10);
        MoveWindow(address_, static_cast<int>(address.left + 12), static_cast<int>(address.top + 5), addressWidth, addressHeight, TRUE);
        SetWindowPos(address_, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);

        if (mainController_) {
            RECT bounds{kSidebarWidth + panel, kTopHeight, client.right, client.bottom};
            mainController_->put_Bounds(bounds);
            mainController_->put_IsVisible(TRUE);
        }

        if (sideController_) {
            RECT bounds{kSidebarWidth + 14, 58, kSidebarWidth + kPanelWidth - 14, client.bottom - 14};
            sideController_->put_Bounds(bounds);
            sideController_->put_IsVisible(sideVisible_);
        }
    }

    RECT BackRect() const { return {contentLeft_ + 16, 58, contentLeft_ + 52, 92}; }
    RECT ForwardRect() const { return {contentLeft_ + 58, 58, contentLeft_ + 94, 92}; }
    RECT ReloadRectMain() const { return {contentLeft_ + 100, 58, contentLeft_ + 136, 92}; }
    RECT HomeRect() const { return {contentLeft_ + 144, 58, contentLeft_ + 210, 92}; }
    RECT BadgeRect() const { return {contentLeft_ + 224, 58, contentLeft_ + 302, 92}; }
    RECT GoRect(RECT client) const { return {client.right - 70, 58, client.right - 18, 92}; }
    RECT AddressRect(RECT client) const { return {contentLeft_ + 316, 58, client.right - 82, 92}; }
    RECT PinRect() const { return {kSidebarWidth + kPanelWidth - 154, 16, kSidebarWidth + kPanelWidth - 108, 42}; }
    RECT SideReloadRect() const { return {kSidebarWidth + kPanelWidth - 104, 16, kSidebarWidth + kPanelWidth - 70, 42}; }
    RECT PopRect() const { return {kSidebarWidth + kPanelWidth - 66, 16, kSidebarWidth + kPanelWidth - 34, 42}; }
    RECT CloseRect() const { return {kSidebarWidth + kPanelWidth - 30, 16, kSidebarWidth + kPanelWidth - 8, 42}; }

    bool Hit(int x, int y, RECT r) const {
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }

    void NavigateAddress() {
        if (!mainWeb_) return;
        wchar_t buffer[4096]{};
        GetWindowTextW(address_, buffer, 4095);
        std::wstring url = NormalizeUrl(buffer);
        loadFailed_ = false;
        mainWeb_->Navigate(url.c_str());
    }

    void UpdateAddressAndSafety() {
        if (!mainWeb_) return;
        LPWSTR uri = nullptr;
        if (SUCCEEDED(mainWeb_->get_Source(&uri)) && uri) {
            currentUrl_ = uri;
            SetWindowTextW(address_, uri);
            risk_ = loadFailed_ || currentUrl_.rfind(L"https://", 0) != 0;
            CoTaskMemFree(uri);
        }
        SetWindowTextW(hwnd_, kAppName);
        InvalidateRect(hwnd_, nullptr, TRUE);
    }

    void OnClick(int x, int y) {
        RECT client{};
        GetClientRect(hwnd_, &client);

        if (x < kSidebarWidth) {
            int item = y / 42;
            switch (item) {
                case 0: if (mainWeb_) mainWeb_->Navigate(kHomeUrl); break;
                case 1: OpenSideHtml(L"GX CONTROL", ControlHtml()); break;
                case 2: OpenSideHtml(L"SAFETY", SafetyHtml()); break;
                case 3: OpenSide(L"CHATGPT", L"https://chat.openai.com/"); break;
                case 4: OpenSide(L"TWITCH", L"https://www.twitch.tv/"); break;
                case 5: OpenSide(L"WHATSAPP", L"https://web.whatsapp.com/"); break;
                case 6: OpenSide(L"DISCORD", L"https://discord.com/app"); break;
                case 7: OpenSide(L"TELEGRAM", L"https://web.telegram.org/"); break;
                case 8: OpenSide(L"PLAYER", L"https://music.youtube.com/"); break;
                case 9: OpenSideHtml(L"HISTORY", HistoryHtml()); break;
                case 10: OpenSideHtml(L"EXTENSIONS", ExtensionsHtml()); break;
                case 11: OpenSideHtml(L"SETTINGS", SettingsHtml()); break;
                default: themeIndex_ = (themeIndex_ + 1) % Themes().size(); break;
            }
            Resize();
            InvalidateRect(hwnd_, nullptr, TRUE);
            return;
        }

        if (sideVisible_ && y < 52 && x > kSidebarWidth && x < kSidebarWidth + kPanelWidth) {
            if (Hit(x, y, PinRect())) pinned_ = !pinned_;
            else if (Hit(x, y, SideReloadRect()) && sideWeb_) sideWeb_->Reload();
            else if (Hit(x, y, PopRect()) && mainWeb_ && sideUrl_.rfind(L"about:", 0) != 0) mainWeb_->Navigate(sideUrl_.c_str());
            else if (Hit(x, y, CloseRect())) sideVisible_ = false;
            Resize();
            InvalidateRect(hwnd_, nullptr, TRUE);
            return;
        }

        if (Hit(x, y, BackRect()) && mainWeb_) mainWeb_->GoBack();
        else if (Hit(x, y, ForwardRect()) && mainWeb_) mainWeb_->GoForward();
        else if (Hit(x, y, ReloadRectMain()) && mainWeb_) mainWeb_->Reload();
        else if (Hit(x, y, HomeRect()) && mainWeb_) mainWeb_->Navigate(kHomeUrl);
        else if (Hit(x, y, GoRect(client))) NavigateAddress();

        if (sideVisible_ && !pinned_ && x > kSidebarWidth + kPanelWidth && y > kTopHeight) {
            sideVisible_ = false;
            Resize();
            InvalidateRect(hwnd_, nullptr, TRUE);
        }
    }

    void OpenSide(const wchar_t* title, const wchar_t* url) {
        sideTitle_ = title;
        sideUrl_ = url;
        sideVisible_ = true;
        if (sideWeb_) sideWeb_->Navigate(url);
    }

    void OpenSideHtml(const wchar_t* title, const std::wstring& html) {
        sideTitle_ = title;
        sideUrl_ = L"about:space-panel";
        sideVisible_ = true;
        if (sideWeb_) sideWeb_->NavigateToString(html.c_str());
    }

    std::wstring PanelHtml(const wchar_t* heading, const wchar_t* body) const {
        return std::wstring(LR"(
<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#202020;color:#f6f7ff;font:14px Segoe UI,Arial,sans-serif}
.wrap{padding:28px}.card{background:#2d2d30;border:1px solid #3a3f58;border-radius:10px;padding:18px;margin-bottom:14px}
h1{font-size:24px;margin:0 0 18px;color:#3b6bff}.muted{color:#b8c0d8;line-height:1.55}
.pill{display:inline-block;border:1px solid #3b6bff;border-radius:999px;padding:8px 12px;margin:4px 6px 4px 0;color:#dfe6ff}
</style></head><body><div class="wrap"><h1>)") + heading + L"</h1><div class=\"card\"><div class=\"muted\">" + body + L"</div></div></div></body></html>";
    }

    std::wstring ControlHtml() const {
        return PanelHtml(L"GX Control", L"Performance controls are ready to become native modules: RAM limiter, network limiter, tab usage, and quick cleanup. This panel is pinned/unpinned from the header.");
    }

    std::wstring SafetyHtml() const {
        return PanelHtml(L"Safety", risk_ ? L"Risk: the current page is not HTTPS or the latest navigation failed." : L"Tick: the current page is HTTPS and loaded successfully. This means no obvious transport risk was detected, not a guarantee that the site is safe.");
    }

    std::wstring HistoryHtml() const {
        return PanelHtml(L"History", L"Browser history storage will be added as a native profile feature. WebView2 navigation history already powers the back and forward buttons.");
    }

    std::wstring ExtensionsHtml() const {
        return PanelHtml(L"Extensions", L"Space_ extension modules will live here: safety scanner, ad blocker, page tools, site notes, and quick actions.");
    }

    std::wstring SettingsHtml() const {
        return PanelHtml(L"Settings", L"Click the lower sidebar area to cycle themes. Upcoming settings: accent color, startup page, downloads, pinned sidebar apps, privacy controls, and profile data.");
    }

    HBRUSH editBrush() {
        if (editBrush_) DeleteObject(editBrush_);
        editBrush_ = CreateSolidBrush(theme().address);
        return editBrush_;
    }

    void Paint() {
        PAINTSTRUCT ps{};
        HDC dc = BeginPaint(hwnd_, &ps);
        RECT client{};
        GetClientRect(hwnd_, &client);
        const Theme& t = theme();
        int panel = sideVisible_ ? kPanelWidth : 0;
        contentLeft_ = kSidebarWidth + panel;

        Fill(dc, client, t.window);
        RECT sidebar{0, 0, kSidebarWidth, client.bottom};
        Fill(dc, sidebar, t.sidebar);

        for (int i = 0; i < 12; ++i) {
            RECT r{18, 14 + i * 42, kSidebarWidth - 18, 44 + i * 42};
            Icon(dc, r, t.accent, i, false);
        }
        Text(dc, L"S_", {12, client.bottom - 44, kSidebarWidth - 12, client.bottom - 14}, t.accent, 14, FW_BOLD);

        if (sideVisible_) {
            RECT panelRect{kSidebarWidth, 0, kSidebarWidth + kPanelWidth, client.bottom};
            Fill(dc, panelRect, t.panel);
            Text(dc, sideTitle_, {kSidebarWidth + 20, 14, kSidebarWidth + 250, 44}, t.accent, 18, FW_BOLD, DT_LEFT | DT_VCENTER | DT_SINGLELINE);
            Text(dc, pinned_ ? L"PIN" : L"UNPIN", PinRect(), t.muted, 11, FW_BOLD);
            Text(dc, L"R", SideReloadRect(), t.muted, 15, FW_BOLD);
            Text(dc, L"GO", PopRect(), t.muted, 11, FW_BOLD);
            Text(dc, L"X", CloseRect(), t.muted, 15, FW_BOLD);
        }

        RECT top{contentLeft_, 0, client.right, kTopHeight};
        Fill(dc, top, t.top);

        RECT tab{contentLeft_ + 14, 10, contentLeft_ + 202, 44};
        RoundFill(dc, tab, t.activeTab, RGB(54, 64, 98), 8);
        Text(dc, tabTitle_, {tab.left + 14, tab.top, tab.right - 26, tab.bottom}, t.text, 15, FW_BOLD, DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_END_ELLIPSIS);
        Text(dc, L"+", {tab.right + 10, 10, tab.right + 48, 44}, t.text, 18, FW_BOLD);

        DrawNav(dc, t, client);
        EndPaint(hwnd_, &ps);
    }

    void DrawNav(HDC dc, const Theme& t, RECT client) {
        auto button = [&](RECT r, const wchar_t* label) {
            RoundFill(dc, r, t.top, RGB(28, 34, 55), 8);
            Text(dc, label, r, t.text, 15, FW_BOLD);
        };

        button(BackRect(), L"<");
        button(ForwardRect(), L">");
        button(ReloadRectMain(), L"R");
        button(HomeRect(), L"Home");

        RoundFill(dc, BadgeRect(), risk_ ? t.risk : t.safe, risk_ ? t.risk : t.safe, 8);
        Text(dc, risk_ ? L"Risk" : L"Tick", BadgeRect(), RGB(255, 255, 255), 15, FW_BOLD);

        RoundFill(dc, AddressRect(client), t.address, RGB(28, 34, 55), 8);
        button(GoRect(client), L"Go");
    }

    static LRESULT CALLBACK AddressProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
        auto self = (SpaceWindow*)GetWindowLongPtrW(hwnd, GWLP_USERDATA);
        if (self && msg == WM_KEYDOWN && wp == VK_RETURN) {
            self->NavigateAddress();
            return 0;
        }
        return self ? CallWindowProcW(self->oldAddressProc_, hwnd, msg, wp, lp) : DefWindowProcW(hwnd, msg, wp, lp);
    }

    HINSTANCE hInst_{};
    HWND hwnd_{};
    HWND address_{};
    HFONT editFont_{};
    HBRUSH editBrush_{};
    WNDPROC oldAddressProc_{};

    ComPtr<ICoreWebView2Environment> env_;
    ComPtr<ICoreWebView2Controller> mainController_;
    ComPtr<ICoreWebView2Controller> sideController_;
    ComPtr<ICoreWebView2> mainWeb_;
    ComPtr<ICoreWebView2> sideWeb_;

    size_t themeIndex_ = 0;
    bool sideVisible_ = false;
    bool pinned_ = false;
    bool risk_ = false;
    bool loadFailed_ = false;
    int contentLeft_ = kSidebarWidth;
    std::wstring currentUrl_ = kHomeUrl;
    std::wstring tabTitle_ = L"Google";
    std::wstring sideTitle_ = L"CHATGPT";
    std::wstring sideUrl_ = L"https://chat.openai.com/";
};

} // namespace

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE, LPSTR, int show) {
    HRESULT hr = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    if (FAILED(hr)) return 1;
    int result = SpaceWindow().Run(hInstance, show);
    CoUninitialize();
    return result;
}
