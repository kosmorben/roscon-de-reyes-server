(() => {
  "use strict";

  const ROSCO_LETTERS = [
    "A","B","C","D","E","F","G","H","I","J","L","M",
    "N","Ñ","O","P","Q","R","S","T","U","V","X","Z"
  ];

  const DIFF_CONFIG = {
    facil:   { soloTime: 0,   turnTime: 0,  hints: 4, suddenDeath: false },
    dificil: { soloTime: 180, turnTime: 25, hints: 2, suddenDeath: false },
    subita:  { soloTime: 15,  turnTime: 15, hints: 0, suddenDeath: true }
  };

  // ==================== SPANISH NORMALIZER ====================
  function normalizeSpanish(raw) {
    if (!raw) return "";
    let s = String(raw).toLowerCase().trim();
    s = s.replace(/ñ/g, "\u0001");
    s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    s = s.replace(/\u0001/g, "ñ");
    s = s.replace(/[^a-zñ0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    return s;
  }

  function normalizeLooseEnye(raw) {
    return normalizeSpanish(raw).replace(/ñ/g, "n");
  }

  // Tolerancia fonética española (seseo/ceceo c-z-s, b/v, yeísmo ll/y, h muda)
  function phoneticSpanish(raw) {
    let s = normalizeLooseEnye(raw);
    if (!s) return "";
    s = s
      .replace(/^h+/, "")
      .replace(/ll/g, "y")
      .replace(/v/g, "b")
      .replace(/qu/g, "k")
      .replace(/c([ei])/g, "s$1")
      .replace(/z/g, "s")
      .replace(/c/g, "k")
      .replace(/(.)\1+/g, "$1");
    return s;
  }

  function editDistance(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 2) return 99;
    const dp = Array.from({ length: m + 1 }, (_, i) => i);
    for (let j = 1; j <= n; j++) {
      let prev = dp[0];
      dp[0] = j;
      for (let i = 1; i <= m; i++) {
        const tmp = dp[i];
        dp[i] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[i], dp[i - 1]);
        prev = tmp;
      }
    }
    return dp[m];
  }

  function isSmartSpanishMatch(spokenRaw, q) {
    const cleaned = cleanSpokenSpanish(spokenRaw);
    if (!cleaned) return false;
    const compact = cleaned.replace(/\s+/g, "");
    const parts = cleaned.split(" ");
    const lastWord = parts[parts.length - 1] || "";
    const candidates = [cleaned, compact, lastWord].filter(Boolean);

    const targets = [q.Answer, ...(q.AcceptedVariants || [])];
    const reqLetter = normalizeSpanish(q.Letter);

    for (const tgt of targets) {
      const tn = normalizeSpanish(tgt);
      const tl = normalizeLooseEnye(tgt);
      const tp = phoneticSpanish(tgt);
      for (const c of candidates) {
        if (c === tn || normalizeLooseEnye(c) === tl) return true;
        // Singular/plural muy común en voz (ej. juguete / juguetes)
        if (tn.length >= 4 && (c === tn + "s" || c === tn + "es" || tn === c + "s" || tn === c + "es")) {
          return true;
        }
        const cp = phoneticSpanish(c);
        if (cp.length >= 4 && cp === tp) {
          // Si la letra exigida es Ñ, exige que al menos suene similar pero no confunda otra letra inicial
          if (q.Mode === "StartsWith" && reqLetter !== "ñ" && c[0] !== tn[0]) {
            const allowBV = (tn[0] === "b" || tn[0] === "v") && (c[0] === "b" || c[0] === "v");
            const allowH = tn[0] === "h" && c[0] === tn[1];
            const allowCZS = ("czs".includes(tn[0])) && ("czs".includes(c[0]));
            if (!allowBV && !allowH && !allowCZS) continue;
          }
          return true;
        }
        // Tolerancia de 1 letra de micrófono en palabras largas (>= 6 letras)
        if (tn.length >= 6 && c.length >= 5 && editDistance(c, tn) <= 1) {
          if (q.Mode === "StartsWith" && c[0] === tn[0]) return true;
          if (q.Mode === "Contains" && c.includes(reqLetter)) return true;
        }
      }
    }
    return false;
  }

  function cleanSpokenSpanish(raw) {
    let w = normalizeSpanish(raw);
    const prefixes = [
      "la respuesta es ", "la palabra es ", "creo que es ", "creo que ",
      "yo digo ", "digo ", "respuesta ", "seria ",
      "es el ", "es la ", "es un ", "es una ", "es ",
      "el ", "la ", "los ", "las ", "un ", "una "
    ];
    let trimmed = true;
    while (trimmed) {
      trimmed = false;
      for (const p of prefixes) {
        if (w.startsWith(p)) {
          w = w.slice(p.length).trim();
          trimmed = true;
          break;
        }
      }
    }
    return w;
  }

  function formatTimer(sec) {
    if (sec <= 0) return "--:--";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  // ==================== WEBAUDIO STUDIO SFX ====================
  const SFX = (() => {
    let ctx = null;
    function getCtx() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ctx = new AC();
      }
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
      return ctx;
    }

    function playNotes(notes) {
      const ac = getCtx();
      if (!ac) return;
      const now = ac.currentTime;
      for (const n of notes) {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = n.type || "triangle";
        osc.frequency.setValueAtTime(n.f1, now + n.t);
        if (n.f2 && n.f2 !== n.f1) {
          osc.frequency.linearRampToValueAtTime(n.f2, now + n.t + n.d);
        }
        gain.gain.setValueAtTime(0.0001, now + n.t);
        gain.gain.linearRampToValueAtTime(n.vol || 0.25, now + n.t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start(now + n.t);
        osc.stop(now + n.t + n.d + 0.02);
      }
    }

    return {
      correct(streak = 1) {
        const lift = Math.pow(2, Math.min(Math.max(0, streak - 1), 9) / 12);
        playNotes([
          { t: 0.00, d: 0.15, f1: 523.25 * lift, vol: 0.25 },
          { t: 0.06, d: 0.17, f1: 659.25 * lift, vol: 0.25 },
          { t: 0.12, d: 0.28, f1: 783.99 * lift, vol: 0.29 }
        ]);
      },
      wrong() {
        playNotes([
          { t: 0.00, d: 0.18, f1: 220, f2: 202, vol: 0.22, type: "sawtooth" },
          { t: 0.13, d: 0.28, f1: 175, f2: 158, vol: 0.24, type: "sawtooth" }
        ]);
      },
      pass() {
        playNotes([
          { t: 0.00, d: 0.13, f1: 440, f2: 349, vol: 0.20 },
          { t: 0.07, d: 0.15, f1: 330, f2: 294, vol: 0.18 }
        ]);
      },
      hint() {
        playNotes([
          { t: 0.00, d: 0.12, f1: 698.46, vol: 0.22 },
          { t: 0.07, d: 0.20, f1: 880.00, vol: 0.26 }
        ]);
      },
      tick() {
        playNotes([{ t: 0.00, d: 0.045, f1: 920, f2: 780, vol: 0.12, type: "square" }]);
      },
      mic() {
        playNotes([{ t: 0.00, d: 0.09, f1: 587.33, f2: 783.99, vol: 0.20 }]);
      },
      fireworks() {
        playNotes([
          { t: 0.00, d: 0.28, f1: 420, f2: 1520, vol: 0.22, type: "sine" },
          { t: 0.26, d: 0.16, f1: 165, f2: 64,   vol: 0.34, type: "sawtooth" },
          { t: 0.28, d: 0.24, f1: 1046.5, vol: 0.28 },
          { t: 0.35, d: 0.24, f1: 1318.5, vol: 0.26 },
          { t: 0.42, d: 0.26, f1: 1568.0, vol: 0.28 },
          { t: 0.50, d: 0.16, f1: 150, f2: 58,   vol: 0.30, type: "sawtooth" },
          { t: 0.52, d: 0.42, f1: 2093.0, vol: 0.26 },
          { t: 0.60, d: 0.48, f1: 1046.5, vol: 0.28 }
        ]);
      },
      haba() {
        playNotes([
          { t: 0.00, d: 0.18, f1: 392, f2: 370, vol: 0.24, type: "sawtooth" },
          { t: 0.17, d: 0.18, f1: 349, f2: 330, vol: 0.24, type: "sawtooth" },
          { t: 0.34, d: 0.40, f1: 311, f2: 225, vol: 0.28, type: "sawtooth" }
        ]);
      }
    };
  })();

  // ==================== SNOW + FIREWORKS CANVASES ====================
  const snowCanvas = document.getElementById("snowCanvas");
  const snowCtx = snowCanvas.getContext("2d");
  const fxCanvas = document.getElementById("fxCanvas");
  const fxCtx = fxCanvas.getContext("2d");

  let viewW = window.innerWidth;
  let viewH = window.innerHeight;
  function resizeCanvases() {
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [snowCanvas, fxCanvas]) {
      c.width = Math.floor(viewW * dpr);
      c.height = Math.floor(viewH * dpr);
      c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }
  resizeCanvases();
  window.addEventListener("resize", resizeCanvases);

  const flakes = Array.from({ length: 42 }, (_, i) => ({
    x: Math.random() * viewW,
    y: Math.random() * viewH,
    r: 1.5 + Math.random() * 2.8,
    vy: 18 + Math.random() * 34,
    phase: i * 1.17,
    sway: 12 + Math.random() * 18,
    alpha: 0.35 + Math.random() * 0.55
  }));

  const sparks = [];
  function triggerFireworks() {
    const bursts = [
      { x: 0.50, y: 0.24, delay: 0.00, c1: "#ffd84d", c2: "#fffbe0" },
      { x: 0.22, y: 0.32, delay: 0.22, c1: "#ff3b4f", c2: "#ffd66b" },
      { x: 0.78, y: 0.28, delay: 0.42, c1: "#25eb93", c2: "#fff6cc" },
      { x: 0.34, y: 0.18, delay: 0.66, c1: "#4ddcff", c2: "#ffffff" },
      { x: 0.68, y: 0.38, delay: 0.90, c1: "#ffc83d", c2: "#ff5768" },
      { x: 0.50, y: 0.20, delay: 1.18, c1: "#ffe773", c2: "#3ef29e" }
    ];
    for (const b of bursts) {
      const count = 44;
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.12;
        const spd = (i % 2 === 0 ? 150 + Math.random() * 110 : 75 + Math.random() * 70);
        sparks.push({
          x: b.x * viewW,
          y: b.y * viewH,
          px: b.x * viewW,
          py: b.y * viewH,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 20,
          delay: b.delay,
          life: 0,
          maxLife: 0.95 + Math.random() * 0.65,
          color: i % 3 === 0 ? b.c2 : b.c1,
          size: 2.2 + Math.random() * 2.2
        });
      }
    }
  }

  function spawnMiniBurst(normX, normY, c1 = "#ffd84d", c2 = "#25eb93") {
    const count = 18;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
      const spd = 75 + Math.random() * 115;
      sparks.push({
        x: normX * viewW,
        y: normY * viewH,
        px: normX * viewW,
        py: normY * viewH,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 35,
        delay: 0,
        life: 0,
        maxLife: 0.55 + Math.random() * 0.35,
        color: i % 2 === 0 ? c1 : c2,
        size: 2.1 + Math.random() * 1.8
      });
    }
  }

  const THEME_PARTICLE_COLORS = {
    navidad:         ["rgba(245,250,255,", "rgba(255,232,150,"],
    futbol:          ["rgba(62,242,158,",  "rgba(255,255,255,"],
    entretenimiento: ["rgba(255,214,102,", "rgba(255,120,140,"],
    historia:        ["rgba(251,196,90,",  "rgba(255,238,192,"],
    ciencia:         ["rgba(96,218,255,",  "rgba(180,242,255,"],
    infantil:        ["rgba(255,214,102,", "rgba(167,139,250,", "rgba(96,165,250,", "rgba(52,211,153,"]
  };

  let lastFrame = performance.now();
  function animateFX(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    const t = now / 1000;

    // Partículas ambientales adaptadas a la temática activa
    const curTheme = document.body.dataset.theme || "navidad";
    const palette = THEME_PARTICLE_COLORS[curTheme] || THEME_PARTICLE_COLORS.navidad;
    snowCtx.clearRect(0, 0, viewW, viewH);
    for (let idx = 0; idx < flakes.length; idx++) {
      const f = flakes[idx];
      f.y += f.vy * dt;
      if (f.y > viewH + 10) {
        f.y = -10;
        f.x = Math.random() * viewW;
      }
      const x = f.x + Math.sin(t * 1.3 + f.phase) * f.sway;
      snowCtx.beginPath();
      snowCtx.arc(x, f.y, f.r, 0, Math.PI * 2);
      snowCtx.fillStyle = `${palette[idx % palette.length]}${f.alpha})`;
      snowCtx.fill();
    }

    // Fireworks
    if (sparks.length > 0) {
      fxCtx.clearRect(0, 0, viewW, viewH);
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        if (p.delay > 0) {
          p.delay -= dt;
          continue;
        }
        p.life += dt;
        if (p.life >= p.maxLife) {
          sparks.splice(i, 1);
          continue;
        }
        p.px = p.x;
        p.py = p.y;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 170 * dt;
        p.vx *= Math.pow(0.24, dt);
        p.vy *= Math.pow(0.45, dt);

        const alpha = Math.max(0, 1 - p.life / p.maxLife);
        fxCtx.globalAlpha = alpha;
        fxCtx.strokeStyle = p.color;
        fxCtx.lineWidth = p.size;
        fxCtx.lineCap = "round";
        fxCtx.beginPath();
        fxCtx.moveTo(p.px, p.py);
        fxCtx.lineTo(p.x, p.y);
        fxCtx.stroke();

        fxCtx.fillStyle = "#ffffff";
        fxCtx.beginPath();
        fxCtx.arc(p.x, p.y, p.size * 0.55, 0, Math.PI * 2);
        fxCtx.fill();
      }
      fxCtx.globalAlpha = 1;
      if (sparks.length === 0) fxCtx.clearRect(0, 0, viewW, viewH);
    }

    requestAnimationFrame(animateFX);
  }
  requestAnimationFrame(animateFX);

  // ==================== FAIRY LIGHT RINGS ====================
  function buildFairyRing(el, count, radiusPct) {
    if (!el) return;
    const colors = ["#ffd84d", "#ff3b4f", "#24e890", "#ffffff"];
    el.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 - Math.PI / 2;
      const b = document.createElement("span");
      b.className = "fairy-bulb";
      b.style.left = `${50 + Math.cos(ang) * radiusPct}%`;
      b.style.top = `${50 + Math.sin(ang) * radiusPct}%`;
      const c = colors[i % colors.length];
      b.style.background = c;
      b.style.boxShadow = `0 0 8px 2px ${c}`;
      b.style.animationDelay = `${(i * 0.14).toFixed(2)}s`;
      el.appendChild(b);
    }
  }
  buildFairyRing(document.getElementById("welcomeFairyRing"), 20, 48.5);
  buildFairyRing(document.getElementById("heroFairyRing"), 16, 48.5);
  buildFairyRing(document.getElementById("wheelFairyRing"), 24, 49.5);

  // ==================== THEMES + QUESTION BANK + PERSISTENT NO-REPEAT ====================
  let themesList = [
    { id: "navidad", title: "Especial Navidad", subtitle: "Reyes Magos, dulces y tradiciones", icon: "🎄", accent: "#ffd54f", dataFile: "theme_navidad.json" },
    { id: "futbol", title: "Fútbol", subtitle: "Liga, Mundiales y leyendas", icon: "⚽", accent: "#22e396", dataFile: "theme_futbol.json" },
    { id: "entretenimiento", title: "Entretenimiento", subtitle: "Cine, música y espectáculos", icon: "🎬", accent: "#ff6b78", dataFile: "theme_entretenimiento.json" },
    { id: "historia", title: "Historia y Geografía", subtitle: "Civilizaciones, países y viajes", icon: "🌍", accent: "#f5a623", dataFile: "theme_historia.json" },
    { id: "ciencia", title: "Ciencia y Naturaleza", subtitle: "Espacio, animales y descubrimientos", icon: "🔬", accent: "#48d1fc", dataFile: "theme_ciencia.json" },
    { id: "infantil", title: "Infantil", subtitle: "Divertido para niños y familia", icon: "🧸", accent: "#60a5fa", dataFile: "theme_infantil.json" }
  ];
  let selectedThemeId = "navidad";
  const themeBanksCache = new Map();
  let savedThemeExtras = {}; // themeId -> array of downloaded extra questions (unlimited mode!)
  let allQuestions = [];
  let extraQuestions = [];
  let replenishInFlight = false;
  const PLAYED_STORAGE_KEY = "roscon_played_answers_v2";
  const playedKeys = new Set();
  const bundledVoiceKeys = new Set();

  function getSelectedTheme() {
    return themesList.find(t => t.id === selectedThemeId) || themesList[0];
  }

  function sanitizeVoiceKey(rawId) {
    if (!rawId) return "";
    return String(rawId).replace(/[Ññ]/g, "ENYE").replace(/[^A-Za-z0-9_-]/g, "");
  }

  function addKeyAndAnswer(k) {
    if (!k) return;
    playedKeys.add(k);
    const bar = k.indexOf("|");
    if (bar > 0 && bar < 4) {
      const ans = k.slice(bar + 1).trim();
      if (ans) playedKeys.add(`ans:${ans}`);
    }
  }

  function loadPlayedHistory() {
    try {
      if (window.RosconAndroid && window.RosconAndroid.loadPlayedHistoryJson) {
        const diskSaved = JSON.parse(window.RosconAndroid.loadPlayedHistoryJson() || "[]");
        if (Array.isArray(diskSaved)) {
          for (const k of diskSaved) addKeyAndAnswer(k);
        }
      }
      const saved = JSON.parse(localStorage.getItem(PLAYED_STORAGE_KEY) || "[]");
      if (Array.isArray(saved)) {
        for (const k of saved) addKeyAndAnswer(k);
      }
    } catch (_) {}
  }

  function savePlayedHistory() {
    const serialized = JSON.stringify([...playedKeys]);
    try {
      localStorage.setItem(PLAYED_STORAGE_KEY, serialized);
    } catch (_) {}
    try {
      if (window.RosconAndroid && window.RosconAndroid.savePlayedHistoryJson) {
        window.RosconAndroid.savePlayedHistoryJson(serialized);
      }
    } catch (_) {}
  }

  function questionKey(q) {
    return `${q.Letter}|${normalizeSpanish(q.Answer)}`;
  }

  function isQuestionPlayed(q) {
    if (!q || !q.Answer) return true;
    const normAns = normalizeSpanish(q.Answer);
    if (playedKeys.has(`${q.Letter}|${normAns}`) || playedKeys.has(`ans:${normAns}`)) return true;
    if (q.Id && playedKeys.has(`id:${q.Id}`)) return true;
    if (q.Clue && playedKeys.has(`clue:${normalizeSpanish(q.Clue).slice(0, 64)}`)) return true;
    for (const v of (q.AcceptedVariants || [])) {
      const nv = normalizeSpanish(v);
      if (nv && playedKeys.has(`ans:${nv}`)) return true;
    }
    return false;
  }

  function markQuestionPlayed(q) {
    if (!q || !q.Answer) return false;
    const before = playedKeys.size;
    const normAns = normalizeSpanish(q.Answer);
    playedKeys.add(`${q.Letter}|${normAns}`);
    playedKeys.add(`ans:${normAns}`);
    if (q.Id) playedKeys.add(`id:${q.Id}`);
    if (q.Clue) playedKeys.add(`clue:${normalizeSpanish(q.Clue).slice(0, 64)}`);
    for (const v of (q.AcceptedVariants || [])) {
      const nv = normalizeSpanish(v);
      if (nv) playedKeys.add(`ans:${nv}`);
    }
    return playedKeys.size !== before;
  }

  const globalReserveByLetter = {};
  for (const l of ROSCO_LETTERS) globalReserveByLetter[l] = [];
  let globalReserveLoaded = false;

  async function readDataFileRows(fileName) {
    try {
      if (window.RosconAndroid && window.RosconAndroid.loadDataFileJson) {
        const arr = JSON.parse(window.RosconAndroid.loadDataFileJson(fileName) || "[]");
        return Array.isArray(arr) ? arr : [];
      }
      const res = await fetch(`data/${fileName}`);
      if (res.ok) {
        const arr = await res.json();
        return Array.isArray(arr) ? arr : [];
      }
    } catch (_) {}
    return [];
  }

  async function ensureGlobalReserveLoaded() {
    if (globalReserveLoaded) return;
    globalReserveLoaded = true;
    const seenAns = new Set();
    const files = [
      ...themesList.map(t => t.dataFile).filter(Boolean),
      "base_pack_es.json"
    ];
    for (const fn of files) {
      const rows = await readDataFileRows(fn);
      for (const q of rows) {
        if (!q || !q.Letter || !q.Answer || !q.Clue || q.Clue.length > 108) continue;
        if (!globalReserveByLetter[q.Letter]) continue;
        const na = normalizeSpanish(q.Answer);
        if (!na || seenAns.has(`${q.Letter}|${na}`)) continue;
        seenAns.add(`${q.Letter}|${na}`);
        globalReserveByLetter[q.Letter].push(q);
      }
    }
  }

  function cleanQuestionArray(rows) {
    const seen = new Set();
    const out = [];
    for (const q of (rows || [])) {
      if (!q || !q.Letter || !q.Answer || !q.Clue) continue;
      if (q.Clue.length > 108) continue;
      const key = questionKey(q);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(q);
    }
    return out;
  }

  function loadSavedThemeExtras() {
    try {
      let raw = "";
      if (window.RosconAndroid && window.RosconAndroid.loadSavedExtraQuestions) {
        raw = window.RosconAndroid.loadSavedExtraQuestions() || "";
      } else {
        raw = localStorage.getItem("roscon_theme_extras_v2") || "";
      }
      const parsed = JSON.parse(raw || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        savedThemeExtras = parsed;
      }
    } catch (_) {}
  }

  function persistSavedThemeExtras() {
    try {
      const serialized = JSON.stringify(savedThemeExtras);
      if (window.RosconAndroid && window.RosconAndroid.saveExtraQuestions) {
        window.RosconAndroid.saveExtraQuestions(serialized);
      }
      localStorage.setItem("roscon_theme_extras_v2", serialized);
    } catch (_) {}
  }

  async function replenishThemeQuestions(themeId, diff) {
    if (replenishInFlight) return;
    replenishInFlight = true;
    try {
      const excludeKeys = [...playedKeys, ...allQuestions.map(questionKey)];
      const data = await nativeHttpJson(
        `${online.serverUrl}/api/questions/more`,
        "POST",
        { theme: themeId, diff, excludeKeys: excludeKeys.slice(-800), count: 48 },
        12000,
        null
      );
      const fresh = (data && data.ok && data.data && Array.isArray(data.data.questions)) ? data.data.questions : [];
      if (fresh.length > 0) {
        if (!Array.isArray(savedThemeExtras[themeId])) savedThemeExtras[themeId] = [];
        const existingKeys = new Set(allQuestions.map(questionKey));
        let added = 0;
        for (const q of fresh) {
          if (!q || !q.Letter || !q.Answer || !q.Clue || q.Clue.length > 105) continue;
          const k = questionKey(q);
          if (existingKeys.has(k) || playedKeys.has(k)) continue;
          existingKeys.add(k);
          savedThemeExtras[themeId].push(q);
          if (themeId === selectedThemeId) allQuestions.push(q);
          added++;
        }
        if (added > 0) {
          themeBanksCache.delete((themesList.find(t => t.id === themeId) || {}).dataFile);
          persistSavedThemeExtras();
        }
      }
    } catch (_) {
      // Sin conexion o servidor apagado: sigue funcionando 100% offline
    } finally {
      replenishInFlight = false;
    }
  }

  async function loadThemeBank(themeId) {
    const theme = themesList.find(t => t.id === themeId) || themesList[0];
    const fileName = (theme && theme.dataFile) || "theme_futbol.json";
    if (themeBanksCache.has(fileName)) {
      allQuestions = themeBanksCache.get(fileName);
      updateBankInfo();
      return allQuestions;
    }
    let raw = [];
    try {
      if (window.RosconAndroid && window.RosconAndroid.loadDataFileJson) {
        raw = JSON.parse(window.RosconAndroid.loadDataFileJson(fileName) || "[]");
      } else {
        const res = await fetch(`data/${fileName}`);
        if (res.ok) raw = await res.json();
      }
    } catch (_) {}

    const extrasForTheme = Array.isArray(savedThemeExtras[themeId]) ? savedThemeExtras[themeId] : [];
    const cleaned = cleanQuestionArray([...raw, ...extrasForTheme]);
    themeBanksCache.set(fileName, cleaned);
    allQuestions = cleaned;
    updateBankInfo();
    return cleaned;
  }

  function renderThemesGrid() {
    const grid = document.getElementById("themesGrid");
    if (!grid) return;
    grid.innerHTML = "";
    for (const t of themesList) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `theme-card${t.id === selectedThemeId ? " selected" : ""}`;
      btn.innerHTML = `
        <div class="theme-icon" style="border-color:${t.accent || "#fbc84a"}66;">${t.icon || "🎄"}</div>
        <div class="theme-name">${t.title}</div>
        <div class="theme-sub">${t.subtitle || ""}</div>
      `;
      btn.addEventListener("click", async () => {
        selectedThemeId = t.id;
        updateThemePill();
        renderThemesGrid();
        await loadThemeBank(t.id);
        showScreen("screenSetup");
      });
      grid.appendChild(btn);
    }
  }

  function updateThemePill() {
    const t = getSelectedTheme();
    document.body.dataset.theme = selectedThemeId || "navidad";
    const pill = document.getElementById("activeThemePill");
    if (pill && t) {
      pill.textContent = `${t.icon || "🎄"} ${t.title}`;
    }
  }

  async function loadInitialQuestions() {
    loadPlayedHistory();
    loadSavedThemeExtras();
    try {
      if (window.RosconAndroid && window.RosconAndroid.listVoiceKeysJson) {
        const vkeys = JSON.parse(window.RosconAndroid.listVoiceKeysJson() || "[]");
        if (Array.isArray(vkeys)) vkeys.forEach(k => bundledVoiceKeys.add(k));
      }
      if (window.RosconAndroid && window.RosconAndroid.loadDataFileJson) {
        const parsed = JSON.parse(window.RosconAndroid.loadDataFileJson("themes_manifest.json") || "[]");
        if (Array.isArray(parsed) && parsed.length > 0) themesList = parsed;
      } else if (!window.RosconAndroid) {
        const res = await fetch("data/themes_manifest.json");
        if (res.ok) {
          const parsed = await res.json();
          if (Array.isArray(parsed) && parsed.length > 0) themesList = parsed;
        }
      }
    } catch (_) {}

    renderThemesGrid();
    updateThemePill();
    await loadThemeBank(selectedThemeId);
    ensureGlobalReserveLoaded();
  }

  function updateBankInfo(customMsg) {
    const el = document.getElementById("bankInfo");
    if (el) {
      el.textContent = customMsg || `Banco listo: ${allQuestions.length} preguntas verificadas en español`;
    }
  }

  async function harvestUnlimitedWikipedia(count = 35) {
    updateBankInfo("Buscando nuevas preguntas en español...");
    const seen = new Set(allQuestions.map(q => `${q.Letter}|${normalizeSpanish(q.Answer)}`));
    let added = 0;

    try {
      // Solo 1 frase completa (exsentences=1) y maximo 96 caracteres para que NUNCA se corte en pantalla
      const url = `https://es.wikipedia.org/w/api.php?action=query&generator=random&grnnamespace=0&grnlimit=${Math.min(50, count)}&prop=extracts&exintro=1&explaintext=1&exsentences=1&format=json&origin=*`;
      const res = await fetch(url);
      const data = await res.json();
      const pages = Object.values((data && data.query && data.query.pages) || {});
      for (const p of pages) {
        const title = (p.title || "").trim();
        if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{4,11}$/.test(title)) continue;
        const normAns = normalizeSpanish(title);
        const firstUpper = normAns[0].toUpperCase();
        if (!ROSCO_LETTERS.includes(firstUpper)) continue;
        const key = `${firstUpper}|${normAns}`;
        if (seen.has(key)) continue;

        let clue = (p.extract || "").replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
        if (!clue || clue.length < 30) continue;
        // Queda solo con la primera frase completa acabada en punto
        const dotIdx = clue.indexOf(".");
        if (dotIdx > 25) clue = clue.slice(0, dotIdx + 1).trim();
        // Quita el sujeto inicial ("<Title> es ...") para no chivar la respuesta
        clue = clue.replace(new RegExp(`^[^.,;:]{0,40}${title}[^.,;:]{0,20}\\b(es|fue|son|era|se refiere a)\\b\\s*`, "i"), "");
        const reTitle = new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
        if (reTitle.test(clue)) continue;
        clue = clue.charAt(0).toUpperCase() + clue.slice(1);
        if (!clue.endsWith(".")) clue += ".";
        // Descarta cualquier enunciado demasiado largo en vez de cortarlo a medias
        if (clue.length < 24 || clue.length > 96) continue;

        const row = {
          Id: `WIKI_${firstUpper}_${Date.now()}_${added}`,
          Letter: firstUpper,
          Mode: "StartsWith",
          Clue: clue,
          Answer: title,
          AcceptedVariants: []
        };
        seen.add(key);
        allQuestions.push(row);
        extraQuestions.push(row);
        added++;
      }

      if (added > 0 && window.RosconAndroid && window.RosconAndroid.saveExtraQuestions) {
        window.RosconAndroid.saveExtraQuestions(JSON.stringify(extraQuestions));
      }
      updateBankInfo(
        added > 0
          ? `+${added} preguntas nuevas añadidas (Total: ${allQuestions.length})`
          : `Banco listo: ${allQuestions.length} preguntas verificadas en español`
      );
    } catch (_) {
      updateBankInfo(`Banco offline listo: ${allQuestions.length} preguntas en español`);
    }
  }

  // ==================== GAME STATE ====================
  let selectedPlayers = 1;
  let selectedTwoPlayerMode = "online";
  let selectedDiff = "facil";

  const PLAYER_ID_KEY = "roscon_player_id_v1";
  const PLAYER_NAME_KEY = "roscon_player_name_v1";
  const SERVER_URL_KEY = "roscon_server_url_v1";
  const DEFAULT_ONLINE_SERVER = "https://roscon-de-reyes.onrender.com";

  function getOrCreatePlayerId() {
    try {
      let id = localStorage.getItem(PLAYER_ID_KEY);
      if (!id) {
        id = "p_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
        localStorage.setItem(PLAYER_ID_KEY, id);
      }
      return id;
    } catch (_) {
      return "p_" + Math.random().toString(36).slice(2, 10);
    }
  }

  function getDefaultServerUrl() {
    if (!window.RosconAndroid && window.location && /^https?:/.test(window.location.origin)) {
      const host = (window.location.hostname || "").toLowerCase();
      if (host.endsWith(".onrender.com") || host === "localhost" || host === "127.0.0.1") {
        return window.location.origin;
      }
    }
    try {
      const saved = (localStorage.getItem(SERVER_URL_KEY) || "").trim().replace(/\/+$/, "");
      if (saved && !saved.includes("192.168.") && !saved.includes(".lhr.life")) {
        return saved;
      }
    } catch (_) {}
    return DEFAULT_ONLINE_SERVER;
  }

  const online = {
    active: false,
    waitingMode: "", // "", "queue", "room"
    playerId: getOrCreatePlayerId(),
    serverUrl: getDefaultServerUrl(),
    roomCode: "",
    mySeat: -1,
    version: -1,
    lastEventSeq: 0,
    abortCtrl: null,
    queueTimer: null,
    syncLoopId: 0
  };

  let webAudioEl = null;
  let webRecognition = null;
  let isVip = false;
  let autoMicEnabled = false;
  let manualKeyboardOpen = false;
  let bgMusicEnabled = true;
  let pendingHabaContext = null;

  const VIP_STORAGE_KEY = "roscon_vip_v2";
  const DAILY_META_KEY = "roscon_daily_meta_v2";
  const BGM_STORAGE_KEY = "roscon_bgm_v2";
  try {
    isVip = localStorage.getItem(VIP_STORAGE_KEY) === "1";
    autoMicEnabled = localStorage.getItem("roscon_automic_v2") === "1";
    bgMusicEnabled = localStorage.getItem(BGM_STORAGE_KEY) !== "0";
  } catch (_) {}

  // Música navideña libre de derechos en bucle continuo (Deck the Halls + Jingle Bells + We Wish You + Noche de Paz)
  let bgmAudio = null;
  let webClueSpeaking = false;

  function syncMusicButtons() {
    const btn = document.getElementById("btnMusicToggle");
    if (btn) btn.textContent = bgMusicEnabled ? "🎵 Música: Sí" : "🔇 Música: No";
    const inGameBtn = document.getElementById("btnMusicInGame");
    if (inGameBtn) {
      inGameBtn.classList.toggle("active", bgMusicEnabled);
      inGameBtn.textContent = bgMusicEnabled ? "🎵" : "🔇";
    }
  }

  function updateMusicEngine() {
    syncMusicButtons();
    try { localStorage.setItem(BGM_STORAGE_KEY, bgMusicEnabled ? "1" : "0"); } catch (_) {}

    const mode = game.listening ? "mic" : (game.active ? "game" : "menu");
    if (window.RosconAndroid && window.RosconAndroid.setMusicEnabled) {
      window.RosconAndroid.setMusicEnabled(bgMusicEnabled);
      if (window.RosconAndroid.setMusicDuckMode) {
        window.RosconAndroid.setMusicDuckMode(mode);
      }
      return;
    }

    if (!bgMusicEnabled) {
      if (bgmAudio) {
        try { bgmAudio.pause(); } catch (_) {}
      }
      return;
    }

    if (!bgmAudio) {
      bgmAudio = new Audio("christmas_bgm.ogg");
      bgmAudio.loop = true;
      bgmAudio.preload = "auto";
    }
    if (game.listening) {
      bgmAudio.volume = 0.03;
    } else if (webClueSpeaking) {
      bgmAudio.volume = 0.09;
    } else if (game.active) {
      bgmAudio.volume = 0.16;
    } else {
      bgmAudio.volume = 0.28;
    }
    if (bgmAudio.paused && !document.hidden) {
      bgmAudio.play().catch(() => {});
    }
  }

  function unlockWebBgmOnce() {
    if (bgMusicEnabled && !window.RosconAndroid) {
      updateMusicEngine();
    }
  }
  window.addEventListener("pointerdown", unlockWebBgmOnce, { passive: true });
  window.addEventListener("keydown", unlockWebBgmOnce, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!bgmAudio) return;
    if (document.hidden) {
      try { bgmAudio.pause(); } catch (_) {}
    } else if (bgMusicEnabled) {
      updateMusicEngine();
    }
  });

  let ceremonyTimer = null;
  function showCeremonyOverlay(kind, title, sub) {
    const ov = document.getElementById("ceremonyOverlay");
    const card = document.getElementById("ceremonyCard");
    if (!ov || !card) return;
    document.getElementById("ceremonyEmoji").textContent = kind === "king" ? "👑" : (kind === "shield" ? "🛡️" : "🫘");
    document.getElementById("ceremonyTitle").textContent = title;
    document.getElementById("ceremonySub").textContent = sub;
    card.classList.toggle("haba-style", kind === "haba");
    ov.classList.remove("hidden");
    if (ceremonyTimer) clearTimeout(ceremonyTimer);
    ceremonyTimer = setTimeout(() => ov.classList.add("hidden"), 2300);
  }

  function getTodayDateStr() {
    const d = new Date(Date.now() + 3600 * 1000);
    return d.toISOString().slice(0, 10);
  }

  function loadDailyMeta() {
    try {
      return JSON.parse(localStorage.getItem(DAILY_META_KEY) || "{}") || {};
    } catch (_) {
      return {};
    }
  }

  function saveDailyCompletion(dateStr, correct, score) {
    const meta = loadDailyMeta();
    if (meta.lastCompletedDate === dateStr) {
      if (score > (meta.bestTodayScore || 0)) meta.bestTodayScore = score;
      meta.bestTodayCorrect = Math.max(correct, meta.bestTodayCorrect || 0);
    } else {
      const yesterday = new Date(Date.parse(dateStr + "T12:00:00Z") - 86400000).toISOString().slice(0, 10);
      meta.streak = (meta.lastCompletedDate === yesterday ? (meta.streak || 0) : 0) + 1;
      meta.lastCompletedDate = dateStr;
      meta.bestTodayScore = score;
      meta.bestTodayCorrect = correct;
    }
    try { localStorage.setItem(DAILY_META_KEY, JSON.stringify(meta)); } catch (_) {}
    refreshWelcomeBadges();
    return meta;
  }

  // ==================== RANGO REAL + 8 MEDALLAS DESBLOQUEABLES ====================
  const PROFILE_STORAGE_KEY = "roscon_profile_v2";
  const ROYAL_RANKS = [
    { min: 0,   label: "🥖 Aprendiz de Pastelero" },
    { min: 25,  label: "⭐ Paje Real" },
    { min: 80,  label: "🎂 Maestro del Roscón" },
    { min: 180, label: "👑 Rey de Oriente" },
    { min: 350, label: "✨ Leyenda Real" }
  ];
  const MEDAL_DEFS = [
    { id: "first_win",  icon: "🎉", name: "Primer Roscón",    desc: "Completa tu primera partida" },
    { id: "streak_5",   icon: "🔥", name: "Racha de Fuego",   desc: "5 aciertos seguidos" },
    { id: "streak_10",  icon: "⚡", name: "Imparable",        desc: "10 aciertos seguidos" },
    { id: "found_king", icon: "👑", name: "Cazador del Rey",  desc: "Encuentra la Figurita del Rey" },
    { id: "perfect_24", icon: "💎", name: "Corona Perfecta",  desc: "Consigue 24 de 24 en un rosco" },
    { id: "daily_3",    icon: "📅", name: "Fiel al Roscón",   desc: "3 días seguidos en Roscón del Día" },
    { id: "sudden_10",  icon: "💀", name: "Superviviente",    desc: "10 seguidas en Muerte Súbita" },
    { id: "centurion",  icon: "🏆", name: "Centurión",        desc: "Acumula 100 aciertos totales" }
  ];

  function loadPlayerProfile() {
    try {
      const p = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "{}");
      return {
        totalCorrect: Number(p.totalCorrect) || 0,
        gamesPlayed: Number(p.gamesPlayed) || 0,
        bestSudden: Number(p.bestSudden) || 0,
        medals: Array.isArray(p.medals) ? p.medals : []
      };
    } catch (_) {
      return { totalCorrect: 0, gamesPlayed: 0, bestSudden: 0, medals: [] };
    }
  }

  function savePlayerProfile(p) {
    try { localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(p)); } catch (_) {}
  }

  function getRoyalRankInfo(totalCorrect) {
    let cur = ROYAL_RANKS[0];
    let next = ROYAL_RANKS[1];
    for (let i = 0; i < ROYAL_RANKS.length; i++) {
      if (totalCorrect >= ROYAL_RANKS[i].min) {
        cur = ROYAL_RANKS[i];
        next = ROYAL_RANKS[i + 1] || null;
      }
    }
    const pct = next
      ? Math.min(100, Math.round(((totalCorrect - cur.min) / Math.max(1, next.min - cur.min)) * 100))
      : 100;
    return { cur, next, pct };
  }

  function recordProfileProgress(topPlayer, totalCorrect, reason) {
    const p = loadPlayerProfile();
    p.totalCorrect += topPlayer.correct || 0;
    if (reason !== "abandoned") p.gamesPlayed += 1;
    if (game.isSuddenDeath && (topPlayer.correct || 0) > p.bestSudden) {
      p.bestSudden = topPlayer.correct || 0;
    }
    const meta = loadDailyMeta();
    const newlyUnlocked = [];
    const unlock = (id) => {
      if (!p.medals.includes(id)) {
        p.medals.push(id);
        const def = MEDAL_DEFS.find(m => m.id === id);
        if (def) newlyUnlocked.push(def);
      }
    };
    if (reason !== "abandoned" && p.gamesPlayed >= 1) unlock("first_win");
    if ((topPlayer.bestStreak || 0) >= 5) unlock("streak_5");
    if ((topPlayer.bestStreak || 0) >= 10) unlock("streak_10");
    if (topPlayer.foundKing) unlock("found_king");
    if (totalCorrect >= (game.items.length || 24) && totalCorrect >= 24) unlock("perfect_24");
    if ((meta.streak || 0) >= 3) unlock("daily_3");
    if (game.isSuddenDeath && (topPlayer.correct || 0) >= 10) unlock("sudden_10");
    if (p.totalCorrect >= 100) unlock("centurion");

    savePlayerProfile(p);
    refreshWelcomeBadges();
    if (newlyUnlocked.length > 0) {
      const m = newlyUnlocked[0];
      showSurpriseToast("king", `🏅 ¡Nueva Medalla: ${m.icon} ${m.name}!`);
    }
  }

  function openMedalsModal() {
    const p = loadPlayerProfile();
    const r = getRoyalRankInfo(p.totalCorrect);
    document.getElementById("medalsRankTitle").textContent = r.cur.label;
    document.getElementById("medalsRankSub").textContent =
      `${p.totalCorrect} aciertos totales · ⚡ Récord Súbita: ${p.bestSudden}${r.next ? ` · Siguiente rango: ${r.next.min}` : " · ¡Rango máximo!"}`;
    document.getElementById("rankXpFill").style.width = `${r.pct}%`;
    const grid = document.getElementById("medalsGrid");
    grid.innerHTML = "";
    for (const m of MEDAL_DEFS) {
      const unlocked = p.medals.includes(m.id);
      const card = document.createElement("div");
      card.className = `medal-card${unlocked ? " unlocked" : ""}`;
      card.innerHTML = `
        <div class="medal-icon">${unlocked ? m.icon : "🔒"}</div>
        <div class="medal-name">${m.name}</div>
        <div class="medal-desc">${m.desc}</div>
      `;
      grid.appendChild(card);
    }
    document.getElementById("medalsModal").classList.remove("hidden");
  }

  function refreshWelcomeBadges() {
    const vipBtn = document.getElementById("btnOpenVip");
    if (vipBtn) {
      vipBtn.classList.toggle("is-vip", isVip);
      vipBtn.textContent = isVip ? "👑 VIP Activo" : "👑 VIP";
    }
    const meta = loadDailyMeta();
    const stBadge = document.getElementById("dailyStreakBadge");
    if (stBadge) {
      const st = meta.streak || 0;
      stBadge.classList.toggle("hidden", st <= 0);
      stBadge.textContent = `🔥 ${st}d`;
    }
    const p = loadPlayerProfile();
    const r = getRoyalRankInfo(p.totalCorrect);
    const rankTxt = document.getElementById("welcomeRankText");
    const medCnt = document.getElementById("welcomeMedalsCount");
    if (rankTxt) rankTxt.textContent = r.cur.label;
    if (medCnt) medCnt.textContent = `🏅 ${p.medals.length}/${MEDAL_DEFS.length}`;
  }

  const game = {
    active: false,
    isOnline: false,
    isDaily: false,
    dailyDate: "",
    startedAtMs: 0,
    habaShieldUsed: false,
    items: [],
    players: [],
    currentIndex: 0,
    currentPlayerIndex: 0,
    timeLimit: 180,
    timeRemaining: 180,
    lap: 1,
    timerId: null,
    listening: false,
    lastSpokenId: "",
    prizeIndex: -1,
    habaIndex: -1,
    prizeFound: false,
    habaFound: false
  };

  function isMyActiveTurn() {
    if (!game.active) return false;
    if (!game.isOnline) return true;
    return online.mySeat === game.currentPlayerIndex;
  }

  let toastTimer = null;
  function showSurpriseToast(type, message) {
    const el = document.getElementById("surpriseToast");
    if (!el) return;
    el.textContent = message;
    el.className = `surprise-toast ${type}`;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 4600);
  }

  function showScreen(id) {
    for (const s of document.querySelectorAll(".screen")) {
      s.classList.toggle("active", s.id === id);
    }
    updateMusicEngine();
  }

  function pickBestFromPool(pool, targetDiff) {
    const freshDiff = pool.filter(q => {
      const d = (q.Difficulty || "facil").toLowerCase();
      return targetDiff === "dificil" ? (d === "dificil" || d === "normal") : d === "facil";
    });
    const diffPool = freshDiff.length > 0 ? freshDiff : pool;
    const freshVoiced = diffPool.filter(q => bundledVoiceKeys.has(sanitizeVoiceKey(q.Id)));
    const candidates = freshVoiced.length > 0 ? freshVoiced : diffPool;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function buildRosco24() {
    const byLetter = {};
    for (const l of ROSCO_LETTERS) byLetter[l] = [];
    for (const q of allQuestions) {
      if (byLetter[q.Letter]) byLetter[q.Letter].push(q);
    }
    for (const q of extraQuestions) {
      if (byLetter[q.Letter]) byLetter[q.Letter].push(q);
    }

    const chosen = [];
    const usedAnswersThisRosco = new Set();
    const usedCluesThisRosco = new Set();
    let lowReserve = false;
    const targetDiff = selectedDiff === "dificil" ? "dificil" : "facil";

    const canUse = (q) => {
      if (!q || !q.Answer || !q.Clue) return false;
      if (isQuestionPlayed(q)) return false;
      const na = normalizeSpanish(q.Answer);
      const nc = normalizeSpanish(q.Clue).slice(0, 64);
      if (!na || usedAnswersThisRosco.has(na) || usedCluesThisRosco.has(nc)) return false;
      for (const v of (q.AcceptedVariants || [])) {
        const nv = normalizeSpanish(v);
        if (nv && usedAnswersThisRosco.has(nv)) return false;
      }
      return true;
    };

    for (const l of ROSCO_LETTERS) {
      const themePool = byLetter[l] || [];
      let fresh = themePool.filter(canUse);
      if (fresh.length <= 3) lowReserve = true;

      // Si se terminan las preguntas nuevas de esa letra en esta temática, NUNCA repite:
      // pasa automáticamente a la reserva global de 5.800+ preguntas verificadas (priorizando locución Fenrir)
      if (fresh.length === 0) {
        const globalPool = globalReserveByLetter[l] || [];
        const globalVoiced = globalPool.filter(q => bundledVoiceKeys.has(sanitizeVoiceKey(q.Id)) && canUse(q));
        fresh = globalVoiced.length > 0 ? globalVoiced : globalPool.filter(canUse);
      }

      if (fresh.length === 0) {
        // Caso extremo tras más de 240 roscos completos (~5.800 palabras únicas jugadas): evita repetir dentro del mismo rosco
        const emergencyPool = (globalReserveByLetter[l] && globalReserveByLetter[l].length > 0) ? globalReserveByLetter[l] : themePool;
        fresh = emergencyPool.filter(q => q && !usedAnswersThisRosco.has(normalizeSpanish(q.Answer)));
      }
      if (fresh.length === 0) continue;

      const pick = pickBestFromPool(fresh, targetDiff);
      markQuestionPlayed(pick);
      usedAnswersThisRosco.add(normalizeSpanish(pick.Answer));
      usedCluesThisRosco.add(normalizeSpanish(pick.Clue).slice(0, 64));
      for (const v of (pick.AcceptedVariants || [])) {
        const nv = normalizeSpanish(v);
        if (nv) usedAnswersThisRosco.add(nv);
      }
      chosen.push(pick);
    }

    savePlayedHistory();
    // Modo preguntas ilimitadas: si queda poca reserva temática sin jugar, descarga nuevas preguntas verificadas en segundo plano
    if (lowReserve) {
      replenishThemeQuestions(selectedThemeId, targetDiff);
      harvestUnlimitedWikipedia(35);
    }
    return chosen;
  }

  async function startNewGame() {
    if (selectedPlayers === 2 && selectedTwoPlayerMode === "online") {
      openOnlineLobby();
      return;
    }
    leaveOnlineRoom(false);
    await ensureGlobalReserveLoaded();
    const rosco = buildRosco24();
    if (rosco.length === 0) return;

    const cfg = DIFF_CONFIG[selectedDiff] || DIFF_CONFIG.facil;
    const isSudden = !!cfg.suddenDeath;
    const vipBonusHints = (isVip && !isSudden) ? 2 : 0;
    game.isOnline = false;
    game.isDaily = false;
    game.isSuddenDeath = isSudden;
    game.revealing = false;
    game.dailyDate = "";
    game.startedAtMs = Date.now();
    game.habaShieldUsed = false;
    game.players = [];
    for (let i = 0; i < selectedPlayers; i++) {
      game.players.push({
        id: i,
        name: isVip && i === 0 ? "👑 Jugador 1" : `Jugador ${i + 1}`,
        score: 0,
        correct: 0,
        wrong: 0,
        streak: 0,
        bestStreak: 0,
        hintsLeft: cfg.hints + vipBonusHints,
        foundKing: false,
        foundHaba: false
      });
    }

    game.items = rosco.map(q => ({
      q,
      status: "pending",
      revealed: q.Mode === "StartsWith" ? [0] : []
    }));

    // Esconde la Figurita del Rey (premio) y el Haba (truco) bajo 2 letras aleatorias distintas
    game.prizeFound = false;
    game.habaFound = false;
    game.prizeIndex = Math.floor(Math.random() * game.items.length);
    do {
      game.habaIndex = Math.floor(Math.random() * game.items.length);
    } while (game.habaIndex === game.prizeIndex && game.items.length > 1);

    game.currentIndex = 0;
    game.currentPlayerIndex = 0;
    game.timeLimit = selectedPlayers > 1 ? cfg.turnTime : cfg.soloTime;
    game.timeRemaining = game.timeLimit;
    game.lap = 1;
    game.active = true;
    game.listening = false;
    game.lastSpokenId = "";

    document.getElementById("surpriseToast").classList.add("hidden");
    buildLetterButtons();
    showScreen("screenGame");
    renderGame();
    startClock();
  }

  function stopClock() {
    if (game.timerId) {
      clearInterval(game.timerId);
      game.timerId = null;
    }
  }

  function startClock() {
    stopClock();
    if (game.timeLimit <= 0) return;
    game.timerId = setInterval(() => {
      if (!game.active) return;
      game.timeRemaining = Math.max(0, game.timeRemaining - 1);
      if (game.timeRemaining <= 10 && game.timeRemaining > 0) SFX.tick();
      if (game.timeRemaining <= 0) {
        if (game.isOnline) {
          if (isMyActiveTurn()) {
            sendOnlineAction("timeout", {});
          }
          renderClockOnly();
          return;
        }
        if (game.players.length <= 1) {
          finishGame("timeout");
          return;
        }
        // En 2 jugadores local, agotar turno pasa palabra y cambia de jugador
        const it = game.items[game.currentIndex];
        if (it && (it.status === "pending" || it.status === "passed")) it.status = "passed";
        game.players[game.currentPlayerIndex].streak = 0;
        advanceTurn(true);
        return;
      }
      renderClockOnly();
    }, 1000);
  }

  function buildLetterButtons() {
    const ring = document.getElementById("lettersRing");
    ring.innerHTML = "";
    const total = game.items.length;
    const radiusPct = 42.0; // Posiciona las 24 letras justo encima del bizcocho del Roscón
    for (let i = 0; i < total; i++) {
      const ang = (i / total) * Math.PI * 2 - Math.PI / 2;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "letter-dot";
      btn.textContent = game.items[i].q.Letter;
      btn.style.left = `${50 + Math.cos(ang) * radiusPct}%`;
      btn.style.top = `${50 + Math.sin(ang) * radiusPct}%`;
      btn.addEventListener("click", () => {
        if (!isMyActiveTurn()) return;
        const st = game.items[i].status;
        if (game.active && (st === "pending" || st === "passed")) {
          if (game.isOnline) {
            sendOnlineAction("select", { index: i });
          } else {
            game.currentIndex = i;
            renderGame();
          }
        }
      });
      ring.appendChild(btn);
    }
  }

  function renderClockOnly() {
    const tEl = document.getElementById("centerTimer");
    if (!tEl) return;
    tEl.textContent = formatTimer(game.timeRemaining);
    const urgent = game.timeLimit > 0 && game.timeRemaining <= 10;
    tEl.classList.toggle("urgent", urgent);

    const ring = document.getElementById("timerRingProgress");
    const svg = ring ? ring.parentElement : null;
    if (ring && svg) {
      const circ = 289.03;
      if (game.timeLimit <= 0) {
        svg.classList.add("no-timer");
        ring.style.strokeDashoffset = "0";
        ring.classList.remove("warn", "urgent");
      } else {
        svg.classList.remove("no-timer");
        const frac = Math.max(0, Math.min(1, game.timeRemaining / game.timeLimit));
        ring.style.strokeDashoffset = String((circ * (1 - frac)).toFixed(1));
        ring.classList.toggle("urgent", urgent);
        ring.classList.toggle("warn", !urgent && frac <= 0.35);
      }
    }
  }

  let heardBubbleTimer = null;
  function showHeardBubble(text, status = "") {
    const el = document.getElementById("heardBubble");
    if (!el || !text) return;
    el.textContent = text;
    el.className = `heard-bubble${status ? " " + status : ""}`;
    if (heardBubbleTimer) clearTimeout(heardBubbleTimer);
    heardBubbleTimer = setTimeout(() => el.classList.add("hidden"), 1700);
  }

  function spawnScorePop(text, isBad = false) {
    const layer = document.getElementById("scorePopLayer");
    const dots = document.getElementById("lettersRing")?.children;
    if (!layer || !dots) return;
    const activeDot = dots[game.currentIndex];
    const pop = document.createElement("div");
    pop.className = `score-pop${isBad ? " bad" : ""}`;
    pop.textContent = text;
    pop.style.left = activeDot ? activeDot.style.left : "50%";
    pop.style.top = activeDot ? activeDot.style.top : "42%";
    layer.appendChild(pop);
    setTimeout(() => pop.remove(), 980);
  }

  function animateEqBars(pct) {
    const wrap = document.getElementById("voiceEqBars");
    if (!wrap) return;
    const bars = wrap.children;
    const weights = [0.55, 0.9, 1.0, 0.85, 0.6];
    const base = Math.max(15, Math.min(100, Number(pct) || 20));
    for (let i = 0; i < bars.length; i++) {
      const jitter = 0.78 + Math.random() * 0.44;
      const h = Math.max(4, Math.min(18, Math.round((base / 100) * 18 * weights[i % weights.length] * jitter)));
      bars[i].style.height = `${h}px`;
    }
  }

  window.onAndroidVoiceRms = (pct) => {
    if (game.listening) animateEqBars(pct);
  };

  function stopAllSpeech() {
    webClueSpeaking = false;
    if (window.RosconAndroid && window.RosconAndroid.stopSpeaking) {
      window.RosconAndroid.stopSpeaking();
    }
    if (webAudioEl) {
      try { webAudioEl.pause(); webAudioEl.currentTime = 0; } catch (_) {}
      webAudioEl = null;
    }
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (_) {}
    }
    updateMusicEngine();
  }

  let autoMicTimer = null;
  function maybeAutoStartMic() {
    if (autoMicTimer) clearTimeout(autoMicTimer);
    if (!autoMicEnabled || !game.active || !isMyActiveTurn() || game.listening) return;
    const habaModal = document.getElementById("habaShieldModal");
    if (habaModal && !habaModal.classList.contains("hidden")) return;
    autoMicTimer = setTimeout(() => {
      if (!autoMicEnabled || !game.active || !isMyActiveTurn() || game.listening) return;
      SFX.mic();
      if (window.RosconAndroid && window.RosconAndroid.startListening) {
        window.RosconAndroid.startListening();
      } else {
        toggleWebSpeechRecognition();
      }
    }, 220);
  }

  window.onAndroidClueFinished = () => {
    maybeAutoStartMic();
  };

  function speakCurrentClue(force = false) {
    if (!game.active) return;
    const item = game.items[game.currentIndex];
    if (!item) return;
    if (!force && game.lastSpokenId === item.q.Id) return;
    game.lastSpokenId = item.q.Id;

    const letter = item.q.Letter.toUpperCase();
    const intro = item.q.Mode === "Contains"
      ? `Contiene la ${letter}. ${item.q.Clue}`
      : `Empieza por ${letter}. ${item.q.Clue}`;

    if (window.RosconAndroid && window.RosconAndroid.speakClue) {
      window.RosconAndroid.speakClue(item.q.Id, intro);
      return;
    }

    // Reproduccion en navegador (Render / itch.io / PC): usa ruta relativa voice/<SafeId>.ogg con fallback TTS
    stopAllSpeech();
    const safeKey = sanitizeVoiceKey(item.q.Id);
    const audio = new Audio(`voice/${safeKey}.ogg`);
    webAudioEl = audio;
    webClueSpeaking = true;
    updateMusicEngine();
    audio.onended = () => {
      if (webAudioEl === audio) {
        webClueSpeaking = false;
        updateMusicEngine();
        maybeAutoStartMic();
      }
    };
    audio.play().catch(() => {
      if (window.speechSynthesis) {
        try {
          const u = new SpeechSynthesisUtterance(intro);
          u.lang = "es-ES";
          u.rate = 1.1;
          u.onend = () => {
            webClueSpeaking = false;
            updateMusicEngine();
            maybeAutoStartMic();
          };
          window.speechSynthesis.speak(u);
        } catch (_) {
          webClueSpeaking = false;
          updateMusicEngine();
        }
      } else {
        webClueSpeaking = false;
        updateMusicEngine();
      }
    });
  }

  function renderGame() {
    if (!game.active) return;
    const item = game.items[game.currentIndex];
    const player = game.players[game.currentPlayerIndex];
    if (!item || !player) return;

    // Scoreboard
    const sb = document.getElementById("scoreboard");
    sb.innerHTML = "";
    game.players.forEach((p, idx) => {
      const pill = document.createElement("div");
      pill.className = `score-pill${idx === game.currentPlayerIndex ? " active" : ""}`;
      let label = `${p.name} · ${p.score}`;
      if (p.foundKing) label += " ★REY";
      if (p.foundHaba) label += " (HABA)";
      pill.textContent = label;
      sb.appendChild(pill);
    });

    const remaining = game.items.filter(x => x.status === "pending" || x.status === "passed").length;
    const resolved = game.items.length - remaining;
    document.getElementById("topProgress").textContent = `${resolved}/${game.items.length}`;

    // 24 letras
    const dots = document.getElementById("lettersRing").children;
    for (let i = 0; i < game.items.length && i < dots.length; i++) {
      const it = game.items[i];
      let cls = "letter-dot";
      if (i === game.currentIndex) cls += " active";
      else if (game.prizeFound && i === game.prizeIndex) cls += " found-king";
      else if (game.habaFound && i === game.habaIndex) cls += " found-haba";
      else if (it.status !== "pending") cls += ` ${it.status}`;
      dots[i].className = cls;
    }

    // Haz luminoso hacia la letra activa
    const deg = (game.currentIndex / game.items.length) * 360;
    document.getElementById("wheelSpotlight").style.transform = `rotate(${deg}deg)`;

    // Centro del Roscón
    document.getElementById("centerLetter").textContent = item.q.Letter;
    renderClockOnly();

    // Tarjeta de pregunta
    document.getElementById("modePill").textContent =
      item.q.Mode === "Contains"
        ? `CONTIENE LA ${item.q.Letter}`
        : `EMPIEZA POR ${item.q.Letter}`;

    const stEl = document.getElementById("streakPill");
    stEl.textContent = player.streak >= 2 ? `🔥 Racha ×${player.streak}` : "";
    const wheelStage = document.getElementById("wheelStage");
    if (wheelStage) wheelStage.classList.toggle("streak-hot", player.streak >= 3);

    const clueEl = document.getElementById("clueText");
    clueEl.textContent = item.q.Clue;
    clueEl.classList.toggle("compact", item.q.Clue.length > 82);
    document.getElementById("wordMeta").textContent =
      `${item.q.Answer.length} letras · Vuelta ${game.lap} · ${remaining} pendientes`;

    // Casillas de letras SIEMPRE LIMPIAS (solo letra inicial dorada + pistas reveladas)
    const slotsEl = document.getElementById("wordSlots");
    slotsEl.innerHTML = "";
    const len = item.q.Answer.length;
    const compact = len >= 10;
    for (let i = 0; i < len; i++) {
      const box = document.createElement("div");
      const isClue = item.q.Mode === "StartsWith" && i === 0;
      const isHint = !isClue && item.revealed.includes(i);
      box.className = `word-slot${compact ? " compact" : ""}${isClue ? " clue" : isHint ? " hint" : ""}`;
      box.textContent = (isClue || isHint) ? item.q.Answer[i].toUpperCase() : "";
      slotsEl.appendChild(box);
    }

    const turnBanner = document.getElementById("onlineTurnBanner");
    if (turnBanner) {
      if (game.isOnline) {
        const myTurn = isMyActiveTurn();
        turnBanner.classList.remove("hidden");
        turnBanner.className = `turn-banner ${myTurn ? "my-turn" : "rival-turn"}`;
        turnBanner.textContent = myTurn
          ? `★ TU TURNO · Sala ${online.roomCode}`
          : `⏳ Turno de ${player.name} · Sala ${online.roomCode}`;
      } else {
        turnBanner.classList.add("hidden");
      }
    }

    const myTurn = isMyActiveTurn();
    const myPlayerObj = game.isOnline && game.players[online.mySeat] ? game.players[online.mySeat] : player;
    const hintBtn = document.getElementById("btnHint");
    const canOfferRewardedHints = !game.isOnline && !isVip && selectedThemeId !== "infantil" && myPlayerObj.hintsLeft <= 0;
    hintBtn.classList.toggle("reward-mode", canOfferRewardedHints);
    if (canOfferRewardedHints) {
      hintBtn.textContent = "🎬 +2 Pistas Gratis";
      hintBtn.disabled = !myTurn;
    } else {
      hintBtn.textContent = `💡 Pista (${myPlayerObj.hintsLeft})`;
      hintBtn.disabled = !myTurn || myPlayerObj.hintsLeft <= 0;
    }

    const passBtn = document.getElementById("btnPassQuick");
    if (passBtn) passBtn.disabled = !myTurn;

    const autoBtn = document.getElementById("btnAutoMic");
    if (autoBtn) {
      autoBtn.classList.toggle("active", autoMicEnabled);
      autoBtn.textContent = autoMicEnabled ? "🎙️ Auto: Sí" : "🎙️ Auto: No";
    }

    const typeBtn = document.getElementById("btnToggleType");
    if (typeBtn) {
      typeBtn.classList.toggle("active", manualKeyboardOpen || !window.RosconAndroid);
    }

    const webRow = document.getElementById("webTextAnswerRow");
    if (webRow) {
      const showWebInput = (!window.RosconAndroid || manualKeyboardOpen) && myTurn;
      webRow.classList.toggle("hidden", !showWebInput);
    }

    updateVoiceButton();
    speakCurrentClue(false);
  }

  let eqIdleTimer = null;
  function updateVoiceButton() {
    updateMusicEngine();
    const btn = document.getElementById("btnVoice");
    const lbl = document.getElementById("btnVoiceLabel");
    const eq = document.getElementById("voiceEqBars");
    if (!btn) return;
    const myTurn = isMyActiveTurn();
    btn.disabled = !myTurn || !!game.revealing;
    const activeListen = myTurn && game.listening;
    btn.classList.toggle("listening", activeListen);
    if (eq) eq.classList.toggle("hidden", !activeListen);
    if (eqIdleTimer) {
      clearInterval(eqIdleTimer);
      eqIdleTimer = null;
    }
    if (activeListen) {
      animateEqBars(42);
      eqIdleTimer = setInterval(() => {
        if (game.listening) animateEqBars(25 + Math.random() * 55);
      }, 140);
    }
    const target = lbl || btn;
    if (!myTurn && game.isOnline) {
      const activeP = game.players[game.currentPlayerIndex];
      target.textContent = `⏳ TURNO DE ${activeP ? activeP.name.toUpperCase() : "RIVAL"}`;
    } else {
      target.textContent = activeListen
        ? "ESCUCHANDO... (Toca para parar)"
        : "🎤 HABLAR · Responde o di «Paso»";
    }
  }

  function flashAnswerTiles(answer, isCorrect) {
    const slotsEl = document.getElementById("wordSlots");
    if (!slotsEl || !answer) return;
    slotsEl.innerHTML = "";
    const compact = answer.length >= 10;
    for (let i = 0; i < answer.length; i++) {
      const box = document.createElement("div");
      box.className = `word-slot${compact ? " compact" : ""} ${isCorrect ? "reveal-ok" : "reveal-bad"}`;
      box.style.animationDelay = `${Math.min(i * 35, 280)}ms`;
      box.textContent = answer[i].toUpperCase();
      slotsEl.appendChild(box);
    }
  }

  function advanceTurn(passPlayer) {
    const total = game.items.length;
    let nextIdx = -1;
    let wrapped = false;
    for (let step = 1; step <= total; step++) {
      const idx = (game.currentIndex + step) % total;
      const st = game.items[idx].status;
      if (st === "pending" || st === "passed") {
        nextIdx = idx;
        wrapped = (game.currentIndex + step) >= total;
        break;
      }
    }
    if (nextIdx === -1) {
      finishGame("completed");
      return;
    }
    if (wrapped) game.lap++;
    game.currentIndex = nextIdx;

    if (game.players.length > 1 && passPlayer) {
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
      if (game.timeLimit > 0) game.timeRemaining = game.timeLimit;
    }
    renderGame();
  }

  function requestRewardedLifeline(kind) {
    if (window.RosconAndroid && window.RosconAndroid.showRewardedLifeline) {
      window.RosconAndroid.showRewardedLifeline(kind);
    } else {
      // En navegador web concede el comodín directo para poder probar la experiencia
      window.onAndroidRewardGranted(kind);
    }
  }

  function useHint() {
    if (!game.active || !isMyActiveTurn()) return;
    if (game.isOnline) {
      sendOnlineAction("hint", {});
      return;
    }
    const item = game.items[game.currentIndex];
    const player = game.players[game.currentPlayerIndex];
    if (!item || !player) return;

    if (player.hintsLeft <= 0) {
      if (!isVip && selectedThemeId !== "infantil") {
        requestRewardedLifeline("hints");
      }
      return;
    }

    const hidden = [];
    for (let i = 0; i < item.q.Answer.length; i++) {
      if (!item.revealed.includes(i)) hidden.push(i);
    }
    if (hidden.length <= 1) return;

    const pick = hidden[Math.floor(Math.random() * hidden.length)];
    item.revealed.push(pick);
    player.hintsLeft--;
    SFX.hint();
    renderGame();
  }

  function passWord() {
    if (!game.active || !isMyActiveTurn() || game.revealing) return;
    if (autoMicTimer) clearTimeout(autoMicTimer);
    if (game.isOnline) {
      sendOnlineAction("pass", {});
      return;
    }
    const item = game.items[game.currentIndex];
    if (!item) return;
    item.status = "passed";
    game.players[game.currentPlayerIndex].streak = 0;
    if (game.isSuddenDeath && game.timeLimit > 0) game.timeRemaining = game.timeLimit;
    SFX.pass();
    advanceTurn(true);
  }

  function finalizeHabaChoice(shielded) {
    const ctx = pendingHabaContext;
    pendingHabaContext = null;
    document.getElementById("habaShieldModal").classList.add("hidden");
    if (!ctx || !game.active) return;

    const { player, letter, passPlayerAfter, basePts } = ctx;
    if (shielded) {
      game.habaShieldUsed = true;
      player.score += basePts;
      SFX.fireworks();
      showCeremonyOverlay("shield", "🛡️ ¡ESCUDO REAL ACTIVADO!", `Bloqueaste el Haba en la ${letter} (0 penalización)`);
      showSurpriseToast("king", `🛡️ ¡Escudo Real! Esquivaste el Haba en la ${letter}`);
    } else {
      player.foundHaba = true;
      player.score = Math.max(0, player.score + basePts - 75);
      SFX.haba();
      if (window.RosconAndroid) window.RosconAndroid.vibrate(180);
      showCeremonyOverlay("haba", `🫘 ¡EL HABA EN LA ${letter}!`, "Te toca pagar el Roscón (-75 pts)");
      showSurpriseToast("haba", `¡TE TOCÓ EL HABA EN LA ${letter}! Pagas el Roscón (-75 pts)`);
    }

    if (game.timeLimit > 0) startClock();
    advanceTurn(passPlayerAfter);
  }

  function evaluateAnswer(isCorrect) {
    if (!game.active || !isMyActiveTurn() || game.revealing) return;
    if (autoMicTimer) clearTimeout(autoMicTimer);
    if (game.isOnline) {
      sendOnlineAction("answer", { correct: !!isCorrect });
      return;
    }
    const item = game.items[game.currentIndex];
    const player = game.players[game.currentPlayerIndex];
    if (!item || !player) return;

    if (isCorrect) {
      item.status = "correct";
      player.correct++;
      player.streak++;
      player.bestStreak = Math.max(player.bestStreak, player.streak);
      let pts = Math.max(40, 100 - Math.max(0, item.revealed.length - 1) * 20)
              + Math.min(125, (player.streak - 1) * 25);

      const card = document.getElementById("questionCard");
      if (card) {
        card.classList.add("flash-ok");
        setTimeout(() => card.classList.remove("flash-ok"), 520);
      }
      flashAnswerTiles(item.q.Answer, true);
      spawnScorePop(player.streak >= 3 ? `+${pts} 🔥×${player.streak}` : `+${pts}`);
      spawnMiniBurst(0.5, 0.30, "#ffd84d", "#25eb93");

      if (game.currentIndex === game.prizeIndex && !game.prizeFound) {
        game.prizeFound = true;
        player.foundKing = true;
        pts += 500;
        player.score += pts;
        SFX.fireworks();
        triggerFireworks();
        if (window.RosconAndroid) window.RosconAndroid.vibrate(150);
        showCeremonyOverlay("king", "👑 ¡FIGURITA DEL REY!", `Encontrada en la ${item.q.Letter} (+500 PUNTOS)`);
        showSurpriseToast("king", `★ ¡PREMIO! ENCONTRASTE AL REY EN LA ${item.q.Letter} (+500 PTS) ★`);
      } else if (game.currentIndex === game.habaIndex && !game.habaFound) {
        game.habaFound = true;
        if (isVip && !game.habaShieldUsed) {
          game.habaShieldUsed = true;
          player.score += pts;
          SFX.fireworks();
          showCeremonyOverlay("shield", "🛡️ ¡ESCUDO VIP!", `Tu Corona Real bloqueó el Haba en la ${item.q.Letter}`);
          showSurpriseToast("king", `🛡️ ¡Tu Escudo VIP bloqueó el Haba en la ${item.q.Letter}!`);
        } else if (!game.habaShieldUsed && game.players.length === 1 && selectedThemeId !== "infantil") {
          stopClock();
          pendingHabaContext = { player, letter: item.q.Letter, passPlayerAfter: false, basePts: pts };
          document.getElementById("habaShieldModal").classList.remove("hidden");
          return;
        } else {
          player.foundHaba = true;
          player.score = Math.max(0, player.score + pts - 75);
          SFX.haba();
          if (window.RosconAndroid) window.RosconAndroid.vibrate(180);
          showCeremonyOverlay("haba", `🫘 ¡EL HABA EN LA ${item.q.Letter}!`, "Pagas el Roscón (-75 PUNTOS)");
          showSurpriseToast("haba", `¡TE TOCÓ EL HABA EN LA ${item.q.Letter}! Pagas el Roscón (-75 pts)`);
        }
      } else {
        player.score += pts;
        SFX.correct(player.streak);
        if (window.RosconAndroid) window.RosconAndroid.vibrate(35);
      }

      if ((game.players.length > 1 || game.isSuddenDeath) && game.timeLimit > 0) {
        game.timeRemaining = game.timeLimit;
      }
      game.revealing = true;
      updateVoiceButton();
      setTimeout(() => {
        game.revealing = false;
        if (game.active) advanceTurn(false);
      }, 540);
    } else {
      item.status = "wrong";
      player.wrong++;
      player.streak = 0;

      const card = document.getElementById("questionCard");
      card.classList.remove("shake");
      void card.offsetWidth;
      card.classList.add("shake");
      flashAnswerTiles(item.q.Answer, false);
      spawnScorePop(item.q.Answer.toUpperCase(), true);

      if (game.currentIndex === game.habaIndex && !game.habaFound && !game.isSuddenDeath) {
        game.habaFound = true;
        if (isVip && !game.habaShieldUsed) {
          game.habaShieldUsed = true;
          SFX.hint();
          showCeremonyOverlay("shield", "🛡️ ¡ESCUDO VIP!", `Tu Corona Real evitó los -75 pts del Haba`);
        } else if (!game.habaShieldUsed && game.players.length === 1 && selectedThemeId !== "infantil") {
          stopClock();
          pendingHabaContext = { player, letter: item.q.Letter, passPlayerAfter: true, basePts: 0 };
          document.getElementById("habaShieldModal").classList.remove("hidden");
          return;
        } else {
          player.foundHaba = true;
          player.score = Math.max(0, player.score - 75);
          SFX.haba();
          if (window.RosconAndroid) window.RosconAndroid.vibrate(180);
          showCeremonyOverlay("haba", `🫘 ¡EL HABA EN LA ${item.q.Letter}!`, "Pagas el Roscón (-75 PUNTOS)");
          showSurpriseToast("haba", `¡TE TOCÓ EL HABA EN LA ${item.q.Letter}! Pagas el Roscón (-75 pts)`);
        }
      } else {
        SFX.wrong();
        if (window.RosconAndroid) window.RosconAndroid.vibrate(70);
      }
      game.revealing = true;
      updateVoiceButton();
      setTimeout(() => {
        game.revealing = false;
        if (!game.active) return;
        if (game.isSuddenDeath) {
          finishGame("sudden_death");
        } else {
          advanceTurn(true);
        }
      }, 1150);
    }
  }

  function handleVoiceCandidates(candidates) {
    game.listening = false;
    updateVoiceButton();
    if (!game.active || game.revealing || !Array.isArray(candidates) || candidates.length === 0) return;

    const primarySpoken = String(candidates[0] || "").trim();

    for (const raw of candidates) {
      const norm = normalizeSpanish(raw);
      if (norm === "paso" || norm === "siguiente" || norm === "pasa"
          || norm.includes("pasapalabra") || norm.includes("pasa palabra") || norm.includes("paso palabra")) {
        showHeardBubble("⏭ Pasapalabra");
        passWord();
        return;
      }
      if (norm === "pista" || norm === "ayuda" || norm === "dame una pista" || norm === "comodin") {
        showHeardBubble("💡 Pista");
        useHint();
        return;
      }
    }

    const item = game.items[game.currentIndex];
    if (!item) return;

    for (const raw of candidates) {
      if (isSmartSpanishMatch(raw, item.q)) {
        showHeardBubble(`🗣️ «${raw}» ✅`, "ok");
        evaluateAnswer(true);
        return;
      }
    }

    if (primarySpoken) {
      showHeardBubble(`🗣️ «${primarySpoken}» ❌ · Era: ${item.q.Answer.toUpperCase()}`, "bad");
    }
    evaluateAnswer(false);
  }

  function finishGame(reason) {
    game.active = false;
    stopClock();
    stopAllSpeech();
    if (window.RosconAndroid) {
      window.RosconAndroid.stopListening();
    }
    if (webRecognition) {
      try { webRecognition.abort(); } catch (_) {}
      webRecognition = null;
    }

    const totalCorrect = game.items.filter(x => x.status === "correct").length;
    const ranked = [...game.players].sort((a, b) => (b.correct - a.correct) || (b.score - a.score));
    const top = ranked[0] || { name: "Jugador", correct: 0, score: 0, bestStreak: 0 };

    document.getElementById("summaryBadge").textContent =
      totalCorrect === game.items.length
        ? "¡CORONA PERFECTA!"
        : (reason === "sudden_death"
          ? "⚡ FIN DE MUERTE SÚBITA"
          : (reason === "timeout" ? "TIEMPO AGOTADO" : "FIN DE LA PARTIDA"));

    const tied = ranked.length > 1 && ranked[0].correct === ranked[1].correct && ranked[0].score === ranked[1].score;
    document.getElementById("summaryTitle").textContent =
      game.players.length > 1
        ? (tied ? "¡Empate en el Roscón!" : `¡Victoria de ${top.name}!`)
        : (totalCorrect === game.items.length ? "¡24 de 24 palabras!" : `${totalCorrect} de ${game.items.length} aciertos`);

    document.getElementById("summarySubtitle").textContent =
      `${top.correct} aciertos · ${top.score} puntos · Mejor racha: ${top.bestStreak}`;

    const rankBox = document.getElementById("summaryRanking");
    rankBox.innerHTML = "";
    ranked.forEach((p, idx) => {
      const row = document.createElement("div");
      row.className = `rank-row${idx === 0 ? " winner" : ""}`;
      let tags = "";
      if (p.foundKing) tags += " ★REY";
      if (p.foundHaba) tags += " (HABA)";
      row.innerHTML = `<span>#${idx + 1} ${p.name}${tags}</span><span class="rank-stats">${p.correct} aciertos · ${p.score} pts</span>`;
      rankBox.appendChild(row);
    });

    const revBox = document.getElementById("summaryReview");
    revBox.innerHTML = "";
    game.items.forEach((it, idx) => {
      const card = document.createElement("div");
      card.className = "review-card";
      let badge = "";
      if (idx === game.prizeIndex) badge = " ★ REY";
      else if (idx === game.habaIndex) badge = " · HABA";
      card.innerHTML = `
        <div class="review-letter ${it.status}">${it.q.Letter}</div>
        <div class="review-body">
          <div class="review-ans">${it.q.Answer.toUpperCase()}${badge}</div>
          <div class="review-clue">${it.q.Clue}</div>
        </div>`;
      revBox.appendChild(card);
    });

    const playAgainBtn = document.getElementById("btnPlayAgain");
    if (playAgainBtn) {
      playAgainBtn.textContent = game.isOnline
        ? "Revancha online"
        : (game.isDaily ? "Ver Ranking Mundial" : "Jugar otra vez");
    }

    // Actualiza Rango Real + Medallas desbloqueables
    recordProfileProgress(top, totalCorrect, reason);

    // Dibuja Tarjeta de Victoria compartible
    renderVictoryCardCanvas(top, totalCorrect);

    // Si era El Rosco del Día, guarda racha y envía al Ranking Mundial en Render
    const dailyBanner = document.getElementById("dailyRankBanner");
    if (dailyBanner) {
      if (game.isDaily && reason !== "abandoned") {
        const dDate = game.dailyDate || getTodayDateStr();
        const meta = saveDailyCompletion(dDate, top.correct, top.score);
        dailyBanner.classList.remove("hidden");
        dailyBanner.textContent = `🔥 Racha Diaria: ${meta.streak || 1} día(s) · Enviando al Ranking Mundial...`;
        const elapsedSec = Math.max(5, Math.round((Date.now() - (game.startedAtMs || Date.now())) / 1000));
        submitDailyScoreToServer(dDate, top.correct, top.score, elapsedSec, !!top.foundKing);
      } else {
        dailyBanner.classList.add("hidden");
      }
    }

    showScreen("screenSummary");
    if (reason !== "abandoned") {
      if (reason === "timeout") {
        SFX.wrong();
      } else {
        SFX.fireworks();
        triggerFireworks();
      }
    }
  }

  // ==================== TARJETA DE VICTORIA PNG + SHARE ====================
  const cakeImgForCard = new Image();
  cakeImgForCard.src = "roscon_cake.webp";

  function renderVictoryCardCanvas(topPlayer, totalCorrect) {
    const cv = document.getElementById("victoryCardCanvas");
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#0b2920");
    grad.addColorStop(0.55, "#071a15");
    grad.addColorStop(1, "#05100d");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Borde dorado doble
    ctx.strokeStyle = "#fbc84a";
    ctx.lineWidth = 6;
    ctx.strokeRect(18, 18, W - 36, H - 36);
    ctx.strokeStyle = "rgba(255, 230, 134, 0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, W - 60, H - 60);

    // Cabecera
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffe686";
    ctx.font = "900 22px sans-serif";
    const modeTitle = game.isDaily
      ? `🔥 EL ROSCO DEL DÍA · ${game.dailyDate || getTodayDateStr()}`
      : `${(getSelectedTheme() || {}).icon || "🎄"} ${((getSelectedTheme() || {}).title || "ROSCÓN").toUpperCase()}`;
    ctx.fillText(modeTitle, W / 2, 76);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 44px sans-serif";
    ctx.fillText("ROSCÓN DE REYES", W / 2, 128);

    // Roscón central + 24 letras coloreadas alrededor
    const cx = W / 2, cy = 385, ringR = 192;
    const glow = ctx.createRadialGradient(cx, cy, 40, cx, cy, 225);
    glow.addColorStop(0, "rgba(251, 200, 74, 0.32)");
    glow.addColorStop(1, "rgba(251, 200, 74, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 225, 0, Math.PI * 2);
    ctx.fill();

    if (cakeImgForCard.complete && cakeImgForCard.naturalWidth > 0) {
      ctx.drawImage(cakeImgForCard, cx - 155, cy - 155, 310, 310);
    }

    // Medallón central con puntuación
    ctx.fillStyle = "#082019";
    ctx.beginPath();
    ctx.arc(cx, cy, 74, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffe686";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = "#ffe686";
    ctx.font = "900 38px sans-serif";
    ctx.fillText(`${topPlayer.correct}/${game.items.length || 24}`, cx, cy + 4);
    ctx.fillStyle = "#c8e6dc";
    ctx.font = "800 18px sans-serif";
    ctx.fillText(`${topPlayer.score} PTS`, cx, cy + 34);

    // 24 fichas del rosco
    const n = game.items.length || 24;
    for (let i = 0; i < n; i++) {
      const it = game.items[i];
      const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
      const lx = cx + Math.cos(ang) * ringR;
      const ly = cy + Math.sin(ang) * ringR;

      let fill = "#1e3d33", stroke = "#fbc84a";
      if (game.prizeFound && i === game.prizeIndex && it.status === "correct") {
        fill = "#f5b324"; stroke = "#ffffff";
      } else if (it.status === "correct") {
        fill = "#16b877"; stroke = "#9efad3";
      } else if (it.status === "wrong") {
        fill = "#d92b3d"; stroke = "#ff9ea8";
      } else if (it.status === "passed") {
        fill = "#d98218"; stroke = "#ffe09e";
      }

      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(lx, ly, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "900 18px sans-serif";
      ctx.fillText(it.q.Letter, lx, ly + 6);
    }

    // Estadísticas inferiores
    let extras = `Mejor racha: ×${topPlayer.bestStreak}`;
    if (topPlayer.foundKing) extras += "  ·  ★ ENCONTRÓ AL REY";
    if (topPlayer.foundHaba) extras += "  ·  🫘 HABA";
    ctx.fillStyle = "#ffe686";
    ctx.font = "800 22px sans-serif";
    ctx.fillText(extras, W / 2, 658);

    // Píldora dorada inferior
    ctx.fillStyle = "#f5b82e";
    ctx.beginPath();
    ctx.roundRect(110, 698, W - 220, 62, 31);
    ctx.fill();
    ctx.fillStyle = "#161106";
    ctx.font = "900 24px sans-serif";
    ctx.fillText("¿SUPERAS MI ROSCÓN? 👑", W / 2, 738);

    ctx.fillStyle = "#9ec5b8";
    ctx.font = "700 18px sans-serif";
    const rankLabel = getRoyalRankInfo(loadPlayerProfile().totalCorrect).cur.label;
    ctx.fillText(`${rankLabel} · Newbie Pro Studio`, W / 2, 804);
  }

  function buildEmojiShareText() {
    const ranked = [...game.players].sort((a, b) => (b.correct - a.correct) || (b.score - a.score));
    const top = ranked[0] || { correct: 0, score: 0, foundKing: false };
    const ringEmojis = game.items.map((it, idx) => {
      if (game.prizeFound && idx === game.prizeIndex && it.status === "correct") return "👑";
      if (it.status === "correct") return "🟢";
      if (it.status === "wrong") return "🔴";
      return "🟡";
    }).join("");
    const modeLabel = game.isDaily ? `🔥 Rosco del Día (${game.dailyDate})` : `🎄 Roscón de Reyes`;
    return `${modeLabel}: ${top.correct}/24 aciertos (${top.score} pts)${top.foundKing ? " ★¡Me tocó el Rey!" : ""}\n${ringEmojis}\n¿Me superas hablando? 👉 https://newbieprostudio.itch.io/roscon-de-reyes`;
  }

  async function shareVictoryCard() {
    const cv = document.getElementById("victoryCardCanvas");
    const shareText = buildEmojiShareText();
    if (cv && window.RosconAndroid && window.RosconAndroid.shareVictoryCard) {
      const dataUrl = cv.toDataURL("image/png");
      window.RosconAndroid.shareVictoryCard(dataUrl, shareText);
      return;
    }
    try {
      if (cv && navigator.share) {
        const blob = await new Promise(res => cv.toBlob(res, "image/png"));
        const file = new File([blob], "roscon_victoria.png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ title: "Roscón de Reyes", text: shareText, files: [file] });
          return;
        }
        await navigator.share({ title: "Roscón de Reyes", text: shareText });
        return;
      }
    } catch (_) {}
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareText).catch(() => {});
      showSurpriseToast("king", "✅ Resultado copiado al portapapeles");
    }
  }

  // ==================== EL ROSCO DEL DÍA + RANKING MUNDIAL ====================
  function seededHash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function buildOfflineDailyFallback(dateStr) {
    let seed = seededHash("ROSCON_OFFLINE_DAILY_" + dateStr);
    const nextRand = () => {
      seed = (seed + 0x6D2B79F5) >>> 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const byL = {};
    for (const l of ROSCO_LETTERS) byL[l] = [];
    for (const q of allQuestions) {
      if (byL[q.Letter]) byL[q.Letter].push(q);
    }
    const questions = [];
    const usedDailyAns = new Set();
    for (const l of ROSCO_LETTERS) {
      const pool = (byL[l] || []).filter(q => !usedDailyAns.has(normalizeSpanish(q.Answer)));
      if (pool.length > 0) {
        const pick = pool[Math.floor(nextRand() * pool.length)];
        usedDailyAns.add(normalizeSpanish(pick.Answer));
        questions.push(pick);
      }
    }
    const prizeIndex = Math.floor(nextRand() * questions.length);
    const habaIndex = (prizeIndex + 1 + Math.floor(nextRand() * Math.max(1, questions.length - 1))) % Math.max(1, questions.length);
    return { date: dateStr, timeLimit: 180, hints: 3, prizeIndex, habaIndex, questions };
  }

  async function startDailyChallenge() {
    document.getElementById("leaderboardModal").classList.add("hidden");
    leaveOnlineRoom(false);
    const today = getTodayDateStr();
    let daily = null;

    try {
      const res = await nativeHttpJson(`${online.serverUrl}/api/daily?date=${encodeURIComponent(today)}`, "GET", null, 7000, null);
      if (res.ok && res.data && res.data.daily && Array.isArray(res.data.daily.questions) && res.data.daily.questions.length > 0) {
        daily = res.data.daily;
      }
    } catch (_) {}

    if (!daily) {
      await loadThemeBank("navidad");
      daily = buildOfflineDailyFallback(today);
    }

    const nickInp = document.getElementById("dailyPlayerNameInput");
    const savedNick = (nickInp && nickInp.value.trim()) || localStorage.getItem(PLAYER_NAME_KEY) || "Jugador";
    const displayNick = isVip ? `👑 ${savedNick.replace(/^👑\s*/, "")}` : savedNick;

    game.isOnline = false;
    game.isDaily = true;
    game.isSuddenDeath = false;
    game.revealing = false;
    game.dailyDate = daily.date || today;
    game.startedAtMs = Date.now();
    game.habaShieldUsed = false;
    game.players = [{
      id: 0,
      name: displayNick,
      score: 0,
      correct: 0,
      wrong: 0,
      streak: 0,
      bestStreak: 0,
      hintsLeft: (daily.hints || 3) + (isVip ? 2 : 0),
      foundKing: false,
      foundHaba: false
    }];
    for (const q of (daily.questions || [])) {
      markQuestionPlayed(q);
    }
    savePlayedHistory();

    game.items = daily.questions.map(q => ({
      q,
      status: "pending",
      revealed: q.Mode === "StartsWith" ? [0] : []
    }));
    game.prizeFound = false;
    game.habaFound = false;
    game.prizeIndex = typeof daily.prizeIndex === "number" ? daily.prizeIndex : 0;
    game.habaIndex = typeof daily.habaIndex === "number" ? daily.habaIndex : 1;
    game.currentIndex = 0;
    game.currentPlayerIndex = 0;
    game.timeLimit = daily.timeLimit || 180;
    game.timeRemaining = game.timeLimit;
    game.lap = 1;
    game.active = true;
    game.listening = false;
    game.lastSpokenId = "";

    document.getElementById("surpriseToast").classList.add("hidden");
    buildLetterButtons();
    showScreen("screenGame");
    renderGame();
    startClock();
  }

  function renderLeaderboardRows(rows) {
    const box = document.getElementById("leaderboardList");
    if (!box) return;
    if (!Array.isArray(rows) || rows.length === 0) {
      box.innerHTML = `<div class="lb-empty">¡Aún no hay marcas hoy! Sé el primero en coronarte #1 del mundo 👑</div>`;
      return;
    }
    box.innerHTML = "";
    rows.forEach((r, idx) => {
      const div = document.createElement("div");
      div.className = `lb-row${idx === 0 ? " top1" : ""}`;
      const crown = r.isVip ? "👑 " : "";
      const kingStar = r.foundKing ? " ★" : "";
      div.innerHTML = `
        <span>#${r.rank || (idx + 1)} ${crown}${r.name}${kingStar}</span>
        <span>${r.correct}/24 · ${r.score} pts</span>
      `;
      box.appendChild(div);
    });
  }

  async function openLeaderboardModal() {
    const modal = document.getElementById("leaderboardModal");
    if (!modal) return;
    const today = getTodayDateStr();
    document.getElementById("leaderboardDateSub").textContent = `Clasificación mundial · ${today}`;
    const nickInp = document.getElementById("dailyPlayerNameInput");
    if (nickInp && !nickInp.value) {
      try { nickInp.value = localStorage.getItem(PLAYER_NAME_KEY) || ""; } catch (_) {}
    }
    document.getElementById("leaderboardList").innerHTML = `<div class="lb-empty">Conectando con el Ranking Mundial...</div>`;
    modal.classList.remove("hidden");
    try {
      const res = await nativeHttpJson(`${online.serverUrl}/api/daily/leaderboard?date=${encodeURIComponent(today)}`, "GET", null, 8000, null);
      if (res.ok && res.data && res.data.ok) {
        renderLeaderboardRows(res.data.leaderboard || []);
        return;
      }
    } catch (_) {}
    document.getElementById("leaderboardList").innerHTML = `<div class="lb-empty">Sin conexión al ranking ahora mismo. ¡Puedes jugar igual!</div>`;
  }

  async function submitDailyScoreToServer(dateStr, correct, score, elapsedSec, foundKing) {
    const rawNick = (document.getElementById("dailyPlayerNameInput")?.value || localStorage.getItem(PLAYER_NAME_KEY) || "Jugador").trim().slice(0, 16) || "Jugador";
    try { localStorage.setItem(PLAYER_NAME_KEY, rawNick); } catch (_) {}
    try {
      const res = await nativeHttpJson(`${online.serverUrl}/api/daily/submit`, "POST", {
        playerId: online.playerId,
        name: rawNick.replace(/^👑\s*/, ""),
        isVip,
        date: dateStr,
        correct,
        score,
        elapsedSec,
        foundKing
      }, 10000, null);
      if (res.ok && res.data && res.data.ok) {
        const dailyBanner = document.getElementById("dailyRankBanner");
        const meta = loadDailyMeta();
        if (dailyBanner) {
          dailyBanner.textContent = `🏆 Puesto Mundial Hoy: #${res.data.myRank} · 🔥 Racha: ${meta.streak || 1} día(s)`;
        }
      }
    } catch (_) {}
  }

  // ==================== ONLINE 1 VS 1 ENGINE ====================
  function getPlayerName() {
    const inp = document.getElementById("onlineNameInput");
    const raw = (inp ? inp.value : "").trim();
    const clean = raw.slice(0, 16) || "Jugador";
    try { localStorage.setItem(PLAYER_NAME_KEY, clean); } catch (_) {}
    return clean;
  }

  function showOnlineError(msg) {
    const el = document.getElementById("onlineErrorMsg");
    if (!el) return;
    if (!msg) {
      el.classList.add("hidden");
      el.textContent = "";
    } else {
      el.textContent = msg;
      el.classList.remove("hidden");
    }
  }

  function setWaitingUi(visible, msg, roomCode = "") {
    const box = document.getElementById("onlineWaitingBox");
    const codeEl = document.getElementById("waitingCodeDisplay");
    const msgEl = document.getElementById("onlineStatusMsg");
    if (!box) return;
    box.classList.toggle("hidden", !visible);
    if (msgEl && msg) msgEl.textContent = msg;
    if (codeEl) {
      codeEl.classList.toggle("hidden", !roomCode);
      codeEl.textContent = roomCode || "";
    }
  }

  const pendingNativeHttp = new Map();
  let nativeHttpSeq = 0;

  window.onAndroidHttpResponse = (reqId, status, bodyText, errText) => {
    const entry = pendingNativeHttp.get(reqId);
    if (!entry) return;
    pendingNativeHttp.delete(reqId);
    clearTimeout(entry.timer);
    if (errText) {
      entry.reject(new Error(errText));
      return;
    }
    let data = {};
    try { data = JSON.parse(bodyText || "{}"); } catch (_) {}
    entry.resolve({ ok: status >= 200 && status < 300, status, data });
  };

  function nativeHttpJson(url, method = "GET", body = null, timeoutMs = 8000, signal = null) {
    if (window.RosconAndroid && window.RosconAndroid.httpRequest) {
      return new Promise((resolve, reject) => {
        const reqId = `r_${++nativeHttpSeq}`;
        const timer = setTimeout(() => {
          pendingNativeHttp.delete(reqId);
          reject(new Error("Timeout de red"));
        }, timeoutMs + 1500);
        pendingNativeHttp.set(reqId, { resolve, reject, timer });
        if (signal) {
          signal.addEventListener("abort", () => {
            if (pendingNativeHttp.has(reqId)) {
              clearTimeout(timer);
              pendingNativeHttp.delete(reqId);
              reject(new Error("Aborted"));
            }
          }, { once: true });
        }
        window.RosconAndroid.httpRequest(reqId, url, method, body !== null ? JSON.stringify(body) : "", timeoutMs);
      });
    }
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);
    if (signal) signal.addEventListener("abort", () => ctrl.abort(), { once: true });
    const opts = { method, signal: ctrl.signal };
    if (body !== null) {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts)
      .then(async (res) => {
        clearTimeout(tid);
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
      })
      .catch((err) => {
        clearTimeout(tid);
        throw err;
      });
  }

  async function onlineApi(path, method = "GET", body = null, signal = null) {
    const url = `${online.serverUrl}${path}`;
    const timeoutMs = path.includes("/room/state") ? 12000 : 18000;
    const res = await nativeHttpJson(url, method, body, timeoutMs, signal);
    if (!res.ok || res.data.ok === false) {
      throw new Error(res.data.error || `Error de servidor (${res.status})`);
    }
    return res.data;
  }

  async function probeServerUrl(baseUrl) {
    try {
      const res = await nativeHttpJson(`${baseUrl}/api/health`, "GET", null, 25000, null);
      if (res.ok && res.data && res.data.ok) return res.data;
    } catch (_) {}
    return null;
  }

  async function checkServerHealth() {
    const pill = document.getElementById("serverStatusPill");
    if (pill) {
      pill.className = "server-pill";
      pill.textContent = "Conectando...";
    }
    const wakeHintTimer = setTimeout(() => {
      if (pill && pill.textContent === "Conectando...") {
        pill.textContent = "Despertando servidor...";
      }
    }, 3500);
    const candidates = [];
    for (const u of [online.serverUrl, DEFAULT_ONLINE_SERVER]) {
      if (u && !candidates.includes(u)) candidates.push(u);
    }
    for (const cand of candidates) {
      const h = await probeServerUrl(cand);
      if (h) {
        clearTimeout(wakeHintTimer);
        online.serverUrl = cand;
        const urlInp = document.getElementById("serverUrlInput");
        if (urlInp) urlInp.value = cand;
        if (pill) {
          pill.className = "server-pill ok";
          pill.textContent = `● Online (${h.rooms} salas)`;
        }
        showOnlineError("");
        return true;
      }
    }
    clearTimeout(wakeHintTimer);
    if (pill) {
      pill.className = "server-pill err";
      pill.textContent = "○ Servidor no disponible";
    }
    return false;
  }

  function openOnlineLobby() {
    leaveOnlineRoom(false);
    const nameInp = document.getElementById("onlineNameInput");
    if (nameInp && !nameInp.value) {
      try {
        nameInp.value = localStorage.getItem(PLAYER_NAME_KEY) || "";
      } catch (_) {}
    }
    const urlInp = document.getElementById("serverUrlInput");
    if (urlInp) urlInp.value = online.serverUrl;
    setWaitingUi(false, "");
    showOnlineError("");
    showScreen("screenOnlineLobby");
    checkServerHealth();
  }

  function cancelOnlineWait() {
    if (online.queueTimer) {
      clearInterval(online.queueTimer);
      online.queueTimer = null;
    }
    if (online.waitingMode === "queue") {
      onlineApi("/api/matchmake/cancel", "POST", { playerId: online.playerId }).catch(() => {});
    }
    online.waitingMode = "";
    if (online.abortCtrl) {
      try { online.abortCtrl.abort(); } catch (_) {}
      online.abortCtrl = null;
    }
    online.syncLoopId++;
    online.roomCode = "";
    setWaitingUi(false, "");
  }

  function leaveOnlineRoom(notifyServer = false) {
    if (notifyServer && online.roomCode && game.active) {
      onlineApi("/api/room/action", "POST", {
        roomCode: online.roomCode,
        playerId: online.playerId,
        action: "finish",
        payload: {}
      }).catch(() => {});
    }
    cancelOnlineWait();
    online.active = false;
    online.mySeat = -1;
    online.version = -1;
    online.lastEventSeq = 0;
    game.isOnline = false;
  }

  async function startOnlineMatchmaking() {
    cancelOnlineWait();
    showOnlineError("");
    const name = getPlayerName();
    setWaitingUi(true, "Buscando rival disponible...");
    try {
      const data = await onlineApi("/api/matchmake", "POST", {
        playerId: online.playerId,
        name,
        diff: selectedDiff,
        theme: selectedThemeId,
        playedKeys: [...playedKeys]
      });
      if (data.status === "matched" && data.room) {
        enterOnlineRoom(data.room);
        return;
      }
      online.waitingMode = "queue";
      online.queueTimer = setInterval(async () => {
        if (online.waitingMode !== "queue") return;
        try {
          const st = await onlineApi(`/api/matchmake/status?playerId=${encodeURIComponent(online.playerId)}`);
          if (st.status === "matched" && st.room) {
            clearInterval(online.queueTimer);
            online.queueTimer = null;
            online.waitingMode = "";
            enterOnlineRoom(st.room);
          }
        } catch (_) {}
      }, 900);
    } catch (err) {
      setWaitingUi(false, "");
      showOnlineError(err.message || "No se pudo conectar al servidor online.");
    }
  }

  async function createPrivateRoom() {
    cancelOnlineWait();
    showOnlineError("");
    const name = getPlayerName();
    try {
      const data = await onlineApi("/api/room/create", "POST", {
        playerId: online.playerId,
        name,
        diff: selectedDiff,
        theme: selectedThemeId,
        playedKeys: [...playedKeys]
      });
      const room = data.room;
      online.roomCode = room.roomCode;
      online.mySeat = room.mySeat;
      online.version = room.version;
      online.waitingMode = "room";
      setWaitingUi(true, "Comparte este código con el otro jugador. Empezará en cuanto entre.", room.roomCode);
      startRoomSyncLoop();
    } catch (err) {
      showOnlineError(err.message || "No se pudo crear la sala.");
    }
  }

  async function joinPrivateRoom() {
    cancelOnlineWait();
    showOnlineError("");
    const codeInp = document.getElementById("joinCodeInput");
    const code = (codeInp ? codeInp.value : "").trim().toUpperCase();
    if (code.length < 4) {
      showOnlineError("Escribe el código de 4 letras de la sala.");
      return;
    }
    const name = getPlayerName();
    try {
      const data = await onlineApi("/api/room/join", "POST", {
        roomCode: code,
        playerId: online.playerId,
        name,
        playedKeys: [...playedKeys]
      });
      enterOnlineRoom(data.room);
    } catch (err) {
      showOnlineError(err.message || "No se pudo entrar a la sala.");
    }
  }

  function enterOnlineRoom(room) {
    online.waitingMode = "";
    online.active = true;
    online.roomCode = room.roomCode;
    online.mySeat = room.mySeat;
    online.version = -1;
    online.lastEventSeq = 0;
    setWaitingUi(false, "");
    applyOnlineRoomState(room);
    startRoomSyncLoop();
  }

  function applyOnlineRoomState(room) {
    if (!room) return;
    const prevVersion = online.version;
    online.version = room.version;
    online.mySeat = room.mySeat;
    online.roomCode = room.roomCode;

    if (room.status === "waiting") {
      setWaitingUi(true, "Esperando al rival...", room.roomCode);
      return;
    }

    // Guarda todas las 24 preguntas del rosco online en el historial local para no repetirlas nunca
    let addedHistory = false;
    for (const it of (room.items || [])) {
      if (markQuestionPlayed(it.q)) {
        addedHistory = true;
      }
    }
    if (addedHistory) savePlayedHistory();

    const wasPlaying = game.active && game.isOnline;
    const prevItemsCount = game.items.length;

    game.isOnline = true;
    game.players = room.players || [];
    game.items = room.items || [];
    game.currentIndex = room.currentIndex || 0;
    game.currentPlayerIndex = room.currentPlayerIndex || 0;
    game.timeLimit = room.timeLimit || 0;
    game.timeRemaining = room.timeRemaining || 0;
    game.lap = room.lap || 1;
    game.prizeIndex = room.prizeIndex;
    game.habaIndex = room.habaIndex;
    game.prizeFound = !!room.prizeFound;
    game.habaFound = !!room.habaFound;

    // Procesa efectos de sonido / fuegos artificiales del ultimo evento nuevo
    const ev = room.lastEvent;
    if (ev && ev.seq && ev.seq > online.lastEventSeq) {
      online.lastEventSeq = ev.seq;
      if (ev.type === "start") {
        game.lastSpokenId = "";
        document.getElementById("surpriseToast").classList.add("hidden");
      } else if (ev.surprise === "king") {
        SFX.fireworks();
        triggerFireworks();
        if (window.RosconAndroid) window.RosconAndroid.vibrate(140);
        showSurpriseToast("king", `★ ¡${ev.actorName.toUpperCase()} ENCONTRÓ AL REY EN LA ${ev.letter} (+500 PTS)! ★`);
      } else if (ev.surprise === "haba") {
        SFX.haba();
        if (window.RosconAndroid) window.RosconAndroid.vibrate(180);
        showSurpriseToast("haba", `¡${ev.actorName} sacó EL HABA en la ${ev.letter}! (-75 pts)`);
      } else if (ev.type === "correct") {
        SFX.correct();
        if (window.RosconAndroid) window.RosconAndroid.vibrate(35);
      } else if (ev.type === "wrong") {
        SFX.wrong();
        const card = document.getElementById("questionCard");
        if (card) {
          card.classList.remove("shake");
          void card.offsetWidth;
          card.classList.add("shake");
        }
        if (window.RosconAndroid) window.RosconAndroid.vibrate(70);
      } else if (ev.type === "pass" || ev.type === "timeout") {
        SFX.pass();
      } else if (ev.type === "hint") {
        SFX.hint();
      }
    }

    if (room.status === "finished") {
      finishGame(room.finishReason || "completed");
      return;
    }

    if (!wasPlaying || prevItemsCount !== game.items.length || prevVersion === -1) {
      game.active = true;
      game.listening = false;
      buildLetterButtons();
      showScreen("screenGame");
      startClock();
    } else {
      game.active = true;
    }

    if (!isMyActiveTurn() && game.listening) {
      game.listening = false;
      if (window.RosconAndroid) window.RosconAndroid.stopListening();
    }
    renderGame();
  }

  function startRoomSyncLoop() {
    const myLoop = ++online.syncLoopId;
    const step = async () => {
      while (myLoop === online.syncLoopId && online.roomCode) {
        try {
          online.abortCtrl = new AbortController();
          const data = await onlineApi(
            `/api/room/state?code=${encodeURIComponent(online.roomCode)}&playerId=${encodeURIComponent(online.playerId)}&v=${online.version}`,
            "GET",
            null,
            online.abortCtrl.signal
          );
          if (myLoop !== online.syncLoopId) return;
          if (data.changed && data.room) {
            applyOnlineRoomState(data.room);
          }
        } catch (err) {
          if (myLoop !== online.syncLoopId) return;
          await new Promise(r => setTimeout(r, 1200));
        }
      }
    };
    step();
  }

  async function sendOnlineAction(action, payload) {
    if (!online.roomCode) return;
    try {
      const data = await onlineApi("/api/room/action", "POST", {
        roomCode: online.roomCode,
        playerId: online.playerId,
        action,
        payload
      });
      if (data.room) {
        applyOnlineRoomState(data.room);
      }
    } catch (_) {}
  }

  function toggleWebSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      const inp = document.getElementById("webAnswerInput");
      if (inp) inp.focus();
      return;
    }
    if (game.listening && webRecognition) {
      try { webRecognition.stop(); } catch (_) {}
      game.listening = false;
      updateVoiceButton();
      return;
    }
    stopAllSpeech();
    const rec = new SR();
    rec.lang = "es-ES";
    rec.interimResults = false;
    rec.maxAlternatives = 5;
    webRecognition = rec;
    game.listening = true;
    updateVoiceButton();
    rec.onresult = (e) => {
      const alts = [];
      if (e.results && e.results[0]) {
        for (let i = 0; i < e.results[0].length; i++) {
          alts.push(e.results[0][i].transcript);
        }
      }
      handleVoiceCandidates(alts);
    };
    rec.onerror = () => {
      game.listening = false;
      updateVoiceButton();
    };
    rec.onend = () => {
      game.listening = false;
      updateVoiceButton();
    };
    try { rec.start(); } catch (_) {
      game.listening = false;
      updateVoiceButton();
    }
  }

  // ==================== ANDROID CALLBACKS ====================
  window.onAndroidVoiceState = (listening, msg) => {
    game.listening = !!listening;
    updateVoiceButton();
    if (!listening && msg && msg !== "Procesando voz...") {
      showSurpriseToast("haba", msg);
    }
  };

  window.onAndroidVoiceResults = (candidates) => {
    handleVoiceCandidates(candidates);
  };

  window.onAndroidBack = () => {
    if (game.active) {
      leaveOnlineRoom(game.isOnline);
      game.active = false;
      stopClock();
      stopAllSpeech();
      if (window.RosconAndroid) {
        window.RosconAndroid.stopListening();
      }
      showScreen("screenSetup");
    } else if (document.getElementById("screenOnlineLobby").classList.contains("active")) {
      cancelOnlineWait();
      showScreen("screenSetup");
    } else if (document.getElementById("screenSetup").classList.contains("active")) {
      cancelOnlineWait();
      showScreen("screenThemes");
    } else if (document.getElementById("screenThemes").classList.contains("active")) {
      showScreen("screenWelcome");
    }
  };

  // ==================== UI BINDINGS ====================
  const btnWelcomeEnter = document.getElementById("btnWelcomeEnter");
  if (btnWelcomeEnter) {
    btnWelcomeEnter.addEventListener("click", () => {
      SFX.hint();
      showScreen("screenThemes");
    });
  }
  const btnThemesBack = document.getElementById("btnThemesBack");
  if (btnThemesBack) {
    btnThemesBack.addEventListener("click", () => {
      showScreen("screenWelcome");
    });
  }
  const btnChangeTheme = document.getElementById("btnChangeTheme");
  if (btnChangeTheme) {
    btnChangeTheme.addEventListener("click", () => {
      cancelOnlineWait();
      showScreen("screenThemes");
    });
  }
  function updateSetupUi() {
    const twoWrap = document.getElementById("twoPlayerModeWrap");
    if (twoWrap) twoWrap.classList.toggle("hidden", selectedPlayers !== 2);
    const startBtn = document.getElementById("btnStart");
    if (startBtn) {
      startBtn.textContent = (selectedPlayers === 2 && selectedTwoPlayerMode === "online")
        ? "JUGAR ONLINE 1 VS 1"
        : "¡EMPEZAR PARTIDA!";
    }
  }

  document.querySelectorAll("#playerCountRow .choice-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedPlayers = Number(btn.dataset.players) === 2 ? 2 : 1;
      document.querySelectorAll("#playerCountRow .choice-btn").forEach(b => b.classList.toggle("active", b === btn));
      updateSetupUi();
    });
  });

  document.querySelectorAll("#twoPlayerModeRow .choice-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedTwoPlayerMode = btn.dataset.mode === "local" ? "local" : "online";
      document.querySelectorAll("#twoPlayerModeRow .choice-btn").forEach(b => b.classList.toggle("active", b === btn));
      updateSetupUi();
    });
  });

  document.querySelectorAll("#difficultyRow .choice-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const d = btn.dataset.diff;
      selectedDiff = (d === "dificil" || d === "subita") ? d : "facil";
      document.querySelectorAll("#difficultyRow .choice-btn").forEach(b => b.classList.toggle("active", b === btn));
    });
  });

  document.getElementById("btnOpenMedals")?.addEventListener("click", openMedalsModal);
  document.getElementById("btnCloseMedals")?.addEventListener("click", () => {
    document.getElementById("medalsModal").classList.add("hidden");
  });

  window.onAndroidRewardGranted = (kind) => {
    if (kind === "haba_shield") {
      finalizeHabaChoice(true);
      return;
    }
    if (game.active && game.players[game.currentPlayerIndex]) {
      game.players[game.currentPlayerIndex].hintsLeft += 2;
      SFX.fireworks();
      showSurpriseToast("king", "🎬 ¡+2 Pistas Extra desbloqueadas!");
      renderGame();
    }
  };

  window.onAndroidVipStatus = (vipActive) => {
    isVip = !!vipActive;
    try { localStorage.setItem(VIP_STORAGE_KEY, isVip ? "1" : "0"); } catch (_) {}
    if (isVip) {
      document.getElementById("vipModal")?.classList.add("hidden");
      showCeremonyOverlay("king", "👑 ¡CORONA REAL VIP!", "Ventajas permanentes activadas");
    }
    refreshWelcomeBadges();
  };

  window.onAndroidToast = (msg) => {
    if (msg) showSurpriseToast("king", msg);
  };

  document.getElementById("btnStart").addEventListener("click", startNewGame);
  document.getElementById("btnPlayAgain").addEventListener("click", () => {
    if (game.isOnline && online.roomCode) {
      sendOnlineAction("rematch", {});
    } else if (game.isDaily) {
      openLeaderboardModal();
    } else {
      startNewGame();
    }
  });

  document.getElementById("btnMenu").addEventListener("click", () => {
    leaveOnlineRoom(game.isOnline);
    game.active = false;
    stopClock();
    stopAllSpeech();
    if (window.RosconAndroid) {
      window.RosconAndroid.stopListening();
    }
    showScreen(game.isDaily ? "screenWelcome" : "screenSetup");
  });

  document.getElementById("btnBackMenu").addEventListener("click", () => {
    leaveOnlineRoom(false);
    showScreen(game.isDaily ? "screenWelcome" : "screenSetup");
  });

  document.getElementById("btnFinish").addEventListener("click", () => {
    if (game.isOnline) {
      sendOnlineAction("finish", {});
    } else {
      finishGame("abandoned");
    }
  });

  document.getElementById("btnHint").addEventListener("click", useHint);
  document.getElementById("btnPassQuick")?.addEventListener("click", passWord);
  document.getElementById("btnReplayAudio").addEventListener("click", () => speakCurrentClue(true));

  document.getElementById("btnAutoMic")?.addEventListener("click", () => {
    autoMicEnabled = !autoMicEnabled;
    try { localStorage.setItem("roscon_automic_v2", autoMicEnabled ? "1" : "0"); } catch (_) {}
    renderGame();
    if (autoMicEnabled) {
      showSurpriseToast("king", "🎙️ Manos Libres activado: escucha automática tras cada pista");
    }
  });

  document.getElementById("btnToggleType")?.addEventListener("click", () => {
    manualKeyboardOpen = !manualKeyboardOpen;
    renderGame();
    if (manualKeyboardOpen) {
      document.getElementById("webAnswerInput")?.focus();
    }
  });

  function toggleBgMusic() {
    bgMusicEnabled = !bgMusicEnabled;
    updateMusicEngine();
  }
  document.getElementById("btnMusicToggle")?.addEventListener("click", toggleBgMusic);
  document.getElementById("btnMusicInGame")?.addEventListener("click", toggleBgMusic);

  document.getElementById("btnDailyChallenge")?.addEventListener("click", () => {
    const meta = loadDailyMeta();
    if (meta.lastCompletedDate === getTodayDateStr()) {
      openLeaderboardModal();
    } else {
      startDailyChallenge();
    }
  });
  document.getElementById("btnThemesDaily")?.addEventListener("click", startDailyChallenge);
  document.getElementById("btnOpenLeaderboard")?.addEventListener("click", openLeaderboardModal);
  document.getElementById("btnCloseLeaderboard")?.addEventListener("click", () => {
    document.getElementById("leaderboardModal").classList.add("hidden");
  });
  document.getElementById("btnPlayDailyFromModal")?.addEventListener("click", () => {
    const nick = (document.getElementById("dailyPlayerNameInput")?.value || "").trim();
    if (nick) {
      try { localStorage.setItem(PLAYER_NAME_KEY, nick.slice(0, 16)); } catch (_) {}
    }
    startDailyChallenge();
  });

  document.getElementById("btnOpenVip")?.addEventListener("click", () => {
    if (isVip) {
      showSurpriseToast("king", "👑 Ya tienes la Corona Real VIP activa para siempre");
    } else {
      document.getElementById("vipModal").classList.remove("hidden");
    }
  });
  document.getElementById("btnCloseVip")?.addEventListener("click", () => {
    document.getElementById("vipModal").classList.add("hidden");
  });
  document.getElementById("btnBuyVipNow")?.addEventListener("click", () => {
    if (window.RosconAndroid && window.RosconAndroid.buyVipUpgrade) {
      window.RosconAndroid.buyVipUpgrade();
    } else {
      showSurpriseToast("king", "👑 La Corona Real VIP está disponible en la app oficial de Android (Google Play)");
    }
  });
  document.getElementById("btnRestoreVip")?.addEventListener("click", () => {
    if (window.RosconAndroid && window.RosconAndroid.restoreVipPurchases) {
      window.RosconAndroid.restoreVipPurchases();
    }
  });

  document.getElementById("btnWatchHabaShield")?.addEventListener("click", () => {
    requestRewardedLifeline("haba_shield");
  });
  document.getElementById("btnAcceptHaba")?.addEventListener("click", () => {
    finalizeHabaChoice(false);
  });

  document.getElementById("btnShareVictory")?.addEventListener("click", shareVictoryCard);

  document.getElementById("btnVoice").addEventListener("click", () => {
    if (!game.active || !isMyActiveTurn()) return;
    if (!game.listening) SFX.mic();
    if (window.RosconAndroid && window.RosconAndroid.toggleListening) {
      window.RosconAndroid.toggleListening();
    } else {
      toggleWebSpeechRecognition();
    }
  });

  // Formulario de respuesta por texto SOLO para navegador de PC
  const webForm = document.getElementById("webTextAnswerRow");
  if (webForm) {
    webForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!game.active || !isMyActiveTurn()) return;
      const inp = document.getElementById("webAnswerInput");
      const val = (inp ? inp.value : "").trim();
      if (!val) return;
      inp.value = "";
      handleVoiceCandidates([val]);
    });
  }

  // Online Lobby Bindings
  document.getElementById("btnLobbyBack").addEventListener("click", () => {
    leaveOnlineRoom(false);
    showScreen("screenSetup");
  });
  document.getElementById("btnFindMatch").addEventListener("click", startOnlineMatchmaking);
  document.getElementById("btnCreateRoom").addEventListener("click", createPrivateRoom);
  document.getElementById("btnJoinRoom").addEventListener("click", joinPrivateRoom);
  document.getElementById("btnCancelOnline").addEventListener("click", cancelOnlineWait);

  document.getElementById("btnToggleServer").addEventListener("click", () => {
    document.getElementById("serverConfigBox").classList.toggle("hidden");
  });
  document.getElementById("btnSaveServer").addEventListener("click", () => {
    const inp = document.getElementById("serverUrlInput");
    const url = (inp ? inp.value : "").trim().replace(/\/+$/, "");
    if (!url) return;
    online.serverUrl = url;
    try { localStorage.setItem(SERVER_URL_KEY, url); } catch (_) {}
    checkServerHealth();
  });

  updateSetupUi();
  refreshWelcomeBadges();
  updateMusicEngine();
  loadInitialQuestions();
  // Precalentamiento silencioso del servidor HTTPS en Render para que Online 1 vs 1 sea instantáneo
  setTimeout(() => {
    nativeHttpJson(`${online.serverUrl}/api/health`, "GET", null, 25000, null).catch(() => {});
  }, 800);
})();
