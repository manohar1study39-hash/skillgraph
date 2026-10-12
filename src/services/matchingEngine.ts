import type { CandidateMatchResult, Employee, ProficiencyLevel, SkillTaxonomy } from '../types';
import { LEVEL_ORDER } from './upskillingEngine';

export interface ParsedQueryChips {
  skills: string[];
  niceToHaveSkills: string[];
  minProficiency: ProficiencyLevel;
  minAvailability: number;
  location: string;
  domain: string;
  minYearsExperience: number;
  personName?: string;
  roleTitle?: string;
}

export interface SkillTarget {
  skillId?: string;
  skillName: string;
  requiredLevel: ProficiencyLevel;
  importance: 'Must' | 'Nice';
}

// ── String normalization & fuzzy matching ────────────────────────────────────

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

export function similar(a: string, b: string): boolean {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const minLen = Math.min(left.length, right.length);
  const maxLen = Math.max(left.length, right.length);

  // Short tokens (under 4 characters) must match exactly to prevent false positives
  // like "ai" matching "Tailwind" or "go" matching "algorithm"
  if (minLen < 4) {
    return left === right;
  }

  // Meaningful substring match: the shorter token must make up at least 55% of the longer token
  // e.g. "postgres" (8) in "postgresql" (10) = 80% (valid)
  if (left.includes(right) || right.includes(left)) {
    if (minLen / maxLen >= 0.55) return true;
  }

  // Levenshtein distance for typos on tokens >= 5 characters
  if (minLen >= 5) {
    const maxDist = minLen <= 6 ? 1 : 2;
    return levenshtein(left, right) <= maxDist;
  }

  return false;
}

// ── Role / concept → skill expansion map ─────────────────────────────────────

interface RoleEntry {
  pattern: RegExp;
  must: string[];
  nice: string[];
  roleTitle?: string;
  proficiency?: ProficiencyLevel;
}

const ROLE_CONCEPT_MAP: RoleEntry[] = [
  { pattern: /\b(full[- ]?stack|fullstack)\b/i,                 must: ['React', 'Node.js'],               nice: ['TypeScript', 'PostgreSQL'],                        proficiency: 'Intermediate', roleTitle: 'Fullstack' },
  { pattern: /\b(front[- ]?end|frontend|ui engineer|ui dev)\b/i,must: ['React'],                          nice: ['TypeScript', 'Tailwind CSS'],                      proficiency: 'Intermediate', roleTitle: 'Frontend' },
  { pattern: /\b(back[- ]?end|backend|server[- ]?side)\b/i,     must: ['Node.js'],                        nice: ['Python', 'PostgreSQL', 'GraphQL'],                 proficiency: 'Intermediate', roleTitle: 'Backend' },
  { pattern: /\b(cloud|platform)\s*(engineer|architect)?\b/i,   must: ['AWS Cloud'],                      nice: ['Docker & Kubernetes', 'Python'],                   proficiency: 'Advanced',     roleTitle: 'Cloud' },
  { pattern: /\b(devops|sre|site[- ]?reliability)\b/i,          must: ['Docker & Kubernetes'],            nice: ['AWS Cloud', 'Python'],                             proficiency: 'Intermediate', roleTitle: 'DevOps' },
  { pattern: /\b(ml|machine[- ]?learning|ai engineer)\b/i,      must: ['Python'],                         nice: ['PostgreSQL'],                                      proficiency: 'Advanced',     roleTitle: 'Machine Learning' },
  { pattern: /\b(data engineer|etl|data pipeline)\b/i,          must: ['Python', 'PostgreSQL'],           nice: ['GraphQL'],                                         proficiency: 'Intermediate', roleTitle: 'Data' },
  { pattern: /\b(security|cybersecurity|appsec|devsecops)\b/i,  must: ['Fintech & Payment Security'],     nice: ['AWS Cloud'],                                       proficiency: 'Advanced',     roleTitle: 'Security' },
  { pattern: /\b(payment|fintech|pci|banking)\b/i,              must: ['Fintech & Payment Security'],     nice: ['Node.js', 'PostgreSQL'],                           proficiency: 'Intermediate', roleTitle: 'Fintech' },
];

const PROFICIENCY_PATTERNS: Array<[RegExp, ProficiencyLevel]> = [
  [/\b(master|principal|distinguished)\b/i, 'Master'],
  [/\b(expert|lead|staff|architect|guru)\b/i, 'Expert'],
  [/\b(senior|advanced|sr\.?)\b/i, 'Advanced'],
  [/\b(mid[- ]?level|intermediate)\b/i, 'Intermediate'],
  [/\b(junior|jr\.?|entry[- ]?level|beginner)\b/i, 'Beginner'],
];

const AVAILABILITY_PATTERNS: Array<[RegExp, number]> = [
  [/\b(100%|full[- ]?time|completely free)\b/i, 100],
  [/\b(75\s*%|mostly available)\b/i, 75],
  [/\b(50\s*%|half[- ]?time|part[- ]?time|high availability|highly available|available now)\b/i, 50],
];

const LOCATION_PATTERNS: Array<[RegExp, string]> = [
  [/san francisco|\bsf\b/i, 'San Francisco, CA'],
  [/\baustin\b/i, 'Austin, TX'],
  [/\bseattle\b/i, 'Seattle, WA'],
  [/\bremote\b/i, 'Remote'],
  [/new york|nyc\b/i, 'New York, NY'],
  [/chicago\b/i, 'Chicago, IL'],
];

const EXP_PATTERN = /(\d+)\+?\s*years?\s*(of\s*)?(experience|exp)/i;

// ── Main Natural Language Query Parser ──────────────────────────────────────

export function parseNaturalQueryAdvanced(
  rawQuery: string,
  taxonomy: SkillTaxonomy[],
  knownEmployees: Employee[] = []
): ParsedQueryChips {
  if (!rawQuery.trim()) {
    return {
      skills: [],
      niceToHaveSkills: [],
      minProficiency: 'Intermediate',
      minAvailability: 0,
      location: 'Any',
      domain: 'Any',
      minYearsExperience: 0
    };
  }

  const cleanQuery = rawQuery.trim();
  const lower = cleanQuery.toLowerCase();

  // 1. Detect person name if mentioned (e.g. "Alex Chen", "Sarah Jenkins")
  let detectedPersonName: string | undefined;
  for (const emp of knownEmployees) {
    const empLower = emp.name.toLowerCase();
    if (lower.includes(empLower)) {
      detectedPersonName = emp.name;
      break;
    }
  }

  // 2. Proficiency detection
  let minProficiency: ProficiencyLevel = 'Intermediate';
  for (const [pat, level] of PROFICIENCY_PATTERNS) {
    if (pat.test(cleanQuery)) {
      minProficiency = level;
      break;
    }
  }

  // 3. Availability detection
  let minAvailability = 0;
  for (const [pat, pct] of AVAILABILITY_PATTERNS) {
    if (pat.test(cleanQuery)) {
      minAvailability = pct;
      break;
    }
  }

  // 4. Location detection
  let location = 'Any';
  for (const [pat, loc] of LOCATION_PATTERNS) {
    if (pat.test(cleanQuery)) {
      location = loc;
      break;
    }
  }

  // 5. Years of experience detection
  const expMatch = EXP_PATTERN.exec(cleanQuery);
  const minYearsExperience = expMatch ? parseInt(expMatch[1], 10) : 0;

  // 6. Role concept expansion
  const mustFromRoles = new Set<string>();
  const niceFromRoles = new Set<string>();
  let detectedRoleTitle: string | undefined;

  for (const entry of ROLE_CONCEPT_MAP) {
    if (entry.pattern.test(cleanQuery)) {
      entry.must.forEach(s => mustFromRoles.add(s));
      entry.nice.forEach(s => niceFromRoles.add(s));
      if (entry.roleTitle && !detectedRoleTitle) detectedRoleTitle = entry.roleTitle;
      if (entry.proficiency && LEVEL_ORDER.indexOf(entry.proficiency) > LEVEL_ORDER.indexOf(minProficiency)) {
        minProficiency = entry.proficiency;
      }
    }
  }

  // 7. Direct skill matching from taxonomy
  const matchedSkills = new Map<string, 'Must' | 'Nice'>();
  for (const skill of taxonomy) {
    const aliases = [skill.name, ...skill.synonyms].filter(Boolean);
    let matched = false;
    for (const alias of aliases) {
      const phrase = alias.toLowerCase().trim();
      if (!phrase || phrase.length < 2) continue;

      // Short tokens (<= 3 chars, e.g. "ts", "py", "aws", "k8s"): strict word boundary
      if (phrase.length <= 3) {
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
        if (regex.test(cleanQuery)) {
          matched = true;
          break;
        }
        continue;
      }

      // Word boundary or substring for >= 4 chars
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
      if (regex.test(cleanQuery) || lower.includes(phrase)) {
        matched = true;
        break;
      }

      // Fuzzy match tokens (e.g. "reakt" -> "react", "kubernets" -> "kubernetes")
      const words = lower.match(/[a-z0-9.+#-]+/g) || [];
      const skillTokens = phrase.split(/[\s&/+,.-]+/).filter(t => t.length >= 4);
      if (skillTokens.some(st => words.some(w => w.length >= 4 && similar(st, w)))) {
        matched = true;
        break;
      }
    }

    if (matched) {
      const inMust = [...mustFromRoles].some(s => similar(s, skill.name));
      const inNice = [...niceFromRoles].some(s => similar(s, skill.name));
      matchedSkills.set(skill.name, inNice && !inMust ? 'Nice' : 'Must');
    }
  }

  // Add role expansion skills not already caught
  for (const mustSkill of mustFromRoles) {
    if (![...matchedSkills.keys()].some(k => similar(k, mustSkill))) {
      const found = taxonomy.find(s => similar(s.name, mustSkill) || s.synonyms.some(syn => similar(syn, mustSkill)));
      if (found) matchedSkills.set(found.name, 'Must');
    }
  }
  for (const niceSkill of niceFromRoles) {
    if (![...matchedSkills.keys()].some(k => similar(k, niceSkill))) {
      const found = taxonomy.find(s => similar(s.name, niceSkill) || s.synonyms.some(syn => similar(syn, niceSkill)));
      if (found && !matchedSkills.has(found.name)) matchedSkills.set(found.name, 'Nice');
    }
  }

  // Detected Domain (flexible match against taxonomy domain strings)
  let detectedDomain = 'Any';
  const allDomains = [...new Set(taxonomy.flatMap(s => s.associatedDomains))];
  for (const dom of allDomains) {
    if (new RegExp(dom.replace(/[^a-z0-9]/gi, '.*'), 'i').test(cleanQuery)) {
      detectedDomain = dom;
      break;
    }
  }

  const skills = [...matchedSkills.entries()].filter(([, i]) => i === 'Must').map(([n]) => n);
  const niceToHaveSkills = [...matchedSkills.entries()].filter(([, i]) => i === 'Nice').map(([n]) => n);

  return {
    skills,
    niceToHaveSkills,
    minProficiency,
    minAvailability,
    location,
    domain: detectedDomain,
    minYearsExperience,
    personName: detectedPersonName,
    roleTitle: detectedRoleTitle,
  };
}

// ── Candidate Ranking Engine ────────────────────────────────────────────────

export function rankCandidatesForRequirements(
  employees: Employee[],
  targets: SkillTarget[],
  taxonomy: SkillTaxonomy[],
  filters?: Partial<ParsedQueryChips>
): CandidateMatchResult[] {
  const results = employees.map(employee => {
    let earned = 0;
    let possible = 0;
    let verifiedTotal = 0;
    const matchingSkills: CandidateMatchResult['matchingSkills'] = [];
    const skillGaps: CandidateMatchResult['skillGaps'] = [];

    for (const target of targets) {
      const taxonomySkill = taxonomy.find(
        skill => skill.id === target.skillId ||
                 similar(skill.name, target.skillName) ||
                 skill.synonyms.some(alias => similar(alias, target.skillName))
      );
      const held = employee.skills.find(
        skill => taxonomySkill ? skill.skillId === taxonomySkill.id : similar(skill.skillName, target.skillName)
      );

      const current = held?.proficiencyLevel || 'Beginner';
      const currentIndex = held ? LEVEL_ORDER.indexOf(current) : -1;
      const requiredIndex = Math.max(0, LEVEL_ORDER.indexOf(target.requiredLevel));
      const weight = target.importance === 'Must' ? 1.0 : 0.3;
      const confidence = held ? Math.max(0, Math.min(1, (held.confidenceScore || 0) / 100)) : 0;
      const levelCredit = held && currentIndex >= 0 ? Math.min(currentIndex + 1, requiredIndex + 1) / (requiredIndex + 1) : 0;
      const credit = levelCredit * (0.7 + confidence * 0.3);

      earned += weight * credit;
      possible += weight;

      const proofs = held?.evidenceList.filter(proof => proof.verified && !proof.expired) || [];
      verifiedTotal += proofs.length;

      matchingSkills.push({
        skillName: target.skillName,
        currentLevel: current,
        requiredLevel: target.requiredLevel,
        met: currentIndex >= requiredIndex,
        evidenceCount: proofs.length,
        lastUsed: held?.lastUsedDate || 'Never',
        evidenceConfidence: confidence,
        skillExists: Boolean(held),
        importance: target.importance
      });

      if (currentIndex < requiredIndex) {
        skillGaps.push({
          skillName: target.skillName,
          currentLevel: current,
          targetLevel: target.requiredLevel,
          severity: requiredIndex - currentIndex > 1 ? 'High' : 'Medium'
        });
      }
    }

    const readiness = possible > 0 ? earned / possible : 0;
    const mustGaps = matchingSkills.filter(s => s.importance === 'Must' && !s.met);
    const allMustMet = mustGaps.length === 0;
    const missingMustCount = mustGaps.filter(g => !g.skillExists).length;

    // Near-qualified condition: high readiness, <= 2 gaps, close to required levels
    const near = targets.length > 0 &&
      !allMustMet &&
      targets.some(t => t.importance === 'Must') &&
      skillGaps.length <= 2 &&
      readiness >= 0.5 &&
      missingMustCount <= 2 &&
      mustGaps.every(gap => !gap.skillExists || LEVEL_ORDER.indexOf(gap.requiredLevel as ProficiencyLevel) - LEVEL_ORDER.indexOf(gap.currentLevel as ProficiencyLevel) <= 1);

    const capacity = Math.max(0, Math.min(100, (employee.availabilityPercent + 100 - employee.currentWorkloadPercent) / 2));
    const evidenceBonus = Math.min(5, verifiedTotal);

    // Person name match bonus (if person name was explicitly detected)
    let nameBonus = 0;
    if (filters?.personName && employee.name.toLowerCase().includes(filters.personName.toLowerCase())) {
      nameBonus = 60;
    }

    // Role title match bonus
    let roleBonus = 0;
    if (filters?.roleTitle && employee.role.toLowerCase().includes(filters.roleTitle.toLowerCase())) {
      roleBonus = 12;
    }

    let finalScore = 0;
    if (targets.length > 0) {
      const baseSkillScore = readiness * 75 + (capacity / 100) * 20 + evidenceBonus;
      finalScore = Math.min(99, Math.max(0, Math.round(baseSkillScore + nameBonus + roleBonus)));
    } else {
      if (nameBonus > 0) {
        finalScore = Math.min(99, 85 + Math.round((employee.availabilityPercent / 100) * 10) + (employee.yearsExperience >= 3 ? 4 : 0));
      } else if (roleBonus > 0) {
        finalScore = Math.min(95, 70 + Math.round((employee.availabilityPercent / 100) * 20) + (employee.yearsExperience >= 3 ? 5 : 0));
      } else {
        finalScore = Math.round(employee.availabilityPercent * 0.7 + Math.min(10, employee.yearsExperience) * 2 + Math.min(10, employee.skills.length));
      }
    }

    const explanationParts: string[] = [];
    if (nameBonus > 0) {
      explanationParts.push(`Direct name match: ${employee.name}`);
    }
    if (targets.length > 0) {
      explanationParts.push(`Meets ${matchingSkills.filter(s => s.met).length} of ${targets.length} requested skill levels`);
      if (skillGaps.length) {
        explanationParts.push(`Gaps: ${skillGaps.map(g => `${g.skillName} (${g.currentLevel}→${g.targetLevel})`).join(', ')}`);
      } else {
        explanationParts.push('All requested skill levels are met');
      }
    }
    explanationParts.push(`${employee.availabilityPercent}% availability, ${employee.yearsExperience}y exp`);

    const newestEvidence = employee.skills.reduce((latest, skill) => skill.lastUsedDate > latest ? skill.lastUsedDate : latest, '');
    const activeRecently = newestEvidence && (Date.now() - new Date(newestEvidence).getTime()) / 86_400_000 <= 30;

    return {
      employee,
      overallMatchScore: finalScore,
      isNearQualified: near,
      matchingSkills,
      skillGaps,
      explanation: explanationParts.join('. ') + '.',
      recencyIndicator: activeRecently ? 'Active in last 30 days' : 'Evidence older than 30 days'
    };
  });

  return results.filter(result => {
    if (filters?.minAvailability && filters.minAvailability > 0) {
      if (result.employee.availabilityPercent < filters.minAvailability) return false;
    }
    if (filters?.location && filters.location !== 'Any') {
      if (filters.location === 'Remote') {
        if (!/remote/i.test(result.employee.location)) return false;
      } else if (result.employee.location !== filters.location) {
        return false;
      }
    }
    if (filters?.domain && filters.domain !== 'Any') {
      const relevant = taxonomy.some(skill => skill.associatedDomains.includes(filters.domain!) && result.employee.skills.some(held => held.skillId === skill.id));
      const inDept = result.employee.department.toLowerCase().includes(filters.domain!.toLowerCase()) || result.employee.team.toLowerCase().includes(filters.domain!.toLowerCase());
      if (!relevant && !inDept) return false;
    }
    if (filters?.minYearsExperience && filters.minYearsExperience > 0) {
      // Allow candidates within 1 year if they match all target skills, otherwise filter
      const gapAllowed = result.skillGaps.length === 0 ? 1 : 0;
      if (result.employee.yearsExperience + gapAllowed < filters.minYearsExperience) return false;
    }
    return true;
  }).sort((a, b) => b.overallMatchScore - a.overallMatchScore || b.employee.availabilityPercent - a.employee.availabilityPercent);
}

export function rankCandidatesAdvanced(
  employees: Employee[],
  parsed: ParsedQueryChips,
  taxonomy: SkillTaxonomy[]
): CandidateMatchResult[] {
  const mustTargets: SkillTarget[] = parsed.skills.map(name => {
    const skill = taxonomy.find(item => item.name === name || item.synonyms.some(alias => similar(alias, name)));
    return { skillId: skill?.id, skillName: skill?.name || name, requiredLevel: parsed.minProficiency, importance: 'Must' as const };
  });

  const niceTargets: SkillTarget[] = (parsed.niceToHaveSkills || []).map(name => {
    const skill = taxonomy.find(item => item.name === name || item.synonyms.some(alias => similar(alias, name)));
    return { skillId: skill?.id, skillName: skill?.name || name, requiredLevel: parsed.minProficiency, importance: 'Nice' as const };
  });

  const targets = [...mustTargets, ...niceTargets];

  if (targets.length === 0) {
    return rankCandidatesForRequirements(employees, [], taxonomy, parsed);
  }

  return rankCandidatesForRequirements(employees, targets, taxonomy, parsed);
}
