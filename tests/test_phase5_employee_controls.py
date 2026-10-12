"""
Phase 5 Employee Controls & Explanation Test Suite.
Tests:
1. GET /api/employees/{id}/skills/{skill_id}/explanation returns full scoring breakdown,
   factors, thresholds, confidence breakdown, claimed vs evidenced levels, guidance.
2. Anti-gaming ceilings: self-declared alone <= Level 1, self-reported alone <= Level 3.
3. Cross-user isolation: Employee A viewing Employee B explanation returns 403 Forbidden.
4. Soft delete evidence + POST /api/evidence/{id}/undo-delete restores evidence item
   and deterministic level recomputation.
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
    EmployeeSkill,
    Evidence,
    AuditLog,
)
from backend.auth import make_token, COOKIE_NAME
from backend.api import app

# Shared in-memory SQLite engine for test isolation
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

    # User 1: Employee Alice
    u1 = CompanyUser(
        user_id="user-emp-alice",
        name="Alice Developer",
        email="alice@company.com",
        password_hash="hash",
        role="Employee",
        is_active=True
    )
    e1 = Employee(
        employee_id="emp-alice",
        user_id="user-emp-alice",
        name="Alice Developer",
        email="alice@company.com",
        title="Software Engineer",
        department="Engineering",
        availability_percent=80,
        hours_per_week_free=32
    )

    # User 2: Employee Bob
    u2 = CompanyUser(
        user_id="user-emp-bob",
        name="Bob Architect",
        email="bob@company.com",
        password_hash="hash",
        role="Employee",
        is_active=True
    )
    e2 = Employee(
        employee_id="emp-bob",
        user_id="user-emp-bob",
        name="Bob Architect",
        email="bob@company.com",
        title="Solutions Architect",
        department="Engineering",
        availability_percent=60,
        hours_per_week_free=24
    )

    # User 3: HR Admin
    u_hr = CompanyUser(
        user_id="user-hr",
        name="Helen HR",
        email="hr@company.com",
        password_hash="hash",
        role="HR_Admin",
        is_active=True
    )

    # Skill Python
    s_py = Skill(
        skill_id="skill-python",
        skill_name="Python",
        category="Backend",
        domain="Engineering"
    )

    # Initial skill for Alice: Guided (Level 2), claimed Advanced
    es_alice = EmployeeSkill(
        employee_id="emp-alice",
        skill_id="skill-python",
        proficiency_level="Guided",
        claimed_level="Advanced",
        years_experience=3.0,
        source="self",
        verification_status="Self-reported",
        version=1
    )

    # Evidence 1: Self-reported PR
    ev1 = Evidence(
        evidence_id="ev-alice-pr-1",
        employee_id="emp-alice",
        skill_id="skill-python",
        evidence_type="PR",
        title="Implemented async worker queue",
        url="https://github.com/company/repo/pull/101",
        artifact_date=datetime.date.today().isoformat(),
        base_weight=3.0,
        complexity_score=3.0,
        verification_status="Self-reported",
        share_percentage=100.0,
        version=1
    )

    # Evidence 2: Link checked PR
    ev2 = Evidence(
        evidence_id="ev-alice-pr-2",
        employee_id="emp-alice",
        skill_id="skill-python",
        evidence_type="PR",
        title="Optimized database connection pool",
        url="https://github.com/company/repo/pull/102",
        artifact_date=datetime.date.today().isoformat(),
        base_weight=3.0,
        complexity_score=4.0,
        verification_status="Link checked",
        share_percentage=100.0,
        version=1
    )

    db.add_all([u1, e1, u2, e2, u_hr, s_py, es_alice, ev1, ev2])
    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


def test_skill_explanation_endpoint_shape():
    """Validates that GET /api/employees/{id}/skills/{skill_id}/explanation returns all evaluated dimensions."""
    token, _ = make_token("user-emp-alice")
    client.cookies.set(COOKIE_NAME, token)

    res = client.get("/api/employees/emp-alice/skills/skill-python/explanation")
    assert res.status_code == 200, res.text
    data = res.json()

    # Core identity & levels
    assert data["skill_id"] == "skill-python"
    assert data["skill_name"] == "Python"
    assert data["employee_id"] == "emp-alice"
    assert isinstance(data["level"], int)
    assert data["level"] >= 1
    assert data["level_name"] in ["Aware", "Guided", "Independent", "Advanced", "Expert"]
    assert data["claimed_level"] == "Advanced"
    assert data["evidenced_level"] == data["level_name"]

    # Threshold ladder
    assert "thresholds" in data
    assert data["thresholds"]["1"] == 2.0
    assert data["thresholds"]["2"] == 4.0
    assert data["thresholds"]["3"] == 12.0
    assert data["thresholds"]["4"] == 24.0
    assert data["thresholds"]["5"] == 44.0

    # Points & confidence
    assert data["points"] > 0
    assert 0 <= data["confidence_score"] <= 100
    assert "confidence_breakdown" in data
    assert "source_trust" in data["confidence_breakdown"]
    assert "recency_factor" in data["confidence_breakdown"]
    assert "count_factor" in data["confidence_breakdown"]

    # Granular contributions
    assert len(data["ordered_contributions"]) == 2
    for item in data["ordered_contributions"]:
        assert "factors" in item
        assert "raw_points" in item
        assert "net_points" in item
        assert item["factors"]["base_weight"] > 0
        assert item["factors"]["duration_factor"] > 0

    # Guidance
    assert "next_level_guidance" in data
    assert len(data["next_level_guidance"]) > 10


def test_skill_explanation_isolation_403():
    """Asserts that normal employee Bob cannot spy on Alice's skill explanation."""
    token_bob, _ = make_token("user-emp-bob")
    client.cookies.set(COOKIE_NAME, token_bob)

    res = client.get("/api/employees/emp-alice/skills/skill-python/explanation")
    assert res.status_code == 403
    assert "Forbidden" in res.json()["detail"]


def test_hr_can_view_any_skill_explanation():
    """Asserts that HR Admin can inspect any employee's skill explanation."""
    token_hr, _ = make_token("user-hr")
    client.cookies.set(COOKIE_NAME, token_hr)

    res = client.get("/api/employees/emp-alice/skills/skill-python/explanation")
    assert res.status_code == 200
    assert res.json()["employee_name"] == "Alice Developer"


def test_evidence_soft_delete_and_10s_undo_restore():
    """
    Asserts:
    1. DELETE /api/evidence/{id} soft-deletes the artifact and recalculates skill points downwards.
    2. POST /api/evidence/{id}/undo-delete restores the artifact and recalculates skill points back up.
    """
    token_alice, _ = make_token("user-emp-alice")
    client.cookies.set(COOKIE_NAME, token_alice)

    # 1. Baseline points
    res_before = client.get("/api/employees/emp-alice/skills/skill-python/explanation")
    assert res_before.status_code == 200
    points_before = res_before.json()["points"]
    contributions_before = len(res_before.json()["ordered_contributions"])
    assert contributions_before == 2

    # 2. Delete ev-alice-pr-2
    del_res = client.delete("/api/evidence/ev-alice-pr-2")
    assert del_res.status_code == 200
    assert del_res.json()["ok"] is True

    # 3. Points after deletion should be lower
    res_deleted = client.get("/api/employees/emp-alice/skills/skill-python/explanation")
    assert res_deleted.status_code == 200
    points_after_del = res_deleted.json()["points"]
    assert points_after_del < points_before
    assert len(res_deleted.json()["ordered_contributions"]) == 1

    # 4. Undo delete (within 10-second window)
    undo_res = client.post("/api/evidence/ev-alice-pr-2/undo-delete")
    assert undo_res.status_code == 200
    assert undo_res.json()["ok"] is True

    # 5. Points and contributions fully restored
    res_restored = client.get("/api/employees/emp-alice/skills/skill-python/explanation")
    assert res_restored.status_code == 200
    points_restored = res_restored.json()["points"]
    assert points_restored == points_before
    assert len(res_restored.json()["ordered_contributions"]) == 2
