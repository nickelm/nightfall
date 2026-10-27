// TEAM ART & SOUND (shared): mostly empty. Art is client-only, except the team map.
import { registerEntityType, registerKeyHint } from '../../shared/registry.js';

// Holds the team's explored-tiles map between server restarts (in its private
// `_seen` field, which is saved but never sent). It sits off the map, so nobody
// sees or bumps into it. See team-map-server.js.
registerEntityType('team-map', {});

registerKeyHint('M', 'minimap');
