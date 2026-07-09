import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import type { Status, WorkOrder } from '../types';
import { STATUS_LABELS } from '../types';

function formatDate(d: string): string {
  if (!d) return '';
  const p = d.split('-');
  if (p.length !== 3) return d;
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export default function JobSheetPage() {
  const { id } = useParams();
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    let alive = true;
    api
      .get(id)
      .then((data) => alive && setWo(data))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  async function patch(next: Partial<WorkOrder>) {
    if (!wo) return;
    const optimistic = { ...wo, ...next };
    setWo(optimistic);
    try {
      const saved = await api.update(wo.id, optimistic);
      setWo(saved);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function toggleTask(taskId: string) {
    if (!wo) return;
    patch({ tasks: wo.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)) });
  }

  if (error) {
    return (
      <div className="empty">
        <div className="big">⚠️</div>
        <p className="small faint">{error}</p>
      </div>
    );
  }
  if (!wo) return <div className="empty">Loading…</div>;

  const mapHref = wo.site.address
    ? `https://maps.google.com/?q=${encodeURIComponent(wo.site.address)}`
    : '';
  const doneCount = wo.tasks.filter((t) => t.done).length;

  return (
    <div className="stack">
      {/* Header */}
      <div className="card">
        <div className="wrap" style={{ marginBottom: 8 }}>
          <span className={`badge status-${wo.status}`}>
            <span className="dot" />
            {STATUS_LABELS[wo.status]}
          </span>
          {wo.priority === 'high' && <span className="badge pri-high">High priority</span>}
          <span className="badge">{wo.number}</span>
        </div>
        <h1 style={{ fontSize: 24, letterSpacing: '-0.02em' }}>{wo.title || 'Untitled work order'}</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          {[wo.customer, wo.jobType].filter(Boolean).join(' · ')}
        </p>
        {(wo.scheduledDate || wo.startTime) && (
          <p style={{ marginTop: 10, fontWeight: 650 }}>
            📅 {formatDate(wo.scheduledDate)}
            {wo.startTime ? ` · Start ${wo.startTime}` : ''}
          </p>
        )}
      </div>

      {/* Quick actions */}
      <div className="row">
        {mapHref && (
          <a className="btn grow" href={mapHref} target="_blank" rel="noreferrer">
            🧭 Directions
          </a>
        )}
        {wo.contact.phone && (
          <a className="btn grow" href={`tel:${wo.contact.phone}`}>
            📞 Call site
          </a>
        )}
      </div>

      {/* Site & access */}
      {(wo.site.address ||
        wo.site.accessNotes ||
        wo.site.parking ||
        wo.site.gateCode ||
        wo.contact.name) && (
        <Section title="Site & access" icon="🚪">
          {wo.site.address && <KV label="Address" value={wo.site.address} />}
          {wo.contact.name && (
            <KV
              label="Contact"
              value={`${wo.contact.name}${wo.contact.role ? ` (${wo.contact.role})` : ''}${
                wo.contact.phone ? ` · ${wo.contact.phone}` : ''
              }`}
            />
          )}
          {wo.site.gateCode && <KV label="Gate / lockbox" value={wo.site.gateCode} highlight />}
          {wo.site.parking && <KV label="Parking" value={wo.site.parking} />}
          {wo.site.accessNotes && <KV label="Access notes" value={wo.site.accessNotes} />}
        </Section>
      )}

      {/* Scope */}
      {wo.scope && (
        <Section title="Scope of work" icon="📋">
          <p style={{ lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{wo.scope}</p>
        </Section>
      )}

      {/* Tasks */}
      {wo.tasks.length > 0 && (
        <Section title={`Task checklist · ${doneCount}/${wo.tasks.length}`} icon="✅">
          <div className="stack" style={{ gap: 8 }}>
            {wo.tasks.map((t) => (
              <button
                key={t.id}
                onClick={() => toggleTask(t.id)}
                className="between"
                style={{
                  gap: 12,
                  padding: '14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: t.done
                    ? 'color-mix(in srgb, var(--ok) 12%, var(--surface))'
                    : 'var(--surface-2)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  alignItems: 'center',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    flex: '0 0 auto',
                    width: 26,
                    height: 26,
                    borderRadius: 7,
                    display: 'grid',
                    placeItems: 'center',
                    border: `2px solid ${t.done ? 'var(--ok)' : 'var(--faint)'}`,
                    color: t.done ? 'var(--ok)' : 'transparent',
                    fontWeight: 900,
                  }}
                >
                  ✓
                </span>
                <span
                  style={{
                    flex: 1,
                    textDecoration: t.done ? 'line-through' : 'none',
                    color: t.done ? 'var(--muted)' : 'var(--text)',
                  }}
                >
                  {t.text}
                </span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* Materials */}
      {wo.materials.length > 0 && (
        <Section title="Materials" icon="🧱">
          <ItemTable
            rows={wo.materials.map((m) => ({
              main: m.name,
              qty: [m.qty, m.unit].filter((x) => x !== '' && x != null).join(' '),
              sub: m.notes,
            }))}
          />
        </Section>
      )}

      {/* Tools */}
      {wo.tools.length > 0 && (
        <Section title="Tools & equipment" icon="🔧">
          <ItemTable
            rows={wo.tools.map((t) => ({
              main: t.name,
              qty: t.qty !== '' && t.qty != null ? String(t.qty) : '',
              sub: t.notes,
            }))}
          />
        </Section>
      )}

      {/* Crew */}
      {wo.crew.length > 0 && (
        <Section title="Crew" icon="👷">
          <ItemTable
            rows={wo.crew.map((c) => ({
              main: c.name,
              qty: c.hours !== '' && c.hours != null ? `${c.hours} hrs` : '',
              sub: c.role,
            }))}
          />
        </Section>
      )}

      {/* Safety */}
      {(wo.safety.ppe.length > 0 || wo.safety.hazards || wo.safety.permits) && (
        <Section title="Safety" icon="🦺">
          {wo.safety.ppe.length > 0 && (
            <>
              <div className="small muted" style={{ marginBottom: 8, fontWeight: 700 }}>
                Required PPE
              </div>
              <div className="wrap" style={{ marginBottom: wo.safety.hazards ? 14 : 0 }}>
                {wo.safety.ppe.map((p) => (
                  <span key={p} className="badge">
                    {p}
                  </span>
                ))}
              </div>
            </>
          )}
          {wo.safety.hazards && <KV label="Hazards" value={wo.safety.hazards} />}
          {wo.safety.permits && <KV label="Permits" value={wo.safety.permits} />}
        </Section>
      )}

      {/* Notes */}
      {wo.notes && (
        <Section title="Notes" icon="📝">
          <p style={{ lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{wo.notes}</p>
        </Section>
      )}

      {/* Status control + edit */}
      <div className="card">
        <div className="small muted" style={{ marginBottom: 10, fontWeight: 700 }}>
          Update status
        </div>
        <div className="wrap">
          {(['draft', 'ready', 'in_progress', 'complete'] as Status[]).map((s) => (
            <button
              key={s}
              className={`chip ${wo.status === s ? 'on' : ''}`}
              onClick={() => patch({ status: s })}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <Link className="btn grow" to={`/wo/${wo.id}/edit`}>
          ✏️ Edit work order
        </Link>
        <button className="btn" onClick={() => window.print()}>
          🖨️
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: ReactNode;
}) {
  return (
    <div className="card">
      <div className="between" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 16 }}>
          {icon} {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function KV({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="small faint" style={{ fontWeight: 700 }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 2,
          fontWeight: highlight ? 800 : 500,
          fontSize: highlight ? 20 : 16,
          letterSpacing: highlight ? '0.05em' : 0,
          color: highlight ? 'var(--brand)' : 'var(--text)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ItemTable({ rows }: { rows: Array<{ main: string; qty: string; sub: string }> }) {
  return (
    <div className="stack" style={{ gap: 0 }}>
      {rows.map((r, i) => (
        <div
          key={i}
          className="between"
          style={{
            gap: 12,
            padding: '12px 0',
            borderTop: i === 0 ? 'none' : '1px solid var(--border)',
            alignItems: 'flex-start',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{r.main}</div>
            {r.sub && (
              <div className="small faint" style={{ marginTop: 2 }}>
                {r.sub}
              </div>
            )}
          </div>
          {r.qty && (
            <div style={{ fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--muted)' }}>
              {r.qty}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
