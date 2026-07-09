import { Router } from 'express';
import { readWorkOrders, writeWorkOrders } from '../db.js';
import { normalizeWorkOrder, nextNumber, STATUSES } from '../model.js';

export const workOrdersRouter = Router();

// List — newest first, with optional ?status= and ?q= filters.
workOrdersRouter.get('/', async (req, res) => {
  const { status, q } = req.query;
  let items = await readWorkOrders();
  if (status && STATUSES.includes(status)) {
    items = items.filter((w) => w.status === status);
  }
  if (q) {
    const needle = String(q).toLowerCase();
    items = items.filter((w) =>
      [w.title, w.customer, w.number, w.site?.address]
        .filter(Boolean)
        .some((f) => f.toLowerCase().includes(needle)),
    );
  }
  items = [...items].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  res.json(items);
});

// Read one.
workOrdersRouter.get('/:id', async (req, res) => {
  const items = await readWorkOrders();
  const wo = items.find((w) => w.id === req.params.id);
  if (!wo) return res.status(404).json({ error: 'Work order not found' });
  res.json(wo);
});

// Create.
workOrdersRouter.post('/', async (req, res) => {
  const existing = await readWorkOrders();
  const wo = normalizeWorkOrder(req.body);
  if (!wo.number) wo.number = nextNumber(existing);
  await writeWorkOrders((list) => list.push(wo));
  res.status(201).json(wo);
});

// Update (full replace of editable fields).
workOrdersRouter.put('/:id', async (req, res) => {
  const items = await readWorkOrders();
  const current = items.find((w) => w.id === req.params.id);
  if (!current) return res.status(404).json({ error: 'Work order not found' });
  const updated = normalizeWorkOrder({ ...req.body, id: current.id }, current);
  await writeWorkOrders((list) => {
    const idx = list.findIndex((w) => w.id === req.params.id);
    list[idx] = updated;
  });
  res.json(updated);
});

// Delete.
workOrdersRouter.delete('/:id', async (req, res) => {
  let found = false;
  await writeWorkOrders((list) => {
    const idx = list.findIndex((w) => w.id === req.params.id);
    if (idx !== -1) {
      list.splice(idx, 1);
      found = true;
    }
  });
  if (!found) return res.status(404).json({ error: 'Work order not found' });
  res.status(204).end();
});
