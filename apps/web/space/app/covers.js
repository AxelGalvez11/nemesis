// Page covers Nemesis draws itself: flat colours and soft gradients, no image files to host or license.
// [value, label, vertical position]. A `css:` value is painted as a background; anything else is an image URL
// (an upload in the ws-files bucket, or a link someone pasted).
export const COVER_GALLERY = [
  ['Colours', [
    ['css:#E9E5E3', 'Stone', '50% 50%'], ['css:#EEDFD7', 'Clay', '50% 50%'], ['css:#F9DEC9', 'Apricot', '50% 50%'],
    ['css:#FBEDC7', 'Butter', '50% 50%'], ['css:#DCEBDD', 'Sage', '50% 50%'], ['css:#D4E6F1', 'Sky', '50% 50%'],
    ['css:#E6DFF0', 'Lilac', '50% 50%'], ['css:#F4DFEA', 'Rose', '50% 50%'], ['css:#FBE0DC', 'Coral', '50% 50%'],
    ['css:#2F3437', 'Graphite', '50% 50%'], ['css:#264653', 'Deep teal', '50% 50%'], ['css:#3D2C5B', 'Plum', '50% 50%'],
  ]],
  ['Gradients', [
    ['css:linear-gradient(120deg,#fbe3c9 0%,#f6b8a0 100%)', 'Sunrise', '50% 50%'],
    ['css:linear-gradient(120deg,#d7f0e4 0%,#a8d5e2 100%)', 'Shallows', '50% 50%'],
    ['css:linear-gradient(120deg,#e3dcf7 0%,#bcd0f5 100%)', 'Morning', '50% 50%'],
    ['css:linear-gradient(120deg,#fdf1c7 0%,#c7e8c2 100%)', 'Meadow', '50% 50%'],
    ['css:linear-gradient(120deg,#f7d6e0 0%,#f2b5c9 100%)', 'Blossom', '50% 50%'],
    ['css:linear-gradient(120deg,#cfd9df 0%,#e2ebf0 100%)', 'Mist', '50% 50%'],
    ['css:linear-gradient(135deg,#1f2a44 0%,#3a506b 100%)', 'Night', '50% 50%'],
    ['css:linear-gradient(135deg,#43302b 0%,#8a5a44 100%)', 'Walnut', '50% 50%'],
  ]],
];
