"""
Phase 1 Test: Validates that no two employees ever render with an identical label in any list or in the graph.
Enforces the display_label disambiguation rule:
  - "Name" when unique across the organization
  - "Name (Department, City)" when multiple employees share a name
  - "Name (Department, City) - Suffix" if department and city are also identical
"""

import pytest
from sqlalchemy.orm import Session
from backend.db import get_db, SessionLocal
from backend.models import Employee
from backend.services.common import get_employee_display_label


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_no_two_employees_render_identical_display_label_in_db(db: Session):
    """
    Empirical test: Evaluates every active employee in the database and verifies that
    all generated display labels are strictly unique.
    """
    employees = db.query(Employee).filter(Employee.deleted_at == None).all()
    assert len(employees) > 0, "Database must contain employees"

    labels = [get_employee_display_label(emp, all_employees=employees) for emp in employees]

    assert len(labels) == len(set(labels)), (
        f"Duplicate display labels detected! Total: {len(labels)}, Unique: {len(set(labels))}. "
        f"Duplicates: {[l for l in labels if labels.count(l) > 1]}"
    )


def test_display_label_disambiguation_rule_scenarios():
    """
    Tests specific scenarios of the display_label rule:
    1. Unique name -> "Name"
    2. Same name, different departments -> "Name (Department, City)"
    3. Same name, same department and city -> "Name (Department, City) - Suffix"
    """
    class MockEmployee:
        def __init__(self, emp_id, name, department, location):
            self.employee_id = emp_id
            self.name = name
            self.department = department
            self.location = location

    e1 = MockEmployee("emp-101", "Alice Smith", "Engineering", "New York")
    e2 = MockEmployee("emp-102", "Bob Jones", "Product", "San Francisco")
    e3 = MockEmployee("emp-103", "Bob Jones", "Marketing", "London")
    e4 = MockEmployee("emp-104", "Charlie Brown", "Finance", "Chicago")
    e5 = MockEmployee("emp-105", "Charlie Brown", "Finance", "Chicago")

    all_mock = [e1, e2, e3, e4, e5]

    # Unique name
    assert get_employee_display_label(e1, all_employees=all_mock) == "Alice Smith"

    # Same name, different department/location
    assert get_employee_display_label(e2, all_employees=all_mock) == "Bob Jones (Product, San Francisco)"
    assert get_employee_display_label(e3, all_employees=all_mock) == "Bob Jones (Marketing, London)"

    # Same name, same department and location -> disambiguated by ID suffix
    lbl_e4 = get_employee_display_label(e4, all_employees=all_mock)
    lbl_e5 = get_employee_display_label(e5, all_employees=all_mock)

    assert lbl_e4 != lbl_e5
    assert lbl_e4 == "Charlie Brown (Finance, Chicago) - e104" or lbl_e4.startswith("Charlie Brown (Finance, Chicago)")
    assert lbl_e5 == "Charlie Brown (Finance, Chicago) - e105" or lbl_e5.startswith("Charlie Brown (Finance, Chicago)")

    all_labels = [get_employee_display_label(e, all_employees=all_mock) for e in all_mock]
    assert len(all_labels) == len(set(all_labels)), "All mock employee labels must be unique"
