import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError
from backend.db import Base
from backend.models import (
    CompanyUser,
    Employee,
    Skill,
    Role,
    RoleSkill,
    Project,
    EmployeeSkill,
    Evidence,
    ProjectApplication,
    AuditLog,
)
from backend.import_csv import run_import

TEST_DB_URL = "sqlite:///:memory:"


@pytest.fixture
def db_session():
    engine = create_engine(TEST_DB_URL)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_unique_constraint_employee_skill(db_session):
    emp = Employee(employee_id="emp-test-1", name="Test User", email="test1@company.com")
    sk = Skill(skill_id="skill-py", skill_name="Python", category="Engineering")
    db_session.add_all([emp, sk])
    db_session.commit()

    es1 = EmployeeSkill(employee_id="emp-test-1", skill_id="skill-py", proficiency_level="Independent")
    db_session.add(es1)
    db_session.commit()

    # Second skill for same employee and skill must raise IntegrityError
    es2 = EmployeeSkill(employee_id="emp-test-1", skill_id="skill-py", proficiency_level="Advanced")
    db_session.add(es2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_unique_constraint_employee_opportunity(db_session):
    emp = Employee(employee_id="emp-test-2", name="Applicant User", email="test2@company.com")
    db_session.add(emp)
    db_session.commit()

    app1 = ProjectApplication(
        application_id="app-1",
        opportunity_id="proj-100",
        employee_id="emp-test-2",
        applied_at="2026-10-01"
    )
    db_session.add(app1)
    db_session.commit()

    app2 = ProjectApplication(
        application_id="app-2",
        opportunity_id="proj-100",
        employee_id="emp-test-2",
        applied_at="2026-10-02"
    )
    db_session.add(app2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_soft_delete_behavior(db_session):
    emp = Employee(employee_id="emp-test-3", name="Soft Delete User", email="test3@company.com")
    db_session.add(emp)
    db_session.commit()

    assert emp.deleted_at is None
    assert not emp.is_deleted

    import datetime
    emp.deleted_at = datetime.datetime.utcnow()
    db_session.commit()

    assert emp.is_deleted


def test_dry_run_import_report():
    report = run_import(dry_run=True)
    assert "employees" in report
    assert report["employees"]["read"] == 203
    assert report["employees"]["valid"] == 203
    assert report["employees"]["rejected"] == 0
    assert report["skills"]["valid"] == 10
    assert report["company_users"]["valid"] == 17
