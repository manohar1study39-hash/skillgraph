"""
Domain service for Roles, Projects, Project Membership, and Employee creation.
Replaces CSV mutations in vite.config.ts with pure SQLite transactional operations.
"""

import os
import time
import datetime
from typing import Dict, Any, Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.models import (
    CompanyUser,
    Employee,
    Role,
    RoleSkill,
    Project,
    EmployeeProject,
    EmployeeSkill,
    Skill,
)
from backend.services.common import (
    bump_data_version,
    log_audit,
    check_optimistic_concurrency,
)


def create_or_update_role(
    db: Session,
    actor_hr: CompanyUser,
    payload: Dict[str, Any],
    expected_version: Optional[int] = None
) -> Dict[str, Any]:
    """
    Creates or updates a career role and required skill targets.
    """
    if actor_hr.role != "HR_Admin":
        raise HTTPException(status_code=403, detail="Forbidden: Only HR administrators can create or edit roles.")

    role_id = payload.get("role_id") or f"role-{int(time.time() * 1000)}-{os.urandom(3).hex()}"
    role = db.query(Role).filter(Role.role_id == role_id, Role.deleted_at == None).first()

    if role:
        check_optimistic_concurrency(role, expected_version=expected_version)
        if "role_title" in payload:
            role.role_title = payload["role_title"]
        if "department" in payload:
            role.department = payload["department"]
        if "priority" in payload:
            role.priority = payload["priority"]
        if "status" in payload:
            role.status = payload["status"]
        if "min_availability_percent" in payload:
            role.min_availability_percent = float(payload["min_availability_percent"])
        if "description" in payload:
            role.description = payload["description"]
    else:
        role = Role(
            role_id=role_id,
            role_title=payload.get("role_title", "New Role"),
            department=payload.get("department", "Engineering"),
            priority=payload.get("priority", "Normal"),
            status=payload.get("status", "Open"),
            min_availability_percent=float(payload.get("min_availability_percent", 40.0)),
            description=payload.get("description", "")
        )
        db.add(role)

    # Required skills
    skills_input = payload.get("required_skills")
    if isinstance(skills_input, list):
        for s in skills_input:
            sk_id = s.get("skill_id")
            if not sk_id:
                continue
            req_lvl = s.get("required_level", "Advanced")
            importance = s.get("importance", "Must")
            existing_rs = db.query(RoleSkill).filter(
                RoleSkill.role_id == role_id,
                RoleSkill.skill_id == sk_id,
                RoleSkill.deleted_at == None
            ).first()
            if existing_rs:
                existing_rs.required_level = req_lvl
                existing_rs.importance = importance
            else:
                new_rs = RoleSkill(
                    role_id=role_id,
                    skill_id=sk_id,
                    required_level=req_lvl,
                    importance=importance
                )
                db.add(new_rs)

    log_audit(
        db=db,
        event_type="ROLE_UPDATED",
        actor_id=actor_hr.user_id,
        actor_email=actor_hr.email,
        details=f"Updated role {role.role_title} ({role.role_id})"
    )

    new_version = bump_data_version(db)
    db.commit()

    return {
        "ok": True,
        "role_id": role.role_id,
        "role_title": role.role_title,
        "status": role.status,
        "data_version": new_version
    }


def create_or_update_project(
    db: Session,
    actor: CompanyUser,
    payload: Dict[str, Any],
    expected_version: Optional[int] = None
) -> Dict[str, Any]:
    """
    Creates or updates an initiative project and required staffing positions.
    """
    if actor.role not in ["HR_Admin", "Manager"]:
        raise HTTPException(status_code=403, detail="Forbidden: Only HR and Managers can manage projects.")

    project_id = payload.get("project_id") or f"proj-{int(time.time() * 1000)}-{os.urandom(3).hex()}"
    project = db.query(Project).filter(Project.project_id == project_id, Project.deleted_at == None).first()

    name = str(payload.get("project_name", "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="Project name is required.")

    if project:
        check_optimistic_concurrency(project, expected_version=expected_version)
        project.project_name = name
        if "domain" in payload:
            project.domain = payload["domain"]
        if "complexity" in payload:
            project.complexity = float(payload["complexity"])
        if "technologies" in payload:
            project.technologies = payload["technologies"]
        if "status" in payload:
            project.status = payload["status"]
    else:
        project = Project(
            project_id=project_id,
            project_name=name,
            domain=payload.get("domain", "Engineering"),
            complexity=float(payload.get("complexity", 3.0)),
            technologies=payload.get("technologies", ""),
            start_date=payload.get("start_date") or datetime.date.today().isoformat(),
            end_date=payload.get("end_date"),
            status=payload.get("status", "Active")
        )
        db.add(project)

    log_audit(
        db=db,
        event_type="PROJECT_SAVED",
        actor_id=actor.user_id,
        actor_email=actor.email,
        details=f"Saved project {project.project_name} ({project.project_id})"
    )

    new_version = bump_data_version(db)
    db.commit()

    return {
        "ok": True,
        "project_id": project.project_id,
        "project_name": project.project_name,
        "data_version": new_version
    }


def assign_project_member(
    db: Session,
    actor: CompanyUser,
    project_id: str,
    employee_id: str,
    role: str = "Contributor",
    contribution_summary: Optional[str] = None
) -> Dict[str, Any]:
    """
    Assigns an employee as a member of a project or role opportunity.
    """
    if actor.role not in ["HR_Admin", "Manager"]:
        raise HTTPException(status_code=403, detail="Forbidden: Only HR and Managers can assign project members.")

    # Clean redundant prefixes from opportunity ID
    clean_p_id = project_id
    while clean_p_id.startswith("role-role-"):
        clean_p_id = clean_p_id[5:]
    if clean_p_id.startswith("role-proj-"):
        clean_p_id = clean_p_id[5:]

    proj = db.query(Project).filter(
        (Project.project_id == project_id) | (Project.project_id == clean_p_id),
        Project.deleted_at == None
    ).first()

    if not proj:
        # Check if project_id references an open Role
        alt_role_id = clean_p_id[5:] if clean_p_id.startswith("role-") else clean_p_id
        role_obj = db.query(Role).filter(
            (Role.role_id == clean_p_id) | (Role.role_id == project_id) |
            (Role.role_id == f"role-{clean_p_id}") | (Role.role_id == alt_role_id),
            Role.deleted_at == None
        ).first()

        if role_obj:
            resolved_p_id = clean_p_id
            proj = db.query(Project).filter(Project.project_id == resolved_p_id).first()
            if not proj:
                proj = Project(
                    project_id=resolved_p_id,
                    project_name=role_obj.role_title,
                    domain=role_obj.department,
                    complexity=3.0,
                    status="Active"
                )
                db.add(proj)
                db.flush()
            elif proj.deleted_at is not None:
                proj.deleted_at = None
                db.flush()
        else:
            raise HTTPException(status_code=404, detail="Project or opportunity not found.")

    emp = db.query(Employee).filter(Employee.employee_id == employee_id, Employee.deleted_at == None).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")

    membership = db.query(EmployeeProject).filter(
        (EmployeeProject.project_id == proj.project_id) | (EmployeeProject.project_id == project_id),
        EmployeeProject.employee_id == employee_id
    ).first()

    summary_text = contribution_summary.strip() if contribution_summary else f"Assigned to {proj.project_name}"

    if membership:
        membership.project_id = proj.project_id
        membership.role = role.strip() or "Contributor"
        membership.contribution_summary = summary_text
        membership.deleted_at = None
    else:
        membership = EmployeeProject(
            project_id=proj.project_id,
            employee_id=employee_id,
            role=role.strip() or "Contributor",
            contribution_summary=summary_text
        )
        db.add(membership)

    log_audit(
        db=db,
        event_type="PROJECT_MEMBER_ASSIGNED",
        actor_id=actor.user_id,
        actor_email=actor.email,
        target_id=employee_id,
        details=f"Assigned {emp.name} to {proj.project_name} as {role}"
    )

    new_version = bump_data_version(db, employee_id)
    db.commit()

    return {
        "ok": True,
        "project_id": proj.project_id,
        "employee_id": employee_id,
        "role": membership.role,
        "data_version": new_version
    }


def remove_project_member(
    db: Session,
    actor: CompanyUser,
    project_id: str,
    employee_id: str
) -> Dict[str, Any]:
    """
    Removes employee assignment from project or role opportunity.
    """
    if actor.role not in ["HR_Admin", "Manager"]:
        raise HTTPException(status_code=403, detail="Forbidden: Only HR and Managers can remove project members.")

    clean_p_id = project_id
    while clean_p_id.startswith("role-role-"):
        clean_p_id = clean_p_id[5:]
    if clean_p_id.startswith("role-proj-"):
        clean_p_id = clean_p_id[5:]

    alt_p_id = clean_p_id[5:] if clean_p_id.startswith("role-") else f"role-{clean_p_id}"
    membership = db.query(EmployeeProject).filter(
        EmployeeProject.project_id.in_([project_id, clean_p_id, alt_p_id, f"role-{clean_p_id}"]),
        EmployeeProject.employee_id == employee_id,
        EmployeeProject.deleted_at == None
    ).first()

    if membership:
        membership.deleted_at = datetime.datetime.utcnow()

    log_audit(
        db=db,
        event_type="PROJECT_MEMBER_REMOVED",
        actor_id=actor.user_id,
        actor_email=actor.email,
        target_id=employee_id,
        details=f"Removed employee {employee_id} from project {project_id}"
    )

    new_version = bump_data_version(db, employee_id)
    db.commit()

    return {
        "ok": True,
        "project_id": project_id,
        "employee_id": employee_id,
        "data_version": new_version
    }


def create_directory_employee(
    db: Session,
    actor: CompanyUser,
    payload: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Creates a new employee record and optional company user account in SQLite.
    Guarantees strict HR_Admin authorization, safe number conversions, and atomic writes.
    """
    if actor.role != "HR_Admin":
        raise HTTPException(status_code=403, detail="Forbidden: Only HR administrators can add new employees.")

    name = str(payload.get("name", "")).strip()
    email = str(payload.get("email", "")).strip().lower()
    if not name or not email:
        raise HTTPException(status_code=400, detail="Name and email are required.")

    # Check duplicate email
    existing_emp = db.query(Employee).filter(Employee.email == email, Employee.deleted_at == None).first()
    if existing_emp:
        raise HTTPException(status_code=400, detail="An employee with this email already exists.")

    emp_id = f"emp-{int(time.time() * 1000)}-{os.urandom(3).hex()}"
    raw_avail = payload.get("availability_percent")
    try:
        avail = max(0.0, min(100.0, float(raw_avail))) if raw_avail is not None else 80.0
    except (TypeError, ValueError):
        avail = 80.0

    raw_free = payload.get("hours_per_week_free")
    try:
        free_hours = max(0.0, min(60.0, float(raw_free))) if raw_free is not None else round(avail * 0.4)
    except (TypeError, ValueError):
        free_hours = round(avail * 0.4)

    try:
        employee = Employee(
            employee_id=emp_id,
            name=name,
            email=email,
            title=payload.get("title", "Software Engineer"),
            department=payload.get("department", "Engineering"),
            team=payload.get("team", "Core Platform"),
            location=payload.get("location", "Remote"),
            availability_percent=avail,
            hours_per_week_free=free_hours,
            current_workload_percent=max(0.0, 100.0 - avail),
            hire_date=datetime.date.today().isoformat(),
            last_active_date=datetime.date.today().isoformat(),
            version=1
        )
        db.add(employee)

        # Initial declared skills
        skills_input = payload.get("skills")
        if isinstance(skills_input, list):
            for s in skills_input:
                sk_id = s.get("skill_id")
                if not sk_id:
                    continue
                lvl = s.get("proficiency_level", "Intermediate")
                es = EmployeeSkill(
                    employee_id=emp_id,
                    skill_id=sk_id,
                    proficiency_level="Aware",
                    claimed_level=lvl,
                    years_experience=1.0,
                    source="self",
                    verification_status="Self-reported",
                    last_used_date=datetime.date.today().isoformat(),
                    version=1
                )
                db.add(es)

        log_audit(
            db=db,
            event_type="EMPLOYEE_CREATED",
            actor_id=actor.user_id,
            actor_email=actor.email,
            target_id=emp_id,
            target_email=email,
            details=f"Created employee {name} ({email})"
        )

        new_version = bump_data_version(db, emp_id)
        db.commit()

        return {
            "ok": True,
            "employee_id": emp_id,
            "name": name,
            "email": email,
            "data_version": new_version
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create employee: {str(exc)}")
