import { installGameBody3D } from './src/prototypes/roster3d/gameIntegration';

installGameBody3D(window);
window.addEventListener('pageshow', event => {
  if (event.persisted) installGameBody3D(window);
});