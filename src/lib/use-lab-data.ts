"use client";

import { useEffect, useState } from "react";

export type PresentMember = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

/**
 * Quick enough that the view feels live while someone is actually looking at
 * it — this is the screen being watched, not a background badge, so it can
 * afford a tighter cadence than the app-wide 45s heartbeat in use-home-data.ts.
 */
const POLL_MS = 15_000;

/**
 * Who is in the Lab right now.
 *
 * `enabled` gates the polling the way the other views do: nobody pays for a
 * timer against a screen they haven't opened.
 */
export function useLabData(enabled: boolean) {
  const [present, setPresent] = useState<PresentMember[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    function load() {
      setLoading(true);
      fetch("/api/mobion/lab")
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data) => {
          if (cancelled) return;
          setPresent(data.present ?? []);
          setLoadError(null);
        })
        .catch(() => {
          if (!cancelled) setLoadError("랩 현황을 불러오지 못했습니다.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }

    load();
    const timer = setInterval(load, POLL_MS);
    // coming back to the tab should not wait out the rest of the interval
    function onVisible() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);

  return {
    present,
    loading,
    loadError,
    isEmpty: present.length === 0,
  };
}

export type LabData = ReturnType<typeof useLabData>;
