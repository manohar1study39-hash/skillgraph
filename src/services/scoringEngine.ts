/**
 * SkillGraph V2 Unified Client-Side Scoring Engine.
 * Exact mirror of backend/scoring_engine.py & scoring_config.py.
 * Ensures the Employee View, HR Search, and Profile pages calculate identical points,
 * levels (0-5 Aware to Expert), and confidence breakdown.
 */

export const LEVEL_NAMES: Record<number, string> = {
  0: 'Unassessed',
  1: 'Aware',
  2: 'Guided',
  3: 'Independent',
  4: 'Advanced',
  5: 'Expert'
};

export const LEVEL_THRESHOLDS: Record<number, number> = {
  1: 2.0,   // Aware
  2: 4.0,   // Guided
  3: 12.0,  // Independent
  4: 24.0,  // Advanced
  5: 44.0   // Expert
};

export const BASE_WEIGHTS: Record<string, number> = {
  PR: 3.0,
  commit: 2.0,
  project: 3.5,
  cert: 3.0,
  code_review: 1.8,
  feedback: 1.2,
  self_declared: 2.0
};

export const VERIFICATION_FACTORS: Record<string, number> = {
  'Verified by HR': 1.0,
  'Link checked': 0.9,
  'Self-reported': 0.7,
  'Needs info': 0.0,
  'Rejected': 0.0
};

export const ROLE_FACTORS: Record<string, number> = {
  Architect: 1.3,
  Lead: 1.3,
  Contributor: 1.0,
  Support: 0.8
};

export const RECENCY_HALF_LIFE_DAYS = 730.0;
export const RECENCY_FLOOR = 0.40;
export const STALE_DAYS_THRESHOLD = 365;

export const SELF_DECLARED_MAX_LEVEL = 1;
export const SELF_REPORTED_MAX_LEVEL = 3;
export const DIMINISHING_RETURNS_FACTOR = 0.20;
export const EXPIRED_CERT_FACTOR = 0.35;

export const CONFIDENCE_EVIDENCE_COUNT_TARGET = 4;
export const CONFIDENCE_SOURCE_TRUST: Record<string, number> = {
  'Verified by HR': 1.0,
  'Link checked': 0.9,
  'Self-reported': 0.6,
  'Needs info': 0.1,
  'Rejected': 0.0
};

export interface EvidenceItemInput {
  id?: string;
  evidence_id?: string;
  title: string;
  type?: string;
  evidence_type?: string;
  url?: string;
  date?: string;
  artifact_date?: string;
  complexityScore?: number;
  complexity_score?: number;
  complexity?: number;
  duration_months?: number;
  role?: string;
  share_percentage?: number;
  verification_status?: string;
  verified?: boolean;
  expiry_date?: string;
}

export interface CertificationInput {
  cert_id?: string;
  cert_name?: string;
  title?: string;
  issued_date?: string;
  expiry_date?: string;
}

export interface EvaluatedSkillResult {
  skillId: string;
  level: number;
  levelName: string;
  points: number;
  displayScore: number;
  thresholds: Record<number, number>;
  orderedContributions: Array<{
    id: string;
    title: string;
    type: string;
    status: string;
    artifactDate: string;
    isDuplicate: boolean;
    isExpired: boolean;
    rawPoints: number;
    netPoints: number;
  }>;
  evidenceStrength: 'Strong' | 'Moderate' | 'Preliminary';
  yearsExperience: number;
  lastUsedDate: string;
  isStale: boolean;
  claimedLevel: string;
  confidenceScore: number;
  confidenceBreakdown: {
    sourceTrust: number;
    recencyFactor: number;
    countFactor: number;
  };
  nextLevelGuidance: string;
}

function parseDate(dateStr?: string): Date | null {
  if (!dateStr || dateStr === 'Never') return null;
  const d = new Date(dateStr.slice(0, 10));
  return isNaN(d.getTime()) ? null : d;
}

export function evaluateSkillClient(
  skillId: string,
  evidenceItems: EvidenceItemInput[],
  certifications: CertificationInput[] = [],
  declaredYears: number = 1.0,
  claimedLevel?: string,
  asOf: Date = new Date(),
  learningCourses: Array<{ status?: string }> = []
): EvaluatedSkillResult {
  let totalPoints = 0.0;
  let hasVerifiedOrChecked = false;
  let hasAnyEvidence = false;
  const seenUrls = new Set<string>();
  const seenFingerprints = new Set<string>();
  let latestDateStr = '';
  let latestDaysAgo = 9999;

  const trustFactors: number[] = [];
  const recencyFactors: number[] = [];

  const sortedEvidence = [...evidenceItems].sort((a, b) => {
    const da = a.artifact_date || a.date || '2000-01-01';
    const db = b.artifact_date || b.date || '2000-01-01';
    return da.localeCompare(db);
  });

  const orderedContributions: EvaluatedSkillResult['orderedContributions'] = [];
  let validItemIndex = 0;

  for (const item of sortedEvidence) {
    const evId = item.evidence_id || item.id || 'ev-item';
    const title = item.title || '';
    const evType = item.evidence_type || item.type || 'PR';
    const url = (item.url || '').trim();
    const dateStr = item.artifact_date || item.date || '';

    let vStatus = item.verification_status;
    if (!vStatus) {
      vStatus = item.verified ? 'Verified by HR' : 'Self-reported';
    }

    const artDate = parseDate(dateStr);
    if (artDate) {
      const daysAgo = Math.max(0, Math.floor((asOf.getTime() - artDate.getTime()) / 86400000));
      if (daysAgo < latestDaysAgo) {
        latestDaysAgo = daysAgo;
        latestDateStr = dateStr;
      }
    }

    let isDup = false;
    const fingerprint = `${title.trim().toLowerCase()}|${dateStr}`;
    if (url && seenUrls.has(url)) isDup = true;
    else if (seenFingerprints.has(fingerprint)) isDup = true;

    if (url) seenUrls.add(url);
    if (fingerprint !== '|') seenFingerprints.add(fingerprint);

    const baseW = BASE_WEIGHTS[evType] || 2.0;
    const months = Number(item.duration_months || 1.0);
    const durFactor = Math.min(2.5, Math.sqrt(Math.max(1.0, months)));
    const complexity = Number(item.complexityScore || item.complexity_score || item.complexity || 3.0);
    const complexityFactor = Math.max(0.5, Math.min(2.0, complexity / 3.0));
    const role = item.role || 'Contributor';
    const roleFactor = ROLE_FACTORS[role] || 1.0;
    const share = Number(item.share_percentage || 100.0) / 100.0;

    let recency = RECENCY_FLOOR;
    if (artDate) {
      const days = Math.max(0, Math.floor((asOf.getTime() - artDate.getTime()) / 86400000));
      recency = Math.max(RECENCY_FLOOR, Math.pow(0.5, days / RECENCY_HALF_LIFE_DAYS));
    }

    let verifFactor = VERIFICATION_FACTORS[vStatus] ?? 0.7;
    if (['Verified by HR', 'Link checked'].includes(vStatus)) {
      hasVerifiedOrChecked = true;
    }

    let isExpired = false;
    if (item.expiry_date) {
      const expDate = parseDate(item.expiry_date);
      if (expDate && expDate < asOf) {
        isExpired = true;
        verifFactor *= EXPIRED_CERT_FACTOR;
      }
    }

    let diminishing = 1.0;
    if (!isDup && verifFactor > 0) {
      validItemIndex += 1;
      diminishing = 1.0 / (1.0 + DIMINISHING_RETURNS_FACTOR * (validItemIndex - 1));
    }

    const rawPoints = baseW * durFactor * complexityFactor * roleFactor * share * recency * verifFactor;
    const netPoints = isDup ? 0.0 : rawPoints * diminishing;

    if (!isDup && verifFactor > 0) {
      totalPoints += netPoints;
      hasAnyEvidence = true;
      trustFactors.push(CONFIDENCE_SOURCE_TRUST[vStatus] ?? 0.5);
      recencyFactors.push(recency);
    }

    orderedContributions.push({
      id: evId,
      title,
      type: evType,
      status: vStatus,
      artifactDate: dateStr,
      isDuplicate: isDup,
      isExpired,
      rawPoints: Math.round(rawPoints * 10) / 10,
      netPoints: Math.round(netPoints * 10) / 10
    });
  }

  // Certifications
  for (const cert of certifications) {
    const cid = cert.cert_id || 'cert-item';
    const certName = cert.cert_name || cert.title || 'Certification';
    const issued = cert.issued_date || '';
    const expiry = cert.expiry_date || '';

    let isExp = false;
    if (expiry) {
      const expD = parseDate(expiry);
      if (expD && expD < asOf) isExp = true;
    }

    const vStat = isExp ? 'Self-reported' : 'Verified by HR';
    const issuedDate = parseDate(issued);
    let rec = RECENCY_FLOOR;
    if (issuedDate) {
      const days = Math.max(0, Math.floor((asOf.getTime() - issuedDate.getTime()) / 86400000));
      rec = Math.max(RECENCY_FLOOR, Math.pow(0.5, days / RECENCY_HALF_LIFE_DAYS));
    }
    const vFac = isExp ? EXPIRED_CERT_FACTOR : 1.0;
    const rawP = BASE_WEIGHTS.cert * rec * vFac * 2.0;

    validItemIndex += 1;
    const dim = 1.0 / (1.0 + DIMINISHING_RETURNS_FACTOR * (validItemIndex - 1));
    const netP = rawP * dim;

    totalPoints += netP;
    hasAnyEvidence = true;
    if (!isExp) hasVerifiedOrChecked = true;

    trustFactors.push(isExp ? 0.5 : 1.0);
    recencyFactors.push(rec);

    orderedContributions.push({
      id: cid,
      title: certName,
      type: 'cert',
      status: vStat,
      artifactDate: issued,
      isDuplicate: false,
      isExpired: isExp,
      rawPoints: Math.round(rawP * 10) / 10,
      netPoints: Math.round(netP * 10) / 10
    });
  }

  // Phase 4: Course completion request partial credit
  // "Once requested, awards capped partial credit (+0.2 level, max +0.5 total across all courses for that skill) until HR approves."
  if (learningCourses && learningCourses.length > 0) {
    const awaiting = learningCourses.filter(c => c.status === 'Awaiting approval');
    if (awaiting.length > 0) {
      const boost = Math.min(0.5, awaiting.length * 0.2);
      const addedPts = Math.round(boost * 2.5 * 100) / 100;
      totalPoints += addedPts;
      orderedContributions.push({
        id: 'course-awaiting-approval',
        title: `Course completion requested (${awaiting.length} awaiting approval)`,
        type: 'course_partial',
        status: 'Awaiting approval',
        artifactDate: asOf.toISOString().slice(0, 10),
        isDuplicate: false,
        isExpired: false,
        rawPoints: addedPts,
        netPoints: addedPts
      });
    }
  }

  // Minimum baseline claim points
  if (totalPoints < BASE_WEIGHTS.self_declared) {
    totalPoints = BASE_WEIGHTS.self_declared;
  }

  // Raw level
  let rawLevel = 0;
  for (const lvl of [5, 4, 3, 2, 1]) {
    if (totalPoints >= LEVEL_THRESHOLDS[lvl]) {
      rawLevel = lvl;
      break;
    }
  }

  // Anti-gaming ceilings
  let level = rawLevel;
  if (!hasAnyEvidence) {
    level = Math.min(rawLevel, SELF_DECLARED_MAX_LEVEL);
  } else if (!hasVerifiedOrChecked) {
    level = Math.min(rawLevel, SELF_REPORTED_MAX_LEVEL);
  }

  const countFactor = Math.min(1.0, trustFactors.length / CONFIDENCE_EVIDENCE_COUNT_TARGET);
  const avgTrust = trustFactors.length ? trustFactors.reduce((a, b) => a + b, 0) / trustFactors.length : 0.4;
  const avgRecency = recencyFactors.length ? recencyFactors.reduce((a, b) => a + b, 0) / recencyFactors.length : 0.5;
  const confidenceScore = Math.round(Math.max(15, Math.min(100, avgTrust * avgRecency * countFactor * 100)));

  const verifiedCount = orderedContributions.filter(c => !c.isDuplicate && ['Verified by HR', 'Link checked'].includes(c.status)).length;
  let evidenceStrength: EvaluatedSkillResult['evidenceStrength'] = 'Preliminary';
  if (verifiedCount >= 3) evidenceStrength = 'Strong';
  else if (verifiedCount >= 1 || orderedContributions.length >= 2) evidenceStrength = 'Moderate';

  const isStale = latestDateStr ? latestDaysAgo > STALE_DAYS_THRESHOLD : false;

  const nextLevel = Math.min(5, level + 1);
  let guidance = '';
  if (level === 5) {
    guidance = 'You have attained the Expert benchmark (Level 5). Maintain active production contributions to keep recency fresh.';
  } else {
    const needed = Math.max(0.0, LEVEL_THRESHOLDS[nextLevel] - totalPoints);
    const nextName = LEVEL_NAMES[nextLevel];
    if (!hasVerifiedOrChecked && level === 3) {
      guidance = `You have reached the ceiling for self-reported evidence (Level 3). To reach ${nextName} (Level 4), submit verified PRs, commits, or HR-approved artifacts.`;
    } else {
      guidance = `${Math.round(needed * 10) / 10} more points required to reach ${nextName} (Level ${nextLevel}). Consider submitting a high-complexity project or verified PR.`;
    }
  }

  const displayScore = Math.round(Math.min(100.0, (totalPoints / LEVEL_THRESHOLDS[5]) * 100.0));

  return {
    skillId,
    level,
    levelName: LEVEL_NAMES[level],
    points: Math.round(totalPoints * 10) / 10,
    displayScore,
    thresholds: LEVEL_THRESHOLDS,
    orderedContributions,
    evidenceStrength,
    yearsExperience: declaredYears,
    lastUsedDate: latestDateStr || 'Never',
    isStale,
    claimedLevel: claimedLevel || LEVEL_NAMES[level],
    confidenceScore,
    confidenceBreakdown: {
      sourceTrust: Math.round(avgTrust * 100) / 100,
      recencyFactor: Math.round(avgRecency * 100) / 100,
      countFactor: Math.round(countFactor * 100) / 100
    },
    nextLevelGuidance: guidance
  };
}
