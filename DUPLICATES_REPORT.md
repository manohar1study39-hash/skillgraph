# DUPLICATES_REPORT.md

## Phase 1: Investigation & Resolution of Duplicate Employee Names & Graph Duplication

**Audit Date:** 2026-10-12  
**Database Backup Location:** `data/backups/skillgraph_pre_phase1_backup.db`  
**CSV Datasets Backup Location:** `data/backups/*.csv`  

---

### 1.1 (a) Employees Sharing the Same Full Name (Case-Insensitive, Trimmed)

An exhaustive search across the active SQLite database (`data/skillgraph.db`) and raw CSV dataset (`data/employees.csv`) identified **one duplicate full-name collision group** involving two employee records:

| Field | Record 1 (`emp-741237`) | Record 2 (`emp-043025`) |
| :--- | :--- | :--- |
| **Full Name** | `MAN12` | `MAN12` |
| **Employee ID** | `emp-741237` | `emp-043025` |
| **Department** | `Cloud & Infrastructure` | `Engineering` |
| **Team** | `DevOps & SRE` | `Frontend Platform` |
| **City / Location** | `Remote` | `Remote` |
| **Job Title** | `Software Engineer` | `Software Engineer` |
| **Email** | `emp1@gmail.com` | `man@gmail.com` |
| **Created Date** | `2026-10-08 16:56:46.097312` | `2026-10-08 16:56:46.097312` |
| **User ID Link** | `user-f39e2cbc-a74e-4e31-b368-0b25f7548849` | `user-c4e78fb0-2268-4ef7-bf71-71c57d915bdb` |
| **Record Nature** | **Test / Demo Signup Data** (Created during automated invite/signup testing) | **Test / Demo Signup Data** (Created during automated invite/signup testing) |

#### Analysis & Assessment
- Neither record is a production human employee. Both records were generated during auth/invite verification passes where the tester used `"MAN12"` as the candidate display name.
- In `company_users`, Record 2 has user name `MAN` (`man@gmail.com`), while its corresponding employee directory entry was initialized as `MAN12`.
- In compliance with rule 1.3, **no stored database or CSV records have been modified**. Realistic replacement human names have been proposed in `RENAME_MAP.csv` for human approval before execution.

---

### 1.1 (b) Skill Graph Duplication Investigation & Root Cause

#### 1. Did the Skill Graph Show the Same Person as Several Nodes?
**Yes.** Prior to this fix, the Skill Graph presented duplicate-appearing Person nodes for individuals sharing names, as well as ID keying inconsistencies:

1. **Exact-Name Collision with Missing Disambiguation:**  
   Because both `emp-741237` and `emp-043025` shared the exact name `MAN12`, the graph rendered two distinct Person circles each labeled `"MAN12"` side-by-side without department or location context. To HR and managers, this appeared as if the same person was duplicated into multiple nodes.
2. **Double-Prefixing Key Bug (`emp-emp-...`):**  
   In `SkillGraphTab.tsx`, Person nodes were created via:
   ```ts
   nodeMap.set(`emp-${employee.id}`, { id: `emp-${employee.id}`, label: employee.name, type: 'Person' });
   ```
   Because `employee.id` in `employees.csv` is already formatted as `emp-1`, `emp-2`, `emp-741237`, prepending `emp-` produced keys like `emp-emp-741237`. This created fragile link lookups with other entities (such as projects and personal network filters) where IDs without the extra prefix failed or required dual-prefixed matching.

#### 2. Root Cause Identified
- **Graph node labels directly bound to raw `employee.name`:** Graph construction did not invoke organizational disambiguation rules for identical names.
- **Inconsistent ID normalization:** Person node IDs were constructed by blind string concatenation rather than canonical employee ID normalization.

---

### 1.2 & 1.3 Fixes Implemented at the Root

#### 1. Canonical Graph Node Keying
- Implemented `toPersonNodeId(id)` in `src/components/skill-graph/SkillGraphTab.tsx` to ensure each Person node is strictly keyed by its canonical employee ID (exactly one node per employee).
- Person node labels now strictly use `employee.display_label || getEmployeeDisplayLabel(employee, uniqueEmployees)`.

#### 2. Universal `display_label` Disambiguation Rule
Created reusable utility `src/utils/employeeDisplay.ts` and backend `get_employee_display_label`:
- **Unique Name:** Renders cleanly as `"Name"` (e.g., `Alex Chen`).
- **Duplicate Name:** Renders as `"Name (Department, City)"` (e.g., `MAN12 (Cloud & Infrastructure, Remote)` vs `MAN12 (Engineering, Remote)`).
- **Duplicate Name + Same Department & City:** Renders with a 4-character ID suffix: `"Name (Department, City) - Suffix"`.
- Applied everywhere: Talent Search cards, Employee Directory, Profile Modals, Skill Graph canvas and side panels, Near-Qualified queues, and Marketplace matches.

---

### 1.4 Database Unique Index on `lower(email)`

- Added case-insensitive unique indexes:
  - `ix_employees_lower_email` ON `employees (lower(email))`
  - `ix_company_users_lower_email` ON `company_users (lower(email))`
- Updated SQLAlchemy models in `backend/models.py` (`__table_args__`).
- `full_name` is intentionally NOT restricted to unique, preserving real-world validity where different individuals can share names.

---

### 1.5 Automated Validation Tests

1. **Pytest (`tests/test_employee_unique_labels.py`):**
   - Empirical test verifying that across all active employees in `data/skillgraph.db`, 100% of generated display labels are strictly unique.
   - Verified disambiguation rule unit scenarios (unique, different department/city, and identical department/city with ID suffix).
2. **Node (`tests/employeeLabels.test.ts`):**
   - Unit tests covering all branches of `getEmployeeDisplayLabel` and `computeAllDisplayLabels`.
   - Included in `npm test` script.

---

### Proposed Rename Mapping (`RENAME_MAP.csv`)

In accordance with rule 1.3, the following replacements are proposed for seed/test duplicate records. **These renames have NOT been applied yet** and await your explicit approval:

```csv
old_name,new_name,id
MAN12,Manny Vance,emp-741237
MAN12,Mason Hayes,emp-043025
```
