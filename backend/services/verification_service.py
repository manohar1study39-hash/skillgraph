"""
Domain service for HR Evidence Verification and Status Management.
Handles state transitions: Verified by HR, Rejected, Needs info, Link checked.
Immediately recomputes employee level, bumps data versions, and records audit logs.
Supports single and bulk verification with transactional guarantees.
"""

from typing import Dict, List, Any, Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.models import (
    CompanyUser,
    Evidence,
)
from backend.services.common import (
    bump_data_version,
    log_audit,
    check_optimistic_concurrency,
    recompute_employee_skills,
)


def verify_evidence_status(
    db: Session,
    actor_hr: CompanyUser,
    evidence_id: str,
    verification_status: Optional[str] = None,
    status: Optional[str] = None,
    hr_notes: Optional[str] = None,
    note: Optional[str] = None,
    expected_version: Optional[int] = None
) -> Dict[str, Any]:
    """
    HR administrator updates evidence verification status and notes in a single atomic transaction.
    Immediately recalculates the employee's proficiency level.
    """
    target_status = verification_status or status
    clean_notes = hr_notes or note
    if not target_status:
        raise HTTPException(status_code=400, detail="verification_status is required.")
    if actor_hr.role != "HR_Admin":
        raise HTTPException(status_code=403, detail="Forbidden: Only HR administrators can verify or reject evidence.")

    valid_statuses = ["Verified by HR", "Rejected", "Needs info", "Link checked", "Self-reported"]
    if target_status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid verification status: '{target_status}'. Allowed: {', '.join(valid_statuses)}"
        )

    if target_status in ["Rejected", "Needs info"]:
        if not clean_notes or len(clean_notes.strip()) < 3:
            raise HTTPException(
                status_code=422,
                detail=f"An explanatory note (minimum 3 characters) is required when setting status to '{target_status}'."
            )

    evidence = db.query(Evidence).filter(
        Evidence.evidence_id == evidence_id,
        Evidence.deleted_at == None
    ).first()

    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence item not found.")

    check_optimistic_concurrency(evidence, expected_version=expected_version)

    old_status = evidence.verification_status
    evidence.verification_status = target_status
    if target_status in ["Verified by HR", "Link checked"]:
        evidence.base_weight = max(1.0, float(evidence.base_weight or 1.0))
    if clean_notes is not None:
        evidence.hr_notes = clean_notes.strip()
    evidence.version = (evidence.version or 1) + 1

    # Recompute employee proficiency for affected skill
    before_after = recompute_employee_skills(db, evidence.employee_id, [evidence.skill_id])

    event_type = "EVIDENCE_VERIFIED" if target_status == "Verified by HR" else (
        "EVIDENCE_REJECTED" if target_status == "Rejected" else "EVIDENCE_STATUS_CHANGED"
    )

    log_audit(
        db=db,
        event_type=event_type,
        actor_id=actor_hr.user_id,
        actor_email=actor_hr.email,
        target_id=evidence.employee_id,
        details=f"HR changed evidence {evidence_id} status from '{old_status}' to '{target_status}'" + (f" (Note: {clean_notes})" if clean_notes else "")
    )

    new_version = bump_data_version(db, evidence.employee_id)
    db.commit()

    return {
        "ok": True,
        "evidence_id": evidence.evidence_id,
        "status": evidence.verification_status,
        "verification_status": evidence.verification_status,
        "hr_notes": evidence.hr_notes,
        "version": evidence.version,
        "before_after": before_after,
        "data_version": new_version
    }


def bulk_verify_evidence(
    db: Session,
    actor_hr: CompanyUser,
    items: Optional[List[Dict[str, Any]]] = None,
    evidence_ids: Optional[List[str]] = None,
    verify_all_pending: bool = False,
    default_status: str = "Verified by HR",
    default_notes: Optional[str] = "Bulk verified by HR"
) -> Dict[str, Any]:
    """
    Bulk updates evidence verification statuses in a single atomic transaction.
    Recomputes proficiency levels for all affected employees at once.
    """
    if actor_hr.role != "HR_Admin":
        raise HTTPException(status_code=403, detail="Forbidden: Only HR administrators can verify evidence in bulk.")

    targets_to_update: List[Dict[str, Any]] = []

    if verify_all_pending:
        pending_records = db.query(Evidence).filter(
            Evidence.deleted_at == None,
            Evidence.verification_status.in_(["Self-reported", "Link checked", "Needs info"])
        ).all()
        for rec in pending_records:
            targets_to_update.append({
                "evidence_id": rec.evidence_id,
                "verification_status": default_status,
                "hr_notes": default_notes,
            })
    elif items:
        for it in items:
            eid = it.get("evidence_id") or it.get("evidenceId") or it.get("id")
            v_status = it.get("verification_status") or it.get("status") or default_status
            notes = it.get("hr_notes") or it.get("note") or it.get("notes") or default_notes
            if eid:
                targets_to_update.append({
                    "evidence_id": eid,
                    "verification_status": v_status,
                    "hr_notes": notes
                })
    elif evidence_ids:
        for eid in evidence_ids:
            if eid:
                targets_to_update.append({
                    "evidence_id": eid,
                    "verification_status": default_status,
                    "hr_notes": default_notes
                })

    if not targets_to_update:
        return {
            "ok": True,
            "message": "No evidence items found to update.",
            "count": 0,
            "updated_ids": [],
            "affected_employees": [],
            "data_version": bump_data_version(db)
        }

    valid_statuses = {"Verified by HR", "Rejected", "Needs info", "Link checked", "Self-reported"}
    updated_ids: List[str] = []
    affected_emp_skills: Dict[str, set] = {}

    for t in targets_to_update:
        eid = t["evidence_id"]
        v_status = t["verification_status"]
        if v_status not in valid_statuses:
            v_status = "Verified by HR"
        notes = t.get("hr_notes") or ""

        evidence = db.query(Evidence).filter(
            Evidence.evidence_id == eid,
            Evidence.deleted_at == None
        ).first()

        if not evidence:
            continue

        evidence.verification_status = v_status
        if v_status in ["Verified by HR", "Link checked"]:
            evidence.base_weight = max(1.0, float(evidence.base_weight or 1.0))
        if notes:
            evidence.hr_notes = notes.strip()
        evidence.version = (evidence.version or 1) + 1
        updated_ids.append(eid)

        if evidence.employee_id not in affected_emp_skills:
            affected_emp_skills[evidence.employee_id] = set()
        affected_emp_skills[evidence.employee_id].add(evidence.skill_id)

    # Recompute skills for each affected employee
    all_before_after: List[Dict[str, Any]] = []
    for emp_id, sk_set in affected_emp_skills.items():
        summaries = recompute_employee_skills(db, emp_id, list(sk_set))
        all_before_after.extend(summaries)
        bump_data_version(db, emp_id)

    log_audit(
        db=db,
        event_type="EVIDENCE_BULK_VERIFIED",
        actor_id=actor_hr.user_id,
        actor_email=actor_hr.email,
        details=f"Bulk updated {len(updated_ids)} evidence artifacts across {len(affected_emp_skills)} employees"
    )

    new_version = bump_data_version(db)
    db.commit()

    return {
        "ok": True,
        "count": len(updated_ids),
        "updated_ids": updated_ids,
        "affected_employees": list(affected_emp_skills.keys()),
        "before_after": all_before_after,
        "data_version": new_version
    }


update_evidence_verification = verify_evidence_status
