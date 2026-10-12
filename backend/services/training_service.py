"""
Domain service for Training and Upskilling management.
Handles course enrollment, unenrollment, hours logging, completion requests,
HR approval reviews, course suggestions, optimistic concurrency, and transactional scoring updates.
"""

import os
import csv
import logging
import time
import datetime
from typing import Dict, Any, Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from backend.models import (
    CompanyUser,
    Employee,
    EmployeeSkill,
    LearningResource,
    UpskillingProgress,
    CourseSuggestion,
    Evidence,
    Certification,
    Role,
    Skill,
)
from backend.services.common import (
    bump_data_version,
    log_audit,
    check_optimistic_concurrency,
    recompute_employee_skills,
)


def enroll_in_course(
    db: Session,
    actor: CompanyUser,
    employee_id: str,
    resource_id: str,
    role_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Enrolls employee in a learning course, preventing duplicates.
    """
    employee = db.query(Employee).filter(
        Employee.employee_id == employee_id,
        Employee.deleted_at.is_(None)
    ).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found.")

    res = db.query(LearningResource).filter(
        LearningResource.resource_id == resource_id,
        LearningResource.deleted_at.is_(None)
    ).first()
    if not res:
        raise HTTPException(status_code=404, detail="Learning resource not found.")

    existing = db.query(UpskillingProgress).filter(
        UpskillingProgress.employee_id == employee_id,
        UpskillingProgress.resource_id == resource_id,
        UpskillingProgress.deleted_at.is_(None)
    ).first()

    if existing:
        if existing.status != "Dropped":
            raise HTTPException(status_code=400, detail="Already enrolled in this course.")
        existing.status = "In progress" if (float(existing.hours_logged or 0) > 0) else "Not started"
        if role_id:
            existing.role_id = role_id
        existing.updated_at = datetime.datetime.utcnow()
        existing.version = (existing.version or 1) + 1

        log_audit(
            db=db,
            event_type="UPSKILLING_RE_ENROLL",
            actor_id=actor.user_id,
            actor_email=actor.email,
            target_id=employee_id,
            details=f"Re-enrolled in {resource_id}; previous hours {existing.hours_logged}"
        )
        new_version = bump_data_version(db, employee_id)
        db.commit()
        return {
            "ok": True,
            "message": "Re-enrolled in course successfully.",
            "progress_id": existing.id,
            "hours_logged": existing.hours_logged,
            "data_version": new_version
        }

    if role_id:
        role_exists = db.query(Role).filter(
            (Role.role_id == role_id) | (Role.role_id == f"role-{role_id}") | (Role.role_id == role_id.replace("role-", "")),
            Role.deleted_at.is_(None)
        ).first()
        target_role_id = role_exists.role_id if role_exists else (employee.target_role_id or "role-fintech-app-lead")
    else:
        target_role_id = employee.target_role_id or "role-fintech-app-lead"
    new_prog = UpskillingProgress(
        employee_id=employee_id,
        role_id=target_role_id,
        resource_id=resource_id,
        status="Not started",
        progress_percent=0.0,
        hours_logged=0.0,
        approval_status="Pending",
        version=1
    )
    db.add(new_prog)

    log_audit(
        db=db,
        event_type="UPSKILLING_ENROLL",
        actor_id=actor.user_id,
        actor_email=actor.email,
        target_id=employee_id,
        details=f"Enrolled in {resource_id} ({res.title})"
    )

    if res.skill_id:
        recompute_employee_skills(db, employee_id, [res.skill_id])

    new_version = bump_data_version(db, employee_id)
    db.commit()

    return {
        "ok": True,
        "message": f"Enrolled in course successfully.",
        "progress_id": new_prog.id,
        "resource_id": resource_id,
        "hours_logged": 0.0,
        "data_version": new_version
    }


def unenroll_from_course(
    db: Session,
    actor: CompanyUser,
    employee_id: str,
    resource_id: str,
    role_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Drops course enrollment while preserving logged hours in audit history.
    """
    query = db.query(UpskillingProgress).filter(
        UpskillingProgress.employee_id == employee_id,
        UpskillingProgress.resource_id == resource_id,
        UpskillingProgress.deleted_at.is_(None)
    )
    if role_id:
        query = query.filter(UpskillingProgress.role_id == role_id)

    record = query.first()
    if not record:
        new_version = bump_data_version(db, employee_id)
        db.commit()
        return {
            "ok": True,
            "message": "Successfully unenrolled from course.",
            "data_version": new_version
        }

    record.status = "Dropped"
    record.updated_at = datetime.datetime.utcnow()
    record.version = (record.version or 1) + 1

    resource = db.query(LearningResource).filter(LearningResource.resource_id == resource_id).first()
    if resource and resource.skill_id:
        recompute_employee_skills(db, employee_id, [resource.skill_id])

    log_audit(
        db=db,
        event_type="UPSKILLING_UNENROLL",
        actor_id=actor.user_id,
        actor_email=actor.email,
        target_id=employee_id,
        details=f"Dropped course {resource_id}; preserved {record.hours_logged} hours in audit log"
    )

    new_version = bump_data_version(db, employee_id)
    db.commit()

    return {
        "ok": True,
        "message": f"Successfully dropped course. {record.hours_logged} hours logged preserved in learning history.",
        "data_version": new_version
    }


def log_learning_hours(
    db: Session,
    actor: CompanyUser,
    employee_id: str,
    resource_id: str,
    hours: float,
    date_str: str,
    note: Optional[str] = None,
    link: Optional[str] = None,
    role_id: Optional[str] = None,
    expected_version: Optional[int] = None
) -> Dict[str, Any]:
    """
    Logs hours spent on a course, advances progress percent (capped at 99%), and recomputes readiness.
    """
    if hours <= 0 or hours > 40:
        raise HTTPException(status_code=400, detail="Logged hours must be between 0.1 and 40.0 per session.")

    try:
        log_date = datetime.date.fromisoformat(date_str[:10])
        if log_date > datetime.date.today():
            raise HTTPException(status_code=400, detail="Log date cannot be in the future.")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    resource = db.query(LearningResource).filter(
        LearningResource.resource_id == resource_id,
        LearningResource.deleted_at.is_(None)
    ).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Learning resource not found.")

    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    target_role_id = role_id or (employee.target_role_id if employee else None) or "role-fintech-app-lead"

    record = db.query(UpskillingProgress).filter(
        UpskillingProgress.employee_id == employee_id,
        UpskillingProgress.resource_id == resource_id,
        UpskillingProgress.deleted_at.is_(None)
    ).first()

    if not record:
        record = UpskillingProgress(
            employee_id=employee_id,
            role_id=target_role_id,
            resource_id=resource_id,
            status="In progress",
            progress_percent=0.0,
            hours_logged=0.0,
            version=1
        )
        db.add(record)

    check_optimistic_concurrency(record, expected_version=expected_version)

    record.hours_logged = round(record.hours_logged + hours, 1)
    record.status = "In progress"
    if note:
        record.approval_note = note.strip()
    if link:
        record.completion_proof_url = link.strip()

    est_hours = float(resource.estimated_hours) if resource.estimated_hours and resource.estimated_hours > 0 else 16.0
    new_pct = min(99.0, round((record.hours_logged / est_hours) * 100.0, 1))
    record.progress_percent = new_pct
    record.updated_at = datetime.datetime.utcnow()
    record.version = (record.version or 1) + 1

    if resource.skill_id:
        recompute_employee_skills(db, employee_id, [resource.skill_id])

    note_suffix = f" (Note: {note.strip()})" if note else ""
    log_audit(
        db=db,
        event_type="LEARNING_HOURS_LOGGED",
        actor_id=actor.user_id,
        actor_email=actor.email,
        target_id=employee_id,
        details=f"Logged {hours} hours for {resource.title} (total: {record.hours_logged}h){note_suffix}"
    )

    new_version = bump_data_version(db, employee_id)
    db.commit()

    return {
        "ok": True,
        "hours_logged": record.hours_logged,
        "progress_percent": record.progress_percent,
        "status": record.status,
        "version": record.version,
        "data_version": new_version
    }


def request_course_completion(
    db: Session,
    actor: CompanyUser,
    employee_id: str,
    resource_id: str,
    proof_url: str,
    note: Optional[str] = None,
    role_id: Optional[str] = None,
    expected_version: Optional[int] = None
) -> Dict[str, Any]:
    proof_clean = str(proof_url or "").strip()
    if len(proof_clean) < 3:
        raise HTTPException(status_code=400, detail="Proof URL or Certificate ID must be at least 3 characters.")

    if proof_clean.startswith("www."):
        proof_clean = f"https://{proof_clean}"

    record = db.query(UpskillingProgress).filter(
        UpskillingProgress.employee_id == employee_id,
        UpskillingProgress.resource_id == resource_id,
        UpskillingProgress.deleted_at.is_(None)
    ).first()

    if not record:
        employee = db.query(Employee).filter(
            Employee.employee_id == employee_id,
            Employee.deleted_at.is_(None)
        ).first()
        target_role_id = role_id or (employee.target_role_id if employee else None) or "role-fintech-app-lead"
        record = UpskillingProgress(
            employee_id=employee_id,
            role_id=target_role_id,
            resource_id=resource_id,
            status="Awaiting approval",
            progress_percent=50.0,
            hours_logged=0.0,
            approval_status="Pending",
            completion_proof_url=proof_clean,
            approval_note=note.strip() if note else None,
            version=1
        )
        db.add(record)
    else:
        check_optimistic_concurrency(record, expected_version=expected_version)
        if role_id:
            record.role_id = role_id
        record.status = "Awaiting approval"
        record.approval_status = "Pending"
        record.completion_proof_url = proof_clean
        record.approval_note = note.strip() if note else None
        record.updated_at = datetime.datetime.utcnow()
        record.version = (record.version or 1) + 1

    resource = db.query(LearningResource).filter(LearningResource.resource_id == resource_id).first()
    if resource and resource.skill_id:
        recompute_employee_skills(db, employee_id, [resource.skill_id])

    log_audit(
        db=db,
        event_type="COMPLETION_REQUESTED",
        actor_id=actor.user_id,
        actor_email=actor.email,
        target_id=employee_id,
        details=f"Requested completion for {resource_id} with proof {proof_clean}"
    )

    new_version = bump_data_version(db, employee_id)
    db.commit()

    return {
        "ok": True,
        "message": "Completion requested! Partial credit (+0.2 level) awarded pending HR review.",
        "progress_id": record.id,
        "status": record.status,
        "approval_status": record.approval_status,
        "version": record.version,
        "data_version": new_version
    }


def review_course_completion(
    db: Session,
    actor_hr: CompanyUser,
    progress_id: int,
    approved: Optional[bool] = None,
    decision: Optional[str] = None,
    approval_note: Optional[str] = None,
    expected_version: Optional[int] = None
) -> Dict[str, Any]:
    if actor_hr.role != "HR_Admin":
        raise HTTPException(status_code=403, detail="Forbidden: Only HR administrators can review completions.")

    prog = db.query(UpskillingProgress).filter(
        UpskillingProgress.id == progress_id,
        UpskillingProgress.deleted_at.is_(None)
    ).first()

    if not prog:
        raise HTTPException(status_code=404, detail="Upskilling progress record not found.")

    check_optimistic_concurrency(prog, expected_version=expected_version)

    is_approved = approved if approved is not None else (str(decision or "").strip().lower() == "approved")

    if not is_approved:
        if not approval_note or len(approval_note.strip()) < 3:
            raise HTTPException(
                status_code=422,
                detail="A rejection note (minimum 3 characters) is required when rejecting a completion request."
            )

    prog.approval_note = approval_note.strip() if approval_note else None
    prog.updated_at = datetime.datetime.utcnow()
    prog.version = (prog.version or 1) + 1

    if is_approved:
        prog.status = "Done"
        prog.progress_percent = 100.0
        prog.approval_status = "Approved"
        event_type = "COMPLETION_APPROVED"
        msg = "Course completion approved! Full skill credit unlocked."
    else:
        prog.status = "In progress"
        prog.approval_status = "Rejected"
        event_type = "COMPLETION_REJECTED"
        msg = "Course completion rejected. Partial credit reverted."

    resource = db.query(LearningResource).filter(LearningResource.resource_id == prog.resource_id).first()
    before_after = []
    if resource and resource.skill_id:
        course_ev_id = f"ev-course-{prog.id}"
        if is_approved:
            ev_item = db.query(Evidence).filter(
                Evidence.employee_id == prog.employee_id,
                Evidence.evidence_id == course_ev_id
            ).first()
            if not ev_item:
                ev_item = Evidence(
                    evidence_id=course_ev_id,
                    employee_id=prog.employee_id,
                    skill_id=resource.skill_id,
                    evidence_type="cert" if resource.type == "cert" else "project" if resource.type == "project" else "cert",
                    title=f"Course Completed: {resource.title}",
                    url=prog.completion_proof_url or "https://verify.skillgraph.demo/completion",
                    artifact_date=datetime.date.today().isoformat(),
                    base_weight=1.0,
                    complexity_score=3.0,
                    verification_status="Verified by HR",
                    hr_notes=approval_note.strip() if approval_note else "Course completion approved by HR",
                    version=1
                )
                db.add(ev_item)
            else:
                ev_item.deleted_at = None
                ev_item.verification_status = "Verified by HR"
                ev_item.base_weight = 1.0
                ev_item.hr_notes = approval_note.strip() if approval_note else "Course completion approved by HR"
                ev_item.version = (ev_item.version or 1) + 1

            cert_id = f"cert-course-{prog.id}"
            cert_item = db.query(Certification).filter(
                Certification.employee_id == prog.employee_id,
                Certification.cert_id == cert_id
            ).first()
            if not cert_item:
                cert_item = Certification(
                    cert_id=cert_id,
                    employee_id=prog.employee_id,
                    skill_id=resource.skill_id,
                    cert_name=resource.title,
                    issuer=resource.provider or "Internal Academy",
                    issued_date=datetime.date.today().isoformat(),
                    expiry_date=None
                )
                db.add(cert_item)
            else:
                cert_item.deleted_at = None
        else:
            ev_item = db.query(Evidence).filter(
                Evidence.employee_id == prog.employee_id,
                Evidence.evidence_id == course_ev_id
            ).first()
            if ev_item:
                ev_item.deleted_at = datetime.datetime.utcnow()
                ev_item.verification_status = "Rejected"

        db.flush()
        before_after = recompute_employee_skills(db, prog.employee_id, [resource.skill_id])

    log_audit(
        db=db,
        event_type=event_type,
        actor_id=actor_hr.user_id,
        actor_email=actor_hr.email,
        target_id=prog.employee_id,
        details=f"HR {'approved' if is_approved else 'rejected'} completion for resource {prog.resource_id}"
    )

    new_version = bump_data_version(db, prog.employee_id)
    db.commit()

    return {
        "ok": True,
        "message": msg,
        "status": prog.status,
        "progress_percent": prog.progress_percent,
        "approval_status": prog.approval_status,
        "version": prog.version,
        "before_after": before_after,
        "data_version": new_version
    }


def calculate_learning_pace_stats(db: Session, employee: Employee) -> Dict[str, Any]:
    active_upskilling = db.query(UpskillingProgress).filter(
        UpskillingProgress.employee_id == employee.employee_id,
        UpskillingProgress.status.in_(["Not started", "Enrolled", "In progress", "Awaiting approval"]),
        UpskillingProgress.deleted_at.is_(None)
    ).all()

    total_remaining = 0.0
    for prog in active_upskilling:
        res = db.query(LearningResource).filter(
            LearningResource.resource_id == prog.resource_id,
            LearningResource.deleted_at.is_(None)
        ).first()
        est_hours = float(res.estimated_hours) if res and res.estimated_hours else 16.0
        remaining = max(0.0, est_hours - float(prog.hours_logged or 0.0))
        total_remaining += remaining

    total_remaining = round(total_remaining, 1)
    weekly = float(employee.weekly_learning_hours or 5.0)
    est_weeks = round(total_remaining / weekly, 1) if weekly > 0 else 0.0

    return {
        "employee_id": employee.employee_id,
        "weekly_learning_hours": weekly,
        "total_remaining_hours": total_remaining,
        "estimated_weeks": est_weeks,
        "version": employee.version
    }


def suggest_learning_course(
    db: Session,
    actor: CompanyUser,
    employee_id: str,
    payload: Dict[str, Any]
) -> Dict[str, Any]:
    title = str(payload.get("title", "")).strip()
    if len(title) < 3:
        raise HTTPException(status_code=400, detail="Course title must be at least 3 characters.")

    suggestion = CourseSuggestion(
        employee_id=employee_id,
        skill_id=payload.get("skill_id"),
        suggested_title=title,
        suggested_provider=payload.get("provider", "External"),
        suggested_url=payload.get("url"),
        estimated_hours=float(payload.get("estimated_hours", 10.0)),
        why_helpful=payload.get("why_helpful"),
        note=payload.get("note"),
        status="Submitted"
    )
    db.add(suggestion)

    log_audit(
        db=db,
        event_type="COURSE_SUGGESTED",
        actor_id=actor.user_id,
        actor_email=actor.email,
        target_id=employee_id,
        details=f"Suggested course: {title}"
    )

    new_version = bump_data_version(db, employee_id)
    db.commit()

    return {
        "ok": True,
        "message": "Course suggestion submitted! HR has been notified.",
        "suggestion_id": suggestion.id,
        "suggestion": {
            "id": suggestion.id,
            "title": suggestion.suggested_title,
            "provider": suggestion.suggested_provider,
            "url": suggestion.suggested_url,
            "estimated_hours": suggestion.estimated_hours,
            "why_helpful": suggestion.why_helpful,
            "status": suggestion.status,
            "created_at": suggestion.created_at.isoformat() if suggestion.created_at else None
        },
        "data_version": new_version
    }


def update_weekly_hours(
    db: Session,
    actor: CompanyUser,
    employee_id: str,
    weekly_hours: float
) -> Dict[str, Any]:
    if weekly_hours < 0.5 or weekly_hours > 40.0:
        raise HTTPException(status_code=400, detail="Weekly learning hours must be between 0.5 and 40.0")

    employee = db.query(Employee).filter(
        Employee.employee_id == employee_id,
        Employee.deleted_at.is_(None)
    ).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found.")

    employee.weekly_learning_hours = round(weekly_hours, 1)
    employee.updated_at = datetime.datetime.utcnow()
    employee.version = (employee.version or 1) + 1

    log_audit(
        db=db,
        event_type="LEARNING_PACE_UPDATED",
        actor_id=actor.user_id,
        actor_email=actor.email,
        target_id=employee_id,
        details=f"Updated weekly learning hours to {weekly_hours}h"
    )

    new_version = bump_data_version(db, employee_id)
    db.commit()
    db.refresh(employee)

    stats = calculate_learning_pace_stats(db, employee)

    return {
        "ok": True,
        "weekly_learning_hours": stats["weekly_learning_hours"],
        "total_remaining_hours": stats["total_remaining_hours"],
        "estimated_weeks": stats["estimated_weeks"],
        "version": employee.version,
        "data_version": new_version
    }


review_completion_request = review_course_completion


def create_learning_resource(
    db: Session,
    actor: CompanyUser,
    payload: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Creates a new learning resource in SQLite.
    Restricted to HR_Admin.
    """
    if actor.role not in ("HR_Admin", "Manager"):
        raise HTTPException(status_code=403, detail="Forbidden: Only HR administrators and Managers can add learning resources.")

    title = str(payload.get("title", "")).strip()
    skill_id = str(payload.get("skill_id", "")).strip()
    if not title or not skill_id:
        raise HTTPException(status_code=400, detail="Title and skill_id are required.")

    # Ensure foreign key exists in skills table
    skill = db.query(Skill).filter(Skill.skill_id == skill_id).first()
    if not skill:
        clean_name = skill_id.replace("skill-", "").replace("-", " ").title()
        skill = db.query(Skill).filter(Skill.skill_name == clean_name).first()
        if not skill:
            skill = Skill(
                skill_id=skill_id,
                skill_name=clean_name,
                category=str(payload.get("category", "Engineering")),
                domain="Engineering"
            )
            db.add(skill)
            db.flush()
        else:
            skill_id = skill.skill_id

    raw_mentor_id = str(payload.get("mentor_employee_id", "")).strip()
    verified_mentor_id = None
    if raw_mentor_id:
        is_qualified = db.query(EmployeeSkill).filter(
            EmployeeSkill.employee_id == raw_mentor_id,
            EmployeeSkill.skill_id == skill_id,
            EmployeeSkill.proficiency_level.in_(["Expert", "Master", "Advanced"]),
            EmployeeSkill.deleted_at.is_(None)
        ).first()
        if is_qualified:
            verified_mentor_id = raw_mentor_id

    res_id = payload.get("resource_id") or f"res-{int(time.time() * 1000)}-{os.urandom(3).hex()}"
    new_res = LearningResource(
        resource_id=res_id,
        skill_id=skill_id,
        title=title,
        provider=str(payload.get("provider", "Internal Academy")),
        type=str(payload.get("type", "course")),
        duration_weeks=float(payload.get("duration_weeks", 2.0)),
        target_level=str(payload.get("target_level", "Advanced")),
        mentor_employee_id=verified_mentor_id
    )
    db.add(new_res)

    log_audit(
        db=db,
        event_type="RESOURCE_CREATED",
        actor_id=actor.user_id,
        actor_email=actor.email,
        details=f"Created resource {res_id}: {title}"
    )

    new_version = bump_data_version(db)
    db.commit()

    # Synchronize to data/learning_resources.csv
    try:
        csv_path = os.path.join(os.getcwd(), "data", "learning_resources.csv")
        if os.path.exists(csv_path):
            with open(csv_path, "a", encoding="utf-8", newline="") as f:
                writer = csv.writer(f)
                writer.writerow([
                    new_res.resource_id,
                    new_res.skill_id,
                    new_res.title,
                    new_res.provider,
                    new_res.type,
                    str(new_res.duration_weeks),
                    new_res.target_level,
                    new_res.mentor_employee_id or ""
                ])
    except Exception as e:
        logger.warning(f"Failed to sync learning_resources.csv: {e}")

    return {
        "ok": True,
        "resource": {
            "resource_id": new_res.resource_id,
            "skill_id": new_res.skill_id,
            "title": new_res.title,
            "provider": new_res.provider,
            "type": new_res.type,
            "duration_weeks": new_res.duration_weeks,
            "target_level": new_res.target_level,
            "mentor_employee_id": new_res.mentor_employee_id or ""
        },
        "data_version": new_version
    }

