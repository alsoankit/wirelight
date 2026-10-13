"""Checks a bake: every expected map exists, has the right size, isn't black, and baked cleanly.

  blender -b --factory-startup --python verify.py -- --in in --out out

Writes out/report.json and exits non-zero when anything is missing or wrong.
"""

import argparse
import json
import os
import sys

import bpy
import numpy as np


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--in", dest="src", default="in")
    p.add_argument("--out", default="out")
    a = p.parse_args(argv)
    with open(os.path.join(a.src, "layouts.json")) as f:
        layouts = json.load(f)
    problems = []
    rows = []
    for entry in layouts:
        lid = entry["id"]
        groups = [("", entry["size"])] + ([("-kit", entry["kit"]["size"])] if entry.get("kit") else [])
        log_path = os.path.join(a.out, f"{lid}.log.json")
        log = json.load(open(log_path)) if os.path.exists(log_path) else None
        row = {"id": lid, "maps": {}, "seconds": log and log.get("seconds"), "device": log and log.get("device")}
        if log and log.get("signature") != entry["signature"]:
            problems.append(f"{lid}: baked from a different export (signature)")
        for suffix, size in groups:
            for state in ("ruin", "lit", "ao"):
                name = f"{lid}{suffix}-{state}.webp"
                path = os.path.join(a.out, name)
                if not os.path.exists(path):
                    problems.append(f"{name}: missing")
                    continue
                img = bpy.data.images.load(path)
                w, h = img.size
                px = np.empty(w * h * 4, dtype=np.float32)
                img.pixels.foreach_get(px)
                bpy.data.images.remove(img)
                rgb = px.reshape(-1, 4)[:, :3]
                mean = float(rgb.mean())
                info = {"bytes": os.path.getsize(path), "size": [w, h], "mean": round(mean, 4)}
                row["maps"][name] = info
                if (w, h) != (size, size):
                    problems.append(f"{name}: {w}×{h}, expected {size}×{size}")
                if not np.isfinite(rgb).all():
                    problems.append(f"{name}: not finite")
                if mean < 0.003:
                    problems.append(f"{name}: black (mean {mean:.4f})")
                stats = (log or {}).get("maps", {}).get(f"{suffix[1:] or 'room'}-{state}")
                if stats and stats.get("nonfinite"):
                    problems.append(f"{name}: {stats['nonfinite']} non-finite texels in the bake")
        rows.append(row)
    report = {"ok": not problems, "problems": problems, "layouts": rows}
    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, "report.json"), "w") as f:
        json.dump(report, f, indent=1)
    expected = sum(3 * (2 if e.get("kit") else 1) for e in layouts)
    found = sum(len(r["maps"]) for r in rows)
    print(f"[verify] {found}/{expected} maps present; {len(problems)} problem(s)")
    for line in problems:
        print("[verify]  -", line)
    sys.exit(0 if not problems else 1)


main()
