"use client";

import { useEffect, useState } from "react";
import { dueState, todayISO } from "./use-tasks-data";

export type HomeTask = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  projectId: string;
  projectName: string;
};

export type HomeReply = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string | null;
  taskId: string;
  taskTitle: string;
  projectId: string;
};

export type HomeContest = {
  id: string;
  title: string;
  deadline: string;
  url: string;
};

export function useHomeData(enabled: boolean) {
  const [userName, setUserName] = useState("");
  const [myTasks, setMyTasks] = useState<HomeTask[]>([]);
  const [replies, setReplies] = useState<HomeReply[]>([]);
  const [contests, setContests] = useState<HomeContest[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    fetch("/api/mobion/home")
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => {
        setUserName(data.userName ?? "");
        setMyTasks(data.myTasks ?? []);
        setReplies(data.replies ?? []);
        setContests(data.contests ?? []);
        setLoadError(null);
      })
      .catch(() => setLoadError("홈 정보를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [enabled]);

  const today = todayISO();

  /**
   * Three buckets in the order they demand attention: already late, due today,
   * and the rest. Undated work lands in the last one rather than being hidden
   * — it is still assigned, just not scheduled.
   */
  const overdue = myTasks.filter((t) => t.dueDate && t.dueDate < today);
  const dueToday = myTasks.filter((t) => t.dueDate === today);
  const rest = myTasks.filter((t) => !t.dueDate || t.dueDate > today);

  const soonCount = myTasks.filter((t) => dueState(t.dueDate, t.status) === "soon").length;

  return {
    userName,
    myTasks,
    overdue,
    dueToday,
    rest,
    soonCount,
    replies,
    contests,
    loadError,
    loading,
    isClear: myTasks.length === 0 && replies.length === 0,
  };
}

export type HomeData = ReturnType<typeof useHomeData>;
