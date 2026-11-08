#!/usr/bin/env python3
"""Honeycomb steel walking figure — posed muscular human via skin armature + remesh.
blender --background --python build_walker.py
"""
import bpy
import bmesh
import math
import os
from mathutils import Vector

OUT = os.environ.get(
    'WALKER_OUT',
    '/workspace/bw-cityhall-fountain/public/corridor/cityhall/walker.glb',
)
PREV = os.environ.get('WALKER_PREV', '/workspace/bw-cityhall-shots/ref-statue')
os.makedirs(os.path.dirname(OUT), exist_ok=True)
os.makedirs(PREV, exist_ok=True)

PED_FRONT_H = 0.50
PED_REAR_H = 1.45
PED_R = 0.55
BASE_H = 0.40
BASE_R = 1.80
PLATE_T = 0.06
PLATE_XY = (5.0, 3.6)

Y_FRONT = BASE_H + PED_FRONT_H
Y_REAR = BASE_H + PED_REAR_H
# Blender Z-up; +Y = stride forward (left foot); +X = figure's left
FRONT = (0.62, 0.95)   # x,y of left foot (forward)
REAR = (-0.55, -1.25)  # right foot trailing far back


def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for col in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.cameras, bpy.data.lights, bpy.data.armatures):
        for b in list(col):
            col.remove(b)


def mat_steel(name='WalkerSteel'):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.82, 0.84, 0.88, 1)
    b.inputs['Metallic'].default_value = 0.92
    b.inputs['Roughness'].default_value = 0.32
    return m


def sphere_at(co, r, name='s'):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=r, location=co)
    o = bpy.context.active_object
    o.name = name
    return o


def chain(a, b, r0, r1, n=5, name='ch'):
    """Overlapping spheres along segment a→b."""
    out = []
    for i in range(n + 1):
        t = i / n
        co = (
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t,
        )
        r = r0 + (r1 - r0) * t
        out.append(sphere_at(co, r, f'{name}_{i}'))
    return out


def build_body_spheres():
    objs = []
    # Feet planted ON pedestal tops
    lf = (FRONT[0], FRONT[1], Y_FRONT + 0.10)
    rf = (REAR[0], REAR[1], Y_REAR + 0.10)
    objs += chain(lf, (lf[0] + 0.05, lf[1] + 0.28, lf[2]), 0.22, 0.18, 3, 'lfoot')
    objs += chain(rf, (rf[0] - 0.05, rf[1] - 0.25, rf[2]), 0.22, 0.18, 3, 'rfoot')

    # Left shin heavily bent (lunge)
    lk = (0.55, 0.15, Y_FRONT + 0.95)
    objs += chain(lf, lk, 0.20, 0.26, 6, 'lshin')
    objs.append(sphere_at(lk, 0.30, 'lknee'))

    # Left thigh — steep up to hip
    lh = (0.30, -0.05, 3.85)
    objs += chain(lk, lh, 0.30, 0.42, 7, 'lthigh')

    # Right shin nearly straight back/down onto tall ped
    rk = (-0.48, -0.55, Y_REAR + 1.35)
    objs += chain(rf, rk, 0.19, 0.24, 6, 'rshin')
    objs.append(sphere_at(rk, 0.28, 'rknee'))

    # Right thigh stretched back
    rh = (-0.30, -0.05, 3.85)
    objs += chain(rk, rh, 0.28, 0.42, 7, 'rthigh')

    # Pelvis — weight forward
    objs.append(sphere_at((0.02, 0.15, 3.90), 0.50, 'pelvis'))
    objs.append(sphere_at((0.34, 0.08, 3.80), 0.38, 'lhip'))
    objs.append(sphere_at((-0.34, 0.00, 3.80), 0.38, 'rhip'))
    objs.append(sphere_at((0.0, -0.20, 3.70), 0.36, 'glute'))
    objs.append(sphere_at((0.05, 0.35, 4.10), 0.42, 'abdomen_low'))

    # Torso pitched forward ~40°
    spine = [
        ((0.05, 0.55, 4.55), 0.44),
        ((0.08, 0.85, 5.10), 0.50),
        ((0.10, 1.15, 5.60), 0.54),  # chest
        ((0.12, 1.40, 6.05), 0.46),
        ((0.14, 1.58, 6.40), 0.32),  # neck base
    ]
    for i, (co, r) in enumerate(spine):
        objs.append(sphere_at(co, r, f'spine{i}'))
        if i:
            objs += chain(spine[i - 1][0], co, spine[i - 1][1] * 0.9, r * 0.9, 3, f'sp{i}')

    objs.append(sphere_at((0.45, 1.25, 5.70), 0.32, 'lpec'))
    objs.append(sphere_at((-0.45, 1.20, 5.65), 0.32, 'rpec'))
    objs.append(sphere_at((0.55, 1.00, 5.35), 0.28, 'llat'))
    objs.append(sphere_at((-0.55, 0.95, 5.30), 0.28, 'rlat'))
    objs.append(sphere_at((0.58, 1.40, 6.00), 0.26, 'ldelt'))
    objs.append(sphere_at((-0.58, 1.35, 5.95), 0.26, 'rdelt'))
    objs.append(sphere_at((0.05, 1.40, 5.75), 0.30, 'sternum'))

    # Head tilted down toward stride
    objs.append(sphere_at((0.18, 1.85, 6.95), 0.38, 'head'))
    objs.append(sphere_at((0.20, 1.95, 7.15), 0.30, 'crown'))
    objs.append(sphere_at((0.25, 2.05, 6.80), 0.22, 'jaw'))
    objs += chain((0.14, 1.58, 6.40), (0.18, 1.85, 6.95), 0.20, 0.30, 4, 'neck')

    # Arms bent forward, close to torso
    ls = (-0.62, 1.35, 5.95)
    le = (-0.72, 1.70, 5.35)
    lw = (-0.50, 2.15, 5.25)
    objs.append(sphere_at(ls, 0.24, 'lsh'))
    objs += chain(ls, le, 0.19, 0.16, 5, 'luarm')
    objs.append(sphere_at(le, 0.16, 'lelb'))
    objs += chain(le, lw, 0.15, 0.13, 5, 'lfarm')
    objs.append(sphere_at(lw, 0.14, 'lhand'))

    rs = (0.62, 1.40, 5.90)
    re = (0.75, 1.85, 5.40)
    rw = (0.50, 2.30, 5.35)
    objs.append(sphere_at(rs, 0.24, 'rsh'))
    objs += chain(rs, re, 0.19, 0.16, 5, 'ruarm')
    objs.append(sphere_at(re, 0.16, 'relb'))
    objs += chain(re, rw, 0.15, 0.13, 5, 'rfarm')
    objs.append(sphere_at(rw, 0.14, 'rhand'))

    return objs


def join_and_remesh(objs, name, voxel=0.08, target_tris=5000):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    body = objs[0]
    body.name = name
    # Voxel remesh merges overlapping volumes into one manifold
    mod = body.modifiers.new('Remesh', 'REMESH')
    mod.mode = 'VOXEL'
    mod.voxel_size = voxel
    bpy.ops.object.modifier_apply(modifier='Remesh')
    bpy.ops.object.shade_smooth()
    me = body.data
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    if tris > target_tris:
        d = body.modifiers.new('Decimate', 'DECIMATE')
        d.ratio = max(0.05, target_tris / tris)
        bpy.ops.object.modifier_apply(modifier='Decimate')
        bpy.ops.object.shade_smooth()
    return body


def smart_uv(obj):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode='OBJECT')


def make_cyl(name, loc, radius, depth, mat, segs=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segs, radius=radius, depth=depth, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    return o


def make_plate(name, loc, size, thick, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = (size[0], size[1], thick)
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat)
    return o


def export_glb(path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        use_selection=False,
        export_apply=True,
        export_yup=True,
    )


def preview_shot(path, eye, target, lens=45):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = 720
    scene.render.resolution_y = 960
    scene.render.filepath = path
    cam_data = bpy.data.cameras.new('ShotCam')
    cam = bpy.data.objects.new('ShotCam', cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    cam.location = eye
    cam.data.lens = lens
    direction = Vector(target) - Vector(eye)
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    sun = bpy.data.lights.new('Sun', 'SUN')
    sun.energy = 4.0
    sun_o = bpy.data.objects.new('Sun', sun)
    sun_o.location = (6, -10, 14)
    bpy.context.collection.objects.link(sun_o)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    bpy.data.objects.remove(sun_o, do_unlink=True)


def main():
    clear()
    steel = mat_steel()

    plate = make_plate('WalkerPlate', (0, 0, PLATE_T / 2), PLATE_XY, PLATE_T, steel)
    base = make_cyl('WalkerBase', (0, 0, BASE_H / 2), BASE_R, BASE_H, steel, 28)
    lip = make_cyl('WalkerLip', (0, 0, BASE_H + 0.05), BASE_R * 0.88, 0.10, steel, 28)
    pedF = make_cyl('WalkerPedFront', (FRONT[0], FRONT[1], BASE_H + PED_FRONT_H / 2), PED_R, PED_FRONT_H, steel, 18)
    pedR = make_cyl('WalkerPedRear', (REAR[0], REAR[1], BASE_H + PED_REAR_H / 2), PED_R, PED_REAR_H, steel, 18)

    spheres = build_body_spheres()
    body = join_and_remesh(spheres, 'WalkerBody', voxel=0.07, target_tris=5200)
    body.data.materials.clear()
    body.data.materials.append(steel)

    smart_uv(body)
    for o in (plate, base, lip, pedF, pedR):
        smart_uv(o)

    # Join pedestals
    bpy.ops.object.select_all(action='DESELECT')
    for o in (base, lip, pedF, pedR):
        o.select_set(True)
    bpy.context.view_layer.objects.active = base
    bpy.ops.object.join()
    base.name = 'WalkerPedestals'

    def tris(o):
        return sum(len(p.vertices) - 2 for p in o.data.polygons)

    print(f'[walker] tris body={tris(body)} ped={tris(base)} plate={tris(plate)} total={tris(body)+tris(base)+tris(plate)}')
    export_glb(OUT)
    print(f'[walker] wrote {OUT} size={os.path.getsize(OUT)}')

    try:
        preview_shot(os.path.join(PREV, 'blender-walker-side.png'), (5.5, -1.5, 3.5), (0.1, 0.2, 4.2), 40)
        preview_shot(os.path.join(PREV, 'blender-walker-front.png'), (0.8, 7.5, 3.8), (0.1, 0.3, 4.2), 38)
        print('[walker] previews ok')
    except Exception as e:
        print('[walker] preview skip', e)


if __name__ == '__main__':
    main()
