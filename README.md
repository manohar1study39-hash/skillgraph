# SkillGraph

SkillGraph is an evidence-based internal talent platform for company HR and managers. It matches employees to roles and projects, explains skill readiness, and tracks learning progress.

## Setup

Requirements: Node.js 22 or newer and npm.

```powershell
npm install
Copy-Item .env.example .env
```

Set `SKILLGRAPH_SESSION_SECRET` in `.env` to a private random value of at least 32 bytes. Generate one with:

```powershell
[Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Seed the CSV datasets and hashed demo accounts, then run the app:

```powershell
npm run seed
npm run dev
```

Open `http://localhost:3000`. The app opens to a guest preview shell with Talent Search selected. Company data appears only after staff authentication. `npm run build` creates the production client bundle; `npm run preview` serves it with the same authenticated CSV API middleware.

## Demo sign-in

| Role | Email | Password |
| --- | --- | --- |
| HR_Admin | `hr@skillgraph.demo` | `SkillGraphHR2026!` |
| Manager | `manager@skillgraph.demo` | `SkillGraphManager2026!` |
| HR_Admin (temporary demo account) | `hr@gmail.com` | `hr@123456789` |

The `hr@gmail.com` account is a temporary demo account; replace or remove it before any real deployment. The seed script reads demo passwords from this README credentials table and writes bcrypt hashes only. Only active records in `company_users.csv` can authenticate. Employee records cannot sign in.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `SKILLGRAPH_SESSION_SECRET` | Yes | Signs eight-hour, httpOnly, Secure staff session cookies. Keep it private and use a different value per environment. |
| `SKILLGRAPH_INVITE_CODE` | No | Enables account creation with this invite code. Development default: `skillgraph-dev-invite`. Keep private. |
| `SKILLGRAPH_INVITE_AUTO_APPROVE` | No | Set `true` to activate accounts created with a valid invite code immediately. Otherwise HR approval is required. |
| `SKILLGRAPH_ALLOWED_DOMAINS` | No | Comma-separated email domains allowed to request an account. Development default: `example.com`. Domain-based accounts await HR approval. |

## Access and permissions

Sessions are signed and stored in httpOnly, Secure, SameSite cookies. Login is rate limited to ten attempts per email and IP address per 15-minute window. The guest shell contains no company data; protected APIs such as `/api/data` return 401 without an active session. Sign-up requires either a valid configured invite code or an allowed email domain. New accounts receive the Manager role and remain inactive pending HR approval unless invite auto-approval is enabled. HR administrators can review and approve pending accounts from the profile menu and update learning progress. Managers can read company data, search, review learning paths, and shortlist candidates. Employee CSV records cannot sign in.

## Data schema

All source data is in `/data`. The browser retrieves these CSVs through the authenticated API after staff sign-in; CSV contents are not bundled into the client build.

| File | Main columns | Purpose |
| --- | --- | --- |
| `company_users.csv` | `user_id,name,email,password_hash,role,is_active` | Company staff accounts. Roles are `HR_Admin` or `Manager`; password hashes use bcrypt. |
| `employees.csv` | `employee_id,name,email,title,department,team,location,availability_percent,current_workload_percent,hours_per_week_free` | Employee directory records; not login accounts. |
| `skills.csv` | `skill_id,skill_name,category,domain,synonyms,related_skill_ids` | Skill taxonomy, aliases, and transferable skill relationships. |
| `employee_skills.csv` | `employee_id,skill_id,proficiency_level,years_experience,source,verified,last_used_date` | Declared employee skill levels and source. |
| `evidence.csv` | `evidence_id,employee_id,skill_id,project_id,evidence_type,title,url,weight,date` | Work proof used to estimate proficiency and evidence confidence. |
| `certifications.csv` | `cert_id,employee_id,skill_id,cert_name,issuer,issued_date,expiry_date` | Certification evidence with expiry handling. |
| `projects.csv` | `project_id,project_name,domain,complexity,technologies,start_date,end_date` | Company projects and skill needs. |
| `employee_projects.csv` | `employee_id,project_id,role,contribution_summary` | Employee project assignments. |
| `roles.csv` | `role_id,role_title,department,priority,status,min_availability_percent` | Openings and staffing requirements. |
| `role_skills.csv` | `role_id,skill_id,required_level,importance` | Must and Nice proficiency targets for roles. |
| `learning_resources.csv` | `resource_id,skill_id,title,provider,type,duration_weeks,target_level,mentor_employee_id` | Courses, projects, certifications, and mentoring options. |
| `upskilling_progress.csv` | `employee_id,role_id,resource_id,status,progress_percent,updated_at` | Manager-updated learning progress. |
| `project_shortlists.csv` | `project_id,employee_id,shortlisted_by,shortlisted_at,note` | HR and manager project shortlists. |

Run `npm run seed` to regenerate sample company data and bcrypt demo login hashes. Run `npm test` for upskilling, signup validation, duplicate-account, and pending-approval login tests.
