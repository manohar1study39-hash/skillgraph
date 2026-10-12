import test from 'node:test';
import assert from 'node:assert/strict';
import type { Employee, EmployeeSkill, MarketplaceRole, ProficiencyLevel } from '../src/types/index.ts';
import { analyzeAllEmployees, analyzeEmployeesForRole, analyzeRoleGap } from '../src/services/upskillingEngine.ts';
import type { LearningResourceRow, RoleRequirement } from '../src/services/upskillingEngine.ts';

const today = new Date().toISOString().slice(0,10);
const verified = (date = today, expired = false) => ({ id: 'proof', title: 'Verified delivery', type: 'Project' as const, date, weightMultiplier: 1, description: '', complexityScore: 3, verificationSource: 'GitHub', verified: true, expired });
const skill = (skillId: string, proficiencyLevel: ProficiencyLevel, evidenceList = [verified()], confidenceScore = 100): EmployeeSkill => ({ skillId, skillName: skillId, category: 'Engineering', proficiencyScore: 100, proficiencyLevel, evidenceCount: evidenceList.length, lastUsedDate: today, confidenceScore, evidenceList });
const employee = (id: string, skills: EmployeeSkill[], workload = 20): Employee => ({ id, name: id, avatar: '', role: 'Engineer', team: 'Core', department: 'Engineering', location: 'Remote', email: `${id}@example.com`, availabilityPercent: 80, currentWorkloadPercent: workload, hoursPerWeekFree: 8, bio: '', yearsExperience: 4, skills, topProjects: [], certifications: [] });
const requirements = (...items: Partial<RoleRequirement>[]): RoleRequirement[] => items.map((item, index) => ({ role_id: 'role', skill_id: `skill-${index + 1}`, required_level: 'Advanced', importance: 'Must', ...item }));
const role = (items: RoleRequirement[]): MarketplaceRole => ({ id: 'role', title: 'Role', department: 'Engineering', location: 'Remote', team: 'Core', commitment: 'Full-time', requiredSkills: items.map(item => ({ skillId: item.skill_id, skillName: item.skill_id, level: item.required_level })), description: '', postedDate: '', applicantsCount: 0, nearQualifiedMatchesCount: 0, status: 'Open' });
const analyze = (person: Employee, required: RoleRequirement[], resources: LearningResourceRow[] = [], team: Employee[] = [person]) => analyzeRoleGap(person, role(required), required, resources, team);

test('exceeding a required level gives no extra readiness credit', () => {
  const required = requirements({ required_level: 'Intermediate' });
  const result = analyze(employee('p1', [skill('skill-1', 'Master')]), required);
  assert.equal(result.readinessPercent, 100);
  assert.equal(result.gaps.length, 0);
});

test('a missing Must skill is shown as a gap and cannot qualify', () => {
  const required = requirements({ required_level: 'Advanced' });
  const result = analyze(employee('p1', []), required);
  assert.equal(result.gaps[0].currentLevel, 'Missing');
  assert.equal(result.status, 'Not Ready');
});

test('Nice skills use weight 0.3 in readiness', () => {
  const required = requirements({ skill_id: 'must', required_level: 'Expert', importance: 'Must' }, { skill_id: 'nice', required_level: 'Expert', importance: 'Nice' });
  const result = analyze(employee('p1', [skill('must', 'Expert')]), required);
  assert.equal(result.readinessPercent, 77);
  assert.equal(result.breakdown[1].weight, 0.3);
});

test('expired certification evidence contributes no readiness', () => {
  const required = requirements({ required_level: 'Advanced' });
  const result = analyze(employee('p1', [skill('skill-1', 'Advanced', [verified(today, true)], 0)]), required);
  assert.equal(result.readinessPercent, 0);
});

test('old evidence loses confidence through recency decay', () => {
  const required = requirements({ required_level: 'Expert' });
  const recent = analyze(employee('recent', [skill('skill-1', 'Expert', [verified(today)])]), required);
  const old = analyze(employee('old', [skill('skill-1', 'Expert', [verified('2018-01-01')])]), required);
  assert.ok(old.readinessPercent < recent.readinessPercent);
});

test('mentor selection accepts a separate Expert with workload below the threshold', () => {
  const required = requirements({ skill_id: 'skill-1', required_level: 'Expert' });
  const learner = employee('learner', [skill('skill-1', 'Advanced')]);
  const mentor = employee('mentor', [skill('skill-1', 'Expert')], 45);
  const resource: LearningResourceRow = { resource_id: 'r1', skill_id: 'skill-1', title: 'Mentoring', provider: 'Internal', type: 'mentor', mentor_employee_id: 'mentor', duration_weeks: '2', target_level: 'Expert' };
  assert.equal(analyze(learner, required, [resource], [learner, mentor]).gaps[0].mentor?.id, 'mentor');
  assert.equal(analyze(learner, required, [resource], [learner, employee('mentor', [skill('skill-1', 'Expert')], 85)]).gaps[0].mentor, undefined);
});

test('qualified and Near-Qualified boundaries are distinct', () => {
  const required = requirements({ required_level: 'Expert' });
  const qualified = analyze(employee('qualified', [skill('skill-1', 'Expert')]), required);
  const near = analyze(employee('near', [skill('skill-1', 'Advanced')]), required);
  assert.equal(qualified.status, 'Qualified');
  assert.equal(near.status, 'Near-Qualified');
  assert.equal(near.readinessPercent >= 60, true);
});

test('Qualified and Near-Qualified lists contain each employee id once even if input rows repeat', () => {
  const required = requirements({ skill_id: 'skill-1', required_level: 'Expert' });
  const repeated = employee('near', [skill('skill-1', 'Advanced')]);
  const team = [repeated, { ...repeated }, employee('qualified', [skill('skill-1', 'Expert')])];
  const analyses = analyzeEmployeesForRole(team, role(required), required, []);
  const near = analyses.filter(item => item.status === 'Near-Qualified');
  const qualified = analyses.filter(item => item.status === 'Qualified');
  for (const list of [near, qualified]) assert.equal(new Set(list.map(item => item.employee.id)).size, list.length);
  assert.deepEqual(near.map(item => item.employee.id), ['near']);
  assert.deepEqual(qualified.map(item => item.employee.id), ['qualified']);
  assert.deepEqual(analyzeAllEmployees(team, role(required), required, []).map(item => item.employee.id), ['near']);
});
