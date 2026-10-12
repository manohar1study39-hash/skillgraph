import { test } from 'node:test';
import assert from 'node:assert/strict';

// Test Query Keys structure
import { queryKeys } from '../src/services/queryClient.ts';

test('Query Keys hierarchy returns consistent tuple keys per entity', () => {
  assert.deepEqual(queryKeys.dataVersion, ['data-version']);
  assert.deepEqual(queryKeys.companyData, ['company-data']);
  assert.deepEqual(queryKeys.employees, ['employees']);
  assert.deepEqual(queryKeys.employee('emp-1'), ['employee', 'emp-1']);
  assert.deepEqual(queryKeys.roles, ['roles']);
  assert.deepEqual(queryKeys.skills, ['skills']);
  assert.deepEqual(queryKeys.projects, ['projects']);
  assert.deepEqual(queryKeys.opportunities, ['opportunities']);
  assert.deepEqual(queryKeys.learningResources, ['learning-resources']);
  assert.deepEqual(queryKeys.upskillingProgress('emp-1'), ['upskilling-progress', 'emp-1']);
});

test('Double-click protection rejects duplicate simultaneous mutating calls', async () => {
  const { apiFetch } = await import('../src/services/apiClient.ts');

  // Mock global fetch to simulate a slow mutation
  let fetchCallCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetchCallCount++;
    await new Promise(resolve => setTimeout(resolve, 50));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as any;

  try {
    const payload = JSON.stringify({ role: 'Lead', hours: 10 });
    // Trigger two identical mutating calls simultaneously
    const [res1, res2] = await Promise.all([
      apiFetch('/api/test-mutation', { method: 'POST', body: payload }),
      apiFetch('/api/test-mutation', { method: 'POST', body: payload }),
    ]);

    // One of them must succeed, and the second must be blocked by double-click protection (status 429)
    const successCount = [res1, res2].filter(r => r.ok).length;
    const blockedCount = [res1, res2].filter(r => r.status === 429).length;

    assert.equal(successCount, 1, 'Exactly one concurrent mutation should proceed');
    assert.equal(blockedCount, 1, 'The duplicate simultaneous mutation should be blocked (429)');
    assert.equal(fetchCallCount, 1, 'The underlying fetch should only have been called once');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('HTTP 409 Conflict triggers conflict listener and returns structured error', async () => {
  const { apiFetch } = await import('../src/services/apiClient.ts');
  const { subscribeToConflicts } = await import('../src/services/queryClient.ts');

  let conflictNotified = false;
  let conflictMessage = '';
  const unsubscribe = subscribeToConflicts(detail => {
    conflictNotified = true;
    conflictMessage = detail.message;
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({ detail: 'This was changed by someone else. Reload to see the latest.' }),
      {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }) as any;

  try {
    const res = await apiFetch('/api/conflict-endpoint', {
      method: 'POST',
      body: JSON.stringify({ version: 1 }),
    });

    assert.equal(res.ok, false);
    assert.equal(res.status, 409);
    assert.equal(conflictNotified, true, 'Conflict listener should be called');
    assert.match(conflictMessage, /Reload to see the latest/);
  } finally {
    unsubscribe();
    globalThis.fetch = originalFetch;
  }
});
