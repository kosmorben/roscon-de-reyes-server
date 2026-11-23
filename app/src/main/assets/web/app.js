(() => {
  "use strict";

  const ROSCO_LETTERS = [
    "A","B","C","D","E","F","G","H","I","J","L","M",
    "N","Ñ","O","P","Q","R","S","T","U","V","X","Z"
  ];

  const DIFF_CONFIG = {
    facil:   { soloTime: 0,   turnTime: 0,  hints: 4 },
    dificil: { soloTime: 180, turnTime: 25, hints: 2 }
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
      correct() {
        playNotes([
          { t: 0.00, d: 0.16, f1: 523.25, vol: 0.26 },
          { t: 0.07, d: 0.18, f1: 659.25, vol: 0.26 },
          { t: 0.14, d: 0.28, f1: 783.99, vol: 0.30 }
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

  let lastFrame = performance.now();
  function animateFX(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    const t = now / 1000;

    // Snow + top garland lights
    snowCtx.clearRect(0, 0, viewW, viewH);
    for (const f of flakes) {
      f.y += f.vy * dt;
      if (f.y > viewH + 10) {
        f.y = -10;
        f.x = Math.random() * viewW;
      }
      const x = f.x + Math.sin(t * 1.3 + f.phase) * f.sway;
      snowCtx.beginPath();
      snowCtx.arc(x, f.y, f.r, 0, Math.PI * 2);
      snowCtx.fillStyle = `rgba(245, 250, 255, ${f.alpha})`;
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
  buildFairyRing(document.getElementById("heroFairyRing"), 16, 48.5);
  buildFairyRing(document.getElementById("wheelFairyRing"), 24, 49.5);

  // ==================== THEMES + QUESTION BANK + PERSISTENT NO-REPEAT ====================
  let themesList = [
    { id: "futbol", title: "Fútbol", subtitle: "Liga, Mundiales y leyendas", icon: "⚽", accent: "#22e396", dataFile: "theme_futbol.json" },
    { id: "entretenimiento", title: "Entretenimiento", subtitle: "Cine, música y espectáculos", icon: "🎬", accent: "#ff6b78", dataFile: "theme_entretenimiento.json" },
    { id: "historia", title: "Historia y Geografía", subtitle: "Civilizaciones, países y viajes", icon: "🌍", accent: "#f5a623", dataFile: "theme_historia.json" },
    { id: "ciencia", title: "Ciencia y Naturaleza", subtitle: "Espacio, animales y descubrimientos", icon: "🔬", accent: "#48d1fc", dataFile: "theme_ciencia.json" },
    { id: "infantil", title: "Infantil", subtitle: "Divertido para niños y familia", icon: "🧸", accent: "#60a5fa", dataFile: "theme_infantil.json" }
  ];
  let selectedThemeId = "futbol";
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

  function loadPlayedHistory() {
    try {
      if (window.RosconAndroid && window.RosconAndroid.loadPlayedHistoryJson) {
        const diskSaved = JSON.parse(window.RosconAndroid.loadPlayedHistoryJson() || "[]");
        if (Array.isArray(diskSaved)) {
          for (const k of diskSaved) playedKeys.add(k);
        }
      }
      const saved = JSON.parse(localStorage.getItem(PLAYED_STORAGE_KEY) || "[]");
      if (Array.isArray(saved)) {
        for (const k of saved) playedKeys.add(k);
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
  const DEFAULT_LAN_SERVER = "http://192.168.1.142:8765";
  const FALLBACK_HTTPS_SERVER = "https://06cb1ca00d2eb1.app.lhr.life";

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
      return window.location.origin;
    }
    try {
      const saved = (localStorage.getItem(SERVER_URL_KEY) || "").trim();
      if (saved) return saved.replace(/\/+$/, "");
    } catch (_) {}
    return DEFAULT_LAN_SERVER;
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

  const game = {
    active: false,
    isOnline: false,
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
  }

  function buildRosco24() {
    const byLetter = {};
    for (const l of ROSCO_LETTERS) byLetter[l] = [];
    for (const q of allQuestions) {
      if (byLetter[q.Letter]) byLetter[q.Letter].push(q);
    }
    const chosen = [];
    let lowReserve = false;
    const targetDiff = selectedDiff === "dificil" ? "dificil" : "facil";

    for (const l of ROSCO_LETTERS) {
      const pool = byLetter[l];
      if (!pool || pool.length === 0) continue;
      let fresh = pool.filter(q => !playedKeys.has(questionKey(q)));
      if (fresh.length <= 3) lowReserve = true;
      if (fresh.length === 0) {
        // Solo si se agotaron TODAS las preguntas locales y offline de esa letra
        for (const q of pool) playedKeys.delete(questionKey(q));
        fresh = pool;
      }
      // Filtra por el nivel de dificultad elegido (facil / dificil) si hay preguntas sin jugar de ese nivel
      const freshDiff = fresh.filter(q => {
        const d = (q.Difficulty || "facil").toLowerCase();
        return targetDiff === "dificil" ? (d === "dificil" || d === "normal") : d === "facil";
      });
      const diffPool = freshDiff.length > 0 ? freshDiff : fresh;
      const freshVoiced = diffPool.filter(q => bundledVoiceKeys.has(sanitizeVoiceKey(q.Id)));
      const candidates = freshVoiced.length > 0 ? freshVoiced : diffPool;
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      playedKeys.add(questionKey(pick));
      chosen.push(pick);
    }
    savePlayedHistory();
    // Modo preguntas ilimitadas: si queda poca reserva sin jugar, descarga nuevas preguntas verificadas en segundo plano!
    if (lowReserve) {
      replenishThemeQuestions(selectedThemeId, targetDiff);
    }
    return chosen;
  }

  function startNewGame() {
    if (selectedPlayers === 2 && selectedTwoPlayerMode === "online") {
      openOnlineLobby();
      return;
    }
    leaveOnlineRoom(false);
    const rosco = buildRosco24();
    if (rosco.length === 0) return;

    const cfg = DIFF_CONFIG[selectedDiff] || DIFF_CONFIG.facil;
    game.isOnline = false;
    game.players = [];
    for (let i = 0; i < selectedPlayers; i++) {
      game.players.push({
        id: i,
        name: `Jugador ${i + 1}`,
        score: 0,
        correct: 0,
        wrong: 0,
        streak: 0,
        bestStreak: 0,
        hintsLeft: cfg.hints,
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
    tEl.classList.toggle("urgent", game.timeLimit > 0 && game.timeRemaining <= 10);
  }

  function stopAllSpeech() {
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
  }

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
    audio.play().catch(() => {
      if (window.speechSynthesis) {
        try {
          const u = new SpeechSynthesisUtterance(intro);
          u.lang = "es-ES";
          u.rate = 1.1;
          window.speechSynthesis.speak(u);
        } catch (_) {}
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
    stEl.textContent = player.streak >= 2 ? `Racha ×${player.streak}` : "";

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
    hintBtn.textContent = `Pista (${myPlayerObj.hintsLeft})`;
    hintBtn.disabled = !myTurn || myPlayerObj.hintsLeft <= 0;

    const webRow = document.getElementById("webTextAnswerRow");
    if (webRow) {
      const showWebInput = !window.RosconAndroid && myTurn;
      webRow.classList.toggle("hidden", !showWebInput);
    }

    updateVoiceButton();
    speakCurrentClue(false);
  }

  function updateVoiceButton() {
    const btn = document.getElementById("btnVoice");
    if (!btn) return;
    const myTurn = isMyActiveTurn();
    btn.disabled = !myTurn;
    btn.classList.toggle("listening", myTurn && game.listening);
    if (!myTurn && game.isOnline) {
      const activeP = game.players[game.currentPlayerIndex];
      btn.textContent = `ESPERANDO A ${activeP ? activeP.name.toUpperCase() : "RIVAL"}...`;
    } else {
      btn.textContent = game.listening
        ? "ESCUCHANDO... (Toca para parar)"
        : "HABLAR · Responde o di «Paso»";
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

  function useHint() {
    if (!game.active || !isMyActiveTurn()) return;
    if (game.isOnline) {
      sendOnlineAction("hint", {});
      return;
    }
    const item = game.items[game.currentIndex];
    const player = game.players[game.currentPlayerIndex];
    if (!item || !player || player.hintsLeft <= 0) return;

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
    if (!game.active || !isMyActiveTurn()) return;
    if (game.isOnline) {
      sendOnlineAction("pass", {});
      return;
    }
    const item = game.items[game.currentIndex];
    if (!item) return;
    item.status = "passed";
    game.players[game.currentPlayerIndex].streak = 0;
    SFX.pass();
    advanceTurn(true);
  }

  function evaluateAnswer(isCorrect) {
    if (!game.active || !isMyActiveTurn()) return;
    if (game.isOnline) {
      sendOnlineAction("answer", { correct: !!isCorrect });
      return;
    }
    const item = game.items[game.currentIndex];
    const player = game.players[game.currentPlayerIndex];
    if (!item || !player) return;

    let surprise = "none";

    if (isCorrect) {
      item.status = "correct";
      player.correct++;
      player.streak++;
      player.bestStreak = Math.max(player.bestStreak, player.streak);
      let pts = Math.max(40, 100 - Math.max(0, item.revealed.length - 1) * 20)
              + Math.min(125, (player.streak - 1) * 25);

      if (game.currentIndex === game.prizeIndex && !game.prizeFound) {
        game.prizeFound = true;
        player.foundKing = true;
        pts += 500;
        surprise = "king";
      } else if (game.currentIndex === game.habaIndex && !game.habaFound) {
        game.habaFound = true;
        player.foundHaba = true;
        pts = Math.max(0, pts - 75);
        surprise = "haba";
      }

      player.score += pts;

      if (surprise === "king") {
        SFX.fireworks();
        triggerFireworks();
        if (window.RosconAndroid) window.RosconAndroid.vibrate(140);
        showSurpriseToast("king", `★ ¡PREMIO! ENCONTRASTE AL REY EN LA ${item.q.Letter} (+500 PTS) ★`);
      } else if (surprise === "haba") {
        SFX.haba();
        if (window.RosconAndroid) window.RosconAndroid.vibrate(180);
        showSurpriseToast("haba", `¡TE TOCÓ EL HABA EN LA ${item.q.Letter}! Pagas el Roscón (-75 pts)`);
      } else {
        SFX.correct();
        if (window.RosconAndroid) window.RosconAndroid.vibrate(35);
      }

      if (game.players.length > 1 && game.timeLimit > 0) {
        game.timeRemaining = game.timeLimit;
      }
      advanceTurn(false);
    } else {
      item.status = "wrong";
      player.wrong++;
      player.streak = 0;

      const card = document.getElementById("questionCard");
      card.classList.remove("shake");
      void card.offsetWidth;
      card.classList.add("shake");

      if (game.currentIndex === game.habaIndex && !game.habaFound) {
        game.habaFound = true;
        player.foundHaba = true;
        player.score = Math.max(0, player.score - 75);
        SFX.haba();
        if (window.RosconAndroid) window.RosconAndroid.vibrate(180);
        showSurpriseToast("haba", `¡TE TOCÓ EL HABA EN LA ${item.q.Letter}! Pagas el Roscón (-75 pts)`);
      } else {
        SFX.wrong();
        if (window.RosconAndroid) window.RosconAndroid.vibrate(70);
      }
      advanceTurn(true);
    }
  }

  function handleVoiceCandidates(candidates) {
    game.listening = false;
    updateVoiceButton();
    if (!game.active || !Array.isArray(candidates) || candidates.length === 0) return;

    for (const raw of candidates) {
      const norm = normalizeSpanish(raw);
      if (norm === "paso" || norm === "siguiente" || norm === "pasa"
          || norm.includes("pasapalabra") || norm.includes("pasa palabra") || norm.includes("paso palabra")) {
        passWord();
        return;
      }
      if (norm === "pista" || norm === "ayuda" || norm === "dame una pista" || norm === "comodin") {
        useHint();
        return;
      }
    }

    const item = game.items[game.currentIndex];
    if (!item) return;

    const validTargets = [item.q.Answer, ...(item.q.AcceptedVariants || [])];
    const validNorms = new Set(validTargets.map(normalizeSpanish));
    const validLoose = new Set(validTargets.map(normalizeLooseEnye));

    for (const raw of candidates) {
      const cleaned = cleanSpokenSpanish(raw);
      if (!cleaned) continue;
      const compact = cleaned.replace(/\s+/g, "");
      const parts = cleaned.split(" ");
      const lastWord = parts[parts.length - 1] || "";

      if (validNorms.has(cleaned) || validNorms.has(compact) || (lastWord && validNorms.has(lastWord))) {
        evaluateAnswer(true);
        return;
      }
      if (validLoose.has(normalizeLooseEnye(cleaned))
          || validLoose.has(normalizeLooseEnye(compact))
          || (lastWord && validLoose.has(normalizeLooseEnye(lastWord)))) {
        evaluateAnswer(true);
        return;
      }
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
        : (reason === "timeout" ? "TIEMPO AGOTADO" : "FIN DE LA PARTIDA");

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
      playAgainBtn.textContent = game.isOnline ? "Revancha online" : "Jugar otra vez";
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
    const timeoutMs = path.includes("/room/state") ? 8000 : 5000;
    const res = await nativeHttpJson(url, method, body, timeoutMs, signal);
    if (!res.ok || res.data.ok === false) {
      throw new Error(res.data.error || `Error de servidor (${res.status})`);
    }
    return res.data;
  }

  async function probeServerUrl(baseUrl) {
    try {
      const res = await nativeHttpJson(`${baseUrl}/api/health`, "GET", null, 3000, null);
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
    const candidates = [];
    for (const u of [online.serverUrl, DEFAULT_LAN_SERVER, FALLBACK_HTTPS_SERVER]) {
      if (u && !candidates.includes(u)) candidates.push(u);
    }
    for (const cand of candidates) {
      const h = await probeServerUrl(cand);
      if (h) {
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
      const k = questionKey(it.q);
      if (!playedKeys.has(k)) {
        playedKeys.add(k);
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
    } else {
      cancelOnlineWait();
      showScreen("screenThemes");
    }
  };

  // ==================== UI BINDINGS ====================
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
      selectedDiff = btn.dataset.diff === "dificil" ? "dificil" : "facil";
      document.querySelectorAll("#difficultyRow .choice-btn").forEach(b => b.classList.toggle("active", b === btn));
    });
  });

  document.getElementById("btnStart").addEventListener("click", startNewGame);
  document.getElementById("btnPlayAgain").addEventListener("click", () => {
    if (game.isOnline && online.roomCode) {
      sendOnlineAction("rematch", {});
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
    showScreen("screenSetup");
  });

  document.getElementById("btnBackMenu").addEventListener("click", () => {
    leaveOnlineRoom(false);
    showScreen("screenSetup");
  });

  document.getElementById("btnFinish").addEventListener("click", () => {
    if (game.isOnline) {
      sendOnlineAction("finish", {});
    } else {
      finishGame("abandoned");
    }
  });

  document.getElementById("btnHint").addEventListener("click", useHint);
  document.getElementById("btnReplayAudio").addEventListener("click", () => speakCurrentClue(true));

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
  loadInitialQuestions();
})();
