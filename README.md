# A Paper Ocean

A fullscreen WebGL story about a future where human attention is bought and sold. A fictional newspaper folds into a tethered paper boat.

## Run locally

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. Move the pointer to shift the viewpoint. Use **Turn newspaper** to see either side. Click the paper or focus it and press Enter to lift it from the desk. The camera pulls back as the printed sheet folds and drops into the water. Choose **Look beneath** to follow the chain to the anchor, then **Let go** to watch the boat draw the chain tight and snap the bow link. The camera follows the boat through larger swells as it leaves a foamy wake. The controls also accept Tab followed by Enter or Space. Choose **Find out** to release the loose sheet. Gusts can turn it over as it rides the updraft. Choose **Fold into a plane** to fly toward the sunset. A snap cuts the flight to black. After a pause, television static fills the screen. The camera pulls back from the picture tube, revealing a television drifting in space. Choose **End it** to send the set into the black hole. After the set disappears, the camera banks around the accretion disk, rolls into the black hole, and holds on darkness. A paper crane flies into view, banks and glides between changing destinations, and rustles with each wingbeat. Choose **Kill it** to crumple the crane and follow it beneath the surface. The paper settles beside the broken anchor chain, and the underwater frame becomes the photograph on the final edition. The final heartbeat uses the UTC time when the ending finished.

The scene requires WebGL 2. The folding sequence follows the supplied recording through alternate triangle and diamond shapes. The rectangular-sheet construction also uses the [NRICH folding guide](https://nrich.maths.org/making-maths-boat-folding). It honors the system's reduced-motion setting and pauses its clock while the tab is hidden. To type-check and build the production version, run `npm run build`.

## Facts on screen

The drift titles quote published figures. The IEA’s [Energy and AI](https://www.iea.org/reports/energy-and-ai) report puts data centre electricity use at about 415 TWh in 2024, roughly 1.5% of global electricity, and projects about 945 TWh by 2030 — close to Japan’s current consumption. Google’s August 2025 [measurement of Gemini prompts](https://arxiv.org/abs/2508.15734) gives a median text prompt 0.24 Wh, about the energy of nine seconds of television. Imperva’s [2025 Bad Bot Report](https://www.imperva.com/resources/reports/2025-Bad-Bot-Report.pdf) found automated traffic at 51% of all web traffic in 2024. The adult human brain draws roughly 20 W. The crane’s thousand-wish line refers to the Japanese [senbazuru](https://en.wikipedia.org/wiki/One_thousand_origami_cranes) tradition.

The TV sequence refers to the event horizon, the boundary beyond which electromagnetic signals, including radio waves and visible light, cannot escape. [NASA Science on event horizons](https://science.nasa.gov/universe/black-holes/anatomy/)

## Scene assets

The [CRT TV by Timothy Ahene](https://sketchfab.com/3d-models/crt-tv-9ba4baa106e64319a0b540cf0af5aa9e) is bundled as a GLB under the [Sketchfab Standard License](https://sketchfab.com/licenses). Its screen receives a live render of the plane and ocean at up to 24 frames per second. The black-hole shader adapts Jonás Javier Encarnación’s method for bending rays around a Schwarzschild black hole and shading a rotating accretion disk. It caches the ray paths and samples a sparse star field with distant galaxies drawn from the supplied reference. [Black Hole Shader in Three.js](https://jonasjavier.dev/en/blog/black-hole-three-js-shader-tutorial#the-full-file)


Clicking the newspaper also starts the looping surf. The boat’s first contact with the water triggers a separate splash, and the storm ambience rolls in as the newspaper folds beneath the low clouds. All recordings are bundled locally. [Ocean Waves by AudiovisuaisEU](https://pixabay.com/sound-effects/nature-ocean-waves-250310/) · [Water Splash 02 by Universfield](https://pixabay.com/sound-effects/nature-water-splash-02-352021/) · [Dry Thunder by DRAGON-STUDIO](https://pixabay.com/sound-effects/nature-dry-thunder-364468)

The boat fold and the plane’s five folding motions use trimmed excerpts from FunWithSound’s paper recording. The boat opening uses the same recording in reverse. [Paper Fold on Pixabay](https://pixabay.com/sound-effects/household-paper-fold-31416/)

The opening displays The Daily Chronicle on a photographed-style walnut desk generated with ImageGen. The lamplight and the lifting sheet’s shadow are rendered live. The Daily Chronicle front page stays on the front of the sheet, and The Last Offline District is printed on the back. Both page textures have the same aspect ratio as the unfolded paper. The boat, anchor, individual links, swells, reflections, and moving caustics are rendered live. The dolphin exhales, quick inhales, and flight wind are synthesized with Web Audio and timed to the visible breaths and moving air. The small-wave slope texture in `src/assets/capillary-waves.webp` is procedural.

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

The jellyfish use a transparent 64-frame swim cycle rendered from the original Aurelia bell, oral arms, tentacles, materials, and GPU simulation in the Aurelia project. Four specimens share the animation at different phases and depths in the ocean’s WebGL scene. [Portfolio Space Jellyfish](https://github.com/niklasxi/portfolio-space-jellyfish) · [Aurelia license](public/aurelia-license.txt)

The distant pod uses ART & MODELING’s textured dolphin with a runtime tail stroke and wave-relative breach animation. [Dolphin- Low Poly by Fadly.W](https://sketchfab.com/3d-models/dolphin-low-poly-86936ff1e8fc428aab6a0b787ae14c16) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

## License

Copyright © 2026 Niklas (niklasxi). All rights reserved in the original work. The dolphin model and other third-party materials carry their own terms. [License and credits](LICENSE)
