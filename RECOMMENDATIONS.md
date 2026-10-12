# SkillGraph V2 — Architecture & Scalability Recommendations

This document provides technical recommendations for the SkillGraph platform beyond the immediate Phase 2 scope.

---

## 1. Database Indexing & Query Optimization

1. **Composite Indexes for Recomputation**:
   * Current queries frequently filter by `(employee_id, skill_id, deleted_at)`.
   * **Recommendation**: Add composite indexes:
     ```sql
     CREATE INDEX idx_evidence_emp_skill ON evidence (employee_id, skill_id, deleted_at);
     CREATE INDEX idx_emp_skills_emp_skill ON employee_skills (employee_id, skill_id, deleted_at);
     CREATE INDEX idx_cert_emp_skill ON certifications (employee_id, skill_id, deleted_at);
     ```
   * **Benefit**: Reduces proficiency recomputation latency from $O(N)$ table scans to $O(\log N)$ index seeks.

2. **Full-Text Search (FTS5) for Talent Search**:
   * Currently, name, title, department, and team search use SQL `ILIKE` (`%query%`).
   * **Recommendation**: Introduce an SQLite FTS5 virtual table for employee names, skill synonyms, and project titles.
   * **Benefit**: Sub-millisecond natural language search across thousands of employee records with typo tolerance.

---

## 2. Real-Time Sync & WebSocket Notifications

1. **Server-Sent Events (SSE) / WebSockets**:
   * Frontend currently polls `/api/data-version` every 3 seconds to detect changes.
   * **Recommendation**: Implement an SSE stream (`/api/events/stream`) in FastAPI using `asyncio.Queue` or Redis Pub/Sub.
   * **Benefit**: Instantaneous cross-role UI synchronization without HTTP polling overhead.

---

## 3. Asynchronous Worker for Bulk Rebuilds

1. **Background Task Queue for Full Rebuilds**:
   * `POST /api/admin/rebuild-proficiencies` recalculates all employees synchronously.
   * **Recommendation**: Offload full company recalculations to a background worker (Celery, ARQ, or FastAPI BackgroundTasks) and provide a job status polling endpoint (`/api/admin/jobs/{job_id}`).
   * **Benefit**: Prevents request timeouts on large employee rosters (> 10,000 employees).

---

## 4. Enhanced Optimistic Concurrency Experience

1. **Interactive Merge UI on 409 Conflict**:
   * When a manager receives `409 Conflict`, the client currently notifies them to reload the latest state.
   * **Recommendation**: Provide a side-by-side diff modal showing conflicting fields (e.g., project notes or staffing requirements) and let the user merge differences without discarding their drafted text.
