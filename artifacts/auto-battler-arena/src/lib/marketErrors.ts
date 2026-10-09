const fallback = 'The trade could not be completed. Try again.';
const uncertain = 'We could not confirm the trade. Check your Gold and inventory before trying again.';

/** Never display an infrastructure HTML response as a trading error or assume it proves rollback. */
export function marketErrorText(error: unknown): string {
  if (!error || typeof error !== 'object') return fallback;
  const e = error as { status?: number; data?: { error?: unknown; message?: unknown }; message?: unknown };
  const message = [e.data?.error, e.data?.message, e.message]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  if ((typeof e.status === 'number' && e.status >= 500) ||
    /^HTTP\s+5\d\d\b/i.test(message ?? '') ||
    /<!doctype\s+html|<(?:html|head|body|script)(?:\s|>)/i.test(message ?? '')) return uncertain;
  return message || fallback;
}