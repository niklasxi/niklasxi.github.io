# A Paper Ocean

A fullscreen WebGL experience in which Niklas’s portfolio folds into a tethered paper boat.

## Run locally

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. Move the pointer to shift the viewpoint. Scroll or read the portfolio, then click anywhere or activate a link with Enter. The camera pulls back from the page and the printed sheet folds and drops into the water. Choose **Look beneath** to follow the chain to the anchor, then **Let go** to watch the boat draw the chain tight and snap the bow link. The camera follows the boat through larger swells as it leaves a foamy wake. Both buttons also accept Tab followed by Enter or Space. Reload to replay.

The scene requires WebGL 2. The folding sequence follows the supplied recording through alternate triangle and diamond shapes. The rectangular-sheet construction also uses the [NRICH folding guide](https://nrich.maths.org/making-maths-boat-folding). It honors the system's reduced-motion setting and pauses its clock while the tab is hidden. To type-check and build the production version, run `npm run build`.

## Scene assets

The first portfolio click starts the looping surf. The boat’s first contact with the water triggers a separate splash. Both recordings are bundled locally. [Ocean Waves by AudiovisuaisEU](https://pixabay.com/sound-effects/nature-ocean-waves-250310/) · [Water Splash 02 by Universfield](https://pixabay.com/sound-effects/nature-water-splash-02-352021/)

The folding animation uses eight trimmed and accelerated excerpts from FunWithSound’s paper recording. Each excerpt follows a crease in the animation. [Paper Fold on Pixabay](https://pixabay.com/sound-effects/household-paper-fold-31416/)

The opening is a live HTML portfolio. At activation its measured layout is painted onto a local canvas texture shared by every folded panel. The boat, anchor, individual links, swells, reflections, and moving caustics are rendered live. The small-wave slope texture in `src/assets/capillary-waves.webp` is procedural.

The two environmental textures below were created with the built-in ImageGen tool. The sky was cropped to the horizon and color graded. The seabed was downsampled for local playback.

<details>
<summary>Sky generation prompt · <code>src/assets/sunset-sky.webp</code></summary>

Ultra-wide landscape photographic environment texture for a cinematic paper boat experience. A quiet maritime sunset sky seen from open water. Frame entirely SKy with the absolutely flat ocean horizon at 95% of the image height, only a tiny sliver of ocean along bottom edge. A small brilliant ivory sun centered horizontally at 38% of the frame width, low in the sky, just 6% of the frame height above the horizon. A wash of apricot gold and honey colored mist on the horizon; layered, windswept slate blue and mauve-grey stratocumulus overhead, delicate peach edge lighting, some clean openings, subtle blue hour atmosphere, faint distant cloud banks immediately above the horizon. Moody but luminous, majestic depth, natural long tonal gradations, understated fine 35mm film still, exquisitely detailed clouds. Wide angle, 3:1 landscape panorama composed for the top half of a wide cinematic ocean scene. No land, boats, objects, frame, text, graphic elements, people or birds.

</details>

<details>
<summary>Seabed generation prompt · <code>src/assets/seabed.webp</code></summary>

Seamless photorealistic top-down square albedo texture of an actual shallow coastal seabed, looking straight down at submerged pale greige sand, fine shell grit and mineral flecks, small clusters of rounded grey, olive and slate pebbles partly buried, patchy sand ripples, a few darker sparse tiny pieces of old dark seaweed and shell fragments. Coverage 4 meters by 4 meters. Fine varied natural detail at multiple scales, approximately 80 percent sand, 20 percent little shell and pebble patches. Physical diffuse material scan, intricate realistic natural erosion, subtle warm ivory color variations, softly lit without directional light or shadows, no blue water tint, no caustic effects, no transparency, no horizon, no text, no border, no loose giant objects, tileable edges. Production texture for a physically rendered underwater ocean floor.

</details>

The chain’s tension, snap, and recoil use edited excerpts of nettimato’s recording. [Chain on Pixabay](https://pixabay.com/sound-effects/film-special-effects-chain-6073/)

The jellyfish use a transparent 64-frame swim cycle rendered from the original Aurelia bell, oral arms, tentacles, materials, and GPU simulation in Niklas’s portfolio. Four specimens share the animation at different phases and depths in the ocean’s WebGL scene. [Portfolio Space Jellyfish](https://github.com/niklasxi/portfolio-space-jellyfish) · [Aurelia license](public/aurelia-license.txt)

The distant pod uses ART & MODELING’s textured dolphin with a runtime tail stroke and wave-relative breach animation. [Dolphin- Low Poly by Fadly.W](https://sketchfab.com/3d-models/dolphin-low-poly-86936ff1e8fc428aab6a0b787ae14c16) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

## License

Copyright © 2026 Niklas (niklasxi). All rights reserved in the original work. The dolphin model and other third-party materials carry their own terms. [License and credits](LICENSE)
