import type { CrewMember, Material, Task, Tool } from '../types';

function rid(): string {
  // Local-only id for new rows; the server assigns canonical ids on save.
  return 'tmp-' + Math.random().toString(36).slice(2, 9);
}

interface AddBtnProps {
  label: string;
  onClick: () => void;
}
function AddButton({ label, onClick }: AddBtnProps) {
  return (
    <button className="btn ghost sm" onClick={onClick} style={{ marginTop: 10 }}>
      + {label}
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="icon-btn" onClick={onClick} aria-label="Remove" style={{ flex: '0 0 auto' }}>
      ✕
    </button>
  );
}

/* ---------------- Tasks ---------------- */
export function TaskEditor({
  items,
  onChange,
}: {
  items: Task[];
  onChange: (v: Task[]) => void;
}) {
  const update = (id: string, patch: Partial<Task>) =>
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  return (
    <div>
      <div className="stack" style={{ gap: 8 }}>
        {items.map((t) => (
          <div key={t.id} className="row" style={{ alignItems: 'center' }}>
            <input
              className="input"
              placeholder="Task / step"
              value={t.text}
              onChange={(e) => update(t.id, { text: e.target.value })}
              style={{ flex: 1 }}
            />
            <RemoveButton onClick={() => onChange(items.filter((x) => x.id !== t.id))} />
          </div>
        ))}
      </div>
      <AddButton
        label="Add task"
        onClick={() => onChange([...items, { id: rid(), text: '', done: false }])}
      />
    </div>
  );
}

/* ---------------- Materials ---------------- */
export function MaterialEditor({
  items,
  onChange,
}: {
  items: Material[];
  onChange: (v: Material[]) => void;
}) {
  const update = (id: string, patch: Partial<Material>) =>
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  return (
    <div>
      <div className="stack">
        {items.map((m) => (
          <div key={m.id} className="card" style={{ padding: 12, background: 'var(--surface-2)' }}>
            <div className="row" style={{ alignItems: 'center' }}>
              <input
                className="input"
                placeholder="Material"
                value={m.name}
                onChange={(e) => update(m.id, { name: e.target.value })}
                style={{ flex: 2 }}
              />
              <RemoveButton onClick={() => onChange(items.filter((x) => x.id !== m.id))} />
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <input
                className="input"
                placeholder="Qty"
                inputMode="decimal"
                value={m.qty}
                onChange={(e) => update(m.id, { qty: e.target.value })}
              />
              <input
                className="input"
                placeholder="Unit"
                value={m.unit}
                onChange={(e) => update(m.id, { unit: e.target.value })}
              />
            </div>
            <input
              className="input"
              placeholder="Notes (supplier, delivery, size…)"
              value={m.notes}
              onChange={(e) => update(m.id, { notes: e.target.value })}
              style={{ marginTop: 8 }}
            />
          </div>
        ))}
      </div>
      <AddButton
        label="Add material"
        onClick={() =>
          onChange([...items, { id: rid(), name: '', qty: '', unit: '', notes: '' }])
        }
      />
    </div>
  );
}

/* ---------------- Tools ---------------- */
export function ToolEditor({
  items,
  onChange,
}: {
  items: Tool[];
  onChange: (v: Tool[]) => void;
}) {
  const update = (id: string, patch: Partial<Tool>) =>
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  return (
    <div>
      <div className="stack" style={{ gap: 8 }}>
        {items.map((t) => (
          <div key={t.id} className="row" style={{ alignItems: 'center' }}>
            <input
              className="input"
              placeholder="Tool / equipment"
              value={t.name}
              onChange={(e) => update(t.id, { name: e.target.value })}
              style={{ flex: 2 }}
            />
            <input
              className="input"
              placeholder="Qty"
              inputMode="numeric"
              value={t.qty}
              onChange={(e) => update(t.id, { qty: e.target.value })}
              style={{ flex: 1, maxWidth: 90 }}
            />
            <RemoveButton onClick={() => onChange(items.filter((x) => x.id !== t.id))} />
          </div>
        ))}
      </div>
      <AddButton
        label="Add tool"
        onClick={() => onChange([...items, { id: rid(), name: '', qty: '', notes: '' }])}
      />
    </div>
  );
}

/* ---------------- Crew ---------------- */
export function CrewEditor({
  items,
  onChange,
}: {
  items: CrewMember[];
  onChange: (v: CrewMember[]) => void;
}) {
  const update = (id: string, patch: Partial<CrewMember>) =>
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  return (
    <div>
      <div className="stack" style={{ gap: 8 }}>
        {items.map((c) => (
          <div key={c.id} className="card" style={{ padding: 12, background: 'var(--surface-2)' }}>
            <div className="row" style={{ alignItems: 'center' }}>
              <input
                className="input"
                placeholder="Name"
                value={c.name}
                onChange={(e) => update(c.id, { name: e.target.value })}
                style={{ flex: 2 }}
              />
              <RemoveButton onClick={() => onChange(items.filter((x) => x.id !== c.id))} />
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <input
                className="input"
                placeholder="Role"
                value={c.role}
                onChange={(e) => update(c.id, { role: e.target.value })}
                style={{ flex: 2 }}
              />
              <input
                className="input"
                placeholder="Hrs"
                inputMode="decimal"
                value={c.hours}
                onChange={(e) => update(c.id, { hours: e.target.value })}
                style={{ flex: 1, maxWidth: 90 }}
              />
            </div>
          </div>
        ))}
      </div>
      <AddButton
        label="Add crew member"
        onClick={() => onChange([...items, { id: rid(), name: '', role: '', hours: '' }])}
      />
    </div>
  );
}
