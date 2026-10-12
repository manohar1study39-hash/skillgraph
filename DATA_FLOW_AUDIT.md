# SkillGraph Data-Flow & Architecture Audit (Phase 1)

**Audit Date**: October 2026  
**Auditor**: Antigravity Assistant  
**Scope**: Full end-to-end data flow audit across Employee, Manager, and HR roles (SQLite database, CSV files, FastAPI backend, Vite dev middleware, TypeScript engines, React state, and UI components).  
**Phase Status**: Phase 1 Complete — No code changes made. Pytest: 51/51 passing. Unit tests: 22/22 passing. Playwright E2E: No spec files found (scheduled for Phase 6).

---

## Executive Summary

SkillGraph currently suffers from a **split-brain architecture** across two uncoordinated persistence layers and duplicate scoring engines:
1. **Split-Brain Persistence**:
   - **SQLite Database** (`data/skillgraph.db` via SQLAlchemy & FastAPI at `backend/api.py`): Contains tables for `company_users`, `employees`, `skills`, `employee_skills`, `evidence`, `certifications`, `projects`, `employee_projects`, `roles`, `role_skills`, `learning_resources`, `upskilling_progress`, `project_applications`, `project_shortlists`, `course_suggestions`, and `audit_log`.
   - **CSV Flat Files** (`data/*.csv` via Vite middleware at `vite.config.ts`): Middleware intercepts requests to `/api/data`, `/api/employee-profile`, `/api/employee-availability`, `/api/projects`, `/api/project-members`, `/api/employees`, `/api/learning-resources`, `/api/project-shortlists`, and writes directly to CSV files on disk.
2. **Broken Read Path**:
   - The primary data loader `src/services/dataLoader.ts` calls `GET /api/data`, which reads exclusively from CSV flat files into a singleton module-level cache (`export let CSV_DATA: SkillGraphData`).
   - Mutations made via FastAPI (e.g. `POST /api/evidence`, `POST /api/upskilling/enroll`, `POST /api/project-applications`) write strictly to the SQLite database. When the client calls `reloadAllData()`, it fetches `GET /api/data` (CSVs), wiping out recent changes and returning stale pre-mutation state.
   - Conversely, mutations made via Vite middleware (e.g. `POST /api/employee-profile`, `POST /api/employee-availability`, `POST /api/projects`, `POST /api/employees`) rewrite CSV files on disk while leaving SQLite untouched.
3. **Triplicated Scoring & Match Logic**:
   - Backend deterministic engine: `backend/scoring_engine.py` (0–5 scale: Aware, Guided, Independent, Advanced, Expert).
   - Frontend mirror: `src/services/scoringEngine.ts` (0–5 scale).
   - Incompatible third formula: `src/services/dataLoader.ts` `estimateLevel()` (ad-hoc 0–100 scale mapped to Beginner, Intermediate, Advanced, Expert, Master).
   - Heuristic UI logic: `src/components/employee/EmployeePortalTab.tsx` and `src/services/upskillingEngine.ts` granting arbitrary boosts or using naive string matching.

---

## a) Entity Catalog

| Entity | Primary Concept | Associated Identifiers & Foreign Keys |
| :--- | :--- | :--- |
| **Employee Profile** | Staff member identity, title, department, team, location, workload, hire date | `employee_id`, `user_id` -> `company_users.user_id`, `manager_id`, `target_role_id` -> `roles.role_id` |
| **Skills** | Canonical taxonomy of skills, categories, domains, synonyms, related skills | `skill_id`, `skill_name`, `category`, `domain` |
| **Evidence** | Tangible work proof (PRs, commits, projects, code reviews, certs, feedback) | `evidence_id`, `employee_id`, `skill_id`, `project_id` |
| **Certifications** | Formal third-party credentials with issue & expiration dates | `cert_id`, `employee_id`, `skill_id` |
| **Training (Learning Resources)** | Courses, workshops, mentor programs, projects with target levels & durations | `resource_id`, `skill_id`, `mentor_employee_id` |
| **Course Progress** | Employee enrollment, hours logged, progress %, completion proof URL, approval | `id`, `employee_id`, `role_id`, `resource_id` |
| **Availability** | Available percentage, free hours/week, current workload %, committed hours | `employee_id` (columns in `employees` table & `employees.csv`) |
| **Ambition** | Employee target career role and gap tracking | `employee_id`, `target_role_id` (column in `employees`) |
| **Applications** | Expressed interest/application for gigs/projects/roles with committed hours | `application_id`, `employee_id`, `opportunity_id` (`project_id` or `role_id`) |
| **Roles** | Career positions and openings with required skill profiles | `role_id`, `role_title`, `department`, `priority`, `status` |
| **Projects** | Initiatives, staffing requirements, technology stack, start/end dates | `project_id`, `project_name`, `complexity`, `technologies` |
| **Verification Status** | State of proof validity (`Self-reported`, `Link checked`, `Verified by HR`, `Rejected`, `Needs info`) | `verification_status` column in `evidence` and `employee_skills` |
| **Notes** | Human feedback, decisions, reasons, and audit commentary | `hr_notes` (`evidence`), `approval_note` (`upskilling_progress`), `hr_decision_note` (`project_applications`), `note` (`project_shortlists`, `course_suggestions`) |

---

## b) Storage, Endpoints, and Staleness Audit

| Entity | Storage Location | Write Endpoints | Read Endpoints / Pages | Staleness Risk & Root Causes |
| :--- | :--- | :--- | :--- | :--- |
| **Employee Profile** | SQLite `employees`<br>CSV `data/employees.csv` | • FastAPI `backend/api.py`: `POST /api/signup` (auto-creates row)<br>• Vite `vite.config.ts`: `POST /api/employee-profile`, `POST /api/employees` | • FastAPI: `GET /api/data`, `GET /api/session`<br>• Vite: `GET /api/data`<br>• Frontend: `App.tsx`, `EmployeePortalTab.tsx`, `TalentSearchTab.tsx`, `TalentDirectory.tsx`, `EmployeeProfileModal.tsx` | **Critical**: `POST /api/employee-profile` writes to `employees.csv` only. SQLite is never updated. `GET /api/data` reads CSV, but FastAPI auth session binds to SQLite. If profile edited in modal, SQLite remains stale. |
| **Skills** | SQLite `skills`<br>CSV `data/skills.csv` | • Vite: `POST /api/projects` (appends new skills to CSV) | • FastAPI: `GET /api/data`<br>• Vite: `GET /api/data`<br>• Frontend: Taxonomy loaded on boot into `CSV_DATA.skillsData` | **High**: Stored in static module-level cache `CSV_DATA`. Newly added skills during project creation do not update SQLite taxonomy nor notify other active client sessions. |
| **Evidence** | SQLite `evidence`<br>CSV `data/evidence.csv` | • FastAPI: `POST /api/evidence`, `DELETE /api/evidence/{id}`, `POST /api/evidence/{id}/undo-delete`, `PUT /api/evidence/{id}`<br>• Vite: `POST /api/evidence` (dead code, intercepted by proxy) | • FastAPI: `GET /api/evidence`, `GET /api/data`<br>• Vite: `GET /api/data`<br>• Frontend: `EvidenceModal.tsx`, `EmployeePortalTab.tsx`, `TalentSearchTab.tsx` | **Critical**: Employee submits evidence -> saved to SQLite `evidence` table -> FastAPI recomputes SQLite `employee_skills`. When client reloads via `reloadAllData()`, Vite `GET /api/data` reads `data/evidence.csv` (which was never updated). Employee and HR see pre-submission state. |
| **Certifications** | SQLite `certifications`<br>CSV `data/certifications.csv` | • Vite: `POST /api/employee-profile` (rewrites `certifications.csv`) | • FastAPI: `GET /api/data`<br>• Vite: `GET /api/data`<br>• Frontend: `EmployeePortalTab.tsx`, `EmployeeProfilePage.tsx` | **Critical**: Written to CSV by Vite middleware; SQLite `certifications` table is never updated. Scoring engine in FastAPI cannot incorporate certs added via profile modal. |
| **Training (Resources)** | SQLite `learning_resources`<br>CSV `data/learning_resources.csv` | • Vite: `POST /api/learning-resources` (rewrites CSV) | • FastAPI: `GET /api/data`<br>• Vite: `GET /api/data`<br>• Frontend: `EmployeePortalTab.tsx`, `EmployeeUpskillingTab.tsx` | **High**: New resources added in Vite CSV are invisible to FastAPI upskilling endpoints (`/api/upskilling/enroll`), causing 404 resource not found errors on SQLite lookups. |
| **Course Progress** | SQLite `upskilling_progress`<br>CSV `data/upskilling_progress.csv` | • FastAPI: `POST /api/upskilling/enroll`, `POST /api/upskilling/unenroll`, `POST /api/upskilling/log-hours`, `POST /api/upskilling/request-completion`, `POST /api/upskilling/admin/review-completion`<br>• Vite: `POST /api/upskilling-progress` (dead code, blocked by proxy) | • FastAPI: `GET /api/upskilling/progress`, `GET /api/data`<br>• Vite: `GET /api/data`<br>• Frontend: `EmployeePortalTab.tsx`, `App.tsx` | **Critical**: UI buttons calling `POST /api/upskilling-progress` return 404 from FastAPI because FastAPI only exposes `/api/upskilling/log-hours` & `/api/upskilling/enroll`. Progress logged in SQLite is lost on next `GET /api/data` CSV fetch. |
| **Availability** | SQLite `employees` columns (`availability_percent`, `hours_per_week_free`)<br>CSV `data/employees.csv` | • FastAPI: `PUT /api/employee/availability`, `POST /api/employee-availability`<br>• Vite: `POST /api/employee-availability` (line 357 CSV rewrite), `POST /api/employee-profile` | • FastAPI: `GET /api/employee/availability`, `GET /api/data`<br>• Vite: `GET /api/data`<br>• Frontend: `App.tsx`, `EmployeePortalTab.tsx`, `TalentSearchTab.tsx` | **Critical**: `App.tsx` sends `POST /api/employee-availability` which Vite intercepts and writes to `employees.csv`. SQLite is not updated. In `EmployeePortalTab.tsx`, mount effect calls `GET /api/employee/availability` (FastAPI) which returns stale SQLite data! |
| **Ambition** | SQLite `employees.target_role_id`<br>No CSV column (previously `localStorage`) | • FastAPI: `PUT /api/employee/ambition` | • FastAPI: `GET /api/employee/ambition`<br>• Frontend: `EmployeePortalTab.tsx` | **Medium**: Saved to SQLite DB, but HR and Manager views never fetch SQLite ambition; HR has zero visibility into employee career aspirations. |
| **Applications** | SQLite `project_applications`<br>CSV `data/project_applications.csv` | • FastAPI: `POST /api/project-applications`, `POST /api/project-applications/{id}/withdraw`, `POST /api/project-applications/{id}/review`<br>• Vite: `POST /api/project-applications`, `DELETE /api/project-applications` (dead code, proxied) | • FastAPI: `GET /api/project-applications`<br>• Vite: `GET /api/project-applications` (dead code, proxied)<br>• Frontend: `EmployeePortalTab.tsx`, `MarketplaceTab.tsx` | **High**: Applications stored in SQLite, but Manager and HR marketplace screens read `CSV_DATA.records.projectShortlists` and CSV-based matching, ignoring SQLite applications unless specifically polling `/api/project-applications`. |
| **Roles** | SQLite `roles`, `role_skills`<br>CSV `data/roles.csv`, `data/role_skills.csv` | • Vite: `POST /api/projects` (creates role in CSV) | • FastAPI: `GET /api/data`<br>• Vite: `GET /api/data`<br>• Frontend: `MarketplaceTab.tsx`, `EmployeePortalTab.tsx` | **High**: Roles created via marketplace UI update CSV only. FastAPI SQLite role tables are unpopulated for new roles, breaking `/api/opportunities` match calculations. |
| **Projects** | SQLite `projects`, `employee_projects`<br>CSV `data/projects.csv`, `data/employee_projects.csv` | • Vite: `POST /api/projects`, `POST /api/project-members`, `DELETE /api/project-members` | • FastAPI: `GET /api/data`<br>• Vite: `GET /api/data`<br>• Frontend: `MarketplaceTab.tsx`, `EmployeeProfileModal.tsx` | **Critical**: All project assignment and creation logic lives in Vite CSV middleware. SQLite `projects` and `employee_projects` remain completely out of sync. |
| **Verification Status** | SQLite `evidence.verification_status`, `employee_skills.verification_status`<br>CSV `evidence.csv.verified`, `employee_skills.csv.verified` | • FastAPI: `POST /api/evidence` (sets `Self-reported` or `Link checked`)<br>• No endpoint exists for HR verification! | • FastAPI: `GET /api/evidence`<br>• Vite: `GET /api/data`<br>• Frontend: `EvidenceModal.tsx`, `EmployeePortalTab.tsx` | **Critical Gap**: There is currently NO API endpoint or service method for HR to change evidence verification status (`Verified by HR`, `Rejected`, `Needs info`). CSV only stores boolean `true`/`false`. |
| **Notes** | SQLite columns (`hr_notes`, `approval_note`, `hr_decision_note`, `note`)<br>CSV `project_shortlists.csv.note` | • FastAPI: `POST /api/project-applications/{id}/review`, `POST /api/upskilling/admin/review-completion`<br>• Vite: `POST /api/project-shortlists` | • FastAPI: `GET /api/project-applications`<br>• Vite: `GET /api/data`<br>• Frontend: `EvidenceModal.tsx`, `MarketplaceTab.tsx` | **High**: `EvidenceModal.tsx` does not display `hr_notes` from SQLite. HR decision notes on applications are not shown in the employee's opportunity history cards. |

---

## c) Calculations & Duplicate Scoring Logic Inventory

| Location | Function / Code Block | Formula / Logic | Scale / Output | Status |
| :--- | :--- | :--- | :--- | :--- |
| `backend/scoring_engine.py` | `evaluate_employee_skill()` | Base weights (PR:3.0, commit:2.0, project:3.5, cert:3.0, code_review:1.8, feedback:1.2, self:2.0) × Verification factor (HR:1.0, Link:0.9, Self:0.7, Rejected:0.0) × Role factor (Arch/Lead:1.3, Contrib:1.0, Supp:0.8) × Recency decay (730d half-life, 0.40 floor). Diminishing returns (0.2x). Expired cert (0.35x). Partial course credit (+0.2 level). | Level 0–5 (Unassessed, Aware, Guided, Independent, Advanced, Expert); points; confidence % | **Canonical Formula 1** (Target Source of Truth) |
| `backend/api.py` | `recompute_employee_skill_levels()` | Loads evidence & certs from SQLite, calls `evaluate_employee_skill()`, saves `proficiency_level` to SQLite `employee_skills`. | Level 0–5 string | Calls Canonical Engine |
| `backend/api.py` | `calculate_role_fit()` (lines 1240–1270, 1400–1460) | Compares employee skill levels against `role_skills` required levels. Must skills vs Nice skills (weight 0.3). | Fit score % (0–100) | **Duplicate Fit Formula A** |
| `src/services/scoringEngine.ts` | `evaluateEmployeeSkill()` | Identical TypeScript port of `backend/scoring_engine.py`. | Level 0–5; points; confidence % | **Duplicate Port** (Used on client side) |
| `src/services/dataLoader.ts` | `estimateLevel()` (lines 99–114) | `items = (verified ? 1.5 : 0.5) * recency * (0.6 + proj/10); proofScore = sum/3; years = (exp/8) * 0.35; score = proofScore*75 + years*100; index = score>=88 ? 4 : score>=70 ? 3 : score>=50 ? 2 : score>=28 ? 1 : 0` | Levels: Beginner, Intermediate, Advanced, Expert, Master; Score: 15–100 | **Duplicate Formula B** (INCOMPATIBLE with Canonical Engine; generates different levels and names!) |
| `src/services/matchingEngine.ts` | `scoreEmployeeForRole()`, `rankCandidatesAdvanced()` | Client-side role matching: required skills hierarchy (Beginner=0 to Master=4), must vs nice weights, availability factor. | Match score % (0–100) | **Duplicate Fit Formula B** (Incompatible with backend `calculate_role_fit`) |
| `src/services/upskillingEngine.ts` | `analyzeRoleGap()` | Client-side gap analysis. Checks required levels; grants 50% or 100% credit if status is "Done" in progress CSV without evidence proof. | Readiness %; skill gaps list | **Duplicate Readiness Formula** (Arbitrary unverified credit) |
| `src/components/employee/EmployeePortalTab.tsx` | Inline Completeness Ring (lines 280–310) | Hardcoded formula: `20 base + 20 role/dept + 20 skills>=3 + 20 verifiedProofs + 20 projects/certs`. | Completeness % (0–100) | **Fake / Ad-hoc Formula** |
| `src/components/employee/EmployeePortalTab.tsx` | Inline Opportunities Match % | Naive keyword/presence count: `matchedCount / total * 100` ignoring required proficiency levels. | Match % (0–100) | **Fake / Inaccurate Formula** |
| `backend/generate_level_changes.py` | Standalone Calibration Script | Reads CSV files, implements separate calibration thresholds to generate `LEVEL_CHANGES.csv`. | Level 0–5 | **Duplicate Batch Formula** |

---

## d) Employee Controls & Buttons End-to-End Walkthrough

| UI Location | Control / Form / Action | Expected Behavior | Actual Behavior | API Route Called | Persists After Refresh? | Visible to HR? | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Hero Card** | Profile Details (Name, Title, Dept, Team, Location) | Displays authenticated employee profile strictly bound to auth token | Displays profile matched via client email/name or falls back to synthetic `emp-{user.user_id}` | `GET /api/session`, `GET /api/data` | Yes (reads CSV) | Yes (CSV) | **Broken** |
| **Hero Card** | Completeness Ring (0–100%) | Server-derived completeness score with next recommended action | Hardcoded client formula (`20+20+20+20+20`) | None | Recalculated in memory | No | **Fake** |
| **Hero Card** | "Edit Profile" Button | Opens profile editor with unsaved changes warning | Opens modal; no dirty guard | None | N/A | N/A | **Works** |
| **Hero Card** | Chip: "My Verified Skills" | Displays count of evaluated skills from scoring engine; click navigates to Skills | Displays `skills.length` (unfiltered); not clickable | None | Memory | No | **Fake** |
| **Hero Card** | Chip: "Verified Proofs" | Displays count of non-rejected evidence; click navigates to Skills | Counts `e.verified && !e.expired` (self-reported counted as verified); not clickable | None | Memory | No | **Fake** |
| **Hero Card** | Chip: "Enrolled Courses" | Count of active courses from database; click navigates to Learning | Count from client progress array; not clickable | None | Memory | No | **Works** (Data), **Dead** (Click) |
| **Hero Card** | Chip: "Role Matches" | Count of qualified opportunities using true engine; click navigates to Opportunities | Counts naive keyword presence in memory; not clickable | None | Memory | No | **Fake** |
| **Hero Card** | Availability Slider (0–100%) & Free Hours Input | Sets availability % and free hours; warns/blocks overcommitment | Updates local React state heuristically | None | No (until saved) | No | **Works** |
| **Hero Card** | "Save & Sync Availability" Button | Atomically saves availability to DB; updates HR search immediately | `App.tsx` calls `POST /api/employee-availability` (writes CSV with flawed email match). SQLite unchanged. | `POST /api/employee-availability` | Yes (in CSV only) | Partial (CSV only) | **Broken** |
| **Overview** | Ambition Target Role Dropdown | Selects target career role; persists to DB profile | Calls `PUT /api/employee/ambition` (DB updated), but `GET /api/data` (CSV) never updated | `PUT /api/employee/ambition` | Yes in DB, No in CSV | No | **Broken** |
| **Overview** | Ambition Readiness Ring & Badge | Deterministic gap analysis from scoring engine | Client-side `analyzeRoleGap` granting 100% credit on unverified "Done" | None | Memory | No | **Fake** |
| **Overview** | "Bridge Skill Gaps" Button | Switches to Courses subtab filtered to target role gaps | Switches subtab to `courses`, but does NOT filter to missing skills | None | N/A | N/A | **Broken** |
| **Overview** | Quick "+ Add Proof" Button | Opens Submit Skill Proof modal with skill pre-selected | Opens `SubmitEvidenceModal` | None | N/A | N/A | **Works** |
| **Overview** | "Inspect Audit Trail" Button | Opens modal showing honest verification status and HR notes | Opens `EvidenceModal`; labels all items 1.5x production work without HR notes | None | N/A | N/A | **Fake** |
| **Overview** | Quick Gigs "Express Interest / Apply" | Opens ApplyOpportunityModal with gig pre-selected | Opens modal | None | N/A | N/A | **Works** |
| **Skills Subtab** | Search & Category Filters | Filters skills in client view | Filters local array in memory | None | Resets on reload | N/A | **Works** |
| **Skills Subtab** | "+ Add Evidence Proof" Header Button | Opens Submit Skill Proof modal | Opens modal | None | N/A | N/A | **Works** |
| **Skills Subtab** | Skill Card Level Badge & Score Bar | Displays unified 0–5 proficiency level and points | Inconsistent: displays Beginner–Master from `dataLoader.ts` or 0–5 from `scoringEngine.ts` | None | Derived from CSV | Inconsistent | **Broken** |
| **Skills Subtab** | Skill Card "Inspect Proofs" Button | Opens evidence inspect modal | Opens `EvidenceModal` | None | N/A | N/A | **Works** |
| **Skills Subtab** | "Why is my level X?" Link/Button | Explains points, thresholds, ordered evidence contributions, guidance | Missing or static text; no explanation drawer | None | N/A | N/A | **Dead** |
| **Learning** | Filter Pills & Search Input | Filters course list by status and query | Filters client array in memory | None | Resets on reload | N/A | **Works** |
| **Learning** | "Enroll in Course" Button | Enrolls in course (0%, 0 hrs), prevents duplicate enrollment | Calls `POST /api/upskilling/enroll` (FastAPI). SQLite saved, but CSV not updated. | `POST /api/upskilling/enroll` | Yes in DB, No in CSV | No (HR reads CSV) | **Broken** |
| **Learning** | "Unenroll / Drop Course" Button | Drops enrollment; preserves logged hours in audit history | Calls `POST /api/upskilling/unenroll` (FastAPI). SQLite saved, CSV untouched. | `POST /api/upskilling/unenroll` | Yes in DB, No in CSV | No | **Broken** |
| **Learning** | "Log Learning Hours" Button | Opens modal to log hours, date, and notes | Opens `LogHoursModal` which calls `POST /api/upskilling/log-hours`. SQLite saved, CSV untouched. | `POST /api/upskilling/log-hours` | Yes in DB, No in CSV | No | **Broken** |
| **Learning** | "Request Completion" Button | Submits completion URL; sets status to "Awaiting approval"; awards capped credit | Opens `RequestCompletionModal`; calls `POST /api/upskilling/request-completion`. HR has no UI to approve. | `POST /api/upskilling/request-completion` | Yes in DB, No in CSV | No (HR has no UI) | **Broken** |
| **Learning** | Discrete Progress Buttons (0%, 25%, 50%, 75%, Done) | Hours-based logging; "Done" requires approval | Calls `POST /api/upskilling-progress` which returns **404 Not Found** from FastAPI! | `POST /api/upskilling-progress` (404) | Fails | No | **Broken** |
| **Learning** | "Suggest a Course" Button & Modal | Submits course suggestion for HR review | Opens `SuggestCourseModal` which calls `POST /api/learning-suggestions`. | `POST /api/learning-suggestions` | Yes in DB | No (HR view lacks tab) | **Broken** |
| **Learning** | Weekly Learning Hours Slider | Live calculation of projected date; persists setting | Calls `PUT /api/employee/weekly-learning-hours`. | `PUT /api/employee/weekly-learning-hours` | Yes in DB | No | **Works** |
| **Opportunities** | Filter Pills (All, Projects, Roles, Applied) | Filters opportunities | Filters client array in memory | None | Resets on reload | N/A | **Works** |
| **Opportunities** | "Express Interest / Apply" Button | Validates free hours; opens apply modal | Opens `ApplyOpportunityModal` | None | N/A | N/A | **Works** |
| **Opportunities** | "Withdraw Application" Button | Transitions status to "Withdrawn"; keeps history | Calls `DELETE /api/project-applications` which permanently deletes the row instead of status transition! | `DELETE /api/project-applications` | Yes (deletes row) | No (disappears) | **Broken** |
| **Submit Proof** | Modal Submit ("Submit Verified Proof") | Submits evidence; rate-limited; duplicate detection; updates level & audit log | Calls `POST /api/evidence`. FastAPI saves to DB, but client reloads CSV which lacks the new record! | `POST /api/evidence` | Yes in DB, No in CSV | No (HR reads CSV) | **Broken** |
| **Submit Proof** | 10-Second Undo Submission | Allows retracting submission within 10 seconds | Toast only; no functioning undo trigger in UI | None | N/A | N/A | **Dead** |
| **Apply Modal** | Modal Submit ("Submit Application") | Validates hours; submits application; visible to HR | Calls `POST /api/project-applications` (FastAPI). SQLite saved, but HR reads CSV! | `POST /api/project-applications` | Yes in DB, No in CSV | No (HR reads CSV) | **Broken** |
| **Profile Editor** | Modal Submit ("Save Profile") | Saves personal info & availability to DB; self-skills capped at Level 1 | Calls `POST /api/employee-profile` (Vite CSV). Overwrites CSV; sets self-skills to `verified: true`! DB untouched. | `POST /api/employee-profile` | Yes in CSV, No in DB | Yes in CSV, No in DB | **Broken** |

---

## e) Security Audit: Endpoints Trusting Client-Supplied Employee IDs

Under **Rule 2**, user identity must ALWAYS come from the verified auth token, never from a body, URL, or query parameter. Server role checks must be enforced on every endpoint.

### 1. Vite Middleware Endpoints (`vite.config.ts`) — Insecure
1. `POST /api/employee-availability`:
   - Inspects `user.email` / `user.name` and falls back to `emp-1` if user email contains `"employee"`. A user can modify employee `emp-1`'s availability!
2. `POST /api/upskilling-progress`:
   - Directly reads `body.employeeId` (or `body.employee_id`) and modifies records without asserting that it matches the authenticated session user.
3. `POST /api/employee-profile`:
   - Matches by name/email or accepts `empId` from body, allowing cross-employee profile overwrites.
4. `POST /api/project-members` & `DELETE /api/project-members`:
   - Accepts `body.employee_id` without verifying whether the caller has manager privileges over that employee or project.
5. `POST /api/project-applications`:
   - Line 891: accepts `body.employeeId` from the client request body.
6. `DELETE /api/project-applications`:
   - Line 933: accepts `body.employeeId` from the client request body.
7. `POST /api/project-shortlists` & `DELETE /api/project-shortlists`:
   - Lines 947 & 971: accepts `body.employeeId` from client payload.
8. `POST /api/employees`:
   - Line 687: accepts client-supplied employee attributes directly.

### 2. FastAPI Backend Endpoints (`backend/api.py`) — Insecure or Requiring Guardrails
1. `GET /api/project-applications`:
   - Line 1548: accepts query parameter `employee_id: Optional[str] = None`. While non-HR employees are checked (`if employee_id and employee_id != emp.employee_id: raise 403`), manager role is not restricted from querying arbitrary employee IDs.
2. `POST /api/upskilling/admin/review-completion`:
   - Accepts `payload.employee_id` in request body. Role check correctly enforces `current_user.role == 'HR_Admin'`.
3. `POST /api/project-applications/{application_id}/review`:
   - HR admin reviews an application. Role check correctly enforces `current_user.role == 'HR_Admin'`.
4. `GET /api/data`:
   - Currently returns ALL employee records, all skills, all evidence, and all applications indiscriminately to any authenticated user, including regular employees. Role-based field visibility is completely missing.
5. Missing Endpoints in FastAPI:
   - Profile editing, HR evidence verification, project membership management, project creation, and employee directory additions are currently absent from FastAPI, leaving them vulnerable in Vite CSV middleware.

---

## Required Action Plan (Phases 2 through 7)

1. **Phase 2 (Single Write Path)**:
   - Retire all CSV-writing middleware in `vite.config.ts`. All writes must route to FastAPI.
   - Implement dedicated domain service modules: `profile_service`, `evidence_service`, `training_service`, `availability_service`, `application_service`, `role_service`, `verification_service`.
   - Execute every write in a single database transaction: save -> recompute proficiency for affected employee+skills only -> write audit log -> bump data version.
   - Implement optimistic concurrency (`version` / `updated_at` check, returning 409 Conflict on stale updates).
   - Ensure recomputation is idempotent with a "rebuild all" CLI command.
2. **Phase 3 (Single Read Path)**:
   - Make `/api/data` and all read endpoints query SQLite directly. Remove CSV loading.
   - Enforce role-based field visibility through a centralized serializer (employees see their own data + HR notes; managers see team/search; HR sees all).
   - Evidence status changes (`Self-reported`, `Link checked`, `Verified by HR`, `Rejected`, `Needs info`) immediately recompute levels, search rankings, and profile views.
3. **Phase 4 (Frontend Sync)**:
   - Replace module-level `CSV_DATA` and manual local state patching with a unified query cache (TanStack Query or dedicated cache layer) keyed per entity.
   - Auto-refetch on focus and poll / SSE on `data_version` changes.
   - Mutation controls: disabled with spinner, double-click protection (idempotency keys), inline field errors, 409 conflict dialog with reload button.
4. **Phase 5 (Employee Features & Buttons)**:
   - Fix all Broken, Fake, and Dead buttons identified in Section d.
   - Implement "Why is my level X?" explanation drawer.
   - Implement 10-second Undo for evidence deletion.
   - Ensure learning hours logging, unenroll, and request completion flow seamlessly to HR review.
5. **Phase 6 & 7 (Cross-Role Testing & Verification)**:
   - Multi-context Playwright tests verifying instant propagation across Employee, Manager, and HR sessions.
   - Zero CSV I/O, zero module caches, zero duplicate scoring paths.
