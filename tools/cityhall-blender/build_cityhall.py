#!/usr/bin/env python3
"""Seongnam City Hall Pass 6b — owner-render silhouette (pilotis, prow, east louvers, folded glass)."""
import bpy, math, os
from mathutils import Vector

OUT = os.environ.get('CITYHALL_OUT', '/workspace/bw-cityhall-p6/public/corridor/cityhall')
PREV = os.environ.get('CITYHALL_PREV', '/workspace/bw-cityhall-p6-shots/blender')
os.makedirs(OUT, exist_ok=True); os.makedirs(PREV, exist_ok=True)
CX, CZ = 1610.7, -5930.3
FOOT = [(1521.7,-5905.9),(1522.1,-5942.6),(1530.4,-5942.7),(1628.7,-5943.9),(1633.1,-5943.9),
        (1663.4,-5944.0),(1693.4,-5943.1),(1693.1,-5924.3),(1690.5,-5906.4),(1530.1,-5905.9)]
WEST_X1, MID_X1 = 1582.0, 1638.0
PH, BODY_H, EAST_H = 7.5, 34.0, 36.0

def rel(x, z): return (x - CX, -(z - CZ))

def clear():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for c in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.cameras, bpy.data.lights):
        for b in list(c): c.remove(b)

def mat(name, col, metallic=0.1, roughness=0.5, alpha=1.0, emission=None, emission_strength=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = roughness
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        m.blend_method = 'HASHED'
        if 'Transmission Weight' in b.inputs: b.inputs['Transmission Weight'].default_value = 0.88
        b.inputs['IOR'].default_value = 1.45
    if emission is not None:
        key = 'Emission Color' if 'Emission Color' in b.inputs else 'Emission'
        if key in b.inputs: b.inputs[key].default_value = (*emission, 1)
        if 'Emission Strength' in b.inputs: b.inputs['Emission Strength'].default_value = emission_strength
    return m

def box(name, cx, cy, cz, sx, sy, sz, m, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(cx, cy, cz))
    o = bpy.context.active_object; o.name = name; o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        bpy.ops.object.modifier_add(type='BEVEL')
        o.modifiers['Bevel'].width = bevel; o.modifiers['Bevel'].segments = 1
        bpy.ops.object.modifier_apply(modifier='Bevel')
    o.data.materials.append(m); return o

def cyl(name, cx, cy, cz, r, h, m, segs=10):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=(cx, cy, cz), vertices=segs)
    o = bpy.context.active_object; o.name = name; o.data.materials.append(m); return o

def mesh_obj(name, verts, faces, m):
    me = bpy.data.meshes.new(name); o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    me.from_pydata(verts, [], faces); me.update(); o.data.materials.append(m); return o

def join_named(names, out):
    bpy.ops.object.select_all(action='DESELECT')
    objs = [bpy.data.objects[n] for n in names if n in bpy.data.objects]
    if not objs: return None
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join(); objs[0].name = out; return objs[0]

def prism(name, x0, x1, y0, z0, z1, out_y, m, tip_narrow=4.0):
    """Angular faceted prism (trapezoid + side planes) — no rounded tip bubble."""
    xm = (x0 + x1) / 2
    # Two-step fold: mid ledge then outer face (flat planes only)
    y_mid = y0 + (out_y - y0) * 0.55
    verts = [
        # back on facade
        (x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1),
        # mid fold ring (wider)
        (x0 + 1.5, y_mid, z0 + 1), (x1 - 1.5, y_mid, z0 + 1),
        (x1 - 1.5, y_mid, z1 - 1), (x0 + 1.5, y_mid, z1 - 1),
        # outer face (trapezoid — narrower top)
        (x0 + tip_narrow, out_y, z0 + 2.5), (x1 - tip_narrow, out_y, z0 + 2.5),
        (x1 - tip_narrow * 1.6, out_y, z1 - 2.0), (x0 + tip_narrow * 1.6, out_y, z1 - 2.0),
    ]
    faces = [
        (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7),
        (4, 5, 9, 8), (5, 6, 10, 9), (6, 7, 11, 10), (7, 4, 8, 11),
        (8, 9, 10, 11),
        (0, 3, 2, 1),
    ]
    return mesh_obj(name, verts, faces, m)

def build():
    clear()
    m_frame = mat('Frame', (0.90, 0.92, 0.94), 0.12, 0.42)
    m_fascia = mat('Fascia', (0.95, 0.96, 0.98), 0.08, 0.32)
    m_east = mat('EastBlock', (0.26, 0.28, 0.31), 0.18, 0.52)
    m_louver = mat('Louver', (0.10, 0.11, 0.12), 0.2, 0.65)
    m_prow = mat('Prow', (0.42, 0.44, 0.48), 0.3, 0.38)
    m_sof = mat('Soffit', (0.84, 0.86, 0.88), 0.05, 0.55)
    m_pil = mat('Pilotis', (0.86, 0.88, 0.90), 0.45, 0.25)
    m_roof = mat('Roof', (0.88, 0.90, 0.92), 0.45, 0.32)
    m_mech = mat('Mech', (0.58, 0.60, 0.63), 0.3, 0.45)
    m_mech_dark = mat('MechDark', (0.07, 0.07, 0.08), 0.1, 0.7)
    m_glass = mat('Glass', (0.36, 0.52, 0.66), 0.12, 0.26, 0.70)
    m_fold = mat('GlassFold', (0.30, 0.50, 0.70), 0.14, 0.20, 0.78)
    m_band = mat('GlassBand', (0.28, 0.52, 0.78), 0.1, 0.22, 0.82, emission=(0.2, 0.4, 0.7), emission_strength=0.4)
    m_lobby = mat('LobbyGlass', (0.95, 0.82, 0.55), 0.04, 0.3, 0.5, emission=(1.0, 0.75, 0.4), emission_strength=2.0)
    m_span = mat('Spandrel', (0.76, 0.80, 0.84), 0.08, 0.5)

    pts = [rel(x, z) for x, z in FOOT]
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    x_min, x_max = min(xs), max(xs)
    y_s, y_n = min(ys), max(ys)  # south, north
    depth = abs(y_n - y_s); y_c = (y_s + y_n) / 2
    wx1 = WEST_X1 - CX; mx1 = MID_X1 - CX
    length = abs(x_max - x_min)
    opaque, glass = [], []

    # --- Pilotis: dense south row (most visible) + grid ---
    for i in range(22):
        px = x_min + 3 + i * ((length - 6) / 21)
        opaque.append(cyl(f'PS{i}', px, y_s + 2.8, PH / 2, 0.32, PH - 0.2, m_pil, 10))
    for i in range(12):
        px = x_min + 6 + i * ((length - 12) / 11)
        opaque.append(cyl(f'PN{i}', px, y_n - 3.0, PH / 2, 0.32, PH - 0.2, m_pil, 10))
        opaque.append(cyl(f'PM{i}', px, y_c, PH / 2, 0.30, PH - 0.2, m_pil, 10))

    # --- Lobby recessed ---
    glass.append(box('LobbyBox', (x_min + mx1) / 2, y_c + 1.0, PH / 2 - 0.1,
                     abs(mx1 - x_min) - 8, depth - 10, PH - 1.2, m_lobby, 0.04))

    # --- Soffit + fascia ---
    opaque.append(box('Soffit', (x_min + x_max) / 2, y_c, PH - 0.2, length + 2, depth + 2.5, 0.5, m_sof))
    opaque.append(box('FasciaS', (x_min + x_max) / 2, y_s - 0.45, PH + 0.2, length + 2.5, 0.55, 0.95, m_fascia))
    opaque.append(box('FasciaN', (x_min + x_max) / 2, y_n + 0.45, PH + 0.2, length + 2.5, 0.55, 0.95, m_fascia))
    opaque.append(box('FasciaE', x_max + 0.4, y_c, PH + 0.2, 0.55, depth + 2, 0.95, m_fascia))
    opaque.append(box('FasciaW', x_min - 0.4, y_c, PH + 0.2, 0.55, depth + 2, 0.95, m_fascia))
    opaque.append(box('ParaS', (x_min + x_max) / 2, y_s - 0.35, BODY_H + 0.4, length + 2.5, 0.5, 0.75, m_fascia))
    opaque.append(box('ParaN', (x_min + x_max) / 2, y_n + 0.35, BODY_H + 0.4, length + 2.5, 0.5, 0.75, m_fascia))
    opaque.append(box('ParaE', x_max + 0.35, y_c, BODY_H + 0.4, 0.5, depth + 1.5, 0.75, m_fascia))
    opaque.append(box('ParaW', x_min - 0.35, y_c, BODY_H + 0.4, 0.5, depth + 1.5, 0.75, m_fascia))

    # --- East END FACE only (dark + 5 louvers). No dark mass on south/plaza front. ---
    # Thin slab on +X (east) only — south face stays glass via SG_E to x_max
    opaque.append(box('EastMass', x_max + 0.15, y_c, (PH + EAST_H) / 2, 0.7, depth - 3.0, EAST_H - PH, m_east))
    for k in range(5):
        zy = PH + 4.0 + k * ((EAST_H - PH - 7) / 4)
        opaque.append(box(f'Louv{k}', x_max + 0.55, y_c - 0.5, zy, 1.2, 8.5, 2.8, m_louver))
    glass.append(box('EastBlueBand', x_max + 0.4, y_c, PH + 1.5, 0.9, depth * 0.65, 2.4, m_band))
    opaque.append(box('CoreE', (mx1 + x_max) / 2, y_c, (PH + BODY_H) / 2,
                      abs(x_max - mx1) - 2.5, depth - 6, BODY_H - PH - 0.8, m_span))

    # --- Cores (west/mid) ---
    opaque.append(box('CoreW', (x_min + wx1) / 2, y_c, (PH + BODY_H) / 2,
                      abs(wx1 - x_min) - 3, depth - 6, BODY_H - PH - 0.8, m_span))
    opaque.append(box('CoreM', (wx1 + mx1) / 2, y_c, (PH + BODY_H) / 2,
                      abs(mx1 - wx1) - 3, depth - 6, BODY_H - PH - 0.8, m_span))

    # --- South glass curtain (full length including east front) ---
    glass.append(box('SG_W', (x_min + wx1) / 2, y_s - 0.35, (PH + BODY_H) / 2,
                     abs(wx1 - x_min) - 1.5, 0.45, BODY_H - PH - 1.2, m_glass))
    glass.append(box('SG_M', (wx1 + mx1) / 2, y_s - 0.35, (PH + BODY_H) / 2,
                     abs(mx1 - wx1) - 1.5, 0.45, BODY_H - PH - 1.2, m_glass))
    # East SOUTH face = glass (owner: not dark grey on plaza front)
    glass.append(box('SG_E', (mx1 + x_max) / 2, y_s - 0.35, (PH + BODY_H) / 2,
                     abs(x_max - mx1) - 0.5, 0.55, BODY_H - PH - 1.2, m_glass))
    # Central + side folds (real geometric offsets)
    glass.append(prism('SPrism', wx1 - 10, mx1 + 8, y_s - 0.2, PH + 1.2, BODY_H - 1.0, y_s - 12, m_fold, 4.0))
    for i, (a, b, d) in enumerate([
        (x_min + 8, wx1 - 12, 6.0), (mx1 + 4, mx1 + 18, 5.0),
    ]):
        if b <= a: continue
        glass.append(prism(f'SF{i}', a, b, y_s - 0.15, PH + 1.5, BODY_H - 1.5, y_s - d, m_fold, 2.2))

    # --- West wing: SAME volume as 4f97aa1 (~76×34m), opposite 90° from p6e ---
    # Pivot at SW corner → long axis N–S extending SOUTH into plaza (aerial-se viewer),
    # long glass faces west road. NOT north behind the main block.
    WING_H = 19.0
    WING_LONG = 76.0   # N–S into plaza
    WING_DEPTH = 34.0  # west of x_min (road-facing depth)
    wing_x_east = x_min + 2.0          # attach at west end / SW corner
    wing_x_west = x_min - WING_DEPTH
    wing_cx = (wing_x_east + wing_x_west) / 2
    wing_sx = abs(wing_x_east - wing_x_west)
    wing_y_n = y_s + 4.0               # north edge hugs SW / south facade
    wing_y_s = wing_y_n - WING_LONG    # full 76m south toward plaza/viewer
    wing_cy = (wing_y_s + wing_y_n) / 2
    wing_sy = abs(wing_y_n - wing_y_s)
    opaque.append(box('WingCore', wing_cx, wing_cy, (PH + WING_H) / 2,
                      max(2.0, wing_sx - 3), max(2.0, wing_sy - 3), WING_H - PH - 0.6, m_span))
    # Long WEST glass (faces road)
    glass.append(box('WingGlassW', wing_x_west - 0.4, wing_cy, (PH + WING_H) / 2 + 0.2,
                     0.55, wing_sy * 0.94, WING_H - PH - 1.4, m_fold))
    # Faceted prism on west face (tip further west)
    _wy0, _wy1 = wing_y_s + 8, wing_y_n - 8
    _wm = (_wy0 + _wy1) / 2
    _x0 = wing_x_west - 0.2
    glass.append(mesh_obj('WingPrism', [
        (_x0, _wy0, PH + 1.5), (_x0, _wy1, PH + 1.5), (_x0, _wy1, WING_H - 1.0), (_x0, _wy0, WING_H - 1.0),
        (_x0 - 6, _wy0 + 4, PH + 3.0), (_x0 - 6, _wy1 - 4, PH + 3.0),
        (_x0 - 4, _wy1 - 5, WING_H - 2.0), (_x0 - 4, _wy0 + 5, WING_H - 2.0),
        (_x0 - 8, _wm, (PH + WING_H) / 2),
    ], [
        (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7),
        (4, 5, 8), (5, 6, 8), (6, 7, 8), (7, 4, 8), (0, 3, 2, 1),
    ], m_fold))
    glass.append(box('WingGlassS', wing_cx, wing_y_s - 0.35, (PH + WING_H) / 2 + 0.15,
                     wing_sx * 0.94, 0.55, WING_H - PH - 1.2, m_fold))
    glass.append(prism('WingPrismS', wing_x_west + 4, wing_x_east - 2, wing_y_s - 0.2,
                       PH + 1.5, WING_H - 1.0, wing_y_s - 10.0, m_fold, 2.6))
    glass.append(box('WingGlassN', wing_cx, wing_y_n + 0.35, (PH + WING_H) / 2,
                     wing_sx * 0.9, 0.5, WING_H - PH - 1.4, m_glass))
    glass.append(box('WingGlassE', wing_x_east + 0.3, wing_cy, (PH + WING_H) / 2,
                     0.45, wing_sy * 0.75, WING_H - PH - 1.4, m_glass))
    opaque.append(box('WingFasciaBot', wing_cx, wing_cy, PH + 0.25, wing_sx + 1.2, wing_sy + 1.2, 0.7, m_fascia))
    opaque.append(box('WingFasciaTop', wing_cx, wing_cy, WING_H + 0.15, wing_sx + 1.2, wing_sy + 1.2, 0.65, m_fascia))
    opaque.append(box('WingRoof', wing_cx, wing_cy, WING_H + 0.45, wing_sx + 0.8, wing_sy + 0.6, 0.35, m_roof))
    print(f'WING sx={wing_sx:.1f} sy={wing_sy:.1f} xw={wing_x_west:.1f} xe={wing_x_east:.1f} ys={wing_y_s:.1f} yn={wing_y_n:.1f}')
    # Prow keel: wide at north attach, tapers to SW tip (plaza + road)
    opaque.append(mesh_obj('ProwKeel', [
        (wing_x_east - 0.5, wing_y_n - 2, PH + 8.5),
        (wing_x_east - 0.5, wing_y_n - 2, PH + 0.35),
        (wing_x_west + 4, wing_y_n - 6, PH + 6.0),
        (wing_x_west + 4, wing_y_n - 6, PH + 0.35),
        (wing_cx, wing_y_s + 3, PH + 2.6),
        (wing_cx, wing_y_s + 3, PH + 0.35),
    ], [
        (0, 2, 4), (1, 3, 5), (0, 1, 3, 2), (2, 3, 5, 4), (0, 4, 5, 1),
    ], m_prow))
    for i in range(7):
        opaque.append(cyl(f'WP{i}', wing_x_west + 5 + (i % 3) * 8,
                          wing_y_s + 5 + i * ((wing_sy - 10) / 6),
                          PH / 2, 0.34, PH - 0.2, m_pil, 10))

            # --- North glass + fold ---
    glass.append(box('NG', (x_min + mx1) / 2, y_n + 0.35, (PH + BODY_H) / 2,
                     abs(mx1 - x_min) - 2, 0.45, BODY_H - PH - 1.2, m_glass))
    glass.append(prism('NPrism', wx1 - 6, mx1 + 4, y_n + 0.2, PH + 2, BODY_H - 1.5, y_n + 11, m_fold, 3.0))

    # West side
    glass.append(box('WG', x_min - 0.4, y_c, (PH + BODY_H) / 2, 0.45, depth - 4, BODY_H - PH - 1, m_glass))

    # Floor mullion hints (horizontal white lines visible through glass)
    for k, zy in enumerate([PH + 3.5 + i * 3.6 for i in range(7)]):
        if zy >= BODY_H - 1: break
        opaque.append(box(f'FL{k}', (x_min + mx1) / 2, y_s - 0.6, zy, abs(mx1 - x_min) * 0.85, 0.2, 0.15, m_fascia))

    # Roof
    opaque.append(box('Roof', (x_min + x_max) / 2, y_c, BODY_H + 0.12, length + 1.2, depth + 1.2, 0.3, m_roof))
    glass.append(box('RoofG', (wx1 + mx1) / 2, y_c, BODY_H + 0.4, abs(mx1 - wx1) * 0.65, depth * 0.5, 0.2, m_band))
    for i, (px, py) in enumerate([(x_min + 22, y_c), (x_max - 28, y_c), ((wx1 + mx1) / 2, y_c + 3)]):
        opaque.append(box(f'M{i}', px, py, BODY_H + 1.5, 12, 8, 2.6, m_mech))
        opaque.append(box(f'MD{i}', px, py, BODY_H + 2.0, 8, 5, 1.0, m_mech_dark))

    join_named([o.name for o in opaque], 'CityHallOpaque')
    join_named([o.name for o in glass], 'CityHallGlass')
    for nm in ('CityHallOpaque', 'CityHallGlass'):
        o = bpy.data.objects.get(nm)
        if not o: continue
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
        bpy.ops.object.shade_flat() if 'Opaque' in nm else bpy.ops.object.shade_smooth()
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        print(nm, 'BOUNDS', min(v.x for v in bb), max(v.x for v in bb), min(v.y for v in bb), max(v.y for v in bb), min(v.z for v in bb), max(v.z for v in bb))

    glb = os.path.join(OUT, 'building.glb')
    bpy.ops.export_scene.gltf(
        filepath=glb, export_format='GLB', export_apply=True,
        export_texcoords=True, export_normals=True, export_materials='EXPORT',
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
        export_yup=True, export_animations=False)
    print('EXPORTED', glb, os.path.getsize(glb))

    # Previews
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 20
    sc.render.resolution_x = 1600; sc.render.resolution_y = 700
    w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.42, 0.44, 0.46, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.85
    ld = bpy.data.lights.new('Sun', 'SUN'); ld.energy = 3.8
    sun = bpy.data.objects.new('Sun', ld); bpy.context.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-50))
    cam_d = bpy.data.cameras.new('Cam'); cam = bpy.data.objects.new('Cam', cam_d)
    bpy.context.collection.objects.link(cam); sc.camera = cam

    def shot(path, loc, look, lens=35):
        sc.render.filepath = path
        cam.location = loc; cam_d.lens = lens
        cam.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        bpy.ops.render.render(write_still=True)
        print('SHOT', path)

    shot(os.path.join(PREV, 'p6-blender-front.png'), (5, -160, 18), (5, 0, 16), 50)
    shot(os.path.join(PREV, 'p6-blender-se.png'), (130, -130, 30), (20, 0, 14), 32)
    shot(os.path.join(PREV, 'p6-blender-sw.png'), (-100, -130, 28), (-10, 0, 14), 32)
    shot(os.path.join(PREV, 'p6-blender-top.png'), (10, -20, 160), (10, -5, 0), 28)

if __name__ == '__main__':
    build()
