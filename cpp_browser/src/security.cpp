#include "security.h"

#include <algorithm>
#include <cctype>
#include <regex>
#include <set>

namespace safe_gx::security {
namespace {

bool starts_with(const std::string& value, const std::string& prefix) {
    return value.rfind(prefix, 0) == 0;
}

std::string lower(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char ch) { return static_cast<char>(std::tolower(ch)); });
    return value;
}

bool contains_any(const std::string& text, const std::vector<std::string>& terms) {
    const std::string low = lower(text);
    for (const auto& term : terms) {
        if (low.find(term) != std::string::npos) {
            return true;
        }
    }
    return false;
}

bool is_ip_address(const std::string& host) {
    return std::regex_match(host, std::regex("(\\d{1,3}\\.){3}\\d{1,3}"));
}

std::string tld(const std::string& host) {
    const auto pos = host.find_last_of('.');
    return pos == std::string::npos ? "" : host.substr(pos + 1);
}

}  // namespace

ScanResult SafetyService::scan(const content::ReaderDocument& document) const {
    ScanResult result;
    const std::string host = document.host();

    if (!starts_with(document.url, "https://")) {
        result.findings.push_back({"high", "Connection is not HTTPS", "Information sent to this site may be visible or modified in transit."});
    }
    if (document.url.find('@') != std::string::npos) {
        result.findings.push_back({"high", "URL contains @", "Attackers use @ to hide the real destination in a long address."});
    }
    if (is_ip_address(host)) {
        result.findings.push_back({"medium", "Site uses an IP address", "Scam pages often avoid a normal domain name."});
    }
    if (host.find("xn--") != std::string::npos) {
        result.findings.push_back({"medium", "Internationalized domain", "This domain may use characters that look like trusted brand letters."});
    }

    const std::set<std::string> risky_tlds = {"zip", "mov", "click", "country", "gq", "tk", "top", "work", "xyz"};
    if (risky_tlds.count(tld(host))) {
        result.findings.push_back({"medium", "Risky top-level domain", "This top-level domain is commonly abused in throwaway scam campaigns."});
    }

    const std::set<std::string> shorteners = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly"};
    if (shorteners.count(host)) {
        result.findings.push_back({"medium", "Shortened URL", "Short links hide the final destination until you open them."});
    }

    if (document.password_field_count > 0 && !starts_with(document.url, "https://")) {
        result.findings.push_back({"critical", "Password field on insecure page", "Do not enter passwords unless the page uses HTTPS."});
    }
    if (document.form_count > 0 && !starts_with(document.url, "https://")) {
        result.findings.push_back({"high", "Form submits insecurely", "At least one form may send data without HTTPS protection."});
    }
    if (document.meta_refresh_count > 0) {
        result.findings.push_back({"low", "Automatic redirect found", "Meta refresh redirects can be used to bounce visitors through misleading pages."});
    }
    if (document.iframe_count > 0) {
        result.findings.push_back({"low", "Embedded frames found", "Frames can load login boxes, ads, or trackers from other sites."});
    }
    if (document.script_count >= 15) {
        result.findings.push_back({"low", "Heavy script usage", "This page references many scripts; this browser core does not run them."});
    }

    if (contains_any(document.text, {
            "act now", "account suspended", "bank details", "claim prize", "confirm your password",
            "gift card", "limited time", "login immediately", "password expired", "payment failed",
            "security alert", "verify your account", "winner", "you have won"})) {
        result.findings.push_back({"low", "Pressure-language detected", "The page contains wording often seen in phishing and fake support pages."});
    }

    bool has_medium_or_worse = false;
    bool has_low = false;
    for (const auto& finding : result.findings) {
        if (finding.level == "critical" || finding.level == "high" || finding.level == "medium") {
            has_medium_or_worse = true;
        }
        if (finding.level == "low") {
            has_low = true;
        }
    }

    if (has_medium_or_worse) {
        result.state = VerificationState::Risky;
        result.summary = "Risk signals were detected. Be careful with this site.";
    } else if (has_low) {
        result.state = VerificationState::Warning;
        result.summary = "Only low-risk warnings were detected.";
    } else {
        result.state = VerificationState::Safe;
        result.summary = "No obvious risk detected. This is not a guarantee of safety.";
    }
    return result;
}

}  // namespace safe_gx::security
