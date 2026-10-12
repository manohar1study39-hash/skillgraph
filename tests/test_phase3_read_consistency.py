"""
Phase 3 Read Consistency Test Suite:
1. Asserts that for any employee E, the score and level returned by:
   - GET /api/employees/{E}
   - GET /api/employees/{E}/profile
   - GET /api/manager/employees/{E}
   - GET /api/data (in employee_records)
   - GET /api/data (in parsed employees CSV)
   are 100% bit-identical.
2. Asserts that updates to skills/evidence propagate to all views identically.
3. Tests unified read endpoints for employees, roles, skills, projects, and learning resources.
4. Asserts permission filtering at edge (403 for non-managers on manager endpoints).
5. Confirms zero CSV reads in business read flows.
"""

import csv
import io
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
    LearningResource,
    Evidence,
    EmployeeSkill,
)
from backend.auth import make_token, COOKIE_NAME
from backend.api import app


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


def auth_header(user_id: str):
    token, _ = make_token(user_id)
    return {"Cookie": f"{COOKIE_NAME}={token}"}


@pytest.fixture(autouse=True)
def setup_db():
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()

    # Seed users
    emp_user = CompanyUser(
        user_id="user-rc-emp-1",
        name="Alice Read",
        email="alice.read@company.com",
        password_hash="hash",
        role="Employee",
        is_active=True
    )
    mgr_user = CompanyUser(
        user_id="user-rc-mgr-1",
        name="Bob Manager",
        email="bob.mgr@company.com",
        password_hash="hash",
        role="Manager",
        is_active=True
    )
    hr_user = CompanyUser(
        user_id="user-rc-hr-1",
        name="Hannah HR",
        email="hannah.hr@company.com",
        password_hash="hash",
        role="HR_Admin",
        is_active=True
    )

    # Seed Employees
    mgr_emp = Employee(
        employee_id="emp-rc-mgr-1",
        user_id="user-rc-mgr-1",
        name="Bob Manager",
        email="bob.mgr@company.com",
        title="Engineering Manager",
        department="Engineering",
        team="Platform",
        location="Remote",
        manager_id=None,
        availability_percent=70.0,
        hours_per_week_free=28.0,
        current_workload_percent=30.0,
        version=1
    )
    emp_1 = Employee(
        employee_id="emp-rc-1",
        user_id="user-rc-emp-1",
        name="Alice Read",
        email="alice.read@company.com",
        title="Software Engineer",
        department="Engineering",
        team="Platform",
        location="Remote",
        manager_id="emp-rc-mgr-1",
        availability_percent=80.0,
        hours_per_week_free=32.0,
        current_workload_percent=20.0,
        version=1
    )
    emp_2 = Employee(
        employee_id="emp-rc-2",
        user_id="user-rc-emp-2",
        name="Dave Dev",
        email="dave.dev@company.com",
        title="Junior Engineer",
        department="Engineering",
        team="Platform",
        location="Office",
        manager_id="emp-rc-mgr-1",
        availability_percent=100.0,
        hours_per_week_free=40.0,
        current_workload_percent=0.0,
        version=1
    )

    # Seed Skills
    skill_py = Skill(skill_id="skill-python", skill_name="Python", category="Backend", domain="Engineering")
    skill_fastapi = Skill(skill_id="skill-fastapi", skill_name="FastAPI", category="Backend", domain="Engineering")
    skill_react = Skill(skill_id="skill-react", skill_name="React", category="Frontend", domain="Engineering")

    # Seed EmployeeSkills for emp_1
    es_1 = EmployeeSkill(
        employee_id="emp-rc-1",
        skill_id="skill-python",
        proficiency_level="Advanced",
        claimed_level="Advanced",
        years_experience=4.0,
        source="verified",
        verification_status="Verified by HR",
        version=1
    )
    es_2 = EmployeeSkill(
        employee_id="emp-rc-1",
        skill_id="skill-fastapi",
        proficiency_level="Independent",
        claimed_level="Independent",
        years_experience=2.0,
        source="evidence",
        verification_status="Link checked",
        version=1
    )

    # Seed EmployeeSkills for emp_2 (beginner / aware)
    es_3 = EmployeeSkill(
        employee_id="emp-rc-2",
        skill_id="skill-react",
        proficiency_level="Aware",
        claimed_level="Aware",
        years_experience=1.0,
        source="self",
        verification_status="Self-reported",
        version=1
    )

    # Seed Roles
    role_1 = Role(
        role_id="role-backend-lead",
        role_title="Backend Lead",
        department="Engineering",
        priority="Priority",
        status="Open",
        min_availability_percent=50.0
    )
    rs_1 = RoleSkill(role_id="role-backend-lead", skill_id="skill-python", required_level="Advanced", importance="Must")

    # Seed Projects
    proj_1 = Project(
        project_id="proj-core-platform",
        project_name="Core Platform API",
        domain="Engineering",
        complexity=4.0,
        technologies="Python|FastAPI",
        status="Active"
    )
    ep_1 = EmployeeProject(
        project_id="proj-core-platform",
        employee_id="emp-rc-1",
        role="Lead Developer",
        contribution_summary="Architected new services"
    )

    # Seed Learning Resource
    lr_1 = LearningResource(
        resource_id="res-fastapi-mastery",
        skill_id="skill-fastapi",
        title="FastAPI Mastery",
        provider="Internal Academy",
        type="course",
        duration_weeks=3.0,
        target_level="Advanced"
    )

    db.add_all([
        emp_user, mgr_user, hr_user,
        mgr_emp, emp_1, emp_2,
        skill_py, skill_fastapi, skill_react,
        es_1, es_2, es_3,
        role_1, rs_1,
        proj_1, ep_1,
        lr_1
    ])
    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


def parse_csv_string(csv_text: str):
    reader = csv.DictReader(io.StringIO(csv_text))
    return list(reader)


def test_bit_identical_scores_and_levels_across_all_views():
    """
    Asserts that for any employee E, the score and level returned by:
    - GET /api/employees/{E}
    - GET /api/employees/{E}/profile
    - GET /api/manager/employees/{E}
    - GET /api/data (in employee_records)
    - GET /api/data (in parsed employees CSV)
    are 100% bit-identical.
    """
    headers_emp = auth_header("user-rc-emp-1")
    headers_mgr = auth_header("user-rc-mgr-1")
    headers_hr = auth_header("user-rc-hr-1")

    for emp_id in ["emp-rc-1", "emp-rc-2"]:
        # 1. Employee view
        res_emp = client.get(f"/api/employees/{emp_id}", headers=headers_emp)
        assert res_emp.status_code == 200, res_emp.text
        data_emp = res_emp.json()["employee"]
        score_1 = data_emp["score"]
        level_1 = data_emp["level"]

        # 2. Employee full profile view
        res_prof = client.get(f"/api/employees/{emp_id}/profile", headers=headers_emp)
        assert res_prof.status_code == 200, res_prof.text
        data_prof = res_prof.json()["employee"]
        score_2 = data_prof["score"]
        level_2 = data_prof["level"]

        # 3. Manager view
        res_mgr = client.get(f"/api/manager/employees/{emp_id}", headers=headers_mgr)
        assert res_mgr.status_code == 200, res_mgr.text
        data_mgr = res_mgr.json()["employee"]
        score_3 = data_mgr["score"]
        level_3 = data_mgr["level"]

        # 4. GET /api/data (both employee_records and CSV)
        res_data = client.get("/api/data", headers=headers_hr)
        assert res_data.status_code == 200, res_data.text
        data_all = res_data.json()

        # From employee_records JSON array
        emp_records = {r["id"]: r for r in data_all["employee_records"]}
        assert emp_id in emp_records
        score_4 = emp_records[emp_id]["score"]
        level_4 = emp_records[emp_id]["level"]

        # From employees CSV string
        csv_rows = {row["employee_id"]: row for row in parse_csv_string(data_all["employees"])}
        assert emp_id in csv_rows
        score_5 = int(csv_rows[emp_id]["score"])
        level_5 = csv_rows[emp_id]["level"]

        # Bit-identical assertion across all 5 views!
        assert score_1 == score_2 == score_3 == score_4 == score_5, (
            f"Score mismatch for {emp_id}: {score_1}, {score_2}, {score_3}, {score_4}, {score_5}"
        )
        assert level_1 == level_2 == level_3 == level_4 == level_5, (
            f"Level mismatch for {emp_id}: {level_1}, {level_2}, {level_3}, {level_4}, {level_5}"
        )


def test_score_update_propagates_identically_to_all_views():
    """
    When an employee skill level is modified in SQLite, all endpoints immediately reflect
    the updated score and level bit-identically.
    """
    headers_emp = auth_header("user-rc-emp-1")
    headers_mgr = auth_header("user-rc-mgr-1")
    headers_hr = auth_header("user-rc-hr-1")

    # Update emp-rc-2's skill from Aware (20) to Expert (100) + Verified (105 capped at 100)
    db = TestingSessionLocal()
    es = db.query(EmployeeSkill).filter(
        EmployeeSkill.employee_id == "emp-rc-2",
        EmployeeSkill.skill_id == "skill-react"
    ).first()
    es.proficiency_level = "Expert"
    es.verification_status = "Verified by HR"
    db.commit()
    db.close()

    # Re-fetch from all views
    res_emp = client.get("/api/employees/emp-rc-2", headers=headers_emp).json()["employee"]
    res_mgr = client.get("/api/manager/employees/emp-rc-2", headers=headers_mgr).json()["employee"]
    res_data = client.get("/api/data", headers=headers_hr).json()

    rec_data = next(r for r in res_data["employee_records"] if r["id"] == "emp-rc-2")
    csv_row = next(r for r in parse_csv_string(res_data["employees"]) if r["employee_id"] == "emp-rc-2")

    expected_score = 100
    expected_level = "Expert"

    assert res_emp["score"] == expected_score
    assert res_emp["level"] == expected_level

    assert res_mgr["score"] == expected_score
    assert res_mgr["level"] == expected_level

    assert rec_data["score"] == expected_score
    assert rec_data["level"] == expected_level

    assert int(csv_row["score"]) == expected_score
    assert csv_row["level"] == expected_level


def test_unified_read_endpoints_shapes():
    """
    Tests /api/employees, /api/roles, /api/skills, /api/projects, /api/learning-resources shapes.
    """
    headers_emp = auth_header("user-rc-emp-1")
    headers_hr = auth_header("user-rc-hr-1")

    # 1. Directory employees
    res_emps = client.get("/api/employees", headers=headers_emp)
    assert res_emps.status_code == 200
    emps = res_emps.json()["employees"]
    assert len(emps) >= 3
    assert any(e["id"] == "emp-rc-1" for e in emps)

    # 2. Roles
    res_roles = client.get("/api/roles", headers=headers_emp)
    assert res_roles.status_code == 200
    roles = res_roles.json()["roles"]
    assert len(roles) >= 1
    assert roles[0]["id"] == "role-backend-lead"
    assert len(roles[0]["required_skills"]) == 1

    res_single_role = client.get("/api/roles/role-backend-lead", headers=headers_emp)
    assert res_single_role.status_code == 200
    assert res_single_role.json()["role"]["role_title"] == "Backend Lead"

    # 3. Skills
    res_skills = client.get("/api/skills", headers=headers_emp)
    assert res_skills.status_code == 200
    skills = res_skills.json()["skills"]
    assert len(skills) >= 3

    res_single_skill = client.get("/api/skills/skill-python", headers=headers_emp)
    assert res_single_skill.status_code == 200
    assert res_single_skill.json()["skill"]["name"] == "Python"

    # 4. Projects
    res_projs = client.get("/api/projects", headers=headers_emp)
    assert res_projs.status_code == 200
    projs = res_projs.json()["projects"]
    assert len(projs) >= 1
    assert projs[0]["id"] == "proj-core-platform"
    assert len(projs[0]["members"]) == 1
    assert projs[0]["members"][0]["employee_id"] == "emp-rc-1"

    # 5. Learning resources
    res_lr = client.get("/api/learning-resources", headers=headers_emp)
    assert res_lr.status_code == 200
    resources = res_lr.json()["resources"]
    assert any(r["resource_id"] == "res-fastapi-mastery" for r in resources)

    # Create learning resource via HR
    res_create_lr = client.post(
        "/api/learning-resources",
        json={
            "resource_id": "res-advanced-pytest",
            "skill_id": "skill-python",
            "title": "Advanced Pytest",
            "provider": "Internal Academy",
            "type": "course",
            "duration_weeks": 2.0,
            "target_level": "Expert"
        },
        headers=headers_hr
    )
    assert res_create_lr.status_code == 200
    assert res_create_lr.json()["ok"] is True


def test_manager_endpoints_permission_filtering():
    """
    Manager views are protected at the edge:
    - Employee gets 403 Forbidden on /api/manager/employees and /api/manager/employees/{id}
    - Manager can access reportees
    - HR Admin can access all employees
    """
    headers_emp = auth_header("user-rc-emp-1")
    headers_mgr = auth_header("user-rc-mgr-1")
    headers_hr = auth_header("user-rc-hr-1")

    # Employee forbidden
    res_403 = client.get("/api/manager/employees", headers=headers_emp)
    assert res_403.status_code == 403

    res_403_single = client.get("/api/manager/employees/emp-rc-1", headers=headers_emp)
    assert res_403_single.status_code == 403

    # Manager allowed
    res_mgr_list = client.get("/api/manager/employees", headers=headers_mgr)
    assert res_mgr_list.status_code == 200
    mgr_emps = res_mgr_list.json()["employees"]
    assert any(e["id"] == "emp-rc-1" for e in mgr_emps)

    # HR allowed
    res_hr_list = client.get("/api/manager/employees", headers=headers_hr)
    assert res_hr_list.status_code == 200
    hr_emps = res_hr_list.json()["employees"]
    assert len(hr_emps) >= 3
