"""
Authentication and authorization middleware for SkillGraph V2.
Verifies signed HMAC-SHA256 session cookies, loads CompanyUser and Employee records,
and enforces that employee identity ALWAYS comes from the auth token.
"""

import os
import json
import base64
import hmac
import hashlib
import time
from typing import Optional, Tuple
from fastapi import Request, HTTPException, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from .db import get_db
from .models import CompanyUser, Employee

COOKIE_NAME = "skillgraph_session"
SECRET = os.environ.get(
    "SKILLGRAPH_SESSION_SECRET",
    "7DEC98651055A83F20E35F295D1C28EDD51C10DA7AAF12CC3C1F5CD4FDC9BFF8"
)


def base64url_decode(input_str: str) -> bytes:
    rem = len(input_str) % 4
    if rem > 0:
        input_str += "=" * (4 - rem)
    return base64.urlsafe_b64decode(input_str)


def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


def sign(value: str, secret: str = SECRET) -> str:
    digest = hmac.new(secret.encode("utf-8"), value.encode("utf-8"), hashlib.sha256).digest()
    return base64url_encode(digest)


def make_token(user_id: str, remember_me: bool = False, secret: str = SECRET) -> Tuple[str, int]:
    max_age = 30 * 24 * 60 * 60 if remember_me else 8 * 60 * 60
    exp = int(time.time() * 1000) + max_age * 1000
    payload_dict = {"user_id": user_id, "exp": exp}
    payload_str = base64url_encode(json.dumps(payload_dict).encode("utf-8"))
    signature = sign(payload_str, secret)
    return f"{payload_str}.{signature}", max_age


def read_session_from_cookie(cookie_value: Optional[str], db: Session) -> Optional[CompanyUser]:
    if not cookie_value or "." not in cookie_value:
        return None
    try:
        payload_str, signature = cookie_value.split(".", 1)
        expected_sig = sign(payload_str)
        if not hmac.compare_digest(signature, expected_sig):
            return None
        data = json.loads(base64url_decode(payload_str).decode("utf-8"))
        if data.get("exp", 0) <= int(time.time() * 1000):
            return None
        user_id = data.get("user_id")
        if not user_id:
            return None
        user = db.query(CompanyUser).filter(
            CompanyUser.user_id == user_id,
            CompanyUser.is_active == True,
            CompanyUser.deleted_at == None
        ).first()
        return user
    except Exception:
        return None


def get_current_user(request: Request, db: Session = Depends(get_db)) -> CompanyUser:
    cookie = request.cookies.get(COOKIE_NAME)
    # Also support Authorization: Bearer <token>
    auth_header = request.headers.get("Authorization")
    if not cookie and auth_header and auth_header.startswith("Bearer "):
        cookie = auth_header[7:].strip()

    user = read_session_from_cookie(cookie, db)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return user


def get_current_employee(
    current_user: CompanyUser = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Employee:
    """
    Resolves the Employee record bound strictly to the authenticated CompanyUser.
    Guarantees employee identity always comes from auth token.
    """
    # 0. Canonical mapping for demo / Alex Chen employee accounts
    if (
        current_user.email.lower() in ("employee@skillgraph.demo", "employee@gmail.com", "alex.chen@company.com")
        or current_user.user_id in ("user-employee-demo", "user-employee-alex", "user-employee-gmail")
    ):
        emp_1 = db.query(Employee).filter(Employee.employee_id == "emp-1").first()
        if emp_1:
            if emp_1.user_id != current_user.user_id:
                emp_1.user_id = current_user.user_id
                try:
                    db.commit()
                except Exception:
                    db.rollback()
            return emp_1

    # 1. Direct foreign key link
    employee = db.query(Employee).filter(
        Employee.user_id == current_user.user_id,
        Employee.deleted_at == None
    ).first()

    # 2. Match by verified email (case-insensitive)
    if not employee:
        employee = db.query(Employee).filter(
            func.lower(Employee.email) == current_user.email.lower()
        ).first()
        if employee:
            if employee.user_id != current_user.user_id:
                employee.user_id = current_user.user_id
                db.commit()

    if not employee:
        # Create dedicated employee record for user if missing
        new_emp_id = f"emp-{current_user.user_id[:8]}"
        employee = Employee(
            employee_id=new_emp_id,
            user_id=current_user.user_id,
            name=current_user.name,
            email=current_user.email.lower(),
            title="Software Engineer",
            department="Engineering",
            team="Core Platform",
            location="Remote",
            availability_percent=80.0,
            hours_per_week_free=32.0,
            last_active_date=time.strftime("%Y-%m-%d"),
            current_workload_percent=20.0
        )
        db.add(employee)
        try:
            db.commit()
            db.refresh(employee)
        except Exception:
            db.rollback()
            employee = db.query(Employee).filter(
                func.lower(Employee.email) == current_user.email.lower()
            ).first()
            if employee:
                employee.user_id = current_user.user_id
                db.commit()

    return employee
