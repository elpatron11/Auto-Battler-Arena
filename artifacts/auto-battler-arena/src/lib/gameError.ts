/** Only approved, player-facing copy may cross into the game iframe or its notices. */
export function gameErrorMessage(error: unknown, action: 'tournament-entry' | 'tournament-finish' | 'local-reward' | 'unlock' | 'challenge' | 'replay' | 'store'): string {
  const response = error && typeof error === 'object'
    ? error as { status?: unknown; data?: { error?: unknown } } : {};
  const status = response.status;
  const reason = response.data?.error;

  if (action === 'tournament-entry') {
    if (status === 429) return 'Tournament limit reached — try again later.';
    if (status === 409 && reason === 'Insufficient Gold for tournament entry.') return 'Not enough Gold to enter this tournament.';
    if (status === 400 || status === 403) return 'Check your 3v3 squad and try again.';
    if (status === 428) return 'Finish setting up your account before entering.';
  }
  if (action === 'challenge' && status === 429) return 'Challenge limit reached for this opponent — try again tomorrow.';
  if (status === 401) return 'Sign in again to continue.';
  if (status === 429) return 'Please wait a moment before trying again.';
  switch (action) {
    case 'tournament-entry': return 'Could not enter the tournament. Try again.';
    case 'tournament-finish': return 'Tournament result not confirmed yet. Try again.';
    case 'local-reward': return 'Gold could not be confirmed yet.';
    case 'unlock':
      if (status === 409 && reason === 'Insufficient Gold.') return 'Not enough Gold to unlock this.';
      if (status === 409 && (reason === 'Class already unlocked.' || reason === 'Racial already unlocked.')) return 'Already unlocked.';
      return 'Could not unlock this yet. Try again.';
    case 'challenge': return 'Could not start this challenge. Try again.';
    case 'replay': return 'Could not update this replay. Try again.';
    case 'store':
      if (status === 410) return 'This weekly pass has ended. Refresh the Store to see the current pass.';
      if (status === 409) return 'This offer or milestone is unavailable. Refresh the Store and check your pass progress.';
      if (status === 403) return 'This Store action is unavailable here. Refresh the Store and try again.';
      if (status === 503) return 'Stripe checkout is temporarily unavailable. Please try again shortly.';
      return 'The Store could not confirm this action. Try again.';
  }
}