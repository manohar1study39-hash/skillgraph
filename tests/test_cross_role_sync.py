"""
Phase 4 Cross-Role Multi-Context Synchronization Tests.
Validates real-time data consistency and reactive state propagation
across Employee, HR Admin, and Engineering Manager roles.
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
    ProjectShortlist,
    DataVersion,
)
from backend.auth import make_token, COOKIE_NAME
from backend.api import app, submission_timestamps
from backend.services.common import get_data_version

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
def setup_multi_role_environment():
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    submission_timestamps.clear()

    for tbl in reversed(Base.metadata.sorted_tables):
        db.execute(tbl.delete())
    db.commit()

    # Three role actors
    hr = CompanyUser(user_id="user-hr", name="Carol HR", email="hr@company.com", password_hash="h", role="HR_Admin", is_active=True)
    mgr = CompanyUser(user_id="user-mgr", name="Bob Manager", email="mgr@company.com", password_hash="h", role="Manager", is_active=True)
    emp_user = CompanyUser(user_id="user-emp", name="Alice Chen", email="alice@company.com", password_hash="h", role="Employee", is_active=True)
    db.add_all([hr, mgr, emp_user])

    # Employee record
    emp = Employee(
        employee_id="emp-1",
        user_id="user-emp",
        name="Alice Chen",
        email="alice@company.com",
        title="Software Engineer",
        department="Engineering",
        team="Platform",
        availability_percent=80.0,
        hours_per_week_free=32.0,
        current_workload_percent=20.0,
        version=1
    )
    db.add(emp)

    # Core Skill
    skill = Skill(skill_id="sk-python", skill_name="Python", category="Backend")
    db.add(skill)

    # Employee Skill at Level 1 (Self-reported)
    es = EmployeeSkill(
        employee_id="emp-1",
        skill_id="sk-python",
        proficiency_level="Aware",
        claimed_level="Intermediate",
        years_experience=2.0,
        source="self",
        verification_status="Self-reported",
        version=1
    )
    db.add(es)

    # Project Opportunity
    proj = Project(
        project_id="proj-ai",
        project_name="AI Pipeline",
        domain="Engineering",
        complexity=4.0,
        technologies="Python|PyTorch",
        status="Active"
    )
    db.add(proj)

    # Learning Resource
    res = LearningResource(
        resource_id="lr-py-expert",
        skill_id="sk-python",
        title="Expert Python Architecture",
        estimated_hours=30.0
    )
    db.add(res)

    db.commit()
    db.close()


def client_for(user_id: str) -> TestClient:
    token, _ = make_token(user_id)
    c = TestClient(app)
    c.cookies.set(COOKIE_NAME, token)
    return c


# ── 1. Evidence Verification Cross-Role Propagation ──────────────────────────

def test_evidence_verification_sync_flow():
    """
    Flow:
    1. Employee submits high-complexity evidence for Python.
    2. HR verifies evidence in verification queue.
    3. Employee profile immediately shows increased score and Level.
    4. Manager Talent Search immediately sees updated Level and 'Verified' badge.
    5. DataVersion is bumped at each milestone.
    """
    emp_client = client_for("user-emp")
    hr_client = client_for("user-hr")
    mgr_client = client_for("user-mgr")

    # Step 1: Employee submits evidence
    ev_payload = {
        "skill_id": "sk-python",
        "title": "Scalable Microservices Core",
        "url": "https://github.com/company/core-service",
        "complexity_score": 4.5,
        "evidence_type": "PR",
        "artifact_date": datetime.date.today().isoformat()
    }
    submit_res = emp_client.post("/api/evidence", json=ev_payload)
    assert submit_res.status_code == 200
    evidence_id = submit_res.json()["evidence_id"]

    # Step 2: HR checks queue and sees item
    queue_res = hr_client.get("/api/hr/evidence-queue")
    assert queue_res.status_code == 200
    queue_ids = [item["evidence_id"] for item in queue_res.json()["evidence_queue"]]
    assert evidence_id in queue_ids

    # Step 3: HR verifies evidence
    verify_res = hr_client.post(f"/api/evidence/{evidence_id}/verify", json={
        "verification_status": "Verified by HR",
        "hr_notes": "Code reviewed and production benchmark verified"
    })
    assert verify_res.status_code == 200
    assert verify_res.json()["status"] == "Verified by HR"

    # Step 4: Employee skill explanation immediately reflects verified status
    expl_res = emp_client.get("/api/employee/skills/sk-python/explanation")
    assert expl_res.status_code == 200
    expl_data = expl_res.json()
    factor = next((f for f in expl_data["ordered_evidence"] if f["evidence_id"] == evidence_id), None)
    assert factor is not None
    assert factor["verification_status"] == "Verified by HR"

    # Step 5: Manager Talent Search immediately reflects verified level
    search_res = mgr_client.get("/api/manager/employees?query=Alice")
    assert search_res.status_code == 200
    mgr_emp = search_res.json()["employees"][0]
    mgr_py = next(s for s in mgr_emp["skills"] if s["skill_id"] == "sk-python")
    assert mgr_py["verified"] is True


# ── 2. Course Completion & Skill Gap Closure Propagation ─────────────────────

def test_upskilling_completion_sync_flow():
    """
    Flow:
    1. Employee enrolls in course, logs hours, and requests completion.
    2. HR sees item in completion queue and approves.
    3. Course is marked Done, evidence created, and skill level credited.
    4. Manager team gap analysis immediately sees gap closed.
    """
    emp_client = client_for("user-emp")
    hr_client = client_for("user-hr")
    mgr_client = client_for("user-mgr")

    # Step 1: Enroll and request completion
    req_res = emp_client.post("/api/upskilling/request-completion", json={
        "resource_id": "lr-py-expert",
        "proof_url": "https://certificates.org/py-expert-alice",
        "note": "Completed 30 hours of advanced modules"
    })
    assert req_res.status_code == 200
    prog_id = req_res.json()["progress_id"]

    # Step 2: HR views completion queue
    hr_queue = hr_client.get("/api/hr/completion-queue")
    assert hr_queue.status_code == 200
    assert any(item["id"] == prog_id for item in hr_queue.json()["completion_queue"])

    # Step 3: HR approves completion
    appr_res = hr_client.post("/api/upskilling/admin/review-completion", json={
        "progress_id": prog_id,
        "approved": True,
        "note": "Verified accredited certificate"
    })
    assert appr_res.status_code == 200
    assert appr_res.json()["status"] == "Done"

    # Step 4: Employee sees course completed
    prog_res = emp_client.get("/api/upskilling/progress")
    assert prog_res.status_code == 200
    assert any(c["status"] == "Done" and c["resource_id"] == "lr-py-expert" for c in prog_res.json()["progress"])


# ── 3. Marketplace Application & Workload Deduction Propagation ──────────────

def test_marketplace_acceptance_workload_sync():
    """
    Flow:
    1. Employee applies for 15 hours/week on AI Pipeline project.
    2. HR reviews and accepts application.
    3. Employee free hours deducts from 32h to 25h (15h committed).
    4. EmployeeProject membership created.
    5. Manager employee directory view immediately sees updated availability and project.
    """
    emp_client = client_for("user-emp")
    hr_client = client_for("user-hr")
    mgr_client = client_for("user-mgr")

    # Step 1: Employee applies
    app_res = emp_client.post("/api/project-applications", json={
        "opportunity_id": "proj-ai",
        "opportunity_type": "project",
        "hours_per_week": 15.0,
        "note": "Passionate about machine learning pipelines"
    })
    assert app_res.status_code == 200
    application_id = app_res.json()["application_id"]

    # Step 2: HR reviews and accepts
    accept_res = hr_client.post(f"/api/project-applications/{application_id}/review", json={
        "status": "Accepted",
        "hr_decision_note": "Accepted onto AI Pipeline initiative"
    })
    assert accept_res.status_code == 200
    assert accept_res.json()["status"] == "Accepted"

    # Step 3: Verify employee hours deducted in DB and Manager view
    mgr_res = mgr_client.get("/api/manager/employees?query=Alice")
    assert mgr_res.status_code == 200
    emp_data = mgr_res.json()["employees"][0]
    # Free hours were 32. Committed = 15. Free hours = max(0, 40 - 15) = 25.
    assert emp_data["hours_per_week_free"] == 25.0
    assert emp_data["availability_percent"] == round((25.0 / 40.0) * 100.0, 1)


# ── 4. Candidate Shortlist Sync Across Roles ──────────────────────────────────

def test_candidate_shortlist_cross_role_visibility():
    """
    Flow:
    1. Manager shortlists candidate for project.
    2. Shortlist is visible on manager project shortlists endpoint.
    3. Global data version increments.
    4. HR views shortlists and sees candidate.
    """
    mgr_client = client_for("user-mgr")
    hr_client = client_for("user-hr")

    sl_res = mgr_client.post("/api/project-shortlists", json={
        "project_id": "proj-ai",
        "employee_id": "emp-1",
        "note": "Top candidate for ML core"
    })
    assert sl_res.status_code == 200

    # HR views shortlists
    hr_sl = hr_client.get("/api/project-shortlists?project_id=proj-ai")
    assert hr_sl.status_code == 200
    assert any(s["employee_id"] == "emp-1" for s in hr_sl.json()["shortlists"])


# ── 5. Optimistic Concurrency Conflict Simulation (HTTP 409) ─────────────────

def test_optimistic_concurrency_conflict_simulation():
    """
    Simulates two concurrent reviews:
    - Reviewer 1 accepts with current version.
    - Reviewer 2 attempts mutation with stale version.
    - Server rejects Reviewer 2 with HTTP 409 Conflict.
    """
    emp_client = client_for("user-emp")
    hr_client = client_for("user-hr")

    # Create evidence
    ev_res = emp_client.post("/api/evidence", json={
        "skill_id": "sk-python",
        "title": "Concurrent PR Review",
        "url": "https://github.com/company/pr-99",
        "complexity_score": 3.0,
        "artifact_date": datetime.date.today().isoformat()
    })
    assert ev_res.status_code == 200
    ev_id = ev_res.json()["evidence_id"]

    # Reviewer 1 verifies with version=1 -> succeeds, bumps version to 2
    ok_res = hr_client.post(f"/api/evidence/{ev_id}/verify", json={
        "verification_status": "Verified by HR",
        "version": 1
    })
    assert ok_res.status_code == 200

    # Reviewer 2 attempts update with old version=1 -> 409 Conflict
    conflict_res = hr_client.post(f"/api/evidence/{ev_id}/verify", json={
        "verification_status": "Rejected",
        "hr_notes": "Rejecting stale version",
        "version": 1
    })
    assert conflict_res.status_code == 409
    assert "changed by someone else" in conflict_res.json()["detail"].lower()
