# Exporting Z-Anatomy's body systems out of Blender, one glTF per system.
#
# Usage (see scripts/anatomy-harvest.mts, which calls this):
#   blender --background Startup.blend --python anatomy-export-systems.py -- <out-dir>
#
# 🔴 THIS IS THE ONLY STEP THAT NEEDS BLENDER, AND IT RUNS ONCE PER HARVEST, NEVER AT BUILD TIME.
# Z-Anatomy ships as a single 306 MB .blend — the whole body, every system, in one file — and the
# only faithful way out of that format is Blender's own glTF exporter. Its OUTPUT is committed;
# nobody needs Blender to build or run Nemesis.
#
# 🔴 THE SYSTEM COLLECTIONS ARE THE ATLAS'S OWN, AND SO ARE THE OBJECT NAMES. Z-Anatomy organises
# the body into numbered top-level collections ("8: Visceral systems") and names every object in
# anatomical terms ("Left lung.j", "Deltoid muscle.j"). Both travel through untouched: the
# collections become one file each, the object names become the glTF node names, and
# `anatomy-harvest.mts` reads those names into the registry. Nothing here invents a vocabulary.
#
# 🔴 EVERYTHING IS MADE VISIBLE FIRST, AND THAT IS NOT COSMETIC. The file opens with most layers
# hidden and several collections excluded from the view layer — which is how a study app should
# open, and how an export silently produces an empty file. Every collection is re-enabled before
# anything is selected.

import sys
import bpy

OUT_DIR = sys.argv[sys.argv.index("--") + 1]

# The systems worth their own file, by the atlas's own collection names. The skeleton is
# deliberately absent: the harvested university model already serves it, retopologised and smaller.
SYSTEMS = [
    ("3: Joints", "joints"),
    ("4: Muscular system", "muscular-system"),
    ("5: Cardiovascular system", "cardiovascular-system"),
    ("6: Lymphoid organs", "lymphoid-organs"),
    ("7: Nervous system & Sense organs", "nervous-system"),
    ("8: Visceral systems", "visceral-systems"),
]


def reveal_everything() -> None:
    """Undo the study app's default hiding, so a selection can actually be exported."""

    def walk(layer_collection) -> None:
        layer_collection.exclude = False
        layer_collection.hide_viewport = False
        for child in layer_collection.children:
            walk(child)

    walk(bpy.context.view_layer.layer_collection)
    for collection in bpy.data.collections:
        collection.hide_viewport = False
        collection.hide_render = False
    for obj in bpy.data.objects:
        obj.hide_viewport = False
        obj.hide_select = False
        try:
            obj.hide_set(False)
        except RuntimeError:
            # An object outside the view layer cannot be un-hidden and does not need to be.
            pass


def export(collection_name: str, slug: str) -> None:
    collection = bpy.data.collections.get(collection_name)
    if collection is None:
        print(f"MISSING COLLECTION {collection_name}", flush=True)
        return

    bpy.ops.object.select_all(action="DESELECT")
    meshes = [obj for obj in collection.all_objects if obj.type == "MESH"]
    for obj in meshes:
        obj.select_set(True)
    if not meshes:
        print(f"EMPTY {collection_name}", flush=True)
        return
    bpy.context.view_layer.objects.active = meshes[0]

    path = f"{OUT_DIR}/{slug}.glb"
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        # 🔴 NO MATERIALS AND NO IMAGES LEAVE THIS FILE. `anatomy-harvest.mts` strips them anyway
        # for the licence reason recorded there; refusing to write them is faster and makes the
        # licence act true at the earliest possible point.
        export_materials="NONE",
        export_image_format="NONE",
        # Modifiers applied, so what ships is the geometry the atlas actually shows.
        export_apply=True,
        export_yup=True,
        # Compression is left to the harvest's own pipeline, so every region — downloaded or
        # exported — passes through exactly one optimiser.
        export_draco_mesh_compression_enable=False,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
    )
    print(f"EXPORTED {slug} meshes={len(meshes)}", flush=True)


reveal_everything()
for collection_name, slug in SYSTEMS:
    export(collection_name, slug)
print("DONE", flush=True)
