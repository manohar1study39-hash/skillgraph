"""
Common transactional utilities, optimistic concurrency guards,
data versioning, and recomputation engine.
"""

import os
import time
import datetime
from typing import Dict, List, Any, Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.models import (
    Employee,
    EmployeeSkill,
    Skill,
    Evidence,
    Certification,
    LearningResource,
    UpskillingProgress,
    AuditLog,
    DataVersion,
)
from backend.scoring_engine import evaluate_employee_skill, LEVEL_NAMES


def bump_data_version(db: Session, employee_id: Optional[str] = None) -> int:
    """
    Bumps global data version and per-employee data version inside current transaction.
    Returns the new global data version number.
    """
    now = datetime.datetime.utcnow()

    # 1. Global version
    global_rec = db.query(DataVersion).filter(DataVersion.scope == "global").first()
    if not global_rec:
        global_rec = DataVersion(scope="global", version=1, updated_at=now)
        db.add(global_rec)
        db.flush()
        new_version = 1
    else:
        global_rec.version = (global_rec.version or 1) + 1
        global_rec.updated_at = now
        new_version = global_rec.version

    # 2. Per-employee version
    if employee_id:
        emp_scope = f"employee:{employee_id}"
        emp_rec = db.query(DataVersion).filter(DataVersion.scope == emp_scope).first()
        if not emp_rec:
            emp_rec = DataVersion(scope=emp_scope, version=1, updated_at=now)
            db.add(emp_rec)
            db.flush()
        else:
            emp_rec.version = (emp_rec.version or 1) + 1
            emp_rec.updated_at = now

    return new_version


def get_data_version(db: Session, scope: str = "global") -> int:
    """Returns current version for given scope."""
    rec = db.query(DataVersion).filter(DataVersion.scope == scope).first()
    return rec.version if rec else 1


def log_audit(
    db: Session,
    event_type: str,
    actor_id: Optional[str] = None,
    actor_email: Optional[str] = None,
    target_id: Optional[str] = None,
    target_email: Optional[str] = None,
    ip: Optional[str] = "127.0.0.1",
    details: Optional[str] = None
) -> AuditLog:
    """
    Appends an audit log record into the session without committing,
    ensuring it participates in the atomic transaction.
    """
    entry = AuditLog(
        event_id=f"audit-{int(time.time() * 1000)}-{os.urandom(4).hex()}",
        event_type=event_type,
        actor_id=actor_id,
        actor_email=actor_email,
        target_id=target_id,
        target_email=target_email,
        ip=ip or "127.0.0.1",
        timestamp=datetime.datetime.utcnow().isoformat(),
        details=details
    )
    db.add(entry)
    return entry


def check_optimistic_concurrency(
    entity: Any,
    expected_version: Optional[int] = None,
    expected_updated_at: Optional[str] = None
):
    """
    Validates that the entity being modified matches expected version or timestamp.
    Raises 409 Conflict if stale.
    """
    if expected_version is not None and hasattr(entity, "version"):
        current_version = getattr(entity, "version", None)
        if current_version is not None and current_version != expected_version:
            raise HTTPException(
                status_code=409,
                detail="This was changed by someone else. Reload to see the latest."
            )

    if expected_updated_at is not None and hasattr(entity, "updated_at"):
        updated_at = getattr(entity, "updated_at", None)
        if updated_at:
            curr_str = updated_at.isoformat()
            if curr_str[:19] != expected_updated_at[:19]:
                raise HTTPException(
                    status_code=409,
                    detail="This was changed by someone else. Reload to see the latest."
                )


def recompute_employee_skills(
    db: Session,
    employee_id: str,
    skill_ids: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """
    Deterministically recomputes skill proficiency levels for an employee.
    If skill_ids is None, recomputes all skills connected to the employee.
    Runs inside the current transaction and bumps entity versions.
    """
    # 1. Determine affected skill IDs if not provided
    if skill_ids is None:
        target_skill_ids = set()
        # From employee_skills
        for es in db.query(EmployeeSkill.skill_id).filter(
            EmployeeSkill.employee_id == employee_id,
            EmployeeSkill.deleted_at == None
        ).all():
            target_skill_ids.add(es[0])

        # From evidence
        for ev in db.query(Evidence.skill_id).filter(
            Evidence.employee_id == employee_id,
            Evidence.deleted_at == None
        ).all():
            target_skill_ids.add(ev[0])

        # From certifications
        for cert in db.query(Certification.skill_id).filter(
            Certification.employee_id == employee_id,
            Certification.skill_id != None,
            Certification.deleted_at == None
        ).all():
            target_skill_ids.add(cert[0])

        # From upskilling progress
        for prog in db.query(UpskillingProgress).join(
            LearningResource, UpskillingProgress.resource_id == LearningResource.resource_id
        ).filter(
            UpskillingProgress.employee_id == employee_id,
            UpskillingProgress.deleted_at == None
        ).all():
            if prog.resource and prog.resource.skill_id:
                target_skill_ids.add(prog.resource.skill_id)

        skill_ids_to_process = sorted(list(target_skill_ids))
    else:
        skill_ids_to_process = sorted(list(set(skill_ids)))

    summaries = []

    for sk_id in skill_ids_to_process:
        # Load active evidence
        evidence_items = db.query(Evidence).filter(
            Evidence.employee_id == employee_id,
            Evidence.skill_id == sk_id,
            Evidence.deleted_at == None
        ).all()

        ev_dicts = [
            {
                "evidence_id": e.evidence_id,
                "evidence_type": e.evidence_type,
                "title": e.title,
                "url": e.url,
                "artifact_date": e.artifact_date,
                "base_weight": e.base_weight,
                "complexity_score": e.complexity_score,
                "verification_status": e.verification_status,
                "share_percentage": e.share_percentage,
                "is_duplicate": e.is_duplicate,
            }
            for e in evidence_items
        ]

        # Load active certs
        cert_items = db.query(Certification).filter(
            Certification.employee_id == employee_id,
            Certification.skill_id == sk_id,
            Certification.deleted_at == None
        ).all()
        cert_dicts = [
            {
                "cert_id": c.cert_id,
                "cert_name": c.cert_name,
                "issued_date": c.issued_date,
                "expiry_date": c.expiry_date,
            }
            for c in cert_items
        ]

        # Load active upskilling progress for this skill
        progress_items = db.query(UpskillingProgress).join(
            LearningResource, UpskillingProgress.resource_id == LearningResource.resource_id
        ).filter(
            UpskillingProgress.employee_id == employee_id,
            LearningResource.skill_id == sk_id,
            UpskillingProgress.deleted_at == None
        ).all()
        course_dicts = [
            {
                "status": p.status,
                "progress_percent": p.progress_percent,
                "approval_status": p.approval_status,
                "hours_logged": p.hours_logged,
            }
            for p in progress_items
        ]

        # Existing skill record
        emp_skill = db.query(EmployeeSkill).filter(
            EmployeeSkill.employee_id == employee_id,
            EmployeeSkill.skill_id == sk_id,
            EmployeeSkill.deleted_at == None
        ).first()

        declared_years = emp_skill.years_experience if emp_skill else 0.0
        claimed_level = emp_skill.claimed_level if emp_skill else None
        old_level_name = emp_skill.proficiency_level if emp_skill else "Unassessed"

        # Evaluate deterministically
        evaluated = evaluate_employee_skill(
            skill_id=sk_id,
            evidence_items=ev_dicts,
            certifications=cert_dicts,
            declared_years=declared_years,
            claimed_level=claimed_level,
            learning_courses=course_dicts,
        )

        new_level_name = evaluated["level_name"]
        new_level_num = evaluated["level"]

        # Derive highest verification status
        has_approved_course = any(p.get("status") in ["Done", "Completed"] or p.get("approval_status") == "Approved" for p in course_dicts)
        has_verified_cert = any(not c.get("expiry_date") or c.get("expiry_date") >= datetime.date.today().isoformat() for c in cert_dicts)
        if any(e.verification_status == "Verified by HR" for e in evidence_items) or has_approved_course or (cert_dicts and has_verified_cert):
            highest_v_status = "Verified by HR"
        elif any(e.verification_status == "Link checked" for e in evidence_items):
            highest_v_status = "Link checked"
        elif any(e.verification_status == "Needs info" for e in evidence_items):
            highest_v_status = "Needs info"
        elif any(e.verification_status == "Rejected" for e in evidence_items):
            highest_v_status = "Rejected"
        else:
            highest_v_status = "Self-reported"

        if emp_skill:
            emp_skill.proficiency_level = new_level_name
            emp_skill.verification_status = highest_v_status
            emp_skill.updated_at = datetime.datetime.utcnow()
            emp_skill.version = (emp_skill.version or 1) + 1
        else:
            # Ensure skill row exists in taxonomy for foreign key constraint
            skill_obj = db.query(Skill).filter(Skill.skill_id == sk_id).first()
            if not skill_obj:
                clean_name = sk_id.replace("skill-", "").replace("-", " ").title()
                skill_obj = Skill(
                    skill_id=sk_id,
                    skill_name=clean_name,
                    category="Engineering",
                    domain="Engineering"
                )
                db.add(skill_obj)
                db.flush()

            emp_skill = EmployeeSkill(
                employee_id=employee_id,
                skill_id=sk_id,
                proficiency_level=new_level_name,
                claimed_level=claimed_level or new_level_name,
                years_experience=declared_years or 1.0,
                source="evidence" if ev_dicts else "self",
                verification_status=highest_v_status,
                last_used_date=datetime.date.today().isoformat(),
                version=1
            )
            db.add(emp_skill)

        summaries.append({
            "skill_id": sk_id,
            "old_level_name": old_level_name,
            "new_level": new_level_num,
            "new_level_name": new_level_name,
            "points": evaluated["points"],
            "display_score": evaluated["display_score"],
            "confidence_score": evaluated["confidence_score"],
            "level_increased": new_level_name != old_level_name and new_level_num > 0,
            "evaluated": evaluated,
        })

    return summaries


def get_employee_display_label(
    employee: Employee,
    all_employees: Optional[List[Employee]] = None,
    db: Optional[Session] = None
) -> str:
    """
    Computes unambiguous display label for an employee:
    - "Name" when unique across active employees
    - "Name (Department, City)" when multiple employees share a name
    - "Name (Department, City) - Suffix" (last 4 characters of ID) if Department and City are also identical
    """
    if not employee or not employee.name:
        return ""
    clean_name = employee.name.strip()

    if all_employees is None and db is not None:
        all_employees = db.query(Employee).filter(Employee.deleted_at == None).all()

    if not all_employees or len(all_employees) <= 1:
        return clean_name

    name_lower = clean_name.lower()
    same_name_emps = [e for e in all_employees if (e.name or "").strip().lower() == name_lower]

    if len(same_name_emps) <= 1:
        return clean_name

    dept = (employee.department or "General").strip()
    loc = (employee.location or "Remote").strip()
    base_label = f"{clean_name} ({dept}, {loc})"

    same_label_emps = [
        e for e in same_name_emps
        if f"{(e.name or '').strip()} ({(e.department or 'General').strip()}, {(e.location or 'Remote').strip()})".lower() == base_label.lower()
    ]

    if len(same_label_emps) <= 1:
        return base_label

    raw_id = str(employee.employee_id or "")
    suffix = raw_id.replace("emp-", "")[-4:] if len(raw_id) >= 4 else raw_id
    return f"{base_label} - {suffix}"

