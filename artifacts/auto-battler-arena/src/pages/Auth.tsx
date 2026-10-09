import { SignIn, SignUp } from '@clerk/react';
import { Brand } from '../components/Brand';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function Auth({ mode }: { mode: 'in' | 'up' }) {
  return <div className="site auth-layout">
    <aside className="auth-story"><Brand/><div><span className="eyebrow">The next match is yours</span><h1 className="display">MAKE<br/>YOUR<br/><span style={{color:'#efc563'}}>MARK.</span></h1><p className="muted" style={{maxWidth:390,lineHeight:1.7}}>Your squad, your tactics, your record. Step into an arena that remembers every victory.</p></div><span className="mono muted">Fantasy World Arenas / Challenger access</span></aside>
    <main className="auth-panel">{mode === 'in' ? <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={`${basePath}/play`}/> : <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} fallbackRedirectUrl={`${basePath}/play`}/>}</main>
  </div>;
}