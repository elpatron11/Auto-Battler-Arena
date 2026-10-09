import { useState } from "react";
import "./_group.css";
import "./_redesigned.css";

const squad = [
  { portrait: "frostmage.jpg", name: "Cryomancer" },
  { portrait: "warrior.jpg", name: "Warrior" },
  { portrait: "priest.jpg", name: "Priest" },
];
const image = (file: string) => `/__mockup/images/arena-portraits/${file}`;

export function RedesignedMenu() {
  const [notice, setNotice] = useState("");
  const go = (destination: string) => setNotice(`${destination} selected — destination retained for game wiring.`);
  return (
    <main className="arena-redesign">
      <div className="ar-wrap">
        <header className="ar-topbar">
          <div className="ar-brand">ARENA&nbsp; / &nbsp;COMMAND</div>
          <div className="ar-top-right">
            <div className="ar-currency" aria-label="Gold balance">Gold&nbsp; 0</div>
            <button className="ar-icon-button" type="button" aria-label="Open player profile" onClick={() => go("Profile")}>N</button>
          </div>
        </header>

        <div className="ar-menu-title">
          <div className="ar-eyebrow">The arena awaits</div>
          <h1 className="ar-display" style={{ margin: "8px 0 7px" }}>Prepare.<br />Then enter.</h1>
          <p className="ar-subtitle">Your three are ready. Set the terms of the fight.</p>
        </div>

        <section className="ar-squad-feature" aria-label="Active team">
          <div className="ar-feature-head">
            <div>
              <div className="ar-label">Active 3v3 team</div>
              <h2 className="ar-team-name">New Challenger</h2>
            </div>
            <div className="ar-record">0 W&nbsp; / &nbsp;0 L</div>
          </div>
          <div className="ar-portraits">
            {squad.map((hero) => (
              <div className="ar-portrait" key={hero.name}>
                <img src={image(hero.portrait)} alt={hero.name} />
                <div className="ar-portrait-name">
                  {hero.name}
                </div>
              </div>
            ))}
          </div>
          <div className="ar-team-foot">
            <div className="ar-metrics">
              <div className="ar-metric"><strong>1000</strong><span>RATING</span></div>
              <div className="ar-metric"><strong>3 / 3</strong><span>FIELDED</span></div>
            </div>
            <button className="ar-inline-link" type="button" onClick={() => go("Squad")}>Edit squad&nbsp; ↗</button>
          </div>
        </section>

        <button className="ar-battle" type="button" onClick={() => go("Find Battle · 3v3")}>
          <span><strong>FIND BATTLE</strong><small>3 v 3 · Active team</small></span><span aria-hidden="true">↗</span>
        </button>

        <nav className="ar-nav" aria-label="Primary destinations">
          <button type="button" onClick={() => go("Tournaments")}><span>01</span>Tournaments</button>
          <button type="button" onClick={() => go("Squad")}><span>02</span>Squad</button>
          <button type="button" onClick={() => go("Collection")}><span>03</span>Collection</button>
          <button type="button" onClick={() => go("Rankings")}><span>04</span>Rankings</button>
        </nav>
        <div className="ar-secondary" aria-label="Account actions">
          <button className="ar-link-button" type="button" onClick={() => go("Profile")}>Profile</button>
          <button className="ar-link-button" type="button" onClick={() => go("Defense")}>Defense</button>
          <button className="ar-link-button" type="button" onClick={() => go("Online Arena")}>Online Arena</button>
          <button className="ar-link-button" type="button" onClick={() => go("Player Market")}>Player Market</button>
        </div>
        <details className="ar-menu-more">
          <summary>More arena services</summary>
          <div className="ar-menu-more-list">
            {["Tournament Leaders", "Tournament History", "Balance Lab", "Class Hall"].map((item) => (
              <button key={item} type="button" onClick={() => go(item)}>{item}</button>
            ))}
          </div>
        </details>
      </div>
      {notice && <div className="ar-toast" role="status" onClick={() => setNotice("")}>{notice} · tap to dismiss</div>}
    </main>
  );
}