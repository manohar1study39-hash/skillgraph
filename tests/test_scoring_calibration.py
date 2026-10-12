import pytest
import datetime
import hashlib
from backend.scoring_engine import evaluate_employee_skill
from backend.scoring_config import LEVEL_NAMES

TODAY = datetime.date(2026, 10, 8)

# Table of 15+ realistic calibration profiles
CALIBRATION_PROFILES = [
    {
        "name": "Novice Self-Declaration (No Evidence)",
        "evidence": [],
        "declared_years": 0.5,
        "claimed_level": "Guided",
        "expected_level": 1,  # Invariant: Self-declaration alone never exceeds Level 1
    },
    {
        "name": "Junior Single Small PR (Link checked)",
        "evidence": [
            {"evidence_type": "PR", "verification_status": "Link checked", "artifact_date": "2026-09-01", "complexity_score": 2.0}
        ],
        "declared_years": 1.0,
        "claimed_level": "Guided",
        "expected_level": 1,
    },
    {
        "name": "Junior Contributor with 3 Verified PRs",
        "evidence": [
            {"evidence_type": "PR", "verification_status": "Verified by HR", "artifact_date": "2026-08-01", "complexity_score": 3.0, "duration_months": 2.0},
            {"evidence_type": "PR", "verification_status": "Verified by HR", "artifact_date": "2026-08-15", "complexity_score": 3.0, "duration_months": 2.0},
            {"evidence_type": "commit", "verification_status": "Link checked", "artifact_date": "2026-09-01", "complexity_score": 3.0, "duration_months": 1.0},
        ],
        "declared_years": 1.5,
        "claimed_level": "Guided",
        "expected_level": 2,  # Guided (Level 2)
    },
    {
        "name": "Mid-Level Solo Project (Self-reported only)",
        "evidence": [
            {"evidence_type": "project", "verification_status": "Self-reported", "artifact_date": "2026-05-01", "complexity_score": 4.0, "duration_months": 6.0},
            {"evidence_type": "commit", "verification_status": "Self-reported", "artifact_date": "2026-06-01", "complexity_score": 3.0, "duration_months": 3.0},
            {"evidence_type": "commit", "verification_status": "Self-reported", "artifact_date": "2026-07-01", "complexity_score": 3.0, "duration_months": 3.0},
        ],
        "declared_years": 3.0,
        "claimed_level": "Independent",
        "expected_level": 2,  # Guided / Independent boundary
    },
    {
        "name": "Senior Full-Stack Contributor with Extensive Self-Reported Evidence (Ceiling Test)",
        "evidence": [
            {"evidence_type": "project", "verification_status": "Self-reported", "artifact_date": "2026-01-01", "complexity_score": 5.0, "duration_months": 12.0},
            {"evidence_type": "project", "verification_status": "Self-reported", "artifact_date": "2026-04-01", "complexity_score": 5.0, "duration_months": 12.0},
            {"evidence_type": "project", "verification_status": "Self-reported", "artifact_date": "2026-07-01", "complexity_score": 5.0, "duration_months": 12.0},
            {"evidence_type": "PR", "verification_status": "Self-reported", "artifact_date": "2026-08-01", "complexity_score": 4.0, "duration_months": 6.0},
            {"evidence_type": "PR", "verification_status": "Self-reported", "artifact_date": "2026-09-01", "complexity_score": 4.0, "duration_months": 6.0},
        ],
        "declared_years": 5.0,
        "claimed_level": "Expert",
        "expected_level": 3,  # Invariant: Self-reported alone CANNOT exceed Level 3 (ceiling)
    },
    {
        "name": "Independent Engineer with Verified Production App & Reviews",
        "evidence": [
            {"evidence_type": "project", "verification_status": "Verified by HR", "artifact_date": "2026-04-01", "complexity_score": 4.0, "duration_months": 4.0, "role": "Lead"},
            {"evidence_type": "PR", "verification_status": "Verified by HR", "artifact_date": "2026-07-01", "complexity_score": 3.0, "duration_months": 2.0},
            {"evidence_type": "code_review", "verification_status": "Verified by HR", "artifact_date": "2026-08-01", "complexity_score": 3.0},
        ],
        "declared_years": 3.5,
        "claimed_level": "Independent",
        "expected_level": 3,  # Independent (Level 3)
    },
    {
        "name": "Advanced Engineer with Multiple High-Complexity Verified Artifacts",
        "evidence": [
            {"evidence_type": "project", "verification_status": "Verified by HR", "artifact_date": "2026-01-01", "complexity_score": 4.5, "duration_months": 8.0, "role": "Lead"},
            {"evidence_type": "project", "verification_status": "Verified by HR", "artifact_date": "2026-05-01", "complexity_score": 4.0, "duration_months": 6.0, "role": "Lead"},
            {"evidence_type": "PR", "verification_status": "Link checked", "artifact_date": "2026-07-15", "complexity_score": 4.0, "duration_months": 2.0},
            {"evidence_type": "code_review", "verification_status": "Verified by HR", "artifact_date": "2026-08-10", "complexity_score": 4.0},
            {"evidence_type": "PR", "verification_status": "Link checked", "artifact_date": "2026-09-01", "complexity_score": 3.0},
        ],
        "declared_years": 6.0,
        "claimed_level": "Advanced",
        "expected_level": 4,  # Advanced (Level 4)
    },
    {
        "name": "Principal Architect with Extensive Verified System Work",
        "evidence": [
            {"evidence_type": "project", "verification_status": "Verified by HR", "artifact_date": "2025-06-01", "complexity_score": 5.0, "duration_months": 12.0, "role": "Architect"},
            {"evidence_type": "project", "verification_status": "Verified by HR", "artifact_date": "2026-01-10", "complexity_score": 5.0, "duration_months": 10.0, "role": "Lead"},
            {"evidence_type": "project", "verification_status": "Verified by HR", "artifact_date": "2026-06-01", "complexity_score": 5.0, "duration_months": 6.0, "role": "Lead"},
            {"evidence_type": "PR", "verification_status": "Link checked", "artifact_date": "2026-08-01", "complexity_score": 4.0, "duration_months": 3.0},
            {"evidence_type": "PR", "verification_status": "Link checked", "artifact_date": "2026-08-20", "complexity_score": 4.0, "duration_months": 3.0},
            {"evidence_type": "code_review", "verification_status": "Verified by HR", "artifact_date": "2026-09-01", "complexity_score": 4.0},
            {"evidence_type": "feedback", "verification_status": "Verified by HR", "artifact_date": "2026-09-15", "complexity_score": 4.0},
        ],
        "certifications": [
            {"title": "AWS Certified Solutions Architect Professional", "issued_date": "2025-01-01", "expiry_date": "2028-01-01"}
        ],
        "declared_years": 10.0,
        "claimed_level": "Expert",
        "expected_level": 5,  # Expert (Level 5)
    },
    {
        "name": "Stale Senior Engineer (Activity > 3 years ago)",
        "evidence": [
            {"evidence_type": "project", "verification_status": "Verified by HR", "artifact_date": "2022-01-01", "complexity_score": 5.0, "duration_months": 12.0, "role": "Lead"},
            {"evidence_type": "PR", "verification_status": "Verified by HR", "artifact_date": "2022-06-01", "complexity_score": 4.0, "duration_months": 3.0},
        ],
        "declared_years": 8.0,
        "claimed_level": "Advanced",
        "expected_level": 2,  # Substantially decayed due to recency
    },
    {
        "name": "Expired Certification Only (Decayed Weight)",
        "evidence": [
            {"evidence_type": "cert", "verification_status": "Self-reported", "artifact_date": "2022-01-01", "expiry_date": "2024-01-01"}
        ],
        "declared_years": 2.0,
        "claimed_level": "Guided",
        "expected_level": 1,  # Expired cert provides minor historical credit, cannot qualify high
    },
    {
        "name": "Valid Certification + 1 Verified PR",
        "evidence": [
            {"evidence_type": "cert", "verification_status": "Link checked", "artifact_date": "2026-01-01", "expiry_date": "2028-01-01"},
            {"evidence_type": "PR", "verification_status": "Link checked", "artifact_date": "2026-08-01", "complexity_score": 3.0}
        ],
        "declared_years": 2.0,
        "claimed_level": "Guided",
        "expected_level": 2,
    },
    {
        "name": "Duplicate Spam Attempt (Same URL 5 times)",
        "evidence": [
            {"evidence_type": "PR", "url": "https://github.com/org/repo/pull/1", "artifact_date": "2026-08-01", "complexity_score": 3.0},
            {"evidence_type": "PR", "url": "https://github.com/org/repo/pull/1", "artifact_date": "2026-08-01", "complexity_score": 3.0},
            {"evidence_type": "PR", "url": "https://github.com/org/repo/pull/1", "artifact_date": "2026-08-01", "complexity_score": 3.0},
            {"evidence_type": "PR", "url": "https://github.com/org/repo/pull/1", "artifact_date": "2026-08-01", "complexity_score": 3.0},
            {"evidence_type": "PR", "url": "https://github.com/org/repo/pull/1", "artifact_date": "2026-08-01", "complexity_score": 3.0},
        ],
        "declared_years": 1.0,
        "claimed_level": "Advanced",
        "expected_level": 1,  # Only 1st item counted, 4 duplicates give 0 points
    },
    {
        "name": "Split Share Multi-Skill Contributor (33% share)",
        "evidence": [
            {"evidence_type": "project", "verification_status": "Verified by HR", "artifact_date": "2026-06-01", "complexity_score": 3.0, "duration_months": 3.0, "share_percentage": 33.3},
            {"evidence_type": "PR", "verification_status": "Verified by HR", "artifact_date": "2026-07-01", "complexity_score": 3.0, "share_percentage": 50.0},
        ],
        "declared_years": 2.0,
        "claimed_level": "Guided",
        "expected_level": 1,  # Reduced proportional points from shared artifacts
    },
    {
        "name": "Rejected & Needs Info Submissions",
        "evidence": [
            {"evidence_type": "PR", "verification_status": "Rejected", "artifact_date": "2026-08-01"},
            {"evidence_type": "commit", "verification_status": "Needs info", "artifact_date": "2026-08-10"},
        ],
        "declared_years": 1.0,
        "claimed_level": "Guided",
        "expected_level": 1,  # Both items contribute 0 points; falls back to self-declared ceiling
    },
    {
        "name": "Peer Review Endorsements with Verified PR",
        "evidence": [
            {"evidence_type": "PR", "verification_status": "Verified by HR", "artifact_date": "2026-07-01", "complexity_score": 3.0, "duration_months": 2.0},
            {"evidence_type": "feedback", "verification_status": "Verified by HR", "artifact_date": "2026-08-01", "complexity_score": 3.0},
            {"evidence_type": "feedback", "verification_status": "Verified by HR", "artifact_date": "2026-08-15", "complexity_score": 3.0},
            {"evidence_type": "code_review", "verification_status": "Verified by HR", "artifact_date": "2026-09-01", "complexity_score": 3.0},
        ],
        "declared_years": 3.0,
        "claimed_level": "Guided",
        "expected_level": 2,
    }
]


@pytest.mark.parametrize("profile", CALIBRATION_PROFILES, ids=[p["name"] for p in CALIBRATION_PROFILES])
def test_calibration_profile_expected_levels(profile):
    res = evaluate_employee_skill(
        skill_id="test-skill",
        evidence_items=profile["evidence"],
        certifications=profile.get("certifications", []),
        declared_years=profile.get("declared_years", 1.0),
        claimed_level=profile.get("claimed_level"),
        as_of=TODAY
    )
    assert res["level"] == profile["expected_level"], (
        f"Profile '{profile['name']}' got Level {res['level']} ({res['level_name']}), expected {profile['expected_level']}. "
        f"Points: {res['points']}"
    )


def test_invariant_verified_evidence_never_lowers_level():
    base_evidence = [
        {"evidence_type": "PR", "verification_status": "Link checked", "artifact_date": "2026-08-01", "complexity_score": 3.0}
    ]
    initial = evaluate_employee_skill("skill", base_evidence, as_of=TODAY)

    # Add extra verified evidence item
    with_extra = evaluate_employee_skill(
        "skill",
        base_evidence + [{"evidence_type": "commit", "verification_status": "Verified by HR", "artifact_date": "2026-08-15", "complexity_score": 3.0}],
        as_of=TODAY
    )
    assert with_extra["points"] >= initial["points"]
    assert with_extra["level"] >= initial["level"]


def test_invariant_duplicates_never_raise_level():
    single_item = [
        {"evidence_type": "PR", "url": "https://github.com/test/repo/pull/42", "artifact_date": "2026-08-01", "complexity_score": 3.0}
    ]
    initial = evaluate_employee_skill("skill", single_item, as_of=TODAY)

    duplicated = single_item + [
        {"evidence_type": "PR", "url": "https://github.com/test/repo/pull/42", "artifact_date": "2026-08-01", "complexity_score": 3.0}
    ]
    with_dup = evaluate_employee_skill("skill", duplicated, as_of=TODAY)

    assert with_dup["points"] == initial["points"]
    assert with_dup["level"] == initial["level"]


def test_invariant_self_declared_alone_cannot_exceed_level_1():
    res = evaluate_employee_skill("skill", [], declared_years=15.0, claimed_level="Expert", as_of=TODAY)
    assert res["level"] <= 1


def test_invariant_self_reported_alone_cannot_exceed_level_3():
    # Provide 10 huge self-reported projects
    many_self_reported = [
        {"evidence_type": "project", "verification_status": "Self-reported", "artifact_date": "2026-01-01", "complexity_score": 5.0, "duration_months": 24.0}
        for _ in range(10)
    ]
    res = evaluate_employee_skill("skill", many_self_reported, as_of=TODAY)
    assert res["level"] <= 3


def test_invariant_deterministic_recompute():
    evidence = [
        {"evidence_type": "PR", "verification_status": "Verified by HR", "artifact_date": "2026-07-01", "complexity_score": 3.5, "duration_months": 2.0},
        {"evidence_type": "commit", "verification_status": "Link checked", "artifact_date": "2026-08-01", "complexity_score": 3.0}
    ]
    run1 = evaluate_employee_skill("skill", evidence, as_of=TODAY)
    run2 = evaluate_employee_skill("skill", evidence, as_of=TODAY)
    run3 = evaluate_employee_skill("skill", evidence, as_of=TODAY)

    assert run1 == run2 == run3
