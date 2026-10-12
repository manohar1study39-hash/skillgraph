import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';

interface AuthSession {
  context: BrowserContext;
  page: Page;
  user: {
    user_id: string;
    name: string;
    role: string;
    email: string;
  };
}

async function createAuthenticatedSession(
  browser: Browser,
  email: string,
  role: 'Employee' | 'Manager' | 'HR_Admin',
  portal: 'employee' | 'manager' | 'hr'
): Promise<AuthSession> {
  const context = await browser.newContext();
  const page = await context.newPage();

  const passwords: Record<string, string> = {
    'employee@skillgraph.demo': 'Password123!',
    'manager@skillgraph.demo': 'SkillGraphManager2026!',
    'hr@skillgraph.demo': 'SkillGraphHR2026!',
  };

  const loginRes = await context.request.post('http://127.0.0.1:3000/api/login', {
    data: {
      email,
      password: passwords[email],
      portal,
      rememberMe: false,
    },
  });

  expect(loginRes.status()).toBe(200);
  const loginData = await loginRes.json();
  expect(loginData.user).toBeDefined();
  expect(loginData.user.role).toBe(role);

  // Navigate to application root
  await page.goto('http://127.0.0.1:3000/');
  await page.waitForLoadState('networkidle');

  return {
    context,
    page,
    user: loginData.user,
  };
}

test.describe('Phase 6: Multi-Role Integration & Cross-Role E2E Validation', () => {
  let employeeSession: AuthSession;
  let managerSession: AuthSession;
  let hrSession: AuthSession;

  test.beforeAll(async ({ browser }) => {
    // Launch 3 distinct, concurrent role contexts
    employeeSession = await createAuthenticatedSession(
      browser,
      'employee@skillgraph.demo',
      'Employee',
      'employee'
    );

    managerSession = await createAuthenticatedSession(
      browser,
      'manager@skillgraph.demo',
      'Manager',
      'manager'
    );

    hrSession = await createAuthenticatedSession(
      browser,
      'hr@skillgraph.demo',
      'HR_Admin',
      'hr'
    );
  });

  test.afterAll(async () => {
    await employeeSession?.context.close();
    await managerSession?.context.close();
    await hrSession?.context.close();
  });

  test('Scenario 1: Evidence Submission -> HR Verification -> Cross-Role Propagation', async () => {
    const empReq = employeeSession.context.request;
    const hrReq = hrSession.context.request;
    const mgrReq = managerSession.context.request;

    const runStamp = Date.now();
    const evidenceTitle = `High-Throughput Streaming Dashboard Architecture ${runStamp}`;
    const evidenceUrl = `https://github.com/company/repo/pull/${runStamp}`;

    // 1. Employee submits evidence for React
    const submitRes = await empReq.post('http://127.0.0.1:3000/api/evidence', {
      data: {
        title: evidenceTitle,
        evidence_type: 'PR',
        url: evidenceUrl,
        artifact_date: '2026-10-01',
        skill_id: 'skill-react',
      },
    });

    expect([200, 201]).toContain(submitRes.status());
    const evData = await submitRes.json();
    expect(evData.ok).toBe(true);
    expect(evData.evidence_id).toBeTruthy();
    expect(['Self-reported', 'Link checked']).toContain(evData.verification_status);

    const evidenceId = evData.evidence_id;

    // 2. HR reviews and approves/verifies the evidence
    const verifyRes = await hrReq.post(
      `http://127.0.0.1:3000/api/evidence/${evidenceId}/verify`,
      {
        data: {
          verification_status: 'Verified by HR',
          hr_notes: 'Verified repository commit and peer review signoff.',
        },
      }
    );

    expect(verifyRes.status()).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.ok).toBe(true);
    expect(verifyData.verification_status).toBe('Verified by HR');
    expect(verifyData.data_version).toBeGreaterThan(0);

    // 3. Employee view reflects the verified status & explanation
    const empExplRes = await empReq.get(
      'http://127.0.0.1:3000/api/employee/skills/skill-react/explanation'
    );
    expect(empExplRes.status()).toBe(200);
    const empExplData = await empExplRes.json();
    const contributions = empExplData.ordered_contributions || empExplData.ordered_evidence || [];
    expect(contributions.length).toBeGreaterThan(0);

    const verifiedFactor = contributions.find(
      (f: any) => f.title === evidenceTitle
    );
    expect(verifiedFactor).toBeDefined();
    expect(verifiedFactor.verification_status).toBe('Verified by HR');

    const employeeId = empExplData.employee_id;

    // 4. Manager queries employee explanation/skills and confirms verified evidence
    const mgrEmpRes = await mgrReq.get(
      `http://127.0.0.1:3000/api/employees/${employeeId}/skills/skill-react/explanation`
    );
    expect(mgrEmpRes.status()).toBe(200);
    const mgrEmpData = await mgrEmpRes.json();
    const mgrContributions = mgrEmpData.ordered_contributions || mgrEmpData.ordered_evidence || [];
    const mgrFactor = mgrContributions.find(
      (f: any) => f.title === evidenceTitle
    );
    expect(mgrFactor).toBeDefined();
    expect(mgrFactor.verification_status).toBe('Verified by HR');
  });

  test('Scenario 2: Employee Availability Update -> Manager Talent Search & HR Capacity Propagation', async () => {
    const empReq = employeeSession.context.request;
    const mgrReq = managerSession.context.request;
    const hrReq = hrSession.context.request;

    // 1. Get current availability and capacity
    const curAvailRes = await empReq.get('http://127.0.0.1:3000/api/employee/availability');
    expect(curAvailRes.status()).toBe(200);
    const curAvail = await curAvailRes.json();
    const employeeId = curAvail.employee_id;

    // Safely choose target within max_free_hours
    const maxFree = Number(curAvail.max_free_hours || 40);
    const targetHours = maxFree >= 10 ? 10 : Math.max(1, Math.floor(maxFree));
    const targetPct = Math.round((targetHours / 40) * 100);

    // 2. Employee updates availability
    const updateRes = await empReq.put('http://127.0.0.1:3000/api/employee/availability', {
      data: {
        availability_percent: targetPct,
        hours_per_week_free: targetHours,
        version: curAvail.version,
      },
    });

    expect(updateRes.status()).toBe(200);
    const updated = await updateRes.json();
    expect(Math.round(updated.availability_percent)).toBe(targetPct);
    expect(updated.hours_per_week_free).toBe(targetHours);

    // 3. Manager queries employee profile and sees updated availability
    const mgrProfileRes = await mgrReq.get(
      `http://127.0.0.1:3000/api/employees/${employeeId}/profile`
    );
    expect(mgrProfileRes.status()).toBe(200);
    const mgrProfile = await mgrProfileRes.json();
    expect(mgrProfile.employee).toBeDefined();
    expect(Math.round(Number(mgrProfile.employee.availabilityPercent))).toBe(targetPct);
    expect(Number(mgrProfile.employee.hoursPerWeekFree)).toBe(targetHours);

    // 4. HR queries candidate profile and also sees updated availability
    const hrProfileRes = await hrReq.get(
      `http://127.0.0.1:3000/api/employees/${employeeId}/profile`
    );
    expect(hrProfileRes.status()).toBe(200);
    const hrProfile = await hrProfileRes.json();
    expect(hrProfile.employee).toBeDefined();
    expect(Math.round(Number(hrProfile.employee.availabilityPercent))).toBe(targetPct);
  });

  test('Scenario 3: Course Completion Workflow & Credit Application', async () => {
    const empReq = employeeSession.context.request;
    const hrReq = hrSession.context.request;
    const resourceId = 'res-5'; // Streaming Data Pipelines with Python & PyTorch

    // 1. Ensure clean slate by dropping prior enrollment if exists
    await empReq.post('http://127.0.0.1:3000/api/upskilling/unenroll', {
      data: {
        resource_id: resourceId,
        role_id: 'role-fintech-app-lead',
      },
    }).catch(() => {});

    // 2. Employee enrolls in course
    const enrollRes = await empReq.post('http://127.0.0.1:3000/api/upskilling/enroll', {
      data: {
        resource_id: resourceId,
        role_id: 'role-fintech-app-lead',
      },
    });
    expect([200, 201]).toContain(enrollRes.status());

    // 3. Employee logs hours
    const logRes = await empReq.post('http://127.0.0.1:3000/api/upskilling/log-hours', {
      data: {
        resource_id: resourceId,
        hours: 16,
        date: '2026-10-09',
        role_id: 'role-fintech-app-lead',
      },
    });
    expect(logRes.status()).toBe(200);
    const logData = await logRes.json();
    expect(logData.hours_logged).toBeGreaterThanOrEqual(16);

    // 4. Employee requests completion
    const reqRes = await empReq.post(
      'http://127.0.0.1:3000/api/upskilling/request-completion',
      {
        data: {
          resource_id: resourceId,
          proof_url: 'https://verify.skillgraph.demo/cert/python-streaming-cert',
          note: 'Completed all pipeline architecture exercises and passed assessment.',
          role_id: 'role-fintech-app-lead',
        },
      }
    );
    expect(reqRes.status()).toBe(200);
    const reqData = await reqRes.json();
    expect(reqData.status).toBe('Awaiting approval');
    expect(reqData.progress_id).toBeTruthy();

    const progressId = reqData.progress_id;

    // 5. HR Admin reviews and approves the completion
    const reviewRes = await hrReq.post(
      'http://127.0.0.1:3000/api/upskilling/admin/review-completion',
      {
        data: {
          progress_id: progressId,
          decision: 'Approved',
          note: 'Capstone verified against internal engineering standards.',
        },
      }
    );
    expect(reviewRes.status()).toBe(200);
    const reviewData = await reviewRes.json();
    expect(reviewData.status).toBe('Done');
    expect(reviewData.progress_percent).toBe(100);

    // 6. Employee progress endpoint reflects the approval
    const progressListRes = await empReq.get(
      'http://127.0.0.1:3000/api/upskilling/progress'
    );
    expect(progressListRes.status()).toBe(200);
    const progressList = await progressListRes.json();
    const completedCourse = progressList.progress.find(
      (p: any) => p.resource_id === resourceId
    );
    expect(completedCourse).toBeDefined();
    expect(completedCourse.status).toBe('Done');
    expect(completedCourse.progress_percent).toBe(100);
  });

  test('Scenario 4: Opportunity Application & HR Status Transition', async () => {
    const empReq = employeeSession.context.request;
    const hrReq = hrSession.context.request;
    const oppId = 'proj-102';

    // 1. Withdraw prior application if exists
    await empReq
      .delete(`http://127.0.0.1:3000/api/project-applications/${oppId}`)
      .catch(() => {});

    // 2. Employee applies for opportunity
    const applyRes = await empReq.post('http://127.0.0.1:3000/api/project-applications', {
      data: {
        opportunity_id: oppId,
        opportunity_type: 'Project',
        hours_per_week: 10,
        note: 'Excited to contribute to global payment gateway microservices.',
      },
    });

    expect([200, 201]).toContain(applyRes.status());
    const applyData = await applyRes.json();
    expect(applyData.ok).toBe(true);
    expect(applyData.application_id).toBeTruthy();
    expect(applyData.status).toBe('Pending');

    const applicationId = applyData.application_id;

    // 3. HR lists applications and finds the application
    const hrListRes = await hrReq.get('http://127.0.0.1:3000/api/project-applications');
    expect(hrListRes.status()).toBe(200);
    const hrListData = await hrListRes.json();
    const targetApp = hrListData.applications.find(
      (a: any) => a.application_id === applicationId
    );
    expect(targetApp).toBeDefined();
    expect(targetApp.status).toBe('Pending');

    // 4. HR reviews and approves/accepts application
    const hrReviewRes = await hrReq.post(
      `http://127.0.0.1:3000/api/project-applications/${applicationId}/review`,
      {
        data: {
          status: 'Accepted',
          hr_decision_note: 'Team has approved capacity and matched required competencies.',
        },
      }
    );
    expect(hrReviewRes.status()).toBe(200);
    const hrReviewData = await hrReviewRes.json();
    expect(hrReviewData.ok).toBe(true);
    expect(hrReviewData.status).toBe('Accepted');

    // 5. Employee sees application status updated to Accepted
    const empListRes = await empReq.get('http://127.0.0.1:3000/api/project-applications');
    expect(empListRes.status()).toBe(200);
    const empListData = await empListRes.json();
    const updatedEmpApp = empListData.applications.find(
      (a: any) => a.application_id === applicationId
    );
    expect(updatedEmpApp).toBeDefined();
    expect(updatedEmpApp.status).toBe('Accepted');
  });

  test('Scenario 5: Optimistic Concurrency 409 Conflict Dialog & Protection', async () => {
    const page = employeeSession.page;

    // 1. Perform an API call with stale version (expect 409)
    const conflictRes = await employeeSession.context.request.put(
      'http://127.0.0.1:3000/api/employee/availability',
      {
        data: {
          availability_percent: 80,
          hours_per_week_free: 10,
          version: 999999, // Intentional stale version mismatch
        },
      }
    );

    expect(conflictRes.status()).toBe(409);
    const conflictBody = await conflictRes.json();
    expect(conflictBody.detail).toContain('changed by someone else');

    // 2. Trigger conflict notification in the browser page
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('skillgraph-conflict', {
          detail: { message: 'This was changed by someone else. Reload to see the latest.' },
        })
      );
    });

    // Check that ConflictModal appears
    const modal = page.locator('[role="alertdialog"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(modal).toContainText('Concurrent Update Detected');
    await expect(modal).toContainText('This was changed by someone else. Reload to see the latest.');

    // Close the conflict modal
    const closeBtn = modal.locator('button[aria-label="Close"]');
    await closeBtn.click();
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });
});
