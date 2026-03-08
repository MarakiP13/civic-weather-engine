// =============================================================================
// Civic Weather Station — Tutorial Modal
// Interactive onboarding system with expandable feature cards
// =============================================================================

class TutorialModal {
    static STORAGE_KEY = "tutorial.dismissed";

    constructor() {
        this.isVisible = false;
        this.modalEl = null;
        this.featureCards = [];
        this._previousFocus = null;

        this._features = [
            {
                id: "climate-index",
                icon: "📡",
                title: "Climate Index",
                brief: "Your city's health at a glance — a single 0–100 score.",
                details: {
                    heading: "How It Works",
                    points: [
                        { label: "Weighted Formula", desc: "Balances responsiveness (40%), urban growth (30%), and inverse friction (30%) into one number." },
                        { label: "Real-Time", desc: "Updates each month as new civic data flows in — no manual calculation needed." },
                        { label: "Actionable", desc: "Above 70 = stable conditions. Below 40 = storm territory. The number tells leaders when to act." },
                    ],
                    tip: "Watch the big number at the top of the dashboard — it's the heartbeat of your city."
                }
            },
            {
                id: "radar-console",
                icon: "🔴",
                title: "Radar Console",
                brief: "A meteorological radar that maps civic activity density.",
                details: {
                    heading: "Reading the Radar",
                    points: [
                        { label: "Rotating Sweep", desc: "The green sweep scans for activity. Speed increases as conditions worsen — watch it accelerate during storms." },
                        { label: "Density Points", desc: "Glowing dots represent clusters of 311 complaints. Brighter = more reports in that area." },
                        { label: "Color Escalation", desc: "Green → Amber → Red. The radar's color palette shifts as civic pressure builds through storm phases." },
                    ],
                    tip: "The radar tells you WHERE problems are concentrating — pinpoint pressure hotspots before they escalate."
                }
            },
            {
                id: "atmo-gauges",
                icon: "📊",
                title: "Atmospheric Gauges",
                brief: "Three instrument readouts tracking the forces that drive civic weather.",
                details: {
                    heading: "The Three Signals",
                    points: [
                        { label: "Civic Pressure", desc: "Driven by 311 complaint volume. Rising pressure = more citizen friction with city services." },
                        { label: "Response Winds", desc: "Measures how fast the city resolves issues. Slowing winds = growing service backlog." },
                        { label: "Urban Growth", desc: "Combined construction permits + business licenses. High growth with low pressure = thriving city." },
                    ],
                    tip: "The strongest storms form when Civic Pressure is high AND Response Winds are slow simultaneously."
                }
            },
            {
                id: "storm-replay",
                icon: "⛈",
                title: "Storm Replay",
                brief: "Scrub through historical data like an approaching weather front.",
                details: {
                    heading: "Using the Timeline",
                    points: [
                        { label: "Drag the Slider", desc: "Move through months of civic data. Each position updates all gauges, the radar, and storm alerts in real time." },
                        { label: "Play / Pause", desc: "Hit Play to auto-advance through the full timeline at 1.4-second intervals." },
                        { label: "Forecast Strip", desc: "The icon bar below the slider shows upcoming conditions — spot storms before they arrive." },
                    ],
                    tip: "Use replay to find patterns: do storms always hit in the same months? That's where to focus resources."
                }
            },
            {
                id: "storm-demo",
                icon: "🌪",
                title: "Simulate Civic Storm",
                brief: "A 60-second self-contained demo that cycles through all five storm phases.",
                details: {
                    heading: "The Five Phases",
                    points: [
                        { label: "Calibration (0–7s)", desc: "Establishes baseline metrics. All systems green, radar sweep calm." },
                        { label: "Pressure Build (8–22s)", desc: "Complaint volume rises. Gauges shift, radar picks up speed, amber tones creep in." },
                        { label: "Storm Peak (23–45s)", desc: "Full red takeover — emergency banner, pulsing overlay, critical alerts. Maximum intensity." },
                        { label: "Recovery (45–55s)", desc: "Pressure drops. Response winds pick up. Systems return toward normal." },
                        { label: "Summary (55–60s)", desc: "Baseline restored. Simulation archived. All clear." },
                    ],
                    tip: "Hit \"Simulate Civic Storm\" the moment someone looks at your screen — the visual arc tells the entire story."
                }
            },
        ];

        this._buildDOM();
        this._bindEvents();
    }

    // ---------------------------------------------------------------------------
    // DOM Construction
    // ---------------------------------------------------------------------------
    _buildDOM() {
        const modal = document.createElement("div");
        modal.id = "tutorialModal";
        modal.className = "tut-modal";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-labelledby", "tut-title");
        modal.setAttribute("aria-hidden", "true");

        modal.innerHTML = `
      <div class="tut-backdrop"></div>
      <div class="tut-card">
        <button class="tut-close" aria-label="Close tutorial">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>

        <div class="tut-header">
          <div class="tut-logo">⚡</div>
          <h2 id="tut-title">Welcome to Civic Weather</h2>
          <p class="tut-subtitle">Real-time municipal intelligence — powered by open civic data</p>
        </div>

        <div class="tut-body">
          ${this._features.map(f => this._renderFeature(f)).join("")}
        </div>

        <div class="tut-footer">
          <label class="tut-dismiss-label">
            <input type="checkbox" id="tutDontShow" class="tut-dismiss-check">
            <span>Don't show on next visit</span>
          </label>
          <button class="tut-btn-start" id="tutStartBtn">Start Exploring</button>
        </div>
      </div>
    `;

        document.body.appendChild(modal);
        this.modalEl = modal;
    }

    _renderFeature(f) {
        return `
      <div class="tut-feature" data-feature="${f.id}" tabindex="0" role="button" aria-expanded="false" aria-controls="tut-detail-${f.id}">
        <div class="tut-feature-header">
          <span class="tut-feature-icon">${f.icon}</span>
          <div class="tut-feature-text">
            <h3>${f.title}</h3>
            <p>${f.brief}</p>
          </div>
          <span class="tut-expand-arrow">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </span>
        </div>
        <div class="tut-feature-details" id="tut-detail-${f.id}">
          <h4>${f.details.heading}</h4>
          <ul>
            ${f.details.points.map(p => `<li><strong>${p.label}:</strong> ${p.desc}</li>`).join("")}
          </ul>
          <p class="tut-tip">💡 ${f.details.tip}</p>
        </div>
      </div>
    `;
    }

    // ---------------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------------
    _bindEvents() {
        // Close buttons
        this.modalEl.querySelector(".tut-close").addEventListener("click", () => this.hide());
        this.modalEl.querySelector(".tut-backdrop").addEventListener("click", () => this.hide());
        this.modalEl.querySelector("#tutStartBtn").addEventListener("click", () => this.hide());

        // Feature card toggles
        this.modalEl.querySelectorAll(".tut-feature").forEach(card => {
            card.addEventListener("click", (e) => {
                e.stopPropagation();
                this._toggleFeature(card);
            });
            card.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    this._toggleFeature(card);
                }
            });
        });

        // Global escape
        document.addEventListener("keydown", (e) => {
            if (this.isVisible && e.key === "Escape") this.hide();
        });
    }

    _toggleFeature(card) {
        const wasExpanded = card.classList.contains("expanded");

        // Collapse all others (accordion)
        this.modalEl.querySelectorAll(".tut-feature.expanded").forEach(other => {
            if (other !== card) {
                other.classList.remove("expanded");
                other.setAttribute("aria-expanded", "false");
            }
        });

        // Toggle this one
        card.classList.toggle("expanded", !wasExpanded);
        card.setAttribute("aria-expanded", String(!wasExpanded));

        this._log("feature_toggled", { feature: card.dataset.feature, expanded: !wasExpanded });
    }

    // ---------------------------------------------------------------------------
    // Show / Hide
    // ---------------------------------------------------------------------------
    show() {
        if (this.isVisible) return;
        this._previousFocus = document.activeElement;
        this.isVisible = true;
        this.modalEl.classList.add("visible");
        this.modalEl.setAttribute("aria-hidden", "false");

        // Focus the first interactive element
        requestAnimationFrame(() => {
            const firstCard = this.modalEl.querySelector(".tut-feature");
            if (firstCard) firstCard.focus();
        });

        this._log("tutorial_shown");
    }

    hide() {
        if (!this.isVisible) return;
        this.isVisible = false;
        this.modalEl.classList.remove("visible");
        this.modalEl.setAttribute("aria-hidden", "true");

        // Save dismiss preference
        const dontShow = this.modalEl.querySelector("#tutDontShow");
        if (dontShow?.checked) {
            localStorage.setItem(TutorialModal.STORAGE_KEY, "true");
        }

        // Restore focus
        if (this._previousFocus) {
            this._previousFocus.focus();
            this._previousFocus = null;
        }

        this._log("tutorial_hidden");
    }

    /** Check if should auto-show on first visit */
    shouldAutoShow() {
        return localStorage.getItem(TutorialModal.STORAGE_KEY) !== "true";
    }

    /** Show on first visit if not dismissed */
    autoShow() {
        if (this.shouldAutoShow()) {
            // Slight delay so the dashboard renders first
            setTimeout(() => this.show(), 800);
        }
    }

    // ---------------------------------------------------------------------------
    // Analytics (extensible)
    // ---------------------------------------------------------------------------
    _log(event, data = {}) {
        console.log(`📖 Tutorial: ${event}`, data);
    }
}

// Make globally available
window.TutorialModal = TutorialModal;
