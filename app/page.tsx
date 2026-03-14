"use client";
import { useState, useEffect, useCallback, useRef } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const MARKETS = [
  { code: "DE", label: "Germany",        flag: "🇩🇪" },
  { code: "NL", label: "Netherlands",    flag: "🇳🇱" },
  { code: "FR", label: "France",         flag: "🇫🇷" },
  { code: "ES", label: "Spain",          flag: "🇪🇸" },
];

const MARKET_CFG: Record<string, { base: number; vol: number }> = {
  DE: { base: 86, vol: 6 }, NL: { base: 90, vol: 6 },
  FR: { base: 78, vol: 5 }, ES: { base: 70, vol: 8 },
};

interface Summary { current_price:number; mean_24h:number; volatility_24h:number; trend:string; pct_change_24h:number; anomalies_detected:number; data_source?:string; }
interface PricePoint { timestamp:string; electricity_eur_mwh:number; }
interface Article { title:string; description:string; source:string; publishedAt:string; url:string; }
interface Intelligence { overall_sentiment:string; sentiment_score:number; key_events:string[]; supply_signals:string; demand_signals:string; geopolitical_risks:string; market_moving_news:string; }
interface Reasoning { price_analysis:string; news_signals:string; risk_assessment:string; market_outlook:string; recommendation:string; confidence:string; reasoning_summary:string; key_factors:string[]; }
interface Alert { type:string; severity:string; message:string; action:string; }
interface AgentLog { step:number; tool:string; status:string; message:string; result?:string; }
interface AnalysisData { timestamp:string; elapsed_seconds:number; agent_log:AgentLog[]; prices:{ prices:PricePoint[]; summary:Summary; market_label:string }; news:{ articles:Article[]; intelligence:Intelligence }; reasoning:Reasoning; alerts:Alert[]; recommendation:{ action:string; confidence:string; summary:string; key_factors:string[] }; data_source?:string; }
interface HistoryPoint { timestamp:string; price:number; trend:string; recommendation:string; pct_change:number; volatility:number; }
interface Msg { role:"user"|"agent"; content:string; time:string; }

// ── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  bg0:     "#07080f",
  bg1:     "#0a0c16",
  bg2:     "#0d1020",
  bg3:     "#111428",
  bg4:     "#161a32",
  border:  "#1e2240",
  border2: "#252a50",
  // Electric blue-cyan-purple blend (from Waste Management screenshot)
  blue:    "#3d8ef5",
  blueL:   "#6db8ff",
  blueD:   "#1a5bbf",
  cyan:    "#00c8e8",
  cyanD:   "#0090b0",
  purple:  "#5b2be0",
  purpleL: "#8855ff",
  // Gradient string — matches the screenshot blend
  grad:    "linear-gradient(135deg, #5b2be0 0%, #2979d4 50%, #00b4d8 100%)",
  gradH:   "linear-gradient(135deg, #7040ff 0%, #4090f0 50%, #00d4f0 100%)",
  gradSoft:"linear-gradient(135deg, rgba(91,43,224,0.15) 0%, rgba(41,121,212,0.15) 50%, rgba(0,180,216,0.12) 100%)",
  // Status
  green:   "#4db87a",
  red:     "#e05c5c",
  amber:   "#d49a3a",
  // Text
  text:    "#dce8ff",
  textD:   "#7a8fbb",
  textDD:  "#3a4470",
  SF: "-apple-system,SF Pro Display,BlinkMacSystemFont,sans-serif",
};

// ── LIVE CHART ────────────────────────────────────────────────────────────────
function LiveChart({ market }: { market: string }) {
  const cvs     = useRef<HTMLCanvasElement>(null);
  const wrap    = useRef<HTMLDivElement>(null);
  const prices  = useRef<number[]>([]);
  const candles = useRef<{o:number;h:number;l:number;c:number}[]>([]);
  const tickers = useRef<Record<string,number>>({ DE:86, NL:90, FR:78, ES:70 });
  const ticks   = useRef(0);
  const mouse   = useRef({ x:-1, y:-1 });
  const modeR   = useRef("line");
  const [mode, setMode] = useState("line");
  const [cd, setCd]     = useState(2);
  const [st, setSt]     = useState({ cur:86, chg:0, open:86, hi:90, lo:82, avg:86, vol:0, trend:"BULLISH", signal:"HOLD", ticker:{} as Record<string,number> });

  const rebuildCandles = () => {
    const p = prices.current, c = [];
    for (let i = 4; i < p.length; i += 5) {
      const s = p.slice(i-4, i+1);
      c.push({ o:s[0], h:Math.max(...s), l:Math.min(...s), c:s[s.length-1] });
    }
    candles.current = c.slice(-24);
  };

  const seed = useCallback(async (mkt: string) => {
    const cfg = MARKET_CFG[mkt]; let base = cfg.base;
    try { const r = await fetch(`${API_URL}/api/prices/live?market=${mkt}`); const j = await r.json(); if (j.current_price>0) base=j.current_price; } catch {}
    const arr: number[] = []; let p = base+(Math.random()-0.5)*3;
    for (let i=0;i<80;i++) { p+=( Math.random()-0.48)*cfg.vol*0.6; p=Math.max(10,Math.min(500,p)); arr.push(parseFloat(p.toFixed(2))); }
    arr[arr.length-1]=parseFloat(base.toFixed(2));
    prices.current=arr; candles.current=[]; ticks.current=0; rebuildCandles();
  }, []);

  const calcStats = useCallback(() => {
    const p=prices.current; if(!p.length)return;
    const cur=p[p.length-1], prev=p[Math.max(0,p.length-20)];
    const chg=((cur-prev)/prev)*100;
    const avg=p.reduce((a,b)=>a+b,0)/p.length;
    const vol=Math.sqrt(p.map(x=>(x-avg)**2).reduce((a,b)=>a+b,0)/p.length);
    const sl=p.slice(-40);
    setSt({ cur,chg,open:p[0],hi:Math.max(...sl),lo:Math.min(...sl),avg,vol,
      trend:cur>avg?"BULLISH":"BEARISH", signal:chg>1.5?"BUY":chg<-1.5?"SELL":"HOLD", ticker:{...tickers.current} });
  }, []);

  const draw = useCallback(() => {
    const c=cvs.current, w=wrap.current; if(!c||!w)return;
    const ctx=c.getContext("2d")!, W=c.width, H=c.height;
    const P={t:14,r:58,b:26,l:6}; const cW=W-P.l-P.r, cH=H-P.t-P.b;
    ctx.clearRect(0,0,W,H);
    const isCandle=modeR.current==="candle";
    const allVals=isCandle?[...candles.current.map(c=>c.l),...candles.current.map(c=>c.h)]:prices.current;
    if(allVals.length<2)return;
    const lo=Math.min(...allVals)-2, hi=Math.max(...allVals)+2, range=hi-lo||1;
    const tX=(i:number,n:number)=>P.l+(i/(n-1||1))*cW;
    const tY=(v:number)=>P.t+(1-(v-lo)/range)*cH;

    // Grid
    for(let i=0;i<=4;i++){
      const y=P.t+(i/4)*cH;
      ctx.strokeStyle=`rgba(77,142,245,0.07)`; ctx.lineWidth=0.5;
      ctx.beginPath(); ctx.moveTo(P.l,y); ctx.lineTo(W-P.r,y); ctx.stroke();
      ctx.fillStyle="rgba(77,142,245,0.3)"; ctx.font="9px monospace"; ctx.textAlign="left";
      ctx.fillText((hi-(i/4)*range).toFixed(0),W-P.r+5,y+3);
    }

    const lastP=prices.current[prices.current.length-1]??lo;
    const isUp=lastP>=(prices.current[0]??lastP);
    const lineC=isUp?C.blue:C.red;

    if(isCandle){
      const cw=Math.max(3,(cW/candles.current.length)*0.55);
      candles.current.forEach((cd,i)=>{
        const x=tX(i,candles.current.length),bull=cd.c>=cd.o,col=bull?C.blue:C.red;
        ctx.strokeStyle=col; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(x,tY(cd.h)); ctx.lineTo(x,tY(cd.l)); ctx.stroke();
        ctx.fillStyle=col; const yO=tY(cd.o),yC=tY(cd.c);
        ctx.fillRect(x-cw/2,Math.min(yO,yC),cw,Math.max(1,Math.abs(yO-yC)));
      });
    } else {
      if(modeR.current==="area"){
        const grad=ctx.createLinearGradient(0,P.t,0,H-P.b);
        grad.addColorStop(0,isUp?"rgba(77,142,245,0.18)":"rgba(224,92,92,0.1)");
        grad.addColorStop(1,"rgba(0,0,0,0)");
        ctx.beginPath();
        prices.current.forEach((v,i)=>i===0?ctx.moveTo(tX(i,prices.current.length),tY(v)):ctx.lineTo(tX(i,prices.current.length),tY(v)));
        ctx.lineTo(tX(prices.current.length-1,prices.current.length),H-P.b);
        ctx.lineTo(P.l,H-P.b); ctx.closePath(); ctx.fillStyle=grad; ctx.fill();
      }
      // Glow
      ctx.beginPath();
      prices.current.forEach((v,i)=>i===0?ctx.moveTo(tX(i,prices.current.length),tY(v)):ctx.lineTo(tX(i,prices.current.length),tY(v)));
      ctx.strokeStyle=isUp?"rgba(0,180,216,0.2)":"rgba(224,92,92,0.15)"; ctx.lineWidth=6; ctx.lineJoin="round"; ctx.stroke();
      // Line
      ctx.beginPath();
      prices.current.forEach((v,i)=>i===0?ctx.moveTo(tX(i,prices.current.length),tY(v)):ctx.lineTo(tX(i,prices.current.length),tY(v)));
      ctx.strokeStyle=lineC; ctx.lineWidth=1.8; ctx.lineJoin="round"; ctx.stroke();
      // Dot
      const lx=tX(prices.current.length-1,prices.current.length),ly=tY(lastP);
      ctx.beginPath(); ctx.arc(lx,ly,6,0,Math.PI*2); ctx.fillStyle=lineC+"25"; ctx.fill();
      ctx.beginPath(); ctx.arc(lx,ly,3,0,Math.PI*2); ctx.fillStyle=lineC; ctx.fill();
    }

    // Price dashed
    const lyP=tY(lastP);
    ctx.setLineDash([2,5]); ctx.strokeStyle="rgba(0,180,216,0.12)"; ctx.lineWidth=0.8;
    ctx.beginPath(); ctx.moveTo(P.l,lyP); ctx.lineTo(W-P.r,lyP); ctx.stroke();
    ctx.setLineDash([]);
    // Pill
    ctx.fillStyle=C.bg3; ctx.strokeStyle=C.border2; ctx.lineWidth=1;
    ctx.beginPath(); (ctx as any).roundRect(W-P.r+4,lyP-8,52,16,4); ctx.fill(); ctx.stroke();
    ctx.fillStyle=lineC; ctx.font="bold 9px monospace"; ctx.textAlign="center";
    ctx.fillText("€"+lastP.toFixed(2),W-P.r+30,lyP+4);

    // Crosshair
    const mx=mouse.current.x,my=mouse.current.y;
    if(mx>P.l&&mx<W-P.r&&my>P.t&&my<H-P.b){
      ctx.strokeStyle="rgba(77,142,245,0.18)"; ctx.lineWidth=0.8; ctx.setLineDash([2,3]);
      ctx.beginPath(); ctx.moveTo(mx,P.t); ctx.lineTo(mx,H-P.b); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(P.l,my); ctx.lineTo(W-P.r,my); ctx.stroke();
      ctx.setLineDash([]);
      const val=hi-((my-P.t)/cH)*range;
      ctx.fillStyle=C.bg3; ctx.strokeStyle=C.border2; ctx.lineWidth=1;
      ctx.beginPath(); (ctx as any).roundRect(W-P.r+4,my-8,52,16,4); ctx.fill(); ctx.stroke();
      ctx.fillStyle=C.blueL; ctx.textAlign="center";
      ctx.fillText("€"+val.toFixed(1),W-P.r+30,my+4);
    }
  }, [st]);

  const tick = useCallback(() => {
    const cfg=MARKET_CFG[market],p=prices.current, last=p[p.length-1];
    const mom=p.length>5?(p[p.length-1]-p[p.length-5])*0.04:0;
    const next=parseFloat(Math.max(10,Math.min(500,last+(Math.random()-0.48)*cfg.vol*0.5+mom)).toFixed(2));
    p.push(next); if(p.length>120)p.shift(); ticks.current++;
    if(ticks.current%5===0){
      const s=p.slice(-5);
      candles.current.push({o:s[0],h:Math.max(...s),l:Math.min(...s),c:s[s.length-1]});
      if(candles.current.length>24)candles.current.shift();
    }
    Object.keys(tickers.current).forEach(mk=>{
      const c=MARKET_CFG[mk];
      tickers.current[mk]=parseFloat(Math.max(10,Math.min(500,tickers.current[mk]+(Math.random()-0.48)*c.vol*0.3)).toFixed(2));
    });
    calcStats(); draw();
  }, [market,calcStats,draw]);

  const resize = useCallback(()=>{ const c=cvs.current,w=wrap.current; if(!c||!w)return; c.width=w.clientWidth; c.height=w.clientHeight; draw(); },[draw]);

  useEffect(()=>{ seed(market).then(()=>{calcStats();resize();}); window.addEventListener("resize",resize); return()=>window.removeEventListener("resize",resize); },[market]);
  useEffect(()=>{ let t=2; setCd(2); const iv=setInterval(()=>{t--;setCd(t);if(t<=0){tick();t=2;setCd(2);}},1000); return()=>clearInterval(iv); },[tick]);

  const isUp=st.chg>=0;
  const mainC=isUp?C.blue:C.red;
  const sigC=st.signal==="BUY"?C.green:st.signal==="SELL"?C.red:C.amber;

  return (
    <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:16, overflow:"hidden" }}>
      <div style={{ padding:"12px 14px 10px", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", flexWrap:"wrap", alignItems:"flex-start", gap:12, marginBottom:10 }}>
          <div>
            <div style={{ fontSize:10, color:C.textDD, letterSpacing:2, fontFamily:"monospace", marginBottom:3 }}>
              {MARKETS.find(m=>m.code===market)?.flag} {market} · ELECTRICITY · €/MWh
            </div>
            <div style={{ display:"flex", alignItems:"baseline", gap:10 }}>
              <span style={{ fontSize:34, fontWeight:700, color:mainC, fontFamily:C.SF, letterSpacing:-1.5 }}>€{st.cur.toFixed(2)}</span>
              <span style={{ fontSize:13, fontWeight:600, color:mainC, background:`${mainC}18`, border:`1px solid ${mainC}40`, borderRadius:6, padding:"3px 10px", fontFamily:"monospace" }}>
                {isUp?"+":""}{st.chg.toFixed(2)}%
              </span>
            </div>
          </div>
          <div style={{ display:"flex", gap:20, flexWrap:"wrap", alignSelf:"flex-end", paddingBottom:4 }}>
            {[["O",st.open],["H",st.hi],["L",st.lo]].map(([k,v])=>(
              <div key={String(k)} style={{ fontSize:12, color:C.textDD, fontFamily:"monospace" }}>
                {k}:<span style={{ color:C.textD, marginLeft:3 }}>{Number(v).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:6, flexShrink:0, flexWrap:"wrap" as const, justifyContent:"flex-end" }}>
            <span style={{ fontSize:10, color:C.textDD, fontFamily:"monospace" }}>NEXT {cd}s</span>
            <div style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(41,121,212,0.1)", border:"1px solid rgba(0,180,216,0.2)", borderRadius:5, padding:"3px 8px" }}>
              <div style={{ width:5, height:5, borderRadius:"50%", background:C.blue, animation:"bPulse 2s infinite" }} />
              <span style={{ fontSize:9, color:C.blue, letterSpacing:2, fontFamily:"monospace" }}>LIVE</span>
            </div>
          </div>
        </div>
        <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
          {[["AVG",`€${st.avg.toFixed(2)}`],["VOL",`€${st.vol.toFixed(2)}`],["TREND",st.trend,st.trend==="BULLISH"?C.green:C.red],["SIGNAL",st.signal,sigC]].map(([k,v,col])=>(
            <div key={String(k)} style={{ fontSize:11, color:C.textDD, fontFamily:"monospace" }}>
              {k}: <span style={{ color:col||C.textD, fontWeight:col?700:400 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding:"8px 14px 0", display:"flex", gap:5 }}>
        {["line","candle","area"].map(m=>(
          <button key={m} onClick={()=>{setMode(m);modeR.current=m;draw();}} style={{ padding:"4px 14px", fontSize:9, letterSpacing:1.5, fontFamily:"monospace", fontWeight:700, borderRadius:5, border:`1px solid ${mode===m?"rgba(0,180,216,0.4)":C.border}`, background:mode===m?"rgba(41,121,212,0.1)":"transparent", color:mode===m?C.blue:C.textDD, cursor:"pointer", transition:"all 0.2s", textTransform:"uppercase" as const }}>
            {m}
          </button>
        ))}
      </div>
      <div ref={wrap} style={{ height:200, margin:"8px 10px", cursor:"crosshair" }}
        onMouseMove={e=>{const r=wrap.current?.getBoundingClientRect();if(!r)return;mouse.current={x:e.clientX-r.left,y:e.clientY-r.top};draw();}}
        onMouseLeave={()=>{mouse.current={x:-1,y:-1};draw();}}>
        <canvas ref={cvs} style={{ width:"100%", height:"100%" }} />
      </div>
      <div style={{ borderTop:`1px solid ${C.border}`, padding:"8px 14px", display:"flex", gap:24, overflowX:"auto", background:C.bg1 }}>
        {Object.entries(st.ticker).map(([mk,price])=>{
          const diff=price-MARKET_CFG[mk].base;
          return (
            <div key={mk} style={{ fontSize:11, color:C.textDD, fontFamily:"monospace", whiteSpace:"nowrap", flexShrink:0 }}>
              {mk} <span style={{ color:diff>=0?C.blue:C.red, fontWeight:700 }}>€{price.toFixed(2)}</span>
              <span style={{ color:diff>=0?C.blueD:C.red, fontSize:10, marginLeft:3 }}>{diff>=0?"+":""}{diff.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── CARD ─────────────────────────────────────────────────────────────────────
function Card({ children, style={} }: { children:React.ReactNode; style?:React.CSSProperties }) {
  return <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:14, ...style }}>{children}</div>;
}
function Label({ children }: { children:React.ReactNode }) {
  return <div style={{ fontSize:9, color:C.textDD, letterSpacing:3, fontFamily:"monospace", fontWeight:700, marginBottom:12 }}>{children}</div>;
}

function HistoryChart({ history }: { history:HistoryPoint[] }) {
  if(!history.length) return <div style={{ textAlign:"center", padding:"28px 0", color:C.textDD, fontSize:12, fontFamily:"monospace" }}>NO DATA YET</div>;
  const vals=history.map(h=>h.price);
  const min=Math.min(...vals)-3,max=Math.max(...vals)+3,range=max-min||1;
  const W=560,H=90;
  const pts=vals.map((v,i)=>`${(i/(vals.length-1||1))*W},${H-((v-min)/range)*H}`).join(" ");
  return (
    <div style={{ width:"100%", overflowX:"auto" }}>
      <svg viewBox={`0 0 ${W} ${H+6}`} style={{ width:"100%", minWidth:240 }}>
        <defs>
          <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.blue} stopOpacity="0.15"/>
            <stop offset="100%" stopColor={C.blue} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <polygon fill="url(#blueGrad)" points={`0,${H} ${pts} ${W},${H}`}/>
        <polyline fill="none" stroke={C.blueD} strokeWidth="1.5" points={pts}/>
        {history.map((h,i)=>{
          const col=h.recommendation==="BUY"?C.green:h.recommendation==="SELL"?C.red:C.amber;
          return <circle key={i} cx={(i/(history.length-1||1))*W} cy={H-((h.price-min)/range)*H} r="3" fill={col}/>;
        })}
      </svg>
      <div style={{ display:"flex", gap:16, marginTop:8, flexWrap:"wrap" }}>
        {[[C.green,"BUY"],[C.red,"SELL"],[C.amber,"HOLD"]].map(([col,l])=>(
          <div key={l} style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:C.textDD, fontFamily:"monospace", letterSpacing:1 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:col }}/>{l}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function EnergyAgentDashboard() {
  const [data,    setData]    = useState<AnalysisData|null>(null);
  const [loading, setLoading] = useState(false);
  const [market,  setMarket]  = useState("DE");
  const [tab,     setTab]     = useState<"reasoning"|"news"|"history"|"logs">("reasoning");
  const [msgs,    setMsgs]    = useState<Msg[]>([]);
  const [q,       setQ]       = useState("");
  const [askLoad, setAskLoad] = useState(false);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [email,   setEmail]   = useState("");
  const [subMsg,  setSubMsg]  = useState("");
  const [subLoad, setSubLoad] = useState(false);
  const [phone,   setPhone]   = useState("");
  const [waMsg,   setWaMsg]   = useState("");
  const [waLoad,  setWaLoad]  = useState(false);
  const [alertCfg,setAlertCfg]= useState({ price_above:150, price_below:30, volatility_above:25 });
  const [saved,   setSaved]   = useState(false);
  const [updated, setUpdated] = useState("");
  const [nextR,   setNextR]   = useState(600);
  const chatEnd = useRef<HTMLDivElement>(null);

  const runAnalysis = useCallback(async (m?:string) => {
    setLoading(true); const mkt=m||market;
    try {
      const [r1,r2]=await Promise.all([fetch(`${API_URL}/api/analyze?market=${mkt}`),fetch(`${API_URL}/api/history?market=${mkt}`)]);
      const [j1,j2]=await Promise.all([r1.json(),r2.json()]);
      setData(j1); setHistory(j2.history||[]); setUpdated(new Date().toLocaleTimeString()); setNextR(600);
    } catch {} finally { setLoading(false); }
  }, [market]);

  useEffect(()=>{ runAnalysis(); const iv=setInterval(()=>runAnalysis(),600000); return()=>clearInterval(iv); },[market]);
  useEffect(()=>{ const iv=setInterval(()=>setNextR(p=>p>0?p-1:600),1000); return()=>clearInterval(iv); },[]);
  useEffect(()=>{ chatEnd.current?.scrollIntoView({behavior:"smooth"}); },[msgs,askLoad]);

  const switchMkt=(m:string)=>{ setMarket(m); setData(null); runAnalysis(m); };

  const ask=async()=>{
    if(!q.trim())return;
    const question=q.trim(), t=new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    setQ(""); setMsgs(p=>[...p,{role:"user",content:question,time:t}]); setAskLoad(true);
    try {
      const r=await fetch(`${API_URL}/api/ask`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question,market})});
      const j=await r.json();
      setMsgs(p=>[...p,{role:"agent",content:j.answer,time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}]);
    } catch { setMsgs(p=>[...p,{role:"agent",content:"Error connecting to agent.",time:""}]); }
    finally { setAskLoad(false); }
  };

  const subscribe=async()=>{
    if(!email||!email.includes("@")){ setSubMsg("Enter a valid email"); return; }
    setSubLoad(true);
    try {
      const r=await fetch(`${API_URL}/api/subscribe`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})});
      const j=await r.json(); setSubMsg(j.message); if(j.subscribed)setEmail("");
    } catch { setSubMsg("Connection error"); } finally { setSubLoad(false); }
  };

  const waSubscribe=async()=>{
    if(!phone||phone.length<8){setWaMsg("Enter a valid phone with country code");return;}
    setWaLoad(true);
    try{
      const r=await fetch(`${API_URL}/api/wa/subscribe`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone})});
      const j=await r.json();setWaMsg(j.message);
      if(j.subscribed)setPhone("");
    }catch{setWaMsg("Connection error");}
    finally{setWaLoad(false);}
  };

  const saveAlerts=async()=>{
    try {
      await fetch(`${API_URL}/api/alerts/config`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(alertCfg)});
      setSaved(true); setTimeout(()=>setSaved(false),2000);
    } catch {}
  };

  const rec      = data?.recommendation;
  const reasoning= data?.reasoning;
  const intel    = data?.news?.intelligence;
  const alerts   = data?.alerts||[];
  const agentLog = data?.agent_log||[];
  const src      = data?.data_source||"Simulated";
  const mins     = Math.floor(nextR/60), secs=nextR%60;

  const recC      = rec?.action==="BUY"?C.green:rec?.action==="SELL"?C.red:"#00c8e8";
  const recGrad   = rec?.action==="BUY"?`linear-gradient(135deg,rgba(77,184,122,0.1),rgba(13,16,32,0.9))`:rec?.action==="SELL"?`linear-gradient(135deg,rgba(224,92,92,0.1),rgba(13,16,32,0.9))`:`linear-gradient(135deg,rgba(41,121,212,0.1),rgba(13,16,32,0.9))`;
  const recBorder = rec?.action==="BUY"?`rgba(77,184,122,0.25)`:rec?.action==="SELL"?`rgba(224,92,92,0.25)`:`rgba(77,142,245,0.25)`;
  const aColor=(s:string)=>s==="HIGH"?C.red:s==="MEDIUM"?C.amber:s==="INFO"?C.blue:C.textDD;
  const subOk=subMsg.toLowerCase().includes("subscribed")||subMsg.toLowerCase().includes("success")||subMsg.toLowerCase().includes("already")||subMsg.toLowerCase().includes("check");

  const inputS: React.CSSProperties = { width:"100%", background:C.bg1, border:`1px solid ${C.border}`, borderRadius:9, padding:"9px 14px", fontSize:13, color:C.text, fontFamily:C.SF, boxSizing:"border-box", outline:"none", transition:"border-color 0.2s" };

  return (
    <div style={{ minHeight:"100vh", background:C.bg0, color:C.text, fontFamily:C.SF }}>

      <style>{`
        @keyframes bPulse{0%,100%{opacity:1}50%{opacity:0.25}}
        @keyframes gradShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        @keyframes eaIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .ea1{animation:eaIn 0.4s 0.05s ease both}
        .ea2{animation:eaIn 0.4s 0.10s ease both}
        .ea3{animation:eaIn 0.4s 0.15s ease both}
        .ea4{animation:eaIn 0.4s 0.20s ease both}
        .ea5{animation:eaIn 0.4s 0.25s ease both}
        .mkt:hover{background:rgba(41,121,212,0.1)!important;border-color:rgba(77,142,245,0.35)!important;color:${C.blue}!important}
        .gbtn:hover{background:rgba(0,180,216,0.12)!important;border-color:rgba(77,142,245,0.35)!important;color:${C.blueL}!important}
        .newscard:hover{border-color:${C.border2}!important;background:${C.bg3}!important}
        .hcard:hover{transform:translateY(-1px)}
        .tabBtn:hover{color:${C.textD}!important}
        input:focus{border-color:rgba(77,142,245,0.45)!important;box-shadow:0 0 0 3px rgba(41,121,212,0.1)!important}
        input::placeholder{color:${C.textDD}!important}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:${C.border2};border-radius:2px}
        a{text-decoration:none}
        @media(max-width:640px){
          .hide-mobile{display:none!important}
          table{font-size:11px!important}
          table td,table th{padding:6px 8px!important}
          .ea-rec-row{flex-direction:column!important}
        }
        @media(min-width:641px){
          .hide-mobile{display:flex!important}
        }
      `}</style>

      {/* Gradient top bar */}
      <div style={{ height:2, background:"linear-gradient(90deg,#4d8ef5,#7c5cbf,#4d8ef5)", backgroundSize:"200% 100%", animation:"gradShift 4s ease infinite" }} />

      {/* ── HEADER ── */}
      <header style={{ position:"sticky", top:0, zIndex:100, background:`${C.bg0}f0`, backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)", borderBottom:`1px solid ${C.border}`, padding:"0 12px" }}>
        <div style={{ maxWidth:1120, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", height:56 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              {/* Logo with gradient */}
              <div style={{ width:34, height:34, borderRadius:10, background:C.grad, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, boxShadow:"0 2px 20px rgba(77,142,245,0.35)" }}>⚡</div>
              <div>
                <div style={{ fontSize:15, fontWeight:700, letterSpacing:-0.3 }}>
                  <span style={{ background:C.grad, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>Energy</span>
                  <span style={{ color:C.text }}>Agent</span>
                </div>
                <div className="hide-mobile" style={{ fontSize:9, color:C.textDD, letterSpacing:2.5, fontFamily:"monospace" }}>AUTONOMOUS MARKET INTELLIGENCE</div>
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
              {src==="ENTSO-E" && (
                <div className="hide-mobile" style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(41,121,212,0.1)", border:"1px solid rgba(0,180,216,0.2)", borderRadius:6, padding:"3px 9px" }}>
                  <div style={{ width:5, height:5, borderRadius:"50%", background:C.blue, animation:"bPulse 2s infinite" }}/>
                  <span style={{ fontSize:9, color:C.blue, letterSpacing:1.5, fontFamily:"monospace" }}>ENTSO-E LIVE</span>
                </div>
              )}
              <span className="hide-mobile" style={{ fontSize:10, color:C.textDD, fontFamily:"monospace", whiteSpace:"nowrap" as const }}>{updated} · AI {mins}:{secs.toString().padStart(2,"0")}</span>
              <button onClick={()=>runAnalysis()} disabled={loading} className="gbtn"
                style={{ padding:"7px 14px", fontSize:10, fontWeight:700, letterSpacing:1, fontFamily:"monospace", borderRadius:8, border:`1px solid ${C.border2}`, background:"rgba(41,121,212,0.1)", color:loading?C.textDD:"#00c8e8", cursor:loading?"not-allowed":"pointer", transition:"all 0.2s", whiteSpace:"nowrap" as const }}>
                {loading?"...":"▶ RUN AI"}
              </button>
            </div>
          </div>
          <div style={{ display:"flex", gap:5, paddingBottom:10, overflowX:"auto" }}>
            {MARKETS.map(m=>(
              <button key={m.code} onClick={()=>switchMkt(m.code)} className="mkt"
                style={{ padding:"5px 16px", fontSize:10, fontWeight:700, letterSpacing:1, fontFamily:"monospace", borderRadius:7, border:`1px solid ${market===m.code?"rgba(0,180,216,0.4)":C.border}`, background:market===m.code?"rgba(0,180,216,0.12)":"transparent", color:market===m.code?C.blue:C.textDD, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0, transition:"all 0.2s" }}>
                {m.flag} {m.code} — {m.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Loading */}
      {loading && !data && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"62vh", gap:20 }}>
          <div style={{ position:"relative", width:60, height:60 }}>
            <div style={{ position:"absolute", inset:0, borderRadius:"50%", border:`1px solid ${C.border}`, borderTopColor:C.blue, animation:"spin 0.9s linear infinite" }}/>
            <div style={{ position:"absolute", inset:10, borderRadius:"50%", border:`1px solid ${C.border}`, borderBottomColor:C.purple, animation:"spin 1.5s linear infinite reverse" }}/>
            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>⚡</div>
          </div>
          <div style={{ fontSize:11, color:C.textDD, letterSpacing:4, fontFamily:"monospace" }}>ANALYZING MARKETS</div>
        </div>
      )}

      {data && (
        <main style={{ maxWidth:1120, margin:"0 auto", padding:"16px 10px 48px" }}>

          {/* ── RECOMMENDATION ── */}
          <div className="ea1" style={{ background:recGrad, border:`1px solid ${recBorder}`, borderRadius:20, padding:"16px 14px", marginBottom:14, position:"relative", overflow:"hidden" }}>
            {/* Decorative gradient orb */}
            <div style={{ position:"absolute", top:-60, right:-60, width:200, height:200, borderRadius:"50%", background:`radial-gradient(circle,${recC}15,transparent 70%)`, pointerEvents:"none" }}/>
            <div style={{ display:"flex", flexWrap:"wrap", gap:12, alignItems:"flex-start", position:"relative", flexDirection:"column" as const }}>
              <div style={{ minWidth:0, flexShrink:0 }}>
                <div style={{ fontSize:9, color:C.textDD, letterSpacing:3, fontFamily:"monospace", marginBottom:5 }}>AI SIGNAL · {data.prices.market_label?.toUpperCase()}</div>
                <div style={{ fontSize:58, fontWeight:800, color:recC, letterSpacing:-2.5, lineHeight:1 }}>{rec?.action}</div>
                <div style={{ fontSize:11, color:C.textDD, marginTop:5, fontFamily:"monospace" }}>CONFIDENCE: <span style={{ color:C.textD }}>{rec?.confidence}</span></div>
                {src==="ENTSO-E" && (
                  <div style={{ display:"flex", alignItems:"center", gap:5, marginTop:6 }}>
                    <div style={{ width:5, height:5, borderRadius:"50%", background:C.blue, animation:"bPulse 2s infinite" }}/>
                    <span style={{ fontSize:9, color:C.blueD, letterSpacing:1, fontFamily:"monospace" }}>REAL MARKET DATA</span>
                  </div>
                )}
              </div>
              <div style={{ flex:1, fontSize:13, color:C.textD, lineHeight:1.8, minWidth:0 }}>{rec?.summary}</div>
              {(rec?.key_factors?.length??0)>0 && (
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:9, color:C.textDD, letterSpacing:3, fontFamily:"monospace", marginBottom:8 }}>KEY FACTORS</div>
                  {rec!.key_factors.map((f,i)=>(
                    <div key={i} style={{ fontSize:12, color:C.textD, marginBottom:5, display:"flex", gap:8, alignItems:"flex-start", lineHeight:1.5 }}>
                      <span style={{ background:C.grad, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", flexShrink:0 }}>◆</span>{f}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── STAT ROW ── */}
          <div className="ea2" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:8, marginBottom:14 }}>
            {[
              ["CURRENT",`€${data.prices.summary.current_price}`,C.blue],
              ["24H AVG",`€${data.prices.summary.mean_24h}`,C.textD],
              ["VOLATILITY",`€${data.prices.summary.volatility_24h}`,C.textD],
              ["24H CHANGE",`${data.prices.summary.pct_change_24h>0?"+":""}${data.prices.summary.pct_change_24h}%`,data.prices.summary.pct_change_24h>0?C.green:C.red],
              ["TREND",data.prices.summary.trend?.toUpperCase(),data.prices.summary.trend==="bullish"?C.green:C.red],
              ["SOURCE",src,src==="ENTSO-E"?C.blue:C.textD],
            ].map(([label,val,col])=>(
              <Card key={String(label)} style={{ padding:"12px 14px" }}>
                <div style={{ fontSize:9, color:C.textDD, letterSpacing:1.5, fontFamily:"monospace", marginBottom:5 }}>{label}</div>
                <div style={{ fontSize:14, fontWeight:700, color:String(col), fontFamily:"monospace" }}>{val}</div>
              </Card>
            ))}
          </div>

          {/* ── CHART ── */}
          <div className="ea2" style={{ marginBottom:14 }}><LiveChart market={market}/></div>

          {/* ── ALERTS ── */}
          {alerts.length>0 && (
            <div className="ea3" style={{ marginBottom:14 }}>
              <Label>ACTIVE ALERTS</Label>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:8 }}>
                {alerts.map((a,i)=>(
                  <div key={i} className="hcard" style={{ background:C.bg2, border:`1px solid ${aColor(a.severity)}30`, borderRadius:11, padding:"12px 16px", transition:"transform 0.15s" }}>
                    <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:5, flexWrap:"wrap" }}>
                      <div style={{ width:5, height:5, borderRadius:"50%", background:aColor(a.severity), flexShrink:0 }}/>
                      <span style={{ fontSize:10, color:aColor(a.severity), letterSpacing:1, fontFamily:"monospace", fontWeight:700 }}>{a.type}</span>
                      <span style={{ fontSize:9, background:`${aColor(a.severity)}15`, border:`1px solid ${aColor(a.severity)}30`, borderRadius:4, padding:"1px 7px", color:aColor(a.severity), fontFamily:"monospace" }}>{a.severity}</span>
                    </div>
                    <div style={{ fontSize:13, color:C.text, fontWeight:500, marginBottom:4, lineHeight:1.45 }}>{a.message}</div>
                    <div style={{ fontSize:11, color:C.textDD, fontFamily:"monospace" }}>→ {a.action}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── TABS ── */}
          <div className="ea4" style={{ marginBottom:14 }}>
            <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, marginBottom:16, overflowX:"auto" }}>
              {(["reasoning","news","history","logs"] as const).map(t=>(
                <button key={t} onClick={()=>setTab(t)} className="tabBtn"
                  style={{ padding:"10px 14px", fontSize:11, fontWeight:700, letterSpacing:1.5, fontFamily:"monospace", background:"transparent", border:"none", borderBottom:`2px solid ${tab===t?"#00c8e8":"transparent"}`, color:tab===t?"#00c8e8":C.textDD, cursor:"pointer", whiteSpace:"nowrap", transition:"all 0.2s" }}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>

            {tab==="reasoning" && reasoning && (
              <div style={{ display:"grid", gap:10 }}>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:8 }}>
                  {[["SUPPLY SIGNALS",intel?.supply_signals],["DEMAND SIGNALS",intel?.demand_signals],["GEOPOLITICAL RISKS",intel?.geopolitical_risks],["MARKET MOVING NEWS",intel?.market_moving_news]].map(([label,content])=>(
                    <Card key={String(label)} style={{ padding:"12px 12px" }}>
                      <Label>{label}</Label>
                      <p style={{ fontSize:12, color:C.textD, lineHeight:1.7, margin:0 }}>{String(content||"N/A")}</p>
                    </Card>
                  ))}
                </div>
                {[["PRICE ANALYSIS",reasoning.price_analysis,1],["NEWS SIGNALS",reasoning.news_signals,2],["RISK ASSESSMENT",reasoning.risk_assessment,3],["MARKET OUTLOOK",reasoning.market_outlook,4]].map(([label,content,step])=>(
                  <Card key={String(label)} style={{ padding:"12px 14px" }}>
                    <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                      <div style={{ width:24, height:24, borderRadius:7, background:"rgba(41,121,212,0.1)", border:"1px solid rgba(0,180,216,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:C.blue, fontFamily:"monospace", fontWeight:700, flexShrink:0, marginTop:1 }}>{step}</div>
                      <div style={{ flex:1 }}>
                        <Label>{label}</Label>
                        <p style={{ fontSize:13, color:C.textD, lineHeight:1.75, margin:0 }}>{typeof content === "object" ? JSON.stringify(content) : String(content||"")}</p>
                      </div>
                    </div>
                  </Card>
                ))}
                <div style={{ background:recGrad, border:`1px solid ${recBorder}`, borderRadius:14, padding:"14px 14px" }}>
                  <Label>STEP 5 — FINAL VERDICT</Label>
                  <div style={{ fontSize:22, fontWeight:800, color:recC, marginBottom:8 }}>{reasoning.recommendation} · {reasoning.confidence}</div>
                  <p style={{ fontSize:13, color:C.textD, lineHeight:1.75, margin:0 }}>{reasoning.reasoning_summary}</p>
                </div>
              </div>
            )}

            {tab==="news" && (
              <div style={{ display:"grid", gap:8 }}>
                {data.news.articles.map((a,i)=>(
                  <a key={i} href={a.url} target="_blank" rel="noopener noreferrer">
                    <div className="newscard" style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 14px", cursor:"pointer", transition:"all 0.18s" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7, flexWrap:"wrap" }}>
                        <span style={{ fontSize:9, background:"rgba(41,121,212,0.1)", border:"1px solid rgba(0,180,216,0.2)", borderRadius:5, padding:"2px 9px", color:C.blue, letterSpacing:1, fontFamily:"monospace", fontWeight:700 }}>{a.source.toUpperCase()}</span>
                        <span style={{ fontSize:10, color:C.textDD, fontFamily:"monospace" }}>{a.publishedAt?.slice(0,10)}</span>
                      </div>
                      <div style={{ fontSize:14, color:C.text, fontWeight:500, marginBottom:5, lineHeight:1.45 }}>{a.title}</div>
                      <div style={{ fontSize:12, color:C.textD, lineHeight:1.55, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" as const, overflow:"hidden" }}>{a.description}</div>
                    </div>
                  </a>
                ))}
              </div>
            )}

            {tab==="history" && (
              <div style={{ display:"grid", gap:10 }}>
                <Card style={{ padding:"14px 14px" }}>
                  <Label>PRICE HISTORY WITH AI SIGNALS</Label>
                  <HistoryChart history={history}/>
                </Card>
                <Card style={{ overflow:"hidden" }}>
                  <div style={{ padding:"12px 18px", borderBottom:`1px solid ${C.border}`, fontSize:9, color:C.textDD, letterSpacing:3, fontFamily:"monospace" }}>RECENT ANALYSES</div>
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                      <thead><tr>{["TIME","PRICE","CHANGE","TREND","SIGNAL"].map(h=>(
                        <th key={h} style={{ padding:"8px 16px", textAlign:"left", fontSize:9, color:C.textDD, fontWeight:700, letterSpacing:2, fontFamily:"monospace", borderBottom:`1px solid ${C.border}`, whiteSpace:"nowrap" }}>{h}</th>
                      ))}</tr></thead>
                      <tbody>
                        {[...history].reverse().slice(0,15).map((h,i)=>(
                          <tr key={i} style={{ borderBottom:`1px solid ${C.border}` }}>
                            <td style={{ padding:"9px 16px", color:C.textDD, fontFamily:"monospace", whiteSpace:"nowrap" }}>{h.timestamp.slice(11,16)}</td>
                            <td style={{ padding:"9px 16px", color:C.blue, fontWeight:700, fontFamily:"monospace", whiteSpace:"nowrap" }}>€{h.price}</td>
                            <td style={{ padding:"9px 16px", color:h.pct_change>0?C.green:C.red, fontFamily:"monospace", whiteSpace:"nowrap" }}>{h.pct_change>0?"+":""}{h.pct_change?.toFixed(1)}%</td>
                            <td style={{ padding:"9px 16px", color:C.textD, fontFamily:"monospace", whiteSpace:"nowrap", fontSize:10 }}>{h.trend?.toUpperCase()}</td>
                            <td style={{ padding:"9px 16px", fontWeight:700, fontFamily:"monospace", whiteSpace:"nowrap", color:h.recommendation==="BUY"?C.green:h.recommendation==="SELL"?C.red:C.blue }}>{h.recommendation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}

            {tab==="logs" && (
              <Card style={{ padding:"14px 14px" }}>
                <Label>AGENT EXECUTION LOG · {data.elapsed_seconds}s · {src}</Label>
                <div style={{ display:"grid", gap:14 }}>
                  {agentLog.map((log,i)=>(
                    <div key={i} style={{ display:"flex", flexWrap:"wrap", gap:10, alignItems:"center", paddingBottom:14, borderBottom:i<agentLog.length-1?`1px solid ${C.border}`:"none" }}>
                      <div style={{ width:24, height:24, borderRadius:7, background:"rgba(41,121,212,0.1)", border:"1px solid rgba(77,142,245,0.22)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:C.blue, fontFamily:"monospace", fontWeight:700, flexShrink:0 }}>{log.step}</div>
                      <span style={{ fontSize:10, color:C.blue, letterSpacing:1.5, fontFamily:"monospace", minWidth:130, fontWeight:700 }}>{log.tool.toUpperCase()}</span>
                      <span style={{ flex:1, fontSize:12, color:C.textD, lineHeight:1.5 }}>{log.message}</span>
                      {log.result && <span style={{ fontSize:11, color:C.green, fontFamily:"monospace" }}>✓ {log.result}</span>}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* ── SETTINGS + EMAIL ── */}
          <div className="ea5" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:12, marginBottom:14 }}>
            <Card style={{ padding:"14px 14px" }}>
              <Label>PRICE ALERT THRESHOLDS</Label>
              <div style={{ display:"grid", gap:10, marginBottom:14 }}>
                {[["Alert above (€/MWh)","price_above"],["Alert below (€/MWh)","price_below"],["Volatility above (€)","volatility_above"]].map(([label,key])=>(
                  <div key={key}>
                    <div style={{ fontSize:10, color:C.textDD, fontFamily:"monospace", letterSpacing:1, marginBottom:5 }}>{label}</div>
                    <input type="number" value={alertCfg[key as keyof typeof alertCfg]}
                      onChange={e=>setAlertCfg(p=>({...p,[key]:Number(e.target.value)}))}
                      style={inputS}/>
                  </div>
                ))}
              </div>
              <button onClick={saveAlerts} className="gbtn"
                style={{ padding:"9px 20px", fontSize:10, fontWeight:700, letterSpacing:1.5, fontFamily:"monospace", borderRadius:8, border:`1px solid ${saved?"rgba(0,180,216,0.4)":C.border2}`, background:saved?"rgba(0,180,216,0.12)":"rgba(41,121,212,0.07)", color:saved?C.blue:C.textD, cursor:"pointer", transition:"all 0.25s" }}>
                {saved?"✓ SAVED":"SAVE THRESHOLDS"}
              </button>
            </Card>

            <Card style={{ padding:"14px 14px", border:`1px solid rgba(0,180,216,0.15)` }}>
              <Label>EMAIL ALERTS</Label>
              <p style={{ fontSize:12, color:C.textD, lineHeight:1.7, marginBottom:10, marginTop:0 }}>Subscribe to receive automatic alerts when high-severity signals are triggered. Works with any email address.</p>
              <div style={{ background:"rgba(255,214,10,0.06)", border:"1px solid rgba(255,214,10,0.18)", borderRadius:8, padding:"8px 12px", marginBottom:12, display:"flex", gap:8, alignItems:"flex-start" }}>
                <span style={{ fontSize:12, flexShrink:0 }}>⚠️</span>
                <span style={{ fontSize:11, color:"rgba(255,214,10,0.65)", lineHeight:1.6 }}>Emails may arrive in your <strong style={{color:"rgba(255,214,10,0.85)"}}>spam/junk folder</strong>. Please check there and mark as "Not Spam" to receive future alerts in your inbox.</span>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&subscribe()}
                  placeholder="your@email.com" style={inputS}/>
                <button onClick={subscribe} disabled={subLoad||!email.trim()} className="gbtn"
                  style={{ padding:"10px", fontSize:10, fontWeight:700, letterSpacing:1.5, fontFamily:"monospace", borderRadius:8, border:`1px solid ${C.border2}`, background:"rgba(41,121,212,0.1)", color:subLoad?C.textDD:C.blue, cursor:subLoad?"not-allowed":"pointer", transition:"all 0.2s" }}>
                  {subLoad?"SUBSCRIBING...":"SUBSCRIBE TO ALERTS"}
                </button>
              </div>
              {subMsg && (
                <div style={{ marginTop:10, fontSize:11, padding:"8px 12px", borderRadius:8, background:subOk?"rgba(77,184,122,0.08)":"rgba(224,92,92,0.08)", border:`1px solid ${subOk?"rgba(77,184,122,0.25)":"rgba(224,92,92,0.25)"}`, color:subOk?C.green:C.red, fontFamily:"monospace" }}>
                  {subMsg}
                </div>
              )}
            </Card>
          </div>

          {/* ── CHAT ── */}
          <Card style={{ overflow:"hidden" }}>
            <div style={{ padding:"10px 14px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:7, height:7, borderRadius:"50%", background:C.blue, animation:"bPulse 2s infinite" }}/>
              <span style={{ fontSize:10, color:C.textD, fontWeight:700, letterSpacing:2, fontFamily:"monospace" }}>ASK THE AGENT</span>
              {msgs.length>0 && (
                <button onClick={()=>setMsgs([])} style={{ marginLeft:"auto", fontSize:9, color:C.textDD, background:"none", border:"none", cursor:"pointer", letterSpacing:1.5, fontFamily:"monospace" }}>CLEAR</button>
              )}
            </div>
            <div style={{ height:260, overflowY:"auto", padding:"14px 14px", display:"flex", flexDirection:"column", gap:10 }}>
              {msgs.length===0 && (
                <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:10, opacity:0.35 }}>
                  <div style={{ fontSize:28 }}>⚡</div>
                  <div style={{ fontSize:12, color:C.textD, fontFamily:"monospace", letterSpacing:1 }}>ASK ME ANYTHING ABOUT ENERGY MARKETS</div>
                  <div style={{ fontSize:10, color:C.textDD, fontFamily:"monospace" }}>e.g. Should I hedge my gas position today?</div>
                </div>
              )}
              {msgs.map((m,i)=>(
                <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
                  <div style={{ maxWidth:"76%", padding:"10px 14px", borderRadius:m.role==="user"?"12px 12px 3px 12px":"12px 12px 12px 3px", background:m.role==="user"?"rgba(0,180,216,0.12)":C.bg3, border:`1px solid ${m.role==="user"?"rgba(77,142,245,0.25)":C.border}`, fontSize:13, color:C.text, lineHeight:1.6 }}>
                    {m.content}
                    <div style={{ fontSize:9, color:C.textDD, marginTop:4, textAlign:m.role==="user"?"right":"left", fontFamily:"monospace" }}>{m.time}</div>
                  </div>
                </div>
              ))}
              {askLoad && (
                <div style={{ display:"flex", justifyContent:"flex-start" }}>
                  <div style={{ padding:"10px 16px", borderRadius:"12px 12px 12px 3px", background:C.bg3, border:`1px solid ${C.border}`, display:"flex", gap:5, alignItems:"center" }}>
                    {[0,150,300].map(d=><div key={d} style={{ width:5, height:5, borderRadius:"50%", background:C.blue, animation:`bPulse 1s ${d}ms infinite` }}/>)}
                  </div>
                </div>
              )}
              <div ref={chatEnd}/>
            </div>
            <div style={{ borderTop:`1px solid ${C.border}`, padding:"10px 14px", display:"flex", gap:8 }}>
              <input type="text" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&ask()}
                placeholder="Ask about energy markets..."
                style={{ flex:1, background:C.bg1, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 16px", fontSize:13, color:C.text, fontFamily:C.SF, outline:"none", transition:"border-color 0.2s" }}/>
              <button onClick={ask} disabled={askLoad||!q.trim()}
                style={{ width:40, height:40, borderRadius:10, background:q.trim()?"rgba(0,180,216,0.15)":"rgba(77,142,245,0.04)", border:`1px solid ${q.trim()?"rgba(0,180,216,0.4)":C.border}`, color:q.trim()?"#00c8e8":C.textDD, cursor:q.trim()?"pointer":"not-allowed", fontSize:13, display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.2s", flexShrink:0 }}>▶</button>
            </div>
          </Card>

          <div style={{ textAlign:"center", fontSize:9, color:C.textDD, marginTop:28, letterSpacing:2.5, fontFamily:"monospace" }}>
            ENERGYAGENT · GROQ LLAMA 3.3 70B · ENTSO-E REAL PRICES · BREVO ALERTS
          </div>
        </main>
      )}
    </div>
  );
}