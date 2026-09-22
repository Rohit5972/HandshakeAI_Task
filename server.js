const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const arenas = [
  { id: 'neon', name: 'Neon Narrows', color: '#101a3d', accent: '#ff4fa3' },
  { id: 'dust', name: 'Dust Bowl', color: '#322030', accent: '#ffbd47' }
];
const colors = ['#ff4f73','#64e7ff','#ffd451','#a98bff','#65e98c','#ff8f43','#f28dde','#e6efff'];
const powerups = ['rocket','mine','boost','shield','shock'];

function code() { return Math.random().toString(36).slice(2, 6).toUpperCase(); }
function newRoom() { let c; do c = code(); while (rooms.has(c)); const r={code:c,host:null,players:{},phase:'lobby',round:0,roundEnds:0,arena:arenas[0],crates:[],winner:null}; rooms.set(c,r); return r; }
function publicRoom(r) { return { code:r.code, host:r.host, phase:r.phase, round:r.round, roundEnds:r.roundEnds, arena:r.arena, winner:r.winner, players:Object.values(r.players).map(p=>({id:p.id,name:p.name,color:p.color,x:p.x,y:p.y,a:p.a,score:p.score,kos:p.kos,power:p.power,shield:p.shield,alive:p.alive,respawn:p.respawn,flash:p.flash})) , crates:r.crates }; }
function spawn(p) { p.x=100+Math.random()*800; p.y=90+Math.random()*520; p.a=Math.random()*Math.PI*2; p.vx=0;p.vy=0;p.alive=true;p.respawn=0;p.power=null;p.shield=0;p.flash=0; }
function addCrate(r) { r.crates.push({id:randomUUID(),x:100+Math.random()*800,y:90+Math.random()*520,type:powerups[Math.floor(Math.random()*powerups.length)]}); }
function startRound(r) { r.phase='playing'; r.round++; r.roundEnds=Date.now()+180000; r.arena=arenas[(r.round-1)%arenas.length]; r.crates=[]; Object.values(r.players).forEach(spawn); for(let i=0;i<10;i++)addCrate(r); }
function finishRound(r) { r.phase='results'; const ps=Object.values(r.players).sort((a,b)=>b.kos-a.kos); [3,2,1].forEach((n,i)=>{if(ps[i])ps[i].score+=n}); r.winner=ps[0]?.id; }
function hit(r, victim, attacker) { if(!victim.alive)return; if(victim.shield>Date.now()){victim.shield=0; return;} victim.alive=false; victim.respawn=Date.now()+1800; victim.flash=Date.now()+500; if(attacker&&attacker.id!==victim.id){attacker.kos++;} }
function usePower(r,p) { if(!p.power||!p.alive)return; const type=p.power;p.power=null; if(type==='boost'){p.vx+=Math.cos(p.a)*7;p.vy+=Math.sin(p.a)*7;} if(type==='shield'){p.shield=Date.now()+4500;} if(type==='mine'){r.crates.push({id:randomUUID(),x:p.x,y:p.y,type:'mine'});} if(type==='rocket'||type==='shock'){Object.values(r.players).forEach(q=>{if(q.id===p.id||!q.alive)return;const d=Math.hypot(q.x-p.x,q.y-p.y);if((type==='rocket'&&d<250)||(type==='shock'&&d<135)){hit(r,q,p);}}); } }
function tick(){const now=Date.now(); for(const r of rooms.values()){if(r.phase==='playing'){if(now>=r.roundEnds){finishRound(r);continue;} for(const p of Object.values(r.players)){if(!p.alive){if(now>=p.respawn)spawn(p);continue;} const k=p.keys||{}; const turn=(k.left?-1:0)+(k.right?1:0);p.a+=turn*.075; const gas=(k.up?1:0)-(k.down?.55:0); p.vx+=Math.cos(p.a)*gas*.34;p.vy+=Math.sin(p.a)*gas*.34;p.vx*=.92;p.vy*=.92;p.x=Math.max(35,Math.min(965,p.x+p.vx));p.y=Math.max(35,Math.min(665,p.y+p.vy)); for(let i=r.crates.length-1;i>=0;i--){const c=r.crates[i];if(Math.hypot(c.x-p.x,c.y-p.y)<28){if(c.type==='mine'){hit(r,p,null)}else p.power=c.type;r.crates.splice(i,1);addCrate(r)}} }}}}
setInterval(tick, 33);

function read(req, cb){let d='';req.on('data',x=>d+=x);req.on('end',()=>{try{cb(JSON.parse(d||'{}'))}catch{cb({})}})}
function json(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function api(req,res,u){ const parts=u.pathname.split('/').filter(Boolean); if(req.method==='POST'&&u.pathname==='/api/create') return read(req,b=>{const r=newRoom();const p={id:randomUUID(),name:(b.name||'Driver').slice(0,14),color:colors[0],score:0,kos:0,keys:{}};r.players[p.id]=p;r.host=p.id;json(res,{code:r.code,id:p.id});}); const r=rooms.get(parts[2]); if(!r)return json(res,{error:'Room not found'},404); if(req.method==='GET')return json(res,publicRoom(r)); if(req.method==='POST'&&parts[3]==='join')return read(req,b=>{if(r.phase!=='lobby'||Object.keys(r.players).length>=8)return json(res,{error:'Room unavailable'},400);const p={id:randomUUID(),name:(b.name||'Driver').slice(0,14),color:colors[Object.keys(r.players).length],score:0,kos:0,keys:{}};r.players[p.id]=p;json(res,{code:r.code,id:p.id});}); read(req,b=>{const p=r.players[b.id];if(!p)return json(res,{error:'Player not found'},404);if(parts[3]==='control')p.keys=b.keys||{};if(parts[3]==='use')usePower(r,p);if(parts[3]==='start'&&r.host===p.id&&r.phase==='lobby'&&Object.keys(r.players).length>=2)startRound(r);if(parts[3]==='next'&&r.host===p.id&&r.phase==='results'){if(r.round>=3){r.phase='final'; const ps=Object.values(r.players).sort((a,b)=>b.score-a.score||b.kos-a.kos);r.winner=ps[0]?.id;}else startRound(r)}json(res,publicRoom(r));}); }
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
http.createServer((req,res)=>{const u=new URL(req.url,'http://x');if(u.pathname.startsWith('/api/'))return api(req,res,u);let f=u.pathname==='/'?'public/index.html':'public'+u.pathname;f=path.join(__dirname,f);if(!f.startsWith(path.join(__dirname,'public'))||!fs.existsSync(f)){res.writeHead(404);return res.end('Not found')}res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'text/plain'});fs.createReadStream(f).pipe(res);}).listen(PORT,()=>console.log(`Turbo Takedown: http://localhost:${PORT}`));
