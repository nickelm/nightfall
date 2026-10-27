// Global constants shared by server and client. Owned by: Integration.

export const WORLD_W = 480;        // three 160-tile regions across
export const WORLD_H = 480;        // three 160-tile regions down
export const TILE_PX = 40;         // on-screen size of one tile in pixels
export const TICK_HZ = 20;         // server simulation and snapshot rate
export const DAY_LENGTH = 480;     // default seconds per day/night cycle (night = 25%); override with DAY_LENGTH env

// Fields on an entity whose names start with this prefix stay on the side
// that created them: the server never sends them, and the client never
// receives them. Use them for AI state, cooldowns, interpolation, etc.
export const PRIVATE_PREFIX = '_';
