#!/usr/bin/env python3
"""Reconcile a Buildertrend "Job Costing Budget Cost Summary" export.

Does two things:
  1. Rolls the 1,500-row line-item export up into a summary that fits on a screen.
  2. Moves cost that was posted to the retired letter-prefixed cost codes
     (E-, F-, G-, K-, L-, M-) onto the numeric cost codes that replaced them,
     using the mapping in cost_code_map.json.

    python3 reconcile.py <export.xlsx> [-o out/]

Writes out/summary.json (feeds build_dashboard.py) and out/<name>_Reallocated.xlsx.
"""
import argparse, json, re, sys
from pathlib import Path

import openpyxl

HERE = Path(__file__).parent
MONEY = ("ob", "rb", "ac", "ctc")


def z(v):
    return 0.0 if v is None else float(v)


def num(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def is_legacy(code):
    """New-system codes start with a digit; the retired ones start with a letter."""
    return not re.match(r"^\d", str(code).strip())


def load(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb[wb.sheetnames[0]]
    cats, cat, code = [], None, None
    for i, row in enumerate(ws.iter_rows(values_only=True), start=1):
        if i == 1:
            continue
        kind = row[0]
        if kind == "Category":
            cat = {"name": row[1], "row": i, "codes": [],
                   **{k: num(row[c]) for k, c in zip(MONEY, (5, 6, 7, 9))},
                   "rvp": num(row[10])}
            cats.append(cat)
        elif kind == "Cost Code":
            code = {"code": row[2], "row": i, "category": cat["name"], "proj": row[8], "items": [],
                    **{k: num(row[c]) for k, c in zip(MONEY, (5, 6, 7, 9))},
                    "rvp": num(row[10])}
            cat["codes"].append(code)
        elif kind == "Related Item":
            code["items"].append({"row": i, "entity": row[3], "title": row[4],
                                  **{k: num(row[c]) for k, c in zip(MONEY, (5, 6, 7, 9))}})
    return cats


def index_codes(cats):
    return {c["code"]: c for cat in cats for c in cat["codes"]}


def reallocate(cats, mapping):
    """Move every legacy-code dollar onto its replacement code. Returns move records."""
    by_code = index_codes(cats)
    buckets = {b["from"]: b for b in mapping["buckets"]}
    overrides = {}
    for o in mapping["item_overrides"]:
        overrides.setdefault(o["from"], []).append(dict(o, used=False))

    moves = []
    for cat in cats:
        for src in cat["codes"]:
            if not is_legacy(src["code"]) or src["code"] not in buckets:
                continue
            rule = buckets[src["code"]]
            # Line items first, so document-level overrides beat the bucket default.
            for item in src["items"]:
                amt = {k: z(item[k]) for k in MONEY}
                if not any(amt.values()):
                    continue
                target, conf, basis = rule["to"], rule["confidence"], rule["basis"]
                for o in overrides.get(src["code"], []):
                    if not o["used"] and o["title"] == item["title"] and abs(o["amount"] - z(item["ac"])) < 0.005:
                        o["used"] = True
                        target, conf, basis = o["to"], o["confidence"], o["basis"]
                        break
                moves.append({"from_category": cat["name"], "from_code": src["code"],
                              "to_code": target, "to_category": by_code[target]["category"],
                              "entity": item["entity"], "title": item["title"],
                              "confidence": conf, "basis": basis, **amt})
            # Budget/change-order money sitting on the code itself but on no line item.
            residual = {k: round(z(src[k]) - sum(z(i[k]) for i in src["items"]), 2) for k in MONEY}
            if any(abs(v) > 0.005 for v in residual.values()):
                moves.append({"from_category": cat["name"], "from_code": src["code"],
                              "to_code": rule["to"], "to_category": by_code[rule["to"]]["category"],
                              "entity": "Code total", "title": "(unitemised balance on code)",
                              "confidence": rule["confidence"], "basis": rule["basis"], **residual})

    unused = [o for lst in overrides.values() for o in lst if not o["used"]]
    if unused:
        print(f"  ! {len(unused)} item_override(s) matched nothing:", file=sys.stderr)
        for o in unused:
            print(f"    {o['from']} / {o['title']} / {o['amount']}", file=sys.stderr)
    return moves


def apply_moves(cats, moves):
    """Build the post-reallocation view: legacy codes emptied, targets credited."""
    by_code = index_codes(cats)
    after = {c["code"]: {k: z(c[k]) for k in MONEY} for c in by_code.values()}
    for m in moves:
        for k in MONEY:
            after[m["from_code"]][k] -= z(m[k])
            after[m["to_code"]][k] += z(m[k])
    # The export's own arithmetic: cost-to-complete is whatever budget is left.
    for code, v in after.items():
        src = by_code[code]
        if src["ctc"] is None:            # 04.35 has no projection entered; don't invent one
            v["ctc"] = None
            v["rvp"] = z(v["rb"]) - z(v["ac"])
        else:
            v["ctc"] = max(v["rb"] - v["ac"], 0.0)
            v["rvp"] = v["rb"] - v["ac"] - v["ctc"]
    return after


def find_anomalies(cats, moves, after):
    by_code = index_codes(cats)
    out = []

    dupes = {}
    for c in by_code.values():
        m = re.match(r"^(\d+\.\d+)", c["code"])
        if m:
            dupes.setdefault(m.group(1), []).append(c)
    for number, codes in dupes.items():
        if len(codes) < 2:
            continue
        shared = set()
        for a in codes[0]["items"]:
            for b in codes[1]["items"]:
                if a["title"] == b["title"] and abs(z(a["ac"]) - z(b["ac"])) < 0.005 and z(a["ac"]):
                    shared.add((a["title"], z(a["ac"])))
        out.append({"kind": "duplicate-code", "severity": "high" if shared else "medium",
                    "amount": round(sum(v for _, v in shared), 2),
                    "title": f"Cost code {number} exists twice",
                    "detail": f"{' and '.join(c['code'] for c in codes)} both carry "
                              f"{len(shared)} identical transactions totalling "
                              f"${sum(v for _, v in shared):,.2f}. Category 03 counts that money twice."
                              if shared else "Two codes share one number."})

    for c in by_code.values():
        if c["ctc"] is None and (z(c["rb"]) or z(c["ac"])):
            out.append({"kind": "no-projection", "severity": "high", "amount": round(z(c["rb"]), 2),
                        "title": f"{c['code']} has no cost-to-complete",
                        "detail": f"A ${z(c['rb']):,.0f} budget with nothing spent and no projection "
                                  f"entered, so it reads as ${z(c['rb']):,.0f} under budget. It is not."})

    # A code with a big budget and nothing spent is the natural twin of an unbudgeted overrun.
    idle = [c for c in by_code.values()
            if not is_legacy(c["code"]) and z(after[c["code"]]["ac"]) == 0 and z(after[c["code"]]["rb"]) > 0]

    idle.sort(key=lambda c: -z(after[c["code"]]["rb"]))

    def twin(code, over):
        """The largest untouched budget in the same trade - the likely other half of a mis-split."""
        stem = re.sub(r"^[\d.]+\s*-\s*", "", code).split()[0].rstrip("s").lower()
        floor = max(10_000.0, over * 0.25)
        for c in idle:
            if stem and stem in c["code"].lower() and z(after[c["code"]]["rb"]) >= floor:
                return c
        return None

    for c in by_code.values():
        if is_legacy(c["code"]):
            continue
        a = after[c["code"]]
        over = -z(a["rvp"])
        if over <= 20000 or z(a["ac"]) <= z(a["rb"]):
            continue
        detail = f"Budget ${z(a['rb']):,.0f}, actual ${z(a['ac']):,.0f}."
        if "Mileage" in c["code"]:
            detail += (" A mileage code cannot absorb this - the cost is almost certainly"
                       " posted to the wrong line.")
        unconfirmed = sum(z(m["ac"]) for m in moves
                          if m["to_code"] == c["code"] and m["confidence"] == "review")
        if unconfirmed:
            src = next(m["from_code"] for m in moves
                       if m["to_code"] == c["code"] and m["confidence"] == "review")
            detail += (f" ${unconfirmed:,.0f} of that actual came across from the retired {src} code and is"
                       f" the one reallocation still waiting on your confirmation.")
        t = twin(c["code"], over)
        if t:
            detail += (f" Meanwhile {t['code']} holds ${z(after[t['code']]['rb']):,.0f} of budget"
                       f" with nothing spent, so this looks like a split between the two.")
        out.append({"kind": "overrun", "severity": "high" if over > 90000 else "medium",
                    "amount": round(over, 2), "title": f"{c['code']} is ${over:,.0f} over",
                    "detail": detail})

    # Same document number posted twice inside the legacy codes.
    seen = {}
    for m in moves:
        if not m["title"] or not str(m["title"]).startswith(("Bill", "Check", "CC")):
            continue
        key = (re.sub(r"[^A-Za-z0-9]", "", str(m["title"])).upper(), round(z(m["ac"]), 2))
        if z(m["ac"]) and key in seen:
            where = (f"twice under {m['from_code']}" if seen[key] == m["from_code"]
                     else f"under both {seen[key]} and {m['from_code']}")
            out.append({"kind": "possible-duplicate", "severity": "medium", "amount": round(z(m["ac"]), 2),
                        "title": f"{m['title']} posted twice",
                        "detail": f"${z(m['ac']):,.2f} appears {where}. Worth checking it is not "
                                  f"one payment entered twice."})
        seen[key] = m["from_code"]

    out.sort(key=lambda a: (-{"high": 2, "medium": 1}.get(a["severity"], 0), -a["amount"]))
    return out


TIME_CLOCK = re.compile(r"^(.*?)\s+(\d{1,2})-(\d{1,2})-(\d{4})\s+\(([\d.]+)\s+hours\)$")


def labor_breakdown(cats):
    """Time-clock entries carry a name, a date and hours - the only time signal in the export."""
    people, months, total = {}, {}, {"hours": 0.0, "cost": 0.0, "entries": 0,
                                     "pending": 0, "unpaid_hours": 0.0}
    for cat in cats:
        for code in cat["codes"]:
            for it in code["items"]:
                if "Time Clock" not in str(it["entity"] or ""):
                    continue
                m = TIME_CLOCK.match(str(it["title"] or "").strip())
                if not m:
                    continue
                name, mo, _, yr, hours = m.group(1).strip(), int(m.group(2)), m.group(3), int(m.group(4)), float(m.group(5))
                cost = z(it["ac"])
                pending = it["entity"] == "Pending Time Clock"
                p = people.setdefault(name, {"name": name, "hours": 0.0, "cost": 0.0,
                                             "entries": 0, "unpaid_hours": 0.0, "codes": {}})
                p["hours"] += hours; p["cost"] += cost; p["entries"] += 1
                p["codes"][code["code"]] = round(p["codes"].get(code["code"], 0.0) + cost, 2)
                if pending:
                    p["unpaid_hours"] += hours
                key = f"{yr}-{mo:02d}"
                k = months.setdefault(key, {"month": key, "hours": 0.0, "cost": 0.0})
                k["hours"] += hours; k["cost"] += cost
                total["hours"] += hours; total["cost"] += cost; total["entries"] += 1
                total["pending"] += 1 if pending else 0
                total["unpaid_hours"] += hours if pending else 0.0
    for p in people.values():
        for f in ("hours", "cost", "unpaid_hours"):
            p[f] = round(p[f], 2)
        p["paid_hours"] = round(p["hours"] - p["unpaid_hours"], 2)
        p["rate"] = round(p["cost"] / p["paid_hours"], 2) if p["paid_hours"] else 0.0
        p["codes"] = sorted(p["codes"].items(), key=lambda kv: -kv[1])
    for k in months.values():
        k["hours"] = round(k["hours"], 2); k["cost"] = round(k["cost"], 2)
    if months:
        months[max(months)]["partial"] = True
    return {"people": sorted(people.values(), key=lambda p: -p["cost"]),
            "months": sorted(months.values(), key=lambda m: m["month"]),
            "total": {k: round(v, 2) for k, v in total.items()}}


def summarise(cats, moves, after, mapping, source):
    by_code = index_codes(cats)

    def totals(get):
        t = {k: 0.0 for k in MONEY}
        for c in by_code.values():
            v = get(c)
            for k in MONEY:
                t[k] += z(v[k])
        t["rvp"] = sum(z(get(c)["rvp"]) for c in by_code.values())
        return {k: round(v, 2) for k, v in t.items()}

    codes = []
    for c in by_code.values():
        a = after[c["code"]]
        codes.append({
            "code": c["code"], "category": c["category"], "legacy": is_legacy(c["code"]),
            "before": {**{k: round(z(c[k]), 2) for k in MONEY}, "rvp": round(z(c["rvp"]), 2)},
            "after": {**{k: (None if a[k] is None else round(a[k], 2)) for k in MONEY},
                      "rvp": round(z(a["rvp"]), 2)},
            "items": len(c["items"]),
            "received": round(sum(z(m["ac"]) for m in moves if m["to_code"] == c["code"]), 2),
        })
    codes.sort(key=lambda c: c["code"])

    cat_names, cat_rows = [], []
    for cat in cats:
        cat_names.append(cat["name"])
    for name in cat_names:
        members = [c for c in codes if c["category"] == name]
        row = {"name": name, "legacy": is_legacy(name),
               "codes": len(members)}
        for phase in ("before", "after"):
            row[phase] = {k: round(sum(z(c[phase][k]) for c in members), 2) for k in MONEY}
            row[phase]["rvp"] = round(sum(z(c[phase]["rvp"]) for c in members), 2)
        cat_rows.append(row)

    return {
        "source": Path(source).name,
        "job": "Philips",
        "totals": {"before": totals(lambda c: c), "after": totals(lambda c: after[c["code"]])},
        "categories": cat_rows,
        "codes": codes,
        "moves": moves,
        "mapping": mapping["buckets"],
        "anomalies": find_anomalies(cats, moves, after),
        "labor": labor_breakdown(cats),
        "counts": {"rows": sum(1 + len(c["items"]) for c in by_code.values()) + len(cats),
                   "codes": len(by_code), "legacy_codes": sum(1 for c in by_code if is_legacy(c)),
                   "line_items": sum(len(c["items"]) for c in by_code.values())},
    }


def write_xlsx(summary, path):
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    wb = openpyxl.Workbook()
    thin = Side(style="thin", color="D8DEE8")
    head = PatternFill("solid", fgColor="1F3A5F")
    hf = Font(bold=True, color="FFFFFF", size=10)
    money = '#,##0.00;[Red](#,##0.00);"-"'

    def sheet(ws, headers, rows, widths):
        ws.append(headers)
        for cell in ws[1]:
            cell.fill, cell.font = head, hf
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        for r in rows:
            ws.append(r)
        for i, w in enumerate(widths, start=1):
            ws.column_dimensions[get_column_letter(i)].width = w
        for row in ws.iter_rows(min_row=2):
            for cell in row:
                cell.border = Border(bottom=thin)
                if isinstance(cell.value, float):
                    cell.number_format = money
        ws.freeze_panes = "A2"

    ws = wb.active
    ws.title = "Reallocated Summary"
    rows = []
    for cat in summary["categories"]:
        if cat["legacy"] and not any(z(cat["after"][k]) for k in MONEY):
            continue
        rows.append(["CATEGORY", cat["name"], "", cat["after"]["ob"], cat["after"]["rb"],
                     cat["after"]["ac"], cat["after"]["ctc"], cat["after"]["rvp"],
                     cat["after"]["ac"] - cat["before"]["ac"]])
        for c in [c for c in summary["codes"] if c["category"] == cat["name"]]:
            if c["legacy"] and not any(z(c["after"][k]) for k in MONEY):
                continue
            rows.append(["", "", c["code"], c["after"]["ob"], c["after"]["rb"], c["after"]["ac"],
                         c["after"]["ctc"], c["after"]["rvp"], c["after"]["ac"] - c["before"]["ac"]])
    t = summary["totals"]["after"]
    rows.append(["TOTAL", "", "", t["ob"], t["rb"], t["ac"], t["ctc"], t["rvp"], 0.0])
    sheet(ws, ["Type", "Category", "Cost Code", "Original Budget", "Revised Budget", "Actual",
               "Cost To Complete", "Revised vs Projected", "Moved In/Out"], rows,
          [10, 34, 48, 16, 16, 16, 16, 18, 14])
    for row in ws.iter_rows(min_row=2):
        if row[0].value in ("CATEGORY", "TOTAL"):
            for cell in row:
                cell.font = Font(bold=True)

    sheet(wb.create_sheet("Reallocations"),
          ["From category", "From code", "To code", "To category", "Confidence", "Type",
           "Reference", "Original Budget", "Revised Budget", "Actual", "Cost To Complete", "Basis"],
          [[m["from_category"], m["from_code"], m["to_code"], m["to_category"], m["confidence"].upper(),
            m["entity"], m["title"], m["ob"], m["rb"], m["ac"], m["ctc"], m["basis"]]
           for m in summary["moves"]],
          [30, 20, 44, 22, 12, 24, 30, 15, 15, 15, 15, 80])

    sheet(wb.create_sheet("Before vs After"),
          ["Cost code", "Category", "Actual (as exported)", "Actual (reallocated)", "Change",
           "Revised Budget", "Variance (as exported)", "Variance (reallocated)"],
          [[c["code"], c["category"], c["before"]["ac"], c["after"]["ac"],
            round(c["after"]["ac"] - c["before"]["ac"], 2), c["after"]["rb"],
            c["before"]["rvp"], c["after"]["rvp"]]
           for c in summary["codes"]
           if abs(c["after"]["ac"] - c["before"]["ac"]) > 0.005],
          [48, 34, 20, 20, 16, 16, 20, 20])

    sheet(wb.create_sheet("Flags"),
          ["Severity", "Issue", "Amount", "Detail"],
          [[a["severity"].upper(), a["title"], a["amount"], a["detail"]] for a in summary["anomalies"]],
          [12, 52, 16, 110])

    wb.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("export")
    ap.add_argument("-o", "--out", default=str(HERE / "out"))
    ap.add_argument("-m", "--map", default=str(HERE / "cost_code_map.json"))
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    mapping = json.loads(Path(args.map).read_text())

    cats = load(args.export)
    moves = reallocate(cats, mapping)
    after = apply_moves(cats, moves)
    summary = summarise(cats, moves, after, mapping, args.export)

    (out / "summary.json").write_text(json.dumps(summary, indent=1))
    xlsx = out / "Philips_JobCost_Reallocated.xlsx"
    write_xlsx(summary, xlsx)

    b, a = summary["totals"]["before"], summary["totals"]["after"]
    print(f"  {summary['counts']['rows']:,} rows -> {summary['counts']['codes']} cost codes "
          f"({summary['counts']['legacy_codes']} legacy)")
    print(f"  {len(moves)} transactions moved, "
          f"${sum(z(m['ac']) for m in moves):,.2f} of actual cost")
    print(f"  actual  {b['ac']:>14,.2f} -> {a['ac']:>14,.2f}")
    print(f"  to go   {b['ctc']:>14,.2f} -> {a['ctc']:>14,.2f}")
    print(f"  variance{b['rvp']:>14,.2f} -> {a['rvp']:>14,.2f}")
    print(f"  wrote {out/'summary.json'} and {xlsx}")

    import build_dashboard
    build_dashboard.build(out / "summary.json", HERE / "dashboard.template.html",
                          out / "job_cost_dashboard.html")


if __name__ == "__main__":
    main()
