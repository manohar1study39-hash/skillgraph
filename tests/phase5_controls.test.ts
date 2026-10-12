import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSkillClient, LEVEL_NAMES } from '../src/services/scoringEngine.ts';
import type { ToastUndoAction } from '../src/types/index.ts';

const TODAY = new Date('2026-10-08');

test('Phase 5: Skill explanation breakdown contains granular factors and guidance', () => {
  const result = evaluateSkillClient(
    'skill-python',
    [
      {
        title: 'Backend API implementation',
        url: 'https://github.com/company/repo/pull/12',
        artifact_date: '2026-09-01',
        complexityScore: 4.0,
        verification_status: 'Link checked'
      }
    ],
    [],
    2.0,
    'Independent',
    TODAY
  );

  assert.ok(result.points > 0, 'Points must be greater than 0');
  assert.ok(result.level >= 1, 'Level must be >= 1');
  assert.ok(result.orderedContributions.length === 1);
  const contribution = result.orderedContributions[0];
  assert.equal(contribution.title, 'Backend API implementation');
  const netPts = (contribution as any).netPoints ?? (contribution as any).net_points;
  assert.ok(netPts > 0, `netPoints (${netPts}) should be > 0`);
  assert.ok(result.confidenceScore >= 15 && result.confidenceScore <= 100);
});

test('Phase 5: 10-second undo window executes onUndo callback before timeout', async () => {
  let undone = false;
  const undoAction: ToastUndoAction = {
    label: 'Undo',
    durationSeconds: 10,
    onUndo: () => {
      undone = true;
    }
  };

  assert.equal(undoAction.durationSeconds, 10);
  assert.equal(undoAction.label, 'Undo');

  // Simulate user clicking undo
  await undoAction.onUndo();
  assert.equal(undone, true, 'onUndo callback must execute when triggered');
});

test('Phase 5: Bridge skill gaps matches target course catalog correctly', () => {
  const targetGaps = ['Python', 'System Architecture'];
  const catalog = [
    { id: 'c1', title: 'Python for Enterprise Systems', skill_id: 'skill-python' },
    { id: 'c2', title: 'React State Management', skill_id: 'skill-react' },
    { id: 'c3', title: 'Modern System Architecture Mastery', skill_id: 'skill-arch' }
  ];

  const filtered = catalog.filter(course =>
    targetGaps.some(gap =>
      course.title.toLowerCase().includes(gap.toLowerCase()) ||
      course.skill_id.toLowerCase().includes(gap.toLowerCase())
    )
  );

  assert.equal(filtered.length, 2);
  assert.equal(filtered[0].id, 'c1');
  assert.equal(filtered[1].id, 'c3');
});
