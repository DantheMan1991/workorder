import type { WorkOrder } from './types';

const BASE = '/api/workorders';

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  list: (params?: { status?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.q) qs.set('q', params.q);
    const suffix = qs.toString() ? `?${qs}` : '';
    return fetch(`${BASE}${suffix}`).then((r) => handle<WorkOrder[]>(r));
  },
  get: (id: string) => fetch(`${BASE}/${id}`).then((r) => handle<WorkOrder>(r)),
  create: (data: Partial<WorkOrder>) =>
    fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then((r) => handle<WorkOrder>(r)),
  update: (id: string, data: Partial<WorkOrder>) =>
    fetch(`${BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then((r) => handle<WorkOrder>(r)),
  remove: (id: string) => fetch(`${BASE}/${id}`, { method: 'DELETE' }).then((r) => handle<void>(r)),
};
