# WorkOrder

A guided work order builder for construction supervisors and their field crews.

The app does two jobs:

1. **Helps the supervisor think through the whole job.** As you build a work
   order, the app walks you section by section and surfaces "did you think about
   this?" prompts — materials, tools, crew, site access, safety — so nothing
   gets forgotten. The prompts adapt to the job type (concrete, electrical,
   roofing, etc.).
2. **Gives the field crew everything they need to just get to work.** The crew
   opens a clean job sheet on their phone: address with one-tap directions,
   one-tap call to the site contact, gate/lockbox codes, scope, a checkable task
   list, materials with quantities, tools, crew, and safety/PPE.

Installable to a phone home screen (PWA) so it behaves like a dedicated app, and
fully responsive for project managers working on a desktop.

## Tech

- **web/** — React + TypeScript + Vite front end. Mobile-first, installable PWA.
- **server/** — Express API with a shared data store, so supervisors, PMs, and
  crew all see the same live work orders across devices.

The data layer lives behind a small module (`server/src/db.js` +
`server/src/model.js`). The MVP persists to a JSON file, which is enough to run a
real shared backend on one server; swapping it for Postgres is a contained change
that doesn't touch the routes or the front end.

## Run it locally

```bash
npm install          # install web + server dependencies
npm run seed         # (optional) load a couple of sample work orders
npm run dev          # start API (:4000) and web (:5173) together
```

Then open http://localhost:5173. The Vite dev server proxies `/api` to the
Express server automatically.

## Build & serve as one app

```bash
npm run build        # builds the web front end into web/dist
npm start            # Express serves the API + the built front end on :4000
```

Open http://localhost:4000.

## API

| Method | Path                     | Purpose                          |
| ------ | ------------------------ | -------------------------------- |
| GET    | `/api/health`            | Health check                     |
| GET    | `/api/workorders`        | List (supports `?status=`, `?q=`)|
| POST   | `/api/workorders`        | Create (auto-assigns WO number)  |
| GET    | `/api/workorders/:id`    | Read one                         |
| PUT    | `/api/workorders/:id`    | Update                           |
| DELETE | `/api/workorders/:id`    | Delete                           |

## Configuration

- `PORT` — API port (default `4000`).
- `DB_FILE` — path to the JSON data file (default `server/data/db.json`).

## Where this goes next

- **Accounts & roles** (supervisor / PM / crew) once a real auth provider is in
  place.
- **Postgres** for the shared cloud backend — swap the store in `server/src/db.js`.
- **Photos & attachments** on the job sheet.
- **Native shell** (e.g. Expo / React Native) reusing the same API if a
  store-distributed app is wanted beyond the installable PWA.
