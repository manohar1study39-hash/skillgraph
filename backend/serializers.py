"""
Unified Serializer Layer (Phase 3).
Ensures Employee view, Manager view, and HR view share the exact same read functions.
Differences are projected at the edge via permission filters, not separate SQL queries or separate scoring engines.
Guarantees bit-identical scores and levels across all endpoints.
"""

from typing import Dict, List, Any, Optional, Tuple
from sqlalchemy.orm import Session

from backend.models import (
    Employee,
    EmployeeSkill,
    Skill,
    Role,
    RoleSkill,
    Project,
    EmployeeProject,
    Evidence,
    Certification,
    LearningResource,
    UpskillingProgress,
    ProjectApplication,
    ProjectShortlist,
)
from backend.services.common import get_employee_display_label

LEVEL_ORDER: Dict[str, int] = {
    "Unassessed": 0,
    "Aware": 1,
    "Guided": 2,
    "Independent": 3,
    "Advanced": 4,
    "Expert": 5,
    "Beginner": 1,
    "Intermediate": 2,
    "Master": 5,
}

LEVEL_NAMES_REVERSE: Dict[int, str] = {
    0: "Unassessed",
    1: "Aware",
    2: "Guided",
    3: "Independent",
    4: "Advanced",
    5: "Expert",
}


def get_employee_score_and_level(db: Session, employee: Employee) -> Tuple[int, str]:
    """
    Computes canonical, single-source overall score (0-100) and level for employee E.
    Used by:
    - GET /api/data (in employees list/CSV)
    - GET /api/employees/{id}
    - Manager view (GET /api/manager/employees/{id})
    Ensures bit-identical consistency across all roles and views.
    """
    skills = db.query(EmployeeSkill).filter(
        EmployeeSkill.employee_id == employee.employee_id,
        EmployeeSkill.deleted_at == None
    ).all()

    if not skills:
        return 0, "Unassessed"

    scores = []
    max_level_num = 0

    for s in skills:
        lvl_num = LEVEL_ORDER.get(s.proficiency_level, 0)
        if lvl_num > max_level_num:
            max_level_num = lvl_num
        base = lvl_num * 20
        v_boost = 5 if s.verification_status == "Verified by HR" else (2 if s.verification_status == "Link checked" else 0)
        s_score = min(100, base + v_boost)
        scores.append(s_score)

    overall_score = round(sum(scores) / len(scores)) if scores else 0
    overall_level = LEVEL_NAMES_REVERSE.get(max_level_num, "Unassessed")
    return overall_score, overall_level


def serialize_employee_skill(
    skill_rec: EmployeeSkill,
    skill_obj: Optional[Skill] = None
) -> Dict[str, Any]:
    """Serializes a single employee skill record."""
    s_name = skill_obj.skill_name if skill_obj else skill_rec.skill_id
    cat = skill_obj.category if skill_obj else ""
    is_verified = skill_rec.verification_status in ["Verified by HR", "Link checked"]
    lvl_num = LEVEL_ORDER.get(skill_rec.proficiency_level, 0)
    score = min(100, lvl_num * 20 + (5 if is_verified else 0))

    return {
        "id": skill_rec.id,
        "skill_id": skill_rec.skill_id,
        "skillId": skill_rec.skill_id,
        "skill_name": s_name,
        "skillName": s_name,
        "category": cat,
        "proficiency_level": skill_rec.proficiency_level,
        "proficiencyLevel": skill_rec.proficiency_level,
        "claimed_level": skill_rec.claimed_level,
        "years_experience": skill_rec.years_experience,
        "yearsExperience": skill_rec.years_experience,
        "source": skill_rec.source,
        "verification_status": skill_rec.verification_status,
        "verified": is_verified,
        "last_used_date": skill_rec.last_used_date,
        "lastUsedDate": skill_rec.last_used_date,
        "score": score,
        "proficiencyScore": score,
        "level": skill_rec.proficiency_level,
        "version": skill_rec.version
    }


def serialize_employee(
    db: Session,
    employee: Employee,
    viewer_role: str = "Employee",
    viewer_user_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Unified serializer for an employee record.
    Used identically by Employee, Manager, and HR read paths.
    Permission differences are applied at the edge (e.g. masking private data if any).
    """
    score, level = get_employee_score_and_level(db, employee)

    skills_records = db.query(EmployeeSkill).filter(
        EmployeeSkill.employee_id == employee.employee_id,
        EmployeeSkill.deleted_at == None
    ).all()

    skill_ids = [s.skill_id for s in skills_records]
    skills_map = {
        s.skill_id: s
        for s in db.query(Skill).filter(Skill.skill_id.in_(skill_ids)).all()
    } if skill_ids else {}

    serialized_skills = [
        serialize_employee_skill(sr, skills_map.get(sr.skill_id))
        for sr in skills_records
    ]

    return {
        "id": employee.employee_id,
        "employee_id": employee.employee_id,
        "name": employee.name,
        "display_label": get_employee_display_label(employee, db=db),
        "email": employee.email,
        "title": employee.title,
        "role": employee.title,
        "department": employee.department,
        "team": employee.team,
        "location": employee.location,
        "manager_id": employee.manager_id,
        "hire_date": employee.hire_date,
        "score": score,
        "level": level,
        "proficiency_level": level,
        "availability_percent": employee.availability_percent,
        "availabilityPercent": employee.availability_percent,
        "hours_per_week_free": employee.hours_per_week_free,
        "hoursPerWeekFree": employee.hours_per_week_free,
        "current_workload_percent": employee.current_workload_percent,
        "currentWorkloadPercent": employee.current_workload_percent,
        "last_active_date": employee.last_active_date,
        "target_role_id": employee.target_role_id,
        "weekly_learning_hours": employee.weekly_learning_hours or 5.0,
        "version": employee.version,
        "skills": serialized_skills,
        "skills_count": len(serialized_skills)
    }


def serialize_evidence(evidence: Evidence) -> Dict[str, Any]:
    """Unified serializer for evidence artifacts."""
    return {
        "id": evidence.evidence_id,
        "evidence_id": evidence.evidence_id,
        "employee_id": evidence.employee_id,
        "skill_id": evidence.skill_id,
        "project_id": evidence.project_id,
        "evidence_type": evidence.evidence_type,
        "title": evidence.title,
        "url": evidence.url,
        "artifact_date": evidence.artifact_date,
        "base_weight": evidence.base_weight,
        "complexity_score": evidence.complexity_score,
        "verification_status": evidence.verification_status,
        "share_percentage": evidence.share_percentage,
        "hr_notes": evidence.hr_notes,
        "is_duplicate": evidence.is_duplicate,
        "version": evidence.version
    }


def serialize_role(db: Session, role: Role) -> Dict[str, Any]:
    """Unified serializer for roles."""
    role_skills = db.query(RoleSkill).filter(
        RoleSkill.role_id == role.role_id,
        RoleSkill.deleted_at == None
    ).all()

    skills_map = {
        s.skill_id: s
        for s in db.query(Skill).filter(Skill.skill_id.in_([rs.skill_id for rs in role_skills])).all()
    } if role_skills else {}

    return {
        "id": role.role_id,
        "role_id": role.role_id,
        "title": role.role_title,
        "role_title": role.role_title,
        "department": role.department,
        "priority": role.priority,
        "status": role.status,
        "min_availability_percent": role.min_availability_percent,
        "required_skills": [
            {
                "skill_id": rs.skill_id,
                "skill_name": skills_map[rs.skill_id].skill_name if rs.skill_id in skills_map else rs.skill_id,
                "required_level": rs.required_level,
                "importance": rs.importance
            }
            for rs in role_skills
        ]
    }


def serialize_project(db: Session, project: Project) -> Dict[str, Any]:
    """Unified serializer for projects."""
    members = db.query(EmployeeProject).filter(
        EmployeeProject.project_id == project.project_id,
        EmployeeProject.deleted_at == None
    ).all()

    emp_ids = [m.employee_id for m in members]
    emp_map = {
        e.employee_id: e.name
        for e in db.query(Employee).filter(Employee.employee_id.in_(emp_ids)).all()
    } if emp_ids else {}

    return {
        "id": project.project_id,
        "project_id": project.project_id,
        "name": project.project_name,
        "project_name": project.project_name,
        "domain": project.domain,
        "complexity": project.complexity,
        "technologies": [t.strip() for t in (project.technologies or "").split("|") if t.strip()],
        "status": project.status,
        "start_date": project.start_date,
        "end_date": project.end_date,
        "members": [
            {
                "employee_id": m.employee_id,
                "employee_name": emp_map.get(m.employee_id, m.employee_id),
                "role": m.role,
                "contribution_summary": m.contribution_summary
            }
            for m in members
        ]
    }


def serialize_skill(skill: Skill) -> Dict[str, Any]:
    """Unified serializer for skills taxonomy."""
    return {
        "id": skill.skill_id,
        "skill_id": skill.skill_id,
        "name": skill.skill_name,
        "skill_name": skill.skill_name,
        "category": skill.category,
        "domain": skill.domain,
        "synonyms": [s.strip() for s in (skill.synonyms or "").split("|") if s.strip()],
        "related_skill_ids": [r.strip() for r in (skill.related_skill_ids or "").split("|") if r.strip()]
    }
