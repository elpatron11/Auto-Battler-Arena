import "./_group.css";

const previewParty = [
  { portrait: "frostmage.jpg", label: "Cryomancer" },
  { portrait: "warrior.jpg", label: "Warrior" },
  { portrait: "priest.jpg", label: "Priest" },
];

const portraitUrl = (file: string) =>
  `/__mockup/images/arena-portraits/${file}`;

export function CurrentMenu() {
  return (
    <main className="min-h-screen">
      <div id="mainHub">
        <div
          id="tournamentResumeWarning"
          className="tournamentResumeWarning"
          style={{ display: "none" }}
          role="status"
        />
        <div className="hubHero">
          <div className="hubHeroCopy">
            <div className="hubEyebrow">ARENA COMMAND</div>
            <div className="hubTitle">Choose Your Next Battle</div>
            <div className="hubSub">
              Build your squad, enter the arena and grow your collection.
            </div>
          </div>
          <div className="hubParty" id="hubPartyVisual">
            {previewParty.map((hero, index) => (
              <div className="hubPartyFace livePreview" key={hero.portrait}>
                <img src={portraitUrl(hero.portrait)} alt={hero.label} />
                <span className="hubPreviewBadge">
                  {index === 0 ? "👑 " : ""}
                  {hero.label}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="hubBody">
          <div className="hubTeamBar" id="hubTeamSummary">
            No active 3v3 team loaded.
          </div>
          <div className="hubPlayPanel">
            <div className="hubPlayTop">
              <div>
                <div className="hubPlayTitle">⚔️ GAME MODE</div>
                <div className="hubPlayHint">
                  Choose the arena size here, then join with your prepared team.
                </div>
              </div>
              <div className="hubPlayControls">
                <div id="hubModeMount">
                  <div className="modeRow">
                    <span className="modeLabel">Mode:</span>
                    <button className="modeBtn" data-size="1">1 v 1</button>
                    <button className="modeBtn" data-size="2">2 v 2</button>
                    <button className="modeBtn selected" data-size="3">3 v 3</button>
                    <button className="modeBtn" data-size="5">5 v 5</button>
                  </div>
                </div>
                <div className="hubTournamentActions">
                  <button className="primary" id="hubJoinBtn">
                    Join Game
                  </button>
                  <button className="secondary" id="hubJoinTournamentBtn">
                    Join Tournament
                  </button>
                  <button className="secondary" id="hubOnlineActionBtn" type="button">
                    Online Arena
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="hubTourStrip">
            <div>
              <b>🏆 Tournament Center</b>
              <br />
              <span>
                Join the Arena Cup, check tournament leaders, your history, and
                overall Arena Rankings.
              </span>
            </div>
            <div>
              <button className="secondary" id="hubTournamentLeadersBtn">
                🏅 Leaders
              </button>
              <button className="secondary" id="hubTournamentHistoryBtn">
                📜 History
              </button>
              <button className="secondary" id="hubArenaRankingsBtn">
                🏆 Rankings
              </button>
            </div>
          </div>
          <div className="hubGrid">
            <button className="hubCard team" id="hubTeamBtn">
              <span className="hi">🧩</span>
              <b>Team &amp; Characters</b>
              <span className="hubDesc">
                Equip heroes, builds, Captain, racial, talents, formation and
                saved teams.
              </span>
              <span className="hubCardArt" id="hubTeamArt">
                <img src={portraitUrl("frostmage.jpg")} alt="" />
              </span>
            </button>
            <button className="hubCard battle" id="hubBattleBtn">
              <span className="hi">⚔️</span>
              <b>Join Game</b>
              <span className="hubDesc">
                Start a match using the game mode selected above.
              </span>
            </button>
            <button className="hubCard tournament" id="hubTournamentBtn">
              <span className="hi">🏆</span>
              <b>Tournament</b>
              <span className="hubDesc">
                Fight through the bracket for Gold and glory.
              </span>
            </button>
            <button className="hubCard defense" id="hubDefenseBtn">
              <span className="hi">🛡️</span>
              <b>Defense</b>
              <span className="hubDesc">
                Set the team that fights challengers while you&apos;re away.
              </span>
            </button>
            <button className="hubCard balance" id="hubBalanceBtn">
              <span className="hi">📊</span>
              <b>Balance Lab</b>
              <span className="hubDesc">
                Test builds, counters and matchup data.
              </span>
            </button>
            <button className="hubCard collection" id="hubCollectionBtn">
              <span className="hi">🏛️</span>
              <b>Collection</b>
              <span className="hubDesc">
                Unlock classes, racials and collectibles.
              </span>
            </button>
            <button className="hubCard online" id="hubArenaBtn">
              <span className="hi">⚔️</span>
              <b>Online Arena</b>
              <span className="hubDesc">
                Challenge defenses, track ranked results and publish your own
                squad.
              </span>
            </button>
            <button className="hubCard collection" id="hubMarketBtn">
              <span className="hi">🪙</span>
              <b>Player Market</b>
              <span className="hubDesc">
                Trade duplicate spells, ultimates and talents for Gold.
              </span>
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}