"""
Admin Rebuild All Service.
Provides idempotent, deterministic full rebuild of all employee proficiencies
matching incremental updates exactly.
Supports company-wide full rebuilds and single-employee on-demand recalculations.
"""

from typing import Dict, Any, List
from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.models import Employee, EmployeeSkill
from backend.services.common import recompute_employee_skills, bump_data_version, log_audit


def rebuild_all_proficiencies(db: Session, actor_id: str = "system") -> Dict[str, Any]:
    """
    Deterministically recalculates skill proficiencies for every active employee from raw evidence.
    Guarantees incremental == full rebuild.
    """
    employees = db.query(Employee).filter(Employee.deleted_at == None).all()
    total_skills_updated = 0
    all_summaries: List[Dict[str, Any]] = []

    for emp in employees:
        summaries = recompute_employee_skills(db, emp.employee_id)
        total_skills_updated += len(summaries)
        all_summaries.extend(summaries)
        bump_data_version(db, emp.employee_id)

    # Compute company-wide level distribution
    level_counts: Dict[str, int] = {}
    verified_count = 0
    active_skills = db.query(EmployeeSkill).filter(EmployeeSkill.deleted_at == None).all()
    for es in active_skills:
        lvl = es.proficiency_level or "Unassessed"
        level_counts[lvl] = level_counts.get(lvl, 0) + 1
        if es.verification_status in ["Verified by HR", "Link checked"]:
            verified_count += 1

    new_version = bump_data_version(db)
    log_audit(
        db=db,
        event_type="PROFICIENCY_FULL_REBUILD",
        actor_id=actor_id,
        details=f"Full rebuild complete: {len(employees)} employees, {total_skills_updated} skills recomputed ({verified_count} verified)"
    )
    db.commit()

    return {
        "ok": True,
        "employees_recomputed": len(employees),
        "skills_recomputed": total_skills_updated,
        "level_distribution": level_counts,
        "verified_skills_count": verified_count,
        "data_version": new_version
    }


def rebuild_employee_proficiencies(db: Session, employee_id: str, actor_id: str = "system") -> Dict[str, Any]:
    """
    Deterministically recalculates skill proficiencies for a single employee on demand.
    """
    emp = db.query(Employee).filter(Employee.employee_id == employee_id, Employee.deleted_at == None).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")

    summaries = recompute_employee_skills(db, emp.employee_id)
    new_version = bump_data_version(db, employee_id)
    log_audit(
        db=db,
        event_type="PROFICIENCY_EMPLOYEE_REBUILD",
        actor_id=actor_id,
        target_id=employee_id,
        details=f"Rebuilt proficiencies for {emp.name}: {len(summaries)} skills recomputed"
    )
    db.commit()

    return {
        "ok": True,
        "employee_id": employee_id,
        "employee_name": emp.name,
        "skills_recomputed": len(summaries),
        "summaries": summaries,
        "data_version": new_version
    }


if __name__ == "__main__":
    from backend.db import SessionLocal
    db = SessionLocal()
    try:
        res = rebuild_all_proficiencies(db, actor_id="cli-admin")
        print(f"Rebuild completed successfully: {res}")
    finally:
        db.close()
