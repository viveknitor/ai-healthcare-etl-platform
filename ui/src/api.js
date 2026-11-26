const BASE = import.meta.env.VITE_API_BASE ?? "/api";

async function call(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Request failed (${res.status})`);
  return data;
}

export const api = {
  health: () => call("/health"),
  getDashboardStats: () => call("/stats/overview"),
  getInfrastructureStatus: (refresh = false) =>
    call(`/stats/infrastructure${refresh ? "?refresh=true" : ""}`),
  resetDashboardStats: (baseline = true) =>
    call(`/stats/reset?baseline=${baseline}`, {}),
  runPipeline: (count, dry_run, offset = 0, resource_type = "Patient") =>
    call("/pipelines/hapi-to-medplum", { count, dry_run, offset, resource_type }),
  suggestMapping: (sample, target_resource) => call("/mappings/suggest", { sample, target_resource }),
  transform: (mapping, payload) => call("/transform", { mapping, payload }),
  getLiveMedplumResource: (resourceType, resourceId) => call(`/medplum/live/${resourceType}/${resourceId}`),
  getMappings: () => call("/mappings"),
  saveMapping: (mapping) => call("/mappings/save", mapping),
  uploadFile: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE}/upload/parse`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `Upload failed (${res.status})`);
    return data;
  },
  executeUploadIngestion: (rows, mapping, dry_run, dataset_name = "upload") =>
    call("/upload/execute", { rows, mapping, dry_run, dataset_name }),
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
        throw new Error(errJson.detail || `Stream failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop();

        for (const block of lines) {
          const trimmed = block.trim();
          if (trimmed.startsWith("data:")) {
            const jsonStr = trimmed.slice(5).trim();
            if (jsonStr) {
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
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        if (onError) onError(err);
        else throw err;
      }
    }
  },
  autoHealMapping: (mapping, sample, errors) =>
    call("/mappings/auto-heal", { mapping, sample, errors }),
};
