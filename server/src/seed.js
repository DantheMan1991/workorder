import { db } from './db.js';
import { normalizeWorkOrder, nextNumber } from './model.js';

const samples = [
  {
    title: 'Pour footings — Maple St. addition',
    customer: 'Henderson Residence',
    jobType: 'Concrete / Foundation',
    status: 'ready',
    priority: 'high',
    site: {
      address: '412 Maple St, Springfield',
      accessNotes: 'Enter from alley behind house. Dog in back yard — owner will secure by 7am.',
      parking: 'Street parking on Maple; leave driveway clear for pump truck.',
      gateCode: '',
    },
    contact: { name: 'Rick Henderson', phone: '555-0142', role: 'Homeowner' },
    scheduledDate: '2026-07-14',
    startTime: '07:00',
    estHours: 8,
    scope:
      'Form and pour 24 linear feet of footing for the rear addition. Inspection was passed Friday — good to pour.',
    tasks: [
      { text: 'Confirm forms are square and braced', done: false },
      { text: 'Pump truck arrives 8:00 — flag driveway', done: false },
      { text: 'Screed and float top of footing', done: false },
      { text: 'Set anchor bolts per plan (48" O.C.)', done: false },
    ],
    materials: [
      { name: 'Ready-mix concrete 3000psi', qty: 4, unit: 'yd³', notes: 'Ordered — arrives 8am' },
      { name: 'Rebar #4', qty: 12, unit: 'sticks', notes: '' },
      { name: 'Anchor bolts 1/2"x10"', qty: 8, unit: 'ea', notes: '' },
      { name: 'Form release', qty: 1, unit: 'gal', notes: '' },
    ],
    tools: [
      { name: 'Concrete vibrator', qty: 1, notes: '' },
      { name: 'Bull float + fresno', qty: 1, notes: '' },
      { name: 'Screed board 12ft', qty: 1, notes: '' },
    ],
    crew: [
      { name: 'Miguel', role: 'Lead', hours: 8 },
      { name: 'Dave', role: 'Finisher', hours: 8 },
      { name: 'Tyler', role: 'Laborer', hours: 6 },
    ],
    safety: {
      ppe: ['Hard hat', 'Safety glasses', 'Rubber boots', 'Gloves'],
      hazards: 'Wet concrete — chemical burns. Rinse station on truck.',
      permits: 'Foundation permit #2026-0455 posted on site.',
    },
    notes: 'Homeowner requested no work before 7am (neighbors).',
  },
  {
    title: 'Rough-in electrical — Unit 3B',
    customer: 'Cedar Ridge Apartments',
    jobType: 'Electrical',
    status: 'draft',
    priority: 'normal',
    site: {
      address: '88 Cedar Ridge Dr, Building B',
      accessNotes: 'Key box at leasing office, code below. Sign in with super.',
      parking: 'Loading zone at rear — 2 hr limit, use cones.',
      gateCode: '4471',
    },
    contact: { name: 'Ana (Site Super)', phone: '555-0199', role: 'Superintendent' },
    scheduledDate: '2026-07-16',
    startTime: '08:00',
    estHours: 10,
    scope: 'Rough-in wiring for kitchen and two baths per approved plan. Panel already set.',
    tasks: [
      { text: 'Verify panel is energized and labeled', done: false },
      { text: 'Pull home runs to kitchen counter circuits', done: false },
    ],
    materials: [
      { name: '12/2 Romex', qty: 250, unit: 'ft', notes: '' },
      { name: 'Old-work boxes', qty: 14, unit: 'ea', notes: '' },
    ],
    tools: [{ name: 'Fish tape', qty: 1, notes: '' }],
    crew: [{ name: 'Priya', role: 'Journeyman', hours: 10 }],
    safety: {
      ppe: ['Safety glasses', 'Voltage-rated gloves'],
      hazards: 'Confirm circuits de-energized before work — lockout/tagout.',
      permits: 'Electrical permit pending — confirm before start.',
    },
    notes: '',
  },
];

await db.read();
db.data.workOrders = [];
for (const s of samples) {
  const wo = normalizeWorkOrder(s);
  if (!wo.number) wo.number = nextNumber(db.data.workOrders);
  db.data.workOrders.push(wo);
}
await db.write();
console.log(`Seeded ${db.data.workOrders.length} work orders.`);
process.exit(0);
