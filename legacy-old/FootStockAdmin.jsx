import { useState, useEffect, useRef, useCallback } from "react";

/* ── TOKENS — mesmos do FootStockApp ── */
const BG="#080b12",SURFACE="#0e1219",CARD="#121820",BORDER="#1e2636";
const ACCENT="#6c63ff",ACCENT2="#38bdf8",RED="#f43f5e",GOLD="#f59e0b";
const GREEN="#22c55e",ORANGE="#f97316";
const TEXT="#e8eaf0",MUTED="#7a8ba8";
const GRAD_ACCENT="linear-gradient(135deg,#6c63ff,#38bdf8)";
const GRAD_LENDA="linear-gradient(135deg,#f5a623,#e8830a)";
const SANS="'Inter','Helvetica Neue',sans-serif",MONO="'JetBrains Mono','Fira Mono',monospace";

/* ── DADOS DOS CLUBES (espelho do FootStockApp) ── */
const CLUBS=[
  /* ── SÉRIE A ─────────────────────────────────────────────────────────── */
  {ticker:"URU3",name:"Urubu da Gávea FC",       realName:"Flamengo",        div:"A",color:"#E32B28",c2:"#fff",sent:0.82,
   rev:1540, evMult:3.8, squad:1400, brand:2374, debt:310, ff:0.28,
   revenueLabel:"R$1,54bi"},

  {ticker:"POR4",name:"Porco do Parque FC",       realName:"Palmeiras",       div:"A",color:"#006432",c2:"#fff",sent:0.70,
   rev:1380, evMult:4.2, squad:1600, brand:1569, debt:180, ff:0.30,
   revenueLabel:"R$1,38bi"},

  {ticker:"TIM3",name:"Timão do São Jorge FC",    realName:"Corinthians",     div:"A",color:"#444",   c2:"#fff",sent:-0.45,
   rev:1150, evMult:2.2, squad:620,  brand:1429, debt:1902,ff:0.15,
   revenueLabel:"R$1,15bi"},

  {ticker:"TRI4",name:"Tricolor do Morumbi AC",   realName:"São Paulo FC",    div:"A",color:"#C40A0A",c2:"#fff",sent:0.22,
   rev:780,  evMult:2.8, squad:495,  brand:1109, debt:852, ff:0.20,
   revenueLabel:"R$780M"},

  {ticker:"GAL3",name:"Galo da Lagoinha FC",      realName:"Atlético Mineiro",div:"A",color:"#222",   c2:"#fff",sent:0.55,
   rev:720,  evMult:3.0, squad:483,  brand:772,  debt:1369,ff:0.17,
   revenueLabel:"R$720M"},

  {ticker:"FOG3",name:"Estrela do General Severiano RC",realName:"Botafogo",  div:"A",color:"#111",c2:"#d4af37",sent:0.82,
   rev:720,  evMult:3.2, squad:1000, brand:890,  debt:1100,ff:0.18,
   revenueLabel:"R$720M"},

  {ticker:"COL3",name:"Colorado do Beira-Rio SC", realName:"Internacional",   div:"A",color:"#CC0000",c2:"#fff",sent:-0.28,
   rev:560,  evMult:2.5, squad:545,  brand:520,  debt:834, ff:0.20,
   revenueLabel:"R$560M"},

  {ticker:"IMO3",name:"Imortal da Arena FC",      realName:"Grêmio",          div:"A",color:"#003DA5",c2:"#fff",sent:-0.12,
   rev:510,  evMult:2.2, squad:422,  brand:480,  debt:420, ff:0.22,
   revenueLabel:"R$510M"},

  {ticker:"RAP3",name:"Raposa do Mineirão FC",    realName:"Cruzeiro",        div:"A",color:"#003087",c2:"#fff",sent:0.58,
   rev:460,  evMult:2.8, squad:350,  brand:432,  debt:680, ff:0.20,
   revenueLabel:"R$460M"},

  {ticker:"MAL4",name:"Cruz de Malta de São Januário SC",realName:"Vasco da Gama",div:"A",color:"#111",c2:"#fff",sent:-0.18,
   rev:340,  evMult:2.0, squad:380,  brand:360,  debt:760, ff:0.17,
   revenueLabel:"R$340M"},

  {ticker:"TRI3",name:"Tricolor da Fonte Nova FC",realName:"Bahia",           div:"A",color:"#003DA5",c2:"#fff",sent:0.48,
   rev:520,  evMult:2.8, squad:323,  brand:560,  debt:821, ff:0.18,
   revenueLabel:"R$520M"},

  {ticker:"GUE4",name:"Guerreiro das Laranjeiras AC",realName:"Fluminense",   div:"A",color:"#8B0000",c2:"#fff",sent:0.20,
   rev:440,  evMult:2.4, squad:600,  brand:580,  debt:520, ff:0.22,
   revenueLabel:"R$440M"},

  {ticker:"TOR3",name:"Touro do Nabi FC",         realName:"RB Bragantino",   div:"A",color:"#CC0000",c2:"#fff",sent:0.42,
   rev:310,  evMult:2.2, squad:395,  brand:290,  debt:150, ff:0.26,
   revenueLabel:"R$310M"},

  {ticker:"LEM3",name:"Leãozinho do Maião FC",    realName:"Mirassol FC",     div:"A",color:"#F5C400",c2:"#111",sent:0.60,
   rev:90,   evMult:1.5, squad:85,   brand:65,   debt:35,  ff:0.28,
   revenueLabel:"R$90M"},

  {ticker:"BAL4",name:"Baleia da Vila Belmiro SC", realName:"Santos FC",      div:"A",color:"#000000",c2:"#fff",sent:0.30,
   rev:390,  evMult:1.8, squad:280,  brand:420,  debt:480, ff:0.20,
   revenueLabel:"R$390M"},

  {ticker:"FUR3",name:"Furacão do Capão da Imbuia FC",realName:"Athletico-PR",div:"A",color:"#CC0000",c2:"#000",sent:0.35,
   rev:310,  evMult:2.2, squad:375,  brand:380,  debt:290, ff:0.24,
   revenueLabel:"R$310M"},

  {ticker:"VOA4",name:"Vovô Alemão do Couto FC",  realName:"Coritiba FC",     div:"A",color:"#006400",c2:"#fff",sent:0.12,
   rev:150,  evMult:1.5, squad:140,  brand:120,  debt:180, ff:0.20,
   revenueLabel:"R$150M"},

  {ticker:"CON3",name:"Condá da Arena Verde FC",  realName:"Chapecoense",     div:"A",color:"#006400",c2:"#fff",sent:0.22,
   rev:65,   evMult:1.2, squad:55,   brand:70,   debt:60,  ff:0.24,
   revenueLabel:"R$65M"},

  {ticker:"LEA3",name:"Leão Azul do Baenão RC",  realName:"Clube do Remo",    div:"A",color:"#003DA5",c2:"#fff",sent:0.65,
   rev:50,   evMult:1.2, squad:40,   brand:45,   debt:30,  ff:0.26,
   revenueLabel:"R$50M"},

  {ticker:"LEB3",name:"Leão da Barra FC",        realName:"EC Vitória",        div:"A",color:"#CC0000",c2:"#000000",sent:0.38,
   rev:145,  evMult:1.6, squad:137,  brand:140,  debt:160, ff:0.21,
   revenueLabel:"R$145M"},

  /* ── SÉRIE B ─────────────────────────────────────────────────────────── */
  {ticker:"COE3",name:"Coelho do Calafate FC",   realName:"América-MG",        div:"B",color:"#00A859",c2:"#fff",sent:0.30,
   rev:100,  evMult:1.0, squad:90,   brand:80,   debt:95,  ff:0.22,revenueLabel:"R$100M"},
  {ticker:"CAV4",name:"Cavalo de Tiradentes FC", realName:"Athletic Club",      div:"B",color:"#1A1A2E",c2:"#fff",sent:0.28,
   rev:32,   evMult:1.0, squad:28,   brand:20,   debt:18,  ff:0.26,revenueLabel:"R$32M"},
  {ticker:"DRA3",name:"Dragão do Cerradão FC",   realName:"Atlético Goianiense",div:"B",color:"#D4000D",c2:"#fff",sent:0.18,
   rev:52,   evMult:0.9, squad:42,   brand:35,   debt:40,  ff:0.22,revenueLabel:"R$52M"},
  {ticker:"LEI4",name:"Leão da Ilha SC",         realName:"Avaí FC",            div:"B",color:"#003DA5",c2:"#fff",sent:0.14,
   rev:45,   evMult:0.9, squad:38,   brand:28,   debt:35,  ff:0.22,revenueLabel:"R$45M"},
  {ticker:"PAN3",name:"Pantera da Mogiana FC",   realName:"Botafogo-SP",        div:"B",color:"#000000",c2:"#ff0000",sent:0.20,
   rev:38,   evMult:1.0, squad:32,   brand:25,   debt:22,  ff:0.24,revenueLabel:"R$38M"},
  {ticker:"VOZ3",name:"Vovô do Castelão FC",     realName:"Ceará SC",           div:"B",color:"#000000",c2:"#fff",sent:-0.15,
   rev:130,  evMult:1.1, squad:110,  brand:90,   debt:120, ff:0.20,revenueLabel:"R$130M"},
  {ticker:"GAP3",name:"Galo da Pajuçara RC",     realName:"CRB",                div:"B",color:"#CC0000",c2:"#fff",sent:0.08,
   rev:25,   evMult:0.8, squad:20,   brand:15,   debt:14,  ff:0.24,revenueLabel:"R$25M"},
  {ticker:"TIG4",name:"Tigre do Heriberto FC",   realName:"Criciúma EC",        div:"B",color:"#F5C400",c2:"#111",sent:0.30,
   rev:60,   evMult:1.0, squad:50,   brand:40,   debt:38,  ff:0.24,revenueLabel:"R$60M"},
  {ticker:"DOU4",name:"Dourado do Pantanal FC",  realName:"Cuiabá EC",          div:"B",color:"#007A33",c2:"#fff",sent:-0.20,
   rev:72,   evMult:0.9, squad:58,   brand:42,   debt:65,  ff:0.20,revenueLabel:"R$72M"},
  {ticker:"LEP4",name:"Leão do Pici FC",         realName:"Fortaleza EC",        div:"B",color:"#0033A0",c2:"#fff",sent:-0.18,
   rev:160,  evMult:1.2, squad:207,  brand:160,  debt:200, ff:0.20,revenueLabel:"R$160M"},
  {ticker:"PER3",name:"Periquito da Serrinha FC",realName:"Goiás EC",            div:"B",color:"#006400",c2:"#fff",sent:0.15,
   rev:55,   evMult:0.9, squad:45,   brand:35,   debt:42,  ff:0.22,revenueLabel:"R$55M"},
  {ticker:"IND4",name:"Índio da Serra Gaúcha FC",realName:"Juventude",           div:"B",color:"#006400",c2:"#fff",sent:-0.22,
   rev:95,   evMult:1.0, squad:87,   brand:55,   debt:85,  ff:0.20,revenueLabel:"R$95M"},
  {ticker:"TUB3",name:"Tubarão do Café FC",      realName:"Londrina EC",         div:"B",color:"#CC0000",c2:"#fff",sent:0.10,
   rev:20,   evMult:0.8, squad:16,   brand:12,   debt:12,  ff:0.24,revenueLabel:"R$20M"},
  {ticker:"NAF3",name:"Timbu dos Aflitos FC",    realName:"Náutico",             div:"B",color:"#CC0000",c2:"#fff",sent:0.05,
   rev:28,   evMult:0.8, squad:22,   brand:18,   debt:16,  ff:0.24,revenueLabel:"R$28M"},
  {ticker:"TIV3",name:"Tigre do Vale do Peixe FC",realName:"Novorizontino",      div:"B",color:"#F5C400",c2:"#111",sent:0.22,
   rev:44,   evMult:1.0, squad:36,   brand:28,   debt:25,  ff:0.25,revenueLabel:"R$44M"},
  {ticker:"FAS3",name:"Fantasma dos Campos Gerais FC",realName:"Operário-PR",    div:"B",color:"#000000",c2:"#fff",sent:0.18,
   rev:35,   evMult:0.9, squad:28,   brand:20,   debt:20,  ff:0.24,revenueLabel:"R$35M"},
  {ticker:"MAC4",name:"Macaca do Majestoso FC",  realName:"Ponte Preta",         div:"B",color:"#000000",c2:"#fff",sent:0.28,
   rev:42,   evMult:0.9, squad:34,   brand:30,   debt:28,  ff:0.24,revenueLabel:"R$42M"},
  {ticker:"ABT4",name:"Tigre do Grande ABC FC",  realName:"São Bernardo FC",     div:"B",color:"#003DA5",c2:"#fff",sent:0.12,
   rev:22,   evMult:0.8, squad:18,   brand:12,   debt:12,  ff:0.24,revenueLabel:"R$22M"},
  {ticker:"LEI3",name:"Leão da Ilha do Retiro FC",realName:"Sport Recife",       div:"B",color:"#CC0000",c2:"#111",sent:-0.25,
   rev:105,  evMult:1.1, squad:88,   brand:75,   debt:98,  ff:0.20,revenueLabel:"R$105M"},
  {ticker:"TIS3",name:"Tigre da Serra Dourada FC",realName:"Vila Nova FC",        div:"B",color:"#CC0000",c2:"#fff",sent:0.08,
   rev:33,   evMult:0.8, squad:26,   brand:18,   debt:18,  ff:0.24,revenueLabel:"R$33M"},
];


(()=>{
  // Passo 1: calcula float de todos
  CLUBS.forEach(c => {
    const ev = (c.rev * c.evMult + c.squad + c.brand) * 1e6;
    c._equity = Math.max(ev - c.debt * 1e6, ev * 0.10);
    c._float  = c._equity * c.ff;
  });

  // Passo 2: escala log por divisão
  const byDiv = { A: CLUBS.filter(c=>c.div==='A'), B: CLUBS.filter(c=>c.div==='B') };
  const RANGES = { A: [8, 40], B: [3, 12] };

  Object.entries(byDiv).forEach(([div, clubs]) => {
    const [minP, maxP] = RANGES[div];
    const floats  = clubs.map(c => c._float);
    const logMin  = Math.log(Math.min(...floats));
    const logMax  = Math.log(Math.max(...floats));
    const logRange = logMax - logMin || 1;

    clubs.forEach(c => {
      const t = (Math.log(c._float) - logMin) / logRange; // 0..1 em escala log
      const targetPrice = minP + t * (maxP - minP);

      // Arredonda shares ao 100k mais próximo
      const sharesRaw = c._float / targetPrice;
      const shares = Math.max(Math.round(sharesRaw / 100_000) * 100_000, 500_000);
      const price  = +(c._float / shares).toFixed(2);

      const equityM  = c._equity / 1e6;
      const mktCapLabel = equityM >= 1000
        ? `R$${(equityM / 1000).toFixed(1).replace('.', ',')}bi`
        : `R$${Math.round(equityM)}M`;

      c.ipoPrice    = price;
      c.price       = price;
      c.totalShares = shares;
      c.mktCap      = mktCapLabel;
    });
  });

  // Limpa campos temporários
  CLUBS.forEach(c => { delete c._equity; delete c._float; });
})();


const IMPACT_MATRIX={ // impacto spot máx por categoria (cap ±2.5%)
  "Financeira Crítica":0.05,
  "Esportiva Majoritária":0.03,
  "Mercado de Ativos":0.02,
  "Integridade/Saúde":0.015,
  "Institucional":0.01,
  "Esportiva Menor":0.005,
};


const MP={
  // Série A
  URU3: {vol:0.0018,theta:0.12,float:6.8e6,spread:0.003},
  POR4: {vol:0.0015,theta:0.10,float:8.6e6,spread:0.003},
  TIM3: {vol:0.0022,theta:0.14,float:5.7e6,spread:0.004},
  TRI4: {vol:0.0020,theta:0.13,float:7.4e6,spread:0.004},
  IMO3: {vol:0.0021,theta:0.15,float:6.1e6,spread:0.005},
  RAP3: {vol:0.0023,theta:0.16,float:5.2e6,spread:0.005},
  FOG3: {vol:0.0016,theta:0.11,float:7.2e6,spread:0.003},
  MAL4: {vol:0.0025,theta:0.18,float:4.8e6,spread:0.006},
  GAL3: {vol:0.0019,theta:0.12,float:7.1e6,spread:0.004},
  COL3: {vol:0.0021,theta:0.14,float:6.3e6,spread:0.005},
  // Série B
  COE3: {vol:0.0032,theta:0.20,float:660000, spread:0.008},
  CAV4: {vol:0.0040,theta:0.25,float:350000, spread:0.012},
  DRA3: {vol:0.0035,theta:0.22,float:412000, spread:0.010},
  LEI4: {vol:0.0036,theta:0.22,float:350000, spread:0.010},
  PAN3: {vol:0.0038,theta:0.24,float:364000, spread:0.011},
  VOZ3: {vol:0.0030,theta:0.19,float:803000, spread:0.007},
  GAP3: {vol:0.0042,theta:0.26,float:247000, spread:0.013},
  TIG4: {vol:0.0033,theta:0.21,float:450000, spread:0.009},
  DOU4: {vol:0.0034,theta:0.21,float:437000, spread:0.009},
  LEP4: {vol:0.0028,theta:0.18,float:954000, spread:0.007},
  PER3: {vol:0.0036,theta:0.22,float:446000, spread:0.010},
  IND4: {vol:0.0031,theta:0.20,float:626000, spread:0.008},
  TUB3: {vol:0.0044,theta:0.27,float:218000, spread:0.014},
  NAF3: {vol:0.0040,theta:0.25,float:297000, spread:0.012},
  TIV3: {vol:0.0037,theta:0.23,float:424000, spread:0.010},
  FAS3: {vol:0.0039,theta:0.24,float:340000, spread:0.011},
  MAC4: {vol:0.0038,theta:0.23,float:380000, spread:0.011},
  ABT4: {vol:0.0042,theta:0.26,float:230000, spread:0.013},
  LEI3: {vol:0.0030,theta:0.19,float:756000, spread:0.007},
  TIS3: {vol:0.0040,theta:0.25,float:341000, spread:0.012},
  TRI3: {vol:0.0020,theta:0.13,float:2468000,spread:0.004},
  GUE4: {vol:0.0022,theta:0.14,float:2142000,spread:0.004},
  TOR3: {vol:0.0022,theta:0.14,float:1827000,spread:0.005},
  LEM3: {vol:0.0028,theta:0.17,float:625000, spread:0.007},
  BAL4: {vol:0.0021,theta:0.13,float:1900000,spread:0.004},
  FUR3: {vol:0.0023,theta:0.15,float:1711000,spread:0.005},
  VOA4: {vol:0.0030,theta:0.19,float:897000, spread:0.007},
  CON3: {vol:0.0038,theta:0.23,float:483000, spread:0.010},
  LEA3: {vol:0.0040,theta:0.25,float:450000, spread:0.011},
  LEB3: {vol:0.0030,theta:0.19,float:844000, spread:0.007},
};

const CORR_CLUSTERS={
  A_TOP:  {tickers:["URU3","POR4","TIM3","FOG3","GAL3"],           rho:0.35},
  A_MID:  {tickers:["TRI4","COL3","IMO3","RAP3","MAL4",
                     "TRI3","GUE4","TOR3","BAL4","FUR3"],           rho:0.15},
  A_SMALL:{tickers:["LEM3","VOA4","CON3","LEA3","LEB3"],           rho:0.08},
  B_ALL:  {tickers:["COE3","CAV4","DRA3","LEI4","PAN3","VOZ3",
                     "GAP3","TIG4","DOU4","LEP4","PER3","IND4",
                     "TUB3","NAF3","TIV3","FAS3","MAC4","ABT4",
                     "LEI3","TIS3"],                                rho:0.05},
};


// TICKER_ALIASES: normaliza tickers incorretos da IA antes de validar contra CLUBS
const TICKER_ALIASES={
  "FLA3":"URU3","FLA4":"URU3","FLM3":"URU3",
  "PAL3":"POR4","PAL4":"POR4",
  "COR3":"TIM3","COR4":"TIM3",
  "BOT3":"FOG3","BOT4":"FOG3",
  "ATL3":"GAL3","ATL4":"GAL3","CAM3":"GAL3",
  "INT3":"COL3","INT4":"COL3",
  "GRE3":"IMO3","GRE4":"IMO3",
  "CRU3":"RAP3","CRZ3":"RAP3",
  "VAS3":"MAL4","VAS4":"MAL4",
  "SAO3":"TRI4","SAO4":"TRI4","SPF3":"TRI4",
  "BAH3":"TRI3","BAH4":"TRI3",
  "FLU3":"GUE4","FLU4":"GUE4",
  "BRA3":"TOR3","RBB3":"TOR3",
  "SAN3":"BAL4","SAN4":"BAL4",
  "ATH3":"FUR3","ATH4":"FUR3","CAP3":"FUR3",
  "MIR3":"LEM3",
  "COR5":"VOA4","COT3":"VOA4",
  "VIT3":"LEB3","VIT4":"LEB3",
  "AME3":"COE3","AMG3":"COE3",
  "FOR3":"LEP4","FOR4":"LEP4",
  "CEA3":"VOZ3","CEA4":"VOZ3",
  "GOI3":"PER3",
  "JUV3":"IND4",
  "CRI3":"TIG4",
  "CUI3":"DOU4",
  "SPO3":"LEI3",
};


const VALID_TICKERS=new Set(CLUBS.map(c=>c.ticker));

function normalizeTicker(raw){
  if(!raw) return null;
  const upper=String(raw).toUpperCase().trim();
  const resolved=TICKER_ALIASES[upper]||upper;
  return VALID_TICKERS.has(resolved)?resolved:null;
}

/* ── Sessões de mercado ── */
const SESSIONS=[
  {id:"pre",     label:"Pré-abertura",      short:"PRÉ",    color:"#f5a623", bg:"rgba(245,166,35,.12)", border:"rgba(245,166,35,.3)",   start:10*60+45, end:11*60+0},
  {id:"main",    label:"Negociação",         short:"ABERTO", color:"#6c63ff", bg:"rgba(108,99,255,.12)",  border:"rgba(108,99,255,.3)",    start:11*60+0,  end:24*60+45},
  {id:"closing", label:"Call de Fechamento", short:"LEILÃO", color:"#38bdf8", bg:"rgba(14,165,233,.12)", border:"rgba(14,165,233,.3)",   start:24*60+45, end:25*60+0},
  {id:"after",   label:"After-Market",       short:"AFTER",  color:"#8b5cf6", bg:"rgba(139,92,246,.12)", border:"rgba(139,92,246,.3)",   start:25*60+0,  end:25*60+30},
];


function getBrasiliaMinutes(){
  // UTC-3 fixo (Brasília sem horário de verão)
  const now=new Date();
  const utc=now.getTime()+now.getTimezoneOffset()*60000;
  const brt=new Date(utc-3*3600000);
  const h=brt.getHours(), m=brt.getMinutes();
  // Horas 0–1 (após meia-noite) representadas como 24–25 para o intervalo de sessão
  return (h<2?h+24:h)*60+m;
}
function getMarketSession(){
  const m=getBrasiliaMinutes();
  const s=SESSIONS.find(s=>m>=s.start&&m<s.end);
  if(s) return s;
  return {id:"closed",label:"Mercado Fechado",short:"FECHADO",color:"#f43f5e",bg:"rgba(244,63,94,.1)",border:"rgba(244,63,94,.3)",start:0,end:0};
}
function useMarketSession(){
  const [session,setSession]=useState(()=>getMarketSession());
  useEffect(()=>{
    const t=setInterval(()=>setSession(getMarketSession()),15000);
    return()=>clearInterval(t);
  },[]);
  return session;
}

/* ── Mock de estado do motor de mercado ── */
function useMockMarket(){
  const [motorState,setMotorState]=useState(()=>
    Object.fromEntries(CLUBS.map(c=>[c.ticker,{
      price:    c.price,
      fv:       c.price*(0.95+Math.random()*0.10),
      garch:    +(Math.random()*0.000008+0.000002).toFixed(8),
      imb:      +((Math.random()-0.5)*0.6).toFixed(3),
      cb:       false,
      vol24:    Math.round(Math.random()*50000+5000),
      spread:   c.div==="A"?0.003:0.008,
    }]))
  );
  const [paused,setPaused]=useState(false);
  const pausedRef=useRef(false);
  pausedRef.current=paused;

  useEffect(()=>{
    const t=setInterval(()=>{
      if(pausedRef.current) return;
      setMotorState(prev=>{
        const next={...prev};
        CLUBS.forEach(c=>{
          const s=prev[c.ticker];
          const drift=(s.fv-s.price)/s.price*0.08;
          const shock=(Math.random()-0.5)*0.006;
          const newP=Math.max(0.01,+(s.price*(1+drift+shock)).toFixed(2));
          const newGarch=+(0.000002+0.12*shock*shock+0.85*s.garch).toFixed(8);
          const imbDecay=0.95;
          next[c.ticker]={...s,
            price:newP,
            garch:newGarch,
            imb:+(s.imb*imbDecay+(Math.random()-0.5)*0.04).toFixed(3),
          };
        });
        return next;
      });
    },2500);
    return()=>clearInterval(t);
  },[]);

  const forceCircuitBreaker=(ticker)=>{
    setMotorState(p=>({...p,[ticker]:{...p[ticker],cb:true}}));
    setTimeout(()=>setMotorState(p=>({...p,[ticker]:{...p[ticker],cb:false}})),10000);
  };
  const clearCircuitBreaker=(ticker)=>setMotorState(p=>({...p,[ticker]:{...p[ticker],cb:false}}));
  const setFV=(ticker,val)=>setMotorState(p=>({...p,[ticker]:{...p[ticker],fv:val}}));
  const setVol=(ticker,val)=>setMotorState(p=>({...p,[ticker]:{...p[ticker],spread:val}}));

  return{motorState,paused,setPaused,forceCircuitBreaker,clearCircuitBreaker,setFV,setVol};
}

/* ── Mock de usuários ── */
const MOCK_USERS=[
  {id:"u001",name:"Carlos Henrique",email:"carlos@email.com",plan:"Lenda",  role:"user",      balance:38420.50,invested:12800,pnl:+1840.20,txCount:47,online:true, suspended:false,since:"Jan 2026",lastAccess:"agora"},
  {id:"u002",name:"Ana Paula",      email:"ana@email.com",   plan:"Craque", role:"user",      balance:7230.10, invested:3200, pnl:+420.80, txCount:23,online:true, suspended:false,since:"Fev 2026",lastAccess:"há 5min"},
  {id:"u003",name:"Pedro Vasconcelos",email:"pedro@email.com",plan:"Jogador",role:"user",     balance:1450.00, invested:550,  pnl:-88.30,  txCount:8, online:false,suspended:false,since:"Mar 2026",lastAccess:"há 2h"},
  {id:"u004",name:"Fernanda Melo",  email:"fmelo@email.com", plan:"Lenda",  role:"user",      balance:24110.00,invested:8900, pnl:+1100.00,txCount:61,online:true, suspended:false,since:"Jan 2026",lastAccess:"há 1min"},
  {id:"u005",name:"Rodrigo Falcão", email:"rfalcao@email.com",plan:"Craque",role:"monitor",   balance:9800.00, invested:4200, pnl:+780.50, txCount:34,online:false,suspended:false,since:"Fev 2026",lastAccess:"há 3h"},
  {id:"u011",name:"Ana Costa",      email:"ana@footstock.com",   plan:"Craque",role:"editor",   balance:0,       invested:0,    pnl:0,       txCount:0, online:true, suspended:false,since:"Mar 2026",lastAccess:"agora"},
  {id:"u012",name:"Marcos Viana",   email:"marcos@footstock.com",plan:"Jogador",role:"moderador",balance:0,      invested:0,    pnl:0,       txCount:0, online:false,suspended:false,since:"Mar 2026",lastAccess:"há 1h"},
  {id:"u006",name:"Juliana Torres", email:"jtorres@email.com",plan:"Jogador",role:"user",     balance:800.00,  invested:1200, pnl:-200.00, txCount:4, online:false,suspended:true, since:"Mar 2026",lastAccess:"há 1d"},
  {id:"u007",name:"Marcos Lima",    email:"mlima@email.com",  plan:"Craque",role:"user",      balance:5100.00, invested:2800, pnl:+310.00, txCount:19,online:true, suspended:false,since:"Fev 2026",lastAccess:"agora"},
  {id:"u008",name:"Beatriz Campos", email:"bcampos@email.com",plan:"Lenda", role:"admin",     balance:0,       invested:0,    pnl:0,       txCount:0, online:true, suspended:false,since:"Jan 2026",lastAccess:"agora"},
  {id:"u009",name:"Thiago Nunes",   email:"tnunes@email.com", plan:"Jogador",role:"user",     balance:1980.00, invested:20,   pnl:+2.40,   txCount:2, online:false,suspended:false,since:"Mar 2026",lastAccess:"há 6h"},
  {id:"u010",name:"Camila Ramos",   email:"cramos@email.com", plan:"Craque",role:"user",      balance:6700.00, invested:3100, pnl:-190.00, txCount:15,online:false,suspended:false,since:"Fev 2026",lastAccess:"há 4h"},
];

/* ── Mock de posts do fórum ── */
const MOCK_POSTS_INIT=[
  {id:"p001",author:"Carlos Henrique",plan:"Lenda",  ticker:"URU3",text:"URU3 vai explodir essa semana! Rumores de patrocínio master confirmado. Tô long pesado.",     ts:Date.now()-1000*60*8,  status:"ok",     flags:0},
  {id:"p002",author:"Pedro Vasconcelos",plan:"Jogador",ticker:"TIM3",text:"Esse app é uma merda, perdi tudo por causa de um bug no short selling!!",                  ts:Date.now()-1000*60*22, status:"flagged",flags:2},
  {id:"p003",author:"Fernanda Melo",  plan:"Lenda",  ticker:"POR4",text:"POR4 sólida como sempre. Dividendos chegando e preço subindo. Holding.",                     ts:Date.now()-1000*60*45, status:"ok",     flags:0},
  {id:"p004",author:"Ana Paula",      plan:"Craque", ticker:"FOG3",text:"Alguém sabe o CPF do admin desse app? Quero contato direto.",                                 ts:Date.now()-1000*60*70, status:"flagged",flags:3},
  {id:"p005",author:"Marcos Lima",    plan:"Craque", ticker:"GAL3",text:"GAL3 vai despencar com essa notícia. Short nela agora!",                                       ts:Date.now()-1000*60*90, status:"ok",     flags:0},
  {id:"p006",author:"Juliana Torres", plan:"Jogador",ticker:"MAL4",text:"Invista em MAL4 e ganhe 300% em 1 semana. DM para estratégia exclusiva.",                    ts:Date.now()-1000*60*120,status:"flagged",flags:4},
  {id:"p007",author:"Thiago Nunes",   plan:"Jogador",ticker:"BAL4",text:"BAL4 chegou de volta à Série A com tudo. Oportunidade histórica.",                            ts:Date.now()-1000*60*180,status:"ok",     flags:0},
  {id:"p008",author:"Camila Ramos",   plan:"Craque", ticker:"COL3",text:"COL3 decepcionou no resultado. Saí antes do fechamento, bom sinal.",                          ts:Date.now()-1000*60*240,status:"ok",     flags:0},
];

/* ── Palavras bloqueadas padrão ── */
const BLOCKED_WORDS_INIT=["merda","idiota","burro","lixo","fraude","golpe","cpf","senha","whatsapp","telegram","pix","300%","500%","garantido"];

/* ── Componentes base ── */
function Badge({children,color=MUTED,bg="rgba(255,255,255,.08)"}){
  return <span style={{background:bg,color,borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700,fontFamily:SANS,flexShrink:0}}>{children}</span>;
}

function StatCard({label,value,sub,color="#fff",icon}){
  return <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"14px 16px"}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
      <span style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:"0.8px",fontFamily:SANS}}>{label}</span>
      {icon&&<span style={{fontSize:16}}>{icon}</span>}
    </div>
    <div style={{fontSize:22,fontWeight:800,color,fontFamily:MONO,lineHeight:1}}>{value}</div>
    {sub&&<div style={{fontSize:10,color:MUTED,fontFamily:SANS,marginTop:4}}>{sub}</div>}
  </div>;
}

function SectionHeader({title,sub,action}){
  return <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
    <div>
      <div style={{fontSize:16,fontWeight:800,color:"#fff",fontFamily:SANS}}>{title}</div>
      {sub&&<div style={{fontSize:11,color:MUTED,fontFamily:SANS,marginTop:2}}>{sub}</div>}
    </div>
    {action}
  </div>;
}

function Input({label,value,onChange,type="text",placeholder="",min,max,step}){
  return <div style={{marginBottom:12}}>
    {label&&<div style={{fontSize:10,color:MUTED,fontWeight:700,fontFamily:SANS,marginBottom:5,letterSpacing:"0.5px"}}>{label}</div>}
    <input type={type} value={value} onChange={e=>onChange(e.target.value)}
      placeholder={placeholder} min={min} max={max} step={step}
      style={{width:"100%",background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:"9px 13px",
        color:TEXT,fontSize:12,fontFamily:MONO,outline:"none",boxSizing:"border-box"}}/>
  </div>;
}

function Btn({children,onClick,color=ACCENT,variant="solid",small=false,disabled=false}){
  const bg=variant==="solid"?color:variant==="outline"?"transparent":"rgba(255,255,255,.04)";
  const border=variant==="outline"?`1px solid ${color}`:`1px solid transparent`;
  const textColor=variant==="solid"?BG:color;
  return <button onClick={onClick} disabled={disabled} style={{
    background:bg,border,borderRadius:small?8:12,padding:small?"5px 12px":"9px 16px",
    cursor:disabled?"not-allowed":"pointer",color:textColor,fontSize:small?10:12,fontWeight:800,
    fontFamily:SANS,opacity:disabled?.5:1,transition:"opacity .15s",whiteSpace:"nowrap"
  }}>{children}</button>;
}

function Tabs({tabs,active,onChange}){
  return <div style={{display:"flex",gap:4,background:SURFACE,borderRadius:12,padding:4,marginBottom:20}}>
    {tabs.map(t=><button key={t.id} onClick={()=>onChange(t.id)} style={{
      flex:1,padding:"7px 6px",border:"none",borderRadius:9,cursor:"pointer",
      background:active===t.id?CARD:"transparent",
      color:active===t.id?"#fff":MUTED,fontSize:10,fontWeight:800,fontFamily:SANS,transition:"all .15s",
      display:"flex",alignItems:"center",justifyContent:"center",gap:4
    }}>
      <span style={{fontSize:13}}>{t.icon}</span>
      <span style={{display:"none"}}>{t.label}</span>
    </button>)}
  </div>;
}

/* ══════════════════════════════════════════════════════════════════
   MÓDULO 1 — DASHBOARD GERAL
══════════════════════════════════════════════════════════════════ */
function DashboardModule({users,posts,motorState,marketSession,currentRole="admin"}){
  const totalUsers=users.length;
  const onlineUsers=users.filter(u=>u.online).length;
  const suspendedUsers=users.filter(u=>u.suspended).length;
  const inactiveUsers=users.filter(u=>!u.online&&!u.suspended).length;
  const byPlan={Jogador:0,Craque:0,Lenda:0};
  users.forEach(u=>byPlan[u.plan]=(byPlan[u.plan]||0)+1);
  const flaggedPosts=posts.filter(p=>p.status==="flagged").length;
  const totalVol=Object.values(motorState).reduce((s,m)=>s+m.vol24,0);
  const receitaMock={Craque:byPlan.Craque*19.90,Lenda:byPlan.Lenda*49.90};
  const receitaTotal=receitaMock.Craque+receitaMock.Lenda;

  const eng={acessosMes:312,tempoMedio:"8min 20s",recorrencia:68,
    acessosPorUsuario:+(312/Math.max(1,totalUsers)).toFixed(1),
    ausencia:{d1:2,d7:3,d15:1,d30:2,acima:1}};

  const payments=[
    {name:"Mercado Pago",icon:"🟦",pct:54,color:"#00B1EA"},
    {name:"PayPal",      icon:"🅿",  pct:29,color:"#003087"},
    {name:"PagSeguro",   icon:"🟧",  pct:17,color:"#f97316"},
  ];

  const totalInativos=Object.values(eng.ausencia).reduce((s,v)=>s+v,0);

  return <div>
    <SectionHeader title="Dashboard" sub={`Mercado: ${marketSession.label} · ${new Date().toLocaleString("pt-BR",{weekday:"short",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}`}/>

    {/* ── BLOCO: USUÁRIOS ── */}
    <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"14px 16px",marginBottom:12}}>
      <div style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:"0.8px",fontFamily:SANS,marginBottom:12}}>USUÁRIOS</div>

      {/* KPIs de usuários */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
        <div style={{background:SURFACE,borderRadius:10,padding:"10px"}}>
          <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginBottom:3}}>TOTAL CADASTRADOS</div>
          <div style={{fontSize:22,fontWeight:800,color:"#fff",fontFamily:MONO,lineHeight:1}}>{totalUsers}</div>
          <div style={{fontSize:9,color:GREEN,fontFamily:SANS,marginTop:3}}>● {onlineUsers} online agora</div>
        </div>
        <div style={{background:SURFACE,borderRadius:10,padding:"10px"}}>
          <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginBottom:3}}>INATIVOS × TOTAL</div>
          <div style={{fontSize:22,fontWeight:800,color:ORANGE,fontFamily:MONO,lineHeight:1}}>{totalInativos}</div>
          <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginTop:3}}>de {totalUsers} ({Math.round(totalInativos/Math.max(1,totalUsers)*100)}% do total)</div>
        </div>
        <div style={{background:SURFACE,borderRadius:10,padding:"10px"}}>
          <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginBottom:3}}>SUSPENSOS</div>
          <div style={{fontSize:22,fontWeight:800,color:suspendedUsers>0?RED:GREEN,fontFamily:MONO,lineHeight:1}}>{suspendedUsers}</div>
          <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginTop:3}}>contas bloqueadas</div>
        </div>
        <div style={{background:SURFACE,borderRadius:10,padding:"10px"}}>
          <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginBottom:3}}>POSTS SUSPEITOS</div>
          <div style={{fontSize:22,fontWeight:800,color:flaggedPosts>0?ORANGE:GREEN,fontFamily:MONO,lineHeight:1}}>{flaggedPosts}</div>
          <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginTop:3}}>aguardando moderação</div>
        </div>
      </div>

      {/* Distribuição de planos */}
      <div style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:"0.8px",fontFamily:SANS,marginBottom:10}}>DISTRIBUIÇÃO DE PLANOS</div>
      {[{plan:"Lenda",color:GOLD,icon:"👑"},{plan:"Craque",color:ACCENT,icon:"⭐"},{plan:"Jogador",color:MUTED,icon:"⚡"}].map(({plan,color,icon})=>{
        const count=byPlan[plan]||0;
        const pct=totalUsers>0?Math.round(count/totalUsers*100):0;
        return <div key={plan} style={{marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
            <span style={{fontSize:11,color,fontFamily:SANS,fontWeight:700}}>{icon} {plan}</span>
            <span style={{fontSize:11,color,fontFamily:MONO,fontWeight:700}}>{count} ({pct}%)</span>
          </div>
          <div style={{height:5,borderRadius:3,background:BORDER,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:3,transition:"width .5s"}}/>
          </div>
        </div>;
      })}

      {/* Inativos por período */}
      <div style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:"0.8px",fontFamily:SANS,marginTop:14,marginBottom:8}}>AUSÊNCIA POR PERÍODO</div>
      <div style={{display:"flex",gap:5}}>
        {[
          {label:"1 dia",  value:eng.ausencia.d1,   color:ORANGE},
          {label:"7 dias", value:eng.ausencia.d7,   color:ORANGE},
          {label:"15 dias",value:eng.ausencia.d15,  color:RED},
          {label:"30 dias",value:eng.ausencia.d30,  color:RED},
          {label:"+30d",   value:eng.ausencia.acima, color:"rgba(244,63,94,.5)"},
        ].map(a=><div key={a.label} style={{flex:1,background:SURFACE,borderRadius:8,padding:"7px 4px",textAlign:"center"}}>
          <div style={{fontSize:18,fontWeight:800,color:a.color,fontFamily:MONO,lineHeight:1}}>{a.value}</div>
          <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginTop:3,lineHeight:1.3}}>{a.label}</div>
        </div>)}
      </div>
    </div>

    {/* ── BLOCO: FINANCEIRO ── */}
    {!canAccess(currentRole,"financeiro")
      ?<div style={{background:CARD,border:"1px solid rgba(249,115,22,.2)",borderRadius:14,padding:"14px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:10,background:"rgba(249,115,22,.1)",border:"1px solid rgba(249,115,22,.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>🔒</div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.5)",fontFamily:SANS}}>FINANCEIRO</div>
            <div style={{fontSize:10,color:MUTED,fontFamily:SANS,marginTop:2}}>Dados financeiros disponíveis apenas para <span style={{color:ORANGE,fontWeight:700}}>Administradores</span></div>
          </div>
        </div>
      :<div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"14px 16px",marginBottom:12}}>
        <div style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:"0.8px",fontFamily:SANS,marginBottom:12}}>FINANCEIRO</div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
          <div style={{background:SURFACE,borderRadius:10,padding:"10px"}}>
            <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginBottom:3}}>RECEITA TOTAL/MÊS</div>
            <div style={{fontSize:20,fontWeight:800,color:GREEN,fontFamily:MONO,lineHeight:1}}>R${receitaTotal.toFixed(2)}</div>
            <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginTop:3}}>{byPlan.Craque+byPlan.Lenda} assinantes pagos</div>
          </div>
          <div style={{background:SURFACE,borderRadius:10,padding:"10px"}}>
            <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginBottom:3}}>VOLUME 24H</div>
            <div style={{fontSize:20,fontWeight:800,color:ACCENT2,fontFamily:MONO,lineHeight:1}}>{(totalVol/1000).toFixed(1)}k</div>
            <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginTop:3}}>cotas negociadas</div>
          </div>
        </div>

        {[{plan:"Lenda",color:GOLD,mrr:receitaMock.Lenda,count:byPlan.Lenda},{plan:"Craque",color:ACCENT,mrr:receitaMock.Craque,count:byPlan.Craque}].map(d=>(
          <div key={d.plan} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderTop:`1px solid ${BORDER}`}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:d.color}}/>
              <span style={{fontSize:11,fontWeight:700,color:d.color,fontFamily:SANS}}>{d.plan}</span>
              <span style={{fontSize:9,color:MUTED,fontFamily:SANS}}>{d.count} assinantes</span>
            </div>
            <span style={{fontSize:12,fontWeight:800,color:"#fff",fontFamily:MONO}}>R${d.mrr.toFixed(2)}/mês</span>
          </div>
        ))}

        <div style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:"0.8px",fontFamily:SANS,marginTop:14,marginBottom:10}}>MÉTODOS DE PAGAMENTO</div>
        {payments.map(p=>{
          const valor=receitaTotal*(p.pct/100);
          return <div key={p.name} style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:20,height:20,borderRadius:6,background:`${p.color}22`,border:`1px solid ${p.color}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10}}>{p.icon}</div>
                <span style={{fontSize:11,color:"#fff",fontFamily:SANS,fontWeight:600}}>{p.name}</span>
              </div>
              <div style={{textAlign:"right"}}>
                <span style={{fontSize:11,fontWeight:800,color:p.color,fontFamily:MONO}}>{p.pct}%</span>
                <span style={{fontSize:9,color:MUTED,fontFamily:MONO,marginLeft:6}}>R${valor.toFixed(2)}</span>
              </div>
            </div>
            <div style={{height:5,borderRadius:3,background:BORDER,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${p.pct}%`,background:p.color,borderRadius:3,transition:"width .5s"}}/>
            </div>
          </div>;
        })}
      </div>
    }

    {/* ── BLOCO: ENGAJAMENTO ── */}
    <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"14px 16px"}}>
      <div style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:"0.8px",fontFamily:SANS,marginBottom:12}}>ENGAJAMENTO</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {[
          {l:"ACESSOS/MÊS",        v:eng.acessosMes,                   s:"sessões únicas",      c:"#fff"},
          {l:"TEMPO MÉDIO/SESSÃO", v:eng.tempoMedio,                    s:"por acesso",          c:"#fff"},
          {l:"TAXA RECORRÊNCIA",   v:`${eng.recorrencia}%`,             s:">1 sessão/dia",       c:ACCENT},
          {l:"ACESSOS/USUÁRIO",    v:`${eng.acessosPorUsuario}×`,       s:"média no mês",        c:ACCENT2},
        ].map(s=><div key={s.l} style={{background:SURFACE,borderRadius:10,padding:"10px"}}>
          <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginBottom:3}}>{s.l}</div>
          <div style={{fontSize:18,fontWeight:800,color:s.c,fontFamily:MONO,lineHeight:1}}>{s.v}</div>
          <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginTop:2}}>{s.s}</div>
        </div>)}
      </div>
    </div>
  </div>;
}


/* ══════════════════════════════════════════════════════════════════
   MÓDULO 2 — GESTÃO DO MOTOR DE MERCADO
══════════════════════════════════════════════════════════════════ */
function MotorModule({motorState,paused,setPaused,forceCircuitBreaker,clearCircuitBreaker,setFV,setVol,users}){
  const [subTab,setSubTab]=useState("estado");
  const [editClub,setEditClub]=useState(null);
  const [clubForm,setClubForm]=useState({});
  const [clubs,setClubs]=useState(CLUBS.map(c=>({...c})));
  const [newsForm,setNewsForm]=useState({ticker:"",cat:"Esportiva Maior",sent:"0.5",headline:""});
  const [newsFired,setNewsFired]=useState([]);
  const [impactForm,setImpactForm]=useState({...Object.fromEntries(Object.entries(IMPACT_MATRIX).map(([k,v])=>[k,String(v)]))});
  const [impactSaved,setImpactSaved]=useState(false);
  const [fvEdit,setFvEdit]=useState({});
  const [filterDiv,setFilterDiv]=useState("Todos");

  const cats=Object.keys(IMPACT_MATRIX);
  const filteredClubs=filterDiv==="Todos"?clubs:clubs.filter(c=>c.div===filterDiv);

  const saveImpact=()=>{
    setImpactSaved(true);
    setTimeout(()=>setImpactSaved(false),2500);
  };

  const fireNews=()=>{
    if(!newsForm.ticker||!newsForm.headline) return;
    const entry={...newsForm,sent:parseFloat(newsForm.sent),ts:Date.now()};
    setNewsFired(p=>[entry,...p].slice(0,20));
    setNewsForm({ticker:"",cat:"Esportiva Maior",sent:"0.5",headline:""});
  };

  const openEditClub=(club)=>{
    setEditClub(club.ticker);
    setClubForm({
      name:club.name,realName:club.realName,ticker:club.ticker,
      rev:String(club.rev),debt:String(club.debt),squad:String(club.squad),
      brand:String(club.brand),evMult:String(club.evMult),ff:String(club.ff),
      color:club.color,div:club.div
    });
  };

  const saveClub=()=>{
    setClubs(prev=>prev.map(c=>c.ticker===editClub?{
      ...c,...clubForm,
      rev:parseFloat(clubForm.rev),debt:parseFloat(clubForm.debt),
      squad:parseFloat(clubForm.squad),brand:parseFloat(clubForm.brand),
      evMult:parseFloat(clubForm.evMult),ff:parseFloat(clubForm.ff),
    }:c));
    setEditClub(null);
  };

  return <div>
    <SectionHeader title="Motor de Mercado" sub="Controles, estado ao vivo e configuração"/>
    {(()=>{
      const cbActive=Object.entries(motorState).filter(([,s])=>s.cb);
      const cbCount=cbActive.length;
      const totalPnl=(users||[]).reduce((s,u)=>s+u.pnl,0);
      return <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
        <StatCard label="P&L AGREGADO" value={`FS$${totalPnl.toLocaleString("pt-BR",{minimumFractionDigits:2})}`} sub="soma de todas as carteiras" color={totalPnl>=0?GREEN:RED} icon="💹"/>
        <div style={{background:CARD,border:`1px solid ${cbCount>0?"rgba(244,63,94,.4)":BORDER}`,borderRadius:14,padding:"14px 16px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
            <span style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:"0.8px",fontFamily:SANS}}>CIRCUIT BREAKERS</span>
            <span style={{fontSize:16}}>🔒</span>
          </div>
          <div style={{fontSize:22,fontWeight:800,color:cbCount>0?RED:GREEN,fontFamily:MONO,lineHeight:1}}>{cbCount}</div>
          <div style={{fontSize:10,color:MUTED,fontFamily:SANS,marginTop:4}}>{cbCount>0?cbActive.map(([t])=>t).join(", "):"nenhum ativo agora"}</div>
        </div>
      </div>;
    })()}
    <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
      {["estado","clubes","noticias","matriz"].map(t=>(
        <button key={t} onClick={()=>setSubTab(t)} style={{
          padding:"6px 14px",borderRadius:10,border:"none",cursor:"pointer",
          background:subTab===t?ACCENT:SURFACE,color:subTab===t?BG:"#fff",
          fontSize:10,fontWeight:800,fontFamily:SANS,transition:"all .15s"
        }}>{t==="estado"?"Estado Ao Vivo":t==="clubes"?"Editar Clubes":t==="noticias"?"Disparar Notícia":"Matriz de Impacto"}</button>
      ))}
      <div style={{marginLeft:"auto"}}>
        <Btn onClick={()=>setPaused(p=>!p)} color={paused?GREEN:RED} variant="outline" small>
          {paused?"▶ Retomar Motor":"⏸ Pausar Motor"}
        </Btn>
      </div>
    </div>

    {/* ── SUB: Estado ao vivo ── */}
    {subTab==="estado"&&<>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {["Todos","A","B"].map(d=>(
          <button key={d} onClick={()=>setFilterDiv(d)} style={{padding:"4px 12px",borderRadius:8,border:"none",cursor:"pointer",
            background:filterDiv===d?ACCENT:SURFACE,color:filterDiv===d?BG:MUTED,fontSize:10,fontWeight:700,fontFamily:SANS}}>
            {d==="Todos"?"Todos":"Série "+d}
          </button>
        ))}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:5}}>
        {filteredClubs.map(c=>{
          const s=motorState[c.ticker]||{};
          const pct=s.fv>0?((s.price-s.fv)/s.fv*100):0;
          const imbAbs=Math.abs(s.imb||0);
          return <div key={c.ticker} style={{background:CARD,border:`1px solid ${s.cb?"rgba(244,63,94,.4)":BORDER}`,borderRadius:12,padding:"10px 13px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:32,height:32,borderRadius:9,background:`linear-gradient(145deg,${c.color},${c.color}99)`,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:900,color:c.c2,flexShrink:0}}>
                {c.ticker.replace(/\d/g,"")}
              </div>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                  <span style={{fontSize:11,fontWeight:800,color:"#fff",fontFamily:SANS}}>{c.ticker}</span>
                  <Badge children={"Série "+c.div} color={c.div==="A"?ACCENT2:GOLD}/>
                  {s.cb&&<Badge children="⚠ CB" color={RED} bg="rgba(244,63,94,.15)"/>}
                </div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                  <span style={{fontSize:9,color:MUTED,fontFamily:MONO}}>Spot: <span style={{color:"#fff"}}>FS${(s.price||0).toFixed(2)}</span></span>
                  <span style={{fontSize:9,color:MUTED,fontFamily:MONO}}>FV: <span style={{color:pct>0?GREEN:RED}}>FS${(s.fv||0).toFixed(2)} ({pct>=0?"+":""}{pct.toFixed(1)}%)</span></span>
                  <span style={{fontSize:9,color:MUTED,fontFamily:MONO}}>GARCH: <span style={{color:ACCENT2}}>{((s.garch||0)*1e6).toFixed(2)}μ</span></span>
                  <span style={{fontSize:9,color:MUTED,fontFamily:MONO}}>OFI: <span style={{color:imbAbs>0.4?ORANGE:"#fff"}}>{(s.imb||0).toFixed(3)}</span></span>
                  <span style={{fontSize:9,color:MUTED,fontFamily:MONO}}>Vol24h: <span style={{color:"#fff"}}>{(s.vol24||0).toLocaleString("pt-BR")}</span></span>
                </div>
              </div>
              <div style={{display:"flex",gap:5,flexShrink:0}}>
                {!s.cb
                  ?<Btn onClick={()=>forceCircuitBreaker(c.ticker)} color={RED} variant="outline" small>🔒 CB</Btn>
                  :<Btn onClick={()=>clearCircuitBreaker(c.ticker)} color={GREEN} variant="outline" small>🔓 Liberar</Btn>
                }
                <Btn onClick={()=>setFvEdit(p=>p[c.ticker]!=null?{...p,[c.ticker]:undefined}:{...p,[c.ticker]:(s.fv||0).toFixed(2)})} color={ACCENT} variant="outline" small>FV</Btn>
              </div>
            </div>
            {fvEdit[c.ticker]!=null&&<div style={{marginTop:8,display:"flex",gap:8,alignItems:"center"}}>
              <input value={fvEdit[c.ticker]} onChange={e=>setFvEdit(p=>({...p,[c.ticker]:e.target.value}))}
                style={{flex:1,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:8,padding:"6px 10px",color:TEXT,fontSize:12,fontFamily:MONO,outline:"none"}}/>
              <Btn onClick={()=>{setFV(c.ticker,parseFloat(fvEdit[c.ticker]));setFvEdit(p=>({...p,[c.ticker]:undefined}));}} color={GREEN} small>Aplicar</Btn>
            </div>}
          </div>;
        })}
      </div>
    </>}

    {/* ── SUB: Editar Clubes ── */}
    {subTab==="clubes"&&<>
      {editClub?<div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <span style={{fontSize:13,fontWeight:800,color:"#fff",fontFamily:SANS}}>Editando: {editClub}</span>
          <Btn onClick={()=>setEditClub(null)} color={MUTED} variant="ghost" small>✕ Cancelar</Btn>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <Input label="NOME FICTÍCIO" value={clubForm.name||""} onChange={v=>setClubForm(p=>({...p,name:v}))}/>
          <Input label="NOME REAL" value={clubForm.realName||""} onChange={v=>setClubForm(p=>({...p,realName:v}))}/>
          <Input label="RECEITA (R$M)" type="number" value={clubForm.rev||""} onChange={v=>setClubForm(p=>({...p,rev:v}))}/>
          <Input label="DÍVIDA (R$M)" type="number" value={clubForm.debt||""} onChange={v=>setClubForm(p=>({...p,debt:v}))}/>
          <Input label="PLANTEL (R$M)" type="number" value={clubForm.squad||""} onChange={v=>setClubForm(p=>({...p,squad:v}))}/>
          <Input label="MARCA (R$M)" type="number" value={clubForm.brand||""} onChange={v=>setClubForm(p=>({...p,brand:v}))}/>
          <Input label="MÚLTIPLO EV/REC" type="number" step="0.1" value={clubForm.evMult||""} onChange={v=>setClubForm(p=>({...p,evMult:v}))}/>
          <Input label="FREE FLOAT (0-1)" type="number" step="0.01" value={clubForm.ff||""} onChange={v=>setClubForm(p=>({...p,ff:v}))}/>
          <Input label="COR HEX" value={clubForm.color||""} onChange={v=>setClubForm(p=>({...p,color:v}))}/>
          <div>
            <div style={{fontSize:10,color:MUTED,fontWeight:700,fontFamily:SANS,marginBottom:5,letterSpacing:"0.5px"}}>DIVISÃO</div>
            <select value={clubForm.div||"A"} onChange={e=>setClubForm(p=>({...p,div:e.target.value}))}
              style={{width:"100%",background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:"9px 13px",color:TEXT,fontSize:12,fontFamily:MONO,outline:"none"}}>
              <option value="A">Série A</option>
              <option value="B">Série B</option>
            </select>
          </div>
        </div>
        <div style={{marginTop:12}}>
          <Btn onClick={saveClub} color={GREEN}>💾 Salvar alterações</Btn>
        </div>
      </div>
      :<div style={{display:"flex",flexDirection:"column",gap:5}}>
        {clubs.map(c=><div key={c.ticker} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"10px 13px",display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:30,height:30,borderRadius:8,background:`linear-gradient(145deg,${c.color},${c.color}99)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:900,color:c.c2,flexShrink:0}}>
            {c.ticker.replace(/\d/g,"")}
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:11,fontWeight:700,color:"#fff",fontFamily:SANS}}>{c.ticker} · {c.name}</div>
            <div style={{fontSize:9,color:MUTED,fontFamily:MONO}}>Rec: {c.revenueLabel} · Dívida: R${c.debt}M · EV {c.evMult}× · ff {Math.round(c.ff*100)}%</div>
          </div>
          <Btn onClick={()=>openEditClub(c)} color={ACCENT} variant="outline" small>✎ Editar</Btn>
        </div>)}
      </div>}
    </>}

    {/* ── SUB: Disparar Notícia ── */}
    {subTab==="noticias"&&<>
      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"16px",marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:800,color:"#fff",fontFamily:SANS,marginBottom:14}}>Nova Notícia Manual</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <Input label="TICKER" value={newsForm.ticker} onChange={v=>setNewsForm(p=>({...p,ticker:v.toUpperCase()}))} placeholder="ex: URU3"/>
          <div>
            <div style={{fontSize:10,color:MUTED,fontWeight:700,fontFamily:SANS,marginBottom:5,letterSpacing:"0.5px"}}>CATEGORIA</div>
            <select value={newsForm.cat} onChange={e=>setNewsForm(p=>({...p,cat:e.target.value}))}
              style={{width:"100%",background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:"9px 13px",color:TEXT,fontSize:12,fontFamily:MONO,outline:"none"}}>
              {cats.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:10,color:MUTED,fontWeight:700,fontFamily:SANS,marginBottom:5,letterSpacing:"0.5px"}}>SENTIMENTO: {parseFloat(newsForm.sent)>=0?"positivo":"negativo"} ({newsForm.sent})</div>
          <input type="range" min="-1" max="1" step="0.05" value={newsForm.sent}
            onChange={e=>setNewsForm(p=>({...p,sent:e.target.value}))}
            style={{width:"100%",accentColor:parseFloat(newsForm.sent)>=0?GREEN:RED}}/>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:MUTED,fontFamily:SANS}}>
            <span>−1.0 (muito negativo)</span><span>0</span><span>+1.0 (muito positivo)</span>
          </div>
        </div>
        <Input label="HEADLINE" value={newsForm.headline} onChange={v=>setNewsForm(p=>({...p,headline:v}))} placeholder="Digite o texto da notícia..."/>
        <Btn onClick={fireNews} color={GREEN} disabled={!newsForm.ticker||!newsForm.headline}>📡 Disparar Notícia</Btn>
      </div>
      {newsFired.length>0&&<>
        <div style={{fontSize:9,color:MUTED,fontWeight:700,fontFamily:SANS,marginBottom:8,letterSpacing:"0.8px"}}>NOTÍCIAS DISPARADAS NESTA SESSÃO</div>
        {newsFired.map((n,i)=><div key={i} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"10px 13px",marginBottom:6,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:n.sent>=0?GREEN:RED,flexShrink:0}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:11,fontWeight:700,color:"#fff",fontFamily:SANS}}>{n.ticker} · {n.cat}</div>
            <div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>{n.headline}</div>
          </div>
          <span style={{fontSize:10,fontWeight:800,color:n.sent>=0?GREEN:RED,fontFamily:MONO}}>{n.sent>=0?"+":""}{n.sent}</span>
        </div>)}
      </>}
    </>}

    {/* ── SUB: Matriz de Impacto ── */}
    {subTab==="matriz"&&<>
      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"16px",marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:800,color:"#fff",fontFamily:SANS,marginBottom:4}}>IMPACT_MATRIX</div>
        <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginBottom:14}}>Impacto spot máximo por categoria de notícia (cap ±2.5%)</div>
        {cats.map(cat=><div key={cat} style={{marginBottom:10}}>
          <div style={{fontSize:9,color:MUTED,fontWeight:700,fontFamily:SANS,marginBottom:4}}>{cat}</div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <input type="range" min="0" max="0.10" step="0.001" value={impactForm[cat]||"0"}
              onChange={e=>setImpactForm(p=>({...p,[cat]:e.target.value}))}
              style={{flex:1,accentColor:ACCENT}}/>
            <span style={{fontSize:11,fontWeight:800,color:ACCENT,fontFamily:MONO,minWidth:50,textAlign:"right"}}>
              {(parseFloat(impactForm[cat]||0)*100).toFixed(1)}%
            </span>
          </div>
        </div>)}
        <Btn onClick={saveImpact} color={impactSaved?GREEN:ACCENT}>{impactSaved?"✓ Salvo!":"💾 Salvar Matriz"}</Btn>
      </div>
      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"16px"}}>
        <div style={{fontSize:11,fontWeight:800,color:"#fff",fontFamily:SANS,marginBottom:12}}>Correlação de Clusters</div>
        {Object.entries(CORR_CLUSTERS).map(([key,{tickers,rho}])=><div key={key} style={{marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:10,fontWeight:700,color:ACCENT2,fontFamily:SANS}}>{key}</span>
            <span style={{fontSize:10,fontWeight:700,color:ACCENT2,fontFamily:MONO}}>ρ = {rho}</span>
          </div>
          <div style={{fontSize:9,color:MUTED,fontFamily:MONO}}>{tickers.join(", ")}</div>
        </div>)}
      </div>
    </>}
  </div>;
}

/* ══════════════════════════════════════════════════════════════════
   MÓDULO 3 — GESTÃO DE USUÁRIOS
══════════════════════════════════════════════════════════════════ */
function UsersModule({currentRole="admin"}){
  const isMonitor=!canAction(currentRole,"promote_admin");
  const [users,setUsers]=useState(MOCK_USERS.map(u=>({...u})));
  const [selected,setSelected]=useState(null);
  const [filterPlan,setFilterPlan]=useState("Todos");
  const [filterRole,setFilterRole]=useState("Todos");
  const [filterOnline,setFilterOnline]=useState(false);
  const [balanceInput,setBalanceInput]=useState("");
  const [confirmAction,setConfirmAction]=useState(null);
  const [search,setSearch]=useState("");

  const filtered=users.filter(u=>{
    if(filterPlan!=="Todos"&&u.plan!==filterPlan) return false;
    if(filterRole!=="Todos"&&u.role!==filterRole) return false;
    if(filterOnline&&!u.online) return false;
    if(search&&!u.name.toLowerCase().includes(search.toLowerCase())&&!u.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const updateUser=(id,patch)=>setUsers(prev=>prev.map(u=>u.id===id?{...u,...patch}:u));

  const executeAction=()=>{
    if(!confirmAction) return;
    const {type,userId}=confirmAction;
    if(!canAction(currentRole,type)) return; // role-based double-guard
    if(type==="suspend")   updateUser(userId,{suspended:true,online:false});
    if(type==="unsuspend") updateUser(userId,{suspended:false});
    if(type==="reset")     updateUser(userId,{balance:parseFloat(balanceInput)||2000,pnl:0,txCount:0});
    if(type==="promote_admin")     updateUser(userId,{role:"admin"});
    if(type==="promote_monitor")   updateUser(userId,{role:"monitor"});
    if(type==="promote_editor")    updateUser(userId,{role:"editor"});
    if(type==="promote_moderador") updateUser(userId,{role:"moderador"});
    if(type==="demote")    updateUser(userId,{role:"user"});
    if(type==="promote_lenda")   updateUser(userId,{plan:"Lenda"});
    if(type==="promote_craque")  updateUser(userId,{plan:"Craque"});
    if(selected?.id===userId) setSelected(p=>p?{...p,...users.find(u=>u.id===userId)}:null);
    setConfirmAction(null);
    setBalanceInput("");
  };

  const sel=selected?users.find(u=>u.id===selected.id):null;

  const roleColor={admin:RED,monitor:ORANGE,editor:ACCENT,moderador:ACCENT2,user:MUTED};
  const planColor={Lenda:GOLD,Craque:ACCENT,Jogador:MUTED};

  return <div>
    <SectionHeader title="Usuários" sub={`${users.length} cadastrados · ${users.filter(u=>u.online).length} online agora`}/>

    {sel?<>
      {/* ── Perfil detalhado do usuário ── */}
      <button onClick={()=>setSelected(null)} style={{background:"none",border:"none",color:MUTED,fontSize:11,cursor:"pointer",fontFamily:SANS,fontWeight:700,marginBottom:14,padding:0}}>← Voltar</button>
      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:16,padding:"18px",marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <div style={{width:44,height:44,borderRadius:14,background:GRAD_ACCENT,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:"#fff",flexShrink:0}}>
            {sel.name.split(" ").slice(0,2).map(w=>w[0]).join("")}
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:SANS}}>{sel.name}</div>
            <div style={{fontSize:10,color:MUTED,fontFamily:SANS}}>{sel.email} · desde {sel.since}</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end"}}>
            <Badge children={sel.plan} color={planColor[sel.plan]}/>
            <Badge children={sel.role.toUpperCase()} color={roleColor[sel.role]||MUTED}/>
            {sel.online&&<Badge children="● ONLINE" color={GREEN} bg="rgba(34,197,94,.12)"/>}
            {sel.suspended&&<Badge children="SUSPENSO" color={RED} bg="rgba(244,63,94,.12)"/>}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
          {[
            {l:"SALDO",v:`FS$${sel.balance.toLocaleString("pt-BR",{minimumFractionDigits:2})}`,c:"#fff"},
            {l:"P&L",v:`${sel.pnl>=0?"+":""}FS$${sel.pnl.toFixed(2)}`,c:sel.pnl>=0?GREEN:RED},
            {l:"OPERAÇÕES",v:sel.txCount,c:ACCENT2},
          ].map(s=><div key={s.l} style={{background:SURFACE,borderRadius:10,padding:"10px"}}>
            <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginBottom:4}}>{s.l}</div>
            <div style={{fontSize:14,fontWeight:800,color:s.c,fontFamily:MONO}}>{s.v}</div>
          </div>)}
        </div>
        <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginBottom:14}}>Último acesso: {sel.lastAccess}</div>
        {/* Ações */}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{fontSize:9,color:MUTED,fontWeight:700,fontFamily:SANS,letterSpacing:"0.8px"}}>PLANO</div>
          {!canAction(currentRole,"promote_craque")
            ?<div style={{background:"rgba(249,115,22,.07)",border:"1px solid rgba(249,115,22,.2)",borderRadius:10,padding:"8px 12px",fontSize:10,color:ORANGE,fontFamily:SANS}}>
               🔒 Alteração de plano restrita a Administradores e Editores
             </div>
            :<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <Btn onClick={()=>setConfirmAction({type:"promote_craque",userId:sel.id})} color={ACCENT} variant="outline" small>Mover para Craque</Btn>
              <Btn onClick={()=>setConfirmAction({type:"promote_lenda",userId:sel.id})} color={GOLD} variant="outline" small>Mover para Lenda</Btn>
            </div>
          }
          <div style={{fontSize:9,color:MUTED,fontWeight:700,fontFamily:SANS,letterSpacing:"0.8px",marginTop:4}}>ROLE</div>
          {!canAction(currentRole,"promote_admin")
            ?<div style={{background:"rgba(249,115,22,.07)",border:"1px solid rgba(249,115,22,.2)",borderRadius:10,padding:"8px 12px",fontSize:10,color:ORANGE,fontFamily:SANS}}>
               🔒 Alteração de roles restrita a Administradores
             </div>
            :<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <Btn onClick={()=>setConfirmAction({type:"promote_admin",userId:sel.id})} color={RED} variant="outline" small>👑 Admin</Btn>
              <Btn onClick={()=>setConfirmAction({type:"promote_monitor",userId:sel.id})} color={ORANGE} variant="outline" small>🔭 Monitor</Btn>
              <Btn onClick={()=>setConfirmAction({type:"promote_editor",userId:sel.id})} color={ACCENT} variant="outline" small>✏️ Editor</Btn>
              <Btn onClick={()=>setConfirmAction({type:"promote_moderador",userId:sel.id})} color={ACCENT2} variant="outline" small>🛡 Moderador</Btn>
              <Btn onClick={()=>setConfirmAction({type:"demote",userId:sel.id})} color={MUTED} variant="outline" small>Revogar</Btn>
            </div>
          }
          <div style={{fontSize:9,color:MUTED,fontWeight:700,fontFamily:SANS,letterSpacing:"0.8px",marginTop:4}}>SALDO & CONTA</div>
          {!canAction(currentRole,"suspend")
            ?<div style={{background:"rgba(249,115,22,.07)",border:"1px solid rgba(249,115,22,.2)",borderRadius:10,padding:"8px 12px",fontSize:10,color:ORANGE,fontFamily:SANS}}>
               🔒 Edição de saldo e suspensão restrita a Administradores e Editores
             </div>
            :<div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              <input value={balanceInput} onChange={e=>setBalanceInput(e.target.value)} placeholder="Novo saldo FS$"
                style={{width:140,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:8,padding:"6px 10px",color:TEXT,fontSize:12,fontFamily:MONO,outline:"none"}}/>
              <Btn onClick={()=>setConfirmAction({type:"reset",userId:sel.id})} color={ACCENT2} variant="outline" small>Resetar saldo</Btn>
              {!sel.suspended
                ?<Btn onClick={()=>setConfirmAction({type:"suspend",userId:sel.id})} color={RED} variant="outline" small>Suspender</Btn>
                :<Btn onClick={()=>setConfirmAction({type:"unsuspend",userId:sel.id})} color={GREEN} variant="outline" small>Reativar</Btn>
              }
            </div>
          }
        </div>
      </div>
    </>
    :<>
      {/* ── Lista de usuários ── */}
      <div style={{marginBottom:12}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nome ou email..."
          style={{width:"100%",background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:"9px 13px",
            color:TEXT,fontSize:12,fontFamily:SANS,outline:"none",boxSizing:"border-box",marginBottom:8}}/>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {["Todos","Jogador","Craque","Lenda"].map(p=>(
            <button key={p} onClick={()=>setFilterPlan(p)} style={{padding:"4px 10px",borderRadius:8,border:"none",cursor:"pointer",
              background:filterPlan===p?(p==="Lenda"?GOLD:p==="Craque"?ACCENT:SURFACE):SURFACE,
              color:filterPlan===p?(p==="Lenda"||p==="Craque"?BG:"#fff"):MUTED,fontSize:9,fontWeight:800,fontFamily:SANS}}>{p}</button>
          ))}
          {["Todos","user","monitor","admin"].map(r=>(
            <button key={r} onClick={()=>setFilterRole(r)} style={{padding:"4px 10px",borderRadius:8,border:"none",cursor:"pointer",
              background:filterRole===r?CARD:SURFACE,color:filterRole===r?"#fff":MUTED,fontSize:9,fontWeight:800,fontFamily:SANS,
              border:filterRole===r?`1px solid ${BORDER}`:"1px solid transparent"}}>
              {r==="Todos"?"Todos os roles":r}
            </button>
          ))}
          <button onClick={()=>setFilterOnline(p=>!p)} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${filterOnline?GREEN:BORDER}`,cursor:"pointer",
            background:filterOnline?"rgba(34,197,94,.08)":SURFACE,color:filterOnline?GREEN:MUTED,fontSize:9,fontWeight:800,fontFamily:SANS}}>
            ● Online
          </button>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:5}}>
        {filtered.map(u=><div key={u.id} onClick={()=>setSelected(u)} style={{
          background:CARD,border:`1px solid ${u.suspended?"rgba(244,63,94,.3)":BORDER}`,borderRadius:12,
          padding:"10px 13px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,
          transition:"border-color .15s"
        }}>
          <div style={{width:32,height:32,borderRadius:10,background:GRAD_ACCENT,display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:11,fontWeight:800,color:"#fff",flexShrink:0}}>
            {u.name.split(" ").slice(0,2).map(w=>w[0]).join("")}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
              <span style={{fontSize:11,fontWeight:700,color:u.suspended?"rgba(255,255,255,.4)":"#fff",fontFamily:SANS}}>{u.name}</span>
              {u.online&&<div style={{width:6,height:6,borderRadius:"50%",background:GREEN,flexShrink:0}}/>}
              {u.suspended&&<Badge children="SUSPENSO" color={RED} bg="rgba(244,63,94,.1)"/>}
            </div>
            <div style={{fontSize:9,color:MUTED,fontFamily:SANS,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.email}</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,flexShrink:0}}>
            <Badge children={u.plan} color={planColor[u.plan]}/>
            <span style={{fontSize:9,fontFamily:MONO,color:u.pnl>=0?GREEN:RED}}>
              {u.pnl>=0?"+":""}FS${u.pnl.toFixed(0)}
            </span>
          </div>
          <span style={{fontSize:12,color:MUTED,flexShrink:0}}>›</span>
        </div>)}
        {filtered.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:MUTED,fontSize:12,fontFamily:SANS}}>Nenhum usuário encontrado</div>}
      </div>
    </>}

    {/* ── Modal de confirmação ── */}
    {confirmAction&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 20px"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:20,padding:"24px",maxWidth:360,width:"100%"}}>
        <div style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:SANS,marginBottom:8}}>Confirmar ação</div>
        <div style={{fontSize:12,color:MUTED,fontFamily:SANS,marginBottom:20}}>
          {confirmAction.type==="suspend"&&"Suspender este usuário? Ele perderá acesso imediato."}
          {confirmAction.type==="unsuspend"&&"Reativar acesso deste usuário?"}
          {confirmAction.type==="reset"&&`Resetar saldo para FS$${parseFloat(balanceInput)||2000}? Esta ação é irreversível.`}
          {confirmAction.type==="promote_admin"     &&"Promover a Admin? Acesso total ao painel."}
          {confirmAction.type==="promote_monitor"   &&"Promover a Monitor? Dashboard, usuários (leitura), engajamento e moderação."}
          {confirmAction.type==="promote_editor"    &&"Promover a Editor? Dashboard, usuários (edição), moderação e notícias."}
          {confirmAction.type==="promote_moderador" &&"Promover a Moderador? Acesso apenas à moderação e notícias."}
          {confirmAction.type==="demote"            &&"Revogar roles e retornar ao nível padrão?"}
          {confirmAction.type==="promote_lenda"&&"Mover este usuário para o plano Lenda?"}
          {confirmAction.type==="promote_craque"&&"Mover este usuário para o plano Craque?"}
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={()=>setConfirmAction(null)} color={MUTED} variant="outline">Cancelar</Btn>
          <Btn onClick={executeAction} color={confirmAction.type==="suspend"||confirmAction.type==="demote"?RED:GREEN}>Confirmar</Btn>
        </div>
      </div>
    </div>}
  </div>;
}

/* ══════════════════════════════════════════════════════════════════
   MÓDULO 4 — FINANCEIRO
══════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════
   MÓDULO 4A — FINANCEIRO
══════════════════════════════════════════════════════════════════ */

// Metadados de webhook por gateway (fonte: planilha Webhooks em Pagamentos)
const GW_WEBHOOK_META={
  mp: {
    payload:    "JSON com ID do recurso",
    validacao:  "Chave Secreta / Assinatura HMAC",
    campoChave: "CHAVE SECRETA",
    placeholderChave: "sk_live_...",
    campos:["chave"],
  },
  pp: {
    payload:    "JSON completo do evento",
    validacao:  "Client ID + Secret → Bearer token",
    campoChave: "CLIENT ID",
    placeholderChave: "AXo...",
    campos:["chave","chave2","webhookId"],
  },
  pag:{
    payload:    "Código de notificação",
    validacao:  "Token de Conta por notificação",
    campoChave: "TOKEN DE CONTA",
    placeholderChave: "TOKEN_CONTA",
    campos:["chave"],
  },
};
const GW_WEBHOOK_DEFAULT={
  payload:"JSON",validacao:"Chave de API",
  campoChave:"CHAVE DE API / SECRET KEY",placeholderChave:"sk_live_...",
  campos:["chave"],
};

function FinanceiroModule(){
  const [payTab,setPayTab]=useState("resumo");
  const months=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const curMonth=months[new Date().getMonth()];

  const assinaturasData={
    Craque:{count:4,mrr:4*19.90,arr:4*19.90*12,churn:5},
    Lenda: {count:3,mrr:3*49.90,arr:3*49.90*12,churn:2},
  };
  const totalMrr=assinaturasData.Craque.mrr+assinaturasData.Lenda.mrr;

  // Estrutura de modalidade: {ativo, taxa, prazo}
  // Modalidades fixas: credito, debito, pix
  const BLANK_MODAL={ativo:false,taxa:"",prazo:"D+2"};
  // Campos de credencial variam por gateway (ver planilha Webhooks):
  //   Mercado Pago → chaveSecreta (assinatura HMAC) + webhookUrl
  //   PagSeguro    → tokenConta   (validação de notificação) + webhookUrl
  //   PayPal       → clientId + clientSecret (verificação de assinatura) + webhookId + webhookUrl
  //   Genérico     → chave + webhookUrl
  const BLANK_GW={nome:"",icon:"💳",cor:"#6c63ff",ativo:true,pct:0,
    chave:"",chave2:"",webhookId:"",webhook:"",
    credito:{ativo:false,taxa:"",prazo:"D+30"},
    debito: {ativo:false,taxa:"",prazo:"D+2"},
    pix:    {ativo:false,taxa:"",prazo:"D+1"},
  };
  const [gateways,setGateways]=useState([
    {id:"mp", nome:"Mercado Pago",icon:"🟦",cor:"#00B1EA",ativo:true, pct:54,
      // Validação: Chave Secreta / Assinatura (HMAC-SHA256 no header X-Signature)
      chave:"sk_live_••••••••XXXX",chave2:"",webhookId:"",
      webhook:"https://api.footstock.com.br/webhooks/mp",
      // Payload: POST com JSON contendo o ID do recurso (não o recurso completo)
      credito:{ativo:true, taxa:"3.49%",prazo:"D+30"},
      debito: {ativo:true, taxa:"1.99%",prazo:"D+2"},
      pix:    {ativo:true, taxa:"0.99%",prazo:"D+1"},
    },
    {id:"pp", nome:"PayPal",      icon:"🅿", cor:"#003087",ativo:true, pct:29,
      // Validação: Client ID + Client Secret → troca por Bearer token para verificar assinatura
      chave:"••••••••••CLIENT_ID",chave2:"••••••••••CLIENT_SECRET",webhookId:"WH-XXXX",
      webhook:"https://api.footstock.com.br/webhooks/paypal",
      // Payload: POST com JSON completo do evento (resource object embutido)
      credito:{ativo:true, taxa:"4.40%",prazo:"D+30"},
      debito: {ativo:false,taxa:"",    prazo:"D+2"},
      pix:    {ativo:false,taxa:"",    prazo:"D+1"},
    },
    {id:"pag",nome:"PagSeguro",   icon:"🟧",cor:"#f97316",ativo:false,pct:17,
      // Validação: Token de Conta enviado em cada notificação (consultar API com o código)
      chave:"••••••••••TOKEN_CONTA",chave2:"",webhookId:"",
      webhook:"https://api.footstock.com.br/webhooks/pag",
      // Payload: POST com código de notificação (não JSON — requer consulta posterior)
      credito:{ativo:true, taxa:"3.99%",prazo:"D+30"},
      debito: {ativo:true, taxa:"2.49%",prazo:"D+2"},
      pix:    {ativo:true, taxa:"1.19%",prazo:"D+1"},
    },
  ]);
  const [editGw,setEditGw]=useState(null);
  const [gwForm,setGwForm]=useState({...BLANK_GW});
  const [gwConfirmDel,setGwConfirmDel]=useState(null);

  const openEditGw=(gw)=>{setEditGw(gw.id);setGwForm({...gw});};
  const openNewGw  =()=>{setEditGw("new");setGwForm(JSON.parse(JSON.stringify(BLANK_GW)));};
  const setModal=(tipo,field,val)=>setGwForm(p=>({...p,[tipo]:{...p[tipo],[field]:val}}));
  const saveGw=()=>{
    if(editGw==="new"){
      setGateways(p=>[...p,{...gwForm,id:`gw_${Date.now()}`,pct:parseInt(gwForm.pct)||0}]);
    } else {
      setGateways(p=>p.map(g=>g.id===editGw?{...g,...gwForm,pct:parseInt(gwForm.pct)||g.pct}:g));
    }
    setEditGw(null);
  };
  const deleteGw =(id)=>{setGateways(p=>p.filter(g=>g.id!==id));setGwConfirmDel(null);};
  const toggleGw =(id)=>setGateways(p=>p.map(g=>g.id===id?{...g,ativo:!g.ativo}:g));

  const MODAL_LABELS={credito:"Crédito",debito:"Débito",pix:"Pix"};
  const MODAL_ICONS ={credito:"💳",debito:"🏧",pix:"⚡"};
  const MODAL_PRAZOS={credito:["D+30","D+15","D+2"],debito:["D+2","D+1"],pix:["D+1","D+0"]};

  const gwFormFields=(
    <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"16px",marginBottom:12}}>
      <div style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:"0.8px",fontFamily:SANS,marginBottom:14}}>
        {editGw==="new"?"DADOS DO NOVO GATEWAY":"CREDENCIAIS E CONFIGURAÇÃO"}
      </div>

      {/* Identificação (só no novo) */}
      {editGw==="new"&&<>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <Input label="NOME DO GATEWAY" value={gwForm.nome} onChange={v=>setGwForm(p=>({...p,nome:v}))} placeholder="ex: Stripe"/>
          <Input label="ÍCONE (emoji)" value={gwForm.icon} onChange={v=>setGwForm(p=>({...p,icon:v}))} placeholder="💳"/>
        </div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:10,color:MUTED,fontWeight:700,fontFamily:SANS,marginBottom:8,letterSpacing:"0.5px"}}>COR DO GATEWAY</div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input type="color" value={gwForm.cor} onChange={e=>setGwForm(p=>({...p,cor:e.target.value}))}
              style={{width:36,height:36,borderRadius:8,border:"none",cursor:"pointer",background:"none",padding:0}}/>
            <input value={gwForm.cor} onChange={e=>setGwForm(p=>({...p,cor:e.target.value}))}
              style={{width:120,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:9,padding:"7px 11px",color:TEXT,fontSize:12,fontFamily:MONO,outline:"none"}}/>
            <div style={{width:36,height:36,borderRadius:9,background:gwForm.cor,border:`1px solid ${BORDER}`,flexShrink:0}}/>
          </div>
        </div>
      </>}

      {/* Credenciais — campos adaptativos por gateway (fonte: planilha Webhooks) */}
      {(()=>{
        const meta=GW_WEBHOOK_META[gwForm.id]||GW_WEBHOOK_DEFAULT;
        return <>
          <div style={{background:SURFACE,borderRadius:10,padding:"10px 12px",marginBottom:14,display:"flex",flexDirection:"column",gap:4}}>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <span style={{background:`${ACCENT2}20`,color:ACCENT2,borderRadius:5,padding:"1px 7px",fontSize:9,fontWeight:700,fontFamily:SANS}}>HTTP POST</span>
              <span style={{background:`${ACCENT}15`,color:ACCENT,borderRadius:5,padding:"1px 7px",fontSize:9,fontWeight:700,fontFamily:SANS}}>Payload: {meta.payload}</span>
            </div>
            <div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>
              <span style={{color:"rgba(255,255,255,.6)"}}>Validação:</span> {meta.validacao}
            </div>
          </div>
          <Input label={meta.campoChave} value={gwForm.chave||""} onChange={v=>setGwForm(p=>({...p,chave:v}))} placeholder={meta.placeholderChave}/>
          {meta.campos.includes("chave2")&&<Input label="CLIENT SECRET" value={gwForm.chave2||""} onChange={v=>setGwForm(p=>({...p,chave2:v}))} placeholder="EBw..."/>}
          {meta.campos.includes("webhookId")&&<Input label="WEBHOOK ID" value={gwForm.webhookId||""} onChange={v=>setGwForm(p=>({...p,webhookId:v}))} placeholder="WH-XXXX"/>}
          <Input label="WEBHOOK URL" value={gwForm.webhook||""} onChange={v=>setGwForm(p=>({...p,webhook:v}))} placeholder="https://api.seudominio.com.br/webhooks/..."/>
        </>;
      })()}

      {/* Participação */}
      <div style={{marginBottom:16}}>
        <div style={{fontSize:10,color:MUTED,fontWeight:700,fontFamily:SANS,marginBottom:5,letterSpacing:"0.5px"}}>PARTICIPAÇÃO NO MIX (%)</div>
        <input type="number" value={gwForm.pct||""} onChange={e=>setGwForm(p=>({...p,pct:e.target.value}))}
          placeholder="ex: 30" min="0" max="100"
          style={{width:120,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:"8px 12px",color:TEXT,fontSize:12,fontFamily:MONO,outline:"none"}}/>
      </div>

      {/* Modalidades — taxa e prazo individuais */}
      <div style={{fontSize:10,color:MUTED,fontWeight:700,fontFamily:SANS,marginBottom:10,letterSpacing:"0.5px"}}>MODALIDADES — TAXA E PRAZO POR TIPO</div>
      {["credito","debito","pix"].map(tipo=>{
        const m=gwForm[tipo]||{ativo:false,taxa:"",prazo:""};
        return <div key={tipo} style={{background:m.ativo?`${gwForm.cor||ACCENT}0d`:SURFACE,border:`1px solid ${m.ativo?(gwForm.cor||ACCENT)+"44":BORDER}`,borderRadius:12,padding:"12px",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:m.ativo?10:0}}>
            <span style={{fontSize:16,flexShrink:0}}>{MODAL_ICONS[tipo]}</span>
            <div style={{flex:1}}>
              <span style={{fontSize:12,fontWeight:700,color:m.ativo?"#fff":"rgba(255,255,255,.5)",fontFamily:SANS}}>{MODAL_LABELS[tipo]}</span>
              {!m.ativo&&<span style={{fontSize:9,color:MUTED,fontFamily:SANS,marginLeft:8}}>desativado</span>}
            </div>
            <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",flexShrink:0}}>
              <span style={{fontSize:9,color:MUTED,fontFamily:SANS}}>Aceitar</span>
              <input type="checkbox" checked={m.ativo} onChange={e=>setModal(tipo,"ativo",e.target.checked)}
                style={{accentColor:gwForm.cor||ACCENT,width:15,height:15}}/>
            </label>
          </div>
          {m.ativo&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div>
              <div style={{fontSize:9,color:MUTED,fontWeight:700,fontFamily:SANS,marginBottom:4,letterSpacing:"0.5px"}}>TAXA</div>
              <input value={m.taxa} onChange={e=>setModal(tipo,"taxa",e.target.value)} placeholder="ex: 2.99%"
                style={{width:"100%",background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:9,padding:"7px 10px",color:TEXT,fontSize:12,fontFamily:MONO,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div>
              <div style={{fontSize:9,color:MUTED,fontWeight:700,fontFamily:SANS,marginBottom:4,letterSpacing:"0.5px"}}>PRAZO</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {MODAL_PRAZOS[tipo].map(d=><button key={d} onClick={()=>setModal(tipo,"prazo",d)} style={{
                  padding:"5px 10px",borderRadius:7,border:`1px solid ${m.prazo===d?(gwForm.cor||ACCENT):BORDER}`,cursor:"pointer",
                  background:m.prazo===d?`${gwForm.cor||ACCENT}20`:SURFACE,
                  color:m.prazo===d?(gwForm.cor||ACCENT):"#fff",fontSize:10,fontWeight:700,fontFamily:SANS
                }}>{d}</button>)}
              </div>
            </div>
          </div>}
        </div>;
      })}

      <div style={{height:1,background:BORDER,margin:"16px 0"}}/>
      <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginBottom:16}}>
        <input type="checkbox" checked={gwForm.ativo||false} onChange={e=>setGwForm(p=>({...p,ativo:e.target.checked}))}
          style={{accentColor:ACCENT,width:16,height:16}}/>
        <span style={{fontSize:12,color:"#fff",fontFamily:SANS}}>Gateway ativo imediatamente</span>
      </label>
      <Btn onClick={saveGw} color={GREEN} disabled={!gwForm.chave}>{editGw==="new"?"➕ Adicionar gateway":"💾 Salvar configuração"}</Btn>
    </div>
  );

  return <div>
    <SectionHeader title="Financeiro" sub={`Receita de assinaturas e meios de pagamento — ${curMonth} 2026`}/>

    {/* Sub-tabs */}
    <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>
      {[{id:"resumo",label:"Resumo"},{id:"assinaturas",label:"Assinaturas"},{id:"pagamentos",label:"Pagamentos"}].map(t=>(
        <button key={t.id} onClick={()=>{setPayTab(t.id);setEditGw(null);}} style={{
          padding:"6px 14px",borderRadius:10,border:"none",cursor:"pointer",
          background:payTab===t.id?ACCENT:SURFACE,color:payTab===t.id?BG:"#fff",
          fontSize:10,fontWeight:800,fontFamily:SANS,transition:"all .15s",whiteSpace:"nowrap"
        }}>{t.label}</button>
      ))}
    </div>

    {/* ── RESUMO ── */}
    {payTab==="resumo"&&<>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        <div style={{background:CARD,border:"1px solid rgba(34,197,94,.3)",borderRadius:14,padding:"14px 16px"}}>
          <div style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:"0.8px",fontFamily:SANS,marginBottom:6}}>MRR</div>
          <div style={{fontSize:26,fontWeight:900,color:GREEN,fontFamily:MONO}}>R${totalMrr.toFixed(2)}</div>
          <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginTop:3}}>ARR: R${(totalMrr*12).toFixed(2)}</div>
        </div>
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"14px 16px"}}>
          <div style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:"0.8px",fontFamily:SANS,marginBottom:6}}>ASSINANTES PAGOS</div>
          <div style={{fontSize:26,fontWeight:900,color:"#fff",fontFamily:MONO}}>{assinaturasData.Craque.count+assinaturasData.Lenda.count}</div>
          <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginTop:3}}>Craque + Lenda</div>
        </div>
      </div>
      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"14px 16px",marginBottom:12}}>
        <div style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:"0.8px",fontFamily:SANS,marginBottom:10}}>RECEITA POR PLANO</div>
        {[{plan:"Lenda",color:GOLD,...assinaturasData.Lenda},{plan:"Craque",color:ACCENT,...assinaturasData.Craque}].map(d=>(
          <div key={d.plan} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${BORDER}`}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:d.color}}/>
              <span style={{fontSize:11,fontWeight:700,color:d.color,fontFamily:SANS}}>{d.plan}</span>
              <span style={{fontSize:9,color:MUTED,fontFamily:SANS}}>{d.count} assinantes</span>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:12,fontWeight:800,color:"#fff",fontFamily:MONO}}>R${d.mrr.toFixed(2)}/mês</div>
              <div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>churn {d.churn}%</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"14px 16px"}}>
        <div style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:"0.8px",fontFamily:SANS,marginBottom:10}}>GATEWAYS ATIVOS</div>
        {gateways.filter(g=>g.ativo).map(g=>(
          <div key={g.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${BORDER}`}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:24,height:24,borderRadius:7,background:`${g.cor}22`,border:`1px solid ${g.cor}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11}}>{g.icon}</div>
              <span style={{fontSize:11,fontWeight:700,color:"#fff",fontFamily:SANS}}>{g.nome}</span>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:12,fontWeight:800,color:g.cor,fontFamily:MONO}}>{g.pct}%</div>
              <div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>R${(totalMrr*g.pct/100).toFixed(2)}/mês</div>
            </div>
          </div>
        ))}
      </div>
    </>}

    {/* ── ASSINATURAS ── */}
    {payTab==="assinaturas"&&<>
      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"16px"}}>
        <div style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:"0.8px",fontFamily:SANS,marginBottom:12}}>RECEITA RECORRENTE MENSAL</div>
        <div style={{fontSize:30,fontWeight:900,color:GREEN,fontFamily:MONO,marginBottom:4}}>R${totalMrr.toFixed(2)}</div>
        <div style={{fontSize:10,color:MUTED,fontFamily:SANS,marginBottom:16}}>ARR estimado: R${(totalMrr*12).toFixed(2)}</div>
        {[{plan:"Lenda",color:GOLD,...assinaturasData.Lenda},{plan:"Craque",color:ACCENT,...assinaturasData.Craque}].map(d=>(
          <div key={d.plan} style={{background:SURFACE,borderRadius:12,padding:"12px 14px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:d.color,fontFamily:SANS}}>{d.plan}</div>
                <div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>{d.count} assinantes</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:MONO}}>R${d.mrr.toFixed(2)}/mês</div>
                <div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>R${d.arr.toFixed(2)}/ano</div>
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <div style={{flex:1,background:BORDER,borderRadius:8,padding:"6px 10px",textAlign:"center"}}>
                <div style={{fontSize:8,color:MUTED,fontFamily:SANS}}>Churn</div>
                <div style={{fontSize:13,fontWeight:800,color:d.churn>5?ORANGE:GREEN,fontFamily:MONO}}>{d.churn}%</div>
              </div>
              <div style={{flex:1,background:BORDER,borderRadius:8,padding:"6px 10px",textAlign:"center"}}>
                <div style={{fontSize:8,color:MUTED,fontFamily:SANS}}>Ticket médio</div>
                <div style={{fontSize:13,fontWeight:800,color:"#fff",fontFamily:MONO}}>R${(d.mrr/d.count).toFixed(2)}</div>
              </div>
              <div style={{flex:1,background:BORDER,borderRadius:8,padding:"6px 10px",textAlign:"center"}}>
                <div style={{fontSize:8,color:MUTED,fontFamily:SANS}}>MRR</div>
                <div style={{fontSize:13,fontWeight:800,color:GREEN,fontFamily:MONO}}>R${d.mrr.toFixed(2)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>}

    {/* ── PAGAMENTOS ── */}
    {payTab==="pagamentos"&&<>
      {editGw?<>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <span style={{fontSize:13,fontWeight:800,color:"#fff",fontFamily:SANS}}>
            {editGw==="new"?"Novo meio de pagamento":"Configurar: "+gwForm.nome}
          </span>
          <Btn onClick={()=>setEditGw(null)} color={MUTED} variant="outline" small>✕ Cancelar</Btn>
        </div>
        {gwFormFields}
      </>:<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:11,color:MUTED,fontFamily:SANS}}>{gateways.length} meios cadastrados · {gateways.filter(g=>g.ativo).length} ativos</div>
          <Btn onClick={openNewGw} color={ACCENT}>+ Adicionar meio de pagamento</Btn>
        </div>
        {gateways.map(g=>{
          const valorPct=totalMrr*g.pct/100;
          return <div key={g.id} style={{background:CARD,border:`1.5px solid ${g.ativo?g.cor+"55":BORDER}`,borderRadius:14,padding:"14px",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <div style={{width:40,height:40,borderRadius:12,background:`${g.cor}22`,border:`1px solid ${g.cor}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{g.icon}</div>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                  <span style={{fontSize:13,fontWeight:800,color:"#fff",fontFamily:SANS}}>{g.nome}</span>
                  <Badge children={g.ativo?"● ATIVO":"INATIVO"} color={g.ativo?GREEN:MUTED}/>
                </div>
                <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginBottom:4}}>
                  {["credito","debito","pix"].filter(t=>g[t]?.ativo).map(t=>({credito:"Crédito",debito:"Débito",pix:"Pix"})[t]).join(", ")||"Nenhuma modalidade ativa"}
                </div>
                {(()=>{const m=GW_WEBHOOK_META[g.id]||GW_WEBHOOK_DEFAULT; return(
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    <span style={{background:`${ACCENT2}18`,color:ACCENT2,borderRadius:4,padding:"1px 6px",fontSize:8,fontWeight:700,fontFamily:SANS}}>POST</span>
                    <span style={{background:`${ACCENT}12`,color:ACCENT,borderRadius:4,padding:"1px 6px",fontSize:8,fontWeight:600,fontFamily:SANS}}>{m.payload}</span>
                    <span style={{background:"rgba(255,255,255,.06)",color:MUTED,borderRadius:4,padding:"1px 6px",fontSize:8,fontFamily:SANS}}>{m.validacao}</span>
                  </div>
                );})()}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
              {[{l:"PARTICIPAÇÃO",v:`${g.pct}%`,c:g.cor},{l:"RECEITA/MÊS",v:`R$${valorPct.toFixed(2)}`,c:"#fff"}].map(s=>(
                <div key={s.l} style={{background:SURFACE,borderRadius:8,padding:"7px",textAlign:"center"}}>
                  <div style={{fontSize:8,color:MUTED,fontFamily:SANS}}>{s.l}</div>
                  <div style={{fontSize:12,fontWeight:800,color:s.c,fontFamily:MONO}}>{s.v}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:5,marginBottom:10,flexWrap:"wrap"}}>
              {["credito","debito","pix"].map(tipo=>{
                const m=g[tipo]||{};
                const icons={credito:"💳",debito:"🏧",pix:"⚡"};
                const labels={credito:"Crédito",debito:"Débito",pix:"Pix"};
                return <div key={tipo} style={{flex:1,minWidth:90,background:m.ativo?`${g.cor}12`:SURFACE,border:`1px solid ${m.ativo?g.cor+"44":BORDER}`,borderRadius:9,padding:"7px 8px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:m.ativo?4:0}}>
                    <span style={{fontSize:12}}>{icons[tipo]}</span>
                    <span style={{fontSize:10,fontWeight:700,color:m.ativo?"#fff":"rgba(255,255,255,.3)",fontFamily:SANS}}>{labels[tipo]}</span>
                    {!m.ativo&&<span style={{fontSize:8,color:MUTED,fontFamily:SANS,marginLeft:"auto"}}>off</span>}
                  </div>
                  {m.ativo&&<>
                    <div style={{fontSize:11,fontWeight:800,color:g.cor,fontFamily:MONO}}>{m.taxa||"—"}</div>
                    <div style={{fontSize:8,color:MUTED,fontFamily:SANS}}>{m.prazo}</div>
                  </>}
                </div>;
              })}
            </div>
            <div style={{height:5,borderRadius:3,background:BORDER,overflow:"hidden",marginBottom:10}}>
              <div style={{height:"100%",width:`${g.pct}%`,background:g.cor,borderRadius:3,transition:"width .5s"}}/>
            </div>
            <div style={{display:"flex",gap:6}}>
              <Btn onClick={()=>openEditGw(g)} color={ACCENT} variant="outline" small>⚙ Configurar</Btn>
              <Btn onClick={()=>toggleGw(g.id)} color={g.ativo?ORANGE:GREEN} variant="outline" small>{g.ativo?"Desativar":"Ativar"}</Btn>
              <Btn onClick={()=>setGwConfirmDel(g.id)} color={RED} variant="outline" small>🗑 Excluir</Btn>
            </div>
          </div>;
        })}
      </>}

      {gwConfirmDel&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 20px"}}>
        <div onClick={e=>e.stopPropagation()} style={{background:CARD,border:"1px solid rgba(244,63,94,.4)",borderRadius:20,padding:"24px",maxWidth:340,width:"100%"}}>
          <div style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:SANS,marginBottom:8}}>Remover gateway?</div>
          <div style={{fontSize:12,color:MUTED,fontFamily:SANS,marginBottom:20}}>O gateway será removido permanentemente. Transações em andamento não serão afetadas.</div>
          <div style={{display:"flex",gap:8}}>
            <Btn onClick={()=>setGwConfirmDel(null)} color={MUTED} variant="outline">Cancelar</Btn>
            <Btn onClick={()=>deleteGw(gwConfirmDel)} color={RED}>Remover</Btn>
          </div>
        </div>
      </div>}
    </>}
  </div>;
}

/* ══════════════════════════════════════════════════════════════════
   MÓDULO 4B — ENGAJAMENTO
══════════════════════════════════════════════════════════════════ */
function EngajamentoModule(){
  const months=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const curMonth=months[new Date().getMonth()];

  const eng={
    acessosMes:312, tempoMedio:"8min 20s", recorrencia:68,
    acessosPorUsuario:31.2, dau:7, wau:10, mau:10,
    retencao30d:72, reincidencia:68, topHorario:"19h–22h",
    ausencia:{d1:2,d7:3,d15:1,d30:2,acima:1},
  };

  const fsMovimentado={
    compras:142800, vendas:138400, dividendos:2760.70, taxas:1840.50,
    topAtivo:{ticker:"URU3",vol:48200}, maisPnl:{nome:"Carlos H.",pnl:1840.20},
  };

  return <div>
    <SectionHeader title="Engajamento" sub={`Acessos, permanência e movimentação FS$ — ${curMonth} 2026`}/>

    {/* Acessos */}
    <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"14px 16px",marginBottom:12}}>
      <div style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:"0.8px",fontFamily:SANS,marginBottom:12}}>ACESSOS & SESSÕES</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
        {[
          {l:"ACESSOS/MÊS",        v:eng.acessosMes,                    s:"sessões únicas",      c:"#fff"},
          {l:"TEMPO MÉDIO/SESSÃO", v:eng.tempoMedio,                     s:"por acesso",          c:"#fff"},
          {l:"TAXA RECORRÊNCIA",   v:`${eng.recorrencia}%`,              s:">1 sessão/dia",       c:ACCENT},
          {l:"ACESSOS/USUÁRIO",    v:`${eng.acessosPorUsuario.toFixed(1)}×`, s:"média no mês",   c:ACCENT2},
          {l:"DAU",                v:eng.dau,                             s:"usuários/dia",       c:"#fff"},
          {l:"MAU",                v:eng.mau,                             s:"usuários/mês",       c:"#fff"},
          {l:"RETENÇÃO 30d",       v:`${eng.retencao30d}%`,              s:"voltaram no mês",    c:GREEN},
          {l:"PICO DE ACESSO",     v:eng.topHorario,                     s:"horário mais ativo", c:"#fff"},
        ].map(s=><div key={s.l} style={{background:SURFACE,borderRadius:10,padding:"10px"}}>
          <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginBottom:3}}>{s.l}</div>
          <div style={{fontSize:16,fontWeight:800,color:s.c,fontFamily:MONO,lineHeight:1}}>{s.v}</div>
          <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginTop:2}}>{s.s}</div>
        </div>)}
      </div>
      <div style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:"0.8px",fontFamily:SANS,marginBottom:8}}>AUSÊNCIA POR PERÍODO</div>
      <div style={{display:"flex",gap:5}}>
        {[
          {label:"1 dia",  value:eng.ausencia.d1,   color:ORANGE},
          {label:"7 dias", value:eng.ausencia.d7,   color:ORANGE},
          {label:"15 dias",value:eng.ausencia.d15,  color:RED},
          {label:"30 dias",value:eng.ausencia.d30,  color:RED},
          {label:"+30d",   value:eng.ausencia.acima, color:"rgba(244,63,94,.5)"},
        ].map(a=><div key={a.label} style={{flex:1,background:SURFACE,borderRadius:8,padding:"8px 4px",textAlign:"center"}}>
          <div style={{fontSize:20,fontWeight:800,color:a.color,fontFamily:MONO,lineHeight:1}}>{a.value}</div>
          <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginTop:3,lineHeight:1.3}}>{a.label}</div>
        </div>)}
      </div>
    </div>

    {/* FS$ Movimentados */}
    <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"14px 16px"}}>
      <div style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:"0.8px",fontFamily:SANS,marginBottom:12}}>FS$ MOVIMENTADOS NO MÊS</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        {[
          {l:"COMPRAS",    v:`FS$${fsMovimentado.compras.toLocaleString("pt-BR")}`,    c:ACCENT},
          {l:"VENDAS",     v:`FS$${fsMovimentado.vendas.toLocaleString("pt-BR")}`,     c:RED},
          {l:"DIVIDENDOS", v:`FS$${fsMovimentado.dividendos.toFixed(2)}`,              c:GREEN},
          {l:"TAXAS COBRADAS",v:`FS$${fsMovimentado.taxas.toFixed(2)}`,               c:ORANGE},
        ].map(s=><div key={s.l} style={{background:SURFACE,borderRadius:10,padding:"10px"}}>
          <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginBottom:3}}>{s.l}</div>
          <div style={{fontSize:13,fontWeight:800,color:s.c,fontFamily:MONO,lineHeight:1}}>{s.v}</div>
        </div>)}
      </div>
      <div style={{display:"flex",gap:8}}>
        <div style={{flex:1,background:SURFACE,borderRadius:10,padding:"10px"}}>
          <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginBottom:3}}>ATIVO MAIS NEGOCIADO</div>
          <div style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:SANS}}>{fsMovimentado.topAtivo.ticker}</div>
          <div style={{fontSize:9,color:MUTED,fontFamily:MONO}}>{fsMovimentado.topAtivo.vol.toLocaleString("pt-BR")} cotas</div>
        </div>
        <div style={{flex:1,background:SURFACE,borderRadius:10,padding:"10px"}}>
          <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginBottom:3}}>MAIOR P&L DO MÊS</div>
          <div style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:SANS}}>{fsMovimentado.maisPnl.nome}</div>
          <div style={{fontSize:9,color:GREEN,fontFamily:MONO}}>+FS${fsMovimentado.maisPnl.pnl.toFixed(2)}</div>
        </div>
      </div>
    </div>
  </div>;
}


/* ══════════════════════════════════════════════════════════════════
   MÓDULO 5 — MODERAÇÃO
══════════════════════════════════════════════════════════════════ */
function ModeracaoModule(){
  const [posts,setPosts]=useState(MOCK_POSTS_INIT.map(p=>({...p})));
  const [blockedWords,setBlockedWords]=useState([...BLOCKED_WORDS_INIT]);
  const [newWord,setNewWord]=useState("");
  const [subTab,setSubTab]=useState("fila");
  const [filterStatus,setFilterStatus]=useState("flagged");

  const flagged=posts.filter(p=>p.status==="flagged");
  const filtered=filterStatus==="todos"?posts:posts.filter(p=>p.status===filterStatus);

  const action=(id,act)=>setPosts(prev=>prev.map(p=>p.id===id?{...p,status:act}:p));

  const addWord=()=>{
    const w=newWord.trim().toLowerCase();
    if(!w||blockedWords.includes(w)) return;
    setBlockedWords(p=>[...p,w]);
    setNewWord("");
  };

  const checkAutoFlag=(text)=>blockedWords.some(w=>text.toLowerCase().includes(w));

  const fmtTs=ts=>{const d=new Date(ts);return d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});};

  return <div>
    <SectionHeader title="Moderação" sub={`${flagged.length} posts aguardando revisão`}/>
    <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
      {["fila","todos","filtros"].map(t=>(
        <button key={t} onClick={()=>setSubTab(t)} style={{
          padding:"6px 14px",borderRadius:10,border:"none",cursor:"pointer",
          background:subTab===t?ACCENT:SURFACE,color:subTab===t?BG:"#fff",
          fontSize:10,fontWeight:800,fontFamily:SANS,transition:"all .15s"
        }}>
          {t==="fila"?`Fila de Revisão (${flagged.length})`:t==="todos"?"Todos os Posts":"Filtros Automáticos"}
        </button>
      ))}
    </div>

    {/* ── SUB: Fila de revisão ── */}
    {subTab==="fila"&&<>
      {flagged.length===0
        ?<div style={{textAlign:"center",padding:"40px 0",color:MUTED,fontSize:12,fontFamily:SANS}}>✓ Nenhum post pendente</div>
        :flagged.map(p=>{
          const autoFlag=checkAutoFlag(p.text);
          return <div key={p.id} style={{background:CARD,border:"1.5px solid rgba(245,166,35,.3)",borderRadius:14,padding:"14px",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <div style={{width:28,height:28,borderRadius:8,background:GRAD_ACCENT,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:"#fff",flexShrink:0}}>
                {p.author.split(" ").slice(0,2).map(w=>w[0]).join("")}
              </div>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:11,fontWeight:700,color:"#fff",fontFamily:SANS}}>{p.author}</span>
                  <Badge children={p.plan}  color={p.plan==="Lenda"?GOLD:p.plan==="Craque"?ACCENT:MUTED}/>
                  {p.ticker&&<Badge children={p.ticker} color={ACCENT2}/>}
                  {autoFlag&&<Badge children="🤖 AUTO" color={ORANGE} bg="rgba(249,115,22,.15)"/>}
                </div>
                <div style={{fontSize:8,color:MUTED,fontFamily:SANS}}>{fmtTs(p.ts)} · {p.flags} denúncia{p.flags!==1?"s":""}</div>
              </div>
            </div>
            <div style={{background:SURFACE,borderRadius:10,padding:"10px 12px",marginBottom:10,fontSize:12,color:TEXT,fontFamily:SANS,lineHeight:1.5}}>
              {p.text}
            </div>
            <div style={{display:"flex",gap:6}}>
              <Btn onClick={()=>action(p.id,"ok")} color={GREEN} small>✓ Aprovar</Btn>
              <Btn onClick={()=>action(p.id,"hidden")} color={ORANGE} variant="outline" small>👁 Ocultar</Btn>
              <Btn onClick={()=>action(p.id,"deleted")} color={RED} variant="outline" small>🗑 Excluir</Btn>
            </div>
          </div>;
        })
      }
    </>}

    {/* ── SUB: Todos os posts ── */}
    {subTab==="todos"&&<>
      <div style={{display:"flex",gap:5,marginBottom:12,flexWrap:"wrap"}}>
        {["todos","ok","flagged","hidden","deleted"].map(s=>(
          <button key={s} onClick={()=>setFilterStatus(s)} style={{padding:"4px 10px",borderRadius:8,border:"none",cursor:"pointer",
            background:filterStatus===s?ACCENT:SURFACE,color:filterStatus===s?BG:MUTED,fontSize:9,fontWeight:800,fontFamily:SANS}}>
            {s==="todos"?"Todos":s==="ok"?"Aprovados":s==="flagged"?"Suspeitos":s==="hidden"?"Ocultos":"Excluídos"}
          </button>
        ))}
      </div>
      {filtered.map(p=>{
        const statusColor={ok:GREEN,flagged:ORANGE,hidden:MUTED,deleted:RED};
        const statusLabel={ok:"OK",flagged:"SUSPEITO",hidden:"OCULTO",deleted:"EXCLUÍDO"};
        return <div key={p.id} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"12px",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <span style={{fontSize:10,fontWeight:700,color:"#fff",fontFamily:SANS}}>{p.author}</span>
            <Badge children={p.plan} color={p.plan==="Lenda"?GOLD:p.plan==="Craque"?ACCENT:MUTED}/>
            {p.ticker&&<Badge children={p.ticker} color={ACCENT2}/>}
            <div style={{marginLeft:"auto"}}><Badge children={statusLabel[p.status]} color={statusColor[p.status]}/></div>
          </div>
          <div style={{fontSize:11,color:p.status==="deleted"?"rgba(255,255,255,.3)":TEXT,fontFamily:SANS,marginBottom:8,fontStyle:p.status==="deleted"?"italic":"normal"}}>{p.text}</div>
          {p.status!=="deleted"&&<div style={{display:"flex",gap:5}}>
            {p.status!=="ok"&&<Btn onClick={()=>action(p.id,"ok")} color={GREEN} small>Aprovar</Btn>}
            {p.status!=="hidden"&&<Btn onClick={()=>action(p.id,"hidden")} color={ORANGE} variant="outline" small>Ocultar</Btn>}
            {p.status!=="deleted"&&<Btn onClick={()=>action(p.id,"deleted")} color={RED} variant="outline" small>Excluir</Btn>}
          </div>}
        </div>;
      })}
    </>}

    {/* ── SUB: Filtros automáticos ── */}
    {subTab==="filtros"&&<>
      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"16px",marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:800,color:"#fff",fontFamily:SANS,marginBottom:4}}>Palavras Bloqueadas</div>
        <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginBottom:14}}>Posts com estas palavras são automaticamente marcados como suspeitos</div>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          <input value={newWord} onChange={e=>setNewWord(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&addWord()}
            placeholder="Adicionar palavra..."
            style={{flex:1,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:"8px 12px",color:TEXT,fontSize:12,fontFamily:MONO,outline:"none"}}/>
          <Btn onClick={addWord} color={GREEN} small>+ Adicionar</Btn>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {blockedWords.map(w=><div key={w} style={{background:"rgba(244,63,94,.1)",border:"1px solid rgba(244,63,94,.3)",borderRadius:8,padding:"3px 10px",display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:11,color:RED,fontFamily:MONO}}>{w}</span>
            <button onClick={()=>setBlockedWords(p=>p.filter(x=>x!==w))} style={{background:"none",border:"none",color:"rgba(244,63,94,.6)",cursor:"pointer",fontSize:13,padding:0,lineHeight:1}}>×</button>
          </div>)}
        </div>
      </div>
      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"16px"}}>
        <div style={{fontSize:11,fontWeight:800,color:"#fff",fontFamily:SANS,marginBottom:14}}>Regras Automáticas Ativas</div>
        {[
          {rule:"Dados pessoais (CPF, telefone, senha)",active:true,color:RED},
          {rule:"Promessas de retorno garantido (>100%)",active:true,color:ORANGE},
          {rule:"Links externos suspeitos",active:true,color:ORANGE},
          {rule:"Repetição de mensagens (>3× iguais)",active:true,color:MUTED},
          {rule:"Usuário novo (<24h) com link",active:false,color:MUTED},
        ].map((r,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${BORDER}`}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:r.active?r.color:BORDER,flexShrink:0}}/>
          <span style={{flex:1,fontSize:11,color:r.active?"#fff":MUTED,fontFamily:SANS}}>{r.rule}</span>
          <Badge children={r.active?"ATIVO":"INATIVO"} color={r.active?r.color:MUTED}/>
        </div>)}
      </div>
    </>}
  </div>;
}

/* ══════════════════════════════════════════════════════════════════
   MÓDULO 6 — PATROCINADORES
══════════════════════════════════════════════════════════════════ */

const BANNER_POSITIONS=[
  {id:"home_top",   label:"Home — topo",         desc:"Acima do feed principal",      w:360,h:80},
  {id:"home_mid",   label:"Home — meio",          desc:"Entre notícias do feed",       w:360,h:60},
  {id:"market_top", label:"Mercado — topo",       desc:"Acima da lista de ativos",     w:360,h:60},
  {id:"cart_top",   label:"Carteira — topo",      desc:"Acima das posições abertas",   w:360,h:60},
  {id:"detail_bot", label:"Detalhe ativo — rodapé",desc:"Abaixo dos fundamentos",     w:360,h:80},
];

const LIGAS_MOCK_INIT=[
  {id:"l001",nome:"Copa FootStock Pro",patrocinador:"Mercado Pago",premio:"FS$10.000",inicio:"2026-04-01",fim:"2026-04-30",maxJogadores:50,inscritos:34,status:"ativa",    planoMinimo:"Craque",cor:"#6c63ff",descricao:"Liga mensal oficial com premiação em saldo FS."},
  {id:"l002",nome:"Desafio Red Bull",   patrocinador:"Red Bull",     premio:"FS$5.000", inicio:"2026-03-15",fim:"2026-03-31",maxJogadores:30,inscritos:28,status:"encerrada",planoMinimo:"Jogador",cor:"#CC0000",descricao:"Liga relâmpago patrocinada pela Red Bull."},
  {id:"l003",nome:"Liga Lenda Exclusiva",patrocinador:"PagSeguro",  premio:"FS$25.000",inicio:"2026-05-01",fim:"2026-05-31",maxJogadores:20,inscritos:7, status:"agendada", planoMinimo:"Lenda",  cor:"#f59e0b",descricao:"Liga exclusiva para usuários Lenda com grande premiação."},
];

const BANNERS_MOCK_INIT=[
  {id:"b001",titulo:"Mercado Pago — Pague em dia",patrocinador:"Mercado Pago",posicao:"home_top",   ativo:true, cliques:1240,impressoes:18400,inicio:"2026-03-01",fim:"2026-03-31",cor:"#00B1EA",cta:"Saiba mais",url:"#"},
  {id:"b002",titulo:"Red Bull te dá asas",        patrocinador:"Red Bull",    posicao:"market_top", ativo:true, cliques:890, impressoes:12300,inicio:"2026-03-01",fim:"2026-03-31",cor:"#CC0000",cta:"Conheça",  url:"#"},
  {id:"b003",titulo:"PagSeguro — Segurança total", patrocinador:"PagSeguro",  posicao:"cart_top",   ativo:false,cliques:320, impressoes:5100, inicio:"2026-02-01",fim:"2026-02-28",cor:"#f97316",cta:"Ver oferta",url:"#"},
];

const BLANK_BANNER={titulo:"",patrocinador:"",posicao:"home_top",ativo:true,cor:"#6c63ff",cta:"Saiba mais",url:"",inicio:"",fim:""};
const BLANK_LIGA  ={nome:"",patrocinador:"",premio:"",inicio:"",fim:"",maxJogadores:50,planoMinimo:"Craque",cor:"#6c63ff",descricao:""};

function ColorPicker({value,onChange}){
  const presets=["#6c63ff","#38bdf8","#22c55e","#f59e0b","#f43f5e","#f97316","#a78bfa","#00B1EA","#CC0000","#003087"];
  return <div>
    <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
      {presets.map(c=><button key={c} onClick={()=>onChange(c)} style={{width:24,height:24,borderRadius:6,background:c,border:`2px solid ${value===c?"#fff":"transparent"}`,cursor:"pointer",transition:"border .1s"}}/>)}
    </div>
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <input type="color" value={value} onChange={e=>onChange(e.target.value)}
        style={{width:32,height:32,borderRadius:8,border:"none",cursor:"pointer",background:"none",padding:0}}/>
      <input value={value} onChange={e=>onChange(e.target.value)}
        style={{flex:1,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:8,padding:"6px 10px",color:TEXT,fontSize:12,fontFamily:MONO,outline:"none"}}/>
      <div style={{width:32,height:32,borderRadius:8,background:value,border:`1px solid ${BORDER}`,flexShrink:0}}/>
    </div>
  </div>;
}

function BannerPreview({banner}){
  const pos=BANNER_POSITIONS.find(p=>p.id===banner.posicao)||BANNER_POSITIONS[0];
  return <div style={{background:BG,borderRadius:12,padding:12,border:`1px solid ${BORDER}`,marginBottom:12}}>
    <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginBottom:8,letterSpacing:"0.5px"}}>PREVIEW — {pos.label} ({pos.w}×{pos.h}px)</div>
    <div style={{
      width:"100%",height:pos.h,borderRadius:10,
      background:`linear-gradient(135deg,${banner.cor}22,${banner.cor}11)`,
      border:`1.5px solid ${banner.cor}55`,
      display:"flex",alignItems:"center",justifyContent:"space-between",
      padding:"0 14px",boxSizing:"border-box",overflow:"hidden"
    }}>
      <div>
        <div style={{fontSize:11,fontWeight:800,color:"#fff",fontFamily:SANS,lineHeight:1.2}}>{banner.titulo||"Título do banner"}</div>
        {pos.h>=80&&<div style={{fontSize:9,color:"rgba(255,255,255,.6)",fontFamily:SANS,marginTop:2}}>{banner.patrocinador||"Patrocinador"}</div>}
      </div>
      <div style={{background:banner.cor,borderRadius:8,padding:"5px 12px",fontSize:9,fontWeight:800,color:"#fff",fontFamily:SANS,flexShrink:0}}>
        {banner.cta||"Saiba mais"}
      </div>
    </div>
  </div>;
}

function PatrocinadoresModule(){
  const [subTab,setSubTab]=useState("banners");
  const [banners,setBanners]=useState(BANNERS_MOCK_INIT.map(b=>({...b})));
  const [ligas,setLigas]=useState(LIGAS_MOCK_INIT.map(l=>({...l})));

  // Banner state
  const [editBanner,setEditBanner]=useState(null); // null=lista, "new"=novo, id=editar
  const [bannerForm,setBannerForm]=useState({...BLANK_BANNER});
  const [bannerConfirmDel,setBannerConfirmDel]=useState(null);

  // Liga state
  const [editLiga,setEditLiga]=useState(null);
  const [ligaForm,setLigaForm]=useState({...BLANK_LIGA});
  const [ligaConfirmDel,setLigaConfirmDel]=useState(null);

  const bf=v=>setBannerForm(p=>({...p,...v}));
  const lf=v=>setLigaForm(p=>({...p,...v}));

  const saveBanner=()=>{
    if(editBanner==="new"){
      setBanners(p=>[...p,{...bannerForm,id:`b${Date.now()}`,cliques:0,impressoes:0,ativo:true}]);
    } else {
      setBanners(p=>p.map(b=>b.id===editBanner?{...b,...bannerForm}:b));
    }
    setEditBanner(null);
    setBannerForm({...BLANK_BANNER});
  };

  const deleteBanner=id=>{setBanners(p=>p.filter(b=>b.id!==id));setBannerConfirmDel(null);};
  const toggleBanner=id=>setBanners(p=>p.map(b=>b.id===id?{...b,ativo:!b.ativo}:b));

  const openEditBanner=(b)=>{setEditBanner(b.id);setBannerForm({...b});};

  const saveLiga=()=>{
    if(editLiga==="new"){
      setLigas(p=>[...p,{...ligaForm,id:`l${Date.now()}`,inscritos:0,status:"agendada"}]);
    } else {
      setLigas(p=>p.map(l=>l.id===editLiga?{...l,...ligaForm}:l));
    }
    setEditLiga(null);
    setLigaForm({...BLANK_LIGA});
  };

  const deleteLiga=id=>{setLigas(p=>p.filter(l=>l.id!==id));setLigaConfirmDel(null);};
  const openEditLiga=(l)=>{setEditLiga(l.id);setLigaForm({...l});};

  const statusColor={ativa:GREEN,encerrada:MUTED,agendada:ACCENT2};
  const planColor={Jogador:MUTED,Craque:ACCENT,Lenda:GOLD};

  return <div>
    <SectionHeader title="Patrocinadores" sub="Banners de publicidade e ligas patrocinadas"/>

    {/* Sub-tabs */}
    <div style={{display:"flex",gap:6,marginBottom:20}}>
      {[{id:"banners",label:"Banners de Publicidade"},{id:"ligas",label:"Ligas Patrocinadas"}].map(t=>(
        <button key={t.id} onClick={()=>{setSubTab(t.id);setEditBanner(null);setEditLiga(null);}} style={{
          padding:"8px 18px",borderRadius:10,border:"none",cursor:"pointer",
          background:subTab===t.id?ACCENT:SURFACE,color:subTab===t.id?BG:"#fff",
          fontSize:11,fontWeight:800,fontFamily:SANS,transition:"all .15s"
        }}>{t.label}</button>
      ))}
    </div>

    {/* ══ ABA BANNERS ══════════════════════════════════════════════════════ */}
    {subTab==="banners"&&<>
      {editBanner?<>
        {/* ── Formulário de banner ── */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <span style={{fontSize:13,fontWeight:800,color:"#fff",fontFamily:SANS}}>
            {editBanner==="new"?"Novo Banner":"Editar Banner"}
          </span>
          <Btn onClick={()=>{setEditBanner(null);setBannerForm({...BLANK_BANNER});}} color={MUTED} variant="outline" small>✕ Cancelar</Btn>
        </div>

        <BannerPreview banner={bannerForm}/>

        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"16px",marginBottom:12}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <Input label="TÍTULO DO BANNER" value={bannerForm.titulo} onChange={v=>bf({titulo:v})} placeholder="ex: Mercado Pago — Pague em dia"/>
            <Input label="PATROCINADOR" value={bannerForm.patrocinador} onChange={v=>bf({patrocinador:v})} placeholder="ex: Mercado Pago"/>
            <Input label="URL DE DESTINO" value={bannerForm.url} onChange={v=>bf({url:v})} placeholder="https://..."/>
            <Input label="TEXTO DO BOTÃO (CTA)" value={bannerForm.cta} onChange={v=>bf({cta:v})} placeholder="ex: Saiba mais"/>
            <Input label="DATA INÍCIO" type="date" value={bannerForm.inicio} onChange={v=>bf({inicio:v})}/>
            <Input label="DATA FIM" type="date" value={bannerForm.fim} onChange={v=>bf({fim:v})}/>
          </div>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,color:MUTED,fontWeight:700,fontFamily:SANS,marginBottom:5,letterSpacing:"0.5px"}}>POSIÇÃO NO APP</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {BANNER_POSITIONS.map(pos=><label key={pos.id} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"8px 10px",background:bannerForm.posicao===pos.id?`${ACCENT}12`:SURFACE,borderRadius:9,border:`1px solid ${bannerForm.posicao===pos.id?ACCENT:BORDER}`}}>
                <input type="radio" name="posicao" value={pos.id} checked={bannerForm.posicao===pos.id} onChange={()=>bf({posicao:pos.id})}
                  style={{accentColor:ACCENT,width:14,height:14,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#fff",fontFamily:SANS}}>{pos.label}</div>
                  <div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>{pos.desc} · {pos.w}×{pos.h}px</div>
                </div>
              </label>)}
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,color:MUTED,fontWeight:700,fontFamily:SANS,marginBottom:8,letterSpacing:"0.5px"}}>COR DO BANNER</div>
            <ColorPicker value={bannerForm.cor} onChange={v=>bf({cor:v})}/>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginBottom:16}}>
            <input type="checkbox" checked={bannerForm.ativo} onChange={e=>bf({ativo:e.target.checked})}
              style={{accentColor:ACCENT,width:16,height:16}}/>
            <span style={{fontSize:12,color:"#fff",fontFamily:SANS}}>Ativar banner imediatamente</span>
          </label>
          <Btn onClick={saveBanner} color={GREEN} disabled={!bannerForm.titulo||!bannerForm.patrocinador}>
            💾 {editBanner==="new"?"Criar Banner":"Salvar alterações"}
          </Btn>
        </div>
      </>:<>
        {/* ── Lista de banners ── */}
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
          <Btn onClick={()=>{setEditBanner("new");setBannerForm({...BLANK_BANNER});}} color={ACCENT}>+ Novo Banner</Btn>
        </div>

        {/* Resumo de slots */}
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"12px 16px",marginBottom:14}}>
          <div style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:"0.8px",fontFamily:SANS,marginBottom:10}}>SLOTS DE POSIÇÃO</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {BANNER_POSITIONS.map(pos=>{
              const activeBanner=banners.find(b=>b.posicao===pos.id&&b.ativo);
              return <div key={pos.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 10px",background:SURFACE,borderRadius:9}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"#fff",fontFamily:SANS}}>{pos.label}</div>
                  <div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>{pos.w}×{pos.h}px</div>
                </div>
                {activeBanner
                  ?<Badge children={activeBanner.patrocinador} color={activeBanner.cor} bg={`${activeBanner.cor}20`}/>
                  :<Badge children="DISPONÍVEL" color={GREEN} bg="rgba(34,197,94,.1)"/>
                }
              </div>;
            })}
          </div>
        </div>

        {/* Cards de banners */}
        {banners.length===0
          ?<div style={{textAlign:"center",padding:"40px 0",color:MUTED,fontSize:12,fontFamily:SANS}}>Nenhum banner cadastrado</div>
          :banners.map(b=>{
            const pos=BANNER_POSITIONS.find(p=>p.id===b.posicao);
            const ctr=b.impressoes>0?((b.cliques/b.impressoes)*100).toFixed(1):0;
            return <div key={b.id} style={{background:CARD,border:`1.5px solid ${b.ativo?b.cor+"55":BORDER}`,borderRadius:14,padding:"14px",marginBottom:10}}>
              {/* Header */}
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <div style={{width:36,height:36,borderRadius:10,background:`${b.cor}22`,border:`1px solid ${b.cor}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <div style={{width:16,height:8,borderRadius:3,background:b.cor}}/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#fff",fontFamily:SANS,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.titulo}</div>
                  <div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>{b.patrocinador} · {pos?.label}</div>
                </div>
                <Badge children={b.ativo?"● ATIVO":"INATIVO"} color={b.ativo?GREEN:MUTED}/>
              </div>
              {/* Métricas */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:10}}>
                {[{l:"IMPRESSÕES",v:b.impressoes.toLocaleString("pt-BR")},{l:"CLIQUES",v:b.cliques.toLocaleString("pt-BR")},{l:"CTR",v:`${ctr}%`}].map(s=>
                  <div key={s.l} style={{background:SURFACE,borderRadius:8,padding:"7px 8px",textAlign:"center"}}>
                    <div style={{fontSize:8,color:MUTED,fontFamily:SANS}}>{s.l}</div>
                    <div style={{fontSize:13,fontWeight:800,color:"#fff",fontFamily:MONO}}>{s.v}</div>
                  </div>
                )}
              </div>
              <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginBottom:10}}>{b.inicio} → {b.fim}</div>
              {/* Ações */}
              <div style={{display:"flex",gap:6}}>
                <Btn onClick={()=>openEditBanner(b)} color={ACCENT} variant="outline" small>✎ Editar</Btn>
                <Btn onClick={()=>toggleBanner(b.id)} color={b.ativo?ORANGE:GREEN} variant="outline" small>{b.ativo?"Desativar":"Ativar"}</Btn>
                <Btn onClick={()=>setBannerConfirmDel(b.id)} color={RED} variant="outline" small>🗑 Excluir</Btn>
              </div>
            </div>;
          })
        }
      </>}
    </>}

    {/* ══ ABA LIGAS ════════════════════════════════════════════════════════ */}
    {subTab==="ligas"&&<>
      {editLiga?<>
        {/* ── Formulário de liga ── */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <span style={{fontSize:13,fontWeight:800,color:"#fff",fontFamily:SANS}}>
            {editLiga==="new"?"Nova Liga Patrocinada":"Editar Liga"}
          </span>
          <Btn onClick={()=>{setEditLiga(null);setLigaForm({...BLANK_LIGA});}} color={MUTED} variant="outline" small>✕ Cancelar</Btn>
        </div>

        {/* Preview da liga */}
        <div style={{background:`${ligaForm.cor||ACCENT}12`,border:`1.5px solid ${ligaForm.cor||ACCENT}44`,borderRadius:14,padding:"16px",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
            <div style={{width:44,height:44,borderRadius:14,background:`${ligaForm.cor||ACCENT}33`,border:`1px solid ${ligaForm.cor||ACCENT}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🏆</div>
            <div>
              <div style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:SANS}}>{ligaForm.nome||"Nome da liga"}</div>
              <div style={{fontSize:10,color:MUTED,fontFamily:SANS}}>Patrocinada por {ligaForm.patrocinador||"—"}</div>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <Badge children={`Prêmio ${ligaForm.premio||"—"}`} color={ligaForm.cor||ACCENT}/>
            <Badge children={`Mín. ${ligaForm.planoMinimo}`} color={planColor[ligaForm.planoMinimo]||MUTED}/>
            <Badge children={`Até ${ligaForm.maxJogadores} jogadores`} color={MUTED}/>
          </div>
        </div>

        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"16px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <Input label="NOME DA LIGA" value={ligaForm.nome} onChange={v=>lf({nome:v})} placeholder="ex: Copa FootStock Pro"/>
            <Input label="PATROCINADOR" value={ligaForm.patrocinador} onChange={v=>lf({patrocinador:v})} placeholder="ex: Red Bull"/>
            <Input label="PRÊMIO" value={ligaForm.premio} onChange={v=>lf({premio:v})} placeholder="ex: FS$10.000"/>
            <Input label="MÁX. JOGADORES" type="number" value={ligaForm.maxJogadores} onChange={v=>lf({maxJogadores:parseInt(v)||0})} min="2" max="1000"/>
            <Input label="DATA INÍCIO" type="date" value={ligaForm.inicio} onChange={v=>lf({inicio:v})}/>
            <Input label="DATA FIM" type="date" value={ligaForm.fim} onChange={v=>lf({fim:v})}/>
          </div>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,color:MUTED,fontWeight:700,fontFamily:SANS,marginBottom:8,letterSpacing:"0.5px"}}>PLANO MÍNIMO PARA PARTICIPAR</div>
            <div style={{display:"flex",gap:6}}>
              {["Jogador","Craque","Lenda"].map(pl=><button key={pl} onClick={()=>lf({planoMinimo:pl})} style={{
                flex:1,padding:"8px",borderRadius:9,border:`1px solid ${ligaForm.planoMinimo===pl?planColor[pl]:BORDER}`,cursor:"pointer",
                background:ligaForm.planoMinimo===pl?`${planColor[pl]}15`:SURFACE,
                color:ligaForm.planoMinimo===pl?planColor[pl]:"#fff",fontSize:11,fontWeight:700,fontFamily:SANS
              }}>{pl}</button>)}
            </div>
          </div>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,color:MUTED,fontWeight:700,fontFamily:SANS,marginBottom:5,letterSpacing:"0.5px"}}>DESCRIÇÃO</div>
            <textarea value={ligaForm.descricao} onChange={e=>lf({descricao:e.target.value})} rows={3}
              placeholder="Descreva as regras e objetivos da liga..."
              style={{width:"100%",background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:"9px 13px",
                color:TEXT,fontSize:12,fontFamily:SANS,outline:"none",resize:"vertical",boxSizing:"border-box"}}/>
          </div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:10,color:MUTED,fontWeight:700,fontFamily:SANS,marginBottom:8,letterSpacing:"0.5px"}}>COR DA LIGA</div>
            <ColorPicker value={ligaForm.cor||ACCENT} onChange={v=>lf({cor:v})}/>
          </div>
          <Btn onClick={saveLiga} color={GREEN} disabled={!ligaForm.nome||!ligaForm.patrocinador||!ligaForm.inicio||!ligaForm.fim}>
            💾 {editLiga==="new"?"Criar Liga":"Salvar alterações"}
          </Btn>
        </div>
      </>:<>
        {/* ── Lista de ligas ── */}
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
          <Btn onClick={()=>{setEditLiga("new");setLigaForm({...BLANK_LIGA});}} color={ACCENT}>+ Nova Liga</Btn>
        </div>

        {/* Resumo */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
          {[
            {l:"TOTAL",     v:ligas.length,                              c:"#fff"},
            {l:"ATIVAS",    v:ligas.filter(l=>l.status==="ativa").length,    c:GREEN},
            {l:"AGENDADAS", v:ligas.filter(l=>l.status==="agendada").length, c:ACCENT2},
          ].map(s=><div key={s.l} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"12px",textAlign:"center"}}>
            <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginBottom:4}}>{s.l}</div>
            <div style={{fontSize:22,fontWeight:800,color:s.c,fontFamily:MONO}}>{s.v}</div>
          </div>)}
        </div>

        {/* Cards de ligas */}
        {ligas.length===0
          ?<div style={{textAlign:"center",padding:"40px 0",color:MUTED,fontSize:12,fontFamily:SANS}}>Nenhuma liga cadastrada</div>
          :ligas.map(l=>{
            const ocupPct=l.maxJogadores>0?Math.round(l.inscritos/l.maxJogadores*100):0;
            return <div key={l.id} style={{background:CARD,border:`1.5px solid ${l.cor}44`,borderRadius:14,padding:"14px",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:10}}>
                <div style={{width:40,height:40,borderRadius:12,background:`${l.cor}22`,border:`1px solid ${l.cor}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>🏆</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
                    <span style={{fontSize:12,fontWeight:800,color:"#fff",fontFamily:SANS}}>{l.nome}</span>
                    <Badge children={l.status.toUpperCase()} color={statusColor[l.status]}/>
                    <Badge children={l.planoMinimo} color={planColor[l.planoMinimo]}/>
                  </div>
                  <div style={{fontSize:10,color:MUTED,fontFamily:SANS}}>Patrocinada por <span style={{color:"#fff"}}>{l.patrocinador}</span> · Prêmio: <span style={{color:GREEN,fontWeight:700}}>{l.premio}</span></div>
                  <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginTop:2}}>{l.inicio} → {l.fim}</div>
                </div>
              </div>
              {/* Ocupação */}
              <div style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:9,color:MUTED,fontFamily:SANS}}>Inscritos</span>
                  <span style={{fontSize:9,fontWeight:700,color:ocupPct>=90?RED:ocupPct>=70?ORANGE:"#fff",fontFamily:MONO}}>{l.inscritos}/{l.maxJogadores} ({ocupPct}%)</span>
                </div>
                <div style={{height:5,borderRadius:3,background:BORDER,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${ocupPct}%`,background:ocupPct>=90?RED:l.cor,borderRadius:3,transition:"width .5s"}}/>
                </div>
              </div>
              {l.descricao&&<div style={{fontSize:10,color:MUTED,fontFamily:SANS,marginBottom:10,lineHeight:1.5}}>{l.descricao}</div>}
              {/* Ações */}
              <div style={{display:"flex",gap:6}}>
                <Btn onClick={()=>openEditLiga(l)} color={ACCENT} variant="outline" small>✎ Editar</Btn>
                {l.status==="agendada"&&<Btn onClick={()=>setLigas(p=>p.map(x=>x.id===l.id?{...x,status:"ativa"}:x))} color={GREEN} variant="outline" small>▶ Ativar</Btn>}
                {l.status==="ativa"   &&<Btn onClick={()=>setLigas(p=>p.map(x=>x.id===l.id?{...x,status:"encerrada"}:x))} color={MUTED} variant="outline" small>⏹ Encerrar</Btn>}
                <Btn onClick={()=>setLigaConfirmDel(l.id)} color={RED} variant="outline" small>🗑 Excluir</Btn>
              </div>
            </div>;
          })
        }
      </>}
    </>}

    {/* ── Confirmações de exclusão ── */}
    {(bannerConfirmDel||ligaConfirmDel)&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 20px"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:CARD,border:`1px solid rgba(244,63,94,.4)`,borderRadius:20,padding:"24px",maxWidth:340,width:"100%"}}>
        <div style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:SANS,marginBottom:8}}>Confirmar exclusão</div>
        <div style={{fontSize:12,color:MUTED,fontFamily:SANS,marginBottom:20}}>
          {bannerConfirmDel?"Esta ação é irreversível. O banner será removido permanentemente.":"Esta ação é irreversível. A liga e todos os seus dados serão removidos."}
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={()=>{setBannerConfirmDel(null);setLigaConfirmDel(null);}} color={MUTED} variant="outline">Cancelar</Btn>
          <Btn onClick={()=>bannerConfirmDel?deleteBanner(bannerConfirmDel):deleteLiga(ligaConfirmDel)} color={RED}>Excluir</Btn>
        </div>
      </div>
    </div>}
  </div>;
}

/* ══════════════════════════════════════════════════════════════════
   COMPONENTES VISUAIS — espelho do FootStockApp
══════════════════════════════════════════════════════════════════ */

function FootStockLogo({size=32,rounded=true,style={}}){
  const r=rounded?Math.round(size*0.22):0;
  return(
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{display:"block",flexShrink:0,...style}}>
      <defs>
        <radialGradient id="fsbg" cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#1c2230"/>
          <stop offset="100%" stopColor="#07090f"/>
        </radialGradient>
        <filter id="fsglow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.8" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <clipPath id="fsclip"><rect width="100" height="100" rx={r}/></clipPath>
      </defs>
      <rect width="100" height="100" rx={r} fill="url(#fsbg)"/>
      <g clipPath="url(#fsclip)">
        <polyline points="6,70 18,46 28,58 40,32 52,44" stroke="#1e2535" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <line x1="52" y1="44" x2="64" y2="22" stroke="#1e2535" strokeWidth="5" strokeLinecap="round"/>
        <polygon points="64,22 55,27 60,33" fill="#1e2535"/>
        <polyline points="6,75 18,52 28,64 42,38" stroke="#5dfc00" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" filter="url(#fsglow)"/>
        <line x1="42" y1="38" x2="70" y2="10" stroke="#5dfc00" strokeWidth="4" strokeLinecap="round" filter="url(#fsglow)"/>
        <polygon points="70,10 60,18 66,24" fill="#5dfc00" filter="url(#fsglow)"/>
        <circle cx="69" cy="20" r="5.5" fill="#5dfc00" filter="url(#fsglow)"/>
        <line x1="69" y1="26" x2="65" y2="48" stroke="#5dfc00" strokeWidth="4" strokeLinecap="round" filter="url(#fsglow)"/>
        <line x1="67" y1="32" x2="56" y2="24" stroke="#5dfc00" strokeWidth="3.2" strokeLinecap="round" filter="url(#fsglow)"/>
        <line x1="67" y1="34" x2="76" y2="42" stroke="#5dfc00" strokeWidth="3.2" strokeLinecap="round" filter="url(#fsglow)"/>
        <line x1="65" y1="48" x2="54" y2="60" stroke="#5dfc00" strokeWidth="3.8" strokeLinecap="round" filter="url(#fsglow)"/>
        <line x1="54" y1="60" x2="47" y2="68" stroke="#5dfc00" strokeWidth="3" strokeLinecap="round" filter="url(#fsglow)"/>
        <line x1="65" y1="48" x2="74" y2="57" stroke="#5dfc00" strokeWidth="3.8" strokeLinecap="round" filter="url(#fsglow)"/>
        <line x1="74" y1="57" x2="80" y2="51" stroke="#5dfc00" strokeWidth="3" strokeLinecap="round" filter="url(#fsglow)"/>
        <circle cx="55" cy="78" r="10" fill="#0d1120" stroke="#5dfc00" strokeWidth="2.5" filter="url(#fsglow)"/>
        <polygon points="55,70 59.8,73.5 58,79 52,79 50.2,73.5" fill="#5dfc00" opacity="0.9"/>
        <line x1="45.5" y1="75" x2="50.2" y2="73.5" stroke="#5dfc00" strokeWidth="1.5" opacity="0.6"/>
        <line x1="64.5" y1="75" x2="59.8" y2="73.5" stroke="#5dfc00" strokeWidth="1.5" opacity="0.6"/>
        <line x1="52" y1="87" x2="52" y2="79" stroke="#5dfc00" strokeWidth="1.5" opacity="0.6"/>
        <line x1="58" y1="87" x2="58" y2="79" stroke="#5dfc00" strokeWidth="1.5" opacity="0.6"/>
        <circle cx="82" cy="68" r="5.5" fill="#0d1120" stroke="#5dfc00" strokeWidth="2" opacity="0.75" filter="url(#fsglow)"/>
        <polygon points="82,63 84.6,65 83.8,68 80.2,68 79.4,65" fill="#5dfc00" opacity="0.6"/>
      </g>
    </svg>
  );
}

function StatusBar({time}){
  const h=time.getHours().toString().padStart(2,"0"),m=time.getMinutes().toString().padStart(2,"0");
  return <div style={{height:44,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",flexShrink:0}}>
    <span style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:SANS}}>{h}:{m}</span>
    <div style={{width:120,height:34,borderRadius:17,background:"#000",border:"2px solid #1a1a1a",flexShrink:0}}/>
    <div style={{display:"flex",alignItems:"center",gap:5}}>
      <svg width="16" height="11" viewBox="0 0 16 11"><rect x="0" y="4" width="3" height="7" fill="white" rx="0.5"/><rect x="4" y="2.5" width="3" height="8.5" fill="white" rx="0.5"/><rect x="8" y="1" width="3" height="10" fill="white" rx="0.5"/><rect x="12" y="0" width="3" height="11" fill="white" rx="0.5"/></svg>
      <div style={{display:"flex",alignItems:"center",gap:1}}><div style={{width:20,height:10,border:"1.5px solid white",borderRadius:2,padding:"1px",display:"flex",alignItems:"center"}}><div style={{width:"75%",height:"100%",background:"white",borderRadius:1}}/></div><div style={{width:2,height:5,background:"white",borderRadius:"0 1px 1px 0"}}/></div>
    </div>
  </div>;
}

function PhoneShell({children,time}){
  return <div style={{minHeight:"100vh",background:"#000",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px 0"}}>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes slideUp{from{opacity:0;transform:translateY(50px)}to{opacity:1;transform:translateY(0)}}@keyframes pls{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulseGlow{0%,100%{box-shadow:0 0 0 0 rgba(108,99,255,0.3)}50%{box-shadow:0 0 0 8px rgba(108,99,255,0)}}_::-webkit-scrollbar{width:0}*{-webkit-font-smoothing:antialiased}`}</style>
    <div style={{width:390,height:844,borderRadius:50,background:"#080b12",border:"10px solid #10141d",position:"relative",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 0 0 1px #1e2636,0 40px 100px rgba(0,0,0,.95),0 0 80px rgba(108,99,255,.06),inset 0 0 0 1px rgba(255,255,255,.04)"}}>
      <StatusBar time={time}/>
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",position:"relative"}}>{children}</div>
      <div style={{height:30,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><div style={{width:120,height:5,background:"rgba(255,255,255,.2)",borderRadius:3}}/></div>
    </div>
  </div>;
}

/* ══════════════════════════════════════════════════════════════════
   AUTENTICAÇÃO — Admin Login
   Credenciais espelhadas do FootStockApp (USERS_DB)
   Apenas usuários com role "admin" ou "monitor" têm acesso
══════════════════════════════════════════════════════════════════ */

// Espelho do USERS_DB do FootStockApp — apenas contas com acesso ao admin
// Em produção, substituir por chamada à API de autenticação
const ADMIN_USERS_DB=[
  {
    id:"admin",
    name:"Admin",
    email:"admin@footstock.com",
    password:"Master",
    role:"admin",
    plan:"Lenda",
    since:"Janeiro 2026",
  },
  {
    id:"rodrigo",
    name:"Rodrigo Lima",
    email:"rodrigo@footstock.com",
    password:"Lima",
    role:"monitor",
    plan:"Craque",
    since:"Fevereiro 2026",
  },
  {
    id:"ana",
    name:"Ana Costa",
    email:"ana@footstock.com",
    password:"AnaC",
    role:"editor",
    plan:"Craque",
    since:"Mar 2026",
  },
  {
    id:"marcos",
    name:"Marcos Viana",
    email:"marcos@footstock.com",
    password:"Marcos",
    role:"moderador",
    plan:"Jogador",
    since:"Mar 2026",
  },
];

// Tempo de inatividade antes de bloquear sessão (em ms) — 30 minutos
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/* ══════════════════════════════════════════════════════════════════
   WEBAUTHN — Biometria nativa iOS (Face ID / Touch ID) e Android
   Usa a Web Authentication API (FIDO2) disponível nos browsers
   modernos sem SDK nativo. Funciona em PWA e WebView.
   Chaves armazenadas no Secure Enclave / Android Keystore.
══════════════════════════════════════════════════════════════════ */

// Chave de storage para credenciais WebAuthn registradas
const BIOMETRIC_STORAGE_KEY = "footstock_admin_webauthn_v1";

// Verifica se o dispositivo suporta biometria via WebAuthn
async function checkBiometricSupport() {
  if(!window.PublicKeyCredential) return {supported:false,reason:"WebAuthn não disponível"};
  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if(!available) return {supported:false,reason:"Sensor biométrico não disponível neste dispositivo"};
    return {supported:true};
  } catch {
    return {supported:false,reason:"Erro ao verificar suporte biométrico"};
  }
}

// Converte string para ArrayBuffer (necessário para WebAuthn)
function strToBuffer(str) {
  return Uint8Array.from(str, c => c.charCodeAt(0)).buffer;
}

// Converte ArrayBuffer para base64url para armazenamento
function bufferToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}

function base64ToBuffer(b64) {
  const b = b64.replace(/-/g,"+").replace(/_/g,"/");
  return Uint8Array.from(atob(b), c => c.charCodeAt(0)).buffer;
}

// Registra biometria para um usuário (após login com senha)
async function registerBiometric(user) {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "FootStock Admin", id: window.location.hostname },
      user: {
        id:          strToBuffer(user.id),
        name:        user.email,
        displayName: user.name,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7  }, // ES256 (iOS Secure Enclave)
        { type: "public-key", alg: -257 }, // RS256 (Android Keystore)
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",   // biometria do dispositivo
        userVerification:        "required",   // exige biometria (não apenas presença)
        requireResidentKey:      false,
      },
      timeout: 60000,
    }
  });

  // Salva credencial no localStorage vinculada ao userId
  const stored = JSON.parse(localStorage.getItem(BIOMETRIC_STORAGE_KEY)||"{}");
  stored[user.id] = {
    credentialId: bufferToBase64(credential.rawId),
    userId:       user.id,
    registeredAt: new Date().toISOString(),
  };
  localStorage.setItem(BIOMETRIC_STORAGE_KEY, JSON.stringify(stored));
  return true;
}

// Autentica com biometria — retorna userId se sucesso, null se falha
async function authenticateBiometric() {
  const stored = JSON.parse(localStorage.getItem(BIOMETRIC_STORAGE_KEY)||"{}");
  const allowCredentials = Object.values(stored).map(c=>({
    id:         base64ToBuffer(c.credentialId),
    type:       "public-key",
    transports: ["internal"],
  }));
  if(allowCredentials.length === 0) return null;

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials,
      userVerification: "required",
      timeout: 60000,
    }
  });

  // Encontra qual usuário corresponde à credencial retornada
  const credId = bufferToBase64(assertion.rawId);
  const match = Object.values(stored).find(c => c.credentialId === credId);
  return match ? match.userId : null;
}

// Verifica se há biometria registrada para um usuário
function hasBiometricRegistered(userId) {
  const stored = JSON.parse(localStorage.getItem(BIOMETRIC_STORAGE_KEY)||"{}");
  return !!stored[userId];
}

// Remove biometria de um usuário
function removeBiometric(userId) {
  const stored = JSON.parse(localStorage.getItem(BIOMETRIC_STORAGE_KEY)||"{}");
  delete stored[userId];
  localStorage.setItem(BIOMETRIC_STORAGE_KEY, JSON.stringify(stored));
}

function AdminLoginScreen({onLogin}){
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [showPass,setShowPass]=useState(false);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [bioSupported,setBioSupported]=useState(false);
  const [bioRegistered,setBioRegistered]=useState(false);
  const [bioLoading,setBioLoading]=useState(false);
  const [showRegisterBio,setShowRegisterBio]=useState(false);
  const [lastLoginUser,setLastLoginUser]=useState(null);

  // Verifica suporte e registros biométricos ao montar
  useEffect(()=>{
    checkBiometricSupport().then(r=>{
      setBioSupported(r.supported);
      if(r.supported){
        // Verifica se algum usuário admin já tem biometria registrada
        const anyRegistered=ADMIN_USERS_DB.some(u=>hasBiometricRegistered(u.id));
        setBioRegistered(anyRegistered);
      }
    });
  },[]);

  const iS=(err,extra={})=>({width:"100%",background:"rgba(255,255,255,.05)",border:`1.5px solid ${err?"rgba(244,63,94,.5)":"rgba(255,255,255,.08)"}`,borderRadius:12,padding:"13px 16px",color:"#fff",fontSize:13,fontFamily:SANS,outline:"none",boxSizing:"border-box",caretColor:ACCENT,...extra});
  const lbl=(t)=><div style={{fontSize:9,color:"rgba(255,255,255,.45)",fontWeight:600,letterSpacing:"0.8px",fontFamily:SANS,marginBottom:5,textTransform:"uppercase"}}>{t}</div>;

  const handleLogin=()=>{
    if(!email.trim()||!pass){setError("Preencha e-mail e senha.");return;}
    setLoading(true);setError("");
    setTimeout(()=>{
      const found=ADMIN_USERS_DB.find(u=>u.email.toLowerCase()===email.trim().toLowerCase()&&u.password===pass);
      setLoading(false);
      if(!found){setError("E-mail ou senha inválidos.");return;}
      if(!["admin","monitor","editor","moderador"].includes(found.role)){setError("Esta conta não tem permissão de acesso ao painel administrativo.");return;}
      setLastLoginUser(found);
      // Sugere cadastro de biometria se suportado e não registrado
      if(bioSupported&&!hasBiometricRegistered(found.id)){
        setShowRegisterBio(true);
      } else {
        onLogin(found);
      }
    },600);
  };

  const handleBiometric=async()=>{
    setBioLoading(true);setError("");
    try {
      const userId=await authenticateBiometric();
      if(!userId){setError("Biometria não reconhecida.");setBioLoading(false);return;}
      const found=ADMIN_USERS_DB.find(u=>u.id===userId);
      if(!found){setError("Usuário não encontrado.");setBioLoading(false);return;}
      setBioLoading(false);
      onLogin(found);
    } catch(e) {
      setBioLoading(false);
      if(e.name==="NotAllowedError") setError("Biometria cancelada ou não reconhecida.");
      else setError("Erro na autenticação biométrica. Use e-mail e senha.");
    }
  };

  const handleRegisterBio=async()=>{
    if(!lastLoginUser) return;
    setBioLoading(true);
    try {
      await registerBiometric(lastLoginUser);
      setBioLoading(false);
      setBioRegistered(true);
      onLogin(lastLoginUser);
    } catch(e) {
      setBioLoading(false);
      onLogin(lastLoginUser); // login mesmo sem biometria
    }
  };

  // Modal de cadastro de biometria
  if(showRegisterBio) return <div style={{flex:1,display:"flex",flexDirection:"column",background:"#07090f",overflow:"hidden"}}>
    <div style={{position:"relative",overflow:"hidden",background:"linear-gradient(160deg,#0d1228 0%,#0e1219 55%,#080b12 100%)",padding:"28px 20px 26px",flexShrink:0}}>
      <div style={{position:"absolute",top:-50,right:-40,width:200,height:200,background:"radial-gradient(circle,rgba(108,99,255,.18) 0%,transparent 65%)",borderRadius:"50%",pointerEvents:"none"}}/>
      <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:.05,pointerEvents:"none"}} viewBox="0 0 360 190" preserveAspectRatio="none">
        {[32,64,96,128,160].map(y=><line key={y} x1="0" y1={y} x2="360" y2={y} stroke="#6c63ff" strokeWidth="0.6"/>)}
      </svg>
      <div style={{display:"flex",alignItems:"center",gap:11,marginBottom:22}}>
        <div style={{width:46,height:46,borderRadius:15,background:"linear-gradient(135deg,rgba(108,99,255,.18),rgba(56,189,248,.12))",border:"1px solid rgba(108,99,255,.3)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 28px rgba(108,99,255,.2)"}}>
          <FootStockLogo size={30} rounded={false}/>
        </div>
        <div>
          <div style={{fontSize:19,fontWeight:700,color:"#fff",letterSpacing:"-0.5px",fontFamily:SANS,lineHeight:1,display:"flex",alignItems:"baseline",gap:5}}>FootStock<span style={{fontSize:9,fontWeight:900,color:GOLD,letterSpacing:"2px",fontFamily:SANS}}>ADMIN</span></div>
          <div style={{fontSize:8,color:ACCENT,fontWeight:700,letterSpacing:"3px",marginTop:3,fontFamily:SANS}}>ATIVAR BIOMETRIA</div>
        </div>
      </div>
      <div style={{fontSize:11,color:"rgba(255,255,255,.38)",fontFamily:SANS,marginBottom:5}}>Login mais rápido</div>
      <div style={{fontSize:26,fontWeight:900,color:"#fff",letterSpacing:"-1.2px",fontFamily:SANS,lineHeight:1.05}}>
        Use sua<br/><span style={{background:"linear-gradient(90deg,#6c63ff,#38bdf8)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>biometria</span>
      </div>
    </div>
    <div style={{flex:1,overflowY:"auto",padding:"24px 20px 32px"}}>
      <div style={{textAlign:"center",marginBottom:28}}>
        <div style={{fontSize:64,marginBottom:16,lineHeight:1}}>
          {/iphone|ipad|ipod/i.test(navigator.userAgent)?"🔐":"👆"}
        </div>
        <div style={{fontSize:14,fontWeight:700,color:"#fff",fontFamily:SANS,marginBottom:8}}>
          {/iphone|ipad|ipod/i.test(navigator.userAgent)?"Face ID / Touch ID":"Impressão digital / Face"}
        </div>
        <div style={{fontSize:12,color:MUTED,fontFamily:SANS,lineHeight:1.7}}>
          Cadastre sua biometria para entrar no painel administrativo sem precisar digitar senha nas próximas vezes.
        </div>
      </div>
      <div style={{background:"rgba(108,99,255,.07)",border:"1px solid rgba(108,99,255,.2)",borderRadius:13,padding:"12px 14px",marginBottom:20}}>
        <div style={{fontSize:10,color:ACCENT,fontWeight:700,fontFamily:SANS,marginBottom:6}}>🔒 Como funciona</div>
        <div style={{fontSize:10,color:"rgba(255,255,255,.55)",fontFamily:SANS,lineHeight:1.7}}>
          Suas credenciais ficam protegidas no <span style={{color:"#fff",fontWeight:600}}>Secure Enclave</span> do dispositivo. Nenhum dado biométrico é enviado pela rede.
        </div>
      </div>
      <button onClick={handleRegisterBio} disabled={bioLoading} style={{
        width:"100%",padding:"15px",borderRadius:14,border:"none",cursor:"pointer",
        background:GRAD_ACCENT,color:"#fff",fontSize:14,fontWeight:800,fontFamily:SANS,
        boxShadow:"0 6px 24px rgba(108,99,255,.35)",marginBottom:12,opacity:bioLoading?.75:1
      }}>{bioLoading?"Aguardando biometria...":"✓ Ativar biometria"}</button>
      <button onClick={()=>onLogin(lastLoginUser)} style={{
        width:"100%",padding:"13px",borderRadius:14,border:`1px solid ${BORDER}`,
        background:"transparent",color:MUTED,fontSize:13,fontWeight:700,fontFamily:SANS,cursor:"pointer"
      }}>Agora não, entrar com senha</button>
    </div>
  </div>;

  return <div style={{flex:1,display:"flex",flexDirection:"column",background:"#07090f",overflow:"hidden"}}>
    {/* ── HERO HEADER ── */}
    <div style={{position:"relative",overflow:"hidden",background:"linear-gradient(160deg,#0d1228 0%,#0e1219 55%,#080b12 100%)",padding:"28px 20px 26px",flexShrink:0}}>
      <div style={{position:"absolute",top:-50,right:-40,width:200,height:200,background:"radial-gradient(circle,rgba(108,99,255,.18) 0%,transparent 65%)",borderRadius:"50%",pointerEvents:"none"}}/>
      <div style={{position:"absolute",bottom:-30,left:-20,width:150,height:150,background:"radial-gradient(circle,rgba(56,189,248,.1) 0%,transparent 65%)",borderRadius:"50%",pointerEvents:"none"}}/>
      <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:.05,pointerEvents:"none"}} viewBox="0 0 360 190" preserveAspectRatio="none">
        {[32,64,96,128,160].map(y=><line key={y} x1="0" y1={y} x2="360" y2={y} stroke="#6c63ff" strokeWidth="0.6"/>)}
        {[60,120,180,240,300].map(x=><line key={x} x1={x} y1="0" x2={x} y2="190" stroke="#6c63ff" strokeWidth="0.6"/>)}
      </svg>
      <div style={{display:"flex",alignItems:"center",gap:11,marginBottom:22}}>
        <div style={{width:46,height:46,borderRadius:15,background:"linear-gradient(135deg,rgba(108,99,255,.18),rgba(56,189,248,.12))",border:"1px solid rgba(108,99,255,.3)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 28px rgba(108,99,255,.2)"}}>
          <FootStockLogo size={30} rounded={false}/>
        </div>
        <div>
          <div style={{fontSize:19,fontWeight:700,color:"#fff",letterSpacing:"-0.5px",fontFamily:SANS,lineHeight:1,display:"flex",alignItems:"baseline",gap:5}}>
            FootStock<span style={{fontSize:9,fontWeight:900,color:GOLD,letterSpacing:"2px",fontFamily:SANS}}>ADMIN</span>
          </div>
          <div style={{fontSize:8,color:"rgba(244,63,94,.8)",fontWeight:700,letterSpacing:"3px",marginTop:3,fontFamily:SANS}}>PAINEL ADMINISTRATIVO</div>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.38)",fontFamily:SANS,marginBottom:5,letterSpacing:"0.3px"}}>Acesso restrito</div>
          <div style={{fontSize:26,fontWeight:900,color:"#fff",letterSpacing:"-1.2px",fontFamily:SANS,lineHeight:1.05}}>
            Entre no<br/><span style={{background:"linear-gradient(90deg,#6c63ff,#38bdf8)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>painel</span>
          </div>
        </div>
        <svg width="80" height="52" viewBox="0 0 80 52" fill="none" style={{opacity:.7,marginBottom:2}}>
          <polyline points="4,42 16,28 26,34 40,18 52,23 64,10 76,14" stroke={ACCENT} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" fill="none"/>
          <path d="M4,42 L16,28 L26,34 L40,18 L52,23 L64,10 L76,14 L76,50 L4,50 Z" fill={`${ACCENT}14`}/>
          <circle cx="76" cy="14" r="3.5" fill={ACCENT} opacity=".9"/>
          <circle cx="76" cy="14" r="6" fill={ACCENT} opacity=".2"/>
        </svg>
      </div>
    </div>

    {/* ── FORM ── */}
    <div style={{flex:1,overflowY:"auto",padding:"22px 20px 32px"}}>

      {/* Botão de biometria — aparece se suportado E já registrado */}
      {bioSupported&&bioRegistered&&<>
        <button onClick={handleBiometric} disabled={bioLoading} style={{
          width:"100%",padding:"15px",borderRadius:14,border:`1.5px solid rgba(108,99,255,.4)`,
          background:"rgba(108,99,255,.1)",color:"#fff",fontSize:14,fontWeight:800,fontFamily:SANS,
          cursor:"pointer",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"center",
          gap:10,opacity:bioLoading?.75:1,transition:"all .2s",
        }}>
          <span style={{fontSize:22}}>
            {/iphone|ipad|ipod/i.test(navigator.userAgent)?"🔐":"👆"}
          </span>
          <span>{bioLoading?"Aguardando biometria...":
            /iphone|ipad|ipod/i.test(navigator.userAgent)?"Entrar com Face ID / Touch ID":"Entrar com Biometria"
          }</span>
        </button>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
          <div style={{flex:1,height:1,background:BORDER}}/>
          <span style={{fontSize:10,color:MUTED,fontFamily:SANS,flexShrink:0}}>ou use e-mail e senha</span>
          <div style={{flex:1,height:1,background:BORDER}}/>
        </div>
      </>}

      <div style={{marginBottom:16}}>
        {lbl("E-mail")}
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:15,top:"50%",transform:"translateY(-50%)",fontSize:15,opacity:.3,pointerEvents:"none"}}>✉</span>
          <input type="email" placeholder="seu@email.com" value={email}
            onChange={e=>{setEmail(e.target.value);setError("");}}
            onKeyDown={e=>e.key==="Enter"&&handleLogin()}
            style={{...iS(error&&!email),paddingLeft:42}} autoComplete="username"/>
        </div>
      </div>
      <div style={{marginBottom:error?10:22}}>
        {lbl("Senha")}
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:15,top:"50%",transform:"translateY(-50%)",fontSize:15,opacity:.3,pointerEvents:"none"}}>🔒</span>
          <input type={showPass?"text":"password"} placeholder="••••••••" value={pass}
            onChange={e=>{setPass(e.target.value);setError("");}}
            onKeyDown={e=>e.key==="Enter"&&handleLogin()}
            style={{...iS(!!error),paddingLeft:42,paddingRight:46}} autoComplete="current-password"/>
          <button onClick={()=>setShowPass(v=>!v)} style={{position:"absolute",right:13,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:15,opacity:.4,color:"#fff",padding:0,lineHeight:1}}>{showPass?"🙈":"👁"}</button>
        </div>
      </div>
      {error&&<div style={{fontSize:10,color:"#f87171",fontFamily:SANS,marginBottom:16,display:"flex",alignItems:"center",gap:8,background:"rgba(244,63,94,.09)",border:"1px solid rgba(244,63,94,.22)",borderRadius:11,padding:"8px 13px"}}>⚠ {error}</div>}
      <button onClick={handleLogin} disabled={loading} style={{
        width:"100%",padding:"15px",borderRadius:14,border:"none",cursor:loading?"wait":"pointer",
        background:GRAD_ACCENT,color:"#fff",fontSize:14,fontWeight:800,fontFamily:SANS,
        boxShadow:"0 6px 24px rgba(108,99,255,.35)",opacity:loading?.75:1,marginBottom:20
      }}>{loading?"Verificando...":"Entrar no painel →"}</button>
      <div style={{background:"rgba(249,115,22,.07)",border:"1px solid rgba(249,115,22,.18)",borderRadius:11,padding:"10px 13px",display:"flex",alignItems:"center",gap:9}}>
        <span style={{fontSize:16,flexShrink:0}}>🔒</span>
        <div style={{fontSize:10,color:"rgba(249,115,22,.85)",fontFamily:SANS,lineHeight:1.5}}>
          Acesso exclusivo para <span style={{fontWeight:700}}>Administradores</span> e <span style={{fontWeight:700}}>Monitores</span>.
        </div>
      </div>
    </div>
  </div>;
}

function AdminLockScreen({adminUser,onUnlock,onLogout}){
  const [pass,setPass]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [bioSupported,setBioSupported]=useState(false);
  const [bioRegistered,setBioRegistered]=useState(false);

  useEffect(()=>{
    checkBiometricSupport().then(r=>{
      setBioSupported(r.supported);
      if(r.supported) setBioRegistered(hasBiometricRegistered(adminUser.id));
    });
  },[adminUser.id]);

  const iS={width:"100%",background:"rgba(255,255,255,.05)",border:`1.5px solid ${error?"rgba(244,63,94,.5)":"rgba(255,255,255,.08)"}`,borderRadius:12,padding:"13px 16px",color:"#fff",fontSize:13,fontFamily:SANS,outline:"none",boxSizing:"border-box",caretColor:ACCENT};

  const handleUnlock=()=>{
    if(!pass){setError("Digite sua senha.");return;}
    setLoading(true);
    setTimeout(()=>{
      const found=ADMIN_USERS_DB.find(u=>u.id===adminUser.id&&u.password===pass);
      setLoading(false);
      if(!found){setError("Senha incorreta.");return;}
      setError("");setPass("");onUnlock();
    },400);
  };

  const handleBiometric=async()=>{
    setLoading(true);setError("");
    try {
      const userId=await authenticateBiometric();
      if(userId===adminUser.id){setLoading(false);onUnlock();}
      else {setLoading(false);setError("Biometria não corresponde à sessão ativa.");}
    } catch(e) {
      setLoading(false);
      if(e.name==="NotAllowedError") setError("Biometria cancelada.");
      else setError("Erro na autenticação biométrica. Use a senha.");
    }
  };

  return <div style={{flex:1,display:"flex",flexDirection:"column",background:"#07090f",overflow:"hidden"}}>
    <div style={{position:"relative",overflow:"hidden",background:"linear-gradient(160deg,#0d1228 0%,#0e1219 55%,#080b12 100%)",padding:"28px 20px 26px",flexShrink:0}}>
      <div style={{position:"absolute",top:-50,right:-40,width:200,height:200,background:"radial-gradient(circle,rgba(244,63,94,.15) 0%,transparent 65%)",borderRadius:"50%",pointerEvents:"none"}}/>
      <div style={{position:"absolute",bottom:-30,left:-20,width:150,height:150,background:"radial-gradient(circle,rgba(249,115,22,.08) 0%,transparent 65%)",borderRadius:"50%",pointerEvents:"none"}}/>
      <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:.05,pointerEvents:"none"}} viewBox="0 0 360 190" preserveAspectRatio="none">
        {[32,64,96,128,160].map(y=><line key={y} x1="0" y1={y} x2="360" y2={y} stroke="#6c63ff" strokeWidth="0.6"/>)}
        {[60,120,180,240,300].map(x=><line key={x} x1={x} y1="0" x2={x} y2="190" stroke="#6c63ff" strokeWidth="0.6"/>)}
      </svg>
      <div style={{display:"flex",alignItems:"center",gap:11,marginBottom:22}}>
        <div style={{width:46,height:46,borderRadius:15,background:"linear-gradient(135deg,rgba(108,99,255,.18),rgba(56,189,248,.12))",border:"1px solid rgba(108,99,255,.3)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 28px rgba(108,99,255,.2)"}}>
          <FootStockLogo size={30} rounded={false}/>
        </div>
        <div>
          <div style={{fontSize:19,fontWeight:700,color:"#fff",letterSpacing:"-0.5px",fontFamily:SANS,lineHeight:1,display:"flex",alignItems:"baseline",gap:5}}>
            FootStock<span style={{fontSize:9,fontWeight:900,color:GOLD,letterSpacing:"2px",fontFamily:SANS}}>ADMIN</span>
          </div>
          <div style={{fontSize:8,color:"rgba(244,63,94,.8)",fontWeight:700,letterSpacing:"3px",marginTop:3,fontFamily:SANS}}>SESSÃO BLOQUEADA</div>
        </div>
      </div>
      <div>
        <div style={{fontSize:11,color:"rgba(255,255,255,.38)",fontFamily:SANS,marginBottom:5}}>Inatividade detectada</div>
        <div style={{fontSize:26,fontWeight:900,color:"#fff",letterSpacing:"-1.2px",fontFamily:SANS,lineHeight:1.05}}>
          Confirme sua<br/><span style={{background:"linear-gradient(90deg,#f43f5e,#f97316)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>identidade</span>
        </div>
      </div>
    </div>

    <div style={{flex:1,overflowY:"auto",padding:"22px 20px 32px"}}>
      {/* User info */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"rgba(255,255,255,.04)",border:`1px solid ${BORDER}`,borderRadius:13,marginBottom:20}}>
        <div style={{width:36,height:36,borderRadius:11,background:adminUser.role==="admin"?"rgba(244,63,94,.2)":"rgba(249,115,22,.2)",border:`1px solid ${adminUser.role==="admin"?"rgba(244,63,94,.3)":"rgba(249,115,22,.3)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>
          {getRoleMeta(adminUser.role).icon}
        </div>
        <div>
          <div style={{fontSize:12,fontWeight:700,color:"#fff",fontFamily:SANS}}>{adminUser.name}</div>
          <div style={{fontSize:10,color:adminUser.role==="admin"?RED:ORANGE,fontFamily:SANS,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px"}}>{adminUser.role}</div>
        </div>
      </div>

      {/* Biometria — aparece se disponível e cadastrada para este usuário */}
      {bioSupported&&bioRegistered&&<>
        <button onClick={handleBiometric} disabled={loading} style={{
          width:"100%",padding:"15px",borderRadius:14,border:"1.5px solid rgba(108,99,255,.4)",
          background:"rgba(108,99,255,.1)",color:"#fff",fontSize:14,fontWeight:800,fontFamily:SANS,
          cursor:"pointer",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"center",
          gap:10,opacity:loading?.75:1,
        }}>
          <span style={{fontSize:22}}>{/iphone|ipad|ipod/i.test(navigator.userAgent)?"🔐":"👆"}</span>
          <span>{loading?"Aguardando biometria...":
            /iphone|ipad|ipod/i.test(navigator.userAgent)?"Desbloquear com Face ID / Touch ID":"Desbloquear com Biometria"
          }</span>
        </button>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
          <div style={{flex:1,height:1,background:BORDER}}/>
          <span style={{fontSize:10,color:MUTED,fontFamily:SANS,flexShrink:0}}>ou use a senha</span>
          <div style={{flex:1,height:1,background:BORDER}}/>
        </div>
      </>}

      <div style={{fontSize:9,color:"rgba(255,255,255,.45)",fontWeight:600,letterSpacing:"0.8px",fontFamily:SANS,marginBottom:5,textTransform:"uppercase"}}>Senha</div>
      <div style={{position:"relative",marginBottom:error?10:20}}>
        <span style={{position:"absolute",left:15,top:"50%",transform:"translateY(-50%)",fontSize:15,opacity:.3,pointerEvents:"none"}}>🔒</span>
        <input type="password" placeholder="••••••••" value={pass}
          onChange={e=>{setPass(e.target.value);setError("");}}
          onKeyDown={e=>e.key==="Enter"&&handleUnlock()}
          style={{...iS,paddingLeft:42}} autoFocus/>
      </div>
      {error&&<div style={{fontSize:10,color:"#f87171",fontFamily:SANS,marginBottom:16,display:"flex",alignItems:"center",gap:8,background:"rgba(244,63,94,.09)",border:"1px solid rgba(244,63,94,.22)",borderRadius:11,padding:"8px 13px"}}>⚠ {error}</div>}
      <button onClick={handleUnlock} disabled={loading} style={{
        width:"100%",padding:"15px",borderRadius:14,border:"none",cursor:"pointer",
        background:GRAD_ACCENT,color:"#fff",fontSize:14,fontWeight:800,fontFamily:SANS,
        boxShadow:"0 6px 24px rgba(108,99,255,.35)",opacity:loading?.75:1,marginBottom:14,
      }}>{loading?"Verificando...":"Desbloquear →"}</button>
      <div style={{textAlign:"center"}}>
        <span onClick={onLogout} style={{fontSize:11,color:MUTED,cursor:"pointer",fontFamily:SANS,borderBottom:`1px solid ${BORDER}`,paddingBottom:1}}>
          Sair e fazer login novamente
        </span>
      </div>
    </div>
  </div>;
}


/* ══════════════════════════════════════════════════════════════════
   MÓDULO 8 — NOTÍCIAS (Editor e Moderador)
   Acesso: Admin, Editor, Moderador
   Editor: criar, editar, excluir, publicar/despublicar
   Moderador: publicar/despublicar, excluir — sem criar/editar
══════════════════════════════════════════════════════════════════ */
const NOTICIAS_INIT=[
  {id:"n001",titulo:"URU3 anuncia patrocínio master com banco digital",ticker:"URU3",categoria:"Esportiva Maior",sentimento:0.8,status:"publicada",autor:"admin",criadoEm:"2026-03-10",cliques:1420},
  {id:"n002",titulo:"POR4 reforça elenco com contratações milionárias",ticker:"POR4",categoria:"Esportiva Menor",sentimento:0.6,status:"publicada",autor:"ana",criadoEm:"2026-03-12",cliques:840},
  {id:"n003",titulo:"TIM3 sofre rebaixamento para Série B",ticker:"TIM3",categoria:"Esportiva Maior",sentimento:-0.9,status:"publicada",autor:"admin",criadoEm:"2026-03-14",cliques:3200},
  {id:"n004",titulo:"FOG3 envolto em polêmica financeira",ticker:"FOG3",categoria:"Financeira Crítica",sentimento:-0.7,status:"rascunho",autor:"ana",criadoEm:"2026-03-16",cliques:0},
  {id:"n005",titulo:"BAL4 promovida à Série A após campanha histórica",ticker:"BAL4",categoria:"Esportiva Maior",sentimento:0.95,status:"rascunho",autor:"marcos",criadoEm:"2026-03-17",cliques:0},
];
const CATS_NOTICIAS=["Esportiva Maior","Esportiva Menor","Financeira Crítica","Mercado de Ativos","Integridade/Saúde","Institucional"];
const BLANK_NOTICIA={titulo:"",ticker:"",categoria:"Esportiva Maior",sentimento:"0.5",texto:"",status:"rascunho"};

function NoticiasAdminModule({currentRole="admin"}){
  const canEdit  =["admin","editor"].includes(currentRole);
  const [noticias,setNoticias]=useState(NOTICIAS_INIT.map(n=>({...n})));
  const [editId,setEditId]=useState(null);
  const [form,setForm]=useState({...BLANK_NOTICIA});
  const [filter,setFilter]=useState("todas");
  const [confirmDel,setConfirmDel]=useState(null);

  const statusColor={publicada:GREEN,rascunho:MUTED,arquivada:"rgba(255,255,255,.25)"};
  const sentColor=s=>parseFloat(s)>=0?GREEN:RED;

  const filtered=filter==="todas"?noticias:noticias.filter(n=>n.status===filter);

  const saveNoticia=()=>{
    if(editId==="new"){
      setNoticias(p=>[{...form,id:`n${Date.now()}`,sentimento:parseFloat(form.sentimento)||0,autor:currentRole,criadoEm:new Date().toISOString().slice(0,10),cliques:0},...p]);
    } else {
      setNoticias(p=>p.map(n=>n.id===editId?{...n,...form,sentimento:parseFloat(form.sentimento)||n.sentimento}:n));
    }
    setEditId(null);setForm({...BLANK_NOTICIA});
  };

  const toggleStatus=id=>setNoticias(p=>p.map(n=>n.id===id?{...n,status:n.status==="publicada"?"rascunho":"publicada"}:n));
  const arquivar   =id=>setNoticias(p=>p.map(n=>n.id===id?{...n,status:"arquivada"}:n));
  const deletar    =id=>{setNoticias(p=>p.filter(n=>n.id!==id));setConfirmDel(null);};
  const openEdit   =n=>{setEditId(n.id);setForm({...n,sentimento:String(n.sentimento)});};

  // Formulário
  if(editId){
    const isNew=editId==="new";
    return <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <span style={{fontSize:13,fontWeight:800,color:"#fff",fontFamily:SANS}}>{isNew?"Nova Notícia":"Editar Notícia"}</span>
        <Btn onClick={()=>{setEditId(null);setForm({...BLANK_NOTICIA});}} color={MUTED} variant="outline" small>✕ Cancelar</Btn>
      </div>
      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"16px",marginBottom:12}}>
        <Input label="TÍTULO" value={form.titulo} onChange={v=>setForm(p=>({...p,titulo:v}))} placeholder="Título da notícia..."/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <Input label="TICKER" value={form.ticker} onChange={v=>setForm(p=>({...p,ticker:v.toUpperCase()}))} placeholder="ex: URU3"/>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,color:MUTED,fontWeight:700,fontFamily:SANS,marginBottom:5,letterSpacing:"0.5px"}}>CATEGORIA</div>
            <select value={form.categoria} onChange={e=>setForm(p=>({...p,categoria:e.target.value}))}
              style={{width:"100%",background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:"9px 13px",color:TEXT,fontSize:12,fontFamily:MONO,outline:"none"}}>
              {CATS_NOTICIAS.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:MUTED,fontWeight:700,fontFamily:SANS,marginBottom:5,letterSpacing:"0.5px"}}>
            SENTIMENTO: <span style={{color:sentColor(form.sentimento)}}>{parseFloat(form.sentimento)>=0?"+":""}{(parseFloat(form.sentimento)||0).toFixed(2)}</span>
          </div>
          <input type="range" min="-1" max="1" step="0.05" value={form.sentimento}
            onChange={e=>setForm(p=>({...p,sentimento:e.target.value}))}
            style={{width:"100%",accentColor:sentColor(form.sentimento)}}/>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:MUTED,fontFamily:SANS}}>
            <span>−1.0 muito negativo</span><span>0</span><span>+1.0 muito positivo</span>
          </div>
        </div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:MUTED,fontWeight:700,fontFamily:SANS,marginBottom:5,letterSpacing:"0.5px"}}>TEXTO / CORPO</div>
          <textarea value={form.texto} onChange={e=>setForm(p=>({...p,texto:e.target.value}))} rows={4}
            placeholder="Corpo da notícia..."
            style={{width:"100%",background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:"9px 13px",color:TEXT,fontSize:12,fontFamily:SANS,outline:"none",resize:"vertical",boxSizing:"border-box"}}/>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,color:MUTED,fontWeight:700,fontFamily:SANS,marginBottom:8,letterSpacing:"0.5px"}}>STATUS INICIAL</div>
          <div style={{display:"flex",gap:6}}>
            {["rascunho","publicada"].map(s=><button key={s} onClick={()=>setForm(p=>({...p,status:s}))} style={{
              flex:1,padding:"8px",borderRadius:9,border:`1px solid ${form.status===s?(s==="publicada"?GREEN:MUTED):BORDER}`,cursor:"pointer",
              background:form.status===s?(s==="publicada"?"rgba(34,197,94,.12)":"rgba(255,255,255,.05)"):"transparent",
              color:form.status===s?(s==="publicada"?GREEN:"#fff"):MUTED,fontSize:11,fontWeight:700,fontFamily:SANS
            }}>{s==="publicada"?"● Publicada":"○ Rascunho"}</button>)}
          </div>
        </div>
        <Btn onClick={saveNoticia} color={GREEN} disabled={!form.titulo||!form.ticker}>
          💾 {isNew?"Criar Notícia":"Salvar alterações"}
        </Btn>
      </div>
    </div>;
  }

  // Lista
  return <div>
    <SectionHeader
      title="Notícias"
      sub={`${noticias.filter(n=>n.status==="publicada").length} publicadas · ${noticias.filter(n=>n.status==="rascunho").length} rascunhos`}
      action={canEdit?<Btn onClick={()=>{setEditId("new");setForm({...BLANK_NOTICIA});}} color={ACCENT}>+ Nova Notícia</Btn>:null}
    />

    {/* Filtro de status */}
    <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap"}}>
      {["todas","publicada","rascunho","arquivada"].map(s=><button key={s} onClick={()=>setFilter(s)} style={{
        padding:"4px 12px",borderRadius:8,border:"none",cursor:"pointer",
        background:filter===s?ACCENT:SURFACE,color:filter===s?BG:MUTED,fontSize:9,fontWeight:800,fontFamily:SANS
      }}>{s==="todas"?"Todas":s.charAt(0).toUpperCase()+s.slice(1)+"s"}</button>)}
    </div>

    {/* Cards de notícias */}
    {filtered.length===0
      ?<div style={{textAlign:"center",padding:"32px 0",color:MUTED,fontSize:12,fontFamily:SANS}}>Nenhuma notícia neste filtro</div>
      :filtered.map(n=>(
        <div key={n.id} style={{background:CARD,border:`1px solid ${n.status==="publicada"?"rgba(34,197,94,.25)":BORDER}`,borderRadius:14,padding:"14px",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:8}}>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
                <Badge children={n.ticker} color={ACCENT2}/>
                <Badge children={n.categoria} color={MUTED}/>
                <Badge children={n.status.toUpperCase()} color={statusColor[n.status]}/>
              </div>
              <div style={{fontSize:12,fontWeight:700,color:"#fff",fontFamily:SANS,lineHeight:1.4}}>{n.titulo}</div>
              <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginTop:4}}>
                Por {n.autor} · {n.criadoEm}
                {n.cliques>0&&<span> · {n.cliques.toLocaleString("pt-BR")} cliques</span>}
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:sentColor(n.sentimento)}}/>
              <span style={{fontSize:10,fontWeight:700,color:sentColor(n.sentimento),fontFamily:MONO}}>{n.sentimento>=0?"+":""}{n.sentimento.toFixed(2)}</span>
            </div>
          </div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {n.status!=="arquivada"&&<Btn onClick={()=>toggleStatus(n.id)} color={n.status==="publicada"?MUTED:GREEN} variant="outline" small>{n.status==="publicada"?"Despublicar":"Publicar"}</Btn>}
            {canEdit&&n.status!=="arquivada"&&<Btn onClick={()=>openEdit(n)} color={ACCENT} variant="outline" small>✎ Editar</Btn>}
            {n.status!=="arquivada"&&<Btn onClick={()=>arquivar(n.id)} color={MUTED} variant="outline" small>📦 Arquivar</Btn>}
            <Btn onClick={()=>setConfirmDel(n.id)} color={RED} variant="outline" small>🗑</Btn>
          </div>
        </div>
      ))
    }

    {confirmDel&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 20px"}}>
      <div style={{background:CARD,border:"1px solid rgba(244,63,94,.4)",borderRadius:20,padding:"24px",maxWidth:340,width:"100%"}}>
        <div style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:SANS,marginBottom:8}}>Excluir notícia?</div>
        <div style={{fontSize:12,color:MUTED,fontFamily:SANS,marginBottom:20}}>Esta ação é irreversível.</div>
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={()=>setConfirmDel(null)} color={MUTED} variant="outline">Cancelar</Btn>
          <Btn onClick={()=>deletar(confirmDel)} color={RED}>Excluir</Btn>
        </div>
      </div>
    </div>}
  </div>;
}

/* ══════════════════════════════════════════════════════════════════
   ROOT — AdminApp
══════════════════════════════════════════════════════════════════ */

function BlockedSection({label}){
  return <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
    height:"60vh",gap:16,textAlign:"center"}}>
    <div style={{width:64,height:64,borderRadius:20,background:"rgba(249,115,22,.1)",border:"1px solid rgba(249,115,22,.25)",
      display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>🔒</div>
    <div>
      <div style={{fontSize:16,fontWeight:800,color:"#fff",fontFamily:SANS,marginBottom:6}}>{label}</div>
      <div style={{fontSize:12,color:MUTED,fontFamily:SANS,maxWidth:280,lineHeight:1.6}}>
        Esta seção não está disponível para o perfil <span style={{color:ORANGE,fontWeight:700}}>Monitor</span>.
      </div>
      <div style={{fontSize:11,color:MUTED,fontFamily:SANS,marginTop:8}}>
        Entre em contato com um Administrador para obter acesso.
      </div>
    </div>
  </div>;
}

// ── Sistema de permissões por role ──────────────────────────────────────────
// Tabs disponíveis por role (undefined = acesso total ao próprio bloco)
const ROLE_TABS={
  admin:     new Set(["dashboard","motor","usuarios","financeiro","engajamento","moderacao","noticias","patrocinadores"]),
  monitor:   new Set(["dashboard","usuarios","engajamento","moderacao"]),
  editor:    new Set(["dashboard","usuarios","moderacao","noticias"]),
  moderador: new Set(["noticias","moderacao"]),
};
// Ações de usuário permitidas por role
const ROLE_USER_ACTIONS={
  admin:     new Set(["promote_admin","promote_monitor","promote_editor","promote_moderador","demote","suspend","unsuspend","reset","promote_lenda","promote_craque"]),
  monitor:   new Set([]),
  editor:    new Set(["suspend","unsuspend","reset","promote_lenda","promote_craque"]),
  moderador: new Set([]),
};
// Cor e ícone por role
const ROLE_META={
  admin:     {color:"#f43f5e",icon:"👑",label:"ADMIN"},
  monitor:   {color:"#f97316",icon:"🔭",label:"MONITOR"},
  editor:    {color:"#6c63ff",icon:"✏️", label:"EDITOR"},
  moderador: {color:"#38bdf8",icon:"🛡",label:"MODERADOR"},
};
const getRoleMeta=(r)=>ROLE_META[r]||{color:"#7a8ba8",icon:"👤",label:(r||"").toUpperCase()};
const canAccess=(role,tab)=>ROLE_TABS[role]?.has(tab)??false;
const canAction=(role,action)=>ROLE_USER_ACTIONS[role]?.has(action)??false;
// Tab inicial por role
const ROLE_DEFAULT_TAB={admin:"dashboard",monitor:"dashboard",editor:"dashboard",moderador:"moderacao"};
// Manter retrocompatibilidade com código que usa isMonitor
// (isMonitor agora = qualquer role não-admin sem acesso a financeiro/motor)
const MONITOR_BLOCKED_TABS   =new Set(["motor","financeiro","patrocinadores"]);
const MONITOR_BLOCKED_ACTIONS=new Set(["promote_admin","promote_monitor","promote_editor","promote_moderador","demote","suspend","unsuspend","reset","promote_lenda","promote_craque"]);

export default function FootStockAdmin(){
  // ── Estado de autenticação ──────────────────────────────────────────────
  const [adminUser, setAdminUser]=useState(null);   // null = não autenticado
  const [locked,    setLocked]   =useState(false);  // true = tela de bloqueio por inatividade
  const [liveTime,  setLiveTime] =useState(new Date());
  const lastActivityRef=useRef(Date.now());

  // Atualiza relógio do PhoneShell a cada 10s
  useEffect(()=>{const t=setInterval(()=>setLiveTime(new Date()),10000);return()=>clearInterval(t);},[]);

  // Detecta inatividade e bloqueia sessão após SESSION_TIMEOUT_MS
  useEffect(()=>{
    if(!adminUser) return;
    const resetTimer=()=>{lastActivityRef.current=Date.now();if(locked)setLocked(false);};
    const events=["mousemove","keydown","mousedown","touchstart","scroll"];
    events.forEach(e=>window.addEventListener(e,resetTimer,{passive:true}));
    const check=setInterval(()=>{
      if(Date.now()-lastActivityRef.current>SESSION_TIMEOUT_MS) setLocked(true);
    },30000);
    return()=>{events.forEach(e=>window.removeEventListener(e,resetTimer));clearInterval(check);};
  },[adminUser,locked]);

  // ── Todos os hooks abaixo devem vir ANTES dos early returns (regra do React) ──
  const [tab,setTab]=useState("dashboard");
  const {motorState,paused,setPaused,forceCircuitBreaker,clearCircuitBreaker,setFV,setVol}=useMockMarket();
  const marketSession=useMarketSession();
  const [posts]=useState(MOCK_POSTS_INIT.map(p=>({...p})));
  const [users]=useState(MOCK_USERS.map(u=>({...u})));

  // Permissões derivadas do usuário autenticado
  const currentRole =adminUser?.role||"";
  const isAdmin     =currentRole==="admin";
  const isMonitor   =currentRole==="monitor";
  const isEditor    =currentRole==="editor";
  const isModerador =currentRole==="moderador";
  const roleMeta    =getRoleMeta(currentRole);

  // Redireciona para tab padrão se a tab atual não for acessível por este role
  useEffect(()=>{
    if(currentRole&&!canAccess(currentRole,tab)){
      setTab(ROLE_DEFAULT_TAB[currentRole]||"dashboard");
    }
  },[currentRole,tab]);

  // ── Early returns de auth — após todos os hooks ──────────────────────────
  if(!adminUser) return <PhoneShell time={liveTime}><AdminLoginScreen onLogin={u=>{setAdminUser(u);lastActivityRef.current=Date.now();}}/></PhoneShell>;
  if(locked)     return <PhoneShell time={liveTime}><AdminLockScreen adminUser={adminUser} onUnlock={()=>{setLocked(false);lastActivityRef.current=Date.now();}} onLogout={()=>{setAdminUser(null);setLocked(false);}}/></PhoneShell>;

  const cbCount=Object.values(motorState).filter(s=>s.cb).length;
  const flaggedCount=posts.filter(p=>p.status==="flagged").length;

  const pill=a=>({flex:1,padding:"6px 2px",borderRadius:8,border:"none",cursor:"pointer",
    fontSize:9,fontWeight:a?700:500,background:a?"rgba(108,99,255,.15)":"transparent",
    color:a?ACCENT:MUTED,fontFamily:SANS,transition:"all .15s",display:"flex",
    flexDirection:"column",alignItems:"center",gap:2,position:"relative"});

  // Todas as tabs — blocked calculado pelo sistema de permissões
  const NAV_ROW=[
    {id:"dashboard",     icon:"📊",label:"Dash",     blocked:!canAccess(currentRole,"dashboard")},
    {id:"motor",         icon:"⚙️", label:"Motor",    blocked:!canAccess(currentRole,"motor")},
    {id:"usuarios",      icon:"👥",label:"Usuários",  blocked:!canAccess(currentRole,"usuarios")},
    {id:"financeiro",    icon:"💳",label:"Financeiro",blocked:!canAccess(currentRole,"financeiro")},
    {id:"engajamento",   icon:"📈",label:"Engaj.",    blocked:!canAccess(currentRole,"engajamento")},
    {id:"moderacao",     icon:"🛡",label:"Moderação", blocked:!canAccess(currentRole,"moderacao")},
    {id:"noticias",      icon:"📰",label:"Notícias",  blocked:!canAccess(currentRole,"noticias")},
    {id:"patrocinadores",icon:"🤝",label:"Patroc.",   blocked:!canAccess(currentRole,"patrocinadores")},
  ];

  return <PhoneShell time={liveTime}>
    <div style={{flex:1,display:"flex",flexDirection:"column",background:BG,overflow:"hidden"}}>

      {/* ── HEADER — idêntico ao app principal ── */}
      <div style={{padding:"6px 14px 0",position:"relative",zIndex:20,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          {/* Logo (mesmo estilo do app) */}
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <div style={{width:32,height:32,borderRadius:9,background:"linear-gradient(145deg,#141c2e,#0e1219)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 0 1px rgba(108,99,255,.2),0 4px 16px rgba(108,99,255,.12)"}}>
              <FootStockLogo size={26} rounded={false}/>
            </div>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:"#fff",letterSpacing:"-0.3px",lineHeight:1,fontFamily:SANS,display:"flex",alignItems:"baseline",gap:4}}>
                FootStock<span style={{fontSize:8,fontWeight:900,color:GOLD,letterSpacing:"2px",fontFamily:SANS}}>ADMIN</span>
              </div>
              <div style={{fontSize:7,color:roleMeta.color,fontWeight:700,letterSpacing:"2px",marginTop:1,fontFamily:SANS,opacity:.85}}>
                {roleMeta.label}
              </div>
            </div>
          </div>
          {/* Direita: sessão + motor + role badge + logout */}
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{background:marketSession.bg,border:`1px solid ${marketSession.border}`,borderRadius:20,padding:"3px 9px",display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:5,height:5,borderRadius:"50%",background:marketSession.color,boxShadow:marketSession.id!=="closed"?`0 0 8px ${marketSession.color}90`:"none",flexShrink:0}}/>
              <span style={{fontSize:7,fontWeight:900,color:marketSession.color,fontFamily:SANS,letterSpacing:"0.5px"}}>{marketSession.short}</span>
            </div>
            <div style={{
              background:isAdmin?"rgba(244,63,94,.15)":"rgba(249,115,22,.15)",
              border:`1px solid ${isAdmin?"rgba(244,63,94,.3)":"rgba(249,115,22,.3)"}`,
              borderRadius:20,padding:"3px 9px",fontSize:7,fontWeight:900,
              color:isAdmin?RED:ORANGE,fontFamily:SANS
            }}>{roleMeta.icon} {roleMeta.label}</div>
            <button onClick={()=>setAdminUser(null)} style={{
              background:"rgba(244,63,94,.08)",border:"1px solid rgba(244,63,94,.2)",color:RED,
              borderRadius:8,padding:"4px 9px",fontSize:9,cursor:"pointer",fontFamily:SANS,fontWeight:700
            }}>Sair</button>
          </div>
        </div>
        {/* NAV PILLS — mesmo estilo pill() do app */}
        <div style={{display:"flex",gap:1,background:"rgba(255,255,255,.04)",borderRadius:10,padding:"3px",marginBottom:2,border:`1px solid ${BORDER}`}}>
          {NAV_ROW.map(n=>{
            const active=tab===n.id;
            const badge=(n.id==="motor"&&cbCount>0)?cbCount:(n.id==="moderacao"&&flaggedCount>0)?flaggedCount:null;
            return <button key={n.id} onClick={()=>{if(!n.blocked)setTab(n.id);}}
              title={n.blocked?`${n.label} — sem acesso (Monitor)`:n.label}
              style={{...pill(active),cursor:n.blocked?"not-allowed":"pointer",opacity:n.blocked?.3:1}}>
              <span style={{fontSize:12,lineHeight:1}}>{n.icon}</span>
              <span style={{fontSize:7}}>{n.blocked?"🔒":n.label}</span>
              {!n.blocked&&badge&&<div style={{position:"absolute",top:1,right:2,width:14,height:14,borderRadius:"50%",
                background:RED,display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:7,fontWeight:900,color:"#fff",fontFamily:SANS}}>{badge}</div>}
            </button>;
          })}
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{flex:1,overflowY:"auto",padding:"10px 14px",position:"relative",zIndex:1}}>
        {tab==="dashboard"      &&(canAccess(currentRole,"dashboard")      ?<DashboardModule users={users} posts={posts} motorState={motorState} marketSession={marketSession} currentRole={currentRole}/>:<BlockedSection label="Dashboard"/>)}
        {tab==="motor"          &&(canAccess(currentRole,"motor")           ?<MotorModule motorState={motorState} paused={paused} setPaused={setPaused} forceCircuitBreaker={forceCircuitBreaker} clearCircuitBreaker={clearCircuitBreaker} setFV={setFV} setVol={setVol} users={users}/>:<BlockedSection label="Motor de Mercado"/>)}
        {tab==="usuarios"       &&(canAccess(currentRole,"usuarios")        ?<UsersModule currentRole={currentRole}/>:<BlockedSection label="Usuários"/>)}
        {tab==="financeiro"     &&(canAccess(currentRole,"financeiro")      ?<FinanceiroModule/>:<BlockedSection label="Financeiro"/>)}
        {tab==="engajamento"    &&(canAccess(currentRole,"engajamento")     ?<EngajamentoModule/>:<BlockedSection label="Engajamento"/>)}
        {tab==="moderacao"      &&(canAccess(currentRole,"moderacao")       ?<ModeracaoModule/>:<BlockedSection label="Moderação"/>)}
        {tab==="noticias"       &&(canAccess(currentRole,"noticias")        ?<NoticiasAdminModule currentRole={currentRole}/>:<BlockedSection label="Notícias"/>)}
        {tab==="patrocinadores" &&(canAccess(currentRole,"patrocinadores")  ?<PatrocinadoresModule/>:<BlockedSection label="Patrocinadores"/>)}
      </div>
    </div>
  </PhoneShell>;
}
