#include <windows.h>
#include <windowsx.h>
#include <wrl.h>
#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

#include "resource.h"
#include "WebView2.h"

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;

namespace {

constexpr wchar_t kAppName[] = L"Space_";
constexpr wchar_t kHomeUrl[] = L"https://www.google.com/";
constexpr int kSidebar = 64;
constexpr int kTopbar = 94;
constexpr int kSidePanel = 440;

struct Theme {
    COLORREF bg, sidebar, sidebarHot, top, tab, activeTab, address, panel, text, muted, accent, safe, risk;
};

std::vector<Theme> Themes() {
    return {
        {RGB(7,8,14), RGB(3,4,8), RGB(18,24,42), RGB(14,16,25), RGB(28,32,48), RGB(38,45,70), RGB(5,7,13), RGB(14,16,25), RGB(245,247,255), RGB(148,160,194), RGB(55,107,255), RGB(23,210,126), RGB(255,74,105)},
        {RGB(10,7,11), RGB(5,3,5), RGB(36,17,26), RGB(20,13,19), RGB(39,25,35), RGB(66,35,52), RGB(8,5,8), RGB(20,13,19), RGB(255,245,248), RGB(196,148,160), RGB(255,45,85), RGB(30,215,126), RGB(255,65,88)},
        {RGB(5,10,8), RGB(2,6,5), RGB(14,37,28), RGB(10,19,16), RGB(18,39,31), RGB(25,62,47), RGB(4,9,7), RGB(10,19,16), RGB(238,255,247), RGB(143,188,169), RGB(48,230,150), RGB(30,230,146), RGB(255,75,98)},
        {RGB(246,248,252), RGB(235,239,247), RGB(220,230,248), RGB(246,248,252), RGB(225,230,239), RGB(255,255,255), RGB(255,255,255), RGB(243,246,251), RGB(32,33,36), RGB(95,99,104), RGB(26,115,232), RGB(24,128,56), RGB(217,48,37)},
    };
}

std::wstring NormalizeUrl(std::wstring text) {
    while (!text.empty() && iswspace(text.front())) text.erase(text.begin());
    while (!text.empty() && iswspace(text.back())) text.pop_back();
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

void Text(HDC dc, const std::wstring& text, RECT r, COLORREF color, int size = 16, int weight = FW_NORMAL, UINT format = DT_CENTER | DT_VCENTER | DT_SINGLELINE) {
    SetBkMode(dc, TRANSPARENT);
    SetTextColor(dc, color);
    HFONT font = CreateFontW(size, 0, 0, 0, weight, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Segoe UI");
    auto old = SelectObject(dc, font);
    DrawTextW(dc, text.c_str(), -1, &r, format);
    SelectObject(dc, old);
    DeleteObject(font);
}

void LineIcon(HDC dc, RECT r, COLORREF color, int kind) {
    HPEN pen = CreatePen(PS_SOLID, 2, color);
    auto oldPen = SelectObject(dc, pen);
    auto oldBrush = SelectObject(dc, GetStockObject(HOLLOW_BRUSH));
    int cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    switch (kind) {
        case 0: Ellipse(dc, cx-11, cy-11, cx+11, cy+11); MoveToEx(dc,cx-5,cy+7,nullptr); LineTo(dc,cx+10,cy-8); break;
        case 1: MoveToEx(dc,cx,cy-13,nullptr); LineTo(dc,cx+11,cy-7); LineTo(dc,cx+8,cy+9); LineTo(dc,cx,cy+14); LineTo(dc,cx-8,cy+9); LineTo(dc,cx-11,cy-7); LineTo(dc,cx,cy-13); break;
        case 2: Arc(dc,cx-12,cy-12,cx+12,cy+12,cx-8,cy-8,cx-12,cy+1); MoveToEx(dc,cx,cy-7,nullptr); LineTo(dc,cx,cy); LineTo(dc,cx+7,cy+4); break;
        case 3: Rectangle(dc,cx-11,cy-8,cx+11,cy+11); Ellipse(dc,cx-4,cy-15,cx+4,cy-7); break;
        case 4: Ellipse(dc,cx-9,cy-9,cx+9,cy+9); Ellipse(dc,cx-3,cy-3,cx+3,cy+3); break;
        case 5: Ellipse(dc,cx-13,cy-10,cx+13,cy+12); Ellipse(dc,cx-6,cy-4,cx-2,cy); Ellipse(dc,cx+3,cy-5,cx+7,cy-1); break;
        case 6: for(int i=0;i<6;i++){ double a=i*3.14159/3.0; int x=cx+(int)(cos(a)*13), y=cy+(int)(sin(a)*13); MoveToEx(dc,cx,cy,nullptr); LineTo(dc,x,y); Ellipse(dc,x-3,y-3,x+3,y+3);} break;
        case 7: RoundRect(dc,cx-13,cy-11,cx+13,cy+10,12,12); MoveToEx(dc,cx-5,cy+9,nullptr); LineTo(dc,cx-12,cy+15); Arc(dc,cx-6,cy-6,cx+7,cy+8,cx-2,cy-5,cx+6,cy+2); break;
        case 8: MoveToEx(dc,cx-14,cy-2,nullptr); LineTo(dc,cx+14,cy-13); LineTo(dc,cx+5,cy+14); LineTo(dc,cx-2,cy+4); LineTo(dc,cx-14,cy-2); break;
        case 9: RoundRect(dc,cx-15,cy-10,cx+15,cy+10,10,10); Ellipse(dc,cx-8,cy-3,cx-4,cy+1); Ellipse(dc,cx+4,cy-3,cx+8,cy+1); break;
        case 10: Rectangle(dc,cx-12,cy-10,cx+12,cy+10); MoveToEx(dc,cx-5,cy-5,nullptr); LineTo(dc,cx-5,cy+5); MoveToEx(dc,cx+5,cy-5,nullptr); LineTo(dc,cx+5,cy+5); break;
        default: Ellipse(dc,cx-10,cy-2,cx-6,cy+2); Ellipse(dc,cx-2,cy-2,cx+2,cy+2); Ellipse(dc,cx+6,cy-2,cx+10,cy+2); break;
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
        wc.lpszClassName = L"SpaceChromiumShell";
        wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
        wc.hIcon = LoadIcon(hInstance, MAKEINTRESOURCE(IDI_APP_ICON));
        RegisterClassW(&wc);
        hwnd_ = CreateWindowW(wc.lpszClassName, kAppName, WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, 1460, 880, nullptr, nullptr, hInstance, this);
        SendMessage(hwnd_, WM_SETICON, ICON_BIG, (LPARAM)LoadIcon(hInstance, MAKEINTRESOURCE(IDI_APP_ICON)));
        SendMessage(hwnd_, WM_SETICON, ICON_SMALL, (LPARAM)LoadImage(hInstance, MAKEINTRESOURCE(IDI_APP_ICON), IMAGE_ICON, 16, 16, LR_DEFAULTCOLOR));
        CreateControls();
        ShowWindow(hwnd_, show);
        UpdateWindow(hwnd_);
        InitWebViews();
        MSG msg{};
        while (GetMessage(&msg, nullptr, 0, 0)) {
            TranslateMessage(&msg);
            DispatchMessage(&msg);
        }
        return (int)msg.wParam;
    }

private:
    static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
        SpaceWindow* self = nullptr;
        if (msg == WM_NCCREATE) {
            self = (SpaceWindow*)((CREATESTRUCT*)lp)->lpCreateParams;
            SetWindowLongPtr(hwnd, GWLP_USERDATA, (LONG_PTR)self);
        } else {
            self = (SpaceWindow*)GetWindowLongPtr(hwnd, GWLP_USERDATA);
        }
        return self ? self->Handle(msg, wp, lp) : DefWindowProc(hwnd, msg, wp, lp);
    }

    LRESULT Handle(UINT msg, WPARAM wp, LPARAM lp) {
        switch (msg) {
            case WM_SIZE: Resize(); InvalidateRect(hwnd_, nullptr, TRUE); return 0;
            case WM_COMMAND: OnCommand(LOWORD(wp)); return 0;
            case WM_LBUTTONDOWN: OnClick(GET_X_LPARAM(lp), GET_Y_LPARAM(lp)); return 0;
            case WM_CTLCOLOREDIT: SetTextColor((HDC)wp, theme().text); SetBkColor((HDC)wp, theme().address); return (LRESULT)editBrush();
            case WM_PAINT: Paint(); return 0;
            case WM_DESTROY: PostQuitMessage(0); return 0;
        }
        return DefWindowProc(hwnd_, msg, wp, lp);
    }

    Theme theme() const { return Themes()[theme_ % Themes().size()]; }

    void CreateControls() {
        address_ = CreateWindowW(L"EDIT", L"", WS_CHILD | WS_VISIBLE | ES_AUTOHSCROLL, 0, 0, 100, 28, hwnd_, (HMENU)100, hInst_, nullptr);
        auto font = CreateFontW(18,0,0,0,FW_NORMAL,FALSE,FALSE,FALSE,DEFAULT_CHARSET,OUT_DEFAULT_PRECIS,CLIP_DEFAULT_PRECIS,CLEARTYPE_QUALITY,DEFAULT_PITCH,L"Segoe UI");
        SendMessage(address_, WM_SETFONT, (WPARAM)font, TRUE);
        SetWindowLongPtr(address_, GWLP_USERDATA, (LONG_PTR)this);
        oldAddressProc_ = (WNDPROC)SetWindowLongPtr(address_, GWLP_WNDPROC, (LONG_PTR)AddressProc);
        for (int i=0;i<6;i++) buttons_[i] = CreateWindowW(L"BUTTON", L"", WS_CHILD | WS_VISIBLE | BS_OWNERDRAW, 0,0,10,10, hwnd_, (HMENU)(200+i), hInst_, nullptr);
        SetWindowTextW(buttons_[0], L"<"); SetWindowTextW(buttons_[1], L">"); SetWindowTextW(buttons_[2], L"R"); SetWindowTextW(buttons_[3], L"Home"); SetWindowTextW(buttons_[4], L"Tick"); SetWindowTextW(buttons_[5], L"Go");
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

        HRESULT create = CreateCoreWebView2EnvironmentWithOptions(nullptr, L".space_webview", nullptr,
            Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
                [this](HRESULT hr, ICoreWebView2Environment* env) -> HRESULT {
                    if (FAILED(hr)) {
                        MessageBoxW(hwnd_, L"Space_ could not start the WebView2 browser engine.", kAppName, MB_ICONERROR);
                        return hr;
                    }
                    env_ = env;
                    CreateMainWebView();
                    CreateSideWebView();
                    return S_OK;
                }).Get());
        if (FAILED(create)) {
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
                    EventRegistrationToken token{};
                    mainWeb_->add_NavigationCompleted(Callback<ICoreWebView2NavigationCompletedEventHandler>(
                        [this](ICoreWebView2*, ICoreWebView2NavigationCompletedEventArgs* args) -> HRESULT {
                            BOOL ok = FALSE; args->get_IsSuccess(&ok); safetyRisk_ = !ok; UpdateAddressFromMain(); InvalidateRect(hwnd_, nullptr, TRUE); return S_OK;
                        }).Get(), &token);
                    mainWeb_->add_SourceChanged(Callback<ICoreWebView2SourceChangedEventHandler>(
                        [this](ICoreWebView2*, ICoreWebView2SourceChangedEventArgs*) -> HRESULT { UpdateAddressFromMain(); return S_OK; }).Get(), &token);
                    mainWeb_->Navigate(kHomeUrl);
                    Resize();
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
        RECT c{}; GetClientRect(hwnd_, &c);
        int sideW = sideVisible_ ? kSidePanel : 0;
        MoveWindow(address_, kSidebar + sideW + 320, 54, std::max(260, c.right - kSidebar - sideW - 410), 32, TRUE);
        for (int i=0;i<6;i++) MoveWindow(buttons_[i], 0, 0, 1, 1, TRUE);
        if (mainController_) {
            RECT bounds{kSidebar + sideW, kTopbar, c.right, c.bottom};
            mainController_->put_Bounds(bounds);
            mainController_->put_IsVisible(TRUE);
        }
        if (sideController_) {
            RECT bounds{kSidebar + 10, 58, kSidebar + kSidePanel - 10, c.bottom - 12};
            sideController_->put_Bounds(bounds);
            sideController_->put_IsVisible(sideVisible_);
        }
    }

    void OnCommand(int id) {
        if (!mainWeb_) return;
        if (id == 200) mainWeb_->GoBack();
        if (id == 201) mainWeb_->GoForward();
        if (id == 202) mainWeb_->Reload();
        if (id == 203) mainWeb_->Navigate(kHomeUrl);
        if (id == 205) NavigateAddress();
    }

    void NavigateAddress() {
        wchar_t buffer[4096]{};
        GetWindowTextW(address_, buffer, 4095);
        std::wstring url = NormalizeUrl(buffer);
        mainWeb_->Navigate(url.c_str());
    }

    void UpdateAddressFromMain() {
        if (!mainWeb_) return;
        LPWSTR uri = nullptr;
        if (SUCCEEDED(mainWeb_->get_Source(&uri)) && uri) {
            SetWindowTextW(address_, uri);
            safetyRisk_ = wcsncmp(uri, L"https://", 8) != 0;
            CoTaskMemFree(uri);
        }
    }

    void OnClick(int x, int y) {
        if (x < kSidebar) {
            int item = y / 40;
            switch(item) {
                case 0: if(mainWeb_) mainWeb_->Navigate(kHomeUrl); break;
                case 1: OpenSideHtml(L"GX CONTROL", ControlHtml()); break;
                case 2: OpenSide(L"CHATGPT", L"https://chat.openai.com/"); break;
                case 3: OpenSide(L"TWITCH", L"https://www.twitch.tv/"); break;
                case 4: OpenSide(L"WHATSAPP", L"https://web.whatsapp.com/"); break;
                case 5: OpenSide(L"DISCORD", L"https://discord.com/app"); break;
                case 6: OpenSide(L"TELEGRAM", L"https://web.telegram.org/"); break;
                case 7: OpenSide(L"PLAYER", L"https://music.youtube.com/"); break;
                case 8: OpenSideHtml(L"HISTORY", HistoryHtml()); break;
                case 9: OpenSideHtml(L"EXTENSIONS", ExtensionsHtml()); break;
                case 10: OpenSideHtml(L"SETTINGS", SettingsHtml()); break;
                case 11: theme_ = (theme_ + 1) % Themes().size(); break;
                default: sideVisible_ = !sideVisible_; break;
            }
            Resize(); InvalidateRect(hwnd_, nullptr, TRUE); return;
        }
        if (sideVisible_ && !pinned_ && x > kSidebar + kSidePanel && y > kTopbar) {
            sideVisible_ = false;
            Resize();
            InvalidateRect(hwnd_, nullptr, TRUE);
        }
        if (sideVisible_ && y < 48 && x > kSidebar) {
            RECT pin = PinRect(), reload = ReloadRect(), pop = PopRect(), close = CloseRect();
            if (Hit(x,y,pin)) pinned_ = !pinned_;
            else if (Hit(x,y,reload) && sideWeb_) sideWeb_->Reload();
            else if (Hit(x,y,pop) && mainWeb_) mainWeb_->Navigate(sideUrl_.c_str());
            else if (Hit(x,y,close)) sideVisible_ = false;
            Resize(); InvalidateRect(hwnd_, nullptr, TRUE); return;
        }
        RECT go = GoRect(), back = BackRect(), forward = ForwardRect(), reload = MainReloadRect(), home = HomeRect();
        if (Hit(x,y,go)) NavigateAddress();
        else if (Hit(x,y,back) && mainWeb_) mainWeb_->GoBack();
        else if (Hit(x,y,forward) && mainWeb_) mainWeb_->GoForward();
        else if (Hit(x,y,reload) && mainWeb_) mainWeb_->Reload();
        else if (Hit(x,y,home) && mainWeb_) mainWeb_->Navigate(kHomeUrl);
    }

    void OpenSide(const wchar_t* title, const wchar_t* url) {
        sideTitle_ = title; sideUrl_ = url; sideVisible_ = true;
        if (sideWeb_) sideWeb_->Navigate(url);
    }

    void OpenSideHtml(const wchar_t* title, const std::wstring& html) {
        sideTitle_ = title; sideUrl_ = L"about:space-panel"; sideVisible_ = true;
        if (sideWeb_) sideWeb_->NavigateToString(html.c_str());
    }

    std::wstring PanelHtml(const wchar_t* heading, const wchar_t* body) const {
        return std::wstring(LR"(
<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#202020;color:#f4f6ff;font:14px Segoe UI,Arial,sans-serif}
.wrap{padding:26px}.card{background:#2c2c2c;border:1px solid #3b3f56;border-radius:10px;padding:18px;margin:0 0 14px}
h1{font-size:24px;margin:0 0 18px;color:#3b6bff}.muted{color:#a8b0c8;line-height:1.55}
button{background:#3b6bff;color:white;border:0;border-radius:8px;padding:10px 14px;margin:6px 6px 0 0;font-weight:700}
</style></head><body><div class="wrap"><h1>)") + heading + L"</h1><div class=\"card\"><div class=\"muted\">" + body + L"</div></div></div></body></html>";
    }

    std::wstring ControlHtml() const {
        return PanelHtml(L"GX Control", L"Performance controls will live here: RAM limiter, network limiter, tab usage, and cleanup tools. The shell is ready for native meters next.");
    }

    std::wstring HistoryHtml() const {
        return PanelHtml(L"History", L"Per-profile browsing history storage is the next layer. For now, WebView2 keeps normal in-page navigation history and the back/forward buttons work immediately.");
    }

    std::wstring ExtensionsHtml() const {
        return PanelHtml(L"Extensions", L"Space_ extension panels will appear here. Safety scanner, ad blocking, page tools, and quick actions can be added as native modules.");
    }

    std::wstring SettingsHtml() const {
        return PanelHtml(L"Settings", L"Built-in themes are available from the sidebar control area. Upcoming settings: startup page, accent color, pinned apps, privacy controls, downloads, and profile data.");
    }

    bool Hit(int x, int y, RECT r) const { return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }
    RECT BackRect() const { return {kSidebar + (sideVisible_ ? kSidePanel : 0) + 16, 54, kSidebar + (sideVisible_ ? kSidePanel : 0) + 58, 88}; }
    RECT ForwardRect() const { RECT r=BackRect(); OffsetRect(&r, 48, 0); return r; }
    RECT MainReloadRect() const { RECT r=BackRect(); OffsetRect(&r, 96, 0); return r; }
    RECT HomeRect() const { RECT r=BackRect(); OffsetRect(&r, 144, 0); r.right += 34; return r; }
    RECT BadgeRect() const { RECT r=BackRect(); OffsetRect(&r, 226, 0); r.right += 34; return r; }
    RECT GoRect() const { RECT c{}; GetClientRect(hwnd_, &c); return {c.right - 62, 54, c.right - 14, 88}; }
    RECT PinRect() const { return {kSidebar + kSidePanel - 144, 12, kSidebar + kSidePanel - 112, 40}; }
    RECT ReloadRect() const { return {kSidebar + kSidePanel - 108, 12, kSidebar + kSidePanel - 76, 40}; }
    RECT PopRect() const { return {kSidebar + kSidePanel - 72, 12, kSidebar + kSidePanel - 40, 40}; }
    RECT CloseRect() const { return {kSidebar + kSidePanel - 36, 12, kSidebar + kSidePanel - 8, 40}; }

    HBRUSH editBrush() { if (editBrush_) DeleteObject(editBrush_); editBrush_ = CreateSolidBrush(theme().address); return editBrush_; }

    void Paint() {
        PAINTSTRUCT ps{}; HDC dc = BeginPaint(hwnd_, &ps); RECT c{}; GetClientRect(hwnd_, &c); Theme t=theme();
        Fill(dc, c, t.bg);
        RECT side{0,0,kSidebar,c.bottom}; Fill(dc, side, t.sidebar);
        for(int i=0;i<12;i++){ RECT r{10, 12+i*40, kSidebar-10, 44+i*40}; LineIcon(dc,r,t.accent,i==1?5:i<2?i:i+4); }
        Text(dc, L"GX", {10,c.bottom-42,kSidebar-10,c.bottom-12}, t.accent, 14, FW_BOLD);
        int sideW = sideVisible_ ? kSidePanel : 0;
        if (sideVisible_) {
            RECT panel{kSidebar,0,kSidebar+kSidePanel,c.bottom}; Fill(dc,panel,t.top);
            Text(dc, sideTitle_, {kSidebar+14,10,kSidebar+220,42}, t.accent, 18, FW_BOLD, DT_LEFT|DT_VCENTER|DT_SINGLELINE);
            Text(dc, pinned_ ? L"PIN" : L"UNPIN", PinRect(), t.muted, 12, FW_NORMAL);
            Text(dc, L"R", ReloadRect(), t.muted, 16, FW_BOLD);
            Text(dc, L"↗", PopRect(), t.muted, 16, FW_BOLD);
            Text(dc, L"X", CloseRect(), t.muted, 16, FW_BOLD);
        }
        RECT top{kSidebar+sideW,0,c.right,kTopbar}; Fill(dc,top,t.top);
        RECT tab{kSidebar+sideW+12,8,kSidebar+sideW+190,42}; Fill(dc,tab,t.activeTab); Text(dc,L"Google Search",tab,t.text,16,FW_BOLD);
        Text(dc,L"+",{tab.right+10,8,tab.right+48,42},t.text,18,FW_BOLD);
        DrawNav(dc, t);
        EndPaint(hwnd_, &ps);
    }

    void DrawNav(HDC dc, Theme t) {
        auto button=[&](RECT r, const wchar_t* s, COLORREF bg=t.top){ Fill(dc,r,bg); Text(dc,s,r,t.text,16,FW_BOLD); };
        button(BackRect(), L"<"); button(ForwardRect(), L">"); button(MainReloadRect(), L"R"); button(HomeRect(), L"Home");
        Fill(dc, BadgeRect(), safetyRisk_ ? t.risk : t.safe); Text(dc, safetyRisk_ ? L"Risk" : L"Tick", BadgeRect(), RGB(255,255,255), 16, FW_BOLD);
        button(GoRect(), L"Go");
    }

    static LRESULT CALLBACK AddressProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
        auto self = (SpaceWindow*)GetWindowLongPtr(hwnd, GWLP_USERDATA);
        if (self && msg == WM_KEYDOWN && wp == VK_RETURN) {
            self->NavigateAddress();
            return 0;
        }
        return self ? CallWindowProc(self->oldAddressProc_, hwnd, msg, wp, lp) : DefWindowProcW(hwnd, msg, wp, lp);
    }

    HINSTANCE hInst_{}; HWND hwnd_{}, address_{}, buttons_[6]{}; HBRUSH editBrush_{};
    WNDPROC oldAddressProc_{};
    ComPtr<ICoreWebView2Environment> env_;
    ComPtr<ICoreWebView2Controller> mainController_, sideController_;
    ComPtr<ICoreWebView2> mainWeb_, sideWeb_;
    size_t theme_ = 0; bool sideVisible_ = false, pinned_ = false, safetyRisk_ = false;
    std::wstring sideTitle_ = L"CHATGPT", sideUrl_ = L"https://chat.openai.com/";
};

}

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE, LPSTR, int show) {
    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    int result = SpaceWindow().Run(hInstance, show);
    CoUninitialize();
    return result;
}
