"""
Domain service for Project and Role Applications and Shortlists.
Enforces capacity checks, state transitions (preserving withdrawal history),
HR decision workflow, optimistic concurrency, and transactional audit trails.
"""

import os
import logging
import time
import datetime
from typing import Dict, Any, Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session

logger = logging.getLogger("skillgraph.application_service")


def sync_applications_csv(db: Session):
    try:
        csv_path = os.path.join(os.getcwd(), "data", "project_applications.csv")
        apps = db.query(ProjectApplication).filter(ProjectApplication.deleted_at == None).all()
        lines = ["application_id,opportunity_id,opportunity_type,employee_id,employee_name,note,hours_per_week,applied_at,status"]
        for a in apps:
            esc = lambda v: f'"{str(v if v is not None else "").replace(chr(34), chr(34)+chr(34))}"'
            row = [
                esc(a.application_id),
                esc(a.opportunity_id),
                esc(a.opportunity_type),
                esc(a.employee_id),
                esc(a.employee_name),
                esc(a.note),
                esc(a.hours_per_week),
                esc(a.applied_at),
                esc(a.status)
            ]
            lines.append(",".join(row))
        with open(csv_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    except Exception as e:
        logger.warning(f"Failed to sync project_applications.csv: {e}")

from backend.models import (
    CompanyUser,
    Employee,
    ProjectApplication,
    ProjectShortlist,
    EmployeeProject,
    Project,
    Evidence,
    Skill,
    RoleSkill,
)
from backend.services.common import (
    bump_data_version,
    log_audit,
    check_optimistic_concurrency,
    recompute_employee_skills,
)
from backend.services.availability_service import get_employee_committed_hours


def apply_for_opportunity(
    db: Session,
    actor: CompanyUser,
    employee_id: str,
    opportunity_id: str,
    opportunity_type: str = "project",
    hours_per_week: float = 10.0,
    note: Optional[str] = None
) -> Dict[str, Any]:
    """
    Submits application for a project or role opportunity within capacity limits.
    """
    employee = db.query(Employee).filter(
        Employee.employee_id == employee_id,
        Employee.deleted_at == None
    ).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found.")

    if actor.role != "HR_Admin":
        actor_emp = db.query(Employee).filter(Employee.user_id == actor.user_id).first()
        if not actor_emp or actor_emp.employee_id != employee_id:
            raise HTTPException(status_code=403, detail="Forbidden: You can only submit applications for yourself.")

    req_hours = max(1.0, float(hours_per_week))
    committed = get_employee_committed_hours(db, employee_id)

    if committed + req_hours > 40.0:
        raise HTTPException(
            status_code=400,
            detail=f"Overcommitment error: You have {committed}h currently committed. Requesting {req_hours}h would exceed total capacity of 40h/wk."
        )

    clean_note = note.strip() if note else ""
    if clean_note and len(clean_note) < 10:
        raise HTTPException(status_code=400, detail="Pitch note must be at least 10 characters long.")

    existing = db.query(ProjectApplication).filter(
        ProjectApplication.employee_id == employee_id,
        ProjectApplication.opportunity_id == opportunity_id
    ).first()

    if existing:
        if existing.status == "Withdrawn" or existing.deleted_at is not None:
            existing.status = "Pending"
            existing.deleted_at = None
            existing.hours_per_week = req_hours
            existing.note = clean_note
            existing.applied_at = datetime.date.today().isoformat()
            existing.updated_at = datetime.datetime.utcnow()
            existing.version = (existing.version or 1) + 1
            app_id = existing.application_id
        else:
            raise HTTPException(status_code=400, detail="You already have an active application for this opportunity.")
    else:
        app_id = f"app-{employee_id[:8]}-{int(time.time() * 1000)}"
        new_app = ProjectApplication(
            application_id=app_id,
            opportunity_id=opportunity_id,
            opportunity_type=opportunity_type,
            employee_id=employee_id,
            employee_name=employee.name,
            note=clean_note,
            hours_per_week=req_hours,
            applied_at=datetime.date.today().isoformat(),
            status="Pending",
            version=1
        )
        db.add(new_app)

    log_audit(
        db=db,
        event_type="APPLICATION_SUBMITTED",
        actor_id=actor.user_id,
        actor_email=actor.email,
        target_id=employee_id,
        details=f"Applied to {opportunity_type} {opportunity_id} ({req_hours}h/wk)"
    )

    new_version = bump_data_version(db, employee_id)
    db.commit()
    sync_applications_csv(db)

    return {
        "ok": True,
        "application_id": app_id,
        "status": "Pending",
        "opportunity_id": opportunity_id,
        "hours_per_week": req_hours,
        "data_version": new_version
    }


def withdraw_application(
    db: Session,
    actor: CompanyUser,
    employee_id: str,
    application_id_or_opp_id: str,
    delete_record: bool = False
) -> Dict[str, Any]:
    """
    Transitions application status to 'Withdrawn' while preserving audit history.
    If delete_record is True, sets deleted_at to permanently withdraw from active views.
    """
    app = db.query(ProjectApplication).filter(
        (ProjectApplication.application_id == application_id_or_opp_id) |
        ((ProjectApplication.employee_id == employee_id) & (ProjectApplication.opportunity_id == application_id_or_opp_id)),
        ProjectApplication.deleted_at == None
    ).first()

    if not app:
        raise HTTPException(status_code=404, detail="Active application not found.")

    if actor.role != "HR_Admin":
        actor_emp = db.query(Employee).filter(Employee.user_id == actor.user_id).first()
        if not actor_emp or actor_emp.employee_id != app.employee_id:
            raise HTTPException(status_code=403, detail="Forbidden: You cannot withdraw another employee's application.")

    was_accepted = (app.status == "Accepted")
    app.status = "Withdrawn"
    if delete_record:
        app.deleted_at = datetime.datetime.utcnow()
    app.updated_at = datetime.datetime.utcnow()
    app.version = (app.version or 1) + 1

    emp = db.query(Employee).filter(Employee.employee_id == app.employee_id).first()
    if emp and was_accepted:
        emp.hours_per_week_free = min(40.0, (emp.hours_per_week_free or 0.0) + (app.hours_per_week or 0.0))
        emp.availability_percent = round((emp.hours_per_week_free / 40.0) * 100.0, 1)
        emp.current_workload_percent = round(100.0 - emp.availability_percent, 1)
        emp.version = (emp.version or 1) + 1

    log_audit(
        db=db,
        event_type="APPLICATION_WITHDRAWN",
        actor_id=actor.user_id,
        actor_email=actor.email,
        target_id=app.employee_id,
        details=f"Withdrew application {app.application_id} for {app.opportunity_id}"
    )

    new_version = bump_data_version(db, app.employee_id)
    db.commit()
    sync_applications_csv(db)

    return {
        "ok": True,
        "application_id": app.application_id,
        "status": "Withdrawn",
        "data_version": new_version
    }


def review_application(
    db: Session,
    actor_hr: CompanyUser,
    application_id: str,
    status: str,
    hr_decision_note: Optional[str] = None,
    expected_version: Optional[int] = None
) -> Dict[str, Any]:
    """
    HR administrator updates application decision status.
    If Accepted on a project gig, creates EmployeeProject membership assignment.
    """
    if actor_hr.role != "HR_Admin":
        raise HTTPException(status_code=403, detail="Forbidden: Only HR administrators can review applications.")

    valid_statuses = ["Pending", "Shortlisted", "Accepted", "Rejected", "Withdrawn", "Filled"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

    app = db.query(ProjectApplication).filter(
        ProjectApplication.application_id == application_id,
        ProjectApplication.deleted_at == None
    ).first()

    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    check_optimistic_concurrency(app, expected_version=expected_version)

    emp = db.query(Employee).filter(Employee.employee_id == app.employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")

    if status == "Accepted":
        req_hours = float(app.hours_per_week or 0.0)
        if req_hours > 0 and (emp.hours_per_week_free or 0.0) < req_hours:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot accept application: candidate only has {emp.hours_per_week_free} free hours/week, but this opportunity requires {req_hours} hours/week."
            )

    try:
        app.status = status
        if hr_decision_note:
            app.hr_decision_note = hr_decision_note.strip()
        app.updated_at = datetime.datetime.utcnow()
        app.version = (app.version or 1) + 1

        # If Accepted on a project opportunity, create project assignment
        if status == "Accepted":
            if app.opportunity_type == "project":
                existing_membership = db.query(EmployeeProject).filter(
                    EmployeeProject.employee_id == app.employee_id,
                    EmployeeProject.project_id == app.opportunity_id,
                    EmployeeProject.deleted_at == None
                ).first()

                proj = db.query(Project).filter(Project.project_id == app.opportunity_id).first()
                p_name = proj.project_name if proj else app.opportunity_id
                if not existing_membership:
                    new_membership = EmployeeProject(
                        employee_id=app.employee_id,
                        project_id=app.opportunity_id,
                        role="Contributor",
                        contribution_summary=f"Accepted via marketplace application for {p_name}"
                    )
                    db.add(new_membership)

                # Create verified project evidence for related skills and recompute
                if proj and proj.technologies:
                    tech_names = [t.strip().lower() for t in proj.technologies.split("|") if t.strip()]
                    all_skills = db.query(Skill).filter(Skill.deleted_at == None).all()
                    matched_skill_ids = []
                    for s in all_skills:
                        s_name = s.skill_name.lower()
                        syns = [syn.strip().lower() for syn in (s.synonyms or "").split("|")]
                        if s_name in tech_names or any(syn in tech_names for syn in syns):
                            matched_skill_ids.append(s.skill_id)

                    for sk_id in matched_skill_ids:
                        ev_id = f"ev-app-{app.application_id}-{sk_id}"
                        existing_ev = db.query(Evidence).filter(
                            Evidence.employee_id == app.employee_id,
                            Evidence.evidence_id == ev_id
                        ).first()
                        if not existing_ev:
                            db.add(Evidence(
                                evidence_id=ev_id,
                                employee_id=app.employee_id,
                                skill_id=sk_id,
                                project_id=proj.project_id,
                                evidence_type="project",
                                title=f"Project Assignment: {p_name}",
                                url="",
                                artifact_date=datetime.date.today().isoformat(),
                                base_weight=1.0,
                                complexity_score=float(proj.complexity or 3.0),
                                verification_status="Verified by HR",
                                hr_notes=f"Accepted onto project {p_name}",
                                version=1
                            ))

                    if matched_skill_ids:
                        db.flush()
                        recompute_employee_skills(db, app.employee_id, matched_skill_ids)

            committed = get_employee_committed_hours(db, app.employee_id)
            emp.hours_per_week_free = max(0.0, 40.0 - committed)
            emp.availability_percent = round((emp.hours_per_week_free / 40.0) * 100.0, 1)
            emp.current_workload_percent = round(100.0 - emp.availability_percent, 1)
            emp.version = (emp.version or 1) + 1

        log_audit(
            db=db,
            event_type="APPLICATION_REVIEWED",
            actor_id=actor_hr.user_id,
            actor_email=actor_hr.email,
            target_id=app.employee_id,
            details=f"HR updated application {application_id} to status '{status}'"
        )

        new_version = bump_data_version(db, app.employee_id)
        db.commit()
        sync_applications_csv(db)

        return {
            "ok": True,
            "application_id": app.application_id,
            "status": app.status,
            "hr_decision_note": app.hr_decision_note,
            "version": app.version,
            "data_version": new_version
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to review application: {exc}")


def shortlist_candidate(
    db: Session,
    actor: CompanyUser,
    project_id: str,
    employee_id: str,
    note: Optional[str] = None
) -> Dict[str, Any]:
    """
    Shortlists a candidate for a project or role.
    """
    if actor.role not in ["HR_Admin", "Manager"]:
        raise HTTPException(status_code=403, detail="Forbidden: Only HR and Managers can shortlist candidates.")

    clean_p_id = project_id
    while clean_p_id.startswith("role-role-"):
        clean_p_id = clean_p_id[5:]
    if clean_p_id.startswith("role-proj-"):
        clean_p_id = clean_p_id[5:]

    existing = db.query(ProjectShortlist).filter(
        (ProjectShortlist.project_id.in_([project_id, clean_p_id])),
        ProjectShortlist.employee_id == employee_id
    ).first()

    if existing:
        existing.project_id = clean_p_id
        existing.deleted_at = None
        if note:
            existing.note = note.strip()
    else:
        new_sl = ProjectShortlist(
            project_id=clean_p_id,
            employee_id=employee_id,
            shortlisted_by=actor.name,
            shortlisted_at=datetime.date.today().isoformat(),
            note=note.strip() if note else None
        )
        db.add(new_sl)

    log_audit(
        db=db,
        event_type="CANDIDATE_SHORTLISTED",
        actor_id=actor.user_id,
        actor_email=actor.email,
        target_id=employee_id,
        details=f"Shortlisted employee {employee_id} for project {project_id}"
    )

    new_version = bump_data_version(db, employee_id)
    db.commit()

    return {
        "ok": True,
        "project_id": clean_p_id,
        "employee_id": employee_id,
        "data_version": new_version
    }


def remove_candidate_shortlist(
    db: Session,
    actor: CompanyUser,
    project_id: str,
    employee_id: str
) -> Dict[str, Any]:
    """
    Removes candidate from project shortlist.
    """
    if actor.role not in ["HR_Admin", "Manager"]:
        raise HTTPException(status_code=403, detail="Forbidden: Only HR and Managers can modify shortlists.")

    clean_p_id = project_id
    while clean_p_id.startswith("role-role-"):
        clean_p_id = clean_p_id[5:]
    if clean_p_id.startswith("role-proj-"):
        clean_p_id = clean_p_id[5:]

    sl = db.query(ProjectShortlist).filter(
        ProjectShortlist.project_id.in_([project_id, clean_p_id, f"role-{clean_p_id}"]),
        ProjectShortlist.employee_id == employee_id,
        ProjectShortlist.deleted_at == None
    ).first()

    if sl:
        sl.deleted_at = datetime.datetime.utcnow()

    log_audit(
        db=db,
        event_type="CANDIDATE_UNSHORTLISTED",
        actor_id=actor.user_id,
        actor_email=actor.email,
        target_id=employee_id,
        details=f"Removed shortlist for employee {employee_id} on project {project_id}"
    )

    new_version = bump_data_version(db, employee_id)
    db.commit()

    return {
        "ok": True,
        "project_id": clean_p_id,
        "employee_id": employee_id,
        "data_version": new_version
    }
