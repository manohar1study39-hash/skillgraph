import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  LoaderCircle,
  Filter, 
  Sparkles, 
  ShieldCheck, 
  MapPin, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  ExternalLink,
  RotateCcw,
  X,
  Users,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  User,
  Check,
  Sliders,
  Layers,
  Briefcase,
  BookmarkPlus
} from 'lucide-react';
import { Employee, ProficiencyLevel } from '../../types';
import { ParsedQueryChips, parseNaturalQueryAdvanced, rankCandidatesAdvanced } from '../../services/matchingEngine';
import { CSV_DATA } from '../../services/dataLoader';
import { CompareModal } from './CompareModal';
import { Avatar } from '../ui/Avatar';
import { ProgressRing } from '../ui/ProgressBar';
import { SkillLevelExplanationModal } from '../employee/SkillLevelExplanationModal';
import { apiFetch } from '../../services/apiClient';

const LEVEL_HIERARCHY: Record<string, number> = {
  Beginner: 0,
  Intermediate: 1,
  Advanced: 2,
  Expert: 3,
  Master: 4
};

interface TalentSearchTabProps {
  employees: Employee[];
  searchQueryText: string;
  setSearchQueryText: (query: string) => void;
  onSelectEmployee: (emp: Employee) => void;
  onOpenUpskilling: (emp: Employee) => void;
  onInspectEvidence: (emp: Employee, skillName: string) => void;
  onShowToast?: (msg: string) => void;
  onReloadData?: () => Promise<void>;
}

export const TalentSearchTab: React.FC<TalentSearchTabProps> = ({
  employees,
  searchQueryText,
  setSearchQueryText,
  onSelectEmployee,
  onOpenUpskilling,
  onInspectEvidence,
  onShowToast,
  onReloadData
}) => {
  const [selectedSkillFilter, setSelectedSkillFilter] = useState<string>('All');
  const [selectedProficiencyFilter, setSelectedProficiencyFilter] = useState<string>('All');
  const [selectedAvailabilityFilter, setSelectedAvailabilityFilter] = useState<number>(0);
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState<string>('All');
  const [selectedYearsExpFilter, setSelectedYearsExpFilter] = useState<number>(0);
  const [nearQualifiedOnly, setNearQualifiedOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'score' | 'availability' | 'name' | 'experience' | 'proofs'>('score');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 6;

  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompareModal, setShowCompareModal] = useState<boolean>(false);
  const [isRanking, setIsRanking] = useState(false);

  // Explanation and Shortlist states
  const [explanationSkill, setExplanationSkill] = useState<{ employeeId: string; skillId: string; skillName: string } | null>(null);
  const [shortlistModalEmployee, setShortlistModalEmployee] = useState<Employee | null>(null);
  const [shortlistProjectId, setShortlistProjectId] = useState<string>('');
  const [shortlistNote, setShortlistNote] = useState<string>('');
  const [isShortlisting, setIsShortlisting] = useState(false);
  const [shortlistedSet, setShortlistedSet] = useState<Set<string>>(new Set());

  const availableProjects = useMemo(() => {
    return CSV_DATA?.records?.projects || [];
  }, []);

  useEffect(() => {
    apiFetch('/api/project-shortlists')
      .then(res => {
        if (res.ok && Array.isArray(res.data?.shortlists)) {
          const ids = new Set<string>(res.data.shortlists.map((sl: any) => sl.employee_id));
          setShortlistedSet(ids);
        }
      })
      .catch(() => {});
  }, []);

  const handleConfirmShortlist = async () => {
    if (!shortlistModalEmployee || !shortlistProjectId) return;
    setIsShortlisting(true);
    try {
      const res = await apiFetch('/api/project-shortlists', {
        method: 'POST',
        body: JSON.stringify({
          project_id: shortlistProjectId,
          employee_id: shortlistModalEmployee.id,
          note: shortlistNote
        })
      });
      if (!res.ok) throw new Error(res.error || 'Failed to shortlist candidate.');
      setShortlistedSet(prev => new Set(prev).add(shortlistModalEmployee.id));
      const projName = availableProjects.find(p => p.project_id === shortlistProjectId)?.project_name || shortlistProjectId;
      onShowToast?.(`${shortlistModalEmployee.name} shortlisted for ${projName}!`);
      if (onReloadData) await onReloadData();
      setShortlistModalEmployee(null);
      setShortlistNote('');
    } catch (err) {
      onShowToast?.(err instanceof Error ? err.message : 'Failed to shortlist candidate.');
    } finally {
      setIsShortlisting(false);
    }
  };

  const parsedChips: ParsedQueryChips = useMemo(() => {
    return parseNaturalQueryAdvanced(searchQueryText, CSV_DATA.skillsData, employees);
  }, [searchQueryText, employees]);

  const [editableSkills, setEditableSkills] = useState<string[]>(parsedChips.skills);
  const [editableNiceSkills, setEditableNiceSkills] = useState<string[]>(parsedChips.niceToHaveSkills || []);
  const [minimumLevel, setMinimumLevel] = useState(parsedChips.minProficiency);
  const [minimumAvailability, setMinimumAvailability] = useState(parsedChips.minAvailability);
  const [location, setLocation] = useState(parsedChips.location);
  const [domain, setDomain] = useState(parsedChips.domain);
  const [minYearsExp, setMinYearsExp] = useState(parsedChips.minYearsExperience || 0);

  useEffect(() => {
    setEditableSkills(parsedChips.skills);
    setEditableNiceSkills(parsedChips.niceToHaveSkills || []);
    setMinimumLevel(parsedChips.minProficiency);
    setMinimumAvailability(parsedChips.minAvailability);
    setLocation(parsedChips.location);
    setDomain(parsedChips.domain);
    setMinYearsExp(parsedChips.minYearsExperience || 0);
    setCurrentPage(1);
  }, [searchQueryText, employees]);

  const interpretedResults = useMemo(() => rankCandidatesAdvanced(employees, {
    skills: editableSkills,
    niceToHaveSkills: editableNiceSkills,
    minProficiency: minimumLevel,
    minAvailability: minimumAvailability,
    location,
    domain,
    minYearsExperience: minYearsExp,
    personName: parsedChips.personName,
    roleTitle: parsedChips.roleTitle,
  }, CSV_DATA.skillsData), [employees, editableSkills, editableNiceSkills, minimumLevel, minimumAvailability, location, domain, minYearsExp, parsedChips.personName, parsedChips.roleTitle]);

  const samplePrompts = [
    "Find employees capable of building a React + Node.js fintech application.",
    "Show me Node.js backend experts with high availability.",
    "Find AWS cloud engineers with payment vault security background.",
    "Alex Chen",
    "Sarah Jenkins Lead Frontend",
    "Postgres database expert"
  ];

  // Unique departments derived from employees
  const allDepartments = useMemo(
    () => ['All', ...new Set(employees.map(e => e.department).filter(Boolean))].sort(),
    [employees]
  );

  const filteredResults = useMemo(() => {
    let res = interpretedResults.filter(match => {
      if (nearQualifiedOnly && !match.isNearQualified) return false;

      // Filter by skill
      if (selectedSkillFilter !== 'All') {
        const hasSkill = match.employee.skills.some(s => s.skillName === selectedSkillFilter);
        if (!hasSkill) return false;
      }

      // Filter by proficiency
      if (selectedProficiencyFilter !== 'All') {
        const minReqLevel = selectedProficiencyFilter.replace('+', '');
        const targetVal = LEVEL_HIERARCHY[minReqLevel] ?? 0;
        const meetsAnySkill = match.employee.skills.some(
          s => (LEVEL_HIERARCHY[s.proficiencyLevel] ?? 0) >= targetVal
        );
        if (!meetsAnySkill) return false;
      }

      // Filter by availability
      if (selectedAvailabilityFilter > 0) {
        if (match.employee.availabilityPercent < selectedAvailabilityFilter) return false;
      }

      // Filter by department
      if (selectedDepartmentFilter !== 'All') {
        if (match.employee.department !== selectedDepartmentFilter) return false;
      }

      // Filter by experience
      if (selectedYearsExpFilter > 0) {
        if ((match.employee.yearsExperience || 0) < selectedYearsExpFilter) return false;
      }

      return true;
    });

    // Sort results
    res.sort((a, b) => {
      if (sortBy === 'score') return b.overallMatchScore - a.overallMatchScore;
      if (sortBy === 'availability') return b.employee.availabilityPercent - a.employee.availabilityPercent;
      if (sortBy === 'name') return a.employee.name.localeCompare(b.employee.name);
      if (sortBy === 'experience') return (b.employee.yearsExperience || 0) - (a.employee.yearsExperience || 0);
      if (sortBy === 'proofs') {
        const aProofs = a.employee.skills.reduce((sum, s) => sum + s.evidenceList.filter(e => e.verified).length, 0);
        const bProofs = b.employee.skills.reduce((sum, s) => sum + s.evidenceList.filter(e => e.verified).length, 0);
        return bProofs - aProofs;
      }
      return 0;
    });

    return res;
  }, [
    interpretedResults, 
    nearQualifiedOnly, 
    selectedSkillFilter, 
    selectedProficiencyFilter, 
    selectedAvailabilityFilter, 
    selectedDepartmentFilter, 
    selectedYearsExpFilter, 
    sortBy
  ]);

  const totalPages = Math.ceil(filteredResults.length / pageSize) || 1;
  const paginatedResults = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredResults.slice(start, start + pageSize);
  }, [filteredResults, currentPage]);

  const toggleCompare = (employeeId: string) => {
    setCompareIds(prev => {
      if (prev.includes(employeeId)) {
        return prev.filter(id => id !== employeeId);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, employeeId];
    });
  };

  const compareCandidates = useMemo(() => {
    return employees.filter(emp => compareIds.includes(emp.id));
  }, [employees, compareIds]);

  const resetAllFilters = () => {
    setSelectedSkillFilter('All');
    setSelectedProficiencyFilter('All');
    setSelectedAvailabilityFilter(0);
    setSelectedDepartmentFilter('All');
    setSelectedYearsExpFilter(0);
    setNearQualifiedOnly(false);
    setSortBy('score');
    setCurrentPage(1);
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedSkillFilter !== 'All') count++;
    if (selectedProficiencyFilter !== 'All') count++;
    if (selectedAvailabilityFilter > 0) count++;
    if (selectedDepartmentFilter !== 'All') count++;
    if (selectedYearsExpFilter > 0) count++;
    if (nearQualifiedOnly) count++;
    return count;
  }, [selectedSkillFilter, selectedProficiencyFilter, selectedAvailabilityFilter, selectedDepartmentFilter, selectedYearsExpFilter, nearQualifiedOnly]);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* ── Search Header / NLP Query Card (Manager Cyan Accent) ─── */}
      <div className="relative overflow-hidden rounded-3xl border border-[#19C3E6]/25 bg-gradient-to-br from-[#19C3E6]/[0.08] via-surface to-surface p-6 sm:p-7 shadow-xs">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#19C3E6]/10 border border-[#19C3E6]/30 px-3 py-0.5 text-xs font-semibold text-cyan-600 dark:text-cyan-400">
              <Sparkles className="w-3.5 h-3.5 text-cyan-500" /> Natural Language Talent Query Engine
            </span>
          </div>
          <div className="flex items-center gap-2">
            {compareIds.length > 0 && (
              <button
                onClick={() => setShowCompareModal(true)}
                className="aurora-btn-primary px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 text-white shadow-xs transition-all"
              >
                <Users className="w-3.5 h-3.5" /> Compare ({compareIds.length}/3)
              </button>
            )}
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!searchQueryText.trim()) return;
            setIsRanking(true);
            requestAnimationFrame(() => requestAnimationFrame(() => setIsRanking(false)));
          }}
          className="relative"
        >
          <Search className="w-5 h-5 text-text-muted absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQueryText}
            onChange={(e) => setSearchQueryText(e.target.value)}
            placeholder="Ask anything, e.g. Find React + Node.js fintech engineers, or search by name like 'Alex Chen'"
            className="w-full bg-surface border border-border rounded-2xl pl-12 pr-40 h-12 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[#19C3E6] focus:ring-2 focus:ring-[#19C3E6]/20 font-medium transition-all shadow-2xs"
          />
          {searchQueryText && (
            <button
              type="button"
              onClick={() => setSearchQueryText('')}
              className="absolute right-40 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary rounded-md cursor-pointer"
              title="Clear search input"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10">
            <button
              type="submit"
              disabled={!searchQueryText.trim() || isRanking}
              aria-busy={isRanking}
              className="flex items-center px-4 py-2 rounded-xl font-bold text-xs aurora-btn-primary text-white shadow-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              {isRanking ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin"/> : <Search className="mr-1.5 h-3.5 w-3.5"/>}
              {isRanking ? 'Ranking…' : 'Rank Candidates'}
            </button>
          </div>
        </form>

        {/* Parsed Chips & Criteria Bar */}
        <div className="mt-3.5 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-text-muted">Parsed Interpretation:</span>
          {parsedChips.personName && (
            <span className="text-xs font-bold bg-[#19C3E6] text-slate-950 px-2.5 py-1 rounded-xl flex items-center gap-1 shadow-xs">
              Person: {parsedChips.personName}
            </span>
          )}
          {editableSkills.map((sk, idx) => (
            <span key={idx} className="text-xs font-bold bg-[#19C3E6]/15 text-cyan-600 dark:text-cyan-400 border border-[#19C3E6]/30 px-2.5 py-1 rounded-xl flex items-center gap-1">
              Must: {sk}
              <X
                className="w-3 h-3 cursor-pointer hover:text-text-primary"
                onClick={() => setEditableSkills(prev => prev.filter(s => s !== sk))}
              />
            </span>
          ))}
          {editableNiceSkills.map((sk, idx) => (
            <span key={`nice-${idx}`} className="text-xs font-semibold bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30 px-2.5 py-1 rounded-xl flex items-center gap-1">
              Nice: {sk}
              <X
                className="w-3 h-3 cursor-pointer hover:text-text-primary"
                onClick={() => setEditableNiceSkills(prev => prev.filter(s => s !== sk))}
              />
            </span>
          ))}
          <select
            value=""
            onChange={event => {
              const v = event.target.value;
              if (!v) return;
              if (!editableSkills.includes(v) && !editableNiceSkills.includes(v)) setEditableSkills(prev => [...prev, v]);
            }}
            aria-label="Add required skill"
            className="rounded-xl border border-border bg-surface px-2.5 py-1 text-xs text-text-muted focus:border-indigo-500 focus:outline-none"
          >
            <option value="">+ Must Skill</option>
            {CSV_DATA.skillsData.filter(skill => !editableSkills.includes(skill.name) && !editableNiceSkills.includes(skill.name)).map(skill => (
              <option key={skill.id} value={skill.name}>{skill.name}</option>
            ))}
          </select>
          <select
            value=""
            onChange={event => {
              const v = event.target.value;
              if (!v) return;
              if (!editableNiceSkills.includes(v) && !editableSkills.includes(v)) setEditableNiceSkills(prev => [...prev, v]);
            }}
            aria-label="Add nice-to-have skill"
            className="rounded-xl border border-border bg-surface px-2.5 py-1 text-xs text-text-muted focus:border-indigo-500 focus:outline-none"
          >
            <option value="">+ Nice Skill</option>
            {CSV_DATA.skillsData.filter(skill => !editableSkills.includes(skill.name) && !editableNiceSkills.includes(skill.name)).map(skill => (
              <option key={skill.id} value={skill.name}>{skill.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            Min level
            <select
              value={minimumLevel}
              onChange={event => setMinimumLevel(event.target.value as ProficiencyLevel)}
              className="rounded-xl border border-border bg-surface px-2 py-1 text-xs text-text-primary focus:border-indigo-500 focus:outline-none"
            >
              {['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Master'].map(level => (
                <option key={level}>{level}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            Avail.
            <select
              value={minimumAvailability}
              onChange={event => setMinimumAvailability(Number(event.target.value))}
              className="rounded-xl border border-border bg-surface px-2 py-1 text-xs text-text-primary focus:border-indigo-500 focus:outline-none"
            >
              <option value={0}>Any</option>
              <option value={25}>25%+</option>
              <option value={50}>50%+</option>
              <option value={75}>75%+</option>
              <option value={100}>100%</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            Location
            <select
              value={location}
              onChange={event => setLocation(event.target.value)}
              className="rounded-xl border border-border bg-surface px-2 py-1 text-xs text-text-primary focus:border-indigo-500 focus:outline-none"
            >
              <option>Any</option>
              {[...new Set(employees.map(employee => employee.location))].sort().map(value => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            Domain
            <select
              value={domain}
              onChange={event => setDomain(event.target.value)}
              className="rounded-xl border border-border bg-surface px-2 py-1 text-xs text-text-primary focus:border-indigo-500 focus:outline-none"
            >
              <option>Any</option>
              {[...new Set(CSV_DATA.skillsData.map(skill => skill.associatedDomains[0]))].filter(Boolean).map(value => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            Exp (yrs)
            <select
              value={minYearsExp}
              onChange={event => setMinYearsExp(Number(event.target.value))}
              className="rounded-xl border border-border bg-surface px-2 py-1 text-xs text-text-primary focus:border-indigo-500 focus:outline-none"
            >
              <option value={0}>Any</option>
              <option value={2}>2+</option>
              <option value={4}>4+</option>
              <option value={5}>5+</option>
              <option value={8}>8+</option>
            </select>
          </label>
        </div>

        {/* Try Prompts Carousel */}
        <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[11px] font-semibold text-text-muted shrink-0">Try prompt:</span>
          {samplePrompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => setSearchQueryText(prompt)}
              className="text-xs text-text-muted hover:text-text-primary bg-surface hover:bg-surface-alt border border-border rounded-xl px-3 py-1 font-medium transition-colors shrink-0 shadow-2xs"
            >
              &quot;{prompt}&quot;
            </button>
          ))}
        </div>
      </div>

      {/* ── Filter Controls Bar ────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-text-primary pr-2 border-r border-border">
            <Filter className="w-3.5 h-3.5 text-indigo-500" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 bg-indigo-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-black">
                {activeFilterCount}
              </span>
            )}
            :
          </div>

          {/* Skill Filter */}
          <select
            value={selectedSkillFilter}
            onChange={(e) => setSelectedSkillFilter(e.target.value)}
            className="bg-surface-alt border border-border rounded-xl px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-indigo-500 font-medium"
            title="Filter by specific skill"
          >
            <option value="All">All Skills</option>
            {CSV_DATA.skillsData.map(skill => (
              <option key={skill.id} value={skill.name}>{skill.name}</option>
            ))}
          </select>

          {/* Proficiency Filter */}
          <select
            value={selectedProficiencyFilter}
            onChange={(e) => setSelectedProficiencyFilter(e.target.value)}
            className="bg-surface-alt border border-border rounded-xl px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-indigo-500 font-medium"
            title="Filter by minimum proficiency level"
          >
            <option value="All">Any Proficiency</option>
            <option value="Expert+">Expert+ (Expert / Master)</option>
            <option value="Advanced+">Advanced+ (Advanced, Expert, Master)</option>
            <option value="Intermediate+">Intermediate+ (Intermediate &amp; above)</option>
            <option value="Beginner+">Beginner &amp; above</option>
          </select>

          {/* Availability Filter */}
          <select
            value={selectedAvailabilityFilter}
            onChange={(e) => setSelectedAvailabilityFilter(Number(e.target.value))}
            className="bg-surface-alt border border-border rounded-xl px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-indigo-500 font-medium"
            title="Filter by minimum availability percentage"
          >
            <option value={0}>Any Availability</option>
            <option value={25}>≥ 25% Available</option>
            <option value={50}>≥ 50% Available</option>
            <option value={75}>≥ 75% Available</option>
            <option value={100}>100% Available</option>
          </select>

          {/* Department Filter */}
          <select
            value={selectedDepartmentFilter}
            onChange={(e) => setSelectedDepartmentFilter(e.target.value)}
            className="bg-surface-alt border border-border rounded-xl px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-indigo-500 font-medium"
            title="Filter by department"
          >
            {allDepartments.map(dept => (
              <option key={dept} value={dept}>{dept === 'All' ? 'All Departments' : dept}</option>
            ))}
          </select>

          {/* Experience Filter */}
          <select
            value={selectedYearsExpFilter}
            onChange={(e) => setSelectedYearsExpFilter(Number(e.target.value))}
            className="bg-surface-alt border border-border rounded-xl px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-indigo-500 font-medium"
            title="Filter by minimum years of experience"
          >
            <option value={0}>Any Experience</option>
            <option value={2}>2+ Years</option>
            <option value={4}>4+ Years</option>
            <option value={5}>5+ Years</option>
            <option value={8}>8+ Years</option>
          </select>

          {/* Near Qualified Checkbox */}
          <label className="flex items-center gap-2 cursor-pointer bg-surface-alt px-3 py-1.5 rounded-xl border border-border text-xs font-semibold text-emerald-600 dark:text-emerald-400 select-none hover:bg-border/40 transition-colors">
            <input
              type="checkbox"
              checked={nearQualifiedOnly}
              onChange={(e) => setNearQualifiedOnly(e.target.checked)}
              className="rounded bg-surface border-border text-emerald-600 focus:ring-0 cursor-pointer accent-emerald-600"
            />
            Near-Qualified Only
          </label>
        </div>

        {/* Sort & Reset */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <ArrowUpDown className="w-3.5 h-3.5" /> Sort:
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-surface-alt border border-border rounded-xl px-2.5 py-1 text-xs text-text-primary focus:outline-none focus:border-indigo-500 font-medium"
            >
              <option value="score">Match Score</option>
              <option value="availability">Availability</option>
              <option value="name">Name (A–Z)</option>
              <option value="experience">Experience</option>
              <option value="proofs">Verified Proofs</option>
            </select>
          </div>

          <button
            onClick={resetAllFilters}
            className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1 font-medium bg-surface-alt hover:bg-border px-2.5 py-1 rounded-xl border border-border transition-colors"
            title="Reset all search filters"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>
      </div>

      {/* Active Filter Badges */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-text-muted font-semibold">Active filters:</span>
          {selectedSkillFilter !== 'All' && (
            <span className="inline-flex items-center gap-1 rounded-xl bg-surface border border-border px-2.5 py-1 text-text-primary font-medium shadow-2xs">
              Skill: <strong>{selectedSkillFilter}</strong>
              <X className="w-3 h-3 cursor-pointer text-text-muted hover:text-danger" onClick={() => setSelectedSkillFilter('All')} />
            </span>
          )}
          {selectedProficiencyFilter !== 'All' && (
            <span className="inline-flex items-center gap-1 rounded-xl bg-surface border border-border px-2.5 py-1 text-text-primary font-medium shadow-2xs">
              Proficiency: <strong>{selectedProficiencyFilter}</strong>
              <X className="w-3 h-3 cursor-pointer text-text-muted hover:text-danger" onClick={() => setSelectedProficiencyFilter('All')} />
            </span>
          )}
          {selectedAvailabilityFilter > 0 && (
            <span className="inline-flex items-center gap-1 rounded-xl bg-surface border border-border px-2.5 py-1 text-text-primary font-medium shadow-2xs">
              Avail: <strong>≥ {selectedAvailabilityFilter}%</strong>
              <X className="w-3 h-3 cursor-pointer text-text-muted hover:text-danger" onClick={() => setSelectedAvailabilityFilter(0)} />
            </span>
          )}
          {selectedDepartmentFilter !== 'All' && (
            <span className="inline-flex items-center gap-1 rounded-xl bg-surface border border-border px-2.5 py-1 text-text-primary font-medium shadow-2xs">
              Dept: <strong>{selectedDepartmentFilter}</strong>
              <X className="w-3 h-3 cursor-pointer text-text-muted hover:text-danger" onClick={() => setSelectedDepartmentFilter('All')} />
            </span>
          )}
          {selectedYearsExpFilter > 0 && (
            <span className="inline-flex items-center gap-1 rounded-xl bg-surface border border-border px-2.5 py-1 text-text-primary font-medium shadow-2xs">
              Exp: <strong>≥ {selectedYearsExpFilter} yrs</strong>
              <X className="w-3 h-3 cursor-pointer text-text-muted hover:text-danger" onClick={() => setSelectedYearsExpFilter(0)} />
            </span>
          )}
          {nearQualifiedOnly && (
            <span className="inline-flex items-center gap-1 rounded-xl bg-surface border border-border px-2.5 py-1 text-emerald-600 dark:text-emerald-400 font-medium shadow-2xs">
              Near-Qualified Only
              <X className="w-3 h-3 cursor-pointer text-text-muted hover:text-danger" onClick={() => setNearQualifiedOnly(false)} />
            </span>
          )}
          <button
            onClick={resetAllFilters}
            className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold ml-1"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Results Insights Banner */}
      <div className="bg-surface border border-border rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/80">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-text-primary">
                Search Results Insights
              </span>
              <span className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-indigo-500/20">
                {filteredResults.length} Candidates Ranked
              </span>
            </div>
            {searchQueryText.trim() && (
              <p className="text-xs text-text-muted mt-1">
                Query analyzed: <span className="text-text-primary font-medium italic">&quot;{searchQueryText}&quot;</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs">
            {filteredResults.length > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-text-muted">
                  Top Match: <strong className="text-emerald-600 dark:text-emerald-400 font-black">{filteredResults[0].overallMatchScore}%</strong>
                </span>
                <span className="text-text-muted hidden sm:inline">•</span>
                <span className="text-text-muted hidden sm:inline">
                  Avg Availability: <strong className="text-text-primary font-bold">
                    {Math.round(filteredResults.reduce((acc, r) => acc + r.employee.availabilityPercent, 0) / filteredResults.length)}%
                  </strong>
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="pt-3 flex items-center justify-between text-xs text-text-muted">
          <span>Page {currentPage} of {totalPages} (Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredResults.length)} of {filteredResults.length})</span>
          <span className="text-[11px]">Click candidate name or &quot;Full Profile&quot; to inspect all evidence &amp; history</span>
        </div>
      </div>

      {/* Candidate Cards Grid */}
      <div className="space-y-4">
        {paginatedResults.map((match, idx) => {
          const isComparing = compareIds.includes(match.employee.id);
          const scoreColor = match.overallMatchScore >= 90
            ? 'text-emerald-500 dark:text-emerald-400' 
            : match.overallMatchScore >= 75 
            ? 'text-cyan-500 dark:text-cyan-400' 
            : match.overallMatchScore >= 50
            ? 'text-amber-500 dark:text-amber-400'
            : 'text-text-muted';

          const matchTier = match.overallMatchScore >= 90
            ? 'Outstanding Match'
            : match.overallMatchScore >= 75
            ? 'Strong Fit'
            : match.overallMatchScore >= 50
            ? 'Moderate Match'
            : 'Partial Match';

          const tierBg = match.overallMatchScore >= 90
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
            : match.overallMatchScore >= 75
            ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30'
            : match.overallMatchScore >= 50
            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
            : 'bg-surface-alt text-text-muted border-border';

          const availColor = match.employee.availabilityPercent >= 70
            ? 'text-emerald-500 dark:text-emerald-400'
            : match.employee.availabilityPercent >= 30
            ? 'text-cyan-500 dark:text-cyan-400'
            : 'text-amber-500 dark:text-amber-400';

          return (
            <div 
              key={idx}
              className="bg-surface border border-border hover:border-[#19C3E6]/40 rounded-2xl p-6 transition-all shadow-xs relative overflow-hidden group/card"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/80 pb-4">
                <div className="flex items-start gap-4">
                  <input
                    type="checkbox"
                    checked={isComparing}
                    onChange={() => toggleCompare(match.employee.id)}
                    className="mt-4 rounded bg-surface border-border text-[#19C3E6] focus:ring-0 w-4 h-4 cursor-pointer accent-[#19C3E6]"
                    title="Select to compare side-by-side"
                  />
                  <div 
                    onClick={() => onSelectEmployee(match.employee)} 
                    className="cursor-pointer transition-transform hover:scale-105 shrink-0"
                    title={`View ${match.employee.name}'s profile`}
                  >
                    <Avatar name={match.employee.name} className="h-14 w-14 rounded-2xl text-sm shadow-md ring-2 ring-[#19C3E6]/20 group-hover/card:ring-[#19C3E6]/50 transition-all" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 
                        onClick={() => onSelectEmployee(match.employee)}
                        className="text-base font-extrabold text-text-primary hover:text-[#19C3E6] transition-colors cursor-pointer flex items-center gap-1.5 font-sora"
                        title="Click to view full profile"
                      >
                        {match.employee.display_label || match.employee.name}
                        <ExternalLink className="w-3.5 h-3.5 text-text-muted opacity-60 hover:opacity-100" />
                      </h3>
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${tierBg}`}>
                        {matchTier}
                      </span>
                      {match.isNearQualified && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-amber-500" /> Near-Qualified
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted font-medium mt-0.5">
                      {match.employee.role} • {match.employee.department} ({match.employee.team})
                    </p>
                    <div className="flex items-center gap-4 text-xs text-text-muted mt-2 flex-wrap">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-text-muted" /> {match.employee.location}
                      </span>
                      <span className={`flex items-center gap-1 font-mono tabular-nums font-semibold ${availColor}`}>
                        {match.employee.availabilityPercent}% Available ({Math.round(match.employee.availabilityPercent * 0.4)} hrs/wk)
                      </span>
                      <span className="text-text-muted">
                        {match.employee.yearsExperience} yrs tenure
                      </span>
                      <span className="text-text-muted">
                        {match.employee.skills.length} verified skills
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center md:flex-col md:items-end justify-between bg-surface-alt p-3.5 rounded-2xl border border-border min-w-[130px] shadow-2xs">
                  <div className="text-right">
                    <span className={`text-2xl font-black font-sora tabular-nums ${scoreColor} tracking-tight`}>
                      {match.overallMatchScore}%
                    </span>
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Overall Match</p>
                  </div>
                  <span className="text-[10px] text-text-muted font-medium mt-1">
                    {match.recencyIndicator}
                  </span>
                </div>
              </div>

              {/* Skill Coverage Proofs */}
              {match.matchingSkills.length > 0 && (
                <div className="py-4 space-y-3">
                  <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center justify-between">
                    <span>Required Skill Coverage &amp; Proofs</span>
                    <span className="text-[11px] font-normal text-text-muted">
                      {match.matchingSkills.filter(s => s.met).length} of {match.matchingSkills.length} targets met
                    </span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {match.matchingSkills.map((sk, skIdx) => (
                      <div 
                        key={skIdx}
                        onClick={() => onInspectEvidence(match.employee, sk.skillName)}
                        className="p-3 rounded-xl bg-surface-alt border border-border hover:border-[#19C3E6]/40 cursor-pointer transition-all group shadow-2xs"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-text-primary group-hover:text-[#19C3E6] transition-colors">
                            {sk.skillName}
                          </span>
                          {sk.met ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs mt-1">
                          <span className="text-text-muted">
                            Level: <strong className="text-cyan-600 dark:text-cyan-400 font-bold">{sk.currentLevel}</strong>
                          </span>
                          <span className="text-[10px] text-text-muted">
                            Target: {sk.requiredLevel} ({sk.importance})
                          </span>
                        </div>
                        
                        <div className="mt-2 pt-2 border-t border-border/60 flex items-center justify-between text-[10px]">
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-emerald-500" /> {sk.evidenceCount} Proofs
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExplanationSkill({
                                  employeeId: match.employee.id,
                                  skillId: sk.skillName,
                                  skillName: sk.skillName
                                });
                              }}
                              className="px-2 py-0.5 rounded-lg bg-[#19C3E6]/10 hover:bg-[#19C3E6]/20 text-cyan-600 dark:text-cyan-400 font-bold text-[10px] border border-[#19C3E6]/30 transition-colors cursor-pointer"
                              title="Why is this level assigned? View factor breakdown"
                            >
                              Why Level?
                            </button>
                            <span className="text-text-muted group-hover:text-[#19C3E6] transition-colors">Inspect &rarr;</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Match Rationale */}
              <div className="bg-surface-alt rounded-xl p-3.5 border border-border my-3 shadow-2xs">
                <p className="text-xs text-text-muted leading-relaxed">
                  <strong className="text-cyan-600 dark:text-cyan-400 font-semibold">Match Rationale:</strong> {match.explanation}
                </p>
              </div>

              {/* Bottom Actions */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {match.employee.topProjects.slice(0, 2).map((proj, pIdx) => (
                    <span key={pIdx} className="text-[10px] font-medium bg-surface-alt text-text-muted px-2.5 py-1 rounded-lg border border-border">
                      Project: {proj}
                    </span>
                  ))}
                  {match.employee.certifications?.slice(0, 1).map((cert, cIdx) => (
                    <span key={`cert-${cIdx}`} className="text-[10px] font-medium bg-surface-alt text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded-lg border border-border">
                      Cert: {cert}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => {
                      setShortlistProjectId(availableProjects[0]?.project_id || '');
                      setShortlistModalEmployee(match.employee);
                    }}
                    className={`px-3.5 py-2 rounded-xl border font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer ${
                      shortlistedSet.has(match.employee.id)
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                        : 'bg-surface hover:bg-surface-alt text-text-primary border-border hover:border-[#19C3E6]/40'
                    }`}
                    title={`Shortlist ${match.employee.name} for an active project`}
                  >
                    {shortlistedSet.has(match.employee.id) ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" /> Shortlisted
                      </>
                    ) : (
                      <>
                        <BookmarkPlus className="w-3.5 h-3.5 text-text-muted" /> Shortlist for Project
                      </>
                    )}
                  </button>

                  {match.isNearQualified && (
                    <button
                      onClick={() => onOpenUpskilling(match.employee)}
                      className="px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all"
                    >
                      Upskilling Path <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    onClick={() => onSelectEmployee(match.employee)}
                    className="px-4 py-2 rounded-xl bg-[#19C3E6]/10 hover:bg-[#19C3E6] text-cyan-600 dark:text-cyan-400 hover:text-slate-950 border border-[#19C3E6]/30 font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                    title={`View full profile of ${match.employee.name}`}
                  >
                    <User className="w-3.5 h-3.5" /> Full Profile
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {paginatedResults.length === 0 && (
        <div className="rounded-3xl border border-border bg-surface p-12 text-center shadow-xs">
          <Search className="mx-auto h-10 w-10 text-text-muted opacity-50" />
          <h3 className="mt-4 text-base font-bold text-text-primary">No matching employees found</h3>
          <p className="mt-1 text-sm text-text-muted max-w-md mx-auto">
            {activeFilterCount > 0 
              ? 'One or more of your active filters might be too restrictive. Try adjusting or clearing them to see more candidates.' 
              : 'Try broadening your search query or removing specific skill/experience constraints.'}
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              onClick={resetAllFilters}
              className="px-4 py-2 rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 aurora-btn-primary text-white"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset All Filters
            </button>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <button
            onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 rounded-xl bg-surface border border-border text-xs font-bold text-text-primary disabled:opacity-40 flex items-center gap-1 hover:bg-surface-alt transition-colors disabled:cursor-not-allowed shadow-2xs"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <span className="text-xs font-bold text-text-muted font-mono tabular-nums">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 rounded-xl bg-surface border border-border text-xs font-bold text-text-primary disabled:opacity-40 flex items-center gap-1 hover:bg-surface-alt transition-colors disabled:cursor-not-allowed shadow-2xs"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Fixed Bottom Comparison Tray */}
      {compareIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#0B1020]/95 backdrop-blur-md border border-[#19C3E6]/40 text-white rounded-2xl px-5 py-3 shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center -space-x-2">
            {compareCandidates.map(c => (
              <Avatar key={c.id} name={c.name} className="h-8 w-8 rounded-full ring-2 ring-[#0B1020] text-2xs" />
            ))}
          </div>
          <span className="text-xs font-semibold text-slate-200">
            <strong className="text-cyan-400 font-bold tabular-nums font-mono">{compareIds.length}</strong> candidate{compareIds.length > 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => setShowCompareModal(true)}
            className="aurora-btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md text-white"
          >
            <Users className="w-3.5 h-3.5" /> Compare ({compareIds.length}/3)
          </button>
          <button
            onClick={() => setCompareIds([])}
            className="text-xs text-slate-400 hover:text-white px-2 py-1 transition-colors cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}

      {showCompareModal && (
        <CompareModal
          candidates={compareCandidates}
          onClose={() => setShowCompareModal(false)}
          onSelectEmployee={(emp) => onSelectEmployee(emp)}
        />
      )}

      {/* Shortlist Candidate for Project Modal */}
      {shortlistModalEmployee && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200"
          onClick={() => setShortlistModalEmployee(null)}
        >
          <div
            className="bg-surface border border-border rounded-3xl max-w-md w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border p-5 bg-surface-alt">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                  <BookmarkPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text-primary">Shortlist Candidate</h3>
                  <p className="text-xs text-text-muted">{shortlistModalEmployee.name} · {shortlistModalEmployee.role}</p>
                </div>
              </div>
              <button
                onClick={() => setShortlistModalEmployee(null)}
                className="w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-2xs font-bold text-text-muted uppercase tracking-wider mb-1.5">
                  Target Project *
                </label>
                <select
                  value={shortlistProjectId}
                  onChange={e => setShortlistProjectId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-text-primary focus:outline-none focus:border-[#19C3E6]"
                >
                  <option value="">-- Select Project --</option>
                  {availableProjects.map((proj: any) => (
                    <option key={proj.project_id} value={proj.project_id}>
                      {proj.project_name} ({proj.domain} · {proj.technologies})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-2xs font-bold text-text-muted uppercase tracking-wider mb-1.5">
                  Manager Staffing Note (Optional)
                </label>
                <textarea
                  value={shortlistNote}
                  onChange={e => setShortlistNote(e.target.value)}
                  placeholder="e.g. Excellent fit for project lead based on verified skills."
                  rows={3}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[#19C3E6] resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShortlistModalEmployee(null)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-text-muted hover:text-text-primary bg-surface border border-border cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmShortlist}
                  disabled={!shortlistProjectId || isShortlisting}
                  className="aurora-btn-primary rounded-xl px-4 py-2 text-xs font-bold text-white shadow-md disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
                >
                  {isShortlisting ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
                  Shortlist for Project
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Skill Level Explanation Modal ("Why is Level X?") */}
      {explanationSkill && (
        <SkillLevelExplanationModal
          employeeId={explanationSkill.employeeId}
          skillId={explanationSkill.skillId}
          skillName={explanationSkill.skillName}
          onClose={() => setExplanationSkill(null)}
        />
      )}
    </div>
  );
};
