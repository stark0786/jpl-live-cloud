const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 8e6 });
app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_, res) => res.json({ ok: true, app: "JPL LIVE" }));

const ROOM_DEFAULT = "JPL8LIVE";
const blank = () => ({
  tournament: "JPL", match: "Match 01", tournamentLogo: "", teamA: "Team A", teamB: "Team B",
  logoA: "", logoB: "", battingTeam: "A", totalOvers: 20, target: 0,
  score: 0, wickets: 0, balls: 0, striker: "", nonStriker: "", bowler: "",
  squads: { A: [], B: [] }, playingXI: { A: [], B: [] }, playingXITitle: "JHAGARIYA PREMIER LEAGUE", playingXIVisible: false, overlayAction: 0, overlayMode: "show", battingStats: [], bowlingStats: [], extras: { wd: 0, nb: 0, b: 0, lb: 0 },
  fallOfWickets: [], oversLog: [], currentOver: [], history: [], announcement: "", announcementType: "",
  scorecardMode: "batting", scorecardVisible: false, displaySettings: {}, nextMatch: {}, customPopup: {visible:false}, inningsComplete: false, _updatedAt: 0
});
const rooms = new Map();
function getState(room) {
  if (!rooms.has(room)) rooms.set(room, blank());
  return rooms.get(room);
}
function emit(room) { const s=getState(room); s._updatedAt=Date.now(); io.to(room).emit("state", s); }
function nameFor(s, key) { return key === "A" ? s.teamA : s.teamB; }
function ensureBatter(s, name) {
  if (!name) return null;
  let p = s.battingStats.find(x => x.name === name);
  if (!p) { p = { name, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, dismissal: "not out" }; s.battingStats.push(p); }
  return p;
}
function ensureBowler(s, name) {
  if (!name) return null;
  let p = s.bowlingStats.find(x => x.name === name);
  if (!p) { p = { name, balls: 0, runs: 0, wickets: 0, maidens: 0 }; s.bowlingStats.push(p); }
  return p;
}
function overText(balls) { return `${Math.floor(balls / 6)}.${balls % 6}`; }
function recordBall(s, label) {
  s.currentOver.push(label);
  if (s.currentOver.length === 6) {
    s.oversLog.push({ over: s.oversLog.length + 1, balls: [...s.currentOver] });
    s.currentOver = [];
  }
}
function swap(s) { const t = s.striker; s.striker = s.nonStriker; s.nonStriker = t; }
function snapshot(s) {
  const h = [...(s.history || [])];
  const copy = JSON.parse(JSON.stringify(s));
  copy.history = h;
  return copy;
}
function applyBall(s, b) {
  if (s.inningsComplete) return;
  const type = b.type || "run";
  const runs = Math.max(0, Number(b.runs || 0));
  const batter = ensureBatter(s, s.striker);
  const bowler = ensureBowler(s, s.bowler);
  const legal = type !== "wide" && type !== "noball";
  let total = 0, batterRuns = 0, bowlerRuns = 0, label = "0", wicketCredit = false;
  const before = JSON.stringify({ score:s.score, wickets:s.wickets, balls:s.balls });
  s.history.push({ state: JSON.parse(before), full: JSON.parse(JSON.stringify(s)) });
  if (s.history.length > 100) s.history.shift();

  if (type === "run") {
    total = runs; batterRuns = runs; bowlerRuns = runs; label = String(runs);
  } else if (type === "wide") {
    total = 1 + runs; bowlerRuns = total; s.extras.wd += total; label = runs ? `Wd+${runs}` : "Wd";
  } else if (type === "noball") {
    total = 1 + runs; batterRuns = runs; bowlerRuns = total; s.extras.nb += 1; label = runs ? `Nb+${runs}` : "Nb";
  } else if (type === "bye" || type === "legbye") {
    total = runs; label = type === "bye" ? `B${runs}` : `Lb${runs}`;
    s.extras[type === "bye" ? "b" : "lb"] += runs;
  } else if (type === "wicket" || type === "runout") {
    total = runs; bowlerRuns = runs; label = type === "runout" ? "RO" : "W";
  }

  s.score += total;
  if (batter) {
    batter.runs += batterRuns;
    if (type !== "wide" && type !== "noball") batter.balls++;
    if (batterRuns === 4) batter.fours++;
    if (batterRuns === 6) batter.sixes++;
  }
  if (bowler) {
    bowler.runs += bowlerRuns;
    if (legal) bowler.balls++;
  }
  if (legal) s.balls++;

  const oddRuns = total % 2 === 1;
  if (type === "wicket" || type === "runout") {
    s.wickets++;
    const outName = b.outBatter || s.striker;
    const outPlayer = ensureBatter(s, outName);
    if (outPlayer) { outPlayer.out = true; outPlayer.dismissal = b.dismissal || (type === "runout" ? `run out${b.fielder ? " ("+b.fielder+")" : ""}` : "bowled"); }
    const how = b.dismissalType || (type === "runout" ? "runout" : "bowled");
    wicketCredit = !["runout", "retired hurt", "obstructing field"].includes(how);
    if (bowler && wicketCredit) bowler.wickets++;
    s.fallOfWickets.push({ score: s.score, wicket: s.wickets, batter: outName, over: overText(s.balls) });
    s.announcement = how === "runout" ? "RUN OUT" : "WICKET";
    s.announcementType = how === "runout" ? "runout" : "wicket";
    if (outName === s.striker) {
      if (b.incoming) s.striker = b.incoming;
      else s.striker = "";
    } else {
      if (b.incoming) s.nonStriker = b.incoming;
      else s.nonStriker = "";
    }
  } else {
    s.announcement = (type === "run" && runs === 4) ? "FOUR" : (type === "run" && runs === 6) ? "SIX" : "";
    s.announcementType = s.announcement.toLowerCase();
    if (oddRuns) swap(s);
  }
  if (legal && s.balls > 0 && s.balls % 6 === 0) {
    if (bowler && bowler.balls > 0 && bowler.balls % 6 === 0) {
      const last = s.currentOver;
      if (last.length === 5 && last.every(x => x === "0")) bowler.maidens++;
    }
    swap(s);
  }
  recordBall(s, label);
  if (s.wickets >= 10 || s.balls >= Number(s.totalOvers || 20) * 6) s.inningsComplete = true;
  if (s.target && s.score >= s.target) s.inningsComplete = true;
}
io.on("connection", socket => {
  socket.on("join", room => { room = String(room || ROOM_DEFAULT); socket.join(room); socket.data.room = room; socket.emit("state", getState(room)); });
  socket.on("restore", data => {
    const room=socket.data.room||ROOM_DEFAULT;
    if (!data || typeof data !== "object") return;
    const s=getState(room);
    const allowed=["tournament","match","tournamentLogo","teamA","teamB","logoA","logoB","battingTeam","totalOvers","target","score","wickets","balls","striker","nonStriker","bowler","squads","playingXI","playingXITitle","playingXIVisible","overlayAction","overlayMode","battingStats","bowlingStats","extras","fallOfWickets","oversLog","currentOver","announcement","announcementType","scorecardMode","scorecardVisible","displaySettings","nextMatch","customPopup","inningsComplete"];
    for (const k of allowed) if (data[k] !== undefined) s[k]=data[k];
    s.history=[];
    emit(room);
  });
  socket.on("update", data => {
    const room = socket.data.room || ROOM_DEFAULT, s = getState(room);
    const allowed = ["tournament","match","tournamentLogo","teamA","teamB","logoA","logoB","battingTeam","totalOvers","target","striker","nonStriker","bowler","squads","playingXI","playingXITitle","playingXIVisible","displaySettings","nextMatch","customPopup"]
    for (const k of allowed) if (data && data[k] !== undefined) s[k] = data[k];
    emit(room);
  });
  socket.on("ball", b => { const room = socket.data.room || ROOM_DEFAULT; const s = getState(room); applyBall(s, b || {}); emit(room); });
  socket.on("event", e => { const room = socket.data.room || ROOM_DEFAULT, s = getState(room); if (e === "W") applyBall(s,{type:"wicket"}); else if (["0","1","2","3","4","6"].includes(String(e))) applyBall(s,{type:"run",runs:Number(e)}); else if (e==="WD") applyBall(s,{type:"wide"}); else if (e==="NB") applyBall(s,{type:"noball"}); emit(room); });
  socket.on("swap", () => { const room=socket.data.room||ROOM_DEFAULT,s=getState(room); swap(s); emit(room); });
  socket.on("undo", () => { const room=socket.data.room||ROOM_DEFAULT,s=getState(room); const prev=s.history.pop(); if(prev && prev.full){ const h=s.history; Object.keys(s).forEach(k=>delete s[k]); Object.assign(s,prev.full); s.history=h; } emit(room); });
  socket.on("broadcastMode", mode => { const room=socket.data.room||ROOM_DEFAULT,s=getState(room); s.overlayMode=mode==="hide"?"hide":"show"; s.overlayAction=(s.overlayAction||0)+1; emit(room); });
  socket.on("showScorecard", mode => { const room=socket.data.room||ROOM_DEFAULT,s=getState(room); s.scorecardMode=mode==="bowling"?"bowling":"batting"; s.scorecardVisible=true; emit(room); });
  socket.on("hideScorecard", () => { const room=socket.data.room||ROOM_DEFAULT,s=getState(room); s.scorecardVisible=false; emit(room); });
  socket.on("announce", a => { const room=socket.data.room||ROOM_DEFAULT,s=getState(room); s.announcement=String(a.text||""); s.announcementType=String(a.type||""); emit(room); });
  socket.on("reset", () => { const room=socket.data.room||ROOM_DEFAULT, old=getState(room), n=blank(); n.tournament=old.tournament; n.match=old.match; n.teamA=old.teamA; n.teamB=old.teamB; n.logoA=old.logoA; n.logoB=old.logoB; n.squads=old.squads; n.totalOvers=old.totalOvers; rooms.set(room,n); emit(room); });
});
const port = process.env.PORT || 3000;
server.listen(port, () => console.log("JPL LIVE listening on " + port));
