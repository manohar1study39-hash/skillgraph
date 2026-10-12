import pytest
import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.db import Base, get_db
from backend.models import CompanyUser, Employee, Skill, Project, EmployeeProject, Evidence
from backend.api import app, submission_timestamps
from backend.auth import make_token, COOKIE_NAME

from sqlalchemy.pool import StaticPool

# Setup shared in-memory SQLite database for testing
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

    # Clear tables
    for tbl in reversed(Base.metadata.sorted_tables):
        db.execute(tbl.delete())
    db.commit()

    # Create User A & Employee A
    user_a = CompanyUser(user_id="user-a", name="Employee A", email="employee_a@company.com", password_hash="hash", role="Employee")
    emp_a = Employee(employee_id="emp-a", user_id="user-a", name="Employee A", email="employee_a@company.com")

    # Create User B & Employee B
    user_b = CompanyUser(user_id="user-b", name="Employee B", email="employee_b@company.com", password_hash="hash", role="Employee")
    emp_b = Employee(employee_id="emp-b", user_id="user-b", name="Employee B", email="employee_b@company.com")

    # Create Skills
    sk1 = Skill(skill_id="skill-react", skill_name="React", category="Frontend")
    sk2 = Skill(skill_id="skill-ts", skill_name="TypeScript", category="Frontend")

    # Create Projects
    proj = Project(project_id="proj-101", project_name="Platform App", domain="Engineering")
    ep = EmployeeProject(employee_id="emp-a", project_id="proj-101", role="Contributor")

    db.add_all([user_a, emp_a, user_b, emp_b, sk1, sk2, proj, ep])
    db.commit()
    db.close()

    yield

    app.dependency_overrides.clear()


def auth_client_for(user_id: str) -> TestClient:
    token, _ = make_token(user_id)
    c = TestClient(app)
    c.headers["Cookie"] = f"{COOKIE_NAME}={token}"
    return c


def test_submit_evidence_validation_future_date():
    c = auth_client_for("user-a")
    future = (datetime.date.today() + datetime.timedelta(days=2)).isoformat()
    res = c.post("/api/evidence", json={
        "title": "Built checkout microservice",
        "evidence_type": "PR",
        "url": "https://github.com/company/repo/pull/1",
        "artifact_date": future,
        "skill_id": "skill-react"
    })
    assert res.status_code == 400
    assert "future" in res.json()["detail"].lower()


def test_submit_evidence_validation_title_length():
    c = auth_client_for("user-a")
    res = c.post("/api/evidence", json={
        "title": "Hi",  # Too short (< 5 chars)
        "evidence_type": "PR",
        "url": "https://github.com/company/repo/pull/1",
        "artifact_date": "2026-09-01",
        "skill_id": "skill-react"
    })
    assert res.status_code == 400
    assert "between 5 and 255" in res.json()["detail"]


def test_submit_evidence_domain_validation():
    c = auth_client_for("user-a")
    # PR from random disallowed domain
    res = c.post("/api/evidence", json={
        "title": "Built checkout microservice",
        "evidence_type": "PR",
        "url": "https://suspicious-site.com/fake-pr",
        "artifact_date": "2026-09-01",
        "skill_id": "skill-react"
    })
    assert res.status_code == 400
    assert "Allowed domains" in res.json()["detail"]

    # Valid GitHub PR
    res_valid = c.post("/api/evidence", json={
        "title": "Built checkout microservice",
        "evidence_type": "PR",
        "url": "https://github.com/company/repo/pull/42",
        "artifact_date": "2026-09-01",
        "skill_id": "skill-react"
    })
    assert res_valid.status_code == 200
    data = res_valid.json()
    assert data["ok"] is True
    assert data["verification_status"] == "Link checked"


def test_submit_evidence_project_participation_check():
    c = auth_client_for("user-b")  # Employee B has NOT worked on proj-101
    res = c.post("/api/evidence", json={
        "title": "Implemented auth middleware",
        "evidence_type": "PR",
        "url": "https://github.com/company/repo/pull/10",
        "artifact_date": "2026-09-01",
        "project_id": "proj-101",
        "skill_id": "skill-react"
    })
    assert res.status_code == 400
    assert "project the employee worked on" in res.json()["detail"]


def test_submit_evidence_multi_skill_split():
    c = auth_client_for("user-a")
    res = c.post("/api/evidence", json={
        "title": "Fullstack React + TypeScript component refactor",
        "evidence_type": "PR",
        "url": "https://github.com/company/repo/pull/101",
        "artifact_date": "2026-09-01",
        "skills": [
            {"skill_id": "skill-react", "share_percentage": 60.0},
            {"skill_id": "skill-ts", "share_percentage": 40.0}
        ]
    })
    assert res.status_code == 200
    data = res.json()
    assert len(data["before_after"]) == 2
    assert data["before_after"][0]["skill_id"] == "skill-react"
    assert data["before_after"][1]["skill_id"] == "skill-ts"


def test_duplicate_detection():
    c = auth_client_for("user-a")
    url = "https://github.com/company/repo/pull/200"
    
    # 1. First submission
    res1 = c.post("/api/evidence", json={
        "title": "Initial feature delivery",
        "evidence_type": "PR",
        "url": url,
        "artifact_date": "2026-08-01",
        "skill_id": "skill-react"
    })
    assert res1.status_code == 200
    assert res1.json()["is_duplicate"] is False

    # 2. Resubmission by same employee
    res2 = c.post("/api/evidence", json={
        "title": "Duplicate feature delivery",
        "evidence_type": "PR",
        "url": url,
        "artifact_date": "2026-08-01",
        "skill_id": "skill-react"
    })
    assert res2.status_code == 200
    assert res2.json()["is_duplicate"] is True
    assert "already been submitted by you" in res2.json()["duplicate_warning"]


def test_cross_user_authorization_403_on_other_employee_data():
    client_a = auth_client_for("user-a")
    client_b = auth_client_for("user-b")

    # Employee A creates evidence
    res_a = client_a.post("/api/evidence", json={
        "title": "Secret core component for A",
        "evidence_type": "PR",
        "url": "https://github.com/company/repo/pull/300",
        "artifact_date": "2026-08-01",
        "skill_id": "skill-react"
    })
    assert res_a.status_code == 200
    ev_id = res_a.json()["created_ids"][0]

    # Employee B attempts to delete Employee A's evidence -> MUST get 403 Forbidden!
    res_del = client_b.delete(f"/api/evidence/{ev_id}")
    assert res_del.status_code == 403
    assert "Forbidden" in res_del.json()["detail"]


def test_soft_delete_and_undo_workflow():
    c = auth_client_for("user-a")
    res = c.post("/api/evidence", json={
        "title": "Component to delete",
        "evidence_type": "PR",
        "url": "https://github.com/company/repo/pull/400",
        "artifact_date": "2026-08-01",
        "skill_id": "skill-react"
    })
    ev_id = res.json()["created_ids"][0]

    # Soft delete
    del_res = c.delete(f"/api/evidence/{ev_id}")
    assert del_res.status_code == 200
    assert del_res.json()["ok"] is True

    # Check it no longer appears in active list
    active_list = c.get("/api/evidence").json()["evidence"]
    assert not any(item["evidence_id"] == ev_id for item in active_list)

    # Undo delete within window
    undo_res = c.post(f"/api/evidence/{ev_id}/undo-delete")
    assert undo_res.status_code == 200
    assert undo_res.json()["ok"] is True

    # Re-verify active in list
    active_list2 = c.get("/api/evidence").json()["evidence"]
    assert any(item["evidence_id"] == ev_id for item in active_list2)


def test_rate_limiting():
    c = auth_client_for("user-a")
    for i in range(10):
        res = c.post("/api/evidence", json={
            "title": f"Valid distinct PR {i+1}",
            "evidence_type": "PR",
            "url": f"https://github.com/company/repo/pull/50{i}",
            "artifact_date": "2026-08-01",
            "skill_id": "skill-react"
        })
        assert res.status_code == 200

    # 11th request within window -> 429
    res_blocked = c.post("/api/evidence", json={
        "title": "11th spam submission",
        "evidence_type": "PR",
        "url": "https://github.com/company/repo/pull/599",
        "artifact_date": "2026-08-01",
        "skill_id": "skill-react"
    })
    assert res_blocked.status_code == 429
    assert "Rate limit exceeded" in res_blocked.json()["detail"]
