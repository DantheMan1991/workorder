import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import type { Priority, Status, WorkOrder } from '../types';
import { CrewEditor, MaterialEditor, TaskEditor, ToolEditor } from '../components/ListEditors';
import PromptPanel from '../components/PromptPanel';
import type { PromptCategory } from '../promptCatalog';

type Draft = Omit<WorkOrder, 'id' | 'number' | 'createdAt' | 'updatedAt' | 'createdBy'>;

const BLANK: Draft = {
  title: '',
  customer: '',
  jobType: '',
  status: 'draft',
  priority: 'normal',
  site: { address: '', accessNotes: '', parking: '', gateCode: '' },
  contact: { name: '', phone: '', role: '' },
  scheduledDate: '',
  startTime: '',
  estHours: '',
  scope: '',
  tasks: [],
  materials: [],
  tools: [],
  crew: [],
  safety: { ppe: [], hazards: '', permits: '' },
  notes: '',
  completedPrompts: [],
};

const PPE_OPTIONS = [
  'Hard hat',
  'Safety glasses',
  'Hi-vis vest',
  'Steel-toe boots',
  'Work gloves',
  'Cut-resistant gloves',
  'Hearing protection',
  'Dust mask / respirator',
  'Face shield',
  'Fall harness',
];

const JOB_TYPES = [
  'Concrete / Foundation',
  'Framing / Carpentry',
  'Electrical',
  'Plumbing',
  'Roofing',
  'Excavation / Grading',
  'Drywall / Paint',
  'HVAC',
  'Demolition',
  'General',
];

interface Step {
  key: string;
  title: string;
  categories: PromptCategory[];
}

const STEPS: Step[] = [
  { key: 'basics', title: 'Job basics', categories: [] },
  { key: 'site', title: 'Site & access', categories: ['access', 'logistics'] },
  { key: 'scope', title: 'Scope & tasks', categories: ['scope'] },
  { key: 'materials', title: 'Materials', categories: ['materials'] },
  { key: 'tools', title: 'Tools & equipment', categories: ['tools'] },
  { key: 'crew', title: 'Crew', categories: ['crew'] },
  { key: 'safety', title: 'Safety', categories: ['safety', 'closeout'] },
  { key: 'review', title: 'Review', categories: [] },
];

export default function EditorPage() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const [id, setId] = useState<string | undefined>(routeId);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(!!routeId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!routeId) return;
    let alive = true;
    api
      .get(routeId)
      .then((wo) => {
        if (!alive) return;
        setDraft(wo);
        setLoading(false);
      })
      .catch((e) => alive && (setError(e.message), setLoading(false)));
    return () => {
      alive = false;
    };
  }, [routeId]);

  useEffect(() => {
    topRef.current?.scrollIntoView({ block: 'start' });
  }, [step]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setSite = (k: keyof Draft['site'], v: string) =>
    setDraft((d) => ({ ...d, site: { ...d.site, [k]: v } }));
  const setContact = (k: keyof Draft['contact'], v: string) =>
    setDraft((d) => ({ ...d, contact: { ...d.contact, [k]: v } }));
  const setSafety = (k: keyof Draft['safety'], v: string | string[]) =>
    setDraft((d) => ({ ...d, safety: { ...d.safety, [k]: v } }));
  const togglePPE = (item: string) =>
    setDraft((d) => ({
      ...d,
      safety: {
        ...d.safety,
        ppe: d.safety.ppe.includes(item)
          ? d.safety.ppe.filter((x) => x !== item)
          : [...d.safety.ppe, item],
      },
    }));
  const togglePrompt = (pid: string) =>
    setDraft((d) => ({
      ...d,
      completedPrompts: d.completedPrompts.includes(pid)
        ? d.completedPrompts.filter((x) => x !== pid)
        : [...d.completedPrompts, pid],
    }));

  async function persist(): Promise<string | null> {
    setSaving(true);
    setError('');
    try {
      if (id) {
        await api.update(id, draft);
        return id;
      }
      const created = await api.create(draft);
      setId(created.id);
      // Keep editing the same record without a full navigation.
      window.history.replaceState(null, '', `/wo/${created.id}/edit`);
      return created.id;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  async function next() {
    // Persist progress at each step so nothing is lost.
    const savedId = await persist();
    if (!savedId) return;
    if (isLast) {
      navigate(`/wo/${savedId}`);
    } else {
      setStep((s) => s + 1);
    }
  }

  const progress = useMemo(() => Math.round(((step + 1) / STEPS.length) * 100), [step]);

  if (loading) return <div className="empty">Loading…</div>;

  return (
    <div ref={topRef}>
      {/* Progress */}
      <div style={{ marginBottom: 14 }}>
        <div className="between" style={{ marginBottom: 8 }}>
          <h2 style={{ fontSize: 20 }}>
            {routeId || id ? 'Edit work order' : 'New work order'}
          </h2>
          <span className="small faint">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
        <div
          style={{
            height: 6,
            borderRadius: 999,
            background: 'var(--surface-2)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: 'var(--brand)',
              transition: 'width 0.25s ease',
            }}
          />
        </div>
        <div className="small muted" style={{ marginTop: 8, fontWeight: 700 }}>
          {current.title}
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: 12 }}>
          <span className="small" style={{ color: '#fecaca' }}>
            {error}
          </span>
        </div>
      )}

      {/* Step body */}
      {current.key === 'basics' && (
        <div className="card">
          <div className="field">
            <label>
              Job title <span className="req">*</span>
            </label>
            <input
              className="input"
              placeholder="e.g. Pour footings — Maple St. addition"
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </div>
          <div className="cols-2">
            <div className="field">
              <label>Customer</label>
              <input
                className="input"
                value={draft.customer}
                onChange={(e) => set('customer', e.target.value)}
              />
            </div>
            <div className="field">
              <label>Job type</label>
              <select
                className="select"
                value={draft.jobType}
                onChange={(e) => set('jobType', e.target.value)}
              >
                <option value="">Select…</option>
                {JOB_TYPES.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="cols-2">
            <div className="field">
              <label>Scheduled date</label>
              <input
                className="input"
                type="date"
                value={draft.scheduledDate}
                onChange={(e) => set('scheduledDate', e.target.value)}
              />
            </div>
            <div className="field">
              <label>Start time</label>
              <input
                className="input"
                type="time"
                value={draft.startTime}
                onChange={(e) => set('startTime', e.target.value)}
              />
            </div>
          </div>
          <div className="cols-2">
            <div className="field">
              <label>Priority</label>
              <select
                className="select"
                value={draft.priority}
                onChange={(e) => set('priority', e.target.value as Priority)}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
            <div className="field">
              <label>Status</label>
              <select
                className="select"
                value={draft.status}
                onChange={(e) => set('status', e.target.value as Status)}
              >
                <option value="draft">Draft</option>
                <option value="ready">Ready for crew</option>
                <option value="in_progress">In progress</option>
                <option value="complete">Complete</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {current.key === 'site' && (
        <div className="card">
          <div className="field">
            <label>Site address</label>
            <input
              className="input"
              placeholder="Street, city"
              value={draft.site.address}
              onChange={(e) => setSite('address', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Access notes</label>
            <textarea
              className="textarea"
              placeholder="How does the crew get in? Who lets them in?"
              value={draft.site.accessNotes}
              onChange={(e) => setSite('accessNotes', e.target.value)}
            />
          </div>
          <div className="cols-2">
            <div className="field">
              <label>Parking / unloading</label>
              <input
                className="input"
                value={draft.site.parking}
                onChange={(e) => setSite('parking', e.target.value)}
              />
            </div>
            <div className="field">
              <label>Gate / lockbox code</label>
              <input
                className="input"
                value={draft.site.gateCode}
                onChange={(e) => setSite('gateCode', e.target.value)}
              />
            </div>
          </div>
          <div className="section-title">
            Site contact <span className="line" />
          </div>
          <div className="cols-2">
            <div className="field">
              <label>Name</label>
              <input
                className="input"
                value={draft.contact.name}
                onChange={(e) => setContact('name', e.target.value)}
              />
            </div>
            <div className="field">
              <label>Phone</label>
              <input
                className="input"
                type="tel"
                inputMode="tel"
                value={draft.contact.phone}
                onChange={(e) => setContact('phone', e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label>Role</label>
            <input
              className="input"
              placeholder="Homeowner, super, GC…"
              value={draft.contact.role}
              onChange={(e) => setContact('role', e.target.value)}
            />
          </div>
        </div>
      )}

      {current.key === 'scope' && (
        <div className="card">
          <div className="field">
            <label>Scope of work</label>
            <textarea
              className="textarea"
              style={{ minHeight: 120 }}
              placeholder="What's the job? Write it so the crew knows exactly what to do."
              value={draft.scope}
              onChange={(e) => set('scope', e.target.value)}
            />
          </div>
          <div className="section-title">
            Task checklist <span className="line" />
          </div>
          <TaskEditor items={draft.tasks} onChange={(v) => set('tasks', v)} />
        </div>
      )}

      {current.key === 'materials' && (
        <div className="card">
          <p className="small muted" style={{ marginBottom: 12 }}>
            List everything the crew needs on site — including fasteners and consumables.
          </p>
          <MaterialEditor items={draft.materials} onChange={(v) => set('materials', v)} />
        </div>
      )}

      {current.key === 'tools' && (
        <div className="card">
          <p className="small muted" style={{ marginBottom: 12 }}>
            Tools, equipment, and rentals that need to be on the truck or delivered.
          </p>
          <ToolEditor items={draft.tools} onChange={(v) => set('tools', v)} />
        </div>
      )}

      {current.key === 'crew' && (
        <div className="card">
          <p className="small muted" style={{ marginBottom: 12 }}>
            Who's assigned, their role, and estimated hours.
          </p>
          <CrewEditor items={draft.crew} onChange={(v) => set('crew', v)} />
        </div>
      )}

      {current.key === 'safety' && (
        <div className="card">
          <div className="field">
            <label>Required PPE</label>
            <div className="wrap">
              {PPE_OPTIONS.map((item) => (
                <button
                  key={item}
                  className={`chip ${draft.safety.ppe.includes(item) ? 'on' : ''}`}
                  onClick={() => togglePPE(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Hazards & controls</label>
            <textarea
              className="textarea"
              placeholder="Top hazards on this job and how they're controlled."
              value={draft.safety.hazards}
              onChange={(e) => setSafety('hazards', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Permits & inspections</label>
            <input
              className="input"
              placeholder="Permit numbers, what's posted, inspection needs"
              value={draft.safety.permits}
              onChange={(e) => setSafety('permits', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Additional notes</label>
            <textarea
              className="textarea"
              placeholder="Anything else the crew should know."
              value={draft.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>
        </div>
      )}

      {current.key === 'review' && <ReviewStep draft={draft} onEditStep={setStep} />}

      {/* Prompt panel for the current section */}
      {current.categories.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <PromptPanel
            jobType={draft.jobType}
            categories={current.categories}
            completed={draft.completedPrompts}
            onToggle={togglePrompt}
          />
        </div>
      )}

      {/* Sticky footer nav */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          marginTop: 20,
          paddingBottom: 'var(--safe-bottom)',
          background: 'linear-gradient(transparent, var(--bg) 24%)',
        }}
      >
        <div className="row" style={{ paddingTop: 16 }}>
          <button
            className="btn"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={isFirst}
            style={{ flex: '0 0 auto', opacity: isFirst ? 0.4 : 1 }}
          >
            ← Back
          </button>
          <button className="btn primary grow" onClick={next} disabled={saving}>
            {saving ? 'Saving…' : isLast ? 'Save & view job sheet' : 'Save & continue →'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewStep({ draft, onEditStep }: { draft: Draft; onEditStep: (n: number) => void }) {
  const totalHours = draft.crew.reduce((sum, c) => sum + (Number(c.hours) || 0), 0);
  const gaps: string[] = [];
  if (!draft.title.trim()) gaps.push('Job has no title');
  if (!draft.scope.trim()) gaps.push('No scope of work written');
  if (!draft.site.address.trim()) gaps.push('No site address');
  if (draft.materials.length === 0) gaps.push('No materials listed');
  if (draft.tools.length === 0) gaps.push('No tools listed');
  if (draft.crew.length === 0) gaps.push('No crew assigned');
  if (draft.safety.ppe.length === 0) gaps.push('No PPE selected');

  return (
    <div className="stack">
      <div className="card">
        <h3 style={{ marginBottom: 4 }}>{draft.title || 'Untitled work order'}</h3>
        <p className="small muted">
          {[draft.customer, draft.jobType].filter(Boolean).join(' · ') || 'No customer / type'}
        </p>
        <div className="wrap" style={{ marginTop: 12 }}>
          <span className="badge">🧱 {draft.materials.length} materials</span>
          <span className="badge">🔧 {draft.tools.length} tools</span>
          <span className="badge">👷 {draft.crew.length} crew</span>
          <span className="badge">⏱ {totalHours || 0} hrs</span>
        </div>
      </div>

      {gaps.length > 0 ? (
        <div className="card" style={{ borderColor: 'var(--warn)' }}>
          <strong className="small" style={{ color: 'var(--warn)' }}>
            ⚠️ Before you send this to the crew
          </strong>
          <ul className="small muted" style={{ margin: '10px 0 0', paddingLeft: 18 }}>
            {gaps.map((g) => (
              <li key={g} style={{ marginBottom: 4 }}>
                {g}
              </li>
            ))}
          </ul>
          <p className="small faint" style={{ marginTop: 10 }}>
            These aren't required — but a crew works best when they're filled in.
          </p>
        </div>
      ) : (
        <div className="card" style={{ borderColor: 'var(--ok)' }}>
          <strong className="small" style={{ color: 'var(--ok)' }}>
            ✅ This work order is well planned — ready for the crew.
          </strong>
        </div>
      )}

      <button className="btn ghost" onClick={() => onEditStep(0)}>
        Jump back to the start to edit
      </button>
    </div>
  );
}
