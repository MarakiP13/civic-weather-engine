// =============================================================================
// Bright Data Crawl API Client
// Direct-from-Browser Mode (Dev / Single-user)
// =============================================================================

/**
 * BrightDataClient — Full Crawl API wrapper with polling, retry, and diagnostics.
 *
 * Usage:
 *   const client = new BrightDataClient({ apiKey, datasetId, ... });
 *   const { snapshot_id } = await client.triggerCrawl(["https://example.com"]);
 *   const data = await client.pollUntilReady(snapshot_id);
 */
class BrightDataClient {
    static STORAGE_KEY = "settings.integrations.brightdata";
    static BASE_URL = "https://api.brightdata.com/datasets/v3";

    // ---------------------------------------------------------------------------
    // Construction & Config
    // ---------------------------------------------------------------------------
    constructor(config = {}) {
        this.apiKey = config.apiKey || "";
        this.datasetId = config.datasetId || "";
        this.includeErrors = config.includeErrors !== undefined ? config.includeErrors : true;
        this.customOutputFields = config.customOutputFields || "markdown";
        this.downloadFormat = config.downloadFormat || "json";

        // Diagnostics ring buffer (last 10 requests)
        this._diagnostics = [];
        this._maxDiagnostics = 10;

        // Active AbortControllers for cancellation
        this._activeControllers = new Map();
    }

    /** Load settings from localStorage and return a new client instance. */
    static fromStorage() {
        try {
            const raw = localStorage.getItem(BrightDataClient.STORAGE_KEY);
            if (!raw) return new BrightDataClient();
            return new BrightDataClient(JSON.parse(raw));
        } catch {
            return new BrightDataClient();
        }
    }

    /** Save current config to localStorage (never logs the key). */
    saveToStorage() {
        const data = {
            apiKey: this.apiKey,
            datasetId: this.datasetId,
            includeErrors: this.includeErrors,
            customOutputFields: this.customOutputFields,
            downloadFormat: this.downloadFormat,
        };
        localStorage.setItem(BrightDataClient.STORAGE_KEY, JSON.stringify(data));
    }

    /** Clear stored settings. */
    static clearStorage() {
        localStorage.removeItem(BrightDataClient.STORAGE_KEY);
    }

    /** Get diagnostics log entries. */
    get diagnostics() {
        return [...this._diagnostics];
    }

    // ---------------------------------------------------------------------------
    // Internal fetch wrapper with retry, diagnostics, and auth
    // ---------------------------------------------------------------------------
    async _fetch(method, path, { query = {}, body = null, signal = null, retries = 3 } = {}) {
        const url = new URL(`${BrightDataClient.BASE_URL}${path}`);
        Object.entries(query).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
        });

        const headers = {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
        };

        const opts = { method, headers, signal };
        if (body) opts.body = JSON.stringify(body);

        let lastError = null;
        for (let attempt = 1; attempt <= retries; attempt++) {
            const start = performance.now();
            let status = 0;
            try {
                const res = await fetch(url.toString(), opts);
                status = res.status;
                const duration = Math.round(performance.now() - start);

                this._pushDiag({ method, endpoint: path, status, duration, error: null, ts: new Date().toISOString() });

                if (res.ok) {
                    const ct = res.headers.get("content-type") || "";
                    if (ct.includes("application/json")) return await res.json();
                    return await res.text();
                }

                // Non-retryable client errors
                if (status >= 400 && status < 500) {
                    const errBody = await res.text().catch(() => "");
                    const err = new Error(`Bright Data API ${status}: ${errBody || res.statusText}`);
                    err.status = status;
                    this._pushDiag({ method, endpoint: path, status, duration, error: err.message, ts: new Date().toISOString() });
                    throw err;
                }

                // 5xx — retryable
                lastError = new Error(`Bright Data API ${status}: ${res.statusText}`);
                lastError.status = status;
            } catch (e) {
                if (e.name === "AbortError") throw e;
                if (e.status && e.status >= 400 && e.status < 500) throw e; // re-throw client errors
                lastError = e;
                const duration = Math.round(performance.now() - start);
                this._pushDiag({ method, endpoint: path, status: status || 0, duration, error: e.message, ts: new Date().toISOString() });
            }

            // Wait before retry (simple backoff)
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }

        throw lastError || new Error("Request failed after retries");
    }

    _pushDiag(entry) {
        this._diagnostics.push(entry);
        if (this._diagnostics.length > this._maxDiagnostics) this._diagnostics.shift();
    }

    // ---------------------------------------------------------------------------
    // 3.1  Trigger Crawl
    // ---------------------------------------------------------------------------
    async triggerCrawl(urls) {
        if (!this.apiKey) throw new Error("API key is not configured.");
        if (!this.datasetId) throw new Error("Dataset ID is not configured.");
        if (!urls || !urls.length) throw new Error("At least one URL is required.");

        const body = urls.map(u => ({ url: u.trim() })).filter(u => u.url);
        return this._fetch("POST", "/trigger", {
            query: {
                dataset_id: this.datasetId,
                include_errors: this.includeErrors,
                custom_output_fields: this.customOutputFields,
            },
            body,
        });
    }

    // ---------------------------------------------------------------------------
    // 3.2  Monitor Progress
    // ---------------------------------------------------------------------------
    async getProgress(snapshotId) {
        return this._fetch("GET", `/progress/${snapshotId}`);
    }

    // ---------------------------------------------------------------------------
    // 3.3  Download Snapshot
    // ---------------------------------------------------------------------------
    async downloadSnapshot(snapshotId, opts = {}) {
        return this._fetch("GET", `/snapshot/${snapshotId}`, {
            query: {
                format: opts.format || this.downloadFormat,
                compress: opts.compress,
                batch_size: opts.batchSize,
                part: opts.part,
            },
        });
    }

    // ---------------------------------------------------------------------------
    // 3.4  List Snapshots
    // ---------------------------------------------------------------------------
    async listSnapshots(filters = {}) {
        return this._fetch("GET", "/snapshots", {
            query: { dataset_id: this.datasetId, ...filters },
        });
    }

    // ---------------------------------------------------------------------------
    // 3.5  Cancel Snapshot
    // ---------------------------------------------------------------------------
    async cancelSnapshot(snapshotId) {
        return this._fetch("POST", `/snapshot/${snapshotId}/cancel`);
    }

    // ---------------------------------------------------------------------------
    // 3.6  Download Parts
    // ---------------------------------------------------------------------------
    async getSnapshotParts(snapshotId) {
        return this._fetch("GET", `/snapshot/${snapshotId}/parts`);
    }

    // ---------------------------------------------------------------------------
    // 3.7  Deliver Snapshot (optional)
    // ---------------------------------------------------------------------------
    async deliverSnapshot(snapshotId, deliveryConfig, notifyUrl) {
        return this._fetch("POST", `/deliver/${snapshotId}`, {
            query: { notify: notifyUrl },
            body: deliveryConfig,
        });
    }

    async getDeliveryStatus(deliveryId) {
        return this._fetch("GET", `/delivery/${deliveryId}`);
    }

    // ---------------------------------------------------------------------------
    // Test Connection
    // ---------------------------------------------------------------------------
    async testConnection() {
        if (!this.apiKey) throw new Error("API key is required to test.");
        return this.listSnapshots({ limit: 1 });
    }

    // ---------------------------------------------------------------------------
    // Poll Until Ready (with exponential backoff)
    // ---------------------------------------------------------------------------
    async pollUntilReady(snapshotId, { onProgress = null, timeoutMs = 20 * 60 * 1000 } = {}) {
        const controller = new AbortController();
        this._activeControllers.set(snapshotId, controller);

        const start = Date.now();
        let delay = 1000; // start at 1s
        const maxDelay = 10000; // cap at 10s

        try {
            while (true) {
                if (controller.signal.aborted) throw new Error("Polling cancelled.");
                if (Date.now() - start > timeoutMs) throw new Error("Polling timed out after 20 minutes.");

                const progress = await this.getProgress(snapshotId);

                if (onProgress) onProgress(progress);

                if (progress.status === "ready") {
                    return progress;
                }
                if (progress.status === "failed") {
                    throw new Error(`Crawl failed. Snapshot ${snapshotId} status: failed`);
                }

                await new Promise((resolve, reject) => {
                    const timer = setTimeout(resolve, delay);
                    controller.signal.addEventListener("abort", () => {
                        clearTimeout(timer);
                        reject(new Error("Polling cancelled."));
                    }, { once: true });
                });

                // Exponential backoff with jitter
                delay = Math.min(delay * 2 + Math.random() * 500, maxDelay);
            }
        } finally {
            this._activeControllers.delete(snapshotId);
        }
    }

    /** Cancel an active polling operation. */
    cancelPolling(snapshotId) {
        const controller = this._activeControllers.get(snapshotId);
        if (controller) controller.abort();
    }

    /** Cancel all active polling. */
    cancelAllPolling() {
        this._activeControllers.forEach(c => c.abort());
        this._activeControllers.clear();
    }
}

// Make globally available
window.BrightDataClient = BrightDataClient;
