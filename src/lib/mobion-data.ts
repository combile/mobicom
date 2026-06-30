import { query } from "./mobion-db";

export type MobionTask = {
  id: string;
  code: string;
  title: string;
  status: "now" | "next" | "review" | "done";
  owner: string;
  progress: number;
  project: string;
  priority: "low" | "medium" | "high";
  due_date: string | null;
  notes: string;
  updated_at: string;
};

export type MobionDoc = {
  id: string;
  title: string;
  body: string;
  project: string;
  kind: "note" | "spec" | "meeting" | "retro";
  pinned: boolean;
  updated_at: string;
};

export type MobionMessage = {
  id: string;
  author: string;
  body: string;
  created_at: string;
};

export type MobionLink = {
  id: string;
  title: string;
  url: string;
  project: string;
  kind: string;
  created_at: string;
};

export type MobionMilestone = {
  id: string;
  title: string;
  project: string;
  target_date: string | null;
  status: "planned" | "active" | "done";
  summary: string;
  updated_at: string;
};

export async function getWorkspace(userId: string) {
  const [tasks, docs, messages, links, milestones] = await Promise.all([
    query<MobionTask>(
      `SELECT id, code, title, status, owner, progress, project, priority,
              due_date::text AS due_date, notes, updated_at
       FROM mobion_tasks
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId],
    ),
    query<MobionDoc>(
      `SELECT id, title, body, project, kind, pinned, updated_at
       FROM mobion_docs
       WHERE user_id = $1
       ORDER BY pinned DESC, updated_at DESC`,
      [userId],
    ),
    query<MobionMessage>(
      `SELECT id, author, body, created_at
       FROM mobion_messages
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId],
    ),
    query<MobionLink>(
      `SELECT id, title, url, project, kind, created_at
       FROM mobion_links
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    ),
    query<MobionMilestone>(
      `SELECT id, title, project, target_date::text AS target_date,
              status, summary, updated_at
       FROM mobion_milestones
       WHERE user_id = $1
       ORDER BY target_date NULLS LAST, updated_at DESC`,
      [userId],
    ),
  ]);

  return {
    tasks: tasks.rows,
    docs: docs.rows,
    messages: messages.rows.reverse(),
    links: links.rows,
    milestones: milestones.rows,
  };
}

export async function seedWorkspace(userId: string, name: string) {
  const existing = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM mobion_tasks WHERE user_id = $1`,
    [userId],
  );
  if (Number(existing.rows[0]?.count ?? 0) > 0) return;

  await query(
    `INSERT INTO mobion_tasks
       (user_id, code, title, status, owner, progress, project, priority, due_date, notes)
     VALUES
       ($1, 'CAP-01', '팀플 요구사항 정리', 'now', $2, 68, 'Team Project', 'high', current_date + 2, '역할, 산출물, 발표 기준을 먼저 고정합니다.'),
       ($1, 'LAB-02', '실험 로그 정리', 'review', $2, 92, 'Research', 'medium', current_date + 5, '측정값과 스크린샷을 문서에 연결합니다.'),
       ($1, 'SIDE-03', '개인 프로젝트 MVP 범위 확정', 'next', $2, 34, 'Personal', 'medium', current_date + 7, '기능 3개 이하로 좁히고 링크를 모읍니다.')`,
    [userId, name.slice(0, 2).toUpperCase()],
  );
  await query(
    `INSERT INTO mobion_docs (user_id, title, body, project, kind, pinned)
     VALUES
       ($1, 'Team Project Brief', '목표, 역할, 일정, 제출물을 한 페이지에 정리합니다.', 'Team Project', 'spec', true),
       ($1, 'Meeting Notes', '회의 결정사항과 다음 액션을 기록합니다.', 'General', 'meeting', false)`,
    [userId],
  );
  await query(
    `INSERT INTO mobion_links (user_id, title, url, project, kind)
     VALUES
       ($1, 'Mobi:ON workspace guide', 'https://huly.io', 'General', 'reference'),
       ($1, 'Shared drive', 'https://drive.google.com', 'Team Project', 'asset')`,
    [userId],
  );
  await query(
    `INSERT INTO mobion_milestones
       (user_id, title, project, target_date, status, summary)
     VALUES
       ($1, '요구사항 확정', 'Team Project', current_date + 3, 'active', '역할과 제출 기준을 확정합니다.'),
       ($1, 'MVP 시연', 'Personal', current_date + 14, 'planned', '핵심 기능만 묶어 첫 시연을 준비합니다.')`,
    [userId],
  );
  await query(
    `INSERT INTO mobion_messages (user_id, author, body)
     VALUES ($1, $2, 'Mobi:ON workspace가 준비되었습니다.')`,
    [userId, name],
  );
}
