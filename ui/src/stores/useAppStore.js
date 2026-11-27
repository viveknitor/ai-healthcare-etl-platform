import { create } from "zustand";
import { api } from "@/api.js";

const THEME_KEY = "healthcare_etl_theme";
const SIDEBAR_KEY = "healthcare_etl_sidebar_collapsed";

export const VALID_TABS = ["overview", "upload", "pipeline", "mapping"];

export const TAB_META = {
  overview: {
    label: "Dashboard",
    headerTitle: "Dashboard",
    pageTitle: "Dashboard · SmartHealth ETL",
  },
  upload: {
    label: "New Ingestion",
    headerTitle: "New Ingestion",
    pageTitle: "New Ingestion · SmartHealth ETL",
  },
  pipeline: {
    label: "Live Sync",
    headerTitle: "Live Sync",
    pageTitle: "Live Sync · SmartHealth ETL",
  },
  mapping: {
    label: "Mapping Studio",
    headerTitle: "Mapping Studio",
    pageTitle: "Mapping Studio · SmartHealth ETL",
  },
};

function readInitialTab() {
  if (typeof window === "undefined") return "overview";
  const params = new URLSearchParams(window.location.search);
  const t = params.get("tab");
  return VALID_TABS.includes(t) ? t : "overview";
}

function readInitialTheme() {
  return "light";
}

function resolveTheme() {
  return "light";
}

export function applyThemeToDom() {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme();
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", "#f6f8fb");
}

export const useAppStore = create((set, get) => ({
  activeTab: readInitialTab(),
  theme: readInitialTheme(),
  sidebarCollapsed:
    typeof window !== "undefined" ? localStorage.getItem(SIDEBAR_KEY) === "true" : false,

  // Active batch telemetry shown in TopHeader
  activeBatch: null, // { datasetName, rowCount, targetResource, stage }

  // Live service health & overview stats
  backendOnline: null, // null | true | false
  servicesHealth: null, // { fastapi, medplum, hapi, gemini, checked_at }
  overviewStats: null,
  statsLoading: false,
  statsError: "",

  // Confirmation dialog global queue state
  confirmRequest: null,

  setActiveTab: (tab) => {
    if (!VALID_TABS.includes(tab)) return;
    set({ activeTab: tab });
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.pushState({ tab }, "", url.toString());
      document.title = TAB_META[tab]?.pageTitle || "Healthcare ETL";
    }
  },

  syncTabFromUrl: () => {
    const tab = readInitialTab();
    set({ activeTab: tab });
    if (typeof document !== "undefined") {
      document.title = TAB_META[tab]?.pageTitle || "Healthcare ETL";
    }
  },

  setTheme: () => {
    set({ theme: "light" });
    if (typeof window !== "undefined") {
      localStorage.setItem(THEME_KEY, "light");
    }
    applyThemeToDom("light");
  },

  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    set({ sidebarCollapsed: next });
    if (typeof window !== "undefined") {
      localStorage.setItem(SIDEBAR_KEY, String(next));
    }
  },

  setActiveBatch: (activeBatch) => set({ activeBatch }),

  refreshHealthAndStats: async () => {
    set({ statsLoading: true, statsError: "" });
    try {
      const [healthRes, servicesRes, statsRes] = await Promise.allSettled([
        api.health(),
        api.getServicesHealth(),
        api.getOverviewStats(),
      ]);

      const online = healthRes.status === "fulfilled" && Boolean(healthRes.value?.ok);
      set({
        backendOnline: online,
        servicesHealth: servicesRes.status === "fulfilled" ? servicesRes.value : null,
        overviewStats: statsRes.status === "fulfilled" ? statsRes.value : get().overviewStats,
        statsLoading: false,
        statsError: online ? "" : "FastAPI backend unreachable on :8000",
      });
    } catch (err) {
      set({
        backendOnline: false,
        statsLoading: false,
        statsError: err?.message || "Failed to fetch system status",
      });
    }
  },

  openConfirm: (config) =>
    new Promise((resolve) => {
      set({
        confirmRequest: {
          ...config,
          resolve,
        },
      });
    }),

  resolveConfirm: (accepted) => {
    const req = get().confirmRequest;
    set({ confirmRequest: null });
    if (req?.resolve) req.resolve(accepted);
  },
}));
