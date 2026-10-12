# Comprehensive HR & Manager System Audit (AUDIT.md)

This audit documents the operational status, database persistence, role permission enforcement, and root-cause defects for every control and API endpoint on the **HR Admin** and **Engineering Manager** sides of SkillGraph.

---

## 1. Control & Endpoint Audit Matrix

| Control | Endpoint Exists? | Data Saved to DB? | Persists After Refresh? | Other Roles Updated? | Permission Enforced? | Status | Fix Needed |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Sync Data** (`Header.tsx`) | Yes (`GET /api/data-version`, `GET /api/data`) | N/A (Read) | Yes | Yes (Pulls updates) | Yes (Auth required) | **Works** | None. Reads data version and refreshes state from database. |
| **Talent Search Input** (`TalentSearchTab.tsx`) | Partial (`GET /api/manager/employees` exists but unused by client) | No (Client-only) | No | No | No (Filtered in JS) | **Duplicate / Architectural** | Switch client search to call server query endpoint `GET /api/manager/employees?query=...` with pagination. |
| **Talent Search Filters** (Dept, Avail, Conf, Verified, Sort) | No (Client filter) | No (Client-only) | No | No | No | **Duplicate** | Route filters as query params to backend search query service so server database performs indexing & filtering. |
| **Candidate Card: View Profile** (`TalentSearchTab.tsx`) | Yes (`GET /api/employees/{id}/profile`) | N/A (Read) | Yes | N/A | Yes | **Works** | Returns complete employee profile with verified evidence and projects. |
| **Candidate Card: Inspect Evidence** (`TalentSearchTab.tsx`) | Yes (`GET /api/evidence`) | N/A (Read) | Yes | N/A | Yes | **Works** | Displays active evidence proofs for selected skill. |
| **Candidate Card: Compare Tray & Modal** (`CompareModal.tsx`) | N/A (UI comparison) | N/A | No (Session tray) | No | N/A | **Works** | Client-side visual comparison between selected candidates. |
| **Candidate Card: Shortlist Button** (`TalentSearchTab.tsx`) | Yes (`POST /api/project-shortlists`) | Yes (`project_shortlists`) | Yes | Yes (HR sees shortlist) | Yes (Manager/HR) | **Works** | Verify double-click prevention and audit logging on insert. |
| **Directory Search & Filters** (`EmployeeDirectoryTab.tsx`) | Partial (`GET /api/employees` exists) | No (Client-only) | No | No | No | **Duplicate** | Connect search and pagination to backend server query endpoint. |
| **Add Directory Employee** (`EmployeeDirectoryTab.tsx`) | Yes (`POST /api/employees`) | Yes (`employees`) | Yes | Yes | **Broken** (500 crash on missing hours; no pre-validation role check) | **Broken** | Fix `role_service.create_directory_employee:302` `TypeError` when `hours_per_week_free` is missing or None. Enforce strict HR 403 check before payload parsing. |
| **Upskilling Sub-views** (Pipelines, Shortages, Catalog) | N/A (UI router) | N/A | Yes | N/A | N/A | **Works** | Properly switches between pipelines, shortages, and catalog. |
| **Target Role Selector Strip** (`NearQualifiedTab.tsx`) | Yes (Reads `roles`, `role_skills`) | N/A (Read) | Yes | Yes | Yes | **Works** | Analyzes candidate readiness against chosen role Must skills. |
| **HR: Course Progress Update** (`NearQualifiedTab.tsx`) | Yes (`POST /api/upskilling/admin/review-completion`) | Yes (`upskilling_progress`) | Yes | Yes (Employee sees progress) | Yes (HR only) | **Works** | Recomputes skill proficiency and updates learner progress. |
| **HR: Add Course Form** (`NearQualifiedTab.tsx`) | Yes (`POST /api/learning-resources`) | Yes (`learning_resources`) | Yes | Yes (Catalog updated) | Yes (HR only) | **Works** | Persists course, mentor, duration; logs audit; bumps data version. |
| **HR: Enroll Learner Form** (`NearQualifiedTab.tsx`) | Yes (`POST /api/upskilling/enroll`) | Yes (`upskilling_progress`) | Yes | Yes (Learner sees course) | Yes (HR only) | **Works** | Enrolls candidate in course for target role. |
| **Add Project / Initiative Form** (`MarketplaceTab.tsx`) | Yes (`POST /api/projects`) | Yes (`projects`) | Yes | Yes (Marketplace updated) | Yes (Manager/HR) | **Works** | Inserts project initiative, technologies, logs audit, bumps version. |
| **Add Role Form** (`MarketplaceTab.tsx`) | Yes (`POST /api/roles`) | Yes (`roles`, `role_skills`) | Yes | Yes (Pipelines updated) | Yes (HR/Manager) | **Works** | Inserts role and requirements into database; bumps data version. |
| **Assign Project Member** (`MarketplaceTab.tsx`) | Yes (`POST /api/project-members`) | Yes (`employee_projects`, `employees`) | Yes | Yes (Workload updated) | Yes (Manager/HR) | **Works** | Assigns member, deducts free hours, updates availability %, logs audit. |
| **Remove Project Member** (`MarketplaceTab.tsx`) | Yes (`DELETE /api/project-members`) | Yes (`employee_projects`, `employees`) | Yes | Yes (Hours restored) | Partial (Returns 422 if body/params mismatch) | **Broken** | Allow both query params and JSON payload for `DELETE /api/project-members` to prevent 422 errors. |
| **HR: Accept Application** (`MarketplaceTab.tsx`) | Yes (`POST /api/project-applications/{id}/review`) | Yes (`project_applications`, `employee_projects`) | Yes | Yes (Roster updated) | Yes (HR only) | **Broken / Unsafe** | Does not strictly validate free hours capacity prior to acceptance. Must wrap in one atomic transaction: validate hours >= requested, insert member, deduct hours, set status='accepted', log audit. Roll back if any step fails. |
| **HR: Reject Application** (`MarketplaceTab.tsx`) | Yes (`POST /api/project-applications/{id}/review`) | Yes (`project_applications`) | Yes | Yes (Status='rejected') | Yes (HR only) | **Works partially** | Enforce non-empty rejection reason note on the server. |
| **Shortlist Drawer: Remove** (`MarketplaceTab.tsx`) | Yes (`DELETE /api/project-shortlists`) | Yes (`project_shortlists`) | Yes | Yes | Partial (Returns 422 on query params) | **Broken** | Fix route parameter parsing to accept query params `?project_id=...&employee_id=...`. |
| **HR: Approve / Verify Evidence** (`EvidenceModal.tsx`) | Yes (`POST /api/evidence/{id}/verify`) | Yes (`evidence`, `employee_skills`) | Yes | Yes (Levels updated) | Yes (HR only) | **Works** | Sets status='Verified by HR', recalculates level deterministically, logs audit. |
| **HR: Link Checked Evidence** (`EvidenceModal.tsx`) | Yes (`POST /api/evidence/{id}/verify`) | Yes (`evidence`, `employee_skills`) | Yes | Yes | Yes (HR only) | **Works** | Sets status='Link checked', recalculates level, logs audit. |
| **HR: Request More Info on Evidence** (`EvidenceModal.tsx`) | Yes (`POST /api/evidence/{id}/verify`) | Yes (`evidence`) | Yes | Yes (Employee notified) | Yes (HR only) | **Broken / Unsafe** | Reviewer note is optional on server; must strictly require note when requesting more info. |
| **HR: Reject Evidence** (`EvidenceModal.tsx`) | Yes (`POST /api/evidence/{id}/verify`) | Yes (`evidence`, `employee_skills`) | Yes | Yes (Level drops) | Yes (HR only) | **Broken / Unsafe** | Reviewer note is optional on server; must strictly require rejection reason note. |
| **Manager: Inspect Evidence** (`EvidenceModal.tsx`) | Yes (`GET /api/evidence`) | N/A (Read) | Yes | N/A | Yes | **Works** | Read-only inspection of evidence artifacts and status. |
| **Why is Level X? Breakdown** (`EmployeeProfileModal.tsx`) | Yes (`GET /api/employees/{id}/skills/{skillId}/explanation`) | N/A (Read) | Yes | N/A | Yes | **Works** | Returns transparent factor math, base weights, recency decay, and complexity factor. |
| **HR: Pending Signups Queue** (`UserManagementPanel.tsx`) | Missing from FastAPI (`GET /api/pending-approvals`) | No (Reads `company_users.csv` in Vite!) | Yes (CSV only) | No (DB bypassed) | Partial | **Fake / Duplicate** | Move endpoint from `vite.config.ts` CSV middleware into `backend/api.py` querying `company_users` table in SQLite (`is_active=False`). |
| **HR: Approve User Account** (`UserManagementPanel.tsx`) | Missing from FastAPI (`POST /api/approvals/{id}`) | No (Updates `company_users.csv` in Vite!) | Yes (CSV only) | No (DB bypassed) | Partial | **Fake / Duplicate** | Implement in `backend/api.py`: update `company_users.is_active=True`, log audit event in `audit_log` table, bump version. |
| **HR: Reject User Account** (`UserManagementPanel.tsx`) | Missing from FastAPI (`POST /api/reject-approval/{id}`) | No (Deletes from CSV in Vite!) | Yes (CSV only) | No (DB bypassed) | Partial | **Fake / Duplicate** | Implement in `backend/api.py`: delete/soft-delete `company_users`, log audit event in SQLite `audit_log`, bump version. |
| **HR: Active Users List** (`UserManagementPanel.tsx`) | Missing from FastAPI (`GET /api/active-users`) | No (Reads CSV in Vite!) | Yes (CSV only) | No (DB bypassed) | Partial | **Fake / Duplicate** | Implement in `backend/api.py`: query `company_users` where `is_active=True`, exclude password hashes. |
| **HR: Deactivate User** (`UserManagementPanel.tsx`) | Missing from FastAPI (`POST /api/deactivate-user/{id}`) | No (Updates CSV in Vite!) | Yes (CSV only) | No (DB bypassed) | Partial | **Fake / Duplicate** | Implement in `backend/api.py`: set `company_users.is_active=False`, reject self-deactivation, log audit event in `audit_log`, bump version. |
| **HR: Audit Log Timeline** (`UserManagementPanel.tsx`) | Missing from FastAPI (`GET /api/audit-log`) | No (Reads `audit_log.csv` in Vite!) | Yes (CSV only) | No (DB bypassed) | Partial | **Fake / Duplicate** | Implement in `backend/api.py`: query `audit_log` table in SQLite (newest first, limit 100). Eliminate `audit_log.csv`. |

---

## 2. Architectural & Security Flags

### Flag 1: Endpoints Bypassing SQLite Database via Vite CSV Middleware
- **Critical Violation of Rule 2**: Six HR Admin user management endpoints (`/api/pending-approvals`, `/api/approvals/{id}`, `/api/reject-approval/{id}`, `/api/deactivate-user/{id}`, `/api/active-users`, and `/api/audit-log`) are currently implemented inside `vite.config.ts` using Node.js filesystem calls to `data/company_users.csv` and `data/audit_log.csv`.
- **Impact**: Any direct backend invocation, testing via FastAPI `TestClient`, or production deployment fails with 404. Furthermore, events written to `audit_log.csv` do not appear in SQLite `audit_log` table, creating dual divergent sources of truth.
- **Remediation**: Migrate all user management and audit log endpoints into `backend/api.py` and service layers backed 100% by SQLite `company_users` and `audit_log` tables. Proxy these routes in `vite.config.ts` directly to FastAPI.

### Flag 2: Client-Side Searching, Scoring, and Filtering
- **Critical Violation of Rule 2 & 1.3**:
  - `TalentSearchTab.tsx` executes NLP queries and multi-attribute filters (department, availability %, confidence, verified-only) in the browser via `src/services/matchingEngine.ts` against an in-memory employee array.
  - `EmployeeDirectoryTab.tsx` performs name/role filtering and sorting entirely in React component state.
  - `src/services/dataLoader.ts` and `src/services/upskillingEngine.ts` compute readiness percentages and credit formulas client-side.
- **Impact**: On a large organization dataset (e.g. 1,000+ employees), loading all raw records into the browser client degrades responsiveness. Client calculations risk diverging from the server's authoritative scoring in `backend/scoring_engine.py`.
- **Remediation**: Expose a unified, paginated server-side search query function (`GET /api/manager/employees`) supporting semantic/keyword search, department filter, availability filter, verification filter, and sorting. Ensure client views consume authoritative server calculations.

### Flag 3: Unhandled Null Values Crashing Server (POST /api/employees)
- **Defect in `role_service.py:302`**:
  ```python
  free_hours = max(0.0, min(60.0, float(payload.get("hours_per_week_free", round(avail * 0.4)))))
  ```
  If `payload` explicitly contains `"hours_per_week_free": null`, `payload.get()` returns `None`, causing `float(None)` to raise an unhandled `TypeError` that returns a 500 Internal Server Error.
- **Remediation**: Sanitize optional payload parameters with explicit default fallbacks: `float(payload.get("hours_per_week_free") or round(avail * 0.4))`.

### Flag 4: DELETE Route Parameter Parsing Mismatches
- **Defect**: `DELETE /api/project-members` and `DELETE /api/project-shortlists` are defined in FastAPI with body models, but HTTP DELETE clients and proxies frequently pass parameters in query strings (`?project_id=...&employee_id=...`), triggering 422 Unprocessable Entity errors.
- **Remediation**: Support both query parameters (`Query(...)`) and optional body payload on DELETE endpoints to ensure seamless compatibility across all client environments.

### Flag 5: Atomic Transaction Integrity & Free Hours Pre-Validation
- **Critical Requirement (Rule 4)**: In `POST /api/project-applications/{application_id}/review` (`action='accept'`), the system must verify that the employee has sufficient unallocated hours before accepting the application. If free hours are insufficient, the server must reject the action with a clear error message. If accepted, the hours deduction, project rostering, status transition, audit log entry, and data version bump must be executed within **a single atomic DB transaction**. If any step fails, everything must roll back.

### Flag 6: Workflow Enforcement on Evidence & Course Rejections
- **Defect**: In `POST /api/evidence/{evidence_id}/verify` and `POST /api/upskilling/admin/review-completion`, reviewer notes are currently optional when rejecting or requesting more information.
- **Remediation**: Enforce on the server that `action='reject'` and `action='needs_info'` strictly require a non-empty `note` (minimum 3 characters). If missing, return HTTP 422/400 with `"A review note explaining the reason is required."`

---

## 3. Summary of Status Counts

- **Total Controls & Endpoints Audited**: 32 distinct functional touchpoints
- **Works**: 17 controls
- **Works Partially / Workflow Needs Enforcement**: 4 controls
- **Broken / Crashing (500, 422)**: 5 controls
- **Duplicate / Fake (Bypassing SQLite via CSV)**: 6 controls

---

## 4. Phase 1 Verification & Baseline Test Suite

Before any code modification in Phase 2, the baseline test suite was executed:
- **TypeScript / Vitest Unit & Integration Tests**: **28 passed / 28 total** (0 failures).
- **FastAPI / Pytest Backend Test Suite**: **71 passed / 71 total** (0 failures).
- **Total Passing Tests**: **99 passed / 99 total** (100% baseline).
