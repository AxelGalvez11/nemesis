# Landing showcase clips (HyperFrames)

Source for the two product clips on the landing variations (`landing/public/showcase/`). These are
copies; the live project is `~/Desktop/nemesis-reel`, where the compositions sit at the root and the
kit in `showcase/` (with `showcase/fonts/inter-opsz.woff2`, the Inter variable font from
`@fontsource-variable/inter`, not committed here).

| clip | composition | size | what happens |
|---|---|---|---|
| together | `showcase-together.html` | 1860x1200, 13 s | a student asks for a deck; Claude reads Lecture 6 and deals the cards; the student turns one over and grades it; Claude writes one more; Nemesis adds the card they missed |
| board | `showcase-board.html` | 1920x1200, 13 s | Claude carries a deck onto the canvas, ChatGPT brings slides, the student asks in a note, Nemesis answers from slide 18, a study guide appears; every piece links back to the lecture |

Render and ship:

```bash
cd ~/Desktop/nemesis-reel
npx --yes hyperframes@0.8.29 render . -c showcase-together.html -o renders/showcase/together.mp4 --quality high --fps 30 --crf 20
ffmpeg -i renders/showcase/together.mp4 -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart -an landing/public/showcase/together.mp4
```

Both clips loop: their last second returns every element to the first frame. The cards fall on Sana's
measured polaroid curve, `cubic-bezier(0.327, 0.023, 0.988, 0.015)` over 0.7 s.
