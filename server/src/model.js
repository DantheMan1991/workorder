import { nanoid } from 'nanoid';

export const STATUSES = ['draft', 'ready', 'in_progress', 'complete'];

function nowISO() {
  return new Date().toISOString();
}

/** Give any list of items stable ids so the client can key/edit them safely. */
function withIds(items) {
  return (Array.isArray(items) ? items : []).map((it) => ({
    id: it.id || nanoid(8),
    ...it,
  }));
}

/**
 * Normalize an incoming (possibly partial) work order into the canonical
 * shape stored on the server. Unknown fields are dropped; missing fields get
 * sensible defaults. This is the single source of truth for the data model.
 */
export function normalizeWorkOrder(input = {}, existing = null) {
  const base = existing || {};
  const src = { ...base, ...input };

  const site = { ...(base.site || {}), ...(input.site || {}) };
  const contact = { ...(base.contact || {}), ...(input.contact || {}) };
  const safety = { ...(base.safety || {}), ...(input.safety || {}) };

  return {
    id: base.id || nanoid(10),
    number: src.number || base.number || '',
    title: (src.title || '').trim(),
    status: STATUSES.includes(src.status) ? src.status : base.status || 'draft',
    priority: src.priority || base.priority || 'normal',

    customer: src.customer || '',
    jobType: src.jobType || '',

    site: {
      address: site.address || '',
      accessNotes: site.accessNotes || '',
      parking: site.parking || '',
      gateCode: site.gateCode || '',
    },
    contact: {
      name: contact.name || '',
      phone: contact.phone || '',
      role: contact.role || '',
    },

    scheduledDate: src.scheduledDate || '',
    startTime: src.startTime || '',
    estHours: src.estHours ?? '',

    scope: src.scope || '',
    tasks: withIds(src.tasks).map((t) => ({
      id: t.id,
      text: t.text || '',
      done: !!t.done,
    })),
    materials: withIds(src.materials).map((m) => ({
      id: m.id,
      name: m.name || '',
      qty: m.qty ?? '',
      unit: m.unit || '',
      notes: m.notes || '',
    })),
    tools: withIds(src.tools).map((t) => ({
      id: t.id,
      name: t.name || '',
      qty: t.qty ?? '',
      notes: t.notes || '',
    })),
    crew: withIds(src.crew).map((c) => ({
      id: c.id,
      name: c.name || '',
      role: c.role || '',
      hours: c.hours ?? '',
    })),

    safety: {
      ppe: Array.isArray(safety.ppe) ? safety.ppe : [],
      hazards: safety.hazards || '',
      permits: safety.permits || '',
    },

    notes: src.notes || '',
    completedPrompts: Array.isArray(src.completedPrompts) ? src.completedPrompts : [],

    createdBy: src.createdBy || base.createdBy || '',
    createdAt: base.createdAt || nowISO(),
    updatedAt: nowISO(),
  };
}

/** Generate the next human-friendly work order number, e.g. WO-2026-0007. */
export function nextNumber(existing) {
  const year = new Date().getFullYear();
  const prefix = `WO-${year}-`;
  const nums = existing
    .map((w) => w.number)
    .filter((n) => typeof n === 'string' && n.startsWith(prefix))
    .map((n) => parseInt(n.slice(prefix.length), 10))
    .filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}
