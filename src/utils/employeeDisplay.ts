export interface EmployeeNameFields {
  id?: string;
  name: string;
  department?: string;
  location?: string;
  display_label?: string;
}

/**
 * Computes the canonical display label for an employee:
 * - "Name" when unique across the organization
 * - "Name (Department, City)" when multiple employees share a name
 * - "Name (Department, City) - Suffix" (last 4 chars of employee ID) if Department and City are also identical
 */
export function getEmployeeDisplayLabel(
  employee: EmployeeNameFields,
  allEmployees?: EmployeeNameFields[]
): string {
  if (!employee || !employee.name) return '';
  const cleanName = employee.name.trim();
  if (!allEmployees || allEmployees.length <= 1) {
    return cleanName;
  }

  const nameLower = cleanName.toLowerCase();
  const sameNameEmployees = allEmployees.filter(
    e => e.name && e.name.trim().toLowerCase() === nameLower
  );

  // Unique across organization
  if (sameNameEmployees.length <= 1) {
    return cleanName;
  }

  // Ambiguous: check if (Department, City) disambiguates
  const dept = (employee.department || 'General').trim();
  const loc = (employee.location || 'Remote').trim();
  const baseLabel = `${cleanName} (${dept}, ${loc})`;

  const sameLabelEmployees = sameNameEmployees.filter(e => {
    const d = (e.department || 'General').trim();
    const l = (e.location || 'Remote').trim();
    return `${e.name.trim()} (${d}, ${l})`.toLowerCase() === baseLabel.toLowerCase();
  });

  if (sameLabelEmployees.length <= 1) {
    return baseLabel;
  }

  // Still ambiguous: append short suffix (last 4 characters of id)
  const rawId = String(employee.id || '');
  const suffix = rawId.replace(/^emp-/, '').slice(-4) || rawId.slice(-4);
  return `${baseLabel} - ${suffix}`;
}

export function computeAllDisplayLabels<T extends EmployeeNameFields>(
  employees: T[]
): (T & { display_label: string })[] {
  return employees.map(emp => ({
    ...emp,
    display_label: getEmployeeDisplayLabel(emp, employees)
  }));
}
