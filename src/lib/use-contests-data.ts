"use client";

import { useEffect, useState } from "react";
import { dueState } from "./use-tasks-data";

export type Contest = {
  id: string;
  source: string;
  sourceKey: string;
  title: string;
  organizer: string;
  url: string;
  deadline: string | null;
  tags: string[];
  collectedAt: string;
  interested: boolean;
};

export function useContestsData(enabled: boolean) {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [onlyInterested, setOnlyInterested] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/mobion/contests")
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => {
        setContests(data.contests ?? []);
        setLoadError(null);
      })
      .catch(() => setLoadError("대회 목록을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!enabled) return;
    load();
  }, [enabled]);

  /**
   * Flips interest and reflects it locally straight away.
   *
   * Refetching the whole list for one toggle would make the row wait on a round
   * trip. On failure the flag is put back, so the UI never keeps claiming
   * something the server did not accept.
   */
  async function toggleInterest(contest: Contest) {
    const next = !contest.interested;
    setPendingId(contest.id);
    setContests((prev) => prev.map((c) => (c.id === contest.id ? { ...c, interested: next } : c)));
    try {
      const res = await fetch(`/api/mobion/contests/${contest.id}/interest`, {
        method: next ? "PUT" : "DELETE",
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setContests((prev) =>
        prev.map((c) => (c.id === contest.id ? { ...c, interested: !next } : c)),
      );
      setLoadError("관심 표시를 저장하지 못했습니다.");
    } finally {
      setPendingId(null);
    }
  }

  const term = search.trim().toLowerCase();
  const visible = contests.filter(
    (c) =>
      (!onlyInterested || c.interested) &&
      (!term ||
        c.title.toLowerCase().includes(term) ||
        c.organizer.toLowerCase().includes(term) ||
        c.tags.some((t) => t.toLowerCase().includes(term))),
  );

  const interestedCount = contests.filter((c) => c.interested).length;
  // Contests have no status of their own, so they are judged as unfinished work
  const closingSoon = contests.filter((c) => dueState(c.deadline, "todo") !== null).length;

  return {
    contests,
    visible,
    loadError,
    loading,
    onlyInterested,
    setOnlyInterested,
    search,
    setSearch,
    toggleInterest,
    pendingId,
    interestedCount,
    closingSoon,
    isEmpty: contests.length === 0,
    reload: load,
  };
}

export type ContestsData = ReturnType<typeof useContestsData>;
