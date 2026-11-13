import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev proxy: UI calls /api/* -> FastAPI on :8000 (no CORS headaches)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:8000", rewrite: (p) => p.replace(/^\/api/, "") } },
  },
});
