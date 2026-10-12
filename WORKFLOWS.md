# SkillGraph V2 — HR & Manager Workflows Specification

**Status**: Active & Enforced  
**Backend**: FastAPI + SQLite (`data/skillgraph.db`)  
**Frontend**: React + TypeScript + Vite  

---

## 1. Architectural Principles

1. **Database as Single Source of Truth**: All operations read and write exclusively to SQLite (`data/skillgraph.db`). No CSV writes or in-memory mock handlers.
2. **Server-Enforced Authorization**: Identity and roles (`HR_Admin`, `Manager`, `Employee`) are extracted strictly from the HMAC-signed session cookie or Bearer token. Client claims are never trusted.
3. **Optimistic Concurrency Control (OCC)**: Mutating requests provide entity `version`. If the record's current version does not match, the server rejects the request with `HTTP 409 Conflict`.
4. **Atomic Transactions**: Multi-step operations (e.g., Application Acceptance) execute in a single ACID transaction. If any validation fails, the entire transaction rolls back cleanly.
5. **Real-Time Cross-Role Reactivity**: Every mutation appends an immutable `AuditLog` entry, increments `DataVersion`, and bumps entity versions, triggering instant UI updates across roles.

---

## 2. State Transition Matrices

### 2.1 Evidence Verification Queue (`/api/evidence/{id}/verify`)

* **Actor**: `HR_Admin` strictly (returns `403 Forbidden` for Managers and Employees).
* **Target Entity**: `Evidence` (`data/skillgraph.db`)

| Current Status | Target Status | Pre-Conditions | Post-Conditions | Invariants & Side Effects |
| :--- | :--- | :--- | :--- | :--- |
| `Self-reported`<br>`Link checked`<br>`Needs info` | `Verified by HR` | Actor is `HR_Admin`; item active (`deleted_at == None`); entity `version` matches. | Status updated to `Verified by HR`; `base_weight` set to `max(1.0, current_weight)`. | `recompute_employee_skills()` recalculated; `AuditLog(EVIDENCE_VERIFIED)` created; `DataVersion` bumped. |
| `Self-reported`<br>`Link checked`<br>`Needs info` | `Rejected` | Actor is `HR_Admin`; **explanatory note >= 3 characters required** (`422 Unprocessable Entity` if empty); version matches. | Status updated to `Rejected`; `hr_notes` saved. | Recomputes skills without this evidence; `AuditLog(EVIDENCE_REJECTED)` created; `DataVersion` bumped. |
| `Self-reported`<br>`Link checked` | `Needs info` | Actor is `HR_Admin`; **explanatory note >= 3 characters required** (`422` if empty); version matches. | Status updated to `Needs info`; `hr_notes` saved. | Evidence remains unverified; `AuditLog(EVIDENCE_STATUS_CHANGED)` created; `DataVersion` bumped. |
| `Self-reported` | `Link checked` | Actor is `HR_Admin`; URL reachable. | Status updated to `Link checked`; `base_weight` set to `max(1.0, current_weight)`. | `recompute_employee_skills()` recalculated; `AuditLog(EVIDENCE_STATUS_CHANGED)` created. |

---

### 2.2 Upskilling Completion Review (`/api/upskilling/admin/review-completion`)

* **Actor**: `HR_Admin` strictly (`403 Forbidden` for others).
* **Target Entity**: `UpskillingProgress` (`data/skillgraph.db`)

| Current Status | Action | Pre-Conditions | Post-Conditions | Invariants & Side Effects |
| :--- | :--- | :--- | :--- | :--- |
| `Awaiting approval` | `approve` (`approved=True`) | Actor is `HR_Admin`; record active; entity `version` matches. | Status set to `Done`; `progress_percent = 100.0`; `approval_status = "Approved"`. | Course evidence (`ev-course-{id}`) verified; full skill credit awarded; `recompute_employee_skills()` triggered; `AuditLog(COMPLETION_APPROVED)` created. |
| `Awaiting approval` | `reject` (`approved=False`) | Actor is `HR_Admin`; **mandatory rejection note >= 3 characters** (`422` if omitted); version matches. | Status set to `In progress`; `approval_status = "Rejected"`; `approval_note` saved. | Provisional credit reverted; `recompute_employee_skills()` triggered; `AuditLog(COMPLETION_REJECTED)` created. |

---

### 2.3 Marketplace Application Review (`/api/project-applications/{id}/review`)

* **Actor**: `HR_Admin` strictly (`403 Forbidden` for others).
* **Target Entity**: `ProjectApplication` (`data/skillgraph.db`)

| Current Status | Action | Pre-Conditions | Post-Conditions | Invariants & Side Effects |
| :--- | :--- | :--- | :--- | :--- |
| `Pending` | `Accept` | Actor is `HR_Admin`; candidate has **sufficient availability**: `employee.hours_per_week_free >= application.hours_per_week` (`400 Bad Request` if insufficient). | Status set to `Accepted`; `EmployeeProject` membership created; candidate free hours deducted. | Verified project evidence created; skills recomputed; `AuditLog(APPLICATION_REVIEWED)` created; `DataVersion` bumped. Single atomic commit. |
| `Pending` | `Reject` | Actor is `HR_Admin`; application exists; version matches. | Status set to `Rejected`; decision note saved. | No hours deducted; `AuditLog(APPLICATION_REVIEWED)` created; `DataVersion` bumped. |
| `Pending` | `Shortlist` | Actor is `HR_Admin`; application exists. | Status set to `Shortlisted`. | Candidate marked as shortlisted; `AuditLog(APPLICATION_REVIEWED)` created. |

---

### 2.4 Candidate Shortlists (`/api/project-shortlists`)

* **Actor**: `HR_Admin` or `Manager` (`403 Forbidden` for Employees).
* **Target Entity**: `ProjectShortlist` (`data/skillgraph.db`)

| Method & Route | Action | Pre-Conditions | Post-Conditions | Invariants & Side Effects |
| :--- | :--- | :--- | :--- | :--- |
| `POST /api/project-shortlists` | Shortlist candidate | Actor is HR or Manager; valid `project_id` and `employee_id`. | `ProjectShortlist` row created or existing row updated with new note. | Duplicate shortlists idempotent; `AuditLog(CANDIDATE_SHORTLISTED)` recorded; `DataVersion` bumped. |
| `DELETE /api/project-shortlists` | Remove candidate | Actor is HR or Manager; receives `project_id` and `employee_id` via query params or JSON body. | Record soft-deleted (`deleted_at = datetime.utcnow()`). | Candidate removed from shortlist view; `AuditLog(CANDIDATE_UNSHORTLISTED)` recorded; `DataVersion` bumped. |

---

### 2.5 Team Membership Assignment (`/api/project-members`)

* **Actor**: `HR_Admin` or `Manager` (`403 Forbidden` for Employees).
* **Target Entity**: `EmployeeProject` (`data/skillgraph.db`)

| Method & Route | Action | Pre-Conditions | Post-Conditions | Invariants & Side Effects |
| :--- | :--- | :--- | :--- | :--- |
| `POST /api/project-members` | Assign team member | Actor is HR or Manager; target employee and project exist and are active. | `EmployeeProject` row created or role updated. | `AuditLog(PROJECT_MEMBER_ASSIGNED)` created; `DataVersion` bumped. |
| `DELETE /api/project-members` | Remove member | Actor is HR or Manager; receives `project_id` and `employee_id` via query params or JSON body. | `EmployeeProject` row soft-deleted. | `AuditLog(PROJECT_MEMBER_REMOVED)` created; `DataVersion` bumped. |

---

### 2.6 User Management & Approvals (`/api/*`)

* **Actor**: `HR_Admin` strictly (`403 Forbidden` for all others).
* **Target Entity**: `CompanyUser` (`data/skillgraph.db`)

| Method & Route | Action | Pre-Conditions | Post-Conditions | Invariants & Side Effects |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/pending-approvals` | List queue | Actor is `HR_Admin`. | Returns list of inactive users (`is_active == False`, `deleted_at == None`). | Passwords omitted from serialized output. |
| `POST /api/approvals/{id}` | Approve user | Actor is `HR_Admin`; pending user exists. | User `is_active` set to `True`. | User can immediately authenticate; `AuditLog(APPROVE_USER)` created; `DataVersion` bumped. |
| `POST /api/reject-approval/{id}`| Reject signup | Actor is `HR_Admin`; pending user exists. | User soft-deleted (`deleted_at = datetime.utcnow()`). | User cannot authenticate; `AuditLog(REJECT_USER)` created; `DataVersion` bumped. |
| `POST /api/deactivate-user/{id}`| Deactivate account | Actor is `HR_Admin`; target is active; **target is not caller** (`400` if self). | Target `is_active` set to `False`. | Target session terminated on next request; `AuditLog(DEACTIVATE_USER)` created. |
| `GET /api/active-users` | List active | Actor is `HR_Admin`. | Returns list of active users. | Passwords omitted. |
| `GET /api/audit-log` | View audit trail | Actor is `HR_Admin`. | Returns last 100 immutable audit entries ordered newest first. | Read-only. |

---

### 2.7 Directory Employee Provisioning (`POST /api/employees`)

* **Actor**: `HR_Admin` strictly (`403 Forbidden` for non-HR).
* **Target Entity**: `Employee`, `EmployeeSkill` (`data/skillgraph.db`)

| Field | Validation Rule | Fallback / Sanitization |
| :--- | :--- | :--- |
| `name` | String, required, min 1 char | Error `400 Bad Request` if empty |
| `email` | Unique, valid email string | Error `400` if duplicate or missing |
| `availability_percent` | Numeric between 0.0 and 100.0 | Defaults to `80.0` if `None` or omitted |
| `hours_per_week_free` | Numeric between 0.0 and 60.0 | Defaults to `round(availability * 0.4)` if `None` |
| `skills` | Optional list of initial declared skills | Ingested as `Aware` (Level 1) self-reported |

---

## 3. Atomic Transaction Template

All mutating domain services follow this execution sequence:

```python
# 1. Authorize Actor
if actor.role != required_role:
    raise HTTPException(status_code=403, detail="Forbidden")

# 2. Validate Inputs & Pre-Conditions
validate_inputs(payload)

# 3. Optimistic Concurrency Check
check_optimistic_concurrency(entity, expected_version=payload.get("version"))

try:
    # 4. Mutate State
    apply_domain_changes(db, entity, payload)

    # 5. Deterministic Scoring Recomputation
    if skills_affected:
        recompute_employee_skills(db, employee_id, affected_skill_ids)

    # 6. Append Immutable Audit Log
    log_audit(db, event_type=EVENT_TYPE, actor_id=actor.user_id, ...)

    # 7. Bump Entity & Global Data Versions
    new_version = bump_data_version(db, employee_id)

    # 8. Commit ACID Transaction
    db.commit()
    return {"ok": True, "data_version": new_version}
except HTTPException:
    db.rollback()
    raise
except Exception as exc:
    db.rollback()
    raise HTTPException(status_code=500, detail=str(exc))
```
