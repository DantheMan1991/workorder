// The planning prompt catalog is what turns this from a form into a thinking
// partner. As the supervisor fills out a work order, relevant prompts surface
// and nudge them: "did you think about this?" Universal prompts apply to every
// job; job-type prompts appear when the job type matches a keyword.

export type PromptCategory =
  | 'scope'
  | 'materials'
  | 'tools'
  | 'crew'
  | 'access'
  | 'safety'
  | 'logistics'
  | 'closeout';

export interface PlanningPrompt {
  id: string;
  category: PromptCategory;
  question: string;
  hint?: string;
  /** Lowercase keywords matched against the job type; omit for universal. */
  jobTypes?: string[];
}

export const CATEGORY_META: Record<PromptCategory, { label: string; icon: string }> = {
  scope: { label: 'Scope & sequence', icon: '📋' },
  materials: { label: 'Materials', icon: '🧱' },
  tools: { label: 'Tools & equipment', icon: '🔧' },
  crew: { label: 'Crew & labor', icon: '👷' },
  access: { label: 'Site access', icon: '🚪' },
  safety: { label: 'Safety', icon: '🦺' },
  logistics: { label: 'Logistics', icon: '🚚' },
  closeout: { label: 'Closeout', icon: '✅' },
};

export const PROMPTS: PlanningPrompt[] = [
  // ---- Universal: scope ----
  { id: 's1', category: 'scope', question: 'Is the scope written so a new crew member could understand it?' },
  { id: 's2', category: 'scope', question: 'What has to be finished before this work can start?', hint: 'Inspections, prior trade, cure time, dry-in.' },
  { id: 's3', category: 'scope', question: 'What does "done" look like for today?', hint: 'Define the stopping point so crew knows the target.' },
  { id: 's4', category: 'scope', question: 'Are there measurements, elevations, or a plan sheet the crew needs?' },

  // ---- Universal: materials ----
  { id: 'm1', category: 'materials', question: 'Is every material ordered and confirmed for delivery?' },
  { id: 'm2', category: 'materials', question: 'Did you add fasteners, adhesives, and consumables?', hint: 'Screws, nails, glue, tape, blades, bits — the stuff that gets forgotten.' },
  { id: 'm3', category: 'materials', question: 'Is there a 10% overage on cut materials?' },
  { id: 'm4', category: 'materials', question: 'Where is material staged, and who receives the delivery?' },

  // ---- Universal: tools ----
  { id: 't1', category: 'tools', question: 'Any specialty tools or rentals needed?', hint: 'Rentals often need a day of lead time.' },
  { id: 't2', category: 'tools', question: 'Is there power on site, or do you need a generator + cords?' },
  { id: 't3', category: 'tools', question: 'Ladders, scaffold, or lift needed to reach the work?' },
  { id: 't4', category: 'tools', question: 'Are blades, bits, and batteries charged and packed?' },

  // ---- Universal: crew ----
  { id: 'c1', category: 'crew', question: 'Is the crew size right for the hours and the deadline?' },
  { id: 'c2', category: 'crew', question: 'Does someone on site hold the required license or cert?' },
  { id: 'c3', category: 'crew', question: 'Who is the lead / point of contact for today?' },
  { id: 'c4', category: 'crew', question: 'Does the crew know the start time and where to meet?' },

  // ---- Universal: access ----
  { id: 'a1', category: 'access', question: 'How does the crew get in? Gate code, key box, or a person?' },
  { id: 'a2', category: 'access', question: 'Where does the crew park and unload?' },
  { id: 'a3', category: 'access', question: 'Any hours restrictions, HOA, or noise limits?' },
  { id: 'a4', category: 'access', question: 'Is there a site contact and phone number if something is locked?' },

  // ---- Universal: safety ----
  { id: 'f1', category: 'safety', question: 'What PPE is required for this task?' },
  { id: 'f2', category: 'safety', question: 'What are the top hazards, and how are they controlled?' },
  { id: 'f3', category: 'safety', question: 'Are permits pulled and posted on site?' },
  { id: 'f4', category: 'safety', question: 'Where is the nearest hospital / first-aid kit / eyewash?' },
  { id: 'f5', category: 'safety', question: 'Are utilities located/marked before you dig or cut?', jobTypes: ['excav', 'dig', 'concrete', 'foundation', 'plumb', 'trench', 'demo'] },

  // ---- Universal: logistics ----
  { id: 'l1', category: 'logistics', question: 'Where does waste and debris go? Dumpster on site?' },
  { id: 'l2', category: 'logistics', question: 'Is there a bathroom / water for the crew?' },
  { id: 'l3', category: 'logistics', question: 'Weather check — does it affect the work or the pour?' },

  // ---- Universal: closeout ----
  { id: 'z1', category: 'closeout', question: 'What sign-off, photos, or inspection is needed at the end?' },
  { id: 'z2', category: 'closeout', question: 'Who cleans up, and what condition is the site left in?' },

  // ---- Concrete / foundation ----
  { id: 'con1', category: 'materials', question: 'Concrete: right mix, PSI, and yardage ordered with the right truck window?', jobTypes: ['concrete', 'foundation', 'footing', 'slab', 'pour'] },
  { id: 'con2', category: 'tools', question: 'Concrete: floats, screed, vibrator, and a wash-out plan?', jobTypes: ['concrete', 'foundation', 'footing', 'slab', 'pour'] },
  { id: 'con3', category: 'scope', question: 'Concrete: rebar/mesh, forms braced, and anchor bolt layout confirmed?', jobTypes: ['concrete', 'foundation', 'footing', 'slab', 'pour'] },

  // ---- Framing / carpentry ----
  { id: 'fr1', category: 'materials', question: 'Framing: correct lumber grade, sheathing, hangers, and the right nails?', jobTypes: ['fram', 'carpent', 'wood', 'deck'] },
  { id: 'fr2', category: 'tools', question: 'Framing: nailers, compressor, and enough hose on site?', jobTypes: ['fram', 'carpent', 'deck'] },

  // ---- Electrical ----
  { id: 'el1', category: 'safety', question: 'Electrical: lockout/tagout plan and circuits verified de-energized?', jobTypes: ['electric', 'wiring', 'panel'] },
  { id: 'el2', category: 'materials', question: 'Electrical: correct wire gauge, boxes, breakers, and wire nuts?', jobTypes: ['electric', 'wiring', 'panel'] },

  // ---- Plumbing ----
  { id: 'pl1', category: 'scope', question: 'Plumbing: water shut-off located and pressure test planned?', jobTypes: ['plumb', 'pipe', 'water', 'drain'] },
  { id: 'pl2', category: 'materials', question: 'Plumbing: correct pipe size/material, fittings, solder/glue, and seals?', jobTypes: ['plumb', 'pipe', 'water', 'drain'] },

  // ---- Roofing ----
  { id: 'ro1', category: 'safety', question: 'Roofing: fall protection, anchors, and edge plan in place?', jobTypes: ['roof', 'shingle'] },
  { id: 'ro2', category: 'logistics', question: 'Roofing: tear-off disposal and a weather window for dry-in?', jobTypes: ['roof', 'shingle'] },

  // ---- Excavation ----
  { id: 'ex1', category: 'safety', question: 'Excavation: 811 utility locate done and trench protection planned?', jobTypes: ['excav', 'dig', 'trench', 'grade'] },

  // ---- Drywall / paint ----
  { id: 'dp1', category: 'logistics', question: 'Drywall/paint: dust control, floor protection, and ventilation?', jobTypes: ['drywall', 'paint', 'finish', 'mud'] },

  // ---- HVAC ----
  { id: 'hv1', category: 'materials', question: 'HVAC: duct sizing, refrigerant, and the right connectors on hand?', jobTypes: ['hvac', 'duct', 'furnace', 'ac', 'air'] },
];

/** Return prompts relevant to a job type: universal ones plus keyword matches. */
export function promptsForJob(jobType: string): PlanningPrompt[] {
  const jt = (jobType || '').toLowerCase();
  return PROMPTS.filter((p) => {
    if (!p.jobTypes) return true;
    return p.jobTypes.some((k) => jt.includes(k));
  });
}
