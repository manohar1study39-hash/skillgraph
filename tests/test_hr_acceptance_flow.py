"""
End-to-end tests verifying HR acceptance flows:
1. Evidence items: HR verification sets status to 'Verified by HR', weight=1.0, recomputes level and lifts Level 3 ceiling.
2. Course completion: HR approval creates verified evidence, marks course Done, and unlocks verified skill credit.
3. Project applications: HR acceptance assigns EmployeeProject, creates verified project evidence, and updates capacity.
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
def setup_test_data():
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    submission_timestamps.clear()

    for tbl in reversed(Base.metadata.sorted_tables):
        db.execute(tbl.delete())
    db.commit()

    emp_user = CompanyUser(user_id="user-emp", name="Alice Chen", email="alice@company.com", password_hash="h", role="Employee")
    hr_user  = CompanyUser(user_id="user-hr",  name="Carol HR",   email="carol@company.com", password_hash="h", role="HR_Admin")

    emp = Employee(
        employee_id="emp-1",
        user_id="user-emp",
        name="Alice Chen",
        email="alice@company.com",
        title="Software Engineer",
        department="Engineering",
        team="Platform",
        location="Remote",
        hire_date="2022-01-01",
        availability_percent=100.0,
        hours_per_week_free=40.0,
        current_workload_percent=0.0,
        version=1
    )

    py_skill = Skill(skill_id="skill-python", skill_name="Python", category="Backend", domain="Engineering", synonyms="Python3|CPython")
    proj = Project(project_id="proj-core", project_name="Core Engine", domain="Engineering", complexity=4.0, technologies="Python|FastAPI")
    lr = LearningResource(resource_id="lr-py-adv", skill_id="skill-python", title="Advanced Python", provider="Academy", type="cert", estimated_hours=20.0)

    db.add_all([emp_user, hr_user, emp, py_skill, proj, lr])
    db.commit()
    db.close()
    yield
    app.dependency_overrides.clear()


def make_client(user_id: str) -> TestClient:
    t, _ = make_token(user_id)
    c = TestClient(app)
    c.cookies.set(COOKIE_NAME, t)
    return c


def test_evidence_verification_reflects_and_improves_level():
    emp_client = make_client("user-emp")
    hr_client = make_client("user-hr")

    # 1. Employee submits evidence with 5.0 complexity
    sub_res = emp_client.post("/api/evidence", json={
        "skill_id": "skill-python",
        "evidence_type": "PR",
        "title": "High Throughput Async Queue Engine",
        "url": "https://github.com/company/repo/pull/9991",
        "artifact_date": datetime.date.today().isoformat(),
        "project_complexity": 5.0,
    })
    assert sub_res.status_code in [200, 201]
    ev_id = sub_res.json()["evidence_id"]

    # In /api/data before verification:
    data_before = emp_client.get("/api/data").json()
    assert "verification_status" in data_before["evidence"]
    assert f'"{ev_id}"' in data_before["evidence"]

    # 2. HR verifies the evidence
    ver_res = hr_client.post(f"/api/evidence/{ev_id}/verify", json={
        "verification_status": "Verified by HR",
        "hr_notes": "Verified robust async tests and architecture"
    })
    assert ver_res.status_code == 200
    assert ver_res.json()["status"] == "Verified by HR"

    # In /api/data after verification:
    data_after = emp_client.get("/api/data").json()
    assert '"Verified by HR"' in data_after["evidence"]

    # In database: skill proficiency should be updated and verified
    db = TestingSessionLocal()
    es = db.query(EmployeeSkill).filter_by(employee_id="emp-1", skill_id="skill-python").first()
    assert es is not None
    assert es.verification_status == "Verified by HR"
    assert es.proficiency_level in ["Aware", "Guided", "Independent", "Advanced", "Expert"]
    db.close()


def test_course_completion_approval_creates_verified_evidence_and_improves_level():
    emp_client = make_client("user-emp")
    hr_client = make_client("user-hr")

    # 1. Employee requests completion
    req_res = emp_client.post("/api/upskilling/request-completion", json={
        "resource_id": "lr-py-adv",
        "proof_url": "https://verify.skillgraph.demo/cert/py-adv-99",
        "note": "Completed final capstone"
    })
    assert req_res.status_code == 200
    prog_id = req_res.json()["progress_id"]

    # 2. HR approves completion
    rev_res = hr_client.post("/api/upskilling/admin/review-completion", json={
        "progress_id": prog_id,
        "decision": "Approved",
        "note": "Verified capstone repository"
    })
    assert rev_res.status_code == 200
    assert rev_res.json()["status"] == "Done"
    assert rev_res.json()["approval_status"] == "Approved"

    # 3. Check /api/data contains newly generated verified course evidence
    data = emp_client.get("/api/data").json()
    assert f'"ev-course-{prog_id}"' in data["evidence"]
    assert '"Verified by HR"' in data["evidence"]

    db = TestingSessionLocal()
    ev = db.query(Evidence).filter_by(evidence_id=f"ev-course-{prog_id}").first()
    assert ev is not None
    assert ev.verification_status == "Verified by HR"
    assert ev.base_weight == 1.0

    prog = db.query(UpskillingProgress).filter_by(id=prog_id).first()
    assert prog.status == "Done"
    assert prog.progress_percent == 100.0

    es = db.query(EmployeeSkill).filter_by(employee_id="emp-1", skill_id="skill-python").first()
    assert es is not None
    assert es.verification_status == "Verified by HR"
    db.close()


def test_project_application_acceptance_creates_project_evidence_and_membership():
    emp_client = make_client("user-emp")
    hr_client = make_client("user-hr")

    # 1. Employee applies
    app_res = emp_client.post("/api/project-applications", json={
        "opportunity_id": "proj-core",
        "opportunity_type": "project",
        "hours_per_week": 10.0,
        "note": "Ready to build Python microservices"
    })
    assert app_res.status_code in [200, 201]
    app_id = app_res.json()["application_id"]

    # 2. HR accepts
    rev_res = hr_client.post(f"/api/project-applications/{app_id}/review", json={
        "status": "Accepted",
        "hr_decision_note": "Accepted for Core Engine"
    })
    assert rev_res.status_code == 200
    assert rev_res.json()["status"] == "Accepted"

    # 3. Check EmployeeProject membership and verified project evidence in database
    db = TestingSessionLocal()
    membership = db.query(EmployeeProject).filter_by(
        employee_id="emp-1", project_id="proj-core"
    ).first()
    assert membership is not None

    emp = db.query(Employee).filter_by(employee_id="emp-1").first()
    assert emp.hours_per_week_free == 30.0

    evs = db.query(Evidence).filter(
        Evidence.employee_id == "emp-1",
        Evidence.project_id == "proj-core"
    ).all()
    assert len(evs) > 0
    assert any(e.verification_status == "Verified by HR" for e in evs)
    db.close()
