const LEAGUE_ID = "1339982718628274176";
const API = "https://api.sleeper.app/v1";
const CACHE_TTL = 24 * 60 * 60 * 1000;

const state = {
  league:null, users:[], rosters:[], nfl:null, players:{}, matchups:[], transactions:[],
  winners:[], losers:[], drafts:[], loading:true, error:null, week:1, route:"home"
};

const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2});
const pct = n => `${(Number(n||0)*100).toFixed(1)}%`;
const initials = n => (String(n||"?").split(/\s+/).map(x=>x[0]).join("").slice(0,2)||"?").toUpperCase();
const avatarUrl = id => id ? `https://sleepercdn.com/avatars/${id}` : "";

function teamName(rosterId){
  const u = state.users.find(x => Number(x.roster_id ?? -1) === Number(rosterId) || x.user_id === state.rosters.find(r=>r.roster_id===Number(rosterId))?.owner_id);
  const r = state.rosters.find(x=>x.roster_id===Number(rosterId));
  if(u?.metadata?.team_name) return u.metadata.team_name;
  if(u?.display_name) return u.display_name;
  return r ? `Team ${r.roster_id}` : "Unknown";
}
function owner(rosterId){
  const r = state.rosters.find(x=>x.roster_id===Number(rosterId));
  return state.users.find(u=>u.user_id===r?.owner_id) || {};
}
function avatar(rosterId, cls="avatar"){
  const u=owner(rosterId), url=avatarUrl(u.avatar);
  return url ? `<img class="${cls}" src="${url}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span class="${cls}" style="display:none">${initials(teamName(rosterId))}</span>` : `<span class="${cls}">${initials(teamName(rosterId))}</span>`;
}
function rosterMap(){ return Object.fromEntries(state.rosters.map(r=>[r.roster_id,r])); }
function playerName(id){
  if(!id) return "Unknown";
  const p=state.players[id];
  if(p) return `${p.first_name||""} ${p.last_name||""}`.trim() || id;
  return id;
}
function playerMeta(id){
  const p=state.players[id];
  if(!p) return "";
  const pos=p.fantasy_positions?.[0] || p.position || "";
  return `${pos}${p.team ? " • "+p.team : ""}`;
}

async function get(path){
  const res=await fetch(API+path,{cache:"no-store"});
  if(!res.ok) throw new Error(`Sleeper API returned ${res.status}`);
  return res.json();
}
async function loadPlayers(){
  const key="sleeper_players_nfl";
  try{
    const cached=JSON.parse(localStorage.getItem(key)||"null");
    if(cached && cached.ts && Date.now()-cached.ts<CACHE_TTL){ state.players=cached.data; return; }
  }catch{}
  try{
    const data=await get("/players/nfl");
    state.players=data;
    try{localStorage.setItem(key,JSON.stringify({ts:Date.now(),data}));}catch{}
  }catch(e){
    console.warn("Player map unavailable",e);
  }
}
async function load(){
  state.loading=true; state.error=null; render();
  try{
    const [league,users,rosters,nfl]=await Promise.all([
      get(`/league/${LEAGUE_ID}`), get(`/league/${LEAGUE_ID}/users`), get(`/league/${LEAGUE_ID}/rosters`), get("/state/nfl")
    ]);
    state.league=league; state.users=users; state.rosters=rosters; state.nfl=nfl;
    state.week=Math.max(1,Number(nfl?.display_week||nfl?.week||league?.settings?.leg||1));
    await loadPlayers();
    const week=Math.min(Math.max(state.week,1),18);
    const [matchups, winners, losers, drafts, tx] = await Promise.all([
      get(`/league/${LEAGUE_ID}/matchups/${week}`).catch(()=>[]),
      get(`/league/${LEAGUE_ID}/winners_bracket`).catch(()=>[]),
      get(`/league/${LEAGUE_ID}/losers_bracket`).catch(()=>[]),
      get(`/league/${LEAGUE_ID}/drafts`).catch(()=>[]),
      get(`/league/${LEAGUE_ID}/transactions/${week}`).catch(()=>[])
    ]);
    state.matchups=matchups||[]; state.winners=winners||[]; state.losers=losers||[]; state.drafts=drafts||[]; state.transactions=tx||[];
    state.loading=false;
    $("#status-dot").classList.remove("error");
    $("#status-text").textContent="Live from Sleeper";
    $("#last-updated").textContent="Updated "+new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});
    render();
  }catch(e){
    console.error(e); state.loading=false; state.error=e;
    $("#status-dot").classList.add("error"); $("#status-text").textContent="Unable to load Sleeper";
    render();
  }
}
function standings(){
  return [...state.rosters].sort((a,b)=>{
    const aw=Number(a.settings?.wins||0), bw=Number(b.settings?.wins||0);
    if(bw!==aw) return bw-aw;
    return Number(b.settings?.fpts||0)-Number(a.settings?.fpts||0);
  });
}
function matchupGroups(){
  const m={};
  state.matchups.forEach(x=>{ if(!m[x.matchup_id])m[x.matchup_id]=[]; m[x.matchup_id].push(x); });
  return Object.values(m).filter(g=>g.length>=1);
}
function matchupCard(g){
  const a=g[0], b=g[1];
  if(!b) return `<div class="matchup-card"><div class="week">Week ${state.week}</div><div class="matchup-teams"><div class="match-team">${avatar(a.roster_id)}<div class="team-name">${esc(teamName(a.roster_id))}</div><div class="score">${fmt(a.points)}</div></div><div class="vs">BYE</div><div></div></div></div>`;
  const ap=Number(a.points||0), bp=Number(b.points||0), ac=ap>bp?"win":ap<bp?"loss":"";
  const bc=bp>ap?"win":bp<ap?"loss":"";
  return `<div class="matchup-card"><div class="week">Week ${state.week}</div><div class="matchup-teams"><div class="match-team ${ac}">${avatar(a.roster_id)}<div class="team-name">${esc(teamName(a.roster_id))}</div><div class="score">${fmt(ap)}</div></div><div class="vs">VS</div><div class="match-team ${bc}">${avatar(b.roster_id)}<div class="team-name">${esc(teamName(b.roster_id))}</div><div class="score">${fmt(bp)}</div></div></div></div>`;
}
function teamRow(r,i){
  const s=r.settings||{}, u=owner(r.roster_id), wins=Number(s.wins||0), losses=Number(s.losses||0);
  return `<tr><td class="rank">${i+1}</td><td><div class="team-cell">${avatar(r.roster_id)}<div><div class="team-name">${esc(teamName(r.roster_id))}</div><div class="team-owner">${esc(u.display_name||u.username||"")}</div></div></div></td><td>${wins}-${losses}${Number(s.ties||0)?`-${s.ties}`:""}</td><td>${fmt(s.fpts)}</td><td>${fmt(s.fpts_against)}</td><td>${s.fpts ? pct(wins/Math.max(1,wins+losses+Number(s.ties||0))) : "—"}</td></tr>`;
}
function home(){
  const sorted=standings(), leader=sorted[0], total=state.rosters.length;
  const topScore=[...state.rosters].sort((a,b)=>Number(b.settings?.fpts||0)-Number(a.settings?.fpts||0))[0];
  return `<section class="hero"><div class="hero-row"><div><div class="eyebrow">${esc(state.league?.season||"NFL")} • ${esc(state.league?.status||"league")}</div><h1>${esc(state.league?.name||"Fantasy League")}</h1><p>One place for standings, live matchups, rosters, transactions and playoff history.</p></div><div class="hero-actions"><button class="btn secondary" onclick="copyShare()">Copy Share Link</button><a class="btn" href="#standings">View Standings</a></div></div></section>
  <div class="grid grid-4" style="margin-bottom:16px">
    <div class="panel metric"><div class="label">Teams</div><div class="value">${total}</div><div class="sub">Active league rosters</div></div>
    <div class="panel metric"><div class="label">Current week</div><div class="value">${state.week}</div><div class="sub">${esc(state.nfl?.season_type||"NFL")}</div></div>
    <div class="panel metric"><div class="label">Leader</div><div class="value" style="font-size:20px">${esc(teamName(leader?.roster_id))}</div><div class="sub">${leader?.settings?.wins||0}-${leader?.settings?.losses||0}</div></div>
    <div class="panel metric"><div class="label">Points leader</div><div class="value" style="font-size:20px">${esc(teamName(topScore?.roster_id))}</div><div class="sub">${fmt(topScore?.settings?.fpts)} points</div></div>
  </div>
  <div class="grid grid-2">
    <section class="panel"><div class="panel-title"><h2>Standings</h2><a class="muted small" href="#standings">See all →</a></div><div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Team</th><th>W-L</th><th>PF</th></tr></thead><tbody>${sorted.slice(0,6).map((r,i)=>`<tr><td class="rank">${i+1}</td><td><div class="team-cell">${avatar(r.roster_id)}<div class="team-name">${esc(teamName(r.roster_id))}</div></div></td><td>${r.settings?.wins||0}-${r.settings?.losses||0}</td><td>${fmt(r.settings?.fpts)}</td></tr>`).join("")}</tbody></table></div></section>
    <section class="panel"><div class="panel-title"><h2>Week ${state.week} Matchups</h2><a class="muted small" href="#matchups">See all →</a></div><div class="cards">${matchupGroups().slice(0,3).map(matchupCard).join("")||`<div class="muted small">No matchup data yet.</div>`}</div></section>
  </div>`;
}
function standingsPage(){
  return `<div class="panel"><div class="panel-title"><div><h2>League Standings</h2><div class="muted small">${esc(state.league?.season||"")} season • sorted by wins, then points</div></div></div><div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Team</th><th>Record</th><th>PF</th><th>PA</th><th>Win %</th></tr></thead><tbody>${standings().map(teamRow).join("")}</tbody></table></div></div>`;
}
function matchupsPage(){
  return `<div class="hero" style="padding:26px"><div class="eyebrow">Current scoring week</div><h1 style="font-size:34px">Week ${state.week} Matchups</h1><p>Live matchup totals as reported by Sleeper.</p></div><div class="cards">${matchupGroups().map(matchupCard).join("")||`<div class="panel muted">No matchups found for this week.</div>`}</div>`;
}
function teamsPage(){
  return `<div class="panel" style="margin-bottom:16px"><div class="panel-title"><div><h2>Teams & Rosters</h2><div class="muted small">Starters are shown first. Player names use Sleeper's player database.</div></div></div><input id="team-search" class="search" placeholder="Search teams or managers…" oninput="filterTeams(this.value)"></div><div id="team-grid" class="team-grid">${state.rosters.map(teamCard).join("")}</div>`;
}
function teamCard(r){
  const starters=new Set(r.starters||[]), players=r.players||[];
  const list=[...players].sort((a,b)=>Number(starters.has(b))-Number(starters.has(a)));
  const s=r.settings||{};
  return `<article class="team-card" data-search="${esc((teamName(r.roster_id)+" "+(owner(r.roster_id).display_name||"")).toLowerCase())}"><div class="team-card-head">${avatar(r.roster_id)}<div><div class="team-name">${esc(teamName(r.roster_id))}</div><div class="team-owner">${esc(owner(r.roster_id).display_name||owner(r.roster_id).username||"")}</div></div><div class="record">${s.wins||0}-${s.losses||0}</div></div><div class="roster">${list.map(p=>`<div class="player ${starters.has(p)?"starter":"bench"}"><span>${starters.has(p)?"★ ":""}${esc(playerName(p))}</span><span>${esc(playerMeta(p))}</span></div>`).join("")||`<div class="muted small">Roster unavailable.</div>`}</div></article>`;
}
function filterTeams(q){const n=String(q||"").toLowerCase();document.querySelectorAll(".team-card").forEach(x=>x.style.display=x.dataset.search.includes(n)?"":"none")}
function transactionsPage(){
  const rows=state.transactions.slice().sort((a,b)=>Number(b.created||0)-Number(a.created||0));
  return `<div class="panel"><div class="panel-title"><div><h2>Week ${state.week} Transactions</h2><div class="muted small">Waivers, free-agent moves and trades reported by Sleeper.</div></div></div>${rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Type</th><th>Teams</th><th>Details</th><th>Time</th></tr></thead><tbody>${rows.map(txRow).join("")}</tbody></table></div>`:`<div class="muted">No transactions were returned for this week.</div>`}</div>`;
}
function txRow(t){
  const names=(t.roster_ids||[]).map(teamName).join(" ↔ ");
  const adds=Object.keys(t.adds||{}).map(playerName), drops=Object.keys(t.drops||{}).map(playerName);
  let details=[adds.length?`+ ${adds.join(", ")}`:"",drops.length?`− ${drops.join(", ")}`:""].filter(Boolean).join(" • ");
  if(t.type==="trade") details=details||"Trade completed";
  if(t.settings?.waiver_bid!=null) details+=` • FAB $${t.settings.waiver_bid}`;
  return `<tr><td><strong>${esc(String(t.type||"move").replace("_"," "))}</strong></td><td>${esc(names||"—")}</td><td>${esc(details||"Transaction")}</td><td>${t.created?new Date(Number(t.created)).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"—"}</td></tr>`;
}
function bracketPage(){
  const b=state.winners;
  if(!b.length) return `<div class="panel"><h2>Playoffs</h2><p class="muted">No winners bracket is available yet. Sleeper exposes the bracket once the league has one.</p></div>`;
  const rounds={}; b.forEach(m=>(rounds[m.r]??=[]).push(m));
  const label={1:"Round 1",2:"Semifinals",3:"Final",4:"Round 4"};
  const getTeam=x=>{
    if(typeof x==="number") return teamName(x);
    if(x?.w) return `Winner of #${x.w}`;
    if(x?.l) return `Loser of #${x.l}`;
    return "TBD";
  };
  return `<div class="panel"><div class="panel-title"><div><h2>Playoff Bracket</h2><div class="muted small">Winners bracket from Sleeper</div></div></div><div class="bracket"><div class="bracket-grid">${Object.keys(rounds).sort((a,b)=>a-b).map(r=>`<div class="round"><h3>${label[r]||"Round "+r}</h3>${rounds[r].sort((a,b)=>a.m-b.m).map(m=>`<div class="bracket-match"><div class="bracket-team ${m.w===m.t1?"winner":""}"><span>${esc(getTeam(m.t1))}</span><span>${m.w===m.t1?"✓":""}</span></div><div class="bracket-team ${m.w===m.t2?"winner":""}"><span>${esc(getTeam(m.t2))}</span><span>${m.w===m.t2?"✓":""}</span></div></div>`).join("")}</div>`).join("")}</div></div></div>`;
}
function page(){
  if(state.loading) return `<div class="loading-screen"><div class="spinner"></div><h1>Loading your league</h1><p>Pulling live data from Sleeper…</p></div>`;
  if(state.error) return `<div class="error-box"><h2>Couldn't load the league</h2><p class="muted">Check your connection and try again. The site uses Sleeper's public read-only API.</p><button class="btn" onclick="load()">Retry</button></div>`;
  switch(state.route){
    case "standings": return standingsPage();
    case "matchups": return matchupsPage();
    case "teams": return teamsPage();
    case "transactions": return transactionsPage();
    case "playoffs": return bracketPage();
    default: return home();
  }
}
function render(){
  if(state.league){
    $("#brand-name").textContent=state.league.name||"League HQ";
    $("#brand-season").textContent=`${state.league.season||""} • Sleeper Fantasy Football`;
    $("#sleeper-link").href=`https://sleeper.app/leagues/${LEAGUE_ID}`;
  }
  document.querySelectorAll("[data-route]").forEach(a=>a.classList.toggle("active",a.dataset.route===state.route));
  $("#content").innerHTML=page();
}
function route(){
  const r=(location.hash.replace("#","")||"home").split("/")[0];
  state.route=["home","standings","matchups","teams","transactions","playoffs"].includes(r)?r:"home";
  render();
}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),1800)}
function copyShare(){
  const url=location.href.split("#")[0]+"#home";
  navigator.clipboard?.writeText(url).then(()=>toast("Share link copied")).catch(()=>toast(url));
}
window.copyShare=copyShare; window.load=load; window.filterTeams=filterTeams;
$("#refresh").addEventListener("click",load);
$("#theme").addEventListener("click",()=>{const dark=document.documentElement.dataset.theme==="dark";document.documentElement.dataset.theme=dark?"light":"dark";localStorage.setItem("league_theme",dark?"light":"dark")});
const savedTheme=localStorage.getItem("league_theme"); if(savedTheme)document.documentElement.dataset.theme=savedTheme;
window.addEventListener("hashchange",route);
route(); load();
setInterval(load,5*60*1000);
