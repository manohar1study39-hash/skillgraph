import React, { useState } from 'react';
import {
  X,
  User,
  Briefcase,
  MapPin,
  Clock,
  Plus,
  Trash2,
  ShieldCheck,
  Check,
  Layers,
  Sparkles,
  Building,
  Users,
  ChevronRight,
  ChevronLeft,
  Award
} from 'lucide-react';
import type { Employee, ProficiencyLevel } from '../../types';
import { CSV_DATA } from '../../services/dataLoader';
import { apiFetch } from '../../services/apiClient';

interface EmployeeProfileEditorModalProps {
  employee: Employee;
  onClose: () => void;
  onSaveSuccess: () => Promise<void> | void;
  onShowToast: (message: string) => void;
}

const PROFICIENCY_LEVELS: { level: ProficiencyLevel; label: string; desc: string }[] = [
  { level: 'Beginner', label: 'Beginner', desc: 'Foundational understanding' },
  { level: 'Intermediate', label: 'Intermediate', desc: 'Independent contributor' },
  { level: 'Advanced', label: 'Advanced', desc: 'Deep practical domain mastery' },
  { level: 'Expert', label: 'Expert', desc: 'System architect & mentor' },
  { level: 'Master', label: 'Master', desc: 'Industry authority & pioneer' },
];

export const EmployeeProfileEditorModal: React.FC<EmployeeProfileEditorModalProps> = ({
  employee,
  onClose,
  onSaveSuccess,
  onShowToast
}) => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState(employee.name || '');
  const [title, setTitle] = useState(employee.role || 'Software Engineer');
  const [department, setDepartment] = useState(employee.department || 'Engineering');
  const [team, setTeam] = useState(employee.team || 'Core Team');
  const [location, setLocation] = useState(employee.location || 'Remote');
  const [availabilityPercent, setAvailabilityPercent] = useState(employee.availabilityPercent ?? 100);
  const [hoursPerWeekFree, setHoursPerWeekFree] = useState(employee.hoursPerWeekFree ?? 40);

  // Editable skills list: { skillId, level, yearsExperience }
  const [skills, setSkills] = useState<{ skillId: string; level: ProficiencyLevel; yearsExperience: number }[]>(
    () => employee.skills.map(s => ({
      skillId: s.skillId,
      level: s.proficiencyLevel,
      yearsExperience: 3
    }))
  );

  // State for adding a new skill
  const [newSkillId, setNewSkillId] = useState(CSV_DATA.skillsData[0]?.id || 'skill-react');
  const [newLevel, setNewLevel] = useState<ProficiencyLevel>('Intermediate');
  const [newYears, setNewYears] = useState(3);

  // Editable projects & certifications
  const [topProjects, setTopProjects] = useState<string[]>(employee.topProjects || []);
  const [newProject, setNewProject] = useState('');

  const [saving, setSaving] = useState(false);

  const handleAddSkill = () => {
    if (!newSkillId) return;
    if (skills.some(s => s.skillId === newSkillId)) {
      onShowToast('This skill is already in your profile.');
      return;
    }
    setSkills(prev => [...prev, { skillId: newSkillId, level: newLevel, yearsExperience: newYears }]);
  };

  const handleRemoveSkill = (skillId: string) => {
    setSkills(prev => prev.filter(s => s.skillId !== skillId));
  };

  const handleAddProject = () => {
    const trimmed = newProject.trim();
    if (!trimmed) return;
    if (topProjects.includes(trimmed)) return;
    setTopProjects(prev => [...prev, trimmed]);
    setNewProject('');
  };

  const handleRemoveProject = (index: number) => {
    setTopProjects(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch('/api/employee-profile', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          title: title.trim(),
          department: department.trim(),
          team: team.trim(),
          location: location.trim(),
          availabilityPercent,
          hoursPerWeekFree,
          skills,
          topProjects,
          version: employee.version
        })
      });

      if (!res.ok) {
        throw new Error(res.error || 'Failed to save profile');
      }

      await onSaveSuccess();
      onShowToast('Profile and skills updated successfully!');
      onClose();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Error updating profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-6 bg-surface-alt">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 px-2.5 py-0.5 text-xs font-semibold text-teal-700 dark:text-teal-300 mb-1 border border-teal-500/20">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-500" /> Employee Profile Wizard
            </div>
            <h2 className="text-xl font-bold text-text-primary">Edit Your Profile & Skills</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Customize your details, capacity, and technical skill graph anytime.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-text-muted hover:text-text-primary hover:bg-surface border border-transparent hover:border-border transition-all"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Progress Bar */}
        <div className="border-b border-border bg-surface px-6 py-4">
          <div className="relative flex items-center justify-between max-w-md mx-auto">
            {/* Connecting Line */}
            <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-0.5 bg-border -z-0">
              <div
                className="h-full bg-teal-500 transition-all duration-300"
                style={{
                  width: currentStep === 1 ? '0%' : currentStep === 2 ? '50%' : '100%'
                }}
              />
            </div>

            {/* Step 1 Circle */}
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="relative z-10 flex flex-col items-center group cursor-pointer focus:outline-none"
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  currentStep === 1
                    ? 'bg-teal-500 text-white ring-4 ring-teal-500/20 shadow-xs'
                    : currentStep > 1
                    ? 'bg-teal-600 text-white'
                    : 'bg-surface border-2 border-border text-text-muted'
                }`}
              >
                {currentStep > 1 ? <Check className="w-4 h-4 stroke-[3]" /> : '1'}
              </div>
              <span className={`text-[11px] font-semibold mt-1.5 transition-colors ${
                currentStep === 1 ? 'text-teal-600 dark:text-teal-400' : 'text-text-muted'
              }`}>
                Personal Info
              </span>
            </button>

            {/* Step 2 Circle */}
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="relative z-10 flex flex-col items-center group cursor-pointer focus:outline-none"
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  currentStep === 2
                    ? 'bg-teal-500 text-white ring-4 ring-teal-500/20 shadow-xs'
                    : currentStep > 2
                    ? 'bg-teal-600 text-white'
                    : 'bg-surface border-2 border-border text-text-muted'
                }`}
              >
                {currentStep > 2 ? <Check className="w-4 h-4 stroke-[3]" /> : '2'}
              </div>
              <span className={`text-[11px] font-semibold mt-1.5 transition-colors ${
                currentStep === 2 ? 'text-teal-600 dark:text-teal-400' : 'text-text-muted'
              }`}>
                Skills & Endorsements
              </span>
            </button>

            {/* Step 3 Circle */}
            <button
              type="button"
              onClick={() => setCurrentStep(3)}
              className="relative z-10 flex flex-col items-center group cursor-pointer focus:outline-none"
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  currentStep === 3
                    ? 'bg-teal-500 text-white ring-4 ring-teal-500/20 shadow-xs'
                    : 'bg-surface border-2 border-border text-text-muted'
                }`}
              >
                3
              </div>
              <span className={`text-[11px] font-semibold mt-1.5 transition-colors ${
                currentStep === 3 ? 'text-teal-600 dark:text-teal-400' : 'text-text-muted'
              }`}>
                Projects & Highlights
              </span>
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ── Step 1: Personal Info & Capacity ────────────────────── */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-2">
                  <User className="w-4 h-4 text-teal-500" /> Basic Details
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-text-primary mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      placeholder="e.g. Alex Chen"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-primary mb-1">Job Title / Role</label>
                    <input
                      type="text"
                      required
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      placeholder="e.g. Senior Software Engineer"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-primary mb-1">Department</label>
                    <select
                      value={department}
                      onChange={e => setDepartment(e.target.value)}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      <option value="Engineering">Engineering</option>
                      <option value="Product">Product</option>
                      <option value="Cloud & Infrastructure">Cloud & Infrastructure</option>
                      <option value="Data & Analytics">Data & Analytics</option>
                      <option value="Information Security">Information Security</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-primary mb-1">Team</label>
                    <input
                      type="text"
                      value={team}
                      onChange={e => setTeam(e.target.value)}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      placeholder="e.g. Core Payments"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-text-primary mb-1">Location</label>
                    <input
                      type="text"
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      placeholder="e.g. San Francisco, CA or Remote"
                    />
                  </div>
                </div>
              </div>

              {/* Capacity Section */}
              <div className="space-y-3 pt-4 border-t border-border">
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-2">
                  <Clock className="w-4 h-4 text-teal-500" /> Availability & Bandwidth
                </h3>
                <div className="rounded-2xl border border-border bg-surface-alt p-4 space-y-3 shadow-xs">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-text-muted">Available Bandwidth:</span>
                    <span className="text-teal-600 dark:text-teal-400 font-bold">{availabilityPercent}% ({hoursPerWeekFree} hrs/week)</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={availabilityPercent}
                    onChange={e => {
                      const val = Number(e.target.value);
                      setAvailabilityPercent(val);
                      setHoursPerWeekFree(Math.round((val / 100) * 40));
                    }}
                    className="w-full accent-teal-500 cursor-pointer h-2 bg-surface rounded-lg appearance-none"
                  />
                  <div className="flex gap-2">
                    {[
                      { label: 'Full (40h)', pct: 100, hrs: 40 },
                      { label: 'Part (20h)', pct: 50, hrs: 20 },
                      { label: 'Side (10h)', pct: 25, hrs: 10 },
                      { label: 'Busy (0h)', pct: 0, hrs: 0 },
                    ].map(p => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          setAvailabilityPercent(p.pct);
                          setHoursPerWeekFree(p.hrs);
                        }}
                        className={`flex-1 rounded-xl border py-1.5 text-xs font-semibold transition-all ${
                          availabilityPercent === p.pct
                            ? 'border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300'
                            : 'border-border bg-surface text-text-muted hover:text-text-primary'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Technical Skills Management ──────────────────── */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                    <Layers className="w-4 h-4 text-teal-500" /> Technical Skills Graph ({skills.length})
                  </h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    Select your technologies and proficiency levels
                  </p>
                </div>
              </div>

              {/* Add Skill Panel */}
              <div className="rounded-2xl border border-teal-500/20 bg-teal-500/[0.03] p-4 space-y-4 shadow-xs">
                <div className="text-xs font-bold text-teal-700 dark:text-teal-300 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-teal-500" /> Add a Technical Skill
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-text-muted mb-1">Skill or Tool</label>
                    <select
                      value={newSkillId}
                      onChange={e => setNewSkillId(e.target.value)}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:border-teal-500 focus:outline-none"
                    >
                      {CSV_DATA.skillsData.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.category})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-text-muted mb-1">Years Experience</label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={newYears}
                      onChange={e => setNewYears(Math.max(1, Number(e.target.value)))}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Choice Cards for Proficiency Levels */}
                <div>
                  <label className="block text-[11px] font-semibold text-text-muted mb-2">Proficiency Level</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {PROFICIENCY_LEVELS.map(({ level, label, desc }) => {
                      const isSelected = newLevel === level;
                      return (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setNewLevel(level)}
                          className={`rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'border-teal-500 bg-teal-500/10 ring-2 ring-teal-500/20 shadow-xs'
                              : 'border-border bg-surface hover:border-border/80'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold ${isSelected ? 'text-teal-700 dark:text-teal-300' : 'text-text-primary'}`}>
                              {label}
                            </span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-teal-600" />}
                          </div>
                          <p className="text-[10px] text-text-muted mt-0.5 line-clamp-1">{desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddSkill}
                  className="w-full rounded-xl py-2 text-xs font-semibold flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white transition-all shadow-xs"
                >
                  <Plus className="w-4 h-4" /> Add This Skill to Profile
                </button>
              </div>

              {/* Current Skills Review Chips */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-semibold text-text-muted">
                  <span>Current Profile Skills ({skills.length}):</span>
                  {skills.length > 0 && <span className="text-[11px]">Click trash icon to remove</span>}
                </div>

                {skills.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                    {skills.map(skill => {
                      const meta = CSV_DATA.skillsData.find(s => s.id === skill.skillId);
                      return (
                        <div
                          key={skill.skillId}
                          className="flex items-center justify-between rounded-xl border border-border bg-surface p-3 text-xs shadow-2xs hover:border-teal-500/30 transition-all"
                        >
                          <div className="min-w-0 pr-2">
                            <strong className="block truncate text-text-primary font-bold">{meta?.name || skill.skillId}</strong>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-700 dark:text-teal-300">
                                {skill.level}
                              </span>
                              <span className="text-[11px] text-text-muted">
                                {skill.yearsExperience}y exp
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveSkill(skill.skillId)}
                            className="rounded-lg p-1.5 text-danger/70 hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
                            title="Remove skill"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-text-muted">
                    No skills added yet. Select a skill above and click &quot;Add This Skill to Profile&quot;.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3: Key Projects & Highlights ───────────────────── */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-teal-500" /> Key Projects & Career Highlights
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Showcase high-impact initiatives, architecture overhauls, or key deliveries.
                </p>
              </div>

              {topProjects.length > 0 ? (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-text-muted">Active Highlights ({topProjects.length}):</span>
                  <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {topProjects.map((p, idx) => (
                      <li
                        key={idx}
                        className="flex items-center justify-between rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs shadow-2xs hover:border-teal-500/30 transition-all"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <div className="h-2 w-2 rounded-full bg-teal-500 shrink-0" />
                          <span className="truncate text-text-primary font-medium">{p}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveProject(idx)}
                          className="text-danger/70 hover:text-danger p-1 rounded-md hover:bg-danger/10 transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-text-muted">
                  No projects added yet. Add projects below to strengthen your internal profile.
                </div>
              )}

              {/* Add Project Input */}
              <div className="rounded-2xl border border-border bg-surface-alt p-4 space-y-2 shadow-xs">
                <label className="block text-xs font-semibold text-text-primary">Add New Project or Highlight</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newProject}
                    onChange={e => setNewProject(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddProject();
                      }
                    }}
                    placeholder="e.g. Architected Realtime Payments Kafka Pipeline"
                    className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:border-teal-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddProject}
                    className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-text-primary hover:bg-surface-alt transition-colors shrink-0 shadow-2xs"
                  >
                    Add Highlight
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div>
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={() => setCurrentStep((currentStep - 1) as 1 | 2)}
                  className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-text-primary hover:bg-surface-alt transition-colors flex items-center gap-1.5"
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-text-primary hover:bg-surface-alt transition-colors"
              >
                Cancel
              </button>

              {currentStep < 3 ? (
                <button
                  type="button"
                  onClick={() => setCurrentStep((currentStep + 1) as 2 | 3)}
                  className="aurora-btn-primary rounded-xl px-4 py-2 text-xs font-semibold flex items-center gap-1.5 text-white transition-all shadow-xs"
                >
                  Next Step <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={saving}
                  className="aurora-btn-primary rounded-xl px-5 py-2 text-xs font-semibold flex items-center gap-2 text-white transition-all shadow-xs disabled:opacity-50"
                >
                  {saving ? (
                    <span>Saving Changes…</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" /> Save Profile & Skills
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
