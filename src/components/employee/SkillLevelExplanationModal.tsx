import React, { useEffect, useState } from 'react';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  Info,
  TrendingUp,
  Award,
  Clock,
  Layers,
  Sparkles,
  GitPullRequest,
  CheckCircle2,
  AlertTriangle,
  ArrowRight
} from 'lucide-react';
import { apiFetch } from '../../services/apiClient';

interface FactorBreakdown {
  base_weight: number;
  duration_factor: number;
  complexity_factor: number;
  role_factor: number;
  share: number;
  recency_decay: number;
  verification_factor: number;
  diminishing_returns: number;
}

interface ContributionItem {
  evidence_id: string;
  title: string;
  evidence_type: string;
  verification_status: string;
  artifact_date: string;
  is_duplicate: boolean;
  is_expired: boolean;
  factors: FactorBreakdown;
  raw_points: number;
  net_points: number;
}

interface SkillExplanationData {
  skill_id: string;
  skill_name: string;
  employee_id: string;
  employee_name: string;
  level: number;
  level_name: string;
  claimed_level?: string;
  evidenced_level?: string;
  points: number;
  display_score: number;
  thresholds: Record<number, number>;
  ordered_contributions: ContributionItem[];
  evidence_strength: string;
  years_experience: number;
  last_used: string;
  is_stale: boolean;
  confidence_score: number;
  confidence_breakdown: {
    source_trust: number;
    recency_factor: number;
    count_factor: number;
  };
  next_level_guidance: string;
}

interface SkillLevelExplanationModalProps {
  employeeId: string;
  skillId: string;
  skillName: string;
  onClose: () => void;
}

export const SkillLevelExplanationModal: React.FC<SkillLevelExplanationModalProps> = ({
  employeeId,
  skillId,
  skillName,
  onClose
}) => {
  const [data, setData] = useState<SkillExplanationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    const endpoint = `/api/employees/${employeeId}/skills/${skillId}/explanation`;
    apiFetch<SkillExplanationData>(endpoint)
      .then(async res => {
        if (!res.ok && (res.status === 403 || res.status === 404)) {
          // Graceful fallback to token-authenticated employee endpoint
          const fallbackRes = await apiFetch<SkillExplanationData>(`/api/employee/skills/${skillId}/explanation`);
          if (fallbackRes.ok && fallbackRes.data) {
            if (isMounted) {
              setData(fallbackRes.data);
              setLoading(false);
            }
            return;
          }
        }
        if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`);
        if (isMounted) {
          setData(res.data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          setError(err.message || 'Failed to load skill explanation.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [employeeId, skillId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-surface border border-border rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between bg-surface-muted/60">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-600 dark:text-teal-400 font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold font-sora text-text-primary">
                  {data?.skill_name || skillName}
                </h3>
                {data && (
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/30">
                    Level {data.level}: {data.level_name}
                  </span>
                )}
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                Deterministic proficiency evaluation &amp; scoring engine audit trail
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-elevated flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {loading && (
            <div className="py-16 text-center text-xs text-text-muted space-y-3">
              <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p>Evaluating skill proofs against scoring rules…</p>
            </div>
          )}

          {error && (
            <div className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4" /> Error loading evaluation breakdown
              </div>
              <p>{error}</p>
            </div>
          )}

          {data && !loading && (
            <>
              {/* Claimed vs Evidenced Header Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="rounded-2xl border border-border bg-surface-muted/50 p-4 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    Claimed Level
                  </span>
                  <div className="text-base font-bold text-text-primary">
                    {data.claimed_level || 'Self-declared'}
                  </div>
                  <div className="text-[11px] text-text-muted">
                    {data.years_experience > 0 ? `${data.years_experience} years experience` : 'Self-declared'}
                  </div>
                </div>

                <div className="rounded-2xl border border-teal-500/30 bg-teal-500/5 p-4 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                    Evidenced Level
                  </span>
                  <div className="text-base font-bold text-teal-700 dark:text-teal-300">
                    Level {data.level} ({data.level_name})
                  </div>
                  <div className="text-[11px] text-teal-600/80 dark:text-teal-400/80">
                    Deterministic calculation
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-surface-muted/50 p-4 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    Total Engine Points
                  </span>
                  <div className="text-base font-bold font-mono text-text-primary">
                    {data.points.toFixed(1)} pts
                  </div>
                  <div className="text-[11px] text-text-muted">
                    Display Score: {data.display_score}/100
                  </div>
                </div>
              </div>

              {/* Threshold Gates Ladder */}
              <div className="rounded-2xl border border-border bg-surface-muted/40 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-teal-500" /> Threshold Ladder &amp; Gates
                  </h4>
                  <span className="text-[11px] text-text-muted">
                    Current Points: <strong className="text-text-primary font-mono">{data.points.toFixed(1)}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-2 pt-1">
                  {[
                    { lvl: 1, name: 'Aware', defaultPts: 2.0 },
                    { lvl: 2, name: 'Guided', defaultPts: 4.0 },
                    { lvl: 3, name: 'Independent', defaultPts: 12.0 },
                    { lvl: 4, name: 'Advanced', defaultPts: 24.0 },
                    { lvl: 5, name: 'Expert', defaultPts: 44.0 }
                  ].map(t => {
                    const pts = data.thresholds[t.lvl] ?? (data.thresholds as any)[String(t.lvl)] ?? t.defaultPts;
                    const isUnlocked = data.level >= t.lvl;
                    const isCurrent = data.level === t.lvl;
                    return (
                      <div
                        key={t.lvl}
                        className={`rounded-xl border p-2.5 text-center transition-all ${
                          isCurrent
                            ? 'border-teal-500 bg-teal-500/15 shadow-2xs ring-1 ring-teal-500/40'
                            : isUnlocked
                            ? 'border-emerald-500/30 bg-emerald-500/5'
                            : 'border-border bg-surface/50 opacity-60'
                        }`}
                      >
                        <div className={`text-[10px] font-bold uppercase tracking-wider ${
                          isCurrent ? 'text-teal-700 dark:text-teal-300' : isUnlocked ? 'text-emerald-600' : 'text-text-muted'
                        }`}>
                          Lvl {t.lvl}
                        </div>
                        <div className="text-xs font-bold text-text-primary mt-0.5 truncate">
                          {t.name}
                        </div>
                        <div className="text-[10px] font-mono text-text-muted mt-1">
                          {pts} pts
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Next Level Guidance & Anti-Gaming Ceilings */}
              <div className="rounded-2xl border border-teal-500/20 bg-teal-500/5 p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-teal-700 dark:text-teal-300">
                  <Info className="w-4 h-4 text-teal-500 shrink-0" />
                  <span>Next Level Progression Guidance</span>
                </div>
                <p className="text-xs text-text-muted leading-relaxed pl-5">
                  {data.next_level_guidance}
                </p>
              </div>

              {/* Confidence Score Breakdown */}
              <div className="rounded-2xl border border-border bg-surface-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-teal-500" /> Evidence Confidence: {data.confidence_score}%
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-surface border border-border text-text-muted">
                    Strength: {data.evidence_strength}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2.5 text-xs">
                  <div className="bg-surface rounded-xl p-2.5 border border-border text-center">
                    <div className="text-[10px] text-text-muted uppercase font-bold">Source Trust</div>
                    <div className="text-sm font-bold font-mono text-text-primary mt-0.5">
                      {Math.round((data.confidence_breakdown?.source_trust || 0.5) * 100)}%
                    </div>
                  </div>
                  <div className="bg-surface rounded-xl p-2.5 border border-border text-center">
                    <div className="text-[10px] text-text-muted uppercase font-bold">Recency Factor</div>
                    <div className="text-sm font-bold font-mono text-text-primary mt-0.5">
                      {Math.round((data.confidence_breakdown?.recency_factor || 0.5) * 100)}%
                    </div>
                  </div>
                  <div className="bg-surface rounded-xl p-2.5 border border-border text-center">
                    <div className="text-[10px] text-text-muted uppercase font-bold">Coverage</div>
                    <div className="text-sm font-bold font-mono text-text-primary mt-0.5">
                      {Math.round((data.confidence_breakdown?.count_factor || 0.5) * 100)}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Granular Evidence Contributions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-teal-500" /> Granular Point Contributions ({data.ordered_contributions?.length || 0})
                  </h4>
                  <span className="text-[11px] text-text-muted">
                    Formula: Base × Dur × Comp × Role × Share × Recency × Status × Diminishing
                  </span>
                </div>

                {(!data.ordered_contributions || data.ordered_contributions.length === 0) ? (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-text-muted">
                    No individual work artifacts recorded yet. Base points are granted from baseline profile declaration.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {data.ordered_contributions.map((item, idx) => (
                      <div
                        key={idx}
                        className={`rounded-xl border p-3.5 space-y-2 transition-all ${
                          item.is_duplicate
                            ? 'border-amber-500/20 bg-amber-500/5'
                            : 'border-border bg-surface hover:border-teal-500/30'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
                                {item.evidence_type}
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                item.verification_status === 'Verified by HR'
                                  ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                                  : item.verification_status === 'Link checked'
                                  ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                                  : 'bg-surface-alt text-text-muted border border-border'
                              }`}>
                                {item.verification_status}
                              </span>
                              {item.is_duplicate && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                  Duplicate (0 pts)
                                </span>
                              )}
                              {item.is_expired && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20">
                                  Expired
                                </span>
                              )}
                            </div>
                            <h5 className="text-xs font-bold text-text-primary mt-1.5">{item.title}</h5>
                            <span className="text-[11px] text-text-muted">
                              Date: {item.artifact_date || 'N/A'}
                            </span>
                          </div>

                          <div className="text-right">
                            <div className="text-sm font-bold font-mono text-teal-600 dark:text-teal-400">
                              +{item.net_points.toFixed(2)} pts
                            </div>
                            <div className="text-[10px] text-text-muted font-mono">
                              Raw: {item.raw_points.toFixed(2)}
                            </div>
                          </div>
                        </div>

                        {/* Factors Pill Row */}
                        {item.factors && (
                          <div className="flex items-center gap-2 flex-wrap pt-1 text-[10px] text-text-muted font-mono border-t border-border/50">
                            <span>Base: {item.factors.base_weight}</span>
                            <span>•</span>
                            <span>Dur: {item.factors.duration_factor}x</span>
                            <span>•</span>
                            <span>Comp: {item.factors.complexity_factor}x</span>
                            <span>•</span>
                            <span>Role: {item.factors.role_factor}x</span>
                            <span>•</span>
                            <span>Recency: {item.factors.recency_decay}x</span>
                            <span>•</span>
                            <span>Verif: {item.factors.verification_factor}x</span>
                            <span>•</span>
                            <span>Diminish: {item.factors.diminishing_returns}x</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-surface-muted/60 flex items-center justify-between text-xs text-text-muted">
          <span>Evaluated via Single Deterministic Scoring Engine</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs transition-colors shadow-2xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
