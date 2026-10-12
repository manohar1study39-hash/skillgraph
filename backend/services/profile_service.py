"""
Domain service for Employee Profile management.
Handles profile edits, self-declared skills, project affiliations,
certifications, optimistic concurrency, and transactional versioning.
"""

import os
import time
import datetime
from typing import Dict, List, Any, Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.models import (
    CompanyUser,
    Employee,
    EmployeeSkill,
    EmployeeProject,
    Project,
    Certification,
)
from backend.services.common import (
    bump_data_version,
    log_audit,
    check_optimistic_concurrency,
    recompute_employee_skills,
    get_employee_display_label,
)


def update_employee_profile(
    db: Session,
    actor: CompanyUser,
    employee_id: str,
    payload: Dict[str, Any],
    expected_version: Optional[int] = None
) -> Dict[str, Any]:
    """
    Atomically updates employee profile in a single database transaction.
    Enforces authorization: employees can only edit their own profile; HR can edit any.
    """
    employee = db.query(Employee).filter(
        Employee.employee_id == employee_id,
        Employee.deleted_at == None
    ).first()

    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found.")

    # Authorization check
    if actor.role != "HR_Admin":
        actor_emp = db.query(Employee).filter(
            Employee.user_id == actor.user_id,
            Employee.deleted_at == None
        ).first()
        if not actor_emp or actor_emp.employee_id != employee_id:
            raise HTTPException(status_code=403, detail="Forbidden: You can only edit your own profile.")

    # Optimistic concurrency check
    check_optimistic_concurrency(employee, expected_version=expected_version)

    # 1. Update personal details
    if "name" in payload and payload["name"]:
        employee.name = str(payload["name"]).strip()
    if "title" in payload and payload["title"]:
        employee.title = str(payload["title"]).strip()
    if "department" in payload and payload["department"]:
        employee.department = str(payload["department"]).strip()
    if "team" in payload and payload["team"]:
        employee.team = str(payload["team"]).strip()
    if "location" in payload and payload["location"]:
        employee.location = str(payload["location"]).strip()

    # 2. Update availability / workload if passed
    if "availabilityPercent" in payload and payload["availabilityPercent"] is not None:
        avail = max(0.0, min(100.0, float(payload["availabilityPercent"])))
        employee.availability_percent = avail
        employee.current_workload_percent = max(0.0, 100.0 - avail)
    elif "availability_percent" in payload and payload["availability_percent"] is not None:
        avail = max(0.0, min(100.0, float(payload["availability_percent"])))
        employee.availability_percent = avail
        employee.current_workload_percent = max(0.0, 100.0 - avail)

    if "hoursPerWeekFree" in payload and payload["hoursPerWeekFree"] is not None:
        employee.hours_per_week_free = max(0.0, min(60.0, float(payload["hoursPerWeekFree"])))
    elif "hours_per_week_free" in payload and payload["hours_per_week_free"] is not None:
        employee.hours_per_week_free = max(0.0, min(60.0, float(payload["hours_per_week_free"])))

    employee.last_active_date = datetime.date.today().isoformat()
    employee.updated_at = datetime.datetime.utcnow()
    employee.version = (employee.version or 1) + 1

    affected_skill_ids = set()

    # 3. Update self-declared skills if provided
    skills_input = payload.get("skills")
    if isinstance(skills_input, list):
        for s in skills_input:
            sk_id = s.get("skillId") or s.get("skill_id")
            if not sk_id:
                continue
            affected_skill_ids.add(sk_id)
            existing_skill = db.query(EmployeeSkill).filter(
                EmployeeSkill.employee_id == employee_id,
                EmployeeSkill.skill_id == sk_id,
                EmployeeSkill.deleted_at == None
            ).first()

            claimed = s.get("level") or s.get("proficiency_level") or "Intermediate"
            years = float(s.get("yearsExperience") or s.get("years_experience") or 1.0)

            if existing_skill:
                existing_skill.claimed_level = claimed
                existing_skill.years_experience = years
                existing_skill.source = "self"
                existing_skill.updated_at = datetime.datetime.utcnow()
                existing_skill.version = (existing_skill.version or 1) + 1
            else:
                new_skill = EmployeeSkill(
                    employee_id=employee_id,
                    skill_id=sk_id,
                    proficiency_level="Aware",  # Capped at Aware until evidenced
                    claimed_level=claimed,
                    years_experience=years,
                    source="self",
                    verification_status="Self-reported",
                    last_used_date=datetime.date.today().isoformat(),
                    version=1
                )
                db.add(new_skill)
        db.flush()

    # 4. Update top projects if provided
    projects_input = payload.get("topProjects") or payload.get("top_projects")
    if isinstance(projects_input, list):
        for p_name in projects_input:
            if not p_name or not isinstance(p_name, str):
                continue
            p_name = p_name.strip()
            # Find matching project
            proj = db.query(Project).filter(
                (Project.project_name.ilike(p_name)) | (Project.project_id == p_name),
                Project.deleted_at == None
            ).first()
            if proj:
                existing_ep = db.query(EmployeeProject).filter(
                    EmployeeProject.employee_id == employee_id,
                    EmployeeProject.project_id == proj.project_id,
                    EmployeeProject.deleted_at == None
                ).first()
                if not existing_ep:
                    new_ep = EmployeeProject(
                        employee_id=employee_id,
                        project_id=proj.project_id,
                        role="Contributor",
                        contribution_summary=f"Key contributor to {proj.project_name}"
                    )
                    db.add(new_ep)

    # 5. Update certifications if provided
    certs_input = payload.get("certifications")
    if isinstance(certs_input, list):
        for i, c_item in enumerate(certs_input):
            c_name = c_item if isinstance(c_item, str) else c_item.get("cert_name") or c_item.get("name")
            if not c_name or not isinstance(c_name, str):
                continue
            c_name = c_name.strip()
            existing_c = db.query(Certification).filter(
                Certification.employee_id == employee_id,
                Certification.cert_name.ilike(c_name),
                Certification.deleted_at == None
            ).first()
            if not existing_c:
                cert_id = f"cert-{employee_id[:8]}-{int(time.time() * 1000)}-{os.urandom(3).hex()}-{i}"
                new_cert = Certification(
                    cert_id=cert_id,
                    employee_id=employee_id,
                    cert_name=c_name,
                    issuer="Professional Certification",
                    issued_date=datetime.date.today().isoformat(),
                    expiry_date=(datetime.date.today() + datetime.timedelta(days=730)).isoformat()
                )
                db.add(new_cert)

    # 6. Recompute affected skills (deterministic engine enforces self-declared cap <= Level 1)
    if affected_skill_ids:
        recompute_employee_skills(db, employee_id, list(affected_skill_ids))

    # 7. Write audit log
    log_audit(
        db=db,
        event_type="PROFILE_UPDATED",
        actor_id=actor.user_id,
        actor_email=actor.email,
        target_id=employee_id,
        target_email=employee.email,
        details=f"Updated profile fields for {employee.name}"
    )

    # 8. Bump data versions
    new_version = bump_data_version(db, employee_id)

    # Commit single transaction
    db.commit()
    db.refresh(employee)

    return {
        "ok": True,
        "employee_id": employee.employee_id,
        "name": employee.name,
        "display_label": get_employee_display_label(employee, db=db),
        "title": employee.title,
        "department": employee.department,
        "team": employee.team,
        "location": employee.location,
        "availability_percent": employee.availability_percent,
        "hours_per_week_free": employee.hours_per_week_free,
        "version": employee.version,
        "data_version": new_version,
        "updated_at": employee.updated_at.isoformat() if employee.updated_at else None
    }


update_profile = update_employee_profile

