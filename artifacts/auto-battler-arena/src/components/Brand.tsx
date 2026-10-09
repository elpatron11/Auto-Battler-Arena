import { Link } from 'wouter';

export function Brand() {
  return <Link href="/" className="brand" data-testid="link-home" aria-label="Fantasy World Arenas home"><img className="brand-mark" src={`${import.meta.env.BASE_URL}fantasy-logo.svg`} alt=""/><span>FANTASY WORLD<br/>ARENAS</span></Link>;
}