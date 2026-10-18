# HALCYON · Kraken Port

Day 2 of a 7-day build challenge. A fictional shuttle line's home page that is also the place it flies to: Kraken Port,
a Japanese cyberpunk city under Titan's haze, flown the way Rive City's cars fly: hovering over neon avenues, a sky lane
above, day or night, with the wind carrying dust and sparks through the air. Built live in the browser with Three.js
(WebGPU, TSL shaders).
The design language was extracted from the Rive City site with `skillui`; the product, world and art are new.

**Open it, then:** press **Board HL-07** (or Enter) to dive through the great torii and fly the avenues.

- **Fly:** W A S D (touch: the stick), **E** / **Q** up and down (touch: UP / DN), **F** the sky lane, **P** autopilot,
  **C** camera (chase, cockpit, showroom), **N** or the DAY | NIGHT switch, drag to look, click a screen to open it,
  **U** cycles the three HUD styles.
- **Chapters** in the top bar fly you to Kraken Vision, the Crab, the Tenryū pagoda (its dragon flies round it) and
  Mugen Ward, where the city carries on without end. On the way a driving game's GPS shows the route: the path laid out
  ahead, a turn-by-turn chip under the bar, and a marker on the landmark; the shuttle pulls up facing it.
- **Sound:** the button by the clock plays *I Really Want to Stay at Your House* (Rosa Walton) through Spotify's own
  player, audio only (signed in to Spotify you hear the whole track; otherwise Spotify plays its 30-second preview).
  Your own copy can go in `assets/audio/` instead (see the README there).

Built with Three.js r170 (WebGPU), Blender 4.4 (the dragon and the crab, scripts in `tools/`), and AI-generated key art
for the billboards. No build step: serve the folder.
