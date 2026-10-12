"""
SkillGraph V2 Unified Scoring Engine.
Implements the single deterministic calculation for skill points, proficiency level (0-5),
confidence score, evidence contributions, and anti-gaming controls.
"""

import math
import datetime
from typing import Dict, List, Any, Optional, Tuple

from .scoring_config import (
    LEVEL_NAMES,
    LEVEL_THRESHOLDS,
    BASE_WEIGHTS,
    VERIFICATION_FACTORS,
    ROLE_FACTORS,
    RECENCY_HALF_LIFE_DAYS,
    RECENCY_FLOOR,
    STALE_DAYS_THRESHOLD,
    SELF_DECLARED_MAX_LEVEL,
    SELF_REPORTED_MAX_LEVEL,
    DIMINISHING_RETURNS_FACTOR,
    EXPIRED_CERT_FACTOR,
    CONFIDENCE_EVIDENCE_COUNT_TARGET,
    CONFIDENCE_SOURCE_TRUST,
)


def parse_date(date_str: Any) -> Optional[datetime.date]:
    if not date_str or date_str in ["Never", ""]:
        return None
    try:
        s = str(date_str).strip()
        return datetime.date.fromisoformat(s[:10])
    except Exception:
        return None


def calculate_recency_factor(artifact_date_str: Optional[str], as_of: Optional[datetime.date] = None) -> Tuple[float, int]:
    """Calculates exponential recency decay with a floor."""
    if not as_of:
        as_of = datetime.date.today()
    art_date = parse_date(artifact_date_str)
    if not art_date:
        return RECENCY_FLOOR, 9999
    days = max(0, (as_of - art_date).days)
    decay = math.pow(0.5, days / RECENCY_HALF_LIFE_DAYS)
    return max(RECENCY_FLOOR, decay), days


def calculate_duration_factor(months: float = 1.0) -> float:
    """Square-root duration factor capped at 2.5."""
    return min(2.5, math.sqrt(max(1.0, months)))


def merge_date_intervals(intervals: List[Tuple[datetime.date, datetime.date]]) -> float:
    """Merges overlapping intervals and returns total non-overlapping years."""
    if not intervals:
        return 0.0
    sorted_intervals = sorted(intervals, key=lambda x: x[0])
    merged = []
    current_start, current_end = sorted_intervals[0]
    for start, end in sorted_intervals[1:]:
        if start <= current_end:
            current_end = max(current_end, end)
        else:
            merged.append((current_start, current_end))
            current_start, current_end = start, end
    merged.append((current_start, current_end))
    total_days = sum((end - start).days for start, end in merged)
    return round(total_days / 365.25, 1)


def evaluate_employee_skill(
    skill_id: str,
    evidence_items: List[Dict[str, Any]],
    certifications: Optional[List[Dict[str, Any]]] = None,
    declared_years: float = 0.0,
    claimed_level: Optional[str] = None,
    as_of: Optional[datetime.date] = None,
    learning_courses: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Computes deterministic proficiency points, 0-5 level, confidence score,
    and granular evidence contributions for an employee skill.
    """
    if as_of is None:
        as_of = datetime.date.today()
    if certifications is None:
        certifications = []

    ordered_contributions = []
    total_points = 0.0
    has_verified_or_checked = False
    has_any_evidence = False
    seen_urls: set = set()
    seen_fingerprints: set = set()
    latest_date_str = ""
    latest_days_ago = 9999

    trust_factors: List[float] = []
    recency_factors: List[float] = []

    # Sort evidence items by artifact date (oldest to newest for diminishing returns)
    sorted_evidence = sorted(
        evidence_items,
        key=lambda e: e.get("artifact_date") or e.get("date") or "2000-01-01"
    )

    valid_item_index = 0
    for item in sorted_evidence:
        ev_id = item.get("evidence_id") or item.get("id") or "ev-item"
        title = item.get("title", "")
        ev_type = item.get("evidence_type") or item.get("type") or "PR"
        url = (item.get("url") or "").strip()
        date_str = item.get("artifact_date") or item.get("date") or ""
        v_status = item.get("verification_status") or ("Verified by HR" if item.get("verified") else "Self-reported")
        
        # Track latest activity
        art_date = parse_date(date_str)
        if art_date:
            days_ago = (as_of - art_date).days
            if days_ago < latest_days_ago:
                latest_days_ago = days_ago
                latest_date_str = date_str

        # Duplicate detection: exact URL match or (title + date) fingerprint
        is_dup = False
        fingerprint = f"{title.strip().lower()}|{date_str}"
        if url and url in seen_urls:
            is_dup = True
        elif fingerprint in seen_fingerprints:
            is_dup = True
        
        if url:
            seen_urls.add(url)
        if fingerprint != "|":
            seen_fingerprints.add(fingerprint)

        # Base components
        base_w = BASE_WEIGHTS.get(ev_type, 2.0)
        months = float(item.get("duration_months") or 1.0)
        dur_factor = calculate_duration_factor(months)
        complexity = float(item.get("complexity_score") or item.get("complexity") or 3.0)
        complexity_factor = max(0.5, min(2.0, complexity / 3.0))
        role = item.get("role", "Contributor")
        role_factor = ROLE_FACTORS.get(role, 1.0)
        share = float(item.get("share_percentage") or 100.0) / 100.0
        recency, _ = calculate_recency_factor(date_str, as_of)
        verif_factor = VERIFICATION_FACTORS.get(v_status, 0.7)

        if v_status in ["Verified by HR", "Link checked"]:
            has_verified_or_checked = True

        # Check certification expiration
        expiry_date_str = item.get("expiry_date")
        is_expired = False
        if expiry_date_str:
            exp_date = parse_date(expiry_date_str)
            if exp_date and exp_date < as_of:
                is_expired = True
                verif_factor *= EXPIRED_CERT_FACTOR

        # Diminishing returns for repeated items on the same skill
        if not is_dup and verif_factor > 0:
            valid_item_index += 1
            diminishing = 1.0 / (1.0 + DIMINISHING_RETURNS_FACTOR * (valid_item_index - 1))
        else:
            diminishing = 1.0

        # Calculate item points
        raw_points = base_w * dur_factor * complexity_factor * role_factor * share * recency * verif_factor
        net_points = 0.0 if is_dup else (raw_points * diminishing)

        if not is_dup and verif_factor > 0:
            total_points += net_points
            has_any_evidence = True
            trust_factors.append(CONFIDENCE_SOURCE_TRUST.get(v_status, 0.5))
            recency_factors.append(recency)

        ordered_contributions.append({
            "evidence_id": ev_id,
            "title": title,
            "evidence_type": ev_type,
            "verification_status": v_status,
            "artifact_date": date_str,
            "is_duplicate": is_dup,
            "is_expired": is_expired,
            "factors": {
                "base_weight": base_w,
                "duration_factor": round(dur_factor, 2),
                "complexity_factor": round(complexity_factor, 2),
                "role_factor": round(role_factor, 2),
                "share": round(share, 2),
                "recency_decay": round(recency, 2),
                "verification_factor": round(verif_factor, 2),
                "diminishing_returns": round(diminishing, 2)
            },
            "raw_points": round(raw_points, 2),
            "net_points": round(net_points, 2)
        })

    # Include dedicated certifications from certifications table if present
    for cert in certifications:
        cid = cert.get("cert_id") or "cert-item"
        cert_name = cert.get("cert_name") or cert.get("title") or "Certification"
        issued = cert.get("issued_date") or ""
        expiry = cert.get("expiry_date") or ""
        is_exp = False
        if expiry:
            exp_d = parse_date(expiry)
            if exp_d and exp_d < as_of:
                is_exp = True

        v_stat = "Verified by HR" if not is_exp else "Self-reported"
        rec, _ = calculate_recency_factor(issued, as_of)
        v_fac = 1.0 if not is_exp else EXPIRED_CERT_FACTOR
        raw_p = BASE_WEIGHTS["cert"] * rec * v_fac * 2.0
        
        valid_item_index += 1
        dim = 1.0 / (1.0 + DIMINISHING_RETURNS_FACTOR * (valid_item_index - 1))
        net_p = raw_p * dim
        total_points += net_p
        has_any_evidence = True
        if not is_exp:
            has_verified_or_checked = True

        trust_factors.append(1.0 if not is_exp else 0.5)
        recency_factors.append(rec)

        ordered_contributions.append({
            "evidence_id": cid,
            "title": cert_name,
            "evidence_type": "cert",
            "verification_status": v_stat,
            "artifact_date": issued,
            "is_duplicate": False,
            "is_expired": is_exp,
            "factors": {
                "base_weight": BASE_WEIGHTS["cert"],
                "duration_factor": 1.0,
                "complexity_factor": 1.0,
                "role_factor": 1.0,
                "share": 1.0,
                "recency_decay": round(rec, 2),
                "verification_factor": round(v_fac, 2),
                "diminishing_returns": round(dim, 2)
            },
            "raw_points": round(raw_p, 2),
            "net_points": round(net_p, 2)
        })

    # Phase 4: Course completion request partial credit
    # "Once requested, awards capped partial credit (+0.2 level, max +0.5 total across all courses for that skill) until HR approves."
    course_credit_boost = 0.0
    if learning_courses:
        approved = [c for c in learning_courses if c.get("status") == "Done" or c.get("approval_status") == "Approved"]
        if approved:
            has_any_evidence = True
            has_verified_or_checked = True

        awaiting = [c for c in learning_courses if c.get("status") == "Awaiting approval"]
        if awaiting:
            course_credit_boost = min(0.5, len(awaiting) * 0.2)
            added_pts = round(course_credit_boost * 2.5, 2)
            total_points += added_pts
            ordered_contributions.append({
                "evidence_id": "course-awaiting-approval",
                "title": f"Course completion requested ({len(awaiting)} awaiting approval)",
                "evidence_type": "course_partial",
                "verification_status": "Awaiting approval",
                "artifact_date": str(as_of),
                "is_duplicate": False,
                "is_expired": False,
                "factors": {
                    "base_weight": added_pts,
                    "duration_factor": 1.0,
                    "complexity_factor": 1.0,
                    "role_factor": 1.0,
                    "share": 1.0,
                    "recency_decay": 1.0,
                    "verification_factor": 0.5,
                    "diminishing_returns": 1.0
                },
                "raw_points": added_pts,
                "net_points": added_pts
            })

    # Minimum baseline for an employee with a declared skill: baseline claim points
    if total_points < BASE_WEIGHTS["self_declared"]:
        total_points = BASE_WEIGHTS["self_declared"]

    # Determine raw level by threshold
    raw_level = 0
    for lvl in [5, 4, 3, 2, 1]:
        if total_points >= LEVEL_THRESHOLDS[lvl]:
            raw_level = lvl
            break

    # Apply Anti-Gaming Ceilings:
    # 1. Self-declared claim alone (no valid evidence artifacts): max Level 1
    if not has_any_evidence:
        level = min(raw_level, SELF_DECLARED_MAX_LEVEL)
    # 2. Self-reported evidence only (no HR-verified or link-checked items): max Level 3
    elif not has_verified_or_checked:
        level = min(raw_level, SELF_REPORTED_MAX_LEVEL)
    else:
        level = raw_level

    # Compute confidence score
    count_factor = min(1.0, len(trust_factors) / CONFIDENCE_EVIDENCE_COUNT_TARGET)
    avg_trust = sum(trust_factors) / len(trust_factors) if trust_factors else 0.4
    avg_recency = sum(recency_factors) / len(recency_factors) if recency_factors else 0.5
    confidence_raw = avg_trust * avg_recency * count_factor
    confidence_score = round(max(15, min(100, confidence_raw * 100)))

    # Evidence strength categorization
    verified_count = sum(1 for c in ordered_contributions if not c["is_duplicate"] and c["verification_status"] in ["Verified by HR", "Link checked"])
    if verified_count >= 3:
        evidence_strength = "Strong"
    elif verified_count >= 1 or len(ordered_contributions) >= 2:
        evidence_strength = "Moderate"
    else:
        evidence_strength = "Preliminary"

    is_stale = latest_days_ago > STALE_DAYS_THRESHOLD if latest_date_str else False

    # Next-level guidance
    next_level = min(5, level + 1)
    if level == 5:
        guidance = "You have attained the Expert benchmark (Level 5). Maintain active production contributions to keep recency fresh."
    else:
        needed_points = max(0.0, LEVEL_THRESHOLDS[next_level] - total_points)
        next_name = LEVEL_NAMES[next_level]
        if not has_verified_or_checked and level == 3:
            guidance = f"You have reached the ceiling for self-reported evidence (Level 3). To reach {next_name} (Level 4), submit verified PRs, commits, or HR-approved artifacts."
        else:
            guidance = f"{round(needed_points, 1)} more points required to reach {next_name} (Level {next_level}). Consider submitting a high-complexity project or verified PR."

    # Derived display score (0-100) mapped deterministically from points
    display_score = round(min(100.0, (total_points / LEVEL_THRESHOLDS[5]) * 100.0))

    return {
        "skill_id": skill_id,
        "level": level,
        "level_name": LEVEL_NAMES[level],
        "points": round(total_points, 1),
        "display_score": display_score,
        "thresholds": LEVEL_THRESHOLDS,
        "ordered_evidence": ordered_contributions,
        "ordered_contributions": ordered_contributions,
        "evidence_strength": evidence_strength,
        "years_experience": declared_years,
        "last_used": latest_date_str or "Never",
        "is_stale": is_stale,
        "claimed_level": claimed_level or LEVEL_NAMES[level],
        "confidence_score": confidence_score,
        "confidence_breakdown": {
            "source_trust": round(avg_trust, 2),
            "recency_factor": round(avg_recency, 2),
            "count_factor": round(count_factor, 2)
        },
        "next_level_guidance": guidance
    }
