import assert from 'node:assert/strict';
import test from 'node:test';
import { createCompanySignup, findActiveCompanyUser, type CompanyAuthUser } from '../src/services/companyAuth.ts';

const baseInput = (overrides: Partial<Parameters<typeof createCompanySignup>[0]> = {}) => ({
  name: 'Test Manager',
  email: 'new.person@example.com',
  password: 'SkillGraph2026!',
  confirmPassword: 'SkillGraph2026!',
  inviteCode: '',
  users: [] as CompanyAuthUser[],
  allowedDomains: ['example.com'],
  configuredInviteCode: 'dev-invite',
  inviteAutoApprove: false,
  hashPassword: (password: string) => `bcrypt:${password}`,
  makeUserId: () => 'user-test',
  ...overrides
});

test('rejects mismatched confirmation passwords', () => {
  const result = createCompanySignup(baseInput({ confirmPassword: 'Different2026!' }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.fieldErrors?.confirmPassword, 'Passwords do not match.');
});

test('rejects weak passwords with field guidance', () => {
  const result = createCompanySignup(baseInput({ password: 'weak', confirmPassword: 'weak' }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.fieldErrors?.password || '', /12 characters/);
});

test('rejects duplicate email case-insensitively', () => {
  const users: CompanyAuthUser[] = [{ user_id: 'existing', name: 'Existing', email: 'NEW.PERSON@example.com', password_hash: 'hash', role: 'Manager', is_active: 'true' }];
  const result = createCompanySignup(baseInput({ users }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, 'An account with this email already exists.');
});

test('rejects an invalid invite when the email domain is not approved', () => {
  const result = createCompanySignup(baseInput({ email: 'new.person@other.example', inviteCode: 'wrong-code', allowedDomains: [] }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.fieldErrors?.inviteCode || '', /invalid/);
});

test('reports when signup is not configured', () => {
  const result = createCompanySignup(baseInput({ allowedDomains: [], configuredInviteCode: '' }));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'SIGNUP_NOT_CONFIGURED');
    assert.match(result.error, /Signup is not configured/);
  }
});

test('creates a pending Manager account with a password hash', () => {
  const result = createCompanySignup(baseInput());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.approved, false);
    assert.equal(result.user.role, 'Manager');
    assert.equal(result.user.is_active, 'false');
    assert.equal(result.user.email, 'new.person@example.com');
    assert.equal(result.user.password_hash, 'bcrypt:SkillGraph2026!');
  }
});

test('valid auto-approved invite creates an active account', () => {
  const result = createCompanySignup(baseInput({ email: 'person@outside.test', inviteCode: 'dev-invite', inviteAutoApprove: true }));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.user.is_active, 'true');
});

test('pending approval accounts cannot log in', () => {
  const result = createCompanySignup(baseInput());
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(findActiveCompanyUser([result.user], 'new.person@example.com'), undefined);
});
