# Sign-in laptop film

Source of `apps/web/public/sign-in/laptop-*.mp4` and `laptop.webp` (live since PR #1189, 2026-09-10).
The working project is `~/Desktop/nemesis-signin` (HyperFrames 0.8.34). This copy keeps the composition
safe; the 2.5 MB `models/macbook.glb` comes from the HyperFrames registry block `vfx-iphone-device`
(`npx hyperframes@0.8.29 add vfx-iphone-device --dir ...`), and `assets/` holds Inter and the six
round-one gradients from `landing/public/gradients`.

How the screen works: the app is ordinary HTML, projected onto the MacBook's `display` mesh with a
matrix3d computed from the mesh's four corners every frame, and sitting under a transparent WebGL
canvas whose display material writes alpha 0. The bezel and notch draw over it.

Render and cut:

    npx hyperframes@0.8.34 render . -o renders/signin-60.mp4 --fps 60 --quality high --crf 14
    ffmpeg -i renders/signin-60.mp4 -vf "trim=start_frame=0:end_frame=156,setpts=PTS-STARTPTS" -an -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -movflags +faststart laptop-intro.mp4
    ffmpeg -i renders/signin-60.mp4 -vf "trim=start_frame=156:end_frame=876,setpts=PTS-STARTPTS" -an -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -g 120 -movflags +faststart laptop-loop.mp4

The still is frame 156 saved as WebP (quality 86) with Pillow.
