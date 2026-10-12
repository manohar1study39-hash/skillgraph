import { QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

export const queryKeys = {
  dataVersion: ['data-version'] as const,
  companyData: ['company-data'] as const,
  employees: ['employees'] as const,
  employee: (id: string) => ['employee', id] as const,
  employeeProfile: (id: string) => ['employee-profile', id] as const,
  managerEmployees: ['manager-employees'] as const,
  roles: ['roles'] as const,
  skills: ['skills'] as const,
  projects: ['projects'] as const,
  opportunities: ['opportunities'] as const,
  learningResources: ['learning-resources'] as const,
  learningSuggestions: ['learning-suggestions'] as const,
  upskillingProgress: (empId?: string) => ['upskilling-progress', empId] as const,
  weeklyLearningHours: (empId?: string) => ['weekly-learning-hours', empId] as const,
  availability: (empId?: string) => ['availability', empId] as const,
  ambition: (empId?: string) => ['ambition', empId] as const,
  applications: (empId?: string) => ['applications', empId] as const,
};

export async function invalidateCompanyData() {
  await queryClient.invalidateQueries({ queryKey: queryKeys.companyData });
  await queryClient.invalidateQueries({ queryKey: queryKeys.employees });
  await queryClient.invalidateQueries({ queryKey: queryKeys.managerEmployees });
}

// ── Global Conflict Event Bus ────────────────────────────────────────────────
type ConflictListener = (detail: { message: string; onReload?: () => void }) => void;
const conflictListeners = new Set<ConflictListener>();

export function notifyConflict(message: string = 'This was changed by someone else. Reload to see the latest.', onReload?: () => void) {
  conflictListeners.forEach(listener => listener({ message, onReload }));
}

export function subscribeToConflicts(listener: ConflictListener) {
  conflictListeners.add(listener);
  return () => {
    conflictListeners.delete(listener);
  };
}

// ── Polling Hook on data_version ─────────────────────────────────────────────
export function useDataVersionPolling(onVersionChange?: (newVersion: number) => void, enabled: boolean = true) {
  const lastVersionRef = useRef<number | null>(null);
  const cbRef = useRef(onVersionChange);
  cbRef.current = onVersionChange;

  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/data-version', { credentials: 'same-origin' });
        if (!res.ok) return;
        const data = await res.json();
        const currentVer = typeof data.version === 'number' ? data.version : 0;

        if (lastVersionRef.current === null) {
          lastVersionRef.current = currentVer;
        } else if (currentVer > lastVersionRef.current) {
          lastVersionRef.current = currentVer;
          if (isMounted) {
            await invalidateCompanyData();
            if (cbRef.current) {
              cbRef.current(currentVer);
            }
          }
        }
      } catch {
        // Silently ignore polling network blips
      }
    }, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [enabled]);
}
