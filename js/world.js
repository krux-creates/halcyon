// The lattice Kraken Port is laid on. It repeats without end: channels run north–south every CH metres, cross
// canals run east–west every CR metres, and south of the shore lies the open sea. The home district (the Grand
// Channel, x = 0) is hand-placed; every other block of the lattice is grown from its own seed as you reach it.
export const WORLD = {
  CH: 1100, // channel spacing (x)
  CHW: 38, // channel half-width
  CR: 480, // cross canal spacing (z)
  CRW: 22, // cross canal half-width
  Z0: 240, // a cross canal crosses the Grand Channel here
  SHORE: 700, // the city's southern shore: the open sea lies south of it
};

/** The centre z of cross canal j (j = 0 at Z0, increasing northwards). */
export const crossZ = (j) => WORLD.Z0 - j * WORLD.CR;
/** Which channel column a world x falls in. */
export const columnOf = (x) => Math.round(x / WORLD.CH);
/** Which cross-canal span a world z falls in: span j lies between crossZ(j) and crossZ(j + 1). */
export const spanOf = (z) => Math.floor((WORLD.Z0 - z) / WORLD.CR);
