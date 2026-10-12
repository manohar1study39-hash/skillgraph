import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const DATA_DIR = path.join(process.cwd(), 'data');

function demoPasswordFor(email: string): string {
  const readme = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf8');
  const row = readme.split(/\r?\n/).find(line => line.startsWith('|') && line.toLowerCase().includes(email.toLowerCase()));
  const password = row?.split('|')[3]?.trim().replace(/^`|`$/g, '');
  if (!password) throw new Error(`Add ${email} to the README demo credentials table before seeding.`);
  return password;
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const FIRST_NAMES = ['Alex', 'Sarah', 'David', 'Elena', 'Marcus', 'Priya', 'Carlos', 'Maya', 'James', 'Emily', 'Michael', 'Jessica', 'Daniel', 'Sophia', 'Matthew', 'Olivia', 'Andrew', 'Isabella', 'Joshua', 'Mia', 'Ethan', 'Charlotte', 'Alexander', 'Amelia', 'William', 'Harper', 'Benjamin', 'Evelyn', 'Lucas', 'Abigail', 'Henry', 'Emily', 'Liam', 'Ella', 'Mason', 'Elizabeth', 'Logan', 'Camila', 'Jack', 'Luna'];
const LAST_NAMES = ['Chen', 'Jenkins', 'Kim', 'Rostova', 'Vance', 'Sharma', 'Mendez', 'Lin', 'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young'];

const DEPARTMENTS = ['Engineering', 'Product', 'Data & Analytics', 'Cloud & Infrastructure', 'Information Security'];
const TEAMS = ['Core Payments', 'Frontend Platforms', 'Financial Intelligence', 'Cloud Native', 'API Gateways', 'Design Systems', 'Security Audit', 'Data Pipelines'];
const LOCATIONS = ['San Francisco, CA', 'Austin, TX', 'New York, NY', 'Seattle, WA', 'Chicago, IL', 'Boston, MA', 'Remote'];

const SKILLS = [
  { id: 'skill-react', name: 'React', category: 'Frontend & UI Frameworks', domain: 'Web Applications', synonyms: 'React.js|ReactJS', related: 'skill-ts|skill-tail', desc: 'React.js component architecture, hooks, state management' },
  { id: 'skill-node', name: 'Node.js', category: 'Backend & Microservices', domain: 'Fintech Core Services', synonyms: 'Node|NodeJS', related: 'skill-postgres|skill-graphql', desc: 'Asynchronous event loop, Express, microservices' },
  { id: 'skill-fintech', name: 'Fintech & Payment Security', category: 'Fintech & Payment Security', domain: 'Financial Services', synonyms: 'Payment Security|PCI-DSS|Fintech', related: 'skill-node|skill-postgres', desc: 'PCI-DSS compliance, payment gateways, ACH protocols' },
  { id: 'skill-ts', name: 'TypeScript', category: 'Frontend & UI Frameworks', domain: 'Enterprise Codebases', synonyms: 'TS', related: 'skill-react|skill-node', desc: 'Static typing, interfaces, generics' },
  { id: 'skill-postgres', name: 'PostgreSQL', category: 'Backend & Microservices', domain: 'Database & Storage', synonyms: 'Postgres|Postgre', related: 'skill-node|skill-python', desc: 'Relational schema design, query optimization, indexing' },
  { id: 'skill-aws', name: 'AWS Cloud', category: 'Cloud Architecture & DevOps', domain: 'DevOps & Infra', synonyms: 'AWS|Amazon Web Services', related: 'skill-docker', desc: 'EC2, S3, Lambda, IAM, VPC, CloudFront' },
  { id: 'skill-python', name: 'Python', category: 'Data & AI', domain: 'Machine Learning', synonyms: 'Py', related: 'skill-postgres', desc: 'FastAPI, Pandas, PyTorch, data pipelines' },
  { id: 'skill-docker', name: 'Docker & Kubernetes', category: 'Cloud Architecture & DevOps', domain: 'Containerization', synonyms: 'Docker|Kubernetes|K8s', related: 'skill-aws', desc: 'Container orchestration, Helm charts, K8s ingress' },
  { id: 'skill-graphql', name: 'GraphQL', category: 'Backend & Microservices', domain: 'API Integration', synonyms: 'Apollo GraphQL', related: 'skill-node|skill-react', desc: 'Resolvers, schema design, Apollo Client' },
  { id: 'skill-tail', name: 'Tailwind CSS', category: 'Frontend & UI Frameworks', domain: 'UI Design', synonyms: 'Tailwind', related: 'skill-react', desc: 'Utility-first styling, design tokens, responsiveness' }
];

const ROLES = [
  { id: 'role-fintech-app-lead', title: 'Lead Architect: NextGen React + Node.js Fintech App', department: 'Engineering', priority: 'Priority', status: 'Open', minAvail: 70 },
  { id: 'role-ai-analytics', title: 'Senior Engineer: Real-Time Financial Analytics Portal', department: 'Data & Analytics', priority: 'Priority', status: 'Open', minAvail: 50 },
  { id: 'role-cloud-sec', title: 'Cloud Security Architect: Payment Vault Hardening', department: 'Information Security', priority: 'Normal', status: 'Open', minAvail: 60 },
  { id: 'role-frontend-lead', title: 'Staff Frontend Engineer: Design System Core', department: 'Product', priority: 'Normal', status: 'Open', minAvail: 50 }
];

const ROLE_SKILLS = [
  { role_id: 'role-fintech-app-lead', skill_id: 'skill-react', required_level: 'Expert', importance: 'Must' },
  { role_id: 'role-fintech-app-lead', skill_id: 'skill-node', required_level: 'Expert', importance: 'Must' },
  { role_id: 'role-fintech-app-lead', skill_id: 'skill-fintech', required_level: 'Advanced', importance: 'Must' },
  { role_id: 'role-ai-analytics', skill_id: 'skill-python', required_level: 'Expert', importance: 'Must' },
  { role_id: 'role-ai-analytics', skill_id: 'skill-react', required_level: 'Advanced', importance: 'Must' },
  { role_id: 'role-ai-analytics', skill_id: 'skill-fintech', required_level: 'Intermediate', importance: 'Nice' },
  { role_id: 'role-cloud-sec', skill_id: 'skill-aws', required_level: 'Expert', importance: 'Must' },
  { role_id: 'role-cloud-sec', skill_id: 'skill-fintech', required_level: 'Expert', importance: 'Must' },
  { role_id: 'role-cloud-sec', skill_id: 'skill-docker', required_level: 'Advanced', importance: 'Nice' },
  { role_id: 'role-frontend-lead', skill_id: 'skill-react', required_level: 'Master', importance: 'Must' },
  { role_id: 'role-frontend-lead', skill_id: 'skill-ts', required_level: 'Master', importance: 'Must' }
];

const LEARNING_RESOURCES = [
  { resource_id: 'res-1', skill_id: 'skill-react', title: 'Advanced React 18 & State Hygiene Masterclass', provider: 'Coursera', type: 'course', duration_weeks: 2, target_level: 'Advanced' },
  { resource_id: 'res-2', skill_id: 'skill-node', title: 'High-Scale Node.js Microservices Architecture', provider: 'Udemy', type: 'course', duration_weeks: 3, target_level: 'Expert' },
  { resource_id: 'res-3', skill_id: 'skill-fintech', title: 'PCI-DSS Compliance & Payment Gateway Protocol', provider: 'Internal Academy', type: 'cert', duration_weeks: 2, target_level: 'Advanced' },
  { resource_id: 'res-4', skill_id: 'skill-aws', title: 'AWS Cloud Security & Key Vault Rotation', provider: 'AWS Training', type: 'cert', duration_weeks: 3, target_level: 'Expert' },
  { resource_id: 'res-5', skill_id: 'skill-python', title: 'Streaming Data Pipelines with Python & PyTorch', provider: 'DataCamp', type: 'course', duration_weeks: 2, target_level: 'Advanced' }
];

const PROJECTS = [
  { project_id: 'proj-101', project_name: 'Payment Checkout UI Refactor', domain: 'Fintech & Payment Security', complexity: 5, technologies: 'React|TypeScript|Tailwind CSS', start_date: '2026-01-10', end_date: '2026-06-30' },
  { project_id: 'proj-102', project_name: 'Global Payment Gateway Microservice', domain: 'Fintech & Payment Security', complexity: 5, technologies: 'Node.js|PostgreSQL|GraphQL', start_date: '2026-02-01', end_date: '2026-08-15' },
  { project_id: 'proj-103', project_name: 'Real-Time Fraud Analytics Engine', domain: 'Data & AI', complexity: 4, technologies: 'Python|PostgreSQL', start_date: '2026-03-15', end_date: '2026-09-01' },
  { project_id: 'proj-104', project_name: 'Cloud Vault Security Hardening', domain: 'Cloud Architecture & DevOps', complexity: 5, technologies: 'AWS Cloud|Docker & Kubernetes', start_date: '2026-04-01', end_date: '2026-09-20' },
  { project_id: 'proj-105', project_name: 'Design System React Component Library', domain: 'Frontend & UI Frameworks', complexity: 4, technologies: 'React|TypeScript|Tailwind CSS', start_date: '2025-09-01', end_date: '2026-01-30' }
];

function generateCSV() {
  const employees: any[] = [];
  const empSkills: any[] = [];
  const evidence: any[] = [];
  const empProjects: any[] = [];

  const DEMO_PEOPLE = [
    { id: 'emp-1', name: 'Alex Chen', email: 'alex.chen@company.com', title: 'Staff Fullstack Architect', dept: 'Engineering', team: 'Core Payments', loc: 'San Francisco, CA', avail: 80, freeHrs: 32 },
    { id: 'emp-2', name: 'Sarah Jenkins', email: 'sarah.jenkins@company.com', title: 'Lead Frontend Architect', dept: 'Product', team: 'Frontend Platforms', loc: 'Austin, TX', avail: 60, freeHrs: 24 },
    { id: 'emp-3', name: 'David Kim', email: 'david.kim@company.com', title: 'Senior Backend Engineer', dept: 'Engineering', team: 'Core Payments', loc: 'New York, NY', avail: 90, freeHrs: 36 },
    { id: 'emp-4', name: 'Elena Rostova', email: 'elena.rostova@company.com', title: 'Staff Platform Engineer', dept: 'Cloud & Infrastructure', team: 'Cloud Native', loc: 'Seattle, WA', avail: 75, freeHrs: 30 },
    { id: 'emp-5', name: 'Marcus Vance', email: 'marcus.vance@company.com', title: 'Senior UX Engineer', dept: 'Product', team: 'Design Systems', loc: 'Chicago, IL', avail: 50, freeHrs: 20 },
    { id: 'emp-6', name: 'Priya Sharma', email: 'priya.sharma@company.com', title: 'Senior Data Engineer', dept: 'Data & Analytics', team: 'Financial Intelligence', loc: 'Boston, MA', avail: 70, freeHrs: 28 },
    { id: 'emp-7', name: 'Carlos Mendez', email: 'carlos.mendez@company.com', title: 'Cloud Security Architect', dept: 'Information Security', team: 'Security Audit', loc: 'Remote', avail: 65, freeHrs: 26 },
    { id: 'emp-8', name: 'Maya Lin', email: 'maya.lin@company.com', title: 'UI Engineer', dept: 'Product', team: 'Frontend Platforms', loc: 'San Francisco, CA', avail: 80, freeHrs: 32 }
  ];

  DEMO_PEOPLE.forEach(dp => {
    employees.push({
      employee_id: dp.id,
      name: dp.name,
      email: dp.email,
      title: dp.title,
      department: dp.dept,
      team: dp.team,
      location: dp.loc,
      manager_id: 'emp-1',
      hire_date: '2022-03-15',
      availability_percent: dp.avail,
      hours_per_week_free: dp.freeHrs,
      last_active_date: '2026-09-28'
    });
  });

  empSkills.push(
    { employee_id: 'emp-1', skill_id: 'skill-react', proficiency_level: 'Expert', years_experience: 7, source: 'github', verified: 'true', last_used_date: '2026-09-25' },
    { employee_id: 'emp-1', skill_id: 'skill-node', proficiency_level: 'Expert', years_experience: 8, source: 'github', verified: 'true', last_used_date: '2026-09-26' },
    { employee_id: 'emp-1', skill_id: 'skill-fintech', proficiency_level: 'Master', years_experience: 6, source: 'certification', verified: 'true', last_used_date: '2026-09-20' },
    { employee_id: 'emp-2', skill_id: 'skill-react', proficiency_level: 'Master', years_experience: 8, source: 'github', verified: 'true', last_used_date: '2026-09-28' },
    { employee_id: 'emp-2', skill_id: 'skill-ts', proficiency_level: 'Master', years_experience: 7, source: 'github', verified: 'true', last_used_date: '2026-09-28' },
    { employee_id: 'emp-2', skill_id: 'skill-node', proficiency_level: 'Advanced', years_experience: 4, source: 'github', verified: 'true', last_used_date: '2026-05-14' },
    { employee_id: 'emp-3', skill_id: 'skill-node', proficiency_level: 'Expert', years_experience: 6, source: 'github', verified: 'true', last_used_date: '2026-09-26' },
    { employee_id: 'emp-3', skill_id: 'skill-fintech', proficiency_level: 'Expert', years_experience: 5, source: 'github', verified: 'true', last_used_date: '2026-09-18' },
    { employee_id: 'emp-3', skill_id: 'skill-postgres', proficiency_level: 'Expert', years_experience: 6, source: 'github', verified: 'true', last_used_date: '2026-09-20' },
    { employee_id: 'emp-3', skill_id: 'skill-react', proficiency_level: 'Beginner', years_experience: 1, source: 'self', verified: 'false', last_used_date: '2025-10-12' },
    { employee_id: 'emp-4', skill_id: 'skill-aws', proficiency_level: 'Master', years_experience: 7, source: 'certification', verified: 'true', last_used_date: '2026-09-27' },
    { employee_id: 'emp-4', skill_id: 'skill-node', proficiency_level: 'Advanced', years_experience: 5, source: 'github', verified: 'true', last_used_date: '2026-09-12' },
    { employee_id: 'emp-4', skill_id: 'skill-fintech', proficiency_level: 'Advanced', years_experience: 4, source: 'github', verified: 'true', last_used_date: '2026-08-30' },
    { employee_id: 'emp-4', skill_id: 'skill-react', proficiency_level: 'Intermediate', years_experience: 2, source: 'resume', verified: 'false', last_used_date: '2026-02-15' }
  );

  evidence.push(
    { evidence_id: 'ev-1', employee_id: 'emp-1', skill_id: 'skill-react', evidence_type: 'PR', title: 'Refactored Payment Checkout UI in React 18', url: 'https://github.com/company/payment-ui/pull/142', weight: '1.5', date: '2026-08-20' },
    { evidence_id: 'ev-2', employee_id: 'emp-1', skill_id: 'skill-node', evidence_type: 'project', title: 'Payment Gateway Microservice v2 Engine', url: 'https://github.com/company/gateway-service', weight: '1.5', date: '2026-07-30' },
    { evidence_id: 'ev-3', employee_id: 'emp-2', skill_id: 'skill-react', evidence_type: 'PR', title: 'Real-Time Financial Canvas Component', url: 'https://github.com/company/analytics-ui/pull/98', weight: '1.5', date: '2026-06-12' },
    { evidence_id: 'ev-4', employee_id: 'emp-3', skill_id: 'skill-node', evidence_type: 'code_review', title: 'High-Scale Ledger Reconciliation Code Review', url: 'https://github.com/company/ledger-service/pull/210', weight: '1.5', date: '2026-08-15' },
    { evidence_id: 'ev-5', employee_id: 'emp-4', skill_id: 'skill-aws', evidence_type: 'cert', title: 'AWS Certified DevOps Engineer Professional', url: 'https://aws.amazon.com/verification/99421', weight: '1.2', date: '2026-01-15' }
  );

  empProjects.push(
    { employee_id: 'emp-1', project_id: 'proj-101', role: 'Lead Architect', contribution_summary: 'Architected React 18 frontend and node API gateway.' },
    { employee_id: 'emp-1', project_id: 'proj-102', role: 'Technical Lead', contribution_summary: 'Built asynchronous ledger router in Node.js.' },
    { employee_id: 'emp-2', project_id: 'proj-105', role: 'Lead Frontend Engineer', contribution_summary: 'Created design system tokens and component library.' },
    { employee_id: 'emp-3', project_id: 'proj-102', role: 'Backend Specialist', contribution_summary: 'Designed ISO 20022 banking API adapters.' },
    { employee_id: 'emp-4', project_id: 'proj-104', role: 'Cloud Lead', contribution_summary: 'Hardened K8s pod security and AWS KMS keys.' }
  );

  for (let i = 9; i <= 200; i++) {
    const fn = FIRST_NAMES[i % FIRST_NAMES.length];
    const ln = LAST_NAMES[(i * 3) % LAST_NAMES.length];
    const empId = `emp-${i}`;
    const dept = DEPARTMENTS[i % DEPARTMENTS.length];
    const team = TEAMS[i % TEAMS.length];
    const loc = LOCATIONS[i % LOCATIONS.length];
    const avail = (i % 4) * 25;
    const freeHrs = Math.round((avail / 100) * 40);

    employees.push({
      employee_id: empId,
      name: `${fn} ${ln}${i >= 40 ? ` ${Math.floor(i / 40) + 1}` : ''}`,
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@company.com`,
      title: `${dept === 'Engineering' ? 'Software Engineer' : dept === 'Product' ? 'Product Specialist' : 'Systems Engineer'}`,
      department: dept,
      team: team,
      location: loc,
      manager_id: 'emp-1',
      hire_date: '2023-01-15',
      availability_percent: avail === 0 ? 50 : avail,
      hours_per_week_free: freeHrs === 0 ? 20 : freeHrs,
      last_active_date: '2026-09-27'
    });

    const isNearQualifiedReact = (i % 5 === 0);
    const isNearQualifiedNode = (i % 6 === 0);

    if (isNearQualifiedReact) {
      empSkills.push({ employee_id: empId, skill_id: 'skill-node', proficiency_level: 'Expert', years_experience: 5, source: 'github', verified: 'true', last_used_date: '2026-09-20' });
      empSkills.push({ employee_id: empId, skill_id: 'skill-fintech', proficiency_level: 'Advanced', years_experience: 4, source: 'github', verified: 'true', last_used_date: '2026-09-15' });
      empSkills.push({ employee_id: empId, skill_id: 'skill-react', proficiency_level: 'Intermediate', years_experience: 2, source: 'github', verified: 'true', last_used_date: '2026-09-10' });
    } else if (isNearQualifiedNode) {
      empSkills.push({ employee_id: empId, skill_id: 'skill-react', proficiency_level: 'Expert', years_experience: 6, source: 'github', verified: 'true', last_used_date: '2026-09-25' });
      empSkills.push({ employee_id: empId, skill_id: 'skill-fintech', proficiency_level: 'Advanced', years_experience: 4, source: 'github', verified: 'true', last_used_date: '2026-09-18' });
      empSkills.push({ employee_id: empId, skill_id: 'skill-node', proficiency_level: 'Intermediate', years_experience: 2, source: 'github', verified: 'true', last_used_date: '2026-09-10' });
    } else {
      const s1 = SKILLS[i % SKILLS.length];
      const s2 = SKILLS[(i + 3) % SKILLS.length];
      empSkills.push({ employee_id: empId, skill_id: s1.id, proficiency_level: (i % 2 === 0 ? 'Advanced' : 'Expert'), years_experience: (i % 8) + 1, source: 'github', verified: 'true', last_used_date: '2026-09-10' });
      empSkills.push({ employee_id: empId, skill_id: s2.id, proficiency_level: (i % 3 === 0 ? 'Intermediate' : 'Advanced'), years_experience: (i % 5) + 1, source: 'resume', verified: 'false', last_used_date: '2026-06-12' });
    }

    evidence.push({
      evidence_id: `ev-${i}`,
      employee_id: empId,
      skill_id: (isNearQualifiedReact ? 'skill-node' : 'skill-react'),
      evidence_type: (i % 2 === 0 ? 'PR' : 'commit'),
      title: `Merged production code for ${team}`,
      url: `https://github.com/company/repo/pull/${i}`,
      weight: '1.5',
      date: '2026-09-15'
    });
  }

  employees.forEach(employee => { employee.current_workload_percent = 100 - Number(employee.availability_percent); });
  evidence.forEach((item, index) => { item.project_id = index % 5 === 0 ? 'proj-104' : index % 2 === 0 ? 'proj-101' : 'proj-102'; });
  empSkills.forEach((skill, index) => {
    if (skill.source !== 'github' && skill.source !== 'certification') return;
    if (evidence.some(item => item.employee_id === skill.employee_id && item.skill_id === skill.skill_id)) return;
    const project = skill.skill_id === 'skill-aws' || skill.skill_id === 'skill-docker' ? 'proj-104' : skill.skill_id === 'skill-react' || skill.skill_id === 'skill-ts' || skill.skill_id === 'skill-tail' ? 'proj-101' : 'proj-102';
    evidence.push({ evidence_id: `ev-generated-${index}`, employee_id: skill.employee_id, skill_id: skill.skill_id, project_id: project, evidence_type: skill.source === 'certification' ? 'cert' : index % 2 ? 'PR' : 'commit', title: `Verified delivery for ${skill.skill_id}`, url: `https://github.com/company/skillgraph/pull/${index + 100}`, weight: '1.5', date: skill.last_used_date });
  });

  function toCSV(arr: any[]) {
    if (arr.length === 0) return '';
    const keys = Object.keys(arr[0]);
    const header = keys.join(',');
    const rows = arr.map(obj => keys.map(k => `"${String(obj[k]).replace(/"/g, '""')}"`).join(','));
    return [header, ...rows].join('\n');
  }

  fs.writeFileSync(path.join(DATA_DIR, 'employees.csv'), toCSV(employees));
  fs.writeFileSync(path.join(DATA_DIR, 'skills.csv'), toCSV(SKILLS.map(s => ({
    skill_id: s.id, skill_name: s.name, category: s.category, domain: s.domain, synonyms: s.synonyms || s.name, related_skill_ids: s.related || '',
  }))));
  fs.writeFileSync(path.join(DATA_DIR, 'employee_skills.csv'), toCSV(empSkills));
  fs.writeFileSync(path.join(DATA_DIR, 'evidence.csv'), toCSV(evidence));
  fs.writeFileSync(path.join(DATA_DIR, 'projects.csv'), toCSV(PROJECTS));
  fs.writeFileSync(path.join(DATA_DIR, 'employee_projects.csv'), toCSV(empProjects));
  fs.writeFileSync(path.join(DATA_DIR, 'roles.csv'), toCSV(ROLES.map(r => ({
    role_id: r.id, role_title: r.title, department: r.department, priority: r.priority, status: r.status, min_availability_percent: r.minAvail
  }))));
  fs.writeFileSync(path.join(DATA_DIR, 'role_skills.csv'), toCSV(ROLE_SKILLS));
  const resources = [
    ...LEARNING_RESOURCES.map((r, i) => ({ ...r, mentor_employee_id: i === 0 ? 'emp-2' : i === 1 ? 'emp-1' : i === 2 ? 'emp-1' : i === 3 ? 'emp-4' : '' })),
    { resource_id: 'res-6', skill_id: 'skill-react', title: 'Build a production checkout interface', provider: 'Internal Project', type: 'project', mentor_employee_id: 'emp-2', duration_weeks: 3, target_level: 'Expert' },
    { resource_id: 'res-7', skill_id: 'skill-node', title: 'Payments service pairing', provider: 'Engineering Mentorship', type: 'mentor', mentor_employee_id: 'emp-1', duration_weeks: 2, target_level: 'Expert' },
    { resource_id: 'res-8', skill_id: 'skill-fintech', title: 'PCI DSS assessor certification', provider: 'Internal Academy', type: 'cert', mentor_employee_id: 'emp-1', duration_weeks: 2, target_level: 'Expert' }
  ];
  fs.writeFileSync(path.join(DATA_DIR, 'learning_resources.csv'), toCSV(resources));
  fs.writeFileSync(path.join(DATA_DIR, 'certifications.csv'), toCSV([
    { cert_id: 'cert-1', employee_id: 'emp-4', skill_id: 'skill-aws', cert_name: 'AWS Certified DevOps Engineer Professional', issuer: 'Amazon Web Services', issued_date: '2025-01-15', expiry_date: '2028-01-15' },
    { cert_id: 'cert-2', employee_id: 'emp-1', skill_id: 'skill-fintech', cert_name: 'PCI DSS Professional', issuer: 'Internal Academy', issued_date: '2025-05-01', expiry_date: '2027-05-01' }
  ]));
  fs.writeFileSync(path.join(DATA_DIR, 'upskilling_progress.csv'), toCSV([
    { employee_id: 'emp-3', role_id: 'role-fintech-app-lead', resource_id: 'res-1', status: 'In progress', progress_percent: 45, updated_at: '2026-09-25' },
    { employee_id: 'emp-3', role_id: 'role-fintech-app-lead', resource_id: 'res-7', status: 'Not started', progress_percent: 0, updated_at: '2026-09-25' }
  ]));
  fs.writeFileSync(path.join(DATA_DIR, 'company_users.csv'), toCSV([
    { user_id: 'user-hr-demo', name: 'Demo HR Admin', email: 'hr@skillgraph.demo', password_hash: bcrypt.hashSync(demoPasswordFor('hr@skillgraph.demo'), 10), role: 'HR_Admin', is_active: 'true' },
    { user_id: 'user-manager-demo', name: 'Demo Manager', email: 'manager@skillgraph.demo', password_hash: bcrypt.hashSync(demoPasswordFor('manager@skillgraph.demo'), 10), role: 'Manager', is_active: 'true' },
    { user_id: 'user-hr-gmail-demo', name: 'Demo HR Admin', email: 'hr@gmail.com', password_hash: bcrypt.hashSync(demoPasswordFor('hr@gmail.com'), 10), role: 'HR_Admin', is_active: 'true' }
  ]));
  fs.writeFileSync(path.join(DATA_DIR, 'project_shortlists.csv'), 'project_id,employee_id,shortlisted_by,shortlisted_at,note\n');

  console.log('Successfully generated CSV datasets for 200 employees!');
}

generateCSV();
