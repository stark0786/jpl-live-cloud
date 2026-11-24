const express=require("express"),http=require("http");
const {Server}=require("socket.io");
const app=express(),server=http.createServer(app),io=new Server(server,{cors:{origin:true}});
app.use(express.static("public"));
const rooms=new Map();
const initial=()=>({tournament:"JPL SEASON 8",match:"MATCH LIVE",teamA:"TEAM A",teamB:"TEAM B",score:0,wickets:0,balls:0,overs:0,striker:{name:"BATSMAN 1",runs:0,balls:0},nonStriker:{name:"BATSMAN 2",runs:0,balls:0},bowler:{name:"BOWLER",runs:0,wickets:0,balls:0},target:null,lastSix:[],note:"WELCOME TO JPL LIVE"});
function getState(room){if(!rooms.has(room))rooms.set(room,initial());return rooms.get(room)}
function safeRoom(x){return String(x||"JPL8LIVE").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,24)||"JPL8LIVE"}
function publish(room){io.to(room).emit("state",getState(room))}
function event(s,e){
let legal=true,bat=0,extra=0,label=String(e);
if(e==="W"){s.wickets++;s.bowler.wickets++;s.striker.balls++;s.bowler.balls++;label="W"}
else if(e==="WD"){extra=1;legal=false;label="Wd"}
else if(e==="NB"){extra=1;legal=false;label="Nb"}
else{bat=Number(e);if(![0,1,2,3,4,6].includes(bat))return;s.striker.runs+=bat;s.striker.balls++;s.bowler.balls++}
s.score+=bat+extra;s.bowler.runs+=bat+extra;
if(legal){s.balls++;s.overs=Math.floor(s.balls/6)}
s.lastSix.push(label);s.lastSix=s.lastSix.slice(-6);
if(bat%2===1)[s.striker,s.nonStriker]=[s.nonStriker,s.striker];
if(legal&&s.balls%6===0)[s.striker,s.nonStriker]=[s.striker,s.nonStriker]; // end-over swap is handled by scorer's swap control
}
io.on("connection",sock=>{
let room="JPL8LIVE";
sock.on("join",r=>{if(room) sock.leave(room);room=safeRoom(r);sock.join(room);sock.emit("state",getState(room));});
sock.on("update",p=>{const s=getState(room);if(!p||typeof p!=="object")return;
const allowed=["tournament","match","teamA","teamB","striker","nonStriker","bowler","target","note"];
for(const k of allowed)if(k in p)s[k]=p[k];publish(room)});
sock.on("event",e=>{event(getState(room),e);publish(room)});
sock.on("swap",()=>{const s=getState(room);[s.striker,s.nonStriker]=[s.nonStriker,s.striker];publish(room)});
sock.on("reset",()=>{const old=getState(room),s=initial();s.tournament=old.tournament;s.match=old.match;s.teamA=old.teamA;s.teamB=old.teamB;rooms.set(room,s);publish(room)});
});
app.get("/health",(req,res)=>res.json({ok:true,service:"JPL LIVE V4 Cloud"}));
const port=process.env.PORT||3000;server.listen(port,"0.0.0.0",()=>console.log("JPL LIVE cloud listening on "+port));
