# Render a quick look at a GLB: workbench, studio light, a three-quarter view from above.
#   Blender -b -P preview.py -- in.glb out.png
import bpy, sys, math
from mathutils import Vector
args = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=args[0])
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"
sc.display.shading.light = "STUDIO"
sc.display.shading.color_type = "SINGLE"
sc.display.shading.single_color = (0.75, 0.08, 0.06)
sc.display.shading.show_cavity = True
sc.render.resolution_x, sc.render.resolution_y = 1200, 800
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam
# glTF import is Y-up converted back to Z-up: look down at the back of the crab, a little from the front
cam.location = (0, -8, 40)
target = Vector((0, 0, 0))
d = target - cam.location
cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
cam.data.lens = 32
sc.world = bpy.data.worlds.new("w")
sc.render.filepath = args[1]
bpy.ops.render.render(write_still=True)
