import React, { useState } from 'react';
import { 
  X, 
  ShieldCheck, 
  ShieldAlert, 
  GitPullRequest, 
  Layers, 
  Sparkles, 
  AlertCircle,
  Trash2
} from 'lucide-react';
import { Employee, EmployeeSkill, ToastUndoAction } from '../../types';
import { CompanyUser } from '../auth/AuthModal';
import { CSV_DATA } from '../../services/dataLoader';
import { apiFetch } from '../../services/apiClient';

interface EvidenceModalProps {
  employee: Employee | null;
  skillName: string | null;
  onClose: () => void;
  currentUser?: CompanyUser | null;
  onShowToast?: (message: string, undoAction?: ToastUndoAction) => void;
  onReloadData?: () => Promise<void>;
}

export const EvidenceModal: React.FC<EvidenceModalProps> = ({
  employee,
  skillName,
  onClose,
  currentUser,
  onShowToast,
  onReloadData
}) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!employee || !skillName) return null;

  const targetSkill: EmployeeSkill | undefined = employee.skills.find(
    s => s.skillName.toLowerCase() === skillName.toLowerCase()
  );

  const taxonomy = CSV_DATA.skillsData.find(
    t => t.name.toLowerCase() === skillName.toLowerCase() ||
         t.synonyms.some(syn => syn.toLowerCase() === skillName.toLowerCase())
  );

  const hasSkill = Boolean(targetSkill);
  const proficiencyScore = targetSkill ? targetSkill.proficiencyScore : 0;
  const confidenceScore = targetSkill ? targetSkill.confidenceScore : 0;
  const proficiencyLevel = targetSkill ? targetSkill.proficiencyLevel : 'Skill Gap';

  const canDelete = Boolean(
    currentUser &&
    (currentUser.role === 'HR_Admin' ||
      currentUser.email?.toLowerCase() === employee?.email?.toLowerCase() ||
      currentUser.user_id === employee?.id)
  );

  const handleDeleteItem = async (itemId: string, itemTitle: string) => {
    setDeletingId(itemId);
    try {
      const res = await apiFetch(`/api/evidence/${itemId}`, { method: 'DELETE' });
      if (res.ok) {
        if (onReloadData) await onReloadData();
        onShowToast?.(`Evidence "${itemTitle}" deleted.`, {
          label: 'Undo',
          durationSeconds: 10,
          onUndo: async () => {
            await apiFetch(`/api/evidence/${itemId}/undo-delete`, { method: 'POST' });
            if (onReloadData) await onReloadData();
            onShowToast?.(`Evidence "${itemTitle}" restored.`);
          }
        });
      } else {
        onShowToast?.(res.error || 'Failed to delete evidence.');
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl space-y-0">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-border flex items-center justify-between bg-surface-muted/60">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold border ${
              hasSkill 
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
            }`}>
              {hasSkill ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-sora font-semibold text-text-primary">
                  Evidence Breakdown: {skillName}
                </h3>
                <span className={`text-2xs font-bold px-2 py-0.5 rounded-full border ${
                  hasSkill
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                }`}>
                  {hasSkill ? proficiencyLevel : 'Unassessed'}
                </span>
              </div>
              <p className="text-2xs text-text-muted mt-0.5">
                Inspecting competency and evidence logs for <strong className="text-text-primary">{employee.name}</strong> ({employee.role})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-elevated flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          
          {/* Proficiency Index Card */}
          <div className="bg-surface-muted border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-sora font-semibold text-text-muted uppercase tracking-wider">
                Computed Proficiency Index
              </span>
              <div className="flex items-baseline gap-2.5 mt-0.5">
                <span className={`text-3xl font-sora font-black font-mono tabular-nums ${hasSkill ? 'text-[#B14AFF]' : 'text-text-muted'}`}>
                  {proficiencyScore}/100
                </span>
                <span className={`text-xs font-bold font-mono tabular-nums ${hasSkill ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {confidenceScore}% Confidence Score
                </span>
              </div>
            </div>

            <div className="text-2xs text-text-muted space-y-1 bg-surface p-3 rounded-xl border border-border shadow-2xs">
              <div className="flex items-center justify-between gap-4">
                <span>Production Work:</span>
                <strong className="text-emerald-500 font-mono tabular-nums font-bold">1.5x Weight</strong>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Certifications:</span>
                <strong className="text-[#B14AFF] font-mono tabular-nums font-bold">1.2x Weight</strong>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Self-Declared:</span>
                <strong className="text-text-muted font-mono tabular-nums">0.5x Weight</strong>
              </div>
            </div>
          </div>

          {/* Taxonomy & Synonym Mappings */}
          {taxonomy && (
            <div className="bg-surface-muted/50 border border-border rounded-xl p-3.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider">
                <Layers className="w-3.5 h-3.5 text-[#B14AFF]" />
                <span>Taxonomy &amp; Synonym Mappings</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-text-muted text-2xs">Recognized terms:</span>
                {taxonomy.synonyms.map((syn, idx) => (
                  <span key={idx} className="text-[10px] font-mono bg-surface text-[#B14AFF] border border-border px-2 py-0.5 rounded-md">
                    &quot;{syn}&quot;
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Work Artifacts or Missing Gap Explanation */}
          <div className="space-y-3">
            <h4 className="text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#B14AFF]" />
              <span>Work Artifacts &amp; Proofs ({targetSkill?.evidenceList.length || 0})</span>
            </h4>

            {targetSkill && targetSkill.evidenceList.length > 0 ? (
              <div className="space-y-3">
                {targetSkill.evidenceList.map((item) => (
                  <div key={item.id} className="p-4 bg-surface-muted rounded-xl border border-border hover:border-[#B14AFF]/40 transition-all space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#B14AFF]/10 text-[#B14AFF] border border-[#B14AFF]/20">
                            {item.type} • Complexity <span className="font-mono tabular-nums">{item.complexityScore}</span>/5
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            item.verified
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : 'bg-surface-alt text-text-muted border border-border'
                          }`}>
                            {item.verified ? 'Verified proof' : 'Self-reported'}
                          </span>
                        </div>
                        <h5 className="text-xs font-sora font-semibold text-text-primary mt-1.5">{item.title}</h5>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className="text-2xs font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          {item.weightMultiplier}x Weight
                        </span>
                        {canDelete && (
                          <button
                            type="button"
                            disabled={deletingId === item.id}
                            onClick={() => handleDeleteItem(item.id, item.title)}
                            className="p-1 rounded-lg text-text-muted hover:text-red-500 hover:bg-surface-elevated transition-colors cursor-pointer"
                            title="Delete evidence (10s undo window)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-text-muted leading-relaxed">{item.description}</p>

                    <div className="pt-2 border-t border-border flex items-center justify-between text-2xs text-text-muted">
                      <span className="font-mono text-[#B14AFF] flex items-center gap-1">
                        <GitPullRequest className="w-3.5 h-3.5" /> Source: {item.verificationSource}
                      </span>
                      {item.prsMerged && (
                        <span className="font-semibold font-mono tabular-nums text-emerald-500">
                          {item.prsMerged} PRs Merged ({item.commitsCount || 0} Commits)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : hasSkill ? (
              <div className="p-6 text-center bg-surface-muted/50 rounded-xl border border-border text-xs text-text-muted space-y-1">
                <p className="font-sora font-semibold text-text-primary">Declared skill without logged production code artifacts</p>
                <p>Proficiency is currently estimated based on initial declaration and project involvement.</p>
              </div>
            ) : (
              <div className="p-6 bg-amber-500/5 border border-amber-500/20 rounded-xl text-xs space-y-2">
                <div className="flex items-center gap-2 font-sora font-semibold text-amber-600 dark:text-amber-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Target Skill Gap Identified</span>
                </div>
                <p className="text-text-muted leading-relaxed">
                  <strong className="text-text-primary">{employee.name}</strong> does not currently have logged evidence or declared proficiency for <strong className="text-text-primary">{skillName}</strong> in company repository audit logs.
                </p>
                <p className="text-text-muted/80">
                  This requirement was requested by your search query, so it was flagged as an upskilling gap.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-border bg-surface-muted/60 flex items-center justify-between text-2xs text-text-muted">
          <span>Evidence tracked in SkillGraph Audit Log &amp; repository integrations</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-surface border border-border hover:bg-surface-elevated text-text-primary font-sora font-semibold text-xs transition-colors shadow-2xs cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
