"""
SkillGraph Scoring Engine V2 Configuration.
Deterministic constants, base weights, thresholds, anti-gaming limits, and level definitions.
"""

# Proficiency scale: 1 to 5 with strict human-readable names
LEVEL_NAMES = {
    0: "Unassessed",
    1: "Aware",
    2: "Guided",
    3: "Independent",
    4: "Advanced",
    5: "Expert"
}

# Cumulative points required to reach each level (calibrated)
LEVEL_THRESHOLDS = {
    1: 2.0,    # Aware: 1 verified work artifact / claim
    2: 4.0,    # Guided: 2-3 artifacts, guided execution
    3: 12.0,   # Independent: Solid solo/lead contributions (Ceiling for self-reported evidence)
    4: 24.0,   # Advanced: Complex initiatives, high-impact contributions
    5: 44.0    # Expert: Architectural leadership, extensive verified track record
}

# Base weights per artifact type
BASE_WEIGHTS = {
    "PR": 3.0,            # Merged pull request
    "commit": 2.0,        # Direct repository commit
    "project": 3.5,       # End-to-end production application / feature
    "cert": 3.0,          # Valid industry certification
    "code_review": 1.8,   # In-depth peer code review
    "feedback": 1.2,      # Formal peer review endorsement
    "self_declared": 2.0  # Self-declaration claim without linked artifact (grants Level 1 Aware)
}

# Verification multiplier factors
VERIFICATION_FACTORS = {
    "Verified by HR": 1.0,  # Formally approved by manager / HR admin
    "Link checked": 0.9,    # Verified via GitHub / external URL automation
    "Self-reported": 0.7,   # Employee-submitted without independent verification
    "Needs info": 0.0,      # Incomplete submission
    "Rejected": 0.0         # Invalid or rejected submission
}

# Project / Artifact role multipliers
ROLE_FACTORS = {
    "Architect": 1.3,
    "Lead": 1.3,
    "Contributor": 1.0,
    "Support": 0.8
}

# Recency decay parameters
RECENCY_HALF_LIFE_DAYS = 730.0  # 2 years half life
RECENCY_FLOOR = 0.40            # Experienced evidence never decays below 40%
STALE_DAYS_THRESHOLD = 365       # Flagged as stale if no activity within 1 year

# Anti-gaming boundaries
SELF_DECLARED_MAX_LEVEL = 1     # Self-declarations alone can NEVER exceed Level 1 (Aware)
SELF_REPORTED_MAX_LEVEL = 3     # Self-reported evidence alone CANNOT exceed Level 3 (Independent)
DIMINISHING_RETURNS_FACTOR = 0.20 # Factor k in 1 / (1 + k * (n - 1)) for repeated items
EXPIRED_CERT_FACTOR = 0.35      # Reduced weight for expired certification

# Confidence calculation weights
CONFIDENCE_EVIDENCE_COUNT_TARGET = 4  # 4+ pieces of evidence yields full count factor
CONFIDENCE_SOURCE_TRUST = {
    "Verified by HR": 1.0,
    "Link checked": 0.9,
    "Self-reported": 0.6,
    "Needs info": 0.1,
    "Rejected": 0.0
}
