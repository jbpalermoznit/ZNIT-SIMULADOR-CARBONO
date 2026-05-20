"use client";

import { useEffect, useState, useCallback } from "react";
import { listScenarios, type ScenarioResponse } from "@/lib/api/scenarios";

/**
 * Shared hook for "which scenario is the user editing right now".
 *
 * - Source of truth for the active scenario id is localStorage, keyed by
 *   projectId, so it survives navigation between Itens / Visão Geral /
 *   Cenários without re-fetching the user's pick.
 * - Falls back to the base scenario when the persisted id no longer exists.
 * - Returns the full list so the sidebar can render a switcher.
 */
export function useActiveScenario(projectId: string | null | undefined) {
  const storageKey = projectId ? `znit_active_scenario_${projectId}` : null;
  const [scenarios, setScenarios] = useState<ScenarioResponse[]>([]);
  const [activeScenarioId, setActiveScenarioIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await listScenarios(projectId);
      setScenarios(list);

      let persisted: string | null = null;
      if (storageKey && typeof window !== "undefined") {
        persisted = localStorage.getItem(storageKey);
      }

      const exists = persisted && list.some((s) => s.id === persisted);
      const base = list.find((s) => s.is_base);
      const fallback = base?.id ?? list[0]?.id ?? null;
      const next = exists ? persisted : fallback;

      setActiveScenarioIdState(next);
      if (storageKey && next && typeof window !== "undefined") {
        localStorage.setItem(storageKey, next);
      }
    } catch {
      setScenarios([]);
      setActiveScenarioIdState(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, storageKey]);

  useEffect(() => {
    load();
  }, [load]);

  // React to scenario changes triggered elsewhere in the same tab (e.g. the
  // sidebar switcher). The hook is used by several components; without this
  // they'd read stale localStorage on next render.
  useEffect(() => {
    if (!storageKey) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (detail?.id) setActiveScenarioIdState(detail.id);
    };
    window.addEventListener("znit:active-scenario-changed", handler);
    return () => window.removeEventListener("znit:active-scenario-changed", handler);
  }, [storageKey]);

  const setActiveScenarioId = useCallback(
    (id: string) => {
      setActiveScenarioIdState(id);
      if (storageKey && typeof window !== "undefined") {
        localStorage.setItem(storageKey, id);
        window.dispatchEvent(new CustomEvent("znit:active-scenario-changed", { detail: { id } }));
      }
    },
    [storageKey]
  );

  return {
    scenarios,
    activeScenarioId,
    activeScenario: scenarios.find((s) => s.id === activeScenarioId) ?? null,
    setActiveScenarioId,
    loading,
    reload: load,
  };
}
