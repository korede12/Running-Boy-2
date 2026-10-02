# Fight sheet

18 frames of a fight sequence, 256x256 cells, 6 columns, transparent.

`fight_sheet.png`   the sheet
`fight_frames.json` cell offsets and the running order
`frames/`           the same frames as single files

Frames alternate keyframe, in-between, keyframe, in-between, so the sheet
plays as one sequence at about 14fps. Every frame stands on the same
baseline rather than being centred in its own box — a bounding box follows
the pose, so centring each one makes the fighter bob.

## Where it came from

`source/page_photo.png`    the nine poses as drawn, photographed on a desk
`source/traced_poses.png`  those nine lifted off the paper

The page was shot at an angle under uneven light, so the biro was separated
from it by dividing the photo by a blurred copy of itself: paper and desk
both normalise to about one, and only marks darker than their own
surroundings survive. The ruled grid and the pencilled frame numbers were
removed, and the nine poses were then restyled in a single generation — all
nine in one image, so the character could not drift between frames. A second
generation added the nine in-betweens.

`../../tools/fight-ink.js`     the ink separation
`../../tools/fight-trace.js`   the nine poses off the page
`../../tools/fight-compose.js` cutting the generated sheets into frames
