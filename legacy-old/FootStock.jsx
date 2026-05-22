import { useState, useEffect, useRef } from "react";

/* ── TOKENS — Premium Fintech Palette ── */
const BG="#080b12",SURFACE="#0e1219",CARD="#121820",BORDER="#1e2636";
const ACCENT="#6c63ff",ACCENT2="#38bdf8",RED="#f43f5e",GOLD="#f59e0b";
const ACCENT_SOFT="#7c75ff",ACCENT_DIM="rgba(108,99,255,0.12)";
const TEXT="#e8eaf0",MUTED="#7a8ba8";
const SANS="'Inter','Helvetica Neue',sans-serif",MONO="'JetBrains Mono','Fira Mono',monospace";

/* ══════════════════════════════════════════════════════
   FOOTSTOCK LOGO — SVG fiel ao ícone oficial da marca
   Jogador verde neon chutando bola + gráfico de linhas
   Uso: <FootStockLogo size={32} />
══════════════════════════════════════════════════════ */
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
        <filter id="fsglow2" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <clipPath id="fsclip">
          <rect width="100" height="100" rx={r}/>
        </clipPath>
      </defs>

      {/* Fundo */}
      <rect width="100" height="100" rx={r} fill="url(#fsbg)"/>

      <g clipPath="url(#fsclip)">
        {/* ── GRÁFICO PRETO (camada de trás) ── */}
        {/* Linha do gráfico preto: vale → pico → vale → pico */}
        <polyline
          points="6,70 18,46 28,58 40,32 52,44"
          stroke="#1e2535" strokeWidth="5"
          strokeLinecap="round" strokeLinejoin="round" fill="none"
        />
        {/* Seta preta diagonal */}
        <line x1="52" y1="44" x2="64" y2="22"
          stroke="#1e2535" strokeWidth="5" strokeLinecap="round"/>
        {/* Ponta seta preta */}
        <polygon points="64,22 55,27 60,33" fill="#1e2535"/>

        {/* ── GRÁFICO VERDE NEON (frente) ── */}
        <polyline
          points="6,75 18,52 28,64 42,38"
          stroke="#5dfc00" strokeWidth="4"
          strokeLinecap="round" strokeLinejoin="round" fill="none"
          filter="url(#fsglow)"
        />
        {/* Seta verde diagonal para cima-direita */}
        <line x1="42" y1="38" x2="70" y2="10"
          stroke="#5dfc00" strokeWidth="4" strokeLinecap="round"
          filter="url(#fsglow)"/>
        {/* Ponta seta verde */}
        <polygon points="70,10 60,18 66,24" fill="#5dfc00" filter="url(#fsglow)"/>

        {/* ── JOGADOR VERDE (silhueta correndo/chutando) ── */}
        {/* Cabeça */}
        <circle cx="69" cy="20" r="5.5" fill="#5dfc00" filter="url(#fsglow)"/>
        {/* Torso */}
        <line x1="69" y1="26" x2="65" y2="48"
          stroke="#5dfc00" strokeWidth="4" strokeLinecap="round" filter="url(#fsglow)"/>
        {/* Braço esquerdo levantado (segurando seta) */}
        <line x1="67" y1="32" x2="56" y2="24"
          stroke="#5dfc00" strokeWidth="3.2" strokeLinecap="round" filter="url(#fsglow)"/>
        {/* Braço direito para baixo-trás */}
        <line x1="67" y1="34" x2="76" y2="42"
          stroke="#5dfc00" strokeWidth="3.2" strokeLinecap="round" filter="url(#fsglow)"/>
        {/* Perna esquerda — estendida para frente (chutando) */}
        <line x1="65" y1="48" x2="54" y2="60"
          stroke="#5dfc00" strokeWidth="3.8" strokeLinecap="round" filter="url(#fsglow)"/>
        <line x1="54" y1="60" x2="47" y2="68"
          stroke="#5dfc00" strokeWidth="3" strokeLinecap="round" filter="url(#fsglow)"/>
        {/* Perna direita — dobrada para trás */}
        <line x1="65" y1="48" x2="74" y2="57"
          stroke="#5dfc00" strokeWidth="3.8" strokeLinecap="round" filter="url(#fsglow)"/>
        <line x1="74" y1="57" x2="80" y2="51"
          stroke="#5dfc00" strokeWidth="3" strokeLinecap="round" filter="url(#fsglow)"/>

        {/* ── BOLA DE FUTEBOL ── */}
        <circle cx="55" cy="78" r="10"
          fill="#0d1120" stroke="#5dfc00" strokeWidth="2.5"
          filter="url(#fsglow)"/>
        {/* Pentágono central da bola */}
        <polygon
          points="55,70 59.8,73.5 58,79 52,79 50.2,73.5"
          fill="#5dfc00" opacity="0.9"/>
        {/* Pontos laterais */}
        <line x1="45.5" y1="75" x2="50.2" y2="73.5" stroke="#5dfc00" strokeWidth="1.5" opacity="0.6"/>
        <line x1="64.5" y1="75" x2="59.8" y2="73.5" stroke="#5dfc00" strokeWidth="1.5" opacity="0.6"/>
        <line x1="52" y1="87" x2="52" y2="79" stroke="#5dfc00" strokeWidth="1.5" opacity="0.6"/>
        <line x1="58" y1="87" x2="58" y2="79" stroke="#5dfc00" strokeWidth="1.5" opacity="0.6"/>

        {/* Bola menor à direita (sendo chutada) */}
        <circle cx="82" cy="68" r="5.5"
          fill="#0d1120" stroke="#5dfc00" strokeWidth="2"
          opacity="0.75" filter="url(#fsglow)"/>
        <polygon points="82,63 84.6,65 83.8,68 80.2,68 79.4,65"
          fill="#5dfc00" opacity="0.6"/>
      </g>
    </svg>
  );
}

/* ── ATIVOS ──
   Dados reais 2024 (Sports Value / Convocados 2025)
   Valuation = Receita × P/S múltiplo (ajustado por endividamento)
   Float = 25% do valuation / preço IPO  (free-float padrão B3)
   totalShares = float disponível para negociação
   Fonte receitas: Sports Value, CNN Brasil, Exame — mai/2025
── */
/* ═══════════════════════════════════════════════════════════════════════
   CLUBS — Metodologia de valuation multi-fator (Sports Value / KPMG 2025)
   ───────────────────────────────────────────────────────────────────────
   Fórmula do IPO (inspirada na metodologia Sports Value 6ª ed. 2025):

     EV  = (rev × evMult)        ← EV/Receita por comparáveis de mercado
           + squad                ← valor do plantel (Transfermarkt 2024–25)
           + brand                ← valor de marca (Sports Value 2025)
     Equity = EV − debt          ← desconta dívida operacional líquida
     Float  = Equity × ff        ← free-float calibrado pelo índice dívida/receita
     Preço  = Float / totalShares

   Campos novos por clube:
     evMult  – múltiplo EV/Receita calibrado por comparáveis reais
               Série A top: 3,5×–5,0×  |  Série A mid: 1,8×–3,0×
               Série B: 0,8×–1,5×
               Fonte: Finance Interview Coach, Brand Finance, Sports Value
     squad   – valor do plantel em R$M (Transfermarkt dez/2024–jan/2025)
     brand   – valor de marca em R$M (Sports Value 6ª ed. 2025)
     debt    – dívida operacional líquida em R$M (Sports Value / Exame 2025)
     ff      – free-float (%): 15% se dívida/receita > 1,5 | 20% se > 0,8
               | 25% padrão | 30% se clube com boa governança e baixa dívida
   ═══════════════════════════════════════════════════════════════════════ */
const CLUBS=[
  /* ── SÉRIE A ─────────────────────────────────────────────────────────── */
  // URU3 (Flamengo) — EV R$5,1bi (Sports Value 2025) | plantel R$1,4bi (Transfermarkt) | marca R$2,37bi | dívida baixa
  {ticker:"URU3",name:"Urubu da Gávea FC",       realName:"Flamengo",        div:"A",color:"#E32B28",c2:"#fff",sent:0.82,
   rev:1540, evMult:3.8, squad:1400, brand:2374, debt:310, ff:0.28,
   revenueLabel:"R$1,54bi"},

  // POR4 (Palmeiras) — EV R$4,4bi | plantel R$1,6bi (maior do Brasil) | marca R$1,57bi | dívida baixíssima
  {ticker:"POR4",name:"Porco do Parque FC",       realName:"Palmeiras",       div:"A",color:"#006432",c2:"#fff",sent:0.70,
   rev:1380, evMult:4.2, squad:1600, brand:1569, debt:180, ff:0.30,
   revenueLabel:"R$1,38bi"},

  // TIM3 (Corinthians) — EV R$3,97bi | plantel R$620M | marca R$1,43bi | maior dívida do futebol brasileiro R$1,9bi
  {ticker:"TIM3",name:"Timão do São Jorge FC",    realName:"Corinthians",     div:"A",color:"#444",   c2:"#fff",sent:-0.45,
   rev:1150, evMult:2.2, squad:620,  brand:1429, debt:1902,ff:0.15,
   revenueLabel:"R$1,15bi"},

  // TRI4 (São Paulo) — EV R$3,24bi | plantel R$495M | marca R$1,11bi | dívida relevante
  {ticker:"TRI4",name:"Tricolor do Morumbi AC",   realName:"São Paulo FC",    div:"A",color:"#C40A0A",c2:"#fff",sent:0.22,
   rev:780,  evMult:2.8, squad:495,  brand:1109, debt:852, ff:0.20,
   revenueLabel:"R$780M"},

  // GAL3 (Atlético-MG) — EV R$3,37bi | plantel R$483M | dívida R$1,37bi (SAF)
  {ticker:"GAL3",name:"Galo da Lagoinha FC",      realName:"Atlético Mineiro",div:"A",color:"#222",   c2:"#fff",sent:0.55,
   rev:720,  evMult:3.0, squad:483,  brand:772,  debt:1369,ff:0.17,
   revenueLabel:"R$720M"},

  // FOG3 (Botafogo) — EV R$3,05bi | plantel R$1,0bi | dívida R$1,1bi (SAF)
  {ticker:"FOG3",name:"Estrela do General Severiano RC",realName:"Botafogo",  div:"A",color:"#111",c2:"#d4af37",sent:0.82,
   rev:720,  evMult:3.2, squad:1000, brand:890,  debt:1100,ff:0.18,
   revenueLabel:"R$720M"},

  // COL3 (Internacional) — EV R$2,59bi | plantel R$545M | dívida R$834M
  {ticker:"COL3",name:"Colorado do Beira-Rio SC", realName:"Internacional",   div:"A",color:"#CC0000",c2:"#fff",sent:-0.28,
   rev:560,  evMult:2.5, squad:545,  brand:520,  debt:834, ff:0.20,
   revenueLabel:"R$560M"},

  // IMO3 (Grêmio) — plantel R$422M | sem SAF, gestão estável
  {ticker:"IMO3",name:"Imortal da Arena FC",      realName:"Grêmio",          div:"A",color:"#003DA5",c2:"#fff",sent:-0.12,
   rev:510,  evMult:2.2, squad:422,  brand:480,  debt:420, ff:0.22,
   revenueLabel:"R$510M"},

  // RAP3 (Cruzeiro) — EV R$2,83bi | crescimento acelerado (SAF) | dívida histórica ainda alta
  {ticker:"RAP3",name:"Raposa do Mineirão FC",    realName:"Cruzeiro",        div:"A",color:"#003087",c2:"#fff",sent:0.58,
   rev:460,  evMult:2.8, squad:350,  brand:432,  debt:680, ff:0.20,
   revenueLabel:"R$460M"},

  // MAL4 (Vasco) — SAF com aporte John Textor, mas dívida ainda alta
  {ticker:"MAL4",name:"Cruz de Malta de São Januário SC",realName:"Vasco da Gama",div:"A",color:"#111",c2:"#fff",sent:-0.18,
   rev:340,  evMult:2.0, squad:380,  brand:360,  debt:760, ff:0.17,
   revenueLabel:"R$340M"},

  // TRI3 (Bahia) — City Football Group, crescimento rápido: EV R$1,78bi em 2026
  {ticker:"TRI3",name:"Tricolor da Fonte Nova FC",realName:"Bahia",           div:"A",color:"#003DA5",c2:"#fff",sent:0.48,
   rev:520,  evMult:2.8, squad:323,  brand:560,  debt:821, ff:0.18,
   revenueLabel:"R$520M"},

  // GUE4 (Fluminense) — EV R$2,09bi | plantel R$600M | dívida moderada
  {ticker:"GUE4",name:"Guerreiro das Laranjeiras AC",realName:"Fluminense",   div:"A",color:"#8B0000",c2:"#fff",sent:0.20,
   rev:440,  evMult:2.4, squad:600,  brand:580,  debt:520, ff:0.22,
   revenueLabel:"R$440M"},

  // TOR3 (RB Bragantino) — Red Bull, boa gestão, dívida baixa
  {ticker:"TOR3",name:"Touro do Nabi FC",         realName:"RB Bragantino",   div:"A",color:"#CC0000",c2:"#fff",sent:0.42,
   rev:310,  evMult:2.2, squad:395,  brand:290,  debt:150, ff:0.26,
   revenueLabel:"R$310M"},

  // LEM3 (Mirassol) — estreante na Série A, estrutura pequena
  {ticker:"LEM3",name:"Leãozinho do Maião FC",    realName:"Mirassol FC",     div:"A",color:"#F5C400",c2:"#111",sent:0.60,
   rev:90,   evMult:1.5, squad:85,   brand:65,   debt:35,  ff:0.28,
   revenueLabel:"R$90M"},

  // BAL4 (Santos) — histórico valorizado, crise recente (rebaixou em 2023), recuperando
  {ticker:"BAL4",name:"Baleia da Vila Belmiro SC", realName:"Santos FC",      div:"A",color:"#000000",c2:"#fff",sent:0.30,
   rev:390,  evMult:1.8, squad:280,  brand:420,  debt:480, ff:0.20,
   revenueLabel:"R$390M"},

  // FUR3 (Athletico-PR) — EV R$2,1bi | SAF, gestão profissional
  {ticker:"FUR3",name:"Furacão do Capão da Imbuia FC",realName:"Athletico-PR",div:"A",color:"#CC0000",c2:"#000",sent:0.35,
   rev:310,  evMult:2.2, squad:375,  brand:380,  debt:290, ff:0.24,
   revenueLabel:"R$310M"},

  // VOA4 (Coritiba) — menor porte, dívida administrável
  {ticker:"VOA4",name:"Vovô Alemão do Couto FC",  realName:"Coritiba FC",     div:"A",color:"#006400",c2:"#fff",sent:0.12,
   rev:150,  evMult:1.5, squad:140,  brand:120,  debt:180, ff:0.20,
   revenueLabel:"R$150M"},

  // CON3 (Chapecoense) — reconstrução, baixo valuation
  {ticker:"CON3",name:"Condá da Arena Verde FC",  realName:"Chapecoense",     div:"A",color:"#006400",c2:"#fff",sent:0.22,
   rev:65,   evMult:1.2, squad:55,   brand:70,   debt:60,  ff:0.24,
   revenueLabel:"R$65M"},

  // LEA3 (Remo) — menor porte
  {ticker:"LEA3",name:"Leão Azul do Baenão RC",  realName:"Clube do Remo",    div:"A",color:"#003DA5",c2:"#fff",sent:0.65,
   rev:50,   evMult:1.2, squad:40,   brand:45,   debt:30,  ff:0.26,
   revenueLabel:"R$50M"},

  // LEB3 (Vitória) — SAF, estabilizando após turbulências
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

/* Nomes reais dos clubes (para exibição na tela de cadastro) */
const REAL_NAMES={
  URU3:"Flamengo",      POR4:"Palmeiras",       TIM3:"Corinthians",
  TRI4:"São Paulo",     GAL3:"Atlético-MG",     FOG3:"Botafogo",
  COL3:"Internacional", IMO3:"Grêmio",          RAP3:"Cruzeiro",
  MAL4:"Vasco",         TRI3:"Bahia",           GUE4:"Fluminense",
  TOR3:"Bragantino",    LEM3:"Mirassol",        BAL4:"Santos",
  FUR3:"Athletico-PR",  VOA4:"Coritiba",        CON3:"Chapecoense",
  LEA3:"Remo",          LEB3:"Vitória",
  // Série B
  COE3:"América-MG",    CAV4:"Athletic-MG",     DRA3:"Atlético-GO",
  LEI4:"Avaí",          PAN3:"Botafogo-SP",     VOZ3:"Ceará",
  GAP3:"CRB",           TIG4:"Criciúma",        DOU4:"Cuiabá",
  LEP4:"Fortaleza",     PER3:"Goiás",           IND4:"Juventude",
  TUB3:"Londrina",      NAF3:"Náutico",         TIV3:"Novorizontino",
  FAS3:"Operário-PR",   MAC4:"Ponte Preta",     ABT4:"São Bernardo",
  LEI3:"Sport",         TIS3:"Vila Nova",
};

/* ── Aliases de ticker — normaliza retornos incorretos da IA ──────────
   Mapa espelhado do backend. Corrige tickers inventados pelo modelo
   antes de validar contra CLUBS.
─────────────────────────────────────────────────────────────────────── */
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

/** Normaliza ticker: corrige alias e valida existência em CLUBS */
function normalizeTicker(raw){
  if(!raw) return null;
  const upper=String(raw).toUpperCase().trim();
  const resolved=TICKER_ALIASES[upper]||upper;
  return VALID_TICKERS.has(resolved)?resolved:null;
}

/* ── Cálculo de IPO multi-fator (Sports Value / KPMG 2025) ─────────────────
   Passo 1 — calcula float de cada clube:
     EV     = (rev × evMult × 1e6) + (squad × 1e6) + (brand × 1e6)
     Equity = max(EV − debt × 1e6,  EV × 0.10)   ← floor 10% do EV bruto
     Float  = Equity × ff

   Passo 2 — define preço IPO por escala logarítmica do float dentro da divisão:
     Clube com maior float da divisão → preço máximo do range
     Clube com menor float → preço mínimo
     Escala log evita que grandes diferenças absolutas de float comprimam
     os clubes menores numa banda estreita de preços (problema da escala linear)
     Range Série A: FS$8 – FS$40  |  Série B: FS$3 – FS$12

   Passo 3 — totalShares = Float / Preço (arredondado ao 100k)
   Resultado: preço reflete tamanho real do clube, não um alvo arbitrário.
────────────────────────────────────────────────────────────────────────── */
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

/* Pool global de cotas disponíveis (começa no float total do IPO)
   Decresce quando usuários compram, cresce quando vendem.
   INVARIANTE: sharesInMarket[t] + Σ wallet[t].qty de todos usuários = totalShares[t] */
const INITIAL_SUPPLY = Object.fromEntries(CLUBS.map(c=>[c.ticker, c.totalShares]));

/* ── Âncora Fundamentalista (Fair Value) ────────────────────────────────────
   Usa a mesma fórmula multi-fator do IPO como âncora de mean-reversion.
   O motor de mercado deriva gradualmente de volta a este valor quando não
   há notícias ou pressão de ordem, evitando drift indefinido.             */
const FUNDAMENTAL_FV = Object.fromEntries(
  CLUBS.map(c=>{
    const evBruto  = (c.rev * c.evMult + c.squad + c.brand) * 1e6;
    const equity   = Math.max(evBruto - c.debt * 1e6, evBruto * 0.10);
    const float    = equity * c.ff;
    const fv       = +(float / c.totalShares).toFixed(2);
    return [c.ticker, fv || c.ipoPrice || c.price];
  })
);

/* ═══════════════════════════════════════════════════════════════
   MOTOR DE MERCADO — 6 camadas (igual mercados reais B3)
   ─────────────────────────────────────────────────────────────
   1. ORNSTEIN-UHLENBECK  price gravita ao fair value (mean reversion)
   2. GARCH-LITE          volatilidade sobe após grandes movimentos
   3. ORDER FLOW IMBALANCE pressão acumulada compra vs venda
   4. KYLE'S LAMBDA       impacto de preço por ordem do usuário
   5. IMPACT MATRIX       choque fundamental por categoria de notícia
   6. CIRCUIT BREAKER     trava o ativo se variação ≥ 8%
   // 2026-05-14: corrigido typo do header (motor sempre usou 8% em prod, coerente com VELOCITY_CAP 0.025 = 2.5%/tick)
═══════════════════════════════════════════════════════════════ */

/* Parâmetros de microestrutura calibrados por ativo */
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
  // Série B — maior volatilidade estrutural, menor float
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
  // Série A — completando os 20 times
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

const IMPACT_MATRIX={
  /* Calibrado para movimentos realistas (ref: SAF B3, clubes europeus)
     Financeira Crítica  ±5%  | Esportiva Maior ±3% | Mercado Ativos ±2%
     Integridade/Saúde ±1.5% | Institucional ±1%   | Esportiva Menor ±0.5% */
  "Financeira Crítica":0.05,
  "Esportiva Majoritária":0.03,
  "Mercado de Ativos":0.02,
  "Integridade/Saúde":0.015,
  "Institucional":0.01,
  "Esportiva Menor":0.005,
};

const NEWS_POOL=[
  // Série A
  {ticker:"URU3", cat:"Financeira Crítica",    sent:+0.90,headline:"Urubu da Gávea fecha patrocínio master de R$120M",emoji:"💰"},
  {ticker:"TIM3", cat:"Financeira Crítica",    sent:-0.88,headline:"Timão do São Jorge sofre bloqueio judicial de R$85M",emoji:"⚖️"},
  {ticker:"MAL4", cat:"Financeira Crítica",    sent:-0.75,headline:"Cruz de Malta anuncia atraso de salários pelo 3º mês",emoji:"💸"},
  {ticker:"FOG3", cat:"Financeira Crítica",    sent:+0.82,headline:"Estrela do General Severiano: aporte de US$300M aprovado",emoji:"🏦"},
  {ticker:"COL3", cat:"Financeira Crítica",    sent:-0.70,headline:"Colorado do Beira-Rio tem receita 40% abaixo do projetado",emoji:"📉"},
  {ticker:"FOG3", cat:"Esportiva Majoritária", sent:+0.95,headline:"Estrela do General Severiano é campeão da Libertadores 4×0",emoji:"🏆"},
  {ticker:"URU3", cat:"Esportiva Majoritária", sent:+0.78,headline:"Urubu da Gávea vence clássico e abre 8 pts na liderança",emoji:"🥇"},
  {ticker:"TIM3", cat:"Esportiva Majoritária", sent:-0.85,headline:"Timão do São Jorge eliminado da Copa do Brasil",emoji:"❌"},
  {ticker:"POR4", cat:"Esportiva Majoritária", sent:+0.72,headline:"Porco do Parque confirma título antecipado com goleada",emoji:"🎖️"},
  {ticker:"IMO3", cat:"Esportiva Majoritária", sent:-0.68,headline:"Imortal da Arena perde invicto e cai para rebaixamento",emoji:"⬇️"},
  {ticker:"RAP3", cat:"Esportiva Majoritária", sent:+0.65,headline:"Raposa do Mineirão goleia e assume liderança do grupo",emoji:"🏅"},
  {ticker:"POR4", cat:"Mercado de Ativos",     sent:+0.60,headline:"Porco do Parque renova artilheiro por 4 anos, R$22M/ano",emoji:"📋"},
  {ticker:"URU3", cat:"Mercado de Ativos",     sent:-0.55,headline:"Urubu da Gávea vende atacante ao PSG por €45M",emoji:"✈️"},
  {ticker:"GAL3", cat:"Mercado de Ativos",     sent:+0.58,headline:"Galo da Lagoinha contrata meia da seleção por R$60M",emoji:"🌟"},
  {ticker:"TRI4", cat:"Integridade/Saúde",     sent:-0.80,headline:"Tricolor do Morumbi: capitão suspenso por doping confirmado",emoji:"🚨"},
  {ticker:"MAL4", cat:"Integridade/Saúde",     sent:-0.72,headline:"Cruz de Malta: goleiro fora por 3 meses com fratura",emoji:"🩺"},
  {ticker:"TIM3", cat:"Institucional",         sent:+0.45,headline:"Timão do São Jorge elege presidente com plano de reestruturação",emoji:"🗳️"},
  {ticker:"GAL3", cat:"Institucional",         sent:+0.50,headline:"Galo da Lagoinha recebe investidor estrangeiro de R$80M",emoji:"🤝"},
  {ticker:"URU3", cat:"Esportiva Menor",       sent:+0.30,headline:"Urubu da Gávea vence jogo-treino com reservas 3×1",emoji:"🔄"},
  {ticker:"FOG3", cat:"Esportiva Menor",       sent:+0.28,headline:"Estrela do General Severiano promove três jovens da base",emoji:"🌱"},
  // Série B
  {ticker:"LEP4", cat:"Financeira Crítica",    sent:-0.65,headline:"Leão do Pici tem dívida de R$35M renegociada com banco",emoji:"💸"},
  {ticker:"VOZ3", cat:"Financeira Crítica",    sent:-0.60,headline:"Vovô do Castelão anuncia corte salarial de 20% no elenco",emoji:"📉"},
  {ticker:"IND4", cat:"Financeira Crítica",    sent:-0.72,headline:"Índio da Serra Gaúcha rebaixado aumenta rombo financeiro",emoji:"⚖️"},
  {ticker:"LEP4", cat:"Esportiva Majoritária", sent:+0.85,headline:"Leão do Pici golea rival e assume liderança da Série B",emoji:"🏅"},
  {ticker:"VOZ3", cat:"Esportiva Majoritária", sent:-0.78,headline:"Vovô do Castelão perde derby e afunda no Z-4",emoji:"⬇️"},
  {ticker:"TIG4", cat:"Esportiva Majoritária", sent:+0.70,headline:"Tigre do Heriberto vence fora e sobe para o G-4",emoji:"🥇"},
  {ticker:"MAC4", cat:"Esportiva Majoritária", sent:+0.68,headline:"Macaca do Majestoso invicta há 7 rodadas na Série B",emoji:"🎖️"},
  {ticker:"LEI3", cat:"Esportiva Majoritária", sent:-0.65,headline:"Leão da Ilha do Retiro perde artilheiro para lesão grave",emoji:"🩺"},
  {ticker:"TIV3", cat:"Mercado de Ativos",     sent:+0.55,headline:"Tigre do Vale do Peixe vende jovem ao Benfica por €3M",emoji:"✈️"},
  {ticker:"COE3", cat:"Mercado de Ativos",     sent:+0.50,headline:"Coelho do Calafate contrata ex-Série A sem custos",emoji:"📋"},
  {ticker:"GAP3", cat:"Integridade/Saúde",     sent:-0.60,headline:"Galo da Pajuçara: três atletas com infecção viral fora do jogo",emoji:"🚨"},
  {ticker:"FAS3", cat:"Institucional",         sent:+0.40,headline:"Fantasma dos Campos Gerais anuncia novo CT por R$8M",emoji:"🤝"},
  {ticker:"DOU4", cat:"Institucional",         sent:-0.35,headline:"Dourado do Pantanal troca comissão técnica pela 2ª vez",emoji:"🗳️"},
  {ticker:"PAN3", cat:"Esportiva Menor",       sent:+0.25,headline:"Pantera da Mogiana promove dois jovens da base para o elenco",emoji:"🌱"},
  {ticker:"TUB3", cat:"Esportiva Menor",       sent:+0.22,headline:"Tubarão do Café vence jogo-treino e retoma confiança",emoji:"🔄"},
  // Série A — times novos
  {ticker:"TRI3", cat:"Financeira Crítica",    sent:+0.72,headline:"Tricolor da Fonte Nova fecha parceria de R$80M com grupo saudita",emoji:"💰"},
  {ticker:"GUE4", cat:"Financeira Crítica",    sent:-0.60,headline:"Guerreiro das Laranjeiras anuncia déficit de R$40M no semestre",emoji:"📉"},
  {ticker:"TOR3", cat:"Mercado de Ativos",     sent:+0.65,headline:"Touro do Nabi vende centroavante ao futebol europeu por €8M",emoji:"✈️"},
  {ticker:"LEM3", cat:"Esportiva Majoritária", sent:+0.80,headline:"Leãozinho do Maião surpreende e derruba favorito na Copa do Brasil",emoji:"🏆"},
  {ticker:"BAL4", cat:"Mercado de Ativos",     sent:+0.70,headline:"Baleia da Vila Belmiro anuncia retorno de ídolo histórico ao clube",emoji:"🌟"},
  {ticker:"FUR3", cat:"Esportiva Majoritária", sent:+0.62,headline:"Furacão do Capão da Imbuia vence clássico e entra no G-4",emoji:"🥇"},
  {ticker:"VOA4", cat:"Institucional",         sent:+0.35,headline:"Vovô Alemão do Couto anuncia parceria com fundo de investimento paranaense",emoji:"🤝"},
  {ticker:"CON3", cat:"Integridade/Saúde",     sent:-0.55,headline:"Condá da Arena Verde tem três titulares suspensos para sequência",emoji:"🚨"},
  {ticker:"LEA3", cat:"Esportiva Majoritária", sent:+0.88,headline:"Leão Azul do Baenão faz história na 1ª Série A em 32 anos",emoji:"🏅"},
  {ticker:"LEB3", cat:"Esportiva Majoritária", sent:+0.70,headline:"Leão da Barra vence Ba-Vi no Barradão com gol nos acréscimos",emoji:"🥇"},
  {ticker:"LEB3", cat:"Financeira Crítica",    sent:-0.50,headline:"Leão da Barra anuncia parcelamento de dívida de R$28M com banco",emoji:"💸"},
];

/* ── Gerador de série temporal para dashboard ── */
function seededRng(seed){let s=seed;return()=>{s=(s*16807+0)%2147483647;return(s-1)/2147483646;};}
function genPortfolioSeries(pts,startVal,vol,drift,seed=42){
  const rng=seededRng(seed);const arr=[];let v=startVal;
  for(let i=0;i<pts;i++){const shock=(rng()-0.46)*vol*v;v=Math.max(v*0.5,v+shock+drift*v);arr.push(+v.toFixed(2));}
  return arr;
}
const DASH_PERIODS={
  "1H":  {pts:60, vol:0.003, drift:0.00008, seed:11},
  "12H": {pts:144,vol:0.006, drift:0.0002,  seed:22},
  "24H": {pts:96, vol:0.009, drift:0.0003,  seed:33},
  "7D":  {pts:168,vol:0.013, drift:0.0005,  seed:44},
  "30D": {pts:120,vol:0.018, drift:0.0008,  seed:55},
  "1A":  {pts:252,vol:0.022, drift:0.001,   seed:66},
  "TOTAL":{pts:300,vol:0.025,drift:0.0012,  seed:77},
};

/* ── SVG chart do dashboard ── */
function DashChart({data,color,width=340,height=160}){
  const PX=6,PY=14,W=width-PX*2,H=height-PY*2,n=data.length;
  const min=Math.min(...data),max=Math.max(...data),rng=max-min||1;
  const toX=i=>PX+(i/(n-1))*W, toY=v=>PY+((max-v)/rng)*H;
  const pts=data.map((v,i)=>`${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const poly=`${PX},${PY+H} ${pts} ${PX+W},${PY+H}`;
  const gId=`dg${color.replace("#","")}`;
  const [hov,setHov]=useState(null);
  return(
    <svg width="100%" viewBox={`0 0 ${width} ${height}`}
      style={{display:"block",cursor:"crosshair",userSelect:"none"}}
      onMouseMove={e=>{const r=e.currentTarget.getBoundingClientRect();const xp=(e.clientX-r.left)/r.width;setHov(Math.min(n-1,Math.max(0,Math.round(xp*(n-1)))));}}
      onMouseLeave={()=>setHov(null)}>
      <defs>
        <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22"/>
          <stop offset="80%" stopColor={color} stopOpacity="0.02"/>
        </linearGradient>
        <filter id="dglow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      {[0.25,0.5,0.75].map((t,i)=>(
        <line key={i} x1={PX} x2={PX+W} y1={PY+t*H} y2={PY+t*H} stroke={BORDER} strokeWidth="1" strokeDasharray="3 4"/>
      ))}
      <line x1={PX} x2={PX+W} y1={toY(data[0])} y2={toY(data[0])} stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4 3"/>
      <polygon points={poly} fill={`url(#${gId})`}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" filter="url(#dglow)"/>
      {hov!==null&&<>
        <line x1={toX(hov)} x2={toX(hov)} y1={PY} y2={PY+H} stroke="rgba(255,255,255,.12)" strokeWidth="1" strokeDasharray="3 3"/>
        <circle cx={toX(hov)} cy={toY(data[hov])} r="4" fill={color} stroke={BG} strokeWidth="2" filter="url(#dglow)"/>
        {(()=>{
          const tx=toX(hov),ty=toY(data[hov]),bW=88,bH=26;
          const bx=Math.min(Math.max(tx-bW/2,PX),PX+W-bW),by=ty-bH-7<PY?ty+8:ty-bH-7;
          return <g>
            <rect x={bx} y={by} width={bW} height={bH} rx="5" fill={SURFACE} stroke={color} strokeOpacity=".35" strokeWidth="1"/>
            <text x={bx+bW/2} y={by+10} textAnchor="middle" fontSize="7" fill={MUTED} fontFamily={SANS} fontWeight="700" letterSpacing="0.5">CARTEIRA</text>
            <text x={bx+bW/2} y={by+21} textAnchor="middle" fontSize="10" fill={color} fontFamily={MONO} fontWeight="700">
              {`FS$${data[hov].toLocaleString("pt-BR",{minimumFractionDigits:2})}`}
            </text>
          </g>;
        })()}
      </>}
      <circle cx={toX(n-1)} cy={toY(data[n-1])} r="3.5" fill={color} stroke={BG} strokeWidth="2"/>
    </svg>
  );
}

/* ── Mini sparkline ── */
function MiniSpark2({up,w=54,h=20,seed=1}){
  const rng=seededRng(seed);const pts=[];let y=h*.5;
  for(let i=0;i<14;i++){y+=(rng()-(up?.42:.58))*h*.35;y=Math.max(3,Math.min(h-3,y));pts.push(`${i*(w/13)},${y}`);}
  const col=up?ACCENT:RED;
  return(
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:"block",flexShrink:0}}>
      <defs><linearGradient id={`ms${seed}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity=".22"/><stop offset="100%" stopColor={col} stopOpacity="0"/></linearGradient></defs>
      <polygon points={`0,${h} ${pts.join(" ")} ${w},${h}`} fill={`url(#ms${seed})`}/>
      <polyline points={pts.join(" ")} fill="none" stroke={col} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/* ── Funções de microestrutura ── */
function boxMuller(){
  let u=0,v=0;
  while(!u)u=Math.random(); while(!v)v=Math.random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}
// Ornstein-Uhlenbeck: dP = θ(μ−P)dt + σε√dt
function ouStep(P,fv,params,volMult=1){
  const dt=1/390, sigma=params.vol*volMult;
  const drift=params.theta*(fv-P)*dt;
  const shock=sigma*boxMuller()*Math.sqrt(dt);
  return Math.max(0.01,+(P*(1+drift+shock)).toFixed(2));
}
// GARCH(1,1): σ²_t = ω + α·r²_(t−1) + β·σ²_(t−1)  [B3-calibrated]
function garch(v,r){return 0.000002+0.12*r*r+0.85*v;}
/* ── Kyle's Lambda v3 ──────────────────────────────────────────────────────
   Calibrado para B3 mid-cap: impacto linear por notional/float.
   R$28k em Série A → ~0.06% | R$4.5k em Série B → ~0.19%
   Cap: A ±0.15% por ordem | B ±0.30% por ordem                            */
function kyleLambda(P,qty,side,params){
  const sign=side==="buy"?1:-1;
  const notional=qty*P;
  const lambda=0.15/params.float; // linear, proporcional ao float
  const rawImpact=sign*lambda*notional;
  const cap=params.float<1e6?0.003:0.0015; // B: ±0.3%, A: ±0.15%
  return Math.max(0.01,+(P*(1+Math.max(-cap,Math.min(cap,rawImpact)))).toFixed(2));
}
// Spread bid/ask alargado pelo imbalance atual
function bidAsk(P,params,imb=0){
  const h=P*params.spread*0.5*(1+Math.abs(imb));
  return {bid:+(P-h).toFixed(2),ask:+(P+h).toFixed(2)};
}
// Choque de notícia via impact matrix
function newsShock(P,cat,sent){
  const base=IMPACT_MATRIX[cat]||0.005;
  // Cap spot impact a ±2.5% — restante absorvido gradualmente via FV drift
  const spotCap=0.025;
  const fullImpact=base*sent;
  const spotImpact=Math.max(-spotCap,Math.min(spotCap,fullImpact));
  return +(P*(1+spotImpact)).toFixed(2);
}

/* ── Correlação entre ativos — Cholesky simplificado ────────────────────────
   Agrupa ativos em clusters com rho (correlação intra-cluster) diferente.
   A cada tick do motor, um choque sistêmico z_sys é gerado por cluster.
   Retorno de cada ativo = sqrt(rho)×z_sys + sqrt(1-rho)×z_idio (Cholesky).
   Isso cria correlação emergente sem matriz 38×38.

   Clusters:
   A_TOP  : grandes da Série A (URU3, POR4, TIM3, FOG3, GAL3) — rho=0.35
   A_MID  : médios da Série A (10 clubes)                      — rho=0.15
   A_SMALL: pequenos da Série A (5 clubes)                     — rho=0.08
   B_ALL  : toda a Série B (20 clubes)                         — rho=0.05

   Adicionalmente, um micro-choque regional correlaciona clubes do mesmo
   estado (RJ, SP, MG, RS) com rho=0.10 — simula notícias regionais.     */
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
// Índice invertido: ticker → {clusterKey, rho}
const TICKER_CLUSTER=Object.fromEntries(
  Object.entries(CORR_CLUSTERS).flatMap(([key,{tickers,rho}])=>
    tickers.map(t=>[t,{clusterKey:key,rho}])
  )
);
// Correlação regional adicional (rho=0.10)
const REGIONAL_CLUSTERS={
  RJ:["URU3","FOG3","MAL4","GUE4"],
  SP:["POR4","TIM3","TRI4","TOR3","LEM3","BAL4"],
  MG:["GAL3","RAP3"],
  RS:["COL3","IMO3"],
  PR:["FUR3","VOA4"],
  BA:["TRI3","LEB3"],
};
const REGIONAL_RHO=0.10;

/* ── Sessões de mercado B3 (horário de Brasília) ── */
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

/* ── Hook principal ── */
function useMarket(){
  const init=f=>Object.fromEntries(CLUBS.map(c=>[c.ticker,f(c)]));
  const [prices,   setP]  =useState(()=>init(c=>c.price));
  const [fv,       setFV] =useState(()=>init(c=>FUNDAMENTAL_FV[c.ticker]||c.price));
  const [vari,     setV]  =useState(()=>init(c=>MP[c.ticker]?.vol**2||4e-6));
  const [imb,      setImb]=useState(()=>init(()=>0));
  const [book,     setBook]=useState(()=>init(c=>bidAsk(c.price,MP[c.ticker]||{spread:.004})));
  const [vol24,    setVol]=useState(()=>init(()=>0));
  // Preço de abertura do pregão (snap na transição pre→main) — base da variação diária
  const [openPrices,setOpenP]=useState(()=>init(c=>c.price));
  // Preço de fechamento do dia anterior (snap na transição main→closing) — para gráficos históricos
  const [prevCloses,setPrevC]=useState(()=>init(c=>c.price));
  const rOpenP=useRef(openPrices);
  useEffect(()=>{rOpenP.current=openPrices;},[openPrices]);
  // Controla se o snap de abertura já foi feito nesta sessão
  const lastSessionId=useRef("closed");

  /* ── Camada 1: Velocity Cap ──────────────────────────────────────────
     Limite máximo de variação por tick: 0.35% (≈ 0.7%/s em pico)
     Aplicado APÓS o ouStep — corta excessos independente da causa       */
  const VELOCITY_CAP=0.0035; // 0.35% por tick (2s)

  /* ── Camada 2: Daily Vol Target ──────────────────────────────────────
     Meta de volatilidade diária: 2.5% (1σ realista B3 mid-cap)
     À medida que a ação acumula movimento no dia, o sigma escala ↓
     dailyMoved[ticker] = |retorno acumulado desde abertura| no dia      */
  const DAILY_VOL_TARGET=0.025; // 2.5% meta diária
  const dailyMoved=useRef({}); // acumulado intraday por ticker
  // Reset dailyMoved a cada nova sessão main (novo pregão)
  const lastResetSession=useRef("closed");

  /* ── Camada 3: News Absorption Queue ────────────────────────────────
     Quando uma notícia dispara, o impacto total no FV é dividido em
     ABSORPTION_TICKS passos iguais. A cada tick do engine, o FV avança
     1/ABSORPTION_TICKS do caminho restante → price discovery gradual.
     newsAbsorption[ticker] = {targetFV, remainingTicks}              */
  const ABSORPTION_TICKS=40; // ~80s para absorção completa (mais gradual)
  const newsAbsorption=useRef({}); // {ticker: {targetFV, step, totalSteps}}

  /* ── Melhoria 1: Reversão fundamentalista do FV ─────────────────────────
     Quando não há absorção de notícia ativa, o FV deriva lentamente de
     volta ao FUNDAMENTAL_FV (0.3% da distância por tick = ~10min para 50%).
     Isso evita que o FV derive indefinidamente por efeitos cumulativos.   */
  const FUNDAMENTAL_REVERSION_RATE=0.003; // 0.3% da distância por tick
  const [sent,     setSent]=useState(()=>init(c=>c.sent));
  const [news,     setNews]=useState(null);
  const [newsLog,  setNL]  =useState([]);
  const [cb,       setCb]  =useState({});

  // FIX 1: todos os estados voláteis guardados em refs para intervalos/closures
  const rP  =useRef(prices), rFV =useRef(fv),   rV  =useRef(vari);
  const rImb=useRef(imb),    rCb =useRef(cb);
  useEffect(()=>{rP.current  =prices;},[prices]);
  useEffect(()=>{rFV.current =fv;},[fv]);
  useEffect(()=>{rV.current  =vari;},[vari]);
  useEffect(()=>{rImb.current=imb;},[imb]);
  useEffect(()=>{rCb.current =cb;},[cb]);

  /* ── Fase 3 & 4: refs externos injetados pelo MainApp ───────────────────
     supplyRef: float disponível por ticker (alimenta market maker e impacto)
     sentRef:   sentimento atual por ticker (alimenta agente de liquidez)   */
  const supplyRef=useRef({}); // injetado pelo MainApp via setSupplyRef
  const rSent=useRef({}); // espelho de sent para closures
  useEffect(()=>{rSent.current=sent;},[sent]);
  // Expõe setter para MainApp injetar supply
  const setSupplyRef=(s)=>{supplyRef.current=s;};

  /* ── Melhoria 4: refs dos choques sistêmicos por cluster ─────────────────
     sysShock[clusterKey] = z_sys gerado no tick atual (Box-Muller)
     regionalShock[regionKey] = z_reg gerado no tick atual
     Ambos são regenerados a cada tick do motor.                            */
  const sysShock=useRef({});    // {A_TOP: z, A_MID: z, ...}
  const regionalShock=useRef({}); // {RJ: z, SP: z, ...}

  /* ── Melhoria 7: Memória de preço para o agente ─────────────────────────
     Mantém os últimos 15 preços (30s) de cada ativo para calcular:
     - recentReturn: retorno % nos últimos 15 ticks
     - momentum: sinal de tendência recente (+1 subindo, -1 caindo)
     O agente usa momentum para decidir side:
     - Tendência de alta + sent positivo → reforça compra (trend following)
     - Tendência muito alta → aumenta chance de venda (mean reversion)
     priceHistory[ticker] = [p0, p1, ..., p14] (circular, mais recente no fim) */
  const priceHistory=useRef({}); // {ticker: Float32Array(15)}
  const HISTORY_LEN=15;

  /* ── Fase 1: registerOrder — Kyle's Lambda v2 + OFI calibrado ──────────
     O impacto SPOT agora usa a lei de raiz quadrada (sub-linear, realista).
     Para ordens grandes o preço move mais, mas com retorno decrescente.
     O FV também é ajustado levemente para persistir o sinal da ordem.     */
  const registerOrder=(ticker,qty,side)=>{
    const p=MP[ticker]||{spread:.004,float:5e6,vol:.002,theta:.13};
    const curP=rP.current[ticker]||CLUBS.find(c=>c.ticker===ticker)?.price||10;
    const curFV=rFV.current[ticker]||curP;
    const sign=side==="buy"?1:-1;
    const notional=qty*curP;

    // Impacto spot via Kyle's Lambda v2 × supply scaling (Fase 3)
    const scale=supplyScaling(ticker);
    const scaledQty=qty*scale; // amplifica impacto conforme escassez
    const np=kyleLambda(curP,scaledQty,side,p);
    const spotImpact=(np-curP)/curP;
    const r=spotImpact;

    // OFI: imbalance proporcional ao notional/float
    const imbCap=p.float<1e6?0.20:0.10;
    const imbDelta=sign*Math.min(Math.abs(notional/p.float)*0.8, imbCap);

    // FV drift leve pela ordem (pressão persistente, ~10% do spotImpact)
    const fvDrift=spotImpact*0.10;
    const newFV=+(curFV*(1+fvDrift)).toFixed(2);

    setP(prev=>({...prev,[ticker]:np}));
    setFV(f=>({...f,[ticker]:newFV}));
    setV(v=>({...v,[ticker]:garch(rV.current[ticker]||4e-6,r)}));
    setBook(b=>({...b,[ticker]:bidAsk(np,p,rImb.current[ticker]||0)}));
    setVol(vol=>({...vol,[ticker]:(vol[ticker]||0)+qty}));
    setImb(i=>({...i,[ticker]:Math.max(-1,Math.min(1,(i[ticker]||0)+imbDelta))}));
  };

  /* Session watcher: snaps openPrices on pre→main, prevCloses on main→closing */
  useEffect(()=>{
    const check=()=>{
      const sess=getMarketSession();
      const prev=lastSessionId.current;
      if(prev===sess.id) return;
      // Transição PRÉ → MAIN: snap openPrices + reset dailyMoved
      if(sess.id==="main" && prev!=="main"){
        setOpenP({...rP.current});
        dailyMoved.current={}; // zera acumulado do dia
        lastResetSession.current="main";
      }
      // Transição MAIN → LEILÃO: snap prevCloses para histórico
      if(sess.id==="closing" && prev==="main"){
        setPrevC({...rP.current});
      }
      lastSessionId.current=sess.id;
    };
    check(); // roda imediatamente
    const t=setInterval(check,15000);
    return()=>clearInterval(t);
  },[]);

  /* Tick engine: OU+GARCH a cada 2s
     FIX 1: usa rCb.current (não cb do closure)
     FIX 2: side effects fora do callback de setP
     FIX 4: OU drift usa retorno relativo ((fv-P)/P), não diferença absoluta */
  useEffect(()=>{
    const t=setInterval(()=>{
      const sess=getMarketSession();
      // Fora de qualquer sessão: preços congelados
      if(sess.id==="closed") return;
      // Fator de volatilidade por sessão
      const volFactor=sess.id==="main"?1:sess.id==="pre"?0.3:sess.id==="closing"?0.2:0.1;
      const newPrices={};
      const newV={}, newBook={}, newImb={};

      /* ── Melhoria 4: Gera choques sistêmicos por cluster ─────────────────
         Um z_sys por cluster + um z_reg por região a cada tick.
         Cada ativo usará esses valores no seu cálculo OU para correlação.  */
      Object.keys(CORR_CLUSTERS).forEach(key=>{
        sysShock.current[key]=boxMuller();
      });
      Object.keys(REGIONAL_CLUSTERS).forEach(key=>{
        regionalShock.current[key]=boxMuller();
      });

      /* ── Fase 2: Consome pressureQueue — ordens sintéticas de notícias ───
         A cada tick processa até 2 ordens da fila.                         */
      if(pressureQueue.current.length>0){
        const batchSize=Math.min(2,pressureQueue.current.length);
        for(let i=0;i<batchSize;i++){
          const order=pressureQueue.current.shift();
          if(!order) break;
          if(rCb.current[order.ticker]) continue;
          const pParams=MP[order.ticker]||{spread:.004,float:5e6,vol:.002,theta:.13};
          const curP2=rP.current[order.ticker]||10;
          const sign2=order.side==="buy"?1:-1;
          const notional2=order.qty*curP2;
          // Fase 3: aplica supply scaling também nas ordens sintéticas
          const scale2=supplyScaling(order.ticker);
          const np2=kyleLambda(curP2,order.qty*scale2,order.side,pParams);
          const r2=(np2-curP2)/curP2;
          const imbCap2=pParams.float<1e6?0.15:0.08;
          const imbDelta2=sign2*Math.min(Math.abs(notional2/pParams.float)*0.5,imbCap2);
          rP.current[order.ticker]=np2;
          rImb.current[order.ticker]=Math.max(-1,Math.min(1,(rImb.current[order.ticker]||0)+imbDelta2));
        }
      }

      /* ── Fase 4: Market Maker ─────────────────────────────────────────────
         Monitora spread e OFI. Se spread alargou >2× ou |imb| > 0.6,
         injeta ordem contrária para estabilizar o book.                    */
      CLUBS.forEach(c=>{
        if(rCb.current[c.ticker]) return;
        const pMM=MP[c.ticker]||{spread:.004,float:5e6,vol:.002,theta:.13};
        // Decrementa cooldown
        if((mmCooldown.current[c.ticker]||0)>0){mmCooldown.current[c.ticker]--;return;}
        const curImb=rImb.current[c.ticker]||0;
        const curP3=rP.current[c.ticker]||c.price;
        const ob=bidAsk(curP3,pMM,curImb);
        const spreadNow=(ob.ask-ob.bid)/curP3;
        const spreadBase=pMM.spread;
        const needsStabilization=spreadNow>spreadBase*3||Math.abs(curImb)>0.80;
        if(!needsStabilization) return;
        // Injeta ordem contrária ao imbalance atual
        const mmSide=curImb>0?"sell":"buy";
        const mmQty=Math.max(1,Math.round(pMM.float*MM_ORDER_SIZE_PCT));
        const signMM=mmSide==="buy"?1:-1;
        const notionalMM=mmQty*curP3;
        const npMM=kyleLambda(curP3,mmQty,mmSide,pMM);
        const imbDeltaMM=signMM*Math.min(Math.abs(notionalMM/pMM.float)*0.3,0.05);
        rP.current[c.ticker]=npMM;
        rImb.current[c.ticker]=Math.max(-1,Math.min(1,curImb+imbDeltaMM));
        mmCooldown.current[c.ticker]=MM_COOLDOWN_TICKS;
      });

      /* ── Agente de Liquidez v2 ───────────────────────────────────────────
         M2: perfis de liquidez distintos por ativo
         M5: pressão de notícia reduz impacto do lado oposto
         M7: memória de preço — momentum e mean reversion                  */
      CLUBS.forEach(c=>{
        if(rCb.current[c.ticker]) return;
        if((agentCooldown.current[c.ticker]||0)>0){agentCooldown.current[c.ticker]--;return;}

        // M2: perfil de liquidez do ativo
        const prof=getAgentProfile(c.ticker);
        const pA=MP[c.ticker]||{spread:.004,float:5e6,vol:.002,theta:.13};
        const sentVal=rSent.current[c.ticker]??c.sent??0;
        const imbVal=rImb.current[c.ticker]||0;
        const curPA=rP.current[c.ticker]||c.price;

        // M7: calcula retorno recente (momentum) dos últimos HISTORY_LEN ticks
        const hist=priceHistory.current[c.ticker];
        let recentReturn=0;
        if(hist&&hist.length>=2){
          const oldest=hist[0];
          recentReturn=oldest>0?(curPA-oldest)/oldest:0;
        }
        // momentum: +1 se subindo forte, -1 se caindo forte, 0 neutro
        // threshold: 0.5% de movimento nos últimos 30s
        const MOMENTUM_THRESH=0.005;
        const momentum=recentReturn>MOMENTUM_THRESH?1:recentReturn<-MOMENTUM_THRESH?-1:0;

        // Probabilidade de agir: base do perfil + viés de sentimento
        const actProb=prof.prob+Math.abs(sentVal)*0.10;
        if(Math.random()>actProb) return;

        /* M7: Decisão de side com três camadas:
           1. Sentimento fundamental (notícias)
           2. OFI atual (pressão de mercado)
           3. Momentum de preço:
              - trend-following leve: momentum reforça a direção
              - mean reversion fraca: se movimento muito extremo (>2%), aumenta contra */
        const MEAN_REV_THRESH=0.02;
        const meanRevSignal=recentReturn>MEAN_REV_THRESH?-0.10:
                            recentReturn<-MEAN_REV_THRESH?+0.10:0;
        const trendSignal=momentum*0.08; // trend following suave

        const buyBias=0.5
          +sentVal*0.15      // fundamental
          +imbVal*0.05       // OFI momentum
          +trendSignal       // M7: trend following
          +meanRevSignal;    // M7: mean reversion em extremos

        /* M5: Se há pressão de notícia forte no lado oposto ao imb atual,
           reduz probabilidade de o agente nadar contra a corrente.
           Resistência = |imb| quando imb e sentimento têm sinais opostos */
        const newsCounterFlow=sentVal*imbVal<-0.10; // sent e imb em direções opostas
        const resistanceFactor=newsCounterFlow?Math.max(0.4,1-Math.abs(imbVal)*0.5):1.0;

        const side=Math.random()<Math.max(0.1,Math.min(0.9,buyBias))?"buy":"sell";

        // M5: aplica resistência no volume (não na decisão de side)
        const qtyPct=prof.minVol+(Math.random()*(prof.maxVol-prof.minVol));
        const baseQty=Math.max(1,Math.round(pA.float*qtyPct));
        const qty=Math.max(1,Math.round(baseQty*resistanceFactor));

        // Impacto via Kyle + supply scaling
        const scaleA=supplyScaling(c.ticker);
        const npA=kyleLambda(curPA,qty*scaleA,side,pA);
        const signA=side==="buy"?1:-1;
        const notionalA=qty*curPA;
        const imbCap3=pA.float<1e6?0.10:0.05;
        const imbDeltaA=signA*Math.min(Math.abs(notionalA/pA.float)*0.5,imbCap3);
        rP.current[c.ticker]=npA;
        rImb.current[c.ticker]=Math.max(-1,Math.min(1,(rImb.current[c.ticker]||0)+imbDeltaA));

        // Cooldown pelo perfil do ativo (assíncrono entre ativos)
        agentCooldown.current[c.ticker]=
          prof.cdMin+Math.floor(Math.random()*(prof.cdMax-prof.cdMin));
      });

      /* ── Camada 3 + Melhoria 1: FV update ──────────────────────────────
         a) Tickers com absorção ativa: FV interpola para targetFV (notícia)
         b) Tickers sem absorção ativa: FV deriva lentamente de volta ao
            FUNDAMENTAL_FV (âncora fundamentalista de receita × múltiplo)  */
      const fvUpdates={};
      const absorbingTickers=new Set(Object.keys(newsAbsorption.current));

      // a) Absorção de notícias ativas
      Object.entries(newsAbsorption.current).forEach(([ticker,abs])=>{
        if(abs.step>=abs.totalSteps){delete newsAbsorption.current[ticker];return;}
        const progress=(abs.step+1)/abs.totalSteps;
        const interpolatedFV=+(abs.startFV+(abs.targetFV-abs.startFV)*progress).toFixed(2);
        fvUpdates[ticker]=interpolatedFV;
        newsAbsorption.current[ticker]={...abs,step:abs.step+1};
      });

      // b) Reversão fundamentalista para tickers sem notícia ativa
      CLUBS.forEach(c=>{
        if(absorbingTickers.has(c.ticker)) return;
        if(rCb.current[c.ticker]) return;
        const curFV=rFV.current[c.ticker]||c.price;
        const fundFV=FUNDAMENTAL_FV[c.ticker]||c.price;
        const dist=fundFV-curFV;
        if(Math.abs(dist)<0.01) return; // já praticamente no FV fundamental
        // Deriva FUNDAMENTAL_REVERSION_RATE × distância por tick (exponencial)
        const newFV=+(curFV+dist*FUNDAMENTAL_REVERSION_RATE).toFixed(2);
        fvUpdates[c.ticker]=newFV;
      });

      if(Object.keys(fvUpdates).length>0) setFV(f=>({...f,...fvUpdates}));
      CLUBS.forEach(c=>{
        if(rCb.current[c.ticker]){newPrices[c.ticker]=rP.current[c.ticker]||c.price;return;}
        const p  =MP[c.ticker]||{vol:.002,theta:.13,spread:.004};
        const P  =rP.current[c.ticker]||c.price;
        const fairV =rFV.current[c.ticker]||c.price;
        const prevV =rV.current[c.ticker]||p.vol**2;
        // GARCH scaling — cap reduzido de 5× para 2.5× (menos spikes extremos)
        const volM  =Math.min(1.8, Math.sqrt(prevV/(p.vol**2)))*volFactor;
        const imbV  =rImb.current[c.ticker]||0;

        /* ── Camada 2: Daily Vol Target ─────────────────────────────
           Se o ativo já acumulou movimento ≥ meta diária, escala σ ↓
           scaling = clamp(1 - movedSoFar/target, 0.1, 1.0)
           → nunca trava completamente (mínimo 10% do sigma)            */
        const movedToday=dailyMoved.current[c.ticker]||0;
        const dvScaling=Math.max(0.10, 1-(movedToday/DAILY_VOL_TARGET));
        const effectiveVolM=volM*dvScaling;

        const biasedFV=fairV*(1+imbV*0.003);

        /* ── Melhoria 4: Choque sistêmico (correlação entre ativos) ──────────
           r_i = sqrt(rho_cluster)×z_sys + sqrt(1-rho_cluster)×z_idio
                + sqrt(rho_reg)×z_reg (se mesmo estado)
           z_idio vem do ouStep normal (boxMuller interno).
           z_sys e z_reg são compartilhados por cluster/região.
           Implementação: modifica o sigma efetivo para incluir o componente
           sistêmico como um drift adicional pro-tick.                       */
        const clInfo=TICKER_CLUSTER[c.ticker];
        const rho=clInfo?.rho||0.05;
        const clKey=clInfo?.clusterKey||"B_ALL";
        const zSys=sysShock.current[clKey]||0;
        // Encontra região do ativo para choque regional
        const regKey=Object.keys(REGIONAL_CLUSTERS).find(
          r=>REGIONAL_CLUSTERS[r].includes(c.ticker)
        );
        const zReg=regKey?(regionalShock.current[regKey]||0):0;
        // Componente sistêmico como retorno adicional no tick
        const dt=1/390;
        const sysReturn=(Math.sqrt(rho)*zSys+Math.sqrt(REGIONAL_RHO)*zReg*0.5)
          *p.vol*effectiveVolM*Math.sqrt(dt);
        // ouStep calcula o componente idiossincrático; adicionamos o sistêmico
        const rawNpIdio=ouStep(P,biasedFV,p,effectiveVolM);
        const rawNp=Math.max(0.01,+(rawNpIdio*(1+sysReturn*Math.sqrt(1-rho))).toFixed(2));

        /* ── Camada 1: Velocity Cap ──────────────────────────────────
           Corta qualquer variação acima de VELOCITY_CAP por tick
           O excesso não é perdido — fica represado no FV (mean reversion
           trará o preço gradualmente)                                  */
        const rawR=(rawNp-P)/P;
        const clampedR=Math.max(-VELOCITY_CAP, Math.min(VELOCITY_CAP, rawR));
        const np=Math.max(0.01, +(P*(1+clampedR)).toFixed(2));
        const r=(np-P)/P;

        // Atualiza acumulado intraday (só durante sessão main)
        if(sess.id==="main"){
          dailyMoved.current[c.ticker]=(movedToday+Math.abs(r));
        }

        /* ── Melhoria 6: Circuit Breaker com FV clamp ───────────────────────
           Trigger: variação acumulada desde abertura ≥ 8% no dia.
           Ao ativar: congela preço spot E clampeia FV ao preço atual.
           Ao liberar (5min): realinha FV gradualmente ao fundamentalFV.
           Isso elimina o salto brusco pós-suspensão causado por FV divergente. */
        const dailyPct=rOpenP.current[c.ticker]
          ? Math.abs((np-(rOpenP.current[c.ticker]))/(rOpenP.current[c.ticker]))
          : 0;
        if(dailyPct>=0.08 && !rCb.current[c.ticker]){
          // Ativa CB: snapa FV ao spot atual para evitar divergência
          rCb.current[c.ticker]=true;
          // Clamp FV ao preço atual — evita salto na liberação
          setFV(f=>({...f,[c.ticker]:np}));
          // Seta estado React para UI
          const cbTicker=c.ticker;
          setTimeout(()=>{
            // Libera CB
            rCb.current[cbTicker]=false;
            // Ao liberar, FV já está clampado ao spot — OU retoma normalmente
          },300000); // 5 minutos
        }

        newPrices[c.ticker]=np;
        newV    [c.ticker]=garch(prevV,r);
        newBook [c.ticker]=bidAsk(np,p,imbV);
        // M7: atualiza histórico de preços (circular, tamanho HISTORY_LEN)
        if(!priceHistory.current[c.ticker]){
          priceHistory.current[c.ticker]=Array(HISTORY_LEN).fill(np);
        } else {
          priceHistory.current[c.ticker].push(np);
          if(priceHistory.current[c.ticker].length>HISTORY_LEN)
            priceHistory.current[c.ticker].shift();
        }
        /* ── Melhoria 3: OFI decay proporcional ao float ───────────────
           Série A grande: decay 0.91 (~1.5min) — liquidez alta, pressão dissipa rápido
           Série B:        decay 0.97 (~4min)   — liquidez baixa, pressão persiste mais */
        const floatSize=MP[c.ticker]?.float||5e6;
        const imbDecay=0.97-0.06*Math.min(1,floatSize/6e6);
        newImb[c.ticker]=imbV*imbDecay;
      });
      // FIX 2: updates todos separados, fora do callback
      setP(prev=>({...prev,...newPrices}));
      setV(prev=>({...prev,...newV}));
      setBook(prev=>({...prev,...newBook}));
      setImb(prev=>{
        const n={...prev};
        Object.entries(newImb).forEach(([k,v])=>n[k]=v);
        return n;
      });
    },2000);
    return()=>clearInterval(t);
  },[]); // sem dependência em cb — usa rCb.current

  /* ── Fila de notícias reais (injetada pelo NewsScreen) ── */
  const realNewsQueue=useRef([]);

  /* ── Fase 2: Pressure Queue ─────────────────────────────────────────────
     Quando uma notícia chega, em vez de chocar o preço diretamente,
     ela gera um lote de "ordens simuladas" que entram no book ao longo
     do tempo, movendo o preço via oferta/demanda — como no mercado real.

     Cada notícia → N ordens sintéticas (baseado na intensidade do sent)
     distribuídas em PRESSURE_SPREAD_TICKS ticks (~16-80s).
     pressureQueue: [{ticker, side, qty, ticksLeft}]

     O volume sintético é proporcional ao float do ativo:
     Série A: ordens menores mas mais numerosas (liquidez alta)
     Série B: ordens maiores e mais esparsas (baixa liquidez)              */
  const pressureQueue=useRef([]); // [{ticker,side,qty,ticksLeft,totalTicks}]
  const PRESSURE_SPREAD_TICKS=10; // distribui ordens em ~20s (10 ticks × 2s)

  /* ══════════════════════════════════════════════════════════════════════
     FASE 3 — Supply Dinâmico
     O float disponível (supply) agora influencia o preço diretamente.
     Quanto menor o supply remanescente, maior o multiplicador de impacto.
     scalingFn: multiplica Kyle's Lambda pelo fator de escassez.
     - supply > 50% float → fator 1.0× (mercado normal)
     - supply 20–50%      → fator 1.5× (liquidez moderada)
     - supply 5–20%       → fator 2.5× (liquidez baixa, cada ordem pesa mais)
     - supply < 5%        → fator 4.0× (quasi short squeeze territory)
  ══════════════════════════════════════════════════════════════════════ */
  /* Supply scaling suave: linear de 1.0× (50% livre) até 2.0× (esgotado)
     Evita amplificação explosiva em cascata com o agente de liquidez       */
  const supplyScaling=(ticker)=>{
    const club=CLUBS.find(c=>c.ticker===ticker);
    if(!club) return 1.0;
    const total=club.totalShares||1;
    const avail=supplyRef.current[ticker]??total;
    const ratio=Math.max(0,Math.min(1,avail/total));
    // Linear: 1.0× quando livre, até 2.0× quando quase esgotado
    return 1.0+Math.max(0,(0.5-ratio))*2.0;
  };

  /* ══════════════════════════════════════════════════════════════════════
     FASE 4 — Market Maker (Formador de Mercado)
     Agente automático que reequilibra o book após perturbações.
     Comportamento:
     - Monitora o spread bid/ask: se alargou >2× o spread base → aperta
     - Monitora o OFI: se |imb| > 0.6 → injeta ordem contrária para estabilizar
     - Injeta ordens de tamanho moderado (não move o preço sozinho)
     - Não age se circuit breaker ativo
     mmCooldown: evita que o MM aja toda iteração (age a cada ~6 ticks = 12s)
  ══════════════════════════════════════════════════════════════════════ */
  const mmCooldown=useRef({}); // {ticker: ticksUntilNextAction}
  const MM_COOLDOWN_TICKS=15; // age a cada ~30s por ativo
  const MM_ORDER_SIZE_PCT=0.00008; // 0.008% do float por ordem MM (muito suave)

  /* ══════════════════════════════════════════════════════════════════════
     AGENTE DE LIQUIDEZ — Investidores Simulados
     Gera ordens aleatórias a cada ~10s por ativo, baseadas no sentimento.
     Simula outros participantes do mercado (não apenas o usuário).

     Lógica de decisão por ativo:
     - Base: random walk leve (sempre há algum fluxo)
     - Sentimento positivo: aumenta prob. de compra
     - Sentimento negativo: aumenta prob. de venda
     - Pressão de imb existente: reforça o lado dominante (momentum)
     - Float baixo (Série B): ordens menores mas mais frequentes
     - Volume por ordem: 0.01–0.08% do float (realista para varejo)

     agentCooldown: cada ativo tem cooldown independente (assíncrono)
  ══════════════════════════════════════════════════════════════════════ */
  const agentCooldown=useRef({}); // {ticker: ticksUntilNextOrder}

  /* ── Melhoria 2: Perfis de liquidez por ativo ──────────────────────────
     Cada ativo tem prob e volume de agente calibrados ao seu perfil real.
     A_TOP   (URU3,POR4,TIM3,FOG3,GAL3): fluxo constante, muitos participantes
     A_MID   (10 médios Série A):         fluxo regular, participantes moderados
     A_SMALL (5 pequenos Série A):        fluxo esporádico
     B_LIQUID(VOZ3,LEP4,COE3,IND4,LEI3): melhores da Série B, algum fluxo
     B_ILLIQ (demais Série B):            quase sem fluxo, ordens raras

     prob: probabilidade de agir por tick (por ativo)
     minVol/maxVol: % do float por ordem
     cooldownMin/Max: ticks entre ordens                                   */
  const AGENT_PROFILES={
    A_TOP:   {prob:0.10, minVol:0.00002, maxVol:0.00008, cdMin:4,  cdMax:8 },
    A_MID:   {prob:0.05, minVol:0.00001, maxVol:0.00005, cdMin:8,  cdMax:16},
    A_SMALL: {prob:0.03, minVol:0.000005,maxVol:0.00003, cdMin:12, cdMax:24},
    B_LIQUID:{prob:0.02, minVol:0.000003,maxVol:0.00002, cdMin:16, cdMax:32},
    B_ILLIQ: {prob:0.01, minVol:0.000002,maxVol:0.00001, cdMin:25, cdMax:50},
  };
  const B_LIQUID_TICKERS=["VOZ3","LEP4","COE3","IND4","LEI3","TIG4","MAC4"];
  const getAgentProfile=(ticker)=>{
    const cl=TICKER_CLUSTER[ticker];
    if(!cl) return AGENT_PROFILES.B_ILLIQ;
    if(cl.clusterKey==="A_TOP")   return AGENT_PROFILES.A_TOP;
    if(cl.clusterKey==="A_MID")   return AGENT_PROFILES.A_MID;
    if(cl.clusterKey==="A_SMALL") return AGENT_PROFILES.A_SMALL;
    // Série B: distingue liquido vs ilíquido
    return B_LIQUID_TICKERS.includes(ticker)
      ? AGENT_PROFILES.B_LIQUID
      : AGENT_PROFILES.B_ILLIQ;
  };

  /* ── Fase 2: fireExternalNews ───────────────────────────────────────────
     Transforma notícias em fluxo de ordens sintéticas (pressure queue).
     A notícia NÃO mais choca o preço diretamente — ela gera compradores
     ou vendedores simulados que entram no book ao longo do tempo.

     Volume sintético por notícia:
     - baseVolume = float * |sent| * intensityFactor (por categoria)
     - dividido em PRESSURE_SPREAD_TICKS lotes iguais
     - Série B: intensidade 1.8× (mercado mais fino, reage mais)
     - Série A: intensidade 1.0×                                           */
  const INTENSITY_BY_CAT={
    "Financeira Crítica":1.0,
    "Esportiva Majoritária":0.7,
    "Mercado de Ativos":0.5,
    "Integridade/Saúde":0.4,
    "Institucional":0.25,
    "Esportiva Menor":0.12,
  };
  const fireExternalNews=(noticias)=>{
    const normalized=noticias
      .map(n=>({...n, ticker: normalizeTicker(n.ticker)}))
      .filter(n=>n.ticker)
      .map(n=>({
        ticker:  n.ticker,
        cat:     n.cat||n.categoria||"Esportiva Menor",
        sent:    typeof n.sent==="number"?n.sent:(typeof n.sentimento==="number"?n.sentimento:0),
        headline:n.headline||n.titulo||"",
        emoji:   n.emoji||"📰",
        fonte:   n.fonte||"",
        resumo:  n.resumo||"",
      }));
    const existingH=new Set(realNewsQueue.current.map(x=>x.headline));
    normalized.forEach(n=>{
      if(existingH.has(n.headline)) return;
      // Fase 2: enfileira notícia para processamento no motor
      realNewsQueue.current.push(n);
    });
  };

  /* ── Fase 2: buildPressure ───────────────────────────────────────────────
     Converte uma notícia em lote de ordens sintéticas na pressureQueue.
     Chamado pelo motor quando consome uma notícia da realNewsQueue.        */
  /* ── M5: buildPressure com resistência de book ──────────────────────────
     Se o OFI atual do ativo já está fortemente no lado oposto à notícia,
     o volume sintético é reduzido — há resistência no book.
     Ex: notícia positiva (buy) em ativo com imb=-0.7 (muitos vendedores)
     → volume reduzido a 40% (compradores encontram resistência).          */
  const buildPressure=(n)=>{
    const club=CLUBS.find(c=>c.ticker===n.ticker);
    if(!club) return;
    const p=MP[n.ticker]||{float:5e6,vol:.002,theta:.13,spread:.004};
    const intensity=INTENSITY_BY_CAT[n.cat]||0.12;
    const seriesMult=club.div==="B"?1.8:1.0;
    const absSent=Math.abs(n.sent);
    const side=n.sent>=0?"buy":"sell";

    // M5: verifica resistência do book (OFI no lado oposto)
    const curImb=rImb.current[n.ticker]||0;
    const sideSign=side==="buy"?1:-1;
    // Resistência quando imb contrário ao sentimento
    const opposition=-(sideSign*curImb); // positivo = há resistência
    const resistanceMult=opposition>0.3
      ? Math.max(0.35, 1-opposition*0.65) // reduz até 35% do volume
      : 1.0;

    const totalVol=Math.round(p.float*absSent*intensity*seriesMult*0.0003*resistanceMult);
    if(totalVol<1) return;
    const qtyPerTick=Math.max(1,Math.round(totalVol/PRESSURE_SPREAD_TICKS));
    for(let i=0;i<PRESSURE_SPREAD_TICKS;i++){
      pressureQueue.current.push({ticker:n.ticker,side,qty:qtyPerTick,ticksLeft:PRESSURE_SPREAD_TICKS-i});
    }
  };

  /* News engine: consome fila de notícias reais a cada 8s
     - Mercado fechado/after: preserva fila (não descarta)
     - Abertura do mercado: drena até 3 notícias acumuladas no primeiro tick */
  const firstTickAfterOpen=useRef(true);
  useEffect(()=>{
    /* ── Fase 2: processOne ─────────────────────────────────────────────────
       A notícia NÃO mais move o preço diretamente.
       Ela apenas:
       1. Atualiza o sentimento do ativo
       2. Ajusta o Fair Value via fvShift (sinal fundamental de longo prazo)
       3. Injeta ordens sintéticas na pressureQueue (fluxo de compra/venda)
       O preço só se move quando essas ordens chegam ao book tick a tick.   */
    const processOne=(n)=>{
      if(!n||!n.ticker) return;
      if(rCb.current[n.ticker]) return;
      const spotP=rP.current[n.ticker]||CLUBS.find(c=>c.ticker===n.ticker)?.price||10;
      const curFV=rFV.current[n.ticker]||spotP;

      // 1. Atualiza sentimento
      setSent(s=>({...s,[n.ticker]:n.sent}));

      // 2. Ajusta Fair Value (pressão fundamental gradual via OU)
      const fvShift=(IMPACT_MATRIX[n.cat]||.005)*n.sent*.3;
      const newFV=+(curFV*(1+fvShift)).toFixed(2);
      newsAbsorption.current[n.ticker]={startFV:curFV,targetFV:newFV,step:0,totalSteps:ABSORPTION_TICKS};

      // 3. Gera fluxo de ordens sintéticas (Fase 2)
      buildPressure(n);

      // 4. Registra no log com pct estimado baseado no fvShift
      const estimatedPct=+((fvShift)*100).toFixed(2);
      const entry={...n,pct:estimatedPct,newPrice:+(spotP*(1+fvShift)).toFixed(2),ts:Date.now()};
      setNews(entry);
      setNL(l=>[entry,...l].slice(0,20));
      setTimeout(()=>setNews(null),7000);
    };
    const fire=()=>{
      const sess=getMarketSession();
      // Fechado/after: preserva fila intacta, reseta flag de abertura
      if(sess.id==="closed"||sess.id==="after"){
        firstTickAfterOpen.current=true;
        return;
      }
      if(realNewsQueue.current.length===0) return;
      // Primeiro tick após abertura: drena até 3 notícias acumuladas
      if(firstTickAfterOpen.current){
        firstTickAfterOpen.current=false;
        const batch=Math.min(3,realNewsQueue.current.length);
        for(let i=0;i<batch;i++){
          const n=realNewsQueue.current.shift();
          processOne(n);
        }
        return;
      }
      // Tick normal: processa 1 notícia
      processOne(realNewsQueue.current.shift());
    };
    const t=setInterval(fire,8000);
    return()=>clearInterval(t);
  },[]);

  return{prices,sent,news,newsLog,cb,book,vol24,imb,registerOrder,fv,openPrices,prevCloses,fireExternalNews,setSupplyRef};
}

/* ── UI Helpers ── */
function Spark({up,w=60,h=28}){
  const pts=[];let y=h*.5;
  for(let i=0;i<16;i++){y+=((Math.random()-(up?.42:.58))*h*.35);y=Math.max(3,Math.min(h-3,y));pts.push(`${i*(w/15)},${y}`);}
  const col=up?ACCENT:RED;
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:"block",flexShrink:0}}>
    <defs><linearGradient id={`sg${up?1:0}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity=".3"/><stop offset="100%" stopColor={col} stopOpacity="0"/></linearGradient></defs>
    <polygon points={`0,${h} ${pts.join(" ")} ${w},${h}`} fill={`url(#sg${up?1:0})`}/>
    <polyline points={pts.join(" ")} fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}

// ── Gera série de preços simulada para um clube ──
// Usa GBM (Geometric Brownian Motion) com mean-reversion ao fair value,
// sentimento do clube como drift e regime de volatilidade variável.
function genClubSeries(club, length=300, anchorPrice=null){
  const target=anchorPrice||club.price;
  const fv=FUNDAMENTAL_FV[club.ticker]||target;
  // Sentimento do clube influencia o drift histórico
  const sentDrift=(club.sent||0)*0.0004;
  // Volatilidade calibrada por microestrutura + multiplicador de período (intraday vs diário)
  const volMult=club._volMult||1.0;
  const sigmaBase=(MP[club.ticker]?.vol||(club.div==="B"?0.0035:0.0020))*2.5*volMult;
  const baseVol=club.totalShares?club.totalShares*0.0012:50000;

  // Gera histórico com GBM + regimes de volatilidade
  // Ponto de partida: recua aleatoriamente 10%–35% do preço atual para criar histórico variado
  const startPct=0.65+Math.random()*0.25; // entre 65% e 90% do target
  let p=target*startPct;
  let sigma=sigmaBase;
  let trendMomentum=0; // acumula momentum de tendência

  // Regimes de mercado: bull, bear, sideways — mudam ao longo da série
  const regimeLen=Math.floor(length/5);
  const regimes=Array.from({length:6},()=>{
    const r=Math.random();
    if(r<0.4) return {drift:0.0003+Math.random()*0.0004, vol:1.0};  // bull
    if(r<0.7) return {drift:-0.0002-Math.random()*0.0004, vol:1.3}; // bear
    return {drift:(Math.random()-.5)*0.0002, vol:0.7};               // sideways
  });

  const candles=Array.from({length},(_,i)=>{
    const regime=regimes[Math.min(Math.floor(i/regimeLen),regimes.length-1)];
    // Mean-reversion ao FV (fraca — não domina, apenas ancora)
    const mvReversion=(fv-p)/fv*0.008;
    // Momentum: tende a continuar a direção recente
    trendMomentum=trendMomentum*0.85+(Math.random()-.5)*0.002;
    // GBM com todos os componentes
    const drift=regime.drift+sentDrift+mvReversion+trendMomentum*0.3;
    sigma=sigmaBase*regime.vol*(0.85+Math.random()*0.3); // GARCH-lite
    const shock=(Math.random()+Math.random()-1)*sigma; // distribuição triangular (mais realista q normal)
    const ret=drift+shock;
    const o=p;
    const c=Math.max(o*0.5, o*(1+ret)); // floor 50% para evitar crash total
    // Sombras realistas: correlacionadas com o movimento do corpo
    const bodyAbs=Math.abs(c-o);
    const upperShadow=bodyAbs*0.3+Math.random()*o*sigmaBase*0.8;
    const lowerShadow=bodyAbs*0.3+Math.random()*o*sigmaBase*0.8;
    const h=Math.max(o,c)+upperShadow;
    const l=Math.min(o,c)-lowerShadow;
    // Volume: correlacionado com volatilidade (realista)
    const move=Math.abs(ret);
    const vol=Math.round(baseVol*(0.3+Math.random()*0.7+move*15)*regime.vol);
    p=c;
    return {o,c,h,l,v:vol};
  });

  // Ajusta a série para que o último close coincida com o target atual,
  // preservando a forma dos candles (escala proporcional nos últimos 15%)
  const convergenceStart=Math.floor(length*0.85);
  const lastClose=candles[candles.length-1].c;
  const scale=target/lastClose;
  // Aplica scale gradual nos últimos 15% da série
  for(let i=convergenceStart;i<length;i++){
    const t=(i-convergenceStart)/(length-1-convergenceStart);
    const s=1+(scale-1)*t; // interpolação linear do scale
    const c=candles[i];
    c.o*=s; c.c*=s; c.h*=s; c.l*=s;
  }
  // Garante consistência OHLC no último candle
  const last=candles[length-1];
  last.c=target;
  last.h=Math.max(last.h,target);
  last.l=Math.min(last.l,target);
  if(last.o>last.h) last.o=last.h;
  if(last.o<last.l) last.o=last.l;
  return candles;
}

/* Configuração de cada período:
   candles = quantas velas mostrar na tela
   length  = tamanho total da série gerada (história + visível)
   label   = rótulo de cada vela (granularidade)
   volMult = multiplicador de volatilidade (intraday > diário > semanal)
*/
const PERIOD_CFG={
  "1H":{candles:60, length:60,  label:"1min", volMult:0.35},
  "1D":{candles:78, length:120, label:"5min", volMult:0.55},
  "1S":{candles:35, length:150, label:"4h",   volMult:0.80},
  "1M":{candles:30, length:200, label:"1D",   volMult:1.00},
};

/* ── Cores de gráfico para clubes com cores escuras/pretas ────────────
   Substituição exclusiva para gráficos (linha, área, label de comparação).
   Não afeta badges, cards ou qualquer outro elemento de UI.
   Tons de cinza diferenciados para manter identidade visual do clube.
──────────────────────────────────────────────────────────────────────── */
const CHART_COLORS={
  TIM3:"#9e9e9e", // Corinthians    → cinza médio
  GAL3:"#757575", // Atlético-MG    → cinza escuro
  FOG3:"#b0bec5", // Botafogo       → cinza prateado (azulado)
  MAL4:"#90a4ae", // Vasco          → cinza azulado
  BAL4:"#bdbdbd", // Santos         → cinza claro
  CAV4:"#78909c", // Athletic       → cinza ardósia
  PAN3:"#a1887f", // Botafogo-SP    → cinza rosado
  VOZ3:"#8d8d8d", // Ceará          → cinza neutro
};

function CandleChart({club, indicators=[], chartMode="candle", compareClubs=[], currentPrice=null, prevCloses={}, period="1D"}) {
  const cfg=PERIOD_CFG[period]||PERIOD_CFG["1D"];
  const seriesRef=useRef({});   // key: `${ticker}-${period}`
  const prevPriceRef=useRef({});
  const prevPeriodRef=useRef(null);

  const allClubs=[club,...compareClubs.map(t=>CLUBS.find(c=>c.ticker===t)).filter(Boolean)];

  // Invalida cache quando o período muda
  if(prevPeriodRef.current!==period){
    seriesRef.current={};
    prevPeriodRef.current=period;
  }

  allClubs.forEach(cl=>{
    const key=`${cl.ticker}-${period}`;
    const anchor=cl.ticker===club.ticker&&currentPrice?currentPrice:(prevCloses[cl.ticker]||cl.price);
    if(!seriesRef.current[key]){
      // Gera série com volatilidade e comprimento ajustados ao período
      const clMod={...cl, _volMult:cfg.volMult};
      seriesRef.current[key]=genClubSeries(clMod, cfg.length, anchor);
      prevPriceRef.current[key]=anchor;
    }
  });

  // Atualiza o último candle (vela viva) — OHLC correto
  const mainKey=`${club.ticker}-${period}`;
  if(currentPrice&&seriesRef.current[mainKey]){
    const arr=seriesRef.current[mainKey];
    const last=arr[arr.length-1];
    if(prevPriceRef.current[mainKey]!==currentPrice){
      last.c=currentPrice;
      last.h=Math.max(last.h,currentPrice);
      last.l=Math.min(last.l,currentPrice);
      prevPriceRef.current[mainKey]=currentPrice;
    }
  }

  // Fatia apenas os candles visíveis para o período selecionado
  const fullSeries=seriesRef.current[mainKey]||[];
  const D=fullSeries.slice(-cfg.candles);
  const W=340,H=148,PX=24,PY=14; // H reduzido para abrir espaço ao volume
  const VOL_H=32,VOL_GAP=6;       // altura da faixa de volume + gap
  const TOTAL_H=H+VOL_GAP+VOL_H+20;
  const isCompare=compareClubs.length>0;
  const isLine=chartMode==="line"||isCompare;

  const bollinger=(()=>{
    if(!indicators.includes("bb")||isLine) return null;
    const period=20;
    return D.map((_,i)=>{
      if(i<period-1) return null;
      const slice=D.slice(i-period+1,i+1).map(c=>(c.h+c.l+c.c)/3);
      const mean=slice.reduce((s,v)=>s+v,0)/period;
      const std=Math.sqrt(slice.reduce((s,v)=>s+(v-mean)**2,0)/period);
      return {mid:mean,upper:mean+2*std,lower:mean-2*std};
    });
  })();

  const calcMM=(period)=>{
    if(isLine||isCompare) return null;
    return D.map((_,i)=>{
      if(i<period-1) return null;
      return D.slice(i-period+1,i+1).reduce((s,c)=>s+c.c,0)/period;
    });
  };
  const mm9 =indicators.includes("mm9") ?calcMM(9) :null;
  const mm21=indicators.includes("mm21")?calcMM(21):null;
  const mmPath=(mm)=>mm?.map((v,i)=>v!=null?`${mm.slice(0,i).every(x=>x==null)?'M':'L'}${cx(i).toFixed(1)},${toY(v).toFixed(1)}`:'').filter(Boolean).join(' ');

  /* ── Cores dos clubes ────────────────────────────────────────────────
     Usa a cor oficial do clube (cl.color) para linha, candle e área.
     Em modo comparação, detecta conflitos de cor (distância < threshold)
     e substitui apenas os conflitantes por variações de tonalidade.      */

  // Converte hex #rrggbb → [r,g,b]
  const hexToRgb=hex=>{
    const h=hex.replace('#','');
    return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
  };
  // Distância perceptual entre duas cores (Delta-E simplificado)
  const colorDist=(a,b)=>{
    const [r1,g1,b1]=hexToRgb(a), [r2,g2,b2]=hexToRgb(b);
    return Math.sqrt((r1-r2)**2*0.3+(g1-g2)**2*0.59+(b1-b2)**2*0.11);
  };
  // Clareia ou escurece um hex por delta (-1..1)
  const shiftColor=(hex,delta)=>{
    const [r,g,b]=hexToRgb(hex);
    const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));
    const shift=v=>clamp(delta>0?v+(255-v)*delta:v*(1+delta));
    return`#${[r,g,b].map(v=>shift(v).toString(16).padStart(2,'0')).join('')}`;
  };
  // Cores de fallback para conflitos irresolvíveis
  const FALLBACK_COLORS=["#a78bfa","#34d399","#fb923c","#f472b6","#60a5fa"];

  const CONFLICT_THRESHOLD=60; // distância mínima para considerar "cor diferente"

  // Atribui cores a todos os clubes do gráfico, resolvendo conflitos
  const assignColors=(clubs)=>{
    const assigned=[];
    clubs.forEach((cl)=>{
      // Usa chartColor específica se o clube tiver cor escura/preta,
      // caso contrário usa a cor oficial do clube diretamente
      let base=CHART_COLORS[cl.ticker]||cl.color||ACCENT;

      // Verifica conflito com cores já atribuídas
      let final=base;
      let fallbackIdx=0;
      for(let attempt=0;attempt<4;attempt++){
        const hasConflict=assigned.some(c=>colorDist(c,final)<CONFLICT_THRESHOLD);
        if(!hasConflict) break;
        if(attempt===0) final=shiftColor(base,0.40);
        else if(attempt===1) final=shiftColor(base,-0.30);
        else if(attempt===2) final=FALLBACK_COLORS[fallbackIdx++%FALLBACK_COLORS.length];
        else final=FALLBACK_COLORS[fallbackIdx++%FALLBACK_COLORS.length];
      }
      assigned.push(final);
    });
    return assigned;
  };

  const clubColors=assignColors(allClubs);
  const mainColor=clubColors[0]; // cor do clube principal

  const normalized=allClubs.map(cl=>{
    const key=`${cl.ticker}-${period}`;
    const series=(seriesRef.current[key]||[]).slice(-cfg.candles);
    if(!series.length) return {cl,vals:[]};
    const base=series[0].c;
    return {cl,vals:series.map(d=>(d.c/base)*100)};
  });

  let allVals;
  if(isCompare) allVals=normalized.flatMap(n=>n.vals);
  else if(isLine) allVals=D.flatMap(d=>[d.h,d.l]);
  else{allVals=[...D.flatMap(d=>[d.h,d.l])];if(bollinger)bollinger.forEach(b=>b&&allVals.push(b.upper,b.lower));if(mm9)mm9.forEach(v=>v!=null&&allVals.push(v));if(mm21)mm21.forEach(v=>v!=null&&allVals.push(v));}

  const maxH=Math.max(...allVals),minL=Math.min(...allVals),rng=maxH-minL||1;
  const toY=v=>PY+((maxH-v)/rng)*(H-PY*2);
  const cW=(W-PX*2)/D.length;
  const cx=i=>PX+i*cW+cW*.5;
  const linePath=vals=>vals.map((v,i)=>`${i===0?'M':'L'}${cx(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const areaPath=vals=>`${linePath(vals)} L${cx(D.length-1).toFixed(1)},${H} L${cx(0).toFixed(1)},${H} Z`;
  const bbPath=key=>bollinger?.map((b,i)=>b?`${i===0||!bollinger[i-1]?'M':'L'}${cx(i).toFixed(1)},${toY(b[key]).toFixed(1)}`:'').filter(Boolean).join(' ');

  // Volume — só no modo candle sem comparação
  const showVol=!isLine&&!isCompare&&D[0]?.v!=null;
  const maxVol=showVol?Math.max(...D.map(d=>d.v||0))||1:1;
  const volTop=H+VOL_GAP;
  const toVolH=v=>Math.max(1,(v/maxVol)*VOL_H);
  // Volume: mesma convenção do candle — verde tradicional alta, vermelho baixa
  const volColUp="rgba(38,166,154,.50)";  // verde teal tradicional
  const volColDn="rgba(252,165,165,.50)"; // vermelho pastel

  // Label volume (último candle, formatado)
  const fmtVol=v=>v>=1e6?(v/1e6).toFixed(1)+"M":v>=1000?(v/1000).toFixed(0)+"k":String(v);

  return(
    <svg width="100%" viewBox={`0 0 ${W} ${TOTAL_H}`} style={{overflow:'visible'}}>
      <defs>
        {!isCompare&&<linearGradient id={`lineGrad-${club.ticker}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={mainColor} stopOpacity="0.22"/>
          <stop offset="100%" stopColor={mainColor} stopOpacity="0.01"/>
        </linearGradient>}
      </defs>
      {/* Label de granularidade do período — ex: "vela = 5min" */}
      {!isCompare&&<text x={W-PX} y={PY-3} fontSize="5.5" fill={MUTED} textAnchor="end" fontFamily="monospace" opacity=".7">
        vela/{cfg.label}
      </text>}
      {[0,.33,.66,1].map((t,i)=>(
        <line key={i} x1={PX} x2={W-PX} y1={PY+t*(H-PY*2)} y2={PY+t*(H-PY*2)} stroke={BORDER} strokeWidth="1" strokeDasharray="3 3"/>
      ))}
      {isCompare&&[0,.33,.66,1].map((t,i)=>{
        const v=(maxH-(t*(maxH-minL))).toFixed(1);
        return <text key={i} x={PX-3} y={PY+t*(H-PY*2)+3} fontSize="6" fill={MUTED} textAnchor="end" fontFamily="monospace">{v}%</text>;
      })}
      {bollinger&&<>
        <path d={[bollinger.map((b,i)=>b?`${i===0||!bollinger[i-1]?'M':'L'}${cx(i).toFixed(1)},${toY(b.upper).toFixed(1)}`:'').filter(Boolean).join(' '),[...bollinger].reverse().map((b,i,arr)=>{const oi=arr.length-1-i;return b?`L${cx(oi).toFixed(1)},${toY(b.lower).toFixed(1)}`:''}).filter(Boolean).join(' '),'Z'].join(' ')} fill="rgba(14,165,233,.07)" stroke="none"/>
        <path d={bbPath('upper')} fill="none" stroke="rgba(14,165,233,.55)" strokeWidth="1" strokeDasharray="4 2"/>
        <path d={bbPath('mid')}   fill="none" stroke="rgba(245,166,35,.7)"  strokeWidth="1.2"/>
        <path d={bbPath('lower')} fill="none" stroke="rgba(14,165,233,.55)" strokeWidth="1" strokeDasharray="4 2"/>
      </>}
      {isLine&&!isCompare&&<>
        <path d={areaPath(D.map(d=>d.c))} fill={`url(#lineGrad-${club.ticker})`} stroke="none"/>
        <path d={linePath(D.map(d=>d.c))} fill="none" stroke={mainColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
        <circle cx={cx(D.length-1)} cy={toY(D[D.length-1].c)} r="3" fill={mainColor} stroke={BG} strokeWidth="1.5"/>
      </>}
      {isCompare&&normalized.map(({cl,vals},si)=>{
        const col=clubColors[si];
        const lastY=toY(vals[vals.length-1]);
        return <g key={cl.ticker}>
          <path d={linePath(vals)} fill="none" stroke={col} strokeWidth={si===0?2.2:1.8} strokeLinejoin="round" strokeLinecap="round" opacity={si===0?1:.85}/>
          <rect x={W-PX+2} y={lastY-7} width={22} height={12} rx="3" fill={`${col}22`} stroke={`${col}55`} strokeWidth="1"/>
          <text x={W-PX+13} y={lastY+3} fontSize="6.5" fill={col} textAnchor="middle" fontWeight="bold" fontFamily="monospace">{cl.ticker}</text>
        </g>;
      })}
      {!isLine&&!isCompare&&D.map((c,i)=>{
        const x=PX+i*cW+cW*.15,bW=cW*.7,cx2=x+bW/2;
        const g=c.c>=c.o;
        const col=g?"#26a69a":RED; // verde tradicional alta / vermelho baixa
        const by=toY(Math.max(c.o,c.c)),bh=Math.max(1,Math.abs(toY(c.o)-toY(c.c)));
        return <g key={i}><line x1={cx2} x2={cx2} y1={toY(c.h)} y2={toY(c.l)} stroke={col} strokeWidth="1"/><rect x={x} y={by} width={bW} height={bh} fill={col} opacity=".9" rx="1"/></g>;
      })}
      {mm9&&<path d={mmPath(mm9)}  fill="none" stroke="#f59e0b" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" opacity=".85"/>}
      {mm21&&<path d={mmPath(mm21)} fill="none" stroke="#a78bfa" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" opacity=".85"/>}

      {/* ── VOLUME ── */}
      {showVol&&<>
        {/* Linha separadora sutil */}
        <line x1={PX} x2={W-PX} y1={volTop} y2={volTop} stroke={BORDER} strokeWidth="1" strokeDasharray="2 4" opacity=".6"/>
        {/* Label "VOL" */}
        <text x={PX} y={volTop+8} fontSize="5.5" fill={MUTED} fontFamily="monospace" opacity=".7">VOL</text>
        {/* Barras */}
        {D.map((c,i)=>{
          const x=PX+i*cW+cW*.15,bW=Math.max(0.5,cW*.7);
          const vh=toVolH(c.v||0);
          const col=c.c>=c.o?volColUp:volColDn;
          return <rect key={i} x={x} y={volTop+VOL_H-vh} width={bW} height={vh} fill={col} rx="0.5"/>;
        })}
        {/* Último valor de volume */}
        <text x={W-PX} y={volTop+VOL_H} fontSize="6" fill={MUTED} fontFamily="monospace" textAnchor="end" opacity=".8">
          {fmtVol(D[D.length-1].v||0)}
        </text>
      </>}

      {(bollinger||mm9||mm21)&&!isCompare&&<g>
        {bollinger&&<>
          <rect x={PX} y={TOTAL_H-16} width={92} height={12} rx="3" fill="rgba(7,9,15,.7)"/>
          <line x1={PX+3} x2={PX+10} y1={TOTAL_H-10} y2={TOTAL_H-10} stroke="rgba(14,165,233,.7)" strokeWidth="1" strokeDasharray="3 1"/>
          <text x={PX+13} y={TOTAL_H-7} fontSize="6" fill="rgba(14,165,233,.8)" fontFamily="monospace">Bollinger</text>
          <line x1={PX+50} x2={PX+57} y1={TOTAL_H-10} y2={TOTAL_H-10} stroke="rgba(245,166,35,.8)" strokeWidth="1.2"/>
          <text x={PX+60} y={TOTAL_H-7} fontSize="6" fill="rgba(245,166,35,.8)" fontFamily="monospace">SMA20</text>
        </>}
        {mm9&&<>
          <line x1={bollinger?PX+96:PX} x2={bollinger?PX+103:PX+7} y1={TOTAL_H-10} y2={TOTAL_H-10} stroke="#f59e0b" strokeWidth="1.4"/>
          <text x={bollinger?PX+106:PX+10} y={TOTAL_H-7} fontSize="6" fill="#f59e0b" fontFamily="monospace" fontWeight="bold">MM9</text>
        </>}
        {mm21&&<>
          <line x1={bollinger?(mm9?PX+126:PX+96):(mm9?PX+30:PX)} x2={bollinger?(mm9?PX+133:PX+103):(mm9?PX+37:PX+7)} y1={TOTAL_H-10} y2={TOTAL_H-10} stroke="#a78bfa" strokeWidth="1.4"/>
          <text x={bollinger?(mm9?PX+136:PX+106):(mm9?PX+40:PX+10)} y={TOTAL_H-7} fontSize="6" fill="#a78bfa" fontFamily="monospace" fontWeight="bold">MM21</text>
        </>}
      </g>}
      {isCompare&&<g>{normalized.map(({cl},si)=>{
        const col=si===0?ACCENT:compareColors[(si-1)%compareColors.length];
        return <g key={cl.ticker}>
          <line x1={PX+si*52} x2={PX+si*52+10} y1={TOTAL_H-10} y2={TOTAL_H-10} stroke={col} strokeWidth="2"/>
          <text x={PX+si*52+13} y={TOTAL_H-7} fontSize="6.5" fill={col} fontFamily="monospace" fontWeight="bold">{cl.ticker}</text>
        </g>;
      })}</g>}
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
      <svg width="14" height="11" viewBox="0 0 14 11"><path d="M7 2.5C9.5 2.5 11.7 3.5 13.3 5.2L14 4.3C12.2 2.4 9.7 1.2 7 1.2 4.3 1.2 1.8 2.4 0 4.3L.7 5.2C2.3 3.5 4.5 2.5 7 2.5Z" fill="white"/><path d="M7 5C8.8 5 10.4 5.8 11.5 7L12.2 6.1C10.9 4.8 9.1 4 7 4 4.9 4 3.1 4.8 1.8 6.1L2.5 7C3.6 5.8 5.2 5 7 5Z" fill="white"/><circle cx="7" cy="9.5" r="1.5" fill="white"/></svg>
      <div style={{display:"flex",alignItems:"center",gap:1}}><div style={{width:20,height:10,border:"1.5px solid white",borderRadius:2,padding:"1px",display:"flex",alignItems:"center"}}><div style={{width:"75%",height:"100%",background:"white",borderRadius:1}}/></div><div style={{width:2,height:5,background:"white",borderRadius:"0 1px 1px 0"}}/></div>
    </div>
  </div>;
}

function PhoneShell({children,time}){
  return <div style={{minHeight:"100vh",background:"#000",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px 0"}}>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes slideUp{from{opacity:0;transform:translateY(50px)}to{opacity:1;transform:translateY(0)}}@keyframes pls{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes shimmer{0%{left:-100%}100%{left:200%}}@keyframes pulseGlow{0%,100%{box-shadow:0 0 0 0 rgba(108,99,255,0.3)}50%{box-shadow:0 0 0 8px rgba(108,99,255,0)}}_::-webkit-scrollbar{width:0}*{-webkit-font-smoothing:antialiased}`}</style>
    <div style={{width:390,height:844,borderRadius:50,background:"#080b12",border:"10px solid #10141d",position:"relative",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 0 0 1px #1e2636,0 40px 100px rgba(0,0,0,.95),0 0 80px rgba(108,99,255,.06),inset 0 0 0 1px rgba(255,255,255,.04)"}}>
      <StatusBar time={time}/>
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",position:"relative"}}>{children}</div>
      <div style={{height:30,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><div style={{width:120,height:5,background:"rgba(255,255,255,.2)",borderRadius:3}}/></div>
    </div>
  </div>;
}

function ExitBtn({onExit}){return <button onClick={onExit} style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.45)",borderRadius:8,padding:"5px 11px",fontSize:10,cursor:"pointer",fontFamily:SANS,fontWeight:600,letterSpacing:"0.2px",transition:"all .15s"}}>✕</button>;}

function Avatar({user,size=40,fontSize=15}){
  const ini=user.name.split(" ").slice(0,2).map(n=>n[0]).join("");
  return <div style={{width:size,height:size,borderRadius:"50%",background:"linear-gradient(135deg,#6c63ff,#38bdf8)",display:"flex",alignItems:"center",justifyContent:"center",fontSize,fontWeight:700,color:"#fff",fontFamily:SANS,flexShrink:0,boxShadow:"0 0 0 2px rgba(108,99,255,.3)"}}>{ini}</div>;
}

/* ── SPLASH ── */
function SplashScreen({onNext}){
  useEffect(()=>{const t=setTimeout(onNext,2800);return()=>clearTimeout(t);},[]);
  return <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:BG,position:"relative",overflow:"hidden"}}>
    <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse 70% 50% at 50% 30%,rgba(108,99,255,.12) 0%,transparent 70%)",pointerEvents:"none"}}/>
    <div style={{position:"absolute",bottom:"-20%",left:"50%",transform:"translateX(-50%)",width:340,height:340,background:"radial-gradient(circle,rgba(56,189,248,.06),transparent 65%)",borderRadius:"50%",pointerEvents:"none"}}/>
    <div style={{width:88,height:88,borderRadius:28,background:"linear-gradient(145deg,#141c2e,#0e1219)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:24,animation:"pls 2.2s ease-in-out infinite",boxShadow:"0 0 0 1px rgba(108,99,255,.25),0 20px 60px rgba(108,99,255,.25),0 0 80px rgba(108,99,255,.1)"}}><FootStockLogo size={64} rounded={false}/></div>
    <div style={{fontSize:30,fontWeight:800,color:"#fff",letterSpacing:"-1px",fontFamily:SANS,display:"flex",alignItems:"baseline",gap:7}}>FootStock<span style={{fontSize:10,fontWeight:700,color:GOLD,letterSpacing:"2.5px",fontFamily:SANS,opacity:.85}}>BETA</span></div>
    <div style={{fontSize:10,color:ACCENT,fontWeight:600,letterSpacing:"4px",marginTop:8,fontFamily:SANS,opacity:.9}}>A BOLSA DO FUTEBOL</div>
    <div style={{marginTop:40,display:"flex",gap:5}}>
      {[0,1,2].map(i=><div key={i} style={{width:i===0?20:6,height:5,borderRadius:3,background:i===0?ACCENT:"rgba(255,255,255,.15)",transition:"all .3s"}}/>)}
    </div>
  </div>;
}

/* ── ONBOARDING ── */
function OnboardingScreen({onSelect,onExit}){
  const [sel,setSel]=useState(null);
  const opts=[{id:"i",ico:"🌱",t:"Iniciante",d:"Estou começando agora"},{id:"m",ico:"📈",t:"Intermediário",d:"Já conheço o mercado"},{id:"a",ico:"⚡",t:"Avançado",d:"Investidor experiente"},{id:"f",ico:"🏆",t:"Fã de futebol",d:"Combino paixão e investimento"}];
  return <div style={{flex:1,display:"flex",flexDirection:"column",background:BG,overflow:"hidden"}}>
    <div style={{padding:"8px 16px 0",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
      <div style={{width:30,height:30,borderRadius:9,background:"linear-gradient(135deg,#0c1218,#07090f)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 12px rgba(93,252,0,.25)"}}><FootStockLogo size={24} rounded={false}/></div>
      <ExitBtn onExit={onExit}/>
    </div>
    <div style={{flex:1,overflowY:"auto",padding:"0 16px 80px"}}>
      <div style={{fontSize:22,fontWeight:800,color:"#fff",letterSpacing:"-0.5px",fontFamily:SANS,marginBottom:6}}>Qual é o seu perfil?</div>
      <div style={{fontSize:12,color:MUTED,fontFamily:SANS,marginBottom:22}}>Vamos personalizar sua experiência.</div>
      {opts.map(o=><div key={o.id} onClick={()=>setSel(o.id)} style={{background:sel===o.id?"rgba(108,99,255,.1)":CARD,border:`1.5px solid ${sel===o.id?"rgba(108,99,255,.7)":BORDER}`,borderRadius:16,padding:"16px",marginBottom:10,cursor:"pointer",display:"flex",alignItems:"center",gap:14,transition:"all .2s"}}>
        <div style={{fontSize:26}}>{o.ico}</div>
        <div><div style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:SANS}}>{o.t}</div><div style={{fontSize:11,color:MUTED,fontFamily:SANS,marginTop:2}}>{o.d}</div></div>
        <div style={{marginLeft:"auto",width:20,height:20,borderRadius:"50%",border:`2px solid ${sel===o.id?"#6c63ff":BORDER}`,background:sel===o.id?"#6c63ff":"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>{sel===o.id&&<div style={{width:8,height:8,borderRadius:"50%",background:BG}}/>}</div>
      </div>)}
    </div>
    <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"12px 16px 16px",background:`linear-gradient(to top,${BG} 60%,transparent)`}}>
      <button onClick={()=>sel&&onSelect()} style={{width:"100%",padding:"14px",borderRadius:14,border:"none",cursor:sel?"pointer":"not-allowed",background:sel?"linear-gradient(135deg,#6c63ff,#38bdf8)":"rgba(255,255,255,.06)",color:sel?"#fff":"rgba(255,255,255,.3)",fontSize:14,fontWeight:700,fontFamily:SANS}}>Continuar →</button>
    </div>
  </div>;
}

/* ── LOGIN ── */
function LoginScreen({onLogin,onRegister,onExit}){
  const [mode,setMode]=useState("login");
  const [email,setEmail]=useState(""), [pass,setPass]=useState(""), [error,setError]=useState(""), [showPass,setShowPass]=useState(false);
  const [rNome,setRNome]=useState(""), [rSobrenome,setRSobrenome]=useState("");
  const [rEmail,setREmail]=useState(""), [rPass,setRPass]=useState(""), [rPassConf,setRPassConf]=useState("");
  const [rFone,setRFone]=useState(""), [rNasc,setRNasc]=useState(""), [rCpf,setRCpf]=useState("");
  const [rTime,setRTime]=useState(""), [rIdade,setRIdade]=useState(false);
  const [rPrivacy,setRPrivacy]=useState(false), [showPrivacy,setShowPrivacy]=useState(false);
  const [rErrors,setRErrors]=useState({});

  const iS=(err,extra={})=>({width:"100%",background:"rgba(255,255,255,.05)",border:`1.5px solid ${err?"rgba(244,63,94,.5)":"rgba(255,255,255,.08)"}`,borderRadius:12,padding:"13px 16px",color:"#fff",fontSize:13,fontFamily:SANS,outline:"none",boxSizing:"border-box",caretColor:"#6c63ff",...extra});
  const lbl=(t)=><div style={{fontSize:9,color:"rgba(255,255,255,.45)",fontWeight:600,letterSpacing:"0.8px",fontFamily:SANS,marginBottom:5,textTransform:"uppercase"}}>{t}</div>;
  const fmtFone=(v)=>{const d=v.replace(/\D/g,"").slice(0,11);if(d.length<=2)return d.length?`(${d}`:"";if(d.length<=6)return`(${d.slice(0,2)}) ${d.slice(2)}`;if(d.length<=10)return`(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;return`(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;};
  const fmtCpf=(v)=>{const d=v.replace(/\D/g,"").slice(0,11);if(d.length<=3)return d;if(d.length<=6)return`${d.slice(0,3)}.${d.slice(3)}`;if(d.length<=9)return`${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;return`${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;};
  const fmtNasc=(v)=>{const d=v.replace(/\D/g,"").slice(0,8);if(d.length<=2)return d;if(d.length<=4)return`${d.slice(0,2)}/${d.slice(2)}`;return`${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}`;};
  const handleLogin=()=>{const found=USERS_DB.find(u=>u.email.toLowerCase()===email.trim().toLowerCase()&&u.password===pass);if(found){setError("");onLogin(found);}else setError("E-mail ou senha inválidos.");};
  const handleRegister=()=>{
    const errs={};
    if(!rNome.trim())errs.nome=true;if(!rSobrenome.trim())errs.sobrenome=true;
    if(!rEmail.trim()||!rEmail.includes("@"))errs.email=true;
    if(!rPass||rPass.length<6)errs.pass=true;if(!rPassConf||rPassConf!==rPass)errs.passConf=true;
    if(rFone.replace(/\D/g,"").length<10)errs.fone=true;if(rNasc.replace(/\D/g,"").length<8)errs.nasc=true;
    if(rCpf.replace(/\D/g,"").length<11)errs.cpf=true;if(!rTime)errs.time=true;
    if(!rIdade)errs.idade=true;if(!rPrivacy)errs.privacy=true;
    setRErrors(errs);if(Object.keys(errs).length>0)return;
    onRegister({id:`u_${Date.now()}`,name:`${rNome.trim()} ${rSobrenome.trim()}`,email:rEmail.trim(),role:"user",plan:"Jogador",planColor:MUTED,phone:rFone,cpf:rCpf,birthdate:rNasc,city:"",since:"Mar 2026",kyc:false,favoriteTeam:rTime});
  };
  const Checkbox=({checked,onChange,children,err})=>(
    <div onClick={onChange} style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:14,cursor:"pointer"}}>
      <div style={{width:22,height:22,borderRadius:7,border:`2px solid ${err?"rgba(244,63,94,.7)":checked?ACCENT:"rgba(255,255,255,.2)"}`,background:checked?ACCENT:"transparent",flexShrink:0,marginTop:1,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:BG,fontWeight:900,transition:"all .18s"}}>{checked?"✓":""}</div>
      <div style={{fontSize:11,color:err?"rgba(244,63,94,.9)":"rgba(255,255,255,.5)",fontFamily:SANS,lineHeight:1.6,paddingTop:3}}>{children}</div>
    </div>
  );

  if(mode==="login") return <div style={{flex:1,display:"flex",flexDirection:"column",background:"#07090f",overflow:"hidden"}}>
    {/* ── HERO HEADER ── */}
    <div style={{position:"relative",overflow:"hidden",background:"linear-gradient(160deg,#0d1228 0%,#0e1219 55%,#080b12 100%)",padding:"28px 20px 26px",flexShrink:0}}>
      <div style={{position:"absolute",top:-50,right:-40,width:200,height:200,background:"radial-gradient(circle,rgba(108,99,255,.18) 0%,transparent 65%)",borderRadius:"50%",pointerEvents:"none"}}/>
      <div style={{position:"absolute",bottom:-30,left:-20,width:150,height:150,background:"radial-gradient(circle,rgba(56,189,248,.1) 0%,transparent 65%)",borderRadius:"50%",pointerEvents:"none"}}/>
      <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:.05,pointerEvents:"none"}} viewBox="0 0 360 190" preserveAspectRatio="none">
        {[32,64,96,128,160].map(y=><line key={y} x1="0" y1={y} x2="360" y2={y} stroke="#6c63ff" strokeWidth="0.6"/>)}
        {[60,120,180,240,300].map(x=><line key={x} x1={x} y1="0" x2={x} y2="190" stroke="#6c63ff" strokeWidth="0.6"/>)}
      </svg>
      <div style={{position:"absolute",top:12,right:14}}><ExitBtn onExit={onExit}/></div>
      {/* Brand */}
      <div style={{display:"flex",alignItems:"center",gap:11,marginBottom:24}}>
        <div style={{width:46,height:46,borderRadius:15,background:"linear-gradient(135deg,rgba(108,99,255,.18),rgba(56,189,248,.12))",border:"1px solid rgba(108,99,255,.3)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 28px rgba(108,99,255,.2)"}}>
          <FootStockLogo size={30} rounded={false}/>
        </div>
        <div>
          <div style={{fontSize:19,fontWeight:700,color:"#fff",letterSpacing:"-0.5px",fontFamily:SANS,lineHeight:1,display:"flex",alignItems:"baseline",gap:5}}>FootStock<span style={{fontSize:9,fontWeight:900,color:GOLD,letterSpacing:"2px",fontFamily:SANS}}>BETA</span></div>
          <div style={{fontSize:8,color:ACCENT,fontWeight:600,letterSpacing:"3px",marginTop:3,fontFamily:SANS,opacity:.9}}>A BOLSA DO FUTEBOL</div>
        </div>
      </div>
      {/* Headline + chart deco */}
      <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.38)",fontFamily:SANS,marginBottom:5,letterSpacing:"0.3px"}}>Bem-vindo de volta</div>
          <div style={{fontSize:28,fontWeight:900,color:"#fff",letterSpacing:"-1.2px",fontFamily:SANS,lineHeight:1.05}}>Acesse sua<br/><span style={{background:"linear-gradient(90deg,#6c63ff,#38bdf8)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>conta</span></div>
        </div>
        <svg width="88" height="56" viewBox="0 0 88 56" fill="none" style={{opacity:.7,marginBottom:2}}>
          <polyline points="4,46 18,32 30,37 46,20 58,25 72,11 84,15" stroke={ACCENT} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" fill="none"/>
          <path d="M4,46 L18,32 L30,37 L46,20 L58,25 L72,11 L84,15 L84,54 L4,54 Z" fill={`${ACCENT}14`}/>
          <circle cx="84" cy="15" r="3.5" fill={ACCENT} opacity=".9"/>
          <circle cx="84" cy="15" r="6" fill={ACCENT} opacity=".2"/>
        </svg>
      </div>
    </div>

    {/* ── FORM ── */}
    <div style={{flex:1,overflowY:"auto",padding:"22px 20px 100px"}}>
      {/* Email */}
      <div style={{marginBottom:16}}>
        {lbl("E-mail")}
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:15,top:"50%",transform:"translateY(-50%)",fontSize:15,opacity:.3,pointerEvents:"none"}}>✉</span>
          <input placeholder="seu@email.com" style={{...iS(error&&!email),paddingLeft:42}} value={email} onChange={e=>{setEmail(e.target.value);setError("");}}/>
        </div>
      </div>
      {/* Password */}
      <div style={{marginBottom:error?10:24}}>
        {lbl("Senha")}
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:15,top:"50%",transform:"translateY(-50%)",fontSize:15,opacity:.3,pointerEvents:"none"}}>🔒</span>
          <input placeholder="••••••••" type={showPass?"text":"password"} style={{...iS(!!error),paddingLeft:42,paddingRight:46}} value={pass} onChange={e=>{setPass(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&handleLogin()}/>
          <button onClick={()=>setShowPass(v=>!v)} style={{position:"absolute",right:13,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:15,opacity:.4,color:"#fff",padding:0,lineHeight:1}}>{showPass?"🙈":"👁"}</button>
        </div>
      </div>
      {error&&<div style={{fontSize:10,color:"#f87171",fontFamily:SANS,marginBottom:16,display:"flex",alignItems:"center",gap:8,background:"rgba(244,63,94,.09)",border:"1px solid rgba(244,63,94,.22)",borderRadius:11,padding:"8px 13px"}}>⚠ {error}</div>}

      <div style={{textAlign:"center",fontSize:12,color:"rgba(255,255,255,.5)",fontFamily:SANS}}>
        Não tem conta?{" "}
        <span onClick={()=>{setMode("register");setError("");}} style={{color:ACCENT,cursor:"pointer",fontWeight:600,borderBottom:`1px solid rgba(108,99,255,.3)`,paddingBottom:1}}>Criar conta grátis</span>
      </div>
      {/* Market Hours */}
      {(()=>{
        const sess=getMarketSession();
        const sessions=[
          {id:"pre",     label:"Pré-abertura", color:"#f59e0b", start:"10:45", end:"11:00"},
          {id:"main",    label:"Negociação",   color:"#6c63ff", start:"11:00", end:"00:45"},
          {id:"closing", label:"Leilão",       color:"#38bdf8", start:"00:45", end:"01:00"},
          {id:"after",   label:"After-Market", color:"#8b5cf6", start:"01:00", end:"01:30"},
        ];
        return(
          <div style={{background:"rgba(255,255,255,.03)",border:`1px solid ${sess.id==="closed"?"rgba(244,63,94,.2)":"rgba(108,99,255,.18)"}`,borderRadius:13,padding:"11px 14px",marginTop:22}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:9}}>
              <div style={{fontSize:8,fontWeight:700,color:"rgba(255,255,255,.35)",letterSpacing:"1.5px",fontFamily:SANS}}>HORÁRIO DO MERCADO · BRASÍLIA</div>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:sess.color,boxShadow:`0 0 7px ${sess.color}`}}/>
                <span style={{fontSize:8,fontWeight:800,color:sess.color,fontFamily:SANS,letterSpacing:"1px"}}>{sess.short}</span>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {sessions.map(s=>{
                const active=s.id===sess.id;
                return(
                  <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:8,background:active?"rgba(255,255,255,.06)":"transparent",border:`1px solid ${active?"rgba(255,255,255,.1)":"transparent"}`}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:active?s.color:"rgba(255,255,255,.12)",flexShrink:0,boxShadow:active?`0 0 6px ${s.color}`:"none"}}/>
                    <span style={{fontSize:10,fontWeight:active?700:400,color:active?"#fff":"rgba(255,255,255,.3)",fontFamily:SANS,flex:1}}>{s.label}</span>
                    <span style={{fontSize:9,color:active?s.color:"rgba(255,255,255,.2)",fontFamily:MONO,fontWeight:active?700:400}}>{s.start} – {s.end}</span>
                  </div>
                );
              })}
            </div>
            {sess.id==="closed"&&<div style={{marginTop:8,fontSize:9,color:"rgba(244,63,94,.55)",fontFamily:SANS,textAlign:"center",fontStyle:"italic"}}>Mercado fechado · Reabre às 10:45</div>}
          </div>
        );
      })()}
    </div>

    <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"12px 20px 22px",background:"linear-gradient(to top,#07090f 70%,transparent)"}}>
      <button onClick={handleLogin} style={{width:"100%",padding:"17px",borderRadius:20,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#6c63ff 0%,#38bdf8 100%)",color:"#fff",fontSize:15,fontWeight:700,fontFamily:SANS,letterSpacing:"0.3px",boxShadow:"0 8px 32px rgba(108,99,255,.35)"}}>
        Acessar →
      </button>
    </div>
  </div>;

  // ── REGISTER ──
  return <div style={{flex:1,display:"flex",flexDirection:"column",background:"#07090f",overflow:"hidden"}}>
    <div style={{position:"relative",background:"linear-gradient(160deg,#0d1228,#0e1219)",padding:"18px 20px 16px",flexShrink:0,overflow:"hidden"}}>
      <div style={{position:"absolute",top:-30,right:-30,width:130,height:130,background:"radial-gradient(circle,rgba(108,99,255,.14),transparent 70%)",borderRadius:"50%",pointerEvents:"none"}}/>
      <div style={{position:"absolute",top:12,right:14}}><ExitBtn onExit={onExit}/></div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <div style={{width:38,height:38,borderRadius:12,background:"rgba(108,99,255,.14)",border:"1px solid rgba(108,99,255,.22)",display:"flex",alignItems:"center",justifyContent:"center"}}><FootStockLogo size={24} rounded={false}/></div>
        <div>
          <div style={{fontSize:16,fontWeight:700,color:"#fff",fontFamily:SANS}}>Criar conta</div>
          <div style={{fontSize:8,color:ACCENT,fontWeight:700,letterSpacing:"1.8px",fontFamily:SANS}}>FOOTSTOCK · GRATUITO</div>
        </div>
      </div>
      <div style={{display:"flex",gap:4}}>
        {["Dados Pessoais","Acesso","Time","Aceite"].map((s,i)=>(
          <div key={s} style={{flex:1,height:3,borderRadius:2,background:i===0?"rgba(108,99,255,.75)":i===1?(rEmail&&rPass&&rPassConf?"rgba(108,99,255,.4)":"rgba(255,255,255,.1)"):i===2?(rTime?"rgba(108,99,255,.4)":"rgba(255,255,255,.1)"):(rIdade&&rPrivacy?"rgba(108,99,255,.4)":"rgba(255,255,255,.1)")}}/>
        ))}
      </div>
    </div>

    <div style={{flex:1,overflowY:"auto",padding:"18px 20px 100px"}}>
      <div style={{display:"flex",gap:10,marginBottom:14}}>
        <div style={{flex:1}}>{lbl("Nome")}<input placeholder="Carlos" style={iS(rErrors.nome)} value={rNome} onChange={e=>{setRNome(e.target.value);setRErrors(p=>({...p,nome:false}));}}/></div>
        <div style={{flex:1}}>{lbl("Sobrenome")}<input placeholder="Henrique" style={iS(rErrors.sobrenome)} value={rSobrenome} onChange={e=>{setRSobrenome(e.target.value);setRErrors(p=>({...p,sobrenome:false}));}}/></div>
      </div>
      <div style={{marginBottom:14}}>{lbl("E-mail")}<input placeholder="seu@email.com" style={iS(rErrors.email)} value={rEmail} onChange={e=>{setREmail(e.target.value);setRErrors(p=>({...p,email:false}));}}/></div>
      <div style={{marginBottom:14}}>{lbl("Senha (mín. 6 caracteres)")}<input placeholder="••••••••" type="password" style={iS(rErrors.pass)} value={rPass} onChange={e=>{setRPass(e.target.value);setRErrors(p=>({...p,pass:false,passConf:rPassConf&&e.target.value!==rPassConf}));}}/></div>
      <div style={{marginBottom:14}}>
        {lbl("Confirmar senha")}
        <input placeholder="••••••••" type="password" style={iS(rErrors.passConf)} value={rPassConf} onChange={e=>{setRPassConf(e.target.value);setRErrors(p=>({...p,passConf:false}));}}/>
        {rErrors.passConf&&<div style={{fontSize:10,color:"#f87171",marginTop:4,fontFamily:SANS}}>⚠ As senhas não coincidem</div>}
        {rPassConf&&rPass&&rPassConf===rPass&&!rErrors.passConf&&<div style={{fontSize:10,color:ACCENT,marginTop:4,fontFamily:SANS}}>✓ Senhas conferem</div>}
      </div>
      <div style={{marginBottom:14}}>{lbl("Telefone com DDD")}<input placeholder="(11) 99999-9999" style={iS(rErrors.fone)} value={rFone} onChange={e=>{setRFone(fmtFone(e.target.value));setRErrors(p=>({...p,fone:false}));}} inputMode="numeric"/></div>
      <div style={{marginBottom:14}}>{lbl("Data de nascimento")}<input placeholder="DD/MM/AAAA" style={iS(rErrors.nasc)} value={rNasc} onChange={e=>{setRNasc(fmtNasc(e.target.value));setRErrors(p=>({...p,nasc:false}));}} inputMode="numeric"/></div>
      <div style={{marginBottom:14}}>{lbl("CPF")}<input placeholder="000.000.000-00" style={iS(rErrors.cpf)} value={rCpf} onChange={e=>{setRCpf(fmtCpf(e.target.value));setRErrors(p=>({...p,cpf:false}));}} inputMode="numeric"/></div>
      <div style={{marginBottom:20}}>
        {lbl("Time do Coração")}
        <div style={{position:"relative"}}>
          <select value={rTime} onChange={e=>{setRTime(e.target.value);setRErrors(p=>({...p,time:false}));}} style={{...iS(rErrors.time),paddingRight:38,appearance:"none",WebkitAppearance:"none",cursor:"pointer",color:rTime?"#fff":"rgba(255,255,255,.3)"}}>
            <option value="" disabled style={{background:"#111"}}>Selecione seu time...</option>
            {CLUBS.map(c=><option key={c.ticker} value={c.ticker} style={{background:"#111",color:"#fff"}}>{c.realName||c.name} · {c.ticker}</option>)}
          </select>
          <div style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",color:"rgba(255,255,255,.5)",pointerEvents:"none",fontSize:11}}>▼</div>
        </div>
        {rTime&&(()=>{const cl=CLUBS.find(c=>c.ticker===rTime);return cl?<div style={{marginTop:8,display:"flex",alignItems:"center",gap:9,padding:"7px 11px",background:`${cl.color}15`,border:`1px solid ${cl.color}38`,borderRadius:11}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:cl.color,flexShrink:0}}/>
          <span style={{fontSize:11,color:"#fff",fontFamily:SANS,fontWeight:700}}>{cl.realName||cl.name}</span>
          <span style={{fontSize:9,color:"rgba(255,255,255,.38)",fontFamily:MONO}}>{cl.ticker}</span>
        </div>:null;})()}
      </div>
      <div style={{borderTop:"1px solid rgba(255,255,255,.07)",paddingTop:16,marginBottom:8}}>
        <Checkbox checked={rIdade} onChange={()=>{setRIdade(v=>!v);setRErrors(p=>({...p,idade:false}));}} err={rErrors.idade}>
          Confirmo que tenho <span style={{color:"#fff",fontWeight:700}}>18 anos ou mais</span>
        </Checkbox>
        <Checkbox checked={rPrivacy} onChange={()=>{setRPrivacy(v=>!v);setRErrors(p=>({...p,privacy:false}));}} err={rErrors.privacy}>
          Li e aceito as{" "}<span onClick={e=>{e.stopPropagation();setShowPrivacy(true);}} style={{color:ACCENT,textDecoration:"underline",cursor:"pointer"}}>Políticas de Uso e Privacidade</span>{" "}(LGPD)
        </Checkbox>
      </div>
      {Object.values(rErrors).some(Boolean)&&<div style={{fontSize:10,color:"#f87171",fontFamily:SANS,marginBottom:10,background:"rgba(244,63,94,.08)",border:"1px solid rgba(244,63,94,.2)",borderRadius:11,padding:"8px 13px"}}>⚠ Preencha todos os campos obrigatórios</div>}
      <div style={{textAlign:"center",fontSize:12,color:"rgba(255,255,255,.5)",fontFamily:SANS}}>
        Já tem conta?{" "}
        <span onClick={()=>{setMode("login");setRErrors({});}} style={{color:ACCENT,cursor:"pointer",fontWeight:600,borderBottom:`1px solid rgba(108,99,255,.3)`,paddingBottom:1}}>Entrar</span>
      </div>
    </div>

    {showPrivacy&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.8)",zIndex:50,display:"flex",alignItems:"flex-end",backdropFilter:"blur(4px)"}}>
      <div style={{background:"#0f1923",borderRadius:"22px 22px 0 0",padding:"20px 20px 28px",width:"100%",maxHeight:"72%",overflowY:"auto",boxSizing:"border-box"}}>
        <div style={{width:36,height:4,background:"rgba(255,255,255,.12)",borderRadius:2,margin:"0 auto 18px"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:15,fontWeight:700,color:"#fff",fontFamily:SANS}}>Política de Privacidade</div>
          <button onClick={()=>setShowPrivacy(false)} style={{background:"rgba(255,255,255,.07)",border:"none",color:"rgba(255,255,255,.5)",cursor:"pointer",width:30,height:30,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>✕</button>
        </div>
        <div style={{fontSize:11,color:"rgba(255,255,255,.45)",fontFamily:SANS,lineHeight:1.9}}>
          <div style={{fontWeight:700,color:"rgba(255,255,255,.75)",marginBottom:6,fontSize:12}}>1. Coleta de Dados</div>
          Em conformidade com a LGPD (Lei 13.709/2018), o FootStock coleta apenas os dados necessários para a operação da plataforma.<br/><br/>
          <div style={{fontWeight:700,color:"rgba(255,255,255,.75)",marginBottom:6,fontSize:12}}>2. Uso dos Dados</div>
          Seus dados são utilizados exclusivamente para personalização da experiência e cumprimento de obrigações legais.<br/><br/>
          <div style={{fontWeight:700,color:"rgba(255,255,255,.75)",marginBottom:6,fontSize:12}}>3. Seus Direitos</div>
          Você pode solicitar acesso, correção ou exclusão dos seus dados a qualquer momento.
        </div>
        <button onClick={()=>{setShowPrivacy(false);setRPrivacy(true);setRErrors(p=>({...p,privacy:false}));}}
          style={{width:"100%",marginTop:18,padding:"15px",borderRadius:18,border:"none",background:"linear-gradient(135deg,#6c63ff,#38bdf8)",color:"#fff",fontSize:14,fontWeight:700,fontFamily:SANS,cursor:"pointer",boxShadow:"0 6px 24px rgba(108,99,255,.3)"}}>
          Entendi e Aceito ✓
        </button>
      </div>
    </div>}

    <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"12px 20px 22px",background:"linear-gradient(to top,#07090f 70%,transparent)"}}>
      <button onClick={handleRegister} style={{width:"100%",padding:"17px",borderRadius:20,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#6c63ff 0%,#38bdf8 100%)",color:"#fff",fontSize:15,fontWeight:700,fontFamily:SANS,boxShadow:"0 8px 32px rgba(108,99,255,.3)"}}>
        Criar conta grátis →
      </button>
    </div>
  </div>;
}

/* ── PLANS ── */
const PLANS=[
  {id:"jogador",name:"Jogador",price:0,priceA:0,color:"#7a8ba8",icon:"ball",cta:"Começar grátis",features:["FS$2.000 inicial","Cotações delay 1h","2 ordens/dia"],locked:["Ordem Precificada","Tempo real","Assessor","Ligas PRO"]},
  {id:"craque",name:"Craque",price:19.90,priceA:14.92,color:ACCENT,icon:"trophy",cta:"Assinar Craque",badge:"⭐ POPULAR",features:["FS$5.000 adicional","Cotações 30 min","5 ordens/dia","IA básica","Ordem Precificada"],locked:["Tempo real","Short Selling"]},
  {id:"lenda",name:"Lenda",price:39.90,priceA:29.92,color:GOLD,icon:"crown",cta:"Assinar Lenda",badge:"👑 PREMIUM",features:["FS$25.000 adicional","Tempo real","Ilimitado","IA VIP","Short","Alavancagem 2×"],locked:[]},
];

/* SVG icons customizados por plano */
function PlanIcon({icon,size=24,color}){
  if(icon==="ball") return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <radialGradient id="ballGradW" cx="35%" cy="28%" r="68%">
          <stop offset="0%" stopColor="#ffffff"/>
          <stop offset="60%" stopColor="#e2e8f0"/>
          <stop offset="100%" stopColor="#a8b8cc"/>
        </radialGradient>
      </defs>
      {/* Bola branca/cinza clara */}
      <circle cx="16" cy="16" r="13.5" fill="url(#ballGradW)" stroke="#cbd5e1" strokeWidth="1.2"/>
      {/* Pentagons pretos */}
      <polygon points="16,5.5 19.8,8.8 18.3,13.2 13.7,13.2 12.2,8.8" fill="#1e293b" opacity="0.88"/>
      <polygon points="6,11.5 9.8,10 12.2,13.2 10.5,17.8 6.2,17.2" fill="#1e293b" opacity="0.88"/>
      <polygon points="26,11.5 22.2,10 19.8,13.2 21.5,17.8 25.8,17.2" fill="#1e293b" opacity="0.88"/>
      <polygon points="8.8,23 10,18.5 13.7,17.5 16.3,20.8 14.8,25" fill="#1e293b" opacity="0.88"/>
      <polygon points="23.2,23 22,18.5 18.3,17.5 15.7,20.8 17.2,25" fill="#1e293b" opacity="0.88"/>
      {/* Brilho */}
      <ellipse cx="12" cy="10" rx="3.5" ry="2" fill="white" opacity="0.45" transform="rotate(-20 12 10)"/>
    </svg>
  );
  if(icon==="trophy") return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="trophyGold" x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="#fef08a"/>
          <stop offset="45%" stopColor="#facc15"/>
          <stop offset="100%" stopColor="#a16207"/>
        </linearGradient>
        <linearGradient id="trophyShine" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef9c3" stopOpacity="0.7"/>
          <stop offset="100%" stopColor="#facc15" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {/* Pedestal base */}
      <rect x="10" y="27" width="12" height="2.5" rx="1.2" fill="url(#trophyGold)" stroke="#ca8a04" strokeWidth="0.6"/>
      {/* Haste */}
      <rect x="14" y="22.5" width="4" height="5" rx="0.8" fill="url(#trophyGold)" stroke="#ca8a04" strokeWidth="0.6"/>
      {/* Copa */}
      <path d="M8 5 L8 16 C8 20.4 11.6 24 16 24 C20.4 24 24 20.4 24 16 L24 5 Z"
            fill="url(#trophyGold)" stroke="#ca8a04" strokeWidth="0.8"/>
      {/* Alças laterais */}
      <path d="M8 7 C8 7 4 7 4 11 C4 15 8 15 8 15" stroke="#ca8a04" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      <path d="M24 7 C24 7 28 7 28 11 C28 15 24 15 24 15" stroke="#ca8a04" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      {/* Brilho na copa */}
      <path d="M10 7 C10 7 11 6 14 6 L14 14 C12 13 10 11 10 7 Z" fill="url(#trophyShine)"/>
      {/* Estrela no centro */}
      <path d="M16 10 L17 13 L20 13 L17.5 14.8 L18.5 18 L16 16.2 L13.5 18 L14.5 14.8 L12 13 L15 13 Z"
            fill="white" opacity="0.85"/>
    </svg>
  );
  if(icon==="crown") return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="crownGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde68a"/>
          <stop offset="60%" stopColor="#f59e0b"/>
          <stop offset="100%" stopColor="#b45309"/>
        </linearGradient>
      </defs>
      <path d="M4 22 L6 12 L11 17 L16 8 L21 17 L26 12 L28 22 Z" fill="url(#crownGold)" stroke="#d97706" strokeWidth="1"/>
      <rect x="4" y="22" width="24" height="4" rx="1.5" fill="#d97706"/>
      <circle cx="16" cy="8"  r="2.2" fill="#fde68a" stroke="#f59e0b" strokeWidth="0.8"/>
      <circle cx="6"  cy="12" r="1.8" fill="#fde68a" stroke="#f59e0b" strokeWidth="0.8"/>
      <circle cx="26" cy="12" r="1.8" fill="#fde68a" stroke="#f59e0b" strokeWidth="0.8"/>
    </svg>
  );
  return <span style={{fontSize:size*0.7}}>🏅</span>;
}

function PlansScreen({onSelect,onExit}){
  const [sel,setSel]=useState("craque");
  const chosen=PLANS.find(p=>p.id===sel);
  return <div style={{flex:1,display:"flex",flexDirection:"column",background:BG,overflow:"hidden"}}>
    <div style={{padding:"8px 16px 0",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
      <div><div style={{fontSize:15,fontWeight:700,color:"#fff",fontFamily:SANS}}>Escolha seu Plano</div><div style={{fontSize:10,color:MUTED,fontFamily:SANS}}>Modalidade de pagamento na próxima etapa</div></div>
      <ExitBtn onExit={onExit}/>
    </div>
    {/* aviso de desconto à vista */}
    <div style={{margin:"4px 16px 0",background:"rgba(108,99,255,.07)",border:"1px solid rgba(108,99,255,.2)",borderRadius:10,padding:"7px 12px",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
      <span style={{fontSize:14}}>💰</span>
      <span style={{fontSize:10,color:"rgba(255,255,255,.55)",fontFamily:SANS}}>Pague <strong style={{color:ACCENT}}>à vista anual</strong> e economize <strong style={{color:ACCENT}}>25%</strong> — escolha na tela de pagamento.</span>
    </div>
    <div style={{flex:1,overflowY:"auto",padding:"10px 14px 80px"}}>
      {PLANS.map(p=><div key={p.id} onClick={()=>setSel(p.id)} style={{background:sel===p.id?`${p.color}09`:CARD,border:`1.5px solid ${sel===p.id?p.color:BORDER}`,borderRadius:18,padding:"14px",marginBottom:10,cursor:"pointer",transition:"all .2s",position:"relative"}}>
        {p.badge&&<div style={{position:"absolute",top:10,right:10,background:`${p.color}18`,border:`1px solid ${p.color}45`,borderRadius:20,padding:"2px 8px",fontSize:8,color:p.color,fontWeight:800}}>{p.badge}</div>}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <div style={{width:38,height:38,borderRadius:11,background:`${p.color}20`,border:`1.5px solid ${p.color}50`,display:"flex",alignItems:"center",justifyContent:"center"}}><PlanIcon icon={p.icon} size={22} color={p.color}/></div>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:700,color:"#fff",fontFamily:SANS}}>{p.name}</div>
            {p.price===0
              ? <div style={{fontSize:15,fontWeight:700,color:p.color,fontFamily:SANS}}>Grátis</div>
              : <div style={{display:"flex",alignItems:"baseline",gap:6,flexWrap:"wrap"}}>
                  <span style={{fontSize:15,fontWeight:700,color:p.color,fontFamily:SANS}}>R${p.price.toFixed(2).replace(".",",")}/mês</span>
                  <span style={{fontSize:9,color:MUTED,fontFamily:SANS}}>ou R${p.priceA.toFixed(2).replace(".",",")} à vista</span>
                </div>
            }
          </div>
          <div style={{width:22,height:22,borderRadius:"50%",border:`2px solid ${sel===p.id?p.color:BORDER}`,background:sel===p.id?p.color:"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>{sel===p.id&&<div style={{width:8,height:8,borderRadius:"50%",background:BG}}/>}</div>
        </div>
        {p.features.map(f=><div key={f} style={{fontSize:10.5,color:"rgba(255,255,255,.8)",fontFamily:SANS,padding:"3.5px 0",display:"flex",alignItems:"center",gap:7}}><span style={{color:p.color}}>✓</span>{f}</div>)}
        {p.locked.map(f=><div key={f} style={{fontSize:10.5,color:"rgba(255,255,255,.5)",fontFamily:SANS,padding:"3.5px 0",display:"flex",alignItems:"center",gap:7}}><span>🔒</span>{f}</div>)}
      </div>)}
    </div>
    <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"12px 16px 16px",background:`linear-gradient(to top,${BG} 65%,transparent)`}}>
      <button onClick={()=>onSelect(sel)} style={{width:"100%",padding:"14px",borderRadius:14,border:"none",cursor:"pointer",background:`linear-gradient(135deg,${chosen.color},${chosen.id==="lenda"?"#d97706":chosen.id==="craque"?"#38bdf8":"#7a8ba8"})`,color:chosen.id==="jogador"?TEXT:BG,fontSize:14,fontWeight:800,fontFamily:SANS}}>
        {chosen.cta}
      </button>
    </div>
  </div>;
}

/* ── PAYMENT ──
   Fluxo: escolha modalidade (à vista / parcelado) → escolha gateway → redirecionamento simulado
   → polling simulado aguarda confirmação do gateway → step "done" credita benefício.
   Quando houver backend real, substituir simulatePoll() por fetch() no endpoint de status. ── */
function PaymentScreen({plan,onSuccess,onBack,onExit,isUpgrade=false,previousPlan=null,billing="monthly"}){
  const pc={craque:ACCENT,lenda:GOLD}[plan]||ACCENT;
  const pLabel={craque:"Craque",lenda:"Lenda"}[plan];
  const pIconKey={craque:"trophy",lenda:"crown"}[plan]||"ball";

  // Preços: à vista (desconto 25%) e parcelado (sem desconto, até 12x)
  const PRICES={craque:{full:19.90,vista:14.92},lenda:{full:39.90,vista:29.92}};
  const pr=PRICES[plan]||{full:19.90,vista:14.92};

  // step: "modality" → "gateway" → "redirecting" → "waiting" → "done"
  const [step,setStep]=useState("modality");
  const [modality,setModality]=useState(null); // "vista" | "parcelado"
  const [gateway,setGateway]=useState(null);   // "mp" | "pagseg" | "paypal"
  const [pollCount,setPollCount]=useState(0);

  const GATEWAYS=[
    {id:"mp",     label:"Mercado Pago", color:"#009ee3", logo:"MP", sub:"Pix, cartão, saldo MP"},
    {id:"pagseg", label:"PagSeguro",    color:"#00b140", logo:"PS", sub:"Pix, boleto, cartão"},
    {id:"paypal", label:"PayPal",       color:"#003087", logo:"PP", sub:"Conta PayPal ou cartão"},
  ];

  // Simula redirecionamento ao gateway e polling de retorno
  const redirectToGateway=()=>{
    setStep("redirecting");
    // Simula 1.5s de "saindo do app para o gateway"
    setTimeout(()=>{
      setStep("waiting");
      // Polling simulado: 3 tentativas de 1.5s cada — simula webhook do backend confirmando
      // TODO (backend real): substituir por fetch(`/api/payment/status/${sessionId}`) a cada 3s
      let count=0;
      const poll=setInterval(()=>{
        count++;
        setPollCount(count);
        if(count>=3){ clearInterval(poll); setStep("done"); }
      },1500);
    },1500);
  };

  // step: DONE — dispara onSuccess imediatamente (garantia de benefício — Correção A)
  if(step==="done"){
    const confirmedBilling=modality==="vista"?"annual":"monthly";
    const upgradeDate=new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"});
    const due=new Date();
    due.setMonth(due.getMonth()+(confirmedBilling==="annual"?12:1));
    const nextBilling=due.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"});
    useEffect(()=>{ onSuccess(plan,confirmedBilling); },[]);
    return <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:BG,padding:"0 24px",textAlign:"center"}}>
      <div style={{width:80,height:80,borderRadius:"50%",background:`linear-gradient(135deg,${pc},${plan==="lenda"?"#d97706":"#38bdf8"})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,marginBottom:24,boxShadow:`0 0 50px ${pc}50`,animation:"pls 1.5s ease-in-out 1"}}>✓</div>
      <div style={{fontSize:10,color:pc,fontWeight:700,letterSpacing:"2px",fontFamily:SANS,marginBottom:8}}>PAGAMENTO CONFIRMADO</div>
      <div style={{fontSize:22,fontWeight:800,color:"#fff",fontFamily:SANS,letterSpacing:"-0.5px",marginBottom:6}}>{isUpgrade?"Upgrade realizado!":"Bem-vindo ao Plano"} {pLabel}! <PlanIcon icon={pIconKey} size={22} color={pc}/></div>
      {isUpgrade&&previousPlan&&<div style={{fontSize:11,color:MUTED,fontFamily:SANS,marginBottom:8}}>{previousPlan} → <span style={{color:pc,fontWeight:700}}>{pLabel}</span></div>}
      <div style={{background:`${pc}12`,border:`1px solid ${pc}30`,borderRadius:14,padding:"12px 16px",marginBottom:20,width:"100%",boxSizing:"border-box",textAlign:"left"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
          <span style={{fontSize:10,color:MUTED,fontFamily:SANS}}>Modalidade</span>
          <span style={{fontSize:10,fontWeight:700,color:pc,fontFamily:MONO}}>{modality==="vista"?"À vista (anual)":"Parcelado (mensal)"}</span>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
          <span style={{fontSize:10,color:MUTED,fontFamily:SANS}}>Gateway</span>
          <span style={{fontSize:10,fontWeight:700,color:"#fff",fontFamily:SANS}}>{GATEWAYS.find(g=>g.id===gateway)?.label||"—"}</span>
        </div>
        {isUpgrade&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
          <span style={{fontSize:10,color:MUTED,fontFamily:SANS}}>Ativação imediata</span>
          <span style={{fontSize:10,fontWeight:700,color:pc,fontFamily:MONO}}>{upgradeDate}</span>
        </div>}
        <div style={{display:"flex",justifyContent:"space-between"}}>
          <span style={{fontSize:10,color:MUTED,fontFamily:SANS}}>{confirmedBilling==="annual"?"Renovação anual em":"Próxima cobrança em"}</span>
          <span style={{fontSize:10,fontWeight:700,color:"#fff",fontFamily:MONO}}>{nextBilling}</span>
        </div>
      </div>
      <button onClick={()=>onSuccess(plan,confirmedBilling)} style={{width:"100%",padding:"15px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:SANS,fontWeight:900,fontSize:14,background:`linear-gradient(135deg,${pc},${plan==="lenda"?"#e8830a":ACCENT2})`,color:BG}}>{isUpgrade?"Continuar no FootStock →":"Acessar o FootStock →"}</button>
    </div>;
  }

  // step: WAITING — polling simulado (aguardando retorno do gateway)
  if(step==="waiting"){
    const gw=GATEWAYS.find(g=>g.id===gateway);
    return <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:BG,padding:"0 28px",textAlign:"center",gap:0}}>
      <div style={{width:64,height:64,borderRadius:"50%",border:`3px solid ${BORDER}`,borderTopColor:gw?.color||pc,animation:"spin 0.9s linear infinite",marginBottom:24}}/>
      <div style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:SANS,marginBottom:8}}>Aguardando confirmação</div>
      <div style={{fontSize:11,color:MUTED,fontFamily:SANS,lineHeight:1.7,marginBottom:24}}>
        Verificando retorno do <span style={{color:gw?.color,fontWeight:700}}>{gw?.label}</span>…<br/>
        <span style={{fontSize:9,opacity:.6}}>
          {/* TODO backend: polling real em /api/payment/status */}
          Tentativa {pollCount}/3 · aguarde alguns segundos
        </span>
      </div>
      <div style={{display:"flex",gap:6}}>
        {[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:i<pollCount?gw?.color||pc:BORDER,transition:"background .3s"}}/>)}
      </div>
    </div>;
  }

  // step: REDIRECTING — saindo do app para o gateway
  if(step==="redirecting"){
    const gw=GATEWAYS.find(g=>g.id===gateway);
    return <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:BG,padding:"0 28px",textAlign:"center",gap:16}}>
      <div style={{width:64,height:64,borderRadius:18,background:gw?.color||pc,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:900,color:"#fff",fontFamily:SANS,boxShadow:`0 0 32px ${gw?.color||pc}60`}}>{gw?.logo}</div>
      <div style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:SANS}}>Redirecionando para {gw?.label}</div>
      <div style={{fontSize:11,color:MUTED,fontFamily:SANS}}>Você será devolvido ao FootStock<br/>após concluir o pagamento.</div>
    </div>;
  }

  // step: GATEWAY — escolha do gateway
  if(step==="gateway"){
    const isVista=modality==="vista";
    const price=isVista?pr.vista:pr.full;
    const total=isVista?(pr.vista*12):pr.full;
    return <div style={{flex:1,display:"flex",flexDirection:"column",background:BG,overflow:"hidden"}}>
      <div style={{padding:"8px 16px 0",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <button onClick={()=>setStep("modality")} style={{background:"none",border:"none",color:MUTED,fontSize:11,cursor:"pointer",fontFamily:SANS,fontWeight:700,padding:0}}>← Voltar</button>
        <div style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:SANS}}>Escolher Gateway</div>
        <ExitBtn onExit={onExit}/>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"0 16px 100px"}}>
        {/* resumo do plano + modalidade */}
        <div style={{background:`${pc}10`,border:`1px solid ${pc}30`,borderRadius:14,padding:"12px 14px",marginBottom:20,display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:40,height:40,borderRadius:12,background:`${pc}20`,border:`1px solid ${pc}40`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><PlanIcon icon={pIconKey} size={24} color={pc}/></div>
          <div style={{flex:1}}>
            <div style={{fontSize:11,fontWeight:800,color:"#fff",fontFamily:SANS}}>Plano {pLabel} · {isVista?"À vista":"Parcelado"}</div>
            <div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>{isVista?`R$${total.toFixed(2).replace(".",",")} /ano (12× R$${price.toFixed(2).replace(".",",")})`:`R$${price.toFixed(2).replace(".",",")} /mês`}</div>
          </div>
          <div style={{fontSize:15,fontWeight:900,color:pc,fontFamily:SANS}}>R${price.toFixed(2).replace(".",",")}</div>
        </div>
        <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginBottom:12,letterSpacing:"1px",fontWeight:700}}>SELECIONE O GATEWAY DE PAGAMENTO</div>
        {GATEWAYS.map(gw=>(
          <div key={gw.id} onClick={()=>setGateway(gw.id)}
            style={{background:gateway===gw.id?`${gw.color}14`:CARD,border:`1.5px solid ${gateway===gw.id?gw.color:BORDER}`,borderRadius:14,padding:"14px",marginBottom:10,display:"flex",alignItems:"center",gap:12,cursor:"pointer",transition:"all .2s"}}>
            <div style={{width:42,height:42,borderRadius:12,background:gw.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:"#fff",fontFamily:SANS,flexShrink:0}}>{gw.logo}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:SANS}}>{gw.label}</div>
              <div style={{fontSize:10,color:MUTED,fontFamily:SANS}}>{gw.sub}</div>
            </div>
            <div style={{width:20,height:20,borderRadius:"50%",border:`2px solid ${gateway===gw.id?gw.color:BORDER}`,background:gateway===gw.id?gw.color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              {gateway===gw.id&&<div style={{width:7,height:7,borderRadius:"50%",background:BG}}/>}
            </div>
          </div>
        ))}
        <div style={{fontSize:9,color:"rgba(255,255,255,.2)",fontFamily:SANS,textAlign:"center",marginTop:8,lineHeight:1.6}}>
          Você será redirecionado ao gateway escolhido.<br/>
          O FootStock não armazena dados de pagamento.
        </div>
      </div>
      <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"10px 16px 16px",background:`linear-gradient(to top,${BG} 65%,transparent)`}}>
        <button onClick={()=>{if(!gateway)return;redirectToGateway();}}
          style={{width:"100%",padding:"15px",borderRadius:14,border:"none",cursor:gateway?"pointer":"not-allowed",background:gateway?`linear-gradient(135deg,${pc},${plan==="lenda"?"#e8830a":ACCENT2})`:SURFACE,color:gateway?BG:MUTED,fontSize:13,fontWeight:800,fontFamily:SANS,transition:"all .25s"}}>
          {gateway?`Ir para ${GATEWAYS.find(g=>g.id===gateway)?.label} →`:"Selecione um gateway"}
        </button>
      </div>
    </div>;
  }

  // step: MODALITY — escolha à vista ou parcelado (tela principal)
  return <div style={{flex:1,display:"flex",flexDirection:"column",background:BG,overflow:"hidden"}}>
    <div style={{padding:"8px 16px 0",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
      <button onClick={onBack} style={{background:"none",border:"none",color:MUTED,fontSize:11,cursor:"pointer",fontFamily:SANS,fontWeight:700,padding:0}}>← Planos</button>
      <div style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:SANS}}>Pagamento</div>
      <ExitBtn onExit={onExit}/>
    </div>
    <div style={{flex:1,overflowY:"auto",padding:"0 16px 100px"}}>
      {/* card do plano */}
      <div style={{background:`${pc}10`,border:`1px solid ${pc}35`,borderRadius:18,padding:"14px",marginBottom:22,display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:48,height:48,borderRadius:14,background:`${pc}20`,border:`1.5px solid ${pc}50`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><PlanIcon icon={pIconKey} size={28} color={pc}/></div>
        <div style={{flex:1}}>
          <div style={{fontSize:9,color:MUTED,fontFamily:SANS,letterSpacing:"0.5px"}}>ASSINATURA SELECIONADA</div>
          <div style={{fontSize:16,fontWeight:800,color:"#fff",fontFamily:SANS}}>Plano {pLabel}</div>
        </div>
      </div>
      {/* modalidades */}
      <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginBottom:10,letterSpacing:"1px",fontWeight:700}}>ESCOLHA A MODALIDADE</div>
      {/* À VISTA */}
      <div onClick={()=>setModality("vista")}
        style={{background:modality==="vista"?`${pc}10`:CARD,border:`1.5px solid ${modality==="vista"?pc:BORDER}`,borderRadius:16,padding:"16px",marginBottom:10,cursor:"pointer",transition:"all .2s",position:"relative",overflow:"hidden"}}>
        {/* badge destaque */}
        <div style={{position:"absolute",top:10,right:10,background:`linear-gradient(135deg,${pc},${plan==="lenda"?"#e8830a":ACCENT2})`,borderRadius:20,padding:"2px 8px",fontSize:8,fontWeight:900,color:BG}}>💰 -25%</div>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
          <div style={{width:20,height:20,borderRadius:"50%",border:`2px solid ${modality==="vista"?pc:BORDER}`,background:modality==="vista"?pc:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            {modality==="vista"&&<div style={{width:7,height:7,borderRadius:"50%",background:BG}}/>}
          </div>
          <div style={{fontSize:13,fontWeight:800,color:"#fff",fontFamily:SANS}}>À vista · Anual</div>
        </div>
        <div style={{paddingLeft:30}}>
          <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:4}}>
            <span style={{fontSize:22,fontWeight:900,color:pc,fontFamily:SANS}}>R${pr.vista.toFixed(2).replace(".",",")}</span>
            <span style={{fontSize:11,color:MUTED,fontFamily:SANS}}>/mês</span>
            <span style={{fontSize:10,color:"rgba(255,255,255,.3)",textDecoration:"line-through",fontFamily:SANS}}>R${pr.full.toFixed(2).replace(".",",")}</span>
          </div>
          <div style={{fontSize:10,color:MUTED,fontFamily:SANS}}>
            Cobrado à vista: <span style={{color:"#fff",fontWeight:700}}>R${(pr.vista*12).toFixed(2).replace(".",",")}/ano</span>
          </div>
          <div style={{fontSize:9,color:"rgba(255,255,255,.3)",fontFamily:SANS,marginTop:3}}>Renovação automática em 12 meses</div>
        </div>
      </div>
      {/* PARCELADO */}
      <div onClick={()=>setModality("parcelado")}
        style={{background:modality==="parcelado"?`${pc}10`:CARD,border:`1.5px solid ${modality==="parcelado"?pc:BORDER}`,borderRadius:16,padding:"16px",marginBottom:20,cursor:"pointer",transition:"all .2s"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
          <div style={{width:20,height:20,borderRadius:"50%",border:`2px solid ${modality==="parcelado"?pc:BORDER}`,background:modality==="parcelado"?pc:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            {modality==="parcelado"&&<div style={{width:7,height:7,borderRadius:"50%",background:BG}}/>}
          </div>
          <div style={{fontSize:13,fontWeight:800,color:"#fff",fontFamily:SANS}}>Parcelado · Mensal</div>
        </div>
        <div style={{paddingLeft:30}}>
          <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:4}}>
            <span style={{fontSize:22,fontWeight:900,color:modality==="parcelado"?pc:MUTED,fontFamily:SANS}}>R${pr.full.toFixed(2).replace(".",",")}</span>
            <span style={{fontSize:11,color:MUTED,fontFamily:SANS}}>/mês</span>
          </div>
          <div style={{fontSize:10,color:MUTED,fontFamily:SANS}}>
            Sem desconto · <span style={{color:"#fff",fontWeight:700}}>sem fidelidade</span>
          </div>
          <div style={{fontSize:9,color:"rgba(255,255,255,.3)",fontFamily:SANS,marginTop:3}}>Cancele quando quiser</div>
        </div>
      </div>
      {/* aviso transparência */}
      <div style={{background:"rgba(255,255,255,.03)",border:`1px solid ${BORDER}`,borderRadius:12,padding:"10px 13px",display:"flex",gap:9,alignItems:"flex-start"}}>
        <span style={{fontSize:14,flexShrink:0}}>🔒</span>
        <div style={{fontSize:9,color:"rgba(255,255,255,.35)",fontFamily:SANS,lineHeight:1.7}}>
          O pagamento é processado diretamente pelo gateway escolhido.<br/>
          O FootStock <strong style={{color:"rgba(255,255,255,.5)"}}>não armazena</strong> dados de cartão ou bancários.
        </div>
      </div>
    </div>
    <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"10px 16px 16px",background:`linear-gradient(to top,${BG} 65%,transparent)`}}>
      <button onClick={()=>{if(!modality)return;setStep("gateway");}}
        style={{width:"100%",padding:"15px",borderRadius:14,border:"none",cursor:modality?"pointer":"not-allowed",background:modality?`linear-gradient(135deg,${pc},${plan==="lenda"?"#e8830a":ACCENT2})`:SURFACE,color:modality?BG:MUTED,fontSize:13,fontWeight:800,fontFamily:SANS,transition:"all .25s"}}>
        {modality?"Escolher gateway de pagamento →":"Selecione uma modalidade"}
      </button>
    </div>
  </div>;
}

/* ── CREDENTIALS ── */
const USERS_DB=[
  {
    id:"admin",
    name:"Admin",
    email:"admin@footstock.com",
    password:"Master",
    role:"admin",            // acesso irrestrito
    plan:"Lenda",planColor:RED,
    phone:"(11) 99000-0001",cpf:"•••.•••.000-01",
    birthdate:"01/01/1990",city:"São Paulo – SP",
    since:"Janeiro 2026",kyc:true,
  },
  {
    id:"rodrigo",
    name:"Rodrigo Lima",
    email:"rodrigo@footstock.com",
    password:"Lima",
    role:"user_admin",       // acesso apenas à aba Usuários do admin
    plan:"Craque",planColor:ACCENT2,
    phone:"(11) 99000-0002",cpf:"•••.•••.000-02",
    birthdate:"15/06/1995",city:"Rio de Janeiro – RJ",
    since:"Fevereiro 2026",kyc:true,
  },
];

const MOCK_USER={name:"Carlos Henrique",email:"carloshenrique@email.com",phone:"(11) 98765-4321",cpf:"•••.•••.456-78",birthdate:"14/03/1992",city:"São Paulo – SP",plan:"Lenda",planColor:GOLD,since:"Janeiro 2026",kyc:true,role:"user",balance:25000};

function AdminPanel({onBack,onExit,role}){
  const isAdmin=role==="admin";
  const SECTIONS=isAdmin
    ?["👤 Usuários","⚽ Times","🏆 Ligas","📰 Notícias","📢 Anúncios","⚡ Impacto","⚙️ Motor"]
    :["👤 Usuários"];
  const [tab,setTab]=useState(SECTIONS[0]);
  const s={background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"12px",marginBottom:8};
  const btn2=(c,fg="#fff")=>({background:c,border:"none",borderRadius:8,padding:"5px 10px",color:fg,fontSize:9,fontWeight:800,fontFamily:SANS,cursor:"pointer"});
  return <div style={{flex:1,display:"flex",flexDirection:"column",background:BG,overflow:"hidden"}}>
    <div style={{padding:"10px 14px 0",flexShrink:0,background:"linear-gradient(135deg,rgba(244,63,94,.06),rgba(14,165,233,.04))",borderBottom:`1px solid ${BORDER}`}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:MUTED,fontSize:11,cursor:"pointer",fontFamily:SANS,fontWeight:700,padding:0}}>← App</button>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <div style={{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#f43f5e,#e8830a)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🛡️</div>
          <div><div style={{fontSize:12,fontWeight:800,color:"#fff",fontFamily:SANS}}>Painel Admin</div>
          <div style={{fontSize:7,color:RED,fontWeight:800,letterSpacing:"1.5px",fontFamily:SANS}}>{isAdmin?"ACESSO IRRESTRITO":"ACESSO RESTRITO"}</div></div>
        </div>
        <ExitBtn onExit={onExit}/>
      </div>
      {!isAdmin&&<div style={{background:"rgba(245,166,35,.08)",border:"1px solid rgba(245,166,35,.25)",borderRadius:10,padding:"7px 11px",marginBottom:10,display:"flex",alignItems:"center",gap:7}}>
        <span>🔒</span><span style={{fontSize:9,color:"#fde68a",fontFamily:SANS}}>Acesso restrito — apenas gestão de Usuários disponível.</span>
      </div>}
      <div style={{display:"flex",gap:4,overflowX:"auto",paddingBottom:10}}>
        {SECTIONS.map(s=><button key={s} onClick={()=>setTab(s)} style={{background:tab===s?`${RED}22`:SURFACE,border:`1px solid ${tab===s?RED:BORDER}`,borderRadius:20,padding:"5px 12px",color:tab===s?RED:MUTED,fontSize:9,fontWeight:tab===s?800:600,fontFamily:SANS,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{s}</button>)}
      </div>
    </div>
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,padding:24}}>
      <div style={{fontSize:40}}>🛡️</div>
      <div style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:SANS,textAlign:"center"}}>{tab}</div>
      <div style={{fontSize:11,color:MUTED,fontFamily:SANS,textAlign:"center",lineHeight:1.6}}>Esta seção está conectada ao banco de dados PostgreSQL e será carregada dinamicamente no ambiente de produção.</div>
      <div style={{background:"rgba(108,99,255,.06)",border:"1px solid rgba(108,99,255,.2)",borderRadius:12,padding:"12px 16px",width:"100%",maxWidth:280}}>
        <div style={{fontSize:8,color:ACCENT,fontWeight:800,letterSpacing:"1px",fontFamily:SANS,marginBottom:6}}>ACESSO CONCEDIDO</div>
        <div style={{fontSize:10,color:TEXT,fontFamily:SANS}}>Usuário: <span style={{color:isAdmin?RED:ACCENT2,fontWeight:700}}>{isAdmin?"Admin (Irrestrito)":"Rodrigo (Usuários)"}</span></div>
      </div>
    </div>
  </div>;
}

/* ── LOGO DROPDOWN ── */
function LogoDropdown({user,onProfile,onExit,onAdmin,onClose}){
  const canAdmin=user.role==="admin"||user.role==="user_admin";
  const items=[
    {ico:"👤",label:"Minha Conta",  sub:"Dados e configurações",  action:()=>{onProfile();onClose();}, danger:false, admin:false},
    ...(canAdmin?[{ico:"🛡️",label:"Painel Admin", sub:user.role==="admin"?"Acesso irrestrito":"Gestão de usuários", action:()=>{onAdmin();onClose();}, danger:false, admin:true}]:[]),
    {ico:"🚪",label:"Sair da conta",sub:"Encerrar sessão",         action:()=>{onExit();onClose();},   danger:true,  admin:false},
  ];
  return <>
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:40}}/>
    <div style={{position:"absolute",top:52,left:12,zIndex:50,width:230,background:CARD,border:`1px solid ${BORDER}`,borderRadius:18,overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,.7)",animation:"fadeIn .18s ease"}}>
      <div style={{padding:"14px 14px 12px",background:"linear-gradient(135deg,rgba(108,99,255,.07),rgba(14,165,233,.04))",borderBottom:`1px solid ${BORDER}`,display:"flex",alignItems:"center",gap:10}}>
        <Avatar user={user} size={44} fontSize={16}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:SANS,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.name}</div>
          <div style={{fontSize:10,color:MUTED,fontFamily:SANS,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.email}</div>
          <div style={{display:"flex",alignItems:"center",gap:5,marginTop:4,flexWrap:"wrap"}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:4,background:`${user.planColor}20`,border:`1px solid ${user.planColor}50`,borderRadius:20,padding:"2px 7px"}}>
              <div style={{width:5,height:5,borderRadius:"50%",background:user.planColor}}/>
              <span style={{fontSize:9,fontWeight:800,color:user.planColor,fontFamily:SANS}}>PLANO {user.plan.toUpperCase()}</span>
            </div>
            {canAdmin&&<div style={{display:"inline-flex",alignItems:"center",gap:3,background:"rgba(244,63,94,.12)",border:"1px solid rgba(244,63,94,.25)",borderRadius:20,padding:"2px 7px"}}>
              <span style={{fontSize:9,fontWeight:800,color:RED,fontFamily:SANS}}>{user.role==="admin"?"🛡️ ADMIN":"👤 OPER"}</span>
            </div>}
          </div>
        </div>
      </div>
      <div style={{padding:"6px 0"}}>
        {items.map((item,i)=><button key={i} onClick={item.action} style={{width:"100%",background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:10,padding:"11px 14px",transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background=item.danger?"rgba(244,63,94,.07)":item.admin?"rgba(244,63,94,.05)":"rgba(255,255,255,.04)"} onMouseLeave={e=>e.currentTarget.style.background="none"}>
          <div style={{width:30,height:30,borderRadius:9,background:item.danger?"rgba(244,63,94,.1)":item.admin?"rgba(244,63,94,.08)":SURFACE,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,border:`1px solid ${item.danger?"rgba(244,63,94,.2)":item.admin?"rgba(244,63,94,.15)":BORDER}`,flexShrink:0}}>{item.ico}</div>
          <div style={{textAlign:"left"}}>
            <div style={{fontSize:12,fontWeight:700,color:item.danger?RED:item.admin?"#fda4af":"#e2e8f0",fontFamily:SANS}}>{item.label}</div>
            <div style={{fontSize:10,color:MUTED,fontFamily:SANS}}>{item.sub}</div>
          </div>
          <span style={{marginLeft:"auto",fontSize:12,color:MUTED}}>›</span>
        </button>)}
      </div>
    </div>
  </>;
}

/* ── PROFILE ── */
function ProfileScreen({user,onBack,onExit}){
  const [editing,setEditing]=useState(false),  [form,setForm]=useState({name:user.name,email:user.email,phone:user.phone,city:user.city}),  [saved,setSaved]=useState(false);
  const iS={width:"100%",background:SURFACE,border:`1.5px solid ${ACCENT}`,borderRadius:10,padding:"10px 13px",color:TEXT,fontSize:12,fontFamily:SANS,outline:"none",boxSizing:"border-box"};
  const roS={background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 13px",fontSize:12,color:TEXT,fontFamily:SANS,display:"flex",alignItems:"center",justifyContent:"space-between"};
  return <div style={{flex:1,display:"flex",flexDirection:"column",background:BG,overflow:"hidden"}}>
    <div style={{padding:"8px 16px 0",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}><button onClick={onBack} style={{background:"none",border:"none",color:MUTED,fontSize:11,cursor:"pointer",fontFamily:SANS,fontWeight:700,padding:0}}>← Voltar</button><div style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:SANS}}>Minha Conta</div><ExitBtn onExit={onExit}/></div>
    <div style={{flex:1,overflowY:"auto",padding:"0 16px"}}>
      <div style={{background:"linear-gradient(135deg,rgba(108,99,255,.08),rgba(14,165,233,.05))",border:`1px solid ${BORDER}`,borderRadius:20,padding:"20px 16px",marginBottom:18,display:"flex",alignItems:"center",gap:14}}><Avatar user={user} size={60} fontSize={20}/><div><div style={{fontSize:18,fontWeight:800,color:"#fff",fontFamily:SANS,marginBottom:4}}>{form.name}</div><div style={{display:"inline-flex",alignItems:"center",gap:5,background:`${user.planColor}20`,border:`1px solid ${user.planColor}40`,borderRadius:20,padding:"3px 10px"}}><span style={{fontSize:12,display:"flex",alignItems:"center"}}>{user.plan==="Lenda"?"👑":user.plan==="Craque"?"🎯":<FootStockLogo size={14} rounded={false}/>}</span><span style={{fontSize:10,fontWeight:800,color:user.planColor,fontFamily:SANS}}>Plano {user.plan}</span></div></div></div>
      {saved&&<div style={{background:"rgba(108,99,255,.12)",border:`1px solid ${ACCENT}40`,borderRadius:12,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:14}}>✅</span><span style={{fontSize:12,fontWeight:700,color:ACCENT,fontFamily:SANS}}>Dados atualizados!</span></div>}
      <div style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:"1px",fontFamily:SANS,marginBottom:10}}>DADOS PESSOAIS</div>
      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:16,padding:"14px",marginBottom:14}}>
        {[{l:"NOME COMPLETO",k:"name"},{l:"E-MAIL",k:"email"},{l:"TELEFONE",k:"phone"},{l:"CIDADE",k:"city"}].map(f=><div key={f.k} style={{marginBottom:12}}><div style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:"0.8px",fontFamily:SANS,marginBottom:5}}>{f.l}</div>{editing?<input style={iS} value={form[f.k]} onChange={e=>setForm({...form,[f.k]:e.target.value})}/> :<div style={roS}>{form[f.k]}</div>}</div>)}
        {[{l:"CPF",v:user.cpf},{l:"DATA DE NASCIMENTO",v:user.birthdate}].map(f=><div key={f.l} style={{marginBottom:12}}><div style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:"0.8px",fontFamily:SANS,marginBottom:5}}>{f.l}</div><div style={roS}>{f.v}<span style={{fontSize:10,color:"#334155"}}>🔒</span></div></div>)}
      </div>
    </div>
    <div style={{padding:"10px 16px 14px",flexShrink:0}}>
      {editing?<div style={{display:"flex",gap:8}}><button onClick={()=>setEditing(false)} style={{flex:1,padding:"12px",borderRadius:13,border:`1px solid ${BORDER}`,background:"none",color:MUTED,fontSize:12,fontWeight:700,fontFamily:SANS,cursor:"pointer"}}>Cancelar</button><button onClick={()=>{setSaved(true);setEditing(false);setTimeout(()=>setSaved(false),2500);}} style={{flex:2,padding:"12px",borderRadius:13,border:"none",background:"linear-gradient(135deg,#6c63ff,#38bdf8)",color:BG,fontSize:12,fontWeight:800,fontFamily:SANS,cursor:"pointer"}}>Salvar</button></div>:<button onClick={()=>setEditing(true)} style={{width:"100%",padding:"13px",borderRadius:13,border:`1px solid ${ACCENT}50`,background:`${ACCENT}10`,color:ACCENT,fontSize:12,fontWeight:800,fontFamily:SANS,cursor:"pointer"}}>✎ Editar dados pessoais</button>}
    </div>
  </div>;
}

/* ── EXTRATO ── */
function ExtratoScreen({txLog,scheduledOrders,limitedOrders=[],ocoOrders=[],cancelScheduled,cancelLimited,cancelOco,onBack,onExit}){
  const [activeTab,setActiveTab]=useState("all"); // "all" | "scheduled" | "limited" | "oco"
  const card={background:CARD,borderRadius:16,border:`1px solid ${BORDER}`};

  // ── Transações executadas agrupadas por dia ──
  const byDay={};
  txLog.forEach(tx=>{
    if(!byDay[tx.date]){byDay[tx.date]={date:tx.date,openBalance:tx.balanceBefore,closeBalance:tx.balanceAfter,txs:[]};}
    byDay[tx.date].txs.push(tx);
    byDay[tx.date].closeBalance=tx.balanceAfter;
  });
  const days=Object.values(byDay).sort((a,b)=>b.date.localeCompare(a.date));
  const fmtDate=d=>{const[y,m,day]=d.split("-");return `${day} ${["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][+m-1]} ${y}`;};
  const fmtDatetime=iso=>{const d=new Date(iso);return d.toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})+` · ${d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}`;};
  const totBuy=txLog.filter(t=>t.type==="buy").reduce((s,t)=>s+(t.total||0),0);
  const totSell=txLog.filter(t=>t.type==="sell").reduce((s,t)=>s+(t.total||0),0);

  const pendingOrders=scheduledOrders.filter(o=>o.status!=="cancelled");
  const cancelledOrders=scheduledOrders.filter(o=>o.status==="cancelled");
  const pendingLimited=limitedOrders.filter(o=>o.status==="pending");
  const executedLimited=limitedOrders.filter(o=>o.status==="executed");
  const cancelledLimited=limitedOrders.filter(o=>o.status==="cancelled");
  const pendingOco=ocoOrders.filter(o=>o.status==="pending");
  const executedOco=ocoOrders.filter(o=>o.status==="executed");
  const cancelledOco=ocoOrders.filter(o=>o.status==="cancelled");

  return <div style={{flex:1,display:"flex",flexDirection:"column",background:BG,overflow:"hidden"}}>
    {/* Header */}
    <div style={{padding:"8px 14px 0",flexShrink:0}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:MUTED,fontSize:11,cursor:"pointer",fontFamily:SANS,fontWeight:700,padding:0}}>← Carteira</button>
        <div style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:SANS}}>Extrato</div>
        <ExitBtn onExit={onExit}/>
      </div>
      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {[{id:"all",label:"Operações",count:txLog.length},{id:"scheduled",label:"Agendadas",count:pendingOrders.length},{id:"limited",label:"Precificadas",count:pendingLimited.length},{id:"oco",label:"SL / TP",count:pendingOco.length}].map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{flex:1,padding:"8px",borderRadius:10,border:`1px solid ${activeTab===t.id?"rgba(108,99,255,.4)":BORDER}`,background:activeTab===t.id?"rgba(108,99,255,.08)":SURFACE,color:activeTab===t.id?ACCENT:MUTED,fontSize:10,fontWeight:800,fontFamily:SANS,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            {t.label}
            {t.count>0&&<span style={{background:activeTab===t.id?"rgba(108,99,255,.25)":"rgba(255,255,255,.08)",color:activeTab===t.id?ACCENT:"rgba(255,255,255,.6)",borderRadius:10,padding:"1px 6px",fontSize:8,fontWeight:900}}>{t.count}</span>}
          </button>
        ))}
      </div>
    </div>

    <div style={{flex:1,overflowY:"auto",padding:"0 14px 16px"}}>

      {/* ── ABA OPERAÇÕES ── */}
      {activeTab==="all"&&<>
        <div style={{background:"linear-gradient(135deg,rgba(108,99,255,.08),rgba(56,189,248,.04))",border:"1px solid rgba(108,99,255,.2)",borderRadius:18,padding:"16px",marginBottom:18}}>
          <div style={{fontSize:8,color:MUTED,letterSpacing:"1.5px",fontWeight:700,marginBottom:6,fontFamily:SANS}}>RESUMO DO PERÍODO</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            {[{l:"COMPRAS",v:`FS$${totBuy.toLocaleString("pt-BR",{minimumFractionDigits:2})}`,c:ACCENT,i:"▲"},
              {l:"VENDAS",v:`FS$${totSell.toLocaleString("pt-BR",{minimumFractionDigits:2})}`,c:RED,i:"▼"},
              {l:"OPERAÇÕES",v:txLog.length,c:"#fff",i:"📋"}
            ].map(s=><div key={s.l}><div style={{fontSize:7,color:MUTED,fontFamily:SANS,letterSpacing:"0.5px",marginBottom:4}}>{s.l}</div><div style={{fontSize:11,fontWeight:900,color:s.c,fontFamily:MONO}}>{s.i} {s.v}</div></div>)}
          </div>
        </div>
        {txLog.length===0&&<div style={{...card,padding:"32px",textAlign:"center"}}><div style={{fontSize:28,marginBottom:10}}>📋</div><div style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:SANS}}>Nenhuma transação ainda</div><div style={{fontSize:10,color:MUTED,fontFamily:SANS,marginTop:5}}>Suas compras e vendas aparecerão aqui.</div></div>}
        {days.map(day=>{
          const dayPnl=day.closeBalance-day.openBalance;
          return <div key={day.date} style={{marginBottom:18}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:7,height:7,borderRadius:"50%",background:ACCENT,boxShadow:`0 0 8px ${ACCENT}60`}}/><span style={{fontSize:11,fontWeight:800,color:"#fff",fontFamily:SANS}}>{fmtDate(day.date)}</span></div>
              <span style={{fontSize:9,fontWeight:700,color:dayPnl>=0?ACCENT:RED,fontFamily:MONO}}>{dayPnl>=0?"+":""}FS${dayPnl.toLocaleString("pt-BR",{minimumFractionDigits:2})}</span>
            </div>
            <div style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:11,padding:"9px 13px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:28,height:28,borderRadius:8,background:"rgba(74,85,104,.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>🌅</div><div><div style={{fontSize:10,fontWeight:700,color:"#a8b8cc",fontFamily:SANS}}>Saldo inicial</div><div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>Abertura de pregão</div></div></div>
              <div style={{textAlign:"right"}}><div style={{fontSize:12,fontWeight:800,color:"#fff",fontFamily:MONO}}>FS${day.openBalance.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div></div>
            </div>
            {day.txs.map((tx,i)=>{
              if(tx.type==="upgrade"){
                const planColor=tx.plan==="Lenda"?GOLD:ACCENT;
                const planIcon=tx.plan==="Lenda"?"👑":"⭐";
                return <div key={i} style={{background:`${planColor}10`,border:`1.5px solid ${planColor}40`,borderRadius:11,padding:"10px 13px",marginBottom:6,display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:32,height:32,borderRadius:9,background:`linear-gradient(135deg,${planColor}40,${planColor}20)`,border:`1px solid ${planColor}50`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{planIcon}</div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                      <span style={{fontSize:11,fontWeight:800,color:"#fff",fontFamily:SANS}}>Upgrade de Plano</span>
                      <span style={{fontSize:8,background:`${planColor}25`,color:planColor,borderRadius:5,padding:"1px 6px",fontWeight:800,fontFamily:SANS}}>{planIcon} {tx.plan.toUpperCase()}</span>
                    </div>
                    <div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>Bônus de boas-vindas · Plano {tx.plan}</div>
                    <div style={{fontSize:8,color:"#334155",fontFamily:SANS,marginTop:1}}>{tx.time}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:12,fontWeight:900,color:planColor,fontFamily:MONO}}>+FS${tx.bonus.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
                    <div style={{fontSize:9,color:MUTED,fontFamily:MONO,marginTop:2}}>FS${tx.balanceAfter.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
                  </div>
                </div>;
              }
              const club=CLUBS.find(c=>c.ticker===tx.ticker);
              const isBuy=tx.type==="buy";
              const isShortOpen=tx.type==="short_open";
              const isShortClose=tx.type==="short_close";
              const isShort=isShortOpen||isShortClose;
              const txColor=isBuy?ACCENT:isShortOpen?RED:isShortClose?(tx.pnl>=0?ACCENT:RED):RED;
              const txBg=isBuy?"rgba(108,99,255,.05)":isShortOpen?"rgba(244,63,94,.05)":isShortClose?(tx.pnl>=0?"rgba(108,99,255,.05)":"rgba(244,63,94,.05)"):"rgba(244,63,94,.05)";
              const txBorder=isBuy?"rgba(108,99,255,.18)":isShortOpen?"rgba(244,63,94,.18)":isShortClose?(tx.pnl>=0?"rgba(108,99,255,.18)":"rgba(244,63,94,.18)"):"rgba(244,63,94,.18)";
              const txLabel=isBuy?"COMPRA":isShortOpen?"SHORT ▼":isShortClose?"RECOMPRA ▲":"VENDA";
              const txAmount=isShortClose?(tx.pnl||0):isBuy?tx.total:tx.total;
              const txSign=isBuy?"-":isShortClose?(tx.pnl>=0?"+":"-"):"+";
              return <div key={i} style={{background:txBg,border:`1px solid ${txBorder}`,borderRadius:11,padding:"9px 13px",marginBottom:6,display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:32,height:32,borderRadius:9,background:isShort?`linear-gradient(145deg,${RED}60,${RED}30)`:`linear-gradient(145deg,${club?.color||"#333"},${club?.color||"#333"}99)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:isShort?14:8,fontWeight:900,color:club?.c2||"#fff",flexShrink:0}}>{isShort?"📉":tx.ticker.replace(/\d/g,"")}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,fontWeight:800,color:"#fff",fontFamily:SANS}}>{tx.ticker}</span>
                    <span style={{fontSize:8,background:`${txColor}20`,color:txColor,borderRadius:5,padding:"1px 6px",fontWeight:800,fontFamily:SANS}}>{txLabel}</span>
                    {tx.scheduled&&<span style={{fontSize:7,background:"rgba(139,92,246,.2)",color:"#a78bfa",borderRadius:5,padding:"1px 6px",fontWeight:800,fontFamily:SANS}}>📅 AGENDADA</span>}
                    {tx.oco&&<span style={{fontSize:7,background:"rgba(245,166,35,.2)",color:GOLD,borderRadius:5,padding:"1px 6px",fontWeight:800,fontFamily:SANS}}>🛡 OCO</span>}
                    {isShortClose&&<span style={{fontSize:7,background:tx.pnl>=0?"rgba(108,99,255,.15)":"rgba(244,63,94,.15)",color:tx.pnl>=0?ACCENT:RED,borderRadius:5,padding:"1px 6px",fontWeight:800,fontFamily:SANS}}>P&L {tx.pnl>=0?"+":""}FS${(tx.pnl||0).toFixed(2)}</span>}
                  </div>
                  <div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>{tx.qty} cota{tx.qty!==1?"s":""}{isShort?` · Notional FS$${tx.total?.toFixed(2)||"—"}`:` · FS$${tx.price?.toFixed(2)} cada`}{tx.fee?<span style={{color:"#f5a623",marginLeft:6}}>taxa FS${tx.fee.toFixed(2)}</span>:""}</div>
                  <div style={{fontSize:8,color:"#334155",fontFamily:SANS,marginTop:1}}>{tx.time}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:12,fontWeight:900,color:txColor,fontFamily:MONO}}>{txSign}FS${Math.abs(isShortClose?(tx.pnl||0):txAmount).toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
                  <div style={{fontSize:9,color:MUTED,fontFamily:MONO,marginTop:2}}>FS${tx.balanceAfter?.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
                </div>
              </div>;
            })}
            <div style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:11,padding:"9px 13px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:28,height:28,borderRadius:8,background:dayPnl>=0?"rgba(108,99,255,.15)":"rgba(244,63,94,.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>{dayPnl>=0?"🌙":"📉"}</div><div><div style={{fontSize:10,fontWeight:700,color:"#a8b8cc",fontFamily:SANS}}>Saldo final</div><div style={{fontSize:9,color:dayPnl>=0?ACCENT:RED,fontFamily:SANS,marginTop:1}}>{dayPnl>=0?"▲":""} FS${Math.abs(dayPnl).toLocaleString("pt-BR",{minimumFractionDigits:2})}</div></div></div>
              <div style={{textAlign:"right"}}><div style={{fontSize:13,fontWeight:900,color:dayPnl>=0?ACCENT:"#fff",fontFamily:MONO}}>FS${day.closeBalance.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div></div>
            </div>
          </div>;
        })}
      </>}

      {/* ── ABA AGENDADAS ── */}
      {activeTab==="scheduled"&&<>
        {scheduledOrders.length===0&&<div style={{...card,padding:"32px",textAlign:"center"}}><div style={{fontSize:28,marginBottom:10}}>📅</div><div style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:SANS}}>Nenhuma ordem agendada</div><div style={{fontSize:10,color:MUTED,fontFamily:SANS,marginTop:5}}>Ordens agendadas fora do horário de mercado aparecerão aqui.</div></div>}

        {/* Pendentes */}
        {pendingOrders.length>0&&<>
          <div style={{fontSize:8,color:"#a78bfa",fontWeight:800,letterSpacing:"1.2px",fontFamily:SANS,marginBottom:8}}>AGUARDANDO EXECUÇÃO · {pendingOrders.length}</div>
          {pendingOrders.map(o=>{
            const club=CLUBS.find(c=>c.ticker===o.ticker),isBuy=o.side==="buy";
            const accentCol=isBuy?ACCENT:RED;
            return <div key={o.id} style={{background:"rgba(139,92,246,.07)",border:"1px solid rgba(139,92,246,.28)",borderRadius:13,padding:"12px 13px",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <div style={{width:34,height:34,borderRadius:10,background:`linear-gradient(145deg,${club?.color||"#333"},${club?.color||"#333"}88)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:900,color:club?.c2||"#fff",flexShrink:0}}>{o.ticker.replace(/\d/g,"")}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                    <span style={{fontSize:11,fontWeight:800,color:"#fff",fontFamily:SANS}}>{o.ticker}</span>
                    <span style={{fontSize:8,background:isBuy?`${ACCENT}20`:`${RED}20`,color:accentCol,borderRadius:5,padding:"1px 6px",fontWeight:800,fontFamily:SANS}}>{isBuy?"COMPRA":"VENDA"}</span>
                    <span style={{fontSize:7,background:"rgba(139,92,246,.25)",color:"#c4b5fd",borderRadius:5,padding:"1px 7px",fontWeight:800,fontFamily:SANS}}>⏳ PENDENTE</span>
                  </div>
                  <div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>{o.qty} cota{o.qty!==1?"s":""} · {o.priceType==="close"?"Preço de fechamento":`Limite FS$${o.fixedPrice?.toFixed(2)}`}</div>
                  <div style={{fontSize:8,color:"rgba(255,255,255,.45)",fontFamily:SANS,marginTop:1}}>Agendada {fmtDatetime(o.scheduledAt)}</div>
                </div>
                <button onClick={()=>cancelScheduled(o.id)} style={{background:"rgba(244,63,94,.15)",border:"1px solid rgba(244,63,94,.3)",borderRadius:8,color:"#f43f5e",fontSize:10,fontWeight:800,padding:"4px 9px",cursor:"pointer",fontFamily:SANS,flexShrink:0}}>✕</button>
              </div>
              <div style={{background:"rgba(245,166,35,.07)",border:"1px solid rgba(245,166,35,.18)",borderRadius:8,padding:"5px 10px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:8,color:"#d4a017",fontFamily:SANS}}>⚡ Executa na abertura · 11h00</span>
                <span style={{fontSize:9,fontWeight:700,color:"#f5a623",fontFamily:MONO}}>FS${o.closePrice.toFixed(2)} fechamento</span>
              </div>
            </div>;
          })}
        </>}

        {/* Canceladas */}
        {cancelledOrders.length>0&&<>
          <div style={{fontSize:8,color:RED,fontWeight:800,letterSpacing:"1.2px",fontFamily:SANS,marginBottom:8,marginTop:16}}>CANCELADAS · {cancelledOrders.length}</div>
          {cancelledOrders.map(o=>{
            const club=CLUBS.find(c=>c.ticker===o.ticker),isBuy=o.side==="buy";
            return <div key={o.id} style={{background:"rgba(244,63,94,.05)",border:"1px solid rgba(244,63,94,.15)",borderRadius:13,padding:"12px 13px",marginBottom:8,opacity:.75}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:34,height:34,borderRadius:10,background:"rgba(255,255,255,.08)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:900,color:"rgba(255,255,255,.6)",flexShrink:0}}>{o.ticker.replace(/\d/g,"")}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                    <span style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,.5)",fontFamily:SANS}}>{o.ticker}</span>
                    <span style={{fontSize:8,background:"rgba(244,63,94,.15)",color:RED,borderRadius:5,padding:"1px 6px",fontWeight:800,fontFamily:SANS}}>{isBuy?"COMPRA":"VENDA"}</span>
                    <span style={{fontSize:7,background:"rgba(244,63,94,.2)",color:"#f87171",borderRadius:5,padding:"1px 7px",fontWeight:800,fontFamily:SANS}}>✕ CANCELADA</span>
                  </div>
                  <div style={{fontSize:9,color:"rgba(255,255,255,.5)",fontFamily:SANS}}>{o.qty} cota{o.qty!==1?"s":""} · {o.priceType==="close"?"Preço de fechamento":`Limite FS$${o.fixedPrice?.toFixed(2)}`}</div>
                  <div style={{fontSize:8,color:"rgba(255,255,255,.38)",fontFamily:SANS,marginTop:1}}>Cancelada {fmtDatetime(o.cancelledAt||o.scheduledAt)}</div>
                </div>
              </div>
            </div>;
          })}
        </>}
      </>}

      {/* ── ABA PRECIFICADAS ── */}
      {activeTab==="limited"&&<>
        {limitedOrders.length===0&&<div style={{...card,padding:"32px",textAlign:"center"}}><div style={{fontSize:28,marginBottom:10}}>🎯</div><div style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:SANS}}>Nenhuma ordem precificada</div><div style={{fontSize:10,color:MUTED,fontFamily:SANS,marginTop:5}}>Crie ordens com preço limite no modal de Compra ou Venda.</div></div>}

        {/* Pendentes */}
        {pendingLimited.length>0&&<>
          <div style={{fontSize:8,color:GOLD,fontWeight:800,letterSpacing:"1.2px",fontFamily:SANS,marginBottom:8}}>AGUARDANDO MERCADO · {pendingLimited.length}</div>
          {pendingLimited.map(o=>{
            const club=CLUBS.find(c=>c.ticker===o.ticker),isBuy=o.side==="buy";
            const accentCol=isBuy?ACCENT:RED;
            const mktDiff=o.mktPrice?+((o.limitPrice-o.mktPrice)/o.mktPrice*100).toFixed(2):null;
            return <div key={o.id} style={{background:"rgba(245,166,35,.06)",border:"1px solid rgba(245,166,35,.28)",borderRadius:13,padding:"12px 13px",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <div style={{width:34,height:34,borderRadius:10,background:`linear-gradient(145deg,${club?.color||"#333"},${club?.color||"#333"}88)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:900,color:club?.c2||"#fff",flexShrink:0}}>{o.ticker.replace(/\d/g,"")}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,fontWeight:800,color:"#fff",fontFamily:SANS}}>{o.ticker}</span>
                    <span style={{fontSize:8,background:isBuy?`${ACCENT}20`:`${RED}20`,color:accentCol,borderRadius:5,padding:"1px 6px",fontWeight:800,fontFamily:SANS}}>{isBuy?"COMPRA":"VENDA"}</span>
                    <span style={{fontSize:7,background:"rgba(245,166,35,.2)",color:GOLD,borderRadius:5,padding:"1px 7px",fontWeight:800,fontFamily:SANS}}>🎯 LIMITE</span>
                    <span style={{fontSize:7,background:"rgba(139,92,246,.2)",color:"#c4b5fd",borderRadius:5,padding:"1px 7px",fontWeight:800,fontFamily:SANS}}>⏳ PENDENTE</span>
                  </div>
                  <div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>{o.qty} cota{o.qty!==1?"s":""}</div>
                  <div style={{fontSize:8,color:"rgba(255,255,255,.45)",fontFamily:SANS,marginTop:1}}>Criada {fmtDatetime(o.createdAt)}</div>
                </div>
                <button onClick={()=>cancelLimited(o.id)} style={{background:"rgba(244,63,94,.15)",border:"1px solid rgba(244,63,94,.3)",borderRadius:8,color:"#f43f5e",fontSize:10,fontWeight:800,padding:"4px 9px",cursor:"pointer",fontFamily:SANS,flexShrink:0}}>✕</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                <div style={{background:"rgba(245,166,35,.08)",border:"1px solid rgba(245,166,35,.2)",borderRadius:9,padding:"7px 10px"}}>
                  <div style={{fontSize:7,color:MUTED,fontFamily:SANS,marginBottom:2}}>PREÇO LIMITE</div>
                  <div style={{fontSize:13,fontWeight:900,color:GOLD,fontFamily:MONO}}>FS${o.limitPrice.toFixed(2)}</div>
                  <div style={{fontSize:7,color:MUTED,fontFamily:SANS,marginTop:1}}>{isBuy?"Executa se ASK ≤ limite":"Executa se BID ≥ limite"}</div>
                </div>
                <div style={{background:"rgba(255,255,255,.04)",border:`1px solid ${BORDER}`,borderRadius:9,padding:"7px 10px"}}>
                  <div style={{fontSize:7,color:MUTED,fontFamily:SANS,marginBottom:2}}>PREÇO NO REGISTO</div>
                  <div style={{fontSize:13,fontWeight:900,color:"#fff",fontFamily:MONO}}>FS${(o.mktPrice||0).toFixed(2)}</div>
                  {mktDiff!==null&&<div style={{fontSize:7,color:mktDiff>0?ACCENT:RED,fontFamily:SANS,marginTop:1}}>{mktDiff>0?"+":""}{mktDiff}% vs limite</div>}
                </div>
              </div>
            </div>;
          })}
        </>}

        {/* Executadas */}
        {executedLimited.length>0&&<>
          <div style={{fontSize:8,color:ACCENT,fontWeight:800,letterSpacing:"1.2px",fontFamily:SANS,marginBottom:8,marginTop:16}}>EXECUTADAS · {executedLimited.length}</div>
          {executedLimited.map(o=>{
            const club=CLUBS.find(c=>c.ticker===o.ticker),isBuy=o.side==="buy";
            const accentCol=isBuy?ACCENT:RED;
            return <div key={o.id} style={{background:"rgba(108,99,255,.05)",border:"1px solid rgba(108,99,255,.2)",borderRadius:13,padding:"12px 13px",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:34,height:34,borderRadius:10,background:`linear-gradient(145deg,${club?.color||"#333"},${club?.color||"#333"}88)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:900,color:club?.c2||"#fff",flexShrink:0}}>{o.ticker.replace(/\d/g,"")}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,fontWeight:800,color:"#fff",fontFamily:SANS}}>{o.ticker}</span>
                    <span style={{fontSize:8,background:isBuy?`${ACCENT}20`:`${RED}20`,color:accentCol,borderRadius:5,padding:"1px 6px",fontWeight:800,fontFamily:SANS}}>{isBuy?"COMPRA":"VENDA"}</span>
                    <span style={{fontSize:7,background:"rgba(108,99,255,.2)",color:ACCENT,borderRadius:5,padding:"1px 7px",fontWeight:800,fontFamily:SANS}}>✓ EXECUTADA</span>
                  </div>
                  <div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>{o.qty} cota{o.qty!==1?"s":""} · Limite FS${o.limitPrice.toFixed(2)} · Exec. FS${(o.execPrice||o.limitPrice).toFixed(2)}</div>
                  <div style={{fontSize:8,color:"rgba(255,255,255,.45)",fontFamily:SANS,marginTop:1}}>Executada {fmtDatetime(o.executedAt||o.createdAt)}</div>
                </div>
              </div>
            </div>;
          })}
        </>}

        {/* Canceladas */}
        {cancelledLimited.length>0&&<>
          <div style={{fontSize:8,color:RED,fontWeight:800,letterSpacing:"1.2px",fontFamily:SANS,marginBottom:8,marginTop:16}}>CANCELADAS · {cancelledLimited.length}</div>
          {cancelledLimited.map(o=>{
            const club=CLUBS.find(c=>c.ticker===o.ticker),isBuy=o.side==="buy";
            return <div key={o.id} style={{background:"rgba(244,63,94,.04)",border:"1px solid rgba(244,63,94,.15)",borderRadius:13,padding:"12px 13px",marginBottom:8,opacity:.7}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:34,height:34,borderRadius:10,background:"rgba(255,255,255,.06)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:900,color:"rgba(255,255,255,.5)",flexShrink:0}}>{o.ticker.replace(/\d/g,"")}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                    <span style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,.45)",fontFamily:SANS}}>{o.ticker}</span>
                    <span style={{fontSize:8,background:"rgba(244,63,94,.12)",color:RED,borderRadius:5,padding:"1px 6px",fontWeight:800,fontFamily:SANS}}>{isBuy?"COMPRA":"VENDA"}</span>
                    <span style={{fontSize:7,background:"rgba(244,63,94,.18)",color:"#f87171",borderRadius:5,padding:"1px 7px",fontWeight:800,fontFamily:SANS}}>✕ CANCELADA</span>
                  </div>
                  <div style={{fontSize:9,color:"rgba(255,255,255,.48)",fontFamily:SANS}}>{o.qty} cota{o.qty!==1?"s":""} · Limite FS${o.limitPrice.toFixed(2)}</div>
                  {o.reason&&<div style={{fontSize:8,color:"rgba(244,63,94,.5)",fontFamily:SANS,marginTop:1}}>{o.reason}</div>}
                  <div style={{fontSize:8,color:"rgba(255,255,255,.36)",fontFamily:SANS,marginTop:1}}>Cancelada {fmtDatetime(o.cancelledAt||o.createdAt)}</div>
                </div>
              </div>
            </div>;
          })}
        </>}
      </>}

      {/* ── ABA SL / TP (OCO) ── */}
      {activeTab==="oco"&&<>
        {ocoOrders.length===0&&<div style={{...card,padding:"32px",textAlign:"center"}}><div style={{fontSize:28,marginBottom:10}}>🛡</div><div style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:SANS}}>Nenhuma ordem OCO</div><div style={{fontSize:10,color:MUTED,fontFamily:SANS,marginTop:5}}>Crie ordens Stop Loss / Take Profit no modal de Venda (exclusivo plano Lenda).</div></div>}

        {/* Pendentes */}
        {pendingOco.length>0&&<>
          <div style={{fontSize:8,color:GOLD,fontWeight:800,letterSpacing:"1.2px",fontFamily:SANS,marginBottom:8}}>ORDENS ATIVAS · {pendingOco.length}</div>
          {pendingOco.map(o=>{
            const club=CLUBS.find(c=>c.ticker===o.ticker);
            return <div key={o.id} style={{background:"rgba(245,166,35,.06)",border:"1px solid rgba(245,166,35,.3)",borderRadius:13,padding:"12px 13px",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <div style={{width:34,height:34,borderRadius:10,background:`linear-gradient(145deg,${club?.color||"#333"},${club?.color||"#333"}88)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:900,color:club?.c2||"#fff",flexShrink:0}}>{o.ticker.replace(/\d/g,"")}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,fontWeight:800,color:"#fff",fontFamily:SANS}}>{o.ticker}</span>
                    <span style={{fontSize:7,background:"rgba(245,166,35,.2)",color:GOLD,borderRadius:5,padding:"1px 7px",fontWeight:800,fontFamily:SANS}}>🛡 OCO</span>
                    <span style={{fontSize:7,background:"rgba(139,92,246,.2)",color:"#c4b5fd",borderRadius:5,padding:"1px 7px",fontWeight:800,fontFamily:SANS}}>⏳ ATIVO</span>
                    <span style={{fontSize:7,background:"rgba(245,166,35,.15)",color:GOLD,borderRadius:5,padding:"1px 6px",fontWeight:800,fontFamily:SANS}}>👑 LENDA</span>
                  </div>
                  <div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>{o.qty} cota{o.qty!==1?"s":""} · Registro FS${(o.mktPrice||0).toFixed(2)}</div>
                  <div style={{fontSize:8,color:"rgba(255,255,255,.45)",fontFamily:SANS,marginTop:1}}>Criada {fmtDatetime(o.createdAt)}</div>
                </div>
                <button onClick={()=>cancelOco(o.id)} style={{background:"rgba(244,63,94,.15)",border:"1px solid rgba(244,63,94,.3)",borderRadius:8,color:"#f43f5e",fontSize:10,fontWeight:800,padding:"4px 9px",cursor:"pointer",fontFamily:SANS,flexShrink:0}}>✕</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                {o.slPrice&&<div style={{background:"rgba(244,63,94,.08)",border:"1px solid rgba(244,63,94,.25)",borderRadius:9,padding:"8px 10px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:3}}><span style={{fontSize:10}}>🛑</span><span style={{fontSize:7,color:RED,fontWeight:800,fontFamily:SANS}}>STOP LOSS</span></div>
                  <div style={{fontSize:14,fontWeight:900,color:RED,fontFamily:MONO}}>FS${o.slPrice.toFixed(2)}</div>
                  {o.slPct&&<div style={{fontSize:7,color:"rgba(244,63,94,.6)",fontFamily:SANS,marginTop:1}}>−{o.slPct}% do registro</div>}
                  <div style={{fontSize:7,color:MUTED,fontFamily:SANS,marginTop:2}}>Dispara se BID ≤ limite</div>
                </div>}
                {o.tpPrice&&<div style={{background:"rgba(108,99,255,.07)",border:"1px solid rgba(108,99,255,.22)",borderRadius:9,padding:"8px 10px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:3}}><span style={{fontSize:10}}>🎯</span><span style={{fontSize:7,color:ACCENT,fontWeight:800,fontFamily:SANS}}>TAKE PROFIT</span></div>
                  <div style={{fontSize:14,fontWeight:900,color:ACCENT,fontFamily:MONO}}>FS${o.tpPrice.toFixed(2)}</div>
                  {o.tpPct&&<div style={{fontSize:7,color:"rgba(108,99,255,.6)",fontFamily:SANS,marginTop:1}}>+{o.tpPct}% do registro</div>}
                  <div style={{fontSize:7,color:MUTED,fontFamily:SANS,marginTop:2}}>Dispara se BID ≥ limite</div>
                </div>}
              </div>
            </div>;
          })}
        </>}

        {/* Executadas */}
        {executedOco.length>0&&<>
          <div style={{fontSize:8,color:ACCENT,fontWeight:800,letterSpacing:"1.2px",fontFamily:SANS,marginBottom:8,marginTop:16}}>EXECUTADAS · {executedOco.length}</div>
          {executedOco.map(o=>{
            const club=CLUBS.find(c=>c.ticker===o.ticker);
            const isSL=o.triggerType==="sl";
            return <div key={o.id} style={{background:isSL?"rgba(244,63,94,.05)":"rgba(108,99,255,.05)",border:`1px solid ${isSL?"rgba(244,63,94,.2)":"rgba(108,99,255,.2)"}`,borderRadius:13,padding:"12px 13px",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:34,height:34,borderRadius:10,background:`linear-gradient(145deg,${club?.color||"#333"},${club?.color||"#333"}88)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:900,color:club?.c2||"#fff",flexShrink:0}}>{o.ticker.replace(/\d/g,"")}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,fontWeight:800,color:"#fff",fontFamily:SANS}}>{o.ticker}</span>
                    <span style={{fontSize:8,background:isSL?`${RED}20`:`${ACCENT}20`,color:isSL?RED:ACCENT,borderRadius:5,padding:"1px 6px",fontWeight:800,fontFamily:SANS}}>{isSL?"🛑 STOP LOSS":"🎯 TAKE PROFIT"}</span>
                    <span style={{fontSize:7,background:isSL?"rgba(244,63,94,.2)":"rgba(108,99,255,.2)",color:isSL?RED:ACCENT,borderRadius:5,padding:"1px 7px",fontWeight:800,fontFamily:SANS}}>✓ EXECUTADA</span>
                  </div>
                  <div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>{o.qty} cota{o.qty!==1?"s":""} · Exec. FS${(o.execPrice||0).toFixed(2)} · Gatilho: {isSL?`SL FS$${o.slPrice?.toFixed(2)}`:`TP FS$${o.tpPrice?.toFixed(2)}`}</div>
                  <div style={{fontSize:8,color:"rgba(255,255,255,.45)",fontFamily:SANS,marginTop:1}}>Executada {fmtDatetime(o.executedAt||o.createdAt)}</div>
                </div>
              </div>
            </div>;
          })}
        </>}

        {/* Canceladas */}
        {cancelledOco.length>0&&<>
          <div style={{fontSize:8,color:RED,fontWeight:800,letterSpacing:"1.2px",fontFamily:SANS,marginBottom:8,marginTop:16}}>CANCELADAS · {cancelledOco.length}</div>
          {cancelledOco.map(o=>{
            const club=CLUBS.find(c=>c.ticker===o.ticker);
            return <div key={o.id} style={{background:"rgba(244,63,94,.04)",border:"1px solid rgba(244,63,94,.15)",borderRadius:13,padding:"12px 13px",marginBottom:8,opacity:.7}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:34,height:34,borderRadius:10,background:"rgba(255,255,255,.06)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:900,color:"rgba(255,255,255,.5)",flexShrink:0}}>{o.ticker.replace(/\d/g,"")}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                    <span style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,.45)",fontFamily:SANS}}>{o.ticker}</span>
                    <span style={{fontSize:7,background:"rgba(244,63,94,.18)",color:"#f87171",borderRadius:5,padding:"1px 7px",fontWeight:800,fontFamily:SANS}}>✕ CANCELADA</span>
                  </div>
                  <div style={{fontSize:9,color:"rgba(255,255,255,.48)",fontFamily:SANS}}>{o.qty} cota{o.qty!==1?"s":""}{o.slPrice?` · SL FS$${o.slPrice.toFixed(2)}`:""}{o.tpPrice?` · TP FS$${o.tpPrice.toFixed(2)}`:""}</div>
                  {o.reason&&<div style={{fontSize:8,color:"rgba(244,63,94,.5)",fontFamily:SANS,marginTop:1}}>{o.reason}</div>}
                  <div style={{fontSize:8,color:"rgba(255,255,255,.36)",fontFamily:SANS,marginTop:1}}>Cancelada {fmtDatetime(o.cancelledAt||o.createdAt)}</div>
                </div>
              </div>
            </div>;
          })}
        </>}
      </>}
    </div>
  </div>;
}

/* ══════════════════════════════════════════════════════════════
   MAIN APP
══════════════════════════════════════════════════════════════ */
/* ── CRIAR LIGA ── */
function CriarLigaScreen({onBack,onExit,user}){
  const [step,setStep]=useState(1);
  const [form,setForm]=useState({
    tipo:"amigos",
    nome:"",
    descricao:"",
    maxMembros:10,
    privada:true,
    duracao:"semana",
    permiteAlavancagem:false,
    premios:[
      {lugar:1, valor:"", icon:"🥇", color:GOLD,    label:"1º lugar"},
      {lugar:2, valor:"", icon:"🥈", color:"#a8b8cc", label:"2º lugar"},
      {lugar:3, valor:"", icon:"🥉", color:"#cd7f32", label:"3º lugar"},
    ],
    emblema:"🏆",
    emblemaCustom:null,  // base64 do upload
  });
  const [inviteCounter]=useState(()=>Math.floor(Math.random()*40)+1); // simula contador crescente
  const set=k=>v=>setForm(f=>({...f,[k]:v}));

  // Gera link único: footstock.app/liga/<slug-do-nome>/<user-slug>-<contador>
  const userSlug=(user.name||"user").toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"").slice(0,12);
  const ligaSlug=form.nome.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"").slice(0,20)||"minha-liga";
  const inviteLink=`footstock.app/liga/${ligaSlug}/${userSlug}-${String(inviteCounter).padStart(3,"0")}`;

  const TIPOS=[
    {id:"amigos",  icon:"👥", label:"Liga de Amigos",  desc:"Privada, até 20 jogadores, link de convite",  color:ACCENT2},
    {id:"publica", icon:"🌐", label:"Liga Pública",    desc:"Aberta a todos, entre e compita globalmente",  color:ACCENT},
    {id:"pro",     icon:"⚡", label:"Liga PRO",        desc:"Com prêmios físicos, exclusivo plano Lenda",   color:GOLD, locked:user.plan!=="Lenda"},
  ];
  const EMBLEMAS=["🏆","⚽","🥇","🔥","💎","🦁","🦅","🐉","🌟","⚡","🎯","🏅"];
  const DURACOES=[{id:"semana",l:"1 Semana"},{id:"mes",l:"1 Mês"},{id:"temporada",l:"Temporada inteira"}];

  const inputStyle={width:"100%",background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,
    padding:"10px 12px",color:"#e2e8f0",fontSize:11,fontFamily:SANS,outline:"none",
    boxSizing:"border-box"};
  const labelStyle={fontSize:8,fontWeight:800,color:MUTED,letterSpacing:"1px",fontFamily:SANS,marginBottom:5,display:"block"};

  // Passo 5 — Sucesso
  if(step===5) return (
    <div style={{flex:1,display:"flex",flexDirection:"column",background:BG,overflow:"hidden"}}>
      <div style={{padding:"10px 14px 0",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div style={{width:28}}/>
        <div style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:SANS}}>Liga criada!</div>
        <ExitBtn onExit={onExit}/>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 24px",textAlign:"center"}}>
        <div style={{fontSize:60,marginBottom:16,animation:"pls 1.5s ease-in-out infinite"}}>
          {form.emblemaCustom
            ? <img src={form.emblemaCustom} style={{width:72,height:72,borderRadius:16,objectFit:"cover"}}/>
            : form.emblema}
        </div>
        <div style={{fontSize:20,fontWeight:800,color:"#fff",fontFamily:SANS,marginBottom:6}}>{form.nome}</div>
        <div style={{fontSize:10,color:MUTED,fontFamily:SANS,marginBottom:28}}>{TIPOS.find(t=>t.id===form.tipo)?.label}</div>

        {form.tipo!=="publica"&&<>
          <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginBottom:8}}>LINK DE CONVITE</div>
          <div style={{background:SURFACE,border:`1px solid ${ACCENT}40`,borderRadius:14,padding:"14px 16px",marginBottom:24,width:"100%",boxSizing:"border-box"}}>
            <div style={{fontSize:10,fontWeight:900,color:ACCENT,fontFamily:MONO,letterSpacing:"0.5px",wordBreak:"break-all",lineHeight:1.5}}>
              🔗 {inviteLink}
            </div>
            <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginTop:8,display:"flex",alignItems:"center",gap:5}}>
              <span style={{background:`${ACCENT}20`,border:`1px solid ${ACCENT}40`,borderRadius:6,padding:"2px 7px",fontSize:8,fontWeight:800,color:ACCENT,fontFamily:MONO}}>
                #{String(inviteCounter).padStart(3,"0")}
              </span>
              <span>Convite #{inviteCounter} · gerado por {userSlug}</span>
            </div>
          </div>
        </>}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,width:"100%",marginBottom:28}}>
          {[
            {l:"DURAÇÃO",v:DURACOES.find(d=>d.id===form.duracao)?.l},
            {l:"MEMBROS",v:`Até ${form.maxMembros}`},
          ].map(s=><div key={s.l} style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:12,padding:"10px 8px",textAlign:"center"}}>
            <div style={{fontSize:7,color:MUTED,fontFamily:SANS,marginBottom:4}}>{s.l}</div>
            <div style={{fontSize:10,fontWeight:800,color:"#fff",fontFamily:SANS}}>{s.v}</div>
          </div>)}
        </div>

        {/* Premiações no sucesso */}
        {form.premios.some(p=>p.valor)&&(
          <div style={{width:"100%",marginBottom:24}}>
            <div style={{fontSize:8,fontWeight:800,color:MUTED,letterSpacing:"1.5px",fontFamily:SANS,marginBottom:10}}>🏆 PREMIAÇÕES</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {form.premios.filter(p=>p.valor).map((p,i)=>(
                <div key={i} style={{
                  background:`${p.color}0c`,
                  border:`1px solid ${p.color}30`,
                  borderRadius:12,padding:"10px 14px",
                  display:"flex",alignItems:"center",gap:10,
                  animation:`fadeIn .3s ease ${i*.08}s both`,
                }}>
                  <span style={{fontSize:20}}>{p.icon}</span>
                  <div style={{flex:1,textAlign:"left"}}>
                    <div style={{fontSize:8,fontWeight:800,color:p.color,fontFamily:SANS,letterSpacing:"0.5px",marginBottom:2}}>{p.label.toUpperCase()}</div>
                    <div style={{fontSize:11,fontWeight:700,color:"#e2e8f0",fontFamily:SANS}}>{p.valor}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={onBack} style={{width:"100%",background:"linear-gradient(135deg,#6c63ff,#38bdf8)",border:"none",borderRadius:14,padding:"14px",fontSize:13,fontWeight:900,color:"#000",fontFamily:SANS,cursor:"pointer",marginBottom:10}}>
          Ir para minha liga →
        </button>
        <button onClick={onBack} style={{background:"none",border:"none",color:MUTED,fontSize:11,fontFamily:SANS,cursor:"pointer"}}>
          Voltar ao início
        </button>
      </div>
    </div>
  );

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",background:BG,overflow:"hidden"}}>
      {/* Header */}
      <div style={{padding:"10px 14px 0",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <button onClick={step===1?onBack:()=>setStep(s=>s-1)}
            style={{background:"none",border:"none",color:MUTED,fontSize:11,cursor:"pointer",fontFamily:SANS,fontWeight:700,padding:0}}>
            ← {step===1?"Ligas":"Voltar"}
          </button>
          <div style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:SANS}}>Criar Liga</div>
          <ExitBtn onExit={onExit}/>
        </div>

        {/* Progress bar */}
        <div style={{display:"flex",gap:4,marginBottom:16}}>
          {[1,2,3,4].map(s=><div key={s} style={{flex:1,height:3,borderRadius:2,
            background:s<=step?`linear-gradient(90deg,${ACCENT},${ACCENT2})`:"rgba(255,255,255,.1)",
            transition:"background .3s"}}/>)}
        </div>
        <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginBottom:2}}>
          PASSO {step} DE 4 · {["Tipo de Liga","Configurações","Regras","Confirmar"][step-1].toUpperCase()}
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"8px 14px 20px"}}>

        {/* ── STEP 1: Tipo ── */}
        {step===1&&<>
          <div style={{fontSize:16,fontWeight:700,color:"#fff",fontFamily:SANS,marginBottom:4}}>Que tipo de liga?</div>
          <div style={{fontSize:10,color:MUTED,fontFamily:SANS,marginBottom:20}}>Escolha o formato que melhor combina com você</div>
          {TIPOS.map(t=>{
            const sel=form.tipo===t.id;
            return <button key={t.id} onClick={()=>{if(!t.locked)set("tipo")(t.id);}}
              style={{width:"100%",background:sel?`${t.color}14`:CARD,
                border:`2px solid ${sel?t.color:BORDER}`,
                borderRadius:16,padding:"16px",marginBottom:10,
                textAlign:"left",cursor:t.locked?"not-allowed":"pointer",
                opacity:t.locked?.6:1,position:"relative",transition:"all .2s"}}>
              {sel&&<div style={{position:"absolute",top:12,right:12,width:18,height:18,borderRadius:"50%",
                background:t.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10}}>✓</div>}
              {t.locked&&<div style={{position:"absolute",top:12,right:12,fontSize:14}}>🔒</div>}
              <div style={{fontSize:26,marginBottom:8}}>{t.icon}</div>
              <div style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:SANS,marginBottom:4}}>{t.label}</div>
              <div style={{fontSize:10,color:MUTED,fontFamily:SANS,lineHeight:1.4}}>{t.desc}</div>
              {t.locked&&<div style={{fontSize:9,color:GOLD,marginTop:8,fontWeight:700,fontFamily:SANS}}>⚡ Requer plano Lenda</div>}
            </button>;
          })}

          {/* Emblema */}
          <div style={{marginTop:16,marginBottom:20}}>
            <div style={{fontSize:8,fontWeight:800,color:MUTED,letterSpacing:"1px",fontFamily:SANS,marginBottom:10}}>ESCOLHA O EMBLEMA</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {EMBLEMAS.map(e=><button key={e} onClick={()=>{set("emblema")(e);set("emblemaCustom")(null);}}
                style={{width:42,height:42,borderRadius:10,fontSize:22,
                  background:form.emblema===e&&!form.emblemaCustom?"rgba(108,99,255,.15)":SURFACE,
                  border:`2px solid ${form.emblema===e&&!form.emblemaCustom?ACCENT:BORDER}`,
                  cursor:"pointer",transition:"all .15s"}}>
                {e}
              </button>)}
              {/* Botão upload */}
              <label style={{width:42,height:42,borderRadius:10,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",
                background:form.emblemaCustom?"rgba(108,99,255,.15)":SURFACE,
                border:`2px solid ${form.emblemaCustom?ACCENT:"rgba(255,255,255,.25)"}`,
                cursor:"pointer",transition:"all .15s",overflow:"hidden",flexShrink:0,position:"relative"}}>
                {form.emblemaCustom
                  ? <img src={form.emblemaCustom} style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:8}}/>
                  : <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M10 3v10M10 3l-3 3M10 3l3 3" stroke="rgba(255,255,255,.5)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M3 14v1a2 2 0 002 2h10a2 2 0 002-2v-1" stroke="rgba(255,255,255,.5)" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>}
                <input type="file" accept="image/*" style={{position:"absolute",opacity:0,width:"100%",height:"100%",cursor:"pointer"}}
                  onChange={e=>{
                    const file=e.target.files?.[0];
                    if(!file)return;
                    const reader=new FileReader();
                    reader.onload=ev=>{set("emblemaCustom")(ev.target.result);set("emblema")(null);};
                    reader.readAsDataURL(file);
                  }}/>
              </label>
            </div>
            {form.emblemaCustom&&<div style={{fontSize:8,color:ACCENT,fontFamily:SANS,marginTop:6}}>✓ Emblema personalizado carregado</div>}
          </div>

          <button onClick={()=>setStep(2)}
            style={{width:"100%",background:"linear-gradient(135deg,#6c63ff,#38bdf8)",border:"none",borderRadius:14,padding:"14px",fontSize:13,fontWeight:900,color:"#000",fontFamily:SANS,cursor:"pointer"}}>
            Continuar →
          </button>
        </>}

        {/* ── STEP 2: Configurações ── */}
        {step===2&&<>
          <div style={{fontSize:16,fontWeight:700,color:"#fff",fontFamily:SANS,marginBottom:4}}>Configure sua liga</div>
          <div style={{fontSize:10,color:MUTED,fontFamily:SANS,marginBottom:20}}>Dê um nome e defina os parâmetros básicos</div>

          <div style={{marginBottom:14}}>
            <label style={labelStyle}>NOME DA LIGA *</label>
            <input value={form.nome} onChange={e=>set("nome")(e.target.value)}
              placeholder="Ex: Liga dos Craque da Quebrada"
              style={inputStyle} maxLength={40}/>
            <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginTop:4,textAlign:"right"}}>{form.nome.length}/40</div>
          </div>

          <div style={{marginBottom:14}}>
            <label style={labelStyle}>DESCRIÇÃO (opcional)</label>
            <textarea value={form.descricao} onChange={e=>set("descricao")(e.target.value)}
              placeholder="Fale um pouco sobre sua liga..."
              style={{...inputStyle,height:70,resize:"none"}} maxLength={120}/>
          </div>

          <div style={{marginBottom:14}}>
            <label style={labelStyle}>DURAÇÃO DA TEMPORADA</label>
            <div style={{display:"flex",gap:6}}>
              {DURACOES.map(d=><button key={d.id} onClick={()=>set("duracao")(d.id)}
                style={{flex:1,background:form.duracao===d.id?`${ACCENT}22`:SURFACE,
                  border:`1px solid ${form.duracao===d.id?ACCENT:BORDER}`,
                  borderRadius:10,padding:"8px 4px",fontSize:9,fontWeight:700,
                  color:form.duracao===d.id?ACCENT:MUTED,fontFamily:SANS,cursor:"pointer"}}>
                {d.l}
              </button>)}
            </div>
          </div>

          <div style={{marginBottom:14}}>
            <label style={labelStyle}>MÁXIMO DE PARTICIPANTES: {form.maxMembros}</label>
            <input type="range" min={2} max={20} value={form.maxMembros}
              onChange={e=>set("maxMembros")(+e.target.value)}
              style={{width:"100%",accentColor:ACCENT}}/>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:MUTED,fontFamily:SANS,marginTop:2}}>
              <span>2</span><span>20</span>
            </div>
          </div>

          {form.tipo==="amigos"&&<div style={{marginBottom:20,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:12,padding:"12px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#e2e8f0",fontFamily:SANS}}>Liga privada</div>
                <div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>Apenas quem tem o código pode entrar</div>
              </div>
              <div onClick={()=>set("privada")(!form.privada)}
                style={{width:40,height:22,borderRadius:11,background:form.privada?ACCENT:"rgba(255,255,255,.15)",
                  cursor:"pointer",transition:"background .2s",position:"relative"}}>
                <div style={{position:"absolute",top:3,left:form.privada?20:3,width:16,height:16,
                  borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
              </div>
            </div>
          </div>}

          <button onClick={()=>form.nome.trim()?setStep(3):null}
            style={{width:"100%",background:form.nome.trim()?`linear-gradient(135deg,${ACCENT},${ACCENT2})`:"rgba(255,255,255,.1)",
              border:"none",borderRadius:14,padding:"14px",fontSize:13,fontWeight:900,
              color:form.nome.trim()?"#000":MUTED,fontFamily:SANS,cursor:form.nome.trim()?"pointer":"not-allowed"}}>
            Continuar →
          </button>
        </>}

        {/* ── STEP 3: Regras ── */}
        {step===3&&<>
          <div style={{fontSize:16,fontWeight:700,color:"#fff",fontFamily:SANS,marginBottom:4}}>Regras da liga</div>
          <div style={{fontSize:10,color:MUTED,fontFamily:SANS,marginBottom:16}}>Personalize restrições e premiações</div>

          {/* Toggle: Alavancagem */}
          {[
            {k:"permiteAlavancagem",label:"Alavancagem permitida",desc:"Jogadores podem operar com 2× o saldo",icon:"⚡",color:GOLD},
          ].map(r=><div key={r.k} style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:12,padding:"13px",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{fontSize:20}}>{r.icon}</div>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"#e2e8f0",fontFamily:SANS}}>{r.label}</div>
                  <div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>{r.desc}</div>
                </div>
              </div>
              <div onClick={()=>set(r.k)(!form[r.k])}
                style={{width:40,height:22,borderRadius:11,background:form[r.k]?r.color:"rgba(255,255,255,.32)",
                  cursor:"pointer",transition:"background .2s",position:"relative",flexShrink:0}}>
                <div style={{position:"absolute",top:3,left:form[r.k]?20:3,width:16,height:16,
                  borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
              </div>
            </div>
          </div>)}

          {/* ── PREMIAÇÕES ── */}
          <div style={{marginBottom:6}}>
            {/* Cabeçalho da seção */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div>
                <div style={{fontSize:10,fontWeight:800,color:"#fff",fontFamily:SANS}}>🏆 Premiações</div>
                <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginTop:1}}>Defina os prêmios por colocação</div>
              </div>
              {/* Badge "qualquer liga pode ter prêmios" */}
              <div style={{background:"rgba(108,99,255,.08)",border:"1px solid rgba(108,99,255,.2)",borderRadius:20,padding:"3px 9px",fontSize:8,fontWeight:800,color:ACCENT,fontFamily:SANS}}>
                Opcional
              </div>
            </div>

            {/* Lista de colocações */}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {form.premios.map((p,i)=>{
                const isFixed=i<3; // 1º, 2º, 3º são fixos (não removíveis)
                const ordinals=["1º","2º","3º","4º","5º","6º","7º","8º","9º","10º"];
                return(
                  <div key={p.lugar} style={{
                    background:CARD,
                    border:`1px solid ${p.valor?p.color+"40":BORDER}`,
                    borderRadius:14,
                    padding:"11px 12px",
                    transition:"border-color .2s",
                    animation:"fadeIn .2s ease",
                  }}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      {/* Medalha / posição */}
                      <div style={{
                        width:38,height:38,borderRadius:11,flexShrink:0,
                        background:p.valor?`${p.color}18`:"rgba(255,255,255,.04)",
                        border:`1.5px solid ${p.valor?p.color+"60":BORDER}`,
                        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                        transition:"all .2s",
                      }}>
                        <div style={{fontSize:16,lineHeight:1}}>{p.icon}</div>
                        <div style={{fontSize:6,fontWeight:800,color:p.valor?p.color:MUTED,fontFamily:SANS,marginTop:1}}>{ordinals[i]||`${i+1}º`}</div>
                      </div>

                      {/* Input do prêmio */}
                      <div style={{flex:1}}>
                        <div style={{fontSize:7,fontWeight:800,color:p.valor?p.color:MUTED,letterSpacing:"0.8px",fontFamily:SANS,marginBottom:4}}>
                          PRÊMIO — {(ordinals[i]||`${i+1}º`).toUpperCase()} LUGAR
                        </div>
                        <input
                          value={p.valor}
                          onChange={e=>{
                            const val=e.target.value;
                            setForm(f=>({...f,premios:f.premios.map((x,xi)=>xi===i?{...x,valor:val}:x)}));
                          }}
                          placeholder={i===0?"Ex: PS5 + R$500":i===1?"Ex: R$200 + Camisa":i===2?"Ex: Camisa oficial":"Ex: Voucher R$50"}
                          maxLength={60}
                          style={{
                            width:"100%",background:SURFACE,
                            border:`1px solid ${p.valor?p.color+"50":BORDER}`,
                            borderRadius:9,padding:"8px 11px",
                            color:"#e2e8f0",fontSize:11,fontFamily:SANS,
                            outline:"none",boxSizing:"border-box",
                            transition:"border-color .2s",
                            caretColor:p.color,
                          }}
                        />
                      </div>

                      {/* Botão remover (só colocações extras, i >= 3) */}
                      {!isFixed&&(
                        <button
                          onClick={()=>setForm(f=>({...f,premios:f.premios.filter((_,xi)=>xi!==i)}))}
                          style={{
                            width:28,height:28,borderRadius:8,flexShrink:0,
                            background:"rgba(244,63,94,.1)",border:"1px solid rgba(244,63,94,.2)",
                            color:RED,fontSize:14,cursor:"pointer",display:"flex",
                            alignItems:"center",justifyContent:"center",fontWeight:900,
                            transition:"all .15s",
                          }}
                          onMouseEnter={e=>{e.currentTarget.style.background="rgba(244,63,94,.2)";}}
                          onMouseLeave={e=>{e.currentTarget.style.background="rgba(244,63,94,.1)";}}
                        >×</button>
                      )}
                    </div>

                    {/* Preview do prêmio preenchido */}
                    {p.valor&&(
                      <div style={{
                        marginTop:8,
                        background:`${p.color}0a`,
                        border:`1px solid ${p.color}25`,
                        borderRadius:8,padding:"5px 10px",
                        display:"flex",alignItems:"center",gap:6,
                      }}>
                        <span style={{fontSize:11}}>{p.icon}</span>
                        <span style={{fontSize:9,fontWeight:700,color:p.color,fontFamily:SANS,flex:1}}>{p.valor}</span>
                        <span style={{fontSize:8,color:MUTED,fontFamily:SANS}}>confirmado</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Botão adicionar colocação */}
            {form.premios.length<10&&(
              <button
                onClick={()=>{
                  const EXTRA_ICONS=["🎖️","🎗️","⭐","🌟","💫","🏅","🎯","🎁"];
                  const EXTRA_COLORS=["#a78bfa","#fb923c","#34d399","#60a5fa","#f472b6","#facc15","#4ade80","#38bdf8"];
                  const idx=form.premios.length;
                  setForm(f=>({...f,premios:[...f.premios,{
                    lugar:idx+1,
                    valor:"",
                    icon:EXTRA_ICONS[(idx-3)%EXTRA_ICONS.length]||"🎖️",
                    color:EXTRA_COLORS[(idx-3)%EXTRA_COLORS.length]||ACCENT2,
                    label:`${idx+1}º lugar`,
                  }]}));
                }}
                style={{
                  width:"100%",marginTop:8,
                  background:"rgba(255,255,255,.03)",
                  border:`1.5px dashed ${BORDER}`,
                  borderRadius:14,padding:"12px",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                  cursor:"pointer",transition:"all .2s",color:MUTED,fontFamily:SANS,
                  fontSize:11,fontWeight:700,
                }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=ACCENT;e.currentTarget.style.color=ACCENT;e.currentTarget.style.background="rgba(108,99,255,.04)";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=BORDER;e.currentTarget.style.color=MUTED;e.currentTarget.style.background="rgba(255,255,255,.03)";}}
              >
                <div style={{width:22,height:22,borderRadius:7,background:"rgba(108,99,255,.1)",border:"1px solid rgba(108,99,255,.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:900,color:ACCENT}}>+</div>
                Adicionar {form.premios.length+1}º lugar
              </button>
            )}

            {/* Info: sem prêmio também funciona */}
            {form.premios.every(p=>!p.valor)&&(
              <div style={{marginTop:10,background:"rgba(74,85,104,.08)",border:`1px solid ${BORDER}`,borderRadius:10,padding:"8px 11px",display:"flex",alignItems:"center",gap:7}}>
                <span style={{fontSize:12}}>ℹ️</span>
                <span style={{fontSize:9,color:MUTED,fontFamily:SANS,lineHeight:1.5}}>
                  Ligas sem prêmio também são válidas. A competição vale pelo prestígio e ranking! 🏆
                </span>
              </div>
            )}
          </div>

          {/* Resumo das regras */}
          <div style={{background:"rgba(108,99,255,.06)",border:"1px solid rgba(108,99,255,.2)",borderRadius:12,padding:"12px",marginBottom:20,marginTop:12}}>
            <div style={{fontSize:9,fontWeight:800,color:ACCENT,fontFamily:SANS,marginBottom:8,letterSpacing:"1px"}}>📋 RESUMO DAS REGRAS</div>
            {[
              `${form.maxMembros} participantes máximo`,
              `Saldo: carteira real de cada jogador`,
              `Duração: ${DURACOES.find(d=>d.id===form.duracao)?.l}`,
              `Alavancagem: ${form.permiteAlavancagem?"Permitida":"Não permitida"}`,
              `Premiações: ${form.premios.filter(p=>p.valor).length} colocação${form.premios.filter(p=>p.valor).length!==1?"ões":""}${form.premios.filter(p=>p.valor).length===0?" (sem prêmios)":""}`,
              `Sem limite de cotas por clube`,
            ].map((r,i)=><div key={i} style={{fontSize:9,color:MUTED,fontFamily:SANS,marginBottom:3}}>
              · {r}
            </div>)}
          </div>

          <button onClick={()=>setStep(4)}
            style={{width:"100%",background:"linear-gradient(135deg,#6c63ff,#38bdf8)",border:"none",borderRadius:14,padding:"14px",fontSize:13,fontWeight:900,color:"#000",fontFamily:SANS,cursor:"pointer"}}>
            Continuar →
          </button>
        </>}

        {/* ── STEP 4: Confirmar ── */}
        {step===4&&<>
          <div style={{fontSize:16,fontWeight:700,color:"#fff",fontFamily:SANS,marginBottom:4}}>Confirme sua liga</div>
          <div style={{fontSize:10,color:MUTED,fontFamily:SANS,marginBottom:20}}>Revise tudo antes de criar</div>

          {/* Card preview da liga */}
          <div style={{background:`linear-gradient(135deg,#1a1000,#2a1800)`,border:"1px solid rgba(245,166,35,.3)",borderRadius:18,padding:"20px",marginBottom:16,textAlign:"center",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:-20,right:-20,width:80,height:80,background:"radial-gradient(circle,rgba(245,166,35,.15),transparent)",borderRadius:"50%"}}/>
            <div style={{fontSize:44,marginBottom:10}}>
              {form.emblemaCustom
                ? <img src={form.emblemaCustom} style={{width:56,height:56,borderRadius:12,objectFit:"cover"}}/>
                : form.emblema}
            </div>
            <div style={{fontSize:16,fontWeight:700,color:"#fff",fontFamily:SANS,marginBottom:4}}>{form.nome||"Sem nome"}</div>
            {form.descricao&&<div style={{fontSize:10,color:MUTED,fontFamily:SANS,marginBottom:10,lineHeight:1.4}}>{form.descricao}</div>}
            <div style={{display:"inline-flex",alignItems:"center",gap:5,background:`${TIPOS.find(t=>t.id===form.tipo)?.color}22`,
              border:`1px solid ${TIPOS.find(t=>t.id===form.tipo)?.color}40`,
              borderRadius:20,padding:"3px 10px"}}>
              <span style={{fontSize:12}}>{TIPOS.find(t=>t.id===form.tipo)?.icon}</span>
              <span style={{fontSize:9,fontWeight:800,color:TIPOS.find(t=>t.id===form.tipo)?.color,fontFamily:SANS}}>
                {TIPOS.find(t=>t.id===form.tipo)?.label}
              </span>
            </div>
          </div>

          {/* Detalhes */}
          {[
            {icon:"👥",label:"Participantes",val:`Até ${form.maxMembros} jogadores`},
            {icon:"⏱️",label:"Duração",val:DURACOES.find(d=>d.id===form.duracao)?.l},
            {icon:"💰",label:"Saldo",val:"Carteira real de cada jogador"},
            {icon:"⚡",label:"Alavancagem",val:form.permiteAlavancagem?"Permitida":"Desabilitada"},
            {icon:"🔒",label:"Privacidade",val:form.privada?"Privada (link de convite)":"Pública"},
          ].map(d=><div key={d.label} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",
            borderBottom:`1px solid ${BORDER}`}}>
            <span style={{fontSize:16}}>{d.icon}</span>
            <span style={{flex:1,fontSize:11,color:MUTED,fontFamily:SANS}}>{d.label}</span>
            <span style={{fontSize:11,fontWeight:700,color:"#e2e8f0",fontFamily:SANS}}>{d.val}</span>
          </div>)}

          {/* Premiações no step 4 */}
          {form.premios.some(p=>p.valor)&&(
            <div style={{marginTop:14,marginBottom:4}}>
              <div style={{fontSize:8,fontWeight:800,color:MUTED,letterSpacing:"1.5px",fontFamily:SANS,marginBottom:10}}>PREMIAÇÕES</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {form.premios.filter(p=>p.valor).map((p,i)=>(
                  <div key={i} style={{
                    background:`${p.color}0a`,
                    border:`1px solid ${p.color}30`,
                    borderRadius:12,padding:"10px 12px",
                    display:"flex",alignItems:"center",gap:10,
                  }}>
                    <div style={{
                      width:32,height:32,borderRadius:9,flexShrink:0,
                      background:`${p.color}18`,border:`1px solid ${p.color}40`,
                      display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,
                    }}>{p.icon}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:8,fontWeight:800,color:p.color,letterSpacing:"0.5px",fontFamily:SANS,marginBottom:2}}>{p.label.toUpperCase()}</div>
                      <div style={{fontSize:11,fontWeight:700,color:"#e2e8f0",fontFamily:SANS}}>{p.valor}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!form.premios.some(p=>p.valor)&&(
            <div style={{padding:"11px 0",borderTop:`1px solid ${BORDER}`,display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:16}}>🏆</span>
              <span style={{flex:1,fontSize:11,color:MUTED,fontFamily:SANS}}>Premiações</span>
              <span style={{fontSize:11,fontWeight:700,color:MUTED,fontFamily:SANS}}>Sem prêmios</span>
            </div>
          )}

          <button onClick={()=>setStep(5)}
            style={{width:"100%",marginTop:22,background:"linear-gradient(135deg,#6c63ff,#38bdf8)",
              border:"none",borderRadius:14,padding:"15px",fontSize:13,fontWeight:900,
              color:"#000",fontFamily:SANS,cursor:"pointer"}}>
            🏆 Criar liga agora
          </button>
          <button onClick={()=>setStep(3)}
            style={{width:"100%",marginTop:8,background:"none",border:`1px solid ${BORDER}`,
              borderRadius:14,padding:"12px",fontSize:11,fontWeight:700,
              color:MUTED,fontFamily:SANS,cursor:"pointer"}}>
            Revisar regras
          </button>
        </>}

      </div>
    </div>
  );
}

const TABS=["Dashboard","Mercado","Carteira","Assessor","Ligas","Notícias"];
function getTabsForUser(user){
  return TABS.filter(t=>t!=="Assessor"||(user?.role==="admin"));
}

/* ── TELA DE NOTÍCIAS ── */
/* ══════════════════════════════════════════════════════════════
   NEWS SCREEN — Notícias Reais via Anthropic Web Search
   • Busca automática a cada 5 minutos
   • Notícias reais injetadas no motor de preços (Impact Matrix)
   • 2 abas: Feed ao vivo | Análise IA por clube
══════════════════════════════════════════════════════════════ */
function NewsScreen({newsLog,prices,onBack,onExit,fireExternalNews,bgRealNews=[],bgNewsStatus="idle",bgLastFetch=null,bgNextIn=null,onManualRefresh,bgFallbackUsed=false,bgSource="rss"}){
  const [activeTab,setActiveTab]=useState("feed");

  /* Análise por clube — mantida localmente */
  const [selectedClub,setSelectedClub]=useState(null);
  const [analysis,setAnalysis]=useState(null);
  const [analysisLoading,setAnalysisLoading]=useState(false);
  const [analysisError,setAnalysisError]=useState(null);

  const [search,setSearch]=useState("");
  const [tickerFilter,setTickerFilter]=useState("Todos");

  const fmtAgo=ts=>{if(!ts)return"";const d=Math.floor((Date.now()-new Date(ts).getTime())/1000);if(d<60)return`${d}s atrás`;if(d<3600)return`${Math.floor(d/60)}min atrás`;if(d<86400)return`${Math.floor(d/3600)}h atrás`;return`${Math.floor(d/86400)}d atrás`;};
  const sentColor=s=>s>=0?ACCENT:RED;
  const catColor={"Financeira Crítica":"#f43f5e","Esportiva Majoritária":"#6c63ff","Esportiva Menor":"#38bdf8","Mercado de Ativos":"#f5a623","Integridade/Saúde":"#8b5cf6","Institucional":"#8899b0"};
  const recCol=r=>r==="COMPRAR"?ACCENT:r==="VENDER"?RED:GOLD;
  const sentLabel=s=>s==="BULLISH"?"📈 ALTA":s==="BEARISH"?"📉 BAIXA":"➡️ NEUTRO";
  const sentCol2=s=>s==="BULLISH"?ACCENT:s==="BEARISH"?RED:MUTED;
  const fmtCountdown=s=>{if(!s||s<=0)return"agora";const m=Math.floor(s/60),ss=s%60;return m>0?`${m}m ${ss}s`:`${ss}s`;};

  const fetchAnalysis=async(club)=>{
    setSelectedClub(club);setAnalysis(null);setAnalysisLoading(true);setAnalysisError(null);setActiveTab("analysis");
    const curP=prices[club.ticker]||club.price;
    try{
      const resp=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",max_tokens:1000,
          tools:[{type:"web_search_20250305",name:"web_search"}],
          system:`Analista sênior FootStock. Retorne APENAS JSON puro sem markdown:
{"resumo":"análise 2-3 frases","pontos_positivos":["até 3 fatores bullish"],"pontos_negativos":["até 3 fatores bearish"],"sentimento_geral":"BULLISH|NEUTRO|BEARISH","recomendacao":"COMPRAR|MANTER|VENDER","justificativa":"1 frase","nivel_risco":"BAIXO|MÉDIO|ALTO","noticias_recentes":[{"titulo":"manchete","sent":0.8,"emoji":"⚽","fonte":"portal"}]}`,
          messages:[{role:"user",content:`Analise ${club.realName} (${club.ticker}) FootStock. Preço: FS$${curP.toFixed(2)}, Cap: ${club.mktCap}, Receita: ${club.revenueLabel}.`}]
        })
      });
      if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data=await resp.json();
      let raw="";for(const b of(data.content||[])){if(b.type==="text")raw+=b.text;}
      raw=raw.trim().replace(/^```json\s*/,"").replace(/```\s*$/,"").trim();
      const fi=raw.indexOf("{"),li=raw.lastIndexOf("}");
      if(fi>=0&&li>fi) raw=raw.slice(fi,li+1);
      const tryP=(s)=>{try{return JSON.parse(s);}catch{return null;}};
      let parsed=tryP(raw);
      if(!parsed) parsed={resumo:"Análise indisponível. Tente novamente.",pontos_positivos:[],pontos_negativos:[],sentimento_geral:"NEUTRO",recomendacao:"MANTER",justificativa:"Dados insuficientes.",nivel_risco:"MÉDIO",noticias_recentes:[]};
      setAnalysis({...parsed,club,curP});
    }catch(err){setAnalysisError(err.message);}
    finally{setAnalysisLoading(false);}
  };

  /* Feed: merge notícias background + motor ao vivo, ordenadas cronologicamente */
  // Calcula início do dia corrente em horário de Brasília (UTC-3)
  const todayStartBRT=(()=>{
    const now=new Date();
    const utc=now.getTime()+now.getTimezoneOffset()*60000;
    const brt=new Date(utc-3*3600000);
    brt.setHours(0,0,0,0);
    // Converte de volta para UTC para comparação com Date.now()
    return brt.getTime()+(3*3600000)-now.getTimezoneOffset()*60000;
  })();
  // Janela: aceita notícias do dia corrente + últimas 12h (cobre abertura de mercado madrugada)
  const NEWS_MAX_AGE=Math.min(todayStartBRT, Date.now()-12*60*60*1000);

  const allFeed=[
    ...bgRealNews.map(n=>({...n, ts: n.ts instanceof Date ? n.ts.getTime() : (typeof n.ts==="number"?n.ts:new Date(n.ts).getTime())})),
    ...newsLog.map(n=>({...n, fromEngine:true, ts: n.ts instanceof Date ? n.ts.getTime() : (typeof n.ts==="number"?n.ts:new Date(n.ts).getTime())}))
  ];
  const seenH=new Set();
  const deduped=allFeed
    .filter(n=>n.fromEngine||!n.ts||n.ts>=NEWS_MAX_AGE) // notícias do motor sempre passam; externas: só do dia
    .sort((a,b)=>b.ts-a.ts) // mais recente primeiro
    .filter(n=>{if(seenH.has(n.headline))return false;seenH.add(n.headline);return true;});
  const feedFiltered=deduped
    .filter(n=>tickerFilter==="Todos"||n.ticker===tickerFilter)
    .filter(n=>!search||n.headline?.toLowerCase().includes(search.toLowerCase())||n.ticker?.toLowerCase().includes(search.toLowerCase()));

  const loading=bgNewsStatus==="loading";

  return <div style={{flex:1,display:"flex",flexDirection:"column",background:BG,overflow:"hidden"}}>
    {/* HEADER */}
    <div style={{padding:"8px 14px 0",flexShrink:0}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:MUTED,fontSize:11,cursor:"pointer",fontFamily:SANS,fontWeight:700,padding:0}}>← Voltar</button>
        <div style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:SANS,display:"flex",alignItems:"center",gap:6}}>
          📰 Newsfeed
          <span style={{fontSize:9,background:"rgba(56,189,248,.12)",color:ACCENT2,borderRadius:6,padding:"2px 7px",fontWeight:700,border:"1px solid rgba(56,189,248,.2)"}}>🌐 TEMPO REAL</span>
          {bgFallbackUsed&&<span style={{fontSize:9,background:"rgba(245,166,35,.12)",color:GOLD,borderRadius:6,padding:"2px 7px",fontWeight:700,border:"1px solid rgba(245,166,35,.25)"}}>⚡ web_search</span>}
          {bgSource==="stale"&&<span style={{fontSize:9,background:"rgba(244,63,94,.10)",color:RED,borderRadius:6,padding:"2px 7px",fontWeight:700,border:"1px solid rgba(244,63,94,.2)"}}>⚠ cache</span>}
        </div>
        <ExitBtn onExit={onExit}/>
      </div>

      {/* Status background */}
      <div style={{background:"rgba(255,255,255,.03)",border:`1px solid ${BORDER}`,borderRadius:10,padding:"7px 11px",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          {loading
            ?<div style={{width:8,height:8,borderRadius:"50%",border:`2px solid ${ACCENT}`,borderTop:"2px solid transparent",animation:"spin 0.8s linear infinite",flexShrink:0}}/>
            :<div style={{width:8,height:8,borderRadius:"50%",background:bgNewsStatus==="error"?RED:ACCENT,boxShadow:`0 0 6px ${bgNewsStatus==="error"?RED:ACCENT}80`,flexShrink:0,animation:"pls 2s infinite"}}/>}
          <div>
            <div style={{fontSize:9,fontWeight:800,color:loading?"#a8b8cc":"#fff",fontFamily:SANS}}>
              {loading?"Buscando notícias...":bgNewsStatus==="error"?"Erro na busca — tente novamente":bgSource==="web_search"?"⚡ Via web_search (backend offline)":bgSource==="stale"?"⚠ Dados em cache (temporário)":"Atualizado via RSS"}
            </div>
            <div style={{fontSize:8,color:MUTED,fontFamily:SANS}}>
              {bgLastFetch?`Última busca: ${fmtAgo(bgLastFetch)}`:"Aguardando primeira busca..."}
              {!loading&&bgNextIn!=null&&bgNextIn>0&&` · próxima em ${fmtCountdown(bgNextIn)}`}
            </div>
          </div>
        </div>
        <button onClick={onManualRefresh} disabled={loading}
          style={{background:loading?"rgba(255,255,255,.04)":"rgba(108,99,255,.12)",border:`1px solid ${loading?"transparent":"rgba(108,99,255,.3)"}`,borderRadius:8,padding:"4px 9px",cursor:loading?"not-allowed":"pointer",fontSize:8,fontWeight:800,color:loading?MUTED:ACCENT,fontFamily:SANS}}>
          {loading?"...":"↻ Atualizar"}
        </button>
      </div>

      {/* TABS */}
      <div style={{display:"flex",gap:4,marginBottom:8,background:SURFACE,borderRadius:11,padding:3}}>
        {[{id:"feed",l:"📋 Feed"},{id:"analysis",l:"🤖 Análise IA"}].map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)}
            style={{flex:1,background:activeTab===t.id?"linear-gradient(135deg,rgba(108,99,255,.25),rgba(56,189,248,.12))":"transparent",border:`1px solid ${activeTab===t.id?"rgba(108,99,255,.35)":"transparent"}`,borderRadius:8,padding:"6px 4px",cursor:"pointer",fontSize:9,fontWeight:activeTab===t.id?800:600,color:activeTab===t.id?"#fff":MUTED,fontFamily:SANS,transition:"all .18s"}}>
            {t.l}
          </button>
        ))}
      </div>
    </div>

    {/* TAB: FEED */}
    {activeTab==="feed"&&<>
      <div style={{padding:"0 14px 6px",flexShrink:0}}>
        <div style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:"6px 10px",display:"flex",alignItems:"center",gap:7,marginBottom:6}}>
          <span style={{fontSize:12,opacity:.5}}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar notícias ou ticker..."
            style={{flex:1,background:"transparent",border:"none",color:"#fff",fontSize:11,fontFamily:SANS,outline:"none"}}/>
          {search&&<button onClick={()=>setSearch("")} style={{background:"none",border:"none",color:MUTED,cursor:"pointer",fontSize:12,padding:0}}>✕</button>}
        </div>
        <div style={{display:"flex",gap:4,overflowX:"auto",paddingBottom:2}}>
          {["Todos",...[...new Set(deduped.map(n=>n.ticker).filter(Boolean))]].slice(0,9).map(t=>{
            const cl=CLUBS.find(c=>c.ticker===t);const active=tickerFilter===t;
            return <button key={t} onClick={()=>setTickerFilter(t)} style={{background:active?`${cl?.color||ACCENT}22`:"rgba(255,255,255,.04)",border:`1px solid ${active?cl?.color||ACCENT:"transparent"}`,borderRadius:8,padding:"3px 8px",cursor:"pointer",fontSize:8,fontWeight:active?800:600,color:active?cl?.color||ACCENT:MUTED,fontFamily:SANS,flexShrink:0,whiteSpace:"nowrap"}}>{t}</button>;
          })}
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"0 14px 16px"}}>
        {loading&&bgRealNews.length===0&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"40px 20px",gap:10}}>
          <div style={{width:36,height:36,borderRadius:"50%",border:`3px solid rgba(108,99,255,.2)`,borderTop:`3px solid ${ACCENT}`,animation:"spin 1s linear infinite"}}/>
          <div style={{fontSize:11,color:MUTED,fontFamily:SANS,textAlign:"center"}}>Buscando notícias reais na web...<br/><span style={{fontSize:9,color:"rgba(255,255,255,.38)"}}>Anthropic Web Search</span></div>
        </div>}
        {!loading&&feedFiltered.length===0&&<div style={{textAlign:"center",padding:"40px 20px"}}>
          <div style={{fontSize:32,marginBottom:10}}>🌐</div>
          <div style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:SANS,marginBottom:6}}>Aguardando notícias...</div>
          <div style={{fontSize:10,color:MUTED,fontFamily:SANS}}>A busca em segundo plano está em andamento.</div>
        </div>}
        {feedFiltered.map((n,i)=>{
          const cl=CLUBS.find(c=>c.ticker===n.ticker);
          const sentVal=n.sent??n.sentimento??0;
          const up=sentVal>=0;
          const col=catColor[n.cat]||MUTED;
          const isLive=!!n.fromEngine;
          return <div key={n.id||i} style={{background:up?"rgba(108,99,255,.04)":"rgba(244,63,94,.04)",border:`1px solid ${up?"rgba(108,99,255,.2)":"rgba(244,63,94,.2)"}`,borderRadius:14,padding:"12px 13px",marginBottom:8,position:"relative",overflow:"hidden",animation:`fadeIn .3s ease ${Math.min(i,5)*.05}s both`}}>
            <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:up?ACCENT:RED,borderRadius:"14px 0 0 14px"}}/>
            <div style={{paddingLeft:8}}>
              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:6,flexWrap:"wrap"}}>
                <span style={{fontSize:13,flexShrink:0}}>{n.emoji||"📰"}</span>
                {cl&&<span style={{fontSize:8,background:`${cl.color}20`,color:cl.color,borderRadius:6,padding:"2px 6px",fontWeight:900,border:`1px solid ${cl.color}33`,flexShrink:0}}>{n.ticker}</span>}
                {n.cat&&<span style={{fontSize:7,background:`${col}15`,color:col,borderRadius:5,padding:"1px 5px",fontWeight:800,flexShrink:0}}>{n.cat}</span>}
                {isLive
                  ?<span style={{fontSize:7,background:"rgba(108,99,255,.12)",color:ACCENT,borderRadius:5,padding:"1px 5px",fontWeight:900,animation:"pls 2s infinite",flexShrink:0}}>● AO VIVO</span>
                  :<span style={{fontSize:7,background:"rgba(56,189,248,.1)",color:ACCENT2,borderRadius:5,padding:"1px 5px",fontWeight:800,flexShrink:0}}>🌐 REAL</span>}
                {n.fonte&&<span style={{fontSize:7,color:"rgba(255,255,255,.5)",fontFamily:SANS,flexShrink:0}}>{n.fonte}</span>}
                <span style={{fontSize:8,color:MUTED,fontFamily:MONO,marginLeft:"auto",flexShrink:0}}>{fmtAgo(n.ts)}</span>
              </div>
              <div style={{fontSize:12,fontWeight:700,color:"#fff",fontFamily:SANS,lineHeight:1.5,marginBottom:n.resumo?5:8}}>{n.headline}</div>
              {n.resumo&&<div style={{fontSize:10,color:"rgba(255,255,255,.5)",fontFamily:SANS,lineHeight:1.4,marginBottom:8}}>{n.resumo}</div>}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",gap:5,alignItems:"center"}}>
                  <span style={{fontSize:7,color:MUTED,fontFamily:SANS}}>Sentimento IA</span>
                  <span style={{fontSize:10,fontWeight:900,color:sentColor(sentVal),fontFamily:MONO}}>{up?"▲":"▼"}{Math.abs(sentVal*100).toFixed(0)}%</span>
                </div>
                {cl&&<button onClick={()=>fetchAnalysis(cl)} style={{background:"rgba(108,99,255,.1)",border:"1px solid rgba(108,99,255,.25)",borderRadius:8,padding:"3px 8px",cursor:"pointer",fontSize:8,fontWeight:800,color:ACCENT,fontFamily:SANS}}>🤖 Analisar</button>}
              </div>
            </div>
          </div>;
        })}
        <div style={{textAlign:"center",fontSize:8,color:"rgba(255,255,255,.32)",fontFamily:SANS,padding:"8px 0"}}>
          {bgRealNews.length} notícia{bgRealNews.length!==1?"s":""} reais · atualização automática a cada 5 min em segundo plano
        </div>
      </div>
    </>}

    {/* TAB: ANÁLISE IA */}
    {activeTab==="analysis"&&<div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{padding:"0 14px 8px",flexShrink:0}}>
        <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginBottom:6,fontWeight:700,letterSpacing:"1px"}}>SELECIONE UM CLUBE</div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {CLUBS.filter(c=>c.div==="A").map(cl=>{
            const isSel=selectedClub?.ticker===cl.ticker;
            return <button key={cl.ticker} onClick={()=>fetchAnalysis(cl)} disabled={analysisLoading}
              style={{background:isSel?`${cl.color}28`:`${cl.color}10`,border:`1px solid ${isSel?cl.color:cl.color+"33"}`,borderRadius:8,padding:"5px 8px",cursor:analysisLoading?"not-allowed":"pointer",fontSize:8,fontWeight:isSel?900:700,color:isSel?cl.color:cl.color+"99",fontFamily:SANS,opacity:analysisLoading&&!isSel?.4:1,transition:"all .15s"}}>
              {cl.ticker}
            </button>;
          })}
        </div>
        {analysisError&&<div style={{background:"rgba(244,63,94,.08)",border:"1px solid rgba(244,63,94,.2)",borderRadius:8,padding:"7px 10px",marginTop:8,fontSize:9,color:"#f87171",fontFamily:SANS}}>⚠️ {analysisError}</div>}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"0 14px 16px"}}>
        {analysisLoading&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"40px 20px",gap:10}}>
          <div style={{width:36,height:36,borderRadius:"50%",border:`3px solid rgba(108,99,255,.2)`,borderTop:`3px solid ${ACCENT}`,animation:"spin 1s linear infinite"}}/>
          <div style={{fontSize:11,color:MUTED,fontFamily:SANS,textAlign:"center"}}>Analisando {selectedClub?.realName}...<br/><span style={{fontSize:9,color:"rgba(255,255,255,.38)"}}>Buscando notícias + gerando análise</span></div>
        </div>}
        {!analysisLoading&&!analysis&&<div style={{textAlign:"center",padding:"30px 20px"}}>
          <div style={{fontSize:36,marginBottom:12}}>🤖</div>
          <div style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:SANS,marginBottom:6}}>Análise fundamentalista por clube</div>
          <div style={{fontSize:10,color:MUTED,fontFamily:SANS,lineHeight:1.6}}>Selecione um clube para análise completa com notícias reais, sentimento e recomendação.</div>
        </div>}
        {!analysisLoading&&analysis&&(()=>{
          const a=analysis;const cl=a.club;const rc=recCol(a.recomendacao);const sc=sentCol2(a.sentimento_geral);
          return <>
            <div style={{background:`linear-gradient(135deg,${cl.color}15,${cl.color}05)`,border:`1px solid ${cl.color}30`,borderRadius:16,padding:"13px",marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:44,height:44,borderRadius:13,background:`linear-gradient(145deg,${cl.color},${cl.color}99)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:cl.c2,flexShrink:0}}>{cl.ticker.replace(/\d/g,"")}</div>
              <div style={{flex:1}}><div style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:SANS}}>{cl.realName}</div><div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>{cl.ticker} · FS${(a.curP||0).toFixed(2)} · {cl.mktCap}</div></div>
              <div style={{background:`${sc}18`,border:`1px solid ${sc}40`,borderRadius:10,padding:"5px 9px",textAlign:"center",flexShrink:0}}><div style={{fontSize:8,fontWeight:900,color:sc,fontFamily:SANS}}>{sentLabel(a.sentimento_geral)}</div></div>
            </div>
            <div style={{background:`${rc}0e`,border:`1px solid ${rc}40`,borderRadius:14,padding:"12px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:44,height:44,borderRadius:13,background:`${rc}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{a.recomendacao==="COMPRAR"?"📈":a.recomendacao==="VENDER"?"📉":"⏸️"}</div>
              <div style={{flex:1}}><div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginBottom:2}}>RECOMENDAÇÃO IA</div><div style={{fontSize:16,fontWeight:900,color:rc,fontFamily:SANS}}>{a.recomendacao}</div><div style={{fontSize:9,color:"rgba(255,255,255,.6)",fontFamily:SANS,marginTop:2}}>{a.justificativa}</div></div>
              <div style={{background:`${rc}18`,borderRadius:8,padding:"4px 9px",flexShrink:0,textAlign:"center"}}><div style={{fontSize:7,fontWeight:800,color:rc,fontFamily:SANS}}>RISCO</div><div style={{fontSize:11,fontWeight:900,color:rc,fontFamily:SANS}}>{a.nivel_risco}</div></div>
            </div>
            <div style={{background:"rgba(255,255,255,.03)",border:`1px solid ${BORDER}`,borderRadius:12,padding:"11px 13px",marginBottom:10}}>
              <div style={{fontSize:8,color:MUTED,fontFamily:SANS,fontWeight:800,letterSpacing:"1px",marginBottom:5}}>📋 ANÁLISE</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.8)",fontFamily:SANS,lineHeight:1.6}}>{a.resumo}</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
              {[{l:"BULLISH",items:a.pontos_positivos||[],c:ACCENT,e:"✅"},{l:"BEARISH",items:a.pontos_negativos||[],c:RED,e:"⚠️"}].map(g=>(
                <div key={g.l} style={{background:`${g.c}08`,border:`1px solid ${g.c}22`,borderRadius:12,padding:"10px"}}>
                  <div style={{fontSize:8,fontWeight:800,color:g.c,fontFamily:SANS,marginBottom:5}}>{g.e} {g.l}</div>
                  {(g.items||[]).map((item,ii)=><div key={ii} style={{fontSize:9,color:"rgba(255,255,255,.7)",fontFamily:SANS,lineHeight:1.4,marginBottom:3}}>· {item}</div>)}
                  {(!g.items||!g.items.length)&&<div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>—</div>}
                </div>
              ))}
            </div>
            {(a.noticias_recentes||[]).length>0&&<>
              <div style={{fontSize:8,color:MUTED,fontFamily:SANS,fontWeight:800,letterSpacing:"1px",marginBottom:6}}>🌐 NOTÍCIAS RECENTES</div>
              {a.noticias_recentes.map((n,i)=>{const up=(n.sent??0)>=0;return <div key={i} style={{background:"rgba(255,255,255,.025)",border:`1px solid ${up?"rgba(108,99,255,.18)":"rgba(244,63,94,.18)"}`,borderRadius:11,padding:"9px 11px",marginBottom:6,display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:14,flexShrink:0}}>{n.emoji}</span>
                <div style={{flex:1}}><div style={{fontSize:10,color:"#fff",fontFamily:SANS,lineHeight:1.4}}>{n.titulo}</div>{n.fonte&&<div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginTop:1}}>{n.fonte}</div>}</div>
                <span style={{fontSize:10,fontWeight:800,color:up?ACCENT:RED,fontFamily:MONO,flexShrink:0}}>{up?"▲":"▼"}</span>
              </div>;})}
            </>}
            <div style={{fontSize:8,color:"rgba(255,255,255,.36)",fontFamily:SANS,textAlign:"center",marginTop:8,lineHeight:1.6}}>⚠️ Análise gerada por IA com dados públicos. Não constitui recomendação financeira.</div>
          </>;
        })()}
      </div>
    </div>}
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>;
}


// ── Filtro de dados pessoais ──
function sanitizeComment(text){
  return text
    .replace(/\b[\w.+-]+@[\w-]+\.\w{2,}\b/g,"[email removido]")
    .replace(/\b(\(?\d{2}\)?\s?)?(\d{4,5}[-\s]?\d{4})\b/g,"[fone removido]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,"[CPF removido]")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,"[CNPJ removido]")
    .replace(/(https?:\/\/\S+)/gi,"[link removido]")
    .replace(/\bwww\.\S+/gi,"[link removido]")
    .slice(0,280);
}

const FORUM_SEED=[
  {id:"f1",author:"Rodrigo F.",avatar:"RF",plan:"Lenda",ticker:"URU3",text:"Urubu da Gávea com reforço confirmado na janela. URU3 pode romper os FS$30 ainda essa semana! 🔥",likes:14,ts:Date.now()-1000*60*42,likedBy:[]},
  {id:"f2",author:"Ana Paula",avatar:"AP",plan:"Craque",ticker:"POR4",text:"Porco do Parque confirma artilheiro no jogo de domingo. Volume de POR4 subindo muito, alguém mais notou?",likes:8,ts:Date.now()-1000*60*120,likedBy:[]},
  {id:"f3",author:"Carlos H.",avatar:"CH",plan:"Jogador",ticker:"FOG3",text:"Estrela do General Severiano saindo do Z4 muda tudo. Entrei em FOG3 essa semana, segurando firme 💪",likes:5,ts:Date.now()-1000*60*200,likedBy:[]},
  {id:"f4",author:"Fernanda M.",avatar:"FM",plan:"Lenda",ticker:"TIM3",text:"Timão do São Jorge com novo patrocínio master confirmado. TIM3 pode ter valorização de curto prazo.",likes:11,ts:Date.now()-1000*60*340,likedBy:[]},
  {id:"f5",author:"Pedro V.",avatar:"PV",plan:"Craque",ticker:"GAL3",text:"GAL3 sofrendo com a crise na diretoria. Cautela até resolução judicial. Não é hora de comprar.",likes:7,ts:Date.now()-1000*60*500,likedBy:[]},
];

function ForumScreen({user,prices,onBack,onExit}){
  const [posts,setPosts]=useState(FORUM_SEED);
  const [text,setText]=useState("");
  const [filterTicker,setFilterTicker]=useState("Todos");
  const [sortBy,setSortBy]=useState("recente");
  const [posting,setPosting]=useState(false);
  const [charCount,setCharCount]=useState(0);
  const MAX=280;

  const planColor={Lenda:GOLD,Craque:ACCENT,Jogador:MUTED};
  const fmtAgo=ts=>{const d=Math.floor((Date.now()-ts)/1000);if(d<60)return `${d}s`;if(d<3600)return `${Math.floor(d/60)}min`;if(d<86400)return `${Math.floor(d/3600)}h`;return `${Math.floor(d/86400)}d`;};

  const handlePost=()=>{
    const clean=sanitizeComment(text.trim());
    if(!clean||clean.length<3)return;
    setPosting(true);
    setTimeout(()=>{
      const ini=user.name.split(" ").slice(0,2).map(n=>n[0]).join("");
      setPosts(p=>[{id:`f${Date.now()}`,author:user.name.split(" ").slice(0,2).join(" "),avatar:ini,plan:user.plan,ticker:filterTicker==="Todos"?"":filterTicker,text:clean,likes:0,ts:Date.now(),likedBy:[]},...p]);
      setText("");setCharCount(0);setPosting(false);
    },400);
  };

  const toggleLike=id=>{
    setPosts(p=>p.map(post=>{
      if(post.id!==id)return post;
      const liked=post.likedBy.includes(user.id||user.email);
      return {...post,likes:liked?post.likes-1:post.likes+1,likedBy:liked?post.likedBy.filter(x=>x!==(user.id||user.email)):[...post.likedBy,user.id||user.email]};
    }));
  };

  const filtered=posts
    .filter(p=>filterTicker==="Todos"||p.ticker===filterTicker||!p.ticker)
    .sort((a,b)=>sortBy==="recente"?b.ts-a.ts:b.likes-a.likes);

  const club=filterTicker!=="Todos"?CLUBS.find(c=>c.ticker===filterTicker):null;

  return <div style={{flex:1,display:"flex",flexDirection:"column",background:BG,overflow:"hidden"}}>
    {/* Header */}
    <div style={{padding:"8px 14px 0",flexShrink:0}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:MUTED,fontSize:11,cursor:"pointer",fontFamily:SANS,fontWeight:700,padding:0}}>← Voltar</button>
        <div style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:SANS,display:"flex",alignItems:"center",gap:6}}>💬 Comunidade</div>
        <ExitBtn onExit={onExit}/>
      </div>

      {/* Filtro por ativo */}
      <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:6,marginBottom:8}}>
        {["Todos",...CLUBS.map(c=>c.ticker)].map(t=>{
          const cl=CLUBS.find(c=>c.ticker===t);
          const active=filterTicker===t;
          return <button key={t} onClick={()=>setFilterTicker(t)} style={{flexShrink:0,padding:"4px 10px",borderRadius:20,border:`1px solid ${active?(cl?.color||ACCENT):BORDER}`,background:active?(cl?`${cl.color}18`:"rgba(108,99,255,.1)"):"rgba(255,255,255,.04)",color:active?(cl?.color||ACCENT):"#a8b8cc",fontSize:9,fontWeight:800,cursor:"pointer",fontFamily:SANS,transition:"all .15s"}}>
            {t==="Todos"?"🌐 Todos":t}
          </button>;
        })}
      </div>

      {/* Ordenação */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>{filtered.length} comentário{filtered.length!==1?"s":""}{club?` · ${club.name}`:""}</div>
        <div style={{display:"flex",gap:4}}>
          {[{id:"recente",l:"Recentes"},{id:"likes",l:"Top Likes"}].map(s=>(
            <button key={s.id} onClick={()=>setSortBy(s.id)} style={{padding:"3px 9px",borderRadius:8,border:`1px solid ${sortBy===s.id?ACCENT:BORDER}`,background:sortBy===s.id?"rgba(108,99,255,.08)":"transparent",color:sortBy===s.id?ACCENT:MUTED,fontSize:8,fontWeight:800,cursor:"pointer",fontFamily:SANS}}>{s.l}</button>
          ))}
        </div>
      </div>
    </div>

    {/* Posts */}
    <div style={{flex:1,overflowY:"auto",padding:"0 14px 8px"}}>
      {filtered.length===0&&<div style={{textAlign:"center",padding:"40px 20px"}}>
        <div style={{fontSize:28,marginBottom:10}}>💬</div>
        <div style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:SANS}}>Nenhum comentário ainda</div>
        <div style={{fontSize:10,color:MUTED,fontFamily:SANS,marginTop:4}}>Seja o primeiro a comentar!</div>
      </div>}
      {filtered.map(post=>{
        const cl=CLUBS.find(c=>c.ticker===post.ticker);
        const isLiked=post.likedBy.includes(user.id||user.email);
        const isOwn=post.author===user.name.split(" ").slice(0,2).join(" ");
        return <div key={post.id} style={{background:isOwn?"rgba(108,99,255,.04)":CARD,border:`1px solid ${isOwn?"rgba(108,99,255,.15)":BORDER}`,borderRadius:14,padding:"12px 13px",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:9,marginBottom:8}}>
            {/* Avatar */}
            <div style={{width:34,height:34,borderRadius:10,background:`linear-gradient(135deg,${planColor[post.plan]||MUTED}33,${planColor[post.plan]||MUTED}15)`,border:`1px solid ${planColor[post.plan]||MUTED}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:planColor[post.plan]||MUTED,flexShrink:0,fontFamily:SANS}}>
              {post.avatar}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2,flexWrap:"wrap"}}>
                <span style={{fontSize:11,fontWeight:800,color:"#fff",fontFamily:SANS}}>{post.author}</span>
                <span style={{fontSize:7,background:`${planColor[post.plan]||MUTED}22`,color:planColor[post.plan]||MUTED,borderRadius:5,padding:"1px 5px",fontWeight:800,flexShrink:0}}>{post.plan}</span>
                {cl&&<span style={{fontSize:7,background:`${cl.color}18`,color:cl.color,borderRadius:5,padding:"1px 6px",fontWeight:800,flexShrink:0,border:`1px solid ${cl.color}33`}}>{post.ticker}</span>}
                {isOwn&&<span style={{fontSize:7,color:ACCENT,fontFamily:SANS,opacity:.6}}>você</span>}
              </div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.85)",fontFamily:SANS,lineHeight:1.6,wordBreak:"break-word"}}>{post.text}</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:8,color:"rgba(255,255,255,.45)",fontFamily:SANS}}>{fmtAgo(post.ts)}</span>
            <button onClick={()=>toggleLike(post.id)} style={{display:"flex",alignItems:"center",gap:4,background:"none",border:"none",cursor:"pointer",padding:"3px 8px",borderRadius:8,background:isLiked?"rgba(108,99,255,.1)":"rgba(255,255,255,.04)"}}>
              <span style={{fontSize:13,transition:"transform .15s",transform:isLiked?"scale(1.2)":"scale(1)"}}>{isLiked?"❤️":"🤍"}</span>
              <span style={{fontSize:9,fontWeight:700,color:isLiked?ACCENT:MUTED,fontFamily:MONO}}>{post.likes}</span>
            </button>
          </div>
        </div>;
      })}
    </div>

    {/* Área de novo comentário */}
    <div style={{flexShrink:0,padding:"8px 14px 12px",background:`linear-gradient(to top,${BG} 80%,transparent)`,borderTop:`1px solid ${BORDER}`}}>
      <div style={{background:CARD,borderRadius:14,border:`1px solid ${BORDER}`,padding:"10px 12px"}}>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <div style={{width:28,height:28,borderRadius:8,background:`linear-gradient(135deg,${planColor[user.plan]||MUTED}33,${planColor[user.plan]||MUTED}15)`,border:`1px solid ${planColor[user.plan]||MUTED}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:900,color:planColor[user.plan]||MUTED,flexShrink:0,fontFamily:SANS}}>
            {user.name.split(" ").slice(0,2).map(n=>n[0]).join("")}
          </div>
          <textarea
            value={text}
            onChange={e=>{const v=e.target.value;if(v.length<=MAX){setText(v);setCharCount(v.length);}}}
            placeholder="Compartilhe sua análise... (dados pessoais são removidos automaticamente)"
            style={{flex:1,background:"transparent",border:"none",color:"#fff",fontSize:11,fontFamily:SANS,outline:"none",resize:"none",lineHeight:1.5,minHeight:44,caretColor:"#6c63ff"}}
            rows={2}
          />
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:8,color:charCount>MAX*0.85?(charCount>=MAX?RED:GOLD):MUTED,fontFamily:MONO}}>{charCount}/{MAX}</span>
            <span style={{fontSize:7,color:"rgba(255,255,255,.38)",fontFamily:SANS}}>• e-mail, fone e CPF são removidos</span>
          </div>
          <button onClick={handlePost} disabled={!text.trim()||posting}
            style={{padding:"6px 14px",borderRadius:10,border:"none",cursor:text.trim()?"pointer":"default",background:text.trim()?`linear-gradient(135deg,${ACCENT},#5b52e8)`:"rgba(255,255,255,.08)",color:text.trim()?BG:"rgba(255,255,255,.2)",fontSize:10,fontWeight:800,fontFamily:SANS,transition:"all .2s"}}>
            {posting?"...":"Publicar →"}
          </button>
        </div>
      </div>
    </div>
  </div>;
}
function MainApp({onExit,user,initialBalance=2000,onUpgrade,planDueDate=null}){
  const [tab,setTab]=useState("Dashboard");
  const [club,setClub]=useState(null);
  const [filter,setFilter]=useState("Todos");
  const [period,setPeriod]=useState("1D");
  const [activeIndicators,setActiveIndicators]=useState([]);
  const [showIndicatorPanel,setShowIndicatorPanel]=useState(false);
  const [chartMode,setChartMode]=useState("candle");
  const [compareClubs,setCompareClubs]=useState([]);
  const [showCompareDropdown,setShowCompareDropdown]=useState(false);
  const [showBookPanel,setShowBookPanel]=useState(false);
  const [qty,setQty]=useState(100);
  const [menuOpen,setMenuOpen]=useState(false);
  const [showProfile,setShowProfile]=useState(false);
  const [showExtrato,setShowExtrato]=useState(false);
  const [showForum,setShowForum]=useState(false);
  const [showNews,setShowNews]=useState(false);
  const [showCriarLiga,setShowCriarLiga]=useState(false);
  const [showAdmin,setShowAdmin]=useState(false);
  const [readMsgs,setReadMsgs]=useState(new Set());
  const [adIdx,setAdIdx]=useState(0);
  const [msgFilter,setMsgFilter]=useState("Todos");
  const [showClosedAlert,setShowClosedAlert]=useState(false);
  useEffect(()=>{if(marketSession.id==="closed")setShowClosedAlert(true);},[]);
  const {prices,sent,news,newsLog,cb,book,vol24,imb,registerOrder,fv,openPrices,prevCloses,fireExternalNews,setSupplyRef}=useMarket();
  const marketSession=useMarketSession();


  /* ══════════════════════════════════════════════════
     BUSCA DE NOTÍCIAS EM SEGUNDO PLANO
     Consome o backend FootStock News API (RSS + Claude Sonnet)
     em vez de chamar a API Anthropic diretamente do frontend.
     Intervalo: 10 minutos (alinhado com o polling do backend).
     Primeira busca: 3s após mount.
  ══════════════════════════════════════════════════ */
  const NEWS_API_URL=window.FOOTSTOCK_NEWS_API||"http://localhost:3001";
  const [bgRealNews,setBgRealNews]=useState([]);
  const [bgNewsStatus,setBgNewsStatus]=useState("idle"); // "idle"|"loading"|"ok"|"error"
  const [bgLastFetch,setBgLastFetch]=useState(null);
  const [bgNextIn,setBgNextIn]=useState(null);
  const [bgFallbackUsed,setBgFallbackUsed]=useState(false);
  const [bgSource,setBgSource]=useState("rss"); // "rss"|"web_search"|"stale"
  const BG_INTERVAL=10*60*1000; // 10 min — alinhado com o polling do backend
  const bgAutoRef=useRef(null);
  const bgCountRef=useRef(null);

  const fetchBgNews=async()=>{
    setBgNewsStatus("loading");

    // ── Camada 1: tenta o backend FootStock News API ──────────────────
    try{
      const resp=await fetch(`${NEWS_API_URL}/api/news`,{
        method:"GET",
        headers:{"Content-Type":"application/json"},
        signal: AbortSignal.timeout(8000), // timeout 8s
      });
      if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data=await resp.json();
      if(!data.ok) throw new Error("Backend retornou erro");
      // CORREÇÃO 3 (Camada 1): mesma validação de sentimento aplicada ao retorno do backend
      const VALID_CATS_B=["Financeira Crítica","Esportiva Majoritária","Mercado de Ativos","Integridade/Saúde","Institucional","Esportiva Menor"];
      const CAT_MAX_B={"Financeira Crítica":1.0,"Esportiva Majoritária":0.95,"Mercado de Ativos":0.80,"Integridade/Saúde":0.75,"Institucional":0.60,"Esportiva Menor":0.45};
      const normSent=(n,ticker)=>{
        if(typeof n.sent!=="number") return 0;
        const raw=Math.max(-1,Math.min(1,n.sent));
        const cat=VALID_CATS_B.includes(n.cat)?n.cat:"Esportiva Menor";
        const maxAbs=CAT_MAX_B[cat]||0.45;
        const club=CLUBS.find(c=>c.ticker===ticker);
        const hist=club?club.sent:0;
        const sign=raw>=0?1:-1;
        let s=sign*Math.min(Math.abs(raw),maxAbs);
        if(s>0&&hist<-0.3) s=+(s*0.7).toFixed(2);
        if(s<0&&hist>0.5)  s=+(s*0.85).toFixed(2);
        return +s.toFixed(2);
      };
      const todayMsB=Date.now()-12*60*60*1000; // aceita últimas 12h
      const noticias=(data.noticias||[])
        .map(n=>({...n, ticker: normalizeTicker(n.ticker)}))
        .filter(n=>n.ticker)
        .map((n,i)=>{
          // Força ts para agora se vier sem data ou com data de dia anterior
          const rawTs=n.ts?new Date(n.ts).getTime():0;
          const ts=(!rawTs||rawTs<todayMsB)?Date.now()-(i*1500):rawTs;
          return {
            ...n,
            ts,
            cat:VALID_CATS_B.includes(n.cat)?n.cat:"Esportiva Menor",
            sent:normSent(n,n.ticker),
          };
        });
      setBgRealNews(prev=>{
        const ex=new Set(prev.map(x=>x.headline));
        const cutoff=Date.now()-12*60*60*1000;
        // Mantém apenas notícias do dia corrente (últimas 12h)
        const fresh=prev.filter(n=>n.ts>=cutoff);
        return [...noticias.filter(n=>!ex.has(n.headline)),...fresh].slice(0,80);
      });
      if(fireExternalNews) fireExternalNews(noticias);
      setBgLastFetch(new Date());
      setBgNextIn(data.nextRefreshIn||BG_INTERVAL/1000);
      setBgFallbackUsed(data.fallbackUsed||false);
      setBgSource(data.source||"rss");
      setBgNewsStatus("ok");
      return; // sucesso — não precisa do fallback
    }catch(err){
      console.warn("[FootStock] Backend indisponível:",err.message,"— acionando fallback client-side...");
    }

    // ── Camada 2: fallback direto — Anthropic web_search no cliente ───
    // Acionado quando o backend está offline ou inacessível
    try{
      // Monta contexto de sentimento histórico para ancoragem do modelo
      const clubMap=CLUBS.slice(0,20).map(c=>`${c.ticker}=${c.realName||c.name}(sent_hist:${c.sent.toFixed(2)})`).join(", ");
      const allClubMap=CLUBS.map(c=>`${c.ticker}=${c.realName||c.name}`).join(", ");
      const resp=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:2500,
          tools:[{type:"web_search_20250305",name:"web_search"}],
          system:`Você é um classificador especializado de notícias de futebol para um simulador de bolsa.
Sua tarefa: buscar notícias reais recentes e classificá-las com MÁXIMA PRECISÃO.

MAPEAMENTO COMPLETO DE TICKERS (use EXATAMENTE estes tickers):
${allClubMap}

O campo sent_hist abaixo é o sentimento histórico do clube (−1 a +1). Use-o como ÂNCORA:
uma notícia positiva de clube com sent_hist negativo (ex: Corinthians em crise) vale sent menor que a mesma notícia de clube saudável.
Contexto histórico dos principais: ${clubMap}

═══ CATEGORIAS E CRITÉRIOS ESTRITOS ═══

"Financeira Crítica" (impacto ±5%) — USE APENAS SE:
  ✓ Valores acima de R$20M envolvidos
  ✓ Patrocínio master, SAF, aporte de fundo, bloqueio judicial, CUT/CBF, rebaixamento financeiro
  ✗ NÃO USE para negociações de jogadores (→ Mercado de Ativos)
  Exemplos: "Clube fecha SAF com fundo por R$500M", "Dívida de R$200M bloqueada na Justiça"

"Esportiva Majoritária" (impacto ±3%) — USE APENAS SE:
  ✓ Título, rebaixamento, eliminação de mata-mata, clássico decisivo, liderança/Z4
  ✓ Resultado que muda posição na tabela de forma significativa (±3 posições)
  ✗ NÃO USE para jogos de pouca importância (→ Esportiva Menor)
  Exemplos: "Clube é campeão da Libertadores", "Clube cai para Z-4 após derrota"

"Mercado de Ativos" (impacto ±2%) — USE APENAS SE:
  ✓ Contratação ou venda de jogador com valor declarado (qualquer valor)
  ✓ Renovação de contrato de titular, empréstimo relevante
  ✗ NÃO USE para rumores sem confirmação (→ Esportiva Menor)
  Exemplos: "Clube vende atacante por €15M", "Clube anuncia contratação de meia"

"Integridade/Saúde" (impacto ±1.5%) — USE APENAS SE:
  ✓ Doping confirmado, lesão grave de titular (>30 dias), suspensão disciplinar importante
  ✓ Investigação por manipulação de resultados
  ✗ NÃO USE para contusões leves (→ Esportiva Menor)
  Exemplos: "Capitão suspenso 6 meses por doping", "Artilheiro rompe ligamento"

"Institucional" (impacto ±1%) — USE APENAS SE:
  ✓ Eleição de presidente, mudança de técnico, inauguração de CT, acordo com prefeitura
  ✗ NÃO USE se já se encaixa em outra categoria de maior impacto
  Exemplos: "Clube elege novo presidente", "Demissão do técnico após sequência ruim"

"Esportiva Menor" (impacto ±0.5%) — DEFAULT para:
  ✓ Jogo-treino, recuperação de lesão menor, especulação de mercado, convocação
  ✓ Qualquer notícia que NÃO se encaixe claramente nas categorias acima

═══ CALIBRAÇÃO DO SENTIMENTO (sent) ═══
− Varia de −1.0 (catastrófico) a +1.0 (excepcional)
− Use a ÂNCORA histórica: clube em crise → notícia positiva moderada vale no máximo +0.4
− Título de Libertadores = +0.90 a +0.95 (máximo reservado para eventos históricos)
− Derrota comum = −0.30 a −0.50
− Patrocínio relevante = +0.55 a +0.75
− Bloqueio judicial = −0.70 a −0.90
− EVITE valores extremos (±0.90 a ±1.0) para notícias rotineiras

═══ REGRAS ABSOLUTAS ═══
1. Responda APENAS com JSON puro — zero texto fora do JSON, zero markdown, zero explicação
2. Formato: {"noticias":[{"ticker":"URU3","headline":"max 100 chars","cat":"categoria exata","sent":0.75,"emoji":"⚽","fonte":"dominio.com","resumo":"1 frase objetiva"}]}
3. Retorne 6 a 12 notícias publicadas HOJE (${new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'})}) ou no máximo nas últimas 12h — NUNCA retorne notícias de dias anteriores
4. NUNCA invente notícias — use apenas fatos verificados pela busca
5. Se a notícia afeta múltiplos clubes, crie uma entrada por clube`,
          messages:[{role:"user",content:"Busque as notícias mais recentes e impactantes de futebol brasileiro e classifique-as. Priorize: resultados de jogos decisivos, movimentações financeiras relevantes, negociações de jogadores confirmadas, e questões disciplinares. Retorne o JSON."}]
        })
      });
      if(!resp.ok) throw new Error(`Anthropic HTTP ${resp.status}`);
      const data=await resp.json();

      // web_search retorna blocos mistos — extrai só os de texto
      let raw=(data.content||[])
        .filter(b=>b.type==="text")
        .map(b=>b.text)
        .join("");
      raw=raw.trim()
        .replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/,"").trim();
      const fi=raw.indexOf("{"),li=raw.lastIndexOf("}");
      if(fi>=0&&li>fi) raw=raw.slice(fi,li+1);

      const parsed=JSON.parse(raw);
      const now=Date.now();
      const VALID_CATS=["Financeira Crítica","Esportiva Majoritária","Mercado de Ativos","Integridade/Saúde","Institucional","Esportiva Menor"];
      // CORREÇÃO 3: sentimento ancorado historicamente + clamp por categoria
      // Impede que a IA exagere impactos de notícias rotineiras
      const CAT_MAX_SENT={"Financeira Crítica":1.0,"Esportiva Majoritária":0.95,"Mercado de Ativos":0.80,"Integridade/Saúde":0.75,"Institucional":0.60,"Esportiva Menor":0.45};
      const clampSent=(n,ticker)=>{
        if(typeof n.sent!=="number") return 0;
        const raw=Math.max(-1,Math.min(1,n.sent));
        const cat=VALID_CATS.includes(n.cat)?n.cat:"Esportiva Menor";
        const maxAbs=CAT_MAX_SENT[cat]||0.45;
        // Âncora histórica: klubes em situação negativa (sent_hist<-0.3) têm impacto positivo reduzido
        const club=CLUBS.find(c=>c.ticker===ticker);
        const hist=club?club.sent:0;
        const sign=raw>=0?1:-1;
        let clamped=sign*Math.min(Math.abs(raw),maxAbs);
        // Se notícia positiva mas clube cronicamente negativo: reduz intensidade em 30%
        if(clamped>0&&hist<-0.3) clamped=+(clamped*0.7).toFixed(2);
        // Se notícia negativa mas clube muito positivo: reduz levemente em 15%
        if(clamped<0&&hist>0.5) clamped=+(clamped*0.85).toFixed(2);
        return +clamped.toFixed(2);
      };
      const noticias=(parsed.noticias||[])
        .map(n=>({...n, ticker: normalizeTicker(n.ticker)}))
        .filter(n=>n.ticker)
        .map((n,i)=>{
          const cat=VALID_CATS.includes(n.cat)?n.cat:"Esportiva Menor";
          return {
            ...n,
            id:`fallback_${now}_${i}`,
            // Força ts para hoje: se o modelo retornar data antiga, substitui por agora
            ts:(()=>{const raw=n.ts?new Date(n.ts).getTime():0;return(!raw||raw<now-12*60*60*1000)?now-(i*1500):raw;})(),
            isReal:true,
            cat,
            sent:clampSent(n,n.ticker),
            emoji:n.emoji||"📰",
            fonte:n.fonte||"web_search",
          };
        });

      if(!noticias.length) throw new Error("Nenhuma notícia retornada pelo fallback");

      setBgRealNews(prev=>{
        const ex=new Set(prev.map(x=>x.headline));
        const cutoff=Date.now()-12*60*60*1000;
        const fresh=prev.filter(n=>n.ts>=cutoff);
        return [...noticias.filter(n=>!ex.has(n.headline)),...fresh].slice(0,80);
      });
      if(fireExternalNews) fireExternalNews(noticias);
      setBgLastFetch(new Date());
      setBgNextIn(BG_INTERVAL/1000);
      setBgFallbackUsed(true);
      setBgSource("web_search");
      setBgNewsStatus("ok");
    }catch(err){
      console.error("[FootStock] Fallback client-side também falhou:",err.message);
      setBgNewsStatus("error");
    }
  };

  // Ref para controlar se já disparou busca na transição fechado→aberto
  const lastBgSession=useRef(null);
  // CORREÇÃO 1: seed de abertura — dispara NEWS_POOL quando backend ainda não respondeu
  const seedFromPool=()=>{
    if(!fireExternalNews) return;
    // Embaralha e pega 2 itens aleatórios de categorias distintas
    const shuffled=[...NEWS_POOL].sort(()=>Math.random()-0.5);
    const seen=new Set();
    const picks=shuffled.filter(n=>{
      if(seen.has(n.cat)) return false;
      seen.add(n.cat); return true;
    }).slice(0,2);
    if(picks.length) fireExternalNews(picks.map(n=>({...n,fonte:"seed",isReal:false})));
  };

  useEffect(()=>{
    // Intervalo inteligente: verifica sessão antes de buscar
    const smartFetch=()=>{
      const sess=getMarketSession();
      const wasClosedOrAfter=lastBgSession.current==="closed"||lastBgSession.current==="after";
      const isNowActive=sess.id!=="closed"&&sess.id!=="after";
      // Dispara busca imediata na transição fechado→aberto (processa fila acumulada)
      if(wasClosedOrAfter&&isNowActive){
        fetchBgNews();
        lastBgSession.current=sess.id;
        return;
      }
      // Durante sessão ativa: busca normal a cada 5 min
      if(isNowActive) fetchBgNews();
      // Durante fechamento: não busca (preserva a fila existente)
      lastBgSession.current=sess.id;
    };
    const t=setTimeout(()=>{
      lastBgSession.current=getMarketSession().id;
      // CORREÇÃO 1: seed imediato do NEWS_POOL enquanto fetchBgNews processa
      seedFromPool();
      fetchBgNews(); // primeira busca sempre (independe de sessão)
    },3000);
    // CORREÇÃO 1: seed adicional a cada 12 min se bgRealNews ainda vazio
    const seedTimer=setInterval(()=>{
      if(fireExternalNews) seedFromPool();
    },12*60*1000);
    bgAutoRef.current=setInterval(smartFetch,BG_INTERVAL);
    bgCountRef.current=setInterval(()=>setBgNextIn(n=>n!=null&&n>0?n-1:0),1000);
    return()=>{clearTimeout(t);clearInterval(bgAutoRef.current);clearInterval(bgCountRef.current);clearInterval(seedTimer);};
  // eslint-disable-next-line
  },[]);
  const [balance,setBalance]=useState(()=>+initialBalance);
  const [wallet,setWallet]=useState({});
  // Cotas disponíveis no mercado (float remanescente do IPO)
  // INVARIANTE: supply[t] + Σ carteiras[t] = CLUBS.find(t).totalShares
  const [supply,setSupply]=useState(()=>({...INITIAL_SUPPLY}));
  // Fase 3: sincroniza supply do MainApp → supplyRef do useMarket
  useEffect(()=>{setSupplyRef(supply);},[supply]);
  const [orderFeedback,setOrderFeedback]=useState(null);
  const [orderConfirm,setOrderConfirm]=useState(null); // {side,ticker,qty,price,total,ask,bid}
  const [orderType,setOrderType]=useState("fast"); // "fast" | "limit"
  const [limitPriceInput,setLimitPriceInput]=useState("");
  const [limitedOrders,setLimitedOrders]=useState([]); // ordens precificadas pendentes
  const [ocoOrders,setOcoOrders]=useState([]); // ordens OCO (SL/TP) — plano Lenda
  const [ocoMode,setOcoMode]=useState("pct"); // "pct" | "price" — modo de input OCO
  const [shortPositions,setShortPositions]=useState({}); // {ticker:{qty,entryPrice,openedAt}}
  const [shortQtyInput,setShortQtyInput]=useState("1");
  const [upgradeModal,setUpgradeModal]=useState(null); // {targetPlan:"Craque"|"Lenda", feature:string}
  const [userPlan,setUserPlan]=useState(user?.plan||"Jogador"); // plano atual (atualizado após pagamento confirmado)
  // planDue: data de vencimento da assinatura (null = Jogador/gratuito ou não definido)
  // billingCycle: "monthly" | "annual"
  const [planDue,setPlanDue]=useState(()=>{
    if(planDueDate) return new Date(planDueDate);
    // Usuários admin/mock já logados: sem due date (gratuito/interno)
    return null;
  });
  const [planBillingCycle,setPlanBillingCycle]=useState("monthly");
  // isSuspended: true se plano pago e due date ultrapassado
  const isSuspended=planDue&&(user?.plan!=="Jogador"||userPlan!=="Jogador")&&userPlan!=="Jogador"&&new Date()>planDue;
  const PLAN_BONUS={Craque:5000,Lenda:25000};
  const PLAN_RANK={Jogador:0,Craque:1,Lenda:2};
  // CORREÇÃO B: guard de idempotência — só aplica se o targetPlan for superior ao plano atual.
  // Impede duplo-crédito por re-render, clique duplo ou replay do fluxo.
  const applyUpgrade=(targetPlan,billingCycle="monthly")=>{
    if((PLAN_RANK[targetPlan]||0)<=(PLAN_RANK[userPlan]||0)) return; // já nesse plano ou superior
    const bonus=PLAN_BONUS[targetPlan]||0;
    const nb=+(balance+bonus).toFixed(2);
    const due=new Date();
    due.setMonth(due.getMonth()+(billingCycle==="annual"?12:1));
    setBalance(nb);
    setUserPlan(targetPlan);
    setPlanDue(due);
    setPlanBillingCycle(billingCycle);
    setTxLog(p=>[{type:"upgrade",plan:targetPlan,bonus,billing:billingCycle,dueDate:due.toISOString(),date:todayStr(),time:timeStr(),balanceBefore:balance,balanceAfter:nb},...p]);
    recordDashPoint(nb,wallet,prices);
  };
  const [ocoSL,setOcoSL]=useState(""); // stop loss input
  const [ocoTP,setOcoTP]=useState(""); // take profit input
  const isLenda=userPlan==="Lenda";
  const isCraque=userPlan==="Craque"||userPlan==="Lenda";
  const [scheduleModal,setScheduleModal]=useState(null); // {side,ticker,qty,closePrice,club}
  const [schedulePriceType,setSchedulePriceType]=useState("close");
  const [scheduleFixedInput,setScheduleFixedInput]=useState("");
  const [scheduledOrders,setScheduledOrders]=useState([]); // [{id,side,ticker,qty,priceType,fixedPrice,closePrice,club,scheduledAt}]
  const [txLog,setTxLog]=useState([]);
  /* ── Dashboard state ── */
  const [dashPeriod,setDashPeriod]=useState("7D");
  // Cada ponto: {ts: timestamp ms, value: patrimônio}
  const [dashPoints,setDashPoints]=useState(()=>[{ts:Date.now(),value:initialBalance}]);
  const [dashAnimKey,setDashAnimKey]=useState(0);

  const todayStr=()=>new Date().toISOString().slice(0,10);
  const timeStr=()=>new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
  const showFb=(type,msg,side,extra={})=>{setOrderFeedback({type,msg,side,...extra});};
  // Registra ponto real no gráfico do dashboard (patrimônio = saldo livre + valor da carteira)
  const recordDashPoint=(newBalance,newWallet,newPrices)=>{
    const portV=Object.entries(newWallet).reduce((s,[t,pos])=>s+pos.qty*(newPrices[t]||CLUBS.find(c=>c.ticker===t)?.price||0),0);
    const patrimonio=+(newBalance+portV).toFixed(2);
    setDashPoints(p=>[...p,{ts:Date.now(),value:patrimonio}]);
    setDashAnimKey(k=>k+1);
  };

  // ── Motor de ordens agendadas: executa ao abrir o mercado ──
  const prevSessionRef=useRef(null);
  useEffect(()=>{
    const check=()=>{
      const sess=getMarketSession();
      const prev=prevSessionRef.current;
      // Transição para sessão "main" = abertura do mercado
      if(prev&&prev!=="main"&&sess.id==="main"){
        setScheduledOrders(pending=>{
          if(!pending.length) return pending;
          const updated=pending.map(order=>{
            if(order.status==="cancelled"||order.status==="executed") return order; // já processada
            const curP=prices[order.ticker]||CLUBS.find(c=>c.ticker===order.ticker)?.price||10;
            const execPrice=order.priceType==="close"?order.closePrice:order.fixedPrice;
            const avail=supply[order.ticker]||0;
            if(order.side==="buy"){
              const total=order.qty*execPrice;
              const fee=calcFee(total);
              const totalWithFee=+(total+fee).toFixed(2);
              const priceOk=order.priceType==="close"||(curP<=execPrice*1.05);
              if(!priceOk){showFb("err",`Ordem agendada cancelada!\n${order.qty}× ${order.ticker} — preço de abertura FS$${curP.toFixed(2)} excede limite FS$${execPrice.toFixed(2)}`,"buy");return{...order,status:"cancelled",cancelledAt:new Date().toISOString()};}
              if(totalWithFee>balance||order.qty>avail){showFb("err",`Ordem agendada cancelada!\n${order.qty}× ${order.ticker} — ${totalWithFee>balance?"saldo insuficiente":"cotas indisponíveis"}`,"buy");return{...order,status:"cancelled",cancelledAt:new Date().toISOString()};}
              const nb=+(balance-totalWithFee).toFixed(2);
              setBalance(nb);
              setSupply(s=>({...s,[order.ticker]:s[order.ticker]-order.qty}));
              registerOrder(order.ticker,order.qty,"buy");
              setWallet(p=>{const pos=p[order.ticker]||{qty:0,avgPrice:execPrice};const nq=pos.qty+order.qty;const na=((pos.qty*pos.avgPrice)+(order.qty*execPrice))/nq;const nw={...p,[order.ticker]:{qty:nq,avgPrice:+na.toFixed(2)}};recordDashPoint(nb,nw,prices);return nw;});
              setTxLog(p=>[{type:"buy",ticker:order.ticker,qty:order.qty,price:execPrice,total,fee,totalWithFee,date:todayStr(),time:timeStr(),balanceBefore:balance,balanceAfter:nb,scheduled:true},...p]);
              showFb("ok",`Ordem agendada executada!\n${order.qty}× ${order.ticker} a FS$${execPrice.toFixed(2)}\nValor: FS$${total.toFixed(2)} + Taxa FS$${fee.toFixed(2)}\nTotal debitado: FS$${totalWithFee.toFixed(2)}`,"buy",{scheduled:true});
              return{...order,status:"executed",executedAt:new Date().toISOString()};
            } else {
              const pos=wallet[order.ticker];
              if(!pos||pos.qty<order.qty){showFb("err",`Ordem agendada cancelada!\n${order.qty}× ${order.ticker} — posição insuficiente`,"sell");return{...order,status:"cancelled",cancelledAt:new Date().toISOString()};}
              const total=order.qty*execPrice;
              const fee=calcFee(total);
              const totalAfterFee=+(total-fee).toFixed(2);
              const nb=+(balance+totalAfterFee).toFixed(2);
              setBalance(nb);
              setSupply(s=>({...s,[order.ticker]:s[order.ticker]+order.qty}));
              registerOrder(order.ticker,order.qty,"sell");
              setWallet(p=>{const nq=p[order.ticker].qty-order.qty;const nw=nq===0?(()=>{const n={...p};delete n[order.ticker];return n;})():{...p,[order.ticker]:{...p[order.ticker],qty:nq}};recordDashPoint(nb,nw,prices);return nw;});
              setTxLog(p=>[{type:"sell",ticker:order.ticker,qty:order.qty,price:execPrice,total,fee,totalWithFee:totalAfterFee,date:todayStr(),time:timeStr(),balanceBefore:balance,balanceAfter:nb,scheduled:true},...p]);
              showFb("ok",`Ordem agendada executada!\n${order.qty}× ${order.ticker} a FS$${execPrice.toFixed(2)}\nValor: FS$${total.toFixed(2)} − Taxa FS$${fee.toFixed(2)}\nTotal creditado: FS$${totalAfterFee.toFixed(2)}`,"sell",{scheduled:true});
              return{...order,status:"executed",executedAt:new Date().toISOString()};
            }
          });
          return updated;
        });
      }
      prevSessionRef.current=sess.id;
    };
    const t=setInterval(check,10000);
    check();
    return()=>clearInterval(t);
  // eslint-disable-next-line
  },[prices,balance,supply,wallet]);

  // ── Motor de ordens precificadas (verifica a cada 3s) ──
  useEffect(()=>{
    if(!limitedOrders.length) return;
    const t=setInterval(()=>{
      const sess=getMarketSession();
      if(sess.id!=="main") return;
      setLimitedOrders(prev=>{
        const updated=[...prev];
        let changed=false;
        updated.forEach((o,idx)=>{
          if(o.status!=="pending") return;
          const curP=prices[o.ticker]||o.limitPrice;
          const ob=book[o.ticker]||{bid:curP,ask:curP};
          const triggered=o.side==="buy"?ob.ask<=o.limitPrice:ob.bid>=o.limitPrice;
          if(triggered){
            const execPrice=o.side==="buy"?ob.ask:ob.bid;
            const total=o.qty*execPrice;
            const fee=calcFee(total);
            if(o.side==="buy"){
              const totalWithFee=+(total+fee).toFixed(2);
              if(totalWithFee>balance||o.qty>(supply[o.ticker]||0)){
                updated[idx]={...o,status:"cancelled",cancelledAt:new Date().toISOString(),reason:"Saldo ou cotas insuficientes"};
                showFb("err",`Ordem precificada cancelada!\n${o.qty}× ${o.ticker} — saldo/cotas insuficientes`,"buy");
              } else {
                const nb=+(balance-totalWithFee).toFixed(2);
                setBalance(nb);
                setSupply(s=>({...s,[o.ticker]:s[o.ticker]-o.qty}));
                registerOrder(o.ticker,o.qty,"buy");
                setWallet(p=>{const pos=p[o.ticker]||{qty:0,avgPrice:execPrice};const nq=pos.qty+o.qty;const na=((pos.qty*pos.avgPrice)+(o.qty*execPrice))/nq;const nw={...p,[o.ticker]:{qty:nq,avgPrice:+na.toFixed(2)}};recordDashPoint(nb,nw,prices);return nw;});
                setTxLog(p=>[{type:"buy",ticker:o.ticker,qty:o.qty,price:execPrice,total,fee,totalWithFee,date:todayStr(),time:timeStr(),balanceBefore:balance,balanceAfter:nb,limited:true},...p]);
                showFb("ok",`Ordem precificada executada!\n${o.qty}× ${o.ticker} a FS$${execPrice.toFixed(2)}\nTotal debitado: FS$${totalWithFee.toFixed(2)}`,"buy",{scheduled:true});
                updated[idx]={...o,status:"executed",executedAt:new Date().toISOString(),execPrice};
              }
            } else {
              const totalAfterFee=+(total-fee).toFixed(2);
              const pos=wallet[o.ticker];
              if(!pos||pos.qty<o.qty){
                updated[idx]={...o,status:"cancelled",cancelledAt:new Date().toISOString(),reason:"Posição insuficiente"};
                showFb("err",`Ordem precificada cancelada!\n${o.qty}× ${o.ticker} — posição insuficiente`,"sell");
              } else {
                const nb=+(balance+totalAfterFee).toFixed(2);
                setBalance(nb);
                setSupply(s=>({...s,[o.ticker]:s[o.ticker]+o.qty}));
                registerOrder(o.ticker,o.qty,"sell");
                setWallet(p=>{const nq=p[o.ticker].qty-o.qty;const nw=nq===0?(()=>{const n={...p};delete n[o.ticker];return n;})():{...p,[o.ticker]:{...p[o.ticker],qty:nq}};recordDashPoint(nb,nw,prices);return nw;});
                setTxLog(p=>[{type:"sell",ticker:o.ticker,qty:o.qty,price:execPrice,total,fee,totalWithFee:totalAfterFee,date:todayStr(),time:timeStr(),balanceBefore:balance,balanceAfter:nb,limited:true},...p]);
                showFb("ok",`Ordem precificada executada!\n${o.qty}× ${o.ticker} a FS$${execPrice.toFixed(2)}\nTotal creditado: FS$${totalAfterFee.toFixed(2)}`,"sell",{scheduled:true});
                updated[idx]={...o,status:"executed",executedAt:new Date().toISOString(),execPrice};
              }
            }
            changed=true;
          }
        });
        return changed?updated:prev;
      });
    },3000);
    return()=>clearInterval(t);
  // eslint-disable-next-line
  },[limitedOrders,prices,balance,supply,wallet]);

  // ── Motor OCO: Stop Loss & Take Profit (verifica a cada 2s) — plano Lenda ──
  useEffect(()=>{
    if(!ocoOrders.length) return;
    const t=setInterval(()=>{
      const sess=getMarketSession();
      if(sess.id!=="main") return;
      setOcoOrders(prev=>{
        const updated=[...prev];
        let changed=false;
        updated.forEach((o,idx)=>{
          if(o.status!=="pending") return;
          const curP=prices[o.ticker]||0;
          const ob=book[o.ticker]||{bid:curP,ask:curP};
          const execBid=ob.bid;
          // Verificar SL
          const slTriggered=o.slPrice&&execBid<=o.slPrice;
          // Verificar TP
          const tpTriggered=o.tpPrice&&execBid>=o.tpPrice;
          if(!slTriggered&&!tpTriggered) return;
          const triggerType=slTriggered?"sl":"tp";
          const execPrice=execBid;
          const total=o.qty*execPrice;
          const fee=calcFee(total);
          const totalAfterFee=+(total-fee).toFixed(2);
          const pos=wallet[o.ticker];
          if(!pos||pos.qty<o.qty){
            updated[idx]={...o,status:"cancelled",cancelledAt:new Date().toISOString(),reason:"Posição insuficiente no momento do disparo"};
            showFb("err",`OCO cancelada!\n${o.ticker} — posição insuficiente`,"sell");
            changed=true;return;
          }
          const nb=+(balance+totalAfterFee).toFixed(2);
          setBalance(nb);
          setSupply(s=>({...s,[o.ticker]:s[o.ticker]+o.qty}));
          registerOrder(o.ticker,o.qty,"sell");
          setWallet(p=>{
            const nq=p[o.ticker].qty-o.qty;
            const nw=nq===0?(()=>{const n={...p};delete n[o.ticker];return n;})():{...p,[o.ticker]:{...p[o.ticker],qty:nq}};
            recordDashPoint(nb,nw,prices);return nw;
          });
          setTxLog(p=>[{type:"sell",ticker:o.ticker,qty:o.qty,price:execPrice,total,fee,totalWithFee:totalAfterFee,date:todayStr(),time:timeStr(),balanceBefore:balance,balanceAfter:nb,oco:true,triggerType},...p]);
          const label=triggerType==="sl"?"🛑 Stop Loss":"🎯 Take Profit";
          showFb(triggerType==="sl"?"err":"ok",`${label} disparado!\n${o.qty}× ${o.ticker} vendido a FS$${execPrice.toFixed(2)}\nTotal creditado: FS$${totalAfterFee.toFixed(2)}`,"sell",{scheduled:true});
          updated[idx]={...o,status:"executed",executedAt:new Date().toISOString(),execPrice,triggerType};
          changed=true;
        });
        return changed?updated:prev;
      });
    },2000);
    return()=>clearInterval(t);
  // eslint-disable-next-line
  },[ocoOrders,prices,balance,supply,wallet]);

  const calcFee=(total)=>total<=500?0.25:total<=1000?0.35:0.45;

  const executeBuy=(ticker,qty,price)=>{
    const total=qty*price;
    const fee=calcFee(total);
    const totalWithFee=+(total+fee).toFixed(2);
    const avail=supply[ticker]||0;
    if(totalWithFee>balance){showFb("err",`Saldo insuficiente!\nNecessário: FS$${totalWithFee.toFixed(2)} (incl. taxa FS$${fee.toFixed(2)})\nDisponível: FS$${balance.toFixed(2)}`,"buy");return;}
    if(qty>avail){showFb("err",`Cotas insuficientes no mercado!\nDisponíveis: ${avail.toLocaleString("pt-BR")}\nSolicitadas: ${qty.toLocaleString("pt-BR")}`,"buy");return;}
    const nb=+(balance-totalWithFee).toFixed(2);
    setBalance(nb);
    setSupply(s=>({...s,[ticker]:s[ticker]-qty}));
    registerOrder(ticker,qty,"buy");
    const newWallet=wallet=>{const pos=wallet[ticker]||{qty:0,avgPrice:price};const nq=pos.qty+qty;const na=((pos.qty*pos.avgPrice)+(qty*price))/nq;return{...wallet,[ticker]:{qty:nq,avgPrice:+na.toFixed(2)}};};
    setWallet(p=>{const nw=newWallet(p);recordDashPoint(nb,nw,prices);return nw;});
    setTxLog(p=>[{type:"buy",ticker,qty,price,total,fee,totalWithFee,date:todayStr(),time:timeStr(),balanceBefore:balance,balanceAfter:nb},...p]);
    showFb("ok",`Compra executada!\n${qty}× ${ticker} a FS$${price.toFixed(2)}\nValor: FS$${total.toFixed(2)} + Taxa FS$${fee.toFixed(2)}\nTotal debitado: FS$${totalWithFee.toFixed(2)}`,"buy");
  };

  const executeSell=(ticker,qty,price)=>{
    const pos=wallet[ticker];
    if(!pos||pos.qty<qty){showFb("err",`Posição insuficiente!\nVocê tem ${pos?.qty||0} cota(s) de ${ticker}\nSolicitado: ${qty}`,"sell");return;}
    const total=qty*price;
    const fee=calcFee(total);
    const totalAfterFee=+(total-fee).toFixed(2);
    const nb=+(balance+totalAfterFee).toFixed(2);
    setBalance(nb);
    setSupply(s=>({...s,[ticker]:s[ticker]+qty}));
    registerOrder(ticker,qty,"sell");
    const newWallet=wallet=>{const nq=wallet[ticker].qty-qty;if(nq===0){const n={...wallet};delete n[ticker];return n;}return{...wallet,[ticker]:{...wallet[ticker],qty:nq}};};
    setWallet(p=>{const nw=newWallet(p);recordDashPoint(nb,nw,prices);return nw;});
    setTxLog(p=>[{type:"sell",ticker,qty,price,total,fee,totalWithFee:totalAfterFee,date:todayStr(),time:timeStr(),balanceBefore:balance,balanceAfter:nb},...p]);
    showFb("ok",`Venda executada!\n${qty}× ${ticker} a FS$${price.toFixed(2)}\nValor: FS$${total.toFixed(2)} − Taxa FS$${fee.toFixed(2)}\nTotal creditado: FS$${totalAfterFee.toFixed(2)}`,"sell");
  };

  // ── SHORT SELLING: Abrir posição (alugar + vender) ──
  const LOAN_RATE_DAILY=0.005;
  const executeShortOpen=(ticker,qty,price)=>{
    const notional=qty*price;
    const marginReq=+(notional*1.5).toFixed(2);
    const fee=calcFee(notional);
    if(marginReq>balance){showFb("err",`Margem insuficiente!\nNecessário: FS$${marginReq.toFixed(2)} (150% do notional)\nDisponível: FS$${balance.toFixed(2)}`,"sell");return;}
    const nb=+(balance-marginReq-fee).toFixed(2);
    setBalance(nb);
    setSupply(s=>({...s,[ticker]:(s[ticker]||0)+qty}));
    registerOrder(ticker,qty,"sell");
    setShortPositions(p=>({...p,[ticker]:{qty:(p[ticker]?.qty||0)+qty,entryPrice:price,openedAt:new Date().toISOString(),margin:marginReq,loanFeeAccrued:fee}}));
    setTxLog(p=>[{type:"short_open",ticker,qty,price,total:notional,fee,marginBlocked:marginReq,date:todayStr(),time:timeStr(),balanceBefore:balance,balanceAfter:nb},...p]);
    showFb("err",`Short aberto! 📉\n${qty}× ${ticker} vendido a FS$${price.toFixed(2)}\nMargem bloqueada: FS$${marginReq.toFixed(2)}\nTaxa: FS$${fee.toFixed(2)}`,"sell");
  };

  // ── SHORT SELLING: Fechar posição (recomprar + devolver) ──
  const executeShortClose=(ticker,qty,price)=>{
    const pos=shortPositions[ticker];
    if(!pos||pos.qty<qty){showFb("err",`Sem posição short em ${ticker} suficiente!`,"buy");return;}
    const notional=qty*price;
    const fee=calcFee(notional);
    const pnl=+((pos.entryPrice-price)*qty-fee).toFixed(2);
    const marginReturn=+(pos.margin*(qty/pos.qty)).toFixed(2);
    const nb=+(balance+marginReturn+pnl).toFixed(2);
    setBalance(nb);
    setSupply(s=>({...s,[ticker]:Math.max(0,(s[ticker]||0)-qty)}));
    registerOrder(ticker,qty,"buy");
    setShortPositions(p=>{
      const newQty=(p[ticker]?.qty||0)-qty;
      if(newQty<=0){const n={...p};delete n[ticker];return n;}
      return {...p,[ticker]:{...p[ticker],qty:newQty,margin:p[ticker].margin-marginReturn}};
    });
    setTxLog(p=>[{type:"short_close",ticker,qty,price,total:notional,fee,pnl,marginReturned:marginReturn,date:todayStr(),time:timeStr(),balanceBefore:balance,balanceAfter:nb},...p]);
    const pnlStr=pnl>=0?`+FS$${pnl.toFixed(2)}`:`-FS$${Math.abs(pnl).toFixed(2)}`;
    showFb(pnl>=0?"ok":"err",`Short fechado! ${pnl>=0?"📈":"📉"}\n${qty}× ${ticker} recomprado a FS$${price.toFixed(2)}\nP&L: ${pnlStr}\nMargem devolvida: FS$${marginReturn.toFixed(2)}`,"buy");
    recordDashPoint(nb,wallet,prices);
  };

  const cd={background:CARD,borderRadius:16,border:`1px solid ${BORDER}`,backdropFilter:"blur(8px)"};
  const pill=a=>({flex:1,padding:"7px 4px",borderRadius:8,border:"none",cursor:"pointer",fontSize:10,fontWeight:a?600:400,background:a?"rgba(108,99,255,.15)":"transparent",color:a?ACCENT:MUTED,fontFamily:SANS,transition:"all .15s",letterSpacing:"0.1px"});
  // Variação diária: baseada no preço de abertura do pregão (snap às 11h00)
  // Fallback: c.price (IPO) quando mercado ainda não abriu hoje
  const pct=t=>{
    const base=openPrices[t]||CLUBS.find(c=>c.ticker===t)?.price||1;
    return +(((prices[t]||base)-base)/base*100).toFixed(2);
  };
  // Variação histórica (fechamento anterior): para gráficos multi-dia
  const pctFromPrev=t=>{
    const base=prevCloses[t]||openPrices[t]||CLUBS.find(c=>c.ticker===t)?.price||1;
    return +(((prices[t]||base)-base)/base*100).toFixed(2);
  };
  const filtered=(filter==="Todos"?CLUBS:filter==="Alta"?CLUBS.filter(c=>pct(c.ticker)>0):CLUBS.filter(c=>pct(c.ticker)<0)).slice().sort((a,b)=>a.ticker===user?.favoriteTeam?-1:b.ticker===user?.favoriteTeam?1:0);
  const portEntries=Object.entries(wallet).map(([t,pos])=>{const c=CLUBS.find(x=>x.ticker===t);return c?{...c,qty:pos.qty,avg:pos.avgPrice,invested:pos.qty*pos.avgPrice}:null;}).filter(Boolean);
  const portVal=portEntries.reduce((s,p)=>s+p.qty*(prices[p.ticker]||p.price),0);
  const portInv=portEntries.reduce((s,p)=>s+p.invested,0),pnl=portVal-portInv;

  // ── SUSPENSÃO: bloqueia acesso ao app se assinatura vencida ──────────────
  if(isSuspended){
    const planLabel=userPlan;
    const planCol=userPlan==="Lenda"?GOLD:ACCENT;
    const dueStr=planDue?planDue.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"}):"—";
    return <div style={{flex:1,display:"flex",flexDirection:"column",background:BG,overflow:"hidden"}}>
      {/* header mínimo */}
      <div style={{padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${BORDER}`,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <FootStockLogo size={28} rounded={true}/>
          <div style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:SANS}}>FootStock</div>
        </div>
        <button onClick={onExit} style={{background:"rgba(244,63,94,.1)",border:"1px solid rgba(244,63,94,.25)",color:RED,borderRadius:8,padding:"5px 11px",fontSize:10,cursor:"pointer",fontFamily:SANS,fontWeight:700}}>Sair</button>
      </div>
      {/* conteúdo */}
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 28px",textAlign:"center"}}>
        <div style={{width:76,height:76,borderRadius:"50%",background:"rgba(244,63,94,.1)",border:"2px solid rgba(244,63,94,.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:34,marginBottom:22}}>🔒</div>
        <div style={{fontSize:10,color:RED,fontWeight:800,letterSpacing:"2px",fontFamily:SANS,marginBottom:8}}>CONTA SUSPENSA</div>
        <div style={{fontSize:20,fontWeight:900,color:"#fff",fontFamily:SANS,letterSpacing:"-0.5px",marginBottom:10,lineHeight:1.2}}>Sua assinatura<br/><span style={{color:RED}}>está vencida</span></div>
        <div style={{fontSize:12,color:MUTED,fontFamily:SANS,lineHeight:1.7,marginBottom:24}}>
          O pagamento do Plano <span style={{color:planCol,fontWeight:700}}>{planLabel}</span> não foi confirmado.<br/>
          Vencimento: <span style={{color:"#fff",fontWeight:600}}>{dueStr}</span><br/>
          Renove para continuar operando.
        </div>
        {/* box de ação */}
        <div style={{width:"100%",background:"rgba(244,63,94,.06)",border:"1px solid rgba(244,63,94,.2)",borderRadius:16,padding:"16px",marginBottom:16}}>
          <div style={{fontSize:10,color:MUTED,fontFamily:SANS,marginBottom:12}}>Suas posições e histórico estão preservados.</div>
          <button onClick={()=>onUpgrade&&onUpgrade(planLabel,planLabel,(plan,bil)=>applyUpgrade(plan==="craque"?"Craque":"Lenda",bil||planBillingCycle))}
            style={{width:"100%",padding:"15px",borderRadius:14,border:"none",cursor:"pointer",background:`linear-gradient(135deg,${planCol},${userPlan==="Lenda"?"#e8830a":ACCENT2})`,color:BG,fontSize:14,fontWeight:900,fontFamily:SANS,boxShadow:`0 6px 24px ${planCol}40`,marginBottom:10}}>
            Renovar Plano {planLabel} →
          </button>
          <button onClick={()=>{setUserPlan("Jogador");setPlanDue(null);}}
            style={{width:"100%",padding:"11px",borderRadius:12,border:`1px solid ${BORDER}`,background:"transparent",color:MUTED,fontSize:12,fontWeight:700,fontFamily:SANS,cursor:"pointer"}}>
            Continuar como Jogador (grátis)
          </button>
        </div>
        <div style={{fontSize:9,color:"rgba(255,255,255,.2)",fontFamily:SANS}}>Dúvidas? contato@footstock.com.br</div>
      </div>
    </div>;
  }

  if(showExtrato)   return <ExtratoScreen txLog={txLog} scheduledOrders={scheduledOrders} limitedOrders={limitedOrders} ocoOrders={ocoOrders} cancelScheduled={id=>setScheduledOrders(p=>p.map(o=>o.id===id?{...o,status:"cancelled",cancelledAt:new Date().toISOString()}:o))} cancelLimited={id=>setLimitedOrders(p=>p.map(o=>o.id===id?{...o,status:"cancelled",cancelledAt:new Date().toISOString()}:o))} cancelOco={id=>setOcoOrders(p=>p.map(o=>o.id===id?{...o,status:"cancelled",cancelledAt:new Date().toISOString()}:o))} onBack={()=>setShowExtrato(false)} onExit={onExit}/>;
  if(showForum)     return <ForumScreen user={user} prices={prices} onBack={()=>setShowForum(false)} onExit={onExit}/>;
  if(showNews)      return <NewsScreen newsLog={newsLog} prices={prices} onBack={()=>setShowNews(false)} onExit={onExit} fireExternalNews={fireExternalNews} bgRealNews={bgRealNews} bgNewsStatus={bgNewsStatus} bgLastFetch={bgLastFetch} bgNextIn={bgNextIn} onManualRefresh={fetchBgNews} bgFallbackUsed={bgFallbackUsed} bgSource={bgSource}/>;
  if(showProfile)   return <ProfileScreen user={user} onBack={()=>setShowProfile(false)} onExit={onExit}/>;
  if(showCriarLiga) return <CriarLigaScreen onBack={()=>setShowCriarLiga(false)} onExit={onExit} user={user}/>;
  if(showAdmin)     return <AdminPanel onBack={()=>setShowAdmin(false)} onExit={onExit} role={user.role}/>;

  return <div style={{flex:1,display:"flex",flexDirection:"column",background:BG,overflow:"hidden",position:"relative"}}>

    {/* ── MERCADO FECHADO — pop-up de boas-vindas ── */}
    {showClosedAlert&&<div style={{position:"absolute",inset:0,zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"rgba(0,0,0,.6)",backdropFilter:"blur(6px)"}} onClick={()=>setShowClosedAlert(false)}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",background:"linear-gradient(180deg,#0e1520,#080b12)",borderRadius:"24px 24px 0 0",padding:"8px 20px 32px",boxShadow:"0 -8px 40px rgba(0,0,0,.7)",border:"1px solid rgba(244,63,94,.18)",borderBottom:"none"}}>
        {/* Puxador */}
        <div style={{width:36,height:4,borderRadius:2,background:"rgba(255,255,255,.12)",margin:"0 auto 18px"}}/>
        {/* Ícone + título */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:6}}>
          <div style={{width:46,height:46,borderRadius:15,background:"rgba(244,63,94,.12)",border:"1px solid rgba(244,63,94,.35)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🔒</div>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:"#fff",fontFamily:SANS,lineHeight:1.1}}>Mercado Fechado</div>
            <div style={{fontSize:10,color:"rgba(244,63,94,.85)",fontWeight:700,fontFamily:SANS,marginTop:3}}>Operações indisponíveis neste momento</div>
          </div>
        </div>
        <div style={{fontSize:10,color:MUTED,fontFamily:SANS,lineHeight:1.6,marginBottom:16}}>
          Você pode explorar ativos, acompanhar notícias e montar sua estratégia. As ordens serão liberadas na próxima sessão.
        </div>
        {/* Tabela de horários */}
        <div style={{fontSize:8,color:MUTED,fontWeight:800,letterSpacing:"1.2px",fontFamily:SANS,marginBottom:8}}>HORÁRIO DE FUNCIONAMENTO · BRASÍLIA</div>
        <div style={{borderRadius:14,overflow:"hidden",border:`1px solid ${BORDER}`,marginBottom:20}}>
          {[
            {id:"pre",     emoji:"🟡", label:"Pré-abertura",      horario:"10h45 – 11h00", color:"#f5a623"},
            {id:"main",    emoji:"🟢", label:"Negociação",         horario:"11h00 – 00h45", color:ACCENT},
            {id:"closing", emoji:"🔵", label:"Call de Fechamento", horario:"00h45 – 01h00", color:"#38bdf8"},
            {id:"after",   emoji:"🟣", label:"After-Market",       horario:"01h00 – 01h30", color:"#8b5cf6"},
            {id:"closed",  emoji:"🔴", label:"Mercado Fechado",    horario:"01h30 – 10h45", color:"#f43f5e"},
          ].map((s,i,arr)=>(
            <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 13px",background:s.id==="closed"?"rgba(244,63,94,.06)":"transparent",borderBottom:i<arr.length-1?`1px solid ${BORDER}`:"none"}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:s.color,flexShrink:0,boxShadow:s.id==="closed"?`0 0 6px ${s.color}80`:"none"}}/>
              <span style={{flex:1,fontSize:10,fontWeight:s.id==="closed"?800:600,color:s.id==="closed"?"#fff":"rgba(255,255,255,.65)",fontFamily:SANS}}>{s.label}</span>
              <span style={{fontSize:10,fontWeight:700,color:s.id==="closed"?s.color:"rgba(255,255,255,.6)",fontFamily:MONO}}>{s.horario}</span>
              {s.id==="closed"&&<span style={{fontSize:8,background:"rgba(244,63,94,.15)",color:"#f43f5e",borderRadius:6,padding:"1px 6px",fontWeight:800,fontFamily:SANS}}>AGORA</span>}
            </div>
          ))}
        </div>
        <button onClick={()=>setShowClosedAlert(false)} style={{width:"100%",padding:"14px",borderRadius:14,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#6c63ff,#38bdf8)",color:"#fff",fontSize:14,fontWeight:800,fontFamily:SANS,boxShadow:`0 4px 20px rgba(108,99,255,.25)`}}>
          Entendido, explorar o app →
        </button>
      </div>
    </div>}

    {/* HEADER */}
    <div style={{padding:"6px 14px 0",position:"relative",zIndex:20,flexShrink:0,transition:"margin-top .3s"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div style={{position:"relative"}}>
          <div onClick={()=>setMenuOpen(v=>!v)} style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",padding:"4px 7px 4px 4px",borderRadius:11,background:menuOpen?"rgba(255,255,255,.06)":"transparent",transition:"background .15s"}}>
            <div style={{width:32,height:32,borderRadius:9,background:"linear-gradient(145deg,#141c2e,#0e1219)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 0 1px rgba(108,99,255,.2),0 4px 16px rgba(108,99,255,.12)"}}><FootStockLogo size={26} rounded={false}/></div>
            <div><div style={{fontSize:14,fontWeight:700,color:"#fff",letterSpacing:"-0.3px",lineHeight:1,fontFamily:SANS,display:"flex",alignItems:"baseline",gap:4}}>FootStock<span style={{fontSize:8,fontWeight:900,color:GOLD,letterSpacing:"2px",fontFamily:SANS}}>BETA</span></div><div style={{fontSize:7,color:"rgba(108,99,255,.8)",fontWeight:600,letterSpacing:"2px",marginTop:1}}>A BOLSA DO FUTEBOL</div></div>
            <span style={{fontSize:9,color:MUTED,transition:"transform .2s",transform:menuOpen?"rotate(180deg)":"rotate(0deg)"}}>▾</span>
          </div>
          {menuOpen&&<LogoDropdown user={user} onProfile={()=>{setShowProfile(true);setMenuOpen(false);}} onAdmin={()=>{setShowAdmin(true);setMenuOpen(false);}} onExit={onExit} onClose={()=>setMenuOpen(false)}/>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          {/* Sessão de mercado */}
          <div style={{background:marketSession.bg,border:`1px solid ${marketSession.border}`,borderRadius:20,padding:"3px 9px",display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:5,height:5,borderRadius:"50%",background:marketSession.color,boxShadow:marketSession.id!=="closed"?`0 0 8px ${marketSession.color}90`:"none",flexShrink:0}}/>
            <span style={{fontSize:7,fontWeight:900,color:marketSession.color,fontFamily:SANS,letterSpacing:"0.5px"}}>{marketSession.short}</span>
          </div>
          {(()=>{
            const daysLeft=planDue?Math.ceil((planDue-new Date())/(1000*60*60*24)):null;
            const expiring=daysLeft!=null&&daysLeft>=0&&daysLeft<=5&&userPlan!=="Jogador";
            if(isSuspended) return <div style={{background:"rgba(244,63,94,.18)",border:"1px solid rgba(244,63,94,.4)",borderRadius:20,padding:"3px 9px",fontSize:8,fontWeight:800,color:RED,fontFamily:SANS}}>🔴 SUSPENSO</div>;
            if(expiring) return <div style={{background:"rgba(245,158,11,.15)",border:"1px solid rgba(245,158,11,.4)",borderRadius:20,padding:"3px 9px",fontSize:8,fontWeight:800,color:GOLD,fontFamily:SANS}}>⚠ {daysLeft===0?"vence hoje":`${daysLeft}d`}</div>;
            return <div style={{background:userPlan==="Lenda"?"linear-gradient(135deg,#f5a623,#e8830a)":userPlan==="Craque"?"linear-gradient(135deg,#6c63ff,#38bdf8)":"linear-gradient(135deg,#475569,#334155)",borderRadius:20,padding:"3px 9px",fontSize:8,fontWeight:800,color:userPlan==="Lenda"?"#1a0800":userPlan==="Craque"?"#062011":"#fff",fontFamily:SANS}}>{userPlan==="Lenda"?"👑":userPlan==="Craque"?"⭐":"⚡"} {userPlan.toUpperCase()}</div>;
          })()}
          <Avatar user={user} size={28} fontSize={10}/>
        </div>
      </div>
      {/* BANNER PUBLICITÁRIO */}
      {(()=>{
        const ads=[
          {bg:"linear-gradient(135deg,#1a1a2e,#16213e)",border:"rgba(108,99,255,.3)",
           label:"PATROCINADO",labelColor:ACCENT,
           logo:"🏦",logoBg:"rgba(108,99,255,.15)",
           title:"Nubank Invest",subtitle:"Invista com zero taxa operacional",
           cta:"Abrir conta grátis",ctaBg:ACCENT,ctaColor:"#000"},
          {bg:"linear-gradient(135deg,#1a0033,#2d0052)",border:"rgba(162,89,255,.3)",
           label:"PATROCINADO",labelColor:"#a259ff",
           logo:"🎓",logoBg:"rgba(162,89,255,.15)",
           title:"Udemy",subtitle:"Cursos de finanças e mercado financeiro",
           cta:"Ver cursos",ctaBg:"#a259ff",ctaColor:"#fff"},
          {bg:"linear-gradient(135deg,#001a2e,#00264d)",border:"rgba(14,165,233,.3)",
           label:"PATROCINADO",labelColor:ACCENT2,
           logo:"📱",logoBlg:"rgba(14,165,233,.15)",
           title:"Inter Shop",subtitle:"Cashback de 5% em todas as compras",
           cta:"Conhecer",ctaBg:ACCENT2,ctaColor:"#000"},
        ];
        const ad=ads[adIdx%ads.length];
        return (
          <div style={{background:ad.bg,border:`1px solid ${ad.border}`,borderRadius:10,padding:"7px 10px",marginBottom:6,display:"flex",alignItems:"center",gap:9,position:"relative",overflow:"hidden",cursor:"pointer",minHeight:46}}>
            {/* shimmer stripe */}
            <div style={{position:"absolute",top:0,left:"-100%",width:"60%",height:"100%",background:"linear-gradient(90deg,transparent,rgba(255,255,255,.04),transparent)",animation:"shimmer 3s infinite",pointerEvents:"none"}}/>
            {/* logo */}
            <div style={{width:32,height:32,borderRadius:8,background:`${ad.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{ad.logo}</div>
            {/* texto */}
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:7,color:ad.labelColor,fontWeight:800,letterSpacing:"1px",fontFamily:SANS,marginBottom:1}}>{ad.label}</div>
              <div style={{fontSize:10,fontWeight:800,color:"#fff",fontFamily:SANS,lineHeight:1.2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ad.title}</div>
              <div style={{fontSize:8,color:MUTED,fontFamily:SANS,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ad.subtitle}</div>
            </div>
            {/* CTA */}
            <div style={{background:ad.ctaBg,borderRadius:7,padding:"4px 8px",fontSize:8,fontWeight:900,color:ad.ctaColor,fontFamily:SANS,flexShrink:0,whiteSpace:"nowrap"}}>{ad.cta}</div>
            {/* dots indicator */}
            <div style={{position:"absolute",bottom:3,left:"50%",transform:"translateX(-50%)",display:"flex",gap:3}}>
              {ads.map((_,i)=><div key={i} style={{width:i===adIdx?10:4,height:3,borderRadius:2,background:i===adIdx?ad.labelColor:"rgba(255,255,255,.2)",transition:"all .3s"}}/>)}
            </div>
          </div>
        );
      })()}

      {/* TICKER DE NOTÍCIAS — linha compacta abaixo do banner */}
      {(news||newsLog[0])&&(()=>{
        const n=news||newsLog[0];
        return <div onClick={()=>setShowNews(true)} style={{background:"rgba(255,255,255,.04)",border:`1px solid ${n.sent>=0?"rgba(108,99,255,.25)":"rgba(244,63,94,.25)"}`,borderRadius:9,padding:"4px 10px",marginBottom:7,display:"flex",alignItems:"center",gap:6,overflow:"hidden",cursor:"pointer",transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=".8"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
          <span style={{fontSize:10,flexShrink:0}}>{n.emoji}</span>
          <span style={{fontSize:8,fontWeight:600,color:n.sent>=0?ACCENT:RED,fontFamily:MONO,flexShrink:0,whiteSpace:"nowrap"}}>{n.ticker} {n.sent>=0?"▲":"▼"}{Math.abs(n.pct).toFixed(2)}%</span>
          {news&&<span style={{fontSize:8,color:"#8899b0",fontFamily:SANS,flexShrink:0,whiteSpace:"nowrap"}}>AO VIVO</span>}
          <span style={{fontSize:8,color:MUTED,fontFamily:SANS,flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{n.headline}</span>
          <span style={{fontSize:8,color:MUTED,flexShrink:0,opacity:.5}}>›</span>
        </div>;
      })()}
      <div style={{display:"flex",gap:1,background:"rgba(255,255,255,.04)",borderRadius:10,padding:"3px",marginBottom:2,border:`1px solid ${BORDER}`}}>
        {getTabsForUser(user).map(t=><button key={t} onClick={()=>{if(t==="Notícias"){setShowNews(true);}else{setShowNews(false);setTab(t);setClub(null);}}} style={pill(t==="Notícias"?showNews:tab===t&&!showNews)}>{t}</button>)}
      </div>
    </div>

    {/* CONTENT */}
    <div style={{flex:1,overflowY:"auto",padding:"10px 14px",position:"relative",zIndex:1}}>

      {/* ══════════════════════════════════════════
          ── DASHBOARD ──
      ══════════════════════════════════════════ */}
      {/* Banner de aviso de vencimento próximo */}
      {(()=>{
        if(!planDue||userPlan==="Jogador") return null;
        const daysLeft=Math.ceil((planDue-new Date())/(1000*60*60*24));
        if(daysLeft>5||daysLeft<0) return null;
        const planCol=userPlan==="Lenda"?GOLD:ACCENT;
        return <div style={{margin:"0 14px 10px",background:"rgba(245,158,11,.08)",border:"1px solid rgba(245,158,11,.3)",borderRadius:12,padding:"10px 13px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <span style={{fontSize:18,flexShrink:0}}>⚠️</span>
          <div style={{flex:1}}>
            <div style={{fontSize:11,fontWeight:800,color:GOLD,fontFamily:SANS,marginBottom:2}}>
              {daysLeft===0?"Sua assinatura vence hoje!":`Sua assinatura vence em ${daysLeft} dia${daysLeft!==1?"s":""}`}
            </div>
            <div style={{fontSize:9,color:"rgba(255,255,255,.45)",fontFamily:SANS}}>Renove para não perder acesso às operações.</div>
          </div>
          <button onClick={()=>onUpgrade&&onUpgrade(userPlan,userPlan,(plan,bil)=>applyUpgrade(plan==="craque"?"Craque":"Lenda",bil||planBillingCycle))}
            style={{background:`linear-gradient(135deg,${planCol},${userPlan==="Lenda"?"#e8830a":ACCENT2})`,border:"none",borderRadius:9,padding:"7px 11px",fontSize:10,fontWeight:800,color:BG,fontFamily:SANS,cursor:"pointer",flexShrink:0}}>
            Renovar
          </button>
        </div>;
      })()}
      {tab==="Dashboard"&&(()=>{
        // Filtra pontos pelo período selecionado
        const PERIOD_MS={"1H":3600e3,"12H":43200e3,"24H":86400e3,"7D":604800e3,"30D":2592000e3,"1A":31536000e3,"TOTAL":Infinity};
        const cutoff=dashPeriod==="TOTAL"?0:Date.now()-PERIOD_MS[dashPeriod];
        const filtered=dashPoints.filter(p=>p.ts>=cutoff);
        const dashData=filtered.length>=2?filtered.map(p=>p.value):[initialBalance,initialBalance];
        const hasData=dashPoints.length>1;
        const dashCurrent=dashData[dashData.length-1];
        const dashFirst=dashData[0];
        const dashDiff=dashCurrent-dashFirst;
        const dashPct=dashFirst>0?(dashDiff/dashFirst)*100:0;
        const isUp=dashDiff>=0;
        const chartColor=isUp?ACCENT:RED;
        const DASH_PERIOD_LABELS={"1H":"1h","12H":"12h","24H":"24h","7D":"7 dias","30D":"30 dias","1A":"1 ano","TOTAL":"Total"};

        // Posições reais da carteira
        const portE=portEntries;
        const portV=portE.reduce((s,p)=>s+p.qty*(prices[p.ticker]||p.price),0);
        const portI=portE.reduce((s,p)=>s+p.invested,0);
        const portPL=portV-portI;
        const portPLpct=portI>0?(portPL/portI)*100:0;
        const patrimonio=balance+portV;

        return <>
          {/* ── PATRIMÔNIO HERO ── */}
          <div style={{background:"linear-gradient(135deg,rgba(108,99,255,.08),rgba(56,189,248,.04))",border:"1px solid rgba(108,99,255,.15)",borderRadius:20,padding:"16px 16px 14px",marginBottom:10,position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:-50,right:-50,width:150,height:150,background:"radial-gradient(circle,rgba(108,99,255,.08),transparent 70%)",borderRadius:"50%",pointerEvents:"none"}}/>
            <div style={{fontSize:9,color:"rgba(255,255,255,.55)",fontWeight:600,letterSpacing:"1.5px",marginBottom:5,fontFamily:SANS}}>PATRIMÔNIO TOTAL</div>
            <div style={{fontSize:28,fontWeight:800,color:"#fff",letterSpacing:"-1.5px",fontFamily:MONO,marginBottom:5}}>
              FS${patrimonio.toLocaleString("pt-BR",{minimumFractionDigits:2})}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:10,fontWeight:800,color:hasData&&dashDiff!==0?(isUp?ACCENT:RED):MUTED,fontFamily:MONO,background:hasData&&dashDiff!==0?(isUp?"rgba(108,99,255,.12)":"rgba(244,63,94,.1)"):"rgba(100,116,139,.08)",border:`1px solid ${hasData&&dashDiff!==0?(isUp?"rgba(108,99,255,.35)":"rgba(244,63,94,.25)"):"rgba(100,116,139,.2)"}`,borderRadius:8,padding:"2px 7px"}}>
                {hasData&&dashDiff!==0?(isUp?"▲ +":"▼ ")+Math.abs(dashDiff).toLocaleString("pt-BR",{minimumFractionDigits:2})+" ("+(dashPct>0?"+":"")+dashPct.toFixed(2)+"%)":"— Sem variação no período"}
              </span>
              {hasData&&<span style={{fontSize:9,color:MUTED,fontFamily:SANS}}>Últimos {DASH_PERIOD_LABELS[dashPeriod]}</span>}
            </div>
          </div>

          {/* ── SALDO + INVESTIDO ── */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:8}}>
            {/* Saldo livre */}
            <div style={{...cd,padding:"12px 13px",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",bottom:-8,right:-8,width:50,height:50,background:"radial-gradient(circle,rgba(108,99,255,.1),transparent)",borderRadius:"50%"}}/>
              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}>
                <div style={{width:20,height:20,borderRadius:6,background:"rgba(108,99,255,.12)",border:"1px solid rgba(108,99,255,.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10}}>💵</div>
                <span style={{fontSize:8,fontWeight:600,color:ACCENT,letterSpacing:"0.5px",fontFamily:SANS}}>SALDO LIVRE</span>
              </div>
              <div style={{fontSize:14,fontWeight:900,color:"#fff",fontFamily:MONO,marginBottom:2}}>
                FS${balance.toLocaleString("pt-BR",{minimumFractionDigits:2})}
              </div>
              <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginBottom:6}}>Disponível p/ investir</div>
              <div style={{height:3,borderRadius:2,background:BORDER,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${patrimonio>0?(balance/patrimonio*100).toFixed(0):100}%`,background:"linear-gradient(90deg,#6c63ff,#38bdf8)",borderRadius:2,transition:"width .5s"}}/>
              </div>
              <div style={{fontSize:7,color:MUTED,marginTop:3,fontFamily:SANS}}>{patrimonio>0?(balance/patrimonio*100).toFixed(1):100}% do patrimônio</div>
            </div>

            {/* Total investido */}
            <div style={{...cd,padding:"12px 13px",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",bottom:-8,right:-8,width:50,height:50,background:"radial-gradient(circle,rgba(14,165,233,.1),transparent)",borderRadius:"50%"}}/>
              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}>
                <div style={{width:20,height:20,borderRadius:6,background:"rgba(14,165,233,.12)",border:"1px solid rgba(14,165,233,.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10}}>📊</div>
                <span style={{fontSize:7,fontWeight:800,color:ACCENT2,letterSpacing:"0.8px",fontFamily:SANS}}>INVESTIDO</span>
              </div>
              <div style={{fontSize:14,fontWeight:900,color:"#fff",fontFamily:MONO,marginBottom:2}}>
                FS${portI>0?portI.toLocaleString("pt-BR",{minimumFractionDigits:2}):"—"}
              </div>
              <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginBottom:6}}>{portE.length>0?`Em ${portE.length} ativo${portE.length>1?"s":""}` :"Nenhum ativo ainda"}</div>
              <div style={{height:3,borderRadius:2,background:BORDER,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${patrimonio>0&&portI>0?(portI/patrimonio*100).toFixed(0):0}%`,background:`linear-gradient(90deg,${ACCENT2},#0284c7)`,borderRadius:2,transition:"width .5s"}}/>
              </div>
              <div style={{fontSize:7,color:MUTED,marginTop:3,fontFamily:SANS}}>{patrimonio>0&&portI>0?(portI/patrimonio*100).toFixed(1):0}% do patrimônio</div>
            </div>
          </div>

          {/* ── RENTABILIDADE TOTAL ── */}
          <div style={{background:portPL>=0?"linear-gradient(135deg,rgba(108,99,255,.07),rgba(108,99,255,.02))":"linear-gradient(135deg,rgba(244,63,94,.07),rgba(244,63,94,.02))",border:`1px solid ${portPL>=0?"rgba(108,99,255,.2)":"rgba(244,63,94,.2)"}`,borderRadius:16,padding:"12px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:12}}>
            {/* Gauge mini circular */}
            {(()=>{
              const clampPct=Math.max(-100,Math.min(100,portPLpct));
              const norm=(clampPct+100)/200;
              const r=22,cx=28,cy=28;
              const sa=-210*(Math.PI/180),sw=240*(Math.PI/180);
              const ae=a=>({x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)});
              const S=ae(sa),E=ae(sa+sw),FE=ae(sa+norm*sw);
              const lA=norm>0.5?1:0;
              const gCol=portPL>=0?ACCENT:RED;
              return <svg width="56" height="50" viewBox="0 0 56 50" flexShrink="0">
                <defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={RED}/><stop offset="50%" stopColor={GOLD}/><stop offset="100%" stopColor={ACCENT}/></linearGradient></defs>
                <path d={`M ${S.x} ${S.y} A ${r} ${r} 0 1 1 ${E.x} ${E.y}`} fill="none" stroke={BORDER} strokeWidth="4" strokeLinecap="round"/>
                {norm>0&&<path d={`M ${S.x} ${S.y} A ${r} ${r} 0 ${lA} 1 ${FE.x} ${FE.y}`} fill="none" stroke="url(#gg)" strokeWidth="4" strokeLinecap="round"/>}
                <circle cx={FE.x} cy={FE.y} r="3.5" fill={gCol} stroke={BG} strokeWidth="1.5"/>
                <text x={cx} y={cy-1} textAnchor="middle" fontSize="8" fontFamily={MONO} fontWeight="900" fill={gCol}>{portPLpct>0?"+":""}{portPLpct.toFixed(1)}%</text>
                <text x={cx} y={cy+9} textAnchor="middle" fontSize="5.5" fontFamily={SANS} fontWeight="700" fill={MUTED} letterSpacing="0.3">RENT.</text>
              </svg>;
            })()}
            <div style={{flex:1}}>
              <div style={{fontSize:8,fontWeight:800,color:portPL>=0?ACCENT:RED,letterSpacing:"1px",marginBottom:3,fontFamily:SANS}}>RENTABILIDADE TOTAL</div>
              <div style={{fontSize:18,fontWeight:900,color:portPL>=0?ACCENT:RED,fontFamily:MONO,letterSpacing:"-0.5px",marginBottom:4}}>
                {portI>0?(portPL>=0?"+":"")+"FS$"+Math.abs(portPL).toLocaleString("pt-BR",{minimumFractionDigits:2}):"—"}
              </div>
              <div style={{display:"flex",gap:10}}>
                <div><div style={{fontSize:7,color:MUTED,marginBottom:1}}>CUSTO MÉDIO</div><div style={{fontSize:9,fontWeight:700,color:"#fff",fontFamily:MONO}}>{portI>0?"FS$"+portI.toLocaleString("pt-BR",{minimumFractionDigits:2}):"—"}</div></div>
                <div><div style={{fontSize:7,color:MUTED,marginBottom:1}}>VALOR ATUAL</div><div style={{fontSize:9,fontWeight:700,color:"#fff",fontFamily:MONO}}>{portV>0?"FS$"+portV.toLocaleString("pt-BR",{minimumFractionDigits:2}):"—"}</div></div>
              </div>
            </div>
          </div>

          {/* ── GRÁFICO ── */}
          <div style={{...cd,overflow:"hidden",marginBottom:10}}>
            {/* Chart header */}
            <div style={{padding:"10px 12px 7px",display:"flex",alignItems:"flex-start",justifyContent:"space-between",borderBottom:`1px solid ${BORDER}`}}>
              <div>
                <div style={{fontSize:8,color:MUTED,fontWeight:800,letterSpacing:"1px",marginBottom:2,fontFamily:SANS}}>EVOLUÇÃO DA CARTEIRA</div>
                <div style={{fontSize:14,fontWeight:900,color:"#fff",fontFamily:MONO}}>
                  {`FS$${dashCurrent.toLocaleString("pt-BR",{minimumFractionDigits:2})}`}
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                {hasData&&dashDiff!==0?<>
                  <div style={{fontSize:11,fontWeight:800,color:chartColor,fontFamily:MONO}}>{isUp?"▲ +":"▼ "}{Math.abs(dashDiff).toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
                  <div style={{fontSize:10,color:chartColor,fontFamily:MONO,opacity:.8}}>{dashPct>0?"+":""}{dashPct.toFixed(2)}%</div>
                </>:<div style={{fontSize:9,color:MUTED,fontFamily:SANS,textAlign:"right",marginTop:2}}>{hasData?"Sem variação no período":"0,00%"}</div>}
              </div>
            </div>
            {/* Chart body */}
            <div key={dashAnimKey} style={{padding:"6px 0 2px",animation:"fadeIn .3s ease"}}>
              <DashChart data={dashData} color={chartColor} width={340} height={155}/>
            </div>
            {/* Period selector */}
            <div style={{display:"flex",justifyContent:"space-between",padding:"4px 8px 10px",gap:3}}>
              {Object.keys(DASH_PERIODS).map(p=>{
                const active=p===dashPeriod;
                return <button key={p} onClick={()=>{setDashPeriod(p);setDashAnimKey(k=>k+1);}} style={{flex:1,background:active?"rgba(108,99,255,.12)":"transparent",border:`1px solid ${active?"rgba(108,99,255,.4)":"transparent"}`,borderRadius:8,padding:"5px 2px",fontSize:9,fontWeight:active?900:600,color:active?ACCENT:MUTED,fontFamily:SANS,cursor:"pointer",transition:"all .18s",letterSpacing:p==="TOTAL"?"-0.2px":"0"}}>
                  {p}
                </button>;
              })}
            </div>
          </div>

          {/* ── POSIÇÕES / TOP AÇÕES ── */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <div style={{fontSize:8,fontWeight:800,color:MUTED,letterSpacing:"1.5px",fontFamily:SANS}}>
              {portE.length>0?"MINHAS POSIÇÕES":"DESTAQUES DO MERCADO"}
            </div>
            {portE.length>0&&<button onClick={()=>{setTab("Carteira");setClub(null);}} style={{background:"none",border:`1px solid ${BORDER}`,borderRadius:20,padding:"3px 9px",fontSize:8,fontWeight:700,color:ACCENT2,cursor:"pointer",fontFamily:SANS}}>Ver carteira →</button>}
          </div>

          {/* Se carteira VAZIA → mostra top 5 do mercado como sugestão */}
          {portE.length===0&&<>
            {CLUBS.slice(0,5).map((c,i)=>{
              const curP=prices[c.ticker]||c.price;
              const p=(()=>{const b=c.price||1;return +(((curP)-b)/b*100).toFixed(2);})();
              const isUp2=p>=0;
              return <div key={c.ticker} style={{...cd,padding:"9px 11px",marginBottom:6,display:"flex",alignItems:"center",gap:9,cursor:"pointer",transition:"border-color .2s",animation:`fadeIn .3s ease ${i*.05}s both`}}
                onClick={()=>{setTab("Mercado");setClub(c);}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=ACCENT}
                onMouseLeave={e=>e.currentTarget.style.borderColor=BORDER}>
                <div style={{width:36,height:36,borderRadius:10,flexShrink:0,background:`linear-gradient(145deg,${c.color},${c.color}99)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:900,color:c.c2,boxShadow:`0 2px 10px ${c.color}30`}}>{c.ticker.replace(/\d/g,"")}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}>
                    <span style={{fontSize:11,fontWeight:800,color:"#fff",fontFamily:SANS}}>{c.ticker}</span>
                    <span style={{fontSize:8,color:MUTED,fontFamily:SANS}}>{c.name}</span>
                  </div>
                  <div style={{fontSize:8,color:MUTED,fontFamily:SANS}}>Rec: {c.revenueLabel} · EV {c.evMult}×</div>
                </div>
                <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
                  <MiniSpark2 up={isUp2} w={50} h={18} seed={i+1}/>
                  <div style={{fontSize:12,fontWeight:900,color:"#fff",fontFamily:MONO}}>FS${curP.toFixed(2)}</div>
                  <div style={{fontSize:10,fontWeight:800,color:isUp2?ACCENT:RED,fontFamily:MONO}}>{isUp2?"▲ +":"▼ "}{Math.abs(p).toFixed(2)}%</div>
                </div>
              </div>;
            })}
          </>}

          {/* Se carteira COM POSIÇÕES → mostra posições reais */}
          {portE.length>0&&<>
            {portE.map((p,i)=>{
              const curr=p.qty*(prices[p.ticker]||p.price);
              const pl=curr-p.invested,plp=(pl/p.invested)*100;
              const isPos=pl>=0;
              return <div key={p.ticker} style={{...cd,padding:"10px 11px",marginBottom:6,cursor:"pointer",transition:"border-color .2s",animation:`fadeIn .3s ease ${i*.05}s both`}}
                onClick={()=>{setTab("Mercado");setClub(p);}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=isPos?"rgba(108,99,255,.35)":"rgba(244,63,94,.35)"}
                onMouseLeave={e=>e.currentTarget.style.borderColor=BORDER}>
                <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:6}}>
                  <div style={{width:36,height:36,borderRadius:10,background:`linear-gradient(145deg,${p.color},${p.color}80)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:900,color:p.c2,flexShrink:0,boxShadow:`0 2px 10px ${p.color}30`}}>{p.ticker.replace(/\d/g,"")}</div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}>
                      <span style={{fontSize:11,fontWeight:800,color:"#fff",fontFamily:SANS}}>{p.ticker}</span>
                      <span style={{fontSize:7,fontWeight:700,color:MUTED,background:SURFACE,borderRadius:4,padding:"1px 5px",fontFamily:SANS}}>{p.qty} cotas</span>
                    </div>
                    <div style={{fontSize:8,color:MUTED,fontFamily:SANS}}>PM FS${p.avg.toFixed(2)} · Atual FS${(prices[p.ticker]||p.price).toFixed(2)}</div>
                  </div>
                  <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
                    <MiniSpark2 up={isPos} w={50} h={18} seed={i+10}/>
                    <div style={{fontSize:12,fontWeight:900,color:"#fff",fontFamily:MONO}}>FS${curr.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
                    <div style={{fontSize:10,fontWeight:800,color:isPos?ACCENT:RED,fontFamily:MONO}}>{isPos?"+":""}{plp.toFixed(2)}%</div>
                  </div>
                </div>
                <div style={{height:3,borderRadius:2,background:BORDER,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.min(100,Math.abs(plp)*4)}%`,background:isPos?`linear-gradient(90deg,${ACCENT},#7c75ff)`:`linear-gradient(90deg,${RED},#ff6080)`,borderRadius:2,transition:"width .6s ease"}}/>
                </div>
              </div>;
            })}
          </>}

          {/* ── CTA INVESTIR AGORA ── */}
          <div style={{marginTop:14,marginBottom:4}}>
            <button
              onClick={()=>{setTab("Mercado");setClub(null);}}
              style={{width:"100%",padding:"15px",borderRadius:16,border:"none",cursor:"pointer",
                background:"linear-gradient(135deg,#6c63ff,#38bdf8)",
                color:BG,fontSize:14,fontWeight:800,fontFamily:SANS,
                display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                boxShadow:"0 8px 32px rgba(108,99,255,.25)",
                transition:"all .2s",
                letterSpacing:"-0.2px",
              }}
              onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.02)";e.currentTarget.style.boxShadow="0 12px 40px rgba(108,99,255,.4)";}}
              onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow="0 8px 32px rgba(108,99,255,.25)";}}
            >
              <span style={{fontSize:18}}>⚡</span>
              {portE.length===0?"Comece a investir agora":"Investir mais agora"}
              <span style={{fontSize:14,opacity:.8}}>→</span>
            </button>
            {portE.length===0&&<div style={{textAlign:"center",marginTop:8,fontSize:9,color:MUTED,fontFamily:SANS}}>
              Saldo disponível: <span style={{color:ACCENT,fontWeight:800,fontFamily:MONO}}>FS${balance.toLocaleString("pt-BR",{minimumFractionDigits:2})}</span>
            </div>}
          </div>
        </>;
      })()}

      {/* ── MERCADO ── */}
      {tab==="Mercado"&&!club&&<>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:12}}>
          {[{ico:"📊",val:"R$12.4M",lbl:"Vol. 24h"},{ico:"📈",val:`${CLUBS.filter(c=>pct(c.ticker)>0).length}/${CLUBS.length}`,lbl:"Altas agora"},{ico:"🔥",val:(()=>{const t=[...CLUBS].sort((a,b)=>pct(b.ticker)-pct(a.ticker))[0];return`${t.ticker} ${pct(t.ticker)>0?"+":""}${pct(t.ticker).toFixed(1)}%`;})(),lbl:"Destaque IA"}].map(s=><div key={s.lbl} style={{...cd,padding:"9px 7px"}}><div style={{fontSize:13,marginBottom:3}}>{s.ico}</div><div style={{fontSize:10,fontWeight:800,color:"#fff",lineHeight:1.2,fontFamily:SANS}}>{s.val}</div><div style={{fontSize:7,color:MUTED,marginTop:2}}>{s.lbl}</div></div>)}
        </div>
        <div style={{display:"flex",gap:5,marginBottom:10}}>
          {["Todos","Alta","Baixa"].map(f=><button key={f} onClick={()=>setFilter(f)} style={{...pill(filter===f),fontSize:9,padding:"4px 10px"}}>{f}</button>)}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:5}}>
          {filtered.map(c=>{
            const p=pct(c.ticker),isCB=cb[c.ticker],curP=prices[c.ticker]||c.price,imbV=imb[c.ticker]||0;
            const ob=book[c.ticker]||{bid:curP,ask:curP};
            const isFav=c.ticker===user?.favoriteTeam;
            return <div key={c.ticker} onClick={()=>setClub(c)} style={{...cd,padding:"9px 11px",cursor:"pointer",display:"grid",gridTemplateColumns:"36px 1fr auto 72px",gap:7,alignItems:"center",transition:"border-color .2s",borderColor:isFav?"rgba(245,166,35,.45)":news?.ticker===c.ticker?(news.sent>=0?"rgba(108,99,255,.5)":"rgba(244,63,94,.4)"):BORDER,background:isFav?"rgba(245,166,35,.04)":CARD}} onMouseEnter={e=>e.currentTarget.style.borderColor=isFav?GOLD:ACCENT} onMouseLeave={e=>e.currentTarget.style.borderColor=isFav?"rgba(245,166,35,.45)":BORDER}>
              <div style={{width:36,height:36,borderRadius:9,background:`linear-gradient(145deg,${c.color},${c.color}99)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:900,color:c.c2,textAlign:"center",lineHeight:1.1}}>{c.ticker.replace(/\d/g,"")}</div>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:2}}>
                  <span style={{fontSize:11,fontWeight:800,color:"#fff",fontFamily:SANS}}>{c.ticker}</span>
                  {isFav&&<span style={{fontSize:11,lineHeight:1}} title="Seu time de coração">⭐</span>}
                  {isCB&&<span style={{fontSize:6,background:"rgba(245,166,35,.2)",color:GOLD,padding:"1px 4px",borderRadius:3,fontWeight:800}}>🔒LE</span>}
                  {Math.abs(imbV)>0.3&&<span style={{fontSize:6,color:imbV>0?ACCENT:RED,fontWeight:800}}>{imbV>0?"▲":"▼"}</span>}
                </div>
                {/* OFI bar */}
                <div style={{display:"flex",alignItems:"center",gap:3,marginBottom:2}}>
                  <div style={{width:36,height:3,borderRadius:2,background:BORDER,overflow:"hidden",position:"relative"}}>
                    <div style={{position:"absolute",left:"50%",top:0,bottom:0,width:1,background:"#2a3348"}}/>
                    {imbV>=0?<div style={{position:"absolute",left:"50%",top:0,bottom:0,width:`${imbV*50}%`,background:ACCENT,transition:"width .4s"}}/>:<div style={{position:"absolute",right:"50%",top:0,bottom:0,width:`${Math.abs(imbV)*50}%`,background:RED,transition:"width .4s"}}/>}
                  </div>
                  <span style={{fontSize:7,color:MUTED,fontFamily:MONO}}>{ob.bid.toFixed(2)}</span>
                </div>
                {/* Supply bar */}
                {(()=>{const sup=supply[c.ticker]||0,tot=c.totalShares||1,supPct=sup/tot;const supCol=supPct<0.05?RED:supPct<0.2?GOLD:BORDER;return <div style={{display:"flex",alignItems:"center",gap:3}}><div style={{width:36,height:2,borderRadius:1,background:BORDER,overflow:"hidden"}}><div style={{height:"100%",width:`${supPct*100}%`,background:supPct<0.05?RED:supPct<0.2?GOLD:ACCENT,transition:"width .5s"}}/></div><span style={{fontSize:6,color:supCol,fontFamily:MONO}}>{sup<1000?"ESGOT":sup<1e6?(sup/1000).toFixed(0)+"k":(sup/1e6).toFixed(1)+"M"}</span></div>;})()}
              </div>
              <Spark up={p>=0}/>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:12,fontWeight:800,color:"#fff",fontFamily:MONO}}>FS${curP.toFixed(2)}</div>
                <div style={{display:"flex",alignItems:"center",gap:3}}>
                  <span style={{fontSize:7,color:"rgba(255,255,255,.45)",fontFamily:SANS}}>hoje</span>
                  <span style={{fontSize:10,fontWeight:700,color:p>=0?ACCENT:RED,fontFamily:MONO}}>{p>=0?"▲":""}{p.toFixed(2)}%</span>
                </div>
              </div>
            </div>;
          })}
        </div>
      </>}

      {/* ── DETALHE CLUBE ── */}
      {tab==="Mercado"&&club&&<>
        <button onClick={()=>setClub(null)} style={{background:"none",border:"none",color:MUTED,fontSize:11,cursor:"pointer",fontFamily:SANS,fontWeight:700,marginBottom:10,padding:0}}>← Mercado</button>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <div style={{width:46,height:46,borderRadius:13,background:`linear-gradient(145deg,${club.color},${club.color}99)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:club.c2}}>{club.ticker.replace(/\d/g,"")}</div>
          <div style={{flex:1}}><div style={{fontSize:18,fontWeight:800,color:"#fff",fontFamily:SANS}}>{club.ticker}</div><div style={{fontSize:10,color:MUTED,fontFamily:SANS}}>{club.name} · Série {club.div}</div></div>
          <div style={{textAlign:"right"}}>
                <div style={{fontSize:19,fontWeight:900,color:"#fff",fontFamily:MONO}}>FS${(prices[club.ticker]||club.price).toFixed(2)}</div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4}}>
                  <span style={{fontSize:9,color:"rgba(255,255,255,.5)",fontFamily:SANS}}>hoje</span>
                  <span style={{fontSize:11,fontWeight:700,color:pct(club.ticker)>=0?ACCENT:RED,fontFamily:MONO}}>{pct(club.ticker)>=0?"▲":""}{pct(club.ticker).toFixed(2)}%</span>
                </div>
                <div style={{fontSize:8,color:"rgba(255,255,255,.5)",fontFamily:MONO}}>abert. FS${(openPrices[club.ticker]||club.price).toFixed(2)}</div>
              </div>
        </div>
        {/* CANDLE */}
        <div style={{...cd,padding:"10px 8px",marginBottom:10}} onClick={()=>showCompareDropdown&&setShowCompareDropdown(false)}>
          {/* Linha 1: título + badges + toggle modo */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 6px",marginBottom:6}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:9,fontWeight:700,color:"#a8b8cc"}}>
                {compareClubs.length>0?"COMPARAÇÃO NORMALIZADA":chartMode==="line"?"LINHA · PREÇO":"OHLC · CANDLE"}
              </span>
              {activeIndicators.length>0&&!compareClubs.length&&<span style={{fontSize:7,background:"rgba(14,165,233,.2)",color:ACCENT2,borderRadius:5,padding:"1px 6px",fontWeight:800}}>{activeIndicators.length} IND</span>}
              {compareClubs.length>0&&<span style={{fontSize:7,background:"rgba(139,92,246,.2)",color:"#a78bfa",borderRadius:5,padding:"1px 6px",fontWeight:800}}>{compareClubs.length+1} ativos</span>}
            </div>
            {/* Toggle candle/linha */}
            <div style={{display:"flex",background:SURFACE,borderRadius:8,border:`1px solid ${BORDER}`,overflow:"hidden"}}>
              {[{id:"candle",ico:"🕯"},{id:"line",ico:"📈"}].map(m=>(
                <button key={m.id} onClick={()=>{setChartMode(m.id);if(m.id==="candle")setCompareClubs([]);}} style={{padding:"3px 8px",border:"none",cursor:"pointer",background:chartMode===m.id&&!compareClubs.length?ACCENT:"transparent",color:chartMode===m.id&&!compareClubs.length?BG:MUTED,fontSize:11,fontWeight:800,transition:"all .15s"}}>
                  {m.ico}
                </button>
              ))}
            </div>
          </div>

          {/* Linha 2: períodos + Indicadores + Comparar + Book */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 6px",marginBottom:7,gap:6}}>
            <div style={{display:"flex",gap:5}}>{["1H","1D","1S","1M"].map(p=><button key={p} onClick={()=>setPeriod(p)} style={{background:"none",border:"none",cursor:"pointer",fontSize:9,fontWeight:700,color:period===p?ACCENT:MUTED,padding:0}}>{p}</button>)}</div>
            <div style={{display:"flex",gap:5,alignItems:"center"}}>
              <button onClick={()=>{setShowIndicatorPanel(v=>!v);setShowCompareDropdown(false);setShowBookPanel(false);}} style={{background:showIndicatorPanel?"rgba(14,165,233,.2)":"rgba(255,255,255,.06)",border:`1px solid ${showIndicatorPanel?ACCENT2:BORDER}`,borderRadius:8,padding:"3px 7px",cursor:"pointer",fontSize:8,fontWeight:800,color:showIndicatorPanel?ACCENT2:"#a8b8cc",fontFamily:SANS,transition:"all .15s"}}>
                📊 {showIndicatorPanel?"▲":"▼"}
              </button>
              <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
                <button onClick={()=>{setShowCompareDropdown(v=>!v);setShowIndicatorPanel(false);setShowBookPanel(false);}} style={{background:compareClubs.length>0?"rgba(139,92,246,.2)":showCompareDropdown?"rgba(255,255,255,.1)":"rgba(255,255,255,.06)",border:`1px solid ${compareClubs.length>0?"rgba(139,92,246,.5)":showCompareDropdown?BORDER:BORDER}`,borderRadius:8,padding:"3px 7px",cursor:"pointer",fontSize:8,fontWeight:800,color:compareClubs.length>0?"#a78bfa":"#a8b8cc",fontFamily:SANS,transition:"all .15s",display:"flex",alignItems:"center",gap:4}}>
                  ⊕ Comparar {compareClubs.length>0&&<span style={{background:"#7c3aed",color:"#fff",borderRadius:10,padding:"0 4px",fontSize:7}}>{compareClubs.length}</span>}
                </button>
                {/* Dropdown comparar */}
                {showCompareDropdown&&<div style={{position:"absolute",top:"calc(100% + 4px)",right:0,width:190,background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,zIndex:60,boxShadow:"0 8px 32px rgba(0,0,0,.7)",overflow:"hidden"}}>
                  <div style={{padding:"8px 11px 6px",borderBottom:`1px solid ${BORDER}`}}>
                    <div style={{fontSize:9,fontWeight:800,color:"#fff",fontFamily:SANS}}>Comparar ativos</div>
                    <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginTop:1}}>Até 4 adicionais · base 100%</div>
                  </div>
                  {compareClubs.length>0&&<button onClick={()=>setCompareClubs([])} style={{width:"100%",padding:"6px 11px",background:"rgba(244,63,94,.08)",border:"none",borderBottom:`1px solid ${BORDER}`,color:RED,fontSize:8,fontWeight:800,cursor:"pointer",fontFamily:SANS,textAlign:"left"}}>✕ Limpar comparação</button>}
                  <div style={{maxHeight:200,overflowY:"auto"}}>
                    {CLUBS.filter(c=>c.ticker!==club.ticker).map(cl=>{
                      const selected=compareClubs.includes(cl.ticker);
                      const maxReached=compareClubs.length>=4&&!selected;
                      return <div key={cl.ticker} onClick={()=>{if(maxReached)return;setCompareClubs(p=>selected?p.filter(x=>x!==cl.ticker):[...p,cl.ticker]);setChartMode("line");}} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 11px",cursor:maxReached?"not-allowed":"pointer",background:selected?`${cl.color}0d`:"transparent",borderBottom:`1px solid rgba(255,255,255,.04)`,opacity:maxReached?.4:1,transition:"background .1s"}}>
                        <div style={{width:24,height:24,borderRadius:6,background:`linear-gradient(145deg,${cl.color},${cl.color}88)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:900,color:cl.c2,flexShrink:0}}>{cl.ticker.replace(/\d/g,"")}</div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:10,fontWeight:700,color:selected?"#fff":"rgba(255,255,255,.65)",fontFamily:SANS}}>{cl.name}</div>
                          <div style={{fontSize:8,color:MUTED,fontFamily:MONO}}>{cl.ticker}</div>
                        </div>
                        <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${selected?cl.color:BORDER}`,background:selected?cl.color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .15s"}}>
                          {selected&&<span style={{fontSize:8,color:cl.c2||BG,fontWeight:900}}>✓</span>}
                        </div>
                      </div>;
                    })}
                  </div>
                </div>}
              </div>
              {/* Botão Book */}
              <button onClick={()=>{setShowBookPanel(v=>!v);setShowIndicatorPanel(false);setShowCompareDropdown(false);}} style={{background:showBookPanel?"rgba(108,99,255,.15)":"rgba(255,255,255,.06)",border:`1px solid ${showBookPanel?ACCENT:BORDER}`,borderRadius:8,padding:"3px 7px",cursor:"pointer",fontSize:8,fontWeight:800,color:showBookPanel?ACCENT:"#a8b8cc",fontFamily:SANS,transition:"all .15s"}}>
                📖 Book {showBookPanel?"▲":"▼"}
              </button>
            </div>
          </div>

          {/* Painel de Indicadores */}
          {showIndicatorPanel&&<div style={{borderTop:`1px solid ${BORDER}`,padding:"8px 6px 10px",marginBottom:6}}>
            <div style={{fontSize:8,color:MUTED,fontWeight:700,letterSpacing:"1px",fontFamily:SANS,marginBottom:8}}>SELECIONE OS INDICADORES</div>
            {[
              {id:"bb",  label:"Bandas de Bollinger", sub:"Média 20 · Desvio 2σ",       color:ACCENT2, icon:"〰", lenda:false},
              {id:"mm9", label:"Média Móvel 9",        sub:"MM9 · Curto prazo",           color:"#f59e0b",icon:"📉", lenda:true},
              {id:"mm21",label:"Média Móvel 21",       sub:"MM21 · Médio prazo",          color:"#a78bfa",icon:"📈", lenda:true},
            ].map(ind=>{
              const active=activeIndicators.includes(ind.id);
              const locked=ind.lenda&&!isLenda;
              return <div key={ind.id} onClick={()=>{if(locked){setUpgradeModal({targetPlan:"Lenda",feature:"Médias Móveis MM9 e MM21"});return;}setActiveIndicators(p=>active?p.filter(x=>x!==ind.id):[...p,ind.id]);}} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 10px",borderRadius:10,border:`1px solid ${locked?"rgba(245,166,35,.25)":active?ind.color+"66":BORDER}`,background:locked?"rgba(245,166,35,.04)":active?`${ind.color}10`:"rgba(255,255,255,.02)",cursor:"pointer",transition:"all .15s",marginBottom:6,opacity:locked?.75:1}}>
                <span style={{fontSize:16,flexShrink:0}}>{ind.icon}</span>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:11,fontWeight:800,color:locked?"rgba(255,255,255,.4)":active?"#fff":"rgba(255,255,255,.6)",fontFamily:SANS}}>{ind.label}</span>
                    {ind.lenda&&<span style={{fontSize:7,background:isLenda?"rgba(245,166,35,.18)":"rgba(245,166,35,.28)",color:GOLD,borderRadius:4,padding:"1px 5px",fontWeight:800,fontFamily:SANS}}>👑 LENDA</span>}
                  </div>
                  <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginTop:1}}>{locked?"Exclusivo do plano Lenda":ind.sub}</div>
                </div>
                <div style={{width:22,height:22,borderRadius:"50%",border:`2px solid ${locked?GOLD:active?ind.color:BORDER}`,background:locked?"transparent":active?ind.color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .15s"}}>
                  {locked?<span style={{fontSize:10,color:GOLD}}>🔒</span>:active&&<span style={{fontSize:10,color:BG,fontWeight:900}}>✓</span>}
                </div>
              </div>;
            })}
          </div>}

          {/* ── PAINEL BOOK DE OFERTAS ── */}
          {showBookPanel&&(()=>{
            const ob=book[club.ticker]||{bid:prices[club.ticker]||club.price,ask:prices[club.ticker]||club.price};
            const mid=+((ob.bid+ob.ask)/2).toFixed(2);
            const spread=+(ob.ask-ob.bid).toFixed(2);
            const spreadPct=+(spread/mid*100).toFixed(3);
            // Gera níveis de profundidade simulados
            const LEVELS=6;
            const askLevels=Array.from({length:LEVELS},(_,i)=>{
              const px=+(ob.ask+i*spread*0.8).toFixed(2);
              const qty=Math.floor(200+Math.random()*800*(1/(i+1)));
              return {px,qty};
            });
            const bidLevels=Array.from({length:LEVELS},(_,i)=>{
              const px=+(ob.bid-i*spread*0.8).toFixed(2);
              const qty=Math.floor(200+Math.random()*800*(1/(i+1)));
              return {px,qty};
            });
            const maxQty=Math.max(...[...askLevels,...bidLevels].map(l=>l.qty));
            // Time & Sales simulado
            const trades=Array.from({length:8},(_,i)=>({
              px:+(mid+(Math.random()-.5)*spread*2).toFixed(2),
              qty:Math.floor(10+Math.random()*200),
              side:Math.random()>.5?"buy":"sell",
              ago:i*14+Math.floor(Math.random()*10),
            }));
            return <div style={{borderTop:`1px solid ${BORDER}`,marginBottom:8}}>
              {/* Header com spread */}
              <div style={{display:"flex",gap:6,padding:"8px 6px 6px",alignItems:"center"}}>
                <div style={{flex:1,background:"rgba(244,63,94,.07)",border:"1px solid rgba(244,63,94,.2)",borderRadius:8,padding:"5px 8px",textAlign:"center"}}>
                  <div style={{fontSize:7,color:MUTED,fontFamily:SANS,marginBottom:2}}>MELHOR OFERTA VENDA</div>
                  <div style={{fontSize:13,fontWeight:900,color:RED,fontFamily:MONO}}>FS${ob.ask.toFixed(2)}</div>
                </div>
                <div style={{textAlign:"center",flexShrink:0}}>
                  <div style={{fontSize:7,color:MUTED,fontFamily:SANS}}>SPREAD</div>
                  <div style={{fontSize:10,fontWeight:800,color:GOLD,fontFamily:MONO}}>{spreadPct}%</div>
                </div>
                <div style={{flex:1,background:"rgba(108,99,255,.07)",border:"1px solid rgba(108,99,255,.2)",borderRadius:8,padding:"5px 8px",textAlign:"center"}}>
                  <div style={{fontSize:7,color:MUTED,fontFamily:SANS,marginBottom:2}}>MELHOR OFERTA COMPRA</div>
                  <div style={{fontSize:13,fontWeight:900,color:ACCENT,fontFamily:MONO}}>FS${ob.bid.toFixed(2)}</div>
                </div>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,padding:"0 6px 8px"}}>
                {/* LADO VENDA (Ask) */}
                <div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:4,marginBottom:4}}>
                    <span style={{fontSize:7,color:RED,fontWeight:800,letterSpacing:"1px",fontFamily:SANS}}>VENDA (ASK)</span>
                    <span style={{fontSize:7,color:MUTED,fontFamily:SANS,textAlign:"right"}}>QTD</span>
                  </div>
                  {[...askLevels].reverse().map((l,i)=>(
                    <div key={i} style={{position:"relative",marginBottom:2}}>
                      <div style={{position:"absolute",right:0,top:0,bottom:0,width:`${(l.qty/maxQty)*100}%`,background:"rgba(244,63,94,.12)",borderRadius:3}}/>
                      <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:4,padding:"2px 4px",position:"relative"}}>
                        <span style={{fontSize:9,fontWeight:700,color:i===LEVELS-1?"#ff6b6b":RED,fontFamily:MONO}}>{l.px.toFixed(2)}</span>
                        <span style={{fontSize:8,color:"rgba(255,255,255,.5)",fontFamily:MONO,textAlign:"right"}}>{l.qty.toLocaleString("pt-BR")}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* LADO COMPRA (Bid) */}
                <div>
                  <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:4,marginBottom:4}}>
                    <span style={{fontSize:7,color:MUTED,fontFamily:SANS}}>QTD</span>
                    <span style={{fontSize:7,color:ACCENT,fontWeight:800,letterSpacing:"1px",fontFamily:SANS,textAlign:"right"}}>COMPRA (BID)</span>
                  </div>
                  {bidLevels.map((l,i)=>(
                    <div key={i} style={{position:"relative",marginBottom:2}}>
                      <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${(l.qty/maxQty)*100}%`,background:"rgba(108,99,255,.1)",borderRadius:3}}/>
                      <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:4,padding:"2px 4px",position:"relative"}}>
                        <span style={{fontSize:8,color:"rgba(255,255,255,.5)",fontFamily:MONO}}>{l.qty.toLocaleString("pt-BR")}</span>
                        <span style={{fontSize:9,fontWeight:700,color:i===0?"#4fffb0":ACCENT,fontFamily:MONO,textAlign:"right"}}>{l.px.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Time & Sales */}
              <div style={{borderTop:`1px solid ${BORDER}`,padding:"6px 6px 4px"}}>
                <div style={{fontSize:7,color:MUTED,fontWeight:800,letterSpacing:"1px",fontFamily:SANS,marginBottom:5}}>TIME & SALES · ÚLTIMOS NEGÓCIOS</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:4,marginBottom:4}}>
                  {["PREÇO","QTD","HÁ"].map(h=><span key={h} style={{fontSize:6,color:"rgba(255,255,255,.45)",fontFamily:SANS,textAlign:h==="HÁ"?"right":"left"}}>{h}</span>)}
                </div>
                {trades.map((t,i)=>(
                  <div key={i} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:4,marginBottom:3,padding:"2px 0",borderBottom:i<trades.length-1?"1px solid rgba(255,255,255,.03)":"none"}}>
                    <span style={{fontSize:9,fontWeight:700,color:t.side==="buy"?ACCENT:RED,fontFamily:MONO}}>{t.px.toFixed(2)}</span>
                    <span style={{fontSize:8,color:"rgba(255,255,255,.5)",fontFamily:MONO,textAlign:"right"}}>{t.qty}</span>
                    <span style={{fontSize:7,color:"rgba(255,255,255,.45)",fontFamily:SANS,textAlign:"right"}}>{t.ago}s</span>
                  </div>
                ))}
              </div>
            </div>;
          })()}

          {/* Badges dos ativos comparados */}
          {compareClubs.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",padding:"0 6px",marginBottom:7}}>
            <span style={{fontSize:8,background:`${ACCENT}18`,color:ACCENT,border:`1px solid ${ACCENT}44`,borderRadius:6,padding:"2px 7px",fontWeight:800,fontFamily:SANS}}>{club.ticker} ●</span>
            {compareClubs.map(t=>{
              const cl=CLUBS.find(c=>c.ticker===t);
              return <span key={t} onClick={()=>setCompareClubs(p=>p.filter(x=>x!==t))} style={{fontSize:8,background:`${cl?.color||MUTED}18`,color:cl?.color||MUTED,border:`1px solid ${cl?.color||MUTED}44`,borderRadius:6,padding:"2px 7px",fontWeight:800,fontFamily:SANS,cursor:"pointer"}}>{t} ✕</span>;
            })}
          </div>}

          <CandleChart club={club} indicators={activeIndicators} chartMode={chartMode} compareClubs={compareClubs} currentPrice={prices[club.ticker]||club.price} prevCloses={prevCloses} period={period}/>
        </div>

        {/* ── FUNDAMENTOS IPO ── */}
        {user?.role==="admin"&&(()=>{
          const cl=CLUBS.find(cc=>cc.ticker===club.ticker);
          if(!cl)return null;
          const sup=supply[club.ticker]||0;
          const circ=cl.totalShares-sup; // cotas em circulação (nas carteiras)
          const supPct=+(sup/cl.totalShares*100).toFixed(1);
          const circPct=+(circ/cl.totalShares*100).toFixed(1);
          const curP=prices[club.ticker]||cl.price;
          const mktCapLive=(cl.totalShares*curP/1e6).toFixed(0);
          return <div style={{...cd,padding:"12px 13px",marginBottom:8}}>
            <div style={{fontSize:8,color:MUTED,fontWeight:700,letterSpacing:"1px",fontFamily:SANS,marginBottom:10}}>FUNDAMENTOS DO IPO · DADOS REAIS 2024</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
              <div style={{background:SURFACE,borderRadius:10,padding:"9px 11px"}}>
                <div style={{fontSize:7,color:MUTED,fontFamily:SANS,marginBottom:3}}>RECEITA ANUAL (2024)</div>
                <div style={{fontSize:13,fontWeight:900,color:"#fff",fontFamily:MONO}}>{cl.revenueLabel}</div>
                <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginTop:1}}>Fonte: Sports Value</div>
              </div>
              <div style={{background:SURFACE,borderRadius:10,padding:"9px 11px"}}>
                <div style={{fontSize:7,color:MUTED,fontFamily:SANS,marginBottom:3}}>EQUITY VALUE</div>
                <div style={{fontSize:13,fontWeight:900,color:"#fff",fontFamily:MONO}}>{cl.mktCap}</div>
                <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginTop:1}}>EV/Rec {cl.evMult}× − dívida</div>
              </div>
              <div style={{background:SURFACE,borderRadius:10,padding:"9px 11px"}}>
                <div style={{fontSize:7,color:MUTED,fontFamily:SANS,marginBottom:3}}>PREÇO IPO</div>
                <div style={{fontSize:13,fontWeight:900,color:GOLD,fontFamily:MONO}}>FS${cl.ipoPrice.toFixed(2)}</div>
                <div style={{fontSize:8,color:curP>cl.ipoPrice?ACCENT:RED,fontFamily:SANS,marginTop:1}}>Atual: {curP>cl.ipoPrice?"▲":"▼"} {(((curP-cl.ipoPrice)/cl.ipoPrice)*100).toFixed(1)}% vs IPO</div>
              </div>
              <div style={{background:SURFACE,borderRadius:10,padding:"9px 11px"}}>
                <div style={{fontSize:7,color:MUTED,fontFamily:SANS,marginBottom:3}}>MKT CAP LIVE</div>
                <div style={{fontSize:13,fontWeight:900,color:"#fff",fontFamily:MONO}}>R${mktCapLive}M</div>
                <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginTop:1}}>Free-float {Math.round(cl.ff*100)}%</div>
              </div>
            </div>
            {/* Float distribution bar */}
            <div style={{marginBottom:4,fontSize:8,color:MUTED,fontFamily:SANS,fontWeight:700}}>DISTRIBUIÇÃO DO FLOAT TOTAL ({cl.totalShares.toLocaleString("pt-BR")} cotas)</div>
            <div style={{height:12,borderRadius:6,overflow:"hidden",display:"flex",marginBottom:5}}>
              <div style={{width:`${circPct}%`,background:`linear-gradient(90deg,${ACCENT2},${ACCENT2}bb)`,transition:"width .6s"}}/>
              <div style={{flex:1,background:BORDER}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:8,height:8,borderRadius:2,background:ACCENT2}}/> 
                <span style={{fontSize:8,color:ACCENT2,fontFamily:SANS}}>Em carteiras: {circ.toLocaleString("pt-BR")} ({circPct}%)</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:8,height:8,borderRadius:2,background:BORDER}}/> 
                <span style={{fontSize:8,color:MUTED,fontFamily:SANS}}>Mercado: {sup.toLocaleString("pt-BR")} ({supPct}%)</span>
              </div>
            </div>
          </div>;
        })()}

        {/* ── ORDER BOOK + MICROESTRUTURA ── */}
        {(()=>{
          const ob=book[club.ticker]||{bid:prices[club.ticker]||club.price,ask:prices[club.ticker]||club.price};
          const imbV=imb[club.ticker]||0;
          const imbPct=Math.round(Math.abs(imbV)*100);
          const imbDir=imbV>0?"Compradores":"Vendedores";
          const imbCol=imbV>0?ACCENT:RED;
          const spread=ob.ask>0?(((ob.ask-ob.bid)/ob.ask)*100).toFixed(3):0;
          const fairVP=fv[club.ticker]||prices[club.ticker]||club.price;
          const fairDelta=((prices[club.ticker]||club.price)-fairVP)/fairVP*100;
          const v24=vol24[club.ticker]||0;
          const params=MP[club.ticker]||{float:5e6};
          return <>
            {/* Bid / Ask */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
              <div style={{background:"rgba(108,99,255,.08)",border:"1px solid rgba(108,99,255,.3)",borderRadius:12,padding:"10px 12px"}}>
                <div style={{fontSize:8,color:ACCENT,fontWeight:700,letterSpacing:"0.5px",marginBottom:3,fontFamily:SANS}}>BID — COMPRA</div>
                <div style={{fontSize:16,fontWeight:900,color:ACCENT,fontFamily:MONO}}>FS${ob.bid.toFixed(2)}</div>
                <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginTop:2}}>Melhor oferta compradora</div>
              </div>
              <div style={{background:"rgba(244,63,94,.08)",border:"1px solid rgba(244,63,94,.3)",borderRadius:12,padding:"10px 12px"}}>
                <div style={{fontSize:8,color:RED,fontWeight:700,letterSpacing:"0.5px",marginBottom:3,fontFamily:SANS}}>ASK — VENDA</div>
                <div style={{fontSize:16,fontWeight:900,color:RED,fontFamily:MONO}}>FS${ob.ask.toFixed(2)}</div>
                <div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginTop:2}}>Melhor oferta vendedora</div>
              </div>
            </div>
            {/* Métricas de mercado */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
              <div style={{...cd,padding:"9px 12px"}}><div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginBottom:3}}>SPREAD BID/ASK</div><div style={{fontSize:12,fontWeight:800,color:"#fff",fontFamily:MONO}}>{spread}%</div><div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginTop:1}}>Custo implícito</div></div>
              <div style={{...cd,padding:"9px 12px"}}><div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginBottom:3}}>VOL. SESSÃO</div><div style={{fontSize:12,fontWeight:800,color:"#fff",fontFamily:MONO}}>{v24.toLocaleString("pt-BR")} cotas</div><div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginTop:1}}>Ordens executadas</div></div>
              <div style={{...cd,padding:"9px 12px"}}><div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginBottom:3}}>FAIR VALUE (OU)</div><div style={{fontSize:12,fontWeight:800,color:"#fff",fontFamily:MONO}}>FS${fairVP.toFixed(2)}</div><div style={{fontSize:8,color:fairDelta>0?ACCENT:RED,fontFamily:SANS,marginTop:1}}>{fairDelta>0?"Abaixo":"Acima"} do justo {Math.abs(fairDelta).toFixed(2)}%</div></div>
              <div style={{...cd,padding:"9px 12px"}}><div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginBottom:3}}>FLOAT</div><div style={{fontSize:12,fontWeight:800,color:"#fff",fontFamily:MONO}}>{(params.float/1e6).toFixed(1)}M cotas</div><div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginTop:1}}>Liquidez disponível</div></div>
            </div>
            {/* Order Flow Imbalance */}
            <div style={{...cd,padding:"10px 13px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div><div style={{fontSize:8,color:MUTED,fontFamily:SANS,letterSpacing:"0.5px",marginBottom:1}}>ORDER FLOW IMBALANCE</div><div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>Pressão acumulada de ordens</div></div>
                <span style={{fontSize:10,fontWeight:800,color:imbCol,fontFamily:SANS}}>{imbDir} {imbPct}%</span>
              </div>
              <div style={{height:10,borderRadius:5,background:BORDER,overflow:"hidden",display:"flex"}}>
                <div style={{width:`${50+imbV*50}%`,background:`linear-gradient(90deg,${ACCENT}80,${ACCENT})`,transition:"width .6s ease",borderRadius:"5px 0 0 5px"}}/>
                <div style={{flex:1,background:`linear-gradient(90deg,${RED}80,${RED})`,borderRadius:"0 5px 5px 0"}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}><span style={{fontSize:8,color:ACCENT,fontFamily:SANS}}>▲ Compra {Math.round((50+imbV*50))}%</span><span style={{fontSize:8,color:RED,fontFamily:SANS}}>Venda {Math.round((50-imbV*50))}% ▼</span></div>
              <div style={{marginTop:8,fontSize:9,color:MUTED,fontFamily:SANS,lineHeight:1.5,borderTop:`1px solid ${BORDER}`,paddingTop:7}}>
                {Math.abs(imbV)>0.5?"⚡ Alta pressão — spread alargado, impacto de ordens elevado":Math.abs(imbV)>0.2?"📊 Pressão moderada — mercado em equilíbrio instável":"✅ Mercado equilibrado — spread normal, boa liquidez"}
              </div>
            </div>
          </>;
        })()}

        {/* ORDER PANEL */}

        <div style={{...cd,padding:"12px 13px",marginBottom:10}}>
          <div style={{fontSize:8,color:MUTED,marginBottom:7,fontWeight:700,letterSpacing:"0.5px",fontFamily:SANS}}>EXECUTAR ORDEM</div>
          {(()=>{
            const sup=supply[club.ticker]||0;
            const supColor=sup<1000?RED:sup<100000?GOLD:"#fff";
            const supLabel=sup<1000?"🔴 quase esgotado":sup<100000?"🟡 baixo estoque":"✅ disponível";
            const supPct=Math.round(sup/((CLUBS.find(cc=>cc.ticker===club.ticker)?.totalShares)||1)*100);
            return <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5,background:SURFACE,borderRadius:9,padding:"8px 10px",marginBottom:9,border:`1px solid ${BORDER}`}}>
              <div><div style={{fontSize:7,color:MUTED,letterSpacing:"0.5px",fontFamily:SANS,marginBottom:2}}>SALDO LIVRE</div><div style={{fontSize:11,fontWeight:900,color:ACCENT,fontFamily:MONO}}>{(balance/1000).toFixed(1)}k</div></div>
              <div style={{textAlign:"center",borderLeft:`1px solid ${BORDER}`,borderRight:`1px solid ${BORDER}`,paddingLeft:4,paddingRight:4}}>
                <div style={{fontSize:7,color:MUTED,letterSpacing:"0.5px",fontFamily:SANS,marginBottom:2}}>OFERTA NO MERCADO</div>
                <div style={{fontSize:11,fontWeight:900,color:supColor,fontFamily:MONO}}>{sup.toLocaleString("pt-BR")}</div>
                <div style={{fontSize:6,color:supColor,fontFamily:SANS,marginTop:1}}>{supLabel}</div>
                <div style={{height:3,borderRadius:2,background:BORDER,marginTop:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${supPct}%`,background:sup<1000?RED:sup<100000?GOLD:ACCENT,borderRadius:2,transition:"width .5s"}}/>
                </div>
                <div style={{fontSize:6,color:MUTED,fontFamily:SANS,marginTop:1}}>{supPct}% do float</div>
              </div>
              <div style={{textAlign:"right"}}><div style={{fontSize:7,color:MUTED,letterSpacing:"0.5px",fontFamily:SANS,marginBottom:2}}>EM CARTEIRA</div><div style={{fontSize:11,fontWeight:900,color:"#fff",fontFamily:MONO}}>{wallet[club.ticker]?.qty||0}</div></div>
            </div>;
          })()}
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
            <button onClick={()=>setQty(Math.max(100,qty-100))} style={{background:SURFACE,border:`1px solid ${BORDER}`,color:"#a8b8cc",width:44,height:30,borderRadius:8,cursor:"pointer",fontWeight:800,fontSize:13,fontFamily:SANS}}>−100</button>
            <div style={{flex:1,background:SURFACE,borderRadius:9,padding:"7px",textAlign:"center",fontSize:14,fontWeight:900,color:"#fff",border:`1px solid ${BORDER}`,fontFamily:MONO}}>{qty}</div>
            <button onClick={()=>setQty(qty+100)} style={{background:SURFACE,border:`1px solid ${BORDER}`,color:"#a8b8cc",width:44,height:30,borderRadius:8,cursor:"pointer",fontWeight:800,fontSize:13,fontFamily:SANS}}>+100</button>
          </div>
          {(()=>{
            const curP=prices[club.ticker]||club.price,total=qty*curP;
            const ob=book[club.ticker]||{bid:curP,ask:curP};
            const avail=supply[club.ticker]||0;const canBuy=!isSuspended&&total<=balance&&qty<=avail&&marketSession.id==="main",canSell=!isSuspended&&(wallet[club.ticker]?.qty||0)>=qty&&marketSession.id==="main";
            return <>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:10,color:MUTED,fontFamily:SANS}}>Compra via ASK</span>
                <span style={{fontSize:10,color:MUTED,fontFamily:SANS}}>Venda via BID</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:11,fontWeight:800,color:RED,fontFamily:MONO}}>FS${(qty*ob.ask).toLocaleString("pt-BR",{minimumFractionDigits:2})}</span>
                <span style={{fontSize:11,fontWeight:800,color:ACCENT,fontFamily:MONO}}>FS${(qty*ob.bid).toLocaleString("pt-BR",{minimumFractionDigits:2})}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9,background:"rgba(245,166,35,.07)",border:"1px solid rgba(245,166,35,.15)",borderRadius:8,padding:"4px 9px"}}>
                <span style={{fontSize:8,color:"#f5a623",fontFamily:SANS,display:"flex",alignItems:"center",gap:4}}><span style={{background:"rgba(245,166,35,.2)",borderRadius:4,padding:"1px 5px",fontWeight:800,fontSize:7}}>TAXA</span>operacional</span>
                <span style={{fontSize:9,fontWeight:700,color:"#f5a623",fontFamily:MONO}}>FS${calcFee(qty*ob.ask).toFixed(2)}</span>
              </div>

              {/* Aviso de sessão fora da negociação principal */}
              {marketSession.id!=="main"&&<div style={{background:marketSession.bg,border:`1px solid ${marketSession.border}`,borderRadius:10,padding:"7px 10px",marginBottom:9,display:"flex",alignItems:"center",gap:7}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:marketSession.color,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:9,fontWeight:800,color:marketSession.color,fontFamily:SANS}}>{marketSession.label}</div>
                  <div style={{fontSize:9,color:"#fff",fontWeight:600,fontFamily:SANS,marginTop:2,opacity:.9}}>
                    {marketSession.id==="closed"?"Ordens disponíveis das 11h00 às 00h45 (Brasília)":
                     marketSession.id==="pre"?"Aguardando abertura às 11h00 — ordens bloqueadas":
                     marketSession.id==="closing"?"Leilão de fechamento — ordens bloqueadas":
                     "After-market suspenso — retorna amanhã às 10h45"}
                  </div>
                </div>
              </div>}

              {/* Aviso de ordens agendadas pendentes para este ativo */}
              {scheduledOrders.filter(o=>o.ticker===club.ticker&&o.status!=="cancelled"&&o.status!=="executed").map(o=>(
                <div key={o.id} style={{background:"rgba(139,92,246,.1)",border:"1px solid rgba(139,92,246,.3)",borderRadius:10,padding:"7px 10px",marginBottom:7,display:"flex",alignItems:"center",gap:7}}>
                  <span style={{fontSize:12,flexShrink:0}}>{o.side==="buy"?"▲":"▼"}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:9,fontWeight:800,color:"#a78bfa",fontFamily:SANS}}>Ordem agendada — {o.side==="buy"?"COMPRA":"VENDA"}</div>
                    <div style={{fontSize:8,color:"rgba(255,255,255,.7)",fontFamily:SANS,marginTop:1}}>
                      {o.qty} cota{o.qty!==1?"s":""} · {o.priceType==="close"?"Preço de fechamento":`Limite FS$${o.fixedPrice?.toFixed(2)}`}
                    </div>
                  </div>
                  <button onClick={()=>setScheduledOrders(p=>p.map(x=>x.id===o.id?{...x,status:"cancelled",cancelledAt:new Date().toISOString()}:x))} style={{background:"rgba(244,63,94,.15)",border:"1px solid rgba(244,63,94,.3)",borderRadius:6,color:"#f43f5e",fontSize:10,fontWeight:800,padding:"3px 7px",cursor:"pointer",fontFamily:SANS}}>✕</button>
                </div>
              ))}

              {/* Botões principais */}
              {(()=>{
                const isPremium=user.plan==="Craque"||user.plan==="Lenda";
                const canSchedule=marketSession.id==="closed"&&isPremium;
                if(marketSession.id==="main"){
                  return <div style={{display:"flex",gap:7}}>
                    <button onClick={()=>{if(!canBuy)return;setOrderType("fast");setLimitPriceInput("");setOcoSL("");setOcoTP("");setOcoMode("pct");setOrderConfirm({side:"buy",ticker:club.ticker,qty,price:ob.ask,total:qty*ob.ask,club,ask:ob.ask,bid:ob.bid});}} style={{flex:1,padding:"12px",borderRadius:12,border:"none",cursor:canBuy?"pointer":"default",background:canBuy?"linear-gradient(135deg,#6c63ff,#38bdf8)":"rgba(108,99,255,.12)",color:canBuy?BG:"#555",fontSize:11,fontWeight:800,fontFamily:SANS,transition:"all .2s"}}>
                      ▲ COMPRAR
                      {!canBuy&&<div style={{fontSize:7,opacity:.8}}>{qty>avail?"sem cotas":"saldo insuf."}</div>}
                    </button>
                    <button onClick={()=>{if(!canSell)return;setOrderType("fast");setLimitPriceInput("");setOcoSL("");setOcoTP("");setOcoMode("pct");setOrderConfirm({side:"sell",ticker:club.ticker,qty,price:ob.bid,total:qty*ob.bid,club,ask:ob.ask,bid:ob.bid});}} style={{flex:1,padding:"12px",borderRadius:12,border:"none",cursor:canSell?"pointer":"default",background:canSell?`linear-gradient(135deg,${RED},#cc2244)`:`${RED}25`,color:canSell?"#fff":"#555",fontSize:11,fontWeight:800,fontFamily:SANS,transition:"all .2s"}}>
                      ▼ VENDER{!canSell&&<div style={{fontSize:7,opacity:.8}}>sem posição</div>}
                    </button>
                  </div>;
                }
                if(canSchedule){
                  return <><div style={{display:"flex",gap:7,marginBottom:6}}>
                    <button onClick={()=>{setScheduleModal({side:"buy",ticker:club.ticker,qty,closePrice:ob.ask,club});setSchedulePriceType("close");setScheduleFixedInput("");}} style={{flex:1,padding:"12px",borderRadius:12,border:"1px solid rgba(108,99,255,.4)",cursor:"pointer",background:"rgba(108,99,255,.1)",color:ACCENT,fontSize:11,fontWeight:800,fontFamily:SANS}}>
                      ▲ AGENDAR COMPRA<div style={{fontSize:7,opacity:.8,marginTop:1}}>executa na abertura</div>
                    </button>
                    <button onClick={()=>{setScheduleModal({side:"sell",ticker:club.ticker,qty,closePrice:ob.bid,club});setSchedulePriceType("close");setScheduleFixedInput("");}} style={{flex:1,padding:"12px",borderRadius:12,border:"1px solid rgba(244,63,94,.4)",cursor:"pointer",background:"rgba(244,63,94,.1)",color:RED,fontSize:11,fontWeight:800,fontFamily:SANS}}>
                      ▼ AGENDAR VENDA<div style={{fontSize:7,opacity:.8,marginTop:1}}>executa na abertura</div>
                    </button>
                  </div>
                  <div style={{background:"rgba(139,92,246,.08)",border:"1px solid rgba(139,92,246,.2)",borderRadius:9,padding:"6px 10px",textAlign:"center"}}>
                    <span style={{fontSize:8,color:"#a78bfa",fontFamily:SANS,fontWeight:700}}>⚡ Benefício {user.plan} — Agendamento de ordens</span>
                  </div></>;
                }
                // Mercado fechado + plano Jogador
                return <div style={{display:"flex",gap:7}}>
                  <button style={{flex:1,padding:"12px",borderRadius:12,border:"none",cursor:"default",background:`${ACCENT}15`,color:"#555",fontSize:11,fontWeight:800,fontFamily:SANS}}>
                    ▲ COMPRAR<div style={{fontSize:7,opacity:.8}}>mercado fechado</div>
                  </button>
                  <button style={{flex:1,padding:"12px",borderRadius:12,border:"none",cursor:"default",background:`${RED}15`,color:"#555",fontSize:11,fontWeight:800,fontFamily:SANS}}>
                    ▼ VENDER<div style={{fontSize:7,opacity:.8}}>mercado fechado</div>
                  </button>
                </div>;
              })()}
            </>;
          })()}
        </div>
      </>}

      {/* ── CARTEIRA ── */}
      {tab==="Carteira"&&<>
        {(()=>{
          const total=balance+portVal;
          // Fatias: saldo livre + cada posição
          const slices=[
            {label:"Saldo livre",val:balance,color:ACCENT},
            ...portEntries.map(p=>({label:p.ticker,val:p.qty*(prices[p.ticker]||p.price),color:p.color}))
          ].filter(s=>s.val>0);
          // Donut — viewBox 200×200, buraco central R=56
          const R=88,r=56,cx=100,cy=100;
          const Rmid=(R+r)/2; // =72 — raio médio da coroa
          let cumAngle=-Math.PI/2;
          const arcs=slices.map(s=>{
            const angle=(s.val/total)*2*Math.PI;
            const x1=cx+R*Math.cos(cumAngle),y1=cy+R*Math.sin(cumAngle);
            const x2=cx+R*Math.cos(cumAngle+angle),y2=cy+R*Math.sin(cumAngle+angle);
            const xi1=cx+r*Math.cos(cumAngle+angle),yi1=cy+r*Math.sin(cumAngle+angle);
            const xi2=cx+r*Math.cos(cumAngle),yi2=cy+r*Math.sin(cumAngle);
            const large=angle>Math.PI?1:0;
            const d=`M${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} L${xi1.toFixed(2)},${yi1.toFixed(2)} A${r},${r} 0 ${large},0 ${xi2.toFixed(2)},${yi2.toFixed(2)} Z`;
            const midAngle=cumAngle+angle/2;
            const tx=cx+Rmid*Math.cos(midAngle);
            const ty=cy+Rmid*Math.sin(midAngle);
            let rot=(midAngle*180/Math.PI)+90;
            if(rot>90&&rot<270) rot+=180;
            cumAngle+=angle;
            const pct=s.val/total;
            return {...s,d,angle,tx,ty,rot,pct};
          });
          return (
            <div style={{background:"linear-gradient(135deg,#0d1422,#090e18)",borderRadius:18,padding:"16px",marginBottom:12,border:`1px solid ${BORDER}`,position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:-30,right:-30,width:100,height:100,background:"radial-gradient(circle,rgba(108,99,255,.12),transparent)",borderRadius:"50%"}}/>
              <div style={{display:"flex",alignItems:"flex-start",gap:14}}>

                {/* ── Coluna esquerda: label + patrimônio + métricas alinhadas ── */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:8,color:MUTED,letterSpacing:"1.5px",fontWeight:700,marginBottom:5,fontFamily:SANS}}>PATRIMÔNIO TOTAL</div>
                  {/* Valor total — referência de alinhamento */}
                  <div style={{fontSize:22,fontWeight:800,color:"#fff",letterSpacing:"-1.5px",marginBottom:10,fontFamily:MONO,lineHeight:1,textAlign:"right"}}>
                    FS${total.toLocaleString("pt-BR",{minimumFractionDigits:2})}
                  </div>
                  {/* Métricas: label à esquerda, valor alinhado à direita (mesmo eixo do total) */}
                  <div style={{display:"flex",flexDirection:"column",gap:5}}>
                    {[
                      {l:"SALDO LIVRE", v:`FS$${balance.toLocaleString("pt-BR",{minimumFractionDigits:2})}`, c:ACCENT},
                      {l:"P&L",         v:(pnl>=0?"+":"−")+"FS$"+Math.abs(pnl).toLocaleString("pt-BR",{minimumFractionDigits:2}), c:pnl>=0?ACCENT:RED},
                      {l:"POSIÇÕES",    v:`${portEntries.length} ativo${portEntries.length!==1?"s":""}`, c:"#fff"},
                    ].map(row=>(
                      <div key={row.l} style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <span style={{fontSize:7,color:MUTED,fontFamily:SANS,letterSpacing:"0.5px"}}>{row.l}</span>
                        <span style={{fontSize:10,fontWeight:700,color:row.c,fontFamily:MONO,textAlign:"right"}}>{row.v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Pizza: gráfico sólido sem buraco, tickers nas fatias ── */}
                <div style={{flexShrink:0}}>
                  {portEntries.length===0
                    ? <svg width="110" height="110" viewBox="0 0 200 200">
                        <circle cx="100" cy="100" r="90" fill={ACCENT} opacity=".08" stroke={ACCENT} strokeWidth="2" strokeDasharray="6 4"/>
                        <text x="100" y="105" textAnchor="middle" fontSize="18" fill={MUTED} fontFamily={SANS} fontWeight="700">VAZIO</text>
                      </svg>
                    : <svg width="110" height="110" viewBox="0 0 200 200">
                        <defs>
                          <filter id="pie_glow2" x="-15%" y="-15%" width="130%" height="130%">
                            <feGaussianBlur stdDeviation="1.5" result="b"/>
                            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                          </filter>
                        </defs>
                        {arcs.map((a,i)=>(
                          <path key={i} d={a.d} fill={a.color} opacity={a.label==="Saldo livre"?.85:.9} stroke={BG} strokeWidth="2.5" filter="url(#pie_glow2)"/>
                        ))}
                        {/* Buraco central */}
                        <circle cx="100" cy="100" r="56" fill={BG}/>
                        {/* Tickers na coroa — fatias ≥ 8% */}
                        {arcs.map((a,i)=>{
                          if(a.pct<0.08) return null;
                          const lbl=a.label==="Saldo livre"?"FS$":a.label;
                          const fs=a.pct>=0.20?12:a.pct>=0.12?11:10;
                          return(
                            <text
                              key={`lbl${i}`}
                              x={a.tx.toFixed(2)}
                              y={a.ty.toFixed(2)}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize={fs}
                              fontWeight="900"
                              fill="#fff"
                              fontFamily="'JetBrains Mono','Fira Mono',monospace"
                              transform={`rotate(${a.rot.toFixed(1)},${a.tx.toFixed(2)},${a.ty.toFixed(2)})`}
                              paintOrder="stroke"
                              stroke="rgba(0,0,0,.65)"
                              strokeWidth="3.5"
                              strokeLinejoin="round"
                              style={{pointerEvents:"none"}}
                            >{lbl}</text>
                          );
                        })}
                        {/* Centro: ATIVOS + número */}
                        <text x="100" y="91" textAnchor="middle" fontSize="13" fill={MUTED} fontFamily={SANS} fontWeight="700">ATIVOS</text>
                        <text x="100" y="114" textAnchor="middle" fontSize="22" fill="#fff" fontFamily={SANS} fontWeight="900">{portEntries.length}</text>
                      </svg>
                  }
                </div>

              </div>
            </div>
          );
        })()}
        
        <div style={{fontSize:8,color:MUTED,fontWeight:700,marginBottom:9,letterSpacing:"1px",fontFamily:SANS}}>POSIÇÕES ABERTAS</div>
        {portEntries.length===0&&<div style={{...cd,padding:"22px",textAlign:"center"}}><div style={{fontSize:22,marginBottom:7}}>📭</div><div style={{fontSize:12,fontWeight:700,color:"#fff",fontFamily:SANS}}>Carteira vazia</div><div style={{fontSize:10,color:MUTED,fontFamily:SANS,marginTop:3}}>Vá ao Mercado e compre seu primeiro ativo!</div></div>}
        {portEntries.map(p=>{
          const curr=p.qty*(prices[p.ticker]||p.price),pl=curr-p.invested,plp=(pl/p.invested)*100;
          return <div key={p.ticker} onClick={()=>{setTab("Mercado");setClub(p);}} style={{...cd,padding:"11px 13px",marginBottom:7,cursor:"pointer",transition:"border-color .2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=p.color+"99"} onMouseLeave={e=>e.currentTarget.style.borderColor=BORDER}>
            <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:7}}>
              <div style={{width:34,height:34,borderRadius:10,background:`linear-gradient(145deg,${p.color}dd,${p.color}88)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:p.c2}}>{p.ticker.replace(/\d/g,"")}</div>
              <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:"#fff",fontFamily:SANS}}>{p.ticker}</div><div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>{p.qty} cotas · PM FS${p.avg.toFixed(2)}</div></div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{textAlign:"right"}}><div style={{fontSize:13,fontWeight:800,color:"#fff",fontFamily:MONO}}>FS${curr.toFixed(2)}</div><div style={{fontSize:10,fontWeight:600,color:pl>0?ACCENT:RED,fontFamily:MONO}}>{pl>0?"+":""}{plp.toFixed(1)}%</div></div>
                <span style={{fontSize:11,color:MUTED,opacity:.5}}>›</span>
              </div>
            </div>
            <div style={{background:SURFACE,borderRadius:4,height:4,overflow:"hidden"}}><div style={{height:"100%",borderRadius:4,width:`${Math.min(100,Math.abs(plp)*4)}%`,background:pl>0?"linear-gradient(90deg,#6c63ff,#38bdf8)":"linear-gradient(90deg,#f43f5e,#ff6080)",transition:"width .5s"}}/></div>
          </div>;
        })}

        {/* ── POSIÇÕES SHORT ── */}
        {isLenda&&Object.keys(shortPositions).length>0&&<>
          <div style={{fontSize:8,color:RED,fontWeight:700,marginTop:12,marginBottom:9,letterSpacing:"1px",fontFamily:SANS,display:"flex",alignItems:"center",gap:6}}>
            <span>📉</span> SHORTS ABERTOS
          </div>
          {Object.entries(shortPositions).map(([ticker,pos])=>{
            const cl=CLUBS.find(c=>c.ticker===ticker);
            if(!cl) return null;
            const curP=prices[ticker]||cl.price;
            const pnlVal=+((pos.entryPrice-curP)*pos.qty).toFixed(2);
            const pnlPct=+(pnlVal/pos.margin*100).toFixed(1);
            return <div key={ticker} style={{background:"rgba(244,63,94,.06)",border:"1.5px solid rgba(244,63,94,.25)",borderRadius:14,padding:"11px 13px",marginBottom:7}}>
              <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:7}}>
                <div style={{width:34,height:34,borderRadius:9,background:`linear-gradient(145deg,${cl.color},${cl.color}80)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:900,color:cl.c2,position:"relative"}}>
                  {cl.ticker.replace(/\d/g,"")}
                  <div style={{position:"absolute",top:-5,right:-5,width:14,height:14,borderRadius:"50%",background:RED,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7}}>↓</div>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:600,color:"#fff",fontFamily:SANS}}>{ticker} <span style={{fontSize:8,color:RED,fontWeight:700}}>SHORT</span></div>
                  <div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>{pos.qty} cotas · Entrada FS${pos.entryPrice.toFixed(2)}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:13,fontWeight:800,color:"#fff",fontFamily:MONO}}>FS${curP.toFixed(2)}</div>
                  <div style={{fontSize:10,fontWeight:700,color:pnlVal>=0?ACCENT:RED,fontFamily:MONO}}>{pnlVal>=0?"+":""}{pnlVal.toFixed(2)}</div>
                </div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <span style={{fontSize:8,color:MUTED,fontFamily:SANS}}>Margem bloqueada</span>
                <span style={{fontSize:8,color:"#fff",fontFamily:MONO}}>FS${pos.margin.toFixed(2)}</span>
              </div>
              <div style={{background:SURFACE,borderRadius:4,height:4,overflow:"hidden",marginBottom:8}}>
                <div style={{height:"100%",borderRadius:4,width:`${Math.min(100,Math.abs(pnlPct)*2)}%`,background:pnlVal>=0?"linear-gradient(90deg,#6c63ff,#38bdf8)":"linear-gradient(90deg,#f43f5e,#ff6080)",transition:"width .5s"}}/>
              </div>
              <button onClick={()=>{
                const ob=book[ticker]||{ask:curP};
                setOrderConfirm({side:"buy",ticker,qty:pos.qty,price:ob.ask,total:pos.qty*ob.ask,club:cl,ask:ob.ask,bid:ob.ask,isShortClose:true});
                setOrderType("short_close");
              }} style={{width:"100%",padding:"7px",borderRadius:9,border:"1px solid rgba(244,63,94,.4)",background:"rgba(244,63,94,.12)",color:"#f87171",fontSize:10,fontWeight:800,cursor:"pointer",fontFamily:SANS}}>
                Fechar Short · Recomprar {pos.qty} cota{pos.qty!==1?"s":""}
              </button>
            </div>;
          })}
        </>}
      </>}

      {/* ── IA ASSESSOR ── */}
      {tab==="Assessor"&&user?.role==="admin"&&<>
        {/* ── HORÁRIO DE OPERAÇÕES B3 ── */}
        <div style={{...cd,overflow:"hidden",marginBottom:12}}>
          <div style={{padding:"10px 13px 8px",borderBottom:`1px solid ${BORDER}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontSize:8,fontWeight:800,color:MUTED,letterSpacing:"1px",fontFamily:SANS}}>HORÁRIO DE OPERAÇÕES · BRASÍLIA</div>
            <div style={{background:marketSession.bg,border:`1px solid ${marketSession.border}`,borderRadius:20,padding:"2px 8px",display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:5,height:5,borderRadius:"50%",background:marketSession.color,boxShadow:marketSession.id!=="closed"?`0 0 5px ${marketSession.color}`:"none"}}/>
              <span style={{fontSize:8,fontWeight:900,color:marketSession.color,fontFamily:SANS}}>{marketSession.label}</span>
            </div>
          </div>
          <div style={{padding:"9px 13px"}}>
            {SESSIONS.map(s=>{
              const isActive=marketSession.id===s.id;
              const fmtMin=m=>{const h=Math.floor(m/60)%24;return String(h).padStart(2,"0")+":"+String(m%60).padStart(2,"0");};
              const sh=fmtMin(s.start), eh=fmtMin(s.end);
              return <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 9px",borderRadius:10,marginBottom:4,background:isActive?s.bg:"transparent",border:`1px solid ${isActive?s.border:BORDER}`,transition:"all .3s"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:isActive?s.color:BORDER,flexShrink:0,boxShadow:isActive?`0 0 8px ${s.color}`:"none",transition:"all .3s"}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,fontWeight:isActive?900:600,color:isActive?"#fff":"#a8b8cc",fontFamily:SANS}}>{s.label}</div>
                </div>
                <div style={{fontSize:9,fontWeight:isActive?800:600,color:isActive?s.color:MUTED,fontFamily:MONO,whiteSpace:"nowrap"}}>{sh} – {eh}</div>
                {isActive&&<div style={{fontSize:7,background:s.color,color:BG,borderRadius:5,padding:"1px 5px",fontWeight:800,fontFamily:SANS,flexShrink:0}}>AGORA</div>}
              </div>;
            })}
            {marketSession.id==="closed"&&<div style={{textAlign:"center",padding:"4px 0",fontSize:9,color:MUTED,fontFamily:SANS}}>Próxima abertura: pré-mercado às <span style={{color:"#f5a623",fontWeight:700}}>10:45</span></div>}
          </div>
        </div>
        <div style={{...cd,overflow:"hidden",marginBottom:12}}>
          <div style={{background:"#0d1422",padding:"11px 13px",display:"flex",alignItems:"center",gap:9,borderBottom:`1px solid ${BORDER}`}}>
            <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,#6c63ff,#38bdf8)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>🤖</div>
            <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:"#fff",fontFamily:SANS}}>Assessor FootStock IA</div><div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:5,height:5,borderRadius:"50%",background:ACCENT}}/><span style={{fontSize:9,color:ACCENT,fontFamily:SANS}}>Monitorando {CLUBS.length} ativos · 6 camadas de mercado</span></div></div>
            <div style={{background:"linear-gradient(135deg,#f59e0b,#d97706)",borderRadius:9,padding:"2px 7px",fontSize:8,fontWeight:800,color:"#1a0800",fontFamily:SANS}}>⚡ PRO</div>
          </div>
          <div style={{padding:"9px 11px",display:"flex",flexDirection:"column",gap:7,maxHeight:190,overflowY:"auto"}}>
            {newsLog.length===0&&<div style={{textAlign:"center",padding:"14px 0",fontSize:11,color:MUTED,fontFamily:SANS}}>🔍 Aguardando primeiro evento…</div>}
            {newsLog.map((n,i)=><div key={i} style={{background:n.sent>=0?"rgba(108,99,255,.06)":"rgba(244,63,94,.06)",border:`1px solid ${n.sent>=0?"rgba(108,99,255,.2)":"rgba(244,63,94,.2)"}`,borderRadius:11,padding:"8px 10px",animation:i===0?"fadeIn .3s ease":"none"}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:7}}>
                <span style={{fontSize:13,flexShrink:0}}>{n.emoji}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:10,color:"#e2e8f0",fontFamily:SANS,lineHeight:1.4,marginBottom:4}}>{n.headline}</div>
                  <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                    <span style={{fontSize:9,background:SURFACE,borderRadius:4,padding:"1px 5px",color:n.sent>=0?ACCENT:RED,fontWeight:800,fontFamily:MONO}}>{n.ticker}</span>
                    <span style={{fontSize:9,color:n.sent>=0?ACCENT:RED,fontWeight:800,fontFamily:MONO}}>{n.sent>=0?"▲":"▼"}{Math.abs(n.pct).toFixed(2)}%</span>
                    <span style={{fontSize:8,color:MUTED,background:SURFACE,borderRadius:4,padding:"1px 4px",fontFamily:SANS}}>{n.cat}</span>
                  </div>
                </div>
              </div>
            </div>)}
          </div>
          <div style={{padding:"7px 11px",borderTop:`1px solid ${BORDER}`,display:"flex",gap:6}}><div style={{flex:1,background:SURFACE,borderRadius:16,padding:"7px 11px",fontSize:9,color:MUTED,fontFamily:SANS}}>/radar, /report, /call…</div><div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,#6c63ff,#38bdf8)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,cursor:"pointer",color:BG,fontWeight:900}}>↑</div></div>
        </div>
        <div style={{fontSize:8,color:MUTED,fontWeight:700,marginBottom:9,letterSpacing:"1px",fontFamily:SANS}}>SENTIMENTO IA + OFI · AO VIVO</div>
        <div style={{...cd,overflow:"hidden",marginBottom:12}}>
          {CLUBS.map((c,i)=>{
            const s=sent[c.ticker]||c.sent,p=pct(c.ticker),imbV=imb[c.ticker]||0;
            return <div key={c.ticker} style={{display:"flex",alignItems:"center",gap:7,padding:"7px 12px",borderBottom:i<CLUBS.length-1?`1px solid ${BORDER}`:"none"}}>
              <div style={{width:24,height:24,borderRadius:6,background:`linear-gradient(145deg,${c.color},${c.color}80)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:6,fontWeight:900,color:c.c2,flexShrink:0}}>{c.ticker.replace(/\d/g,"")}</div>
              <span style={{fontSize:9,fontWeight:700,color:"#fff",width:40,fontFamily:MONO,flexShrink:0}}>{c.ticker}</span>
              {/* Sentiment bar */}
              <div style={{width:28,height:5,borderRadius:3,background:BORDER,position:"relative",overflow:"hidden",flexShrink:0}}>
                <div style={{position:"absolute",left:"50%",top:0,bottom:0,width:1,background:MUTED}}/>
                {s>=0?<div style={{position:"absolute",left:"50%",top:0,bottom:0,width:`${s*50}%`,borderRadius:"0 3px 3px 0",background:ACCENT,transition:"width .6s"}}/>:<div style={{position:"absolute",right:"50%",top:0,bottom:0,width:`${Math.abs(s)*50}%`,borderRadius:"3px 0 0 3px",background:RED,transition:"width .6s"}}/>}
              </div>
              {/* OFI bar */}
              <div style={{flex:1,height:5,borderRadius:3,background:BORDER,position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",left:"50%",top:0,bottom:0,width:1,background:MUTED}}/>
                {imbV>=0?<div style={{position:"absolute",left:"50%",top:0,bottom:0,width:`${imbV*50}%`,background:ACCENT,transition:"width .4s"}}/>:<div style={{position:"absolute",right:"50%",top:0,bottom:0,width:`${Math.abs(imbV)*50}%`,background:RED,transition:"width .4s"}}/>}
              </div>
              <span style={{fontSize:9,fontWeight:700,color:p>=0?ACCENT:RED,fontFamily:MONO,width:38,textAlign:"right"}}>{p>=0?"+":""}{p.toFixed(1)}%</span>
            </div>;
          })}
        </div>
        <div style={{fontSize:8,color:MUTED,fontWeight:700,marginBottom:9,letterSpacing:"1px",fontFamily:SANS}}>MOTOR DE PREÇOS · 6 CAMADAS</div>
        <div style={{...cd,overflow:"hidden",marginBottom:12}}>
          {[
            {ico:"🔄",name:"Ornstein-Uhlenbeck",desc:"Mean reversion ao fair value",col:ACCENT2},
            {ico:"📊",name:"GARCH-lite",desc:"Volatilidade aumenta após choques",col:GOLD},
            {ico:"⚖️",name:"Order Flow Imbalance",desc:"Pressão compra vs venda",col:ACCENT},
            {ico:"📐",name:"Kyle's Lambda",desc:"Impacto de cada ordem no preço",col:"#a78bfa"},
            {ico:"📰",name:"Impact Matrix",desc:"Choque por categoria de notícia",col:"#fb923c"},
            {ico:"🔒",name:"Circuit Breaker",desc:"Trava automática ≥ 25% de variação — suspensão de 5 min",col:RED},
          ].map((r,i)=><div key={r.name} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 13px",borderBottom:i<5?`1px solid ${BORDER}`:"none"}}>
            <div style={{width:28,height:28,borderRadius:8,background:`${r.col}18`,border:`1px solid ${r.col}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>{r.ico}</div>
            <div style={{flex:1}}><div style={{fontSize:10,fontWeight:700,color:"#cbd5e1",fontFamily:SANS}}>{r.name}</div><div style={{fontSize:8,color:MUTED,fontFamily:SANS,marginTop:1}}>{r.desc}</div></div>
            <div style={{width:8,height:8,borderRadius:"50%",background:r.col,boxShadow:`0 0 6px ${r.col}80`,flexShrink:0}}/>
          </div>)}
        </div>
        <div style={{fontSize:8,color:MUTED,fontWeight:700,marginBottom:9,letterSpacing:"1px",fontFamily:SANS}}>MATRIZ DE IMPACTO DE NOTÍCIAS</div>
        <div style={{...cd,overflow:"hidden",marginBottom:12}}>
          {[{cat:"Financeira Crítica",imp:"±15%",col:RED},{cat:"Esportiva Majoritária",imp:"±10%",col:"#fb923c"},{cat:"Mercado de Ativos",imp:"±7%",col:GOLD},{cat:"Integridade/Saúde",imp:"±5%",col:ACCENT},{cat:"Institucional",imp:"±3%",col:ACCENT2},{cat:"Esportiva Menor",imp:"±2%",col:MUTED}].map((r,i)=><div key={r.cat} style={{display:"flex",alignItems:"center",gap:9,padding:"8px 13px",borderBottom:i<5?`1px solid ${BORDER}`:"none"}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:r.col,flexShrink:0}}/>
            <div style={{flex:1,fontSize:10,fontWeight:700,color:"#cbd5e1",fontFamily:SANS}}>{r.cat}</div>
            <div style={{fontSize:11,fontWeight:900,color:r.col,fontFamily:MONO}}>{r.imp}</div>
          </div>)}
        </div>
      </>}

      {/* ── LIGAS ── */}
      {tab==="Ligas"&&<>
        <div style={{background:"linear-gradient(135deg,#1a1000,#2a1800)",borderRadius:18,padding:"16px",marginBottom:12,border:"1px solid #f5a62330",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:-20,right:-20,width:80,height:80,background:"radial-gradient(circle,rgba(245,166,35,.2),transparent)",borderRadius:"50%"}}/>
          <div style={{fontSize:8,fontWeight:800,color:GOLD,letterSpacing:"1.5px",marginBottom:5,fontFamily:SANS}}>🏆 LIGA PREMIADA · PRO</div>
          <div style={{fontSize:16,fontWeight:900,color:"#fff",marginBottom:2,fontFamily:SANS}}>FootStock Masters</div>
          <div style={{fontSize:10,color:"#a08040",marginBottom:10,fontFamily:SANS}}>Semana 8 de 12 · 847 participantes</div>
          <div style={{display:"flex",gap:14}}>
            {[{l:"PRÊMIO 1º",v:"PS5+R$500",c:GOLD},{l:"SUA POSIÇÃO",v:"#23/847",c:"#fff"},{l:"ENCERRA",v:"4d 12h",c:"#fff"}].map(i=><div key={i.l}><div style={{fontSize:8,color:"#a08040",fontFamily:SANS}}>{i.l}</div><div style={{fontSize:11,fontWeight:800,color:i.c,marginTop:2,fontFamily:SANS}}>{i.v}</div></div>)}
          </div>
        </div>
        <div style={{fontSize:8,color:MUTED,fontWeight:700,marginBottom:9,letterSpacing:"1px",fontFamily:SANS}}>RANKING DA SEMANA</div>
        {[{rank:1,n:"TradingMaster_SP",p:"+FS$14.280",i:"🥇"},{rank:2,n:"FutebolQuant",p:"+FS$12.640",i:"🥈"},{rank:3,n:"RioTrader99",p:"+FS$10.920",i:"🥉"},{rank:null},{rank:23,n:"Você",p:"+FS$5.400",i:"👤",me:true}].map((r,idx)=>
          r.rank===null?<div key="sep" style={{textAlign:"center",fontSize:11,color:MUTED,padding:"3px 0",marginBottom:5}}>· · ·</div>
          :<div key={idx} style={{...cd,padding:"9px 13px",display:"flex",alignItems:"center",gap:9,marginBottom:5,background:r.me?"rgba(108,99,255,.07)":CARD,borderColor:r.me?"rgba(108,99,255,.3)":BORDER}}><div style={{fontSize:16,flexShrink:0}}>{r.i}</div><div style={{fontSize:10,fontWeight:700,color:MUTED,width:18,fontFamily:SANS}}>#{r.rank}</div><div style={{flex:1,fontSize:11,fontWeight:r.me?800:600,color:r.me?ACCENT:"#cbd5e1",fontFamily:SANS}}>{r.n}</div><div style={{fontSize:11,fontWeight:800,color:ACCENT,fontFamily:MONO}}>{r.p}</div></div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginTop:14,marginBottom:14}}>
          {[{n:"Liga Amigos",d:"Até 20 jogadores",i:"👥"},{n:"Liga Pública",d:"Aberta a todos",i:"🌐"},{n:"Liga PRO",d:"Com prêmios físicos",i:"⚡",pro:true},{n:"Criar Liga",d:"Configure as regras",i:"➕"}].map(l=><button key={l.n} onClick={()=>l.n==="Criar Liga"&&setShowCriarLiga(true)} style={{...cd,padding:"13px",cursor:"pointer",textAlign:"left",borderColor:l.pro?"rgba(245,166,35,.4)":l.n==="Criar Liga"?`${ACCENT}40`:BORDER}}>
            <div style={{fontSize:20,marginBottom:6}}>{l.i}</div>
            <div style={{fontSize:11,fontWeight:800,color:"#e2e8f0",marginBottom:2,fontFamily:SANS}}>{l.n}</div>
            <div style={{fontSize:9,color:MUTED,fontFamily:SANS}}>{l.d}</div>
            {l.pro&&<div style={{fontSize:8,color:GOLD,marginTop:6,fontWeight:800,fontFamily:SANS}}>⚡ EXCLUSIVO PRO</div>}
          </button>)}
        </div>
      </>}

      {/* ── MENSAGENS ── */}
      {tab==="Msgs"&&(()=>{
        const MSGS=[
          {id:1, type:"saldo",    icon:"💰", color:ACCENT,
           title:"Saldo disponível para compra",
           body:`Você tem FS$${balance.toLocaleString("pt-BR",{minimumFractionDigits:2})} disponíveis na sua carteira. Que tal aproveitar a queda do Vasco hoje (-3.2%) para entrar numa posição?`,
           time:"Agora", unread:true},
          {id:2, type:"plano",    icon:"⭐", color:GOLD,
           title:"Renovação do seu plano",
           body:`Seu plano ${user.plan} renova em 7 dias. Valor: R$${user.plan==="Lenda"?"39,90":"19,90"}. Pagamento automático no cartão cadastrado. Para cancelar ou trocar, acesse seu perfil.`,
           time:"1h atrás", unread:true},
          {id:3, type:"alerta",   icon:"📈", color:ACCENT2,
           title:"Flamengo +8,4% hoje",
           body:"URU3 ultrapassou a marca de FS$30,00 após confirmação de novo patrocínio master de R$120M. Seu portfólio valorizou FS$843 nas últimas 24h.",
           time:"3h atrás", unread:true},
          {id:4, type:"marketing",icon:"🎯", color:"#a78bfa",
           title:"Semana de promoção Lenda",
           body:"Faça upgrade para o plano Lenda esta semana e ganhe FS$2.000 de bônus + acesso imediato ao Assessor VIP. Oferta válida até domingo.",
           time:"Ontem", unread:false},
          {id:5, type:"plano",    icon:"🔔", color:GOLD,
           title:"Pagamento confirmado",
           body:`Recebemos seu pagamento do plano ${user.plan} — R$${user.plan==="Lenda"?"39,90":"19,90"} em 07/02/2026. Próxima cobrança: 07/03/2026. Obrigado por ser FootStock!`,
           time:"05/02", unread:false},
          {id:6, type:"alerta",   icon:"⚠️", color:RED,
           title:"Circuit Breaker ativado — TIM3",
           body:"Corinthians acionou o circuit breaker após queda de 24,5% em 30 segundos. Negociação suspensa por 30s. Evento: bloqueio judicial de R$85M.",
           time:"04/02", unread:false},
          {id:7, type:"marketing",icon:"🏆", color:GOLD,
           title:"FootStock Masters — inscrições abertas",
           body:"A Liga PRO desta semana tem prêmio de PS5 + R$500 para o 1º lugar. 847 participantes já inscritos. Sua posição atual: #23. Clique para ver o ranking completo.",
           time:"03/02", unread:false},
          {id:8, type:"saldo",    icon:"💸", color:ACCENT,
           title:"Venda executada com sucesso",
           body:"Você vendeu 50 cotas de FOG3 a FS$22,10 cada. Total creditado: FS$1.105,00. Saldo atual: FS$"+balance.toLocaleString("pt-BR",{minimumFractionDigits:2})+".",
           time:"02/02", unread:false},
          {id:9, type:"marketing",icon:"📊", color:ACCENT2,
           title:"Relatório semanal de desempenho",
           body:"Na última semana seu portfólio valorizou +12,3%. Os destaques foram FOG3 (+15,1%) e URU3 (+8,4%). Você está acima de 78% dos usuários FootStock.",
           time:"01/02", unread:false},
        ];
        const typeLabels={saldo:"CARTEIRA",plano:"PLANO",alerta:"ALERTA",marketing:"PROMOÇÃO"};
        const unreadCount=MSGS.filter(m=>m.unread&&!readMsgs.has(m.id)).length;
        const types=["Todos","Carteira","Plano","Alerta","Promoção"];
        const filtered=MSGS.filter(m=>{
          if(msgFilter==="Todos")return true;
          return typeLabels[m.type]===msgFilter.toUpperCase();
        });
        return <>
          {/* Header da seção */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div>
              <div style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:SANS}}>Mensagens</div>
              <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginTop:1}}>
                {unreadCount>0?`${unreadCount} não lida${unreadCount>1?"s":""}`:"Tudo em dia ✓"}
              </div>
            </div>
            {unreadCount>0&&<button onClick={()=>setReadMsgs(new Set(MSGS.map(m=>m.id)))}
              style={{background:"none",border:`1px solid ${BORDER}`,borderRadius:8,padding:"4px 10px",
                      color:MUTED,fontSize:9,fontFamily:SANS,cursor:"pointer"}}>
              Marcar tudo como lido
            </button>}
          </div>

          {/* Filtros por tipo */}
          <div style={{display:"flex",gap:5,marginBottom:12,overflowX:"auto",paddingBottom:2}}>
            {types.map(t=>{
              const active=msgFilter===t;
              return <button key={t} onClick={()=>setMsgFilter(t)}
                style={{background:active?ACCENT2+"22":SURFACE,
                        border:`1px solid ${active?ACCENT2:BORDER}`,
                        borderRadius:20,padding:"4px 11px",
                        color:active?ACCENT2:MUTED,
                        fontSize:8,fontWeight:active?800:600,
                        fontFamily:SANS,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>
                {t}
              </button>;
            })}
          </div>

          {/* Lista de mensagens */}
          {filtered.map(msg=>{
            const isUnread=msg.unread&&!readMsgs.has(msg.id);
            return <div key={msg.id}
              onClick={()=>setReadMsgs(p=>new Set([...p,msg.id]))}
              style={{background:isUnread?`${msg.color}09`:CARD,
                      border:`1px solid ${isUnread?msg.color+"40":BORDER}`,
                      borderRadius:14,padding:"12px 13px",marginBottom:8,
                      cursor:"pointer",transition:"all .2s",position:"relative"}}>
              {/* Dot indicador não lido */}
              {isUnread&&<div style={{position:"absolute",top:12,right:12,
                width:8,height:8,borderRadius:"50%",background:msg.color,
                boxShadow:`0 0 6px ${msg.color}`}}/>}

              <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                {/* Ícone */}
                <div style={{width:38,height:38,borderRadius:11,flexShrink:0,
                             background:`${msg.color}18`,border:`1px solid ${msg.color}35`,
                             display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>
                  {msg.icon}
                </div>

                <div style={{flex:1,minWidth:0}}>
                  {/* Badge tipo + hora */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{fontSize:7,fontWeight:800,color:msg.color,
                                  letterSpacing:"0.8px",fontFamily:SANS}}>
                      {typeLabels[msg.type]}
                    </span>
                    <span style={{fontSize:8,color:MUTED,fontFamily:SANS}}>{msg.time}</span>
                  </div>

                  {/* Título */}
                  <div style={{fontSize:11,fontWeight:isUnread?900:700,
                               color:isUnread?"#fff":"#cbd5e1",
                               fontFamily:SANS,marginBottom:4,lineHeight:1.3}}>
                    {msg.title}
                  </div>

                  {/* Corpo */}
                  <div style={{fontSize:9,color:isUnread?MUTED:"#7a8ba8",
                               fontFamily:SANS,lineHeight:1.5}}>
                    {msg.body}
                  </div>
                </div>
              </div>
            </div>;
          })}

          {filtered.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:MUTED,fontSize:11,fontFamily:SANS}}>
            Nenhuma mensagem nesta categoria
          </div>}
        </>;
      })()}

    </div>{/* end scroll */}

    {/* BOTTOM NAV */}
    <div style={{flexShrink:0,background:"rgba(7,9,15,.97)",borderTop:`1px solid ${BORDER}`,padding:"7px 8px 4px",display:"flex",justifyContent:"space-around",zIndex:10}}>
      {[{t:"Dashboard",i:"🏠",l:"Home"},{t:"Mercado",i:"📊",l:"Mercado"},{t:"Carteira",i:"💼",l:"Carteira"},{t:"Forum",i:"💬",l:"Comunidade"},{t:"Extrato",i:"📋",l:"Extrato"},{t:"Msgs",i:"✉️",l:"Msgs"}].map(n=>{
        const isExtrato=n.t==="Extrato";
        const isForum=n.t==="Forum";
        const active=isExtrato?showExtrato:isForum?showForum:tab===n.t&&!showExtrato&&!showForum;
        const unread=n.t==="Msgs"?[1,2,3].filter(id=>!readMsgs.has(id)).length:0;
        return <button key={n.t} onClick={()=>{if(isExtrato){setShowForum(false);setShowExtrato(true);}else if(isForum){setShowExtrato(false);setShowForum(true);}else{setShowExtrato(false);setShowForum(false);setTab(n.t);setClub(null);}}} style={{background:"none",border:"none",cursor:"pointer",padding:"3px 4px",display:"flex",flexDirection:"column",alignItems:"center",gap:2,position:"relative"}}>
          <div style={{fontSize:17,transition:"transform .2s",transform:active?"scale(1.15)":"scale(1)"}}>{n.i}</div>
          {unread>0&&<div style={{position:"absolute",top:0,right:2,background:RED,borderRadius:10,minWidth:14,height:14,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:800,color:"#fff",fontFamily:SANS,padding:"0 3px"}}>{unread}</div>}
          <div style={{fontSize:7,fontWeight:700,color:active?ACCENT:MUTED,letterSpacing:"0.3px",fontFamily:SANS}}>{n.l}</div>
          {active&&<div style={{width:4,height:4,borderRadius:"50%",background:ACCENT}}/>}
        </button>;
      })}
    </div>

    {/* ── MODAL DE CONFIRMAÇÃO DE ORDEM ── */}
    {/* ── MODAL DE FEEDBACK (confirmação pelo usuário) ── */}
    {orderFeedback&&(()=>{
      const isOk=orderFeedback.type==="ok";
      const isScheduled=orderFeedback.scheduled;
      const isBuy=orderFeedback.side==="buy";
      const lines=orderFeedback.msg.split("\n");
      const title=lines[0];
      const details=lines.slice(1);
      // cores e ícone por contexto
      const cfg=isOk
        ? isScheduled
          ? {icon:"📅",accent:"#a78bfa",bg:"rgba(139,92,246,.12)",border:"rgba(139,92,246,.35)",btnBg:"linear-gradient(135deg,#6c63ff,#38bdf8)",btnShadow:"rgba(108,99,255,.35)"}
          : isBuy
            ? {icon:"✅",accent:ACCENT,bg:"rgba(108,99,255,.1)",border:"rgba(108,99,255,.3)",btnBg:`linear-gradient(135deg,${ACCENT},#5b52e8)`,btnShadow:"rgba(108,99,255,.35)"}
            : {icon:"💰",accent:RED,bg:"rgba(244,63,94,.1)",border:"rgba(244,63,94,.3)",btnBg:`linear-gradient(135deg,${RED},#cc2244)`,btnShadow:"rgba(244,63,94,.35)"}
        : {icon:"🚫",accent:"#f87171",bg:"rgba(244,63,94,.1)",border:"rgba(244,63,94,.3)",btnBg:"linear-gradient(135deg,#ef4444,#b91c1c)",btnShadow:"rgba(244,63,94,.3)"};
      return <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.82)",zIndex:120,display:"flex",alignItems:"flex-end",backdropFilter:"blur(5px)"}}>
        <div style={{background:CARD,borderRadius:"24px 24px 0 0",padding:"26px 20px 30px",width:"100%",boxSizing:"border-box",boxShadow:"0 -24px 60px rgba(0,0,0,.6)",animation:"slideUp .25s ease"}}>
          <div style={{width:38,height:4,background:"rgba(255,255,255,.12)",borderRadius:2,margin:"0 auto 22px"}}/>

          {/* Ícone central */}
          <div style={{display:"flex",justifyContent:"center",marginBottom:18}}>
            <div style={{width:72,height:72,borderRadius:22,background:cfg.bg,border:`1.5px solid ${cfg.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:34,boxShadow:`0 0 32px ${cfg.accent}30`}}>
              {cfg.icon}
            </div>
          </div>

          {/* Título */}
          <div style={{textAlign:"center",fontSize:18,fontWeight:800,color:"#fff",fontFamily:SANS,letterSpacing:"-0.5px",marginBottom:8}}>
            {title}
          </div>

          {/* Detalhes */}
          {details.length>0&&<div style={{background:cfg.bg,border:`1px solid ${cfg.border}`,borderRadius:14,padding:"12px 16px",marginBottom:22}}>
            {details.map((line,i)=><div key={i} style={{fontSize:12,color:"rgba(255,255,255,.75)",fontFamily:SANS,lineHeight:1.8,textAlign:"center"}}>{line}</div>)}
          </div>}

          {/* Botão de confirmação */}
          <button onClick={()=>setOrderFeedback(null)}
            style={{width:"100%",padding:"16px",borderRadius:18,border:"none",cursor:"pointer",background:cfg.btnBg,color:"#fff",fontSize:15,fontWeight:800,fontFamily:SANS,letterSpacing:"0.2px",boxShadow:`0 8px 28px ${cfg.btnShadow}`}}>
            {isOk?"Obrigado! 👍":"Entendido"}
          </button>
        </div>
      </div>;
    })()}

    {/* ── MODAL DE AGENDAMENTO ── */}
    {scheduleModal&&(()=>{
      const isBuy=scheduleModal.side==="buy";
      const cl=scheduleModal.club;
      const accentCol=isBuy?ACCENT:RED;
      const borderCol=isBuy?"rgba(108,99,255,.3)":"rgba(244,63,94,.3)";
      const priceType=schedulePriceType;
      const setPriceType=setSchedulePriceType;
      const fixedInput=scheduleFixedInput;
      const setFixedInput=setScheduleFixedInput;
      const fixedPrice=parseFloat(fixedInput.replace(",","."));
      const execPrice=priceType==="close"?scheduleModal.closePrice:fixedPrice;
      const totalEstim=isNaN(execPrice)?null:scheduleModal.qty*execPrice;
      const canConfirm=priceType==="close"||(fixedInput&&!isNaN(fixedPrice)&&fixedPrice>0);
      const confirmSchedule=()=>{
        if(!canConfirm) return;
        setScheduledOrders(p=>[...p,{
          id:`sched_${Date.now()}`,
          side:scheduleModal.side,
          ticker:scheduleModal.ticker,
          qty:scheduleModal.qty,
          priceType,
          fixedPrice:priceType==="fixed"?fixedPrice:null,
          closePrice:scheduleModal.closePrice,
          club:scheduleModal.club,
          scheduledAt:new Date().toISOString()
        }]);
        setScheduleModal(null);
        showFb("ok",`Ordem agendada!\n${scheduleModal.qty}× ${scheduleModal.ticker} · ${priceType==="close"?"Preço de fechamento":`Limite FS$${fixedPrice.toFixed(2)}`}\nExecução na abertura do mercado`,isBuy?"buy":"sell",{scheduled:true});
      };
      return <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.8)",zIndex:100,display:"flex",alignItems:"flex-end",backdropFilter:"blur(4px)"}}
        onClick={()=>setScheduleModal(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:"#111825",borderRadius:"24px 24px 0 0",padding:"22px 18px 30px",width:"100%",boxSizing:"border-box",boxShadow:"0 -30px 80px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.05)",animation:"slideUp .25s ease"}}>
          <div style={{width:36,height:4,background:BORDER,borderRadius:2,margin:"0 auto 18px",opacity:.6}}/>

          {/* Header */}
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
            <div style={{width:42,height:42,borderRadius:13,background:"rgba(108,99,255,.12)",border:"1px solid rgba(108,99,255,.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>📅</div>
            <div>
              <div style={{fontSize:16,fontWeight:700,color:"#fff",fontFamily:SANS}}>Agendar {isBuy?"Compra":"Venda"}</div>
              <div style={{fontSize:10,color:"#a78bfa",fontFamily:SANS,fontWeight:600}}>Execução na abertura · 11h00 (Brasília)</div>
            </div>
          </div>

          {/* Clube */}
          <div style={{background:isBuy?"rgba(108,99,255,.07)":"rgba(244,63,94,.07)",border:`1px solid ${borderCol}`,borderRadius:14,padding:"12px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:36,height:36,borderRadius:12,background:`linear-gradient(145deg,${cl.color}dd,${cl.color}88)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:cl.c2,flexShrink:0}}>{cl.ticker.replace(/\d/g,"")}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:SANS}}>{cl.name}</div>
              <div style={{fontSize:9,color:MUTED,fontFamily:MONO}}>{cl.ticker} · {scheduleModal.qty} cota{scheduleModal.qty!==1?"s":""}</div>
            </div>
            <div style={{background:isBuy?"rgba(108,99,255,.15)":"rgba(244,63,94,.15)",border:`1px solid ${borderCol}`,borderRadius:8,padding:"3px 10px",fontSize:10,fontWeight:900,color:accentCol,fontFamily:SANS}}>
              {isBuy?"COMPRA":"VENDA"}
            </div>
          </div>

          {/* Valor de fechamento */}
          <div style={{background:"rgba(245,166,35,.08)",border:"1px solid rgba(245,166,35,.22)",borderRadius:11,padding:"8px 12px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:9,color:"#f5a623",fontFamily:SANS,fontWeight:700}}>💰 PREÇO DE FECHAMENTO ATUAL</span>
            <span style={{fontSize:13,fontWeight:900,color:"#f5a623",fontFamily:MONO}}>FS${scheduleModal.closePrice.toFixed(2)}</span>
          </div>

          {/* Seletor de tipo de preço */}
          <div style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:"1px",fontFamily:SANS,marginBottom:8}}>TIPO DE PREÇO</div>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            {[{id:"close",label:"Preço de fechamento",sub:"Usa o último preço registrado"},{id:"fixed",label:"Preço limite",sub:"Define um valor máximo/mínimo"}].map(opt=>(
              <div key={opt.id} onClick={()=>setPriceType(opt.id)} style={{flex:1,padding:"11px 10px",borderRadius:12,border:`1.5px solid ${priceType===opt.id?accentCol:"rgba(255,255,255,.1)"}`,background:priceType===opt.id?(isBuy?"rgba(108,99,255,.08)":"rgba(244,63,94,.08)"):"rgba(255,255,255,.03)",cursor:"pointer",transition:"all .15s"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                  <div style={{width:14,height:14,borderRadius:"50%",border:`2px solid ${priceType===opt.id?accentCol:"rgba(255,255,255,.2)"}`,background:priceType===opt.id?accentCol:"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {priceType===opt.id&&<div style={{width:5,height:5,borderRadius:"50%",background:isBuy?BG:"#fff"}}/>}
                  </div>
                  <span style={{fontSize:10,fontWeight:800,color:priceType===opt.id?"#fff":"rgba(255,255,255,.5)",fontFamily:SANS}}>{opt.label}</span>
                </div>
                <div style={{fontSize:8,color:priceType===opt.id?"rgba(255,255,255,.5)":"rgba(255,255,255,.25)",fontFamily:SANS,paddingLeft:20}}>{opt.sub}</div>
              </div>
            ))}
          </div>

          {/* Campo de preço fixo */}
          {priceType==="fixed"&&<div style={{marginBottom:14}}>
            <div style={{fontSize:9,color:MUTED,fontWeight:700,letterSpacing:"1px",fontFamily:SANS,marginBottom:6}}>
              {isBuy?"PREÇO MÁXIMO POR COTA (FS$)":"PREÇO MÍNIMO POR COTA (FS$)"}
            </div>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:11,color:MUTED,fontFamily:MONO,pointerEvents:"none"}}>FS$</span>
              <input
                placeholder={scheduleModal.closePrice.toFixed(2)}
                value={fixedInput}
                onChange={e=>setFixedInput(e.target.value.replace(/[^0-9.,]/g,""))}
                inputMode="decimal"
                style={{width:"100%",background:"rgba(255,255,255,.05)",border:`1.5px solid ${fixedInput&&isNaN(fixedPrice)?"rgba(244,63,94,.45)":fixedInput?accentCol:"rgba(255,255,255,.08)"}`,borderRadius:12,padding:"13px 14px 13px 42px",color:"#fff",fontSize:14,fontWeight:700,fontFamily:MONO,outline:"none",boxSizing:"border-box",caretColor:accentCol}}
              />
            </div>
            {fixedInput&&!isNaN(fixedPrice)&&fixedPrice>0&&(()=>{
              const diff=((fixedPrice-scheduleModal.closePrice)/scheduleModal.closePrice*100);
              const isHigh=isBuy?diff>2:diff<-2;
              return <div style={{fontSize:9,color:isHigh?"#fb923c":"rgba(255,255,255,.4)",fontFamily:SANS,marginTop:5,display:"flex",gap:4,alignItems:"center"}}>
                {isHigh?"⚠":"ℹ"} {diff>0?"+":""}{diff.toFixed(1)}% em relação ao fechamento
                {isHigh&&<span>— {isBuy?"acima":"abaixo"} do esperado</span>}
              </div>;
            })()}
          </div>}

          {/* Resumo estimado */}
          {totalEstim&&(()=>{
            const fee=calcFee(totalEstim);
            const netTotal=isBuy?+(totalEstim+fee).toFixed(2):+(totalEstim-fee).toFixed(2);
            const balAfter=isBuy?+(balance-netTotal).toFixed(2):+(balance+netTotal).toFixed(2);
            const insuf=isBuy&&netTotal>balance;
            return <div style={{background:"rgba(255,255,255,.04)",border:`1px solid ${insuf?"rgba(244,63,94,.3)":"rgba(255,255,255,.08)"}`,borderRadius:13,padding:"12px 14px",marginBottom:14}}>
              {[
                {l:"Subtotal",v:`FS$${totalEstim.toLocaleString("pt-BR",{minimumFractionDigits:2})}`,c:"rgba(255,255,255,.7)"},
                {l:"Taxa operacional",v:`FS$${fee.toFixed(2)}`,c:"#f5a623",tag:true},
                {l:isBuy?"Total a debitar":"Total a receber",v:`FS$${netTotal.toLocaleString("pt-BR",{minimumFractionDigits:2})}`,c:accentCol,bold:true},
                {l:"Saldo disponível",v:`FS$${balance.toLocaleString("pt-BR",{minimumFractionDigits:2})}`,c:insuf?"#f43f5e":"rgba(255,255,255,.5)"},
                ...(insuf?[{l:"Saldo após operação",v:"Saldo insuficiente",c:"#f43f5e",bold:true}]:[{l:"Saldo após operação",v:`FS$${balAfter.toLocaleString("pt-BR",{minimumFractionDigits:2})}`,c:"rgba(255,255,255,.6)"}]),
              ].map((row,i,arr)=><div key={row.l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:i<arr.length-1?7:0,marginBottom:i<arr.length-1?7:0,borderBottom:i===1||i===arr.length-2?`1px solid rgba(255,255,255,.06)`:"none"}}>
                <span style={{fontSize:9,color:MUTED,fontFamily:SANS,display:"flex",alignItems:"center",gap:5}}>
                  {row.tag&&<span style={{background:"rgba(245,166,35,.2)",color:"#f5a623",borderRadius:4,padding:"1px 5px",fontSize:7,fontWeight:800}}>TAXA</span>}
                  {row.l}
                </span>
                <span style={{fontSize:row.bold?12:10,fontWeight:row.bold?900:600,color:row.c,fontFamily:MONO}}>{row.tag&&"−"}{row.v}</span>
              </div>)}
            </div>;
          })()}

          {/* Aviso */}
          <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:18,background:"rgba(139,92,246,.07)",border:"1px solid rgba(139,92,246,.22)",borderRadius:10,padding:"9px 12px"}}>
            <span style={{fontSize:13,flexShrink:0}}>⚡</span>
            <span style={{fontSize:9,color:"rgba(200,195,255,.8)",fontFamily:SANS,lineHeight:1.7}}>A ordem será executada automaticamente na <strong style={{color:"#fff"}}>abertura do mercado (11h00)</strong>. Se não houver cotas disponíveis ou o preço limite não for atingido, a ordem será <strong style={{color:"#f43f5e"}}>cancelada automaticamente</strong> e você será notificado.</span>
          </div>

          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setScheduleModal(null)} style={{flex:1,padding:"14px",borderRadius:14,border:`1px solid ${BORDER}`,background:SURFACE,color:MUTED,fontSize:13,fontWeight:800,fontFamily:SANS,cursor:"pointer"}}>
              Cancelar
            </button>
            <button onClick={confirmSchedule} disabled={!canConfirm}
              style={{flex:2,padding:"14px",borderRadius:14,border:"none",cursor:canConfirm?"pointer":"default",background:canConfirm?"linear-gradient(135deg,#6c63ff,#38bdf8)":"rgba(108,99,255,.12)",color:canConfirm?"#fff":"rgba(255,255,255,.25)",fontSize:14,fontWeight:700,fontFamily:SANS,boxShadow:canConfirm?"0 6px 24px rgba(108,99,255,.35)":"none",transition:"all .2s"}}>
              📅 Agendar {isBuy?"Compra":"Venda"}
            </button>
          </div>
        </div>
      </div>;
    })()}

    {/* ── UPGRADE MODAL ── */}
    {upgradeModal&&(()=>{
      const isPlanCraque=upgradeModal.targetPlan==="Craque";
      const planData=isPlanCraque
        ?{name:"Craque",price:"R$19,90/mês",color:ACCENT,icon:"⭐",gradient:"linear-gradient(135deg,#6c63ff,#38bdf8)",features:["Ordem Precificada 🎯","FS$5.000 adicional","5 ordens/dia","IA básica"],cta:"Assinar Craque"}
        :{name:"Lenda",price:"R$39,90/mês",color:GOLD,icon:"👑",gradient:"linear-gradient(135deg,#f5a623,#e8830a)",features:["Short Selling 📉","Stop Loss / Take Profit 🛡","Ordem Precificada 🎯","FS$25.000 adicional","Ilimitado","IA VIP"],cta:"Assinar Lenda"};
      const currentPlan=user?.plan||"Jogador";
      return <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.82)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)",padding:"0 20px"}}
        onClick={()=>setUpgradeModal(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:"linear-gradient(160deg,#0d1120,#080b12)",border:`1.5px solid ${planData.color}55`,borderRadius:24,padding:"26px 22px",width:"100%",boxSizing:"border-box",boxShadow:`0 0 60px ${planData.color}30, 0 30px 80px rgba(0,0,0,.6)`,animation:"slideUp .22s ease",position:"relative",overflow:"hidden"}}>
          {/* Glow bg */}
          <div style={{position:"absolute",top:-60,right:-60,width:180,height:180,background:`radial-gradient(circle,${planData.color}20,transparent 70%)`,borderRadius:"50%",pointerEvents:"none"}}/>
          {/* Close */}
          <button onClick={()=>setUpgradeModal(null)} style={{position:"absolute",top:14,right:14,width:28,height:28,borderRadius:"50%",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.5)",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>

          {/* Header */}
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18}}>
            <div style={{width:52,height:52,borderRadius:16,background:planData.gradient,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0,boxShadow:`0 6px 20px ${planData.color}45`}}>{planData.icon}</div>
            <div>
              <div style={{fontSize:9,color:"rgba(255,255,255,.6)",fontWeight:700,letterSpacing:"1.5px",fontFamily:SANS,marginBottom:3}}>UPGRADE NECESSÁRIO</div>
              <div style={{fontSize:18,fontWeight:800,color:"#fff",fontFamily:SANS,letterSpacing:"-0.5px",lineHeight:1.1}}>Plano <span style={{background:planData.gradient,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>{planData.name}</span></div>
              <div style={{fontSize:11,fontWeight:700,color:planData.color,fontFamily:SANS,marginTop:2}}>{planData.price}</div>
            </div>
          </div>

          {/* Feature highlight */}
          <div style={{background:`${planData.color}12`,border:`1px solid ${planData.color}35`,borderRadius:14,padding:"11px 14px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18,flexShrink:0}}>🔒</span>
            <div>
              <div style={{fontSize:9,color:"rgba(255,255,255,.6)",fontFamily:SANS,fontWeight:700,letterSpacing:"0.8px",marginBottom:2}}>VOCÊ TENTOU USAR</div>
              <div style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:SANS}}>{upgradeModal.feature}</div>
              <div style={{fontSize:9,color:planData.color,fontFamily:SANS,marginTop:2}}>Disponível a partir do Plano {planData.name}</div>
            </div>
          </div>

          {/* Features list */}
          <div style={{marginBottom:20}}>
            <div style={{fontSize:8,color:"rgba(255,255,255,.5)",fontWeight:700,letterSpacing:"1px",fontFamily:SANS,marginBottom:8}}>INCLUÍDO NO PLANO {planData.name.toUpperCase()}</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {planData.features.map((f,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:16,height:16,borderRadius:"50%",background:`${planData.color}25`,border:`1px solid ${planData.color}50`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:8,color:planData.color,fontWeight:900}}>✓</span>
                </div>
                <span style={{fontSize:11,color:"rgba(255,255,255,.8)",fontFamily:SANS}}>{f}</span>
              </div>)}
            </div>
          </div>

          {/* Plan comparison pill */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:18}}>
            <div style={{padding:"4px 10px",borderRadius:20,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",fontSize:9,color:"rgba(255,255,255,.6)",fontFamily:SANS,fontWeight:700}}>{currentPlan}</div>
            <span style={{fontSize:12,color:"rgba(255,255,255,.45)"}}>→</span>
            <div style={{padding:"4px 10px",borderRadius:20,background:planData.gradient,fontSize:9,color:isPlanCraque?BG:"#1a0800",fontFamily:SANS,fontWeight:900}}>{planData.name} {planData.icon}</div>
          </div>

          {/* CTA */}
          <button onClick={()=>{setUpgradeModal(null);onUpgrade&&onUpgrade(isPlanCraque?"Craque":"Lenda",userPlan,(plan,bil)=>applyUpgrade(plan==="craque"?"Craque":"Lenda",bil||"monthly"));}} style={{width:"100%",padding:"15px",borderRadius:16,border:"none",cursor:"pointer",background:planData.gradient,color:isPlanCraque?BG:"#1a0800",fontSize:14,fontWeight:800,fontFamily:SANS,boxShadow:`0 8px 28px ${planData.color}45`,marginBottom:10}}>
            {planData.cta} →
          </button>
          <button onClick={()=>setUpgradeModal(null)} style={{width:"100%",padding:"10px",borderRadius:12,border:"1px solid rgba(255,255,255,.1)",background:"transparent",color:"rgba(255,255,255,.55)",fontSize:11,fontWeight:700,fontFamily:SANS,cursor:"pointer"}}>
            Agora não
          </button>
        </div>
      </div>;
    })()}

    {orderConfirm&&(()=>{
      const isBuy=orderConfirm.side==="buy";
      const cl=orderConfirm.club;
      const accentCol=isBuy?ACCENT:RED;
      const gradBg=isBuy?"linear-gradient(135deg,rgba(108,99,255,.12),rgba(108,99,255,.04))":"linear-gradient(135deg,rgba(244,63,94,.12),rgba(244,63,94,.04))";
      const borderCol=isBuy?"rgba(108,99,255,.3)":"rgba(244,63,94,.3)";
      const mktPrice=isBuy?(orderConfirm.ask||orderConfirm.price):(orderConfirm.bid||orderConfirm.price);
      const limitPrice=parseFloat(limitPriceInput.replace(",","."));
      const limitValid=!isNaN(limitPrice)&&limitPrice>0;
      const limitDiff=limitValid?+((limitPrice-mktPrice)/mktPrice*100).toFixed(2):null;
      const limitWarn=limitValid&&(isBuy?limitDiff>5:limitDiff<-5);
      // OCO calcs
      const ocoSLVal=parseFloat(ocoSL.replace(",","."));
      const ocoTPVal=parseFloat(ocoTP.replace(",","."));
      const ocoSLPrice=ocoMode==="pct"?+(mktPrice*(1-ocoSLVal/100)).toFixed(2):ocoSLVal;
      const ocoTPPrice=ocoMode==="pct"?+(mktPrice*(1+ocoTPVal/100)).toFixed(2):ocoTPVal;
      const ocoSLValid=!isNaN(ocoSLVal)&&ocoSLVal>0&&ocoSLPrice<mktPrice;
      const ocoTPValid=!isNaN(ocoTPVal)&&ocoTPVal>0&&ocoTPPrice>mktPrice;
      const ocoAtLeastOne=ocoSLValid||ocoTPValid;
      // preço e total efetivos conforme tipo
      const execPrice=orderType==="fast"?mktPrice:(limitValid?limitPrice:mktPrice);
      const execTotal=orderConfirm.qty*execPrice;
      const fee=calcFee(execTotal);
      const netTotal=isBuy?+(execTotal+fee).toFixed(2):+(execTotal-fee).toFixed(2);
      const balAfter=isBuy?+(balance-netTotal).toFixed(2):+(balance+netTotal).toFixed(2);
      const shortQtyNum=Math.max(1,parseInt(shortQtyInput)||1);
      const shortNotionalCalc=shortQtyNum*mktPrice;
      const shortMarginCalc=+(shortNotionalCalc*1.5).toFixed(2);
      const canShortConfirm=shortMarginCalc+calcFee(shortNotionalCalc)<=balance;
      const canConfirm=orderType==="fast"||(orderType==="limit"&&limitValid)||(orderType==="oco"&&ocoAtLeastOne)||(orderType==="short"&&canShortConfirm)||orderType==="short_close";

      const confirm=()=>{
        if(orderType==="short"){
          executeShortOpen(orderConfirm.ticker,shortQtyNum,mktPrice);
          setOrderConfirm(null);
          setTab("Mercado");setClub(null);
          return;
        }
        if(orderType==="short_close"){
          executeShortClose(orderConfirm.ticker,orderConfirm.qty,mktPrice);
          setOrderConfirm(null);
          setTab("Mercado");setClub(null);
          return;
        }
        if(orderType==="fast"){
          if(isBuy) executeBuy(orderConfirm.ticker,orderConfirm.qty,mktPrice);
          else executeSell(orderConfirm.ticker,orderConfirm.qty,mktPrice);
        } else if(orderType==="limit"){
          const o={
            id:`lo${Date.now()}`,side:orderConfirm.side,ticker:orderConfirm.ticker,
            qty:orderConfirm.qty,limitPrice,club:cl,
            mktPrice,status:"pending",createdAt:new Date().toISOString(),
          };
          setLimitedOrders(p=>[o,...p]);
          showFb("ok",`Ordem precificada registrada!\n${orderConfirm.qty}× ${orderConfirm.ticker} · Limite FS$${limitPrice.toFixed(2)}\nAguardando o mercado atingir seu preço.`,"buy",{scheduled:true});
        } else if(orderType==="oco"){
          const o={
            id:`oco${Date.now()}`,side:"sell",ticker:orderConfirm.ticker,
            qty:orderConfirm.qty,club:cl,mktPrice,
            slPrice:ocoSLValid?ocoSLPrice:null,
            tpPrice:ocoTPValid?ocoTPPrice:null,
            slPct:ocoSLValid?ocoSLVal:null,
            tpPct:ocoTPValid?ocoTPVal:null,
            ocoMode,status:"pending",createdAt:new Date().toISOString(),
          };
          setOcoOrders(p=>[o,...p]);
          const parts=[ocoSLValid?`🛑 SL FS$${ocoSLPrice.toFixed(2)}`:"",ocoTPValid?`🎯 TP FS$${ocoTPPrice.toFixed(2)}`:""].filter(Boolean).join(" · ");
          showFb("ok",`OCO registrado!\n${orderConfirm.qty}× ${orderConfirm.ticker}\n${parts}`,"sell",{scheduled:true});
        }
        setOrderConfirm(null);
        setTab("Mercado");setClub(null);
      };

      return <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.8)",zIndex:100,display:"flex",alignItems:"flex-end",backdropFilter:"blur(10px)"}}
        onClick={()=>setOrderConfirm(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:"#111825",borderRadius:"24px 24px 0 0",padding:"22px 18px 28px",width:"100%",boxSizing:"border-box",boxShadow:"0 -30px 80px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.05)",animation:"slideUp .25s ease",maxHeight:"90vh",overflowY:"auto"}}>
          <div style={{width:36,height:4,background:BORDER,borderRadius:2,margin:"0 auto 18px",opacity:.6}}/>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
            <div style={{width:40,height:40,borderRadius:12,background:isBuy?"rgba(108,99,255,.15)":"rgba(244,63,94,.15)",border:`1px solid ${borderCol}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>
              {isBuy?"▲":"▼"}
            </div>
            <div>
              <div style={{fontSize:16,fontWeight:700,color:"#fff",fontFamily:SANS}}>{orderType==="short"?"Abrir Short":orderType==="short_close"?"Fechar Short":isBuy?"Confirmar Compra":"Confirmar Venda"}</div>
              <div style={{fontSize:11,color:MUTED,fontFamily:SANS}}>Revise os detalhes antes de confirmar</div>
            </div>
          </div>

          {/* ── TIPO DE ORDEM ── */}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:8,color:MUTED,fontWeight:800,letterSpacing:"1px",fontFamily:SANS,marginBottom:8}}>TIPO DE ORDEM</div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {[
                {id:"fast",  ico:"⚡", title:"Rápida",     sub:"Executa imediatamente pelo melhor preço do book", always:true},
                {id:"limit", ico:"🎯", title:"Precificada", sub:"Executa somente se o mercado atingir seu preço",  craque:true, lenda:true},
                {id:"oco",   ico:"🛡", title:"Stop Loss / Take Profit", sub:"Venda automática por proteção (SL) ou realização (TP) — OCO", lenda:true, sellOnly:true},
                {id:"short", ico:"📉", title:"Short (Venda a Descoberto)", sub:"Lucre com a queda: alugue, venda e recompre mais barato", lenda:true, buyOnly:false, shortCard:true},
              ].map(t=>{
                const active=orderType===t.id;
                const disabled=t.sellOnly&&isBuy;
                const isShortCard=t.id==="short";
                const cardColor=isShortCard?RED:t.id==="oco"?GOLD:accentCol;
                // locked: user doesn't have required plan
                const locked=(t.lenda&&!isLenda)||(t.craque&&!t.lenda&&!isCraque);
                const lockedLenda=t.lenda&&!isLenda;
                const lockedCraque=t.craque&&!isCraque;
                const targetUpgradePlan=lockedLenda?"Lenda":lockedCraque?"Craque":null;
                return <div key={t.id}
                  onClick={()=>{
                    if(locked&&targetUpgradePlan){setUpgradeModal({targetPlan:targetUpgradePlan,feature:t.title});return;}
                    if(disabled) return;
                    setOrderType(t.id);
                    if(t.id!=="limit") setLimitPriceInput("");
                    if(t.id!=="oco"){setOcoSL("");setOcoTP("");}
                    if(t.id!=="short") setShortQtyInput("1");
                  }}
                  style={{padding:"10px 12px",borderRadius:12,border:`1.5px solid ${locked?"rgba(255,255,255,.08)":disabled?"rgba(255,255,255,.06)":active?cardColor:isShortCard?"rgba(244,63,94,.2)":t.id==="oco"?"rgba(245,166,35,.2)":BORDER}`,background:locked?"rgba(255,255,255,.02)":disabled?"rgba(255,255,255,.02)":active?(isShortCard?"rgba(244,63,94,.08)":t.id==="oco"?"rgba(245,166,35,.08)":isBuy?"rgba(108,99,255,.1)":"rgba(244,63,94,.08)"):(isShortCard?"rgba(244,63,94,.03)":t.id==="oco"?"rgba(245,166,35,.03)":"rgba(255,255,255,.02)"),cursor:locked?"pointer":disabled?"not-allowed":"pointer",transition:"all .15s",opacity:locked?.55:disabled?.45:1,position:"relative"}}>
                  <div style={{display:"flex",alignItems:"center",gap:7}}>
                    <span style={{fontSize:15,flexShrink:0,filter:locked?"grayscale(1) opacity(0.5)":"none"}}>{t.ico}</span>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                        <span style={{fontSize:11,fontWeight:900,color:locked?"rgba(255,255,255,.35)":disabled?"rgba(255,255,255,.3)":active?"#fff":"rgba(255,255,255,.6)",fontFamily:SANS}}>{t.title}</span>
                        {t.craque&&<span style={{fontSize:7,background:"rgba(108,99,255,.12)",color:ACCENT,borderRadius:4,padding:"1px 5px",fontWeight:800,fontFamily:SANS}}>⭐ CRAQUE</span>}
                        {t.lenda&&<span style={{fontSize:7,background:isLenda?"rgba(245,166,35,.18)":"rgba(245,166,35,.28)",color:GOLD,borderRadius:4,padding:"1px 5px",fontWeight:800,fontFamily:SANS}}>👑 LENDA</span>}
                        {t.sellOnly&&isBuy&&<span style={{fontSize:7,color:"rgba(255,255,255,.45)",fontFamily:SANS}}>· apenas na venda</span>}
                      </div>
                      <div style={{fontSize:8,color:locked?"rgba(255,255,255,.25)":MUTED,fontFamily:SANS,marginTop:2,lineHeight:1.4}}>{locked?`🔒 Exclusivo Plano ${targetUpgradePlan} — toque para fazer upgrade`:t.sub}</div>
                    </div>
                    <div style={{width:18,height:18,borderRadius:"50%",border:`2px solid ${locked?"rgba(255,255,255,.1)":disabled?"rgba(255,255,255,.1)":active?cardColor:BORDER}`,background:locked?"rgba(255,255,255,.06)":active?cardColor:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .15s"}}>
                      {locked?<span style={{fontSize:9}}>🔒</span>:active&&<span style={{fontSize:9,color:"#fff",fontWeight:900}}>✓</span>}
                    </div>
                  </div>
                </div>;
              })}
            </div>
          </div>

          {/* ── CAMPO PREÇO LIMITE ── */}
          {orderType==="limit"&&<div style={{marginBottom:14}}>
            <div style={{fontSize:8,color:MUTED,fontWeight:800,letterSpacing:"1px",fontFamily:SANS,marginBottom:8}}>PREÇO LIMITE</div>
            <div style={{background:SURFACE,border:`1.5px solid ${limitValid?(limitWarn?GOLD:accentCol):BORDER}`,borderRadius:12,padding:"10px 13px",display:"flex",alignItems:"center",gap:10,transition:"border-color .15s"}}>
              <span style={{fontSize:12,color:MUTED,fontFamily:SANS}}>FS$</span>
              <input
                type="number" step="0.01" min="0.01"
                value={limitPriceInput}
                onChange={e=>setLimitPriceInput(e.target.value)}
                placeholder={mktPrice.toFixed(2)}
                style={{flex:1,background:"transparent",border:"none",color:"#fff",fontSize:16,fontWeight:800,fontFamily:MONO,outline:"none"}}
              />
              {limitValid&&<div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:10,fontWeight:800,color:limitDiff>0?ACCENT:RED,fontFamily:MONO}}>{limitDiff>0?"+":""}{limitDiff}%</div>
                <div style={{fontSize:7,color:MUTED,fontFamily:SANS}}>vs mercado</div>
              </div>}
            </div>
            <div style={{marginTop:6,display:"flex",gap:6}}>
              {[mktPrice*.98,mktPrice,mktPrice*1.02].map((p,i)=>(
                <button key={i} onClick={()=>setLimitPriceInput(p.toFixed(2))} style={{flex:1,padding:"4px",borderRadius:8,border:`1px solid ${BORDER}`,background:"rgba(255,255,255,.04)",color:MUTED,fontSize:8,fontWeight:700,cursor:"pointer",fontFamily:MONO}}>
                  {i===0?"-2%":i===1?"Atual":"+2%"}<br/>
                  <span style={{color:"#fff",fontSize:9}}>{p.toFixed(2)}</span>
                </button>
              ))}
            </div>
            {limitWarn&&<div style={{marginTop:6,display:"flex",gap:6,background:"rgba(245,166,35,.07)",border:"1px solid rgba(245,166,35,.2)",borderRadius:8,padding:"6px 9px",alignItems:"center"}}>
              <span style={{fontSize:12}}>⚠️</span>
              <span style={{fontSize:8,color:"#d4a017",fontFamily:SANS,lineHeight:1.5}}>Preço {isBuy?"acima":"abaixo"} de 5% do mercado. A ordem pode demorar para executar.</span>
            </div>}
            <div style={{marginTop:6,fontSize:8,color:MUTED,fontFamily:SANS,lineHeight:1.5}}>
              Preço atual: <span style={{color:"#fff",fontWeight:700,fontFamily:MONO}}>FS${mktPrice.toFixed(2)}</span>
              {isBuy?" · Executa se ASK ≤ limite":" · Executa se BID ≥ limite"}
            </div>
          </div>}

          {/* ── PAINEL OCO: STOP LOSS / TAKE PROFIT ── */}
          {orderType==="oco"&&(()=>{
            const slVal=parseFloat(ocoSL.replace(",","."));
            const tpVal=parseFloat(ocoTP.replace(",","."));
            const slValid=!isNaN(slVal)&&slVal>0&&slVal<mktPrice;
            const tpValid=!isNaN(tpVal)&&tpVal>0&&tpVal>mktPrice;
            const slPct=slValid?+((slVal-mktPrice)/mktPrice*100).toFixed(2):null;
            const tpPct=tpValid?+((tpVal-mktPrice)/mktPrice*100).toFixed(2):null;
            const pctToPrice=pct=>+(mktPrice*(1+pct/100)).toFixed(2);
            return <div style={{marginBottom:14}}>
              {/* Modo de input */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <div style={{fontSize:8,color:MUTED,fontWeight:800,letterSpacing:"1px",fontFamily:SANS}}>DEFINIR GATILHOS</div>
                <div style={{display:"flex",background:SURFACE,borderRadius:8,border:`1px solid ${BORDER}`,overflow:"hidden"}}>
                  {[{id:"pct",l:"%"},{id:"price",l:"FS$"}].map(m=>(
                    <button key={m.id} onClick={()=>{setOcoMode(m.id);setOcoSL("");setOcoTP("");}} style={{padding:"3px 10px",border:"none",background:ocoMode===m.id?"rgba(245,166,35,.2)":"transparent",color:ocoMode===m.id?GOLD:MUTED,fontSize:9,fontWeight:800,cursor:"pointer",fontFamily:SANS}}>{m.l}</button>
                  ))}
                </div>
              </div>

              {/* Stop Loss */}
              <div style={{marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                  <span style={{fontSize:10}}>🛑</span>
                  <span style={{fontSize:9,fontWeight:800,color:"#fff",fontFamily:SANS}}>Stop Loss</span>
                  <span style={{fontSize:8,color:MUTED,fontFamily:SANS}}>— vende se o preço cair até</span>
                  {slValid&&<span style={{marginLeft:"auto",fontSize:9,fontWeight:700,color:RED,fontFamily:MONO}}>{slPct}%</span>}
                </div>
                <div style={{background:SURFACE,border:`1.5px solid ${slValid?RED:BORDER}`,borderRadius:10,padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:10,color:MUTED,fontFamily:SANS,flexShrink:0}}>{ocoMode==="pct"?"−%":"FS$"}</span>
                  <input type="number" step={ocoMode==="pct"?"0.1":"0.01"} min="0.01"
                    value={ocoSL} onChange={e=>setOcoSL(e.target.value)}
                    placeholder={ocoMode==="pct"?"ex: 5":"ex: "+pctToPrice(-5)}
                    style={{flex:1,background:"transparent",border:"none",color:"#fff",fontSize:14,fontWeight:800,fontFamily:MONO,outline:"none"}}/>
                  {slValid&&<span style={{fontSize:9,color:RED,fontFamily:MONO,flexShrink:0}}>FS${ocoMode==="pct"?pctToPrice(-slVal).toFixed(2):slVal.toFixed(2)}</span>}
                </div>
                <div style={{display:"flex",gap:5,marginTop:5}}>
                  {[3,5,10].map(p=>(
                    <button key={p} onClick={()=>setOcoSL(ocoMode==="pct"?String(p):pctToPrice(-p).toFixed(2))} style={{flex:1,padding:"3px",borderRadius:6,border:`1px solid rgba(244,63,94,.2)`,background:"rgba(244,63,94,.06)",color:"#f87171",fontSize:8,fontWeight:700,cursor:"pointer",fontFamily:MONO}}>−{p}%<br/><span style={{color:"rgba(255,255,255,.6)",fontSize:7}}>FS${pctToPrice(-p).toFixed(2)}</span></button>
                  ))}
                </div>
              </div>

              {/* Take Profit */}
              <div>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                  <span style={{fontSize:10}}>🎯</span>
                  <span style={{fontSize:9,fontWeight:800,color:"#fff",fontFamily:SANS}}>Take Profit</span>
                  <span style={{fontSize:8,color:MUTED,fontFamily:SANS}}>— vende se o preço subir até</span>
                  {tpValid&&<span style={{marginLeft:"auto",fontSize:9,fontWeight:700,color:ACCENT,fontFamily:MONO}}>+{tpPct}%</span>}
                </div>
                <div style={{background:SURFACE,border:`1.5px solid ${tpValid?ACCENT:BORDER}`,borderRadius:10,padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:10,color:MUTED,fontFamily:SANS,flexShrink:0}}>{ocoMode==="pct"?"+%":"FS$"}</span>
                  <input type="number" step={ocoMode==="pct"?"0.1":"0.01"} min="0.01"
                    value={ocoTP} onChange={e=>setOcoTP(e.target.value)}
                    placeholder={ocoMode==="pct"?"ex: 10":"ex: "+pctToPrice(10)}
                    style={{flex:1,background:"transparent",border:"none",color:"#fff",fontSize:14,fontWeight:800,fontFamily:MONO,outline:"none"}}/>
                  {tpValid&&<span style={{fontSize:9,color:ACCENT,fontFamily:MONO,flexShrink:0}}>FS${ocoMode==="pct"?pctToPrice(tpVal).toFixed(2):tpVal.toFixed(2)}</span>}
                </div>
                <div style={{display:"flex",gap:5,marginTop:5}}>
                  {[5,10,20].map(p=>(
                    <button key={p} onClick={()=>setOcoTP(ocoMode==="pct"?String(p):pctToPrice(p).toFixed(2))} style={{flex:1,padding:"3px",borderRadius:6,border:`1px solid rgba(108,99,255,.2)`,background:"rgba(108,99,255,.06)",color:ACCENT,fontSize:8,fontWeight:700,cursor:"pointer",fontFamily:MONO}}>+{p}%<br/><span style={{color:"rgba(255,255,255,.6)",fontSize:7}}>FS${pctToPrice(p).toFixed(2)}</span></button>
                  ))}
                </div>
              </div>

              <div style={{marginTop:8,display:"flex",gap:6,background:"rgba(245,166,35,.06)",border:"1px solid rgba(245,166,35,.18)",borderRadius:8,padding:"6px 9px",alignItems:"flex-start"}}>
                <span style={{fontSize:11,flexShrink:0}}>💡</span>
                <span style={{fontSize:8,color:"#d4a017",fontFamily:SANS,lineHeight:1.5}}>OCO — One Cancels Other: ao disparar um gatilho, o outro é automaticamente cancelado. Taxa cobrada somente na execução.</span>
              </div>
            </div>;
          })()}

          {/* ── PAINEL SHORT SELLING ── */}
          {orderType==="short"&&(()=>{
            const shortQty=Math.max(1,parseInt(shortQtyInput)||1);
            const shortNotional=shortQty*mktPrice;
            const shortMargin=+(shortNotional*1.5).toFixed(2);
            const shortFee=calcFee(shortNotional);
            const shortLoanPerDay=+(shortNotional*0.005).toFixed(2);
            const canShort=shortMargin+shortFee<=balance;
            const existingShort=shortPositions[orderConfirm?.ticker];
            return <div style={{marginBottom:14}}>
              {existingShort&&<div style={{background:"rgba(244,63,94,.08)",border:"1px solid rgba(244,63,94,.3)",borderRadius:12,padding:"10px 12px",marginBottom:10,display:"flex",alignItems:"center",gap:9}}>
                <span style={{fontSize:14}}>📉</span>
                <div>
                  <div style={{fontSize:9,fontWeight:800,color:RED,fontFamily:SANS}}>POSIÇÃO SHORT ABERTA</div>
                  <div style={{fontSize:10,color:"#fff",fontFamily:MONO,marginTop:2}}>{existingShort.qty} cotas · Entrada FS${existingShort.entryPrice.toFixed(2)}</div>
                  <div style={{fontSize:9,color:MUTED,fontFamily:SANS,marginTop:1}}>P&L atual: <span style={{color:(mktPrice<existingShort.entryPrice)?ACCENT:RED,fontWeight:700}}>{((existingShort.entryPrice-mktPrice)*existingShort.qty>=0?"+":"")}FS${((existingShort.entryPrice-mktPrice)*existingShort.qty).toFixed(2)}</span></div>
                </div>
              </div>}
              <div style={{fontSize:8,color:MUTED,fontWeight:800,letterSpacing:"1px",fontFamily:SANS,marginBottom:8}}>QUANTIDADE A VENDER A DESCOBERTO</div>
              <div style={{background:SURFACE,border:`1.5px solid ${canShort?"rgba(244,63,94,.5)":BORDER}`,borderRadius:12,padding:"10px 13px",display:"flex",alignItems:"center",gap:10}}>
                <button onClick={()=>setShortQtyInput(v=>String(Math.max(1,(parseInt(v)||1)-1)))} style={{width:28,height:28,borderRadius:8,border:"1px solid rgba(255,255,255,.12)",background:"rgba(255,255,255,.06)",color:"#fff",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>−</button>
                <input type="number" min="1" value={shortQtyInput} onChange={e=>setShortQtyInput(e.target.value)} style={{flex:1,background:"transparent",border:"none",color:"#fff",fontSize:18,fontWeight:800,fontFamily:MONO,outline:"none",textAlign:"center"}}/>
                <button onClick={()=>setShortQtyInput(v=>String((parseInt(v)||1)+1))} style={{width:28,height:28,borderRadius:8,border:"1px solid rgba(255,255,255,.12)",background:"rgba(255,255,255,.06)",color:"#fff",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>+</button>
              </div>
              <div style={{display:"flex",gap:6,marginTop:6}}>
                {[1,5,10].map(q=>(
                  <button key={q} onClick={()=>setShortQtyInput(String(q))} style={{flex:1,padding:"4px",borderRadius:8,border:"1px solid rgba(244,63,94,.2)",background:"rgba(244,63,94,.06)",color:"#f87171",fontSize:8,fontWeight:700,cursor:"pointer",fontFamily:MONO}}>{q} cota{q>1?"s":""}</button>
                ))}
              </div>
              <div style={{marginTop:12,background:"rgba(244,63,94,.06)",border:"1px solid rgba(244,63,94,.2)",borderRadius:12,padding:"10px 12px"}}>
                <div style={{fontSize:8,color:MUTED,fontWeight:800,letterSpacing:"0.8px",fontFamily:SANS,marginBottom:8}}>RESUMO DO SHORT</div>
                {[
                  {l:"Notional (valor da venda)",v:`FS$${shortNotional.toFixed(2)}`},
                  {l:"Margem requerida (150%)",v:`FS$${shortMargin.toFixed(2)}`,warn:!canShort},
                  {l:"Taxa de abertura",v:`FS$${shortFee.toFixed(2)}`},
                  {l:"Aluguel estimado/dia",v:`FS$${shortLoanPerDay.toFixed(2)}`},
                  {l:"Total bloqueado",v:`FS$${(shortMargin+shortFee).toFixed(2)}`,bold:true},
                ].map((row,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <span style={{fontSize:9,color:row.warn?RED:MUTED,fontFamily:SANS}}>{row.l}</span>
                  <span style={{fontSize:row.bold?11:9,fontWeight:row.bold?800:600,color:row.warn?RED:row.bold?RED:"#fff",fontFamily:MONO}}>{row.v}</span>
                </div>)}
              </div>
              {!canShort&&<div style={{marginTop:8,display:"flex",gap:6,background:"rgba(244,63,94,.08)",border:"1px solid rgba(244,63,94,.25)",borderRadius:8,padding:"7px 10px",alignItems:"center"}}>
                <span style={{fontSize:12}}>⚠️</span>
                <span style={{fontSize:8,color:"#f87171",fontFamily:SANS,lineHeight:1.5}}>Saldo insuficiente para a margem requerida de FS${shortMargin.toFixed(2)}.</span>
              </div>}
              <div style={{marginTop:8,display:"flex",gap:6,background:"rgba(244,63,94,.05)",border:"1px solid rgba(244,63,94,.15)",borderRadius:8,padding:"7px 10px",alignItems:"flex-start"}}>
                <span style={{fontSize:11,flexShrink:0}}>💡</span>
                <span style={{fontSize:8,color:"rgba(255,150,130,.8)",fontFamily:SANS,lineHeight:1.6}}>Short Selling: você aluga cotas, vende agora e recompra mais barato para lucrar com a queda. Risco ilimitado se o preço subir. Margem bloqueada até fechar posição.</span>
              </div>
            </div>;
          })()}

          {/* ── RESUMO ── */}
          <div style={{background:gradBg,border:`1px solid ${borderCol}`,borderRadius:16,padding:"14px 16px",marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,paddingBottom:12,borderBottom:`1px solid ${borderCol}`}}>
              <div style={{width:36,height:36,borderRadius:10,background:`linear-gradient(145deg,${cl.color},${cl.color}99)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:cl.c2,flexShrink:0}}>{cl.ticker.replace(/\d/g,"")}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:SANS}}>{cl.name}</div>
                <div style={{fontSize:9,color:MUTED,fontFamily:MONO}}>{cl.ticker}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                <div style={{background:isBuy?"rgba(108,99,255,.15)":"rgba(244,63,94,.15)",border:`1px solid ${borderCol}`,borderRadius:8,padding:"3px 10px",fontSize:10,fontWeight:900,color:accentCol,fontFamily:SANS}}>
                  {isBuy?"COMPRA":"VENDA"}
                </div>
                <div style={{background:orderType==="limit"?"rgba(245,166,35,.12)":orderType==="oco"?"rgba(245,166,35,.12)":"rgba(255,255,255,.06)",border:`1px solid ${orderType==="limit"||orderType==="oco"?"rgba(245,166,35,.3)":BORDER}`,borderRadius:6,padding:"2px 7px",fontSize:7,fontWeight:800,color:orderType==="limit"||orderType==="oco"?GOLD:"#a8b8cc",fontFamily:SANS}}>
                  {orderType==="fast"?"⚡ RÁPIDA":orderType==="limit"?"🎯 PRECIFICADA":"🛡 OCO SL/TP"}
                </div>
              </div>
            </div>
            {[
              {l:"Quantidade",v:`${orderConfirm.qty.toLocaleString("pt-BR")} cota${orderConfirm.qty!==1?"s":""}`,bold:true},
              {l:orderType==="oco"?"Preço de registro":orderType==="fast"?"Preço de mercado":"Preço limite",v:`FS$${(orderType==="oco"?mktPrice:execPrice).toFixed(2)}`},
              ...(orderType!=="oco"?[{l:"Subtotal",v:`FS$${execTotal.toLocaleString("pt-BR",{minimumFractionDigits:2})}`,dividerAfter:true}]:[{l:"",v:"",divider:true}]),
              ...(orderType==="fast"?[
                {l:"Taxa operacional",v:`FS$${fee.toFixed(2)}`,fee:true,sign:isBuy?"+":"−",dividerAfter:true},
                {l:isBuy?"Total a debitar":"Total a receber",v:`FS$${netTotal.toLocaleString("pt-BR",{minimumFractionDigits:2})}`,bold:true,accent:true},
                {l:"Saldo após operação",v:`FS$${balAfter.toLocaleString("pt-BR",{minimumFractionDigits:2})}`,sub:true},
              ]:orderType==="limit"?[
                {l:"Taxa operacional",v:"Cobrada somente na execução",feeNote:true,dividerAfter:true},
                {l:"Subtotal estimado (sem taxa)",v:`FS$${execTotal.toLocaleString("pt-BR",{minimumFractionDigits:2})}`,bold:true,accent:true},
                {l:"Execução",v:"Quando o mercado atingir o limite",sub:true,small:true},
              ]:[
                ...(ocoSLValid?[{l:"🛑 Stop Loss",v:`FS$${ocoSLPrice.toFixed(2)}${ocoMode==="pct"?` (−${ocoSLVal}%)`:""}`,slRow:true}]:[]),
                ...(ocoTPValid?[{l:"🎯 Take Profit",v:`FS$${ocoTPPrice.toFixed(2)}${ocoMode==="pct"?` (+${ocoTPVal}%)`:""}`,tpRow:true}]:[]),
                {l:"Taxa operacional",v:"Cobrada somente na execução",feeNote:true,dividerAfter:true},
                {l:"OCO — One Cancels Other",v:"Ao disparar um, o outro é cancelado",sub:true,small:true},
              ]),
            ].filter(r=>r.l!==""||r.divider).map((row,ri)=>row.divider
              ?<div key={ri} style={{borderTop:`1px dashed rgba(255,255,255,.08)`,marginBottom:7}}/>
              :<div key={row.l}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                <span style={{fontSize:row.bold?11:10,color:row.fee?"rgba(255,255,255,.6)":row.feeNote?"rgba(245,166,35,.7)":MUTED,fontFamily:SANS,display:"flex",alignItems:"center",gap:5}}>
                  {row.fee&&<span style={{background:"rgba(245,166,35,.22)",color:"#f5a623",borderRadius:4,padding:"1px 6px",fontSize:7,fontWeight:900}}>TAXA</span>}
                  {row.feeNote&&<span style={{background:"rgba(245,166,35,.12)",color:"rgba(245,166,35,.7)",borderRadius:4,padding:"1px 6px",fontSize:7,fontWeight:900}}>TAXA</span>}
                  {row.l}
                </span>
                <span style={{fontSize:row.bold?14:row.sub||row.feeNote?9:11,fontWeight:row.bold?900:row.sub||row.feeNote?500:600,color:row.fee?"#f5a623":row.feeNote?"rgba(245,166,35,.55)":row.slRow?RED:row.tpRow?ACCENT:row.accent?accentCol:row.sub?"rgba(255,255,255,.35)":"#fff",fontFamily:row.small||row.feeNote?SANS:MONO,fontStyle:row.small||row.feeNote?"italic":"normal"}}>
                  {row.sign&&<span style={{marginRight:2,opacity:.8}}>{row.sign}</span>}{row.v}
                </span>
              </div>
              {row.dividerAfter&&<div style={{borderTop:`1px dashed rgba(255,255,255,.08)`,marginBottom:7}}/>}
            </div>)}
          </div>

          <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:18,background:"rgba(245,166,35,.06)",border:`1px solid ${orderType==="short"?"rgba(244,63,94,.3)":orderType==="oco"?"rgba(245,166,35,.3)":orderType==="limit"?"rgba(139,92,246,.25)":"rgba(245,166,35,.2)"}`,borderRadius:10,padding:"9px 12px"}}>
            <span style={{fontSize:14,flexShrink:0}}>{orderType==="short"?"📉":orderType==="oco"?"🛡":orderType==="limit"?"🎯":"⚠️"}</span>
            <span style={{fontSize:9,color:orderType==="short"?"#f87171":orderType==="oco"?GOLD:orderType==="limit"?"#c4b5fd":"#d4a017",fontFamily:SANS,lineHeight:1.6}}>
              {orderType==="short"
                ?<>Short Selling envolve <strong>risco ilimitado</strong>. A margem (150%) fica bloqueada até você fechar a posição. Gerencie em <strong>Carteira → Shorts</strong>.</>
                :orderType==="fast"
                ?<>Esta operação é <strong>irreversível</strong> após confirmação. Os preços podem variar entre a confirmação e a execução.</>
                :orderType==="limit"
                ?<>A ordem ficará <strong>pendente</strong> até o mercado atingir FS${limitValid?limitPrice.toFixed(2):"—"}. Cancele em <strong>Extrato → Precificadas</strong>.</>
                :<>OCO ativo enquanto o mercado estiver aberto. Ao disparar um gatilho, o outro é <strong>cancelado automaticamente</strong>. Gerencie em <strong>Extrato → SL / TP</strong>.</>
              }
            </span>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setOrderConfirm(null)}
              style={{flex:1,padding:"14px",borderRadius:14,border:`1px solid ${BORDER}`,background:SURFACE,color:MUTED,fontSize:13,fontWeight:800,fontFamily:SANS,cursor:"pointer"}}>
              Cancelar
            </button>
            <button onClick={confirm} disabled={!canConfirm}
              style={{flex:2,padding:"14px",borderRadius:14,border:"none",cursor:canConfirm?"pointer":"not-allowed",background:canConfirm?(orderType==="short"?`linear-gradient(135deg,${RED},#cc1133)`:orderType==="oco"?`linear-gradient(135deg,${GOLD},#d97706)`:isBuy?"linear-gradient(135deg,#6c63ff,#38bdf8)":`linear-gradient(135deg,${RED},#cc2244)`):"rgba(255,255,255,.06)",color:canConfirm?"#fff":"rgba(255,255,255,.25)",fontSize:13,fontWeight:800,fontFamily:SANS,boxShadow:canConfirm?`0 6px 24px ${orderType==="short"?"rgba(244,63,94,.35)":orderType==="oco"?"rgba(245,166,35,.3)":isBuy?"rgba(108,99,255,.35)":"rgba(244,63,94,.3)"}`:"none",transition:"all .2s"}}>
              {orderType==="short"?"📉 Abrir Short (Venda a Descoberto)":orderType==="short_close"?"🔄 Fechar Short (Recomprar)":orderType==="fast"?(isBuy?"Comprar ▲":"Vender ▼"):orderType==="limit"?(isBuy?"🎯 Registrar Ordem Limite ▲":"🎯 Registrar Ordem Limite ▼"):"🛡 Ativar Stop Loss / Take Profit"}
            </button>
          </div>
        </div>
      </div>;
    })()}

  </div>;
}

/* ── ROOT ── */
export default function FootStockRoot(){
  const [screen,setScreen]=useState("splash");
  const [selPlan,setSelPlan]=useState(null);
  const [loggedUser,setLoggedUser]=useState(null);
  const [pendingUser,setPendingUser]=useState(null);
  const [liveTime,setLiveTime]=useState(new Date());
  // Upgrade in-app: pendingUpgrade keeps MainApp mounted, PaymentScreen overlays on top
  const [pendingUpgrade,setPendingUpgrade]=useState(null); // {targetPlan, previousPlan}
  const [confirmUpgrade,setConfirmUpgrade]=useState(null); // callback fired after payment confirmed
  useEffect(()=>{const t=setInterval(()=>setLiveTime(new Date()),10000);return()=>clearInterval(t);},[]);
  const goHome=()=>{setScreen("splash");setSelPlan(null);setLoggedUser(null);setPendingUser(null);setPendingUpgrade(null);setConfirmUpgrade(null);};
  const handleLogin=(user)=>{
    setLoggedUser(user);
    // Admin e user_admin vão direto ao app (Dashboard) sem escolher plano
    if(user.role==="admin"||user.role==="user_admin") setScreen("app");
    else setScreen("plans");
  };
  const handleRegister=user=>{setPendingUser(user);setScreen("onboarding");};
  const handleOnboardingDone=()=>{handleLogin(pendingUser);};
  const [selBilling,setSelBilling]=useState("monthly");
  const [selPlanDue,setSelPlanDue]=useState(null); // ISO string — vencimento da assinatura ativa
  const handlePlanSelect=(planId,billing="monthly")=>{setSelPlan(planId);setSelBilling(billing);if(planId==="jogador")setScreen("app");else setScreen("payment");};
  // Called by MainApp upgrade modal — opens PaymentScreen overlay without unmounting MainApp
  const handleUpgradeRequest=(targetPlan,previousPlan,onConfirmed)=>{
    setPendingUpgrade({targetPlan,previousPlan});
    setConfirmUpgrade(()=>onConfirmed);
  };
  const activeUser=loggedUser||MOCK_USER;
  const isUpgradeFlow=!!pendingUpgrade;
  return <PhoneShell time={liveTime}>
    {screen==="splash"    &&<SplashScreen onNext={()=>setScreen("login")}/>}
    {screen==="onboarding"&&<OnboardingScreen onSelect={handleOnboardingDone} onExit={goHome}/>}
    {screen==="login"     &&<LoginScreen onLogin={handleLogin} onRegister={handleRegister} onExit={goHome}/>}
    {screen==="plans"     &&<PlansScreen onSelect={handlePlanSelect} onExit={goHome}/>}
    {screen==="payment"&&!isUpgradeFlow&&<PaymentScreen
          plan={selPlan}
          onSuccess={(planId,bil)=>{
            // Calcula vencimento: mensal = +1 mês | anual = +12 meses
            const due=new Date();
            due.setMonth(due.getMonth()+(bil==="annual"?12:1));
            setSelPlanDue(due.toISOString());
            setScreen("app");
          }}
          onBack={()=>setScreen("plans")}
          onExit={goHome}/>}
    {screen==="app"&&<div style={{position:"relative",flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <MainApp onExit={goHome} user={activeUser} initialBalance={({jogador:2000,craque:5000,lenda:25000}[selPlan])||({Jogador:2000,Craque:5000,Lenda:25000}[activeUser.plan])||2000} onUpgrade={handleUpgradeRequest} planDueDate={selPlanDue}/>
      {isUpgradeFlow&&<div style={{position:"absolute",inset:0,zIndex:500,display:"flex",flexDirection:"column",background:BG}}>
        <PaymentScreen
          plan={pendingUpgrade.targetPlan.toLowerCase()}
          isUpgrade={true}
          previousPlan={pendingUpgrade.previousPlan}
          onSuccess={(planId,bil)=>{
            // CORREÇÃO C: benefício aplicado aqui (já disparado pelo useEffect no step=done),
            // garantindo crédito mesmo que o usuário feche o app antes de clicar no botão.
            if(confirmUpgrade) confirmUpgrade(planId,bil||"monthly");
            setPendingUpgrade(null);
            setConfirmUpgrade(null);
          }}
          onBack={()=>{
            // Só permite fechar antes do pagamento ser processado
            if(!confirmUpgrade) return;
            setPendingUpgrade(null);setConfirmUpgrade(null);
          }}
          onExit={()=>{
            // Só permite sair antes do pagamento ser processado
            if(!confirmUpgrade) return;
            setPendingUpgrade(null);setConfirmUpgrade(null);
          }}
        />
      </div>}
    </div>}
  </PhoneShell>;
}
