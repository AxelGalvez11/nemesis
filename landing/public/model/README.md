# heart.glb

Source        NIH 3D, entry 3DPX-022787, "Human Heart 3d Model"
              https://3d.nih.gov/entries/3DPX-022787
Author        Sourav Pan, published 2025-07-11
Licence       Public Domain (CC0 1.0). No attribution required, commercial use
              permitted. Verified against the NIH 3D entry API, which reports
              "license":"Public Domain", before the file was bundled.

Bundled locally on purpose. Hotlinking a third-party host would put a page the
product is judged by behind someone else's uptime and CORS policy.

## What was changed

The source is 3.99 MB: 149,992 triangles and three baked JPEG albedo maps. That
is a print-exchange asset, not a web asset, and it would have been the single
heaviest thing on the site by a wide margin.

  weld + simplify to 18%        149,992 -> 26,995 triangles
  drop all 3 textures, and UVs  the page is monochrome and the scene shades the
                                mesh itself, so the maps were pure weight
  prune + quantize              KHR_mesh_quantization, which three.js reads natively

  3.99 MB -> 313 KB, 193 KB gzipped. A 92% reduction.

## Two properties the scene has to work around

The source carries POSITION only, with NO NORMAL attribute, so the mesh renders
black until computeVertexNormals() runs. That is done at load.

It is ONE fused mesh, one node, one primitive. There are no separable
structures, so "dim the irrelevant anatomy" cannot be done by hiding a named
sub-mesh. The scene emphasises a region spatially in the shader instead. The
node names are Tripo-prefixed, so this is a generatively authored model rather
than a segmented medical atlas.
