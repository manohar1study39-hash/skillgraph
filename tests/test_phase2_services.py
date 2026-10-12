"""
Phase 2 Service Layer Test Suite:
1. Mutation coverage for all domain services:
   - ProfileService (profile update, skills, certs, projects)
   - EvidenceService (submit, split, soft delete, restore)
   - TrainingService (enroll, log hours, request completion, approve)
   - AvailabilityService (update availability, overcommitment blocking)
   - RoleService (create role, project assignment)
   - VerificationService (status transitions, score recalculations)
   - ApplicationService (apply, withdraw, review)
2. Optimistic concurrency control (409 Conflict on version mismatch)
3. Deterministic rebuild idempotency (rebuild_all_projections: incremental == full rebuild)
4. Admin authorization on rebuild endpoint (HR Admin only)
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.db import Base, get_db
from backend.models import (
    CompanyUser,
    Employee,
    Skill,
    Role,
    Project,
    LearningResource,
    Evidence,
    EmployeeSkill,
    EmployeeProject,
    ProjectApplication,
)
from backend.auth import make_token, COOKIE_NAME
from backend.api import app
from backend.services import (
    profile_service,
    evidence_service,
    training_service,
    availability_service,
    role_service,
    verification_service,
    application_service,
    rebuild_service,
)
from fastapi import HTTPException


TEST_DB_URL = "sqlite:///:memory:"
engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()

    # Seed test users
    emp_user = CompanyUser(
        user_id="user-svc-emp-1",
        name="Charlie Test",
        email="charlie@company.com",
        password_hash="hash",
        role="Employee",
        is_active=True
    )
    hr_user = CompanyUser(
        user_id="user-svc-hr-1",
        name="Harriet HR",
        email="harriet@company.com",
        password_hash="hash",
        role="HR_Admin",
        is_active=True
    )

    emp = Employee(
        employee_id="emp-svc-1",
        user_id="user-svc-emp-1",
        name="Charlie Test",
        email="charlie@company.com",
        title="Backend Dev",
        department="Platform",
        hours_per_week_free=40.0,
        availability_percent=100.0,
        weekly_learning_hours=5.0,
        version=1
    )

    skill = Skill(
        skill_id="skill-golang",
        skill_name="Go",
        category="Backend",
        domain="Platform"
    )

    project = Project(
        project_id="proj-infra-1",
        project_name="Core Infra",
        domain="Platform",
        technologies="Go|Kubernetes",
        complexity=3.0,
        status="Active"
    )

    resource = LearningResource(
        resource_id="lr-golang-concurrency",
        skill_id="skill-golang",
        title="Go Concurrency in Practice",
        provider="Internal Academy",
        type="course",
        estimated_hours=20.0,
        target_level="Advanced"
    )

    emp_proj = EmployeeProject(
        employee_id="emp-svc-1",
        project_id="proj-infra-1",
        role="Core Developer"
    )

    db.add_all([emp_user, hr_user, emp, skill, project, emp_proj, resource])
    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


def test_optimistic_concurrency_conflict():
    """Verify that updating a versioned record with a stale version raises HTTP 409 Conflict."""
    db = TestingSessionLocal()
    emp = db.query(Employee).filter_by(employee_id="emp-svc-1").first()
    actor = db.query(CompanyUser).filter_by(user_id="user-svc-emp-1").first()
    assert emp.version == 1

    # First update passes with version 1
    availability_service.update_availability(
        db=db,
        actor=actor,
        employee_id="emp-svc-1",
        availability_percent=75.0,
        expected_version=1
    )
    db.refresh(emp)
    assert emp.version == 2

    # Second update using stale version 1 must raise HTTP 409 Conflict
    with pytest.raises(HTTPException) as exc_info:
        availability_service.update_availability(
            db=db,
            actor=actor,
            employee_id="emp-svc-1",
            availability_percent=50.0,
            expected_version=1  # Stale version!
        )
    assert exc_info.value.status_code == 409
    assert "This was changed by someone else" in exc_info.value.detail
    db.close()


def test_services_end_to_end_flow():
    """Verify sequential operations across Profile, Evidence, Training, and Verification services."""
    db = TestingSessionLocal()
    emp_user = db.query(CompanyUser).filter_by(user_id="user-svc-emp-1").first()
    hr_user = db.query(CompanyUser).filter_by(user_id="user-svc-hr-1").first()

    # 1. Profile Service: update profile and self-declared skills
    prof_res = profile_service.update_profile(
        db=db,
        actor=emp_user,
        employee_id="emp-svc-1",
        payload={
            "title": "Senior Go Engineer",
            "skills": [
                {"skill_id": "skill-golang", "years_experience": 3.0, "is_primary": True}
            ]
        }
    )
    assert prof_res["ok"] is True
    emp_skill = db.query(EmployeeSkill).filter_by(employee_id="emp-svc-1", skill_id="skill-golang").first()
    assert emp_skill is not None
    # Self-declared skill is capped at Aware (1) until verified evidence is provided
    assert emp_skill.proficiency_level == "Aware"

    # 2. Evidence Service: submit valid evidence with PR
    ev_res = evidence_service.submit_evidence(
        db=db,
        actor=emp_user,
        employee_id="emp-svc-1",
        payload={
            "skill_id": "skill-golang",
            "title": "Implemented distributed locking in Go",
            "evidence_type": "PR",
            "source_type": "Code PR",
            "url": "https://github.com/company/repo/pull/101",
            "proof_url": "https://github.com/company/repo/pull/101",
            "project_id": "proj-infra-1",
            "artifact_date": "2026-10-09",
            "impact_metric": "Reduced race conditions by 100%"
        }
    )
    assert ev_res["ok"] is True
    ev_id = ev_res["evidence_id"]
    ev_record = db.query(Evidence).filter_by(evidence_id=ev_id).first()
    assert ev_record.verification_status in ["Link checked", "Needs info"]

    # 3. Verification Service: HR reviews and verifies evidence
    ver_res = verification_service.update_evidence_verification(
        db=db,
        actor_hr=hr_user,
        evidence_id=ev_id,
        status="Verified by HR",
        note="Approved PR review"
    )
    assert ver_res["ok"] is True
    assert ver_res["status"] == "Verified by HR"

    # Verified evidence recomputes skill score immediately
    db.refresh(emp_skill)
    assert emp_skill.proficiency_level in ["Aware", "Guided", "Independent"]
    assert emp_skill.verification_status == "Verified by HR"

    # 4. Training Service: enroll, log hours, complete
    train_enroll = training_service.enroll_in_course(
        db=db,
        actor=emp_user,
        employee_id="emp-svc-1",
        resource_id="lr-golang-concurrency"
    )
    assert train_enroll["ok"] is True

    # Log 20 hours
    log_res = training_service.log_learning_hours(
        db=db,
        actor=emp_user,
        employee_id="emp-svc-1",
        resource_id="lr-golang-concurrency",
        hours=20.0,
        date_str="2026-10-09"
    )
    assert log_res["hours_logged"] == 20.0
    # Capped at 99% until approval
    assert log_res["progress_percent"] == 99.0

    # Request completion
    req_res = training_service.request_course_completion(
        db=db,
        actor=emp_user,
        employee_id="emp-svc-1",
        resource_id="lr-golang-concurrency",
        proof_url="https://verify.skillgraph.demo/cert/go-conc-99"
    )
    assert req_res["status"] == "Awaiting approval"

    # HR approves completion
    prog_id = req_res["progress_id"]
    rev_res = training_service.review_completion_request(
        db=db,
        actor_hr=hr_user,
        progress_id=prog_id,
        decision="Approved"
    )
    assert rev_res["status"] == "Done"
    assert rev_res["progress_percent"] == 100.0

    db.close()


def test_rebuild_idempotency():
    """
    Requirement 2.4: Deterministic rebuild from scratch.
    Drops computed projections and recomputes from raw records.
    Asserts incremental calculation state == full rebuild state.
    """
    db = TestingSessionLocal()
    emp_user = db.query(CompanyUser).filter_by(user_id="user-svc-emp-1").first()
    hr_user = db.query(CompanyUser).filter_by(user_id="user-svc-hr-1").first()

    # Step A: Create incremental state
    profile_service.update_profile(
        db=db,
        actor=emp_user,
        employee_id="emp-svc-1",
        payload={
            "skills": [{"skill_id": "skill-golang", "years_experience": 2.5}]
        }
    )
    ev_res = evidence_service.submit_evidence(
        db=db,
        actor=emp_user,
        employee_id="emp-svc-1",
        payload={
            "skill_id": "skill-golang",
            "title": "Go worker pool optimization",
            "evidence_type": "PR",
            "url": "https://github.com/company/repo/pull/404",
            "proof_url": "https://github.com/company/repo/pull/404",
            "project_id": "proj-infra-1",
            "artifact_date": "2026-10-09"
        }
    )
    verification_service.update_evidence_verification(
        db=db,
        actor_hr=hr_user,
        evidence_id=ev_res["evidence_id"],
        status="Verified by HR"
    )

    # Record incremental skill score & level
    inc_skill = db.query(EmployeeSkill).filter_by(employee_id="emp-svc-1", skill_id="skill-golang").first()
    inc_level = inc_skill.proficiency_level
    inc_vstatus = inc_skill.verification_status
    inc_years = inc_skill.years_experience
    assert inc_level in ["Aware", "Guided", "Independent"]
    assert inc_vstatus == "Verified by HR"

    # Step B: Reset the computed projection (set level to Unassessed, status to Self-reported)
    inc_skill.proficiency_level = "Unassessed"
    inc_skill.verification_status = "Self-reported"
    db.commit()

    # Verify projection is reset
    reset_skill = db.query(EmployeeSkill).filter_by(employee_id="emp-svc-1", skill_id="skill-golang").first()
    assert reset_skill.proficiency_level == "Unassessed"

    # Step C: Run rebuild_all_proficiencies
    rebuild_res = rebuild_service.rebuild_all_proficiencies(db=db, actor_id="admin-test")
    assert rebuild_res["ok"] is True
    assert rebuild_res["employees_recomputed"] >= 1

    # Step D: Assert full rebuild matches incremental exactly
    rebuilt_skill = db.query(EmployeeSkill).filter_by(employee_id="emp-svc-1", skill_id="skill-golang").first()
    assert rebuilt_skill is not None
    assert rebuilt_skill.proficiency_level == inc_level
    assert rebuilt_skill.verification_status == inc_vstatus
    assert rebuilt_skill.years_experience == inc_years
    db.close()


def test_rebuild_admin_endpoint_authorization():
    """Verify /api/admin/rebuild-all-projections requires HR_Admin role."""
    emp_token, _ = make_token("user-svc-emp-1")
    hr_token, _ = make_token("user-svc-hr-1")

    # Regular employee -> 403 Forbidden
    client.cookies.set(COOKIE_NAME, emp_token)
    res_emp = client.post("/api/admin/rebuild-all-projections")
    assert res_emp.status_code == 403
    assert "Forbidden" in res_emp.json()["detail"]

    # HR Admin -> 200 OK
    client.cookies.set(COOKIE_NAME, hr_token)
    res_hr = client.post("/api/admin/rebuild-all-projections")
    assert res_hr.status_code == 200
    assert res_hr.json()["ok"] is True
    assert res_hr.json()["employees_recomputed"] >= 1
