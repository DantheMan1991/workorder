# Job cost reconciliation

Turns a Buildertrend **Job Costing Budget Cost Summary** export into something you can
read, and folds cost that landed on the retired letter-prefixed cost codes back onto
the numbered codes that replaced them.

## Run it

```bash
pip install openpyxl
python3 reconcile.py "path/to/Job_Costing_Budget_Cost_Summary_....xlsx"
```

That writes three files into `out/`:

| File | What it is |
|---|---|
| `Philips_JobCost_Reallocated.xlsx` | Four tabs: the reallocated summary, every reallocation with its reason, a before/after comparison, and the flags |
| `job_cost_dashboard.html` | The one-screen read — headline position, the cleanup, budget vs spent by trade, flags, a searchable ledger of all 124 codes, and crew hours |
| `summary.json` | The numbers behind both of the above |

## Changing where a retired code lands

Every mapping decision lives in `cost_code_map.json` — nothing is hard-coded in the
script. Edit a `to` value and re-run; both outputs rebuild.

- **`buckets`** — one rule per retired code, e.g. `E- Mileage → 07.60 - Supervisor Mileage`.
- **`item_overrides`** — a single transaction that goes somewhere other than its bucket's
  default, matched on the document reference and amount. Used where a bill or check number
  from a retired code also appears under a numbered code, which says where it belongs.
- **`confidence`** — `high` when a shared bill/check number or an exact name match backs the
  mapping, `medium` for a category-level match with no document evidence, `review` for
  anything a human has to confirm before the reallocation can be trusted.

## How the arithmetic works

Read off the export itself and verified against all 124 codes:

```
Cost To Complete      = max(Revised Budget - Actual, 0)
Revised vs Projected  = Revised Budget - Actual - Cost To Complete
```

A reallocation moves original budget, revised budget, actual and cost-to-complete off the
retired code and onto its replacement, then recomputes both formulas for every code it
touched. Total actual cost is identical before and after — the money only changes address.
One code (`04.35 - Waterproofing Subcontractor`) has no cost-to-complete entered at all;
the script leaves that blank rather than inventing a projection, and flags it.

## Flags

`find_anomalies` reports, largest first:

- codes projected more than $20k over, with the untouched budget in the same trade named
  when one looks like the other half of a mis-split
- a budget with no cost-to-complete, which reads as a saving it is not
- two cost codes sharing one number, and the transactions they both carry
- the same bill or check number posted twice inside the retired codes
