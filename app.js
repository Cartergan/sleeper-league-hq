const LEAGUE_ID = "1339982718628274176";
const API = "https://api.sleeper.app/v1";

const CACHE_TTL = 24 * 60 * 60 * 1000;

const DRAFT_COMBINE_DATE = "2026-09-05T10:30:00-06:00";
const NFL_KICKOFF_DATE = "2026-09-09T20:20:00-04:00";

const NEWS_API =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=12";

const PLAYER_CACHE_KEY = "league_hq_nfl_players_v1";

const state = {
  league: null,
  users: [],
  rosters: [],
  nfl: null,
  players: {},
  playerRows: [],

  matchups: [],
  transactions: [],
  winners: [],
  losers: [],

  loading: true,
  error: null,
  week: 1,
  route: "home",
  news: [],

  playerSearch: "",
  playerPosition: "ALL",
  playerSort: "search_rank",
  playerSortDirection: "asc"
};

const $ = (selector) => document.querySelector(selector);

async function get(path) {
  const response = await fetch(`${API}${path}`);

  if (!response.ok) {
    throw new Error(`Sleeper request failed: ${response.status}`);
  }

  return response.json();
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "—";

  const number = Number(value);

  if (!Number.isFinite(number)) return "—";

  return number.toLocaleString();
}

function setStatus(text, type = "live") {
  const statusText = $("#status-text");
  const dot = $("#status-dot");

  if (statusText) statusText.textContent = text;

  if (dot) {
    dot.classList.remove("live", "error");

    if (type === "live") dot.classList.add("live");
    if (type === "error") dot.classList.add("error");
  }
}

function showToast(message) {
  const toast = $("#toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(window.__toastTimer);

  window.__toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

/* =========================================================
   PLAYER DATA
   ========================================================= */

async function loadPlayers() {
  try {
    const cached = localStorage.getItem(PLAYER_CACHE_KEY);

    if (cached) {
      const parsed = JSON.parse(cached);

      if (
        parsed &&
        parsed.timestamp &&
        Date.now() - parsed.timestamp < CACHE_TTL &&
        parsed.players
      ) {
        state.players = parsed.players;
        buildPlayerRows();
        return;
      }
    }
  } catch (error) {
    console.warn("Player cache could not be read.", error);
  }

  try {
    setStatus("Updating NFL player database…", "live");

    const players = await get("/players/nfl");

    state.players = players || {};

    try {
      localStorage.setItem(
        PLAYER_CACHE_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          players: state.players
        })
      );
    } catch (error) {
      console.warn("Player cache could not be saved.", error);
    }

    buildPlayerRows();
  } catch (error) {
    console.error(error);

    setStatus("Player database unavailable", "error");
  }
}

function buildPlayerRows() {
  const rostered = new Set();

  state.rosters.forEach((roster) => {
    (roster.players || []).forEach((playerId) => {
      rostered.add(String(playerId));
    });
  });

  state.playerRows = Object.values(state.players)
    .filter((player) => {
      if (!player) return false;

      if (player.sport !== "nfl") return false;

      /*
       * Ignore team-defense IDs and players without
       * useful fantasy positions.
       */
      if (!player.fantasy_positions?.length) return false;

      return true;
    })
    .map((player) => {
      const playerId = String(player.player_id);

      return {
        id: playerId,
        name:
          player.full_name ||
          [player.first_name, player.last_name]
            .filter(Boolean)
            .join(" ") ||
          "Unknown Player",

        firstName: player.first_name || "",
        lastName: player.last_name || "",

        position:
          player.fantasy_positions?.[0] ||
          player.position ||
          "—",

        positions: player.fantasy_positions || [],

        team: player.team || "FA",

        status: player.status || "",

        injuryStatus: player.injury_status || "",

        searchRank:
          Number.isFinite(Number(player.search_rank))
            ? Number(player.search_rank)
            : 999999,

        depthChartPosition:
          Number.isFinite(Number(player.depth_chart_position))
            ? Number(player.depth_chart_position)
            : 999,

        depthChartOrder:
          Number.isFinite(Number(player.depth_chart_order))
            ? Number(player.depth_chart_order)
            : 999,

        yearsExp:
          Number.isFinite(Number(player.years_exp))
            ? Number(player.years_exp)
            : 0,

        age:
          Number.isFinite(Number(player.age))
            ? Number(player.age)
            : null,

        rostered: rostered.has(playerId)
      };
    });
}

/* =========================================================
   LEAGUE DATA
   ========================================================= */

async function load() {
  state.loading = true;

  try {
    setStatus("Loading Sleeper data…");

    const [
      league,
      users,
      rosters,
      nfl,
      matchups,
      winners,
      losers
    ] = await Promise.all([
      get(`/league/${LEAGUE_ID}`),
      get(`/league/${LEAGUE_ID}/users`),
      get(`/league/${LEAGUE_ID}/rosters`),
      get("/state/nfl"),
      get(`/league/${LEAGUE_ID}/matchups/${state.week}`),
      get(`/league/${LEAGUE_ID}/winners_bracket`),
      get(`/league/${LEAGUE_ID}/losers_bracket`)
    ]);

    state.league = league;
    state.users = users || [];
    state.rosters = rosters || [];
    state.nfl = nfl || {};
    state.matchups = matchups || [];
    state.winners = winners || [];
    state.losers = losers || [];

    state.week =
      Number(nfl?.display_week) ||
      Number(nfl?.week) ||
      state.week ||
      1;

    /*
     * Transactions are separate because the API requires
     * a week/round.
     */
    try {
      const transactionResults = await Promise.all(
        Array.from({ length: Math.min(state.week, 18) }, (_, index) =>
          get(`/league/${LEAGUE_ID}/transactions/${index + 1}`).catch(
            () => []
          )
        )
      );

      state.transactions = transactionResults
        .flat()
        .sort(
          (a, b) =>
            Number(b.created || 0) - Number(a.created || 0)
        );
    } catch (error) {
      state.transactions = [];
    }

    buildPlayerRows();

    updateLeagueChrome();

    state.loading = false;
    state.error = null;

    setStatus("Live league data");

    render();
  } catch (error) {
    console.error(error);

    state.loading = false;
    state.error = error;

    setStatus("Unable to load Sleeper data", "error");

    render();
  }
}

function updateLeagueChrome() {
  if (!state.league) return;

  const brandName = $("#brand-name");
  const brandSeason = $("#brand-season");
  const sleeperLink = $("#sleeper-link");
  const lastUpdated = $("#last-updated");

  if (brandName) {
    brandName.textContent = state.league.name || "League HQ";
  }

  if (brandSeason) {
    brandSeason.textContent =
      `Sleeper Fantasy Football · ${state.league.season || ""}`;
  }

  if (sleeperLink) {
    sleeperLink.href =
      `https://sleeper.com/leagues/${LEAGUE_ID}`;
  }

  if (lastUpdated) {
    lastUpdated.textContent =
      `Updated ${new Date().toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
      })}`;
  }
}

/* =========================================================
   NEWS
   ========================================================= */

async function loadNews() {
  try {
    const response = await fetch(NEWS_API);

    if (!response.ok) throw new Error("News request failed");

    const data = await response.json();

    state.news = (data.articles || []).slice(0, 12);

    if (state.route === "home") {
      renderNews();
    }
  } catch (error) {
    state.news = [
      {
        headline: "NFL news feed temporarily unavailable",
        description: "Check back shortly for the latest league news."
      },
      {
        headline: "League HQ is ready for football season",
        description: "Live league information is powered by Sleeper."
      }
    ];

    if (state.route === "home") {
      renderNews();
    }
  }
}

function renderNews() {
  const container = $("#news-list");

  if (!container) return;

  const items = state.news.length
    ? state.news
    : [
        {
          headline: "Loading NFL news…",
          description: ""
        }
      ];

  container.innerHTML = `
    <div class="news-track">
      ${items
        .map(
          (item) => `
            <div class="news-item">
              <strong>${escapeHTML(
                item.headline || item.title || "NFL News"
              )}</strong>
              ${
                item.description
                  ? `<small>${escapeHTML(
                      item.description
                    )}</small>`
                  : ""
              }
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

/* =========================================================
   COUNTDOWNS
   ========================================================= */

function countdownParts(target) {
  const difference =
    new Date(target).getTime() - Date.now();

  if (difference <= 0) {
    return {
      total: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0
    };
  }

  const totalSeconds = Math.floor(difference / 1000);

  return {
    total: difference,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60
  };
}

function updateCountdowns() {
  const draft = countdownParts(DRAFT_COMBINE_DATE);
  const nfl = countdownParts(NFL_KICKOFF_DATE);

  const draftDays = $("#draft-days");
  const draftHours = $("#draft-hours");
  const draftMinutes = $("#draft-minutes");
  const draftSeconds = $("#draft-seconds");

  const nflDays = $("#nfl-days");
  const nflHours = $("#nfl-hours");
  const nflMinutes = $("#nfl-minutes");
  const nflSeconds = $("#nfl-seconds");

  if (draftDays) draftDays.textContent = draft.days;
  if (draftHours) draftHours.textContent = String(draft.hours).padStart(2, "0");
  if (draftMinutes) draftMinutes.textContent = String(draft.minutes).padStart(2, "0");
  if (draftSeconds) draftSeconds.textContent = String(draft.seconds).padStart(2, "0");

  if (nflDays) nflDays.textContent = nfl.days;
  if (nflHours) nflHours.textContent = String(nfl.hours).padStart(2, "0");
  if (nflMinutes) nflMinutes.textContent = String(nfl.minutes).padStart(2, "0");
  if (nflSeconds) nflSeconds.textContent = String(nfl.seconds).padStart(2, "0");
}

/* =========================================================
   ROUTING
   ========================================================= */

function route() {
  const hash = window.location.hash.replace("#", "").trim();

  state.route = hash || "home";

  document.querySelectorAll("#nav a").forEach((link) => {
    link.classList.toggle(
      "active",
      link.dataset.route === state.route
    );
  });

  render();
}

window.addEventListener("hashchange", route);

/* =========================================================
   HOME
   ========================================================= */

function homePage() {
  return `
    <section class="hero">
      <div class="hero-inner">
        <h1>Welcome to League HQ.</h1>
        <p>
          The home base for standings, matchups, transactions,
          players and everything happening in your fantasy league.
        </p>
      </div>
    </section>

    <section class="event-board">

      <div class="event-card">
        <div class="event-card-head">
          <strong>Draft Pick Combine</strong>
          <span>Sept. 5 · 10:30 AM</span>
        </div>

        <div class="event-card-body">
          <div class="countdown">
            ${countdownUnit("draft-days", "Days")}
            ${countdownUnit("draft-hours", "Hours")}
            ${countdownUnit("draft-minutes", "Min")}
            ${countdownUnit("draft-seconds", "Sec")}
          </div>
        </div>
      </div>

      <div class="event-card">
        <div class="event-card-head">
          <strong>NFL Kickoff</strong>
          <span>Week 1</span>
        </div>

        <div class="event-card-body">
          <p class="event-title">
            Patriots @ Seahawks
          </p>

          <div class="countdown">
            ${countdownUnit("nfl-days", "Days")}
            ${countdownUnit("nfl-hours", "Hours")}
            ${countdownUnit("nfl-minutes", "Min")}
            ${countdownUnit("nfl-seconds", "Sec")}
          </div>
        </div>
      </div>

      <div class="event-card">
        <div class="event-card-head">
          <strong>NFL News</strong>
          <span>Latest</span>
        </div>

        <div class="event-card-body">
          <div id="news-list" class="news-list"></div>
        </div>
      </div>

    </section>

    ${homeStats()}
  `;
}

function countdownUnit(id, label) {
  return `
    <div class="countdown-unit">
      <div class="countdown-number" id="${id}">0</div>
      <div class="countdown-label">${label}</div>
    </div>
  `;
}

function homeStats() {
  const teams = state.rosters.length;

  const moves = state.transactions.length;

  return `
    <section class="grid grid-3 section">

      <div class="card stat-card">
        <div class="stat-label">League Teams</div>
        <div class="stat-value">${teams}</div>
        <div class="stat-sub">Active rosters</div>
      </div>

      <div class="card stat-card">
        <div class="stat-label">Current Week</div>
        <div class="stat-value">${state.week}</div>
        <div class="stat-sub">NFL season</div>
      </div>

      <div class="card stat-card">
        <div class="stat-label">Transactions</div>
        <div class="stat-value">${moves}</div>
        <div class="stat-sub">Loaded league moves</div>
      </div>

    </section>
  `;
}

/* =========================================================
   PLAYERS PAGE
   ========================================================= */

function playersPage() {
  const players = getFilteredPlayers();

  return `
    <section class="card players-page">

      <div class="card-head players-heading">
        <div>
          <h2>Players</h2>
          <p class="players-description">
            NFL player rankings and league availability
          </p>
        </div>

        <span>${formatNumber(players.length)} players</span>
      </div>

      <div class="players-controls">

        <div class="player-search">
          <input
            id="player-search"
            type="search"
            placeholder="Search players..."
            value="${escapeHTML(state.playerSearch)}"
            autocomplete="off"
          >
        </div>

        <div class="position-filter">
          ${["ALL", "QB", "RB", "WR", "TE", "K"].map(
            (position) => `
              <button
                class="${
                  state.playerPosition === position
                    ? "selected"
                    : ""
                }"
                data-position="${position}"
              >
                ${position}
              </button>
            `
          ).join("")}
        </div>

      </div>

      <div class="players-table-wrap">
        ${playersTable(players)}
      </div>

    </section>
  `;
}

function getFilteredPlayers() {
  let players = [...state.playerRows];

  if (state.playerPosition !== "ALL") {
    players = players.filter((player) =>
      player.positions.includes(state.playerPosition)
    );
  }

  const search = state.playerSearch
    .trim()
    .toLowerCase();

  if (search) {
    players = players.filter((player) => {
      return (
        player.name.toLowerCase().includes(search) ||
        player.team.toLowerCase().includes(search) ||
        player.position.toLowerCase().includes(search)
      );
    });
  }

  players.sort((a, b) => {
    let aValue = a[state.playerSort];
    let bValue = b[state.playerSort];

    if (state.playerSort === "name") {
      aValue = a.name.toLowerCase();
      bValue = b.name.toLowerCase();
    }

    if (aValue === bValue) return 0;

    if (typeof aValue === "string") {
      return state.playerSortDirection === "asc"
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    return state.playerSortDirection === "asc"
      ? Number(aValue) - Number(bValue)
      : Number(bValue) - Number(aValue);
  });

  return players;
}

function playersTable(players) {
  if (!players.length) {
    return `
      <div class="empty-state">
        <strong>No players found.</strong>
        <span>Try a different search or position.</span>
      </div>
    `;
  }

  return `
    <table class="players-table">

      <thead>
        <tr>
          ${playerHeader("search_rank", "Rank")}
          ${playerHeader("name", "Player")}
          ${playerHeader("position", "Pos")}
          ${playerHeader("team", "Team")}
          <th>Status</th>
          <th>Injury</th>
          ${playerHeader("age", "Age")}
          ${playerHeader("yearsExp", "Exp")}
          <th>League</th>
        </tr>
      </thead>

      <tbody>
        ${players
          .map(
            (player, index) => `
              <tr>

                <td class="player-rank">
                  ${
                    player.searchRank < 999999
                      ? player.searchRank
                      : index + 1
                  }
                </td>

                <td>
                  <div class="player-name">
                    ${escapeHTML(player.name)}
                  </div>
                </td>

                <td>
                  <span class="position-badge">
                    ${escapeHTML(player.position)}
                  </span>
                </td>

                <td class="player-team">
                  ${escapeHTML(player.team)}
                </td>

                <td>
                  <span class="player-status">
                    ${escapeHTML(player.status || "—")}
                  </span>
                </td>

                <td>
                  ${
                    player.injuryStatus
                      ? `<span class="injury">${escapeHTML(
                          player.injuryStatus
                        )}</span>`
                      : "—"
                  }
                </td>

                <td>
                  ${player.age ?? "—"}
                </td>

                <td>
                  ${player.yearsExp}
                </td>

                <td>
                  ${
                    player.rostered
                      ? `<span class="badge win">ROSTERED</span>`
                      : `<span class="badge">FREE AGENT</span>`
                  }
                </td>

              </tr>
            `
          )
          .join("")}
      </tbody>

    </table>
  `;
}

function playerHeader(key, label) {
  const active = state.playerSort === key;

  let arrow = "";

  if (active) {
    arrow =
      state.playerSortDirection === "asc"
        ? " ↑"
        : " ↓";
  }

  return `
    <th>
      <button
        class="player-sort"
        data-sort="${key}"
      >
        ${label}${arrow}
      </button>
    </th>
  `;
}

function attachPlayerEvents() {
  const search = $("#player-search");

  if (search) {
    search.addEventListener("input", (event) => {
      state.playerSearch = event.target.value;

      const cursor = event.target.selectionStart;

      render();

      const newSearch = $("#player-search");

      if (newSearch) {
        newSearch.focus();

        try {
          newSearch.setSelectionRange(cursor, cursor);
        } catch (error) {}
      }
    });
  }

  document
    .querySelectorAll("[data-position]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        state.playerPosition = button.dataset.position;
        render();
      });
    });

  document
    .querySelectorAll("[data-sort]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const sort = button.dataset.sort;

        if (state.playerSort === sort) {
          state.playerSortDirection =
            state.playerSortDirection === "asc"
              ? "desc"
              : "asc";
        } else {
          state.playerSort = sort;
          state.playerSortDirection = "asc";
        }

        render();
      });
    });
}

/* =========================================================
   STANDINGS
   ========================================================= */

function standingsPage() {
  const rows = state.rosters
    .map((roster) => {
      const owner = state.users.find(
        (user) => user.user_id === roster.owner_id
      );

      return {
        ...roster,
        ownerName:
          owner?.metadata?.team_name ||
          owner?.display_name ||
          owner?.username ||
          "Team",
        wins: Number(roster.settings?.wins || 0),
        losses: Number(roster.settings?.losses || 0),
        ties: Number(roster.settings?.ties || 0),
        points: Number(roster.settings?.fpts || 0)
      };
    })
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.points - a.points;
    });

  return `
    <section class="card">
      <div class="card-head">
        <h2>Standings</h2>
        <span>Week ${state.week}</span>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Team</th>
              <th>W</th>
              <th>L</th>
              <th>T</th>
              <th>PF</th>
            </tr>
          </thead>

          <tbody>
            ${rows
              .map(
                (team, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td><strong>${escapeHTML(
                      team.ownerName
                    )}</strong></td>
                    <td>${team.wins}</td>
                    <td>${team.losses}</td>
                    <td>${team.ties}</td>
                    <td>${team.points.toFixed(1)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

/* =========================================================
   TEAMS
   ========================================================= */

function teamsPage() {
  return `
    <section class="grid grid-3">
      ${state.rosters.map(teamCard).join("")}
    </section>
  `;
}

function teamCard(roster) {
  const owner = state.users.find(
    (user) => user.user_id === roster.owner_id
  );

  const name =
    owner?.metadata?.team_name ||
    owner?.display_name ||
    owner?.username ||
    "Team";

  return `
    <div class="team-card">

      <div class="team-card-head">
        <strong>${escapeHTML(name)}</strong>
      </div>

      <div class="team-card-body">

        <div class="stat-label">Record</div>

        <div class="stat-value">
          ${roster.settings?.wins || 0}-
          ${roster.settings?.losses || 0}
        </div>

        <div class="stat-sub">
          ${roster.players?.length || 0} players
        </div>

      </div>

    </div>
  `;
}

/* =========================================================
   MATCHUPS
   ========================================================= */

function matchupsPage() {
  const groups = {};

  state.matchups.forEach((matchup) => {
    const id = matchup.matchup_id || `solo-${matchup.roster_id}`;

    if (!groups[id]) groups[id] = [];

    groups[id].push(matchup);
  });

  return `
    <section class="grid grid-2">
      ${Object.values(groups)
        .map((group) => matchupCard(group))
        .join("")}
    </section>
  `;
}

function matchupCard(group) {
  return `
    <div class="card">

      <div class="card-head">
        <h2>Week ${state.week}</h2>
        <span>Matchup</span>
      </div>

      <div style="padding:14px">
        ${group
          .map(
            (team) => `
              <div style="
                display:flex;
                justify-content:space-between;
                gap:12px;
                padding:9px 0;
                border-bottom:1px solid #e8e3da;
              ">
                <strong>
                  ${escapeHTML(teamName(team.roster_id))}
                </strong>

                <strong>
                  ${Number(team.points || 0).toFixed(1)}
                </strong>
              </div>
            `
          )
          .join("")}
      </div>

    </div>
  `;
}

function teamName(rosterId) {
  const roster = state.rosters.find(
    (item) => item.roster_id === rosterId
  );

  if (!roster) return "Team";

  const owner = state.users.find(
    (user) => user.user_id === roster.owner_id
  );

  return (
    owner?.metadata?.team_name ||
    owner?.display_name ||
    owner?.username ||
    "Team"
  );
}

/* =========================================================
   TRANSACTIONS
   ========================================================= */

function transactionsPage() {
  const transactions = state.transactions.slice(0, 50);

  return `
    <section class="card">

      <div class="card-head">
        <h2>Moves</h2>
        <span>Latest transactions</span>
      </div>

      <div class="table-wrap">

        <table>

          <thead>
            <tr>
              <th>Type</th>
              <th>Week</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            ${
              transactions.length
                ? transactions
                    .map(
                      (transaction) => `
                        <tr>
                          <td>
                            <strong>
                              ${escapeHTML(
                                transaction.type ||
                                  "Transaction"
                              )}
                            </strong>
                          </td>

                          <td>
                            ${transaction.leg || "—"}
                          </td>

                          <td>
                            ${
                              transaction.created
                                ? new Date(
                                    transaction.created
                                  ).toLocaleDateString()
                                : "—"
                            }
                          </td>

                          <td>
                            <span class="badge">
                              ${escapeHTML(
                                transaction.status ||
                                  "—"
                              )}
                            </span>
                          </td>
                        </tr>
                      `
                    )
                    .join("")
                : `
                  <tr>
                    <td colspan="4">
                      No transactions available.
                    </td>
                  </tr>
                `
            }
          </tbody>

        </table>

      </div>

    </section>
  `;
}

/* =========================================================
   PLAYOFFS
   ========================================================= */

function playoffsPage() {
  return `
    <section class="grid grid-2">

      <div class="card">
        <div class="card-head">
          <h2>Winners Bracket</h2>
          <span>Playoffs</span>
        </div>

        <div style="padding:14px">
          ${bracketList(state.winners)}
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>Losers Bracket</h2>
          <span>Playoffs</span>
        </div>

        <div style="padding:14px">
          ${bracketList(state.losers)}
        </div>
      </div>

    </section>
  `;
}

function bracketList(bracket) {
  if (!bracket?.length) {
    return `<div class="stat-sub">No playoff bracket available yet.</div>`;
  }

  return bracket
    .map(
      (match) => `
        <div style="
          padding:10px 0;
          border-bottom:1px solid #e8e3da;
        ">
          <div class="stat-label">
            Round ${match.r || "—"} · Match ${match.m || "—"}
          </div>

          <div style="margin-top:5px;font-size:11px">
            ${
              match.t1
                ? teamName(match.t1)
                : "TBD"
            }
            <span style="color:#77736c"> vs </span>
            ${
              match.t2
                ? teamName(match.t2)
                : "TBD"
            }
          </div>
        </div>
      `
    )
    .join("");
}

/* =========================================================
   RENDER
   ========================================================= */

function render() {
  const content = $("#content");

  if (!content) return;

  let page;

  if (state.loading && !state.league) {
    content.innerHTML = `
      <div class="loading-screen">
        <div class="spinner"></div>
        <h1>Opening the league book…</h1>
        <p>Pulling live data from Sleeper.</p>
      </div>
    `;

    return;
  }

  if (state.error && !state.league) {
    content.innerHTML = `
      <div class="card" style="padding:30px;text-align:center">
        <h2>League data couldn't be loaded.</h2>
        <p class="stat-sub">
          Check your connection and refresh the page.
        </p>
      </div>
    `;

    return;
  }

  switch (state.route) {
    case "standings":
      page = standingsPage();
      break;

    case "matchups":
      page = matchupsPage();
      break;

    case "teams":
      page = teamsPage();
      break;

    case "players":
      page = playersPage();
      break;

    case "transactions":
      page = transactionsPage();
      break;

    case "playoffs":
      page = playoffsPage();
      break;

    case "home":
    default:
      page = homePage();
      break;
  }

  content.innerHTML = page;

  if (state.route === "home") {
    renderNews();
    updateCountdowns();
  }

  if (state.route === "players") {
    attachPlayerEvents();
  }
}

/* =========================================================
   REFRESH / THEME
   ========================================================= */

$("#refresh")?.addEventListener("click", async () => {
  showToast("Refreshing league data…");
  await load();

  if (state.route === "players") {
    buildPlayerRows();
    render();
  }
});

$("#theme")?.addEventListener("click", () => {
  document.body.classList.toggle("dark");

  localStorage.setItem(
    "league_hq_dark",
    document.body.classList.contains("dark")
      ? "1"
      : "0"
  );
});

if (localStorage.getItem("league_hq_dark") === "1") {
  document.body.classList.add("dark");
}

/* =========================================================
   STARTUP
   ========================================================= */

route();

load();

loadPlayers();

loadNews();

setInterval(updateCountdowns, 1000);

setInterval(loadNews, 10 * 60 * 1000);

setInterval(load, 5 * 60 * 1000);
