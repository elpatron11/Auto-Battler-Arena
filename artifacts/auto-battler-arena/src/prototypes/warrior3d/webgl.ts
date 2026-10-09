/** Returns a human readable error when WebGL cannot be created, otherwise null. */
export function detectWebGL(): string | null {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return 'This preview needs WebGL 2, which is disabled or unavailable on this browser or device.';
    // Release the probe instead of retaining a second graphics context on iOS.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return null;
  } catch (e) {
    return 'WebGL failed to initialise: ' + (e instanceof Error ? e.message : String(e));
  }
}

export const DPR_CAP = 1.25;
export function cappedDpr(): number {
  return Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, DPR_CAP);
}
