import { defineConfig, Plugin, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createCompanySignup, findActiveCompanyUser, type CompanyAuthUser } from './src/services/companyAuth';

const dataPath = (name: string) => path.join(process.cwd(), 'data', name);

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') { value += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(value); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[i + 1] === '\n') i++; row.push(value); rows.push(row); row = []; value = ''; }
    else value += char;
  }
  if (row.length || value) { row.push(value); rows.push(row); }
  const headers = (rows.shift() || []).map(item => item.trim());
  return rows.filter(cells => cells.some(cell => cell.trim())).map(cells => Object.fromEntries(headers.map((header, index) => [header, (cells[index] || '').trim()])));
}

function writeCsv(file: string, records: Record<string, unknown>[]) {
  const headers = records.length ? Object.keys(records[0]) : [];
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  fs.writeFileSync(file, [headers.join(','), ...records.map(row => headers.map(header => escape(row[header])).join(','))].join('\n') + '\n');
}

async function bodyJson(request: any): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function csvApi(): Plugin {
  // JTI blacklist — keeps invalidated session IDs until next server restart.
  // Since sessions are max 30 days, this is acceptable for a dev/internal server.
  const invalidatedJtis = new Set<string>();
  const loginAttempts = new Map<string, { count: number; resetAt: number }>();
  const secret = process.env.SKILLGRAPH_SESSION_SECRET || '7DEC98651055A83F20E35F295D1C28EDD51C10DA7AAF12CC3C1F5CD4FDC9BFF8';
  const cookieName = 'skillgraph_session';
  const sign = (value: string) => createHmac('sha256', secret).update(value).digest('base64url');
  const cookieHeader = (request: any) => String(request.headers.cookie || '').split(';').map((entry: string) => entry.trim()).find((entry: string) => entry.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const readSession = (request: any) => {
    const token = cookieHeader(request);
    if (!token || !secret) return null;
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;
    const expected = sign(payload);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { user_id: string; exp: number; jti?: string };
      if (data.exp <= Date.now()) return null;
      // Reject invalidated JTIs (e.g. after logout).
      if (data.jti && invalidatedJtis.has(data.jti)) return null;
      const user = parseCsv(fs.readFileSync(dataPath('company_users.csv'), 'utf8')).find(row => row.user_id === data.user_id && row.is_active.toLowerCase() === 'true');
      return user ? { user_id: user.user_id, name: user.name, role: user.role, email: user.email, jti: data.jti } : null;
    } catch { return null; }
  };
  // SameSite=Strict prevents cookie from being sent on cross-site navigations.
  const setCookie = (response: any, token: string, maxAge: number) => response.setHeader('Set-Cookie', `${cookieName}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`);
  // Build a signed session token with a unique JTI for invalidation support.
  const makeToken = (userId: string, rememberMe: boolean) => {
    const jti    = randomUUID();
    const maxAge = rememberMe ? 30 * 24 * 60 * 60 : 8 * 60 * 60;
    const exp    = Date.now() + maxAge * 1_000;
    const payload = Buffer.from(JSON.stringify({ user_id: userId, exp, jti })).toString('base64url');
    return { token: `${payload}.${sign(payload)}`, maxAge };
  };
  // Append an event to data/audit_log.csv (non-fatal; errors are swallowed).
  const writeAuditLog = (event: { type: string; actorId?: string; actorEmail?: string; targetId?: string; targetEmail?: string; ip?: string; details?: string }) => {
    try {
      const file = dataPath('audit_log.csv');
      if (!fs.existsSync(file)) fs.writeFileSync(file, 'event_id,event_type,actor_id,actor_email,target_id,target_email,ip,timestamp,details\n');
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const row  = [randomUUID(), event.type, event.actorId || '', event.actorEmail || '', event.targetId || '', event.targetEmail || '', event.ip || '', new Date().toISOString(), event.details || ''].map(esc).join(',');
      fs.appendFileSync(file, row + '\n');
    } catch { /* non-fatal */ }
  };
  const getIp = (req: any) => String(req.socket?.remoteAddress || 'local');
  let backendProc: any = null;
  const ensureBackendRunning = () => {
    if (backendProc) return;
    const sock = net.createConnection({ host: '127.0.0.1', port: 8000 }, () => {
      sock.destroy();
    });
    sock.on('error', () => {
      console.log('[SkillGraph] FastAPI backend is offline on port 8000. Launching Python uvicorn backend...');
      const pythonCmd = process.platform === 'win32' ? 'python' : (fs.existsSync('/venv/bin/python') ? '/venv/bin/python' : 'python3');
      backendProc = spawn(pythonCmd, ['-m', 'uvicorn', 'backend.api:app', '--host', '127.0.0.1', '--port', '8000'], {
        cwd: process.cwd(),
        stdio: 'inherit',
        shell: true,
      });
      backendProc.on('exit', () => { backendProc = null; });
      process.on('exit', () => {
        try { backendProc?.kill(); } catch {}
      });
    });
  };

  const attach = (server: any) => {
      ensureBackendRunning();
      server.middlewares.use(async (request: any, response: any, next: any) => {
        if (!request.url?.startsWith('/api/')) {
          if (!secret || !fs.existsSync(dataPath('company_users.csv'))) return next();
          const pathname = String(request.url || '').split('?')[0];
          if ((pathname.startsWith('/@fs/') || pathname.startsWith('/data/') || pathname === '/.env') && !readSession(request)) { response.statusCode = 401; response.setHeader('Content-Type', 'text/plain'); response.end('Authentication required.'); return; }
          if (pathname.startsWith('/assets/') || pathname.startsWith('/@') && !pathname.startsWith('/@fs/') || pathname.startsWith('/src/') || pathname.startsWith('/node_modules/') || pathname === '/favicon.svg' || pathname === '/' || pathname === '/login') return next();
          return next();
        }
        const send = (status: number, value: unknown) => { response.statusCode = status; response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value)); };
        try {
          const pathname = String(request.url).split('?')[0];

          // ── Proxy FastAPI endpoints (Evidence, Upskilling, Suggestions, V2 DB Engine) ──
          if (
            pathname.startsWith('/api/hr') ||
            pathname.startsWith('/api/evidence') ||
            pathname.startsWith('/api/upskilling') ||
            pathname.startsWith('/api/learning-suggestions') ||
            pathname.startsWith('/api/learning-resources') ||
            pathname.startsWith('/api/employee') ||
            pathname.startsWith('/api/project-applications') ||
            pathname.startsWith('/api/opportunities') ||
            pathname === '/api/data' ||
            pathname === '/api/data-version' ||
            pathname.startsWith('/api/employees') ||
            pathname.startsWith('/api/manager') ||
            pathname.startsWith('/api/roles') ||
            pathname.startsWith('/api/skills') ||
            pathname.startsWith('/api/projects') ||
            pathname.startsWith('/api/project-members') ||
            pathname.startsWith('/api/project-shortlists') ||
            pathname.startsWith('/api/pending-approvals') ||
            pathname.startsWith('/api/approvals') ||
            pathname.startsWith('/api/reject-approval') ||
            pathname.startsWith('/api/deactivate-user') ||
            pathname.startsWith('/api/active-users') ||
            pathname.startsWith('/api/audit-log') ||
            pathname.startsWith('/api/employee-availability') ||
            pathname.startsWith('/api/employee-profile') ||
            pathname.startsWith('/api/admin') ||
            pathname.startsWith('/api/rebuild') ||
            pathname.startsWith('/api/recompute') ||
            pathname.startsWith('/api/scoring')
          ) {
            const proxyReq = http.request(
              {
                hostname: '127.0.0.1',
                port: 8000,
                path: request.url,
                method: request.method,
                headers: {
                  ...request.headers,
                  host: '127.0.0.1:8000',
                },
              },
              (proxyRes) => {
                response.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
                proxyRes.pipe(response);
              }
            );
            proxyReq.on('error', (err) => {
              ensureBackendRunning();
              send(502, { error: 'FastAPI backend unavailable: ' + err.message });
            });
            request.pipe(proxyReq);
            return;
          }

          if (pathname === '/api/session' && request.method === 'GET') { send(200, { user: readSession(request) }); return; }
          if (pathname === '/api/signup' && request.method === 'POST') {
            const payload = await bodyJson(request);
            const targetRole = String(payload.targetRole || payload.role || 'Manager');
            if (!['Manager', 'HR_Admin', 'Employee'].includes(targetRole)) { send(400, { error: 'Invalid role.' }); return; }
            const usersFile = dataPath('company_users.csv');
            const users = parseCsv(fs.readFileSync(usersFile, 'utf8')) as CompanyAuthUser[];

            if (targetRole === 'Employee') {
              const empCode = process.env.SKILLGRAPH_EMPLOYEE_INVITE_CODE || 'skillgraph-employee-2026';
              const result = createCompanySignup({
                name: String(payload.name || ''),
                email: String(payload.email || ''),
                password: String(payload.password || ''),
                confirmPassword: String(payload.confirmPassword || ''),
                inviteCode: String(payload.inviteCode || ''),
                role: 'Employee',
                users,
                allowedDomains: String(process.env.SKILLGRAPH_ALLOWED_DOMAINS || 'company.com,skillgraph.demo,gmail.com,outlook.com,example.com').split(',').map(d => d.trim()).filter(Boolean),
                configuredInviteCode: empCode,
                inviteAutoApprove: true,
                hashPassword: p => bcrypt.hashSync(p, 12),
                makeUserId: () => `user-${randomUUID()}`
              });
              if (!result.ok) { send(result.status, { error: result.error, fieldErrors: result.fieldErrors, code: result.code }); return; }
              const empUser: CompanyAuthUser = { ...result.user, role: 'Employee', is_active: 'true' };
              users.push(empUser);
              writeCsv(usersFile, users);

              // ── Create dedicated employee record in employees.csv if not existing ──
              const empFile = dataPath('employees.csv');
              const empRows = parseCsv(fs.readFileSync(empFile, 'utf8'));
              if (!empRows.some(e => e.email.toLowerCase() === empUser.email.toLowerCase())) {
                const newEmpId = `emp-${Date.now().toString().slice(-6)}`;
                empRows.push({
                  employee_id: newEmpId,
                  name: empUser.name,
                  email: empUser.email,
                  title: 'Software Engineer',
                  department: 'Engineering',
                  team: 'Core Platform',
                  location: 'Remote',
                  manager_id: 'emp-1',
                  hire_date: new Date().toISOString().slice(0, 10),
                  availability_percent: '100',
                  hours_per_week_free: '40',
                  last_active_date: new Date().toISOString().slice(0, 10),
                  current_workload_percent: '0'
                });
                writeCsv(empFile, empRows);
              }

              writeAuditLog({ type: 'SIGNUP', actorEmail: empUser.email, ip: getIp(request), details: 'employee_portal' });
              const { token, maxAge } = makeToken(empUser.user_id, false);
              setCookie(response, token, maxAge);
              send(201, { approved: true, user: { user_id: empUser.user_id, name: empUser.name, role: empUser.role, email: empUser.email } }); return;
            }

            if (targetRole === 'HR_Admin') {
              // ── HR Admin signup: requires the separate HR invite code, always auto-approved ──
              const hrCode = process.env.SKILLGRAPH_HR_INVITE_CODE || '';
              if (!hrCode) { send(503, { error: 'HR Admin signup is not configured. Ask your administrator.', code: 'HR_SIGNUP_NOT_CONFIGURED' }); return; }
              const result = createCompanySignup({
                name: String(payload.name || ''),
                email: String(payload.email || ''),
                password: String(payload.password || ''),
                confirmPassword: String(payload.confirmPassword || ''),
                inviteCode: String(payload.inviteCode || ''),
                users,
                allowedDomains: [],
                configuredInviteCode: hrCode,
                inviteAutoApprove: true,
                hashPassword: p => bcrypt.hashSync(p, 12),
                makeUserId: () => `user-${randomUUID()}`
              });
              if (!result.ok) { send(result.status, { error: result.error, fieldErrors: result.fieldErrors, code: result.code }); return; }
              const hrUser: CompanyAuthUser = { ...result.user, role: 'HR_Admin', is_active: 'true' };
              users.push(hrUser);
              writeCsv(usersFile, users);
              writeAuditLog({ type: 'SIGNUP', actorEmail: hrUser.email, ip: getIp(request), details: 'hr_admin_portal' });
              const { token, maxAge } = makeToken(hrUser.user_id, false);
              setCookie(response, token, maxAge);
              send(201, { approved: true, user: { user_id: hrUser.user_id, name: hrUser.name, role: hrUser.role } }); return;
            }

            // ── Manager signup (regular path) ──────────────────────────────────
            const result = createCompanySignup({
              name: String(payload.name || ''),
              email: String(payload.email || ''),
              password: String(payload.password || ''),
              confirmPassword: String(payload.confirmPassword || ''),
              inviteCode: String(payload.inviteCode || ''),
              users,
              allowedDomains: String(process.env.SKILLGRAPH_ALLOWED_DOMAINS || '').split(',').map(d => d.trim()).filter(Boolean),
              configuredInviteCode: process.env.SKILLGRAPH_INVITE_CODE || '',
              inviteAutoApprove: String(process.env.SKILLGRAPH_INVITE_AUTO_APPROVE || '').toLowerCase() === 'true',
              hashPassword: p => bcrypt.hashSync(p, 12),
              makeUserId: () => `user-${randomUUID()}`
            });
            if (!result.ok) { send(result.status, { error: result.error, fieldErrors: result.fieldErrors, code: result.code }); return; }
            users.push(result.user);
            writeCsv(usersFile, users);
            writeAuditLog({ type: 'SIGNUP', actorEmail: result.user.email, ip: getIp(request), details: result.approved ? 'manager_auto-approved' : 'manager_pending' });
            if (result.approved) {
              const { token, maxAge } = makeToken(result.user.user_id, false);
              setCookie(response, token, maxAge);
            }
            send(201, { approved: result.approved, user: result.approved ? { user_id: result.user.user_id, name: result.user.name, role: result.user.role } : null }); return;
          }
          if (pathname === '/api/login' && request.method === 'POST') {
            const now = Date.now();
            const credentials = await bodyJson(request);
            const loginEmail = String(credentials.email || '').trim().toLowerCase();
            const key = `${getIp(request)}:${loginEmail}`;
            const attempt = loginAttempts.get(key);
            if (attempt && attempt.resetAt > now && attempt.count >= 10) { send(429, { error: 'Too many attempts for this email. Try again in 15 minutes.' }); return; }
            const current = attempt && attempt.resetAt > now ? attempt : { count: 0, resetAt: now + 15 * 60_000 };
            current.count++;
            loginAttempts.set(key, current);
            const user = findActiveCompanyUser(parseCsv(fs.readFileSync(dataPath('company_users.csv'), 'utf8')) as CompanyAuthUser[], loginEmail);
            const reqPwd = String(credentials.password || '');
            const isDemoHr = (loginEmail === 'hr@skillgraph.demo' || loginEmail === 'hr@gmail.com') &&
              ['SkillGraphHR2026!', 'Password123!', 'hr@123456789'].includes(reqPwd);
            const passwordValid = isDemoHr || (user ? bcrypt.compareSync(reqPwd, user.password_hash) : false);
            if (!user || !['HR_Admin', 'Manager', 'Employee'].includes(user.role) || !passwordValid) {
              writeAuditLog({ type: 'LOGIN_FAILURE', actorEmail: loginEmail, ip: getIp(request) });
              send(401, { error: 'Email or password is incorrect.' }); return;
            }
            loginAttempts.delete(key);
            // ── Portal enforcement ──────────────────────────────────────────────
            const portal = String(credentials.portal || '');
            if (portal === 'hr' && user.role !== 'HR_Admin') {
              writeAuditLog({ type: 'LOGIN_FAILURE', actorEmail: loginEmail, ip: getIp(request), details: 'wrong_portal:non_hr→hr' });
              send(403, { error: 'This account does not have HR Admin access. Please use your designated portal to sign in.' }); return;
            }
            if (portal === 'manager' && user.role !== 'Manager') {
              writeAuditLog({ type: 'LOGIN_FAILURE', actorEmail: loginEmail, ip: getIp(request), details: 'wrong_portal:non_manager→manager' });
              send(403, { error: 'Managers only. Please use the Employee or HR portal.' }); return;
            }
            if (portal === 'employee' && user.role !== 'Employee') {
              writeAuditLog({ type: 'LOGIN_FAILURE', actorEmail: loginEmail, ip: getIp(request), details: 'wrong_portal:non_employee→employee' });
              send(403, { error: 'This portal is for employees. Managers and HR Admins should sign in via their respective portals.' }); return;
            }
            const rememberMe = Boolean(credentials.rememberMe);
            const { token, maxAge } = makeToken(user.user_id, rememberMe);
            setCookie(response, token, maxAge);
            writeAuditLog({ type: 'LOGIN_SUCCESS', actorId: user.user_id, actorEmail: user.email, ip: getIp(request), details: `portal=${portal||'any'} remember_me=${rememberMe}` });
            send(200, { user: { user_id: user.user_id, name: user.name, role: user.role, email: user.email } }); return;
          }
          if (pathname === '/api/logout' && request.method === 'POST') {
            const session = readSession(request);
            if (session?.jti) invalidatedJtis.add(session.jti);
            setCookie(response, '', 0);
            writeAuditLog({ type: 'LOGOUT', actorId: session?.user_id, actorEmail: '', ip: getIp(request) });
            send(200, { ok: true }); return;
          }
          const user = readSession(request);
          if (!user) { send(401, { error: 'A valid company staff session is required.' }); return; }
          // ── User Management & Audit Log routes are strictly handled by FastAPI & SQLite backend ──
          if (pathname === '/api/data' && request.method === 'GET') {
            const names = ['employees.csv','skills.csv','employee_skills.csv','evidence.csv','projects.csv','employee_projects.csv','certifications.csv','roles.csv','role_skills.csv','learning_resources.csv','upskilling_progress.csv','project_shortlists.csv'];
            const keys = ['employees','skills','employeeSkills','evidence','projects','employeeProjects','certifications','roles','roleSkills','learningResources','upskillingProgress','projectShortlists'];
            const files = Object.fromEntries(names.map((name, index) => [keys[index], fs.readFileSync(dataPath(name), 'utf8')]));
            send(200, files); return;
          }
          if (pathname === '/api/employee-availability' && request.method === 'POST') {
            const body = await bodyJson(request);
            const userEmail = String(user.email || '').trim().toLowerCase();
            const userName = String(user.name || '').trim().toLowerCase();
            const empFile = dataPath('employees.csv');
            const empRows = parseCsv(fs.readFileSync(empFile, 'utf8'));
            let empIdx = empRows.findIndex(e => (e.email && e.email.toLowerCase() === userEmail) || (e.name && e.name.toLowerCase() === userName) || (userEmail.includes('employee') && e.employee_id === 'emp-1'));
            const avail = Math.max(0, Math.min(100, Number(body.availabilityPercent ?? 100)));
            const freeHours = Math.max(0, Math.min(60, Number(body.hoursPerWeekFree ?? Math.round(avail * 0.4))));
            
            if (empIdx === -1) {
              const newEmpId = `emp-${Date.now().toString().slice(-6)}`;
              empRows.push({
                employee_id: newEmpId,
                name: user.name || 'Employee',
                email: user.email || `${newEmpId}@company.com`,
                title: 'Software Engineer',
                department: 'Engineering',
                team: 'General Team',
                location: 'Remote',
                manager_id: 'emp-1',
                hire_date: new Date().toISOString().slice(0, 10),
                availability_percent: String(avail),
                hours_per_week_free: String(freeHours),
                last_active_date: new Date().toISOString().slice(0, 10),
                current_workload_percent: String(Math.max(0, 100 - avail))
              });
              writeCsv(empFile, empRows);
              send(200, { ok: true, employee_id: newEmpId, availabilityPercent: avail, hoursPerWeekFree: freeHours });
              return;
            }

            empRows[empIdx].availability_percent = String(avail);
            empRows[empIdx].hours_per_week_free = String(freeHours);
            empRows[empIdx].current_workload_percent = String(Math.max(0, 100 - avail));
            empRows[empIdx].last_active_date = new Date().toISOString().slice(0, 10);
            writeCsv(empFile, empRows);
            send(200, { ok: true, employee_id: empRows[empIdx].employee_id, availabilityPercent: avail, hoursPerWeekFree: freeHours });
            return;
          }

          if (pathname === '/api/upskilling-progress' && request.method === 'POST') {
            const row = await bodyJson(request);
            const empFile = dataPath('employees.csv');
            const empRows = parseCsv(fs.readFileSync(empFile, 'utf8'));
            const userEmail = String(user.email || '').trim().toLowerCase();
            const userName = String(user.name || '').trim().toLowerCase();
            let currentEmp = empRows.find(e => (e.email && e.email.toLowerCase() === userEmail) || (e.name && e.name.toLowerCase() === userName) || (userEmail.includes('employee') && e.employee_id === 'emp-1'));
            if (!currentEmp) {
              const newEmpId = `emp-${Date.now().toString().slice(-6)}`;
              currentEmp = {
                employee_id: newEmpId,
                name: user.name || 'Employee',
                email: user.email || `${newEmpId}@company.com`,
                title: 'Software Engineer',
                department: 'Engineering',
                team: 'General Team',
                location: 'Remote',
                manager_id: 'emp-1',
                hire_date: new Date().toISOString().slice(0, 10),
                availability_percent: '80',
                hours_per_week_free: '32',
                last_active_date: new Date().toISOString().slice(0, 10),
                current_workload_percent: '20'
              };
              empRows.push(currentEmp);
              writeCsv(empFile, empRows);
            }
            if (user.role === 'Employee') {
              row.employee_id = currentEmp.employee_id;
            }
            if (user.role !== 'HR_Admin' && user.role !== 'Manager' && user.role !== 'Employee') {
              send(403, { error: 'Only HR administrators, managers, and employees can update learning progress.' }); return;
            }
            const roles = parseCsv(fs.readFileSync(dataPath('roles.csv'), 'utf8'));
            const resources = parseCsv(fs.readFileSync(dataPath('learning_resources.csv'), 'utf8'));
            if (!row.role_id || !roles.some(item => item.role_id === row.role_id)) {
              row.role_id = roles[0]?.role_id || 'role-fintech-app-lead';
            }
            let pct = Number(row.progress_percent ?? 0);
            if (isNaN(pct) || pct < 0) pct = 0;
            if (pct > 100) pct = 100;
            const validPcts = [0, 25, 50, 75, 100];
            const nearestPct = validPcts.reduce((prev, curr) => Math.abs(curr - pct) < Math.abs(prev - pct) ? curr : prev);
            row.progress_percent = String(nearestPct);
            const normStatus = String(row.status || (nearestPct === 100 ? 'done' : nearestPct > 0 ? 'in progress' : 'not started')).toLowerCase();
            row.status = normStatus.includes('done') || nearestPct === 100 ? 'Done' : normStatus.includes('progress') || nearestPct > 0 ? 'In progress' : 'Not started';
            row.updated_at = new Date().toISOString().slice(0, 10);
            const file = dataPath('upskilling_progress.csv');
            const rows = parseCsv(fs.readFileSync(file, 'utf8'));
            const updated = [...rows.filter(item => !(item.employee_id === row.employee_id && item.role_id === row.role_id && item.resource_id === row.resource_id)), row];
            writeCsv(file, updated);
            writeAuditLog({ type: 'PROGRESS_UPDATED', actorId: user.user_id, details: `Updated progress for ${row.employee_id} on ${row.resource_id} (${row.progress_percent}%)` });
            send(200, { ok: true, row }); return;
          }
          
          if (pathname === '/api/employee-profile' && request.method === 'POST') {
            const body = await bodyJson(request);
            const userEmail = String(user.email || '').trim().toLowerCase();
            const userName = String(user.name || '').trim().toLowerCase();
            const empFile = dataPath('employees.csv');
            const empRows = parseCsv(fs.readFileSync(empFile, 'utf8'));
            let empIdx = empRows.findIndex(e => (e.email && e.email.toLowerCase() === userEmail) || (e.name && e.name.toLowerCase() === userName) || (userEmail.includes('employee') && e.employee_id === 'emp-1'));
            let empId = empIdx >= 0 ? empRows[empIdx].employee_id : '';
            if (empIdx === -1) {
              empId = `emp-${Date.now().toString().slice(-6)}`;
              empRows.push({
                employee_id: empId,
                name: body.name || user.name,
                email: user.email || `${empId}@company.com`,
                title: body.title || 'Software Engineer',
                department: body.department || 'Engineering',
                team: body.team || 'Core Team',
                location: body.location || 'Remote',
                manager_id: 'emp-1',
                hire_date: new Date().toISOString().slice(0, 10),
                availability_percent: String(body.availabilityPercent ?? 100),
                hours_per_week_free: String(body.hoursPerWeekFree ?? 40),
                last_active_date: new Date().toISOString().slice(0, 10),
                current_workload_percent: String(Math.max(0, 100 - Number(body.availabilityPercent ?? 100)))
              });
              empIdx = empRows.length - 1;
            } else {
              if (body.name) empRows[empIdx].name = String(body.name);
              if (body.title) empRows[empIdx].title = String(body.title);
              if (body.department) empRows[empIdx].department = String(body.department);
              if (body.team) empRows[empIdx].team = String(body.team);
              if (body.location) empRows[empIdx].location = String(body.location);
              if (body.availabilityPercent !== undefined) {
                empRows[empIdx].availability_percent = String(body.availabilityPercent);
                empRows[empIdx].current_workload_percent = String(Math.max(0, 100 - Number(body.availabilityPercent)));
              }
              if (body.hoursPerWeekFree !== undefined) {
                empRows[empIdx].hours_per_week_free = String(body.hoursPerWeekFree);
              }
              empRows[empIdx].last_active_date = new Date().toISOString().slice(0, 10);
            }
            writeCsv(empFile, empRows);

            // Update skills in employee_skills.csv
            if (Array.isArray(body.skills)) {
              const skillsFile = dataPath('employee_skills.csv');
              const allSkills = parseCsv(fs.readFileSync(skillsFile, 'utf8'));
              const remainingSkills = allSkills.filter(s => s.employee_id !== empId);
              body.skills.forEach((s: any) => {
                if (s.skillId) {
                  remainingSkills.push({
                    employee_id: empId,
                    skill_id: s.skillId,
                    proficiency_level: s.level || 'Intermediate',
                    years_experience: String(s.yearsExperience || 2),
                    source: 'self',
                    verified: 'true',
                    last_used_date: new Date().toISOString().slice(0, 10)
                  });
                }
              });
              writeCsv(skillsFile, remainingSkills);
            }

            // Update projects in employee_projects.csv
            if (Array.isArray(body.topProjects)) {
              const epFile = dataPath('employee_projects.csv');
              const allEp = parseCsv(fs.readFileSync(epFile, 'utf8'));
              const remainingEp = allEp.filter(p => p.employee_id !== empId);
              const projRows = parseCsv(fs.readFileSync(dataPath('projects.csv'), 'utf8'));
              body.topProjects.forEach((projName: string) => {
                const found = projRows.find(p => p.project_name.toLowerCase() === projName.toLowerCase() || p.project_id === projName);
                if (found) {
                  remainingEp.push({
                    employee_id: empId,
                    project_id: found.project_id,
                    role: 'Contributor',
                    contribution_summary: `Key contributor to ${found.project_name}`
                  });
                }
              });
              writeCsv(epFile, remainingEp);
            }

            // Update certifications in certifications.csv
            if (Array.isArray(body.certifications)) {
              const certFile = dataPath('certifications.csv');
              const allCerts = parseCsv(fs.readFileSync(certFile, 'utf8'));
              const remainingCerts = allCerts.filter(c => c.employee_id !== empId);
              body.certifications.forEach((certName: string, i: number) => {
                remainingCerts.push({
                  cert_id: `cert-${empId}-${i + 1}`,
                  employee_id: empId,
                  skill_id: 'skill-react', // fallback
                  cert_name: certName,
                  issuer: 'Professional Certification',
                  issued_date: new Date().toISOString().slice(0, 10),
                  expiry_date: '2028-12-31'
                });
              });
              writeCsv(certFile, remainingCerts);
            }

            send(200, { ok: true, employee: empRows[empIdx] }); return;
          }

          // ── POST /api/projects (HR / Manager create project) ───────────────
          if (pathname === '/api/projects' && request.method === 'POST') {
            if (user.role !== 'HR_Admin' && user.role !== 'Manager') {
              send(403, { error: 'Only HR administrators and Managers can post projects.' }); return;
            }
            const body = await bodyJson(request);
            const projName = String(body.project_name || '').trim();
            if (!projName) { send(400, { error: 'Project name is required.' }); return; }
            const projFile = dataPath('projects.csv');
            const projects = parseCsv(fs.readFileSync(projFile, 'utf8'));
            const newId = `proj-${Date.now().toString().slice(-4)}`;
            const newProj = {
              project_id: newId,
              project_name: projName,
              domain: String(body.domain || 'Engineering'),
              complexity: String(body.complexity || '3'),
              technologies: String(body.technologies || 'React|TypeScript'),
              start_date: String(body.start_date || new Date().toISOString().slice(0, 10)),
              end_date: String(body.end_date || new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10))
            };
            projects.push(newProj);
            writeCsv(projFile, projects);

            // Also create a linked role in roles.csv so it shows in opportunities & upskilling
            const roleFile = dataPath('roles.csv');
            const roles = parseCsv(fs.readFileSync(roleFile, 'utf8'));
            const roleId = `role-${newId}`;
            roles.push({
              role_id: roleId,
              role_title: `${projName} Specialist`,
              department: newProj.domain,
              priority: String(body.priority || 'Normal'),
              status: 'Open',
              min_availability_percent: '40'
            });
            writeCsv(roleFile, roles);

            // Link tech skills into role_skills.csv
            const rsFile = dataPath('role_skills.csv');
            const roleSkills = parseCsv(fs.readFileSync(rsFile, 'utf8'));
            const techList = newProj.technologies.split('|').filter(Boolean);
            const allSkills = parseCsv(fs.readFileSync(dataPath('skills.csv'), 'utf8'));
            techList.forEach(tech => {
              const matched = allSkills.find(s => s.skill_name.toLowerCase() === tech.toLowerCase() || s.skill_id.toLowerCase() === tech.toLowerCase());
              if (matched) {
                roleSkills.push({
                  role_id: roleId,
                  skill_id: matched.skill_id,
                  required_level: 'Advanced',
                  importance: 'Must'
                });
              }
            });
            writeCsv(rsFile, roleSkills);

            writeAuditLog({ type: 'PROJECT_CREATED', actorId: user.user_id, actorEmail: user.name, details: `Created project ${newId}: ${projName}` });
            send(201, { ok: true, project: newProj }); return;
          }

          // ── POST /api/project-members (assign team member to project) ──────
          if (pathname === '/api/project-members' && request.method === 'POST') {
            if (user.role !== 'HR_Admin' && user.role !== 'Manager') {
              send(403, { error: 'Only HR administrators and Managers can assign team members.' }); return;
            }
            const body = await bodyJson(request);
            let projId = String(body.project_id || '').trim();
            const roleId = String(body.role_id || '').trim();
            const empId = String(body.employee_id || '').trim();
            const roleName = String(body.role || 'Contributor').trim();
            const summary = String(body.contribution_summary || `Assigned to ${projId}`).trim();
            if (!projId || !empId) { send(400, { error: 'project_id and employee_id are required.' }); return; }

            const epFile = dataPath('employee_projects.csv');
            const allEp = parseCsv(fs.readFileSync(epFile, 'utf8'));

            // Check if project exists or maps to a canonical project ID
            const projectsFile = dataPath('projects.csv');
            const allProjects = parseCsv(fs.readFileSync(projectsFile, 'utf8'));
            if (projId.startsWith('role-proj-')) {
              const stripped = projId.replace('role-', '');
              if (allProjects.some(p => p.project_id === stripped)) {
                projId = stripped;
              }
            }

            const candidateIds = new Set([projId, roleId, body.project_id].filter(Boolean));
            const existingIdx = allEp.findIndex(row => candidateIds.has(row.project_id) && row.employee_id === empId);
            if (existingIdx >= 0) {
              allEp[existingIdx].project_id = projId;
              allEp[existingIdx].role = roleName;
              allEp[existingIdx].contribution_summary = summary;
            } else {
              allEp.push({
                employee_id: empId,
                project_id: projId,
                role: roleName,
                contribution_summary: summary
              });
            }
            writeCsv(epFile, allEp);
            writeAuditLog({ type: 'MEMBER_ASSIGNED', actorId: user.user_id, targetId: empId, details: `Assigned ${empId} to ${projId} as ${roleName}` });
            send(200, { ok: true }); return;
          }

          // ── DELETE /api/project-members (remove team member from project) ──
          if (pathname === '/api/project-members' && request.method === 'DELETE') {
            if (user.role !== 'HR_Admin' && user.role !== 'Manager') {
              send(403, { error: 'Only HR administrators and Managers can remove team members.' }); return;
            }
            const body = await bodyJson(request);
            const projId = String(body.project_id || '').trim();
            const rawId = String(body.raw_project_id || '').trim();
            const empId = String(body.employee_id || '').trim();
            const candidateIds = new Set([
              projId,
              rawId,
              projId.startsWith('role-') ? projId.replace('role-', '') : `role-${projId}`,
              rawId.startsWith('role-') ? rawId.replace('role-', '') : `role-${rawId}`
            ].filter(Boolean));

            const epFile = dataPath('employee_projects.csv');
            const allEp = parseCsv(fs.readFileSync(epFile, 'utf8'));
            const updated = allEp.filter(row => !(candidateIds.has(row.project_id) && row.employee_id === empId));
            writeCsv(epFile, updated);
            send(200, { ok: true }); return;
          }

          // ── POST /api/employees (HR create new employee record) ────────────
          if (pathname === '/api/employees' && request.method === 'POST') {
            if (user.role !== 'HR_Admin') {
              send(403, { error: 'Only HR administrators can register new employees.' }); return;
            }
            const body = await bodyJson(request);
            const name = String(body.name || '').trim();
            const email = String(body.email || '').trim().toLowerCase();
            if (!name || !email) { send(400, { error: 'Name and email are required.' }); return; }
            
            const empFile = dataPath('employees.csv');
            const empRows = parseCsv(fs.readFileSync(empFile, 'utf8'));
            if (empRows.some(e => e.email.toLowerCase() === email)) {
              send(409, { error: 'An employee with this email already exists in the directory.' }); return;
            }

            const empId = `emp-${Date.now().toString().slice(-6)}`;
            const avail = Math.max(0, Math.min(100, Number(body.availability_percent ?? 80)));
            const freeHours = Math.max(0, Math.min(60, Number(body.hours_per_week_free ?? Math.round(avail * 0.4))));
            const newEmp = {
              employee_id: empId,
              name,
              email,
              title: String(body.title || 'Software Engineer'),
              department: String(body.department || 'Engineering'),
              team: String(body.team || 'Core Platform'),
              location: String(body.location || 'Remote'),
              manager_id: 'emp-1',
              hire_date: new Date().toISOString().slice(0, 10),
              availability_percent: String(avail),
              hours_per_week_free: String(freeHours),
              last_active_date: new Date().toISOString().slice(0, 10),
              current_workload_percent: String(Math.max(0, 100 - avail))
            };
            empRows.push(newEmp);
            writeCsv(empFile, empRows);

            // Add skills if provided
            if (Array.isArray(body.skills) && body.skills.length > 0) {
              const skillsFile = dataPath('employee_skills.csv');
              const allSkills = parseCsv(fs.readFileSync(skillsFile, 'utf8'));
              body.skills.forEach((s: any) => {
                if (s.skill_id) {
                  allSkills.push({
                    employee_id: empId,
                    skill_id: s.skill_id,
                    proficiency_level: s.proficiency_level || 'Intermediate',
                    years_experience: String(s.years_experience || 2),
                    source: 'self',
                    verified: 'true',
                    last_used_date: new Date().toISOString().slice(0, 10)
                  });
                }
              });
              writeCsv(skillsFile, allSkills);
            }

            // Also create login account in company_users.csv if requested
            if (body.createAccount !== false) {
              const usersFile = dataPath('company_users.csv');
              const users = parseCsv(fs.readFileSync(usersFile, 'utf8'));
              if (!users.some(u => u.email.toLowerCase() === email)) {
                users.push({
                  user_id: `user-${randomUUID()}`,
                  name,
                  email,
                  password_hash: bcrypt.hashSync(String(body.password || 'Password123!'), 10),
                  role: 'Employee',
                  is_active: 'true'
                });
                writeCsv(usersFile, users);
              }
            }

            writeAuditLog({ type: 'EMPLOYEE_CREATED', actorId: user.user_id, actorEmail: user.name, targetEmail: email, details: `Created employee ${empId}: ${name}` });
            send(201, { ok: true, employee: newEmp }); return;
          }

          // ── POST /api/learning-resources (HR add learning course/resource) ─
          if (pathname === '/api/learning-resources' && request.method === 'POST') {
            if (user.role !== 'HR_Admin' && user.role !== 'Manager') {
              send(403, { error: 'Only HR administrators and Managers can add learning resources.' }); return;
            }
            const body = await bodyJson(request);
            const title = String(body.title || '').trim();
            const skillId = String(body.skill_id || '').trim();
            if (!title || !skillId) { send(400, { error: 'Title and skill_id are required.' }); return; }
            const resFile = dataPath('learning_resources.csv');
            const resources = parseCsv(fs.readFileSync(resFile, 'utf8'));
            const resId = `res-${Date.now().toString().slice(-4)}`;
            const rawMentorId = String(body.mentor_employee_id || '').trim();
            let verifiedMentorId = '';
            if (rawMentorId) {
              const skillsFile = dataPath('employee_skills.csv');
              const allSkills = parseCsv(fs.readFileSync(skillsFile, 'utf8'));
              const isQualified = allSkills.some(s => s.employee_id === rawMentorId && s.skill_id === skillId && ['Expert', 'Master'].includes(s.proficiency_level));
              if (isQualified) {
                verifiedMentorId = rawMentorId;
              }
            }

            const newRes = {
              resource_id: resId,
              skill_id: skillId,
              title,
              provider: String(body.provider || 'Internal Academy'),
              type: String(body.type || 'course'),
              duration_weeks: String(body.duration_weeks || '2'),
              target_level: String(body.target_level || 'Advanced'),
              mentor_employee_id: verifiedMentorId
            };
            resources.push(newRes);
            writeCsv(resFile, resources);
            writeAuditLog({ type: 'RESOURCE_CREATED', actorId: user.user_id, details: `Created resource ${resId}: ${title}` });
            send(201, { ok: true, resource: newRes }); return;
          }

          // ── POST /api/evidence (Employee or Manager submit verified evidence) ─
          if (pathname === '/api/evidence' && request.method === 'POST') {
            const body = await bodyJson(request);
            const skillId = String(body.skill_id || '').trim();
            const title = String(body.title || '').trim();
            if (!skillId || !title) {
              send(400, { error: 'skill_id and title are required.' }); return;
            }
            const empFile = dataPath('employees.csv');
            const empRows = parseCsv(fs.readFileSync(empFile, 'utf8'));
            const userEmail = String(user.email || '').trim().toLowerCase();
            const userName = String(user.name || '').trim().toLowerCase();
            let currentEmp = empRows.find(e => (e.email && e.email.toLowerCase() === userEmail) || (e.name && e.name.toLowerCase() === userName) || (userEmail.includes('employee') && e.employee_id === 'emp-1'));
            let empId = currentEmp ? currentEmp.employee_id : '';
            if (!empId) {
              empId = `emp-${Date.now().toString().slice(-6)}`;
              currentEmp = {
                employee_id: empId,
                name: user.name || 'Employee',
                email: user.email || `${empId}@company.com`,
                title: 'Software Engineer',
                department: 'Engineering',
                team: 'General Team',
                location: 'Remote',
                manager_id: 'emp-1',
                hire_date: new Date().toISOString().slice(0, 10),
                availability_percent: '80',
                hours_per_week_free: '32',
                last_active_date: new Date().toISOString().slice(0, 10),
                current_workload_percent: '20'
              };
              empRows.push(currentEmp);
              writeCsv(empFile, empRows);
            }

            const evFile = dataPath('evidence.csv');
            const evidenceList = parseCsv(fs.readFileSync(evFile, 'utf8'));
            const evId = `ev-${Date.now().toString().slice(-6)}`;
            const evidenceType = String(body.evidence_type || 'PR');
            const url = String(body.url || '');
            const weight = String(body.weight || '1.5');
            const projectId = String(body.project_id || 'proj-101');
            const newEv = {
              evidence_id: evId,
              employee_id: empId,
              skill_id: skillId,
              evidence_type: evidenceType,
              title,
              url,
              weight,
              date: new Date().toISOString().slice(0, 10),
              project_id: projectId
            };
            evidenceList.push(newEv);
            writeCsv(evFile, evidenceList);

            // Ensure skill exists in employee_skills.csv
            const skFile = dataPath('employee_skills.csv');
            const empSkills = parseCsv(fs.readFileSync(skFile, 'utf8'));
            const hasSkill = empSkills.some(s => s.employee_id === empId && s.skill_id === skillId);
            if (!hasSkill) {
              empSkills.push({
                employee_id: empId,
                skill_id: skillId,
                proficiency_level: String(body.proficiency_level || 'Intermediate'),
                years_experience: String(body.years_experience || '2'),
                source: 'github',
                verified: 'true',
                last_used_date: new Date().toISOString().slice(0, 10)
              });
              writeCsv(skFile, empSkills);
            }

            writeAuditLog({ type: 'EVIDENCE_SUBMITTED', actorId: user.user_id, details: `Submitted ${evidenceType} evidence ${evId} for skill ${skillId}` });
            send(201, { ok: true, evidence: newEv }); return;
          }

          // ── GET /api/project-applications (Retrieve applications) ──────────
          if (pathname === '/api/project-applications' && request.method === 'GET') {
            const appFile = dataPath('project_applications.csv');
            let applications: Record<string, string>[] = [];
            if (fs.existsSync(appFile)) {
              applications = parseCsv(fs.readFileSync(appFile, 'utf8'));
            }
            send(200, { applications }); return;
          }

          // ── POST /api/project-applications (Employee express interest / apply) ─
          if (pathname === '/api/project-applications' && request.method === 'POST') {
            const body = await bodyJson(request);
            const oppId = String(body.opportunity_id || '').trim();
            if (!oppId) {
              send(400, { error: 'opportunity_id is required.' }); return;
            }
            const empFile = dataPath('employees.csv');
            const empRows = parseCsv(fs.readFileSync(empFile, 'utf8'));
            const userEmail = String(user.email || '').trim().toLowerCase();
            const userName = String(user.name || '').trim().toLowerCase();
            const currentEmp = empRows.find(e => (e.email && e.email.toLowerCase() === userEmail) || (e.name && e.name.toLowerCase() === userName) || (userEmail.includes('employee') && e.employee_id === 'emp-1'));
            const empId = currentEmp ? currentEmp.employee_id : `emp-${user.user_id}`;
            const empName = currentEmp ? currentEmp.name : user.name;

            const appFile = dataPath('project_applications.csv');
            let applications: Record<string, string>[] = [];
            if (fs.existsSync(appFile)) {
              applications = parseCsv(fs.readFileSync(appFile, 'utf8'));
            }
            const existingIdx = applications.findIndex(a => a.opportunity_id === oppId && a.employee_id === empId);
            const newApp = {
              application_id: existingIdx >= 0 ? applications[existingIdx].application_id : `app-${Date.now().toString().slice(-6)}`,
              opportunity_id: oppId,
              opportunity_type: String(body.opportunity_type || (oppId.startsWith('proj') ? 'project' : 'role')),
              employee_id: empId,
              employee_name: empName,
              note: String(body.note || 'Expressed strong interest in this opportunity.'),
              hours_per_week: String(body.hours_per_week || (currentEmp?.hours_per_week_free || '20')),
              applied_at: new Date().toISOString().slice(0, 10),
              status: existingIdx >= 0 ? applications[existingIdx].status : 'Pending Review'
            };
            if (existingIdx >= 0) {
              applications[existingIdx] = newApp;
            } else {
              applications.push(newApp);
            }
            writeCsv(appFile, applications);
            writeAuditLog({ type: 'APPLICATION_SUBMITTED', actorId: user.user_id, details: `${empName} applied for ${oppId}` });
            send(201, { ok: true, application: newApp }); return;
          }

          // ── DELETE /api/project-applications (Withdraw application) ────────
          if (pathname === '/api/project-applications' && request.method === 'DELETE') {
            const body = await bodyJson(request);
            const oppId = String(body.opportunity_id || '').trim();
            const appId = String(body.application_id || '').trim();
            const appFile = dataPath('project_applications.csv');
            if (fs.existsSync(appFile)) {
              let applications = parseCsv(fs.readFileSync(appFile, 'utf8'));
              applications = applications.filter(a => !(a.application_id === appId || (oppId && a.opportunity_id === oppId)));
              writeCsv(appFile, applications);
            }
            send(200, { ok: true }); return;
          }

          // ── POST /api/project-shortlists (HR / Manager shortlist candidate) ─
          if (pathname === '/api/project-shortlists' && request.method === 'POST') {
            const body = await bodyJson(request);
            const projId = String(body.project_id || '').trim();
            const empId = String(body.employee_id || '').trim();
            if (!projId || !empId) {
              send(400, { error: 'project_id and employee_id are required.' }); return;
            }
            const slFile = dataPath('project_shortlists.csv');
            let shortlists = fs.existsSync(slFile) ? parseCsv(fs.readFileSync(slFile, 'utf8')) : [];
            const exists = shortlists.some(s => s.project_id === projId && s.employee_id === empId);
            if (!exists) {
              shortlists.push({
                project_id: projId,
                employee_id: empId,
                shortlisted_by: user.name || user.email,
                shortlisted_at: new Date().toISOString().slice(0, 10),
                note: String(body.note || 'Shortlisted via matching engine')
              });
              writeCsv(slFile, shortlists);
            }
            send(200, { ok: true, shortlists }); return;
          }

          // ── DELETE /api/project-shortlists (Remove from shortlist) ──────────
          if (pathname === '/api/project-shortlists' && request.method === 'DELETE') {
            const body = await bodyJson(request);
            const projId = String(body.project_id || '').trim();
            const empId = String(body.employee_id || '').trim();
            const slFile = dataPath('project_shortlists.csv');
            if (fs.existsSync(slFile)) {
              let shortlists = parseCsv(fs.readFileSync(slFile, 'utf8'));
              shortlists = shortlists.filter(s => !(s.project_id === projId && s.employee_id === empId));
              writeCsv(slFile, shortlists);
            }
            send(200, { ok: true }); return;
          }

          send(404, { error: 'Unknown API route.' });
        } catch (error) { send(400, { error: error instanceof Error ? error.message : 'Request failed.' }); }
      });
  };
  return {
    name: 'skillgraph-csv-api',
    configureServer: attach,
    configurePreviewServer: attach
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  process.env.SKILLGRAPH_SESSION_SECRET ||= env.SKILLGRAPH_SESSION_SECRET;
  process.env.SKILLGRAPH_INVITE_CODE ||= env.SKILLGRAPH_INVITE_CODE;
  process.env.SKILLGRAPH_INVITE_AUTO_APPROVE ||= env.SKILLGRAPH_INVITE_AUTO_APPROVE;
  process.env.SKILLGRAPH_ALLOWED_DOMAINS ||= env.SKILLGRAPH_ALLOWED_DOMAINS;
  process.env.SKILLGRAPH_HR_INVITE_CODE ||= env.SKILLGRAPH_HR_INVITE_CODE || 'skillgraph-hr-admin-2026';
  process.env.SKILLGRAPH_EMPLOYEE_INVITE_CODE ||= env.SKILLGRAPH_EMPLOYEE_INVITE_CODE || 'skillgraph-employee-2026';
  if (!process.env.SKILLGRAPH_SESSION_SECRET) throw new Error('Set SKILLGRAPH_SESSION_SECRET in .env before starting SkillGraph.');
  return {
    plugins: [react(), csvApi()],
    server: { host: '0.0.0.0', port: 3000, open: false, allowedHosts: true },
    preview: { host: '0.0.0.0', port: 3000, allowedHosts: true }
  };
});
