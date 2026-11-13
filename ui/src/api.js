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
  runPipeline: (count, dry_run, offset = 0, resource_type = "Patient") =>
    call("/pipelines/hapi-to-medplum", { count, dry_run, offset, resource_type }),
  suggestMapping: (sample, target_resource) => call("/mappings/suggest", { sample, target_resource }),
  transform: (mapping, payload) => call("/transform", { mapping, payload }),
};
