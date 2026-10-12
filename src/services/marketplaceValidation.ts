export interface NewProjectInput {
  projectName: unknown;
  roleTitle: unknown;
  domain: unknown;
  startDate: unknown;
  endDate?: unknown;
  complexity: unknown;
  teamSize: unknown;
  minAvailability: unknown;
  requirements: unknown;
}

export function validateNewProject(input: NewProjectInput): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of ['projectName', 'roleTitle', 'domain', 'startDate'] as const) if (!String(input[field] || '').trim()) errors[field] = 'This field is required.';
  if (!Number.isInteger(Number(input.complexity)) || Number(input.complexity) < 1 || Number(input.complexity) > 5) errors.complexity = 'Choose a complexity from 1 to 5.';
  if (!Number.isInteger(Number(input.teamSize)) || Number(input.teamSize) < 1) errors.teamSize = 'Team size must be at least 1.';
  if (!Number.isInteger(Number(input.minAvailability)) || Number(input.minAvailability) < 0 || Number(input.minAvailability) > 100) errors.minAvailability = 'Availability must be from 0 to 100.';
  if (input.endDate && input.startDate && String(input.endDate) < String(input.startDate)) errors.endDate = 'End date cannot be before start date.';
  if (!Array.isArray(input.requirements) || !input.requirements.length) errors.requirements = 'Add at least one required skill.';
  else if (!input.requirements.some((item: any) => item.importance === 'Must')) errors.requirements = 'At least one skill must be marked Must.';
  else if (new Set(input.requirements.map((item: any) => item.skillId)).size !== input.requirements.length) errors.requirements = 'Each skill can only be added once.';
  return errors;
}

export function splitLegacyRoleTitle(value: string): { roleTitle: string; projectName: string } {
  const title = String(value || '').trim();
  const separator = title.indexOf(':');
  return separator < 0 ? { roleTitle: title, projectName: title } : { roleTitle: title.slice(0, separator).trim(), projectName: title.slice(separator + 1).trim() };
}
