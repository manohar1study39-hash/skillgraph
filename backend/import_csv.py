#!/usr/bin/env python3
"""
Idempotent CSV Import Script for SkillGraph V2 Data Layer.
Runs in DRY-RUN mode by default.
Generates a comprehensive report: rows read, rows accepted, rows rejected with reasons, and duplicate records.
"""

import os
import sys
import csv
import argparse
from typing import Dict, List, Any, Set, Tuple

# Ensure skillgraph directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.db import engine, SessionLocal, Base
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
    Certification,
    LearningResource,
    UpskillingProgress,
    ProjectApplication,
    ProjectShortlist,
    AuditLog,
)

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))


def load_csv(filename: str) -> List[Dict[str, str]]:
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        return [{k.strip(): v.strip() for k, v in row.items() if k} for row in reader]


def run_import(dry_run: bool = True) -> Dict[str, Any]:
    print("=" * 70)
    print(f"SKILLGRAPH V2 CSV IMPORT — {'DRY-RUN (NO CHANGES APPLIED)' if dry_run else 'EXECUTING REAL IMPORT'}")
    print("=" * 70)

    report: Dict[str, Dict[str, Any]] = {}

    def init_table_report(name: str):
        report[name] = {
            "read": 0,
            "valid": 0,
            "rejected": 0,
            "duplicates": 0,
            "reject_reasons": []
        }

    # Tracking sets for relational integrity and unique constraints
    known_user_ids: Set[str] = set()
    known_user_emails: Set[str] = set()
    known_emp_ids: Set[str] = set()
    known_emp_emails: Set[str] = set()
    known_skill_ids: Set[str] = set()
    known_role_ids: Set[str] = set()
    known_project_ids: Set[str] = set()
    known_resource_ids: Set[str] = set()

    # 1. Company Users
    init_table_report("company_users")
    user_rows = load_csv("company_users.csv")
    report["company_users"]["read"] = len(user_rows)
    valid_users = []
    for r in user_rows:
        uid = r.get("user_id")
        email = (r.get("email") or "").lower()
        if not uid or not email:
            report["company_users"]["rejected"] += 1
            report["company_users"]["reject_reasons"].append(f"Missing user_id or email: {r}")
            continue
        if email in known_user_emails or uid in known_user_ids:
            report["company_users"]["duplicates"] += 1
            report["company_users"]["reject_reasons"].append(f"Duplicate email or user_id: {email} / {uid}")
            continue
        known_user_ids.add(uid)
        known_user_emails.add(email)
        report["company_users"]["valid"] += 1
        valid_users.append(r)

    # 2. Skills
    init_table_report("skills")
    skill_rows = load_csv("skills.csv")
    report["skills"]["read"] = len(skill_rows)
    valid_skills = []
    known_skill_names: Set[str] = set()
    for r in skill_rows:
        sid = r.get("skill_id")
        name = (r.get("skill_name") or "").lower()
        if not sid or not name:
            report["skills"]["rejected"] += 1
            report["skills"]["reject_reasons"].append(f"Missing skill_id or name: {r}")
            continue
        if sid in known_skill_ids or name in known_skill_names:
            report["skills"]["duplicates"] += 1
            report["skills"]["reject_reasons"].append(f"Duplicate skill_id or name: {sid} / {name}")
            continue
        known_skill_ids.add(sid)
        known_skill_names.add(name)
        report["skills"]["valid"] += 1
        valid_skills.append(r)

    # 3. Roles
    init_table_report("roles")
    role_rows = load_csv("roles.csv")
    report["roles"]["read"] = len(role_rows)
    valid_roles = []
    for r in role_rows:
        rid = r.get("role_id")
        title = r.get("role_title")
        if not rid or not title:
            report["roles"]["rejected"] += 1
            report["roles"]["reject_reasons"].append(f"Missing role_id or title: {r}")
            continue
        if rid in known_role_ids:
            report["roles"]["duplicates"] += 1
            report["roles"]["reject_reasons"].append(f"Duplicate role_id: {rid}")
            continue
        known_role_ids.add(rid)
        report["roles"]["valid"] += 1
        valid_roles.append(r)

    # 4. Role Skills
    init_table_report("role_skills")
    role_skill_rows = load_csv("role_skills.csv")
    report["role_skills"]["read"] = len(role_skill_rows)
    valid_role_skills = []
    seen_role_skill_pairs: Set[Tuple[str, str]] = set()
    for r in role_skill_rows:
        rid = r.get("role_id")
        sid = r.get("skill_id")
        if not rid or not sid:
            report["role_skills"]["rejected"] += 1
            report["role_skills"]["reject_reasons"].append(f"Missing role_id or skill_id: {r}")
            continue
        if rid not in known_role_ids:
            report["role_skills"]["rejected"] += 1
            report["role_skills"]["reject_reasons"].append(f"Foreign key mismatch: role_id '{rid}' not found")
            continue
        if sid not in known_skill_ids:
            report["role_skills"]["rejected"] += 1
            report["role_skills"]["reject_reasons"].append(f"Foreign key mismatch: skill_id '{sid}' not found")
            continue
        pair = (rid, sid)
        if pair in seen_role_skill_pairs:
            report["role_skills"]["duplicates"] += 1
            report["role_skills"]["reject_reasons"].append(f"Duplicate role_skill pair: {pair}")
            continue
        seen_role_skill_pairs.add(pair)
        report["role_skills"]["valid"] += 1
        valid_role_skills.append(r)

    # 5. Employees
    init_table_report("employees")
    emp_rows = load_csv("employees.csv")
    report["employees"]["read"] = len(emp_rows)
    valid_employees = []
    for r in emp_rows:
        eid = r.get("employee_id")
        email = (r.get("email") or "").lower()
        if not eid or not email:
            report["employees"]["rejected"] += 1
            report["employees"]["reject_reasons"].append(f"Missing employee_id or email: {r}")
            continue
        if eid in known_emp_ids or email in known_emp_emails:
            report["employees"]["duplicates"] += 1
            report["employees"]["reject_reasons"].append(f"Duplicate employee_id or email: {eid} / {email}")
            continue
        known_emp_ids.add(eid)
        known_emp_emails.add(email)
        report["employees"]["valid"] += 1
        valid_employees.append(r)

    # 6. Projects
    init_table_report("projects")
    proj_rows = load_csv("projects.csv")
    report["projects"]["read"] = len(proj_rows)
    valid_projects = []
    for r in proj_rows:
        pid = r.get("project_id")
        name = r.get("project_name")
        if not pid or not name:
            report["projects"]["rejected"] += 1
            report["projects"]["reject_reasons"].append(f"Missing project_id or name: {r}")
            continue
        if pid in known_project_ids:
            report["projects"]["duplicates"] += 1
            report["projects"]["reject_reasons"].append(f"Duplicate project_id: {pid}")
            continue
        known_project_ids.add(pid)
        report["projects"]["valid"] += 1
        valid_projects.append(r)

    # 7. Employee Projects
    init_table_report("employee_projects")
    ep_rows = load_csv("employee_projects.csv")
    report["employee_projects"]["read"] = len(ep_rows)
    valid_employee_projects = []
    seen_ep_pairs: Set[Tuple[str, str]] = set()
    for r in ep_rows:
        eid = r.get("employee_id")
        pid = r.get("project_id")
        if not eid or not pid:
            report["employee_projects"]["rejected"] += 1
            report["employee_projects"]["reject_reasons"].append(f"Missing employee_id or project_id: {r}")
            continue
        if eid not in known_emp_ids:
            report["employee_projects"]["rejected"] += 1
            report["employee_projects"]["reject_reasons"].append(f"Foreign key mismatch: employee_id '{eid}' not found")
            continue
        if pid not in known_project_ids and pid not in known_role_ids:
            report["employee_projects"]["rejected"] += 1
            report["employee_projects"]["reject_reasons"].append(f"Foreign key mismatch: project_id '{pid}' not found")
            continue
        pair = (eid, pid)
        if pair in seen_ep_pairs:
            report["employee_projects"]["duplicates"] += 1
            report["employee_projects"]["reject_reasons"].append(f"Duplicate employee_project pair: {pair}")
            continue
        seen_ep_pairs.add(pair)
        report["employee_projects"]["valid"] += 1
        valid_employee_projects.append(r)

    # 8. Employee Skills
    init_table_report("employee_skills")
    es_rows = load_csv("employee_skills.csv")
    report["employee_skills"]["read"] = len(es_rows)
    valid_employee_skills = []
    seen_es_pairs: Set[Tuple[str, str]] = set()
    for r in es_rows:
        eid = r.get("employee_id")
        sid = r.get("skill_id")
        if not eid or not sid:
            report["employee_skills"]["rejected"] += 1
            report["employee_skills"]["reject_reasons"].append(f"Missing employee_id or skill_id: {r}")
            continue
        if eid not in known_emp_ids:
            report["employee_skills"]["rejected"] += 1
            report["employee_skills"]["reject_reasons"].append(f"Foreign key mismatch: employee_id '{eid}' not found")
            continue
        if sid not in known_skill_ids:
            report["employee_skills"]["rejected"] += 1
            report["employee_skills"]["reject_reasons"].append(f"Foreign key mismatch: skill_id '{sid}' not found")
            continue
        pair = (eid, sid)
        if pair in seen_es_pairs:
            report["employee_skills"]["duplicates"] += 1
            report["employee_skills"]["reject_reasons"].append(f"Duplicate employee_skill pair: {pair}")
            continue
        seen_es_pairs.add(pair)
        report["employee_skills"]["valid"] += 1
        valid_employee_skills.append(r)

    # 9. Evidence
    init_table_report("evidence")
    ev_rows = load_csv("evidence.csv")
    report["evidence"]["read"] = len(ev_rows)
    valid_evidence = []
    known_ev_ids: Set[str] = set()
    seen_emp_urls: Set[Tuple[str, str]] = set()
    for r in ev_rows:
        ev_id = r.get("evidence_id")
        eid = r.get("employee_id")
        sid = r.get("skill_id")
        url = (r.get("url") or "").strip()
        if not ev_id or not eid or not sid:
            report["evidence"]["rejected"] += 1
            report["evidence"]["reject_reasons"].append(f"Missing evidence_id, employee_id, or skill_id: {r}")
            continue
        if eid not in known_emp_ids:
            report["evidence"]["rejected"] += 1
            report["evidence"]["reject_reasons"].append(f"Foreign key mismatch: employee_id '{eid}' not found")
            continue
        if sid not in known_skill_ids:
            report["evidence"]["rejected"] += 1
            report["evidence"]["reject_reasons"].append(f"Foreign key mismatch: skill_id '{sid}' not found")
            continue
        if ev_id in known_ev_ids:
            report["evidence"]["duplicates"] += 1
            report["evidence"]["reject_reasons"].append(f"Duplicate evidence_id: {ev_id}")
            continue
        
        is_dup_url = False
        if url:
            emp_url_pair = (eid, url)
            if emp_url_pair in seen_emp_urls:
                report["evidence"]["duplicates"] += 1
                report["evidence"]["reject_reasons"].append(f"Duplicate URL for employee: {emp_url_pair}")
                is_dup_url = True
            else:
                seen_emp_urls.add(emp_url_pair)

        known_ev_ids.add(ev_id)
        report["evidence"]["valid"] += 1
        r["_is_duplicate_url"] = "true" if is_dup_url else "false"
        valid_evidence.append(r)

    # 10. Certifications
    init_table_report("certifications")
    cert_rows = load_csv("certifications.csv")
    report["certifications"]["read"] = len(cert_rows)
    valid_certs = []
    known_cert_ids: Set[str] = set()
    for r in cert_rows:
        cid = r.get("cert_id")
        eid = r.get("employee_id")
        if not cid or not eid:
            report["certifications"]["rejected"] += 1
            report["certifications"]["reject_reasons"].append(f"Missing cert_id or employee_id: {r}")
            continue
        if eid not in known_emp_ids:
            report["certifications"]["rejected"] += 1
            report["certifications"]["reject_reasons"].append(f"Foreign key mismatch: employee_id '{eid}' not found")
            continue
        if cid in known_cert_ids:
            report["certifications"]["duplicates"] += 1
            report["certifications"]["reject_reasons"].append(f"Duplicate cert_id: {cid}")
            continue
        known_cert_ids.add(cid)
        report["certifications"]["valid"] += 1
        valid_certs.append(r)

    # 11. Learning Resources
    init_table_report("learning_resources")
    res_rows = load_csv("learning_resources.csv")
    report["learning_resources"]["read"] = len(res_rows)
    valid_resources = []
    for r in res_rows:
        resid = r.get("resource_id")
        sid = r.get("skill_id")
        if not resid or not sid:
            report["learning_resources"]["rejected"] += 1
            report["learning_resources"]["reject_reasons"].append(f"Missing resource_id or skill_id: {r}")
            continue
        if sid not in known_skill_ids:
            report["learning_resources"]["rejected"] += 1
            report["learning_resources"]["reject_reasons"].append(f"Foreign key mismatch: skill_id '{sid}' not found")
            continue
        if resid in known_resource_ids:
            report["learning_resources"]["duplicates"] += 1
            report["learning_resources"]["reject_reasons"].append(f"Duplicate resource_id: {resid}")
            continue
        known_resource_ids.add(resid)
        report["learning_resources"]["valid"] += 1
        valid_resources.append(r)

    # 12. Upskilling Progress
    init_table_report("upskilling_progress")
    prog_rows = load_csv("upskilling_progress.csv")
    report["upskilling_progress"]["read"] = len(prog_rows)
    valid_progress = []
    seen_prog_keys: Set[Tuple[str, str, str]] = set()
    for r in prog_rows:
        eid = r.get("employee_id")
        rid = r.get("role_id")
        resid = r.get("resource_id")
        if not eid or not rid or not resid:
            report["upskilling_progress"]["rejected"] += 1
            report["upskilling_progress"]["reject_reasons"].append(f"Missing enrollment composite key: {r}")
            continue
        if eid not in known_emp_ids:
            report["upskilling_progress"]["rejected"] += 1
            report["upskilling_progress"]["reject_reasons"].append(f"Foreign key mismatch: employee_id '{eid}' not found")
            continue
        if rid not in known_role_ids:
            report["upskilling_progress"]["rejected"] += 1
            report["upskilling_progress"]["reject_reasons"].append(f"Foreign key mismatch: role_id '{rid}' not found")
            continue
        if resid not in known_resource_ids:
            report["upskilling_progress"]["rejected"] += 1
            report["upskilling_progress"]["reject_reasons"].append(f"Foreign key mismatch: resource_id '{resid}' not found")
            continue
        key = (eid, rid, resid)
        if key in seen_prog_keys:
            report["upskilling_progress"]["duplicates"] += 1
            report["upskilling_progress"]["reject_reasons"].append(f"Duplicate enrollment record: {key}")
            continue
        seen_prog_keys.add(key)
        report["upskilling_progress"]["valid"] += 1
        valid_progress.append(r)

    # 13. Project Applications
    init_table_report("project_applications")
    app_rows = load_csv("project_applications.csv")
    report["project_applications"]["read"] = len(app_rows)
    valid_apps = []
    seen_app_pairs: Set[Tuple[str, str]] = set()
    known_app_ids: Set[str] = set()
    for r in app_rows:
        aid = r.get("application_id")
        eid = r.get("employee_id")
        opp_id = r.get("opportunity_id")
        if not aid or not eid or not opp_id:
            report["project_applications"]["rejected"] += 1
            report["project_applications"]["reject_reasons"].append(f"Missing application_id, employee_id, or opp_id: {r}")
            continue
        if eid not in known_emp_ids:
            report["project_applications"]["rejected"] += 1
            report["project_applications"]["reject_reasons"].append(f"Foreign key mismatch: employee_id '{eid}' not found")
            continue
        pair = (eid, opp_id)
        if pair in seen_app_pairs:
            report["project_applications"]["duplicates"] += 1
            report["project_applications"]["reject_reasons"].append(f"Duplicate application for opportunity: {pair}")
            continue
        if aid in known_app_ids:
            report["project_applications"]["duplicates"] += 1
            report["project_applications"]["reject_reasons"].append(f"Duplicate application_id: {aid}")
            continue
        seen_app_pairs.add(pair)
        known_app_ids.add(aid)
        report["project_applications"]["valid"] += 1
        valid_apps.append(r)

    # 14. Project Shortlists
    init_table_report("project_shortlists")
    sl_rows = load_csv("project_shortlists.csv")
    report["project_shortlists"]["read"] = len(sl_rows)
    valid_shortlists = []
    seen_sl_pairs: Set[Tuple[str, str]] = set()
    for r in sl_rows:
        pid = r.get("project_id")
        eid = r.get("employee_id")
        if not pid or not eid:
            report["project_shortlists"]["rejected"] += 1
            report["project_shortlists"]["reject_reasons"].append(f"Missing project_id or employee_id: {r}")
            continue
        if eid not in known_emp_ids:
            report["project_shortlists"]["rejected"] += 1
            report["project_shortlists"]["reject_reasons"].append(f"Foreign key mismatch: employee_id '{eid}' not found")
            continue
        pair = (pid, eid)
        if pair in seen_sl_pairs:
            report["project_shortlists"]["duplicates"] += 1
            report["project_shortlists"]["reject_reasons"].append(f"Duplicate shortlist pair: {pair}")
            continue
        seen_sl_pairs.add(pair)
        report["project_shortlists"]["valid"] += 1
        valid_shortlists.append(r)

    # 15. Audit Log
    init_table_report("audit_log")
    audit_rows = load_csv("audit_log.csv")
    report["audit_log"]["read"] = len(audit_rows)
    valid_audit = []
    known_audit_ids: Set[str] = set()
    for r in audit_rows:
        ev_id = r.get("event_id")
        if not ev_id:
            report["audit_log"]["rejected"] += 1
            report["audit_log"]["reject_reasons"].append(f"Missing event_id: {r}")
            continue
        if ev_id in known_audit_ids:
            report["audit_log"]["duplicates"] += 1
            report["audit_log"]["reject_reasons"].append(f"Duplicate event_id: {ev_id}")
            continue
        known_audit_ids.add(ev_id)
        report["audit_log"]["valid"] += 1
        valid_audit.append(r)

    # Print Tabular Report
    print(f"{'Table':<24} | {'Read':<8} | {'Valid':<8} | {'Rejected':<10} | {'Duplicates':<10}")
    print("-" * 70)
    for table_name, counts in report.items():
        print(f"{table_name:<24} | {counts['read']:<8} | {counts['valid']:<8} | {counts['rejected']:<10} | {counts['duplicates']:<10}")

    total_read = sum(c["read"] for c in report.values())
    total_valid = sum(c["valid"] for c in report.values())
    total_rejected = sum(c["rejected"] for c in report.values())
    total_dups = sum(c["duplicates"] for c in report.values())

    print("-" * 70)
    print(f"{'TOTAL':<24} | {total_read:<8} | {total_valid:<8} | {total_rejected:<10} | {total_dups:<10}")
    print("=" * 70)

    # If any rejections, show details
    if total_rejected > 0 or total_dups > 0:
        print("\nDETAILS OF REJECTIONS & DUPLICATES:")
        for table_name, counts in report.items():
            if counts["reject_reasons"]:
                print(f"\n--- {table_name} ({len(counts['reject_reasons'])} issues) ---")
                for reason in counts["reject_reasons"][:10]:
                    print(f"  • {reason}")
                if len(counts["reject_reasons"]) > 10:
                    print(f"  ... and {len(counts['reject_reasons']) - 10} more.")

    # Execution phase if NOT dry_run
    if not dry_run:
        print("\nAPPLYING CHANGES TO DATABASE...")
        Base.metadata.create_all(bind=engine)
        session = SessionLocal()
        try:
            # Insert Company Users
            for r in valid_users:
                session.merge(CompanyUser(
                    user_id=r["user_id"],
                    name=r["name"],
                    email=r["email"].lower(),
                    password_hash=r["password_hash"],
                    role=r.get("role", "Employee"),
                    is_active=r.get("is_active", "true").lower() == "true",
                ))

            # Insert Skills
            for r in valid_skills:
                session.merge(Skill(
                    skill_id=r["skill_id"],
                    skill_name=r["skill_name"],
                    category=r.get("category", "General"),
                    domain=r.get("domain", ""),
                    synonyms=r.get("synonyms", ""),
                    related_skill_ids=r.get("related_skill_ids", "")
                ))

            # Insert Roles
            for r in valid_roles:
                session.merge(Role(
                    role_id=r["role_id"],
                    role_title=r["role_title"],
                    department=r.get("department", "Engineering"),
                    priority=r.get("priority", "Normal"),
                    status=r.get("status", "Open"),
                    min_availability_percent=float(r.get("min_availability_percent") or 40.0),
                    description=r.get("description", "")
                ))

            # Insert Role Skills
            for r in valid_role_skills:
                session.add(RoleSkill(
                    role_id=r["role_id"],
                    skill_id=r["skill_id"],
                    required_level=r.get("required_level", "Advanced"),
                    importance=r.get("importance", "Must")
                ))

            # Insert Employees
            # Link to user_id if matching email exists in company_users
            for r in valid_employees:
                email = r["email"].lower()
                user_match = next((u for u in valid_users if u["email"].lower() == email), None)
                uid = user_match["user_id"] if user_match else None
                session.merge(Employee(
                    employee_id=r["employee_id"],
                    user_id=uid,
                    name=r["name"],
                    email=email,
                    title=r.get("title", "Software Engineer"),
                    department=r.get("department", "Engineering"),
                    team=r.get("team", "Core Platform"),
                    location=r.get("location", "Remote"),
                    manager_id=r.get("manager_id", ""),
                    hire_date=r.get("hire_date", ""),
                    availability_percent=float(r.get("availability_percent") or 80.0),
                    hours_per_week_free=float(r.get("hours_per_week_free") or 32.0),
                    last_active_date=r.get("last_active_date", ""),
                    current_workload_percent=float(r.get("current_workload_percent") or 20.0),
                ))

            # Insert Projects
            for r in valid_projects:
                session.merge(Project(
                    project_id=r["project_id"],
                    project_name=r["project_name"],
                    domain=r.get("domain", "Engineering"),
                    complexity=float(r.get("complexity") or 3.0),
                    technologies=r.get("technologies", ""),
                    start_date=r.get("start_date", ""),
                    end_date=r.get("end_date", "")
                ))

            # Insert Employee Projects
            for r in valid_employee_projects:
                # Handle project_id referencing role or project
                pid = r["project_id"]
                if pid not in known_project_ids:
                    continue
                session.add(EmployeeProject(
                    employee_id=r["employee_id"],
                    project_id=pid,
                    role=r.get("role", "Contributor"),
                    contribution_summary=r.get("contribution_summary", "")
                ))

            # Insert Employee Skills
            for r in valid_employee_skills:
                # Map old source / verified status to clean V2 statuses
                raw_verified = r.get("verified", "").lower() == "true"
                raw_source = r.get("source", "self").lower()
                # Statuses: Self-reported, Link checked, Verified by HR, Rejected, Needs info
                if raw_source == "github":
                    v_status = "Link checked"
                elif raw_verified and raw_source != "self":
                    v_status = "Verified by HR"
                else:
                    v_status = "Self-reported"

                session.add(EmployeeSkill(
                    employee_id=r["employee_id"],
                    skill_id=r["skill_id"],
                    proficiency_level=r.get("proficiency_level", "Independent"),
                    claimed_level=r.get("proficiency_level"),
                    years_experience=float(r.get("years_experience") or 1.0),
                    source=raw_source,
                    verification_status=v_status,
                    last_used_date=r.get("last_used_date", "")
                ))

            # Insert Evidence
            for r in valid_evidence:
                ev_type = r.get("evidence_type", "PR")
                raw_weight = float(r.get("weight") or 1.0)
                # Map verification status accurately:
                if ev_type in ["PR", "commit"] and "github" in (r.get("url") or "").lower():
                    v_status = "Link checked"
                elif ev_type == "cert":
                    v_status = "Link checked"
                else:
                    v_status = "Self-reported"

                pid = r.get("project_id")
                if pid and pid not in known_project_ids:
                    pid = None

                session.merge(Evidence(
                    evidence_id=r["evidence_id"],
                    employee_id=r["employee_id"],
                    skill_id=r["skill_id"],
                    project_id=pid,
                    evidence_type=ev_type,
                    title=r.get("title", "Evidence Artifact"),
                    url=r.get("url", ""),
                    artifact_date=r.get("date", "2026-01-01"),
                    base_weight=raw_weight,
                    complexity_score=float(r.get("project_complexity") or 3.0),
                    verification_status=v_status,
                    share_percentage=100.0,
                    is_duplicate=r.get("_is_duplicate_url") == "true"
                ))

            # Insert Certifications
            for r in valid_certs:
                session.merge(Certification(
                    cert_id=r["cert_id"],
                    employee_id=r["employee_id"],
                    skill_id=r.get("skill_id") if r.get("skill_id") in known_skill_ids else None,
                    cert_name=r.get("cert_name", "Professional Certificate"),
                    issuer=r.get("issuer", "Certification Provider"),
                    issued_date=r.get("issued_date", ""),
                    expiry_date=r.get("expiry_date", "")
                ))

            # Insert Learning Resources
            for r in valid_resources:
                session.merge(LearningResource(
                    resource_id=r["resource_id"],
                    skill_id=r["skill_id"],
                    title=r.get("title", ""),
                    provider=r.get("provider", "Internal Academy"),
                    type=r.get("type", "course"),
                    mentor_employee_id=r.get("mentor_employee_id") if r.get("mentor_employee_id") in known_emp_ids else None,
                    duration_weeks=r.get("duration_weeks", "2"),
                    estimated_hours=float(int(r.get("duration_weeks", "2") or 2) * 8.0),
                    target_level=r.get("target_level", "Advanced")
                ))

            # Insert Upskilling Progress
            for r in valid_progress:
                session.add(UpskillingProgress(
                    employee_id=r["employee_id"],
                    role_id=r["role_id"],
                    resource_id=r["resource_id"],
                    status=r.get("status", "Not started"),
                    progress_percent=float(r.get("progress_percent") or 0.0),
                    hours_logged=float(r.get("progress_percent") or 0.0) * 0.16,
                    approval_status="Approved" if r.get("status", "").lower() == "done" else "Pending"
                ))

            # Insert Project Applications
            for r in valid_apps:
                session.merge(ProjectApplication(
                    application_id=r["application_id"],
                    opportunity_id=r["opportunity_id"],
                    opportunity_type=r.get("opportunity_type", "project"),
                    employee_id=r["employee_id"],
                    employee_name=r.get("employee_name", ""),
                    note=r.get("note", ""),
                    hours_per_week=float(r.get("hours_per_week") or 10.0),
                    applied_at=r.get("applied_at", "2026-01-01"),
                    status=r.get("status", "Pending")
                ))

            # Insert Project Shortlists
            for r in valid_shortlists:
                session.add(ProjectShortlist(
                    project_id=r["project_id"],
                    employee_id=r["employee_id"],
                    shortlisted_by=r.get("shortlisted_by", ""),
                    shortlisted_at=r.get("shortlisted_at", ""),
                    note=r.get("note", "")
                ))

            # Insert Audit Log
            for r in valid_audit:
                session.merge(AuditLog(
                    event_id=r["event_id"],
                    event_type=r.get("event_type", "EVENT"),
                    actor_id=r.get("actor_id"),
                    actor_email=r.get("actor_email"),
                    target_id=r.get("target_id"),
                    target_email=r.get("target_email"),
                    ip=r.get("ip"),
                    timestamp=r.get("timestamp", ""),
                    details=r.get("details", "")
                ))

            session.commit()
            print("\nREAL IMPORT COMMITTED SUCCESSFULLY!")
        except Exception as e:
            session.rollback()
            print(f"\nIMPORT FAILED! Transaction rolled back. Error: {e}")
            raise
        finally:
            session.close()

    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SkillGraph V2 CSV Import Script")
    parser.add_argument("--execute", action="store_true", help="Execute real import into database (default: dry run)")
    args = parser.parse_args()

    run_import(dry_run=not args.execute)
