#!/usr/bin/env python3
"""
Applies calibrated levels to database EmployeeSkill records.
"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.db import SessionLocal
from backend.models import Employee, EmployeeSkill, Evidence, Certification
from backend.scoring_engine import evaluate_employee_skill
from backend.scoring_config import LEVEL_NAMES


def apply_calibrated_levels():
    session = SessionLocal()
    try:
        all_skills = session.query(EmployeeSkill).all()
        all_evidence = session.query(Evidence).all()
        all_certs = session.query(Certification).all()

        evidence_by_emp_skill = {}
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

        certs_by_emp_skill = {}
        for c in all_certs:
            if c.skill_id:
                key = f"{c.employee_id}:{c.skill_id}"
                certs_by_emp_skill.setdefault(key, []).append({
                    "cert_id": c.cert_id,
                    "title": c.cert_name,
                    "issued_date": c.issued_date,
                    "expiry_date": c.expiry_date
                })

        updated = 0
        for es in all_skills:
            key = f"{es.employee_id}:{es.skill_id}"
            ev_list = evidence_by_emp_skill.get(key, [])
            cert_list = certs_by_emp_skill.get(key, [])

            eval_res = evaluate_employee_skill(
                skill_id=es.skill_id,
                evidence_items=ev_list,
                certifications=cert_list,
                declared_years=es.years_experience or 1.0,
                claimed_level=es.claimed_level
            )

            new_lvl_name = LEVEL_NAMES[eval_res["level"]]
            es.proficiency_level = new_lvl_name
            updated += 1

        session.commit()
        print(f"Applied calibrated levels across {updated} employee skill records in database.")
    except Exception as e:
        session.rollback()
        print(f"Error applying calibrated levels: {e}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    apply_calibrated_levels()
