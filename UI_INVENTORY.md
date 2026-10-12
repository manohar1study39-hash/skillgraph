# UI Inventory - SkillGraph / SkillSense

*Generated as part of Step 0 Safety Process prior to visual redesign.*
*Baseline Test Status:* **16/16 PASSED** (0 failures, 0 regressions)
*Aurora Ink Redesign Baseline Screenshots:* 48 full-page screenshots captured in both Light and Dark modes in `/screenshots/before-aurora/` (`01_guest_landing_light.png` through `24_styleguide_dark.png`).

---

## 1. Authentication & Onboarding Views

| View / State | Location / Component | Trigger / Navigation | Description & Key UI Elements | Baseline Screenshot |
|---|---|---|---|---|
| **Guest Landing Page** | `src/App.tsx` | App root (`/`) when unauthenticated | Hero banner with enterprise badge, title, subtitle, "Sign In to Your Portal", "Register New Account", and 3 role portal preview cards (HR, Manager, Employee). | `01_guest_landing.png` |
| **Auth Portal Selection** | `src/components/auth/AuthModal.tsx` | "Sign In" or "Register" button click | Modal dialog displaying 3 distinct portal cards (`Employee`, `Manager`, `HR Admin`) with feature check-lists, icons, and direct Sign In / Sign Up triggers. | `02_auth_portal_selection.png` |
| **Employee Login** | `src/components/auth/AuthModal.tsx` | Selecting "Sign In" on Employee Portal Card | Login form with email input, password input, show/hide password toggle, "Remember me" checkbox, "Forgot password?" link, submit button, error banner. | `03_auth_employee_login.png` |
| **Employee Signup** | `src/components/auth/AuthModal.tsx` | Selecting "Create Account" on Employee Portal Card | Registration form with full name, corporate email, password with live strength meter & rule checklist, confirm password, employee invite code (`skillgraph-employee-2026`), submit button. | `04_auth_employee_signup.png` |
| **Forgot Password** | `src/components/auth/AuthModal.tsx` | "Forgot password?" trigger on any login form | Password reset request form with email input, instructions, submit action, and simulated confirmation sent state. | `05_auth_forgot_password.png` |
| **Manager Login** | `src/components/auth/AuthModal.tsx` | Manager portal selection | Manager-tailored login view with Manager portal branding and credentials verification. | Referenced in `02_auth_portal_selection.png` |
| **Manager Signup** | `src/components/auth/AuthModal.tsx` | Manager portal signup | Manager registration with invite code validation (`skillgraph-dev-invite`) and approval status handling. | Referenced in `02_auth_portal_selection.png` |
| **HR Admin Login** | `src/components/auth/AuthModal.tsx` | HR portal selection | HR-tailored login view enforcing HR Admin privilege verification. | Referenced in `02_auth_portal_selection.png` |
| **HR Admin Signup** | `src/components/auth/AuthModal.tsx` | HR portal signup | HR registration enforcing secure HR invite code (`skillgraph-hr-admin-2026`). | Referenced in `02_auth_portal_selection.png` |

---

## 2. Employee Role Views & Workspaces

| Page / Tab | Component | Key Sections & Elements | Baseline Screenshot |
|---|---|---|---|
| **My Career Hub** (`employee-hub`) | `src/components/employee/EmployeePortalTab.tsx` | Employee header card with avatar, role, department, team, location. Profile Completeness meter. Weekly availability & free hours interactive sliders. Verified Competencies section with proficiency badges & evidence links. Experience & projects list. Verified certifications list. | `06_employee_career_hub.png` |
| **Profile Editor Modal** | `src/components/employee/EmployeeProfileEditorModal.tsx` | Modal dialog allowing self-service editing of name, title, department, team, location, bio, availability sliders, skill additions with proficiency levels, project tags, and certification items. | `07_employee_profile_editor_modal.png` |
| **Employee Directory** (`directory`) | `src/components/employee/EmployeeDirectoryTab.tsx` | Searchable directory table of all company personnel, department filters, availability percentages, workload metrics, and direct links to view full profiles. | `08_employee_directory.png` |
| **My Upskilling** (`upskilling`) | `src/components/employee/EmployeeUpskillingTab.tsx` | Target role selector dropdown, role readiness meter, prioritized skill gap breakdown, learning roadmap timeline with interactive status checkboxes (Not Started, In Progress, Done), mentor cards. | `09_employee_my_upskilling.png` |
| **Opportunities / Marketplace** (`marketplace`) | `src/components/marketplace/MarketplaceTab.tsx` | Active internal gigs and project initiatives, match score badge, missing skill indicators, department, duration, "Express Interest" action and registered interest status tags. | `10_employee_opportunities.png` |
| **Skill Graph** (`graph`) | `src/components/skill-graph/SkillGraphTab.tsx` | Interactive SVG ontology visualization connecting skills, domains, prerequisites, and related technologies. Filter by category, inspect individual skill nodes. | `11_employee_skill_graph.png` |
| **Evidence Modal** | `src/components/evidence/EvidenceModal.tsx` | Auditable skill proof modal showing source verification, evaluator identity, timestamp, recency decay factor, linked projects, and certification proofs. | `12_evidence_modal.png` |

---

## 3. Manager Role Views & Workspaces

| Page / Tab | Component | Key Sections & Elements | Baseline Screenshot |
|---|---|---|---|
| **Talent Search** (`search`) | `src/components/talent-search/TalentSearchTab.tsx` | Natural language / keyword search bar, pre-set query chips, filter sidebar (department, location, availability slider, minimum experience, skill filters). Candidate cards with match scores, skill badges, workload status, shortlist toggle, and "Why this match" reasoning drawer. | `13_manager_talent_search.png` |
| **Employee Profile Modal** | `src/components/talent-search/EmployeeProfileModal.tsx` | Comprehensive employee profile inspection modal with bio, contact details, skill breakdown with proficiency bars, evidence inspection triggers, project history, and certifications. | `14_manager_employee_profile_modal.png` |
| **Employee Directory** (`directory`) | `src/components/employee/EmployeeDirectoryTab.tsx` | Full organization directory with manager-level view of personnel, availability metrics, and profile inspection. | `15_manager_employee_directory.png` |
| **Skill Graph** (`graph`) | `src/components/skill-graph/SkillGraphTab.tsx` | Enterprise skill graph view displaying organizational competency network. | `16_manager_skill_graph.png` |
| **Upskilling & Gaps** (`upskilling`) | `src/components/near-qualified/NearQualifiedTab.tsx` | Near-qualified talent engine: target initiative role selector, Qualified candidates vs Near-Qualified candidates breakdown, skill gap analysis table, mentor assignment recommendations. | `17_manager_upskilling_and_gaps.png` |
| **Internal Marketplace** (`marketplace`) | `src/components/marketplace/MarketplaceTab.tsx` | Project staffing management: active initiatives, required roles, candidate match lists, team member assignment & removal, interested employee review. | `18_manager_marketplace.png` |

---

## 4. HR Administration Views & Workspaces

| Page / Tab | Component | Key Sections & Elements | Baseline Screenshot |
|---|---|---|---|
| **Talent Search** (`search`) | `src/components/talent-search/TalentSearchTab.tsx` | Organization-wide talent discovery, matching, and shortlisting. | `19_hr_talent_search.png` |
| **Employee Directory + Add Employee** (`directory`) | `src/components/employee/EmployeeDirectoryTab.tsx` | Full directory plus HR-exclusive "Add Employee" registration button. | `20_hr_employee_directory.png` |
| **Add Employee Modal** | `src/components/employee/EmployeeDirectoryTab.tsx` | HR modal form to register a new employee: Name, Email, Title, Department, Team, Location, Availability, Initial Skills, and Account Creation flag. | `21_hr_add_employee_modal.png` |
| **Upskilling & Gaps + Add Resource** (`upskilling`) | `src/components/near-qualified/NearQualifiedTab.tsx` | Organization-wide gap tracking plus HR-exclusive "Add Learning Resource" action with verified mentor assignment. | `22_hr_upskilling_and_gaps.png` |
| **Add Learning Resource Modal** | `src/components/near-qualified/NearQualifiedTab.tsx` | Modal form to create curriculum resource: Title, Target Skill, Provider, Type (course/project/workshop), Duration, Target Level, and Qualified Mentor Selector. | `23_hr_add_resource_modal.png` |
| **Marketplace + Post Project** (`marketplace`) | `src/components/marketplace/MarketplaceTab.tsx` | Company initiatives dashboard plus HR-exclusive "Post Project" action. | `24_hr_marketplace.png` |
| **Post Project Modal** | `src/components/marketplace/MarketplaceTab.tsx` | Modal form to publish an initiative: Project Name, Domain, Complexity, Technologies list, Priority, Start Date, and End Date. | `25_hr_post_project_modal.png` |
| **User Management Panel** | `src/components/auth/UserManagementPanel.tsx` | HR Admin modal dialog: "Pending Approvals" tab (approve / reject newly registered accounts), "Active Accounts" tab (view user roles, deactivate accounts), and "Audit Log" tab. | `26_hr_user_management_panel.png` |
| **Audit Log Tab** | `src/components/auth/UserManagementPanel.tsx` | Filterable and timestamped audit log of all security events: signups, logins, deactivations, approvals, project creations, and member assignments. | `27_hr_audit_log_tab.png` |

---

## 5. System States, Modals & Micro-Components

- **Toast Notifications** (`src/App.tsx`): Fixed notification popup with auto-dismiss (e.g. "Company records synchronized", "Learning progress saved", "Member assigned").
- **Auth Notice Banner** (`src/App.tsx`): Persistent top notification banner for pending approval accounts or notices with dismiss button.
- **Session Loading Indicator** (`src/App.tsx`): Animated spinner during session validation.
- **Error States & Retry Prompts** (`src/App.tsx`): Error card with retry action button on API failure.
- **Candidate Comparison Modal** (`src/components/talent-search/CompareModal.tsx`): Side-by-side comparison modal for shortlisted employees.
- **Empty States**:
  - Empty search results in Talent Search.
  - Empty shortlist in Talent Search.
  - No matching employees in Directory filters.
  - Zero pending approval accounts in User Management.
  - No current initiatives matching filter in Marketplace.
