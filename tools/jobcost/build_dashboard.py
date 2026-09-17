#!/usr/bin/env python3
"""Render the job cost dashboard from summary.json produced by reconcile.py."""
import json, sys
from pathlib import Path

HERE = Path(__file__).parent
PLACEHOLDER = "/*__DATA__*/"


def build(summary_path=HERE / "out/summary.json",
          template=HERE / "dashboard.template.html",
          out=HERE / "out/job_cost_dashboard.html"):
    data = json.loads(Path(summary_path).read_text())
    html = Path(template).read_text()
    if PLACEHOLDER not in html:
        raise SystemExit(f"{template} is missing the {PLACEHOLDER} marker")
    # </script> inside a string would close the block early; < keeps it inert.
    payload = json.dumps(data, separators=(",", ":")).replace("<", "\\u003c")
    Path(out).write_text(html.replace(PLACEHOLDER, payload))
    print(f"  wrote {out}  ({Path(out).stat().st_size / 1024:.0f} KB)")
    return out


if __name__ == "__main__":
    build(*[Path(a) for a in sys.argv[1:]])
