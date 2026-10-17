# Builds 天龍, the dragon that flies round the Tenryū pagoda: a long East Asian dragon, straight along +X so three.js
# can bend it along its flight (pagoda.js). Run headless:
#   /Applications/Blender.app/Contents/MacOS/Blender -b -P day-02-halcyon/tools/dragon.py -- day-02-halcyon/assets/dragon.glb [preview.png]
# Blender is Z-up. The head is at x > 0 facing +X, the body runs to the tip of the tail at x = -L, the back is +Z.
# Every vertex carries a UV that names its part (u = id / 10) and, on strands and blades, how far along it is (v),
# so the shader can shade each part its own way and wave the hair from root to tip.
import bpy, bmesh, math, sys
from mathutils import Vector, Matrix, Quaternion

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = args[0] if args else "dragon.glb"
PREVIEW = args[1] if len(args) > 1 else None

L = 100.0  # body length, head to tail tip
RB = 2.3  # body radius at its thickest
BODY, TONGUE_ID, SPINE, HEAD, HORN, WHISKER, HAIR, CLAW, EYE, LEG = 0, 1, 2, 3, 4, 5, 6, 7, 8, 9

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
parts = []  # objects to join


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def radius(s):
    """the body's radius along its length: a slim neck, a deep chest, a long taper to the tail"""
    return RB * (0.56 + 0.44 * smoothstep(0.0, 0.13, s)) * (1.0 - 0.94 * smoothstep(0.3, 1.0, s) ** 1.15)


def link(name, me):
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


def tag(ob, part, tfun=None):
    """name the part in a UV layer: u = part / 10, v = tfun(vertex) (how far along a strand) or 0"""
    me = ob.data
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    uv = me.uv_layers.new(name="part")
    for loop in me.loops:
        v = me.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = (part / 10.0 + 0.001, tfun(v) if tfun else 0.0)
    for p in me.polygons:
        p.use_smooth = True
    parts.append(ob)
    return ob


def catmull(points, n):
    """a smooth curve through points, n samples"""
    pts = [Vector(p) for p in points]
    pts = [pts[0] * 2 - pts[1]] + pts + [pts[-1] * 2 - pts[-2]]
    out = []
    segs = len(pts) - 3
    for i in range(n):
        t = i / (n - 1) * segs
        k = min(int(t), segs - 1)
        u = t - k
        p0, p1, p2, p3 = pts[k], pts[k + 1], pts[k + 2], pts[k + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u))
    return out


def tube(name, points, r0, r1, part, n=40, sides=8, power=1.0):
    """a tapered tube along a smooth curve (horns, whiskers, hair, legs, claws); v runs 0 at the root to 1 at the tip"""
    path = catmull(points, n)
    bm = bmesh.new()
    rings = []
    prev_side = None
    for i, p in enumerate(path):
        t = i / (n - 1)
        tangent = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        ref = Vector((0, 0, 1)) if abs(tangent.z) < 0.9 else Vector((0, 1, 0))
        side = tangent.cross(ref).normalized() if prev_side is None else (prev_side - tangent * prev_side.dot(tangent)).normalized()
        prev_side = side
        up = side.cross(tangent).normalized()
        r = r0 + (r1 - r0) * (t ** power)
        ring = []
        for k in range(sides):
            a = k / sides * math.tau
            ring.append(bm.verts.new(p + (side * math.cos(a) + up * math.sin(a)) * r))
        rings.append(ring)
    for i in range(n - 1):
        for k in range(sides):
            a, b = rings[i][k], rings[i][(k + 1) % sides]
            c, d = rings[i + 1][(k + 1) % sides], rings[i + 1][k]
            bm.faces.new((a, b, c, d))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(name, me)
    root = path[0]
    length = sum((path[i + 1] - path[i]).length for i in range(n - 1))
    cum = [0.0]
    for i in range(n - 1):
        cum.append(cum[-1] + (path[i + 1] - path[i]).length)

    def along(v):
        j = min(range(n), key=lambda i: (path[i] - v).length_squared)
        return cum[j] / length

    return tag(ob, part, along)


def blade(name, base, along, up, side, length, height, thick, part, sweep=0.55, n=7):
    """a curved fin: a flame-like blade standing on `base`, its front edge bulging, swept back; thin, two-faced"""
    # outline in (a, h): from the front of the base, up the bulging front edge to the tip, down the hollow back edge
    front = [(-sweep * height * (t ** 1.3) + length * 0.15 * math.sin(t * math.pi), height * t) for t in [i / n for i in range(n + 1)]]
    tip = front[-1]
    back = [(tip[0] + (-length - tip[0]) * t + length * 0.25 * math.sin(t * math.pi) * 0.6, tip[1] * (1 - t) ** 1.2) for t in [i / n for i in range(1, n + 1)]]
    outline = front + back
    bm = bmesh.new()
    top, bot = [], []
    for a, h in outline:
        p = base + along * a + up * h
        w = thick * (1 - h / max(height, 1e-6)) * 0.5 + 0.02
        top.append(bm.verts.new(p + side * w))
        bot.append(bm.verts.new(p - side * w))
    cA = bm.verts.new(base + along * (-length * 0.5) + up * height * 0.25 + side * thick * 0.4)
    cB = bm.verts.new(base + along * (-length * 0.5) + up * height * 0.25 - side * thick * 0.4)
    m = len(outline)
    for i in range(m):
        j = (i + 1) % m
        bm.faces.new((cA, top[i], top[j]))
        bm.faces.new((cB, bot[j], bot[i]))
        bm.faces.new((top[i], bot[i], bot[j], top[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(name, me)
    return tag(ob, part, lambda v: max(0.0, min(1.0, (v - base).dot(up) / height)))


# ---- the body: rings along the length, the belly a little flatter ------------------------------------------------------
NR, AROUND = 420, 28
bm = bmesh.new()
rings = []
for j in range(NR + 1):
    s = j / NR
    r = radius(s)
    x = -s * L
    ring = []
    for k in range(AROUND):
        a = k / AROUND * math.tau
        y, z = math.cos(a) * r, math.sin(a) * r
        if z < 0:
            z *= 0.82  # the belly
        ring.append(bm.verts.new((x, y, z)))
    rings.append(ring)
for j in range(NR):
    for k in range(AROUND):
        a, b = rings[j][k], rings[j][(k + 1) % AROUND]
        c, d = rings[j + 1][(k + 1) % AROUND], rings[j + 1][k]
        bm.faces.new((a, d, c, b))
bm.faces.new(rings[0])
tipc = bm.verts.new((-L - 0.6, 0, 0))
for k in range(AROUND):
    bm.faces.new((rings[-1][k], rings[-1][(k + 1) % AROUND], tipc))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new("body")
bm.to_mesh(me)
bm.free()
tag(link("body", me), BODY)

# ---- the dorsal crest: curved blades along the back, tallest over the shoulders ------------------------------------------
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
NS = 96
for k in range(NS):
    s = 0.06 + k / NS * 0.86
    r = radius(s)
    h = 1.9 * (1 - 0.72 * smoothstep(0.15, 0.92, s)) * (1.0 if k % 2 == 0 else 0.62)
    blade(f"spine{k}", Vector((-s * L, 0, r * 0.88)), X, Z, Y, length=0.95 * (1 - 0.5 * s), height=h, thick=0.3 * (1 - 0.5 * s), part=SPINE)

# ---- legs: four, each a shoulder, an elbow tufted with flame, a forearm and a foot of four curved talons ------------------
TUFTS = []
for s0, front in [(0.17, True), (0.56, False)]:
    r = radius(s0)
    x0 = -s0 * L
    for sy in (-1, 1):
        shoulder = Vector((x0, sy * r * 0.72, -r * 0.25))
        elbow = shoulder + Vector((-2.6 if front else -3.2, sy * 2.4, -2.2))
        wrist = elbow + Vector((3.4 if front else 2.6, sy * 0.7, -2.0))
        foot = wrist + Vector((1.2, sy * 0.2, -0.6))
        tube("leg", [shoulder, shoulder + Vector((-0.8, sy * 1.2, -1.2)), elbow], r * 0.5, r * 0.32, LEG, n=16, sides=10)
        tube("arm", [elbow, elbow + Vector((1.6, sy * 0.4, -1.0)), wrist, foot], r * 0.32, r * 0.24, LEG, n=18, sides=10)
        # the foot: a pad, four short toes gripping, each ending in a hooked talon
        tube("pad", [foot + Vector((-0.4, 0, 0.1)), foot + Vector((0.5, sy * 0.1, -0.1))], r * 0.3, r * 0.26, LEG, n=6, sides=10)
        for c, spread in enumerate([-0.5, -0.17, 0.17, 0.5]):
            d = Vector((math.cos(spread), sy * math.sin(spread), 0))
            base = foot + d * 0.45
            toe = base + d * 0.75 + Vector((0, 0, -0.15))
            tube("toe", [base, base + d * 0.4, toe], 0.2, 0.15, LEG, n=6, sides=8)
            tube("claw", [toe, toe + d * 0.45 + Vector((0, 0, -0.05)), toe + d * 0.75 + Vector((0, 0, -0.35)), toe + d * 0.8 + Vector((0, 0, -0.7))], 0.15, 0.015, CLAW, n=12, sides=6)
        # the thumb, behind
        tube("thumb", [foot + Vector((-0.3, 0, 0)), foot + Vector((-0.8, sy * 0.3, -0.15)), foot + Vector((-1.05, sy * 0.35, -0.55))], 0.13, 0.015, CLAW, n=10, sides=6)
        # flame tufts streaming back off the elbow
        TUFTS.append((elbow, sy))

# ---- the head: one sculpted loft (skull, heavy brows over deep-set eyes, cheeks, the long snout, the bulbous upturned nose)
#      and the lower jaw hanging open beneath it; teeth along both jaws; eyes set into the sockets ---------------------------
def interp(table, x):
    """smooth interpolation through (x, value) control points"""
    xs = [p[0] for p in table]
    if x <= xs[0]:
        return table[0][1]
    if x >= xs[-1]:
        return table[-1][1]
    for i in range(len(xs) - 1):
        if xs[i] <= x <= xs[i + 1]:
            t = (x - xs[i]) / (xs[i + 1] - xs[i])
            t = t * t * (3 - 2 * t)
            return table[i][1] + (table[i + 1][1] - table[i][1]) * t


def gauss(x, mu, sig):
    return math.exp(-((x - mu) / sig) ** 2)


def loft(name, xs, section, part, around=56, caps=True):
    bm = bmesh.new()
    rings = []
    for x in xs:
        rings.append([bm.verts.new(p) for p in section(x, around)])
    for i in range(len(rings) - 1):
        for k in range(around):
            a, b = rings[i][k], rings[i][(k + 1) % around]
            c, d = rings[i + 1][(k + 1) % around], rings[i + 1][k]
            bm.faces.new((a, d, c, b))
    if caps:
        for ring, rev in ((rings[0], True), (rings[-1], False)):
            cen = bm.verts.new(sum((v.co for v in ring), Vector()) / len(ring))
            for k in range(around):
                tri = (ring[k], ring[(k + 1) % around], cen)
                bm.faces.new(tri if not rev else tri[::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return tag(link(name, me), part)


HW = [(-1.2, 1.32), (0.4, 1.9), (1.8, 2.15), (3.0, 1.85), (4.2, 1.5), (5.6, 1.1), (7.0, 0.98), (8.0, 1.12), (8.7, 1.36), (9.4, 1.05), (9.9, 0.35)]
HH = [(-1.2, 1.32), (0.4, 1.75), (1.6, 2.0), (3.0, 1.55), (4.2, 1.2), (5.6, 0.86), (7.0, 0.78), (8.0, 0.95), (8.7, 1.18), (9.4, 0.95), (9.9, 0.3)]
HZ = [(-1.2, 0.0), (0.4, 0.45), (1.6, 0.7), (3.0, 0.55), (4.5, 0.35), (6.0, 0.15), (7.4, 0.12), (8.7, 0.55), (9.4, 0.7), (9.9, 0.75)]


def head_section(x, n):
    w, h, zc = interp(HW, x), interp(HH, x), interp(HZ, x)
    pts = []
    for k in range(n):
        a = k / n * math.tau
        ca, sa = math.cos(a), math.sin(a)
        e = 2.6  # a little square in section, like a skull
        kk = (abs(ca) ** e + abs(sa) ** e) ** (-1 / e)
        y, z = ca * w * kk, sa * h * kk
        if z < 0:
            z *= 0.5  # the roof of the mouth is flat
        rad = Vector((0, ca, sa))
        # brow ridges over the eyes, the bridge of the snout, the cheekbones, the flared nostrils
        top = math.degrees(math.atan2(sa, abs(ca)))
        bump = 0.62 * gauss(x, 3.3, 0.85) * gauss(top, 48, 16)
        bump += 0.22 * gauss(x, 6.2, 1.4) * gauss(top, 90, 22)
        bump += 0.4 * gauss(x, 1.4, 0.9) * gauss(top, -18, 18)
        bump += 0.32 * gauss(x, 8.9, 0.45) * gauss(top, 40, 20)
        # the eye sockets: a hollow under each brow
        bump -= 0.3 * gauss(x, 3.95, 0.45) * gauss(top, 18, 12)
        p = Vector((x, y, z + zc)) + rad * bump
        pts.append(p)
    return pts


xs_head = [-1.2 + i * (11.1 / 120) for i in range(121)]
loft("head", xs_head, head_section, HEAD)

JW = [(0.4, 1.75), (2.0, 1.62), (4.0, 1.3), (6.0, 1.0), (7.4, 0.95), (8.2, 0.6)]
JH = [(0.4, 1.0), (2.0, 0.92), (4.0, 0.76), (6.0, 0.6), (7.4, 0.72), (8.2, 0.32)]
HINGE, OPEN = Vector((0.9, 0, -0.55)), math.radians(17)
rot_jaw = Matrix.Rotation(OPEN, 4, "Y")  # front of the jaw swings down


def jaw_point(p):
    return HINGE + (rot_jaw @ (p - HINGE).to_4d()).to_3d()


def jaw_section(x, n):
    w, h = interp(JW, x), interp(JH, x)
    pts = []
    for k in range(n):
        a = k / n * math.tau
        ca, sa = math.cos(a), math.sin(a)
        y, z = ca * w, sa * h
        if z > 0:
            z *= 0.3  # the jaw's top is a shallow trough
        else:
            z *= 1.0 - 0.25 * (ca * ca)  # rounded beneath, the jawline firm at the sides
        z += -1.05 + 0.3 * gauss(x, 7.5, 0.6)  # a chin
        pts.append(jaw_point(Vector((x, y, z))))
    return pts


loft("jaw", [0.4 + i * (7.8 / 70) for i in range(71)], jaw_section, HEAD, around=40)

for sy in (-1, 1):
    # eyes set into the sockets under the brows
    ex = 3.95
    ew = interp(HW, ex)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, location=(ex, sy * (ew - 0.32), interp(HZ, ex) + 0.42), segments=24, ring_count=12)
    tag(bpy.context.active_object, EYE)
    # teeth along the upper jaw, fangs at the front; and up from the lower jaw
    for t in range(8):
        x = 3.4 + t * 0.66
        w, h, zc = interp(HW, x), interp(HH, x), interp(HZ, x)
        ln = 0.9 if t == 7 else 0.38
        root = Vector((x, sy * w * 0.82, zc - h * 0.48))
        tube("tooth", [root, root + Vector((0.05, 0, -ln * 0.6)), root + Vector((0.12, 0, -ln))], 0.17 if t == 7 else 0.11, 0.015, CLAW, n=6, sides=6)
    for t in range(7):
        x = 3.0 + t * 0.7
        w = interp(JW, x)
        ln = 0.85 if t == 6 else 0.32
        root = jaw_point(Vector((x, sy * w * 0.8, -0.95 + 0.1)))
        tube("tooth", [root, root + Vector((0.05, 0, ln * 0.6)), root + Vector((0.12, 0, ln))], 0.15 if t == 6 else 0.1, 0.015, CLAW, n=6, sides=6)


# the tongue: long, forked, curling out of the open mouth (added once the lock builder exists, below)
TONGUE = True

# ---- horns: antlers sweeping back from the crown, ridged, each with two tines ----------------------------------------------
def horn(points, r0, r1, n=34):
    ob = tube("horn", points, r0, r1, HORN, n=n, sides=10, power=0.85)
    # ridges round the antler, the way horn grows in rings
    for v in ob.data.vertices:
        pass
    return ob


for sy in (-1, 1):
    tube("horn", [(1.0, sy * 0.85, 2.3), (-0.4, sy * 1.15, 3.4), (-2.3, sy * 1.45, 4.3), (-4.6, sy * 1.65, 4.85), (-6.8, sy * 1.7, 4.8)], 0.42, 0.04, HORN, n=34, sides=10, power=0.85)
    tube("tine", [(-0.9, sy * 1.2, 3.65), (-1.2, sy * 1.65, 4.75), (-1.0, sy * 2.05, 5.8)], 0.2, 0.03, HORN, n=14, sides=8)
    tube("tine", [(-3.4, sy * 1.55, 4.65), (-3.6, sy * 2.0, 5.55), (-3.3, sy * 2.25, 6.25)], 0.15, 0.03, HORN, n=12, sides=8)

# ---- whiskers: long barbels from the snout streaming back in S curves; a shorter pair from the lip -------------------------
for sy in (-1, 1):
    tube("whisker", [(8.6, sy * 1.15, 0.3), (7.2, sy * 2.8, 1.1), (3.8, sy * 4.4, 1.6), (-1.5, sy * 5.5, 0.8), (-7.0, sy * 6.2, -0.6), (-12.5, sy * 6.5, -1.4), (-18.0, sy * 6.1, -0.9)], 0.16, 0.02, WHISKER, n=60, sides=6)
    tube("whisker2", [(7.4, sy * 1.0, -0.4), (6.0, sy * 2.2, -1.6), (3.0, sy * 2.9, -2.9), (-1.0, sy * 3.1, -3.5), (-4.5, sy * 3.0, -3.2)], 0.11, 0.02, WHISKER, n=40, sides=6)


# ---- hair: flat flame-shaped locks (a ribbon tapering to a point, its tip flicking up), for the mane, beard and tufts --------
def lock(name, points, width, part, n=24, flick=0.6, twist=0.0):
    path = catmull(points, n)
    bm = bmesh.new()
    left, right = [], []
    for i, p in enumerate(path):
        t = i / (n - 1)
        tangent = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        # lie the lock's width across the flow, tilting with the twist
        across = tangent.cross(Vector((0, 0, 1)))
        if across.length < 1e-3:
            across = Vector((0, 1, 0))
        across.normalize()
        up = across.cross(tangent).normalized()
        ang = twist * t
        d = across * math.cos(ang) + up * math.sin(ang)
        wd = width * (1 - t) ** 0.75 * (0.6 + 0.4 * math.sin(min(1.0, t * 3) * math.pi * 0.5))
        lift = up * flick * width * t * t
        left.append(bm.verts.new(p + d * wd + lift))
        right.append(bm.verts.new(p - d * wd + lift))
    for i in range(n - 1):
        bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(name, me)
    cum = [0.0]
    for i in range(n - 1):
        cum.append(cum[-1] + (path[i + 1] - path[i]).length)

    def along(v):
        j = min(range(n), key=lambda i: (path[i] - v).length_squared)
        return cum[j] / cum[-1]

    return tag(ob, part, along)


import random
random.seed(7)
# the mane: locks rooted round the back of the skull, behind the cheeks and down the neck, streaming back and out
for i in range(130):
    x0 = 1.4 - (i / 129) * 9.0 + random.uniform(-0.3, 0.3)
    a = math.radians(random.uniform(-40, 220))
    if x0 > -1.2:
        rr = interp(HW, x0) * 0.95
        rz = interp(HH, x0) * 0.95
        zc = interp(HZ, x0)
    else:
        rr = rz = radius(-x0 / L) * 0.95
        zc = 0.0
    root = Vector((x0, math.cos(a) * rr, math.sin(a) * rz + zc))
    out = Vector((0, math.cos(a), math.sin(a)))
    ln = random.uniform(5.0, 9.0) * (1.15 if 20 < math.degrees(a) < 160 else 0.9)
    pts = [root, root + out * 1.0 + Vector((-ln * 0.2, 0, 0)), root + out * 2.0 + Vector((-ln * 0.55, 0, 0.3)), root + out * 2.5 + Vector((-ln, 0, 0.9))]
    lock("mane", pts, random.uniform(0.2, 0.38), HAIR, flick=random.uniform(0.8, 1.8), twist=random.uniform(-1.2, 1.2))
# the tongue
if TONGUE:
    for sy in (-0.25, 0.25):
        r0 = jaw_point(Vector((2.6, 0, -0.75)))
        lock("tongue", [r0, jaw_point(Vector((5.5, 0, -0.85))), jaw_point(Vector((8.2, sy * 0.4, -0.6))), jaw_point(Vector((10.0, sy * 1.6, -1.3))), jaw_point(Vector((11.0, sy * 2.4, -2.6)))], 0.32, TONGUE_ID, flick=-0.6)
# the beard: locks hanging from the chin, flowing back
for i in range(12):
    x = 7.6 - i * 0.42
    sy = (i % 2 * 2 - 1) * (0.2 + 0.08 * i)
    root = jaw_point(Vector((x, sy, -1.2)))
    lock("beard", [root, root + Vector((-1.4, sy * 0.4, -1.3)), root + Vector((-3.2, sy * 0.8, -2.0)), root + Vector((-5.0, sy * 1.0, -1.6))], 0.42, HAIR, flick=0.9)

# the elbow tufts and the tail tuft: flame locks
for elbow, sy in TUFTS:
    for t in range(5):
        off = Vector((0.2, sy * (0.2 + t * 0.22), 0.5 - t * 0.32))
        lock("tuft", [elbow + off, elbow + off + Vector((-2.0, sy * 0.6, 0.5)), elbow + off + Vector((-4.6 - t * 0.5, sy * 1.0, 0.4 - t * 0.2))], 0.5, HAIR, flick=1.2)
for i, ang in enumerate([-1.3, -0.8, -0.35, 0.0, 0.35, 0.8, 1.3]):
    d = Vector((0, math.sin(ang), math.cos(ang)))
    root = Vector((-L * 0.94, 0, 0))
    ln = 9.0 * (1 - 0.25 * abs(ang))
    lock("tail", [root, root + Vector((-ln * 0.3, 0, 0)) + d * 1.6, root + Vector((-ln * 0.7, 0, 0)) + d * 3.0, root + Vector((-ln, 0, 0)) + d * 3.6], 0.9, HAIR, flick=1.0, twist=ang * 0.5)

# ---- join and export ---------------------------------------------------------------------------------------------------------
bpy.ops.object.select_all(action="DESELECT")
for ob in parts:
    ob.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
dragon = bpy.context.active_object
dragon.name = "dragon"
print("dragon vertices", len(dragon.data.vertices), "faces", len(dragon.data.polygons))

if PREVIEW:
    sc = scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "SINGLE"
    sc.display.shading.single_color = (0.7, 0.12, 0.2)
    sc.display.shading.show_cavity = True
    sc.render.resolution_x, sc.render.resolution_y = 1600, 900
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    sc.world = bpy.data.worlds.new("w")
    for name, loc, tgt, lens in [("head", (14, -12, 5), (1, 0, 0.5), 40), ("side", (-45, -95, 18), (-45, 0, 0), 30)]:
        cam.location = loc
        d = Vector(tgt) - Vector(loc)
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = lens
        sc.render.filepath = PREVIEW.replace(".png", f"-{name}.png")
        bpy.ops.render.render(write_still=True)

bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True, export_texcoords=True, export_normals=True, export_materials="NONE")
print("wrote", OUT)
