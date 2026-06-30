import { query } from "./mobion-db";

export type MobionTask = {
  id: string;
  code: string;
  title: string;
  status: "now" | "next" | "review" | "done";
  owner: string;
  progress: number;
  updated_at: string;
};

export type MobionDoc = {
  id: string;
  title: string;
  body: string;
  updated_at: string;
};

export type MobionMessage = {
  id: string;
  author: string;
  body: string;
  created_at: string;
};

export async function getWorkspace(userId: string) {
  const [tasks, docs, messages] = await Promise.all([
    query<MobionTask>(
      `SELECT id, code, title, status, owner, progress, updated_at
       FROM mobion_tasks
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    ),
    query<MobionDoc>(
      `SELECT id, title, body, updated_at
       FROM mobion_docs
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
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
  ]);

  return {
    tasks: tasks.rows,
    docs: docs.rows,
    messages: messages.rows.reverse(),
  };
}

export async function seedWorkspace(userId: string, name: string) {
  const existing = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM mobion_tasks WHERE user_id = $1`,
    [userId],
  );
  if (Number(existing.rows[0]?.count ?? 0) > 0) return;

  await query(
    `INSERT INTO mobion_tasks (user_id, code, title, status, owner, progress)
     VALUES
       ($1, 'MAC-24', '5G scheduler latency experiment', 'now', $2, 74),
       ($1, 'RFID-11', 'Collision avoidance simulator sweep', 'review', $2, 92),
       ($1, 'APP-08', 'Bluetooth sensing prototype', 'next', $2, 41)`,
    [userId, name.slice(0, 2).toUpperCase()],
  );
  await query(
    `INSERT INTO mobion_docs (user_id, title, body)
     VALUES
       ($1, 'Experiment protocol / 5G MAC', '실험 조건, 측정 지표, 반복 횟수를 정리합니다.'),
       ($1, 'RFID collision notes', '충돌 회피 시뮬레이터 관찰 내용을 기록합니다.')`,
    [userId],
  );
  await query(
    `INSERT INTO mobion_messages (user_id, author, body)
     VALUES ($1, $2, 'Mobi:ON workspace가 준비되었습니다.')`,
    [userId, name],
  );
}
