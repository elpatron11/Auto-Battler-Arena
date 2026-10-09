import { useCallback, useEffect, useRef, useState } from 'react';
import { VisualPreviewControls } from '../components/VisualPreviewControls';
import { useAuth, useClerk } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Swords } from 'lucide-react';
import { useLocation } from 'wouter';
import { finishArenaRecording, getArenaChallenge, getGetArenaLeaderboardQueryKey, getGetArenaProfileQueryKey, getGetEconomyQueryKey, getListArenaChallengesQueryKey, getListArenaOpponentRecordsQueryKey, getListArenaPlayersQueryKey, getListEconomyTournamentsQueryKey, requestArenaRecordingUpload, useBootstrapEconomy, useEnterEconomyTournament, useFinishArenaChallenge, useFinishEconomyLocalMatch, useFinishEconomyTournament, useGetArenaProfile, useGetEconomy, useListArenaChallenges, useListEconomyTournaments, useSaveArenaProfile, useStartEconomyLocalMatch, useUnlockClass, useUnlockRacial } from '@workspace/api-client-react';
import type { ArenaChallengeTicket, ArenaEconomyReceipt, ArenaMatchSummary, ArenaProfile, EconomyAccount, EconomyBootstrapInput, LocalMatchTicket, TournamentEnterInput, TournamentRun } from '@workspace/api-client-react';
import { getGetArenaPublicProfileQueryKey, getSearchArenaProfilesQueryKey } from '@workspace/api-client-react';
import { QueryState } from '../components/QueryState';
import { ArenaNotifications } from '../components/ArenaNotifications';
import { useRankTiers } from '../lib/arenaRanks';
import Arena from './Arena';
import ArenaLeaderboard from './ArenaLeaderboard';
import Market from './Market';
import Store from './Store';
import RewardReveal from '../components/RewardReveal';
import { catalogByKey, type CatalogEntry } from '../data/itemCatalog';
import { ATTACK_KEY, clearLocalGame, economyProfileSnapshot, readAttack, readTicket, seedGame, stripEconomyState, TICKET_KEY } from '../lib/arena';
import { clearReplays, loadReplays, removeReplay, saveReplay, validReplay } from '../lib/replayRecovery';
import { useGameFrameScrolling } from '../lib/useGameFrameScrolling';
import { useHourlyDungeonBridge } from '../lib/useHourlyDungeonBridge';
import { gameErrorMessage } from '../lib/gameError';
import { useStoreProfileBadge } from '../lib/useStoreProfileBadge';

type LocalOutcome = 'win' | 'loss' | 'draw';
type PendingArenaResult = { owner: string; id: string; localOutcome: LocalOutcome; summary?: ArenaMatchSummary };
const PENDING_ARENA_RESULT_KEY = 'arena:pending-result';
type PendingLocalResult = { owner: string; id: string; outcome: LocalOutcome };
const PENDING_LOCAL_RESULTS_KEY = 'arena:pending-local-results';
const validMatchId = (id: unknown): id is string => typeof id === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(id);
function pendingLocalResults(owner: string): PendingLocalResult[] {
  try {
    const entries: unknown = JSON.parse(sessionStorage.getItem(PENDING_LOCAL_RESULTS_KEY) || '[]');
    return Array.isArray(entries) ? entries.filter((entry): entry is PendingLocalResult =>
      !!entry && entry.owner === owner && validMatchId(entry.id) &&
      ['win','loss','draw'].includes(entry.outcome)) : [];
  } catch { return []; }
}
function saveLocalResult(result: PendingLocalResult): boolean {
  const entries = pendingLocalResults(result.owner).filter(entry => entry.id !== result.id);
  try {
    sessionStorage.setItem(PENDING_LOCAL_RESULTS_KEY, JSON.stringify([...entries, result]));
    return true;
  } catch { return false; }
}
function clearLocalResult(result: PendingLocalResult) {
  try { sessionStorage.setItem(PENDING_LOCAL_RESULTS_KEY, JSON.stringify(
    pendingLocalResults(result.owner).filter(entry => entry.id !== result.id))); }
  catch { /* No stored result to clear. */ }
}
function readPendingArenaResult(owner: string): PendingArenaResult | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(PENDING_ARENA_RESULT_KEY) || 'null') as PendingArenaResult | null;
    return value?.owner === owner && typeof value.id === 'string' &&
      ['win', 'loss', 'draw'].includes(value.localOutcome) ? value : null;
  } catch { return null; }
}
function observedOutcome(result: unknown): LocalOutcome | undefined {
  return result === 'Victory!' ? 'win' : result === 'Defeat...' ? 'loss' : result === 'Draw' ? 'draw' : undefined;
}

function asTournamentAttack(value: unknown): TournamentEnterInput['attack'] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const snapshot = value as Record<string, unknown>;
  if (!Array.isArray(snapshot.heroes) || snapshot.heroes.length !== 3 ||
    typeof snapshot.captainClass !== 'string' || typeof snapshot.captainRacial !== 'string' ||
    !snapshot.heroes.every(hero => hero && typeof hero === 'object' && !Array.isArray(hero) &&
      typeof (hero as Record<string, unknown>).classId === 'string')) return null;
  return snapshot as unknown as TournamentEnterInput['attack'];
}

export default function Play() {
  const [, navigate] = useLocation();
  const { signOut } = useClerk();
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const profileQuery = useGetArenaProfile();
  const economyQuery = useGetEconomy();
  const challengesQuery = useListArenaChallenges();
  const saveProfile = useSaveArenaProfile();
  const bootstrapEconomy = useBootstrapEconomy();
  const enterTournament = useEnterEconomyTournament();
  const finishTournament = useFinishEconomyTournament();
  const unlockClass = useUnlockClass();
  const unlockRacial = useUnlockRacial();
  const tournamentHistoryQuery = useListEconomyTournaments();
  const finishChallenge = useFinishArenaChallenge();
  const startLocalMatch = useStartEconomyLocalMatch();
  const finishLocalMatch = useFinishEconomyLocalMatch();
  const iframe = useRef<HTMLIFrameElement>(null);
  const setFrameScrolling = useGameFrameScrolling(iframe);
  const gameScreenLayer = useRef<HTMLDivElement>(null);
  const seededFor = useRef<string | null>(null);
  const sentTicket = useRef<string | null>(null);
  const iframeReady = useRef(false);
  const gameReadyForChallenge = useRef(false);
  const returningToArena = useRef(false);
  const latestEconomy = useRef<EconomyAccount | null>(null);
  const bootstrapCompletedFor = useRef<string | null>(null);
  const bootstrapInFlight = useRef<Promise<boolean> | null>(null);
  const handledTournamentRequests = useRef(new Set<string>());
  const tournamentIdsByEntryRequestId = useRef(new Map<string, string>());
  const tournamentEntryPending = useRef(false);
  const activeTournamentIds = useRef(new Set<string>());
  const finishingTournamentIds = useRef(new Set<string>());
  const completedTournamentRuns = useRef(new Map<string, TournamentRun>());
  const pendingTournamentSnapshots = useRef(new Map<string, {
    requestId:string; tournamentId:string; owner:string; target:Window; cancelled:boolean;
    timer:ReturnType<typeof setTimeout>;
  }>());
  const tournamentTasks = useRef(new Set<Promise<void>>());
  const submittedResult = useRef<string | null>(null);
  const localStarts = useRef(new Map<string, Promise<LocalMatchTicket>>());
  const settlingLocal = useRef(new Set<string>());
  const completedMatches = useRef(new Set<string>());
  const pendingRecordings = useRef(new Map<string, Blob>());
  const uploadingRecordings = useRef(new Set<string>());
  const storingRecordings = useRef(new Map<string, Promise<void>>());
  const activeUser = useRef(userId);
  const signingOut = useRef(false);
  const latestProfile = useRef<ArenaProfile | null>(null);
  const pendingSave = useRef<{name:string;state:Record<string,unknown>} | null>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false);
  useStoreProfileBadge(iframe, ready, userId);
  useEffect(() => {
    if (!ready || !profileQuery.data || !economyQuery.data || new URLSearchParams(window.location.search).get('open') !== 'classes') return;
    const timer = window.setTimeout(() => {
      iframe.current?.contentDocument?.getElementById('classShopBtn')?.click();
      navigate('/play', { replace: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ready, navigate, profileQuery.data, economyQuery.data]);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [frameElement, setFrameElement] = useState<HTMLIFrameElement | null>(null);
  const attachIframeRef = useCallback((node: HTMLIFrameElement | null) => {
    iframe.current = node;
    iframeReady.current = false;
    gameReadyForChallenge.current = false;
    sentTicket.current = null;
    setReady(false);
    setLoadTimedOut(false);
    setFrameElement(node);
  }, []);
  useHourlyDungeonBridge(iframe, userId, loadAttempt, () => {
    void refreshEconomy().then(account => {
      if (activeUser.current !== userId || signingOut.current) return;
      iframe.current?.contentWindow?.postMessage({
        type: 'arena:sync-profile', profile: economyProfileSnapshot(account),
      }, window.location.origin);
    }).catch(() => {
      void queryClient.invalidateQueries({queryKey:getGetEconomyQueryKey()});
    });
  });
  const [gameScreen, setGameScreen] = useState<'arena' | 'market' | 'leaderboard' | 'store' | null>(null);
  useEffect(() => {
    const account = economyQuery.data;
    if (!ready || !account || account.onboardingRequired || activeUser.current !== userId || signingOut.current) return;
    iframe.current?.contentWindow?.postMessage({
      type: 'arena:sync-profile', profile: economyProfileSnapshot(account),
    }, window.location.origin);
  }, [ready, userId, economyQuery.data]);
  const [storeSection,setStoreSection]=useState<'featured'|'battle-pass'>('featured');
  const [arenaTeamSize,setArenaTeamSize]=useState<2|3>(
    Array.isArray(readAttack()?.heroes)&&(readAttack()?.heroes as unknown[]).length===2 ? 2 : 3);
  const [notificationRequest,setNotificationRequest]=useState(0);
  const unreadNotifications=useRef(0);
  const notifyUnreadChange=useCallback((count:number)=>{
    if(count>unreadNotifications.current){
      void queryClient.invalidateQueries({queryKey:getGetEconomyQueryKey()});
      void queryClient.invalidateQueries({queryKey:getGetArenaProfileQueryKey()});
    }
    unreadNotifications.current=count;
    iframe.current?.contentWindow?.postMessage({type:'arena:notifications-state',unread:count},window.location.origin);
  },[queryClient]);
  useEffect(() => {
    if (gameScreen) gameScreenLayer.current?.focus();
  }, [gameScreen]);
  const [notice, setNoticeState] = useState<{ text: string; id: number } | null>(null);
  const noticeId = useRef(0);
  const setNotice = (text: string) => setNoticeState(text ? { text, id: ++noticeId.current } : null);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNoticeState(current => current?.id === notice.id ? null : current), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const [rewardQueue, setRewardQueue] = useState<CatalogEntry[]>([]);
  const announcedRewards = useRef(new Set<string>());
  const [retryResult, setRetryResult] = useState<PendingArenaResult | null>(null);
  const [ticket, setTicket] = useState<ArenaChallengeTicket | null>(() => readTicket());
  useEffect(()=>{
    const current=profileQuery.data;
    if(!current || !ready)return;
    iframe.current?.contentWindow?.postMessage({type:'arena:ranked-progression',
      rankTiers:useRankTiers(),
      rank2:current.state.ranked2v2,
      squadRatings:current.state.squadRatings,
      defenseTeam2:current.state.defenseTeam2,
      rank3:{rating:current.rating,wins:current.wins,losses:current.losses},
    },window.location.origin);
  },[profileQuery.data,ready]);
  useEffect(() => {
    if (ready || !frameElement) return;
    const ping = () => {
      if (iframe.current !== frameElement || !frameElement.isConnected) return;
      frameElement.contentWindow?.postMessage({type:'arena:ping'},window.location.origin);
    };
    ping();
    const timer = window.setInterval(ping, 1000);
    return () => window.clearInterval(timer);
  }, [ready, frameElement]);
  useEffect(() => {
    if (ready || !frameElement) return;
    const timer = window.setTimeout(() => {
      if (iframe.current === frameElement && frameElement.isConnected && !iframeReady.current) {
        setLoadTimedOut(true);
      }
    }, 9000);
    return () => window.clearTimeout(timer);
  }, [ready, frameElement]);
  const economyOperations = useRef({
    refetch: economyQuery.refetch,
    bootstrap: bootstrapEconomy.mutateAsync,
    enterTournament: enterTournament.mutateAsync,
    finishTournament: finishTournament.mutateAsync,
    unlockClass: unlockClass.mutateAsync,
    unlockRacial: unlockRacial.mutateAsync,
    startLocal: startLocalMatch.mutateAsync,
    finishLocal: finishLocalMatch.mutateAsync,
  });
  economyOperations.current = {
    refetch: economyQuery.refetch,
    bootstrap: bootstrapEconomy.mutateAsync,
    enterTournament: enterTournament.mutateAsync,
    finishTournament: finishTournament.mutateAsync,
    unlockClass: unlockClass.mutateAsync,
    unlockRacial: unlockRacial.mutateAsync,
    startLocal: startLocalMatch.mutateAsync,
    finishLocal: finishLocalMatch.mutateAsync,
  };

  if (activeUser.current !== userId) {
    activeUser.current = userId;
    pendingRecordings.current.clear();
    uploadingRecordings.current.clear();
    storingRecordings.current.clear();
    latestEconomy.current = null;
    bootstrapCompletedFor.current = null;
    bootstrapInFlight.current = null;
    handledTournamentRequests.current.clear();
    tournamentIdsByEntryRequestId.current.clear();
    tournamentEntryPending.current = false;
    activeTournamentIds.current.clear();
    finishingTournamentIds.current.clear();
    completedTournamentRuns.current.clear();
    localStarts.current.clear();
    settlingLocal.current.clear();
    pendingTournamentSnapshots.current.clear();
    iframeReady.current = false;
    sentTicket.current = null;
  }

  useEffect(() => { setNotice(''); }, [userId]);
  useEffect(() => {
    setRewardQueue([]);
    announcedRewards.current.clear();
  }, [userId]);

  useEffect(() => {
    if (!userId || profileQuery.data?.playerId !== userId) return;
    let cancelled = false;
    void loadReplays(userId).then(entries => {
      if (cancelled || activeUser.current !== userId) return;
      for (const entry of entries) {
        if (!pendingRecordings.current.has(entry.id)) pendingRecordings.current.set(entry.id, entry.blob);
      }
      if (entries.length) {
        entries.forEach(entry => void uploadReplay(entry.id));
      }
    }).catch(() => {
      // Replay recovery must not cover the game with retry notices.
    });
    return () => { cancelled = true; };
  // Wait for the authenticated profile, then load once per player.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, profileQuery.data?.playerId]);

  const signOutSafely = async () => {
    // Do not leave another player access to private blobs on this shared device.
    signingOut.current = true;
    tournamentEntryPending.current = false;
    pendingTournamentSnapshots.current.forEach(pending => {
      pending.cancelled = true;
      clearTimeout(pending.timer);
      replyEconomyResult(pending.target, pending.requestId, false, undefined, 'Tournament entry cancelled.');
    });
    if (!(await flushPendingProfile())) {
      signingOut.current = false;
      return;
    }
    while (tournamentTasks.current.size) {
      await Promise.allSettled([...tournamentTasks.current]);
    }
    await Promise.allSettled([...storingRecordings.current.values()]);
    try { await clearReplays(); } catch { /* The next player's load also purges other accounts. */ }
    pendingRecordings.current.clear();
    sessionStorage.removeItem(PENDING_ARENA_RESULT_KEY);
    sessionStorage.removeItem(PENDING_LOCAL_RESULTS_KEY);
    clearLocalGame();
    await signOut({redirectUrl:import.meta.env.BASE_URL || '/'});
  };

  if (profileQuery.data && profileQuery.data.playerId === userId) latestProfile.current = profileQuery.data;
  if (economyQuery.data && profileQuery.data?.playerId === userId) latestEconomy.current = economyQuery.data;
  if (profileQuery.data && profileQuery.data.playerId === userId && economyQuery.data &&
    seededFor.current !== profileQuery.data.playerId) {
    seedGame(profileQuery.data, economyQuery.data);
    seededFor.current = profileQuery.data.playerId;
  }

  const refreshEconomy = async () => {
    await queryClient.invalidateQueries({queryKey:getGetEconomyQueryKey()});
    const result = await economyOperations.current.refetch();
    if (result.error || !result.data) throw result.error || new Error('The account economy could not be refreshed.');
    latestEconomy.current = result.data;
    queryClient.setQueryData(getGetEconomyQueryKey(), result.data);
    return result.data;
  };

  const dispatchPendingTicket = () => {
    const pending = readTicket();
    const target = iframe.current?.contentWindow;
    if (!gameReadyForChallenge.current || !iframeReady.current || latestEconomy.current?.onboardingRequired !== false ||
      !pending || !target || sentTicket.current === pending.id ||
      (userId && readPendingArenaResult(userId)?.id === pending.id)) return;
    const dungeon = (target as Window & {
      HourlyDungeon?: { isActive(): boolean; getView(): { busy?: boolean; claimPending?: boolean } };
    }).HourlyDungeon;
    if (dungeon?.isActive() || dungeon?.getView().busy || dungeon?.getView().claimPending) {
      setNotice('Finish or exit the Dungeon before continuing your Arena challenge.');
      return;
    }
    sentTicket.current = pending.id;
    target.postMessage({type:'arena:start-challenge',ticket:pending,attack:readAttack()},window.location.origin);
  };

  useEffect(() => {
    dispatchPendingTicket();
  }, [economyQuery.data, ticket?.id]);
  useEffect(() => {
    if (gameReadyForChallenge.current || !ready) return;
    gameReadyForChallenge.current = true;
    dispatchPendingTicket();
  // A challenge still waits for the game handshake, not an arbitrary intro timer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const bootstrapFromSavedState = async (state: Record<string, unknown>): Promise<boolean> => {
    const owner = userId;
    if (!owner || bootstrapCompletedFor.current === owner) return true;
    const classes = state.ownedClasses;
    const racials = state.ownedRacials;
    const classIds = ['frostmage','priest','warrior','rogue','paladin','archer','warlock','druid','shaman'];
    const racialIds = ['nightelf','tauren','orc','troll','dwarf','bloodelf','goblin','undead'];
    const hasValidSelection = Array.isArray(classes) && classes.length === 3 &&
      classes.every((id): id is string => typeof id === 'string' && classIds.includes(id)) &&
      new Set(classes).size === 3 && Array.isArray(racials) && racials.length === 1 &&
      typeof racials[0] === 'string' && racialIds.includes(racials[0]);
    if (bootstrapInFlight.current) {
      try { await bootstrapInFlight.current; return bootstrapCompletedFor.current === owner; }
      catch { return false; }
    }

    const operation = (async () => {
      let account = latestEconomy.current;
      if (!account) account = await refreshEconomy();
      if (!account.onboardingRequired || activeUser.current !== owner) return true;
      if (!hasValidSelection) return false;
      const selection: EconomyBootstrapInput = {
        classIds:classes as EconomyBootstrapInput['classIds'],
        racialId:racials[0] as EconomyBootstrapInput['racialId'],
      };
      const receipt = await economyOperations.current.bootstrap({data:selection});
      bootstrapCompletedFor.current = owner;
      const bootstrappedAccount: EconomyAccount = {
        onboardingRequired:false,
        gold:receipt.gold,
        unlocks:receipt.unlocks,
        duplicates:[],
        listings:[],
        config:{},
      };
      latestEconomy.current = bootstrappedAccount;
      queryClient.setQueryData(getGetEconomyQueryKey(), bootstrappedAccount);
      void refreshEconomy().catch(() => undefined);
      return true;
    })();
    bootstrapInFlight.current = operation;
    try {
      return await operation;
    } catch {
      setNotice('Your profile was saved, but account onboarding could not sync. Save again before starting a challenge.');
      return false;
    } finally {
      if (bootstrapInFlight.current === operation) bootstrapInFlight.current = null;
    }
  };

  const persist = (input: {name:string;state:Record<string,unknown>}, afterSave?: () => void | Promise<void>) => {
    saveChain.current = saveChain.current.then(async () => {
      try {
        const updated = await saveProfile.mutateAsync({data:{...input,state:stripEconomyState(input.state)}});
        latestProfile.current = updated;
        queryClient.setQueryData(getGetArenaProfileQueryKey(), updated);
        void queryClient.invalidateQueries({queryKey:getGetArenaPublicProfileQueryKey(updated.playerId)});
        void queryClient.invalidateQueries({queryKey:getSearchArenaProfilesQueryKey()});
        void queryClient.invalidateQueries({queryKey:getListArenaPlayersQueryKey()});
        void queryClient.invalidateQueries({queryKey:getGetArenaLeaderboardQueryKey()});
        setNotice('');
        const economyReady = await bootstrapFromSavedState(input.state);
        if (economyReady && !updated.defensePublished &&
          (input.state.defenseTeam || input.state.currentTeam || input.state.savedTeams)) {
          // First-time economy ownership can become available after the profile
          // save; fetching again gives the server a chance to publish the squad.
          void queryClient.invalidateQueries({queryKey:getGetArenaProfileQueryKey()});
        }
        if (economyReady) await afterSave?.();
      } catch {
        if (!pendingSave.current) pendingSave.current = input;
        setNotice('Profile sync interrupted. Retry save before leaving the game.');
      }
    });
    return saveChain.current;
  };

  const flushPendingProfile = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const input = pendingSave.current;
    pendingSave.current = null;
    if (input) await persist(input);
    else await saveChain.current;
    return !pendingSave.current;
  };

  const uploadReplay = async (id: string) => {
    const blob = pendingRecordings.current.get(id);
    const owner = userId;
    if (!owner || !blob || uploadingRecordings.current.has(id)) return;
    const contentType = blob.type === 'application/vnd.arena.replay+json'
      ? 'application/vnd.arena.replay+json' : blob.type === 'video/mp4' ? 'video/mp4' : 'video/webm';
    if (!validReplay(blob)) {
      pendingRecordings.current.delete(id);
      return;
    }
    uploadingRecordings.current.add(id);
    let awaitingResult = false;
    const confirmed = async () => {
      try { await removeReplay(owner, id); } catch { /* Retry cleanup on the next recovery load. */ }
      if (activeUser.current === owner) {
        pendingRecordings.current.delete(id);
      }
      void queryClient.invalidateQueries({queryKey:getListArenaChallengesQueryKey()});
    };
    try {
      try { await storingRecordings.current.get(id); } catch { /* Keep the in-memory copy for retry. */ }
      if (activeUser.current !== owner || signingOut.current) return;
      if (!completedMatches.current.has(id)) {
        // New challenges are pending until result sync; a detail lookup may be
        // 404 while the result is still in flight. Retry after it settles.
        awaitingResult = true;
        const match = await getArenaChallenge(id);
        if (activeUser.current !== owner || signingOut.current) return;
        if (match.direction !== 'outgoing' || match.outcome === null) {
          awaitingResult = match.direction === 'outgoing';
          return;
        }
        awaitingResult = false;
        completedMatches.current.add(id);
        if (match.hasRecording) {
          await confirmed();
          return;
        }
      }
      // Uploads and recovery run quietly without hiding match/result notices.
      const upload = await requestArenaRecordingUpload(id, { contentType, sizeBytes: blob.size });
      const response = await fetch(upload.uploadUrl, { method:'PUT', body:blob, headers:{'Content-Type':contentType} });
      if (!response.ok) throw new Error(`Upload failed (${response.status})`);
      await finishArenaRecording(id, { objectPath:upload.objectPath, contentType });
      await confirmed();
    } catch {
      // The finalization response may have been lost even though the server accepted it.
      try {
        const match = await getArenaChallenge(id);
        if (match.direction === 'outgoing' && match.hasRecording) {
          await confirmed();
          return;
        }
      } catch { /* Keep the local copy when confirmation is unavailable. */ }
      // Retain the recording for the next automatic retry.
    } finally {
      uploadingRecordings.current.delete(id);
      // Result finalization can finish while the first upload attempt is still
      // checking the challenge; don't lose that successful completion signal.
      if (awaitingResult && completedMatches.current.has(id) && activeUser.current === owner) void uploadReplay(id);
    }
  };

  useEffect(() => {
    if (!userId || !ready) return;
    const retryRecordings = () => {
      if (signingOut.current || activeUser.current !== userId || !navigator.onLine) return;
      pendingRecordings.current.forEach((_blob, id) => void uploadReplay(id));
    };
    const timer = window.setInterval(retryRecordings, 30000);
    window.addEventListener('online', retryRecordings);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', retryRecordings);
    };
  // The upload guard uses the current owner and prevents overlapping retries.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, ready]);

  useEffect(() => {
    if (!ready || !iframe.current?.contentWindow || !profileQuery.data) return;
    iframe.current.contentWindow.postMessage({
      type:'arena:profile-summary',
      wins:profileQuery.data.wins,
      opponents:(challengesQuery.data || []).filter(match=>match.outcome==='win')
        .slice(0,8).map(match=>match.opponentName),
    }, window.location.origin);
  }, [ready, profileQuery.data?.wins, challengesQuery.data]);
  useEffect(() => {
    if (!ready || gameScreen || !economyQuery.data || economyQuery.data.onboardingRequired) return;
    iframe.current?.contentWindow?.postMessage({type:'arena:reward-rates',config:economyQuery.data.config},window.location.origin);
    iframe.current?.contentWindow?.postMessage({
      type:'arena:sync-profile', profile:economyProfileSnapshot(economyQuery.data),
    },window.location.origin);
  }, [ready, gameScreen, economyQuery.data]);

  const deliverArenaReward = (id: string, economy: ArenaEconomyReceipt, target?: Window | null) => {
    // The committed receipt is enough to update Gold and animate immediately;
    // a slow or failed inventory refresh must not hide an earned reward.
    target?.postMessage({type:'arena:arena-reward',id,reward:economy,
      profile:{gold:economy.balance}},window.location.origin);
    void refreshEconomy().then(account => {
      if (!account.onboardingRequired) {
        target?.postMessage({
          type:'arena:sync-profile',
          profile:economyProfileSnapshot(account),
        },window.location.origin);
      }
    }).catch(() => {
      void queryClient.invalidateQueries({queryKey:getGetEconomyQueryKey()});
    });
  };

  const replyEconomyResult = (
    target: Window | null | undefined,
    requestId: string,
    ok: boolean,
    profile?: Record<string, unknown>,
    message?: string,
    tournament?: TournamentRun,
    retryAfterSeconds?: number,
  ) => {
    const authoritativeProfile = profile ?? (latestEconomy.current && !latestEconomy.current.onboardingRequired
      ? economyProfileSnapshot(latestEconomy.current) : undefined);
    target?.postMessage({type:'arena:economy-result',requestId,ok,profile:authoritativeProfile,message,tournament,retryAfterSeconds},window.location.origin);
  };

  const invalidateTournamentData = () => {
    void queryClient.invalidateQueries({queryKey:getGetEconomyQueryKey()});
    void queryClient.invalidateQueries({queryKey:tournamentHistoryQuery.queryKey});
  };

  const tournamentProfileFromRun = async (run: TournamentRun) => {
    const account = latestEconomy.current;
    const owner = activeUser.current;
    // Deliver the settled balance before a secondary inventory request.
    void refreshEconomy().then(updated => {
      if (activeUser.current !== owner || signingOut.current || updated.onboardingRequired) return;
      iframe.current?.contentWindow?.postMessage({
        type:'arena:sync-profile',profile:economyProfileSnapshot(updated),
      },window.location.origin);
    }).catch(() => void queryClient.invalidateQueries({queryKey:getGetEconomyQueryKey()}));
    return {
      ...(account ? economyProfileSnapshot(account) : {}),
      gold:run.gold,
      tournamentWins:run.tournamentWins,
    };
  };

  const trackTournamentTask = (task: Promise<void>) => {
    tournamentTasks.current.add(task);
    void task.finally(() => tournamentTasks.current.delete(task));
  };

  const enterTournamentOnServer = (
    requestId: string,
    tournamentId: string,
    attack: TournamentEnterInput['attack'],
    target: Window | null,
    owner: string,
  ) => {
    const task = (async () => {
      if (signingOut.current || activeUser.current !== owner) {
        tournamentEntryPending.current = false;
        return;
      }
      try {
        const run = await economyOperations.current.enterTournament({data:{requestId:tournamentId,attack}});
        tournamentIdsByEntryRequestId.current.set(requestId, run.id);
        tournamentEntryPending.current = false;
        activeTournamentIds.current.add(run.id);
        invalidateTournamentData();
        const profile = await tournamentProfileFromRun(run);
        if (signingOut.current || activeUser.current !== owner) return;
        replyEconomyResult(target, requestId, true, profile, 'Tournament entry confirmed.', run);
      } catch (error) {
        tournamentEntryPending.current = false;
        if (signingOut.current || activeUser.current !== owner) return;
        const message = gameErrorMessage(error, 'tournament-entry');
        replyEconomyResult(target, requestId, false, latestEconomy.current ? economyProfileSnapshot(latestEconomy.current) : undefined, message);
      }
    })();
    trackTournamentTask(task);
  };

  const finishTournamentOnServer = (
    requestId: string,
    tournamentId: string,
    target: Window | null,
    owner: string,
    placement: 'champion' | 'runner_up' | 'eliminated',
  ) => {
    const task = (async () => {
      if (signingOut.current || activeUser.current !== owner) return;
      try {
        const run = await economyOperations.current.finishTournament({tournamentId,data:{placement}});
        completedTournamentRuns.current.set(tournamentId, run);
        activeTournamentIds.current.delete(tournamentId);
        invalidateTournamentData();
        const profile = await tournamentProfileFromRun(run);
        if (signingOut.current || activeUser.current !== owner) return;
        replyEconomyResult(target, requestId, true, profile, 'Tournament result confirmed.', run);
      } catch (error) {
        if (signingOut.current || activeUser.current !== owner) return;
        finishingTournamentIds.current.delete(tournamentId);
        const response = error as {status?:unknown;data?:{retryAfterSeconds?:unknown}};
        const retryAfterSeconds = response.status === 409 ? Number(response.data?.retryAfterSeconds) : NaN;
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 && retryAfterSeconds <= 120) {
          replyEconomyResult(target, requestId, false, undefined,
            'Your tournament result will be confirmed automatically soon.',
            undefined, retryAfterSeconds);
          return;
        }
        const message = gameErrorMessage(error, 'tournament-finish');
        replyEconomyResult(target, requestId, false, latestEconomy.current ? economyProfileSnapshot(latestEconomy.current) : undefined, message);
      }
    })();
    trackTournamentTask(task);
  };

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (pendingSave.current) void persist(pendingSave.current);
    };
  // Only flush on unmount; the mutation function is accessed from the cleanup closure.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitArenaResult = (pending: PendingArenaResult, target?: Window | null) => {
    if (submittedResult.current === pending.id || activeUser.current !== pending.owner || signingOut.current) return;
    submittedResult.current = pending.id;
    finishChallenge.mutate({challengeId:pending.id,data:{summary:pending.summary,localOutcome:pending.localOutcome}}, {
      onSuccess:receipt => {
        if (activeUser.current !== pending.owner || signingOut.current) return;
        completedMatches.current.add(pending.id);
        if (readTicket()?.id === pending.id) sessionStorage.removeItem(TICKET_KEY);
        sessionStorage.removeItem(PENDING_ARENA_RESULT_KEY);
        setTicket(null);
        setRetryResult(null);
        setNotice(`Ranked ${receipt.outcome.toUpperCase()} against ${receipt.opponentName} (${receipt.delta >= 0 ? '+' : ''}${receipt.delta} rating). ${receipt.outcome !== pending.localOutcome ? 'This older challenge was already scored under the previous rules.' : 'Your fight determined this result.'}`);
        target?.postMessage({type:'arena:ranked-result',id:pending.id,outcome:receipt.outcome,delta:receipt.delta},window.location.origin);
        void queryClient.invalidateQueries({queryKey:getGetArenaProfileQueryKey()});
        const newUnlocks: CatalogEntry[] = [];
        for (const drop of receipt.economy.drops ?? []) {
          if (drop.duplicate || (drop.kind !== 'spell' && drop.kind !== 'talent')) continue;
          const announcementId = `${pending.id}:${drop.kind}:${drop.itemId}`;
          if (announcedRewards.current.has(announcementId)) continue;
          announcedRewards.current.add(announcementId);
          const entry = catalogByKey.get(`${drop.kind}:${drop.itemId}`);
          if (entry) newUnlocks.push(entry);
          else setNotice('A new reward was saved, but its artwork could not be found. Check your collection.');
        }
        if (newUnlocks.length) setRewardQueue(queue => [...queue, ...newUnlocks]);
        deliverArenaReward(pending.id, receipt.economy, target);
        void queryClient.invalidateQueries({queryKey:getListArenaChallengesQueryKey()});
        void queryClient.invalidateQueries({queryKey:getListArenaOpponentRecordsQueryKey()});
        void queryClient.invalidateQueries({queryKey:getGetArenaLeaderboardQueryKey()});
        void queryClient.invalidateQueries({queryKey:getListArenaPlayersQueryKey()});
        void uploadReplay(pending.id);
      },
      onError:() => {
        if (activeUser.current !== pending.owner) return;
        submittedResult.current = null;
        setRetryResult(pending);
        setNotice('Ranked result could not sync. Retry in the game or below before leaving.');
      }
    });
  };

  const registerLocalMatch = (id: string): Promise<LocalMatchTicket> => {
    const existing = localStarts.current.get(id);
    if (existing) return existing;
    const task = economyOperations.current.startLocal({data:{requestId:id}})
      .catch(error => { localStarts.current.delete(id); throw error; });
    localStarts.current.set(id, task);
    return task;
  };

  const settleLocalMatch = (pending: PendingLocalResult, target?: Window | null, recover = false) => {
    if (settlingLocal.current.has(pending.id) || activeUser.current !== pending.owner || signingOut.current) return;
    settlingLocal.current.add(pending.id);
    void (async () => {
      let registered = false;
      try {
        const start = localStarts.current.get(pending.id) ??
          (recover ? registerLocalMatch(pending.id) : null);
        if (!start) throw new Error('This fight was not registered for Gold before it began.');
        await start;
        registered = true;
        if (activeUser.current !== pending.owner || signingOut.current) return;
        if (!saveLocalResult(pending)) setNotice('Keep this page open until the local reward is confirmed; recovery storage is unavailable.');
        let receipt;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            receipt = await economyOperations.current.finishLocal({
              matchId:pending.id, data:{outcome:pending.outcome},
            });
            break;
          } catch (error) {
            const response = error as {status?:number;data?:{retryAfterSeconds?:number}};
            const seconds = response.status === 409 ? Number(response.data?.retryAfterSeconds) : NaN;
            if (!Number.isFinite(seconds) || seconds < 1 || seconds > 30 || attempt === 2) throw error;
            await new Promise(resolve => setTimeout(resolve, seconds * 1000));
          }
        }
        if (!receipt || activeUser.current !== pending.owner || signingOut.current) return;
        clearLocalResult(pending);
        localStarts.current.delete(pending.id);
        let account = latestEconomy.current;
        try { account = await refreshEconomy(); }
        catch { void queryClient.invalidateQueries({queryKey:getGetEconomyQueryKey()}); }
        if (activeUser.current !== pending.owner || signingOut.current) return;
        const profile = account && !account.onboardingRequired
          ? {...economyProfileSnapshot(account),gold:receipt.balance} : undefined;
        if (profile) target?.postMessage({type:'arena:sync-profile',profile},window.location.origin);
        target?.postMessage({type:'arena:local-reward',id:pending.id,reward:receipt,profile},
          window.location.origin);
        if (receipt.outcome === 'win') setNotice(
          `Local AI victory: +${receipt.gold} Gold. ${receipt.localWins <= 3 ?
            `${receipt.localWins}/3 higher-paying wins used.` : 'Later wins earn 10 Gold.'}`);
      } catch (error) {
        if (activeUser.current !== pending.owner || signingOut.current) return;
        const response = error as {status?:number};
        if (response.status === 404) clearLocalResult(pending);
        const message = gameErrorMessage(error, 'local-reward');
        setNotice(`${message}${registered ? ' Retry the reward or reload this page.' : ' This fight cannot earn Gold.'}`);
        target?.postMessage({type:'arena:local-reward-error',id:pending.id,message,retryable:registered},
          window.location.origin);
      } finally {
        settlingLocal.current.delete(pending.id);
      }
    })();
  };

  useEffect(() => {
    if (!userId || profileQuery.data?.playerId !== userId) return;
    pendingLocalResults(userId).forEach(result => settleLocalMatch(result, iframe.current?.contentWindow, true));
  // Recover unfinished local payouts after a same-tab reload.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileQuery.data?.playerId, userId]);

  useEffect(() => {
    if (!userId || profileQuery.data?.playerId !== userId) return;
    const pending = readPendingArenaResult(userId);
    if (pending && readTicket()?.id === pending.id) submitArenaResult(pending, iframe.current?.contentWindow);
  // Resume the result once per signed-in player; submitArenaResult handles retries.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileQuery.data?.playerId, userId]);

  useEffect(() => {
    if (!profileQuery.data || !frameElement) return;
    const target = frameElement.contentWindow;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== target || !event.data || typeof event.data.type !== 'string') return;
      const msg = event.data;
      if (msg.type === 'arena:dungeon-busy' && msg.challengeId === readTicket()?.id) {
        sentTicket.current = null;
        setNotice('Your Arena challenge is queued. Finish or exit the Dungeon, then continue it from Arena.');
        return;
      }
      if (msg.type === 'arena:local-start' && validMatchId(msg.id) && userId &&
        !signingOut.current && latestEconomy.current?.onboardingRequired === false) {
        void registerLocalMatch(msg.id).catch(() => {
          if (activeUser.current === userId) setNotice('Could not register this fight for Gold. Finish your last result or wait before starting another.');
        });
      }
      if (msg.type === 'arena:local-finish' && validMatchId(msg.id) && userId) {
        const outcome = observedOutcome(msg.result);
        if (outcome) {
          const pending = {owner:userId,id:msg.id,outcome};
          settleLocalMatch(pending, target);
        }
      }
      if (msg.type === 'arena:local-retry' && validMatchId(msg.id) && userId) {
        const pending = pendingLocalResults(userId).find(entry => entry.id === msg.id);
        if (pending) settleLocalMatch(pending, target, true);
      }
      if (msg.type === 'arena:ready') {
        // An in-frame retry reloads its document without remounting React.
        // Re-send startup state even when the host's ready flag is already true.
        if (iframeReady.current && latestEconomy.current &&
            latestProfile.current?.playerId === userId && !signingOut.current) {
          if (!latestEconomy.current.onboardingRequired) target?.postMessage({
            type: 'arena:sync-profile', profile: economyProfileSnapshot(latestEconomy.current),
          }, window.location.origin);
          target?.postMessage({type: 'arena:startup-commit'}, window.location.origin);
        }
        iframeReady.current = true;
        setReady(true);
        setLoadTimedOut(false);
        dispatchPendingTicket();
      }
      if (msg.type === 'arena:return-to-arena') {
        const pending = readTicket();
        if (pending && !completedMatches.current.has(pending.id)) {
          setNotice('Wait for the ranked result to sync before returning to Arena.');
          return;
        }
        if (returningToArena.current) return;
        returningToArena.current = true;
        void (async () => {
          try {
            if (!(await flushPendingProfile())) {
              setNotice('Your squad could not be saved. Retry the save before returning to Arena.');
              return;
            }
            await Promise.allSettled([...storingRecordings.current.values()]);
            target?.postMessage({type:'arena:show-menu'},window.location.origin);
            setGameScreen('arena');
          } finally {
            returningToArena.current = false;
          }
        })();
      }
      if (msg.type === 'arena:profile-save' && msg.state && typeof msg.state === 'object' && !Array.isArray(msg.state)) {
        const current = latestProfile.current;
        pendingSave.current = { name:String(msg.state.name || current?.name || 'Challenger').slice(0,32), state:msg.state };
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          const input = pendingSave.current;
          if (!input) return;
          pendingSave.current = null;
          void persist(input);
        }, 650);
      }
      if (msg.type === 'arena:flush-profile') void flushPendingProfile();
      if (msg.type === 'arena:attack-snapshot') {
        const snapshotRequestId = typeof msg.requestId === 'string' ? msg.requestId : '';
        const pendingTournament = pendingTournamentSnapshots.current.get(snapshotRequestId);
        if (pendingTournament) {
          pendingTournamentSnapshots.current.delete(snapshotRequestId);
          clearTimeout(pendingTournament.timer);
          if (pendingTournament.cancelled || signingOut.current || activeUser.current !== pendingTournament.owner) {
            tournamentEntryPending.current = false;
            replyEconomyResult(pendingTournament.target, pendingTournament.requestId, false, undefined, 'Tournament entry cancelled.');
            return;
          }
          const attack = asTournamentAttack(msg.attack);
          if (!attack) {
            tournamentEntryPending.current = false;
            replyEconomyResult(pendingTournament.target, pendingTournament.requestId, false, undefined, 'Choose a complete 3v3 team with a captain and racial before entering.');
            return;
          }
          enterTournamentOnServer(
            pendingTournament.requestId,
            pendingTournament.tournamentId,
            attack,
            pendingTournament.target,
            pendingTournament.owner,
          );
          return;
        }
        if (msg.attack && typeof msg.attack === 'object') {
          const heroes=(msg.attack as {heroes?:unknown}).heroes;
          if(!Array.isArray(heroes) || ![2,3].includes(heroes.length)) {
            setNotice('Select exactly two or three characters before opening Ranked Arena.');return;
          }
          setArenaTeamSize(heroes.length===2 ? 2 : 3);
          sessionStorage.setItem(ATTACK_KEY,JSON.stringify(msg.attack));
        } else {
          setNotice('Select a complete two- or three-character squad before opening Ranked Arena.');return;
        }
        if (saveTimer.current) clearTimeout(saveTimer.current);
        const input = pendingSave.current;
        pendingSave.current = null;
        if (input) {
          void persist(input, () => setGameScreen('arena'));
        } else void saveChain.current.then(() => {
          if (latestEconomy.current?.onboardingRequired === false) setGameScreen('arena');
          else setNotice('Complete account economy onboarding before starting a challenge.');
        });
      }
      if (msg.type === 'arena:open-online') {
        target?.postMessage({type:'arena:get-attack',requestId:'lobby'},window.location.origin);
      }
      if (msg.type === 'arena:open-leaderboard') setGameScreen('leaderboard');
      if(msg.type==='arena:notifications-open')setNotificationRequest(value=>value+1);
      if(msg.type==='arena:notifications-refresh' || msg.type==='arena:ready') {
        target?.postMessage({type:'arena:notifications-state',unread:unreadNotifications.current},window.location.origin);
      }
      if(msg.type==='arena:ranked-progression-request'){
        const current=latestProfile.current;
        if(current)target?.postMessage({type:'arena:ranked-progression',rankTiers:useRankTiers(),rank2:current.state.ranked2v2,squadRatings:current.state.squadRatings,defenseTeam2:current.state.defenseTeam2,
          rank3:{rating:current.rating,wins:current.wins,losses:current.losses}},window.location.origin);
      }
      if (msg.type === 'arena:open-store') {
        setStoreSection(msg.section === 'battle-pass' ? 'battle-pass' : 'featured');
        // Browsing does not leave or unmount the game. A slow/failed squad
        // save must not prevent opening the shop; keep syncing in the background.
        setGameScreen('store');
        void flushPendingProfile();
      }
      if (msg.type === 'arena:open-market') {
        void flushPendingProfile().then(saved => {
          if (saved) setGameScreen('market');
          else setNotice('Save your squad before opening the Market. Retry the save and try again.');
        });
      }
      if (msg.type === 'arena:logout') {
        void signOutSafely();
      }
      if (msg.type === 'arena:economy-request' && typeof msg.requestId === 'string' && typeof msg.action === 'string') {
        const requestId = msg.requestId;
        const snapshot = (account: EconomyAccount | null) =>
          account && !account.onboardingRequired ? economyProfileSnapshot(account) : undefined;
        const reply = (ok: boolean, profile?: Record<string, unknown>, message?: string, tournament?: TournamentRun) => {
          replyEconomyResult(target, requestId, ok, profile, message, tournament);
        };
        const payload = msg.payload && typeof msg.payload === 'object' && !Array.isArray(msg.payload)
          ? msg.payload as Record<string, unknown> : {};
        const action = msg.action;
        if (action === 'tournament:enter') {
          if (handledTournamentRequests.current.has(requestId)) return;
          handledTournamentRequests.current.add(requestId);
          if (signingOut.current || !userId) {
            reply(false, snapshot(latestEconomy.current), 'Sign in to enter the tournament.');
            return;
          }
          if (tournamentEntryPending.current || activeTournamentIds.current.size) {
            reply(false, snapshot(latestEconomy.current), 'Finish your current tournament first.');
            return;
          }
          tournamentEntryPending.current = true;
          let tournamentId: string;
          try { tournamentId = crypto.randomUUID(); }
          catch {
            tournamentEntryPending.current = false;
            reply(false, snapshot(latestEconomy.current), 'Could not start the tournament. Try again.');
            return;
          }
          const attack = asTournamentAttack(payload.attack);
          if (attack) {
            enterTournamentOnServer(requestId, tournamentId, attack, target, userId);
          } else {
            let snapshotRequestId: string;
            try { snapshotRequestId = `tournament-attack-${crypto.randomUUID()}`; }
            catch {
              tournamentEntryPending.current = false;
              reply(false, snapshot(latestEconomy.current), 'Could not prepare your team. Try again.');
              return;
            }
            const pending = {
              requestId,
              tournamentId,
              owner:userId,
              target:target as Window,
              cancelled:false,
              timer:setTimeout(() => {
                pending.cancelled = true;
                tournamentEntryPending.current = false;
                replyEconomyResult(target, requestId, false, undefined, 'Could not prepare your team. Try again.');
              }, 18000),
            };
            pendingTournamentSnapshots.current.set(snapshotRequestId, pending);
            target?.postMessage({type:'arena:get-attack',requestId:snapshotRequestId},window.location.origin);
          }
        } else if (action === 'tournament:finish') {
          if (handledTournamentRequests.current.has(requestId)) return;
          handledTournamentRequests.current.add(requestId);
          const suppliedTournamentId = payload.entryRequestId;
          const tournamentId = typeof suppliedTournamentId === 'string'
            ? tournamentIdsByEntryRequestId.current.get(suppliedTournamentId) || suppliedTournamentId : suppliedTournamentId;
          if (signingOut.current || !userId) {
            reply(false, snapshot(latestEconomy.current), 'Sign in to finish the tournament.');
          } else if (typeof tournamentId !== 'string' || !tournamentId.trim()) {
            reply(false, snapshot(latestEconomy.current), 'Tournament result unavailable. Try again.');
          } else if (completedTournamentRuns.current.has(tournamentId)) {
            const run = completedTournamentRuns.current.get(tournamentId)!;
            reply(true, {
              ...(latestEconomy.current ? economyProfileSnapshot(latestEconomy.current) : {}),
              gold:run.gold,
              tournamentWins:run.tournamentWins,
            }, 'Tournament result already confirmed.', run);
          } else if (finishingTournamentIds.current.has(tournamentId)) {
            return;
          } else {
            const placement = payload.localPlacement === '1st' ? 'champion' :
              payload.localPlacement === '2nd' ? 'runner_up' :
              payload.localPlacement === 'Semifinal' || payload.localPlacement === 'Quarterfinal' ? 'eliminated' : null;
            if (!placement) {
              reply(false, snapshot(latestEconomy.current), 'Finish your tournament bracket before claiming its prize.');
              return;
            }
            finishingTournamentIds.current.add(tournamentId);
            finishTournamentOnServer(requestId, tournamentId, target, userId, placement);
          }
        } else if (action === 'market:open') {
          reply(true, snapshot(latestEconomy.current), 'Opening the Market.');
          navigate('/market');
        } else if (action === 'class:unlock' || action === 'racial:unlock') {
          void (async () => {
            try {
              const key = payload.key;
              if (typeof key !== 'string') throw new Error('The requested item is invalid.');
              if (action === 'class:unlock') {
                const valid = ['frostmage','priest','warrior','rogue','paladin','archer','warlock','druid','shaman'];
                if (!valid.includes(key)) throw new Error('The requested class is invalid.');
                await economyOperations.current.unlockClass({data:{classId:key as EconomyBootstrapInput['classIds'][number]}});
              } else {
                const valid = ['nightelf','tauren','orc','troll','dwarf','bloodelf','goblin','undead'];
                if (!valid.includes(key)) throw new Error('The requested racial is invalid.');
                await economyOperations.current.unlockRacial({data:{racialId:key as EconomyBootstrapInput['racialId']}});
              }
              const account = await refreshEconomy();
              if (account.onboardingRequired) throw new Error('Complete your starting class and racial selection first.');
              reply(true, snapshot(account), 'Unlocked!');
            } catch (error) {
              const message = gameErrorMessage(error, 'unlock');
              reply(false, snapshot(latestEconomy.current), message);
            }
          })();
        } else {
          reply(false, snapshot(latestEconomy.current), 'This action is unavailable right now.');
        }
      }
       if (msg.type === 'arena:recording-unavailable' && typeof msg.id === 'string' &&
         (readTicket()?.id === msg.id || submittedResult.current === msg.id)) {
          // Recording failures never prevent result settlement or Gold.
       }
       if (msg.type === 'arena:recording' && typeof msg.id === 'string' && msg.blob instanceof Blob &&
         (readTicket()?.id === msg.id || submittedResult.current === msg.id) &&
         ['video/webm','video/mp4','application/vnd.arena.replay+json'].includes(msg.blob.type)) {
          if (userId && !signingOut.current && validReplay(msg.blob)) {
          pendingRecordings.current.set(msg.id, msg.blob);
           const storing = saveReplay(userId, msg.id, msg.blob);
           storingRecordings.current.set(msg.id, storing);
           void storing.catch(() => {
             // Keep the in-memory copy and retry without a top-of-game banner.
           }).finally(() => {
             if (storingRecordings.current.get(msg.id) === storing) storingRecordings.current.delete(msg.id);
           });
          void uploadReplay(msg.id);
        }
      }
      if (msg.type === 'arena:result' && typeof msg.id === 'string') {
        void flushPendingProfile();
        const active = readTicket();
        if (!active || active.id !== msg.id || submittedResult.current === msg.id || !userId) return;
        const summary = msg.summary && Array.isArray(msg.summary.player) && msg.summary.player.length===3 &&
          Array.isArray(msg.summary.enemy) && msg.summary.enemy.length===3
          ? msg.summary as ArenaMatchSummary : undefined;
        const localOutcome = observedOutcome(msg.result);
        if (!localOutcome) { setNotice('The game did not report a finished fight. Ranked points have not changed.'); return; }
        const saved = readPendingArenaResult(userId);
        const pending: PendingArenaResult = saved && saved.id === msg.id ? saved : {owner:userId,id:msg.id,summary,localOutcome};
        sessionStorage.setItem(PENDING_ARENA_RESULT_KEY, JSON.stringify(pending));
        submitArenaResult(pending, target);
      }
    };
    window.addEventListener('message',onMessage);
    return () => window.removeEventListener('message',onMessage);
  // Rebind with each mounted iframe so readiness and game messages use its live source.
  // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [profileQuery.data?.playerId,navigate,signOut,queryClient,userId,loadAttempt,frameElement]);

  const retrySave = () => {
    const input = pendingSave.current;
    if (!input) return;
    pendingSave.current = null;
    void persist(input);
  };
  const retry = () => {
    if (!retryResult) return;
    submitArenaResult(retryResult, iframe.current?.contentWindow);
  };
  const closeGameScreen = () => {
    setGameScreen(null);
    iframe.current?.contentWindow?.postMessage({type:'arena:show-menu'},window.location.origin);
  };
  const retryGameLoad = () => {
    iframeReady.current = false;
    sentTicket.current = null;
    gameReadyForChallenge.current = false;
    setLoadTimedOut(false);
    setReady(false);
    setLoadAttempt(value => value + 1);
  };
  const enterGameFromArena = () => {
    const pending = readTicket();
    setGameScreen(null);
    if (pending && sentTicket.current !== pending.id) setTicket(pending);
    else iframe.current?.contentWindow?.postMessage({type:'arena:show-team'},window.location.origin);
  };
  useEffect(() => {
    if (!ready || !frameElement || profileQuery.data?.playerId !== userId ||
        !economyQuery.data || signingOut.current) return;
    // Engine readiness is not visual readiness. Apply the authoritative wallet
    // before allowing the iframe to reveal its fully initialized dashboard.
    const target = frameElement.contentWindow;
    if (!economyQuery.data.onboardingRequired) target?.postMessage({
      type: 'arena:sync-profile', profile: economyProfileSnapshot(economyQuery.data),
    }, window.location.origin);
    target?.postMessage({type: 'arena:startup-commit'}, window.location.origin);
  }, [ready, frameElement, userId, profileQuery.data?.playerId, economyQuery.data]);

  return <div className="site play-surface">
    {import.meta.env.DEV && new URLSearchParams(window.location.search).get('visualPreview')==='1' && <VisualPreviewControls frame={iframe}/>}
    {rewardQueue[0] && <RewardReveal entry={rewardQueue[0]} remaining={rewardQueue.length - 1} onContinue={() => setRewardQueue(queue => queue.slice(1))}/>}
    {notice && <div className="match-notice" role="status" aria-live="polite" data-testid="status-match-result">{notice.text}</div>}
    {(pendingSave.current || retryResult) && <div className="game-recovery-actions" aria-label="Unfinished game actions">
      {pendingSave.current && <button className="btn btn-sm" onClick={retrySave} disabled={saveProfile.isPending}>Retry save</button>}
      {retryResult && <button className="btn btn-sm" onClick={retry} disabled={finishChallenge.isPending} data-testid="button-retry-result">Retry result</button>}
    </div>}
    {ticket && !gameScreen && <div className="shell challenge-loading" style={{paddingTop:12}}><div className="status-line" data-testid="status-challenge-loading"><Swords size={14} style={{display:'inline',verticalAlign:'middle',marginRight:8}}/>{ready ? 'Arena opponent: ' : 'Preparing battle against '}<strong>{ticket.opponentName}</strong>{!ready && '…'}</div></div>}
    {profileQuery.isLoading || economyQuery.isLoading || !userId || (!profileQuery.isError && profileQuery.data?.playerId !== userId) ? <div className="shell" style={{paddingTop:30}}><QueryState label="Loading your squad"/></div> : profileQuery.isError ? <div className="shell" style={{paddingTop:30}}><QueryState error retry={() => profileQuery.refetch()}/><button className="btn" onClick={() => navigate('/')} style={{marginTop:20}}><ArrowLeft size={15}/> Back</button></div> : economyQuery.isError ? <div className="shell" style={{paddingTop:30}}><QueryState error retry={() => economyQuery.refetch()}/></div> : <iframe key={`${profileQuery.data?.playerId}:${loadAttempt}`} ref={attachIframeRef} className="game-frame" allow="fullscreen; autoplay; screen-wake-lock" allowFullScreen title="Fantasy World Arenas game" src={`${import.meta.env.BASE_URL}game.html?startup=account${import.meta.env.DEV && new URLSearchParams(window.location.search).get('visualPreview')==='1'?'&visualPreview=1':''}`} onLoad={() => {setFrameScrolling();iframe.current?.contentWindow?.postMessage({type:'arena:ping'},window.location.origin);}} data-testid="iframe-game" aria-hidden={gameScreen ? true : undefined} tabIndex={gameScreen ? -1 : undefined} />}
    {loadTimedOut && !ready && frameElement && iframe.current === frameElement && <div className="game-entry-error" role="alert">The game is taking longer than expected. <button className="btn btn-sm" onClick={retryGameLoad}>Retry game</button></div>}
    {ready && gameScreen && <div ref={gameScreenLayer} className="game-screen-layer" role="dialog" aria-modal="true" aria-label={gameScreen === 'store' ? 'Store' : gameScreen === 'arena' ? 'Online Arena' : gameScreen === 'leaderboard' ? 'Arena 3s and 2s ranks' : 'Player Market'} tabIndex={-1}>
      {gameScreen === 'store' ? <Store embedded initialSection={storeSection} onClose={closeGameScreen} onOpenClasses={()=>{closeGameScreen();window.setTimeout(()=>{iframe.current?.contentDocument?.getElementById('classShopBtn')?.click();},50);}}/> :
        gameScreen === 'arena' ? <Arena embedded teamSize={arenaTeamSize} onClose={closeGameScreen} onOpenPlay={enterGameFromArena}/> :
        gameScreen === 'leaderboard' ? <ArenaLeaderboard onClose={closeGameScreen}/> :
        <Market embedded onClose={closeGameScreen} onOpenArena={()=>setGameScreen('arena')} onOpenPlay={closeGameScreen}/>}
    </div>}
    <div className="play-notifications-host"><ArenaNotifications autoOpen={false} openRequested={notificationRequest} onUnreadChange={notifyUnreadChange}/></div>
  </div>;
}