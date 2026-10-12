export type CompanyAuthUser = {
  user_id: string;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  is_active: string;
};

export type SignupFieldErrors = Partial<Record<'name' | 'email' | 'password' | 'confirmPassword' | 'inviteCode', string>>;

export type SignupResult =
  | { ok: true; user: CompanyAuthUser; approved: boolean }
  | { ok: false; status: number; error: string; fieldErrors?: SignupFieldErrors; code?: string };

export function normalizeCompanyEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function passwordRuleFailures(password: string): string[] {
  const failures: string[] = [];
  if (password.length < 12) failures.push('Use at least 12 characters.');
  if (!/[A-Za-z]/.test(password)) failures.push('Add at least one letter.');
  if (!/\d/.test(password)) failures.push('Add at least one number.');
  if (!/[^A-Za-z0-9]/.test(password)) failures.push('Add at least one symbol.');
  return failures;
}

export function createCompanySignup(input: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  inviteCode: string;
  role?: string;
  users: CompanyAuthUser[];
  allowedDomains: string[];
  configuredInviteCode: string;
  inviteAutoApprove: boolean;
  hashPassword: (password: string) => string;
  makeUserId: () => string;
}): SignupResult {
  const name = input.name.trim();
  const email = normalizeCompanyEmail(input.email);
  const fieldErrors: SignupFieldErrors = {};
  if (!name) fieldErrors.name = 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = 'Enter a valid email address.';
  const failures = passwordRuleFailures(input.password);
  if (failures.length) fieldErrors.password = failures.join(' ');
  if (input.password !== input.confirmPassword) fieldErrors.confirmPassword = 'Passwords do not match.';
  if (Object.keys(fieldErrors).length) return { ok: false, status: 400, error: 'Check the highlighted fields.', fieldErrors };

  if (input.users.some(user => normalizeCompanyEmail(user.email) === email)) {
    return { ok: false, status: 409, error: 'An account with this email already exists.', fieldErrors: { email: 'An account with this email already exists.' } };
  }

  const configuredDomains = input.allowedDomains.map(domain => domain.trim().toLowerCase()).filter(Boolean);
  if (!input.configuredInviteCode && configuredDomains.length === 0) {
    return { ok: false, status: 503, error: 'Signup is not configured. Set SKILLGRAPH_INVITE_CODE or SKILLGRAPH_ALLOWED_DOMAINS.', code: 'SIGNUP_NOT_CONFIGURED' };
  }

  const validInvite = Boolean(input.configuredInviteCode) && input.inviteCode.trim() === input.configuredInviteCode;
  const allowedDomain = configuredDomains.includes(email.split('@')[1]);
  if (!validInvite && !allowedDomain) {
    const message = input.inviteCode.trim() && input.configuredInviteCode
      ? 'Invite code is invalid and this email domain is not approved.'
      : 'Use a valid invite code or an approved email domain.';
    return { ok: false, status: 403, error: message, fieldErrors: input.inviteCode.trim() ? { inviteCode: message } : { email: message } };
  }

  const approved = validInvite && input.inviteAutoApprove;
  return {
    ok: true,
    approved,
    user: {
      user_id: input.makeUserId(),
      name,
      email,
      password_hash: input.hashPassword(input.password),
      role: input.role || 'Manager',
      is_active: String(approved)
    }
  };
}

export function findActiveCompanyUser(users: CompanyAuthUser[], email: string): CompanyAuthUser | undefined {
  const normalizedEmail = normalizeCompanyEmail(email);
  return users.find(user => user.is_active.toLowerCase() === 'true' && normalizeCompanyEmail(user.email) === normalizedEmail);
}
