#!/usr/bin/env python3
"""Seongnam City Hall → Draco GLB. blender -b -P build_cityhall.py
Blender: X=east, Y=north (−corridor Z), Z=up. Origin=building center.
"""
import bpy, bmesh, math, os
from mathutils import Vector

OUT = os.environ.get('CITYHALL_OUT', '/workspace/bw-cityhall/public/corridor/cityhall')
PREV = os.environ.get('CITYHALL_PREV', '/workspace/bw-cityhall-shots/blender')
os.makedirs(OUT, exist_ok=True); os.makedirs(PREV, exist_ok=True)
CX, CZ = 1610.7, -5930.3
FOOT = [(1521.7,-5905.9),(1522.1,-5942.6),(1530.4,-5942.7),(1628.7,-5943.9),(1633.1,-5943.9),(1663.4,-5944.0),(1693.4,-5943.1),(1693.1,-5924.3),(1690.5,-5906.4),(1530.1,-5905.9)]
COUNCIL = [(1545.6,-5892.8),(1557.1,-5892.8),(1588.2,-5892.9),(1588.2,-5890.0),(1555.0,-5859.0),(1545.7,-5864.3)]
WEST_X1, MID_X1 = 1582.0, 1632.0
WEST_H, MID_H, EAST_H, PH = 36.0, 38.0, 40.0, 8.0

def rel(x,z): return (x-CX, -(z-CZ))

def clear():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for c in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.cameras, bpy.data.lights):
        for b in list(c): c.remove(b)

def mat(name, col, metallic=0.1, roughness=0.5, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = roughness
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        m.blend_method = 'HASHED'
        if 'Transmission Weight' in b.inputs: b.inputs['Transmission Weight'].default_value = 0.9
        b.inputs['IOR'].default_value = 1.45
        b.inputs['Coat Weight'].default_value = 0.4 if 'Coat Weight' in b.inputs else 0
    return m

def box(name, cx,cy,cz, sx,sy,sz, m, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(cx,cy,cz))
    o = bpy.context.active_object; o.name = name; o.scale=(sx,sy,sz)
    bpy.ops.object.transform_apply(scale=True)
    if bevel>0:
        bpy.ops.object.modifier_add(type='BEVEL')
        o.modifiers['Bevel'].width=bevel; o.modifiers['Bevel'].segments=2
        bpy.ops.object.modifier_apply(modifier='Bevel')
    o.data.materials.append(m); return o

def cyl(name, cx,cy,cz, r,h, m, segs=10):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=(cx,cy,cz), vertices=segs)
    o = bpy.context.active_object; o.name=name; o.data.materials.append(m); return o

def grid_glass(name, x0,x1,y_bot,z0,z1, lean, fold_amp, cols, rows, m):
    mesh = bpy.data.meshes.new(name); o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    bm = bmesh.new(); vs=[]
    for i in range(cols):
        for j in range(rows):
            u=i/(cols-1); v=j/(rows-1)
            x=x0+(x1-x0)*u; z=z0+(z1-z0)*v
            fold=(0 if i%2==0 else fold_amp)*v
            y=y_bot + lean*v - fold
            vs.append(bm.verts.new((x,y,z)))
    bm.verts.ensure_lookup_table()
    for i in range(cols-1):
        for j in range(rows-1):
            a=vs[i*rows+j]; b=vs[(i+1)*rows+j]; c=vs[(i+1)*rows+j+1]; d=vs[i*rows+j+1]
            bm.faces.new((a,b,c,d))
    bm.to_mesh(mesh); bm.free(); o.data.materials.append(m); return o

def tris(name, verts, m):
    mesh=bpy.data.meshes.new(name); o=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(o)
    bm=bmesh.new()
    for i in range(0,len(verts),3):
        bm.faces.new([bm.verts.new(v) for v in verts[i:i+3]])
    bm.normal_update(); bm.to_mesh(mesh); bm.free(); o.data.materials.append(m); return o

def extrude_poly(name, pts, z0,z1, m):
    mesh=bpy.data.meshes.new(name); o=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(o)
    bm=bmesh.new(); vs=[bm.verts.new((p[0],p[1],z0)) for p in pts]
    bm.verts.ensure_lookup_table()
    try: f=bm.faces.new(vs)
    except: f=bm.faces.new(list(reversed(vs)))
    ret=bmesh.ops.extrude_face_region(bm, geom=[f])
    ev=[v for v in ret['geom'] if isinstance(v,bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=ev, vec=(0,0,z1-z0))
    bm.to_mesh(mesh); bm.free(); o.data.materials.append(m); return o

def join_named(names, out_name):
    bpy.ops.object.select_all(action='DESELECT')
    objs=[bpy.data.objects.get(n) for n in names if bpy.data.objects.get(n)]
    objs=[o for o in objs if o]
    if not objs: return None
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs)>1: bpy.ops.object.join()
    bpy.context.active_object.name = out_name
    return bpy.context.active_object

def build():
    clear()
    m_frame = mat('Frame', (0.88,0.90,0.92), 0.12, 0.42)
    m_dark  = mat('FrameDark', (0.58,0.60,0.64), 0.18, 0.4)
    m_span  = mat('Spandrel', (0.80,0.82,0.84), 0.05, 0.55)
    m_sof   = mat('Soffit', (0.74,0.76,0.78), 0.05, 0.65)
    m_pil   = mat('Pilotis', (0.96,0.97,0.98), 0.05, 0.32)
    m_sol   = mat('Solar', (0.07,0.09,0.12), 0.8, 0.28)
    # Single glass hue sampled from ref/04 west prism (~#3a7aa8) — 도훈 v5: unify all glazing
    m_glass = mat('Glass', (0.227, 0.478, 0.659), 0.88, 0.06, 0.48)
    m_gb = m_ga = m_gc = m_glass

    pts=[rel(x,z) for x,z in FOOT]
    xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
    x_min,x_max=min(xs),max(xs); y_min,y_max=min(ys),max(ys)
    wx1=WEST_X1-CX; mx1=MID_X1-CX
    y_c=(y_min+y_max)/2; depth=abs(y_max-y_min)

    # --- Opaque massing ---
    opaque=[]
    # West / mid cores (full height shells behind glass)
    opaque.append(box('WestCore', (x_min+wx1)/2, y_c, WEST_H/2+0.3, abs(wx1-x_min)-2, depth-3, WEST_H-0.6, m_dark, 0.12))
    opaque.append(box('MidCore', (wx1+mx1)/2, y_c, MID_H/2+0.3, abs(mx1-wx1)-2, depth-3, MID_H-0.6, m_dark, 0.12))
    # East mass on pilotis
    east_cx=(mx1+x_max)/2; east_sx=abs(x_max-mx1)-2; east_sy=depth-2.5
    opaque.append(box('EastSoffit', east_cx, y_c, PH-0.2, east_sx+1.2, east_sy+1.2, 0.45, m_sof, 0.05))
    opaque.append(box('EastMass', east_cx, y_c, (PH+EAST_H)/2, east_sx, east_sy, EAST_H-PH, m_frame, 0.18))
    # East end solid wall (banner face)
    opaque.append(box('EastEnd', x_max-1.0, y_c, (PH+EAST_H)/2, 1.2, east_sy+0.5, EAST_H-PH, m_frame, 0.1))
    # Roof + solar
    opaque.append(box('Roof', (x_min+x_max)/2, y_c, EAST_H+0.2, abs(x_max-x_min)+3, depth+3, 0.4, m_frame, 0.05))
    for i,sx in enumerate(range(int(x_min)+5, int(x_max)-3, 9)):
        for j,sy in enumerate(range(int(y_min)+4, int(y_max)-3, 7)):
            opaque.append(box(f'Sol{i}_{j}', sx+3.5, sy+2.5, EAST_H+0.45, 7.2, 5.2, 0.1, m_sol))
    # Canopy over entrance
    opaque.append(box('Canopy', (wx1+mx1)/2, y_min-5, 6.8, 36, 11, 0.3, m_frame, 0.06))
    # East frame thick
    opaque.append(box('EFTop', east_cx, y_min-0.5, EAST_H+0.25, east_sx+0.8, 0.8, 0.6, m_frame))
    opaque.append(box('EFL', mx1+0.8, y_min-0.5, (PH+EAST_H)/2, 0.8, 0.8, EAST_H-PH, m_frame))
    opaque.append(box('EFR', x_max-1.5, y_min-0.5, (PH+EAST_H)/2, 0.8, 0.8, EAST_H-PH, m_frame))
    for k,zy in enumerate(range(int(PH)+3, int(EAST_H)-1, 3)):
        opaque.append(box(f'EBand{k}', east_cx, y_min-0.4, zy, east_sx-1.2, 0.4, 0.32, m_span))
    # Pilotis
    for i in range(12):
        px = mx1 + 2 + i*((x_max-mx1-4)/11)
        for oy in (-east_sy/2+2.5, 0, east_sy/2-2.5):
            opaque.append(cyl(f'P{i}_{oy:.0f}', px, y_c+oy, PH/2, 0.45, PH, m_pil))
    for i in range(7):
        px = wx1 + 3 + i*((mx1-wx1-4)/6)
        opaque.append(cyl(f'PM{i}', px, y_min-2, 3.5, 0.42, 7.0, m_pil))
    # Council
    cpts=[rel(x,z) for x,z in COUNCIL]
    opaque.append(extrude_poly('Council', cpts, 0, 18, m_frame))
    opaque.append(box('CouncilSlantFrame', 
        ((rel(1588.2,-5890.0)[0]+rel(1555.0,-5859.0)[0])/2),
        ((rel(1588.2,-5890.0)[1]+rel(1555.0,-5859.0)[1])/2),
        9.0, 0.35, math.hypot(rel(1555.0,-5859.0)[0]-rel(1588.2,-5890.0)[0], rel(1555.0,-5859.0)[1]-rel(1588.2,-5890.0)[1])*0.98, 17.5, m_dark, 0.03))

    # --- Glass ---
    glass=[]
    # Council slant glass (after glass list exists)
    ca = rel(1588.2, -5890.0); cb = rel(1555.0, -5859.0)
    cm = ((ca[0]+cb[0])/2, (ca[1]+cb[1])/2)
    clen = math.hypot(cb[0]-ca[0], cb[1]-ca[1])
    cang = math.atan2(cb[1]-ca[1], cb[0]-ca[0])
    bpy.ops.mesh.primitive_plane_add(size=1, location=(cm[0], cm[1], 9.0))
    cg = bpy.context.active_object; cg.name = 'CouncilSlantGlass'
    cg.scale = (clen, 1, 16.5); cg.rotation_euler = (math.radians(90), 0, cang)
    bpy.ops.object.transform_apply(scale=True, rotation=True); cg.data.materials.append(m_glass); glass.append(cg)

    y_bot = y_min - 8.0
    x0, x1 = x_min-1.5, mx1+6
    # Big triangular prism facets
    facets=[]; n=9
    for i in range(n):
        u0,u1=i/n,(i+1)/n
        xa=x0+(x1-x0)*u0; xb=x0+(x1-x0)*u1; xm=(xa+xb)/2
        lean=18+(i%2)*12; fold=2.0 if i%2==0 else 14
        y_top=y_bot+lean; y_fold=y_bot+lean*0.4-fold
        z0,z1=0.3, WEST_H+0.3 if i<5 else MID_H+0.3
        facets += [(xa,y_bot,z0),(xb,y_bot,z0),(xm,y_fold,z1),
                   (xa,y_bot,z0),(xm,y_fold,z1),(xa,y_top,z1),
                   (xb,y_bot,z0),(xb,y_top,z1),(xm,y_fold,z1)]
    glass.append(tris('WestFacets', facets, m_gb))
    # Solid wedge volumes so facets read in aerial
    for i in range(6):
        u0,u1=i/6,(i+1)/6
        xa=x0+(x1-x0)*u0; xb=x0+(x1-x0)*u1
        lean=16+(i%2)*10; fold=3 if i%2==0 else 12
        y_front=y_bot - fold*0.3; y_back=y_bot + lean
        cx=(xa+xb)/2; cy=(y_front+y_back)/2; cz=WEST_H/2
        sx=max(2.5,(xb-xa)*0.85); sy=max(3.0,abs(y_back-y_front)*0.55); sz=WEST_H-1
        glass.append(box(f'WestWedge{i}', cx, cy, cz, sx, sy, sz, m_gb, 0.08))

    glass.append(grid_glass('WestSkin', x0, x1, y_bot+1.0, 0.4, WEST_H+0.5, 24, 12, 22, 12, m_gb))
    glass.append(grid_glass('Atrium', wx1-8, mx1+14, y_bot+1.5, 0.4, MID_H, 18, 7, 16, 10, m_ga))
    # East curtain plane
    bpy.ops.mesh.primitive_plane_add(size=1, location=(east_cx, y_min-0.6, (PH+EAST_H)/2))
    ec=bpy.context.active_object; ec.name='EastCurtain'
    ec.scale=(east_sx-1.8,1,EAST_H-PH-0.8); ec.rotation_euler=(math.radians(90),0,0)
    bpy.ops.object.transform_apply(scale=True, rotation=True); ec.data.materials.append(m_gc); glass.append(ec)
    # North curtain
    bpy.ops.mesh.primitive_plane_add(size=1, location=((x_min+x_max)/2, y_max+0.5, EAST_H/2))
    nc=bpy.context.active_object; nc.name='NorthCurtain'
    nc.scale=(abs(x_max-x_min)-2,1,EAST_H-2); nc.rotation_euler=(math.radians(90),0,math.radians(180))
    bpy.ops.object.transform_apply(scale=True, rotation=True); nc.data.materials.append(m_gc); glass.append(nc)
    # West side lean glass
    glass.append(grid_glass('WestSide', x_min-0.8, x_min-0.8, y_min+2, 1, WEST_H-1, 0, 0, 2, 8, m_gb))
    # hack: rebuild west side as vertical plane at x_min leaning +X
    bpy.data.objects.remove(glass.pop(), do_unlink=True)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(x_min-0.6, y_c, WEST_H/2))
    ws=bpy.context.active_object; ws.name='WestSide'
    ws.scale=(1, depth-4, WEST_H-2); ws.rotation_euler=(0, math.radians(90), 0)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    # lean top east (+X)
    bm=bmesh.new(); bm.from_mesh(ws.data)
    for v in bm.verts:
        t=max(0,(v.co.z-1)/(WEST_H-2))
        v.co.x += t*t*8
    bm.to_mesh(ws.data); bm.free(); ws.data.materials.append(m_gb); glass.append(ws)

    # --- Front annex (앞쪽 조그만한 건물): south of west wing, RIGHT side diagonally cut ---
    # Corridor: X=east, Z=south+. Blender: X=east, Y=north=(-Z).
    # Looking from SE plaza: annex sits in front of west prism; its east (right) face is a plan chamfer.
    front_h = 14.0
    # Polygon in corridor (x,z), then rel() → Blender (x,y)
    # SW protrusion ~14m south of main south face (~-5943); east face slants from NE attach to SE tip.
    # Plaza/south face is zMax≈-5906 (+Z south). Annex protrudes further south (larger z).
    # When viewed from SE plaza, annex is in front of west wing; its RIGHT (east) edge is chamfered.
    FRONT_CORRIDOR = [
        (1526.0, -5906.0),  # attach west on main south face
        (1526.0, -5886.0),  # SW — out into plaza
        (1542.0, -5886.0),  # short south before long slant
        (1582.0, -5906.0),  # long diagonal cut to SE attach (비스듬히 깎인 우측)
    ]
    front_pts = [rel(x, z) for x, z in FRONT_CORRIDOR]
    opaque.append(extrude_poly('FrontAnnex', front_pts, 0.0, front_h, m_frame))
    opaque.append(extrude_poly('FrontAnnexRoof', front_pts, front_h, front_h + 0.35, m_frame))
    # South glass wall
    fx0, fy_s = rel(1526.0, -5886.0)
    fx1, _ = rel(1542.0, -5886.0)
    # In Blender after rel: south ≈ smaller or larger Y? FOOT south z=-5906 → Y=-(z-CZ)=-( -5906+5930.3)= -24.3
    # Further south z=-5888 → Y=-( -5888+5930.3)= -42.3  (more negative Y = further south in this mapping)
    bpy.ops.mesh.primitive_plane_add(size=1, location=((fx0+fx1)/2, fy_s - 0.12, front_h/2))
    fs = bpy.context.active_object; fs.name = 'FrontSouthGlass'
    fs.scale = (abs(fx1-fx0)-0.5, 1, front_h-0.7); fs.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(scale=True, rotation=True); fs.data.materials.append(m_glass); glass.append(fs)
    # Slanted east face along (1554,-5888)→(1578,-5900)
    a = rel(1542.0, -5886.0); b = rel(1582.0, -5906.0)
    mid = ((a[0]+b[0])/2, (a[1]+b[1])/2)
    edge_len = math.hypot(b[0]-a[0], b[1]-a[1])
    ang = math.atan2(b[1]-a[1], b[0]-a[0])
    bpy.ops.mesh.primitive_plane_add(size=1, location=(mid[0], mid[1], front_h/2))
    fe = bpy.context.active_object; fe.name = 'FrontSlantGlass'
    fe.scale = (edge_len, 1, front_h-0.5)
    fe.rotation_euler = (math.radians(90), 0, ang)
    bpy.ops.object.transform_apply(scale=True, rotation=True); fe.data.materials.append(m_glass); glass.append(fe)
    # Thick dark frame along the slant edge so the cut reads even at distance
    opaque.append(box('FrontSlantFrame', mid[0], mid[1], front_h/2, 0.45, edge_len*0.98, front_h-0.2, m_dark, 0.04))
    # Roof edge strip along slant
    opaque.append(box('FrontSlantRoofEdge', mid[0], mid[1], front_h + 0.2, 0.6, edge_len*0.98, 0.35, m_frame, 0.02))

    # Join
    join_named([o.name for o in opaque], 'CityHallOpaque')
    join_named([o.name for o in glass], 'CityHallGlass')
    # Opaque: keep sharp massing (council slant / annex cut must stay crisp) — flat shaded, no dissolve
    o=bpy.data.objects.get('CityHallOpaque')
    if o:
        bpy.context.view_layer.objects.active=o; o.select_set(True)
        bpy.ops.object.shade_flat()
    # Glass: light dissolve + smooth ok
    o=bpy.data.objects.get('CityHallGlass')
    if o:
        bpy.context.view_layer.objects.active=o; bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
        bpy.ops.object.shade_smooth()
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.dissolve_limited(angle_limit=math.radians(1.5))
        bpy.ops.object.mode_set(mode='OBJECT')

    # AO bake on opaque
    o=bpy.data.objects.get('CityHallOpaque')
    if o:
        img=bpy.data.images.new('AOAtlas',1024,1024,alpha=False)
        bpy.context.view_layer.objects.active=o; o.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
        bpy.ops.object.mode_set(mode='OBJECT')
        mat0=o.data.materials[0]; mat0.use_nodes=True
        tex=mat0.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=img
        mat0.node_tree.nodes.active=tex
        sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.device='CPU'; sc.cycles.samples=8
        try:
            bpy.ops.object.bake(type='AO', margin=4)
            img.filepath_raw=os.path.join(OUT,'ao_atlas.png'); img.file_format='PNG'; img.save()
            # wire AO into base
            nt=mat0.node_tree; bsdf=nt.nodes.get('Principled BSDF')
            mix=nt.nodes.new('ShaderNodeMix'); mix.data_type='RGBA'; mix.inputs['Factor'].default_value=0.5
            rgb=nt.nodes.new('ShaderNodeRGB'); rgb.outputs[0].default_value=(0.88,0.90,0.92,1)
            nt.links.new(rgb.outputs[0], mix.inputs['A'])
            nt.links.new(tex.outputs['Color'], mix.inputs['B'])
            nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
            print('AO ok')
        except Exception as e:
            print('AO skip', e)

    fa=bpy.data.objects.get('CityHallOpaque')
    if fa:
        bb=[fa.matrix_world @ Vector(c) for c in fa.bound_box]
        xs=[v.x for v in bb]; ys=[v.y for v in bb]; zs=[v.z for v in bb]
        print('OPAQUE_BOUNDS', min(xs),max(xs), min(ys),max(ys), min(zs),max(zs))
    gl=bpy.data.objects.get('CityHallGlass')
    if gl:
        bb=[gl.matrix_world @ Vector(c) for c in gl.bound_box]
        xs=[v.x for v in bb]; ys=[v.y for v in bb]; zs=[v.z for v in bb]
        print('GLASS_BOUNDS', min(xs),max(xs), min(ys),max(ys), min(zs),max(zs))
        print('GLASS_MATS', [m.name for m in gl.data.materials])
    glb=os.path.join(OUT,'building.glb')
    bpy.ops.export_scene.gltf(
        filepath=glb, export_format='GLB', export_apply=True,
        export_texcoords=True, export_normals=True, export_materials='EXPORT',
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
        export_yup=True, export_animations=False,
    )
    print('EXPORTED', glb, os.path.getsize(glb))

    # Preview SE aerial like ref/04
    sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.device='CPU'; sc.cycles.samples=12
    sc.render.resolution_x=1600; sc.render.resolution_y=1000
    sc.render.filepath=os.path.join(PREV,'blender-preview-04.png')
    cam_d=bpy.data.cameras.new('Cam'); cam=bpy.data.objects.new('Cam',cam_d)
    bpy.context.collection.objects.link(cam); sc.camera=cam
    cam.location=(55,-70,38); cam_d.lens=28
    cam.rotation_euler=(Vector((0,0,16))-cam.location).to_track_quat('-Z','Y').to_euler()
    ld=bpy.data.lights.new('Sun','SUN'); ld.energy=4.5
    sun=bpy.data.objects.new('Sun',ld); bpy.context.collection.objects.link(sun)
    sun.rotation_euler=(math.radians(50), math.radians(20), math.radians(-40))
    w=bpy.data.worlds.new('W'); sc.world=w; w.use_nodes=True
    w.node_tree.nodes['Background'].inputs[0].default_value=(0.62,0.75,0.92,1)
    w.node_tree.nodes['Background'].inputs[1].default_value=1.2
    bpy.ops.render.render(write_still=True)
    print('PREVIEW', sc.render.filepath)

if __name__=='__main__':
    build()
