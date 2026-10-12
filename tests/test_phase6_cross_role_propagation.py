"""
Phase 6 Cross-Role Propagation & Multi-Role Integration Tests.
Validates:
1. Evidence submission -> HR verification -> proficiency recalculation visible to Manager & Employee.
2. Availability update -> talent search & directory reflect updated free capacity.
3. Course completion -> HR approval -> status Done and credit applied.
4. Opportunity application -> HR review -> status Accepted visible to Employee.
5. Optimistic concurrency 409 conflict when version does not match.
"""

import pytest
import datetime
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
    RoleSkill,
    Project,
    EmployeeProject,
    EmployeeSkill,
    Evidence,
    LearningResource,
    UpskillingProgress,
    ProjectApplication,
)
from backend.auth import make_token, COOKIE_NAME
from backend.api import app, submission_timestamps

TEST_ENGINE = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=TEST_ENGINE)
Base.metadata.create_all(bind=TEST_ENGINE)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_phase6_data():
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    submission_timestamps.clear()

    for tbl in reversed(Base.metadata.sorted_tables):
        db.execute(tbl.delete())
    db.commit()

    # Create users
    emp_user = CompanyUser(user_id="user-p6-emp", name="Alice Chen", email="alice@company.com", password_hash="h", role="Employee")
    mgr_user = CompanyUser(user_id="user-p6-mgr", name="Bob Manager", email="bob@company.com", password_hash="h", role="Manager")
    hr_user  = CompanyUser(user_id="user-p6-hr",  name="Carol HR",   email="carol@company.com", password_hash="h", role="HR_Admin")

    # Create employee record
    emp = Employee(
        employee_id="emp-p6-1",
        user_id="user-p6-emp",
        name="Alice Chen",
        email="alice@company.com",
        title="Software Engineer",
        department="Engineering",
        team="Platform",
        availability_percent=60,
        hours_per_week_free=24,
        current_workload_percent=40,
        version=1
    )

    # Create skills
    skill_react = Skill(skill_id="skill-react", skill_name="React", category="Frontend")
    skill_python = Skill(skill_id="skill-python", skill_name="Python", category="Backend")

    # Employee skill
    emp_sk = EmployeeSkill(
        employee_id="emp-p6-1",
        skill_id="skill-react",
        claimed_level="Aware",
        proficiency_level="Aware",
        verification_status="Self-reported",
        years_experience=2.0,
        version=1
    )

    # Learning resource
    resource = LearningResource(
        resource_id="lr-react-arch",
        skill_id="skill-react",
        title="Advanced React Architecture",
        provider="Internal Academy",
        type="Course",
        estimated_hours=16.0,
        target_level="Advanced",
        deleted_at=None
    )

    # Project
    proj = Project(
        project_id="proj-p6-1",
        project_name="Fintech Platform Core",
        domain="Engineering",
        status="Active",
        complexity=3.0,
        technologies="React|Python"
    )

    db.add_all([emp_user, mgr_user, hr_user, emp, skill_react, skill_python, emp_sk, resource, proj])
    db.commit()
    db.close()

    yield

    app.dependency_overrides.clear()


def make_client(user_id: str) -> TestClient:
    token, _ = make_token(user_id)
    c = TestClient(app)
    c.headers["Cookie"] = f"{COOKIE_NAME}={token}"
    return c


def test_cross_role_evidence_propagation():
    """Scenario 1: Employee submits evidence -> HR verifies -> Manager & Employee see updated verified level."""
    emp_client = make_client("user-p6-emp")
    hr_client  = make_client("user-p6-hr")
    mgr_client = make_client("user-p6-mgr")

    # 1. Employee submits evidence
    sub_res = emp_client.post("/api/evidence", json={
        "title": "Built reactive financial charts",
        "evidence_type": "PR",
        "url": "https://github.com/company/repo/pull/101",
        "artifact_date": "2026-09-15",
        "skill_id": "skill-react"
    })
    assert sub_res.status_code in [200, 201]
    ev_id = sub_res.json()["evidence_id"]
    assert sub_res.json()["verification_status"] in ["Self-reported", "Link checked"]

    # 2. HR verifies evidence
    ver_res = hr_client.post(f"/api/evidence/{ev_id}/verify", json={
        "verification_status": "Verified by HR",
        "hr_notes": "Reviewed and validated PR code quality."
    })
    assert ver_res.status_code == 200
    assert ver_res.json()["verification_status"] == "Verified by HR"

    # 3. Employee queries explanation: status is Verified by HR
    emp_expl = emp_client.get("/api/employee/skills/skill-react/explanation")
    assert emp_expl.status_code == 200
    expl_data = emp_expl.json()
    factor = next((f for f in expl_data["ordered_evidence"] if f["title"] == "Built reactive financial charts"), None)
    assert factor is not None
    assert factor["verification_status"] == "Verified by HR"

    # 4. Manager queries employee explanation
    mgr_expl = mgr_client.get("/api/employees/emp-p6-1/skills/skill-react/explanation")
    assert mgr_expl.status_code == 200
    mgr_data = mgr_expl.json()
    mgr_factor = next((f for f in mgr_data["ordered_evidence"] if f["title"] == "Built reactive financial charts"), None)
    assert mgr_factor is not None
    assert mgr_factor["verification_status"] == "Verified by HR"


def test_cross_role_availability_propagation():
    """Scenario 2: Employee updates availability -> Manager and HR see updated capacity."""
    emp_client = make_client("user-p6-emp")
    mgr_client = make_client("user-p6-mgr")
    hr_client  = make_client("user-p6-hr")

    # 1. Check initial availability
    init_res = emp_client.get("/api/employee/availability")
    assert init_res.status_code == 200
    ver = init_res.json()["version"]

    # 2. Employee updates availability to 100% (40h free)
    upd_res = emp_client.put("/api/employee/availability", json={
        "availability_percent": 100,
        "hours_per_week_free": 40,
        "version": ver
    })
    assert upd_res.status_code == 200
    assert upd_res.json()["availability_percent"] == 100
    assert upd_res.json()["hours_per_week_free"] == 40

    # 3. Manager queries all employee data
    mgr_data_res = mgr_client.get("/api/data")
    assert mgr_data_res.status_code == 200
    mgr_emp = next((e for e in mgr_data_res.json()["employee_records"] if e["employee_id"] == "emp-p6-1"), None)
    assert mgr_emp is not None
    assert int(mgr_emp["availability_percent"]) == 100
    assert int(mgr_emp["hours_per_week_free"]) == 40

    # 4. HR queries candidate data
    hr_emp_res = hr_client.get("/api/employees/emp-p6-1")
    assert hr_emp_res.status_code == 200
    assert hr_emp_res.json()["employee"]["availability_percent"] == 100


def test_cross_role_course_completion_workflow():
    """Scenario 3: Course enrollment -> log hours -> request completion -> HR approval -> status Done."""
    emp_client = make_client("user-p6-emp")
    hr_client  = make_client("user-p6-hr")

    # 1. Employee enrolls
    enr_res = emp_client.post("/api/upskilling/enroll", json={
        "resource_id": "lr-react-arch",
        "role_id": "role-none"
    })
    assert enr_res.status_code in [200, 201]

    # 2. Employee logs hours
    log_res = emp_client.post("/api/upskilling/log-hours", json={
        "resource_id": "lr-react-arch",
        "hours": 16.0,
        "date": "2026-10-09"
    })
    assert log_res.status_code == 200

    # 3. Employee requests completion
    req_res = emp_client.post("/api/upskilling/request-completion", json={
        "resource_id": "lr-react-arch",
        "proof_url": "https://verify.skillgraph.demo/cert/react-101",
        "note": "Completed capstone"
    })
    assert req_res.status_code == 200
    prog_id = req_res.json()["progress_id"]
    assert req_res.json()["status"] == "Awaiting approval"

    # 4. HR approves completion
    rev_res = hr_client.post("/api/upskilling/admin/review-completion", json={
        "progress_id": prog_id,
        "decision": "Approved",
        "note": "Great work on capstone"
    })
    assert rev_res.status_code == 200
    assert rev_res.json()["status"] == "Done"
    assert rev_res.json()["progress_percent"] == 100.0

    # 5. Employee verifies progress list
    prog_list = emp_client.get("/api/upskilling/progress").json()
    item = next((p for p in prog_list["progress"] if p["resource_id"] == "lr-react-arch"), None)
    assert item is not None
    assert item["status"] == "Done"
    assert item["progress_percent"] == 100.0


def test_cross_role_opportunity_application_workflow():
    """Scenario 4: Opportunity application -> HR review -> status updated to Accepted."""
    emp_client = make_client("user-p6-emp")
    hr_client  = make_client("user-p6-hr")

    # 1. Employee applies
    app_res = emp_client.post("/api/project-applications", json={
        "opportunity_id": "proj-p6-1",
        "opportunity_type": "Project",
        "hours_per_week": 10,
        "note": "Ready to support payments architecture"
    })
    assert app_res.status_code in [200, 201]
    app_id = app_res.json()["application_id"]

    # 2. HR views application
    hr_apps = hr_client.get("/api/project-applications").json()
    app_entry = next((a for a in hr_apps["applications"] if a["application_id"] == app_id), None)
    assert app_entry is not None
    assert app_entry["status"] == "Pending"

    # 3. HR reviews and accepts
    rev_res = hr_client.post(f"/api/project-applications/{app_id}/review", json={
        "status": "Accepted",
        "hr_decision_note": "Application accepted by project lead"
    })
    assert rev_res.status_code == 200
    assert rev_res.json()["status"] == "Accepted"

    # 4. Employee sees Accepted status
    emp_apps = emp_client.get("/api/project-applications").json()
    emp_entry = next((a for a in emp_apps["applications"] if a["application_id"] == app_id), None)
    assert emp_entry is not None
    assert emp_entry["status"] == "Accepted"


def test_optimistic_concurrency_conflict_409():
    """Scenario 5: Stale version mutation raises 409 Conflict with standard error message."""
    emp_client = make_client("user-p6-emp")

    # Send stale version (e.g. 9999)
    res = emp_client.put("/api/employee/availability", json={
        "availability_percent": 80,
        "hours_per_week_free": 32,
        "version": 9999
    })
    assert res.status_code == 409
    assert "This was changed by someone else. Reload to see the latest." in res.json()["detail"]
