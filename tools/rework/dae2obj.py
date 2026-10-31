"""Converts Collada (.dae) models to OBJ: Blender 5 has no Collada importer, and the 3TD Fantasy Ruins
pack ships only .dae. Reads the scene's nodes with their transforms, and keeps each shape's most
detailed level (Torque names levels by size: RuinArchOne200, RuinArchOne50; collision shapes go).
Downloads are untrusted data: this only reads XML and writes text.

Usage: python3 -I tools/rework/dae2obj.py <file.dae> <out.obj>
"""

import pathlib
import re
import sys
import xml.etree.ElementTree as ET

NS = {"c": "http://www.collada.org/2005/11/COLLADASchema"}


def floats(el):
    return [float(x) for x in (el.text or "").split()]


def multiply(a, b):
    return [sum(a[r * 4 + k] * b[k * 4 + c] for k in range(4)) for r in range(4) for c in range(4)]


def transform(m, p):
    return tuple(m[r * 4] * p[0] + m[r * 4 + 1] * p[1] + m[r * 4 + 2] * p[2] + m[r * 4 + 3] for r in range(3))


def read_geometry(geom):
    mesh = geom.find("c:mesh", NS)
    sources = {s.get("id"): floats(s.find("c:float_array", NS)) for s in mesh.findall("c:source", NS)}
    verts = mesh.find("c:vertices", NS)
    position = next(i for i in verts.findall("c:input", NS) if i.get("semantic") == "POSITION")
    points = sources[position.get("source")[1:]]
    triangles = []
    for block in mesh.findall("c:triangles", NS) + mesh.findall("c:polylist", NS):
        inputs = block.findall("c:input", NS)
        stride = max(int(i.get("offset")) for i in inputs) + 1
        vertex = next(int(i.get("offset")) for i in inputs if i.get("semantic") == "VERTEX")
        uv = next((i for i in inputs if i.get("semantic") == "TEXCOORD"), None)
        uvs = sources[uv.get("source")[1:]] if uv is not None else None
        data = [int(x) for x in (block.find("c:p", NS).text or "").split()]
        corners = [data[i : i + stride] for i in range(0, len(data), stride)]
        counts = block.find("c:vcount", NS)
        if counts is not None:
            # A polylist: each polygon becomes a fan of triangles.
            fans, at = [], 0
            for n in [int(x) for x in counts.text.split()]:
                for k in range(1, n - 1):
                    fans += [corners[at], corners[at + k], corners[at + k + 1]]
                at += n
            corners = fans
        for k in range(0, len(corners) - 2, 3):
            tri = []
            for c in corners[k : k + 3]:
                v = c[vertex]
                t = c[int(uv.get("offset"))] if uvs is not None else None
                tri.append((points[v * 3 : v * 3 + 3], uvs[t * 2 : t * 2 + 2] if t is not None else (0.0, 0.0)))
            triangles.append((block.get("material", "stone"), tri))
    return triangles


def walk(node, parent, found):
    m = parent
    matrix = node.find("c:matrix", NS)
    if matrix is not None:
        m = multiply(parent, floats(matrix))
    for inst in node.findall("c:instance_geometry", NS):
        found.append((inst.get("url")[1:], m))
    for child in node.findall("c:node", NS):
        walk(child, m, found)


def main():
    source, target = sys.argv[1:3]
    root = ET.parse(source).getroot()
    geometries = {g.get("id"): g for g in root.findall(".//c:geometry", NS)}
    found = []
    identity = [1.0 if r == c else 0.0 for r in range(4) for c in range(4)]
    for node in root.find(".//c:visual_scene", NS).findall("c:node", NS):
        walk(node, identity, found)
    # The most detailed level of each shape; collision hulls and Torque's markers go.
    best = {}
    for gid, m in found:
        name = gid.replace("-mesh", "").replace("geom-", "")
        if re.search(r"(coll|col\d|los|bounds)", name, re.I):
            continue
        match = re.match(r"(.*?)(-?\d+)$", name)
        base, size = (match.group(1), int(match.group(2))) if match else (name, 0)
        if base not in best or size > best[base][0]:
            best[base] = (size, gid, m)
    lines, faces, material, count = [], [], None, 0
    for _, gid, m in best.values():
        for name, tri in read_geometry(geometries[gid]):
            if name != material:
                material = name
                faces.append(f"usemtl {name}")
            ids = []
            for p, t in tri:
                x, y, z = transform(m, p)
                count += 1
                lines.append(f"v {x:.5f} {y:.5f} {z:.5f}\nvt {t[0]:.5f} {t[1]:.5f}")
                ids.append(count)
            faces.append("f " + " ".join(f"{i}/{i}" for i in ids))
    pathlib.Path(target).write_text("\n".join(lines + faces) + "\n")
    print(pathlib.Path(source).stem, len(best), "shapes,", count // 3, "triangles")


main()
