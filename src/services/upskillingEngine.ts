import type { Employee, EmployeeSkill, MarketplaceRole, ProficiencyLevel, SkillTaxonomy } from '../types';

export interface RoleRequirement { role_id: string; skill_id: string; required_level: ProficiencyLevel; importance: 'Must' | 'Nice' }
export interface LearningResourceRow { resource_id: string; skill_id: string; title: string; provider: string; type: 'course' | 'cert' | 'project' | 'mentor'; mentor_employee_id: string; duration_weeks: string; target_level: ProficiencyLevel; estimated_hours?: number; }
export interface ProgressRow { employee_id: string; role_id: string; resource_id: string; status: string; progress_percent: string; updated_at: string }
export interface SkillGap {
  skillId: string;
  skillName: string;
  currentLevel: ProficiencyLevel | 'Missing';
  requiredLevel: ProficiencyLevel;
  gapSize: number;
  importance: 'Must' | 'Nice';
  evidenceCount: number;
  verifiedEvidenceCount: number;
  lastUsedDate: string;
  explanation: string;
  transferableSkillNote?: string;
  resource?: LearningResourceRow;
  mentor?: Employee;
}
export interface ReadinessItem { skillId: string; skillName: string; importance: 'Must' | 'Nice'; weight: number; currentLevel: ProficiencyLevel | 'Missing'; requiredLevel: ProficiencyLevel; evidenceConfidence: number; credit: number }
export type ReadinessStatus = 'Qualified' | 'Near-Qualified' | 'Not Ready';
export interface RoleGapAnalysis {
  employee: Employee;
  role: MarketplaceRole;
  readinessPercent: number;
  confidenceLabel: 'High' | 'Medium' | 'Low';
  breakdown: ReadinessItem[];
  gaps: SkillGap[];
  readyInWeeks: number;
  readyInWeeksRange: string;
  nearQualified: boolean;
  status: ReadinessStatus;
  overloaded: boolean;
}

export const LEVEL_ORDER: ProficiencyLevel[] = ['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Master'];
export const levelNumber = (level: ProficiencyLevel | 'Missing' | undefined): number => !level || level === 'Missing' ? 0 : LEVEL_ORDER.indexOf(level) + 1;
const WEIGHTS = { Must: 1, Nice: 0.3 } as const;
const STANDARD_LEARNING_HOURS = 8;
const MENTOR_MAX_WORKLOAD = 80;

function recencyFactor(date: string): number {
  if (!date || date === 'Never') return 0;
  const days = Math.max(0, (Date.now() - new Date(date).getTime()) / 86_400_000);
  return Math.pow(0.5, days / 730);
}

function evidenceConfidence(skill: EmployeeSkill | undefined): number {
  if (!skill) return 0;
  const evidence = skill.evidenceList || [];
  const current = evidence.filter(item => !item.expired);
  if (evidence.length && !current.length) return 0;
  if (!current.length) return Math.max(0, Math.min(1, (skill.confidenceScore || (skill.evidenceCount ? 30 : 0)) / 100));
  const trust = current.map(item => {
    const source = item.type === 'SelfDeclared' ? 0.3 : item.verificationSource.toLowerCase().includes('resume') ? 0.6 : item.verified ? 1 : 0.3;
    return source * recencyFactor(item.date);
  });
  const confidence = 1 - trust.reduce((remaining, value) => remaining * (1 - value), 1);
  return Math.min(1, confidence);
}

function isMentorEligible(employee: Employee, skillId: string): boolean {
  return employee.skills.some(skill => skill.skillId === skillId && levelNumber(skill.proficiencyLevel) >= 4) && employee.currentWorkloadPercent < MENTOR_MAX_WORKLOAD;
}

export function analyzeRoleGap(
  employee: Employee,
  role: MarketplaceRole,
  requirements: RoleRequirement[],
  resources: LearningResourceRow[],
  employees: Employee[],
  progress: ProgressRow[] = [],
  taxonomy: SkillTaxonomy[] = []
): RoleGapAnalysis {
  const roleRequirements = requirements.filter(item => item.role_id === role.id);
  const breakdown: ReadinessItem[] = roleRequirements.map(requirement => {
    const skill = employee.skills.find(item => item.skillId === requirement.skill_id);
    const currentLevel = skill?.proficiencyLevel || 'Missing';
    const required = levelNumber(requirement.required_level);
    const confidence = evidenceConfidence(skill);
    let credit = Math.min(levelNumber(currentLevel), required) / Math.max(1, required) * confidence;

    // Active learning progress directly contributes to closing skill gaps and increasing readiness
    if (progress && progress.length > 0) {
      const skillResourceIds = new Set(resources.filter(r => r.skill_id === requirement.skill_id).map(r => r.resource_id));
      const activeProg = progress.find(p =>
        (p.employee_id === employee.id || (p.employee_id && employee.id && (p.employee_id.includes(employee.id) || employee.id.includes(p.employee_id)))) &&
        p.role_id === role.id &&
        skillResourceIds.has(p.resource_id)
      );
      if (activeProg) {
        const pct = Number(activeProg.progress_percent || 0);
        if (activeProg.status.toLowerCase() === 'done' || pct >= 100) {
          credit = Math.max(credit, 1.0);
        } else if (pct > 0) {
          credit = Math.max(credit, (pct / 100) * 0.9);
        }
      }
    }

    return { skillId: requirement.skill_id, skillName: role.requiredSkills.find(item => item.skillId === requirement.skill_id)?.skillName || skill?.skillName || requirement.skill_id, importance: requirement.importance, weight: WEIGHTS[requirement.importance], currentLevel, requiredLevel: requirement.required_level, evidenceConfidence: confidence, credit };
  });
  const weightTotal = breakdown.reduce((sum, item) => sum + item.weight, 0);
  const readinessPercent = weightTotal ? Math.round(100 * breakdown.reduce((sum, item) => sum + item.weight * item.credit, 0) / weightTotal) : 0;
  const gaps: SkillGap[] = breakdown.flatMap(item => {
    const current = employee.skills.find(skill => skill.skillId === item.skillId);
    const gapSize = Math.max(0, levelNumber(item.requiredLevel) - levelNumber(item.currentLevel));
    if (!gapSize) return [];
    const completedIds = new Set(progress.filter(row => row.employee_id === employee.id && row.role_id === role.id && (row.status.toLowerCase() === 'done' || Number(row.progress_percent) >= 100)).map(row => row.resource_id));
    const resource = resources.filter(candidate => {
      if (candidate.skill_id !== item.skillId || levelNumber(candidate.target_level) < levelNumber(item.requiredLevel) || completedIds.has(candidate.resource_id)) return false;
      if (candidate.type !== 'mentor') return true;
      const mentor = employees.find(person => person.id === candidate.mentor_employee_id);
      return Boolean(mentor && mentor.id !== employee.id && isMentorEligible(mentor, item.skillId));
    }).sort((a,b) => Number(a.duration_weeks) - Number(b.duration_weeks))[0];
    const mentorCandidate = resource?.mentor_employee_id ? employees.find(person => person.id === resource.mentor_employee_id && person.id !== employee.id && isMentorEligible(person, item.skillId)) : undefined;
    const taxonomySkill = taxonomy.find(skill => skill.id === item.skillId);
    const related = (taxonomySkill?.relatedSkills || []).map(id => employee.skills.find(skill => skill.skillId === id && levelNumber(skill.proficiencyLevel) >= 3)).filter(Boolean);
    const transferableSkillNote = related.length ? `Related Advanced skill${related.length > 1 ? 's' : ''} ${related.map(skill => skill!.skillName).join(', ')} may shorten learning time.` : undefined;
    const verifiedEvidenceCount = current?.evidenceList.filter(evidence => evidence.verified && !evidence.expired).length || 0;
    const evidenceCount = current?.evidenceList.filter(evidence => !evidence.expired).length || 0;
    const lastUsedDate = current?.lastUsedDate || 'Never';
    const currentLabel = item.currentLevel === 'Missing' ? 'no recorded level' : `current level ${item.currentLevel}`;
    const explanation = `${currentLabel}; ${evidenceCount} active evidence item${evidenceCount === 1 ? '' : 's'} (${verifiedEvidenceCount} verified); last used ${lastUsedDate}.`;
    return [{ skillId: item.skillId, skillName: item.skillName, currentLevel: item.currentLevel, requiredLevel: item.requiredLevel, gapSize, importance: item.importance, evidenceCount, verifiedEvidenceCount, lastUsedDate, explanation, transferableSkillNote, resource, mentor: mentorCandidate }];
  });
  const roleMust = breakdown.filter(item => item.importance === 'Must');
  const mustGaps = gaps.filter(gap => gap.importance === 'Must');
  const qualified = roleMust.every(item => levelNumber(item.currentLevel) >= levelNumber(item.requiredLevel));
  const missingMustCount = mustGaps.filter(gap => gap.currentLevel === 'Missing').length;
  const nearQualified = !qualified && mustGaps.length > 0 && readinessPercent >= 60 && gaps.length <= 2 && missingMustCount <= 2 && mustGaps.every(gap => gap.currentLevel === 'Missing' || gap.gapSize <= 1);
  const status: ReadinessStatus = qualified ? 'Qualified' : nearQualified ? 'Near-Qualified' : 'Not Ready';
  const verifiedCount = breakdown.reduce((sum,item) => sum + (employee.skills.find(skill => skill.skillId === item.skillId)?.evidenceList.filter(proof => proof.verified && !proof.expired).length || 0), 0);
  const confidenceLabel = verifiedCount >= 4 ? 'High' : verifiedCount >= 2 ? 'Medium' : 'Low';
  const prerequisiteIds = new Set<string>();
  gaps.forEach(gap => (taxonomy.find(skill => skill.id === gap.skillId)?.relatedSkills || []).forEach(id => {
    const prerequisite = employee.skills.find(skill => skill.skillId === id);
    if (!prerequisite || levelNumber(prerequisite.proficiencyLevel) < 3) prerequisiteIds.add(id);
  }));
  const weeklyImpact = (gap: SkillGap) => WEIGHTS[gap.importance] * gap.gapSize / Math.max(1, levelNumber(gap.requiredLevel)) / Math.max(1, Number(gap.resource?.duration_weeks || Infinity));
  gaps.sort((a,b) => Number(prerequisiteIds.has(b.skillId)) - Number(prerequisiteIds.has(a.skillId)) || weeklyImpact(b) - weeklyImpact(a));
  const weeklyFreeHours = Math.max(1, employee.hoursPerWeekFree || employee.availabilityPercent * 0.4);
  const readyWeeksExact = gaps.reduce((sum,gap) => sum + Number(gap.resource?.duration_weeks || 0) * STANDARD_LEARNING_HOURS / weeklyFreeHours, 0);
  const readyInWeeks = Math.ceil(readyWeeksExact);
  const readyInWeeksRange = readyWeeksExact <= 0 ? '0 weeks' : `${Math.max(1, Math.floor(readyWeeksExact))}-${Math.max(2, Math.ceil(readyWeeksExact) + 1)} weeks`;
  return { employee, role, readinessPercent, confidenceLabel, breakdown, gaps, readyInWeeks, readyInWeeksRange, nearQualified, status, overloaded: employee.currentWorkloadPercent >= MENTOR_MAX_WORKLOAD };
}

export function analyzeEmployeesForRole(employees: Employee[], role: MarketplaceRole, requirements: RoleRequirement[], resources: LearningResourceRow[], progress: ProgressRow[] = [], taxonomy: SkillTaxonomy[] = []): RoleGapAnalysis[] {
  const uniqueEmployees = [...new Map(employees.map(employee => [employee.id, employee])).values()];
  return uniqueEmployees.map(employee => analyzeRoleGap(employee, role, requirements, resources, uniqueEmployees, progress, taxonomy));
}

export function analyzeAllEmployees(employees: Employee[], role: MarketplaceRole, requirements: RoleRequirement[], resources: LearningResourceRow[], progress: ProgressRow[] = [], taxonomy: SkillTaxonomy[] = []): RoleGapAnalysis[] {
  return analyzeEmployeesForRole(employees, role, requirements, resources, progress, taxonomy).filter(result => result.status === 'Near-Qualified')
    .sort((a,b) => b.readinessPercent - a.readinessPercent || Number(a.overloaded) - Number(b.overloaded) || b.employee.availabilityPercent - a.employee.availabilityPercent || a.employee.currentWorkloadPercent - b.employee.currentWorkloadPercent);
}

export function skillShortages(employees: Employee[], roles: MarketplaceRole[], requirements: RoleRequirement[]): { skillId: string; skillName: string; shortage: number }[] {
  const needed = requirements.filter(item => roles.some(role => role.id === item.role_id && role.requiredSkills.length));
  return Object.values(needed.reduce<Record<string, { skillId: string; skillName: string; shortage: number }>>((summary, requirement) => {
    const skillName = roles.flatMap(role => role.requiredSkills).find(skill => skill.skillId === requirement.skill_id)?.skillName || requirement.skill_id;
    const qualified = employees.filter(employee => { const skill = employee.skills.find(item => item.skillId === requirement.skill_id); return skill && levelNumber(skill.proficiencyLevel) >= levelNumber(requirement.required_level); }).length;
    summary[requirement.skill_id] ||= { skillId: requirement.skill_id, skillName, shortage: 0 };
    summary[requirement.skill_id].shortage += Math.max(0, employees.length - qualified);
    return summary;
  }, {})).sort((a,b) => b.shortage - a.shortage);
}
