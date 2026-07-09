import type { PlanningPrompt, PromptCategory } from '../promptCatalog';
import { CATEGORY_META, promptsForJob } from '../promptCatalog';

interface Props {
  jobType: string;
  categories: PromptCategory[];
  completed: string[];
  onToggle: (id: string) => void;
}

/**
 * The "think it through" panel. Shows the planning prompts relevant to the
 * current section and job type as check-off nudges, so the supervisor
 * actively considers each one instead of forgetting it.
 */
export default function PromptPanel({ jobType, categories, completed, onToggle }: Props) {
  const relevant = promptsForJob(jobType).filter((p) => categories.includes(p.category));
  if (relevant.length === 0) return null;

  const byCat = new Map<PromptCategory, PlanningPrompt[]>();
  for (const p of relevant) {
    if (!byCat.has(p.category)) byCat.set(p.category, []);
    byCat.get(p.category)!.push(p);
  }

  return (
    <div className="card" style={{ background: 'var(--surface-2)', borderStyle: 'dashed' }}>
      <div className="between" style={{ marginBottom: 10 }}>
        <strong className="small">💡 Think it through</strong>
        <span className="small faint">Tap each one you've considered</span>
      </div>
      <div className="stack" style={{ gap: 16 }}>
        {[...byCat.entries()].map(([cat, prompts]) => (
          <div key={cat}>
            <div className="small muted" style={{ fontWeight: 700, marginBottom: 8 }}>
              {CATEGORY_META[cat].icon} {CATEGORY_META[cat].label}
            </div>
            <div className="stack" style={{ gap: 8 }}>
              {prompts.map((p) => {
                const done = completed.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => onToggle(p.id)}
                    className="between"
                    style={{
                      textAlign: 'left',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                      background: done
                        ? 'color-mix(in srgb, var(--ok) 14%, var(--surface))'
                        : 'var(--surface)',
                      cursor: 'pointer',
                      alignItems: 'flex-start',
                      width: '100%',
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 600 }}>{p.question}</span>
                      {p.hint && (
                        <span className="small faint" style={{ display: 'block', marginTop: 2 }}>
                          {p.hint}
                        </span>
                      )}
                    </span>
                    <span
                      aria-hidden
                      style={{
                        flex: '0 0 auto',
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        display: 'grid',
                        placeItems: 'center',
                        border: `1px solid ${done ? 'var(--ok)' : 'var(--border)'}`,
                        color: done ? 'var(--ok)' : 'transparent',
                        fontWeight: 900,
                      }}
                    >
                      ✓
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
