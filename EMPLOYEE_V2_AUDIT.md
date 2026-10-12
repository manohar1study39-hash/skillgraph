# SkillGraph Employee Portal (My Career Hub) V2 Audit

**Audit Date**: October 2026  
**Auditor**: Antigravity Assistant  
**Status**: Phase 0 Complete — No code changes made. Existing test suite passing (16/16 tests pass).

---

## 1. Employee Controls Walkthrough Matrix

| Screen / Component | Control | Expected Behavior | Actual Behavior | API Route | Persists? | Status | Action Required |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Hero / Header** | Profile Card (Avatar, Name, Title, Dept, Team, Location) | Displays authenticated employee profile details accurately from database | Displays employee object derived via client-side email/name matching or fallback `emp-{user.user_id}` | `GET /api/session`, `GET /api/data` | Yes (reads CSVs) | **Broken** | Bind strictly to auth session token. Prevent fallback mock profile. |
| **Hero / Header** | Profile Completeness Ring & Score | Documented formula from real fields (identity, at least 3 skills, evidence items, project, certification) with specific missing item shown | Hardcoded arbitrary formula in UI (`20 base + 20 role/dept + 20 skills>=3 + 20 totalVerifiedProofs + 20 projects/certs`) | None (pure UI) | Recalculated in memory | **Fake** | Replace with server-calculated documented formula and display missing step guidance. |
| **Hero / Header** | "Edit Profile" Button | Opens profile editor modal with unsaved changes protection | Opens modal; no unsaved-changes dirty guard | None | N/A | **Works** | Add unsaved-changes warning before close/cancel. |
| **Hero / Header** | Hero Stat Chip: "My Verified Skills" | Displays count of skills evaluated via deterministic scoring engine | Displays `currentEmployee.skills.length`, mislabelled as "Verified Skills" | None (reads client state) | Memory | **Fake** | Rename to neutral "Skills ({count})" and fetch count from scoring engine. Make chip click navigate to Skills tab. |
| **Hero / Header** | Hero Stat Chip: "Verified Proofs" | Displays count of non-rejected evidence items with verified status breakdown | Filter `e.verified && !e.expired`; self-reported items are counted as "verified" | None (reads client state) | Memory | **Fake** | Rename to "Evidence Proofs ({count})" with true status breakdown. Click navigates to Skills tab. |
| **Hero / Header** | Hero Stat Chip: "Enrolled Courses" | Count of active courses enrolled by employee from database | Computed from client-filtered `progress` array | None (reads client state) | Memory | **Works** | Server-derive real count; make chip clickable to navigate to Learning tab. |
| **Hero / Header** | Hero Stat Chip: "Role & Project Matches" | Count of qualified/matched opportunities based on true scoring engine | Sum of gigs + roles matching naive keyword presence | None (reads client state) | Memory | **Fake** | Derive from real scoring engine against required levels and free hours. Make chip clickable to Opportunities tab. |
| **Hero / Header** | Availability Slider (0–100%) | Adjusts employee availability percentage | Updates local state, sets free hours heuristically | `POST /api/employee-availability` | Yes (writes `employees.csv`) | **Broken** | Concurrency bug on write. Trusts client email resolution. Does not check committed hours across accepted gigs. |
| **Hero / Header** | Free Hours Input / Presets | Sets available hours/week free for allocation | Updates local state; does not enforce max weekly hours or warn on overcommit | `POST /api/employee-availability` | Yes (writes `employees.csv`) | **Broken** | Track committed hours across pending/accepted applications; warn/block overcommit. |
| **Hero / Header** | "Save & Sync Availability" Button | Atomically persists availability & free hours in DB; reflected in HR search immediately | Rewrites entire `employees.csv` using flawed email index matching; falls back to `emp-1` if email contains 'employee' | `POST /api/employee-availability` | Yes (flawed write) | **Broken** | Atomic DB update keyed strictly to auth session employee ID. Add optional "available from" date. |
| **Overview & Pathways** | Ambition Target Role Selector (Dropdown) | Selects target career role from HR-defined active roles; persists selection to user profile | Reads from roles CSV; writes to browser `localStorage` (`skillgraph-ambition-${id}`); does not persist across devices/re-logins | None (`localStorage` only) | No (lost on cache clear) | **Broken** | Restrict to active HR-defined roles with required skills/levels; persist chosen ambition in DB. |
| **Overview & Pathways** | Ambition Readiness Ring & Badge | Deterministic gap analysis using unified 0-5 engine and realistic hour estimates | Reads `analyzeRoleGap` which arbitrarily grants 100% credit if progress status is "Done" without proof | `GET /api/data` | Client derived | **Fake** | Remove arbitrary 50%/100% unverified progress boost. Use unified proficiency engine. |
| **Overview & Pathways** | Ambition Met Skills & Gaps Breakdown | Real gap per skill (current level vs required level, hours to bridge, formula) | Displays gap badges; uses arbitrary credit formula | `GET /api/data` | Client derived | **Works** | Show exact formula, met skills, gaps, estimated hours/weeks from deterministic engine. |
| **Overview & Pathways** | "Bridge Skill Gaps" Button | Switches to Learning tab filtered to courses closing target role's exact gaps | Sets subtab to `courses`, but does not filter catalog to the specific missing skills | None (tab switch) | N/A | **Broken** | Pass specific target skill gaps to Learning tab filter automatically. |
| **Overview & Pathways** | Top Skills List ("Top Verified Skills") | Lists top skills with validated levels and evidence counts | Mislabelled "Top Verified Skills"; self-declared skills are shown | None (client state) | Memory | **Fake** | Rename to "Primary Skills"; show claimed vs evidenced levels neutrally. |
| **Overview & Pathways** | Quick "+ Add Proof" Button | Opens `SubmitEvidenceModal` pre-populated with target skill | Opens modal with skill pre-selected | None | N/A | **Works** | Wire to unified proof submission workflow. |
| **Overview & Pathways** | "Inspect Audit Trail" Button | Opens `EvidenceModal` showing complete evidence breakdown | Opens modal; modal labels all items as "Verified by GitHub & Jira" even if self-declared | None | N/A | **Fake** | Show accurate item statuses: Self-reported, Link checked, Verified by HR, Rejected, Needs info. |
| **Overview & Pathways** | Quick Gigs View ("Express Interest / Apply") | Opens `ApplyOpportunityModal` with gig pre-selected | Opens apply modal | None | N/A | **Works** | Validate availability hours before opening. |
| **My Skills** | Search Input ("Search verified skills...") | Searches employee skills by name, category, level | Filters local array | None | Memory | **Works** | Rename placeholder from "Search verified skills..." to "Search skills...". |
| **My Skills** | Category Filter Pills (All, Frontend, Backend, etc.) | Filters displayed skills by category taxonomy | Filters local array | None | Memory | **Works** | Support server-side pagination / memoized filtering with clean empty states. |
| **My Skills** | "+ Add Evidence Proof" Header Button | Opens proof submission modal for any taxonomy skill | Opens modal with default skill | None | N/A | **Works** | Retain button with updated modal workflow. |
| **My Skills** | Skill Card Level Badge | Displays deterministic proficiency level (1-5: Aware, Guided, Independent, Advanced, Expert) | Displays Beginner-Master mapped from ad-hoc 0-100 `estimateLevel` score | None | Memory | **Duplicate** | Replace with unified 0-5 proficiency engine scale. |
| **My Skills** | Skill Card Score Bar (0–100) | Secondary display derived deterministically from total points | Ad-hoc formula in `dataLoader.ts` (`proofScore * 75 + years * 100`) differing from matching engine | None | Memory | **Duplicate** | Derive 0-100 purely as visual display representation of unified engine points. |
| **My Skills** | Skill Card Confidence % & Tooltip | Documented confidence formula (source trust x recency x evidence count) with breakdown on hover | Displays `confidenceScore` without documented components or breakdown | None | Memory | **Fake** | Implement documented confidence score formula with hover breakdown. |
| **My Skills** | Skill Card Verified Proofs Count | Displays evidence count with status tags | Labels all active evidence items as "verified proof recorded in audit log" | None | Memory | **Fake** | Display accurate count of evidence by status (Self-reported, Link checked, Verified by HR). |
| **My Skills** | Skill Card "Inspect Proofs" Button | Opens evidence inspect drawer/modal | Opens `EvidenceModal` | None | N/A | **Works** | Show honest statuses and HR notes. |
| **My Skills** | Skill Card "Why is my level X?" | Drawer/modal explaining points, thresholds, ordered evidence contributions, guidance | Does not exist | None | N/A | **Dead** | Implement "Why is my level X?" drawer reading unified engine explanation API. |
| **My Skills** | Claimed vs Evidenced Display | Displays claimed level alongside evidenced level in neutral wording | Displays only single computed level; masks claims | None | N/A | **Dead** | Add neutral "Claimed: Level X \| Evidenced: Level Y" display. |
| **Learning & Upskilling** | Filter Pills (All Courses, My Enrolled, Recommended) | Filters course list by enrollment status | Filters client array | None | Memory | **Works** | Keep filters; ensure server-synced enrollment data. |
| **Learning & Upskilling** | Course Search Input | Searches courses by title/provider | Filters client array | None | Memory | **Works** | Keep search; ensure debounce and proper empty state. |
| **Learning & Upskilling** | Enrolled Course Card | Shows course details, provider, duration, hours logged, progress % | Shows hardcoded duration weeks and client progress % | `GET /api/data` | Yes | **Works** | Upgrade to show logged hours vs required course hours. |
| **Learning & Upskilling** | Set Progress Buttons (0%, 25%, 50%, 75%, Done) | Logs learning progress | Buttons send discrete percentages; clicking "Done" immediately grants 100% readiness without proof | `POST /api/upskilling-progress` | Yes (writes `upskilling_progress.csv`) | **Fake** | Replace with hours-based logging (hours, date, note, link) and "Request completion" requiring approval. |
| **Learning & Upskilling** | "Request Completion" Workflow | Submits certificate or completion link for HR/manager approval; credit capped until approved | Does not exist; employee clicks "Done" and gets instant full credit | None | N/A | **Dead** | Implement approval workflow ("Awaiting approval" status; capped partial credit until approved). |
| **Learning & Upskilling** | "Enroll in Course" Button | Enrolls employee in course without duplicate enrolment | Calls `handleCourseProgressUpdate` with arbitrary 25% initial progress | `POST /api/upskilling-progress` | Yes | **Broken** | Enroll with 0% / 0 hours; prevent duplicate enrollments; provide Unenroll button. |
| **Learning & Upskilling** | "Suggest a Course" Workflow | Kind empty state when course not found, allowing submitting a real suggestion for HR | None; shows static empty message | None | N/A | **Dead** | Implement suggestion modal storing real suggestions for HR review. |
| **Learning & Upskilling** | Live Time Estimate & Weekly Hours Slider | Formula `hours / weekly learning hours` with live slider and projected completion date | Static duration weeks multiplied by fixed 8 hours / availability | None | N/A | **Fake** | Implement dynamic interactive calculator with live slider and projected date from logged pace. |
| **Internal Opportunities** | Filter Pills (All, Project Gigs, Open Roles, My Applications) | Filters opportunities by gig vs role vs applied | Filters client array using naive IDs | None | Memory | **Works** | Keep pills; back with robust server-side queries. |
| **Internal Opportunities** | Opportunity Card Match % | Coverage weighted by importance against required levels + availability check | Calculated via raw string/skill ID presence (`matchedCount / total * 100`), ignoring proficiency levels | None | Memory | **Fake** | Calculate via unified matching engine against required levels, must vs nice, and free hours. |
| **Internal Opportunities** | Skill Gap / Match Explanation | Displays matched, below-level, and missing skills with one-line explanation | Displays raw tech badge list | None | Memory | **Fake** | Add structured breakdown: Matched skills, Below-level skills, Missing skills. |
| **Internal Opportunities** | "Express Interest / Apply" Button | Validates free hours, warns if overcommitted, opens `ApplyOpportunityModal` | Opens modal without checking availability or prior applications | None | N/A | **Broken** | Check free hours; warn on overcommit; disable if opportunity closed/filled. |
| **Internal Opportunities** | "Applied" Badge & Status | Shows real HR workflow status (Pending -> Shortlisted -> Accepted/Rejected -> Withdrawn/Filled) | Shows static "Application Active: Pending Review" | `GET /api/project-applications` | Yes | **Broken** | Display real status and HR feedback notes. |
| **Internal Opportunities** | "Withdraw Application" (Trash Button) | Transitions status to "Withdrawn" while retaining audit trail | Sends `DELETE /api/project-applications` which permanently purges the CSV record | `DELETE /api/project-applications` | Yes (deletes row) | **Broken** | Soft-delete / status update (`status = 'Withdrawn'`); never permanently delete. |
| **Submit Skill Proof Modal** | Target Technical Skill Selector | Selects skill from canonical taxonomy | Selects skill from `CSV_DATA.skillsData` | None | N/A | **Works** | Retain canonical taxonomy binding. |
| **Submit Skill Proof Modal** | Artifact Type Buttons (PR, Commit, Project, Cert, Feedback) | Sets artifact type; applies domain validation | Sets type and flat multiplier (1.5x / 1.2x / 1.0x) | None | N/A | **Broken** | Replace flat multipliers with configurable scoring engine base weights. Enforce URL domain rules. |
| **Submit Skill Proof Modal** | Title / Description Input | Validates title length (e.g. 5–200 chars) | Only checks non-empty | None | N/A | **Broken** | Add minimum length validation and sanitization. |
| **Submit Skill Proof Modal** | Verification URL Input | Validates URL format and allowed domains per type (GitHub, GitLab, Jira, cert provider) | Basic HTML `type="url"` with no domain validation | None | N/A | **Broken** | Enforce domain whitelist per artifact type (e.g. github.com for PR/commit). |
| **Submit Skill Proof Modal** | Associated Project Dropdown | Validates employee actually worked on selected project | Lists all company projects; employee can pick any project | None | N/A | **Broken** | Verify employee participation or label unassociated artifact appropriately. |
| **Submit Skill Proof Modal** | "Demonstrated Level" Selector | Records employee's CLAIM; does not alter evidenced level | Saves directly as `proficiency_level` in `employee_skills.csv` | `POST /api/evidence` | Yes | **Broken** | Store as claimed level; never use as evidenced level. |
| **Submit Skill Proof Modal** | Multiplier Banner ("1.5x Verified Multiplier") | Explains scoring factors transparently | Labels unreviewed item as "Verified Multiplier" | None | N/A | **Fake** | Rename to "Base Weighting" and display honest status explanation. |
| **Submit Skill Proof Modal** | "Submit Verified Proof" Button | Submits evidence with status "Self-reported" or "Link checked"; rate-limited; duplicate check | Submits to `/api/evidence` as `verified: 'true'`; no rate limit; no duplicate check | `POST /api/evidence` | Yes (writes `evidence.csv`) | **Broken** | Save status as "Self-reported" (or "Link checked" via GitHub API); check duplicates; rate limit. |
| **Submit Skill Proof Modal** | Multi-skill Share Split | Allows 1 artifact to support multiple skills by splitting contribution share | Only supports 1 skill per evidence item | None | N/A | **Dead** | Implement multiple skills with percentage share split. |
| **Submit Skill Proof Modal** | Undo Submission | Allows 10-second undo window to retract submission | Toast only; no undo mechanism | None | N/A | **Dead** | Implement 10-second Undo action toast. |
| **Apply Opportunity Modal** | Bandwidth Commitment Presets (5, 10, 15, 20 hrs) | Ensures commitment <= free capacity | Allows selecting 20 hrs even if free capacity is lower | None | N/A | **Broken** | Validate against remaining free hours (`hoursPerWeekFree - committedHours`). Block if exceeded. |
| **Apply Opportunity Modal** | Application Pitch Note Textarea | Validates pitch length (e.g. 20–1000 chars) | Only checks non-empty | None | N/A | **Broken** | Add character limits and validation guidance. |
| **Apply Opportunity Modal** | Banner: "Your verified skills will be attached..." | Informs applicant of attached profile summary | Text claims "verified skills" regardless of verification status | None | N/A | **Fake** | Reword to "Your skill profile and evidence portfolio will be attached". |
| **Apply Opportunity Modal** | "Submit Application" Button | Atomically submits application with unique constraint (1 per opp); validates free hours | Submits to `/api/project-applications`; allows multiple applications or overcommit | `POST /api/project-applications` | Yes (writes `project_applications.csv`) | **Broken** | Enforce unique constraint `(employee_id, opportunity_id)`. Deduct/track committed hours. |
| **Profile Editor Modal** | Step 1: Personal & Role Details | Updates basic info for authenticated employee only | Submits to `/api/employee-profile` which uses loose email/name match | `POST /api/employee-profile` | Yes (writes `employees.csv`) | **Broken** | Bind strictly to auth session user ID. Prevent modifying other employee profiles. |
| **Profile Editor Modal** | Step 2: Availability & Free Hours | Updates availability and free hours atomically | Submits availability to CSV | `POST /api/employee-profile` | Yes | **Broken** | Concurrency safety; recalculate workload automatically. |
| **Profile Editor Modal** | Step 3: Skills Management | Saves self-declared skills marked as "Self-reported" with level ceiling <= 1 | Overwrites `employee_skills.csv` with `source: 'self'`, `verified: 'true'`! | `POST /api/employee-profile` | Yes (writes `employee_skills.csv`) | **Broken** | Save self-declared skills as `source: 'self'`, `verified: 'false'`, status "Self-reported", capped at Level 1. |
| **Profile Editor Modal** | Save Toast | Accurate confirmation toast | Displays "Profile and verified skills updated successfully!" for self-edits | None | N/A | **Fake** | Reword toast to "Profile and skills updated successfully!". |

---

## 2. Inventory of CSV Reads and Writes

| File | Read Locations | Write Locations | Concurrency & Integrity Risk |
| :--- | :--- | :--- | :--- |
| `data/company_users.csv` | `vite.config.ts`: `readSession`, `POST /api/signup`, `POST /api/login`, `GET /api/pending-approvals`, `POST /api/approvals/:id`, `POST /api/reject-approval/:id`, `POST /api/deactivate-user/:id`, `GET /api/active-users`, `POST /api/employees`<br>`src/services/companyAuth.ts` | `vite.config.ts`: `POST /api/signup`, `POST /api/approvals/:id`, `POST /api/reject-approval/:id`, `POST /api/deactivate-user/:id`, `POST /api/employees` | **High**: Read-modify-write without file locks. Simultaneous registrations or approvals overwrite each other. |
| `data/employees.csv` | `vite.config.ts`: `GET /api/data`, `POST /api/signup`, `POST /api/employee-availability`, `POST /api/upskilling-progress`, `POST /api/employee-profile`, `POST /api/employees`, `POST /api/evidence`, `POST /api/project-applications`<br>`src/services/dataLoader.ts` | `vite.config.ts`: `POST /api/signup`, `POST /api/employee-availability`, `POST /api/upskilling-progress`, `POST /api/employee-profile`, `POST /api/employees`, `POST /api/evidence` | **Critical**: Read-modify-write of whole CSV on every profile, availability, or evidence save. Fallback logic overwrites `emp-1`. |
| `data/employee_skills.csv` | `vite.config.ts`: `GET /api/data`, `POST /api/learning-resources`, `POST /api/evidence`<br>`src/services/dataLoader.ts` | `vite.config.ts`: `POST /api/employee-profile`, `POST /api/employees`, `POST /api/evidence` | **Critical**: Overwrites all skills for employee on profile save; marks self-added skills as `verified: 'true'`. Race conditions on concurrent skill adds. |
| `data/evidence.csv` | `vite.config.ts`: `GET /api/data`, `POST /api/evidence`<br>`src/services/dataLoader.ts` | `vite.config.ts`: `POST /api/evidence` | **High**: Reads entire evidence CSV, appends record, rewrites entire file. Two simultaneous submissions will drop one submission. |
| `data/upskilling_progress.csv` | `vite.config.ts`: `GET /api/data`, `POST /api/upskilling-progress`<br>`src/services/dataLoader.ts` | `vite.config.ts`: `POST /api/upskilling-progress` | **High**: Read-modify-write on every progress button click. Concurrent progress updates drop rows. |
| `data/project_applications.csv`| `vite.config.ts`: `GET /api/project-applications`, `POST /api/project-applications`, `DELETE /api/project-applications` | `vite.config.ts`: `POST /api/project-applications`, `DELETE /api/project-applications` | **High**: Full file rewrite on every application or withdrawal. No transaction or rollback. |
| `data/audit_log.csv` | `vite.config.ts`: `GET /api/audit-log` | `vite.config.ts`: `writeAuditLog` (`fs.appendFileSync`) | **Medium**: Append is synchronous but unbuffered and lacks transactional linkage to database mutations. |
| `data/certifications.csv` | `vite.config.ts`: `GET /api/data`<br>`src/services/dataLoader.ts` | `vite.config.ts`: `POST /api/employee-profile` | **High**: Rewrites all employee certifications on profile save. |
| `data/projects.csv` | `vite.config.ts`: `GET /api/data`, `POST /api/employee-profile`, `POST /api/project-members`, `POST /api/projects`<br>`src/services/dataLoader.ts` | `vite.config.ts`: `POST /api/projects` | **Medium**: Concurrent project creation collisions. |
| `data/employee_projects.csv` | `vite.config.ts`: `GET /api/data`, `POST /api/project-members`, `DELETE /api/project-members`<br>`src/services/dataLoader.ts` | `vite.config.ts`: `POST /api/employee-profile`, `POST /api/project-members`, `DELETE /api/project-members` | **High**: Full file rewrite when assigning/removing project members. |
| `data/roles.csv` | `vite.config.ts`: `GET /api/data`, `POST /api/upskilling-progress`, `POST /api/projects`<br>`src/services/dataLoader.ts` | `vite.config.ts`: `POST /api/projects` | **Medium**: File rewrite on project creation. |
| `data/role_skills.csv` | `vite.config.ts`: `GET /api/data`, `POST /api/projects`<br>`src/services/dataLoader.ts` | `vite.config.ts`: `POST /api/projects` | **Medium**: Appends skills linked to project roles via file rewrite. |
| `data/learning_resources.csv` | `vite.config.ts`: `GET /api/data`, `POST /api/upskilling-progress`<br>`src/services/dataLoader.ts` | `vite.config.ts`: `POST /api/learning-resources` | **Medium**: Rewrites file on HR resource creation. |
| `data/project_shortlists.csv` | `vite.config.ts`: `GET /api/data`, `POST /api/project-shortlists`, `DELETE /api/project-shortlists`<br>`src/services/dataLoader.ts` | `vite.config.ts`: `POST /api/project-shortlists`, `DELETE /api/project-shortlists` | **High**: Full file rewrite on shortlist addition/removal. |
| `data/skills.csv` | `vite.config.ts`: `GET /api/data`, `POST /api/projects`<br>`src/services/dataLoader.ts` | Read-only in API | Read-only. |
| `data/marketplace_opportunities.csv` | Present in `data/` folder | None | **Dormant file**: Unused by server API routes; roles and projects are used instead. |

---

## 3. Race Condition & Concurrency Vulnerability Analysis

1. **Non-Atomic Read-Modify-Write (RMW) Pattern**:
   - In `vite.config.ts`, every mutation performs:
     ```ts
     const rows = parseCsv(fs.readFileSync(file, 'utf8'));
     rows.push(newItem); // or rows.filter(...)
     writeCsv(file, rows); // fs.writeFileSync
     ```
   - If two HTTP requests arrive concurrently (e.g. Employee A submits evidence while Employee B updates availability), request B's read executes before request A's write finishes. When request B writes back, Request A's modifications are completely lost.

2. **No File Locking**:
   - `fs.writeFileSync` does not use file locking (`flock`). Simultaneous writes can interleave chunks, leading to corrupted, malformed CSV records or truncated files.

3. **Crash Vulnerability**:
   - Writing directly to the destination path without writing to a temporary file and atomically renaming (`fs.renameSync`) means any server crash, OS interrupt, or syntax serialization error during write will wipe or truncate the CSV file to 0 bytes.

4. **Audit Log Decoupling**:
   - `writeAuditLog` is called after file writes in a separate unlinked append. If the write succeeds but the audit log fails (or vice versa), the system state becomes permanently desynchronized.

---

## 4. Endpoints Trusting Client-Supplied Employee ID or Insecure Identity Resolution

1. **`POST /api/upskilling-progress`**:
   - When called by non-Employee role (e.g. HR or Manager), trusts `row.employee_id` directly from request body without checking permissions.
   - When called by Employee role, uses flawed fallback:
     ```ts
     let currentEmp = empRows.find(e =>
       (e.email && e.email.toLowerCase() === userEmail) ||
       (e.name && e.name.toLowerCase() === userName) ||
       (userEmail.includes('employee') && e.employee_id === 'emp-1')
     );
     ```
     **Critical Flaw**: If any employee's email contains the string `"employee"` (e.g. `employee.smith@company.com`), they are matched to `emp-1` (Alex Chen) and mutate Alex Chen's records!

2. **`DELETE /api/project-applications`**:
   - Accepts `{ application_id, opportunity_id }` from the client request body.
   - Performs `applications.filter(a => !(a.application_id === appId || (oppId && a.opportunity_id === oppId)))`.
   - **Critical Vulnerability**: Does NOT verify that the application belongs to the authenticated user! Any employee can submit a DELETE request with another employee's `application_id` or an `opportunity_id` and delete other employees' applications!

3. **`POST /api/project-applications`**:
   - Also uses `(userEmail.includes('employee') && e.employee_id === 'emp-1')` fallback.
   - If `currentEmp` is not found, creates `emp-${user.user_id}` on the fly, creating split identities.

4. **`POST /api/employee-profile`**:
   - Accepts `body.skills`, `body.topProjects`, `body.certifications`.
   - Resolves employee by name/email fallback. If name or email differs slightly, can mutate the wrong record or create duplicates.
   - Does not verify that the authenticated employee is authorized to update the targeted record.

5. **`POST /api/project-shortlists` & `DELETE /api/project-shortlists`**:
   - Accepts `employee_id` in request body without checking if the employee exists or if the caller is authorized.

6. **`POST /api/project-members` & `DELETE /api/project-members`**:
   - Accepts `employee_id` in request body directly.

7. **`GET /api/data`**:
   - Returns the entire contents of all 12 CSV files to ANY authenticated user, including normal employees. Normal employees receive all other employees' salaries, workloads, internal notes, applications, and audit logs.

---

## 5. UI Inventory of "Verified" and "Authentic" Misattributions for Self-Reported Data

| File & Line | Code Snippet / UI String | Why It Is Misleading / Violation of Rule 4 |
| :--- | :--- | :--- |
| `src/components/evidence/SubmitEvidenceModal.tsx:82` | `onShowToast('Verified skill proof submitted successfully! Audit log updated.')` | Self-submitted proof is labeled "Verified" immediately upon form submission with zero human or system review. |
| `src/components/evidence/SubmitEvidenceModal.tsx:109` | `Log authentic work artifacts to verify your competencies` | Self-reported items are described as "authentic" and claimed to automatically "verify" competencies. |
| `src/components/evidence/SubmitEvidenceModal.tsx:251` | `{weight}x Verified Multiplier` | The multiplier is labeled "Verified Multiplier" before any verification has taken place. |
| `src/components/evidence/SubmitEvidenceModal.tsx:272` | `<Check className="w-4 h-4" /> Submit Verified Proof` | Submit button promises "Submit Verified Proof" for an unverified claim. |
| `src/components/evidence/SubmitEvidenceModal.tsx:48, 230` | `Demonstrated Level` dropdown | User selects a level which is directly written as the employee's `proficiency_level`, treating a self-claim as demonstrated reality. |
| `src/components/employee/EmployeePortalTab.tsx:458` | `<ShieldCheck className="w-3.5 h-3.5 text-[#10B981]" /> Verified Career Profile` | Profile banner claims "Verified Career Profile" regardless of verification status. |
| `src/components/employee/EmployeePortalTab.tsx:555` | `label: 'My Verified Skills (' + currentEmployee.skills.length + ')'` | The main skills navigation tab labels ALL skills as "Verified Skills". |
| `src/components/employee/EmployeePortalTab.tsx:824` | `Top Verified Skills` | Section header claims skills are "Verified". |
| `src/components/employee/EmployeePortalTab.tsx:858` | `Verified Proofs: {verifiedProofsCount} evidences` | Filters on `e.verified`, but self-submitted items are initialized with `verified: true`. |
| `src/components/employee/EmployeePortalTab.tsx:942` | `Verified Skills & Competency Proofs` | Subtab header claims all competencies and proofs are "Verified". |
| `src/components/employee/EmployeePortalTab.tsx:944` | `Scored and authenticated by repository commits, PR reviews, and peer endorsements.` | Claims artifacts are "authenticated" even when self-reported or unlinked. |
| `src/components/employee/EmployeePortalTab.tsx:991` | `placeholder="Search verified skills..."` | Search box asserts all skills are verified. |
| `src/components/employee/EmployeePortalTab.tsx:1041` | `{verifiedProofs.length} verified proof... recorded in audit log` | Card text claims unverified self-submissions are "verified proofs". |
| `src/components/employee/EmployeePortalTab.tsx:1320` | `...matching your verified skills.` | Opportunities tab copy asserts opportunities match "verified skills". |
| `src/components/employee/EmployeeProfileEditorModal.tsx:125`| `onShowToast('Profile and verified skills updated successfully!')` | Toast asserts self-edited skills are "verified skills". |
| `src/components/evidence/EvidenceModal.tsx:65, 140, 198` | `Inspecting verified proof logs`, `Verified Work Artifacts`, `Evidence verified via GitHub Enterprise & Jira API integrations` | Static modal copy asserts all displayed items are verified via GitHub & Jira APIs. |
| `src/components/employee/ApplyOpportunityModal.tsx:188` | `Your verified skills will be attached automatically to your application profile.` | Modal banner asserts applicant's skills are "verified". |
| `vite.config.ts:473` | `remainingSkills.push({ ... source: 'self', verified: 'true' })` | Server backend explicitly sets `verified: 'true'` when an employee adds a self-declared skill! |
| `vite.config.ts:700` | `allSkills.push({ ... source: 'self', verified: 'true' })` | Server backend sets `verified: 'true'` on new skills. |
| `vite.config.ts:834` | `empSkills.push({ ... source: 'github', verified: 'true' })` | Server backend marks submitted evidence skill as `verified: 'true'` without any GitHub check. |

---

## 6. Duplicate & Inconsistent Scoring Paths

| Scoring Path | Implementation Location | Scale / Range | Formula & Multipliers | Inconsistencies & Issues |
| :--- | :--- | :--- | :--- | :--- |
| **DataLoader Estimate** | `src/services/dataLoader.ts:99` (`estimateLevel`) | 0–100 score mapped to 5 tiers: Beginner (0-27), Intermediate (28-49), Advanced (50-69), Expert (70-87), Master (88-100) | `proofScore = min(1, sum(items)/3); years = min(1, yrs/8)*declaredWeight*0.35; score = proofScore*75 + years*100`<br>Items use flat `1.5` multiplier if `['PR','commit','cert','code_review','project','feedback']`. | Separate scoring algorithm from matching engine and upskilling engine. Multipliers hardcoded. Only used when loading initial client state from CSVs. |
| **Upskilling Readiness** | `src/services/upskillingEngine.ts:67` (`analyzeRoleGap`) | 0–100% readiness percentage; 5 levels (Beginner=1 to Master=5) | `credit = min(currentLevel, required) / required * confidence`<br>**Major loophole**: If `progress.status === 'Done'` or `pct >= 100`, `credit = max(credit, 1.0)` regardless of evidence or approval! | Bypasses proof requirement entirely on "Done" click. Does not use point-based accumulation. Differs from `estimateLevel`. |
| **Talent Matching Engine** | `src/services/matchingEngine.ts:300` (`rankCandidatesForRequirements`) | 0–99 match score | `levelCredit = min(currIdx+1, reqIdx+1)/(reqIdx+1); credit = levelCredit*(0.7 + conf*0.3); readiness = earned/possible; baseScore = readiness*75 + (capacity/100)*20 + evidenceBonus` | A THIRD different readiness and credit formula! Uses 0.7 + 0.3*conf, differing from `upskillingEngine` which multiplies directly by `confidence`. |
| **Employee Portal Gig Match** | `src/components/employee/EmployeePortalTab.tsx:247` | 0–100% | `matchedCount / techList.length * 100` | Naive substring presence match; ignores proficiency levels completely; ignores employee availability. |
| **Employee Portal Role Match** | `src/components/employee/EmployeePortalTab.tsx:272` | 0–100% | `matchedCount / roleReqs.length * 100` | Naive skill ID presence match; ignores required level (e.g. beginner counts same as expert); ignores availability. |
| **Submit Evidence Weight** | `src/components/evidence/SubmitEvidenceModal.tsx:49, 148-152` | Flat multipliers (1.0, 1.2, 1.5) | Static multipliers per type: PR=1.5, commit=1.5, app=1.5, cert=1.2, review=1.0 | Flat multipliers ignore duration factor, complexity, role factor, contribution share, and verification factor. |

---

## 7. Audit Conclusion & Phase 1-6 Blueprint

The audit confirms:
1. **Data Layer**: File-based CSV persistence suffers from severe race conditions, concurrency loss, and complete lack of ACID guarantees.
2. **Security & Identity**: Client endpoints trust body-supplied employee IDs and use flawed email substring matching (`userEmail.includes('employee')`), causing user collisions.
3. **Scoring Integrity**: At least four separate, competing scoring equations exist across `dataLoader`, `upskillingEngine`, `matchingEngine`, and `EmployeePortalTab`. Clicking "Done" grants instant 100% credit without proof.
4. **Veracity**: Self-submitted proofs and profile additions are erroneously stamped as "verified" in both UI copy and backend CSV fields.
5. **No code changes were made in Phase 0**. All existing 16 test cases continue to run and pass.

Proceeding to Phase 1 requires user approval as specified by Rule 5.
