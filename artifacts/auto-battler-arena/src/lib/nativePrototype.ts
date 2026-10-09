/** Presentation-only detection; native Android also blocks checkout requests. */
export function isAndroidPrototype(userAgent = navigator.userAgent): boolean {
  return userAgent.includes('FantasyWorldArenasAndroidPrototype/');
}
