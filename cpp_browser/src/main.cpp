#include "browser.h"

int main() {
    safe_gx::browser::Browser browser;
    browser.run();
    return 0;
}

// VS Code's default "Run Code" / active-file task often compiles only main.cpp.
// Include the implementation files in that mode so the one-file build links.
#ifndef SAFE_GX_SEPARATE_TRANSLATION_UNITS
#include "content.cpp"
#include "security.cpp"
#include "net.cpp"
#include "browser.cpp"
#endif
