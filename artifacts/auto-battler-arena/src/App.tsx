import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ClerkProvider, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import Auth from './pages/Auth';
import Play from './pages/Play';
import GuestPlay from './pages/GuestPlay';
import Arena from './pages/Arena';
import ArenaProfile from './pages/ArenaProfile';
import { ArenaNotifications } from './components/ArenaNotifications';
import Market from './pages/Market';
import Store from './pages/Store';
import Guilds from './pages/Guilds';
import GuildWars from './pages/GuildWars';
import NotFound from './pages/not-found';
import { clearLocalGame } from './lib/arena';

const queryClient = new QueryClient({defaultOptions:{queries:{retry:1,staleTime:20_000}}});
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName:'clerk',
  options:{
    logoPlacement:'inside' as const,
    logoLinkUrl:basePath || '/',
    logoImageUrl:`${window.location.origin}${basePath}/fantasy-logo.svg`,
    socialButtonsPlacement:'bottom' as const,
  },
  variables:{
    colorPrimary:'#efc563',colorForeground:'#f0e9d7',colorMutedForeground:'#b1bed0',
    colorDanger:'#f0a9a6',colorBackground:'#202c3d',colorInput:'#111927',
    colorInputForeground:'#f0e9d7',colorNeutral:'#8997ab',
    fontFamily:'DM Sans, sans-serif',borderRadius:'6px',
  },
  elements:{
    rootBox:'w-full flex justify-center',
    cardBox:'w-[440px] max-w-full overflow-hidden rounded-md bg-[#202c3d]',
    card:'!shadow-none !border-0 !bg-transparent !rounded-none',
    footer:'!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle:'!text-[#f0e9d7] !font-bold',
    headerSubtitle:'!text-[#b1bed0]',
    socialButtonsBlockButtonText:'!text-[#f0e9d7]',
    formFieldLabel:'!text-[#f0e9d7]',
    footerActionLink:'!text-[#efc563]',
    footerActionText:'!text-[#b1bed0]',
    dividerText:'!text-[#b1bed0]',
    identityPreviewEditButton:'!text-[#efc563]',
    formFieldSuccessText:'!text-[#a1dfbc]',
    alertText:'!text-[#fac3b9]',
    logoBox:'!justify-start',
    logoImage:'!h-12 !w-auto',
    socialButtonsBlockButton:'!border-[#67758a] !bg-[#2b394c]',
    formButtonPrimary:'!bg-[#efc563] !text-[#111722] !font-bold',
    formFieldInput:'!bg-[#111927] !text-[#f0e9d7] !border-[#67758a]',
    footerAction:'!bg-transparent',
    dividerLine:'!bg-[#67758a]',
    alert:'!bg-[#412b30]',
    otpCodeFieldInput:'!bg-[#111927] !text-[#f0e9d7]',
    formFieldRow:'!text-[#f0e9d7]',
    main:'!text-[#f0e9d7]',
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({user}) => {
      const id = user?.id ?? null;
      if (previous.current !== undefined && previous.current !== id) {
        client.clear();
        clearLocalGame();
      }
      previous.current = id;
    });
    return unsubscribe;
  },[addListener,client]);
  return null;
}

function EntryRoute() {
  const {isLoaded,isSignedIn} = useAuth();
  if (!isLoaded) return <div className="site" style={{padding:40}}><div className="skeleton" style={{height:70,marginBottom:30}}/><div className="skeleton" style={{height:380,maxWidth:700}}/></div>;
  return <Redirect to={isSignedIn ? '/play' : '/try'}/>;
}
function Protected({children,showNotifications=true}:{children:ReactNode;showNotifications?:boolean}) {
  const {isLoaded,isSignedIn} = useAuth();
  if (!isLoaded) return <div className="site" style={{padding:40}}><div className="skeleton" style={{height:60,marginBottom:25}}/><div className="skeleton" style={{height:470}}/></div>;
  return isSignedIn ? <>{showNotifications && <ArenaNotifications/>}{children}</> : <Redirect to="/sign-in"/>;
}
function RoutedBoundary({children}:{children:ReactNode}) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function Routes() {
  return <RoutedBoundary><Switch>
    <Route path="/" component={EntryRoute}/>
    <Route path="/sign-in/*?">{()=><Auth mode="in"/>}</Route>
    <Route path="/sign-up/*?">{()=><Auth mode="up"/>}</Route>
    <Route path="/try">{()=><GuestRoute/>}</Route>
    <Route path="/play">{()=><Protected showNotifications={false}><Play/></Protected>}</Route>
    <Route path="/arena/profiles/:playerId">{()=><Protected><ArenaProfile/></Protected>}</Route>
    <Route path="/arena">{()=><Protected><Arena/></Protected>}</Route>
    <Route path="/store">{()=><Store initialSection={new URLSearchParams(window.location.search).get('section') === 'battle-pass' ? 'battle-pass' : 'featured'}/>}</Route>
    <Route path="/market">{()=><Protected><Market/></Protected>}</Route>
    <Route path="/guilds">{()=><Protected><Guilds/></Protected>}</Route>
    <Route path="/guild-wars">{()=><Protected><GuildWars/></Protected>}</Route>
    <Route component={NotFound}/>
  </Switch></RoutedBoundary>;
}
function GuestRoute() {
  const {isLoaded,isSignedIn} = useAuth();
  if (!isLoaded) return <div className="site" style={{padding:40}}>Loading…</div>;
  return isSignedIn ? <Redirect to="/play"/> : <GuestPlay/>;
}
declare global { interface Window { ArenaStartup?: { ready(): void; wait(): void; fail(): void; readonly done: boolean } } }
// Releases the pre-React cover only when auth, route and (for game routes) the
// iframe's own startup-visible handshake are all complete.
function StartupGate() {
  const {isLoaded} = useAuth();
  const [loc] = useLocation();
  const [visibleFor,setVisibleFor] = useState<string|null>(null);
  const needsGame = loc === '/play' || loc === '/try';
  useEffect(() => {
    if (!needsGame || visibleFor === loc || window.ArenaStartup?.done) return;
    const frame = () => document.querySelector<HTMLIFrameElement>('iframe.game-frame');
    const onMessage = (e: MessageEvent) => {
      const f = frame();
      if (e.origin !== window.location.origin || !f || e.source !== f.contentWindow) return;
      if (e.data?.type === 'arena:startup-visible') setVisibleFor(loc);
    };
    window.addEventListener('message', onMessage);
    // Recover if visibility was announced before this listener existed.
    const ping = () => frame()?.contentWindow?.postMessage({type:'arena:ping'}, window.location.origin);
    ping();
    const timer = window.setInterval(ping, 400);
    return () => { window.removeEventListener('message', onMessage); window.clearInterval(timer); };
  },[needsGame,loc,visibleFor]);
  const ready = isLoaded && (needsGame ? visibleFor === loc : loc !== '/');
  useEffect(() => {
    if (ready) window.ArenaStartup?.ready(); else window.ArenaStartup?.wait();
  },[ready]);
  return null;
}
function ClerkProviderWithRoutes() {
  const [,setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn:{start:{title:'Return to the arena',subtitle:'Your squad is waiting for its commander.'}},
      signUp:{start:{title:'Join the challengers',subtitle:'Make a name. Build a squad. Take the field.'}},
    }}
    routerPush={(to)=>setLocation(stripBase(to))}
    routerReplace={(to)=>setLocation(stripBase(to),{replace:true})}
  >
    <QueryClientProvider client={queryClient}>
      <ClerkQueryClientCacheInvalidator/>
      <StartupGate/>
      <TooltipProvider><Routes/><Toaster/></TooltipProvider>
    </QueryClientProvider>
  </ClerkProvider>;
}
function App() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
    const register = () => { void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}); };
    window.addEventListener('load', register);
    if (document.readyState === 'complete') register();
    return () => window.removeEventListener('load', register);
  }, []);
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes/></WouterRouter>;
}
export default App;