import { createRoot } from 'react-dom/client';
import { RosterPreviewApp } from './RosterPreviewApp';
import './rosterPreview.css';

// No StrictMode: model resources are built and disposed in effects, and the
// single WebGL context should not be double-mounted in this preview.
createRoot(document.getElementById('root')!).render(<RosterPreviewApp />);
