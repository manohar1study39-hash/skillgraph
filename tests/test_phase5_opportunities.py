"""
Phase 5 Availability, Ambition & Opportunities Test Suite.
Tests:
1. Workload calculation & availability update (baseline 40h/week)
2. Availability overcommit prevention (committed + free > 40)
3. Ambition target role persistence & deterministic gap analysis
4. Opportunity deterministic level matching (100% exact/above, 50% 1-below, 0% 2+-below)
5. Availability factor penalty on opportunities
6. Application submission & overcommit prevention
7. Duplicate application prevention & reactivation after withdrawal
8. Capacity restoration upon withdrawal of accepted application
9. HR review decision (Accepting commits capacity & creates EmployeeProject)
10. Cross-user isolation (403 when employee A touches employee B's applications)
"""

import os
import datetime
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
    RoleSkill,
    Project,
    EmployeeProject,
    EmployeeSkill,
    LearningResource,
    ProjectApplication,
    AuditLog,
)
from backend.auth import make_token, COOKIE_NAME
from backend.api import app


# In-memory shared SQLite engine for tests
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

    # Seed test users and employees
    user1 = CompanyUser(
        user_id="user-emp-1",
        name="Alice Developer",
        email="alice@company.com",
        password_hash="hash",
        role="Employee",
        is_active=True
    )
    emp1 = Employee(
        employee_id="emp-1",
        user_id="user-emp-1",
        name="Alice Developer",
        email="alice@company.com",
        title="Software Engineer",
        department="Engineering",
        availability_percent=75.0,
        hours_per_week_free=30.0,
        weekly_learning_hours=5.0
    )

    user2 = CompanyUser(
        user_id="user-emp-2",
        name="Bob Architect",
        email="bob@company.com",
        password_hash="hash",
        role="Employee",
        is_active=True
    )
    emp2 = Employee(
        employee_id="emp-2",
        user_id="user-emp-2",
        name="Bob Architect",
        email="bob@company.com",
        title="Solutions Architect",
        department="Engineering",
        availability_percent=50.0,
        hours_per_week_free=20.0,
        weekly_learning_hours=4.0
    )

    hr_user = CompanyUser(
        user_id="user-hr-1",
        name="Helen HR",
        email="hr@company.com",
        password_hash="hash",
        role="HR_Admin",
        is_active=True
    )

    # Seed skills
    s_py = Skill(skill_id="skill-python", skill_name="Python", category="Backend")
    s_fastapi = Skill(skill_id="skill-fastapi", skill_name="FastAPI", category="Backend")
    s_react = Skill(skill_id="skill-react", skill_name="React", category="Frontend")
    s_k8s = Skill(skill_id="skill-k8s", skill_name="Kubernetes", category="DevOps")

    # Seed employee skills for emp-1:
    # Python: Advanced (4)
    # FastAPI: Guided (2)
    # React: Unassessed (0)
    es1 = EmployeeSkill(employee_id="emp-1", skill_id="skill-python", proficiency_level="Advanced")
    es2 = EmployeeSkill(employee_id="emp-1", skill_id="skill-fastapi", proficiency_level="Guided")

    # Seed roles
    role_lead = Role(
        role_id="role-backend-lead",
        role_title="Backend Technical Lead",
        department="Engineering",
        status="Open",
        min_availability_percent=50.0,
        description="Leading backend microservices architecture"
    )
    # Role requires:
    # Python: Advanced (4) -> emp-1 meets (1.0)
    # FastAPI: Independent (3) -> emp-1 is Guided (2), so 1 level below (0.5)
    # Kubernetes: Guided (2) -> emp-1 is 0, so gap (0.0)
    rs1 = RoleSkill(role_id="role-backend-lead", skill_id="skill-python", required_level="Advanced", importance="Must")
    rs2 = RoleSkill(role_id="role-backend-lead", skill_id="skill-fastapi", required_level="Independent", importance="Must")
    rs3 = RoleSkill(role_id="role-backend-lead", skill_id="skill-k8s", required_level="Guided", importance="Nice")

    # Seed projects
    proj1 = Project(
        project_id="proj-ai-agent",
        project_name="Autonomous AI Agent",
        domain="Engineering",
        complexity=3.0, # requires Independent (3)
        technologies="Python|FastAPI",
        status="Active"
    )

    # Seed learning resources
    lr1 = LearningResource(
        resource_id="lr-fastapi-mastery",
        skill_id="skill-fastapi",
        title="FastAPI Mastery",
        provider="Internal Academy",
        type="course",
        estimated_hours=15.0
    )
    lr2 = LearningResource(
        resource_id="lr-k8s-fundamentals",
        skill_id="skill-k8s",
        title="K8s Fundamentals",
        provider="Internal Academy",
        type="course",
        estimated_hours=20.0
    )

    db.add_all([
        user1, emp1, user2, emp2, hr_user,
        s_py, s_fastapi, s_react, s_k8s,
        es1, es2,
        role_lead, rs1, rs2, rs3,
        proj1,
        lr1, lr2
    ])
    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


def test_workload_and_availability_update():
    """Tests GET and PUT availability endpoints with baseline 40h calculation."""
    token, _ = make_token("user-emp-1")
    client.cookies.set(COOKIE_NAME, token)

    # GET availability
    res = client.get("/api/employee/availability")
    assert res.status_code == 200
    data = res.json()
    assert data["employee_id"] == "emp-1"
    assert data["total_hours_baseline"] == 40.0
    assert data["committed_hours"] == 0.0
    assert data["max_free_hours"] == 40.0
    assert data["hours_per_week_free"] == 30.0

    # PUT update availability to 25h free
    res_put = client.put("/api/employee/availability", json={"hours_per_week_free": 25.0})
    assert res_put.status_code == 200
    put_data = res_put.json()
    assert put_data["ok"] is True
    assert put_data["hours_per_week_free"] == 25.0
    assert put_data["availability_percent"] == 62.5
    assert put_data["current_workload_percent"] == 37.5


def test_availability_overcommit_blocked():
    """Tests that employee cannot set free hours exceeding 40 - committed."""
    token, _ = make_token("user-emp-1")
    client.cookies.set(COOKIE_NAME, token)

    db = TestingSessionLocal()
    # Add an accepted application with 25h/week commitment
    app_rec = ProjectApplication(
        application_id="app-test-committed",
        opportunity_id="proj-ai-agent",
        opportunity_type="project",
        employee_id="emp-1",
        employee_name="Alice Developer",
        hours_per_week=25.0,
        applied_at="2026-10-09",
        status="Accepted"
    )
    db.add(app_rec)
    db.commit()
    db.close()

    # Now committed = 25h, max free = 15h.
    # Trying to set free hours to 20h should fail (25 + 20 = 45 > 40)
    res = client.put("/api/employee/availability", json={"hours_per_week_free": 20.0})
    assert res.status_code == 400
    assert "Overcommitment error" in res.json()["detail"]

    # Setting free hours to 15h should succeed
    res_ok = client.put("/api/employee/availability", json={"hours_per_week_free": 15.0})
    assert res_ok.status_code == 200
    assert res_ok.json()["hours_per_week_free"] == 15.0


def test_ambition_persistence_and_gap_analysis():
    """Tests saving target ambition role and live gap calculation."""
    token, _ = make_token("user-emp-1")
    client.cookies.set(COOKIE_NAME, token)

    # Set ambition to role-backend-lead
    res = client.put("/api/employee/ambition", json={"target_role_id": "role-backend-lead"})
    assert res.status_code == 200
    data = res.json()
    assert data["target_role_id"] == "role-backend-lead"
    assert data["target_role"]["role_title"] == "Backend Technical Lead"

    # Check deterministic match:
    # Python: req Advanced (4), emp Advanced (4) -> credit 1.0 (Meets)
    # FastAPI: req Independent (3), emp Guided (2) -> credit 0.5 (1 Level Below)
    # Kubernetes: req Guided (2), emp Unassessed (0) -> credit 0.0 (Gap)
    # Total credit = 1.0 + 0.5 + 0.0 = 1.5 out of 3 skills = 50%
    assert data["readiness_percent"] == 50
    assert len(data["gaps"]) == 2  # FastAPI and K8s
    assert data["weekly_learning_hours"] == 5.0
    # Gap courses total hours: FastAPI (15h) + K8s (20h) = 35h
    assert data["total_gap_hours"] == 35.0
    # Estimated weeks: 35 / 5 = 7.0 weeks
    assert data["estimated_weeks"] == 7.0

    # Setting invalid role returns 404
    res_invalid = client.put("/api/employee/ambition", json={"target_role_id": "role-non-existent"})
    assert res_invalid.status_code == 404


def test_opportunity_level_matching_and_breakdown():
    """Tests opportunity matching rules (100% exact/above, 50% 1-below, 0% 2+-below)."""
    token, _ = make_token("user-emp-1")
    client.cookies.set(COOKIE_NAME, token)

    res = client.get("/api/opportunities")
    assert res.status_code == 200
    opps = res.json()["opportunities"]
    assert len(opps) >= 2

    # Find project proj-ai-agent (complexity 3.0 -> req Independent/3)
    # emp-1 Python = 4 (Exceeds -> 1.0), FastAPI = 2 (1 Level Below -> 0.5)
    # Base match = (1.0 + 0.5) / 2 = 75%
    proj = next(o for o in opps if o["id"] == "proj-ai-agent")
    assert proj["base_match_percent"] == 75
    assert proj["availability_factor"] == 1.0  # free 30h >= req 10h
    assert proj["matchScore"] == 75

    breakdown = proj["skill_breakdown"]
    py_item = next(b for b in breakdown if b["skill_id"] == "skill-python")
    assert py_item["status"] == "Exceeds"
    assert py_item["credit"] == 1.0

    fastapi_item = next(b for b in breakdown if b["skill_id"] == "skill-fastapi")
    assert fastapi_item["status"] == "1 Level Below"
    assert fastapi_item["credit"] == 0.5


def test_opportunity_availability_penalty():
    """Tests that opportunity match score takes penalty when free hours < required hours."""
    token, _ = make_token("user-emp-1")
    client.cookies.set(COOKIE_NAME, token)

    # Set emp-1 free hours to only 5h
    client.put("/api/employee/availability", json={"hours_per_week_free": 5.0})

    # Opportunity proj-ai-agent requires 10h
    res = client.get("/api/opportunities")
    proj = next(o for o in res.json()["opportunities"] if o["id"] == "proj-ai-agent")
    # Base match = 75%
    # Availability factor = 5 / 10 = 0.5
    # Final matchScore = round(75 * 0.5) = 38%
    assert proj["base_match_percent"] == 75
    assert proj["availability_factor"] == 0.5
    assert proj["matchScore"] == 38


def test_apply_opportunity_and_overcommit():
    """Tests applying for an opportunity and blocking if overcommitted."""
    token, _ = make_token("user-emp-1")
    client.cookies.set(COOKIE_NAME, token)

    # Successful application
    res = client.post("/api/project-applications", json={
        "opportunity_id": "proj-ai-agent",
        "opportunity_type": "project",
        "hours_per_week": 10.0,
        "note": "Excited to contribute to AI Agent!"
    })
    assert res.status_code == 200
    app_data = res.json()
    assert app_data["ok"] is True
    assert app_data["status"] == "Pending"

    # Attempting to apply again while active is blocked
    res_dup = client.post("/api/project-applications", json={
        "opportunity_id": "proj-ai-agent",
        "opportunity_type": "project",
        "hours_per_week": 10.0
    })
    assert res_dup.status_code == 400
    assert "already have an active application" in res_dup.json()["detail"]


def test_apply_opportunity_capacity_limit():
    """Tests that applying for hours exceeding total 40h capacity is rejected."""
    token, _ = make_token("user-emp-1")
    client.cookies.set(COOKIE_NAME, token)

    db = TestingSessionLocal()
    # Employee already has 35h committed
    app_rec = ProjectApplication(
        application_id="app-prior-comm",
        opportunity_id="role-backend-lead",
        opportunity_type="role",
        employee_id="emp-1",
        employee_name="Alice Developer",
        hours_per_week=35.0,
        applied_at="2026-10-09",
        status="Accepted"
    )
    db.add(app_rec)
    db.commit()
    db.close()

    # Applying for 10h would require 35 + 10 = 45 > 40
    res = client.post("/api/project-applications", json={
        "opportunity_id": "proj-ai-agent",
        "opportunity_type": "project",
        "hours_per_week": 10.0
    })
    assert res.status_code == 400
    assert "exceed total capacity of 40h/wk" in res.json()["detail"]


def test_withdrawal_and_reactivation():
    """Tests withdrawing application and re-applying."""
    token, _ = make_token("user-emp-1")
    client.cookies.set(COOKIE_NAME, token)

    # Apply
    res_apply = client.post("/api/project-applications", json={
        "opportunity_id": "proj-ai-agent",
        "opportunity_type": "project",
        "hours_per_week": 10.0
    })
    app_id = res_apply.json()["application_id"]

    # Withdraw
    res_withdraw = client.post(f"/api/project-applications/{app_id}/withdraw")
    assert res_withdraw.status_code == 200
    assert res_withdraw.json()["status"] == "Withdrawn"

    # Re-apply re-activates
    res_reapply = client.post("/api/project-applications", json={
        "opportunity_id": "proj-ai-agent",
        "opportunity_type": "project",
        "hours_per_week": 12.0
    })
    assert res_reapply.status_code == 200
    assert res_reapply.json()["status"] == "Pending"
    assert res_reapply.json()["hours_per_week"] == 12.0


def test_hr_review_acceptance_and_membership():
    """Tests HR reviewing application, committing capacity and creating EmployeeProject."""
    emp_token, _ = make_token("user-emp-1")
    hr_token, _ = make_token("user-hr-1")

    # Employee applies
    client.cookies.set(COOKIE_NAME, emp_token)
    res_apply = client.post("/api/project-applications", json={
        "opportunity_id": "proj-ai-agent",
        "opportunity_type": "project",
        "hours_per_week": 15.0
    })
    app_id = res_apply.json()["application_id"]

    # Regular employee cannot review (403)
    res_emp_review = client.post(f"/api/project-applications/{app_id}/review", json={
        "status": "Accepted", "hr_decision_note": "Approved"
    })
    assert res_emp_review.status_code == 403

    # HR reviews and accepts
    client.cookies.set(COOKIE_NAME, hr_token)
    res_hr_review = client.post(f"/api/project-applications/{app_id}/review", json={
        "status": "Accepted", "hr_decision_note": "Great skill match"
    })
    assert res_hr_review.status_code == 200
    assert res_hr_review.json()["status"] == "Accepted"

    # Verify database: EmployeeProject record exists and capacity updated
    db = TestingSessionLocal()
    ep = db.query(EmployeeProject).filter(
        EmployeeProject.employee_id == "emp-1",
        EmployeeProject.project_id == "proj-ai-agent"
    ).first()
    assert ep is not None
    assert ep.role == "Contributor"

    emp = db.query(Employee).filter(Employee.employee_id == "emp-1").first()
    assert emp.hours_per_week_free == 25.0 # 40 - 15 = 25
    db.close()

    # If employee now withdraws, capacity is restored
    client.cookies.set(COOKIE_NAME, emp_token)
    res_with = client.delete(f"/api/project-applications/{app_id}")
    assert res_with.status_code == 200

    db2 = TestingSessionLocal()
    emp_restored = db2.query(Employee).filter(Employee.employee_id == "emp-1").first()
    assert emp_restored.hours_per_week_free == 40.0
    db2.close()


def test_cross_user_isolation_forbidden():
    """Rule 2: Employee A cannot view or withdraw Employee B's applications (403)."""
    token_a, _ = make_token("user-emp-1")
    token_b, _ = make_token("user-emp-2")

    # Employee A applies
    client.cookies.set(COOKIE_NAME, token_a)
    res_apply = client.post("/api/project-applications", json={
        "opportunity_id": "proj-ai-agent",
        "opportunity_type": "project",
        "hours_per_week": 10.0
    })
    app_id = res_apply.json()["application_id"]

    # Employee B tries to withdraw Employee A's application
    client.cookies.set(COOKIE_NAME, token_b)
    res_del = client.delete(f"/api/project-applications/{app_id}")
    assert res_del.status_code == 403
    assert "Forbidden" in res_del.json()["detail"]

    # Employee B tries to view Employee A's applications with query param
    res_view = client.get("/api/project-applications?employee_id=emp-1")
    assert res_view.status_code == 403
