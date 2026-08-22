# Track Dash sprite credits

All assets below are CC0 (public domain) — no attribution required by license.
Kept here for provenance/record-keeping only, not because it's legally required.

| File | Source | License |
|---|---|---|
| `horse_run.png` | ["Pixel Horse" — OpenGameArt.org](https://opengameart.org/content/pixel-horse) | CC0 |
| `obstacle_hurdle.png` | `fence.png`, Kenney "New Platformer Pack" (kenney.nl) | CC0 |
| `obstacle_haybale.png` | `block_planks.png`, Kenney "New Platformer Pack" (kenney.nl) | CC0 |
| `obstacle_cone.png` | `cone_straight.png`, Kenney "Racing Pack" (kenney.nl) | CC0 |
| `obstacle_ball.png` | `ball_soccer1.png`, Kenney "Sports Pack" (kenney.nl) | CC0 |

Notes:
- `horse_run.png` is the original 5-frame run-cycle strip (82x66/frame, 410x66 total), **re-processed once** after the first ship: despite being an RGBA PNG, every pixel's alpha channel was baked to 255 (fully opaque) — including the background, which was solid white rather than transparent. Confirmed by reading the raw decoded pixel buffer (not just the PNG color-type byte, which reported RGBA and looked fine at a glance). Fixed by chroma-keying pure-white pixels to alpha 0, with a short falloff band for anti-aliased edge pixels, then re-saving losslessly. The horse's own palette (browns + black) never touches white, so no actual art was at risk. Art content itself is unmodified — only the alpha channel changed.
- `obstacle_haybale.png` substitutes a wooden crate for a literal hay bale — no CC0 hay bale sprite was found; colour/shape reads similarly at game scale.
- `obstacle_ball.png` substitutes a soccer ball for a literal beach ball — no CC0 beach ball sprite was found.
- `obstacle_cone.png` is a top-down-perspective cone icon (Kenney's Racing Pack is a top-down racer kit) rather than a side-view sprite — no side-view CC0 traffic cone was found; reads fine as a stylised icon at game scale.
