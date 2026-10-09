export const DEFAULT_PAGE_SIZE = 5;
export function pageCount(total: number, size = DEFAULT_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, size)));
}
export function clampPage(page: number, total: number, size = DEFAULT_PAGE_SIZE): number {
  const last = pageCount(total, size);
  return Number.isFinite(page) ? Math.min(last, Math.max(1, Math.floor(page))) : 1;
}
export function paginate<T>(items: readonly T[], page: number, size = DEFAULT_PAGE_SIZE) {
  const current = clampPage(page, items.length, size);
  const start = (current - 1) * size;
  return { page: current, pages: pageCount(items.length, size), start, total: items.length, items: items.slice(start, start + size) };
}
