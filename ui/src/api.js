const BASE = import.meta.env.VITE_API_BASE ?? "/api";

export class ApiError extends Error {
  constructor(message, status = 0, detail = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function call(path, body, options = {}) {
  const { signal, timeoutMs = 30000 } = options;
  const controller = new AbortController();
  const timeoutId = timeoutMs ? setTimeout(() => controller.abort(new Error("Request timed out")), timeoutMs) : null;

  const onExternalAbort = () => controller.abort(signal.reason);
  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  try {
    const res = await fetch(`${BASE}${path}`, {
      method: body !== undefined ? "POST" : "GET",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.detail || `Request failed (${res.status})`;
      throw new ApiError(msg, res.status, data);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err?.name === "AbortError") throw err;
    throw new ApiError(err?.message || "Network request failed", 0);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (signal) signal.removeEventListener("abort", onExternalAbort);
  }
}

export const api = {
  health: (opts) => call("/health", undefined, { timeoutMs: 6000, ...opts }),
  getServicesHealth: (opts) => call("/health/services", undefined, { timeoutMs: 8000, ...opts }),
  getOverviewStats: (opts) => call("/stats/overview", undefined, { timeoutMs: 8000, ...opts }),
  resetOverviewStats: (opts) => call("/stats/reset", {}, { timeoutMs: 8000, ...opts }),

  runPipeline: (count, dry_run, offset = 0, resource_type = "Patient", opts) =>
    call("/pipelines/hapi-to-medplum", { count, dry_run, offset, resource_type }, { timeoutMs: 120000, ...opts }),

  suggestMapping: (sample, target_resource, opts) =>
    call("/mappings/suggest", { sample, target_resource }, { timeoutMs: 45000, ...opts }),

  transform: (mapping, payload, opts) =>
    call("/transform", { mapping, payload }, opts),

  getLiveMedplumResource: (resourceType, resourceId, opts) =>
    call(`/medplum/live/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}`, undefined, opts),

  getMappings: (opts) => call("/mappings", undefined, opts),
  saveMapping: (mapping, opts) => call("/mappings/save", mapping, opts),

  uploadFile: async (file, opts = {}) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE}/upload/parse`, {
      method: "POST",
      body: formData,
      signal: opts.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.detail || `Upload failed (${res.status})`, res.status, data);
    return data;
  },

  executeUploadIngestion: (rows, mapping, dry_run, dataset_name = "upload", opts) =>
    call("/upload/execute", { rows, mapping, dry_run, dataset_name }, { timeoutMs: 180000, ...opts }),

  executeUploadIngestionStream: async ({
    rows,
    mapping,
    dry_run,
    dataset_name = "upload",
    onRecord,
    onComplete,
    onError,
    signal,
  }) => {
    try {
      const res = await fetch(`${BASE}/upload/execute-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, mapping, dry_run, dataset_name }),
        signal,
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new ApiError(errJson.detail || `Stream failed (${res.status})`, res.status, errJson);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          const trimmed = block.trim();
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;
          try {
            const event = JSON.parse(jsonStr);
            if (event.type === "record" && onRecord) {
              onRecord(event);
            } else if (event.type === "complete" && onComplete) {
              onComplete(event);
            }
          } catch (e) {
            console.error("Failed to parse SSE event", e, jsonStr);
          }
        }
      }
    } catch (err) {
      if (err?.name !== "AbortError") {
        if (onError) onError(err);
        else throw err;
      }
    }
  },

  autoHealMapping: (mapping, sample, errors, opts) =>
    call("/mappings/auto-heal", { mapping, sample, errors }, { timeoutMs: 60000, ...opts }),
};
