"""
Domain service for Employee Availability and Workload management.
Calculates committed hours across accepted and pending opportunities,
enforces work capacity limits, and manages optimistic concurrency.
"""

import datetime
from typing import Dict, Any, Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.models import (
    CompanyUser,
    Employee,
    ProjectApplication,
)
from backend.services.common import (
    bump_data_version,
    log_audit,
    check_optimistic_concurrency,
)


def get_employee_committed_hours(db: Session, employee_id: str) -> float:
    """Calculates active committed hours across pending, shortlisted, and accepted applications."""
    active_apps = db.query(ProjectApplication).filter(
        ProjectApplication.employee_id == employee_id,
        ProjectApplication.status.in_(["Pending", "Shortlisted", "Accepted"]),
        ProjectApplication.deleted_at == None
    ).all()
    return sum(float(a.hours_per_week or 0.0) for a in active_apps)


def update_availability(
    db: Session,
    actor: CompanyUser,
    employee_id: str,
    availability_percent: float,
    hours_per_week_free: Optional[float] = None,
    available_from: Optional[str] = None,
    expected_version: Optional[int] = None
) -> Dict[str, Any]:
    """
    Atomically updates availability and free hours within capacity constraints.
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
            raise HTTPException(status_code=403, detail="Forbidden: You can only update your own availability.")

    check_optimistic_concurrency(employee, expected_version=expected_version)

    committed = get_employee_committed_hours(db, employee_id)
    max_free = max(0.0, 40.0 - committed)

    if hours_per_week_free is not None:
        free_hours = max(0.0, float(hours_per_week_free))
        if free_hours > max_free:
            raise HTTPException(
                status_code=400,
                detail=f"Overcommitment error: Requested free hours ({free_hours}h) exceeds available capacity ({max_free}h). You have {committed}h currently committed to active projects/roles."
            )
        avail = round((free_hours / 40.0) * 100.0, 1)
    else:
        avail = max(0.0, min(100.0, float(availability_percent if availability_percent is not None else 100.0)))
        free_hours = min(max_free, round((avail / 100.0) * 40.0, 1))

    employee.availability_percent = round(avail, 1)
    employee.hours_per_week_free = round(free_hours, 1)
    employee.current_workload_percent = round(max(0.0, min(100.0, 100.0 - avail)), 1)
    if available_from:
        employee.available_from = available_from
    employee.last_active_date = datetime.date.today().isoformat()
    employee.updated_at = datetime.datetime.utcnow()
    employee.version = (employee.version or 1) + 1

    log_audit(
        db=db,
        event_type="AVAILABILITY_UPDATED",
        actor_id=actor.user_id,
        actor_email=actor.email,
        target_id=employee_id,
        details=f"Availability: {avail}%, Free hours: {free_hours}h, Committed: {committed}h"
    )

    new_version = bump_data_version(db, employee_id)
    db.commit()
    db.refresh(employee)

    return {
        "ok": True,
        "total_hours_baseline": 40.0,
        "availability_percent": employee.availability_percent,
        "hours_per_week_free": employee.hours_per_week_free,
        "current_workload_percent": employee.current_workload_percent,
        "committed_hours": round(committed, 1),
        "max_free_hours": round(max_free, 1),
        "version": employee.version,
        "data_version": new_version
    }
