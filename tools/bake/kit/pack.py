"""Packs the baked maps, their logs and the check report into wirelight-bake-results.zip.

  blender -b --factory-startup --python pack.py

Run with Blender's own Python, so the kit needs nothing else on the machine.
"""

import glob
import json
import os
import zipfile

here = os.path.dirname(os.path.abspath(__file__))
target = os.path.join(here, "wirelight-bake-results.zip")
files = [os.path.join(here, "in", "layouts.json"), os.path.join(here, "out", "report.json")]
for pattern in ("*.webp", "*.log.json"):
    files += sorted(glob.glob(os.path.join(here, "out", pattern)))
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(f, os.path.basename(f))
with open(os.path.join(here, "out", "report.json")) as f:
    ok = json.load(f)["ok"]
print(f"[pack] {target} ({os.path.getsize(target) / 1024 / 1024:.1f} MB, {len(files)} files, verify {'OK' if ok else 'FAILED'})")
