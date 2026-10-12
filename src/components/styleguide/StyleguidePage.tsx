import React, { useState } from 'react';
import {
  Sparkles, Sun, Moon, Laptop, ArrowLeft,
  CheckCircle2, AlertTriangle, Shield, UserRound,
  Briefcase, Search, Bell, AlertCircle, Eye,
  Clock, Award, Layers, MousePointer
} from 'lucide-react';
import {
  Button, IconButton, Input, Select, Textarea, Checkbox, Radio, Toggle, Slider,
  Badge, Card, Modal, Drawer, Tooltip, Table, TableHeader,
  TableRow, TableHead, TableCell, ProgressBar, ProgressRing,
  Avatar, Skeleton, EmptyState, ErrorState, Tabs, AmbientCursorGlow
} from '../ui';
import { Theme, applyTheme, getInitialTheme } from '../../services/theme';

export const StyleguidePage: React.FC<{ onBack?: () => void; onShowToast?: (msg: string) => void }> = ({ onBack, onShowToast }) => {
  const [currentTheme, setCurrentTheme] = useState<Theme>(getInitialTheme());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [toggleState, setToggleState] = useState(true);
  const [radioSelected, setRadioSelected] = useState('opt-1');
  const [sliderValue, setSliderValue] = useState(72);
  const [activeTab, setActiveTab] = useState('overview');
  const [cursorDemoActive, setCursorDemoActive] = useState(true);

  const handleThemeChange = (newTheme: Theme) => {
    setCurrentTheme(newTheme);
    applyTheme(newTheme);
  };

  return (
    <div className="min-h-screen bg-background text-body p-6 sm:p-10 font-sans transition-colors duration-base relative">
      <AmbientCursorGlow />
      <div className="max-w-6xl mx-auto space-y-12 relative z-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-6">
          <div>
            <div className="flex items-center gap-3">
              {onBack && (
                <button
                  onClick={onBack}
                  className="rounded-button p-2 text-muted hover:bg-surface-alt hover:text-ink transition-colors"
                  aria-label="Back to App"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl overflow-hidden shadow-glow border border-border shrink-0 bg-[#0B1020]">
                  <img src="/logo.jpg" alt="SkillGraph Logo" className="h-full w-full object-cover" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-page-title font-heading text-ink">
                      Aurora Ink Design System
                    </h1>
                    <Badge variant="aurora" size="sm">Phase 1 Tokens</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    Unique, premium, calm identity for SkillGraph: Deep Ink base with violet-to-cyan Aurora gradient &amp; amber highlights.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Theme switcher */}
          <div className="flex items-center gap-1 rounded-card border border-border bg-surface p-1 shadow-xs">
            <button
              onClick={() => handleThemeChange('light')}
              className={`flex items-center gap-1.5 rounded-button px-3 py-1.5 text-xs font-semibold transition-all duration-base ${
                currentTheme === 'light' ? 'bg-aurora text-white shadow-xs' : 'text-muted hover:text-ink'
              }`}
            >
              <Sun className="h-3.5 w-3.5" />
              <span>Light</span>
            </button>
            <button
              onClick={() => handleThemeChange('dark')}
              className={`flex items-center gap-1.5 rounded-button px-3 py-1.5 text-xs font-semibold transition-all duration-base ${
                currentTheme === 'dark' ? 'bg-aurora text-white shadow-xs' : 'text-muted hover:text-ink'
              }`}
            >
              <Moon className="h-3.5 w-3.5" />
              <span>Dark</span>
            </button>
            <button
              onClick={() => handleThemeChange('system')}
              className={`flex items-center gap-1.5 rounded-button px-3 py-1.5 text-xs font-semibold transition-all duration-base ${
                currentTheme === 'system' ? 'bg-aurora text-white shadow-xs' : 'text-muted hover:text-ink'
              }`}
            >
              <Laptop className="h-3.5 w-3.5" />
              <span>System</span>
            </button>
          </div>
        </div>

        {/* 1. Signature Brand & Aurora Gradient */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-section-title font-heading text-ink">1. Signature Identity &amp; Aurora Gradient</h2>
            <span className="text-xs text-muted font-mono">linear-gradient(135deg, #6D4AFF 0%, #19C3E6 100%)</span>
          </div>
          <div className="h-16 w-full rounded-card bg-aurora shadow-glow flex items-center justify-between px-6 text-white font-heading font-semibold text-sm">
            <span>Aurora Signature Gradient (Primary CTA, Active Indicators, Rings, Brand Panel)</span>
            <span className="text-xs font-sans font-normal opacity-90">Violet #6D4AFF ➔ Cyan #19C3E6</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 pt-2">
            <div className="rounded-card border border-border bg-surface p-3 text-xs shadow-card">
              <div className="h-10 w-full rounded-button bg-primary mb-2 shadow-sm" />
              <div className="font-semibold text-ink">Primary Violet</div>
              <div className="text-2xs text-muted">#6D4AFF (Lifts to #8B6CFF)</div>
            </div>
            <div className="rounded-card border border-border bg-surface p-3 text-xs shadow-card">
              <div className="h-10 w-full rounded-button bg-cyan mb-2 shadow-sm" />
              <div className="font-semibold text-ink">Aurora Cyan</div>
              <div className="text-2xs text-muted">#19C3E6 (Secondary)</div>
            </div>
            <div className="rounded-card border border-border bg-surface p-3 text-xs shadow-card">
              <div className="h-10 w-full rounded-button bg-highlight mb-2 shadow-sm" />
              <div className="font-semibold text-ink">Highlight Amber</div>
              <div className="text-2xs text-muted">#FFB547 (Near-Qualified)</div>
            </div>
            <div className="rounded-card border border-border bg-surface p-3 text-xs shadow-card">
              <div className="h-10 w-full rounded-button bg-[#0B1020] mb-2 shadow-sm" />
              <div className="font-semibold text-ink">Deep Ink Base</div>
              <div className="text-2xs text-muted">#0B1020 Headings / Shell</div>
            </div>
            <div className="rounded-card border border-border bg-surface p-3 text-xs shadow-card">
              <div className="h-10 w-full rounded-button bg-surface border border-border mb-2" />
              <div className="font-semibold text-ink">Surface &amp; Canvas</div>
              <div className="text-2xs text-muted">#F6F7FB Light / #070B16 Dark</div>
            </div>
            <div className="rounded-card border border-border bg-surface p-3 text-xs shadow-card">
              <div className="h-10 w-full rounded-button bg-surface-raised border border-border mb-2 shadow-md" />
              <div className="font-semibold text-ink">Raised Surface</div>
              <div className="text-2xs text-muted">#FFFFFF Light / #141B2F Dark</div>
            </div>
          </div>
        </section>

        {/* 2. Role Accents */}
        <section className="space-y-4">
          <h2 className="text-section-title font-heading text-ink">2. Role Accent Tokens (Small Touches Only)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card padding="md" className="flex items-center gap-3.5 border-l-4 border-l-[#10B981]">
              <Avatar name="Alex Chen" role="Employee" size="lg" />
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-heading font-semibold text-sm text-ink">Employee Workspace</h4>
                  <Badge variant="employee" size="sm">Emerald</Badge>
                </div>
                <p className="text-xs text-muted mt-0.5">Accent: #10B981 (Growth, Competencies, Hub)</p>
              </div>
            </Card>

            <Card padding="md" className="flex items-center gap-3.5 border-l-4 border-l-[#19C3E6]">
              <Avatar name="Sarah Jenkins" role="Manager" size="lg" />
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-heading font-semibold text-sm text-ink">Manager Console</h4>
                  <Badge variant="manager" size="sm">Cyan</Badge>
                </div>
                <p className="text-xs text-muted mt-0.5">Accent: #19C3E6 (Talent Search, Bench, Match)</p>
              </div>
            </Card>

            <Card padding="md" className="flex items-center gap-3.5 border-l-4 border-l-[#B14AFF]">
              <Avatar name="David Kim" role="HR_Admin" size="lg" />
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-heading font-semibold text-sm text-ink">HR Admin Suite</h4>
                  <Badge variant="hr" size="sm">Violet</Badge>
                </div>
                <p className="text-xs text-muted mt-0.5">Accent: #B14AFF (Org, Audit, User Mgmt)</p>
              </div>
            </Card>
          </div>
        </section>

        {/* 3. Typography & Hierarchy */}
        <section className="space-y-4">
          <h2 className="text-section-title font-heading text-ink">3. Typography Scale (Sora Headings + Inter Body)</h2>
          <Card padding="lg" className="space-y-5">
            <div className="border-b border-border/80 pb-4">
              <span className="text-xs font-mono text-muted uppercase tracking-[0.04em]">Hero Display — clamp(2.25rem, 4vw, 3.5rem) / 1.1</span>
              <div className="text-hero font-heading text-ink mt-1">
                Find the talent you already have
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div>
                  <span className="text-xs font-mono text-muted uppercase tracking-[0.04em]">Page Title (28/36 Sora 600)</span>
                  <div className="text-page-title font-heading text-ink">Enterprise Competency Network</div>
                </div>
                <div>
                  <span className="text-xs font-mono text-muted uppercase tracking-[0.04em]">Section Title (20/28 Sora 600)</span>
                  <div className="text-section-title font-heading text-ink">Verified Skill Breakdown</div>
                </div>
                <div>
                  <span className="text-xs font-mono text-muted uppercase tracking-[0.04em]">Card Title (16/24 Sora 600)</span>
                  <div className="text-card-title font-heading text-ink">Senior Cloud Security Architect</div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <span className="text-xs font-mono text-muted uppercase tracking-[0.04em]">Body Text (15/24 Inter 400)</span>
                  <p className="text-body text-body mt-1">
                    SkillSense autonomously maps organizational talent, verified proof artifacts, and internal marketplace opportunities using an explainable skills graph.
                  </p>
                </div>
                <div>
                  <span className="text-xs font-mono text-muted uppercase tracking-[0.04em]">Tabular Numbers &amp; Scores</span>
                  <div className="flex items-center gap-4 mt-1 font-semibold tabular-nums text-ink text-base">
                    <span>Fit Score: 94.2%</span>
                    <span>Readiness: 88%</span>
                    <span>Hours Free: 24/40</span>
                  </div>
                </div>
                <div>
                  <span className="text-xs font-mono text-muted uppercase tracking-[0.04em]">Uppercase Label (12-13/16 Medium +0.04em)</span>
                  <div className="text-label text-muted uppercase mt-1">SYSTEM AUDIT TRAIL LOG ENTRY</div>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* 4. Buttons & Interactive Controls */}
        <section className="space-y-4">
          <h2 className="text-section-title font-heading text-ink">4. Buttons &amp; Press Feedback</h2>
          <Card padding="lg" className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" size="lg">Large Primary (48px)</Button>
              <Button variant="primary" size="md">Default Primary (40px)</Button>
              <Button variant="primary" size="sm">Small Primary (36px)</Button>
              <Button variant="primary" isLoading size="md">Loading...</Button>
              <Button variant="primary" disabled size="md">Disabled (45%)</Button>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/80">
              <Button variant="secondary" size="md">Secondary Surface</Button>
              <Button variant="outline" size="md">Outline Primary</Button>
              <Button variant="accent" size="md">Cyan Accent</Button>
              <Button variant="danger" size="md">Danger Action</Button>
              <Button variant="ghost" size="md">Ghost Action</Button>
              <IconButton icon={<Bell className="h-4 w-4" />} aria-label="Notifications" variant="secondary" />
              <IconButton icon={<Search className="h-4 w-4" />} aria-label="Search" variant="primary" />
            </div>
          </Card>
        </section>

        {/* 5. Inputs & Form Primitives */}
        <section className="space-y-4">
          <h2 className="text-section-title font-heading text-ink">5. Form Inputs (44px Height, Clean Labels &amp; Focus Rings)</h2>
          <Card padding="lg" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            <Input
              label="Natural Language Talent Query"
              placeholder="e.g. React, Kubernetes, FinTech"
              leftIcon={<Search className="h-4 w-4" />}
              helperText="Searches across 203 verified personnel"
            />
            <Input
              label="Corporate Email Address"
              placeholder="alex.chen@company.com"
              error="Corporate domain must be in approved whitelist"
            />
            <Select
              label="Target Ambition Role"
              options={[
                { value: 'staff-eng', label: 'Staff Platform Engineer' },
                { value: 'arch', label: 'Cloud Solutions Architect' },
                { value: 'lead', label: 'Engineering Manager' },
              ]}
            />
            <div className="sm:col-span-2 md:col-span-3">
              <Textarea
                label="Initiative Description &amp; Staffing Goals"
                placeholder="Detail deliverables, team size, duration, and target architecture..."
                rows={2}
                helperText="Markdown supported for project requirements."
              />
            </div>
          </Card>
        </section>

        {/* 6. Selection Controls: Checkboxes, Radios, Toggles & Sliders */}
        <section className="space-y-4">
          <h2 className="text-section-title font-heading text-ink">6. Selection, Toggles &amp; Aurora Track Sliders</h2>
          <Card padding="lg" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 items-start">
            <div className="space-y-3">
              <span className="text-xs font-semibold text-ink block">Checkbox Primitives</span>
              <Checkbox label="Auto-approve verified invites" checked={true} />
              <Checkbox label="Require peer endorsement proof" checked={false} />
              <Checkbox label="Disabled option" disabled checked={true} />
            </div>

            <div className="space-y-3">
              <span className="text-xs font-semibold text-ink block">Radio Primitives</span>
              <Radio
                name="demo-radio"
                label="Near-Qualified Talent (Amber)"
                checked={radioSelected === 'opt-1'}
                onChange={() => setRadioSelected('opt-1')}
              />
              <Radio
                name="demo-radio"
                label="Directly Qualified Talent (Aurora)"
                checked={radioSelected === 'opt-2'}
                onChange={() => setRadioSelected('opt-2')}
              />
              <Toggle
                label="Real-time matching notifications"
                checked={toggleState}
                onChange={setToggleState}
              />
            </div>

            <div className="space-y-3">
              <span className="text-xs font-semibold text-ink block">Aurora Gradient Slider</span>
              <Slider
                label="Weekly Availability Allocation"
                value={sliderValue}
                onChange={setSliderValue}
                valueDisplay={`${sliderValue}% (${Math.round(sliderValue * 0.4)} hrs/wk)`}
              />
            </div>
          </Card>
        </section>

        {/* 7. Badges & Chips */}
        <section className="space-y-4">
          <h2 className="text-section-title font-heading text-ink">7. Badges, Chips &amp; Highlight Tokens</h2>
          <Card padding="md" className="flex flex-wrap items-center gap-2.5">
            <Badge variant="aurora">Aurora Primary</Badge>
            <Badge variant="primary" dot>Primary Violet</Badge>
            <Badge variant="cyan" dot>Aurora Cyan</Badge>
            <Badge variant="amber" dot>Near-Qualified Amber</Badge>
            <Badge variant="employee">Employee Emerald</Badge>
            <Badge variant="manager">Manager Cyan</Badge>
            <Badge variant="hr">HR Violet</Badge>
            <Badge variant="success" dot>Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="danger">High Severity</Badge>
            <Badge variant="neutral" onRemove={() => {}}>Removable Chip</Badge>
          </Card>
        </section>

        {/* 8. Progress Metrics & Rings */}
        <section className="space-y-4">
          <h2 className="text-section-title font-heading text-ink">8. Progress Bars &amp; Aurora Gradient Rings</h2>
          <Card padding="lg" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 items-center">
            <div className="flex flex-col items-center justify-center p-3 text-center">
              <ProgressRing value={94} size={72} strokeWidth={6} variant="aurora" />
              <span className="text-xs font-semibold text-ink mt-2">Overall Match Tier</span>
              <span className="text-2xs text-muted">Aurora SVG Gradient</span>
            </div>

            <div className="flex flex-col items-center justify-center p-3 text-center">
              <ProgressRing value={78} size={72} strokeWidth={6} variant="amber" />
              <span className="text-xs font-semibold text-ink mt-2">Near-Qualified Gap</span>
              <span className="text-2xs text-muted">Amber Highlight #FFB547</span>
            </div>

            <div className="sm:col-span-2 space-y-3">
              <ProgressBar label="Role Ambition Readiness" value={82} valueDisplay="82% Ready" variant="aurora" />
              <ProgressBar label="Near-Qualified Bridging Pipeline" value={64} valueDisplay="64% Covered" variant="amber" />
              <ProgressBar label="Team Workload Utilization" value={45} valueDisplay="45% Utilized" variant="cyan" />
            </div>
          </Card>
        </section>

        {/* 9. Feedback, States & Dialogs */}
        <section className="space-y-4">
          <h2 className="text-section-title font-heading text-ink">9. Dialogs, Drawers &amp; System States</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card padding="md" className="space-y-3">
              <h4 className="font-heading font-semibold text-sm text-ink">Dialog &amp; Notification Triggers</h4>
              <div className="flex flex-wrap gap-2.5">
                <Button variant="secondary" onClick={() => setIsModalOpen(true)}>Open Modal Dialog</Button>
                <Button variant="secondary" onClick={() => setIsDrawerOpen(true)}>Open Slide Drawer</Button>
                <Button
                  variant="outline"
                  onClick={() => onShowToast?.('Synchronized 203 employees with enterprise skills graph.')}
                >
                  Trigger Toast
                </Button>
              </div>
            </Card>

            <ErrorState
              title="Session verification degraded"
              message="Operating with cached permissions while background credentials re-sync."
            />
          </div>

          <EmptyState
            title="No talent matching selected criteria"
            description="Try relaxing availability filters or broadening secondary competency tags."
            actionLabel="Reset Filter Matrix"
            onAction={() => {}}
          />
        </section>

        {/* 10. Table Primitive */}
        <section className="space-y-4">
          <h2 className="text-section-title font-heading text-ink">10. Table Primitive (Clean Hover, Tabular Numbers)</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Role Title</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Fit Score</TableHead>
                <TableHead>Availability</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <tbody>
              <TableRow>
                <TableCell className="font-semibold text-ink flex items-center gap-2.5">
                  <Avatar name="Elena Rostova" size="sm" role="Employee" />
                  <span>Elena Rostova</span>
                </TableCell>
                <TableCell>Staff Platform Engineer</TableCell>
                <TableCell>Cloud Infrastructure</TableCell>
                <TableCell className="tabular-nums font-bold text-ink">
                  <Badge variant="aurora" size="sm">96.4% Match</Badge>
                </TableCell>
                <TableCell className="tabular-nums">75% (30 hrs/wk)</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost">View Profile</Button>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-semibold text-ink flex items-center gap-2.5">
                  <Avatar name="Marcus Vance" size="sm" role="Employee" />
                  <span>Marcus Vance</span>
                </TableCell>
                <TableCell>Senior UX Engineer</TableCell>
                <TableCell>Product Platforms</TableCell>
                <TableCell className="tabular-nums font-bold text-ink">
                  <Badge variant="amber" size="sm">82.1% Near-Qual</Badge>
                </TableCell>
                <TableCell className="tabular-nums">50% (20 hrs/wk)</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost">View Profile</Button>
                </TableCell>
              </TableRow>
            </tbody>
          </Table>
        </section>
      </div>

      {/* Demo Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Candidate Comparison Matrix"
        description="Side-by-side evaluation against Staff Platform Engineer requirements."
        maxWidth="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Close</Button>
            <Button variant="primary" onClick={() => setIsModalOpen(false)}>Confirm Shortlist</Button>
          </>
        }
      >
        <div className="space-y-4 text-xs text-body">
          <p>
            Comparing competencies across <strong className="text-ink">Distributed Systems</strong>, <strong className="text-ink">Kubernetes</strong>, and <strong className="text-ink">Golang</strong> with explainable weights.
          </p>
          <ProgressBar label="Comparative Overlap" value={88} valueDisplay="88% Match" variant="aurora" />
        </div>
      </Modal>

      {/* Demo Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Skill Node Ontology Inspector"
        description="Inspect prerequisites, verified courses, and active mentors."
        footer={
          <Button variant="primary" onClick={() => setIsDrawerOpen(false)}>Done</Button>
        }
      >
        <div className="space-y-4 text-xs text-body">
          <Badge variant="aurora" size="lg">Distributed Consensus (Raft/Paxos)</Badge>
          <p className="mt-2 text-muted leading-relaxed">
            Advanced systems engineering domain requiring deep concurrency and fault-tolerance competencies.
          </p>
          <div className="pt-2">
            <h5 className="font-semibold text-ink mb-1.5">Qualified Organization Mentors</h5>
            <div className="flex items-center gap-2 p-2 rounded-card border border-border bg-surface-alt/40">
              <Avatar name="Sarah Jenkins" size="sm" role="Manager" />
              <div>
                <div className="font-semibold text-ink">Sarah Jenkins</div>
                <div className="text-2xs text-muted">Lead Frontend Architect • Austin, TX</div>
              </div>
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  );
};
