# Builds the Kraken Port crab sign (after Dotonbori's mechanical crab) and exports it as a GLB with every joint as
# its own node, so the legs and claws can move in three.js. Run headless:
#   /Applications/Blender.app/Contents/MacOS/Blender -b -P day-02-halcyon/tools/crab.py -- day-02-halcyon/assets/crab.glb
# Blender is Z-up; the crab lies in its natural pose: back up (+Z), front toward +Y, right side toward +X.
import bpy, bmesh, math, sys
from mathutils import Vector, Euler

out = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "crab.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def smooth(obj, levels=2):
    for p in obj.data.polygons:
        p.use_smooth = True
    m = obj.modifiers.new("sub", "SUBSURF")
    m.levels = levels
    m.render_levels = levels
    return obj


def new_obj(name, mesh, parent=None):
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def empty(name, loc=(0, 0, 0), rot=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None)
    scene.collection.objects.link(e)
    e.location = loc
    e.rotation_euler = Euler(rot, "XYZ")
    if parent:
        e.parent = parent
    return e


def segment(name, length, r0, r1, parent=None, flat=1.0, tip=False, ring=12):
    """A tapered limb segment lying along local +X from its joint at the origin, rounded at both ends."""
    bm = bmesh.new()
    rings = 10
    for i in range(rings + 1):
        t = i / rings
        x = t * length
        r = r0 + (r1 - r0) * t
        if tip:
            r = r0 * (1 - t) ** 0.8 + 0.01
        # a slight bulge in the middle of each segment, like a crab's leg
        r *= 1 + 0.08 * math.sin(t * math.pi)
        for j in range(ring):
            a = j / ring * math.tau
            bm.verts.new((x, math.cos(a) * r, math.sin(a) * r * flat))
    bm.verts.ensure_lookup_table()
    for i in range(rings):
        for j in range(ring):
            a = i * ring + j
            b = i * ring + (j + 1) % ring
            bm.faces.new((bm.verts[a], bm.verts[b], bm.verts[b + ring], bm.verts[a + ring]))
    # caps
    bm.faces.new([bm.verts[j] for j in reversed(range(ring))])
    bm.faces.new([bm.verts[rings * ring + j] for j in range(ring)])
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = new_obj(name, mesh, parent)
    smooth(obj, 2)
    return obj


def knob(name, r, parent, loc=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=r, location=(0, 0, 0))
    o = bpy.context.active_object
    o.name = name
    o.parent = parent
    o.location = loc
    for p in o.data.polygons:
        p.use_smooth = True
    return o


# ---- the carapace -----------------------------------------------------------------------------------------------
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5, radius=1.0)
body = bpy.context.active_object
body.name = "carapace"
mesh = body.data
for v in mesh.vertices:
    x, y, z = v.co
    # wider than long, flat underneath, narrowing to the front, a low ridge down the middle
    z = z * (1.15 if z > 0 else 0.5)
    x = x * 3.9 * (1 - 0.12 * max(0, y))
    y = y * 3.3
    if z > 0:
        z += 0.22 * math.exp(-(x * x) * 0.8) * (1 - abs(y) / 3.3)
    v.co = (x, y, z * 1.45)
for p in mesh.polygons:
    p.use_smooth = True
# tubercles: a voronoi bump over the back
tex = bpy.data.textures.new("bumps", type="VORONOI")
tex.noise_scale = 0.32
disp = body.modifiers.new("disp", "DISPLACE")
disp.texture = tex
disp.strength = 0.12
disp.mid_level = 0.6
sub = body.modifiers.new("sub", "SUBSURF")
sub.levels = 1

# the front rim: a row of short spines, and two eyes on stalks
for i in range(11):
    t = (i / 10) * 2 - 1
    x = t * 2.7
    y = 3.0 - abs(t) ** 2 * 1.4
    bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=0.16, radius2=0.0, depth=0.42, location=(x, y + 0.12, 0.42))
    s = bpy.context.active_object
    s.name = f"spine_{i}"
    s.rotation_euler = Euler((-1.15, 0, -t * 0.6), "XYZ")
    s.parent = body
for side in (-1, 1):
    stalk = segment(f"eyestalk_{'L' if side < 0 else 'R'}", 0.55, 0.09, 0.07, parent=body)
    stalk.location = (side * 0.62, 3.1, 0.75)
    stalk.rotation_euler = Euler((0, -1.1, math.pi / 2 - side * 0.25), "XYZ")
    eye = knob(f"eye_{'L' if side < 0 else 'R'}", 0.24, stalk, (0.6, 0, 0))

# ---- walking legs: four a side, each merus, carpus, propodus and a pointed dactyl ---------------------------------
LEGS = [
    # attach y, splay angle (deg, 0 = straight out), lengths
    (1.6, 30, (4.4, 1.8, 3.4, 2.1)),
    (0.45, 8, (4.8, 1.9, 3.7, 2.2)),
    (-0.7, -14, (4.6, 1.8, 3.5, 2.1)),
    (-1.8, -38, (3.9, 1.6, 3.0, 1.9)),
]
for side in (-1, 1):
    s = "R" if side > 0 else "L"
    for k, (ay, splay, (l1, l2, l3, l4)) in enumerate(LEGS):
        x0 = side * (3.3 - abs(ay) * 0.25)
        root = empty(f"leg_{s}{k}", (x0, ay, -0.05), (0, 0, math.radians(splay) if side > 0 else math.pi - math.radians(splay)))
        root.parent = body
        knob(f"leg_{s}{k}_hip", 0.6, root)
        m = segment(f"leg_{s}{k}_s1", l1, 0.56, 0.48, parent=root, flat=0.7)
        m.rotation_euler = Euler((0, -0.18, 0), "XYZ")  # rising a little from the body
        j1 = knob(f"leg_{s}{k}_k1", 0.5, m, (l1, 0, 0))
        c = segment(f"leg_{s}{k}_s2", l2, 0.47, 0.42, parent=m, flat=0.72)
        c.location = (l1, 0, 0)
        c.rotation_euler = Euler((0, 0.5, side * (0.3 if k < 2 else -0.3)), "XYZ")  # the knee bends down
        j2 = knob(f"leg_{s}{k}_k2", 0.44, c, (l2, 0, 0))
        p = segment(f"leg_{s}{k}_s3", l3, 0.41, 0.3, parent=c, flat=0.74)
        p.location = (l2, 0, 0)
        p.rotation_euler = Euler((0, 0.22, side * (0.35 if k < 2 else -0.35)), "XYZ")
        d = segment(f"leg_{s}{k}_s4", l4, 0.29, 0.0, parent=p, tip=True, flat=0.8)
        d.location = (l3, 0, 0)
        d.rotation_euler = Euler((0, 0.35, side * 0.1), "XYZ")

# ---- claws: a raised arm, a heavy hand, a fixed finger and a moving one ------------------------------------------------
for side in (-1, 1):
    s = "R" if side > 0 else "L"
    root = empty(f"claw_{s}", (side * 2.0, 2.6, 0.2), (0, 0, math.radians(58) if side > 0 else math.pi - math.radians(58)))
    root.parent = body
    knob(f"claw_{s}_hip", 0.72, root)
    a1 = segment(f"claw_{s}_s1", 3.2, 0.7, 0.62, parent=root, flat=0.72)
    a1.rotation_euler = Euler((0, -0.2, 0), "XYZ")
    knob(f"claw_{s}_k1", 0.66, a1, (3.2, 0, 0))
    a2 = segment(f"claw_{s}_s2", 2.4, 0.66, 0.78, parent=a1, flat=0.75)
    a2.location = (3.2, 0, 0)
    a2.rotation_euler = Euler((0, 0.15, side * -0.8), "XYZ")
    knob(f"claw_{s}_k2", 0.72, a2, (2.4, 0, 0))
    hand = segment(f"claw_{s}_hand", 2.8, 0.95, 0.72, parent=a2, flat=0.58)
    hand.location = (2.4, 0, 0)
    hand.rotation_euler = Euler((0, 0.05, side * -0.6), "XYZ")
    fixed = segment(f"claw_{s}_fixed", 2.1, 0.55, 0.0, parent=hand, tip=True, flat=0.7)
    fixed.location = (2.8, 0, -0.1)
    fixed.rotation_euler = Euler((0, 0, side * 0.14), "XYZ")
    move = segment(f"claw_{s}_finger", 2.2, 0.5, 0.0, parent=hand, tip=True, flat=0.7)
    move.location = (2.6, side * -0.3, 0.2)
    move.rotation_euler = Euler((0, 0, side * -0.36), "XYZ")

# ---- export ------------------------------------------------------------------------------------------------------------
for o in scene.objects:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_apply=True, export_yup=True, export_materials="NONE", export_normals=True)
print("wrote", out, len(scene.objects), "objects")
