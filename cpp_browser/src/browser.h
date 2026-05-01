#pragma once

#include <string>
#include <vector>

#include "content.h"
#include "security.h"

namespace safe_gx::browser {

struct TabState {
    int id = 0;
    std::string title = "New tab";
    std::string url;
    std::vector<std::string> history;
    int history_index = -1;
    content::ReaderDocument page;
    security::ScanResult scan;
};

class Browser {
public:
    Browser();
    void run();

private:
    bool handle_command(const std::string& line);
    void print_header() const;
    void new_tab(const std::string& url);
    void close_tab(int id);
    void switch_tab(int id);
    void list_tabs() const;
    void navigate(const std::string& url, bool add_history = true);
    void go_back();
    void go_forward();
    void display_active_tab() const;
    void print_safety() const;
    void print_links() const;
    TabState* active_tab();
    const TabState* active_tab() const;

    std::vector<TabState> tabs_;
    int active_tab_id_ = 0;
    int next_tab_id_ = 1;
};

}  // namespace safe_gx::browser
