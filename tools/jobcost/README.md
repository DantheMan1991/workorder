# Job cost reconciliation

Turns a Buildertrend **Job Costing Budget Cost Summary** export into something you can
read. Two things make it readable:

1. **Work packages.** Cost codes are grouped into the piece of work they belong to —
   all of trim's labor, mileage, material and subcontractor codes are one line — and
   budget vs cost is totalled and compared **on the package**, not per code. An invoice
   booked to the trim mileage line instead of the trim material line nets out inside the
   package instead of printing a $94,684 overrun that isn't real.
2. **Retired cost codes.** Cost that landed on the old letter-prefixed codes is folded
   back onto the numbered codes that replaced them, so it counts against the right budget.

## Run it

```bash
pip install openpyxl
python3 reconcile.py "path/to/Job_Costing_Budget_Cost_Summary_....xlsx"
```

That writes three files into `out/`:

| File | What it is |
|---|---|
| `Philips_JobCost_Reallocated.xlsx` | Six tabs: work packages, cost sitting on the wrong line, per-code detail, every reallocation with its reason, before/after, and the flags |
| `job_cost_dashboard.html` | The one-screen read — headline position, the six trades, all 52 work packages, cost sitting on the wrong line, flags, and crew hours |
| `summary.json` | The numbers behind both of the above |

## Changing how codes group into packages

`work_packages.json` holds the grouping rules:

- **`cost_types`** — the suffixes stripped off a code title to find its package.
  `06.110 - Interior Door Doors, Trim and Stairs Material` loses `Material` and lands in
  the `Interior Door Doors, Trim and Stairs` package. Longest match wins, so
  `Equipment Fuel` is stripped before `Equipment`.
- **`aliases`** — merges two package names into one. `Public/Private Sewer` folds into
  `Public Sewer`; add a line to merge any other pair.

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

The export computes these per cost code, which is where the false overruns come from:

```
Cost To Complete      = max(Revised Budget - Actual, 0)
Revised vs Projected  = Revised Budget - Actual - Cost To Complete
```

Verified against all 124 codes. The dashboard applies the same two formulas to the
**package total** instead, so an overspent line gets credit for the unspent line beside
it. Per code the job reads $596,984 over; per package it is $159,046 over. The toggle on
the page also offers per-trade netting ($20,517), which is looser — it lets an underspent
package cover an overspent one in the same trade.

A reallocation moves original budget, revised budget, actual and cost-to-complete off the
retired code and onto its replacement, then recomputes both formulas for every code it
touched. Total actual cost is identical before and after — the money only changes address.
One code (`04.35 - Waterproofing Subcontractor`) has no cost-to-complete entered at all;
the script leaves that blank rather than inventing a projection, and flags it.

## Flags

`find_anomalies` reports what survives the netting, largest first:

- packages whose own budget cannot absorb their cost
- packages carrying cost with no budget set at all
- two cost codes sharing one number, and the transactions they both carry
- the same bill or check number posted twice

`find_miscodes` is separate and reports the opposite case: a line carrying far more than
its own budget while a sibling line in the same package sits unspent. The package absorbs
it, so it is not an overrun — but it is what to re-code.
