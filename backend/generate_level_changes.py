#!/usr/bin/env python3
"""
Generates LEVEL_CHANGES.csv comparing current database proficiency levels
with prospective levels calculated by the V2 Unified Scoring Engine.
Uses hashed employee IDs for privacy audit compliance.
Does NOT modify database records.
"""

import os
import sys
import csv
import hashlib
from typing import Dict, List, Any

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.db import SessionLocal
from backend.models import Employee, EmployeeSkill, Evidence, Certification
from backend.scoring_engine import evaluate_employee_skill
from backend.scoring_config import LEVEL_NAMES


def hash_id(employee_id: str) -> str:
    return hashlib.sha256(employee_id.encode("utf-8")).hexdigest()[:12]


def map_legacy_level(legacy: str) -> str:
    mapping = {
        "beginner": "1 Aware",
        "intermediate": "2 Guided",
        "advanced": "4 Advanced",
        "expert": "5 Expert",
        "master": "5 Expert",
        "1": "1 Aware",
        "2": "2 Guided",
        "3": "3 Independent",
        "4": "4 Advanced",
        "5": "5 Expert",
    }
    return mapping.get((legacy or "").lower(), legacy or "Unassessed")


def generate_level_changes(output_file: str = "LEVEL_CHANGES.csv"):
    session = SessionLocal()
    try:
        employees = session.query(Employee).all()
        all_skills = session.query(EmployeeSkill).all()
        all_evidence = session.query(Evidence).all()
        all_certs = session.query(Certification).all()

        # Group evidence by (employee_id, skill_id)
        evidence_by_emp_skill: Dict[str, List[Dict[str, Any]]] = {}
        for ev in all_evidence:
            key = f"{ev.employee_id}:{ev.skill_id}"
            evidence_by_emp_skill.setdefault(key, []).append({
                "evidence_id": ev.evidence_id,
                "evidence_type": ev.evidence_type,
                "title": ev.title,
                "url": ev.url,
                "artifact_date": ev.artifact_date,
                "complexity_score": ev.complexity_score,
                "verification_status": ev.verification_status,
                "share_percentage": ev.share_percentage
            })

        # Group certs by (employee_id, skill_id)
        certs_by_emp_skill: Dict[str, List[Dict[str, Any]]] = {}
        for c in all_certs:
            if c.skill_id:
                key = f"{c.employee_id}:{c.skill_id}"
                certs_by_emp_skill.setdefault(key, []).append({
                    "cert_id": c.cert_id,
                    "title": c.cert_name,
                    "issued_date": c.issued_date,
                    "expiry_date": c.expiry_date
                })

        rows = []
        unchanged = 0
        changed = 0

        for es in all_skills:
            key = f"{es.employee_id}:{es.skill_id}"
            ev_list = evidence_by_emp_skill.get(key, [])
            cert_list = certs_by_emp_skill.get(key, [])

            evaluation = evaluate_employee_skill(
                skill_id=es.skill_id,
                evidence_items=ev_list,
                certifications=cert_list,
                declared_years=es.years_experience or 1.0,
                claimed_level=es.claimed_level
            )

            new_level_num = evaluation["level"]
            new_level_str = f"{new_level_num} {LEVEL_NAMES[new_level_num]}"
            old_level_str = map_legacy_level(es.proficiency_level)

            pts = evaluation["points"]
            ev_count = len(ev_list)

            # Determine reason
            if old_level_str == new_level_str:
                reason = f"Points {pts} aligns with {new_level_str} threshold"
                unchanged += 1
            else:
                changed += 1
                if ev_count == 0:
                    reason = "Self-declared claim capped at Level 1 (Aware) without evidence"
                elif not any(e["verification_status"] in ["Verified by HR", "Link checked"] for e in ev_list) and new_level_num == 3:
                    reason = f"Points {pts} reached ceiling for self-reported evidence (Level 3 Independent)"
                elif pts >= 44.0:
                    reason = f"Accumulated {pts} verified points across {ev_count} artifacts qualifying for Level 5 Expert"
                elif pts >= 24.0:
                    reason = f"Accumulated {pts} verified points across {ev_count} artifacts qualifying for Level 4 Advanced"
                elif pts >= 12.0:
                    reason = f"Accumulated {pts} points across {ev_count} artifacts qualifying for Level 3 Independent"
                else:
                    reason = f"Accumulated {pts} points with recency decay qualifying for Level {new_level_num} ({LEVEL_NAMES[new_level_num]})"

            rows.append({
                "hashed_id": hash_id(es.employee_id),
                "skill_id": es.skill_id,
                "old_level": old_level_str,
                "new_level": new_level_str,
                "points": pts,
                "reason": reason
            })

        # Write LEVEL_CHANGES.csv
        out_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", output_file))
        with open(out_path, "w", newline="", encoding="utf-8") as f:
            fieldnames = ["hashed_id", "skill_id", "old_level", "new_level", "points", "reason"]
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)

        print(f"Generated {out_path} with {len(rows)} skill evaluations.")
        print(f"Summary: {unchanged} unchanged, {changed} calibrated ({round(changed / len(rows) * 100, 1)}%).")
        return rows
    finally:
        session.close()


if __name__ == "__main__":
    generate_level_changes()
