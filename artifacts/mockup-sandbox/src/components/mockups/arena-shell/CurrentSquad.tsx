import "./_group.css";

const classes = [
  { key: "frostmage", name: "Cryomancer", icon: "❄️", role: "Ranged Control Mage", hp: 100 },
  { key: "priest", name: "Priest", icon: "✝️", role: "Ranged Support/Healer", hp: 85 },
  { key: "warrior", name: "Warrior", icon: "⚔️", role: "Tanky Melee Bruiser", hp: 190 },
  { key: "rogue", name: "Rogue", icon: "🗡️", role: "Melee Assassin", hp: 140 },
  { key: "paladin", name: "Paladin", icon: "🛡️", role: "Tanky Melee Bruiser / Support", hp: 170 },
  { key: "archer", name: "Archer", icon: "🏹", role: "Ranged Marksman + Pet", hp: 100 },
  { key: "warlock", name: "Warlock", icon: "💀", role: "Ranged DoT / Shadow", hp: 115 },
  { key: "druid", name: "Druid", icon: "🐾", role: "Shapeshifter Bruiser/Support", hp: 145 },
  { key: "shaman", name: "Shaman", icon: "⚡", role: "Ranged Support/Disruptor", hp: 140 },
];

const portraitUrl = (key: string) =>
  `/__mockup/images/arena-portraits/${key}.jpg`;

export function CurrentSquad() {
  return (
    <main className="min-h-screen">
      <div id="selectScreen">
        <div className="teamBuilderHead">
          <div>
            <h2>🧩 Team &amp; Character Loadout</h2>
            <div>
              Your complete battle setup lives here — heroes, builds, Captain,
              racial, talents, formation and saves.
            </div>
          </div>
          <button className="secondary" id="teamBuilderBackBtn">
            ← Main Menu
          </button>
        </div>
        <div className="modeRow">
          <span className="modeLabel">Mode:</span>
          <button className="modeBtn" data-size="1">1 v 1</button>
          <button className="modeBtn" data-size="2">2 v 2</button>
          <button className="modeBtn selected" data-size="3">3 v 3</button>
          <button className="modeBtn" data-size="5">5 v 5</button>
        </div>
        <div className="teamStatus" style={{ display: "none" }}>
          <span id="teamCount">0</span>/<span id="teamSizeLabel">3</span>
        </div>
        <div id="teamActionRow">
          <div id="teamSlots">
            {[0, 1, 2].map((slot) => (
              <div className="slot" key={slot}>?</div>
            ))}
          </div>
          <div id="battleActionButtons">
            <button className="primary" id="startBtn" disabled>
              Start Battle
            </button>
            <button className="secondary" id="tournamentBtn" style={{ display: "none" }}>
              🏆 Tournament · 100 Gold
            </button>
            <button className="secondary" id="tournamentLeaderboardBtn" style={{ display: "none" }}>
              🏅 Tournament Leaders
            </button>
            <button className="secondary" id="bracketBtn" style={{ display: "none" }}>
              View Tournament
            </button>
          </div>
        </div>
        <div id="underTeamActions">
          <div id="racialRow">
            <button className="secondary" id="racialPickBtn">
              <span id="racialPickIcon">🎖️</span> Captain&apos;s Racial:{" "}
              <span id="racialPickLabel">Choose one</span>
            </button>
          </div>
          <label id="mirrorLabel">
            <input type="checkbox" id="mirrorToggle" /> Fight a mirror of my team
          </label>
        </div>
        <div id="savedTeamsPanel">
          <div className="stHead">
            <div>
              <div className="stTitle">Team tools</div>
              <div className="stHint">
                Your selected heroes are used for Join Game. Loading or editing
                a saved team is optional.
              </div>
            </div>
            <div className="stTools">
              <button className="primary" id="recommendedTeamBtn">
                ✨ Pick Recommended Team
              </button>
              <button className="secondary talentBtn" id="talentsBtn">
                🌟 Talents
              </button>
              <button className="secondary" id="openFormationHelpBtn">
                🧠 Formations
              </button>
            </div>
          </div>
          <details id="savedTeamsDetails">
            <summary>
              Saved Teams{" "}
              <span className="savedTeamsOptional">
                Optional: save, load or edit a 3v3 loadout
              </span>
            </summary>
            <div className="savedTeamsContent">
              <p className="stHint">
                To save a 3v3 team, choose a Captain and racial, one talent per
                hero, and a formation. You can join a game without saving.
              </p>
              <div className="stSaveRow" id="savedTeamSaveRow">
                <input
                  id="savedTeamNameInput"
                  maxLength={22}
                  placeholder="Team name (example: WMP Control)"
                  aria-label="Saved team name"
                />
                <button className="primary" id="saveTeamBtn">
                  Save Current Team
                </button>
              </div>
              <div id="savedTeamMissing" className="stMissing" />
              <div id="savedTeamCards" className="savedTeamCards" />
            </div>
          </details>
        </div>
        <div id="classGrid">
          {classes.map((hero) => (
            <div className="card" data-key={hero.key} key={hero.key}>
              <div className="head">
                <div className="heroPortrait">
                  <img
                    src={portraitUrl(hero.key)}
                    alt={hero.name}
                    draggable={false}
                  />
                </div>
                <div>
                  <div className="name">{hero.name}</div>
                  <div className="role">{hero.role}</div>
                </div>
                <div className="infoBtn" data-key={hero.key} title="View class details">
                  Details
                </div>
                <button className="crownBtn" data-key={hero.key} title="Make Captain (3v3 only)">
                  👑
                </button>
              </div>
              <div className="buildMiniSummary" data-build-summary={hero.key} />
              <ul>
                <li><b>HP:</b> {hero.hp}</li>
              </ul>
              <div className="captainBonus" style={{ display: "none" }}>
                👑 <b>Captain:</b> +10% all stats.
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}