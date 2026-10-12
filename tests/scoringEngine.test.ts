import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSkillClient, LEVEL_NAMES } from '../src/services/scoringEngine.ts';

const TODAY = new Date('2026-10-08');

test('TypeScript engine: self-declaration claim alone gives Level 1 Aware', () => {
  const res = evaluateSkillClient('skill-test', [], [], 1.0, 'Guided', TODAY);
  assert.equal(res.level, 1);
  assert.equal(res.levelName, 'Aware');
  assert.equal(res.points, 2.0);
});

test('TypeScript engine: duplicate submissions never raise level or double count', () => {
  const single = evaluateSkillClient(
    'skill-test',
    [{ title: 'Duplicate PR', url: 'https://github.com/org/repo/pull/1', artifact_date: '2026-08-01', complexityScore: 3.0 }],
    [],
    1.0,
    'Guided',
    TODAY
  );
  const dup = evaluateSkillClient(
    'skill-test',
    [
      { title: 'Duplicate PR', url: 'https://github.com/org/repo/pull/1', artifact_date: '2026-08-01', complexityScore: 3.0 },
      { title: 'Duplicate PR', url: 'https://github.com/org/repo/pull/1', artifact_date: '2026-08-01', complexityScore: 3.0 }
    ],
    [],
    1.0,
    'Guided',
    TODAY
  );
  assert.equal(single.points, dup.points);
  assert.equal(single.level, dup.level);
  assert.equal(dup.orderedContributions[1].isDuplicate, true);
});

test('TypeScript engine: self-reported evidence alone capped at Level 3 Independent', () => {
  const massiveSelfReported = Array.from({ length: 8 }, (_, i) => ({
    title: `Project ${i + 1}`,
    evidence_type: 'project',
    verification_status: 'Self-reported',
    artifact_date: '2026-01-01',
    complexity_score: 5.0,
    duration_months: 12.0
  }));
  const res = evaluateSkillClient('skill-test', massiveSelfReported, [], 5.0, 'Expert', TODAY);
  assert.equal(res.level, 3);
  assert.equal(res.levelName, 'Independent');
});

test('TypeScript engine: verified high-complexity artifacts unlock Level 4 and 5', () => {
  const leadArchitect = [
    { title: 'Cloud Core', evidence_type: 'project', verification_status: 'Verified by HR', artifact_date: '2025-06-01', complexity_score: 5.0, duration_months: 12.0, role: 'Architect' },
    { title: 'Fintech Engine', evidence_type: 'project', verification_status: 'Verified by HR', artifact_date: '2026-01-10', complexity_score: 5.0, duration_months: 10.0, role: 'Lead' },
    { title: 'Security Service', evidence_type: 'project', verification_status: 'Verified by HR', artifact_date: '2026-06-01', complexity_score: 5.0, duration_months: 6.0, role: 'Lead' },
    { title: 'PR 10', evidence_type: 'PR', verification_status: 'Link checked', artifact_date: '2026-08-01', complexity_score: 4.0, duration_months: 3.0 },
    { title: 'PR 12', evidence_type: 'PR', verification_status: 'Link checked', artifact_date: '2026-08-20', complexity_score: 4.0, duration_months: 3.0 }
  ];
  const certs = [{ title: 'AWS Architect', issued_date: '2025-01-01', expiry_date: '2028-01-01' }];
  const res = evaluateSkillClient('skill-test', leadArchitect, certs, 10.0, 'Expert', TODAY);
  assert.equal(res.level, 5);
  assert.equal(res.levelName, 'Expert');
  assert.equal(res.evidenceStrength, 'Strong');
});

test('TypeScript engine: deterministic recomputation produces identical results', () => {
  const items = [{ title: 'PR 1', evidence_type: 'PR', verification_status: 'Verified by HR', artifact_date: '2026-07-01' }];
  const run1 = evaluateSkillClient('skill-test', items, [], 2.0, 'Guided', TODAY);
  const run2 = evaluateSkillClient('skill-test', items, [], 2.0, 'Guided', TODAY);
  assert.deepEqual(run1, run2);
});

test('TypeScript engine: course awaiting completion awards partial credit', () => {
  const emptyEvidence: any[] = [];
  const awaitingCourses = [{ status: 'Awaiting approval' }];
  const res = evaluateSkillClient('skill-test', emptyEvidence, [], 1.0, 'Aware', TODAY, awaitingCourses);
  const hasPartial = res.orderedContributions.some(c => c.type === 'course_partial');
  assert.equal(hasPartial, true);
});
