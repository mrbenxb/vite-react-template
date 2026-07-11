import { useEffect, useMemo, useState } from 'react'

type Skill = 'intel' | 'field' | 'influence'
type Agent = { id:string; name:string; call:string; trait:string; bonus:Skill; intel:number; field:number; influence:number; focus:number; xp:number }
type Zone = { id:string; name:string; note:string; stability:number }
type Case = { id:string; title:string; text:string; client:string; zoneId:string; zone:string; skill:Skill; severity:number; progress:number; target:number; pressure:number; deadline:number; cash:number; trust:number; public:boolean }
type Rival = { id:string; name:string; style:string; skill:Skill; score:number }
type Log = { id:string; week:number; tone:'good'|'bad'|'warn'|'plain'; text:string }
type Game = { seed:number; week:number; ap:number; cash:number; trust:number; score:number; solved:number; failed:number; serial:number; agents:Agent[]; zones:Zone[]; cases:Case[]; rivals:Rival[]; logs:Log[]; ended:boolean }

const SKILLS: Record<Skill,{label:string;verb:string;ap:number;cash:number}> = {
  intel:{label:'INTEL',verb:'Trace the pattern',ap:1,cash:4},
  field:{label:'FIELD',verb:'Deploy on site',ap:2,cash:12},
  influence:{label:'INFLUENCE',verb:'Broker a solution',ap:1,cash:7},
}
const names=['Mara Santos','Ivo Mercado','Sela Reyes','Nico Navarro','Tari Lim','Juno Aquino','Paz Tan','Ren Flores','Mika Cruz']
const calls=['Lantern','North','Static','Echo','Anchor','Signal','Rook','Horizon','Kite']
const traits:[string,Skill][]=[['Methodical','intel'],['Reads weak signals','intel'],['Calm under pressure','field'],['Improvises fast','field'],['Trusted voice','influence'],['Knows every backchannel','influence']]
const zonePool:[string,string][]=[['North Quay','aging utility tunnels beneath dense port blocks'],['Old Market','rumor moves faster than official warnings'],['Riverbend','flood-prone homes around one pumping station'],['Foundry Row','depots, workshops, and protective unions'],['Hillcrest','steep roads and weak radio coverage'],['South Commons','schools, clinics, and a crowded terminal']]
const casePool:[string,string,string,Skill,boolean][]=[
  ['Cold Chain Breakdown','A clinic shipment is warming while suppliers blame each other.','Health Cooperative','field',false],
  ['Missing Load Records','Power demand is spiking, but the dashboard shows nothing.','Grid Office','intel',true],
  ['Terminal Walkout','Crews stopped work after a safety promise vanished.','Transit Board','influence',true],
  ['Reservoir Alert','Three sensors disagree while cover-up rumors spread.','Water Authority','intel',false],
  ['Warehouse Firebreak','A storage row is overheating behind blocked access.','Port Union','field',true],
  ['Evacuation Refusal','Residents reject a route that failed them before.','Neighborhood Council','influence',false],
  ['Relay Tower Blackout','Emergency radio traffic drops every nine minutes.','Civic Communications','intel',true],
  ['Bridge Access Lock','Supply vehicles are trapped on both sides of a failed gate.','Infrastructure Office','field',true],
  ['Shelter Allocation Dispute','Two districts demand the same temporary housing.','Regional Council','influence',false],
]
const rivalPool=['Aegis North','Blue Meridian','Cinderline','Common Ground','Iron Relay','Vela Response']
const rivalStyles:[string,Skill][]=[['forensic and patient','intel'],['fast and expensive','field'],['politically connected','influence']]

const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n))
function hash(s:string){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function rnd(seed:number,key:string){let x=hash(`${seed}:${key}`)+0x6d2b79f5;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return((x^(x>>>14))>>>0)/4294967296}
function pick<T>(a:readonly T[],seed:number,key:string){return a[Math.floor(rnd(seed,key)*a.length)]}
function id(seed:number,key:string){return `${key}-${hash(`${seed}-${key}`).toString(36)}`}

function makeAgents(seed:number):Agent[]{
  return [0,1,2].map(i=>{
    const trait=traits[i*2+Math.floor(rnd(seed,`trait${i}`)*2)]
    const stats:Record<Skill,number>={intel:45+Math.floor(rnd(seed,`i${i}`)*25),field:45+Math.floor(rnd(seed,`f${i}`)*25),influence:45+Math.floor(rnd(seed,`n${i}`)*25)}
    stats[trait[1]]+=17
    return {id:id(seed,`agent${i}`),name:pick(names,seed,`name${i}`),call:pick(calls,seed,`call${i}`),trait:trait[0],bonus:trait[1],intel:clamp(stats.intel,40,94),field:clamp(stats.field,40,94),influence:clamp(stats.influence,40,94),focus:2,xp:0}
  })
}
function makeZones(seed:number):Zone[]{
  const start=Math.floor(rnd(seed,'zones')*zonePool.length)
  return [0,1,2,3].map(i=>{const z=zonePool[(start+i)%zonePool.length];return{id:id(seed,`zone${i}`),name:z[0],note:z[1],stability:54+Math.floor(rnd(seed,`stable${i}`)*30)}})
}
function makeCase(seed:number,serial:number,zones:Zone[],week:number):Case{
  const t=pick(casePool,seed,`case${serial}`),z=pick(zones,seed,`zonecase${serial}`)
  const severity=clamp(1+Math.floor(rnd(seed,`sev${serial}`)*3+Math.max(0,60-z.stability)/28+week/8),1,4)
  return{id:id(seed,`case${serial}`),title:t[0],text:t[1],client:t[2],zoneId:z.id,zone:z.name,skill:t[3],severity,progress:0,target:4+severity+Math.floor(rnd(seed,`target${serial}`)*3),pressure:2+severity,deadline:severity>=3?1:2,cash:14+severity*9+Math.floor(rnd(seed,`cash${serial}`)*8),trust:1+severity,public:t[4]}
}
function newGame(seed=(Date.now()+Math.floor(Math.random()*9999))%1_000_000_000):Game{
  const zones=makeZones(seed),agents=makeAgents(seed)
  return{seed,week:1,ap:6,cash:72,trust:58,score:24,solved:0,failed:0,serial:10,agents,zones,cases:[0,1,2,3].map(i=>makeCase(seed,i,zones,1)),rivals:rivalStyles.map((s,i)=>({id:id(seed,`rival${i}`),name:rivalPool[(i+Math.floor(rnd(seed,'rivals')*rivalPool.length))%rivalPool.length],style:s[0],skill:s[1],score:20+Math.floor(rnd(seed,`rs${i}`)*12)})),logs:[{id:id(seed,'opening'),week:1,tone:'plain',text:`${agents.map(a=>a.call).join(', ')} report for duty. Four live cases are already moving without you.`}],ended:false}
}
function playerScore(g:Game){return Math.round(g.score+g.trust*.7+g.cash*.12+g.solved*4-g.failed*6)}

export default function App(){
  const [game,setGame]=useState<Game>(()=>{try{const s=localStorage.getItem('afterline-save-v1');return s?JSON.parse(s) as Game:newGame()}catch{return newGame()}})
  const [selected,setSelected]=useState(game.agents[0].id)
  const [brief,setBrief]=useState(false)
  useEffect(()=>localStorage.setItem('afterline-save-v1',JSON.stringify(game)),[game])
  const agent=game.agents.find(a=>a.id===selected)??game.agents[0]
  const table=useMemo(()=>[{id:'you',name:'Afterline',style:'your agency',score:playerScore(game)},...game.rivals].sort((a,b)=>b.score-a.score),[game])
  const rank=table.findIndex(x=>x.id==='you')+1

  function act(caseId:string,skill:Skill){
    setGame(g=>{
      const a=g.agents.find(x=>x.id===selected),c=g.cases.find(x=>x.id===caseId),cfg=SKILLS[skill]
      if(g.ended||!a||!c||a.focus<1||g.ap<cfg.ap||g.cash<cfg.cash)return g
      const roll=Math.floor(rnd(g.seed,`act${g.serial}${caseId}${a.id}${skill}`)*26)
      const power=a[skill]+roll+(c.skill===skill?18:0)+(a.bonus===skill?10:0)-(a.focus===1?7:0)-c.severity*7-c.pressure*2
      const impact=clamp(1+Math.floor(power/27),1,4),progress=c.progress+impact,solved=progress>=c.target
      const xp=a.xp+(solved?2:1),level=Math.floor(xp/5)>Math.floor(a.xp/5)
      const log:Log={id:id(g.seed,`log${g.serial}`),week:g.week,tone:solved?'good':'plain',text:solved?`${a.call} closes “${c.title}” through ${cfg.label.toLowerCase()}. ${c.zone} steadies; Afterline collects ₱${c.cash}k.`:`${a.call} uses ${cfg.label.toLowerCase()} on “${c.title}”: +${impact} resolution, but the case remains active.`}
      return{...g,ap:g.ap-cfg.ap,cash:g.cash-cfg.cash+(solved?c.cash:0),trust:clamp(g.trust+(solved?c.trust:0),0,100),score:g.score+(solved?5+c.severity*4:0),solved:g.solved+(solved?1:0),serial:g.serial+1,agents:g.agents.map(x=>x.id===a.id?{...x,focus:x.focus-1,xp,[skill]:clamp(x[skill]+(level?1:0),0,99)}:x),zones:g.zones.map(z=>z.id===c.zoneId?{...z,stability:clamp(z.stability+(solved?c.severity+1:0),0,100)}:z),cases:solved?g.cases.filter(x=>x.id!==caseId):g.cases.map(x=>x.id===caseId?{...x,progress,pressure:clamp(x.pressure-(c.skill===skill?2:1),0,10)}:x),logs:[log,...g.logs].slice(0,18)}
    })
  }

  function endWeek(){
    setGame(g=>{
      if(g.ended)return g
      let trust=g.trust,cash=g.cash,score=g.score,failed=g.failed,serial=g.serial,zones=[...g.zones],rivals=g.rivals.map(r=>({...r}));const keep:Case[]=[],logs:Log[]=[]
      g.cases.forEach((c,i)=>{
        const deadline=c.deadline-1,pressure=clamp(c.pressure+c.severity+(rnd(g.seed,`rise${g.week}${i}${serial}`)>.58?1:0),0,10)
        const claimed=c.public&&deadline<=0&&rnd(g.seed,`claim${g.week}${c.id}`)<.34+c.severity*.08
        if(claimed){const ri=Math.floor(rnd(g.seed,`rival${c.id}`)*rivals.length);rivals[ri].score+=7+c.severity*3;trust=clamp(trust-1,0,100);logs.unshift({id:id(g.seed,`claimlog${serial}`),week:g.week,tone:'warn',text:`${rivals[ri].name} claims “${c.title}”. They take the league credit; you keep the damaged relationship.`});serial++;return}
        if(pressure>=10||deadline<-1){trust=clamp(trust-(3+c.severity*2),0,100);cash=Math.max(0,cash-c.severity*4);score=Math.max(0,score-4-c.severity*2);failed++;zones=zones.map(z=>z.id===c.zoneId?{...z,stability:clamp(z.stability-(4+c.severity*3),0,100)}:z);logs.unshift({id:id(g.seed,`faillog${serial}`),week:g.week,tone:'bad',text:`“${c.title}” breaks open in ${c.zone}. Trust falls and the district destabilizes.`});serial++;return}
        keep.push({...c,deadline,pressure});logs.unshift({id:id(g.seed,`persist${serial}`),week:g.week,tone:pressure>=8?'warn':'plain',text:`Unresolved: “${c.title}” advances on its own. Pressure is now ${pressure}/10.`});serial++
      })
      rivals=rivals.map((r,i)=>({...r,score:r.score+4+keep.filter(c=>c.skill===r.skill).length+Math.floor(rnd(g.seed,`rweek${g.week}${i}`)*6)}))
      const next=g.week+1,need=clamp(4+zones.filter(z=>z.stability<45).length,4,6),count=Math.max(0,need-keep.length),fresh=Array.from({length:count},(_,i)=>makeCase(g.seed,serial+i,zones,next));serial+=count
      const ended=next>12||trust<=0
      if(ended)logs.unshift({id:id(g.seed,`end${serial}`),week:g.week,tone:trust>0?'good':'bad',text:trust<=0?'Public trust collapses. Afterline loses its regional mandate.':`Season complete: ${g.solved} solved, ${failed} failed.`})
      else if(count)logs.unshift({id:id(g.seed,`new${serial}`),week:next,tone:'plain',text:`${count} new case${count>1?'s enter':' enters'} the board. Weak districts are generating harder work.`})
      return{...g,week:ended?g.week:next,ap:ended?0:6,cash,trust,score,failed,serial,zones,rivals,cases:ended?keep:[...keep,...fresh],agents:g.agents.map(a=>({...a,focus:ended?a.focus:2})),logs:[...logs,...g.logs].slice(0,18),ended}
    })
  }

  return <div className="shell"><main>
    <header><div><p className="eyebrow">SYSTEMIC TEXT MANAGEMENT PROTOTYPE</p><h1>AFTERLINE</h1><p>Run a response agency. The city does not pause while you decide.</p></div><button className="ghost" onClick={()=>setBrief(!brief)}>{brief?'Close brief':'How it works'}</button></header>
    {brief&&<aside><strong>One 12-week campaign.</strong> Six command points and six total operative focus per week. Cases persist, worsen, destabilize districts, or get claimed by rivals. The text reports the simulation; it does not replace it.</aside>}
    <nav className="stats"><div><span>WEEK</span><b>{game.week}/12</b></div><div><span>RANK</span><b>#{rank}</b></div><div><span>COMMAND</span><b>{game.ap} AP</b></div><div><span>FUNDS</span><b>₱{game.cash}k</b></div><div><span>TRUST</span><b>{game.trust}</b></div></nav>
    {game.ended&&<section className="ending"><p className="eyebrow">SEASON CLOSED</p><h2>{game.trust<=0?'Mandate lost.':rank===1?'League champions.':`Finished #${rank}.`}</h2><p>{game.solved} solved · {game.failed} failed · seed {game.seed}</p><button onClick={()=>{const n=newGame();setGame(n);setSelected(n.agents[0].id)}}>Generate a different campaign</button></section>}

    <div className="title"><div><p className="eyebrow">LIVE BOARD</p><h2>{game.cases.length} active cases</h2></div><span>{game.cases.filter(c=>c.pressure>=8||c.deadline<=0).length} critical</span></div>
    <section className="picker"><div className="chosen"><b>{agent.call}</b><span><strong>{agent.name}</strong><small>{agent.trait} · {agent.focus}/2 focus</small></span></div><div className="agent-tabs">{game.agents.map(a=><button className={a.id===agent.id?'active':''} onClick={()=>setSelected(a.id)} key={a.id}><b>{a.call}</b><small>{a.focus} focus</small></button>)}</div></section>

    <section className="cases">{game.cases.map(c=><article className={c.pressure>=8||c.deadline<=0?'urgent':''} key={c.id}>
      <div className="case-head"><span><b>{c.zone}</b><small>{c.client}</small></span><em>{'■'.repeat(c.severity)}{'□'.repeat(4-c.severity)}</em></div>
      <h3>{c.title}</h3><p>{c.text}</p>
      <div className="meters"><label>RESOLUTION {c.progress}/{c.target}<i><u style={{width:`${c.progress/c.target*100}%`}}/></i></label><label>PRESSURE {c.pressure}/10<i><u className="red" style={{width:`${c.pressure*10}%`}}/></i></label></div>
      <div className="stakes"><span>{c.public?'PUBLIC · RIVALS CAN CLAIM':'DIRECT MANDATE'}</span><b>{c.deadline<=0?'FINAL WINDOW':`${c.deadline+1} WEEKS LEFT`} · ₱{c.cash}k</b></div>
      <div className="actions">{(Object.keys(SKILLS) as Skill[]).map(s=>{const x=SKILLS[s],off=game.ended||agent.focus<1||game.ap<x.ap||game.cash<x.cash;return <button disabled={off} onClick={()=>act(c.id,s)} key={s}><span>{x.label}</span><b>{x.verb}</b><small>{agent[s]} skill · {x.ap} AP · ₱{x.cash}k</small></button>})}</div>
    </article>)}</section>
    {!game.ended&&<button className="end" onClick={endWeek}><span>ADVANCE THE SIMULATION</span><b>End week {game.week}</b><small>Ignored cases deteriorate. Rivals act. Operatives recover.</small></button>}

    <section className="grid"><div className="panel"><div className="panel-title"><div><p className="eyebrow">YOUR PEOPLE</p><h2>Operatives</h2></div><span>2 focus / week</span></div>{game.agents.map(a=><button className={`roster ${a.id===agent.id?'active':''}`} onClick={()=>setSelected(a.id)} key={a.id}><b>{a.call}</b><span>{a.name}</span><small>{a.trait} · XP {a.xp}</small><em>INT {a.intel} · FLD {a.field} · INF {a.influence}</em></button>)}</div>
    <div className="panel"><div className="panel-title"><div><p className="eyebrow">LONG-TERM MEASURE</p><h2>League table</h2></div><span>score {playerScore(game)}</span></div>{table.map((r,i)=><div className={`standing ${r.id==='you'?'you':''}`} key={r.id}><b>{i+1}</b><span><strong>{r.name}</strong><small>{r.style}</small></span><em>{r.score}</em></div>)}</div></section>

    <section className="panel block"><div className="panel-title"><div><p className="eyebrow">PERSISTENT WORLD</p><h2>District stability</h2></div><span>low stability breeds harder cases</span></div><div className="zones">{game.zones.map(z=><div key={z.id}><span><b>{z.name}</b><strong>{z.stability}</strong></span><p>{z.note}</p><i><u style={{width:`${z.stability}%`}}/></i></div>)}</div></section>
    <section className="panel block"><div className="panel-title"><div><p className="eyebrow">SIMULATION OUTPUT</p><h2>Operations feed</h2></div><span>newest first</span></div><div className="logs">{game.logs.map(l=><div className={l.tone} key={l.id}><b>W{l.week}</b><p>{l.text}</p></div>)}</div></section>
    <footer>Campaign seed {game.seed} · generated operatives, districts, cases, rivals, and outcomes.</footer>
  </main></div>
}
