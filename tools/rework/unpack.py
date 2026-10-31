"""Unpacks the chosen downloads (assets.json) into assets-src/_downloads/<slug>/, opening nested zips and
rars, and lists the model files found in each. Downloads are untrusted data: this only extracts files
(no scripts run), and paths that would leave the target folder are refused.

Usage: python3 -I tools/rework/unpack.py
"""

import json
import pathlib
import subprocess
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
DOWNLOADS = pathlib.Path.home() / "Downloads/wirelight-assets"
OUT = ROOT / "assets-src/_downloads"
MODELS = {".blend", ".glb", ".gltf", ".fbx", ".obj", ".dae", ".ply", ".stl", ".usdz"}


def safe_extract_zip(path: pathlib.Path, into: pathlib.Path) -> None:
    with zipfile.ZipFile(path) as z:
        for member in z.infolist():
            target = (into / member.filename).resolve()
            if not str(target).startswith(str(into.resolve())):
                print(f"  refused {member.filename}: outside the folder", file=sys.stderr)
                continue
            z.extract(member, into)


def unpack(slug: str, zip_name: str) -> list[str]:
    into = OUT / slug
    if into.exists() and any(into.iterdir()):
        return found(into)
    into.mkdir(parents=True, exist_ok=True)
    safe_extract_zip(DOWNLOADS / zip_name, into)
    # Nested archives (a Sketchfab "source" zip or rar), one level at a time until none are left.
    for _ in range(3):
        nested = [p for p in into.rglob("*") if p.suffix.lower() in {".zip", ".rar"}]
        if not nested:
            break
        for p in nested:
            dest = p.parent / (p.stem + "_x")
            dest.mkdir(exist_ok=True)
            if p.suffix.lower() == ".zip":
                safe_extract_zip(p, dest)
            else:
                # Fedora's 7z has no RAR support; unar does.
                done = subprocess.run(["unar", "-q", "-f", "-o", str(dest), str(p)], stdout=subprocess.DEVNULL)
                if done.returncode != 0:
                    print(f"  could not open {p.name}", file=sys.stderr)
                    continue
            p.unlink()
    return found(into)


def found(into: pathlib.Path) -> list[str]:
    return sorted(str(p.relative_to(into)) for p in into.rglob("*") if p.suffix.lower() in MODELS)


if __name__ == "__main__":
    assets = json.loads((ROOT / "tools/rework/assets.json").read_text())
    for a in assets:
        print(a["slug"], unpack(a.get("folder", a["slug"]), a["zip"]))
