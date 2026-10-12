"""
Domain service for Evidence management.
Handles evidence submission, duplicate detection, multi-skill share allocation,
editing, soft deletion with undo, deterministic level recomputations,
optimistic concurrency, and transactional audit trails.
"""

import time
import os
import datetime
from typing import Dict, List, Any, Optional
from urllib.parse import urlparse
from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.models import (
    CompanyUser,
    Employee,
    Evidence,
    Skill,
    Project,
    EmployeeProject,
)
from backend.services.common import (
    bump_data_version,
    log_audit,
    check_optimistic_concurrency,
    recompute_employee_skills,
)
from backend.scoring_config import BASE_WEIGHTS

ALLOWED_DOMAINS_BY_TYPE = {
    "PR": ["github.com", "gitlab.com", "bitbucket.org"],
    "commit": ["github.com", "gitlab.com", "bitbucket.org"],
    "code_review": ["github.com", "gitlab.com", "bitbucket.org"],
    "cert": ["credly.com", "coursera.org", "udemy.com", "linkedin.com", "aws.training", "learn.microsoft.com", "verify.skillgraph.demo"],
}


def submit_evidence(
    db: Session,
    actor: CompanyUser,
    employee_id: str,
    payload: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Submits new evidence item(s) in a single atomic database transaction.
    """
    employee = db.query(Employee).filter(
        Employee.employee_id == employee_id,
        Employee.deleted_at == None
    ).first()

    if not employee:
        raise HTTPException(status_code=404, detail="Employee record not found.")

    title_clean = str(payload.get("title", "")).strip()
    if len(title_clean) < 5 or len(title_clean) > 255:
        raise HTTPException(status_code=400, detail="Title must be between 5 and 255 characters.")

    artifact_date = str(payload.get("artifact_date", "")).strip()
    if not artifact_date:
        raise HTTPException(status_code=400, detail="Artifact date is required.")

    try:
        art_date = datetime.date.fromisoformat(artifact_date[:10])
        if art_date > datetime.date.today():
            raise HTTPException(status_code=400, detail="Artifact date cannot be in the future.")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    evidence_type = str(payload.get("evidence_type", "PR")).strip()
    valid_types = ["PR", "commit", "project", "cert", "feedback", "code_review"]
    if evidence_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid evidence type: {evidence_type}")

    url_clean = str(payload.get("url", "")).strip()
    if url_clean:
        parsed_url = urlparse(url_clean)
        if not parsed_url.scheme or not parsed_url.netloc:
            raise HTTPException(status_code=400, detail="Please enter a valid HTTP or HTTPS URL.")
        domain = parsed_url.netloc.lower().replace("www.", "")
        allowed = ALLOWED_DOMAINS_BY_TYPE.get(evidence_type)
        if allowed and not any(domain.endswith(d) for d in allowed):
            raise HTTPException(
                status_code=400,
                detail=f"Allowed domains for {evidence_type} artifacts: {', '.join(allowed)}."
            )

    project_id = payload.get("project_id")
    if project_id:
        proj = db.query(Project).filter(Project.project_id == project_id).first()
        if not proj:
            raise HTTPException(status_code=400, detail="Specified project does not exist.")
        worked_on = db.query(EmployeeProject).filter(
            EmployeeProject.employee_id == employee.employee_id,
            EmployeeProject.project_id == project_id,
            EmployeeProject.deleted_at == None
        ).first()
        if not worked_on:
            raise HTTPException(
                status_code=400,
                detail="Project must belong to a project the employee worked on."
            )

    # Skills extraction
    skills_input = payload.get("skills")
    target_skills: List[Dict[str, Any]] = []
    if skills_input and isinstance(skills_input, list):
        target_skills = skills_input
    elif payload.get("skill_id"):
        target_skills = [{"skill_id": payload["skill_id"], "share_percentage": 100.0}]

    if not target_skills:
        raise HTTPException(status_code=400, detail="At least one target skill is required.")

    total_share = sum(float(s.get("share_percentage", 100.0)) for s in target_skills)
    if total_share > 100.01:
        raise HTTPException(status_code=400, detail="Sum of skill contribution shares cannot exceed 100%.")

    for s_entry in target_skills:
        sk_id = s_entry.get("skill_id")
        skill_obj = db.query(Skill).filter(Skill.skill_id == sk_id, Skill.deleted_at == None).first()
        if not skill_obj:
            raise HTTPException(status_code=400, detail=f"Skill '{sk_id}' does not exist in taxonomy.")

    # Duplicate detection
    is_duplicate = False
    duplicate_warning = None
    if url_clean:
        same_emp_dup = db.query(Evidence).filter(
            Evidence.employee_id == employee.employee_id,
            Evidence.url == url_clean,
            Evidence.deleted_at == None
        ).first()
        if same_emp_dup:
            is_duplicate = True
            duplicate_warning = "This artifact URL has already been submitted by you. It will be recorded but not double-counted."

        other_emp_dup = db.query(Evidence).filter(
            Evidence.employee_id != employee.employee_id,
            Evidence.url == url_clean,
            Evidence.deleted_at == None
        ).first()
        if other_emp_dup and not is_duplicate:
            is_duplicate = True
            duplicate_warning = "This artifact URL was already submitted by another team member. Flagged for HR review."
    else:
        existing_fp = db.query(Evidence).filter(
            Evidence.employee_id == employee.employee_id,
            Evidence.title.ilike(title_clean),
            Evidence.artifact_date == artifact_date,
            Evidence.deleted_at == None
        ).first()
        if existing_fp:
            is_duplicate = True
            duplicate_warning = "This artifact has already been submitted by you. It will be recorded but not double-counted."

    verification_status = "Self-reported"
    if url_clean and "github.com" in url_clean and evidence_type in ["PR", "commit"]:
        verification_status = "Link checked"

    base_weight = BASE_WEIGHTS.get(evidence_type, 1.0)
    complexity_score = max(1.0, min(5.0, float(payload.get("complexity_score", 3.0))))

    created_items = []
    affected_skill_ids = []

    for s_entry in target_skills:
        sk_id = s_entry["skill_id"]
        share_pct = float(s_entry.get("share_percentage", 100.0))
        ev_id = f"ev-{employee_id[:8]}-{int(time.time() * 1000)}-{os.urandom(3).hex()}"

        item = Evidence(
            evidence_id=ev_id,
            employee_id=employee_id,
            skill_id=sk_id,
            project_id=project_id,
            evidence_type=evidence_type,
            title=title_clean,
            url=url_clean or None,
            artifact_date=artifact_date,
            base_weight=base_weight,
            complexity_score=complexity_score,
            verification_status=verification_status,
            share_percentage=share_pct,
            is_duplicate=is_duplicate,
            version=1
        )
        db.add(item)
        created_items.append(item)
        affected_skill_ids.append(sk_id)

    # Recompute affected skills
    before_after = recompute_employee_skills(db, employee_id, affected_skill_ids)

    log_audit(
        db=db,
        event_type="EVIDENCE_SUBMITTED",
        actor_id=actor.user_id,
        actor_email=actor.email,
        target_id=employee_id,
        target_email=employee.email,
        details=f"Artifact {title_clean} ({evidence_type}) submitted for {len(target_skills)} skills"
    )

    new_version = bump_data_version(db, employee_id)
    db.commit()

    return {
        "ok": True,
        "evidence_id": created_items[0].evidence_id if created_items else None,
        "verification_status": verification_status,
        "is_duplicate": is_duplicate,
        "duplicate_warning": duplicate_warning,
        "before_after": before_after,
        "created_ids": [item.evidence_id for item in created_items],
        "data_version": new_version
    }


def edit_evidence(
    db: Session,
    actor: CompanyUser,
    evidence_id: str,
    payload: Dict[str, Any],
    expected_version: Optional[int] = None
) -> Dict[str, Any]:
    item = db.query(Evidence).filter(
        Evidence.evidence_id == evidence_id,
        Evidence.deleted_at == None
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Evidence item not found.")

    if actor.role != "HR_Admin":
        actor_emp = db.query(Employee).filter(Employee.user_id == actor.user_id).first()
        if not actor_emp or actor_emp.employee_id != item.employee_id:
            raise HTTPException(status_code=403, detail="Forbidden: You cannot edit another employee's evidence.")

    check_optimistic_concurrency(item, expected_version=expected_version)

    if "title" in payload and payload["title"]:
        clean_title = str(payload["title"]).strip()
        if len(clean_title) < 5 or len(clean_title) > 255:
            raise HTTPException(status_code=400, detail="Title must be between 5 and 255 characters.")
        item.title = clean_title

    if "project_id" in payload:
        proj_id = payload["project_id"]
        if proj_id:
            proj = db.query(Project).filter(Project.project_id == proj_id).first()
            if not proj:
                raise HTTPException(status_code=400, detail="Specified project does not exist.")
        item.project_id = proj_id

    item.version = (item.version or 1) + 1

    before_after = recompute_employee_skills(db, item.employee_id, [item.skill_id])

    log_audit(
        db=db,
        event_type="EVIDENCE_EDITED",
        actor_id=actor.user_id,
        actor_email=actor.email,
        target_id=item.employee_id,
        details=f"Edited evidence {evidence_id}"
    )

    new_version = bump_data_version(db, item.employee_id)
    db.commit()

    return {
        "ok": True,
        "evidence_id": evidence_id,
        "version": item.version,
        "before_after": before_after,
        "data_version": new_version
    }


def delete_evidence(
    db: Session,
    actor: CompanyUser,
    evidence_id: str,
    expected_version: Optional[int] = None
) -> Dict[str, Any]:
    item = db.query(Evidence).filter(
        Evidence.evidence_id == evidence_id,
        Evidence.deleted_at == None
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Evidence item not found.")

    if actor.role != "HR_Admin":
        actor_emp = db.query(Employee).filter(Employee.user_id == actor.user_id).first()
        if not actor_emp or actor_emp.employee_id != item.employee_id:
            raise HTTPException(status_code=403, detail="Forbidden: You cannot delete another employee's evidence.")

    check_optimistic_concurrency(item, expected_version=expected_version)

    item.deleted_at = datetime.datetime.utcnow()
    item.version = (item.version or 1) + 1

    before_after = recompute_employee_skills(db, item.employee_id, [item.skill_id])

    log_audit(
        db=db,
        event_type="EVIDENCE_DELETED",
        actor_id=actor.user_id,
        actor_email=actor.email,
        target_id=item.employee_id,
        details=f"Soft-deleted evidence {evidence_id}"
    )

    new_version = bump_data_version(db, item.employee_id)
    db.commit()

    return {
        "ok": True,
        "evidence_id": evidence_id,
        "deleted_at": item.deleted_at.isoformat(),
        "before_after": before_after,
        "data_version": new_version
    }


def restore_evidence(
    db: Session,
    actor: CompanyUser,
    evidence_id: str
) -> Dict[str, Any]:
    item = db.query(Evidence).filter(
        Evidence.evidence_id == evidence_id
    ).first()

    if not item or item.deleted_at is None:
        raise HTTPException(status_code=404, detail="Deleted evidence item not found.")

    if actor.role != "HR_Admin":
        actor_emp = db.query(Employee).filter(Employee.user_id == actor.user_id).first()
        if not actor_emp or actor_emp.employee_id != item.employee_id:
            raise HTTPException(status_code=403, detail="Forbidden: You cannot restore this evidence.")

    item.deleted_at = None
    item.version = (item.version or 1) + 1

    before_after = recompute_employee_skills(db, item.employee_id, [item.skill_id])

    log_audit(
        db=db,
        event_type="EVIDENCE_RESTORED",
        actor_id=actor.user_id,
        actor_email=actor.email,
        target_id=item.employee_id,
        details=f"Restored evidence {evidence_id}"
    )

    new_version = bump_data_version(db, item.employee_id)
    db.commit()

    return {
        "ok": True,
        "evidence_id": evidence_id,
        "restored": True,
        "before_after": before_after,
        "data_version": new_version
    }
