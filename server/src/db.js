import { JSONFilePreset } from 'lowdb/node';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const dbFile = process.env.DB_FILE || join(dataDir, 'db.json');

/**
 * Default shape of the database. The data layer is intentionally isolated
 * here so the JSON-file store can later be swapped for Postgres without the
 * route handlers changing.
 */
const defaultData = { workOrders: [] };

export const db = await JSONFilePreset(dbFile, defaultData);

export async function readWorkOrders() {
  await db.read();
  return db.data.workOrders;
}

export async function writeWorkOrders(mutator) {
  await db.update((data) => {
    mutator(data.workOrders, data);
  });
}
