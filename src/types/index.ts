export type ProficiencyLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert' | 'Master';

export type EvidenceType = 'Project' | 'CodeReview' | 'Certification' | 'Feedback' | 'SelfDeclared';

export interface EvidenceItem {
  id: string;
  title: string;
  type: EvidenceType;
  date: string;
  weightMultiplier: number;
  description: string;
  complexityScore: number; 
  verificationSource: string; 
  verified: boolean;
  verificationStatus?: string;
  expired?: boolean;
  commitsCount?: number;
  prsMerged?: number;
}

export interface ToastUndoAction {
  label: string;
  durationSeconds?: number;
  onUndo: () => Promise<void> | void;
}

export interface EmployeeSkill {
  skillId: string;
  skillName: string;
  category: string;
  proficiencyScore: number; 
  proficiencyLevel: ProficiencyLevel;
  targetProficiencyLevel?: ProficiencyLevel;
  claimedLevel?: string;
  evidenceCount: number;
  lastUsedDate: string;
  confidenceScore: number; 
  evidenceList: EvidenceItem[];
  isPrimary?: boolean;
  verified?: boolean;
  verificationStatus?: string;
}

export interface Employee {
  id: string;
  name: string;
  avatar: string;
  role: string;
  team: string;
  department: string;
  location: string;
  email: string;
  availabilityPercent: number; 
  currentWorkloadPercent: number;
  hoursPerWeekFree: number;
  bio: string;
  yearsExperience: number;
  skills: EmployeeSkill[];
  topProjects: string[];
  certifications: string[];
  score?: number;
  level?: string;
  version?: number;
  display_label?: string;
}

export interface SkillTaxonomy {
  id: string;
  name: string;
  category: string;
  synonyms: string[];
  relatedSkills: string[];
  associatedDomains: string[];
  domain?: string;
}

export interface MarketplaceRole {
  id: string;
  title: string;
  department: string;
  location: string;
  team: string;
  commitment: string; 
  requiredSkills: { skillId: string; skillName: string; level: ProficiencyLevel }[];
  description: string;
  postedDate: string;
  applicantsCount: number;
  nearQualifiedMatchesCount: number;
  status?: 'Open' | 'Closed';
  priority?: 'Normal' | 'Priority';
}

export interface CandidateMatchResult {
  employee: Employee;
  overallMatchScore: number; 
  isNearQualified: boolean;
  matchingSkills: {
    skillName: string;
    currentLevel: ProficiencyLevel;
    requiredLevel: ProficiencyLevel;
    met: boolean;
    evidenceCount: number;
    lastUsed: string;
    evidenceConfidence?: number;
    skillExists?: boolean;
    importance?: 'Must' | 'Nice';
  }[];
  skillGaps: {
    skillName: string;
    currentLevel: ProficiencyLevel;
    targetLevel: ProficiencyLevel;
    severity: 'Low' | 'Medium' | 'High';
  }[];
  explanation: string;
  recencyIndicator: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'Person' | 'Skill' | 'Project' | 'Certification' | 'Domain';
  category?: string;
  proficiency?: ProficiencyLevel;
  details?: string;
  val: number; 
  x?: number;
  y?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  label?: string;
  weight?: number;
}
