import { useEffect, useRef } from 'react';
import { classNames, type CatalogEntry } from '../data/itemCatalog';
import './RewardReveal.css';

type Props = {
  entry: CatalogEntry;
  remaining: number;
  onContinue: () => void;
};

export default function RewardReveal({ entry, remaining, onContinue }: Props) {
  const continueButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    continueButton.current?.focus();
  }, [entry]);
  return <div className="reward-reveal-backdrop" role="presentation">
    <section className="reward-reveal" role="dialog" aria-modal="true" aria-labelledby="reward-reveal-title" aria-describedby="reward-reveal-description" data-testid="dialog-new-collectible" onKeyDown={event => {
      if (event.key === 'Escape') onContinue();
      if (event.key === 'Tab') {
        event.preventDefault();
        continueButton.current?.focus();
      }
    }}>
      <span className="reward-reveal-kicker">ARENA REWARD · NEW UNLOCK</span>
      <h2 id="reward-reveal-title">Congratulations!</h2>
      <p id="reward-reveal-description">You unlocked a new {entry.kind} after your match.</p>
      <div className="reward-reveal-art">
        <img src={`${import.meta.env.BASE_URL}${entry.art.replace(/^\//, '')}`} alt={`${entry.name} artwork`} />
      </div>
      <span className="reward-reveal-type">{classNames[entry.classId]} · {entry.kind}</span>
      <h3>{entry.name}</h3>
      <p className="reward-reveal-effect">{entry.effect}</p>
      <button ref={continueButton} type="button" className="btn btn-primary" onClick={onContinue} data-testid="button-continue-reward">
        {remaining > 0 ? `Next reward (${remaining} more)` : 'Continue'}
      </button>
    </section>
  </div>;
}