"""
SkillGraph V2 FastAPI Application.
Integrates SQLAlchemy, unified scoring engine, token-bound identity, validation,
and Phase 2 Single Write Path domain services.
"""

import os
import re
import time
import datetime
import csv
import logging
from urllib.parse import urlparse
from typing import List, Optional, Dict, Any

logger = logging.getLogger(__name__)

from fastapi import FastAPI, Request, Response, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
import bcrypt

from .db import get_db, Base, engine
from .models import (
    CompanyUser,
    Employee,
    Skill,
    Role,
    RoleSkill,
    Project,
    EmployeeProject,
    EmployeeSkill,
    Evidence,
    Certification,
    LearningResource,
    UpskillingProgress,
    ProjectApplication,
    ProjectShortlist,
    CourseSuggestion,
    AuditLog,
    DataVersion,
)
from .auth import (
    COOKIE_NAME,
    get_current_user,
    get_current_employee,
    make_token,
    read_session_from_cookie,
)
from .scoring_engine import evaluate_employee_skill
from .scoring_config import LEVEL_NAMES

from backend.services import (
    common,
    profile_service,
    evidence_service,
    training_service,
    availability_service,
    application_service,
    role_service,
    verification_service,
    rebuild_service,
)
from backend.services.common import (
    bump_data_version,
    log_audit,
    recompute_employee_skills,
)
from backend import serializers

app = FastAPI(title="SkillGraph API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "service": "SkillGraph V2 API",
        "status": "online",
        "version": "2.0.0",
        "docs_url": "/docs",
        "redoc_url": "/redoc",
        "frontend_url": "http://127.0.0.1:3000",
        "endpoints": {
            "auth_me": "/api/auth/me",
            "career_hub": "/api/employee/career-hub",
            "skills": "/api/skills",
            "opportunities": "/api/opportunities",
        }
    }


# In-memory sliding window rate limiter: max 10 submissions per minute per employee
submission_timestamps: Dict[str, List[float]] = {}
RATE_LIMIT_WINDOW = 60.0
RATE_LIMIT_MAX_SUBMISSIONS = 10


def check_rate_limit(emp_id: str):
    now = time.time()
    history = submission_timestamps.get(emp_id, [])
    history = [t for t in history if now - t < RATE_LIMIT_WINDOW]
    if len(history) >= RATE_LIMIT_MAX_SUBMISSIONS:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Maximum 10 evidence submissions per minute. Please try again shortly."
        )
    history.append(now)
    submission_timestamps[emp_id] = history


def log_audit(db: Session, event_type: str, actor_id: str, actor_email: str = "", target_id: str = "", details: str = "", ip: str = "127.0.0.1"):
    return common.log_audit(
        db=db,
        event_type=event_type,
        actor_id=actor_id,
        actor_email=actor_email,
        target_id=target_id,
        ip=ip,
        details=details
    )


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class SkillShareInput(BaseModel):
    skill_id: Optional[str] = None
    skillId: Optional[str] = None
    share_percentage: Optional[float] = 100.0
    sharePercentage: Optional[float] = None
    share: Optional[float] = None


class SubmitEvidencePayload(BaseModel):
    title: str
    evidence_type: Optional[str] = "PR"  # PR, commit, project, cert, feedback, code_review
    evidenceType: Optional[str] = None
    type: Optional[str] = None
    url: Optional[str] = None
    artifact_date: Optional[str] = None
    artifactDate: Optional[str] = None
    date: Optional[str] = None
    skills: Optional[List[Any]] = None
    skill_id: Optional[str] = None  # Backward compatibility single-skill
    skillId: Optional[str] = None
    employee_id: Optional[str] = None
    employeeId: Optional[str] = None
    project_id: Optional[str] = None
    projectId: Optional[str] = None
    demonstrated_level: Optional[str] = "Intermediate"  # Stored as claim only
    demonstratedLevel: Optional[str] = None
    complexity_score: Optional[float] = 3.0
    complexityScore: Optional[float] = None
    complexity: Optional[float] = None
    role: Optional[str] = "Contributor"


class EditEvidencePayload(BaseModel):
    title: Optional[str] = None
    project_id: Optional[str] = None
    projectId: Optional[str] = None
    role: Optional[str] = None
    complexity_score: Optional[float] = None
    complexityScore: Optional[float] = None
    version: Optional[int] = None


class VerifyEvidencePayload(BaseModel):
    verification_status: Optional[str] = None
    status: Optional[str] = None
    hr_notes: Optional[str] = None
    note: Optional[str] = None
    notes: Optional[str] = None
    version: Optional[int] = None


class BulkVerifyItem(BaseModel):
    evidence_id: Optional[str] = None
    evidenceId: Optional[str] = None
    id: Optional[str] = None
    verification_status: Optional[str] = "Verified by HR"
    status: Optional[str] = None
    hr_notes: Optional[str] = None
    note: Optional[str] = None
    notes: Optional[str] = None


class BulkVerifyPayload(BaseModel):
    items: Optional[List[BulkVerifyItem]] = None
    evidence_ids: Optional[List[str]] = None
    evidenceIds: Optional[List[str]] = None
    verify_all_pending: Optional[bool] = False
    verifyAllPending: Optional[bool] = False
    verification_status: Optional[str] = "Verified by HR"
    status: Optional[str] = None
    hr_notes: Optional[str] = "Bulk verified by HR"
    note: Optional[str] = None
    notes: Optional[str] = None


class LoginPayload(BaseModel):
    email: str
    password: str
    portal: Optional[str] = None
    rememberMe: Optional[bool] = False


# ── Upskilling Schemas ────────────────────────────────────────────────────────

class EnrollCoursePayload(BaseModel):
    resource_id: str
    role_id: Optional[str] = None
    employee_id: Optional[str] = None
    progress_percent: Optional[float] = None


class UnenrollCoursePayload(BaseModel):
    resource_id: str
    role_id: Optional[str] = None


class LogHoursPayload(BaseModel):
    resource_id: str
    role_id: Optional[str] = None
    hours: float
    date: str
    note: Optional[str] = None
    link: Optional[str] = None
    version: Optional[int] = None


class RequestCompletionPayload(BaseModel):
    resource_id: str
    role_id: Optional[str] = None
    proof_url: str
    note: Optional[str] = None
    version: Optional[int] = None


class ReviewCompletionPayload(BaseModel):
    progress_id: int
    decision: Optional[str] = "Approved"  # Approved or Rejected
    approved: Optional[bool] = None
    note: Optional[str] = None
    version: Optional[int] = None


class SuggestCoursePayload(BaseModel):
    title: str
    provider: Optional[str] = "External"
    url: Optional[str] = None
    skill_id: Optional[str] = None
    estimated_hours: Optional[float] = 10.0
    why_helpful: Optional[str] = None


class WeeklyLearningHoursPayload(BaseModel):
    weekly_learning_hours: float


# ── Availability, Ambition & Opportunities Schemas ────────────────────────────

class UpdateAvailabilityPayload(BaseModel):
    hours_per_week_free: Optional[float] = None
    availability_percent: Optional[float] = None
    available_from: Optional[str] = None
    availabilityPercent: Optional[float] = None
    hoursPerWeekFree: Optional[float] = None
    version: Optional[int] = None


class SetAmbitionPayload(BaseModel):
    target_role_id: Optional[str] = None
    version: Optional[int] = None


class ApplyOpportunityPayload(BaseModel):
    opportunity_id: str
    opportunity_type: str = "project"  # project or role
    note: Optional[str] = ""
    hours_per_week: float = 10.0


class WithdrawApplicationPayload(BaseModel):
    application_id: Optional[str] = None
    opportunity_id: Optional[str] = None
    delete: Optional[bool] = False


class ReviewApplicationPayload(BaseModel):
    status: str  # Shortlisted, Accepted, Rejected, Filled, Withdrawn
    hr_decision_note: Optional[str] = None
    version: Optional[int] = None


class EmployeeProfilePayload(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    department: Optional[str] = None
    team: Optional[str] = None
    location: Optional[str] = None
    availabilityPercent: Optional[float] = None
    hoursPerWeekFree: Optional[float] = None
    availability_percent: Optional[float] = None
    hours_per_week_free: Optional[float] = None
    skills: Optional[List[Any]] = None
    topProjects: Optional[List[Any]] = None
    top_projects: Optional[List[Any]] = None
    certifications: Optional[List[Any]] = None
    version: Optional[int] = None


class ProjectPayload(BaseModel):
    project_id: Optional[str] = None
    project_name: str
    domain: Optional[str] = "Engineering"
    complexity: Optional[float] = 3.0
    technologies: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[str] = "Active"
    version: Optional[int] = None


class ProjectMemberPayload(BaseModel):
    project_id: str
    employee_id: str
    role: Optional[str] = "Contributor"
    contribution_summary: Optional[str] = None


class DeleteProjectMemberPayload(BaseModel):
    project_id: str
    employee_id: str


class ShortlistPayload(BaseModel):
    project_id: str
    employee_id: str
    note: Optional[str] = None


class CreateEmployeePayload(BaseModel):
    name: str
    email: str
    title: Optional[str] = "Software Engineer"
    department: Optional[str] = "Engineering"
    team: Optional[str] = "Core Platform"
    location: Optional[str] = "Remote"
    availability_percent: Optional[float] = 80.0
    hours_per_week_free: Optional[float] = None
    skills: Optional[List[Any]] = None


class CreateLearningResourcePayload(BaseModel):
    title: str
    skill_id: str
    resource_id: Optional[str] = None
    provider: Optional[str] = "Internal Academy"
    type: Optional[str] = "course"
    duration_weeks: Optional[float] = 2.0
    target_level: Optional[str] = "Advanced"
    mentor_employee_id: Optional[str] = None


# ── Auth Endpoints ────────────────────────────────────────────────────────────

@app.get("/api/session")
def get_session(request: Request, db: Session = Depends(get_db)):
    cookie = request.cookies.get(COOKIE_NAME)
    auth_header = request.headers.get("Authorization")
    if not cookie and auth_header and auth_header.startswith("Bearer "):
        cookie = auth_header[7:].strip()

    user = read_session_from_cookie(cookie, db)
    if not user:
        return {"user": None}
    return {
        "user": {
            "user_id": user.user_id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
        }
    }


@app.post("/api/login")
def login(payload: LoginPayload, response: Response, db: Session = Depends(get_db)):
    user = db.query(CompanyUser).filter(
        CompanyUser.email == payload.email.lower().strip(),
        CompanyUser.is_active == True,
        CompanyUser.deleted_at == None
    ).first()

    if not user:
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")

    # Check demo password bypass or bcrypt verify
    is_demo = (
        payload.email.lower().strip() in ["hr@skillgraph.demo", "manager@skillgraph.demo", "employee@skillgraph.demo", "hr@gmail.com"]
        and payload.password in ["SkillGraphHR2026!", "SkillGraphManager2026!", "SkillGraphEmployee2026!", "hr@123456789", "Password123!"]
    )
    password_valid = is_demo or bcrypt.checkpw(payload.password.encode("utf-8"), user.password_hash.encode("utf-8"))

    if not password_valid:
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")

    # Role portal verification
    if payload.portal == "hr" and user.role != "HR_Admin":
        raise HTTPException(status_code=403, detail="This account does not have HR Admin access.")
    if payload.portal == "manager" and user.role != "Manager":
        raise HTTPException(status_code=403, detail="Managers only. Please use the Employee or HR portal.")
    if payload.portal == "employee" and user.role != "Employee":
        raise HTTPException(status_code=403, detail="This portal is for employees. Managers and HR Admins should sign in via their respective portals.")

    token, max_age = make_token(user.user_id, remember_me=payload.rememberMe or False)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=max_age,
        httponly=True,
        secure=False,
        samesite="lax",
        path="/"
    )
    log_audit(db, "LOGIN_SUCCESS", user.user_id, user.email, details=f"portal={payload.portal or 'default'}")
    db.commit()

    return {
        "user": {
            "user_id": user.user_id,
            "name": user.name,
            "email": user.email,
            "role": user.role
        }
    }


@app.post("/api/logout")
def logout(response: Response, current_user: CompanyUser = Depends(get_current_user), db: Session = Depends(get_db)):
    response.delete_cookie(key=COOKIE_NAME)
    log_audit(db, "LOGOUT", current_user.user_id, current_user.email)
    db.commit()
    return {"ok": True}


# ── Evidence Endpoints (Phase 3 & Single Write Path) ──────────────────────────

@app.get("/api/evidence")
@app.get("/api/employees/{target_employee_id}/evidence")
def list_employee_evidence(
    employee_id: Optional[str] = None,
    target_employee_id: Optional[str] = None,
    current_user: CompanyUser = Depends(get_current_user),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    """Lists evidence items with support for employee self-view and HR/Manager viewing team members."""
    requested_id = target_employee_id or employee_id
    if current_user.role in ["HR_Admin", "Manager"] and requested_id:
        active_emp_id = requested_id
    else:
        active_emp_id = employee.employee_id

    items = db.query(Evidence).filter(
        Evidence.employee_id == active_emp_id,
        Evidence.deleted_at == None
    ).order_by(Evidence.created_at.desc()).all()

    return {
        "evidence": [
            {
                "id": item.evidence_id,
                "evidence_id": item.evidence_id,
                "evidenceId": item.evidence_id,
                "employee_id": item.employee_id,
                "skill_id": item.skill_id,
                "skillId": item.skill_id,
                "project_id": item.project_id,
                "projectId": item.project_id,
                "evidence_type": item.evidence_type,
                "evidenceType": item.evidence_type,
                "type": item.evidence_type,
                "title": item.title,
                "url": item.url,
                "artifact_date": item.artifact_date,
                "artifactDate": item.artifact_date,
                "date": item.artifact_date,
                "base_weight": item.base_weight,
                "complexity_score": item.complexity_score,
                "complexityScore": item.complexity_score,
                "verification_status": item.verification_status,
                "status": item.verification_status,
                "share_percentage": item.share_percentage,
                "hr_notes": item.hr_notes,
                "is_duplicate": item.is_duplicate,
                "version": item.version,
                "created_at": item.created_at.isoformat() if item.created_at else None
            }
            for item in items
        ]
    }


@app.post("/api/evidence")
def submit_evidence(
    payload: SubmitEvidencePayload,
    current_user: CompanyUser = Depends(get_current_user),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    target_emp_id = (payload.employee_id or payload.employeeId) if (current_user.role in ["HR_Admin", "Manager"] and (payload.employee_id or payload.employeeId)) else employee.employee_id
    check_rate_limit(target_emp_id)

    raw_data = payload.model_dump()
    normalized_skills = []
    if payload.skills:
        for s in payload.skills:
            if isinstance(s, dict):
                normalized_skills.append({
                    "skill_id": s.get("skill_id") or s.get("skillId"),
                    "share_percentage": float(s.get("share_percentage") or s.get("sharePercentage") or s.get("share") or 100.0)
                })
            elif hasattr(s, "skill_id"):
                normalized_skills.append({
                    "skill_id": s.skill_id or getattr(s, "skillId", None),
                    "share_percentage": float(s.share_percentage or getattr(s, "sharePercentage", None) or 100.0)
                })
    elif payload.skill_id or payload.skillId:
        normalized_skills = [{"skill_id": payload.skill_id or payload.skillId, "share_percentage": 100.0}]

    normalized_payload = {
        "title": payload.title,
        "evidence_type": payload.evidence_type or payload.evidenceType or payload.type or "PR",
        "url": payload.url,
        "artifact_date": payload.artifact_date or payload.artifactDate or payload.date,
        "skills": normalized_skills,
        "skill_id": payload.skill_id or payload.skillId or (normalized_skills[0]["skill_id"] if normalized_skills else None),
        "project_id": payload.project_id or payload.projectId,
        "demonstrated_level": payload.demonstrated_level or payload.demonstratedLevel or "Intermediate",
        "complexity_score": payload.complexity_score or payload.complexityScore or payload.complexity or 3.0,
        "role": payload.role or "Contributor"
    }

    return evidence_service.submit_evidence(
        db=db,
        actor=current_user,
        employee_id=target_emp_id,
        payload=normalized_payload
    )


@app.delete("/api/evidence/{evidence_id}")
def delete_evidence(
    evidence_id: str,
    version: Optional[int] = None,
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return evidence_service.delete_evidence(
        db=db,
        actor=current_user,
        evidence_id=evidence_id,
        expected_version=version
    )


@app.post("/api/evidence/{evidence_id}/undo-delete")
def undo_delete_evidence(
    evidence_id: str,
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return evidence_service.restore_evidence(
        db=db,
        actor=current_user,
        evidence_id=evidence_id
    )


@app.put("/api/evidence/{evidence_id}")
def edit_evidence(
    evidence_id: str,
    payload: EditEvidencePayload,
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    clean_payload = {
        "title": payload.title,
        "project_id": payload.project_id or payload.projectId,
        "role": payload.role,
        "complexity_score": payload.complexity_score or payload.complexityScore
    }
    return evidence_service.edit_evidence(
        db=db,
        actor=current_user,
        evidence_id=evidence_id,
        payload=clean_payload,
        expected_version=payload.version
    )


@app.post("/api/evidence/{evidence_id}/verify")
@app.post("/api/hr/evidence/{evidence_id}/verify")
def verify_evidence(
    evidence_id: str,
    payload: VerifyEvidencePayload,
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    target_status = payload.verification_status or payload.status or "Verified by HR"
    target_notes = payload.hr_notes or payload.notes or payload.note or ""
    return verification_service.verify_evidence_status(
        db=db,
        actor_hr=current_user,
        evidence_id=evidence_id,
        verification_status=target_status,
        hr_notes=target_notes,
        expected_version=payload.version
    )


@app.post("/api/evidence/bulk-verify")
@app.post("/api/hr/evidence/bulk-verify")
def bulk_verify_evidence_endpoint(
    payload: BulkVerifyPayload,
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """HR: Bulk verifies multiple or all pending evidence artifacts in one atomic transaction."""
    default_status = payload.verification_status or payload.status or "Verified by HR"
    default_notes = payload.hr_notes or payload.notes or payload.note or "Bulk verified by HR"
    verify_all = bool(payload.verify_all_pending or payload.verifyAllPending)

    items_list = []
    if payload.items:
        for it in payload.items:
            items_list.append({
                "evidence_id": it.evidence_id or it.evidenceId or it.id,
                "verification_status": it.verification_status or it.status or default_status,
                "hr_notes": it.hr_notes or it.note or it.notes or default_notes
            })

    return verification_service.bulk_verify_evidence(
        db=db,
        actor_hr=current_user,
        items=items_list if items_list else None,
        evidence_ids=payload.evidence_ids or payload.evidenceIds,
        verify_all_pending=verify_all,
        default_status=default_status,
        default_notes=default_notes
    )


# ── Skill Level Explanation ("Why is my level X?") ───────────────────────────

def fetch_skill_explanation(
    db: Session,
    actor: CompanyUser,
    employee_id: str,
    skill_id: str,
) -> Dict[str, Any]:
    if actor.role not in ["HR_Admin", "Manager"]:
        actor_emp = db.query(Employee).filter(
            Employee.user_id == actor.user_id,
            Employee.deleted_at.is_(None)
        ).first()
        if not actor_emp:
            actor_emp = db.query(Employee).filter(
                func.lower(Employee.email) == actor.email.lower(),
                Employee.deleted_at.is_(None)
            ).first()
            if actor_emp and actor_emp.user_id != actor.user_id:
                actor_emp.user_id = actor.user_id
                db.commit()

        is_own = actor_emp and (
            actor_emp.employee_id == employee_id or
            employee_id in ["me", "current", "self"]
        )
        if not is_own:
            raise HTTPException(status_code=403, detail="Forbidden: You can only view explanations for your own skills.")
        if employee_id in ["me", "current", "self"] and actor_emp:
            employee_id = actor_emp.employee_id

    employee = db.query(Employee).filter(
        Employee.employee_id == employee_id,
        Employee.deleted_at.is_(None)
    ).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found.")

    skill = db.query(Skill).filter(
        (Skill.skill_id == skill_id) | (Skill.skill_name.ilike(skill_id))
    ).first()
    resolved_skill_id = skill.skill_id if skill else skill_id
    resolved_skill_name = skill.skill_name if skill else skill_id

    # Active evidence
    evidence_items = db.query(Evidence).filter(
        Evidence.employee_id == employee_id,
        Evidence.skill_id == resolved_skill_id,
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

    # Active certs
    cert_items = db.query(Certification).filter(
        Certification.employee_id == employee_id,
        Certification.skill_id == resolved_skill_id,
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

    # Active upskilling progress
    progress_items = db.query(UpskillingProgress).join(
        LearningResource, UpskillingProgress.resource_id == LearningResource.resource_id
    ).filter(
        UpskillingProgress.employee_id == employee_id,
        LearningResource.skill_id == resolved_skill_id,
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

    emp_skill = db.query(EmployeeSkill).filter(
        EmployeeSkill.employee_id == employee_id,
        EmployeeSkill.skill_id == resolved_skill_id,
        EmployeeSkill.deleted_at == None
    ).first()

    declared_years = emp_skill.years_experience if emp_skill else 0.0
    claimed_level = emp_skill.claimed_level if emp_skill else (emp_skill.proficiency_level if emp_skill else None)

    explanation = evaluate_employee_skill(
        skill_id=resolved_skill_id,
        evidence_items=ev_dicts,
        certifications=cert_dicts,
        declared_years=declared_years,
        claimed_level=claimed_level,
        learning_courses=course_dicts,
    )
    explanation["skill_name"] = resolved_skill_name
    explanation["employee_id"] = employee_id
    explanation["employee_name"] = employee.name
    explanation["claimed_level"] = claimed_level or explanation["level_name"]
    explanation["evidenced_level"] = explanation["level_name"]
    return explanation


@app.get("/api/employees/{employee_id}/skills/{skill_id}/explanation")
def get_employee_skill_explanation(
    employee_id: str,
    skill_id: str,
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return fetch_skill_explanation(db, current_user, employee_id, skill_id)


@app.get("/api/employee/skills/{skill_id}/explanation")
def get_current_employee_skill_explanation(
    skill_id: str,
    current_user: CompanyUser = Depends(get_current_user),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    return fetch_skill_explanation(db, current_user, employee.employee_id, skill_id)


# ── Learning & Upskilling Endpoints ───────────────────────────────────────────

@app.get("/api/upskilling/progress")
def list_upskilling_progress(
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    items = db.query(UpskillingProgress).filter(
        UpskillingProgress.employee_id == employee.employee_id,
        UpskillingProgress.deleted_at == None
    ).order_by(UpskillingProgress.updated_at.desc()).all()

    result = []
    for item in items:
        res = db.query(LearningResource).filter(
            LearningResource.resource_id == item.resource_id,
            LearningResource.deleted_at == None
        ).first()
        est_hours = float(res.estimated_hours) if res and res.estimated_hours else 16.0
        result.append({
            "id": item.id,
            "resource_id": item.resource_id,
            "role_id": item.role_id,
            "status": item.status,
            "progress_percent": item.progress_percent,
            "hours_logged": item.hours_logged,
            "estimated_hours": est_hours,
            "completion_proof_url": item.completion_proof_url,
            "approval_status": item.approval_status,
            "approval_note": item.approval_note,
            "version": item.version,
            "updated_at": item.updated_at.isoformat() if item.updated_at else None,
            "resource": {
                "resource_id": res.resource_id if res else item.resource_id,
                "skill_id": res.skill_id if res else "",
                "title": res.title if res else item.resource_id,
                "provider": res.provider if res else "Internal Academy",
                "type": res.type if res else "course",
                "estimated_hours": est_hours,
                "duration_weeks": res.duration_weeks if res else "2",
                "target_level": res.target_level if res else "Advanced"
            } if res else None
        })
    return {"progress": result}


@app.post("/api/upskilling/enroll")
def enroll_course(
    payload: EnrollCoursePayload,
    current_user: CompanyUser = Depends(get_current_user),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    target_emp_id = payload.employee_id if (current_user.role in ["HR_Admin", "Manager"] and payload.employee_id) else employee.employee_id
    res = training_service.enroll_in_course(
        db=db,
        actor=current_user,
        employee_id=target_emp_id,
        resource_id=payload.resource_id,
        role_id=payload.role_id
    )
    if payload.progress_percent is not None and float(payload.progress_percent) > 0:
        pct = float(payload.progress_percent)
        prog = db.query(UpskillingProgress).filter(
            UpskillingProgress.employee_id == target_emp_id,
            UpskillingProgress.resource_id == payload.resource_id,
            UpskillingProgress.deleted_at.is_(None)
        ).first()
        if prog:
            prog.progress_percent = pct
            prog.status = "Done" if pct >= 100 else "In progress"
            db.commit()
    return res


@app.post("/api/upskilling/unenroll")
def unenroll_course(
    payload: UnenrollCoursePayload,
    current_user: CompanyUser = Depends(get_current_user),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    return training_service.unenroll_from_course(
        db=db,
        actor=current_user,
        employee_id=employee.employee_id,
        resource_id=payload.resource_id,
        role_id=payload.role_id
    )


@app.post("/api/upskilling/log-hours")
def log_hours(
    payload: LogHoursPayload,
    current_user: CompanyUser = Depends(get_current_user),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    return training_service.log_learning_hours(
        db=db,
        actor=current_user,
        employee_id=employee.employee_id,
        resource_id=payload.resource_id,
        hours=payload.hours,
        date_str=payload.date,
        note=payload.note,
        link=payload.link,
        role_id=payload.role_id,
        expected_version=payload.version
    )


@app.post("/api/upskilling/request-completion")
def request_completion(
    payload: RequestCompletionPayload,
    current_user: CompanyUser = Depends(get_current_user),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    return training_service.request_course_completion(
        db=db,
        actor=current_user,
        employee_id=employee.employee_id,
        resource_id=payload.resource_id,
        proof_url=payload.proof_url,
        note=payload.note,
        role_id=payload.role_id,
        expected_version=payload.version
    )


@app.post("/api/upskilling/admin/review-completion")
def review_completion(
    payload: ReviewCompletionPayload,
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return training_service.review_course_completion(
        db=db,
        actor_hr=current_user,
        progress_id=payload.progress_id,
        decision=payload.decision,
        approved=payload.approved,
        approval_note=payload.note,
        expected_version=payload.version
    )


@app.post("/api/upskilling-progress")
def legacy_upskilling_progress(
    payload: Dict[str, Any],
    current_user: CompanyUser = Depends(get_current_user),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    """Enrolls or updates upskilling progress with atomic DB write and version bump."""
    target_emp_id = payload.get("employee_id") or payload.get("employeeId")
    if not target_emp_id or current_user.role not in ["HR_Admin", "Manager"]:
        target_emp_id = employee.employee_id

    target_emp = db.query(Employee).filter(
        Employee.employee_id == target_emp_id,
        Employee.deleted_at.is_(None)
    ).first()
    if not target_emp:
        raise HTTPException(status_code=404, detail="Employee not found.")

    resource_id = payload.get("resource_id") or payload.get("resourceId")
    if not resource_id:
        raise HTTPException(status_code=400, detail="resource_id is required.")

    res = db.query(LearningResource).filter(
        LearningResource.resource_id == resource_id,
        LearningResource.deleted_at.is_(None)
    ).first()
    if not res:
        raise HTTPException(status_code=404, detail=f"Learning resource {resource_id} not found.")

    raw_role_id = payload.get("role_id") or payload.get("roleId") or target_emp.target_role_id or "role-fintech-app-lead"
    role_obj = db.query(Role).filter(
        (Role.role_id == raw_role_id) | (Role.role_id == f"role-{raw_role_id}") | (Role.role_id == raw_role_id.replace("role-", "")),
        Role.deleted_at.is_(None)
    ).first()
    clean_role_id = role_obj.role_id if role_obj else (raw_role_id if db.query(Role).filter(Role.role_id == raw_role_id).first() else "role-fintech-app-lead")

    pct = float(payload.get("progress_percent") or payload.get("progressPercent") or 0.0)
    status = payload.get("status") or ("Done" if pct >= 100 else ("In progress" if pct > 0 else "Not started"))
    est_hours = float(res.estimated_hours) if res and res.estimated_hours else 16.0
    hours_to_set = float(payload.get("hours")) if payload.get("hours") is not None else round((pct / 100.0) * est_hours, 1)

    prog = db.query(UpskillingProgress).filter(
        UpskillingProgress.employee_id == target_emp_id,
        UpskillingProgress.resource_id == resource_id,
        UpskillingProgress.deleted_at.is_(None)
    ).first()

    if prog:
        prog.role_id = clean_role_id
        prog.progress_percent = pct
        prog.status = status
        prog.hours_logged = max(float(prog.hours_logged or 0.0), hours_to_set)
        prog.updated_at = datetime.datetime.utcnow()
        prog.version = (prog.version or 1) + 1
    else:
        prog = UpskillingProgress(
            employee_id=target_emp_id,
            role_id=clean_role_id,
            resource_id=resource_id,
            status=status,
            progress_percent=pct,
            hours_logged=hours_to_set,
            approval_status="Approved" if pct >= 100 else "Pending",
            version=1
        )
        db.add(prog)
        db.flush()

    if pct >= 100 or status == "Done":
        if res and res.skill_id:
            recompute_employee_skills(db, target_emp_id, [res.skill_id])

    log_audit(
        db=db,
        event_type="UPSKILLING_PROGRESS_SAVED",
        actor_id=current_user.user_id,
        actor_email=current_user.email,
        target_id=target_emp_id,
        details=f"Saved progress for {resource_id}: {pct}% ({status})"
    )

    new_version = bump_data_version(db, target_emp_id)
    db.commit()

    # Synchronize to data/upskilling_progress.csv
    try:
        csv_path = os.path.join(os.getcwd(), "data", "upskilling_progress.csv")
        if os.path.exists(csv_path):
            rows = []
            with open(csv_path, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                headers = reader.fieldnames or ["id","employee_id","role_id","resource_id","status","progress_percent","hours_logged","completion_proof_url","approval_status","approval_note","updated_at","deleted_at","version"]
                for r in reader:
                    if not (r.get("employee_id") == target_emp_id and r.get("role_id") == clean_role_id and r.get("resource_id") == resource_id):
                        rows.append(r)
            pct_str = str(int(pct)) if isinstance(pct, (int, float)) and float(pct).is_integer() else str(pct)
            rows.append({
                "id": str(prog.id),
                "employee_id": target_emp_id,
                "role_id": clean_role_id,
                "resource_id": resource_id,
                "status": status,
                "progress_percent": pct_str,
                "hours_logged": str(prog.hours_logged),
                "completion_proof_url": getattr(prog, "completion_proof_url", "") or "",
                "approval_status": getattr(prog, "approval_status", "") or "Pending",
                "approval_note": getattr(prog, "approval_note", "") or "",
                "updated_at": datetime.date.today().isoformat(),
                "deleted_at": "",
                "version": str(prog.version or 1)
            })
            with open(csv_path, "w", encoding="utf-8", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=headers)
                writer.writeheader()
                writer.writerows(rows)
    except Exception as e:
        logger.warning(f"Failed to sync upskilling_progress.csv: {e}")

    return {
        "ok": True,
        "progress_percent": prog.progress_percent,
        "status": prog.status,
        "hours_logged": prog.hours_logged,
        "row": {
            "id": prog.id,
            "employee_id": target_emp_id,
            "role_id": prog.role_id,
            "resource_id": prog.resource_id,
            "progress_percent": str(prog.progress_percent),
            "status": prog.status,
            "hours_logged": prog.hours_logged,
            "updated_at": prog.updated_at.isoformat() if prog.updated_at else datetime.date.today().isoformat(),
            "version": prog.version
        },
        "data_version": new_version
    }


@app.get("/api/learning-suggestions")
def list_suggestions(
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    suggestions = db.query(CourseSuggestion).filter(
        CourseSuggestion.employee_id == employee.employee_id,
        CourseSuggestion.deleted_at == None
    ).order_by(CourseSuggestion.created_at.desc()).all()

    return {
        "suggestions": [
            {
                "id": s.id,
                "title": s.suggested_title,
                "provider": s.suggested_provider,
                "url": s.suggested_url,
                "estimated_hours": s.estimated_hours,
                "why_helpful": s.why_helpful,
                "status": s.status,
                "created_at": s.created_at.isoformat() if s.created_at else None
            }
            for s in suggestions
        ]
    }


@app.post("/api/learning-suggestions")
def create_suggestion(
    payload: SuggestCoursePayload,
    current_user: CompanyUser = Depends(get_current_user),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    return training_service.suggest_learning_course(
        db=db,
        actor=current_user,
        employee_id=employee.employee_id,
        payload=payload.model_dump()
    )


@app.get("/api/employee/weekly-learning-hours")
def get_weekly_hours(
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    return training_service.calculate_learning_pace_stats(db, employee)


@app.put("/api/employee/weekly-learning-hours")
def set_weekly_hours(
    payload: WeeklyLearningHoursPayload,
    current_user: CompanyUser = Depends(get_current_user),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    return training_service.update_weekly_hours(
        db=db,
        actor=current_user,
        employee_id=employee.employee_id,
        weekly_hours=payload.weekly_learning_hours
    )


# ── Availability Endpoints ───────────────────────────────────────────────────

@app.get("/api/employee/availability")
def get_availability(
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    committed = availability_service.get_employee_committed_hours(db, employee.employee_id)
    max_free = max(0.0, 40.0 - committed)
    return {
        "employee_id": employee.employee_id,
        "total_hours_baseline": 40.0,
        "availability_percent": employee.availability_percent,
        "hours_per_week_free": employee.hours_per_week_free,
        "current_workload_percent": employee.current_workload_percent,
        "committed_hours": round(committed, 1),
        "max_free_hours": round(max_free, 1),
        "version": employee.version
    }


@app.put("/api/employee/availability")
def update_availability_endpoint(
    payload: UpdateAvailabilityPayload,
    current_user: CompanyUser = Depends(get_current_user),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    avail = payload.availability_percent if payload.availability_percent is not None else payload.availabilityPercent
    free_h = payload.hours_per_week_free if payload.hours_per_week_free is not None else payload.hoursPerWeekFree
    return availability_service.update_availability(
        db=db,
        actor=current_user,
        employee_id=employee.employee_id,
        availability_percent=avail,
        hours_per_week_free=free_h,
        available_from=payload.available_from,
        expected_version=payload.version
    )


@app.post("/api/employee-availability")
def update_availability_legacy_post(
    payload: UpdateAvailabilityPayload,
    current_user: CompanyUser = Depends(get_current_user),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    return update_availability_endpoint(payload=payload, current_user=current_user, employee=employee, db=db)


# ── Ambition & Career Goals ───────────────────────────────────────────────────

@app.get("/api/employee/ambition")
def get_ambition(
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    target_role_id = employee.target_role_id
    if not target_role_id:
        return {
            "target_role_id": None,
            "target_role": None,
            "readiness_percent": 0.0,
            "breakdown": [],
            "gaps": [],
            "weekly_learning_hours": employee.weekly_learning_hours or 5.0,
            "total_gap_hours": 0.0,
            "estimated_weeks": 0.0,
            "version": employee.version
        }

    role = db.query(Role).filter(Role.role_id == target_role_id, Role.deleted_at == None).first()
    if not role:
        return {
            "target_role_id": None,
            "target_role": None,
            "readiness_percent": 0.0,
            "breakdown": [],
            "gaps": [],
            "weekly_learning_hours": employee.weekly_learning_hours or 5.0,
            "total_gap_hours": 0.0,
            "estimated_weeks": 0.0,
            "version": employee.version
        }

    role_skills = db.query(RoleSkill).filter(RoleSkill.role_id == target_role_id, RoleSkill.deleted_at == None).all()
    emp_skills = {
        es.skill_id: es
        for es in db.query(EmployeeSkill).filter(
            EmployeeSkill.employee_id == employee.employee_id,
            EmployeeSkill.deleted_at == None
        ).all()
    }

    LEVEL_MAP = {"Unassessed": 0, "Aware": 1, "Guided": 2, "Independent": 3, "Advanced": 4, "Expert": 5}

    total_credits = 0.0
    total_required = max(1, len(role_skills))
    gaps = []
    breakdown = []
    total_gap_hours = 0.0

    for rs in role_skills:
        req_lvl_num = LEVEL_MAP.get(rs.required_level, 3)
        emp_sk = emp_skills.get(rs.skill_id)
        current_lvl_num = LEVEL_MAP.get(emp_sk.proficiency_level if emp_sk else "Unassessed", 0)

        skill_obj = db.query(Skill).filter(Skill.skill_id == rs.skill_id).first()
        skill_name = skill_obj.skill_name if skill_obj else rs.skill_id

        diff = req_lvl_num - current_lvl_num
        if diff <= 0:
            credit = 1.0
            status_desc = "Meets"
        elif diff == 1:
            credit = 0.5
            status_desc = "1 Level Below"
        else:
            credit = 0.0
            status_desc = f"{diff} Levels Below"

        total_credits += credit

        item_entry = {
            "skill_id": rs.skill_id,
            "skill_name": skill_name,
            "required_level": rs.required_level,
            "required_level_num": req_lvl_num,
            "current_level": emp_sk.proficiency_level if emp_sk else "Unassessed",
            "current_level_num": current_lvl_num,
            "importance": rs.importance,
            "credit": credit,
            "status": status_desc
        }
        breakdown.append(item_entry)

        if diff > 0:
            gap_courses = db.query(LearningResource).filter(
                LearningResource.skill_id == rs.skill_id,
                LearningResource.deleted_at == None
            ).all()
            est_course_hours = sum(float(c.estimated_hours or 16.0) for c in gap_courses) if gap_courses else 16.0
            total_gap_hours += est_course_hours
            gaps.append({
                "skill_id": rs.skill_id,
                "skill_name": skill_name,
                "required_level": rs.required_level,
                "current_level": emp_sk.proficiency_level if emp_sk else "Unassessed",
                "gap_levels": diff,
                "estimated_hours": est_course_hours,
                "courses": [{"resource_id": c.resource_id, "title": c.title, "provider": c.provider, "estimated_hours": c.estimated_hours} for c in gap_courses]
            })

    readiness_pct = round((total_credits / total_required) * 100.0)
    weekly_hours = employee.weekly_learning_hours or 5.0
    estimated_weeks = round(total_gap_hours / weekly_hours, 1) if weekly_hours > 0 else 0.0

    return {
        "target_role_id": target_role_id,
        "target_role": {
            "role_id": role.role_id,
            "role_title": role.role_title,
            "department": role.department,
            "priority": role.priority,
            "status": role.status
        },
        "readiness_percent": readiness_pct,
        "breakdown": breakdown,
        "gaps": gaps,
        "weekly_learning_hours": weekly_hours,
        "total_gap_hours": total_gap_hours,
        "estimated_weeks": estimated_weeks,
        "version": employee.version
    }


@app.put("/api/employee/ambition")
def set_ambition(
    payload: SetAmbitionPayload,
    current_user: CompanyUser = Depends(get_current_user),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    if payload.target_role_id:
        role = db.query(Role).filter(Role.role_id == payload.target_role_id, Role.deleted_at == None).first()
        if not role:
            raise HTTPException(status_code=404, detail="Target career role does not exist.")
        employee.target_role_id = payload.target_role_id
    else:
        employee.target_role_id = None

    common.check_optimistic_concurrency(employee, expected_version=payload.version)
    employee.updated_at = datetime.datetime.utcnow()
    employee.version = (employee.version or 1) + 1

    common.log_audit(
        db, "AMBITION_UPDATED", employee.employee_id, employee.email,
        details=f"Target ambition updated to {payload.target_role_id}"
    )
    common.bump_data_version(db, employee.employee_id)
    db.commit()

    return get_ambition(employee=employee, db=db)


# ── Opportunities Endpoints ───────────────────────────────────────────────────

@app.get("/api/opportunities")
def get_opportunities(
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    """Calculates deterministic fit scores for all open gigs and roles."""
    committed = availability_service.get_employee_committed_hours(db, employee.employee_id)
    free_capacity = float(employee.hours_per_week_free if employee.hours_per_week_free is not None else max(0.0, 40.0 - committed))

    LEVEL_MAP = {"Unassessed": 0, "Aware": 1, "Guided": 2, "Independent": 3, "Advanced": 4, "Expert": 5}
    emp_skills = {
        es.skill_id: es
        for es in db.query(EmployeeSkill).filter(
            EmployeeSkill.employee_id == employee.employee_id,
            EmployeeSkill.deleted_at == None
        ).all()
    }

    opportunities = []

    # 1. Projects
    projects = db.query(Project).filter(Project.deleted_at == None, Project.status == "Active").all()
    for p in projects:
        req_hours = 10.0
        avail_factor = min(1.0, round(free_capacity / req_hours, 2)) if req_hours > 0 else 1.0

        p_techs = [t.strip() for t in (p.technologies or "").split("|") if t.strip()]
        skill_breakdown = []
        total_credit = 0.0

        target_level_num = 3 if p.complexity <= 3.0 else (4 if p.complexity <= 4.0 else 5)
        target_level_name = LEVEL_NAMES.get(target_level_num, "Independent")

        for t in p_techs:
            sk = db.query(Skill).filter(
                (Skill.skill_name.ilike(t)) | (Skill.skill_id == t),
                Skill.deleted_at == None
            ).first()
            if not sk:
                continue

            es = emp_skills.get(sk.skill_id)
            current_lvl = LEVEL_MAP.get(es.proficiency_level if es else "Unassessed", 0)

            if current_lvl > target_level_num:
                credit = 1.0
                status_lbl = "Exceeds"
            elif current_lvl == target_level_num:
                credit = 1.0
                status_lbl = "Meets"
            elif current_lvl == target_level_num - 1:
                credit = 0.5
                status_lbl = "1 Level Below"
            else:
                credit = 0.0
                status_lbl = "Gap"

            total_credit += credit
            item_data = {
                "skill_id": sk.skill_id,
                "skill_name": sk.skill_name,
                "required_level": target_level_name,
                "current_level": es.proficiency_level if es else "Unassessed",
                "credit": credit,
                "status": status_lbl
            }
            skill_breakdown.append(item_data)

        total_techs = max(1, len(p_techs))
        base_match = round((total_credit / total_techs) * 100.0)
        overall_match = round(base_match * avail_factor)

        opportunities.append({
            "id": p.project_id,
            "type": "project",
            "name": p.project_name,
            "title": p.project_name,
            "department": p.domain,
            "commitment": f"{int(req_hours)} hrs/wk",
            "hours_per_week": req_hours,
            "complexity": p.complexity,
            "technologies": p_techs,
            "description": f"Internal {p.domain} project initiative utilizing {' '.join(p_techs)}.",
            "base_match_percent": base_match,
            "availability_factor": avail_factor,
            "matchScore": overall_match,
            "skill_breakdown": skill_breakdown
        })

    # 2. Roles
    roles = db.query(Role).filter(Role.deleted_at == None, Role.status == "Open").all()
    for r in roles:
        role_skills = db.query(RoleSkill).filter(RoleSkill.role_id == r.role_id, RoleSkill.deleted_at == None).all()
        min_avail = r.min_availability_percent or 40.0
        req_hours = round((min_avail / 100.0) * 40.0)
        avail_factor = min(1.0, round(free_capacity / req_hours, 2)) if req_hours > 0 else 1.0

        total_credit = 0.0
        skill_breakdown = []
        role_techs = []

        for rs in role_skills:
            sk = db.query(Skill).filter(Skill.skill_id == rs.skill_id).first()
            if sk:
                role_techs.append(sk.skill_name)
            es = emp_skills.get(rs.skill_id)
            current_lvl = LEVEL_MAP.get(es.proficiency_level if es else "Unassessed", 0)
            req_lvl = LEVEL_MAP.get(rs.required_level, 3)

            weight = 1.0 if rs.importance == "Must" else 0.3

            if current_lvl > req_lvl:
                credit = 1.0 * weight
                status_lbl = "Exceeds"
            elif current_lvl == req_lvl:
                credit = 1.0 * weight
                status_lbl = "Meets"
            elif current_lvl == req_lvl - 1:
                credit = 0.5 * weight
                status_lbl = "1 Level Below"
            else:
                credit = 0.0
                status_lbl = "Gap"

            total_credit += credit
            item_data = {
                "skill_id": rs.skill_id,
                "skill_name": sk.skill_name if sk else rs.skill_id,
                "required_level": rs.required_level,
                "current_level": es.proficiency_level if es else "Unassessed",
                "importance": rs.importance,
                "credit": credit,
                "status": status_lbl
            }
            skill_breakdown.append(item_data)

        max_possible = sum(1.0 if rs.importance == "Must" else 0.3 for rs in role_skills) or 1.0
        base_match = round((total_credit / max_possible) * 100.0)
        overall_match = round(base_match * avail_factor)

        opportunities.append({
            "id": r.role_id,
            "type": "role",
            "name": r.role_title,
            "title": r.role_title,
            "department": r.department,
            "commitment": f"{int(req_hours)} hrs/wk",
            "hours_per_week": req_hours,
            "min_availability_percent": min_avail,
            "description": f"Open internal career role in {r.department} with target requirements.",
            "technologies": role_techs,
            "base_match_percent": base_match,
            "availability_factor": avail_factor,
            "matchScore": overall_match,
            "skill_breakdown": skill_breakdown
        })

    return {"opportunities": opportunities}


# ── Applications Endpoints ────────────────────────────────────────────────────

@app.get("/api/project-applications")
def get_applications(
    employee_id: Optional[str] = None,
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role.lower() == "employee":
        emp = db.query(Employee).filter(Employee.user_id == current_user.user_id).first()
        if not emp:
            raise HTTPException(status_code=404, detail="Employee profile not found.")
        if employee_id and employee_id != emp.employee_id:
            raise HTTPException(status_code=403, detail="Forbidden: You cannot view another employee's applications.")
        filter_emp_id = emp.employee_id
    else:
        filter_emp_id = employee_id

    query = db.query(ProjectApplication).filter(ProjectApplication.deleted_at == None)
    if filter_emp_id:
        query = query.filter(ProjectApplication.employee_id == filter_emp_id)

    apps = query.order_by(ProjectApplication.applied_at.desc()).all()

    return {
        "applications": [
            {
                "application_id": a.application_id,
                "opportunity_id": a.opportunity_id,
                "opportunity_type": a.opportunity_type,
                "employee_id": a.employee_id,
                "employee_name": a.employee_name,
                "note": a.note,
                "hours_per_week": a.hours_per_week,
                "applied_at": a.applied_at,
                "status": a.status,
                "hr_decision_note": a.hr_decision_note,
                "version": a.version
            }
            for a in apps
        ]
    }


@app.post("/api/project-applications")
def apply_opportunity(
    payload: ApplyOpportunityPayload,
    current_user: CompanyUser = Depends(get_current_user),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    return application_service.apply_for_opportunity(
        db=db,
        actor=current_user,
        employee_id=employee.employee_id,
        opportunity_id=payload.opportunity_id,
        opportunity_type=payload.opportunity_type,
        hours_per_week=payload.hours_per_week,
        note=payload.note
    )


@app.delete("/api/project-applications/{application_id}")
def withdraw_application(
    application_id: str,
    current_user: CompanyUser = Depends(get_current_user),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    return application_service.withdraw_application(
        db=db,
        actor=current_user,
        employee_id=employee.employee_id,
        application_id_or_opp_id=application_id
    )


@app.post("/api/project-applications/{application_id}/withdraw")
def withdraw_application_post(
    application_id: str,
    current_user: CompanyUser = Depends(get_current_user),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    return application_service.withdraw_application(
        db=db,
        actor=current_user,
        employee_id=employee.employee_id,
        application_id_or_opp_id=application_id
    )


@app.delete("/api/project-applications")
def withdraw_application_body(
    payload: WithdrawApplicationPayload,
    current_user: CompanyUser = Depends(get_current_user),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    target = payload.application_id or payload.opportunity_id
    if not target:
        raise HTTPException(status_code=400, detail="application_id or opportunity_id is required.")
    return application_service.withdraw_application(
        db=db,
        actor=current_user,
        employee_id=employee.employee_id,
        application_id_or_opp_id=target,
        delete_record=bool(payload.delete)
    )


@app.post("/api/project-applications/{application_id}/review")
def review_application(
    application_id: str,
    payload: ReviewApplicationPayload,
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return application_service.review_application(
        db=db,
        actor_hr=current_user,
        application_id=application_id,
        status=payload.status,
        hr_decision_note=payload.hr_decision_note,
        expected_version=payload.version
    )


@app.get("/api/project-shortlists")
def list_project_shortlists(
    project_id: Optional[str] = Query(None),
    employee_id: Optional[str] = Query(None),
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in ["HR_Admin", "Manager"]:
        raise HTTPException(status_code=403, detail="Forbidden: HR and Managers only.")

    query = db.query(ProjectShortlist).filter(ProjectShortlist.deleted_at == None)
    if project_id:
        query = query.filter(ProjectShortlist.project_id == project_id)
    if employee_id:
        query = query.filter(ProjectShortlist.employee_id == employee_id)
    shortlists = query.all()
    results = []
    for sl in shortlists:
        emp = db.query(Employee).filter(Employee.employee_id == sl.employee_id, Employee.deleted_at == None).first()
        proj = db.query(Project).filter(Project.project_id == sl.project_id, Project.deleted_at == None).first()
        results.append({
            "id": sl.id,
            "project_id": sl.project_id,
            "project_name": proj.project_name if proj else sl.project_id,
            "employee_id": sl.employee_id,
            "employee_name": emp.name if emp else sl.employee_id,
            "shortlisted_by": sl.shortlisted_by or "",
            "shortlisted_at": sl.shortlisted_at or "",
            "note": sl.note or ""
        })
    return {"shortlists": results}


@app.post("/api/project-shortlists")
def shortlist_candidate(
    payload: ShortlistPayload,
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return application_service.shortlist_candidate(
        db=db,
        actor=current_user,
        project_id=payload.project_id,
        employee_id=payload.employee_id,
        note=payload.note
    )


@app.delete("/api/project-shortlists")
async def remove_shortlist(
    request: Request,
    project_id: Optional[str] = Query(None),
    employee_id: Optional[str] = Query(None),
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    p_id = project_id
    e_id = employee_id
    if not p_id or not e_id:
        try:
            body = await request.json()
            if isinstance(body, dict):
                p_id = p_id or body.get("project_id")
                e_id = e_id or body.get("employee_id")
        except Exception:
            pass

    if not p_id or not e_id:
        raise HTTPException(status_code=400, detail="project_id and employee_id are required.")

    return application_service.remove_candidate_shortlist(
        db=db,
        actor=current_user,
        project_id=p_id,
        employee_id=e_id
    )


# ── Profile & Directory Endpoints ────────────────────────────────────────────

@app.post("/api/employee-profile")
def update_profile(
    payload: EmployeeProfilePayload,
    current_user: CompanyUser = Depends(get_current_user),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    return profile_service.update_employee_profile(
        db=db,
        actor=current_user,
        employee_id=employee.employee_id,
        payload=payload.model_dump(),
        expected_version=payload.version
    )


@app.get("/api/employees/{employee_id}/profile")
def get_employee_full_profile(
    employee_id: str,
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    emp = db.query(Employee).filter(Employee.employee_id == employee_id, Employee.deleted_at == None).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")
    score, level = serializers.get_employee_score_and_level(db, emp)
    skills = db.query(EmployeeSkill).filter(EmployeeSkill.employee_id == employee_id, EmployeeSkill.deleted_at == None).all()
    projects = db.query(EmployeeProject).join(Project, EmployeeProject.project_id == Project.project_id).filter(
        EmployeeProject.employee_id == employee_id, EmployeeProject.deleted_at == None
    ).all()
    certs = db.query(Certification).filter(Certification.employee_id == employee_id, Certification.deleted_at == None).all()
    upskilling = db.query(UpskillingProgress).join(Role, UpskillingProgress.role_id == Role.role_id).join(
        LearningResource, UpskillingProgress.resource_id == LearningResource.resource_id
    ).filter(UpskillingProgress.employee_id == employee_id, UpskillingProgress.deleted_at == None).all()

    return {
        "employee": {
            "id": emp.employee_id,
            "name": emp.name,
            "email": emp.email,
            "title": emp.title,
            "department": emp.department,
            "team": emp.team,
            "location": emp.location,
            "availabilityPercent": emp.availability_percent,
            "currentWorkloadPercent": emp.current_workload_percent,
            "hoursPerWeekFree": emp.hours_per_week_free,
            "score": score,
            "level": level,
            "proficiency_level": level,
            "version": emp.version
        },
        "employeeSkills": [{"skill_id": s.skill_id, "proficiency_level": s.proficiency_level, "years_experience": str(s.years_experience), "source": s.source, "last_used": s.last_used_date} for s in skills],
        "projects": [{"project_id": ep.project_id, "project_name": ep.project.project_name if ep.project else ep.project_id, "role": ep.role, "contribution_summary": ep.contribution_summary} for ep in projects],
        "certifications": [{"cert_id": c.cert_id, "cert_name": c.cert_name, "issuer": c.issuer, "issued_date": c.issued_date, "expiry_date": c.expiry_date} for c in certs],
        "upskilling": [{"role_title": u.role.role_title if u.role else u.role_id, "resource_title": u.resource.title if u.resource else u.resource_id, "status": u.status, "progress_percent": str(u.progress_percent)} for u in upskilling]
    }


@app.get("/api/employee/notifications")
def get_employee_notifications(
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns unified notifications for the authenticated employee covering:
    - Project assignments & unassignments
    - Opportunity applications (accepted, rejected, pending review)
    - Upskilling course enrollments & completion reviews
    - Skill evidence verification outcomes
    """
    emp = db.query(Employee).filter(
        (Employee.user_id == current_user.user_id) | (Employee.email == current_user.email),
        Employee.deleted_at == None
    ).first()

    emp_id = emp.employee_id if emp else ("emp-1" if current_user.role == "Employee" else None)
    if not emp_id:
        return {"notifications": [], "unread_count": 0}

    notifications = []

    # 1. Project Assignments from EmployeeProject
    active_assignments = db.query(EmployeeProject).filter(
        EmployeeProject.employee_id == emp_id,
        EmployeeProject.deleted_at == None
    ).all()
    for ep in active_assignments:
        proj = db.query(Project).filter(Project.project_id == ep.project_id).first()
        role = db.query(Role).filter(Role.role_id == ep.project_id).first()
        title_str = proj.project_name if proj else (role.role_title if role else ep.project_id)
        notifications.append({
            "id": f"notif-assign-{ep.project_id}",
            "category": "Project Assignment",
            "type": "assigned",
            "title": f"Assigned to Project: {title_str}",
            "message": f"You were staffed on {title_str} as {ep.role or 'Contributor'}. {ep.contribution_summary or ''}".strip(),
            "badge_variant": "success",
            "action_tab": "projects",
            "timestamp": "Active Assignment"
        })

    # 2. Project Applications from ProjectApplication
    apps = db.query(ProjectApplication).filter(
        ProjectApplication.employee_id == emp_id
    ).order_by(ProjectApplication.application_id.desc()).all()
    for a in apps:
        proj = db.query(Project).filter(Project.project_id == a.opportunity_id).first()
        role = db.query(Role).filter(Role.role_id == a.opportunity_id).first()
        opp_title = proj.project_name if proj else (role.role_title if role else a.opportunity_id)
        if a.status == "Accepted":
            notifications.append({
                "id": f"notif-app-acc-{a.application_id}",
                "category": "Application Decision",
                "type": "accepted",
                "title": f"Application Accepted: {opp_title}",
                "message": f"Your application for {opp_title} was Accepted by HR! {a.hr_decision_note or 'You have joined the initiative.'}",
                "badge_variant": "success",
                "action_tab": "projects",
                "timestamp": a.applied_at or "Recent"
            })
        elif a.status == "Rejected":
            notifications.append({
                "id": f"notif-app-rej-{a.application_id}",
                "category": "Application Decision",
                "type": "rejected",
                "title": f"Application Declined: {opp_title}",
                "message": f"Your application for {opp_title} was reviewed. Feedback: {a.hr_decision_note or 'Position or team capacity filled.'}",
                "badge_variant": "danger",
                "action_tab": "opportunities",
                "timestamp": a.applied_at or "Recent"
            })
        elif a.status == "Pending":
            notifications.append({
                "id": f"notif-app-pend-{a.application_id}",
                "category": "Application Decision",
                "type": "pending",
                "title": f"Application Under Review: {opp_title}",
                "message": f"Your application requesting {a.hours_per_week}h/wk has been submitted to HR and is awaiting review.",
                "badge_variant": "warning",
                "action_tab": "opportunities",
                "timestamp": a.applied_at or "Recent"
            })

    # 3. Upskilling Course Progress & Reviews from UpskillingProgress
    progs = db.query(UpskillingProgress).filter(
        UpskillingProgress.employee_id == emp_id,
        UpskillingProgress.deleted_at == None
    ).all()
    for p in progs:
        res = db.query(LearningResource).filter(LearningResource.resource_id == p.resource_id).first()
        res_title = res.title if res else p.resource_id
        if p.status == "Done" or getattr(p, "approval_status", "") == "Approved":
            notifications.append({
                "id": f"notif-course-done-{p.resource_id}",
                "category": "Learning Track",
                "type": "course_certified",
                "title": f"Course Certified: {res_title}",
                "message": f"Congratulations! HR verified your completion of {res_title}. Credited towards your skill profile and level progression.",
                "badge_variant": "success",
                "action_tab": "courses",
                "timestamp": p.updated_at.isoformat()[:10] if p.updated_at else "Recent"
            })
        elif p.status == "Awaiting approval":
            notifications.append({
                "id": f"notif-course-rev-{p.resource_id}",
                "category": "Learning Track",
                "type": "course_submitted",
                "title": f"Awaiting Verification: {res_title}",
                "message": f"Completion proof for {res_title} was submitted. HR administrators have been notified for review.",
                "badge_variant": "warning",
                "action_tab": "courses",
                "timestamp": p.updated_at.isoformat()[:10] if p.updated_at else "Recent"
            })
        elif p.progress_percent and p.progress_percent > 0:
            notifications.append({
                "id": f"notif-course-prog-{p.resource_id}",
                "category": "Learning Track",
                "type": "course_enrolled",
                "title": f"Enrolled in Track: {res_title}",
                "message": f"Active course track at {p.progress_percent}% progress ({p.hours_logged or 0} hrs logged).",
                "badge_variant": "info",
                "action_tab": "courses",
                "timestamp": p.updated_at.isoformat()[:10] if p.updated_at else "Recent"
            })

    # 4. Evidence Verifications from Evidence
    evidence_items = db.query(Evidence).filter(
        Evidence.employee_id == emp_id,
        Evidence.deleted_at == None
    ).all()
    for ev in evidence_items:
        sk = db.query(Skill).filter(Skill.skill_id == ev.skill_id).first()
        sk_name = sk.skill_name if sk else ev.skill_id
        if ev.verification_status in ["Verified by HR", "Link checked"]:
            notifications.append({
                "id": f"notif-ev-ver-{ev.evidence_id}",
                "category": "Skill Verification",
                "type": "evidence_verified",
                "title": f"Skill Proof Verified: {sk_name}",
                "message": f"Your proof \"{ev.title}\" was verified by HR with full confidence weight applied.",
                "badge_variant": "success",
                "action_tab": "skills",
                "timestamp": ev.artifact_date or "Recent"
            })
        elif ev.verification_status == "Rejected":
            notifications.append({
                "id": f"notif-ev-rej-{ev.evidence_id}",
                "category": "Skill Verification",
                "type": "evidence_rejected",
                "title": f"Skill Proof Needs Attention: {sk_name}",
                "message": f"Your proof \"{ev.title}\" was rejected. HR Note: {ev.hr_notes or 'Please provide a valid commit/PR artifact URL.'}",
                "badge_variant": "danger",
                "action_tab": "skills",
                "timestamp": ev.artifact_date or "Recent"
            })

    # 5. Audit Log items related to assignment removals
    removed_logs = db.query(AuditLog).filter(
        AuditLog.target_id == emp_id,
        AuditLog.event_type == "PROJECT_MEMBER_REMOVED"
    ).all()
    for log in removed_logs:
        notifications.append({
            "id": f"notif-log-{log.event_id}",
            "category": "Project Assignment",
            "type": "unassigned",
            "title": "Unassigned from Project",
            "message": log.details or "You were unassigned from an initiative and your weekly bandwidth was released.",
            "badge_variant": "info",
            "action_tab": "projects",
            "timestamp": log.timestamp[:10] if log.timestamp else "Recent"
        })

    return {
        "notifications": notifications,
        "unread_count": len([n for n in notifications if n["badge_variant"] in ["warning", "danger", "success"]])
    }


@app.get("/api/employees")
def list_employees(
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    employees = db.query(Employee).filter(Employee.deleted_at == None).all()
    return {
        "employees": [
            serializers.serialize_employee(db, emp, viewer_role=current_user.role, viewer_user_id=current_user.user_id)
            for emp in employees
        ]
    }


@app.get("/api/employees/{employee_id}")
def get_employee(
    employee_id: str,
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    emp = db.query(Employee).filter(Employee.employee_id == employee_id, Employee.deleted_at == None).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")
    return {
        "employee": serializers.serialize_employee(db, emp, viewer_role=current_user.role, viewer_user_id=current_user.user_id)
    }


@app.get("/api/manager/employees")
def list_manager_employees(
    query_str: Optional[str] = Query(None, alias="query"),
    department: Optional[str] = Query(None),
    min_availability: Optional[float] = Query(None),
    verified_only: Optional[bool] = Query(False),
    sort_by: Optional[str] = Query(None),
    page: Optional[int] = Query(1),
    page_size: Optional[int] = Query(None),
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in ["Manager", "HR_Admin"]:
        raise HTTPException(status_code=403, detail="Forbidden: Manager or HR access required.")

    query = db.query(Employee).filter(Employee.deleted_at == None)
    if current_user.role == "Manager":
        mgr_emp = db.query(Employee).filter(
            (Employee.user_id == current_user.user_id) | (Employee.email == current_user.email.lower()),
            Employee.deleted_at == None
        ).first()
        if mgr_emp:
            reportees_count = db.query(Employee).filter(
                Employee.manager_id == mgr_emp.employee_id,
                Employee.deleted_at == None
            ).count()
            if reportees_count > 0:
                query = query.filter(Employee.manager_id == mgr_emp.employee_id)

    if query_str and query_str.strip():
        q_term = f"%{query_str.strip()}%"
        query = query.filter(
            (Employee.name.ilike(q_term)) |
            (Employee.title.ilike(q_term)) |
            (Employee.email.ilike(q_term)) |
            (Employee.department.ilike(q_term)) |
            (Employee.team.ilike(q_term))
        )

    if department and department.strip():
        query = query.filter(Employee.department.ilike(f"%{department.strip()}%"))

    if min_availability is not None:
        query = query.filter(Employee.availability_percent >= min_availability)

    if sort_by == "availability":
        query = query.order_by(Employee.availability_percent.desc())
    elif sort_by == "workload":
        query = query.order_by(Employee.current_workload_percent.asc())
    elif sort_by == "name":
        query = query.order_by(Employee.name.asc())
    else:
        query = query.order_by(Employee.name.asc())

    total_count = query.count()

    if page_size and page_size > 0:
        p = max(1, page or 1)
        offset = (p - 1) * page_size
        employees = query.offset(offset).limit(page_size).all()
    else:
        employees = query.all()

    serialized = [
        serializers.serialize_employee(db, emp, viewer_role=current_user.role, viewer_user_id=current_user.user_id)
        for emp in employees
    ]

    if verified_only:
        serialized = [e for e in serialized if any(s.get("verified") for s in e.get("skills", []))]

    return {
        "employees": serialized,
        "total": total_count,
        "page": page or 1,
        "page_size": page_size or total_count
    }


@app.get("/api/manager/employees/{employee_id}")
def get_manager_employee(
    employee_id: str,
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in ["Manager", "HR_Admin"]:
        raise HTTPException(status_code=403, detail="Forbidden: Manager or HR access required.")

    emp = db.query(Employee).filter(Employee.employee_id == employee_id, Employee.deleted_at == None).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")

    return {
        "employee": serializers.serialize_employee(db, emp, viewer_role=current_user.role, viewer_user_id=current_user.user_id)
    }


# ── Projects & Roles Management ───────────────────────────────────────────────

@app.get("/api/projects")
def list_projects(
    db: Session = Depends(get_db)
):
    projects = db.query(Project).filter(Project.deleted_at == None).all()
    return {
        "projects": [serializers.serialize_project(db, p) for p in projects]
    }


@app.get("/api/projects/{project_id}")
def get_project(
    project_id: str,
    db: Session = Depends(get_db)
):
    p = db.query(Project).filter(Project.project_id == project_id, Project.deleted_at == None).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found.")
    return {
        "project": serializers.serialize_project(db, p)
    }


@app.post("/api/projects")
def create_project(
    payload: ProjectPayload,
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return role_service.create_or_update_project(
        db=db,
        actor=current_user,
        payload=payload.model_dump(),
        expected_version=payload.version
    )


@app.post("/api/project-members")
def assign_member(
    payload: ProjectMemberPayload,
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return role_service.assign_project_member(
        db=db,
        actor=current_user,
        project_id=payload.project_id,
        employee_id=payload.employee_id,
        role=payload.role or "Contributor",
        contribution_summary=payload.contribution_summary
    )


@app.delete("/api/project-members")
async def remove_member(
    request: Request,
    project_id: Optional[str] = Query(None),
    employee_id: Optional[str] = Query(None),
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    p_id = project_id
    e_id = employee_id
    if not p_id or not e_id:
        try:
            body = await request.json()
            if isinstance(body, dict):
                p_id = p_id or body.get("project_id")
                e_id = e_id or body.get("employee_id")
        except Exception:
            pass

    if not p_id or not e_id:
        raise HTTPException(status_code=400, detail="project_id and employee_id are required.")

    return role_service.remove_project_member(
        db=db,
        actor=current_user,
        project_id=p_id,
        employee_id=e_id
    )




@app.get("/api/roles")
def list_roles(
    db: Session = Depends(get_db)
):
    roles = db.query(Role).filter(Role.deleted_at == None).all()
    return {
        "roles": [serializers.serialize_role(db, r) for r in roles]
    }


@app.get("/api/roles/{role_id}")
def get_role(
    role_id: str,
    db: Session = Depends(get_db)
):
    r = db.query(Role).filter(Role.role_id == role_id, Role.deleted_at == None).first()
    if not r:
        raise HTTPException(status_code=404, detail="Role not found.")
    return {
        "role": serializers.serialize_role(db, r)
    }


@app.post("/api/roles")
def create_role(
    payload: Dict[str, Any],
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return role_service.create_or_update_role(
        db=db,
        actor_hr=current_user,
        payload=payload
    )


@app.get("/api/skills")
def list_skills(
    db: Session = Depends(get_db)
):
    skills = db.query(Skill).filter(Skill.deleted_at == None).all()
    return {
        "skills": [serializers.serialize_skill(s) for s in skills]
    }


@app.get("/api/skills/{skill_id}")
def get_skill(
    skill_id: str,
    db: Session = Depends(get_db)
):
    s = db.query(Skill).filter(Skill.skill_id == skill_id, Skill.deleted_at == None).first()
    if not s:
        raise HTTPException(status_code=404, detail="Skill not found.")
    return {
        "skill": serializers.serialize_skill(s)
    }


@app.get("/api/learning-resources")
def list_learning_resources(
    db: Session = Depends(get_db)
):
    resources = db.query(LearningResource).filter(LearningResource.deleted_at == None).all()
    return {
        "resources": [
            {
                "resource_id": r.resource_id,
                "skill_id": r.skill_id,
                "title": r.title,
                "provider": r.provider,
                "type": r.type,
                "duration_weeks": r.duration_weeks,
                "target_level": r.target_level,
                "mentor_employee_id": r.mentor_employee_id or ""
            }
            for r in resources
        ]
    }


@app.post("/api/learning-resources")
def create_learning_resource_endpoint(
    payload: CreateLearningResourcePayload,
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return training_service.create_learning_resource(
        db=db,
        actor=current_user,
        payload=payload.model_dump()
    )


@app.post("/api/employees")
def add_directory_employee(
    payload: CreateEmployeePayload,
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return role_service.create_directory_employee(
        db=db,
        actor=current_user,
        payload=payload.model_dump()
    )


# ── HR Queue Endpoints ────────────────────────────────────────────────────────

@app.get("/api/hr/evidence-queue")
def hr_evidence_queue(
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """HR: Returns all evidence items not yet verified (Self-reported, Link checked, Needs info)."""
    if current_user.role != "HR_Admin":
        raise HTTPException(status_code=403, detail="Forbidden: HR Admins only.")

    # All active evidence pending verification (exclude Verified by HR and Rejected)
    items = db.query(Evidence).filter(
        Evidence.deleted_at == None,
        Evidence.verification_status.in_(["Self-reported", "Link checked", "Needs info"])
    ).order_by(Evidence.created_at.asc()).all()

    result = []
    for ev in items:
        emp = db.query(Employee).filter(Employee.employee_id == ev.employee_id, Employee.deleted_at == None).first()
        sk = db.query(Skill).filter(Skill.skill_id == ev.skill_id).first() if ev.skill_id else None
        result.append({
            "id": ev.evidence_id,
            "evidence_id": ev.evidence_id,
            "evidenceId": ev.evidence_id,
            "employee_id": ev.employee_id,
            "employee_name": emp.name if emp else ev.employee_id,
            "employee_email": emp.email if emp else "",
            "employee_department": emp.department if emp else "",
            "skill_id": ev.skill_id,
            "skill_name": sk.skill_name if sk else (ev.skill_id or ""),
            "evidence_type": ev.evidence_type,
            "title": ev.title,
            "url": ev.url,
            "artifact_date": ev.artifact_date,
            "base_weight": ev.base_weight,
            "complexity_score": ev.complexity_score,
            "verification_status": ev.verification_status,
            "status": ev.verification_status,
            "hr_notes": ev.hr_notes,
            "version": ev.version,
            "created_at": ev.created_at.isoformat() if ev.created_at else None,
        })

    return {"evidence_queue": result, "count": len(result)}


@app.get("/api/hr/completion-queue")
def hr_completion_queue(
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """HR: Returns all upskilling progress records awaiting HR course completion approval."""
    if current_user.role != "HR_Admin":
        raise HTTPException(status_code=403, detail="Forbidden: HR Admins only.")

    items = db.query(UpskillingProgress).filter(
        UpskillingProgress.deleted_at == None,
        UpskillingProgress.status == "Awaiting approval"
    ).order_by(UpskillingProgress.updated_at.asc()).all()

    result = []
    for prog in items:
        emp = db.query(Employee).filter(Employee.employee_id == prog.employee_id, Employee.deleted_at == None).first()
        res = db.query(LearningResource).filter(LearningResource.resource_id == prog.resource_id).first()
        result.append({
            "id": prog.id,
            "employee_id": prog.employee_id,
            "employee_name": emp.name if emp else prog.employee_id,
            "employee_email": emp.email if emp else "",
            "employee_department": emp.department if emp else "",
            "resource_id": prog.resource_id,
            "resource_title": res.title if res else prog.resource_id,
            "provider": res.provider if res else "Internal Academy",
            "hours_logged": prog.hours_logged,
            "estimated_hours": float(res.estimated_hours) if res and res.estimated_hours else 16.0,
            "progress_percent": prog.progress_percent,
            "completion_proof_url": prog.completion_proof_url,
            "status": prog.status,
            "approval_status": prog.approval_status,
            "version": prog.version,
            "updated_at": prog.updated_at.isoformat() if prog.updated_at else None,
        })

    return {"completion_queue": result, "count": len(result)}


@app.get("/api/hr/applications-queue")
def hr_applications_queue(
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """HR: Returns all project/role applications awaiting HR review."""
    if current_user.role != "HR_Admin":
        raise HTTPException(status_code=403, detail="Forbidden: HR Admins only.")

    apps = db.query(ProjectApplication).filter(
        ProjectApplication.deleted_at == None,
        ProjectApplication.status == "Pending"
    ).order_by(ProjectApplication.applied_at.asc()).all()

    result = []
    for app_rec in apps:
        emp = db.query(Employee).filter(Employee.employee_id == app_rec.employee_id, Employee.deleted_at == None).first()
        # Resolve opportunity name
        opp_name = app_rec.opportunity_id
        if app_rec.opportunity_type == "project":
            proj = db.query(Project).filter(Project.project_id == app_rec.opportunity_id).first()
            if proj:
                opp_name = proj.project_name
        else:
            role = db.query(Role).filter(Role.role_id == app_rec.opportunity_id).first()
            if role:
                opp_name = role.role_title

        result.append({
            "application_id": app_rec.application_id,
            "employee_id": app_rec.employee_id,
            "employee_name": app_rec.employee_name or (emp.name if emp else app_rec.employee_id),
            "employee_email": emp.email if emp else "",
            "employee_department": emp.department if emp else "",
            "opportunity_id": app_rec.opportunity_id,
            "opportunity_type": app_rec.opportunity_type,
            "opportunity_name": opp_name,
            "note": app_rec.note,
            "hours_per_week": app_rec.hours_per_week,
            "status": app_rec.status,
            "applied_at": app_rec.applied_at,
            "version": app_rec.version,
        })

    return {"applications_queue": result, "count": len(result)}


# ── Rebuild All & Data Freshness Endpoints ───────────────────────────────────

@app.post("/api/admin/rebuild-proficiencies")
@app.post("/api/admin/rebuild-all-projections")
@app.post("/api/rebuild-proficiencies")
@app.post("/api/recompute-all")
@app.post("/api/scoring/recompute-all")
def rebuild_all_endpoint(
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in ["HR_Admin", "Manager"]:
        raise HTTPException(status_code=403, detail="Forbidden: Only HR administrators and Managers can trigger full rebuilds.")
    return rebuild_service.rebuild_all_proficiencies(db=db, actor_id=current_user.user_id)


@app.post("/api/employees/{employee_id}/recompute")
@app.post("/api/employee/recompute")
def recompute_employee_endpoint(
    employee_id: Optional[str] = None,
    current_user: CompanyUser = Depends(get_current_user),
    employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db)
):
    target_emp_id = employee_id if (current_user.role in ["HR_Admin", "Manager"] and employee_id) else employee.employee_id
    return rebuild_service.rebuild_employee_proficiencies(db=db, employee_id=target_emp_id, actor_id=current_user.user_id)


@app.get("/api/data-version")
def data_version_endpoint(
    db: Session = Depends(get_db)
):
    return {
        "version": common.get_data_version(db, "global"),
        "scope": "global"
    }


# ── HR User Management & Audit Log Endpoints ──────────────────────────────────

@app.get("/api/pending-approvals")
def get_pending_approvals(
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "HR_Admin":
        raise HTTPException(status_code=403, detail="Only HR administrators can review pending accounts.")

    pending = db.query(CompanyUser).filter(
        CompanyUser.is_active == False,
        CompanyUser.deleted_at == None
    ).all()
    return {
        "users": [
            {
                "user_id": u.user_id,
                "name": u.name,
                "email": u.email,
                "role": u.role
            }
            for u in pending
        ]
    }


@app.post("/api/approvals/{user_id}")
def approve_pending_user(
    user_id: str,
    request: Request,
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "HR_Admin":
        raise HTTPException(status_code=403, detail="Only HR administrators can approve accounts.")

    target = db.query(CompanyUser).filter(
        CompanyUser.user_id == user_id,
        CompanyUser.is_active == False,
        CompanyUser.deleted_at == None
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Pending account not found.")

    target.is_active = True
    target.updated_at = datetime.datetime.utcnow()

    ip_addr = request.client.host if request.client else "127.0.0.1"
    common.log_audit(
        db=db,
        event_type="APPROVE_USER",
        actor_id=current_user.user_id,
        actor_email=current_user.email,
        target_id=target.user_id,
        target_email=target.email,
        ip=ip_addr,
        details="Approved by HR Admin"
    )
    common.bump_data_version(db)
    db.commit()

    return {"ok": True}


@app.post("/api/reject-approval/{user_id}")
def reject_pending_user(
    user_id: str,
    request: Request,
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "HR_Admin":
        raise HTTPException(status_code=403, detail="Only HR administrators can reject accounts.")

    target = db.query(CompanyUser).filter(
        CompanyUser.user_id == user_id,
        CompanyUser.is_active == False,
        CompanyUser.deleted_at == None
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Pending account not found.")

    target.deleted_at = datetime.datetime.utcnow()
    target.updated_at = datetime.datetime.utcnow()

    ip_addr = request.client.host if request.client else "127.0.0.1"
    common.log_audit(
        db=db,
        event_type="REJECT_USER",
        actor_id=current_user.user_id,
        actor_email=current_user.email,
        target_id=target.user_id,
        target_email=target.email,
        ip=ip_addr,
        details="Rejected by HR Admin"
    )
    common.bump_data_version(db)
    db.commit()

    return {"ok": True}


@app.post("/api/deactivate-user/{user_id}")
def deactivate_active_user(
    user_id: str,
    request: Request,
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "HR_Admin":
        raise HTTPException(status_code=403, detail="Only HR administrators can deactivate accounts.")

    if user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")

    target = db.query(CompanyUser).filter(
        CompanyUser.user_id == user_id,
        CompanyUser.is_active == True,
        CompanyUser.deleted_at == None
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Active account not found.")

    target.is_active = False
    target.updated_at = datetime.datetime.utcnow()

    ip_addr = request.client.host if request.client else "127.0.0.1"
    common.log_audit(
        db=db,
        event_type="DEACTIVATE_USER",
        actor_id=current_user.user_id,
        actor_email=current_user.email,
        target_id=target.user_id,
        target_email=target.email,
        ip=ip_addr,
        details="Deactivated by HR Admin"
    )
    common.bump_data_version(db)
    db.commit()

    return {"ok": True}


@app.get("/api/active-users")
def get_active_users(
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "HR_Admin":
        raise HTTPException(status_code=403, detail="Only HR administrators can view all users.")

    active = db.query(CompanyUser).filter(
        CompanyUser.is_active == True,
        CompanyUser.deleted_at == None
    ).all()
    return {
        "users": [
            {
                "user_id": u.user_id,
                "name": u.name,
                "email": u.email,
                "role": u.role
            }
            for u in active
        ]
    }


@app.get("/api/audit-log")
def get_audit_log(
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "HR_Admin":
        raise HTTPException(status_code=403, detail="Only HR administrators can view the audit log.")

    entries = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(100).all()
    return {
        "entries": [
            {
                "event_id": e.event_id,
                "event_type": e.event_type,
                "actor_id": e.actor_id or "",
                "actor_email": e.actor_email or "",
                "target_id": e.target_id or "",
                "target_email": e.target_email or "",
                "ip": e.ip or "",
                "timestamp": e.timestamp,
                "details": e.details or ""
            }
            for e in entries
        ]
    }


# ── Full Company Data Endpoint ────────────────────────────────────────────────

@app.get("/api/data")
def get_company_data(
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns company data constructed from the SQLite database.
    One single source of truth for all roles.
    Guarantees bit-identical score and level across all endpoints.
    """
    employees = db.query(Employee).filter(Employee.deleted_at == None).all()
    skills = db.query(Skill).filter(Skill.deleted_at == None).all()
    roles = db.query(Role).filter(Role.deleted_at == None).all()
    role_skills = db.query(RoleSkill).filter(RoleSkill.deleted_at == None).all()
    projects = db.query(Project).filter(Project.deleted_at == None).all()
    employee_projects = db.query(EmployeeProject).filter(EmployeeProject.deleted_at == None).all()
    employee_skills = db.query(EmployeeSkill).filter(EmployeeSkill.deleted_at == None).all()
    evidence_items = db.query(Evidence).filter(Evidence.deleted_at == None).all()
    certifications = db.query(Certification).filter(Certification.deleted_at == None).all()
    learning_resources = db.query(LearningResource).filter(LearningResource.deleted_at == None).all()
    upskilling_progress = db.query(UpskillingProgress).filter(UpskillingProgress.deleted_at == None).all()
    project_shortlists = db.query(ProjectShortlist).filter(ProjectShortlist.deleted_at == None).all()

    emp_scores = {e.employee_id: serializers.get_employee_score_and_level(db, e) for e in employees}

    def to_csv(headers: List[str], rows: List[List[Any]]) -> str:
        out = [",".join(headers)]
        for r in rows:
            out.append(",".join(f'"{str(val).replace(chr(34), chr(34)+chr(34))}"' for val in r))
        return "\n".join(out) + "\n"

    return {
        "employees": to_csv(
            ["employee_id", "name", "email", "title", "department", "team", "location", "manager_id", "hire_date", "availability_percent", "hours_per_week_free", "last_active_date", "current_workload_percent", "score", "level"],
            [[e.employee_id, e.name, e.email, e.title, e.department, e.team, e.location, e.manager_id or "", e.hire_date or "", e.availability_percent, e.hours_per_week_free, e.last_active_date or "", e.current_workload_percent, emp_scores[e.employee_id][0], emp_scores[e.employee_id][1]] for e in employees]
        ),
        "employee_records": [
            serializers.serialize_employee(db, e, viewer_role=current_user.role, viewer_user_id=current_user.user_id)
            for e in employees
        ],
        "data_version": common.get_data_version(db, "global"),
        "skills": to_csv(
            ["skill_id", "skill_name", "category", "domain", "synonyms", "related_skill_ids"],
            [[s.skill_id, s.skill_name, s.category, s.domain or "", s.synonyms or "", s.related_skill_ids or ""] for s in skills]
        ),
        "employeeSkills": to_csv(
            ["employee_id", "skill_id", "proficiency_level", "years_experience", "source", "verified", "last_used_date", "verification_status"],
            [[es.employee_id, es.skill_id, es.proficiency_level, es.years_experience, es.source, "true" if es.verification_status in ["Verified by HR", "Link checked"] else "false", es.last_used_date or "", es.verification_status or "Self-reported"] for es in employee_skills]
        ),
        "evidence": to_csv(
            ["evidence_id", "employee_id", "skill_id", "evidence_type", "title", "url", "weight", "date", "project_id", "project_complexity", "verification_status"],
            [[ev.evidence_id, ev.employee_id, ev.skill_id, ev.evidence_type, ev.title, ev.url or "", 1.0 if ev.verification_status in ["Verified by HR", "Link checked"] else ev.base_weight, ev.artifact_date, ev.project_id or "", ev.complexity_score, ev.verification_status or "Self-reported"] for ev in evidence_items]
        ),
        "projects": to_csv(
            ["project_id", "project_name", "domain", "complexity", "technologies", "start_date", "end_date"],
            [[p.project_id, p.project_name, p.domain, p.complexity, p.technologies or "", p.start_date or "", p.end_date or ""] for p in projects]
        ),
        "employeeProjects": to_csv(
            ["employee_id", "project_id", "role", "contribution_summary"],
            [[ep.employee_id, ep.project_id, ep.role, ep.contribution_summary or ""] for ep in employee_projects]
        ),
        "certifications": to_csv(
            ["cert_id", "employee_id", "skill_id", "cert_name", "issuer", "issued_date", "expiry_date"],
            [[c.cert_id, c.employee_id, c.skill_id or "", c.cert_name, c.issuer, c.issued_date or "", c.expiry_date or ""] for c in certifications]
        ),
        "roles": to_csv(
            ["role_id", "role_title", "department", "priority", "status", "min_availability_percent"],
            [[r.role_id, r.role_title, r.department, r.priority, r.status, r.min_availability_percent] for r in roles]
        ),
        "roleSkills": to_csv(
            ["role_id", "skill_id", "required_level", "importance"],
            [[rs.role_id, rs.skill_id, rs.required_level, rs.importance] for rs in role_skills]
        ),
        "learningResources": to_csv(
            ["resource_id", "skill_id", "title", "provider", "type", "duration_weeks", "target_level", "mentor_employee_id"],
            [[lr.resource_id, lr.skill_id, lr.title, lr.provider, lr.type, lr.duration_weeks, lr.target_level, lr.mentor_employee_id or ""] for lr in learning_resources]
        ),
        "upskillingProgress": to_csv(
            ["employee_id", "role_id", "resource_id", "status", "progress_percent", "updated_at"],
            [[up.employee_id, up.role_id, up.resource_id, up.status, up.progress_percent, up.updated_at.isoformat()[:10] if up.updated_at else ""] for up in upskilling_progress]
        ),
        "projectShortlists": to_csv(
            ["project_id", "employee_id", "shortlisted_by", "shortlisted_at", "note"],
            [[ps.project_id, ps.employee_id, ps.shortlisted_by or "", ps.shortlisted_at or "", ps.note or ""] for ps in project_shortlists]
        )
    }


# ── Health, Auth Me & Employee Notifications ─────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "healthy"}


@app.get("/api/auth/me")
def auth_me(
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    emp = db.query(Employee).filter(
        Employee.user_id == current_user.user_id,
        Employee.deleted_at == None
    ).first()
    return {
        "user_id": current_user.user_id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "employee_id": emp.employee_id if emp else None,
        "employee": {
            "id": emp.employee_id,
            "name": emp.name,
            "email": emp.email,
            "department": emp.department,
            "team": emp.team
        } if emp else None
    }


