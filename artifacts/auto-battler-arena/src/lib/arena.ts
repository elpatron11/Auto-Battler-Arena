import type { ArenaChallengeTicket, ArenaProfile } from '@workspace/api-client-react';
import type { EconomyAccount } from '@workspace/api-client-react';

export const PROFILE_KEY = 'autoBattlerArenaProfileV1';
export const OWNER_KEY = 'autoBattlerArenaOwnerV1';
export const TICKET_KEY = 'autoBattlerArenaTicketV1';
export const ATTACK_KEY = 'autoBattlerArenaAttackV1';

const ECONOMY_STATE_KEYS = [
  'gold', 'ownedClasses', 'ownedRacials', 'ownedSpells', 'ownedUltimates',
  'unlockedTalents', 'tournamentEntries', 'tournamentWins', 'tournamentHistory', 'ownedSkins',
];

export function stripEconomyState(state: Record<string, unknown>): Record<string, unknown> {
  const safeState = { ...state };
  ECONOMY_STATE_KEYS.forEach(key => { delete safeState[key]; });
  return safeState;
}

export function economyProfileSnapshot(account: EconomyAccount): Record<string, unknown> {
  const unlocks = account.unlocks || [];
  const unlockedTalents: Record<string, string[]> = {};
  unlocks.filter(item => item.kind === 'talent').forEach(({ itemId }) => {
    const separator = itemId.indexOf(':');
    if (separator < 1 || separator === itemId.length - 1) return;
    const classId = itemId.slice(0, separator);
    const talentId = itemId.slice(separator + 1);
    (unlockedTalents[classId] ||= []).push(talentId);
  });
  return {
    gold: account.gold,
    ownedClasses: unlocks.filter(item => item.kind === 'class').map(item => item.itemId),
    ownedRacials: unlocks.filter(item => item.kind === 'racial').map(item => item.itemId),
    ownedSpells: unlocks.filter(item => item.kind === 'spell').map(item => item.itemId),
    ownedUltimates: unlocks.filter(item => item.kind === 'ultimate').map(item => item.itemId),
    ownedSkins: unlocks.filter(item => item.kind === 'skin').map(item => item.itemId),
    unlockedTalents,
    talentUnlockMigrationV1: true,
  };
}

export function clearLocalGame() {
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(OWNER_KEY);
  sessionStorage.removeItem(TICKET_KEY);
  sessionStorage.removeItem(ATTACK_KEY);
}

export function seedGame(profile: ArenaProfile, economy?: EconomyAccount) {
  const previous = localStorage.getItem(OWNER_KEY);
  if (previous && previous !== profile.playerId) clearLocalGame();
  const state = profile.state && typeof profile.state === 'object' && !Array.isArray(profile.state) ? profile.state : {};
  const safeState = stripEconomyState(state);
  const snapshot = economy && !economy.onboardingRequired ? economyProfileSnapshot(economy) : {};
  const tournament = {
    tournamentEntries: state.tournamentEntries,
    tournamentWins: state.tournamentWins,
    tournamentHistory: state.tournamentHistory,
  };
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...safeState, ...snapshot, ...tournament, name: profile.name, rating: profile.rating }));
  localStorage.setItem(OWNER_KEY, profile.playerId);
}

export function readGameState(): Record<string, unknown> | null {
  try {
    const value = localStorage.getItem(PROFILE_KEY);
    const parsed: unknown = value ? JSON.parse(value) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

export function saveTicket(ticket: ArenaChallengeTicket) {
  sessionStorage.setItem(TICKET_KEY, JSON.stringify(ticket));
}

export function readTicket(): ArenaChallengeTicket | null {
  try { return JSON.parse(sessionStorage.getItem(TICKET_KEY) || 'null') as ArenaChallengeTicket | null; }
  catch { return null; }
}

export function readAttack(): Record<string, unknown> | null {
  try {
    const cached: unknown = JSON.parse(sessionStorage.getItem(ATTACK_KEY) || 'null');
    if (cached && typeof cached === 'object' && !Array.isArray(cached)) return cached as Record<string, unknown>;
  } catch { /* use saved defense */ }
  const state = readGameState();
  const defense = state?.defenseTeam;
  return defense && typeof defense === 'object' && !Array.isArray(defense) ? defense as Record<string, unknown> : null;
}