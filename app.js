const LEAGUE_ID="1339982718628274176";
const API="https://api.sleeper.app/v1";
const CACHE_TTL=24*60*60*1000;

/* =========================================================
   LEAGUE HQ EVENTS
   ========================================================= */

const DRAFT_COMBINE_DATE="2026-09-05T10:30:00-06:00";

/*
   NFL Kickoff:
   Patriots @ Seahawks
   September 9, 2026 — 8:20 PM ET
*/
const NFL_KICKOFF_DATE="2026-09-09T20:20:00-04:00";

const NEWS_API="https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=12";

const state={
  league:null,
  users:[],
  rosters:[],
  nfl:null,
  players:{},
  matchups:[],
  transactions:[],
  winners:[],
  losers:[],
  loading:true,
  error:null,
  week:1,
  route:"home",
  news:[]
};


/* =========================================================
   HELPERS
   ========================================================= */

const $=s=>document.querySelector(s);

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({
  '&':'&amp;',
  '<':'&lt;',
  '>':'&gt;',
  '"':'&quot;',
  "'":'&#39;'
}[c]));

const fmt=n=>Number(n||0).toLocaleString(undefined,{
  maximumFractionDigits:2
});

const initials=n=>(
  String(n||"?")
  .split(/\s+/)
  .map(x=>x[0])
  .join("")
  .slice(0,2)||"?"
).toUpperCase();

const avatarUrl=id=>id
  ? `https://sleepercdn.com/avatars/${id}`
  : "";


/* =========================================================
   TEAM / PLAYER HELPERS
   ========================================================= */

function owner(rid){
  const r=state.rosters.find(x=>x.roster_id===Number(rid));
  return state.users.find(u=>u.user_id===r?.owner_id)||{};
}

function teamName(rid){
  const u=owner(rid);
  const r=state.rosters.find(x=>x.roster_id===Number(rid));

  return u?.metadata?.team_name ||
    u?.display_name ||
    u?.username ||
    `Team ${r?.roster_id??rid}`;
}

function avatar(rid,cls="avatar"){
  const u=owner(rid);
  const url=avatarUrl(u.avatar);

  return url
    ? `<img class="${cls}" src="${url}" alt="" loading="lazy"
        onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
       <span class="${cls}" style="display:none">${initials(teamName(rid))}</span>`
    : `<span class="${cls}">${initials(teamName(rid))}</span>`;
}

function playerName(id){
  const p=state.players[id];

  return p
    ? `${p.first_name||""} ${p.last_name||""}`.trim()||id
    : id||"Unknown";
}

function playerMeta(id){
  const p=state.players[id];

  return p
    ? `${p.fantasy_positions?.[0]||p.position||""}${p.team?" • "+p.team:""}`
    : "";
}


/* =========================================================
   SLEEPER API
   ========================================================= */

async function get(path){
  const r=await fetch(API+path,{cache:"no-store"});

  if(!r.ok){
    throw new Error(`Sleeper API returned ${r.status}`);
  }

  return r.json();
}

async function loadPlayers(){

  try{
    const c=JSON.parse(
      localStorage.getItem("sleeper_players_nfl")||"null"
    );

    if(
      c?.ts &&
      Date.now()-c.ts<CACHE_TTL
    ){
      state.players=c.data;
      return;
    }
  }catch{}

  try{
    state.players=await get("/players/nfl");

    localStorage.setItem(
      "sleeper_players_nfl",
      JSON.stringify({
        ts:Date.now(),
        data:state.players
      })
    );

  }catch(e){
    console.warn(e);
  }
}


/* =========================================================
   NFL NEWS
   ========================================================= */

const fallbackNews=[
  "NFL KICKOFF IS ALMOST HERE — PATRIOTS @ SEAHAWKS",
  "FANTASY FOOTBALL SEASON IS HERE",
  "ROSTERS ARE GETTING FINALIZED ACROSS THE LEAGUE",
  "WEEK 1 IS RIGHT AROUND THE CORNER",
  "THE ROAD TO THE CHAMPIONSHIP STARTS NOW"
];

async function loadNews(){

  try{

    const r=await fetch(NEWS_API,{cache:"no-store"});

    if(!r.ok){
      throw new Error("News request failed");
    }

    const data=await r.json();

    const stories=(data.articles||[])
      .map(x=>x.headline||x.title)
      .filter(Boolean)
      .slice(0,10);

    state.news=stories.length
      ? stories
      : fallbackNews;

  }catch(e){

    console.warn("NFL news unavailable:",e);

    state.news=fallbackNews;
  }

  renderNews();
}

function renderNews(){

  const ticker=$("#news-track");

  if(!ticker) return;

  const stories=state.news.length
    ? state.news
    : fallbackNews;

  const items=stories
    .map((headline,i)=>`
      <span class="news-item">
        <b>${String(i+1).padStart(2,"0")}</b>
        ${esc(headline)}
      </span>
      <span class="news-separator">◆</span>
    `)
    .join("");

  /*
     Duplicate the content so the scrolling animation
     can loop seamlessly.
  */

  ticker.innerHTML=items+items;
}


/* =========================================================
   COUNTDOWNS
   ========================================================= */

function countdownParts(target){

  const diff=new Date(target).getTime()-Date.now();

  if(diff<=0){
    return {
      complete:true,
      days:"00",
      hours:"00",
      minutes:"00",
      seconds:"00"
    };
  }

  const totalSeconds=Math.floor(diff/1000);

  const days=Math.floor(totalSeconds/86400);

  const hours=Math.floor(
    (totalSeconds%86400)/3600
  );

  const minutes=Math.floor(
    (totalSeconds%3600)/60
  );

  const seconds=totalSeconds%60;

  return {
    complete:false,
    days:String(days).padStart(2,"0"),
    hours:String(hours).padStart(2,"0"),
    minutes:String(minutes).padStart(2,"0"),
    seconds:String(seconds).padStart(2,"0")
  };
}

function updateCountdowns(){

  const draft=countdownParts(DRAFT_COMBINE_DATE);
  const nfl=countdownParts(NFL_KICKOFF_DATE);

  const draftEl=$("#draft-countdown");
  const nflEl=$("#nfl-countdown");

  if(draftEl){

    draftEl.innerHTML=draft.complete
      ? `<div class="countdown-live">COMBINE COMPLETE</div>`
      : `
        <div class="countdown-time">
          <div>
            <strong>${draft.days}</strong>
            <span>DAYS</span>
          </div>
          <i>:</i>
          <div>
            <strong>${draft.hours}</strong>
            <span>HRS</span>
          </div>
          <i>:</i>
          <div>
            <strong>${draft.minutes}</strong>
            <span>MIN</span>
          </div>
          <i>:</i>
          <div>
            <strong>${draft.seconds}</strong>
            <span>SEC</span>
          </div>
        </div>
      `;
  }

  if(nflEl){

    nflEl.innerHTML=nfl.complete
      ? `<div class="countdown-live">KICKOFF IS LIVE</div>`
      : `
        <div class="countdown-time">
          <div>
            <strong>${nfl.days}</strong>
            <span>DAYS</span>
          </div>
          <i>:</i>
          <div>
            <strong>${nfl.hours}</strong>
            <span>HRS</span>
          </div>
          <i>:</i>
          <div>
            <strong>${nfl.minutes}</strong>
            <span>MIN</span>
          </div>
          <i>:</i>
          <div>
            <strong>${nfl.seconds}</strong>
            <span>SEC</span>
          </div>
        </div>
      `;
  }
}


/* =========================================================
   LOAD LEAGUE
   ========================================================= */

async function load(){

  state.loading=true;
  state.error=null;

  render();

  try{

    const [
      league,
      users,
      rosters,
      nfl
    ]=await Promise.all([

      get(`/league/${LEAGUE_ID}`),

      get(`/league/${LEAGUE_ID}/users`),

      get(`/league/${LEAGUE_ID}/rosters`),

      get("/state/nfl")
    ]);

    if(
      !league ||
      league.league_id!==LEAGUE_ID
    ){
      throw new Error("Wrong Sleeper league returned");
    }

    Object.assign(state,{
      league,
      users:users||[],
      rosters:rosters||[],
      nfl:nfl||{}
    });

    state.week=Math.max(
      1,
      Number(
        nfl?.display_week ||
        nfl?.week ||
        league?.settings?.leg ||
        1
      )
    );

    await loadPlayers();

    const w=Math.min(
      Math.max(state.week,1),
      18
    );

    const [
      matchups,
      winners,
      losers,
      tx
    ]=await Promise.all([

      get(`/league/${LEAGUE_ID}/matchups/${w}`)
        .catch(()=>[]),

      get(`/league/${LEAGUE_ID}/winners_bracket`)
        .catch(()=>[]),

      get(`/league/${LEAGUE_ID}/losers_bracket`)
        .catch(()=>[]),

      get(`/league/${LEAGUE_ID}/transactions/${w}`)
        .catch(()=>[])
    ]);

    Object.assign(state,{
      matchups:matchups||[],
      winners:winners||[],
      losers:losers||[],
      transactions:tx||[],
      loading:false
    });

    $("#status-dot").classList.remove("error");

    $("#status-text").textContent=
      "Live from Sleeper";

    $("#last-updated").textContent=
      "Updated "+
      new Date().toLocaleTimeString([],{
        hour:"numeric",
        minute:"2-digit"
      });

    render();

  }catch(e){

    console.error(e);

    state.loading=false;
    state.error=e;

    $("#status-dot").classList.add("error");

    $("#status-text").textContent=
      "Unable to load Sleeper";

    render();
  }
}


/* =========================================================
   STANDINGS
   ========================================================= */

function standings(){

  return [...state.rosters].sort(
    (a,b)=>
      Number(b.settings?.wins||0)-
      Number(a.settings?.wins||0) ||

      Number(b.settings?.fpts||0)-
      Number(a.settings?.fpts||0)
  );
}

function matchupGroups(){

  const m={};

  state.matchups.forEach(
    x=>(m[x.matchup_id]??=[]).push(x)
  );

  return Object.values(m)
    .filter(g=>g.length);
}


/* =========================================================
   MATCHUPS
   ========================================================= */

function matchupCard(g){

  const a=g[0];
  const b=g[1];

  if(!b){

    return `
      <div class="matchup-card">

        <div class="week">
          Week ${state.week} · Bye
        </div>

        <div class="matchup-teams">

          <div class="match-team">
            ${avatar(a.roster_id)}
            <div class="team-name">
              ${esc(teamName(a.roster_id))}
            </div>
            <div class="score">
              ${fmt(a.points)}
            </div>
          </div>

          <div class="vs">BYE</div>

          <div></div>

        </div>

      </div>
    `;
  }

  const ap=+a.points||0;
  const bp=+b.points||0;

  return `
    <div class="matchup-card">

      <div class="week">
        Week ${state.week} · Head to head
      </div>

      <div class="matchup-teams">

        <div class="match-team ${
          ap>bp?"win":ap<bp?"loss":""
        }">

          ${avatar(a.roster_id)}

          <div class="team-name">
            ${esc(teamName(a.roster_id))}
          </div>

          <div class="score">
            ${fmt(ap)}
          </div>

        </div>

        <div class="vs">VS</div>

        <div class="match-team ${
          bp>ap?"win":bp<ap?"loss":""
        }">

          ${avatar(b.roster_id)}

          <div class="team-name">
            ${esc(teamName(b.roster_id))}
          </div>

          <div class="score">
            ${fmt(bp)}
          </div>

        </div>

      </div>

    </div>
  `;
}


/* =========================================================
   TEAM ROW
   ========================================================= */

function teamRow(r,i){

  const s=r.settings||{};
  const u=owner(r.roster_id);

  const w=+s.wins||0;
  const l=+s.losses||0;
  const t=+s.ties||0;

  return `
    <tr>

      <td class="rank">
        ${i+1}
      </td>

      <td>

        <div class="team-cell">

          ${avatar(r.roster_id)}

          <div>

            <div class="team-name">
              ${esc(teamName(r.roster_id))}
            </div>

            <div class="team-owner">
              ${esc(u.display_name||u.username||"")}
            </div>

          </div>

        </div>

      </td>

      <td>
        ${w}-${l}${t?`-${t}`:""}
      </td>

      <td>
        ${fmt(s.fpts)}
      </td>

      <td>
        ${fmt(s.fpts_against)}
      </td>

      <td>
        ${(
          (w/Math.max(1,w+l+t))*100
        ).toFixed(1)}%
      </td>

    </tr>
  `;
}


/* =========================================================
   POWER RANKINGS
   ========================================================= */

function powerRankings(){

  return standings()
    .map((r,i)=>{

      const s=r.settings||{};

      const w=+s.wins||0;
      const l=+s.losses||0;
      const pf=+s.fpts||0;

      const score=Math.round(
        w*10+
        pf/100-
        l*4
      );

      const note=
        i===0
          ?"The standard"
          :i===1
            ?"Right on the leader"
            :i===standings().length-1
              ?"Needs a miracle"
              :"In the hunt";

      return {
        r,
        i,
        score,
        note
      };
    })
    .sort((a,b)=>b.score-a.score);
}


/* =========================================================
   AWARDS
   ========================================================= */

function awards(){

  const rows=standings();

  const top=rows
    .slice()
    .sort(
      (a,b)=>
        (+b.settings?.fpts||0)-
        (+a.settings?.fpts||0)
    )[0];

  const best=rows[0];

  const worst=rows[rows.length-1];

  const high=matchupGroups()
    .flatMap(g=>g)
    .slice()
    .sort(
      (a,b)=>
        (+b.points||0)-
        (+a.points||0)
    )[0];

  return {
    best,
    worst,
    top,
    high
  };
}


/* =========================================================
   HOME PAGE
   ========================================================= */

function home(){

  const sorted=standings();
  const a=awards();

  const total=state.rosters.length;

  const power=powerRankings().slice(0,5);

  return `

    <section class="hero" data-number="01">

      <div class="hero-row">

        <div>

          <div class="eyebrow">
            ${esc(state.league?.season||"NFL")}
            · League headquarters
            · ${esc(state.league?.status||"active")}
          </div>

          <h1>
            ${esc(state.league?.name||"Fantasy League")}
          </h1>

          <p>
            The league book for standings, matchups,
            rosters, moves, playoff receipts and everything
            your group will argue about until next season.
          </p>

        </div>

        <div class="hero-actions">

          <button
            class="btn secondary"
            onclick="copyShare()">
            Copy Share Link
          </button>

          <a
            class="btn"
            href="#standings">
            View Standings
          </a>

        </div>

      </div>

    </section>


    <!-- =================================================
         COUNTDOWNS + NEWS
         ================================================= -->

    <section class="event-board">

      <!-- DRAFT PICK COMBINE -->

      <article class="event-card draft-event">

        <div class="event-top">

          <div>

            <div class="event-kicker">
              NEXT LEAGUE EVENT
            </div>

            <h2>
              DRAFT PICK COMBINE
            </h2>

          </div>

          <div class="event-icon">
            🏈
          </div>

        </div>

        <div
          id="draft-countdown"
          class="countdown">
        </div>

        <div class="event-date">
          SATURDAY · SEPTEMBER 5 · 10:30 AM
        </div>

      </article>


      <!-- NFL KICKOFF -->

      <article class="event-card nfl-event">

        <div class="event-top">

          <div>

            <div class="event-kicker">
              2026 NFL KICKOFF
            </div>

            <h2>
              PATRIOTS @ SEAHAWKS
            </h2>

          </div>

          <div class="event-icon">
            🏟
          </div>

        </div>

        <div
          id="nfl-countdown"
          class="countdown">
        </div>

        <div class="event-date">
          WEDNESDAY · SEPTEMBER 9 · 8:20 PM ET
        </div>

      </article>


      <!-- NEWS -->

      <article class="event-card news-event">

        <div class="event-top">

          <div>

            <div class="event-kicker">
              AROUND THE LEAGUE
            </div>

            <h2>
              NFL NEWS
            </h2>

          </div>

          <div class="event-icon">
            📰
          </div>

        </div>

        <div class="news-window">

          <div
            id="news-track"
            class="news-track">
          </div>

        </div>

        <div class="event-date">
          LIVE NFL HEADLINES · UPDATES AUTOMATICALLY
        </div>

      </article>

    </section>


    <div class="grid grid-4">

      <div class="panel metric">

        <div class="label">
          Teams
        </div>

        <div class="value">
          ${total}
        </div>

        <div class="sub">
          Active league rosters
        </div>

      </div>

      <div class="panel metric">

        <div class="label">
          Current week
        </div>

        <div class="value">
          ${state.week}
        </div>

        <div class="sub">
          ${esc(state.nfl?.season_type||"NFL")}
        </div>

      </div>

      <div class="panel metric hot">

        <div class="label">
          Regular-season leader
        </div>

        <div
          class="value"
          style="font-size:20px">

          ${esc(teamName(a.best?.roster_id))}

        </div>

        <div class="sub">
          ${a.best?.settings?.wins||0}-
          ${a.best?.settings?.losses||0}
        </div>

      </div>

      <div class="panel metric hot">

        <div class="label">
          Points leader
        </div>

        <div
          class="value"
          style="font-size:20px">

          ${esc(teamName(a.top?.roster_id))}

        </div>

        <div class="sub">
          ${fmt(a.top?.settings?.fpts)}
          total PF
        </div>

      </div>

    </div>


    <div class="section-label">

      <div>

        <span class="num">
          02
        </span>

        <h2>
          League pulse
        </h2>

      </div>

      <p>
        What matters right now
      </p>

    </div>


    <div class="grid grid-2">

      <section class="panel">

        <div class="panel-title">

          <h2>
            Standings
          </h2>

          <a
            class="small"
            href="#standings">
            See all →
          </a>

        </div>

        <div class="table-wrap">

          <table class="table">

            <thead>

              <tr>
                <th>#</th>
                <th>Team</th>
                <th>W-L</th>
                <th>PF</th>
              </tr>

            </thead>

            <tbody>

              ${sorted.slice(0,6).map(
                (r,i)=>`
                  <tr>

                    <td class="rank">
                      ${i+1}
                    </td>

                    <td>

                      <div class="team-cell">

                        ${avatar(r.roster_id)}

                        <div class="team-name">
                          ${esc(teamName(r.roster_id))}
                        </div>

                      </div>

                    </td>

                    <td>
                      ${r.settings?.wins||0}-
                      ${r.settings?.losses||0}
                    </td>

                    <td>
                      ${fmt(r.settings?.fpts)}
                    </td>

                  </tr>
                `
              ).join("")}

            </tbody>

          </table>

        </div>

      </section>


      <section class="panel">

        <div class="panel-title">

          <h2>
            Week ${state.week} matchups
          </h2>

          <a
            class="small"
            href="#matchups">
            See all →
          </a>

        </div>

        <div class="cards">

          ${
            matchupGroups()
              .slice(0,3)
              .map(matchupCard)
              .join("")
            ||
            `
              <div class="muted small">
                No matchup data yet.
              </div>
            `
          }

        </div>

      </section>

    </div>


    <div class="section-label">

      <div>

        <span class="num">
          03
        </span>

        <h2>
          Power rankings
        </h2>

      </div>

      <p>
        Unofficial · mathematically inspired · absolutely debatable
      </p>

    </div>


    <section class="panel">

      <div class="power-list">

        ${power.map((x,i)=>`

          <div class="power-row">

            <div class="power-rank">
              ${String(i+1).padStart(2,"0")}
            </div>

            <div>

              <div class="power-name">
                ${esc(teamName(x.r.roster_id))}
              </div>

              <div class="power-note">
                ${esc(x.note)}
                ·
                ${x.r.settings?.wins||0}-
                ${x.r.settings?.losses||0}
              </div>

            </div>

            <div class="power-score">
              ${x.score}
            </div>

          </div>

        `).join("")}

      </div>

    </section>


    <div class="section-label">

      <div>

        <span class="num">
          04
        </span>

        <h2>
          Weekly awards
        </h2>

      </div>

      <p>
        Receipts from the current week
      </p>

    </div>


    <div class="grid grid-3">

      <div class="panel award">

        <div class="tag">
          Most points this week
        </div>

        <h3>
          ${esc(teamName(a.high?.roster_id)||"—")}
        </h3>

        <p>
          ${
            a.high
              ? fmt(a.high.points)+" points"
              : "No completed score yet"
          }
        </p>

        <div class="stamp">
          01
        </div>

      </div>


      <div class="panel award">

        <div class="tag">
          Season scoring king
        </div>

        <h3>
          ${esc(teamName(a.top?.roster_id)||"—")}
        </h3>

        <p>
          ${fmt(a.top?.settings?.fpts)}
          total points
        </p>

        <div class="stamp">
          02
        </div>

      </div>


      <div class="panel award">

        <div class="tag">
          Best record
        </div>

        <h3>
          ${esc(teamName(a.best?.roster_id)||"—")}
        </h3>

        <p>
          ${a.best?.settings?.wins||0}-
          ${a.best?.settings?.losses||0}
          record
        </p>

        <div class="stamp">
          03
        </div>

      </div>

    </div>


    <div class="section-label">

      <div>

        <span class="num">
          05
        </span>

        <h2>
          Last-place watch
        </h2>

      </div>

      <p>
        The part nobody wants to see
      </p>

    </div>


    <section class="panel punishment">

      <div class="label">
        Current bottom of the table
      </div>

      <h3>
        ${esc(teamName(a.worst?.roster_id)||"—")}
      </h3>

      <p>
        ${a.worst?.settings?.wins||0}-
        ${a.worst?.settings?.losses||0}
        ·
        ${fmt(a.worst?.settings?.fpts)}
        PF.
        The league office has officially opened
        the shame file.
      </p>

    </section>

  `;
}


/* =========================================================
   OTHER PAGES
   ========================================================= */

function standingsPage(){

  return `
    <div class="hero" data-number="06">

      <div class="eyebrow">
        League book · ${esc(state.league?.season||"")}
      </div>

      <h1 style="font-size:50px">
        Standings
      </h1>

      <p>
        Regular-season record, scoring,
        points against and win percentage.
      </p>

    </div>

    <section class="panel">

      <div class="table-wrap">

        <table class="table">

          <thead>

            <tr>
              <th>#</th>
              <th>Team</th>
              <th>Record</th>
              <th>PF</th>
              <th>PA</th>
              <th>Win %</th>
            </tr>

          </thead>

          <tbody>
            ${standings().map(teamRow).join("")}
          </tbody>

        </table>

      </div>

    </section>
  `;
}


function matchupsPage(){

  return `
    <div class="hero" data-number="07">

      <div class="eyebrow">
        Current scoring week
      </div>

      <h1 style="font-size:50px">
        Week ${state.week}
      </h1>

      <p>
        Live matchup totals as reported by Sleeper.
        Winner gets bragging rights; loser gets receipts.
      </p>

    </div>

    <div class="cards">

      ${
        matchupGroups()
          .map(matchupCard)
          .join("")
        ||
        `
          <div class="panel muted">
            No matchups found.
          </div>
        `
      }

    </div>
  `;
}


function teamCard(r){

  const starters=new Set(r.starters||[]);
  const players=r.players||[];

  const list=[...players].sort(
    (a,b)=>
      Number(starters.has(b))-
      Number(starters.has(a))
  );

  const s=r.settings||{};

  return `
    <article
      class="team-card"
      data-search="${esc(
        (
          teamName(r.roster_id)+
          " "+
          (owner(r.roster_id).display_name||"")
        ).toLowerCase()
      )}">

      <div class="team-card-head">

        ${avatar(r.roster_id)}

        <div>

          <div class="team-name">
            ${esc(teamName(r.roster_id))}
          </div>

          <div class="team-owner">
            ${esc(
              owner(r.roster_id).display_name||
              owner(r.roster_id).username||
              ""
            )}
          </div>

        </div>

        <div class="record">
          ${s.wins||0}-${s.losses||0}
        </div>

      </div>

      <div class="roster">

        ${
          list.map(p=>`

            <div class="player ${
              starters.has(p)
                ?"starter"
                :"bench"
            }">

              <span>
                ${
                  starters.has(p)
                    ?"★ "
                    :""
                }
                ${esc(playerName(p))}
              </span>

              <span>
                ${esc(playerMeta(p))}
              </span>

            </div>

          `).join("")
          ||
          `
            <div class="muted small">
              Roster unavailable.
            </div>
          `
        }

      </div>

    </article>
  `;
}


function teamsPage(){

  return `
    <div class="hero" data-number="08">

      <div class="eyebrow">
        Franchises · managers · lineups
      </div>

      <h1 style="font-size:50px">
        Teams
      </h1>

      <p>
        Every roster in one place.
        Starters appear first.
      </p>

    </div>

    <div
      class="panel"
      style="margin-bottom:13px">

      <input
        id="team-search"
        class="search"
        placeholder="Search teams or managers…"
        oninput="filterTeams(this.value)">

    </div>

    <div
      id="team-grid"
      class="team-grid">

      ${state.rosters.map(teamCard).join("")}

    </div>
  `;
}


function filterTeams(q){

  const n=String(q||"").toLowerCase();

  document
    .querySelectorAll(".team-card")
    .forEach(
      x=>
        x.style.display=
          x.dataset.search.includes(n)
            ?""
            :"none"
    );
}


function transactionsPage(){

  const rows=state.transactions
    .slice()
    .sort(
      (a,b)=>
        (+b.created||0)-
        (+a.created||0)
    );

  return `
    <div class="hero" data-number="09">

      <div class="eyebrow">
        Transaction center · week ${state.week}
      </div>

      <h1 style="font-size:50px">
        Moves
      </h1>

      <p>
        Waivers, free agents and trades returned
        by Sleeper for the current week.
      </p>

    </div>

    <section class="panel">

      ${
        rows.length
          ? `
            <div class="table-wrap">

              <table class="table">

                <thead>

                  <tr>
                    <th>Type</th>
                    <th>Teams</th>
                    <th>Details</th>
                    <th>Time</th>
                  </tr>

                </thead>

                <tbody>

                  ${rows.map(txRow).join("")}

                </tbody>

              </table>

            </div>
          `
          : `
            <div class="muted">
              No transactions were returned for this week.
            </div>
          `
      }

    </section>
  `;
}


function txRow(t){

  const names=(t.roster_ids||[])
    .map(teamName)
    .join(" ↔ ");

  const adds=Object.keys(t.adds||{})
    .map(playerName);

  const drops=Object.keys(t.drops||{})
    .map(playerName);

  let d=[
    adds.length
      ?`+ ${adds.join(", ")}`
      :"",

    drops.length
      ?`− ${drops.join(", ")}`
      :""
  ]
  .filter(Boolean)
  .join(" • ")
  ||
  "Transaction";

  if(t.settings?.waiver_bid!=null){
    d+=` • FAB $${t.settings.waiver_bid}`;
  }

  return `
    <tr>

      <td>
        <strong>
          ${esc(
            String(t.type||"move")
              .replace("_"," ")
          )}
        </strong>
      </td>

      <td>
        ${esc(names||"—")}
      </td>

      <td>
        ${esc(d)}
      </td>

      <td>
        ${
          t.created
            ?new Date(+t.created)
              .toLocaleString([],{
                month:"short",
                day:"numeric",
                hour:"numeric",
                minute:"2-digit"
              })
            :"—"
        }
      </td>

    </tr>
  `;
}


function bracketPage(){

  const b=state.winners;

  if(!b.length){

    return `
      <div class="hero" data-number="10">

        <div class="eyebrow">
          Postseason
        </div>

        <h1 style="font-size:50px">
          Playoffs
        </h1>

        <p>
          No winners bracket is available yet.
          Sleeper exposes the bracket once
          the league has one.
        </p>

      </div>
    `;
  }

  const rounds={};

  b.forEach(
    m=>(rounds[m.r]??=[]).push(m)
  );

  const labels={
    1:"Quarterfinals",
    2:"Semifinals",
    3:"Championship",
    4:"Round 4"
  };

  const get=x=>
    typeof x==="number"
      ?teamName(x)
      :x?.w
        ?`Winner of #${x.w}`
        :x?.l
          ?`Loser of #${x.l}`
          :"TBD";

  return `
    <div class="hero" data-number="10">

      <div class="eyebrow">
        Postseason · winners bracket
      </div>

      <h1 style="font-size:50px">
        Playoffs
      </h1>

      <p>
        The road to the title, rendered from
        Sleeper's official bracket data.
      </p>

    </div>

    <section class="panel">

      <div class="bracket">

        <div class="bracket-grid">

          ${
            Object.keys(rounds)
              .sort((a,b)=>a-b)
              .map(r=>`

                <div class="round">

                  <h3>
                    ${labels[r]||"Round "+r}
                  </h3>

                  ${
                    rounds[r]
                      .sort((a,b)=>a.m-b.m)
                      .map(m=>`

                        <div class="bracket-match">

                          <div class="bracket-team ${
                            m.w===m.t1
                              ?"winner"
                              :""
                          }">

                            <span>
                              ${esc(get(m.t1))}
                            </span>

                            <span>
                              ${
                                m.w===m.t1
                                  ?"✓"
                                  :""
                              }
                            </span>

                          </div>

                          <div class="bracket-team ${
                            m.w===m.t2
                              ?"winner"
                              :""
                          }">

                            <span>
                              ${esc(get(m.t2))}
                            </span>

                            <span>
                              ${
                                m.w===m.t2
                                  ?"✓"
                                  :""
                              }
                            </span>

                          </div>

                        </div>

                      `).join("")
                  }

                </div>

              `).join("")
          }

        </div>

      </div>

    </section>
  `;
}


/* =========================================================
   ROUTING / RENDER
   ========================================================= */

function page(){

  if(state.loading){

    return `
      <div class="loading-screen">

        <div class="spinner"></div>

        <h1>
          Loading your league
        </h1>

        <p>
          Pulling live data from Sleeper…
        </p>

      </div>
    `;
  }

  if(state.error){

    return `
      <div class="error-box">

        <h2>
          Couldn't load the league
        </h2>

        <p class="muted">
          Check your connection and try again.
          This site uses Sleeper's public read-only API.
        </p>

        <button
          class="btn"
          onclick="load()">
          Retry
        </button>

      </div>
    `;
  }

  return ({
    standings:standingsPage,
    matchups:matchupsPage,
    teams:teamsPage,
    transactions:transactionsPage,
    playoffs:bracketPage
  }[state.route]||home)();
}


function render(){

  if(state.league){

    $("#brand-name").textContent=
      state.league.name||
      "League HQ";

    $("#brand-season").textContent=
      `${state.league.season||""} · Sleeper Fantasy Football`;

    $("#sleeper-link").href=
      `https://sleeper.app/leagues/${LEAGUE_ID}`;
  }

  document
    .querySelectorAll("[data-route]")
    .forEach(
      a=>
        a.classList.toggle(
          "active",
          a.dataset.route===state.route
        )
    );

  $("#content").innerHTML=page();

  /*
     Render news after the home page exists.
  */

  if(state.route==="home"){
    renderNews();
    updateCountdowns();
  }
}


function route(){

  const r=(
    location.hash
      .replace("#","")
      ||
      "home"
  ).split("/")[0];

  state.route=[
    "home",
    "standings",
    "matchups",
    "teams",
    "transactions",
    "playoffs"
  ].includes(r)
    ?r
    :"home";

  render();
}


/* =========================================================
   UI
   ========================================================= */

function toast(msg){

  const t=$("#toast");

  t.textContent=msg;

  t.classList.add("show");

  setTimeout(
    ()=>t.classList.remove("show"),
    1800
  );
}


function copyShare(){

  const u=
    location.href.split("#")[0]+
    "#home";

  navigator
    .clipboard
    ?.writeText(u)
    .then(
      ()=>toast("Share link copied")
    )
    .catch(
      ()=>toast(u)
    );
}


/* =========================================================
   GLOBALS
   ========================================================= */

window.copyShare=copyShare;
window.load=load;
window.filterTeams=filterTeams;


/* =========================================================
   THEME
   ========================================================= */

$("#refresh").addEventListener(
  "click",
  load
);

$("#theme").addEventListener(
  "click",
  ()=>{

    const d=
      document.documentElement.dataset.theme==="dark";

    document.documentElement.dataset.theme=
      d
        ?"light"
        :"dark";

    localStorage.setItem(
      "league_theme",
      d
        ?"light"
        :"dark"
    );
  }
);

const saved=
  localStorage.getItem("league_theme");

if(saved){
  document.documentElement.dataset.theme=saved;
}


/* =========================================================
   STARTUP
   ========================================================= */

window.addEventListener(
  "hashchange",
  route
);

route();
load();

loadNews();

setInterval(
  updateCountdowns,
  1000
);

setInterval(
  loadNews,
  10*60*1000
);

setInterval(
  load,
  5*60*1000
);
