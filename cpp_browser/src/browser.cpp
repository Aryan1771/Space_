#include "browser.h"

#include <algorithm>
#include <iostream>
#include <sstream>

#include "content.h"
#include "net.h"
#include "security.h"

namespace safe_gx::browser {
namespace {

std::string trim(const std::string& value) {
    const auto begin = value.find_first_not_of(" \t\r\n");
    if (begin == std::string::npos) {
        return "";
    }
    const auto end = value.find_last_not_of(" \t\r\n");
    return value.substr(begin, end - begin + 1);
}

bool starts_with(const std::string& value, const std::string& prefix) {
    return value.rfind(prefix, 0) == 0;
}

std::string normalize_url(const std::string& input) {
    std::string value = trim(input);
    if (value.empty()) {
        return "https://www.google.com/search?q=safe+browser";
    }
    if (starts_with(value, "http://") || starts_with(value, "https://")) {
        return value;
    }
    if (value.find('.') != std::string::npos && value.find(' ') == std::string::npos) {
        return "https://" + value;
    }
    std::string query;
    for (char ch : value) {
        query += ch == ' ' ? '+' : ch;
    }
    return "https://www.google.com/search?q=" + query;
}

std::string state_badge(security::VerificationState state) {
    switch (state) {
        case security::VerificationState::Safe:
            return "[TICK] SAFE";
        case security::VerificationState::Warning:
            return "[!] CHECK";
        case security::VerificationState::Risky:
            return "[X] RISK";
        case security::VerificationState::Unknown:
            return "[?] UNKNOWN";
    }
    return "[?] UNKNOWN";
}

}  // namespace

Browser::Browser() {
    new_tab("https://www.google.com/search?q=safe+browser");
}

void Browser::run() {
    print_header();
    display_active_tab();

    std::string line;
    while (true) {
        std::cout << "\ncommand> ";
        if (!std::getline(std::cin, line)) {
            break;
        }
        if (!handle_command(line)) {
            break;
        }
    }
}

void Browser::print_header() const {
    std::cout << "Safe GX Browser C++ Core\n";
    std::cout << "Custom non-Chromium framework inspired by Chromium layers.\n";
    std::cout << "Commands: open <url>, search <terms>, new, tabs, switch <id>, close <id>, back, forward, reload, safety, links, help, quit\n";
}

bool Browser::handle_command(const std::string& line) {
    const std::string command_line = trim(line);
    if (command_line.empty()) {
        return true;
    }

    std::istringstream stream(command_line);
    std::string command;
    stream >> command;

    if (command == "quit" || command == "exit") {
        return false;
    }
    if (command == "help") {
        print_header();
        return true;
    }
    if (command == "open") {
        std::string value;
        std::getline(stream, value);
        navigate(normalize_url(value));
        return true;
    }
    if (command == "search") {
        std::string value;
        std::getline(stream, value);
        navigate(normalize_url(value));
        return true;
    }
    if (command == "new") {
        new_tab("https://www.google.com/search?q=safe+browser");
        return true;
    }
    if (command == "tabs") {
        list_tabs();
        return true;
    }
    if (command == "switch") {
        int id = 0;
        stream >> id;
        switch_tab(id);
        return true;
    }
    if (command == "close") {
        int id = 0;
        stream >> id;
        close_tab(id);
        return true;
    }
    if (command == "back") {
        go_back();
        return true;
    }
    if (command == "forward") {
        go_forward();
        return true;
    }
    if (command == "reload") {
        if (auto* tab = active_tab()) {
            navigate(tab->url, false);
        }
        return true;
    }
    if (command == "safety") {
        print_safety();
        return true;
    }
    if (command == "links") {
        print_links();
        return true;
    }

    std::cout << "Unknown command. Type help.\n";
    return true;
}

void Browser::new_tab(const std::string& url) {
    TabState tab;
    tab.id = next_tab_id_++;
    tab.url = url;
    tabs_.push_back(tab);
    active_tab_id_ = tab.id;
    navigate(url);
}

void Browser::close_tab(int id) {
    if (tabs_.size() == 1) {
        std::cout << "Cannot close the last tab.\n";
        return;
    }
    tabs_.erase(std::remove_if(tabs_.begin(), tabs_.end(), [id](const TabState& tab) { return tab.id == id; }), tabs_.end());
    if (active_tab_id_ == id) {
        active_tab_id_ = tabs_.front().id;
    }
    display_active_tab();
}

void Browser::switch_tab(int id) {
    for (const auto& tab : tabs_) {
        if (tab.id == id) {
            active_tab_id_ = id;
            display_active_tab();
            return;
        }
    }
    std::cout << "No tab with id " << id << ".\n";
}

void Browser::list_tabs() const {
    for (const auto& tab : tabs_) {
        std::cout << (tab.id == active_tab_id_ ? "* " : "  ");
        std::cout << tab.id << " " << state_badge(tab.scan.state) << " " << tab.title << " - " << tab.url << "\n";
    }
}

void Browser::navigate(const std::string& url, bool add_history) {
    auto* tab = active_tab();
    if (!tab) {
        return;
    }

    std::cout << "Loading " << url << "\n";
    tab->url = url;

    try {
        const auto response = net::HttpClient().get(url);
        tab->page = content::ReaderDocument::from_html(response.final_url, response.body);
        tab->url = response.final_url;
        tab->title = tab->page.title.empty() ? "Untitled page" : tab->page.title;
        tab->scan = security::SafetyService().scan(tab->page);
    } catch (const std::exception& error) {
        tab->page = content::ReaderDocument{};
        tab->page.url = url;
        tab->page.title = "Could not load page";
        tab->page.text = error.what();
        tab->title = tab->page.title;
        tab->scan = security::ScanResult{};
        tab->scan.state = security::VerificationState::Risky;
        tab->scan.summary = "The page failed to load or could not be scanned.";
        tab->scan.findings.push_back({"high", "Load failed", error.what()});
    }

    if (add_history) {
        tab->history.resize(static_cast<size_t>(tab->history_index + 1));
        tab->history.push_back(tab->url);
        tab->history_index = static_cast<int>(tab->history.size()) - 1;
    }
    display_active_tab();
}

void Browser::go_back() {
    auto* tab = active_tab();
    if (!tab || tab->history_index <= 0) {
        std::cout << "No back history.\n";
        return;
    }
    tab->history_index -= 1;
    navigate(tab->history[static_cast<size_t>(tab->history_index)], false);
}

void Browser::go_forward() {
    auto* tab = active_tab();
    if (!tab || tab->history_index >= static_cast<int>(tab->history.size()) - 1) {
        std::cout << "No forward history.\n";
        return;
    }
    tab->history_index += 1;
    navigate(tab->history[static_cast<size_t>(tab->history_index)], false);
}

void Browser::display_active_tab() const {
    const auto* tab = active_tab();
    if (!tab) {
        return;
    }
    std::cout << "\n" << state_badge(tab->scan.state) << "  " << tab->title << "\n";
    std::cout << tab->url << "\n\n";
    std::cout << tab->page.text.substr(0, 1600) << "\n";
    if (tab->page.text.size() > 1600) {
        std::cout << "\n... page text trimmed in console view ...\n";
    }
}

void Browser::print_safety() const {
    const auto* tab = active_tab();
    if (!tab) {
        return;
    }
    std::cout << state_badge(tab->scan.state) << "\n";
    std::cout << tab->scan.summary << "\n";
    if (tab->scan.findings.empty()) {
        std::cout << "No current findings.\n";
        return;
    }
    for (const auto& finding : tab->scan.findings) {
        std::cout << "[" << finding.level << "] " << finding.title << " - " << finding.detail << "\n";
    }
}

void Browser::print_links() const {
    const auto* tab = active_tab();
    if (!tab) {
        return;
    }
    for (size_t index = 0; index < tab->page.links.size(); ++index) {
        std::cout << index + 1 << ". " << tab->page.links[index].label << " -> " << tab->page.links[index].url << "\n";
    }
}

TabState* Browser::active_tab() {
    for (auto& tab : tabs_) {
        if (tab.id == active_tab_id_) {
            return &tab;
        }
    }
    return nullptr;
}

const TabState* Browser::active_tab() const {
    for (const auto& tab : tabs_) {
        if (tab.id == active_tab_id_) {
            return &tab;
        }
    }
    return nullptr;
}

}  // namespace safe_gx::browser
