import { invalidateCompanyData, notifyConflict } from './queryClient.ts';

// Set of currently active mutation keys to prevent double-click duplicate submits
const pendingMutations = new Set<string>();

export interface ApiFetchOptions extends RequestInit {
  onConflictReload?: () => void;
  skipInvalidation?: boolean;
}

export async function apiFetch<T = any>(
  url: string,
  options: ApiFetchOptions = {}
): Promise<{ ok: boolean; status: number; data: T; error?: string }> {
  const method = (options.method || 'GET').toUpperCase();
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  // Double-click protection for mutating operations
  const mutationKey = isMutation ? `${method}:${url}:${JSON.stringify(options.body || '')}` : null;
  if (mutationKey) {
    if (pendingMutations.has(mutationKey)) {
      console.warn(`[apiClient] Double-click blocked for ${mutationKey}`);
      return {
        ok: false,
        status: 429,
        data: null as any,
        error: 'Operation already in progress. Please wait.',
      };
    }
    pendingMutations.add(mutationKey);
  }

  try {
    const headers = new Headers(options.headers || {});
    if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const res = await fetch(url, {
      ...options,
      headers,
      credentials: 'same-origin',
    });

    let data: any = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json().catch(() => null);
    } else {
      data = await res.text().catch(() => null);
    }

    if (res.status === 409) {
      const conflictMsg = (data && data.detail) || 'This was changed by someone else. Reload to see the latest.';
      notifyConflict(conflictMsg, options.onConflictReload);
      return {
        ok: false,
        status: 409,
        data,
        error: conflictMsg,
      };
    }

    if (!res.ok) {
      const errMsg = (data && (data.detail || data.error)) || `Request failed with status ${res.status}`;
      return {
        ok: false,
        status: res.status,
        data,
        error: errMsg,
      };
    }

    if (isMutation && !options.skipInvalidation) {
      void invalidateCompanyData();
    }

    return {
      ok: true,
      status: res.status,
      data,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      data: null as any,
      error: err.message || 'Network error occurred.',
    };
  } finally {
    if (mutationKey) {
      pendingMutations.delete(mutationKey);
    }
  }
}
