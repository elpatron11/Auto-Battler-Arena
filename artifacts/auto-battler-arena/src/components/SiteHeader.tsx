import { useClerk } from '@clerk/react';
import { Link, useLocation } from 'wouter';
import { getGetArenaProfileQueryKey, useGetArenaProfile } from '@workspace/api-client-react';
import { Brand } from './Brand';
import { InstallControl } from './InstallControl';
import { clearLocalGame } from '../lib/arena';

export function SiteHeader({ signedIn = false }: { signedIn?: boolean }) {
  const { signOut } = useClerk();
  const [path] = useLocation();
  const profile = useGetArenaProfile(undefined,{query:{enabled:signedIn,queryKey:getGetArenaProfileQueryKey()}});
  return <header className="shell topnav">
    <Brand />
    <nav className="navlinks" aria-label="Main navigation">
      <InstallControl />
      {signedIn ? <>
        <Link href="/play" className={`navlink ${path === '/play' ? 'active' : ''}`} data-testid="link-play">Play game</Link>
        <Link href="/arena" className={`navlink ${path === '/arena' ? 'active' : ''}`} data-testid="link-arena">Arena</Link>
        <Link href="/guilds" className={`navlink ${path.startsWith('/guild') ? 'active' : ''}`} data-testid="link-guilds">Guilds</Link>
        {profile.data && <Link href={`/arena/profiles/${encodeURIComponent(profile.data.playerId)}`} className={`navlink ${path === `/arena/profiles/${profile.data.playerId}` ? 'active' : ''}`} data-testid="link-my-arena-profile">My profile</Link>}
        <Link href="/market" className={`navlink ${path === '/market' ? 'active' : ''}`} data-testid="link-market">Trading post</Link>
        <button className="btn btn-sm" data-testid="button-sign-out" onClick={() => { clearLocalGame(); void signOut({ redirectUrl: import.meta.env.BASE_URL || '/' }); }}>Sign out</button>
      </> : <>
        <Link href="/sign-in" className="navlink" data-testid="link-sign-in">Sign in</Link>
        <Link href="/sign-up" className="btn btn-primary btn-sm" data-testid="link-sign-up">Enter arena</Link>
      </>}
    </nav>
  </header>;
}