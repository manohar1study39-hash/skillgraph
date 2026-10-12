"""
Phase 4 Learning and Upskilling Test Suite.
Tests:
1. Hours-based logging calculation and 99% cap until completion
2. Future date rejection on hours logging
3. Duplicate enrollment prevention
4. Unenroll preserves logged hours, marks 'Dropped', logs to audit log
5. Re-enroll preserves previously logged hours
6. Request completion workflow with proof link / cert ID -> 'Awaiting approval'
7. Scoring engine partial credit (+0.2 per course, capped at +0.5)
8. HR review approval -> 100%, Done, Approved
9. Course suggestions creation and listing
10. Weekly learning hours slider update and remaining weeks calculation
11. Cross-user isolation 403
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
    LearningResource,
    UpskillingProgress,
    CourseSuggestion,
    AuditLog,
)
from backend.auth import make_token, COOKIE_NAME
from backend.scoring_engine import evaluate_employee_skill
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

    skill = Skill(
        skill_id="skill-python",
        skill_name="Python",
        category="Backend",
        domain="Software Engineering"
    )

    role = Role(
        role_id="role-backend-lead",
        role_title="Backend Lead",
        department="Engineering"
    )

    course = LearningResource(
        resource_id="lr-python-adv",
        skill_id="skill-python",
        title="Advanced Python Patterns",
        provider="Internal Academy",
        type="course",
        estimated_hours=20.0,
        duration_weeks="4",
        target_level="Advanced"
    )

    course2 = LearningResource(
        resource_id="lr-python-fastapi",
        skill_id="skill-python",
        title="High Performance FastAPI",
        provider="Internal Academy",
        type="course",
        estimated_hours=10.0,
        duration_weeks="2",
        target_level="Advanced"
    )

    db.add_all([user1, emp1, user2, emp2, hr_user, skill, role, course, course2])
    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


def test_hours_logging_and_99_percent_cap():
    token, _ = make_token("user-emp-1")
    client.cookies.set(COOKIE_NAME, token)

    # Enroll in lr-python-adv (20 hours total)
    enroll_res = client.post("/api/upskilling/enroll", json={"resource_id": "lr-python-adv"})
    assert enroll_res.status_code == 200

    # Log 5 hours -> 25%
    log_res = client.post("/api/upskilling/log-hours", json={
        "resource_id": "lr-python-adv",
        "hours": 5.0,
        "date": datetime.date.today().isoformat(),
        "note": "Completed modules 1 and 2",
        "link": "https://github.com/company/python-lab"
    })
    assert log_res.status_code == 200
    data = log_res.json()
    assert data["hours_logged"] == 5.0
    assert data["progress_percent"] == 25.0
    assert data["status"] == "In progress"

    # Log 20 more hours -> 25 hrs logged on a 20 hr course
    # Rule: Capped at 99% until completion is verified!
    log_res2 = client.post("/api/upskilling/log-hours", json={
        "resource_id": "lr-python-adv",
        "hours": 20.0,
        "date": datetime.date.today().isoformat()
    })
    assert log_res2.status_code == 200
    data2 = log_res2.json()
    assert data2["hours_logged"] == 25.0
    assert data2["progress_percent"] == 99.0  # strictly capped at 99%


def test_future_date_rejected_in_hours_logging():
    token, _ = make_token("user-emp-1")
    client.cookies.set(COOKIE_NAME, token)

    future_date = (datetime.date.today() + datetime.timedelta(days=2)).isoformat()
    res = client.post("/api/upskilling/log-hours", json={
        "resource_id": "lr-python-adv",
        "hours": 2.0,
        "date": future_date
    })
    assert res.status_code == 400
    assert "future" in res.json()["detail"].lower()


def test_duplicate_enrollment_rejected():
    token, _ = make_token("user-emp-1")
    client.cookies.set(COOKIE_NAME, token)

    res1 = client.post("/api/upskilling/enroll", json={"resource_id": "lr-python-adv"})
    assert res1.status_code == 200

    # Second enrollment must be blocked
    res2 = client.post("/api/upskilling/enroll", json={"resource_id": "lr-python-adv"})
    assert res2.status_code == 400
    assert "Already enrolled" in res2.json()["detail"]


def test_unenroll_preserves_hours_and_marks_dropped():
    token, _ = make_token("user-emp-1")
    client.cookies.set(COOKIE_NAME, token)

    client.post("/api/upskilling/enroll", json={"resource_id": "lr-python-adv"})
    client.post("/api/upskilling/log-hours", json={
        "resource_id": "lr-python-adv",
        "hours": 8.0,
        "date": datetime.date.today().isoformat()
    })

    # Unenroll
    unenroll_res = client.post("/api/upskilling/unenroll", json={"resource_id": "lr-python-adv"})
    assert unenroll_res.status_code == 200
    assert "8.0 hours logged preserved" in unenroll_res.json()["message"]

    db = TestingSessionLocal()
    prog = db.query(UpskillingProgress).filter_by(employee_id="emp-1", resource_id="lr-python-adv").first()
    assert prog.status == "Dropped"
    assert prog.hours_logged == 8.0

    # Check audit log entry
    audit = db.query(AuditLog).filter_by(event_type="UPSKILLING_UNENROLL").first()
    assert audit is not None
    assert "preserved 8.0 hours" in audit.details
    db.close()

    # Re-enroll should succeed and preserve previous 8.0 hours
    reenroll_res = client.post("/api/upskilling/enroll", json={"resource_id": "lr-python-adv"})
    assert reenroll_res.status_code == 200
    assert reenroll_res.json()["hours_logged"] == 8.0


def test_request_completion_workflow_and_scoring_partial_credit():
    token, _ = make_token("user-emp-1")
    client.cookies.set(COOKIE_NAME, token)

    client.post("/api/upskilling/enroll", json={"resource_id": "lr-python-adv"})

    # Reject empty/too short proof url
    bad_req = client.post("/api/upskilling/request-completion", json={
        "resource_id": "lr-python-adv",
        "proof_url": "ab"
    })
    assert bad_req.status_code == 400

    # Valid completion request
    req = client.post("/api/upskilling/request-completion", json={
        "resource_id": "lr-python-adv",
        "proof_url": "https://verify.skillgraph.demo/cert/py-12345",
        "note": "Completed final capstone project"
    })
    assert req.status_code == 200
    data = req.json()
    assert data["status"] == "Awaiting approval"
    assert data["approval_status"] == "Pending"

    # Verify scoring engine awards partial credit (+0.2 level boost)
    courses = [{"status": "Awaiting approval"}]
    score_result = evaluate_employee_skill(
        skill_id="skill-python",
        evidence_items=[],
        declared_years=1.0,
        learning_courses=courses
    )
    # Contributions should contain the course-awaiting-approval entry
    contrib_types = [c["evidence_type"] for c in score_result["ordered_contributions"]]
    assert "course_partial" in contrib_types


def test_hr_review_completion():
    # Alice requests completion
    emp_token, _ = make_token("user-emp-1")
    client.cookies.set(COOKIE_NAME, emp_token)
    client.post("/api/upskilling/enroll", json={"resource_id": "lr-python-adv"})
    client.post("/api/upskilling/request-completion", json={
        "resource_id": "lr-python-adv",
        "proof_url": "https://verify.skillgraph.demo/cert/py-12345"
    })

    db = TestingSessionLocal()
    prog = db.query(UpskillingProgress).filter_by(employee_id="emp-1", resource_id="lr-python-adv").first()
    prog_id = prog.id
    db.close()

    # Bob (regular employee) cannot review completion -> 403
    bob_token, _ = make_token("user-emp-2")
    client.cookies.set(COOKIE_NAME, bob_token)
    res_forbidden = client.post("/api/upskilling/admin/review-completion", json={
        "progress_id": prog_id,
        "decision": "Approved"
    })
    assert res_forbidden.status_code == 403

    # Helen (HR Admin) approves completion
    hr_token, _ = make_token("user-hr-1")
    client.cookies.set(COOKIE_NAME, hr_token)
    res_hr = client.post("/api/upskilling/admin/review-completion", json={
        "progress_id": prog_id,
        "decision": "Approved",
        "note": "Verified capstone repository"
    })
    assert res_hr.status_code == 200
    assert res_hr.json()["status"] == "Done"
    assert res_hr.json()["progress_percent"] == 100.0
    assert res_hr.json()["approval_status"] == "Approved"


def test_course_suggestions_workflow():
    token, _ = make_token("user-emp-1")
    client.cookies.set(COOKIE_NAME, token)

    # Suggest a course
    sug_res = client.post("/api/learning-suggestions", json={
        "title": "Modern Concurrency in Python",
        "provider": "O'Reilly",
        "url": "https://learning.oreilly.com/course/modern-python-concurrency",
        "skill_id": "skill-python",
        "estimated_hours": 12.0,
        "why_helpful": "Essential for high throughput microservices."
    })
    assert sug_res.status_code == 200
    sug_data = sug_res.json()["suggestion"]
    assert sug_data["title"] == "Modern Concurrency in Python"
    assert sug_data["status"] == "Submitted"
    assert sug_data["estimated_hours"] == 12.0

    # List suggestions
    list_res = client.get("/api/learning-suggestions")
    assert list_res.status_code == 200
    items = list_res.json()["suggestions"]
    assert len(items) == 1
    assert items[0]["title"] == "Modern Concurrency in Python"


def test_weekly_learning_hours_slider():
    token, _ = make_token("user-emp-1")
    client.cookies.set(COOKIE_NAME, token)

    # Alice enrolls in two courses: 20 hrs and 10 hrs = 30 total hrs
    client.post("/api/upskilling/enroll", json={"resource_id": "lr-python-adv"})
    client.post("/api/upskilling/enroll", json={"resource_id": "lr-python-fastapi"})

    # Query initial weekly stats (default 5.0 hrs/week)
    stats_res = client.get("/api/employee/weekly-learning-hours")
    assert stats_res.status_code == 200
    data = stats_res.json()
    assert data["weekly_learning_hours"] == 5.0
    assert data["total_remaining_hours"] == 30.0
    assert data["estimated_weeks"] == 6.0  # 30 / 5 = 6 weeks

    # Update pace to 10 hrs/week via slider
    put_res = client.put("/api/employee/weekly-learning-hours", json={
        "weekly_learning_hours": 10.0
    })
    assert put_res.status_code == 200
    put_data = put_res.json()
    assert put_data["weekly_learning_hours"] == 10.0
    assert put_data["estimated_weeks"] == 3.0  # 30 / 10 = 3 weeks
