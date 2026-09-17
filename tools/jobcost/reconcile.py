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
                              "confidence": conf, "source": "retired-code", "basis": basis, **amt})
            # Budget/change-order money sitting on the code itself but on no line item.
            residual = {k: round(z(src[k]) - sum(z(i[k]) for i in src["items"]), 2) for k in MONEY}
            if any(abs(v) > 0.005 for v in residual.values()):
                moves.append({"from_category": cat["name"], "from_code": src["code"],
                              "to_code": rule["to"], "to_category": by_code[rule["to"]]["category"],
                              "entity": "Code total", "title": "(unitemised balance on code)",
                              "confidence": rule["confidence"], "source": "retired-code",
                              "basis": rule["basis"], **residual})

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


def find_anomalies(cats, moves, after, packs):
    """What is left once packages net internally - the problems that are actually real."""
    by_code = index_codes(cats)
    out = []

    for p in packs:
        over = -p["var"]
        if over < 1000:
            continue
        unconfirmed = sum(z(m["ac"]) for m in moves if m["confidence"] == "review"
                          and any(l["code"] == m["to_code"] for l in p["lines"]))
        n = len(p["lines"])
        if p["rb"] == 0:
            detail = (f"${p['ac']:,.0f} of cost against a package that was never budgeted. "
                      f"Either it belongs to another package or the budget is missing.")
        elif n == 1:
            detail = (f"Budget ${p['rb']:,.0f}, ${p['ac']:,.0f} spent. A single code, so there is no "
                      f"sibling line for it to net against.")
        else:
            detail = (f"Budget ${p['rb']:,.0f} across {n} codes, ${p['ac']:,.0f} spent. Even with all "
                      f"{n} netted together the package does not come back inside its budget.")
        if unconfirmed:
            detail += (f" ${unconfirmed:,.0f} of it is the one reallocation still waiting on your "
                       f"confirmation - without it this package is "
                       f"${abs(p['rb'] - (p['ac'] - unconfirmed)):,.0f} "
                       f"{'over' if p['ac'] - unconfirmed > p['rb'] else 'under'} budget.")
        out.append({"kind": "overrun", "severity": "high" if over > 20000 else "medium",
                    "amount": round(over, 2), "title": f"{p['name']} is over budget",
                    "where": p["category"], "detail": detail})

    dupes = {}
    for c in by_code.values():
        m = re.match(r"^(\d+\.\d+)", c["code"])
        if m and not c.get("synthetic"):
            dupes.setdefault(m.group(1), []).append(c)
    for number, codes in dupes.items():
        if len(codes) < 2:
            continue
        shared = {(a["title"], z(a["ac"])) for a in codes[0]["items"] for b in codes[1]["items"]
                  if a["title"] == b["title"] and abs(z(a["ac"]) - z(b["ac"])) < 0.005 and z(a["ac"])}
        if not shared:
            continue
        amount = sum(v for _, v in shared)
        out.append({"kind": "duplicate-code", "severity": "high", "amount": round(amount, 2),
                    "title": f"Cost code {number} exists twice",
                    "where": codes[0]["category"],
                    "detail": f"{' and '.join(c['code'] for c in codes)} both carry the same "
                              f"{len(shared)} transactions. ${amount:,.2f} is counted twice, and it "
                              f"inflates this package's spend by the same amount."})

    seen = {}
    for m in moves:
        if not str(m["title"] or "").startswith(("Bill", "Check", "CC")):
            continue
        key = (re.sub(r"[^A-Za-z0-9]", "", str(m["title"])).upper(), round(z(m["ac"]), 2))
        if z(m["ac"]) and key in seen:
            where = ("twice on the same code" if seen[key] == m["from_code"]
                     else f"on both {seen[key]} and {m['from_code']}")
            out.append({"kind": "possible-duplicate", "severity": "medium",
                        "amount": round(z(m["ac"]), 2), "where": m["to_category"],
                        "title": f"{m['title']} posted twice",
                        "detail": f"${z(m['ac']):,.2f} appears {where}. Worth checking it is not one "
                                  f"payment entered twice."})
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


def apply_corrections(cats, rules):
    """Move named transactions off a cost code they were posted to by mistake.

    These are corrections a person has confirmed, so they outrank anything inferred. A
    correction that matches nothing in the export is reported rather than dropped - the
    export has changed and the rule needs revisiting.
    """
    by_code = index_codes(cats)
    moves, missing = [], []
    for rule in rules["corrections"]:
        src, dst = by_code.get(rule["from"]), by_code.get(rule["to"])
        if src is None or dst is None:
            missing.append(f"{rule['from']} -> {rule['to']} (cost code not in this export)")
            continue
        for want in rule["items"]:
            hit = next((i for i in src["items"]
                        if i["title"] == want["title"]
                        and abs(z(i["ac"]) - want["amount"]) < 0.005
                        and not i.get("_corrected")), None)
            if hit is None:
                missing.append(f"{rule['from']}: {want['title']} @ {want['amount']:,.2f}")
                continue
            hit["_corrected"] = True
            who = rule.get("stated_by")
            moves.append({"from_category": src["category"], "from_code": src["code"],
                          "to_code": dst["code"], "to_category": dst["category"],
                          "entity": hit["entity"], "title": hit["title"],
                          "confidence": "stated", "source": "correction",
                          "basis": rule["reason"] + (f" Confirmed by {who}." if who else ""),
                          **{k: z(hit[k]) for k in MONEY}})
    if missing:
        print(f"  ! {len(missing)} correction(s) matched nothing:", file=sys.stderr)
        for m in missing:
            print(f"    {m}", file=sys.stderr)
    return moves


def apply_splits(cats, rules):
    """Carve estimate lines off a cost code onto a line of their own.

    For a budget that was estimated onto whatever code was nearest - mobilization and
    lodging sitting on supervisor mileage - and should stand as its own line instead.
    The new line is not in the export, so it is marked synthetic and kept out of the
    export's own row and code counts.
    """
    by_code = index_codes(cats)
    by_cat = {c["name"]: c for c in cats}
    moves, missing = [], []
    for rule in rules.get("splits", []):
        src = by_code.get(rule["from"])
        if src is None:
            missing.append(f"{rule['from']} (cost code not in this export)")
            continue
        dst = by_code.get(rule["to_code"])
        if dst is None:
            dst = {"code": rule["to_code"], "row": src["row"], "category": src["category"],
                   "proj": src["proj"], "items": [], "synthetic": True,
                   "_package": rule.get("to_package"),
                   "ob": 0.0, "rb": 0.0, "ac": 0.0, "ctc": 0.0, "rvp": 0.0}
            by_cat[src["category"]]["codes"].append(dst)
            by_code[dst["code"]] = dst
        for want in rule["items"]:
            ob = want["original_budget"]
            rb = want.get("revised_budget", ob)
            hit = next((i for i in src["items"]
                        if str(i["title"]).strip() == want["title"].strip()
                        and abs(z(i["ob"]) - ob) < 0.005 and not i.get("_split")), None)
            if hit is None:
                missing.append(f"{rule['from']}: {want['title']} @ {ob:,.2f}")
                continue
            hit["_split"] = True
            who = rule.get("stated_by")
            moves.append({"from_category": src["category"], "from_code": src["code"],
                          "to_code": dst["code"], "to_category": dst["category"],
                          "entity": hit["entity"], "title": hit["title"],
                          "confidence": "stated", "source": "split",
                          "basis": rule["reason"] + (f" Confirmed by {who}." if who else ""),
                          "ob": ob, "rb": rb, "ac": 0.0, "ctc": 0.0})
        short = z(src["rb"]) - sum(m["rb"] for m in moves if m["from_code"] == src["code"])
        if short < -0.005:
            missing.append(f"{rule['from']}: splits exceed its revised budget by ${-short:,.2f}")
    if missing:
        print(f"  ! {len(missing)} split(s) matched nothing:", file=sys.stderr)
        for m in missing:
            print(f"    {m}", file=sys.stderr)
    return moves


def build_packages(cats, after, rules):
    """Group cost codes into work packages and do the budget arithmetic on the group.

    A package is one piece of work with all its cost types together. Netting at this level
    is the point: cost booked to a package's mileage line instead of its material line is
    still cost against that package's budget, so it should not read as an overrun.
    """
    types = sorted(rules["cost_types"], key=len, reverse=True)
    aliases = rules["aliases"]

    def resolve(name):
        """Follow an alias chain so a package can be merged into one that is itself merged."""
        seen = {name}
        while name in aliases and aliases[name] not in seen:
            name = aliases[name]
            seen.add(name)
        return name

    def split(code):
        t = re.sub(r"^[\d.]+\s*-\s*", "", code).strip()
        for suf in types:
            if t.endswith(" " + suf):
                return resolve(t[: -len(suf) - 1].strip()), suf
        return resolve(t), "Other"

    packs = {}
    for cat in cats:
        for c in cat["codes"]:
            if is_legacy(c["code"]):
                continue
            name, kind = split(c["code"])
            name = c.get("_package") or name
            a = after[c["code"]]
            p = packs.setdefault(name, {"name": name, "category": cat["name"], "lines": []})
            p["lines"].append({"code": c["code"], "kind": kind,
                               **{k: round(z(a[k]), 2) for k in MONEY}})

    for p in packs.values():
        for k in ("ob", "rb", "ac"):
            p[k] = round(sum(l[k] for l in p["lines"]), 2)
        # The whole point: cost-to-complete and variance computed on the package total.
        p["ctc"] = round(max(p["rb"] - p["ac"], 0.0), 2)
        p["projected"] = round(p["ac"] + p["ctc"], 2)
        p["var"] = round(min(p["rb"] - p["ac"], 0.0), 2)
        p["percode_var"] = round(sum(min(l["rb"] - l["ac"], 0.0) for l in p["lines"]), 2)
        p["lines"].sort(key=lambda l: -l["ac"])
    return sorted(packs.values(), key=lambda p: (p["category"], -p["projected"]))


def find_miscodes(packs, moves, floor=2000.0):
    """Lines carrying far more than their own budget while a sibling line sits unspent.

    The package total absorbs these, so they are not overruns - they are cost sitting on
    the wrong line, and they are what makes a per-code report unreadable.
    """
    confirmed = {m["to_code"] for m in moves if m.get("source") == "correction"}
    out = []
    for p in packs:
        if p["var"] < -0.5 or len(p["lines"]) < 2:
            continue                                   # a real overrun belongs in the flags
        for l in p["lines"]:
            over = l["ac"] - l["rb"]
            if over < floor:
                continue
            spare = sorted((s for s in p["lines"] if s is not l and s["rb"] - s["ac"] > 0),
                           key=lambda s: -(s["rb"] - s["ac"]))
            out.append({"package": p["name"], "category": p["category"], "code": l["code"],
                        "kind": l["kind"], "rb": l["rb"], "ac": l["ac"], "over": round(over, 2),
                        "spare_code": spare[0]["code"] if spare else None,
                        "spare_kind": spare[0]["kind"] if spare else None,
                        "spare": round(spare[0]["rb"] - spare[0]["ac"], 2) if spare else 0.0,
                        "confirmed_here": l["code"] in confirmed})
    return sorted(out, key=lambda m: -m["over"])


def summarise(cats, moves, after, mapping, packs, miscodes, source):
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
        "packages": packs,
        "miscodes": miscodes,
        "package_totals": {
            "rb": round(sum(p["rb"] for p in packs), 2),
            "ob": round(sum(p["ob"] for p in packs), 2),
            "ac": round(sum(p["ac"] for p in packs), 2),
            "ctc": round(sum(p["ctc"] for p in packs), 2),
            "projected": round(sum(p["projected"] for p in packs), 2),
            "var": round(sum(p["var"] for p in packs), 2),
        },
        "anomalies": find_anomalies(cats, moves, after, packs),
        "labor": labor_breakdown(cats),
        "counts": {"rows": sum(1 + len(c["items"]) for c in by_code.values()
                              if not c.get("synthetic")) + len(cats),
                   "codes": sum(1 for c in by_code.values() if not c.get("synthetic")),
                   "split_lines": sum(1 for c in by_code.values() if c.get("synthetic")),
                   "legacy_codes": sum(1 for c in by_code if is_legacy(c)),
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
    ws.title = "Work Packages"
    prows = []
    for cat in sorted({p["category"] for p in summary["packages"]}):
        members = [p for p in summary["packages"] if p["category"] == cat]
        prows.append(["TRADE", cat, "",
                      sum(p["ob"] for p in members), sum(p["rb"] for p in members),
                      sum(p["ac"] for p in members), sum(p["ctc"] for p in members),
                      sum(p["projected"] for p in members), sum(p["var"] for p in members)])
        for p in sorted(members, key=lambda p: -p["projected"]):
            prows.append(["", "", p["name"], p["ob"], p["rb"], p["ac"], p["ctc"],
                          p["projected"], p["var"]])
    pt = summary["package_totals"]
    prows.append(["TOTAL", "", "", pt["ob"], pt["rb"], pt["ac"], pt["ctc"],
                  pt["projected"], pt["var"]])
    sheet(ws, ["Type", "Trade", "Work package", "Original Budget", "Revised Budget", "Actual",
               "Left To Spend", "Projected", "Over / Under"], prows,
          [10, 26, 42, 16, 16, 16, 16, 16, 16])
    for row in ws.iter_rows(min_row=2):
        if row[0].value in ("TRADE", "TOTAL"):
            for cell in row:
                cell.font = Font(bold=True)

    sheet(wb.create_sheet("Wrong Line"),
          ["Cost code carrying it", "Work package", "Trade", "Its budget", "Its actual", "Excess",
           "Room sits on this code instead", "Unspent there"],
          [[m["code"], m["package"], m["category"], m["rb"], m["ac"], m["over"],
            m["spare_code"] or "", m["spare"]] for m in summary["miscodes"]],
          [46, 34, 24, 15, 15, 15, 46, 15])

    ws = wb.create_sheet("Cost Code Detail")
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
          ["Why", "From category", "From code", "To code", "To category", "Confidence", "Type",
           "Reference", "Original Budget", "Revised Budget", "Actual", "Cost To Complete", "Basis"],
          [[{"correction": "Wrong code", "split": "Split out"}.get(m.get("source"), "Retired code"),
            m["from_category"], m["from_code"], m["to_code"], m["to_category"],
            m["confidence"].upper(), m["entity"], m["title"], m["ob"], m["rb"], m["ac"], m["ctc"],
            m["basis"]]
           for m in sorted(summary["moves"], key=lambda m: m.get("source", ""))],
          [14, 30, 34, 34, 22, 12, 24, 30, 15, 15, 15, 15, 80])

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
          ["Severity", "Issue", "Trade", "Amount", "Detail"],
          [[a["severity"].upper(), a["title"], a.get("where", ""), a["amount"], a["detail"]]
           for a in summary["anomalies"]],
          [12, 46, 24, 16, 110])

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

    packrules = json.loads((HERE / "work_packages.json").read_text())
    fixes = json.loads((HERE / "code_corrections.json").read_text())
    cats = load(args.export)
    moves = reallocate(cats, mapping) + apply_corrections(cats, fixes) + apply_splits(cats, fixes)
    after = apply_moves(cats, moves)
    packs = build_packages(cats, after, packrules)
    summary = summarise(cats, moves, after, mapping, packs,
                        find_miscodes(packs, moves), args.export)

    (out / "summary.json").write_text(json.dumps(summary, indent=1))
    xlsx = out / "Philips_JobCost_Reallocated.xlsx"
    write_xlsx(summary, xlsx)

    pt = summary["package_totals"]
    print(f"  {len(packs)} work packages; netting inside each one:")
    print(f"    projected {pt['projected']:>14,.2f} vs budget {pt['rb']:>14,.2f}"
          f"  ->  {pt['var']:>13,.2f}")
    print(f"    {len(summary['miscodes'])} lines carrying cost that belongs on a sibling line")
    b, a = summary["totals"]["before"], summary["totals"]["after"]
    print(f"  {summary['counts']['rows']:,} rows -> {summary['counts']['codes']} cost codes "
          f"({summary['counts']['legacy_codes']} legacy)")
    fixed = [m for m in moves if m.get("source") == "correction"]
    carved = [m for m in moves if m.get("source") == "split"]
    print(f"  {len(moves)} transactions moved, "
          f"${sum(z(m['ac']) for m in moves):,.2f} of actual cost"
          f"  ({len(fixed)} confirmed corrections, ${sum(z(m['ac']) for m in fixed):,.2f})")
    if carved:
        print(f"  {len(carved)} estimate line(s) split onto their own code, "
              f"${sum(z(m['rb']) for m in carved):,.2f} of budget")
    print(f"  actual  {b['ac']:>14,.2f} -> {a['ac']:>14,.2f}")
    print(f"  to go   {b['ctc']:>14,.2f} -> {a['ctc']:>14,.2f}")
    print(f"  variance{b['rvp']:>14,.2f} -> {a['rvp']:>14,.2f}")
    print(f"  wrote {out/'summary.json'} and {xlsx}")

    import build_dashboard
    build_dashboard.build(out / "summary.json", HERE / "dashboard.template.html",
                          out / "job_cost_dashboard.html")


if __name__ == "__main__":
    main()
