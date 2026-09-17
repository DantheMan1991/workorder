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
    page = html.replace(PLACEHOLDER, payload)
    Path(out).write_text(page)
    print(f"  wrote {out}  ({Path(out).stat().st_size / 1024:.0f} KB)")

    # The published artifact gets its wrapper from the platform. A file you email has to
    # carry its own, or it opens at desktop width on a phone and ignores the dark theme.
    cut = page.index("<header")
    head, body = page[:cut], page[cut:]
    alone = Path(out).with_name(Path(out).stem + "_standalone.html")
    alone.write_text(
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<style>\n'
        '  html{color-scheme:light dark}\n'
        '  :root{padding-top:env(safe-area-inset-top,0px);'
        'padding-bottom:env(safe-area-inset-bottom,0px)}\n'
        '  body{margin:0;font:14px system-ui,sans-serif}\n'
        '  img{max-width:100%}\n'
        '  [hidden]{display:none!important}\n'
        '</style>\n' + head + '\n</head>\n<body>\n' + body + '\n</body>\n</html>\n')
    print(f"  wrote {alone}  ({alone.stat().st_size / 1024:.0f} KB, opens in any browser)")
    return out


if __name__ == "__main__":
    build(*[Path(a) for a in sys.argv[1:]])
