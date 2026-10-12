import React from 'react';
import { X, ShieldCheck, ArrowRight, Users } from 'lucide-react';
import { Employee } from '../../types';
import { Avatar } from '../ui/Avatar';

interface CompareModalProps {
  candidates: Employee[];
  onClose: () => void;
  onSelectEmployee: (emp: Employee) => void;
}

export const CompareModal: React.FC<CompareModalProps> = ({
  candidates,
  onClose,
  onSelectEmployee
}) => {
  if (candidates.length === 0) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-surface border border-border rounded-3xl w-full max-w-5xl overflow-hidden shadow-2xl space-y-0 my-auto animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-border flex items-center justify-between bg-surface-alt">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#19C3E6]/10 text-cyan-600 dark:text-cyan-400 border border-[#19C3E6]/20">
              <Users className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-text-primary font-sora">
                Side-by-Side Candidate Comparison
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Comparing {candidates.length} selected team candidate{candidates.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-surface hover:bg-surface-alt text-text-muted hover:text-text-primary border border-border flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-x-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 min-w-[700px]">
            {candidates.map((emp) => (
              <div key={emp.id} className="bg-surface-alt border border-border rounded-2xl p-5 space-y-4 shadow-xs hover:border-[#19C3E6]/40 transition-colors">
                <div className="flex items-center gap-3.5 border-b border-border/80 pb-4">
                  <Avatar name={emp.name} className="h-12 w-12 rounded-xl text-xs ring-2 ring-[#19C3E6]/20" />
                  <div className="min-w-0">
                    <h4 className="text-sm font-extrabold text-text-primary truncate font-sora">{emp.name}</h4>
                    <p className="text-xs text-text-muted truncate">{emp.role}</p>
                    <p className="text-[11px] text-text-muted mt-0.5 truncate">{emp.department} • {emp.team}</p>
                  </div>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-text-muted">Availability:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">{emp.availabilityPercent}% Free</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-text-muted">Location:</span>
                    <span className="font-medium text-text-primary">{emp.location}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-text-muted">Tenure:</span>
                    <span className="font-medium text-text-primary font-mono tabular-nums">{emp.yearsExperience || 0} yrs</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-text-muted">Department:</span>
                    <span className="font-medium text-text-primary">{emp.department}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Top Verified Skills</span>
                  <div className="space-y-1.5">
                    {emp.skills.slice(0, 4).map((sk, idx) => (
                      <div key={idx} className="p-2.5 rounded-xl bg-surface border border-border flex items-center justify-between text-xs shadow-2xs">
                        <span className="font-bold text-text-primary truncate pr-1">{sk.skillName}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-cyan-600 dark:text-cyan-400 font-semibold text-[11px]">{sk.proficiencyLevel}</span>
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-0.5 font-mono tabular-nums">
                            <ShieldCheck className="w-3 h-3" /> {sk.evidenceCount}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => {
                      onSelectEmployee(emp);
                      onClose();
                    }}
                    className="aurora-btn-primary w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 text-white shadow-xs transition-all cursor-pointer"
                  >
                    Select Candidate <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
