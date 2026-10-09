import { useState } from "react";
import "./_group.css";
import "./_redesigned.css";

const heroes = [
  { key: "frostmage", name: "Cryomancer", role: "Ranged Control Mage", hp: 100 },
  { key: "priest", name: "Priest", role: "Ranged Support/Healer", hp: 85 },
  { key: "warrior", name: "Warrior", role: "Tanky Melee Bruiser", hp: 190 },
  { key: "rogue", name: "Rogue", role: "Melee Assassin", hp: 140 },
  { key: "paladin", name: "Paladin", role: "Tanky Melee Bruiser / Support", hp: 170 },
  { key: "archer", name: "Archer", role: "Ranged Marksman + Pet", hp: 100 },
  { key: "warlock", name: "Warlock", role: "Ranged DoT / Shadow", hp: 115 },
  { key: "druid", name: "Druid", role: "Shapeshifter Bruiser/Support", hp: 145 },
  { key: "shaman", name: "Shaman", role: "Ranged Support/Disruptor", hp: 140 },
];
const initialTeam = ["frostmage", "warrior", "priest"];
const portrait = (key: string) => `/__mockup/images/arena-portraits/${key}.jpg`;

export function RedesignedSquad() {
  const [team, setTeam] = useState(initialTeam);
  const [captain, setCaptain] = useState<string | null>(null);
  const [mode, setMode] = useState("3");
  const [mirror, setMirror] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const teamHeroes = team.map((key) => heroes.find((hero) => hero.key === key)).filter((hero) => hero !== undefined);
  const toggleHero = (key: string) => {
    setTeam((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      if (current.length >= 3) {
        setNotice("Your 3v3 is full. Remove a hero before adding another.");
        return current;
      }
      setNotice("");
      return [...current, key];
    });
  };
  const teamAction = (action: string) => setNotice(`${action} — ready for production wiring.`);
  return (
    <main className="arena-redesign">
      <div className="ar-wrap ar-squad-wrap">
        <header className="ar-topbar">
          <div className="ar-brand">ARENA&nbsp; / &nbsp;SQUAD</div>
          <div className="ar-currency">Gold&nbsp; 0</div>
        </header>
        <div className="ar-squad-heading" style={{ marginTop: 22 }}>
          <div>
            <div className="ar-eyebrow">Loadout / 3v3</div>
            <h1 className="ar-display" style={{ margin: "7px 0" }}>Your squad</h1>
            <p className="ar-subtitle">Shape the team. Tune the plan. Enter when ready.</p>
          </div>
          <button className="ar-back" type="button" onClick={() => teamAction("Main Menu")}>← Menu</button>
        </div>

        <div className="ar-mode-row" role="group" aria-label="Arena size">
          <span className="ar-label">Mode</span>
          {["1", "2", "3", "5"].map((size) => (
            <button key={size} type="button" aria-pressed={mode === size} onClick={() => setMode(size)}>{size} v {size}</button>
          ))}
        </div>

        <section className="ar-active-panel" aria-label="Active team overview">
          <div className="ar-active-top">
            <div><strong>New Challenger</strong><br /><small>Active team · used for Find Battle</small></div>
            <span className="ar-label">{team.length} / 3</span>
          </div>
          <div className="ar-slot-row">
            {[0, 1, 2].map((index) => {
              const hero = teamHeroes[index];
              return (
                <button className="ar-slot-card" type="button" key={`slot-${index}`} onClick={() => teamAction(hero ? `Edit ${hero.name}` : "Choose a character")} aria-label={hero ? `${hero.name}, open character editor` : "Empty squad slot, choose a character"}>
                  {hero ? <><img src={portrait(hero.key)} alt="" /><span className="ar-slot-copy"><b>{hero.name}</b><small>{captain === hero.key ? "CAPTAIN" : "SLOT " + (index + 1)}</small></span></> :
                    <span className="ar-slot-copy"><b>Open slot</b><small>CHOOSE HERO</small></span>}
                </button>
              );
            })}
          </div>
          <div className="ar-action-line">
            <button className="ar-button gold" type="button" onClick={() => teamAction(`Find Battle · ${mode}v${mode}`)}>Find Battle</button>
            <button className="ar-button" type="button" onClick={() => teamAction("Tournament · 100 Gold")}>Tournament · 100 Gold</button>
          </div>
        </section>

        <section className="ar-section">
          <div className="ar-section-heading">
            <div><h2>Strategy</h2><p>Set the team’s command choices before the match.</p></div>
          </div>
          <div className="ar-strategy-grid">
            <div className="ar-strategy-item">
              <div><strong>Captain</strong><small>{heroes.find((hero) => hero.key === captain)?.name ?? "Choose one"}</small></div>
              <button type="button" onClick={() => {
                if (team.length) {
                  setCaptain(team[0]);
                  setNotice(`Captain set to ${heroes.find((hero) => hero.key === team[0])?.name}.`);
                } else {
                  setNotice("Add a hero to your squad before choosing a Captain.");
                }
              }}>Choose</button>
            </div>
            <div className="ar-strategy-item">
              <div><strong>Captain’s Racial</strong><small>Choose one</small></div>
              <button type="button" onClick={() => teamAction("Choose Captain’s Racial")}>Choose</button>
            </div>
            <div className="ar-strategy-item">
              <div><strong>Formation</strong><small>Not set</small></div>
              <button type="button" onClick={() => teamAction("Formations")}>View</button>
            </div>
            <div className="ar-strategy-item">
              <div><strong>Mirror match</strong><small>Fight a mirror of my team</small></div>
              <label className="ar-toggle"><input type="checkbox" checked={mirror} onChange={(event) => setMirror(event.target.checked)} />{mirror ? "On" : "Off"}</label>
            </div>
          </div>
          <div className="ar-action-line">
            <button className="ar-button" type="button" onClick={() => teamAction("Talents")}>Talents</button>
            <button className="ar-button" type="button" onClick={() => teamAction("Recommended Team")}>Pick Recommended Team</button>
          </div>
        </section>

        <section className="ar-section">
          <div className="ar-section-heading">
            <div><h2>Saved teams</h2><p>Load, edit, or save a team. Your active selection remains ready for battle.</p></div>
          </div>
          <div className="ar-saves">
            {[1, 2, 3].map((slot) => (
              <div className="ar-save-slot" key={slot}>
                <div><strong>Team slot {slot}</strong><small>{slot === 1 ? "No saved team" : "Empty slot"}</small></div>
                <button type="button" onClick={() => teamAction(slot === 1 ? "Save current team" : "Load saved team")}>{slot === 1 ? "Save" : "Load"}</button>
              </div>
            ))}
          </div>
          <div className="ar-action-line">
            <button className="ar-button" type="button" onClick={() => teamAction("Save Current Team")}>Save current team</button>
            <button className="ar-button" type="button" onClick={() => teamAction("Edit saved teams")}>Manage saves</button>
          </div>
        </section>

        <section className="ar-section">
          <div className="ar-section-heading">
            <div><h2>Character roster</h2><p>Tap a hero to add or remove them from your active squad.</p></div>
            <span className="ar-label">{team.length} / 3</span>
          </div>
          <div className="ar-edit-grid">
            {heroes.map((hero) => (
              <button className="ar-hero-card" key={hero.key} type="button" aria-pressed={team.includes(hero.key)} onClick={() => toggleHero(hero.key)}>
                <img src={portrait(hero.key)} alt="" />
                <span><b>{hero.name}</b><small>{hero.role}</small></span>
              </button>
            ))}
          </div>
          <div className="ar-build-panel">
            <button className="ar-button wide" type="button" aria-expanded={buildOpen} onClick={() => setBuildOpen(!buildOpen)}>{buildOpen ? "Hide character build tools" : "Open character build tools"}</button>
            {buildOpen && <p>Choose a hero above, then use Details, Captain, talents, and build editing in the character editor. Existing class, build, and character editing destinations stay available here.</p>}
          </div>
        </section>

        <div className="ar-secondary" aria-label="More squad destinations">
          {["Class Details", "Defense", "Tournament Leaders", "Balance Lab"].map((item) => (
            <button className="ar-link-button" key={item} type="button" onClick={() => teamAction(item)}>{item}</button>
          ))}
        </div>
      </div>
      {notice && <div className="ar-toast" role="status" onClick={() => setNotice("")}>{notice} · tap to dismiss</div>}
    </main>
  );
}