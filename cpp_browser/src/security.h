#pragma once

#include <string>
#include <vector>

#include "content.h"

namespace safe_gx::security {

enum class VerificationState {
    Safe,
    Warning,
    Risky,
    Unknown,
};

struct Finding {
    std::string level;
    std::string title;
    std::string detail;
};

struct ScanResult {
    std::vector<Finding> findings;
    VerificationState state = VerificationState::Unknown;
    std::string summary = "Not scanned yet.";
};

class SafetyService {
public:
    ScanResult scan(const content::ReaderDocument& document) const;
};

}  // namespace safe_gx::security
