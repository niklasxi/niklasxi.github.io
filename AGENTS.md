# AwesomeSite

When asked to build this project, implement the experience below in `/Users/niklas/Desktop/Dev/AwesomeSite`, run it locally, and verify the full sequence in a browser.

## Concept

Create a cinematic, fullscreen interactive website about how small we are in the universe. Begin with a vast star field. Pull back to reveal it on a single sheet of paper. Fold that sheet into a tiny boat and eventually let the boat drift into an ocean that seems to go on forever. Convey the theme through scale and perspective. Keep the mood quiet, humbling, and full of wonder.

## Numbered references

Paths are relative to the project root. The original image numbers are preserved. The playback order is **04 → 01 → 02 → 03**.

| Image | File | Role |
| --- | --- | --- |
| 01 | `references/01-anchored-surface.png` | Low surface view, sunset lighting, and the tethered paper boat |
| 02 | `references/02-anchor-reveal.png` | Split-level view of the boat, chain, and anchor |
| 03 | `references/03-open-ocean.png` | Golden light and open-water framing for the release |
| 04 | `references/04-space.png` | The opening star field and the print on the folding sheet |

Use 01–03 as visual references for the live scene. Omit their captions and corner numbers. Use 04 as the actual opening image and paper texture.

## Scene and interaction

1. **On load — space folds into a boat (04 → 01).** Open with the space image filling the viewport. Hold briefly, then automatically pull back to reveal that it is printed on a rectangular sheet. Fold the sheet along visible creases into a recognizable origami boat. Keep parts of the star print visible on the folded panels so viewers can follow the same sheet through the transformation. Reveal the ocean during the fold and settle the boat onto the water.
2. **Anchored surface view (01).** Frame the boat to the right from a low angle over a vast, dark teal ocean. A low sun throws gold reflections across the moving waves. The boat rises, pitches, and rolls with the local swell while a visible chain dips into the water and limits its drift. Once the intro settles, show a single subtle button labeled **Look beneath**.
3. **First click or tap — reveal the anchor (02).** Ease the camera down to a split-level view. Keep the same boat and sunset visible above the moving waterline. Below it, reveal the chain running continuously from the boat to an anchor fixed to the seabed. Use turquoise haze and moving light patterns on the sand to give the underwater scene depth. Once the reveal settles, change the button to **Let go**.
4. **Second click or tap — break the chain and release the boat (03).** Show a link snapping visibly at the boat's attachment point. Let the freed end recoil and sink toward the anchor. Release the boat's horizontal constraint at the moment the link breaks. Return the camera above water and follow the same boat briefly as the current carries it away. Pull back until it reads as a tiny speck against the open ocean. Leave the water and free drift moving in the final state.

## Implementation and verification

- Use the existing app stack if present. Otherwise, use Vite, TypeScript, and Three.js.
- Render one continuous scene with a consistent boat, water, chain, anchor, and sun across transitions. Use the same wave field for the surface and the boat's buoyancy. Give the paper creases and a warm off-white reverse side.
- Support touch, mouse, and keyboard activation. Guard each transition against repeated input so a double click cannot skip the anchor reveal. Keep the boat, chain, and anchor readable in portrait framing. Honor reduced-motion preferences with shorter transitions and minimal camera travel while preserving both actions.
- Verify locally that the intro plays without input, the first action reveals the tethered anchor, and the second visibly snaps the link before the boat drifts away. Check desktop and mobile framing. Report the local run command and any behavior you could not verify.
