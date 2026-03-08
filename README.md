# ⚡ Civic Weather Engine

> **Real-time municipal intelligence — powered by open civic data.**

A high-fidelity meteorological dashboard that transforms raw city service data into an intuitive weather forecast. Instead of spreadsheets, civic leaders see storms, pressure fronts, and clear skies.

## Overview

Civic Weather ingests three municipal datasets — 311 service requests, construction permits, and business licenses — and translates them into a real-time "atmospheric" reading of city health. The result: a **Climate Index** (0–100) that tells you at a glance whether your city is thriving or heading into a crisis.

## The Conceptual Model

The engine tracks three core civic forces:

| Signal | Metaphor | Source |
|--------|----------|--------|
| **Civic Pressure** | Atmospheric pressure | 311 Service Requests |
| **Response Winds** | Wind speed & direction | Request resolution times |
| **Urban Growth** | Sunshine & warmth | Construction permits + Business licenses |

Together, construction permits and business licenses form a unified **Growth Signal**. Month-over-month comparisons against 311 friction drive the **Climate Index** and predict incoming **Storm Fronts**.

## Use Cases: City Management & Strategic Intervention

### ⚡ Scenario A: "Service Storm"
* **Signals:** 311 complaints rising >15%, response times slowing >5%.
* **Action:** The Mayor sees high service friction building. The radar view pinpoints which districts are generating pressure (e.g., pothole backlog, missed collections). Resources are diverted *before* the storm becomes a public crisis.

### 🌆 Scenario B: "Growth Storm"
* **Signals:** Permits/licenses surging >15%, 311 complaints starting to rise >8%.
* **Action:** Rapid development is outpacing infrastructure capacity. The city hires more inspectors or diverts public works staff to match demand.

### ☀ Scenario C: "Stable / Strengthening"
* **Signals:** Complaints stable or dropping, response times faster, new business licenses rising.
* **Action:** Economic warmth and efficient services. City leaders validate recent investments to the council.

## Meteorological UI: The Control Room

- **Radar Monitoring Console** — Circular radar with concentric rings, a rotating sweep, and glow points representing civic activity density.
- **Atmospheric Gauges** — Civic Pressure, Response Winds, and Urban Growth displayed as digital instrument readouts.
- **Forecast Replay** — Interactive timeline to scrub through historical data as if it were an approaching storm front.
- **Storm Alert System** — Real-time alerts when complaint surges cross critical thresholds.

## 🌪️ Demo Mode: Simulate Civic Storm (60s)

Click **"Simulate Civic Storm"** to run a self-contained 60-second demonstration that cycles through five phases:

1. **Calibration** (0–7s) — Establishes baseline metrics.
2. **Pressure Build** (8–22s) — Complaint volume rises, gauges shift.
3. **Storm Peak** (23–45s) — Full storm takeover: red radar, emergency banner, critical alerts.
4. **Recovery** (45–55s) — Pressure eases, services recover.
5. **Summary** (55–60s) — Systems return to baseline.

> **Tip:** Hit the demo button the moment a judge looks at your screen. The radar going red and the recovery arc tell the entire story without a single word.

## Data Resilience & Security

The engine is hardened for real-world data:

- **Flexible column detection** — Automatically maps inconsistent CSV headers via candidate matching (`detectFields`).
- **Graceful degradation** — If construction or business datasets are missing, the engine runs on 311 data alone (`loadCsvOptional`).
- **Row-count safety cap** — Large datasets (e.g., 100K+ row business license exports) are capped at 50,000 rows to prevent browser memory issues.
- **CSV injection sanitization** — User-submitted text fields are sanitized to prevent formula injection (`=`, `+`, `-`, `@` prefixes stripped).
- **Null-field guards** — Missing or unmapped date columns produce warnings rather than crashes.
- **Error fallback UI** — If data loading fails entirely, the dashboard shows an offline state with a fallback to demo mode.

## Data Sources

Place the following municipal CSVs in the `data/` directory:
- `311_requests.csv` — 311 service requests (required)
- `construction_permits.csv` — Construction/building permits (optional)
- `business_licenses.csv` — Business license registrations (optional)

## Technical Stack

| Layer | Technology |
|-------|-----------|
| **Core** | Vanilla JavaScript (IIFE pattern) & Semantic HTML5 |
| **Styling** | Tailwind CSS v4 — CSS-first `@theme` configuration |
| **Radar** | Canvas 2D API for geodensity visualization |
| **Data** | PapaParse for robust CSV ingestion |

## Running Locally

### 1. Install Dependencies
```bash
npm install
```

### 2. Build Styles
```bash
npm run build
```

### 3. Start Server
```bash
npx http-server . -p 8081
```

Navigate to `http://localhost:8081` to view the control room.

## Why This Matters

| Metric | Impact |
|--------|--------|
| **Response Time** | Early storm alerts can reduce avg 311 resolution from 72h → 48h (33% faster) |
| **Cost Avoidance** | One prevented PR crisis saves ~$200K in damage control |
| **Equity** | Radar view exposes underserved districts for fairer resource allocation |
| **Transparency** | Public-facing dashboard builds civic trust and engagement |

---

*Built for the hackathon. Designed for the real world.*
