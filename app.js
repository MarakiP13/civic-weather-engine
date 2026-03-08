// Civic Weather Station Engine
// High-tech Meteorological Interface
(() => {
  "use strict";

  // =========================
  // CONFIG
  // =========================
  const CONFIG = {
    data: {
      complaintsCsv: "data/311_requests.csv",
      constructionCsv: "data/construction_permits.csv",
      businessCsv: "data/business_licenses.csv",
    },

    ui: {
      statusBadge: "#statusBadge",
      climateScore: "#climateScore",
      explanation: "#explanation",
      stormAlertCard: "#stormAlertCard",
      stormAlertTitle: "#stormAlertTitle",
      stormAlertText: "#stormAlertText",
      timelineSlider: "#timelineSlider",
      timelineLabel: "#timelineLabel",
      currentConditionLabel: "#currentConditionLabel",
      playPauseBtn: "#playPauseBtn",
      gaugeFrictionValue: "#gaugeFrictionValue",
      gaugeResponseValue: "#gaugeResponseValue",
      gaugeGrowthValue: "#gaugeGrowthValue",
      barFriction: "#barFriction",
      barResponse: "#barResponse",
      barGrowth: "#barGrowth",
      forecastStrip: "#forecastStrip",
      radarChart: "#radarChart",
      demoModeBtn: "#demoModeBtn",
      stormBanner: "#stormBanner",
      mainWrapper: "#mainWrapper",
      stormMetricComplaints: "#stormMetricComplaints",
      stormMetricResponse: "#stormMetricResponse",
      stormIntensityLabel: "#stormIntensityLabel",
    },

    weather: {
      states: {
        clear: { label: "CLEAR CONDITIONS", icon: "☀", className: "clear" },
        stable: { label: "STABLE CONDITIONS", icon: "🌤", className: "stable" },
        pressure: { label: "PRESSURE BUILDING", icon: "🌥", className: "pressure" },
        storm: { label: "STORM FRONT", icon: "⛈", className: "storm" },
        peak: { label: "STORM PEAK", icon: "⚡", className: "peak" },
        recovery: { label: "RECOVERY", icon: "🌦", className: "recovery" },
        rebalance: { label: "REBALANCING", icon: "🌦", className: "rebalance" },
        strengthening: { label: "STRENGTHENING", icon: "🌤", className: "strengthening" },
      }
    },

    replay: { autoplayMs: 1400 },

    scoring: {
      climateWeights: { responsiveness: 0.4, growth: 0.3, frictionInverse: 0.3 },
      changeCap: 0.5
    },

    fields: {
      complaints: {
        createDate: ["Create Date", "created_date", "CREATE_DATE", "CreateDate", "date_created"],
        closeDate: ["Close Date", "closed_date", "CLOSE_DATE", "CloseDate", "date_closed"],
        requestType: ["Request Type", "request_type", "REQUEST_TYPE", "Service Request Type", "service_request_type"],
        department: ["Department", "department", "DEPARTMENT"],
        district: ["District", "district", "DISTRICT"],
        latitude: ["Latitude", "latitude", "LATITUDE", "lat", "Y"],
        longitude: ["Longitude", "longitude", "LONGITUDE", "lon", "X"],
        status: ["Status", "status", "STATUS"],
      },
      permits: {
        issueDate: ["Issue Date", "issue_date", "ISSUE_DATE", "Permit Date", "permit_date", "Date Issued", "License Issue Date", "IssuedDate", "pvEFFDATE", "contCREATED"],
        permitType: ["Permit Type", "permit_type", "PERMIT_TYPE", "Type", "License Type", "PermitDescription", "scNAME", "pvrtDESC"],
        district: ["District", "district", "DISTRICT", "ZIP", "Zip", "zip_code", "DistrictCouncil", "addrZIP_PHYSICAL"],
      }
    }
  };

  const STATE = {
    complaintsRaw: [],
    complaintsFields: {},
    frames: [],
    currentFrameIndex: 0,
    replayTimer: null,
    demoRunning: false,
  };

  const MAX_ROWS = 50000;

  // =========================
  // INIT
  // =========================
  async function init() {
    try {
      const [complaintsRaw, constructionRaw, businessRaw] = await Promise.all([
        loadCsv(CONFIG.data.complaintsCsv),
        loadCsvOptional(CONFIG.data.constructionCsv),
        loadCsvOptional(CONFIG.data.businessCsv),
      ]);

      STATE.complaintsRaw = complaintsRaw;
      STATE.complaintsFields = detectFields(complaintsRaw, CONFIG.fields.complaints);

      const constructionFields = constructionRaw?.length ? detectFields(constructionRaw, CONFIG.fields.permits) : {};
      const businessFields = businessRaw?.length ? detectFields(businessRaw, CONFIG.fields.permits) : {};

      const complaints = normalizeComplaints(complaintsRaw, STATE.complaintsFields);
      const permits = [
        ...(constructionRaw?.length ? normalizePermits(constructionRaw, constructionFields) : []),
        ...(businessRaw?.length ? normalizePermits(businessRaw, businessFields) : [])
      ];

      STATE.frames = buildReplayFrames(complaints, permits);

      if (!STATE.frames.length) {
        throw new Error("No atmospheric frames could be generated.");
      }

      bindUiEvents();
      initTimeline();
      renderFrame(STATE.frames.length - 1);

      window.CivicWeatherStation = {
        state: STATE,
        renderFrame,
        play: playReplay,
        pause: pauseReplay
      };

    } catch (err) {
      console.error("Station Init Failure:", err);
      setText(CONFIG.ui.explanation, `SENSOR ERROR: ${err.message}`);
      setText(CONFIG.ui.climateScore, "\u2014");
      setText(CONFIG.ui.statusBadge, "\u26A0 OFFLINE");
      const fallbackBtn = getEl(CONFIG.ui.demoModeBtn);
      if (fallbackBtn) {
        fallbackBtn.style.display = "";
        fallbackBtn.textContent = "Run Demo Mode Instead";
        fallbackBtn.addEventListener("click", () => { runDemo(); }, { once: true });
      }
    }
  }

  // =========================
  // DATA HELPERS
  // =========================
  function sanitizeRow(row) {
    const clean = {};
    for (const [k, v] of Object.entries(row)) {
      clean[k] = typeof v === 'string' ? v.replace(/^[=+\-@\t\r]/, "'$&") : v;
    }
    return clean;
  }

  function capRows(data, path) {
    if (data.length > MAX_ROWS) {
      console.warn(`Dataset ${path} truncated from ${data.length} to ${MAX_ROWS} rows`);
      return data.slice(0, MAX_ROWS);
    }
    return data;
  }

  async function loadCsv(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`CSV not found: ${path}`);
    const text = await res.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const data = (parsed.data || []).map(sanitizeRow);
    return capRows(data, path);
  }

  async function loadCsvOptional(path) {
    try {
      const res = await fetch(path);
      if (!res.ok) return [];
      const text = await res.text();
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      const data = (parsed.data || []).map(sanitizeRow);
      return capRows(data, path);
    } catch { return []; }
  }

  function detectFields(rows, candidates) {
    const keys = Object.keys(rows[0] || {});
    const map = {};
    for (const [canonical, options] of Object.entries(candidates)) {
      map[canonical] = options.find(opt => keys.includes(opt)) || null;
    }
    return map;
  }

  function normalizeComplaints(rows, fields) {
    if (!fields.createDate) {
      console.warn("Could not detect 'createDate' field. Skipping complaints normalization.");
      return [];
    }
    return rows.map(row => {
      const lat = parseFloat(row[fields.latitude]);
      const lon = parseFloat(row[fields.longitude]);
      return {
        created: parseDate(row[fields.createDate]),
        closed: parseDate(row[fields.closeDate]),
        requestType: (row[fields.requestType] || "").toString(),
        lat: Number.isFinite(lat) ? lat : null,
        lon: Number.isFinite(lon) ? lon : null,
      };
    }).filter(r => r.created);
  }

  function normalizePermits(rows, fields) {
    return rows.map(row => ({
      issued: parseDate(row[fields.issueDate]),
      permitType: (row[fields.permitType] || "").toString(),
    })).filter(r => r.issued);
  }

  function parseDate(val) {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d) ? null : d;
  }

  // =========================
  // LOGIC
  // =========================
  function buildReplayFrames(complaints, permits) {
    const allDates = [...complaints.map(r => r.created), ...permits.map(r => r.issued)];
    const months = Array.from(new Set(allDates.map(d => `${d.getFullYear()}-${d.getMonth() + 1}-01`)))
      .map(s => new Date(s))
      .sort((a, b) => a - b);

    return months.slice(1).map((month, i) => {
      const prevMonth = months[i];
      const curComp = complaints.filter(r => sameMonth(r.created, month));
      const preComp = complaints.filter(r => sameMonth(r.created, prevMonth));
      const curPerm = permits.filter(r => sameMonth(r.issued, month));
      const prePerm = permits.filter(r => sameMonth(r.issued, prevMonth));

      const compChange = percentChange(curComp.length, preComp.length);
      const resCur = avgRes(curComp);
      const resPre = avgRes(preComp);
      const resChange = percentChange(resCur, resPre);
      const growthChange = percentChange(curPerm.length, prePerm.length);

      const frictionScore = scoreChange(compChange, false);
      const responseScore = scoreChange(resChange, false);
      const growthScore = scoreChange(growthChange, true);

      // Climate Score: Base 60, adjusted by growth, friction, and response
      const climateScore = Math.round(clamp(60 + (growthScore - 50) * 0.4 - (100 - responseScore) * 0.3 - (100 - frictionScore) * 0.3, 0, 100));

      const weatherKey = classifyClimate(compChange, climateScore);
      const storm = detectStorm(compChange, resChange, growthChange);

      return {
        label: month.toLocaleDateString(undefined, { year: 'numeric', month: 'short' }),
        climateScore,
        frictionScore,
        responsivenessScore: responseScore,
        growthScore,
        weather: CONFIG.weather.states[weatherKey],
        storm,
        metrics: {
          compChange: (compChange * 100).toFixed(0),
          resChange: (resChange * 100).toFixed(0)
        },
        explanation: buildNarrative(weatherKey, compChange, resChange, growthChange),
        cells: buildCells(curComp)
      };
    });
  }

  function sameMonth(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }
  function percentChange(c, p) { return p === 0 ? 0 : (c - p) / p; }
  function avgRes(rows) {
    const valid = rows.filter(r => r.closed).map(r => (r.closed - r.created) / 3600000);
    return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
  }
  function scoreChange(change, positiveGood) {
    const capped = clamp(change, -0.5, 0.5);
    const score = ((capped + 0.5) / 1.0) * 100;
    return positiveGood ? score : 100 - score;
  }

  function classifyClimate(compChange, score) {
    if (compChange > 0.25) return "peak";
    if (compChange > 0.10) return "storm";
    if (compChange > 0.05) return "pressure";
    if (compChange < -0.15) return "recovery";
    if (compChange < -0.05) return "clear";
    if (score > 70) return "stable";
    return "rebalance";
  }

  function detectStorm(compC, resC, growC) {
    if (compC > 0.25) return { title: "⚡ STORM PEAK DETECTED", text: "Maximum complaint density reached. Infrastructure efficiency at critical lows." };
    if (compC > 0.15) return { title: "⛈ STORM FRONT ACTIVE", text: "Heavy complaint pressure detected. Response winds are sluggish." };
    if (growC > 0.15) return { title: "🌤 URBAN GROWTH SURGE", text: "Rapid development activity detected. Monitoring infrastructure." };
    if (compC > 0.10) return { title: "🌥 PRESSURE BUILDING", text: "Minor atmospheric disturbance. Complaint volume is rising." };
    if (compC < -0.05) return { title: "☀ CLEARING CONDITIONS", text: "System pressure is easing. Complaint volume is low." };
    return { title: "🌤 STABLE CONDITIONS", text: "Civic atmosphere is stable. No major disturbances." };
  }

  function buildNarrative(key, compC, resC, growC) {
    if (key === "peak") return "Civic storm peak. System friction is at maximum intensity across all monitored sectors.";
    if (key === "recovery") return "Post-storm recovery. System pressure is dropping rapidly as service backlog clears.";
    if (key === "clear") return "Clear civic conditions. Complaint pressure is low and response systems are operating efficiently.";
    if (key === "storm") return "Critical civic storm front. Heavy complaint volume is stressing city systems.";
    return `Civic pressure is ${compC > 0 ? "building" : "stablizing"}. System response is ${resC > 0 ? "slowing" : "steady"}.`;
  }

  function buildCells(rows) {
    const buckets = new Map();
    rows.forEach(r => {
      if (r.lat === null) return;
      const key = `${Math.round(r.lat * 100) / 100}|${Math.round(r.lon * 100) / 100}`;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    });
    const max = Math.max(...buckets.values(), 1);
    return Array.from(buckets.entries()).map(([key, count]) => {
      const [lat, lon] = key.split("|").map(parseFloat);
      return { lat, lon, intensity: clamp(count / max, 0.2, 1) };
    });
  }

  // =========================
  // RENDER
  // =========================
  const ESCALATION_CLASSES = ["escalation-pressure", "escalation-storm", "escalation-peak"];

  function updateEscalation(weatherClassName) {
    const overlay = getEl("#stormOverlay");
    if (!overlay) return;
    overlay.classList.remove(...ESCALATION_CLASSES);
    if (weatherClassName === "pressure" || weatherClassName === "rebalance") {
      overlay.classList.add("escalation-pressure");
    } else if (weatherClassName === "storm") {
      overlay.classList.add("escalation-storm");
    } else if (weatherClassName === "peak") {
      overlay.classList.add("escalation-peak");
    }
  }
  function renderFrame(index) {
    if (!STATE.frames.length) return;
    STATE.currentFrameIndex = clamp(index, 0, STATE.frames.length - 1);
    const frame = STATE.frames[STATE.currentFrameIndex];

    setText(CONFIG.ui.statusBadge, `${frame.weather.icon} ${frame.weather.label}`);
    setText(CONFIG.ui.climateScore, frame.climateScore);
    setText(CONFIG.ui.explanation, frame.explanation);

    setText(CONFIG.ui.gaugeFrictionValue, Math.round(frame.frictionScore));
    setText(CONFIG.ui.gaugeResponseValue, Math.round(frame.responsivenessScore));
    setText(CONFIG.ui.gaugeGrowthValue, Math.round(frame.growthScore));

    const bF = getEl(CONFIG.ui.barFriction);
    const bR = getEl(CONFIG.ui.barResponse);
    const bG = getEl(CONFIG.ui.barGrowth);
    if (bF) bF.style.width = `${frame.frictionScore}%`;
    if (bR) bR.style.width = `${frame.responsivenessScore}%`;
    if (bG) bG.style.width = `${frame.growthScore}%`;

    setText(CONFIG.ui.timelineLabel, frame.label);
    setValue(CONFIG.ui.timelineSlider, STATE.currentFrameIndex);

    const card = getEl(CONFIG.ui.stormAlertCard);
    if (card) {
      getEl(CONFIG.ui.stormAlertTitle).textContent = frame.storm.title;
      getEl(CONFIG.ui.stormAlertText).textContent = frame.storm.text;
      const shouldHide = frame.weather.className === "stable" && !frame.storm.title.includes("URBAN");
      if (shouldHide) card.classList.add("hidden-card");
      else card.classList.remove("hidden-card");
    }

    renderForecastStrip();
    renderRadar(frame);

    // Toggle Storm Event Mode Takeover
    const isStorm = ["storm", "peak"].includes(frame.weather.className);
    document.documentElement.setAttribute("data-storm-active", isStorm);

    const banner = getEl(CONFIG.ui.stormBanner);
    const wrapper = getEl(CONFIG.ui.mainWrapper);

    if (isStorm) {
      if (banner) {
        banner.classList.remove("hidden");
        banner.textContent = `CIVIC STORM ALERT: ${frame.storm.title}`;
      }
      if (wrapper) wrapper.classList.add("scale-[1.02]", "brightness-110");
      setText(CONFIG.ui.stormIntensityLabel, frame.weather.className === "peak" ? "CRITICAL" : "SEVERE");
      setText(CONFIG.ui.stormMetricComplaints, `${frame.metrics.compChange > 0 ? "+" : ""}${frame.metrics.compChange}% Pressure`);
      setText(CONFIG.ui.stormMetricResponse, `${frame.metrics.resChange > 0 ? "+" : ""}${frame.metrics.resChange}% Delay`);
    } else {
      if (banner) banner.classList.add("hidden");
      if (wrapper) wrapper.classList.remove("scale-[1.02]", "brightness-110");
    }

    document.documentElement.setAttribute("data-civic-weather", frame.weather.className);
    updateEscalation(frame.weather.className);
  }

  function renderRadar(frame) {
    const canvas = getEl(CONFIG.ui.radarChart);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const r = Math.min(cx, cy) * 0.8;
    const isStorm = document.documentElement.getAttribute("data-storm-active") === "true";

    ctx.clearRect(0, 0, rect.width, rect.height);

    // Filter for storm rings
    const highIntensityCells = frame.cells.filter(c => c.intensity > 0.6);

    frame.cells.forEach(cell => {
      const angle = (cell.lon * 10) % (Math.PI * 2);
      const dist = (Math.abs(cell.lat) % 0.1) * 10 * r;

      const x = cx + Math.cos(angle) * dist;
      const y = cy + Math.sin(angle) * dist;
      const size = 2 + cell.intensity * 8;

      // Escalation Color Shift: green → amber → red
      const weatherState = document.documentElement.getAttribute("data-civic-weather");
      const isPressure = weatherState === "pressure" || weatherState === "rebalance";
      const baseColor = isStorm ? "255, 51, 102" : isPressure ? "255, 170, 0" : "0, 255, 64";
      const secondaryColor = isStorm ? "255, 136, 0" : isPressure ? "255, 204, 0" : "255, 255, 255";

      const g = ctx.createRadialGradient(x, y, 0, x, y, size * 3);
      g.addColorStop(0, `rgba(${baseColor}, ${cell.intensity * 0.8})`);
      g.addColorStop(1, `rgba(${baseColor}, 0)`);

      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, size * 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = isStorm ? `rgba(${secondaryColor}, 0.9)` : "#fff";
      ctx.beginPath();
      ctx.arc(x, y, isStorm ? 2 : 1, 0, Math.PI * 2);
      ctx.fill();
    });

    // Special Expanding Ring Effect for Storms
    if (isStorm) {
      highIntensityCells.forEach((cell, i) => {
        const angle = (cell.lon * 10) % (Math.PI * 2);
        const dist = (Math.abs(cell.lat) % 0.1) * 10 * r;
        const x = cx + Math.cos(angle) * dist;
        const y = cy + Math.sin(angle) * dist;

        // We draw one subtle ring that pulses via CSS or we can do it here if we had a tick
        // Since we render per frame, we'll draw 2 rings of different sizes
        ctx.strokeStyle = `rgba(255, 51, 102, ${0.3 * cell.intensity})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 20 * cell.intensity, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, y, 40 * cell.intensity, 0, Math.PI * 2);
        ctx.stroke();
      });
    }
  }

  function renderForecastStrip() {
    const strip = getEl(CONFIG.ui.forecastStrip);
    if (!strip) return;
    strip.innerHTML = "";
    STATE.frames.slice(STATE.currentFrameIndex, STATE.currentFrameIndex + 8).forEach(f => {
      const el = document.createElement("div");
      el.className = "forecast-item";
      el.innerHTML = `<div class="forecast-time">${f.label}</div><div class="forecast-icon">${f.weather.icon}</div><div class="forecast-state">${f.weather.label.split(" ")[0]}</div>`;
      strip.appendChild(el);
    });
  }

  // =========================
  // EVENTS
  // =========================
  function bindUiEvents() {
    getEl(CONFIG.ui.timelineSlider)?.addEventListener("input", e => {
      pauseReplay();
      renderFrame(Number(e.target.value));
    });
    getEl(CONFIG.ui.playPauseBtn)?.addEventListener("click", () => {
      STATE.replayTimer ? pauseReplay() : playReplay();
    });
    getEl(CONFIG.ui.demoModeBtn)?.addEventListener("click", () => {
      runDemo();
    });
  }

  function initTimeline() {
    const s = getEl(CONFIG.ui.timelineSlider);
    if (s) { s.min = 0; s.max = STATE.frames.length - 1; s.value = STATE.frames.length - 1; }
  }

  function playReplay() {
    if (STATE.replayTimer) return;
    setText(CONFIG.ui.playPauseBtn, "Pause");
    STATE.replayTimer = setInterval(() => {
      if (STATE.currentFrameIndex >= STATE.frames.length - 1) renderFrame(0);
      else renderFrame(STATE.currentFrameIndex + 1);
    }, CONFIG.replay.autoplayMs);
  }

  function pauseReplay() {
    clearInterval(STATE.replayTimer);
    STATE.replayTimer = null;
    setText(CONFIG.ui.playPauseBtn, "Play");
  }

  // =========================
  // DEMO MODE
  // =========================
  // =========================
  // DEMO MODE (60s Extended Version)
  // =========================
  function runDemo() {
    if (STATE.demoRunning) return;
    pauseReplay();
    STATE.demoRunning = true;

    const btn = getEl(CONFIG.ui.demoModeBtn);
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Demo in Progress...";
    }

    // Generate ~40 frames for 60 seconds (1.5s interval)
    const demoFrames = [];

    // 1. Calibration (0-7.5s, 5 frames)
    for (let i = 0; i < 5; i++) {
      demoFrames.push({
        label: `CALIBRATING [${i + 1}/5]`,
        climateScore: 90 + Math.random() * 5,
        frictionScore: 10 + Math.random() * 5,
        responsivenessScore: 95,
        growthScore: 50,
        weather: CONFIG.weather.states.clear,
        storm: { title: "SYSTEM CALIBRATION", text: "Establishing baseline civic metrics. Atmospheric sensors active." },
        explanation: "Baseline established. All city sectors reporting stable conditions.",
        cells: [{ lat: 42.36, lon: -71.06, intensity: 0.15 }]
      });
    }

    // 2. Atmospheric Build (7.5-22.5s, 10 frames)
    for (let i = 0; i < 10; i++) {
      const p = i / 10;
      demoFrames.push({
        label: `BUILD PHASE [${i + 1}/10]`,
        climateScore: 85 - (p * 20),
        frictionScore: 20 + (p * 40),
        responsivenessScore: 80 - (p * 20),
        growthScore: 60 + (p * 10),
        weather: CONFIG.weather.states.pressure,
        storm: { title: "PRESSURE FRONT BUILDING", text: "Inbound service volume detected. Systems approaching threshold." },
        explanation: "Civic pressure rising in central districts. Response winds shifting.",
        cells: [
          { lat: 42.36 + (Math.sin(p) * 0.01), lon: -71.06, intensity: 0.3 + (p * 0.3) },
          { lat: 42.37, lon: -71.07, intensity: 0.2 + (p * 0.2) }
        ]
      });
    }

    // 3. Storm Peak (22.5-45s, 15 frames)
    for (let i = 0; i < 15; i++) {
      const p = i / 15;
      const isPeak = i > 5 && i < 12;
      demoFrames.push({
        label: isPeak ? "CRITICAL PEAK" : "STORM FRONT",
        climateScore: isPeak ? 25 : 40,
        frictionScore: isPeak ? 95 : 75,
        responsivenessScore: isPeak ? 30 : 50,
        growthScore: 75 + (Math.random() * 5),
        weather: isPeak ? CONFIG.weather.states.peak : CONFIG.weather.states.storm,
        storm: {
          title: isPeak ? "⚡ STORM PEAK DETECTED" : "⛈ STORM ACTIVE",
          text: isPeak ? "Critical saturation. Emergency response protocols enabled." : "Heavy friction. Backlogs increasing across all sectors."
        },
        explanation: isPeak ? "MAXIMUM INTENSITY. City systems at capacity." : "Civic storm passing. High friction recorded.",
        cells: [
          { lat: 42.36, lon: -71.06, intensity: isPeak ? 1.0 : 0.8 },
          { lat: 42.37, lon: -71.07, intensity: isPeak ? 0.9 : 0.7 },
          { lat: 42.35, lon: -71.05, intensity: isPeak ? 0.95 : 0.6 },
          { lat: 42.38 + (p * 0.01), lon: -71.08, intensity: isPeak ? 0.8 : 0.5 }
        ]
      });
    }

    // 4. Recovery (45-55s, 7 frames)
    for (let i = 0; i < 7; i++) {
      const p = i / 7;
      demoFrames.push({
        label: `RECOVERY [${i + 1}/7]`,
        climateScore: 40 + (p * 30),
        frictionScore: 80 - (p * 40),
        responsivenessScore: 40 + (p * 30),
        growthScore: 70,
        weather: CONFIG.weather.states.recovery,
        storm: { title: "RECOVERY PHASE", text: "Disturbance passing. Clearing service backlogs." },
        explanation: "Recovery underway. High responsiveness winds returning.",
        cells: [
          { lat: 42.36, lon: -71.06, intensity: 0.4 - (p * 0.2) },
          { lat: 42.37, lon: -71.07, intensity: 0.3 - (p * 0.1) }
        ]
      });
    }

    // 5. Summary (55-60s, 3 frames)
    for (let i = 0; i < 3; i++) {
      demoFrames.push({
        label: "DEMO COMPLETE",
        climateScore: 85,
        frictionScore: 20,
        responsivenessScore: 85,
        growthScore: 65,
        weather: CONFIG.weather.states.clear,
        storm: { title: "DEMONSTRATION COMPLETE", text: "Systems restored to baseline. 60s Atmospheric data archived." },
        explanation: "Simulation successful. Normal telemetry resume in live mode.",
        cells: [{ lat: 42.36, lon: -71.06, intensity: 0.1 }]
      });
    }

    let i = 0;
    const interval = setInterval(() => {
      const frame = demoFrames[i];
      renderDemoFrame(frame);
      i++;
      if (i >= demoFrames.length) {
        clearInterval(interval);
        STATE.demoRunning = false;
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Simulate Civic Storm";
        }
      }
    }, 1500);
  }

  function renderDemoFrame(frame) {
    setText(CONFIG.ui.statusBadge, `${frame.weather.icon} ${frame.weather.label}`);
    setText(CONFIG.ui.climateScore, frame.climateScore);
    setText(CONFIG.ui.explanation, frame.explanation);

    setText(CONFIG.ui.gaugeFrictionValue, Math.round(frame.frictionScore));
    setText(CONFIG.ui.gaugeResponseValue, Math.round(frame.responsivenessScore));
    setText(CONFIG.ui.gaugeGrowthValue, Math.round(frame.growthScore));

    const bF = getEl(CONFIG.ui.barFriction);
    const bR = getEl(CONFIG.ui.barResponse);
    const bG = getEl(CONFIG.ui.barGrowth);
    if (bF) bF.style.width = `${frame.frictionScore}%`;
    if (bR) bR.style.width = `${frame.responsivenessScore}%`;
    if (bG) bG.style.width = `${frame.growthScore}%`;

    setText(CONFIG.ui.timelineLabel, frame.label);

    const card = getEl(CONFIG.ui.stormAlertCard);
    if (card) {
      getEl(CONFIG.ui.stormAlertTitle).textContent = frame.storm.title;
      getEl(CONFIG.ui.stormAlertText).textContent = frame.storm.text;
      card.classList.remove("hidden-card");
    }

    renderRadar(frame);

    // Toggle Takeover for Demo
    const isStorm = ["storm", "peak"].includes(frame.weather.className);
    const isCalibration = frame.label.includes("CALIBRATING");

    document.documentElement.setAttribute("data-storm-active", isStorm);

    const banner = getEl(CONFIG.ui.stormBanner);
    const wrapper = getEl(CONFIG.ui.mainWrapper);

    if (isStorm) {
      if (banner) {
        banner.classList.remove("hidden", "bg-brand");
        banner.classList.add("bg-danger");
        banner.textContent = `CIVIC STORM ALERT: ${frame.storm.title}`;
      }
      if (wrapper) wrapper.classList.add("scale-[1.02]", "brightness-110");
      setText(CONFIG.ui.stormIntensityLabel, frame.weather.className === "peak" ? "CRITICAL" : "SEVERE");
      setText(CONFIG.ui.stormMetricComplaints, `+${Math.round(frame.frictionScore / 3)}% Pressure`);
      setText(CONFIG.ui.stormMetricResponse, `+${Math.round((100 - frame.responsivenessScore) / 2)}% Delay`);
    } else if (isCalibration) {
      if (banner) {
        banner.classList.remove("hidden", "bg-danger");
        banner.classList.add("bg-brand");
        banner.textContent = "SYSTEM STATUS: BASELINE CALIBRATION ACTIVE";
      }
      if (wrapper) wrapper.classList.remove("scale-[1.02]", "brightness-110");
    } else {
      if (banner) banner.classList.add("hidden");
      if (wrapper) wrapper.classList.remove("scale-[1.02]", "brightness-110");
    }

    document.documentElement.setAttribute("data-civic-weather", frame.weather.className);
    updateEscalation(frame.weather.className);
  }

  function getEl(s) { return document.querySelector(s); }
  function setText(s, v) { const el = getEl(s); if (el) el.textContent = v; }
  function setValue(s, v) { const el = getEl(s); if (el) el.value = v; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // =========================
  // BRIGHT DATA INTEGRATION
  // =========================
  let _bdClient = null;
  let _bdActiveSnapshotId = null;
  let _bdCrawlOutputData = null;

  function getBdClient() {
    if (!_bdClient) _bdClient = BrightDataClient.fromStorage();
    return _bdClient;
  }

  // --- Settings Modal ---
  function openSettingsModal() {
    const modal = getEl("#settingsModal");
    if (!modal) return;

    // Load saved values into form
    const client = getBdClient();
    const apiKeyInput = getEl("#bdApiKey");
    const datasetInput = getEl("#bdDatasetId");
    const outputInput = getEl("#bdOutputFields");
    const formatSelect = getEl("#bdDownloadFormat");
    const errorsCheck = getEl("#bdIncludeErrors");

    if (client.apiKey && apiKeyInput) apiKeyInput.value = client.apiKey;
    if (client.datasetId && datasetInput) datasetInput.value = client.datasetId;
    if (client.customOutputFields && outputInput) outputInput.value = client.customOutputFields;
    if (formatSelect) formatSelect.value = client.downloadFormat || "json";
    if (errorsCheck) errorsCheck.checked = client.includeErrors !== false;

    modal.classList.remove("hidden");
    hideTestResult();
  }

  function closeSettingsModal() {
    const modal = getEl("#settingsModal");
    if (modal) modal.classList.add("hidden");
  }

  function saveBrightDataSettings() {
    const client = getBdClient();
    client.apiKey = (getEl("#bdApiKey")?.value || "").trim();
    client.datasetId = (getEl("#bdDatasetId")?.value || "").trim();
    client.customOutputFields = (getEl("#bdOutputFields")?.value || "markdown").trim();
    client.downloadFormat = getEl("#bdDownloadFormat")?.value || "json";
    client.includeErrors = getEl("#bdIncludeErrors")?.checked !== false;
    client.saveToStorage();

    // Flash save confirmation
    showTestResult("Settings saved.", "success");
  }

  function clearBrightDataSettings() {
    BrightDataClient.clearStorage();
    _bdClient = null;

    const apiKeyInput = getEl("#bdApiKey");
    if (apiKeyInput) apiKeyInput.value = "";

    showTestResult("API key and settings cleared.", "info");
  }

  async function testBrightDataConnection() {
    const client = getBdClient();
    // Update from form values before testing
    client.apiKey = (getEl("#bdApiKey")?.value || "").trim();
    client.datasetId = (getEl("#bdDatasetId")?.value || "").trim();

    showTestResult("Testing connection...", "info");
    try {
      const result = await client.testConnection();
      showTestResult(`✅ Connection successful! Found ${Array.isArray(result) ? result.length : 0} snapshot(s).`, "success");
    } catch (err) {
      const msg = err.message || "Unknown error";
      const isCors = msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("cors");
      if (isCors) {
        showTestResult("❌ CORS error: Browser blocked the request. Consider using a server proxy for production.", "error");
      } else {
        showTestResult(`❌ ${msg}`, "error");
      }
    }
    updateDiagnostics();
  }

  function showTestResult(message, type) {
    const el = getEl("#bdTestResult");
    if (!el) return;
    el.classList.remove("hidden");
    el.textContent = message;
    el.style.background = type === "success" ? "rgba(0,255,64,0.08)" :
      type === "error" ? "rgba(255,51,102,0.08)" :
        "rgba(255,255,255,0.05)";
    el.style.color = type === "success" ? "#00ff40" :
      type === "error" ? "#ff3366" :
        "rgba(255,255,255,0.5)";
  }

  function hideTestResult() {
    const el = getEl("#bdTestResult");
    if (el) el.classList.add("hidden");
  }

  function toggleApiKeyVisibility() {
    const input = getEl("#bdApiKey");
    const btn = getEl("#toggleApiKeyBtn");
    if (!input || !btn) return;
    if (input.type === "password") {
      input.type = "text";
      btn.textContent = "Hide";
    } else {
      input.type = "password";
      btn.textContent = "Show";
    }
  }

  // --- Crawl Runner ---
  async function runCrawl() {
    const urlInput = getEl("#crawlUrlInput");
    const urls = (urlInput?.value || "").split("\n").map(u => u.trim()).filter(Boolean);

    if (!urls.length) {
      setCrawlStatus("Enter at least one URL", "error");
      return;
    }

    const client = getBdClient();
    // Update client config from storage
    _bdClient = BrightDataClient.fromStorage();

    if (!_bdClient.apiKey) {
      setCrawlStatus("Configure API key in Settings first", "error");
      return;
    }

    // UI updates
    getEl("#runCrawlBtn")?.setAttribute("disabled", "");
    getEl("#cancelCrawlBtn")?.removeAttribute("disabled");
    getEl("#crawlProgressSection")?.classList.remove("hidden");
    getEl("#crawlOutputSection")?.classList.add("hidden");
    setCrawlBadge("TRIGGERING", "warning");

    const progressBar = getEl("#crawlProgressBar");
    if (progressBar) {
      progressBar.style.width = "0%";
      progressBar.classList.add("indeterminate");
    }

    try {
      // 1. Trigger
      setCrawlStatus("Triggering crawl...", "info");
      const triggerResult = await _bdClient.triggerCrawl(urls);
      const snapshotId = triggerResult.snapshot_id;
      _bdActiveSnapshotId = snapshotId;

      setText("#crawlSnapshotId", `ID: ${snapshotId}`);
      setCrawlBadge("RUNNING", "active");

      // 2. Poll
      setCrawlStatus(`Polling progress for ${snapshotId}...`, "info");
      await _bdClient.pollUntilReady(snapshotId, {
        onProgress: (p) => {
          const statusLabel = p.status ? p.status.toUpperCase() : "UNKNOWN";
          setCrawlStatus(`Status: ${statusLabel}`, "info");
          updateDiagnostics();

          if (progressBar) {
            if (p.status === "running") {
              progressBar.classList.remove("indeterminate");
              progressBar.style.width = "60%";
            } else if (p.status === "ready") {
              progressBar.style.width = "100%";
            }
          }
        }
      });

      // 3. Download
      setCrawlBadge("DOWNLOADING", "active");
      setCrawlStatus("Downloading snapshot data...", "info");
      if (progressBar) progressBar.style.width = "90%";

      const data = await _bdClient.downloadSnapshot(snapshotId);
      _bdCrawlOutputData = data;

      // Show output
      if (progressBar) {
        progressBar.classList.remove("indeterminate");
        progressBar.style.width = "100%";
      }
      setCrawlBadge("COMPLETE", "success");
      setCrawlStatus("Crawl complete. Data ready.", "success");

      const outputSection = getEl("#crawlOutputSection");
      const outputPre = getEl("#crawlOutput");
      if (outputSection) outputSection.classList.remove("hidden");
      if (outputPre) {
        outputPre.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
      }

    } catch (err) {
      const msg = err.message || "Crawl failed";
      setCrawlBadge("ERROR", "error");
      setCrawlStatus(`Error: ${msg}`, "error");

      const progressBar2 = getEl("#crawlProgressBar");
      if (progressBar2) {
        progressBar2.classList.remove("indeterminate");
        progressBar2.style.width = "0%";
      }
    } finally {
      getEl("#runCrawlBtn")?.removeAttribute("disabled");
      getEl("#cancelCrawlBtn")?.setAttribute("disabled", "");
      _bdActiveSnapshotId = null;
      updateDiagnostics();
    }
  }

  async function cancelCrawl() {
    if (!_bdActiveSnapshotId || !_bdClient) return;

    setCrawlBadge("CANCELLING", "warning");
    _bdClient.cancelPolling(_bdActiveSnapshotId);

    try {
      await _bdClient.cancelSnapshot(_bdActiveSnapshotId);
      setCrawlStatus("Crawl cancelled.", "info");
    } catch {
      setCrawlStatus("Polling stopped. Server cancel may have failed.", "warning");
    }

    setCrawlBadge("CANCELLED", "info");
    getEl("#cancelCrawlBtn")?.setAttribute("disabled", "");
    updateDiagnostics();
  }

  function setCrawlStatus(msg, type) {
    const el = getEl("#crawlStatusText");
    if (!el) return;
    el.textContent = msg;
    el.style.color = type === "error" ? "#ff3366" :
      type === "success" ? "#00ff40" :
        type === "warning" ? "#ffaa00" :
          "rgba(255,255,255,0.4)";
  }

  function setCrawlBadge(label, type) {
    const el = getEl("#crawlStatusBadge");
    if (!el) return;
    el.textContent = label;
    el.style.color = type === "error" ? "#ff3366" :
      type === "success" ? "#00ff40" :
        type === "active" ? "#00ff40" :
          type === "warning" ? "#ffaa00" :
            "rgba(255,255,255,0.4)";
    el.style.borderColor = type === "error" ? "rgba(255,51,102,0.3)" :
      type === "success" ? "rgba(0,255,64,0.3)" :
        type === "active" ? "rgba(0,255,64,0.3)" :
          type === "warning" ? "rgba(255,170,0,0.3)" :
            "#1b2333";
  }

  function downloadCrawlOutput() {
    if (!_bdCrawlOutputData) return;
    const content = typeof _bdCrawlOutputData === "string"
      ? _bdCrawlOutputData
      : JSON.stringify(_bdCrawlOutputData, null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crawl_output_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- Diagnostics ---
  function updateDiagnostics() {
    const tbody = getEl("#bdDiagnosticsBody");
    if (!tbody || !_bdClient) return;

    tbody.innerHTML = "";
    _bdClient.diagnostics.forEach(d => {
      const tr = document.createElement("tr");
      const isOk = d.status >= 200 && d.status < 300;
      tr.innerHTML = `
        <td>${d.ts ? new Date(d.ts).toLocaleTimeString() : "-"}</td>
        <td>${d.method}</td>
        <td>${d.endpoint}</td>
        <td class="${isOk ? "status-ok" : "status-err"}">${d.status || "-"}</td>
        <td>${d.duration || "-"}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // --- Bind Bright Data UI Events ---
  function bindBrightDataEvents() {
    // Settings modal
    getEl("#settingsBtn")?.addEventListener("click", openSettingsModal);
    getEl("#closeSettingsBtn")?.addEventListener("click", closeSettingsModal);
    getEl(".bd-modal-backdrop")?.addEventListener("click", closeSettingsModal);

    // Settings actions
    getEl("#bdSaveBtn")?.addEventListener("click", saveBrightDataSettings);
    getEl("#bdTestBtn")?.addEventListener("click", testBrightDataConnection);
    getEl("#bdClearBtn")?.addEventListener("click", clearBrightDataSettings);
    getEl("#toggleApiKeyBtn")?.addEventListener("click", toggleApiKeyVisibility);

    // Crawl runner
    getEl("#runCrawlBtn")?.addEventListener("click", runCrawl);
    getEl("#cancelCrawlBtn")?.addEventListener("click", cancelCrawl);
    getEl("#downloadOutputBtn")?.addEventListener("click", downloadCrawlOutput);

    // Escape key to close modal
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeSettingsModal();
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    init();
    bindBrightDataEvents();

    // Tutorial Mode
    const tutorial = new TutorialModal();
    tutorial.autoShow();
    getEl("#helpBtn")?.addEventListener("click", () => tutorial.show());
    window.CivicWeatherTutorial = tutorial;
  });
})();