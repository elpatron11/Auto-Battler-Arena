// Read-only graphics access to lexical game state, independent of practice
// flags. No combat, profile or reward mutation callbacks.
window.GameBody3DSource = Object.freeze({
  entitiesForRendering: () => state ? state.entities : [],
  paused: () => !!(state && state.paused),
  totemsForRendering: () => state ? state.totems || [] : []
});