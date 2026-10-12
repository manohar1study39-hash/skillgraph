import { Employee, EmployeeSkill, EvidenceItem, MarketplaceRole, SkillTaxonomy } from '../types';
import { computeAllDisplayLabels } from '../utils/employeeDisplay';

export interface DataFiles {
  employees: string;
  skills: string;
  employeeSkills: string;
  evidence: string;
  projects: string;
  employeeProjects: string;
  certifications: string;
  roles: string;
  roleSkills: string;
  learningResources: string;
  upskillingProgress: string;
  projectShortlists: string;
}

export interface SkillGraphData extends DataFiles {
  employeesData: Employee[];
  skillsData: SkillTaxonomy[];
  rolesData: MarketplaceRole[];
  records: Record<keyof DataFiles, Record<string, string>[]>;
}

const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Master'] as const;
const SOURCE_WEIGHT: Record<string, number> = { github: 1, certification: 1, certification_evidence: 1, resume: 0.6, self: 0.3 };

export function parseCSV(csvText: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < csvText.length; i++) {
    const c = csvText[i];
    if (quoted && c === '"' && csvText[i + 1] === '"') { field += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && csvText[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift()!.map(value => value.trim());
  return rows.filter(values => values.some(value => value.trim())).map(values => Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()])));
}

function validateRelations(records: Record<keyof DataFiles, Record<string, string>[]>): void {
  const employeeIds = new Set(records.employees.map(row => row.employee_id));
  const skillIds = new Set(records.skills.map(row => row.skill_id));
  const roleIds = new Set(records.roles.map(row => row.role_id));
  const projectIds = new Set(records.projects.map(row => row.project_id));
  const resourceIds = new Set(records.learningResources.map(row => row.resource_id));
  const allProjectAndRoleIds = new Set([...projectIds, ...roleIds]);

  // Gracefully prune any orphaned records from dependent tracking files to ensure system resilience
  records.upskillingProgress = records.upskillingProgress.filter(
    row => (!row.employee_id || employeeIds.has(row.employee_id)) && (!row.role_id || roleIds.has(row.role_id)) && (!row.resource_id || resourceIds.has(row.resource_id))
  );
  records.projectShortlists = records.projectShortlists.filter(
    row => (!row.employee_id || employeeIds.has(row.employee_id))
  );
  records.employeeSkills = records.employeeSkills.filter(
    row => (!row.employee_id || employeeIds.has(row.employee_id)) && (!row.skill_id || skillIds.has(row.skill_id))
  );
  records.employeeProjects = records.employeeProjects.filter(
    row => (!row.employee_id || employeeIds.has(row.employee_id)) && (!row.project_id || allProjectAndRoleIds.has(row.project_id))
  );
  records.certifications = records.certifications.filter(
    row => (!row.employee_id || employeeIds.has(row.employee_id)) && (!row.skill_id || skillIds.has(row.skill_id))
  );
  records.evidence = records.evidence.filter(
    row => (!row.employee_id || employeeIds.has(row.employee_id)) && (!row.skill_id || skillIds.has(row.skill_id))
  );

  const checks: [keyof DataFiles, string, Set<string>][] = [
    ['employeeSkills', 'employee_id', employeeIds], ['employeeSkills', 'skill_id', skillIds],
    ['evidence', 'employee_id', employeeIds], ['evidence', 'skill_id', skillIds], ['evidence', 'project_id', projectIds],
    ['employeeProjects', 'employee_id', employeeIds], ['employeeProjects', 'project_id', allProjectAndRoleIds],
    ['certifications', 'employee_id', employeeIds], ['certifications', 'skill_id', skillIds],
    ['roleSkills', 'role_id', roleIds], ['roleSkills', 'skill_id', skillIds],
    ['learningResources', 'skill_id', skillIds], ['learningResources', 'mentor_employee_id', employeeIds],
    ['upskillingProgress', 'employee_id', employeeIds], ['upskillingProgress', 'role_id', roleIds], ['upskillingProgress', 'resource_id', resourceIds],
    ['projectShortlists', 'project_id', allProjectAndRoleIds], ['projectShortlists', 'employee_id', employeeIds]
  ];
  const errors = checks.flatMap(([file, field, valid]) => records[file].filter(row => row[field] && !valid.has(row[field])).map(row => `${file}.${field} references unknown id ${row[field]}`));
  records.learningResources.filter(row => row.mentor_employee_id).forEach(resource => {
    const mentorHasExpertise = records.employeeSkills.some(row => row.employee_id === resource.mentor_employee_id && row.skill_id === resource.skill_id && ['Expert', 'Master'].includes(row.proficiency_level));
    if (!mentorHasExpertise) {
      resource.mentor_employee_id = '';
    }
  });
  if (errors.length) throw new Error(`CSV data validation failed: ${errors.slice(0, 8).join('; ')}`);
  const duplicateEmails = records.employees.map(row => row.email.toLowerCase()).filter((email, index, all) => all.indexOf(email) !== index);
  if (duplicateEmails.length) throw new Error(`CSV data validation failed: duplicate employee email ${duplicateEmails[0]}`);
}

function estimateLevel(rows: Record<string, string>[], evidence: Record<string, string>[], declared: Record<string, string>): { level: typeof LEVELS[number]; score: number } {
  const matching = evidence.filter(item => item.employee_id === declared.employee_id && item.skill_id === declared.skill_id);
  const declaredWeight = SOURCE_WEIGHT[declared.source] || 0.3;
  const items = matching.length ? matching.map(item => {
    const isHrVerified = item.verification_status === 'Verified by HR' || item.verification_status === 'Link checked';
    const verified = isHrVerified || (['PR', 'commit', 'cert', 'code_review', 'project', 'feedback'].includes(item.evidence_type) && Number(item.weight || 1) >= 1);
    const days = Math.max(0, (Date.now() - new Date(item.date).getTime()) / 86400000);
    const recency = Math.pow(0.5, days / 365);
    const project = Number(item.project_complexity || 3);
    const effectiveWeight = isHrVerified ? Math.max(1.0, Number(item.weight || 1)) : Math.max(0.1, Number(item.weight || 1));
    return effectiveWeight * (verified ? 1.5 : 0.5) * recency * (0.6 + project / 10);
  }) : [declaredWeight * Math.pow(0.5, Math.max(0, (Date.now() - new Date(declared.last_used_date).getTime()) / 86400000) / 730)];
  const proofScore = Math.min(1, items.reduce((sum, value) => sum + value, 0) / 3);
  const years = Math.min(1, Number(declared.years_experience || 0) / 8) * declaredWeight * 0.35;
  const score = Math.round(Math.min(100, proofScore * 75 + years * 100));
  const index = score >= 88 ? 4 : score >= 70 ? 3 : score >= 50 ? 2 : score >= 28 ? 1 : 0;
  return { level: LEVELS[index], score: Math.max(15, score) };
}

export function loadInitialDataFromCSV(rawCSVs?: DataFiles): SkillGraphData {
  const paths: Record<keyof DataFiles, string> = {
    employees: 'employees.csv', skills: 'skills.csv', employeeSkills: 'employee_skills.csv', evidence: 'evidence.csv',
    projects: 'projects.csv', employeeProjects: 'employee_projects.csv', certifications: 'certifications.csv', roles: 'roles.csv',
    roleSkills: 'role_skills.csv', learningResources: 'learning_resources.csv', upskillingProgress: 'upskilling_progress.csv', projectShortlists: 'project_shortlists.csv'
  };
  if (!rawCSVs) throw new Error(`CSV data must be loaded through /api/data (${Object.values(paths).join(', ')}).`);
  const files = rawCSVs;
  const records = Object.fromEntries(Object.entries(files).map(([key, value]) => [key, parseCSV(value)])) as SkillGraphData['records'];
  validateRelations(records);
  const skillsData: SkillTaxonomy[] = records.skills.map(row => ({
    id: row.skill_id, name: row.skill_name, category: row.category,
    synonyms: (row.synonyms || row.skill_name).split('|').filter(Boolean),
    relatedSkills: (row.related_skill_ids || '').split('|').filter(Boolean), associatedDomains: [row.domain], domain: row.domain
  }));
  const evidenceBySkill = records.evidence.reduce<Record<string, Record<string, string>[]>>((acc, row) => {
    const key = `${row.employee_id}:${row.skill_id}`; (acc[key] ||= []).push(row); return acc;
  }, {});
  const certificationBySkill = records.certifications.reduce<Record<string, Record<string, string>[]>>((acc, row) => {
    const key = `${row.employee_id}:${row.skill_id}`; (acc[key] ||= []).push(row); return acc;
  }, {});
  const declaredByEmployee = records.employeeSkills.reduce<Record<string, Record<string, string>[]>>((acc, row) => { (acc[row.employee_id] ||= []).push(row); return acc; }, {});
  const skillById = new Map(skillsData.map(skill => [skill.id, skill]));
  const employeesData: Employee[] = computeAllDisplayLabels(records.employees.map(row => {
    const skills: EmployeeSkill[] = (declaredByEmployee[row.employee_id] || []).map(declared => {
      const skill = skillById.get(declared.skill_id)!;
      const key = `${row.employee_id}:${declared.skill_id}`;
      const certRows = certificationBySkill[key] || [];
      const activeCertRows = certRows.filter(cert => !cert.expiry_date || cert.expiry_date >= new Date().toISOString().slice(0, 10));
      const expiredOnlyCertification = declared.source === 'certification' && certRows.length > 0 && activeCertRows.length === 0;
      const seenTitlesInKey = new Set<string>();
      const evidenceRows = (evidenceBySkill[key] || [])
        .filter(item => item.is_duplicate !== '1' && item.is_duplicate !== 'true' && !item.deleted_at)
        .filter(item => item.evidence_type !== 'cert' || !certRows.length || activeCertRows.length > 0)
        .filter(item => {
          const normTitle = (item.title || '').replace(/^App\s+/, '').replace(/\s+\d{10,14}$/, '').trim().toLowerCase();
          if (seenTitlesInKey.has(normTitle)) return false;
          seenTitlesInKey.add(normTitle);
          return true;
        });
      const estimated = expiredOnlyCertification ? { level: 'Beginner' as const, score: 0 } : estimateLevel([], evidenceRows, declared);
      const evidenceList: EvidenceItem[] = [...evidenceRows.map(item => {
        const cleanTitle = (item.title || '').replace(/^App\s+/, '').replace(/\s+\d{10,14}$/, '').trim();
        const isHrVerified = item.verification_status === 'Verified by HR' || item.verification_status === 'Link checked';
        const isVerified = isHrVerified || (['PR', 'commit', 'cert', 'code_review', 'project', 'feedback'].includes(item.evidence_type) && Number(item.weight || 1) >= 1);
        return {
          id: item.evidence_id,
          title: cleanTitle,
          type: (item.evidence_type === 'cert' ? 'Certification' : item.evidence_type === 'feedback' ? 'Feedback' : item.evidence_type === 'code_review' ? 'CodeReview' : 'Project') as EvidenceItem['type'],
          date: item.date,
          weightMultiplier: isHrVerified ? 1.0 : Number(item.weight || 1),
          description: cleanTitle,
          complexityScore: Number(item.project_complexity || 3),
          verificationSource: isHrVerified ? 'Verified by HR' : (declared.source === 'resume' ? 'resume' : item.url || item.evidence_type),
          verificationStatus: item.verification_status || (isVerified ? 'Verified by HR' : 'Self-reported'),
          verified: isVerified,
          prsMerged: item.evidence_type === 'PR' ? 1 : undefined
        };
      }), ...certRows.map(cert => ({ id: cert.cert_id, title: cert.cert_name, type: 'Certification' as const, date: cert.issued_date || declared.last_used_date, weightMultiplier: 1, description: `${cert.issuer || 'Certification'}${cert.expiry_date ? ` · Expires ${cert.expiry_date}` : ''}`, complexityScore: 3, verificationSource: cert.issuer || 'Certification registry', verified: true, verificationStatus: 'Verified by HR', expired: Boolean(cert.expiry_date && cert.expiry_date < new Date().toISOString().slice(0, 10)) }))];
      const confidenceItems = evidenceList.filter(item => !item.expired).map(item => {
        const trust = item.verificationSource.toLowerCase().includes('resume') ? 0.6 : item.type === 'SelfDeclared' || !item.verified ? 0.3 : 1;
        const days = Math.max(0, (Date.now() - new Date(item.date).getTime()) / 86400000);
        return trust * Math.pow(0.5, days / 730);
      });
      const evidenceConfidence = expiredOnlyCertification ? 0 : confidenceItems.length ? 1 - confidenceItems.reduce((remaining, value) => remaining * (1 - value), 1) : SOURCE_WEIGHT[declared.source] * Math.pow(0.5, Math.max(0, (Date.now() - new Date(declared.last_used_date).getTime()) / 86400000) / 730);
      const activeEvidenceList = evidenceList.filter(item => !item.expired);

      const canonicalLevel: typeof LEVELS[number] = expiredOnlyCertification
        ? ('Beginner' as const)
        : (declared.proficiency_level && LEVELS.includes(declared.proficiency_level as any))
          ? (declared.proficiency_level as typeof LEVELS[number])
          : estimated.level;

      const baseScoreForLevel: Record<string, number> = {
        Master: 92,
        Expert: 78,
        Advanced: 58,
        Intermediate: 38,
        Beginner: 20
      };
      const minScoreForLevel = baseScoreForLevel[canonicalLevel] || 20;

      const canonicalScore = expiredOnlyCertification
        ? 0
        : declared.score && !isNaN(Number(declared.score))
          ? Number(declared.score)
          : Math.max(estimated.score, minScoreForLevel);

      return {
        skillId: skill.id,
        skillName: skill.name,
        category: skill.category,
        proficiencyScore: canonicalScore,
        proficiencyLevel: canonicalLevel,
        evidenceCount: activeEvidenceList.length,
        lastUsedDate: declared.last_used_date,
        confidenceScore: Math.round(Math.min(1, evidenceConfidence) * 100),
        evidenceList: activeEvidenceList,
        isPrimary: ['Expert', 'Master'].includes(canonicalLevel),
        verified: (declared && (declared.verification_status === 'Verified by HR' || declared.verification_status === 'Link checked')) || activeEvidenceList.some(e => e.verified),
        verificationStatus: (declared && declared.verification_status) || (activeEvidenceList.some(e => e.verificationStatus === 'Verified by HR') ? 'Verified by HR' : 'Self-reported')
      };
    });
    const projects = records.employeeProjects.filter(project => project.employee_id === row.employee_id).map(project => records.projects.find(item => item.project_id === project.project_id)?.project_name || project.project_id);
    const yearsExperience = Math.max(0, (Date.now() - new Date(row.hire_date).getTime()) / (365.25 * 86400000));
    return { id: row.employee_id, name: row.name, avatar: '', role: row.title, team: row.team, department: row.department,
      location: row.location, email: row.email, availabilityPercent: Number(row.availability_percent), currentWorkloadPercent: Number(row.current_workload_percent || 100 - Number(row.availability_percent)), hoursPerWeekFree: Number(row.hours_per_week_free || 0), bio: `${row.title} in ${row.department}`,
      yearsExperience: Math.round(yearsExperience), skills, topProjects: projects, certifications: records.certifications.filter(cert => cert.employee_id === row.employee_id && (!cert.expiry_date || cert.expiry_date >= new Date().toISOString().slice(0, 10))).map(cert => cert.cert_name),
      score: row.score ? Number(row.score) : undefined,
      level: row.level || undefined,
      version: row.version ? Number(row.version) : 1
    };
  }));
  const rolesData: MarketplaceRole[] = records.roles.map(role => {
    const requiredSkills = records.roleSkills.filter(item => item.role_id === role.role_id).map(item => ({ skillId: item.skill_id, skillName: skillById.get(item.skill_id)?.name || item.skill_id, level: item.required_level as EmployeeSkill['proficiencyLevel'] }));
    return { id: role.role_id, title: role.role_title, department: role.department, location: 'Remote / Hybrid', team: role.department,
      commitment: `${role.min_availability_percent}% Min Availability`, requiredSkills, description: `Opening requiring ${requiredSkills.map(item => item.skillName).join(', ')}.`,
      postedDate: '', applicantsCount: 0, nearQualifiedMatchesCount: 0, status: role.status as 'Open' | 'Closed', priority: role.priority as 'Normal' | 'Priority' };
  });
  return { ...files, employeesData, skillsData, rolesData, records };
}

export let CSV_DATA: SkillGraphData;

export async function fetchInitialData(): Promise<SkillGraphData> {
  const response = await fetch('/api/data', { credentials: 'same-origin' });
  if (!response.ok) throw new Error(response.status === 401 ? 'Your session has expired.' : 'Unable to load company data.');
  CSV_DATA = loadInitialDataFromCSV(await response.json() as DataFiles);
  return CSV_DATA;
}
