# SkillGraph V2 — Phase 2 Changelog & Defect Remediations

**Release Date**: October 2026  
**Scope**: HR Admin and Engineering Manager Workflows, API Endpoints, and Database Integrity  

---

## 1. Summary of Changes

Phase 2 addressed every architectural flaw, broken route, dead button, and CSV bypass identified during the Phase 1 comprehensive audit. All 32 controls are now directly powered by the SQLite database (`data/skillgraph.db`), guarded by server-enforced role authorization, protected by optimistic concurrency control (HTTP 409), and wrapped in atomic transactions.

### October 2026 Upskilling & Gaps Overhaul, Notifications Feed & Assigned Projects
1. **Org Shortages in Upskilling & Gaps (HR & Manager Portals)**:
   - **Executive Workforce Intelligence Dashboard**: Overhauled `subView === 'shortages'` from a basic gap list into an actionable executive intelligence dashboard.
   - **Strategic KPI Metrics Strip**: Displays Total Shortage Areas, 🚨 Zero Qualified (0 Staff across entire company), 📚 Missing Course Tracks, and 🎯 Fast-Track Talent Pool.
   - **Workforce Supply vs Demand Gauge**: Computes active qualified headcount against the maximum required proficiency level (e.g. `2 of 14 employees qualified` -> `14% workforce coverage`), color-coded by severity (Critical / Severe / Moderate / Healthy).
   - **Impacting Strategic Roles**: Surfaces all open roles blocked by each shortage area with 1-click drilldown to the role's talent pipeline.
   - **Fast-Track Candidate Pool**: Surfaces employees who are exactly 1 level below the target proficiency level with their availability %, along with a 1-click `⚡ Enroll` action pre-filling employee, role, and course.
   - **Curriculum Integration**: Identifies mapped internal academy courses (duration, provider, active enrollments) with 1-click enrollment, or prompts HR/Managers with `+ Create Track` when no internal course exists.
   - **Interactive Filtering & Search**: Includes search by skill, role, or category, plus filter pills (`All Areas`, `🚨 Zero Qualified`, `⚠️ Severe Deficits (<30%)`, `📚 Missing Tracks`, `🎯 Has Near-Ready Talent`) and sort options.

2. **Unified Notifications & Activity Center for Employees**:
   - **Dynamic Feed**: Synthesizes 19 live real-time updates from `EmployeeProject` (staffings/assignments), `ProjectApplication` (accepted, rejected, pending status with HR decision notes), `UpskillingProgress` (course enrollments, certifications, and approvals), and `Evidence` (HR verified proofs).
   - **Read/Unread Tracking**: Persisted to `localStorage` keyed by employee ID, displaying unread status dots and glowing "NEW" badges.
   - **Unread Counter Badges**: Prominently displayed on the employee portal hero card and the subtab navigation bar.
   - **Batch Action**: "Mark all as read" button instantly clears unread counts across all active notifications.
   - **Interactive Toolbar**: Live search bar and filter pills (`All Activity`, `🔔 Unread`, `🎯 Project Staffings`, `📋 Decisions`, `🎓 Learning Tracks`, `🛡️ Evidence Reviews`).
   - **Direct Action Jump Links**: 1-click links that automatically mark notifications as read and navigate to the target tab with the appropriate sub-filter set (`projects` -> assigned projects, `courses` -> enrolled courses, etc.).

3. **"🎯 Assigned Projects" Category in My Career Hub**:
   - Added `🎯 Assigned Projects` sub-filter to both the Overview and Projects views in `EmployeePortalTab.tsx`.
   - Distinctly tags projects with `🎯 Assigned Member` vs `✅ HR Approved Gig` vs `Active Core Project`, displaying role, hours, timeline, and assignment source.

4. **Comprehensive Upskilling & Gaps Experience for Every Role**:
   - **Employee (`EmployeeUpskillingTab.tsx`)**:
     - Added requirements filter (`All`, `⚠️ Gaps`, `✅ Met`) to the Left Column breakdown.
     - Added interactive "Bridge Gap with Recommended Course ↓" and "+ Suggest Course" links on each requirement card.
     - Added fallback card with 1-click "Suggest Course" and "Submit Evidence" buttons for gaps lacking an academy catalog course.
     - Anchored cards (`id="gap-{skillId}"`) for smooth-scrolling navigation.
   - **HR Admin & Manager (`NearQualifiedTab.tsx`)**:
     - Added 4th subview: `Active Learners & Enrollments` with search, status filters (`All`, `In Progress`, `Awaiting Verification`, `Completed`), and inline status selectors allowing HR/managers to certify completion on the fly.
     - Added "+ Add Course" button on strategic role gaps lacking mapped curriculum.
     - Enhanced "Quick Enroll" workflow from near-qualified candidate gap cards.

---

## 2. Root Cause Analysis & Resolutions

### Defect 1: User Management & Audit Log Bypassed SQLite Database
* **Root Cause**: Six HR Admin user management endpoints (`/api/pending-approvals`, `/api/approvals/{id}`, `/api/reject-approval/{id}`, `/api/deactivate-user/{id}`, `/api/active-users`, and `/api/audit-log`) were implemented as legacy middleware inside `vite.config.ts`, reading and writing directly to `company_users.csv` and `audit_log.csv`. In FastAPI, these routes returned `404 Not Found`.
* **Fix**:
  1. Implemented all 6 endpoints in `backend/api.py` querying `CompanyUser` and `AuditLog` in SQLite.
  2. Enforced strict `HR_Admin` role checking (`403 Forbidden` for non-HR callers).
  3. Added audit trail logging (`APPROVE_USER`, `REJECT_USER`, `DEACTIVATE_USER`) to SQLite `audit_log`.
  4. Added route prefixes to Vite's proxy list to route directly to FastAPI on port 8000.
  5. Removed the CSV middleware handlers from `vite.config.ts`.

---

### Defect 2: Directory Employee Provisioning Crash (`TypeError`)
* **Root Cause**: In `backend/services/role_service.py` (`create_directory_employee`), `float(payload.get("hours_per_week_free"))` failed with `TypeError: float() argument must be a string or a real number, not 'NoneType'` when `hours_per_week_free` was passed as `None` or omitted from the client modal.
* **Fix**:
  1. Added safe null-coalescing and try/except float conversion with sensible defaults (`80.0` availability, `32.0` free hours).
  2. Enforced strict `actor.role == 'HR_Admin'` validation (`403 Forbidden` for Managers and Employees).
  3. Wrapped database write in an atomic transaction with automatic rollback on error.

---

### Defect 3: Parameter Format Mismatch on DELETE Routes (`HTTP 422`)
* **Root Cause**: `DELETE /api/project-members` and `DELETE /api/project-shortlists` defined mandatory Pydantic body models. Callers invoking DELETE with URL query parameters (`?project_id=...&employee_id=...`) received `422 Unprocessable Entity`.
* **Fix**:
  1. Updated both DELETE handlers in `backend/api.py` to accept query parameters (`Query(None)`) and asynchronously fall back to parsing JSON body if query parameters are missing.
  2. Implemented `GET /api/project-shortlists` and `POST /api/project-shortlists` in `backend/api.py` using `application_service.shortlist_candidate` and `remove_candidate_shortlist`.

---

### Defect 4: Marketplace Application Acceptance Race & Hours Leak
* **Root Cause**: In `application_service.py` (`review_application_decision`), accepting an application did not pre-validate whether the candidate had enough free weekly hours. Furthermore, member insertion and hours deduction were not wrapped in a strict rollback block.
* **Fix**:
  1. Added pre-check: `if req_hours > 0 and emp.hours_per_week_free < req_hours: raise HTTPException(400, ...)`
  2. Wrapped status update, `EmployeeProject` insertion, hours recomputation, audit log insertion, and data version bump in a single ACID transaction with explicit rollback.

---

### Defect 5: Unvalidated Rejections Lacking Mandatory Notes
* **Root Cause**: In `POST /api/evidence/{id}/verify` and `POST /api/upskilling/admin/review-completion`, `action='reject'` and `action='needs_info'` allowed empty notes, leaving employees without feedback on why their work was rejected.
* **Fix**:
  1. Enforced `len(notes.strip()) >= 3` in `verification_service.py` when target status is `Rejected` or `Needs info`, returning `422 Unprocessable Entity` if omitted.
  2. Enforced `len(approval_note.strip()) >= 3` in `training_service.py` when course completion is rejected, returning `422 Unprocessable Entity` if omitted.

---

### Defect 6: Unified Server-Side Search for Managers & HR
* **Root Cause**: `TalentSearchTab.tsx` and `EmployeeDirectoryTab.tsx` performed search and filtering in client memory without supporting large datasets or server pagination.
* **Fix**:
  1. Updated `GET /api/manager/employees` in `backend/api.py` to accept server query parameters: `query`, `department`, `min_availability`, `verified_only`, `sort_by`, `page`, and `page_size`.
  2. Implemented database filtering and sorting directly in SQLite.
  3. Added total count and pagination metadata to response.

---

### Defect 7: Optimistic Concurrency Control (OCC)
* **Root Cause**: Concurrent updates by multiple managers could result in silent overwrites.
* **Fix**:
  1. Added `version` field to Pydantic models (`ProjectPayload`, `ReviewCompletionPayload`, `VerifyEvidencePayload`, `ApplicationReviewPayload`).
  2. Integrated `common.check_optimistic_concurrency()` on all mutating domain services, returning `409 Conflict` when an outdated version is supplied.

---

### Defect 8: Marketplace Internal Talent Assignment Error ("Could not assign team member")
* **Root Cause**: Selecting a Role opportunity in Marketplace created IDs with redundant prefixes (`role-role-fintech-app-lead`). `role_service.assign_project_member` previously queried only the `Project` table, returning `404 Not Found` when trying to assign an employee to a Role opportunity, which triggered the toast "Could not assign team member.".
* **Fix**:
  1. Updated `role_service.py` (`assign_project_member` and `remove_project_member`) to strip redundant prefixes (`role-role-` and `role-proj-`).
  2. Added fallback in `assign_project_member`: if an opportunity is an open `Role`, automatically instantiate or activate the corresponding `Project` representation with the role's title, department, and complexity so foreign key constraints succeed.
  3. Updated `MarketplaceTab.tsx` to sanitize IDs before calling API, maintain optimistic state (`localAssignedMembers`), and immediately call `onReloadData()`.

---

### Defect 9: Upskilling & Gaps Page Manager Access & Real-Time Sync
* **Root Cause**: In `NearQualifiedTab.tsx`, "Enroll Learner" and "Add Course" buttons were guarded by `{isHr && ...}`, completely hiding them from Managers. `App.tsx` did not pass `onUpdateProgress` for Managers. Additionally, `POST /api/upskilling-progress` in `backend/api.py` extracted `employee_id` exclusively from `get_current_employee`, preventing HR Admins (who lack employee records) and Managers from enrolling or updating progress for team members.
* **Fix**:
  1. Updated `NearQualifiedTab.tsx` with `canManage = isHr || userRole === 'Manager'` so both HR Admins and Managers have full access to "Enroll Learner", "Add Course", and progress updates.
  2. Updated `App.tsx` to provide `handleUpdateProgress` to both `HR_Admin` and `Manager` roles.
  3. Rewrote `legacy_upskilling_progress` (`POST /api/upskilling-progress`) in `backend/api.py` to accept target `employee_id` from HR and Managers, validate existence of the employee and resource, safely map role IDs, atomic write/update in `UpskillingProgress`, trigger skill recomputations upon completion, log audit trail, and bump data version.
  4. Rewrote `handleEnrollEmployee`, `updateProgress`, and `handleCreateCourse` in `NearQualifiedTab.tsx` to directly `await apiFetch`, show instant toasts, and immediately `await onReloadData()` to ensure all changes reflect instantaneously across both manager and HR screens.

---

### Defect 10: Org Shortages Course Creation Role Permission & Foreign Key Auto-Provisioning
* **Root Cause**:
  1. `training_service.create_learning_resource` previously only permitted `HR_Admin`, raising `403 Forbidden: Only HR administrators can add learning resources.` when Managers clicked "+ Create Track" or "Create Training Track".
  2. Creating a learning track for a skill that lacked a preexisting row in the SQLite `skills` table failed with `sqlite3.IntegrityError: FOREIGN KEY constraint failed` (500 Internal Server Error).
  3. In `NearQualifiedTab.tsx`, submitting the modal forms without toggling dropdowns sent empty strings instead of default selections.
* **Fix**:
  1. Updated `training_service.create_learning_resource` to permit both `HR_Admin` and `Manager` actors.
  2. Added auto-provisioning of skills in `training_service.create_learning_resource` so whenever a new skill ID is targeted, it is automatically instantiated in the `skills` table, satisfying the Foreign Key constraint seamlessly.
  3. Pre-filled and defaulted modal state values (`enrollEmpId`, `enrollResourceId`, `enrollRoleId`, `courseTitle`, `courseSkillId`) in `NearQualifiedTab.tsx` with instant user feedback toasts and data reloads.

---

## 3. Regression Baseline Verification

* **Pre-change Baseline**: 99 passed, 0 failed (`pytest`: 71 passed, `npm test`: 28 passed).
* **Post-change Verification**:
  * `pytest tests`: **93 passed, 0 failed** in 3.66s.
  * `npm test`: **28 passed, 0 failed** in 1.05s.
  * `npx tsc --noEmit`: **0 compilation errors**.
  * `python scratch/test_org_shortages_e2e.py`: **100% passed live end-to-end integration test against SQLite DB**.
  * **Total**: **121 passed, 0 failed (100% pass rate, 0 regressions)**.

