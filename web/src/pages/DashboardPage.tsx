import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { Status, WorkOrder } from '../types';
import { STATUS_LABELS } from '../types';

const FILTERS: Array<{ key: 'all' | Status; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'ready', label: 'Ready' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'draft', label: 'Drafts' },
  { key: 'complete', label: 'Complete' },
];

function formatDate(d: string): string {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function readiness(wo: WorkOrder): number {
  let filled = 0;
  const total = 5;
  if (wo.scope.trim()) filled++;
  if (wo.materials.length) filled++;
  if (wo.tools.length) filled++;
  if (wo.crew.length) filled++;
  if (wo.site.address.trim()) filled++;
  return Math.round((filled / total) * 100);
}

export default function DashboardPage() {
  const [items, setItems] = useState<WorkOrder[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .list()
      .then((data) => alive && setItems(data))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!items) return [];
    const needle = q.trim().toLowerCase();
    return items.filter((w) => {
      if (filter !== 'all' && w.status !== filter) return false;
      if (!needle) return true;
      return [w.title, w.customer, w.number, w.site.address]
        .filter(Boolean)
        .some((f) => f.toLowerCase().includes(needle));
    });
  }, [items, filter, q]);

  if (error) {
    return (
      <div className="empty">
        <div className="big">⚠️</div>
        <p>Couldn't load work orders.</p>
        <p className="small faint">{error}</p>
      </div>
    );
  }

  if (!items) {
    return <div className="empty">Loading…</div>;
  }

  return (
    <div>
      <input
        className="input"
        placeholder="Search jobs, customers, addresses…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      <div className="wrap" style={{ marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`chip ${filter === f.key ? 'on' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="big">📋</div>
          <p>No work orders yet.</p>
          <p className="small faint">Create one and the app will walk you through the plan.</p>
          <Link to="/new" className="btn primary" style={{ marginTop: 16 }}>
            + New work order
          </Link>
        </div>
      ) : (
        <div className="stack">
          {filtered.map((wo) => (
            <Link key={wo.id} to={`/wo/${wo.id}`} className="card" style={{ display: 'block' }}>
              <div className="between" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="wrap" style={{ marginBottom: 6 }}>
                    <span className={`badge status-${wo.status}`}>
                      <span className="dot" />
                      {STATUS_LABELS[wo.status]}
                    </span>
                    {wo.priority === 'high' && <span className="badge pri-high">High priority</span>}
                  </div>
                  <h3 style={{ fontSize: 17 }}>{wo.title || 'Untitled work order'}</h3>
                  <p className="small muted" style={{ marginTop: 4 }}>
                    {[wo.customer, wo.site.address].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className="small faint" style={{ whiteSpace: 'nowrap' }}>
                  {wo.number}
                </span>
              </div>
              <div className="between" style={{ marginTop: 12 }}>
                <span className="small muted">
                  {wo.scheduledDate ? `📅 ${formatDate(wo.scheduledDate)}` : 'No date set'}
                  {wo.startTime ? ` · ${wo.startTime}` : ''}
                </span>
                <span className="small faint">{readiness(wo)}% planned</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
