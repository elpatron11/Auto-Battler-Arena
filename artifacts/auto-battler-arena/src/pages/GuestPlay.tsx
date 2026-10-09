import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import Store from './Store';
import { useGameFrameScrolling } from '../lib/useGameFrameScrolling';
import { VisualPreviewControls } from '../components/VisualPreviewControls';

const COUNT_KEY = 'arena:guest-quick-matches:v1';
const LIMIT = 3;
function readCount(): number {
  try {
    const count = Number(localStorage.getItem(COUNT_KEY));
    return Number.isInteger(count) ? Math.max(0, Math.min(LIMIT, count)) : 0;
  } catch { return 0; }
}

export default function GuestPlay() {
  const [, navigate] = useLocation();
  const frame = useRef<HTMLIFrameElement>(null);
  const [store,setStore] = useState<'featured'|'battle-pass'|null>(null);
  const setFrameScrolling = useGameFrameScrolling(frame, 48);
  const [count, setCount] = useState(readCount);
  const [ready, setReady] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [prompt, setPrompt] = useState(false);
  const [practiceAvailable, setPracticeAvailable] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);
  useEffect(() => {
    if (!ready || new URLSearchParams(window.location.search).get('open') !== 'classes') return;
    frame.current?.contentDocument?.getElementById('classShopBtn')?.click();
    navigate('/try', { replace: true });
  }, [ready, navigate]);
  useEffect(() => {
    if (ready) return;
    const ping = () => frame.current?.contentWindow?.postMessage({type:'arena:ping'}, window.location.origin);
    ping();
    const timer = window.setInterval(ping, 500);
    const timeout = window.setTimeout(() => setLoadTimedOut(true), 9000);
    return () => { window.clearInterval(timer); window.clearTimeout(timeout); };
  }, [ready, attempt]);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'arena:ready') setReady(true);
      if (event.data?.type === 'arena:open-store') setStore(event.data.section === 'battle-pass' ? 'battle-pass' : 'featured');
      if (event.data?.type === 'arena:practice-available') setPracticeAvailable(true);
      if (event.data?.type === 'arena:practice-dialog-open') {
        setPracticeOpen(true);
        setPrompt(false);
      }
      if (event.data?.type === 'arena:practice-dialog-closed') setPracticeOpen(false);
      if (event.data?.type === 'arena:guest-match-finished' || event.data?.type === 'arena:guest-status') {
        const next = Number(event.data.count);
        if (!Number.isInteger(next) || next < 0 || next > LIMIT) return;
        setCount(next);
        if (next >= LIMIT) setPrompt(true);
      }
      if (event.data?.type === 'arena:guest-account-required') setPrompt(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  useEffect(() => {
    if (!ready || count < LIMIT || prompt || practiceOpen) return;
    setPrompt(true);
  }, [ready, count, prompt, practiceOpen]);
  function openPractice() {
    if (!practiceAvailable) return;
    setPracticeOpen(true);
    setPrompt(false);
    frame.current?.contentWindow?.postMessage({ type: 'arena:open-practice' }, window.location.origin);
  }
  return <div className="site play-surface guest-play">
    {import.meta.env.DEV && new URLSearchParams(window.location.search).get('visualPreview')==='1' && <VisualPreviewControls frame={frame}/>}
    <iframe key={attempt} ref={frame} className="game-frame" allow="fullscreen; autoplay; screen-wake-lock" allowFullScreen title="Guest quick match" src={`${import.meta.env.BASE_URL}game.html?guest=1${import.meta.env.DEV && new URLSearchParams(window.location.search).get('visualPreview')==='1'?'&visualPreview=1':''}`} onLoad={() => {setFrameScrolling();frame.current?.contentWindow?.postMessage({type:'arena:ping'},window.location.origin);}} data-testid="iframe-guest-game"/>
    {loadTimedOut && !ready && <div className="game-entry-error" role="alert">The game is taking longer than expected. <button className="btn btn-sm" onClick={() => {setLoadTimedOut(false);setReady(false);setPracticeAvailable(false);setPracticeOpen(false);setAttempt(n=>n+1);}}>Retry game</button><Link href="/sign-in">Sign in</Link></div>}
    {ready && <nav className="guest-toolbar" aria-label="Guest trial">
      <span>{practiceOpen ? <><strong>Admin practice</strong> · all content unlocked</> : <><strong>Guest trial</strong> · {count}/{LIMIT} quick matches</>}</span>
      <div><Link href="/sign-in">Sign in</Link><Link href="/sign-up">Create account</Link></div>
    </nav>}
    {store && <div className="game-screen-layer" role="dialog" aria-modal="true" aria-label="Store"><Store embedded initialSection={store} onClose={()=>setStore(null)} onOpenClasses={()=>{setStore(null);window.setTimeout(()=>frame.current?.contentDocument?.getElementById('classShopBtn')?.click(),50);}}/></div>}
    {prompt && ready && !practiceOpen && <div className="guest-gate" role="dialog" aria-modal="true" aria-labelledby="guest-gate-title" data-testid="guest-account-prompt">
      <div className="guest-gate-card">
        <span className="eyebrow">Trial complete · 3 of 3 matches</span>
        <h1 id="guest-gate-title">READY FOR THE REAL ARENA?</h1>
        <p>You’ve tried the quick matches. Create an account or sign in to keep playing, earn Gold, build your own squad, and challenge other players.</p>
        <p className="guest-disclaimer">Guest practice results and trial progress are not transferred to your account.</p>
        <div className="guest-gate-actions"><Link className="btn btn-primary" href="/sign-up">Create account</Link><Link className="btn" href="/sign-in">Sign in</Link></div>
        <button type="button" className="btn btn-sm" style={{marginTop:16}} onClick={openPractice} disabled={!practiceAvailable} data-testid="button-guest-admin-practice">Admin practice · Enter code</button>
      </div>
    </div>}
  </div>;
}