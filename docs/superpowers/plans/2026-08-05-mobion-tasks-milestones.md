# Mobi:ON Task & Milestone Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let logged-in Mobi:ON users create projects, track milestones within them, and manage tasks (with assignee/status/due date) — a native Postgres feature, independent of Huly, filling the task/milestone gap flagged earlier in this project's life.

**Architecture:** Three new tables (`mobion_projects`, `mobion_milestones`, `mobion_tasks`) behind plain REST-style Next.js API routes, following the exact conventions already established by the chat/channel/profile features (`requireCurrentUser()` first, `mobionApiError` catch-all, Korean error messages, `query()` for all Postgres access). No SSE, no Huly involvement — this feature never touches `mobion-huly.ts`. A new `/tasks` page hosts a `TasksContent.tsx` client component with a project picker, milestone list, and filterable task list with inline status updates.

**Tech Stack:** Next.js API routes, Postgres via the existing `query()` helper, plain Emotion `styled` components (new file, its own local styled components — this codebase does not share styled components across files). No new npm dependencies.

## Global Constraints

- No new npm dependencies for this plan.
- Follow the existing pattern exactly: `requireCurrentUser()` first in every route, `mobionApiError(error, fallback)` for the catch-all, `query()` from `mobion-db.ts` for all Postgres access.
- Every new failure mode (empty name/title, 404 for a missing project/milestone/task) surfaces a Korean message inline — never a silent failure or raw English/technical string. Network-level failures get the generic `"요청에 실패했습니다. 다시 시도해 주세요."` fallback, matching every other feature.
- No test runner is configured in this repo — verification is `npx tsc --noEmit -p tsconfig.json` plus manual curl/psql/browser checks, consistent with every prior plan in this project.
- This feature is entirely independent of Huly — no task in this plan touches `mobion-huly.ts`, the chunter classes, or the SSE chat stream.
- `status` columns use a fixed `CHECK` constraint (three values each), not a separate configurable-status table — this is a deliberate scope decision (see the design spec's "native Postgres, not Huly Tracker" section) and must not be expanded without a new spec.

---

### Task 1: Schema v9 — `mobion_projects`, `mobion_milestones`, `mobion_tasks`

**Files:**
- Modify: `src/lib/mobion-db.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `mobion_projects(id, name, description, created_by, created_at)`, `mobion_milestones(id, project_id, title, target_date, status, created_at)`, `mobion_tasks(id, project_id, milestone_id, title, description, assignee_id, status, due_date, created_by, created_at)` — usable by every later task via plain SQL.

- [ ] **Step 1: Bump the schema version and add the three tables**

In `src/lib/mobion-db.ts`, change:

```typescript
const MOBION_SCHEMA_VERSION = 8;
```

to:

```typescript
const MOBION_SCHEMA_VERSION = 9;
```

Then add this right after the existing `mobion_channel_tags` migration block (the last statement in `ensureMobionSchema`, right before the closing `})().catch(...)`):

```typescript
      // Native task/milestone tracking — deliberately NOT built on Huly's Tracker
      // plugin (tracker:class:Project/Issue/Milestone). That plugin's Issue.status
      // is a per-project dynamically-created IssueStatus class (not a fixed enum),
      // plus priority/time-tracking/sub-issue fields this lab doesn't need. See
      // docs/superpowers/specs/2026-08-05-mobion-tasks-milestones-design.md's
      // "Architecture Decision" section. These table names reuse ones an earlier,
      // unrelated Phase 0 iteration used and already dropped above (see the
      // "One-time Phase 0 migration cleanup" block) — safe, since Postgres has no
      // memory of a dropped table's old shape.
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_projects (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          created_by UUID NOT NULL REFERENCES mobion_users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_milestones (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id UUID NOT NULL REFERENCES mobion_projects(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          target_date DATE,
          status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'done')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_tasks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id UUID NOT NULL REFERENCES mobion_projects(id) ON DELETE CASCADE,
          milestone_id UUID REFERENCES mobion_milestones(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          assignee_id UUID REFERENCES mobion_users(id) ON DELETE SET NULL,
          status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
          due_date DATE,
          created_by UUID NOT NULL REFERENCES mobion_users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 3: Verify against the live database**

With the local dev server running, hit any existing Mobi:ON endpoint once (e.g. `curl -s http://localhost:3000/api/mobion/auth/me`) to trigger `ensureMobionSchema()`, then confirm all three tables exist:

```bash
psql "$DATABASE_URL" -c "\d mobion_projects"
psql "$DATABASE_URL" -c "\d mobion_milestones"
psql "$DATABASE_URL" -c "\d mobion_tasks"
```

Expected: each shows the columns above with correct types, foreign keys, and (for milestones/tasks) the `status` `CHECK` constraint.

- [ ] **Step 4: Commit**

```bash
git add src/lib/mobion-db.ts
git commit -m "feat: add mobion_projects/milestones/tasks tables (schema v9)"
```

---

### Task 2: Projects API — list and create

**Files:**
- Create: `src/app/api/mobion/projects/route.ts`

**Interfaces:**
- Consumes: `mobion_projects` (Task 1), `requireCurrentUser`, `mobionApiError`, `query`.
- Produces: `GET /api/mobion/projects` → `200 {projects: [{id, name, description, createdByName, createdAt}]}`. `POST /api/mobion/projects` body `{name, description}` → `200 {project: {id, name, description}}` on success, `400` for empty name.

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/mobion/projects/route.ts
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type ProjectRow = {
  id: string;
  name: string;
  description: string;
  created_by_name: string;
  created_at: string;
};

export async function GET() {
  try {
    await requireCurrentUser();
    const result = await query<ProjectRow>(
      `SELECT p.id, p.name, p.description, u.name AS created_by_name, p.created_at
       FROM mobion_projects p
       JOIN mobion_users u ON u.id = p.created_by
       ORDER BY p.created_at ASC`,
    );
    return NextResponse.json({
      projects: result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        createdByName: r.created_by_name,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    return mobionApiError(error, "프로젝트 목록을 불러오지 못했습니다.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const name = String(body.name ?? "").trim().slice(0, 100);
    const description = String(body.description ?? "").trim().slice(0, 500);

    if (!name) {
      return NextResponse.json({ error: "프로젝트 이름을 입력해 주세요." }, { status: 400 });
    }

    const result = await query<{ id: string; name: string; description: string }>(
      `INSERT INTO mobion_projects (name, description, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, name, description`,
      [name, description, user.id],
    );

    return NextResponse.json({ project: result.rows[0] });
  } catch (error) {
    return mobionApiError(error, "프로젝트 생성 실패");
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 3: Verify against the live server**

With the local dev server running and logged in as a seeded test account:

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/mobion/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"verify-project","description":"검증용 프로젝트"}'
```

Expected: `{"project":{"id":"...", "name":"verify-project", "description":"검증용 프로젝트"}}`.

```bash
curl -s -b cookies.txt http://localhost:3000/api/mobion/projects
```

Expected: a `projects` array containing `verify-project` with `createdByName` resolved to the logged-in test account's name.

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/mobion/projects \
  -H "Content-Type: application/json" -d '{"name":"","description":""}'
```

Expected: `400` with `{"error":"프로젝트 이름을 입력해 주세요."}`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/mobion/projects/route.ts
git commit -m "feat: add project list/create API"
```

---

### Task 3: Project detail API — milestones + tasks joined

**Files:**
- Create: `src/app/api/mobion/projects/[id]/route.ts`

**Interfaces:**
- Consumes: `mobion_projects`, `mobion_milestones`, `mobion_tasks` (Task 1).
- Produces: `GET /api/mobion/projects/[id]` → `200 {project: {id, name, description}, milestones: [{id, title, targetDate, status}], tasks: [{id, title, description, status, dueDate, milestoneId, assigneeId, assigneeName}]}`, `404` if the project doesn't exist.

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/mobion/projects/[id]/route.ts
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type MilestoneRow = { id: string; title: string; target_date: string | null; status: string };
type TaskRow = {
  id: string;
  title: string;
  description: string;
  status: string;
  due_date: string | null;
  milestone_id: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireCurrentUser();
    const { id } = await params;

    const projectResult = await query<{ id: string; name: string; description: string }>(
      `SELECT id, name, description FROM mobion_projects WHERE id = $1`,
      [id],
    );
    const project = projectResult.rows[0];
    if (!project) {
      return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    }

    const milestonesResult = await query<MilestoneRow>(
      `SELECT id, title, target_date, status FROM mobion_milestones
       WHERE project_id = $1 ORDER BY created_at ASC`,
      [id],
    );

    const tasksResult = await query<TaskRow>(
      `SELECT t.id, t.title, t.description, t.status, t.due_date,
              t.milestone_id, t.assignee_id, u.name AS assignee_name
       FROM mobion_tasks t
       LEFT JOIN mobion_users u ON u.id = t.assignee_id
       WHERE t.project_id = $1 ORDER BY t.created_at ASC`,
      [id],
    );

    return NextResponse.json({
      project,
      milestones: milestonesResult.rows.map((m) => ({
        id: m.id,
        title: m.title,
        targetDate: m.target_date,
        status: m.status,
      })),
      tasks: tasksResult.rows.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        dueDate: t.due_date,
        milestoneId: t.milestone_id,
        assigneeId: t.assignee_id,
        assigneeName: t.assignee_name,
      })),
    });
  } catch (error) {
    return mobionApiError(error, "프로젝트 정보를 불러오지 못했습니다.");
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 3: Verify against the live server**

Using the `verify-project` id returned by Task 2's verification:

```bash
curl -s -b cookies.txt http://localhost:3000/api/mobion/projects/<verify-project-id>
```

Expected: `{"project":{...}, "milestones":[], "tasks":[]}` (empty arrays, since none created yet).

```bash
curl -s -b cookies.txt http://localhost:3000/api/mobion/projects/00000000-0000-0000-0000-000000000000
```

Expected: `404` with `{"error":"프로젝트를 찾을 수 없습니다."}`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/mobion/projects/[id]/route.ts
git commit -m "feat: add project detail API with joined milestones and tasks"
```

---

### Task 4: Milestones API — create and update

**Files:**
- Create: `src/app/api/mobion/projects/[id]/milestones/route.ts`
- Create: `src/app/api/mobion/milestones/[id]/route.ts`

**Interfaces:**
- Consumes: `mobion_milestones` (Task 1).
- Produces: `POST /api/mobion/projects/[id]/milestones` body `{title, targetDate}` → `200 {milestone: {id, title, targetDate, status}}`, `400` for empty title. `PATCH /api/mobion/milestones/[id]` body `{title?, targetDate?, status?}` → `200 {milestone: {...}}`, `404` if not found, `400` for an invalid `status` value.

- [ ] **Step 1: Write the create route**

```typescript
// src/app/api/mobion/projects/[id]/milestones/route.ts
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireCurrentUser();
    const { id: projectId } = await params;
    const body = await request.json();
    const title = String(body.title ?? "").trim().slice(0, 150);
    const targetDate = body.targetDate ? String(body.targetDate) : null;

    if (!title) {
      return NextResponse.json({ error: "마일스톤 제목을 입력해 주세요." }, { status: 400 });
    }

    const result = await query<{ id: string; title: string; target_date: string | null; status: string }>(
      `INSERT INTO mobion_milestones (project_id, title, target_date)
       VALUES ($1, $2, $3)
       RETURNING id, title, target_date, status`,
      [projectId, title, targetDate],
    );

    const m = result.rows[0];
    return NextResponse.json({
      milestone: { id: m.id, title: m.title, targetDate: m.target_date, status: m.status },
    });
  } catch (error) {
    return mobionApiError(error, "마일스톤 생성 실패");
  }
}
```

- [ ] **Step 2: Write the update route**

```typescript
// src/app/api/mobion/milestones/[id]/route.ts
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

const VALID_STATUSES = ["planned", "in_progress", "done"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireCurrentUser();
    const { id } = await params;
    const body = await request.json();

    if (body.status !== undefined && !VALID_STATUSES.includes(String(body.status))) {
      return NextResponse.json({ error: "올바르지 않은 상태 값입니다." }, { status: 400 });
    }

    const title = body.title !== undefined ? String(body.title).trim().slice(0, 150) : undefined;
    if (title !== undefined && !title) {
      return NextResponse.json({ error: "마일스톤 제목을 입력해 주세요." }, { status: 400 });
    }

    const result = await query<{ id: string; title: string; target_date: string | null; status: string }>(
      `UPDATE mobion_milestones SET
         title = COALESCE($2, title),
         target_date = COALESCE($3, target_date),
         status = COALESCE($4, status)
       WHERE id = $1
       RETURNING id, title, target_date, status`,
      [id, title ?? null, body.targetDate ?? null, body.status ?? null],
    );

    const m = result.rows[0];
    if (!m) {
      return NextResponse.json({ error: "마일스톤을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({
      milestone: { id: m.id, title: m.title, targetDate: m.target_date, status: m.status },
    });
  } catch (error) {
    return mobionApiError(error, "마일스톤 수정 실패");
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 4: Verify against the live server**

Using the `verify-project` id:

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/mobion/projects/<verify-project-id>/milestones \
  -H "Content-Type: application/json" -d '{"title":"verify-milestone","targetDate":"2026-12-31"}'
```

Expected: `{"milestone":{"id":"...", "title":"verify-milestone", "targetDate":"2026-12-31", "status":"planned"}}`. Save the returned `id` as `<milestone-id>`.

```bash
curl -s -b cookies.txt -X PATCH http://localhost:3000/api/mobion/milestones/<milestone-id> \
  -H "Content-Type: application/json" -d '{"status":"in_progress"}'
```

Expected: `{"milestone":{..., "status":"in_progress"}}`.

```bash
curl -s -b cookies.txt -X PATCH http://localhost:3000/api/mobion/milestones/<milestone-id> \
  -H "Content-Type: application/json" -d '{"status":"not-a-real-status"}'
```

Expected: `400` with `{"error":"올바르지 않은 상태 값입니다."}`.

```bash
curl -s -b cookies.txt -X PATCH http://localhost:3000/api/mobion/milestones/00000000-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" -d '{"status":"done"}'
```

Expected: `404` with `{"error":"마일스톤을 찾을 수 없습니다."}`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mobion/projects/[id]/milestones/route.ts src/app/api/mobion/milestones/[id]/route.ts
git commit -m "feat: add milestone create/update API"
```

---

### Task 5: Tasks API — create and update

**Files:**
- Create: `src/app/api/mobion/projects/[id]/tasks/route.ts`
- Create: `src/app/api/mobion/tasks/[id]/route.ts`

**Interfaces:**
- Consumes: `mobion_tasks` (Task 1).
- Produces: `POST /api/mobion/projects/[id]/tasks` body `{title, description, assigneeId, milestoneId, dueDate}` → `200 {task: {id, title, description, status, dueDate, milestoneId, assigneeId}}`, `400` for empty title. `PATCH /api/mobion/tasks/[id]` body `{title?, description?, status?, assigneeId?, milestoneId?, dueDate?}` → `200 {task: {...}}`, `404` if not found, `400` for an invalid `status` value.

- [ ] **Step 1: Write the create route**

```typescript
// src/app/api/mobion/projects/[id]/tasks/route.ts
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { id: projectId } = await params;
    const body = await request.json();
    const title = String(body.title ?? "").trim().slice(0, 150);
    const description = String(body.description ?? "").trim().slice(0, 1000);
    const assigneeId = body.assigneeId ? String(body.assigneeId) : null;
    const milestoneId = body.milestoneId ? String(body.milestoneId) : null;
    const dueDate = body.dueDate ? String(body.dueDate) : null;

    if (!title) {
      return NextResponse.json({ error: "태스크 제목을 입력해 주세요." }, { status: 400 });
    }

    const result = await query<{
      id: string;
      title: string;
      description: string;
      status: string;
      due_date: string | null;
      milestone_id: string | null;
      assignee_id: string | null;
    }>(
      `INSERT INTO mobion_tasks
         (project_id, milestone_id, title, description, assignee_id, due_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, title, description, status, due_date, milestone_id, assignee_id`,
      [projectId, milestoneId, title, description, assigneeId, dueDate, user.id],
    );

    const t = result.rows[0];
    return NextResponse.json({
      task: {
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        dueDate: t.due_date,
        milestoneId: t.milestone_id,
        assigneeId: t.assignee_id,
      },
    });
  } catch (error) {
    return mobionApiError(error, "태스크 생성 실패");
  }
}
```

- [ ] **Step 2: Write the update route**

```typescript
// src/app/api/mobion/tasks/[id]/route.ts
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

const VALID_STATUSES = ["todo", "in_progress", "done"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireCurrentUser();
    const { id } = await params;
    const body = await request.json();

    if (body.status !== undefined && !VALID_STATUSES.includes(String(body.status))) {
      return NextResponse.json({ error: "올바르지 않은 상태 값입니다." }, { status: 400 });
    }

    const title = body.title !== undefined ? String(body.title).trim().slice(0, 150) : undefined;
    if (title !== undefined && !title) {
      return NextResponse.json({ error: "태스크 제목을 입력해 주세요." }, { status: 400 });
    }
    const description =
      body.description !== undefined ? String(body.description).trim().slice(0, 1000) : undefined;
    const assigneeId = body.assigneeId !== undefined ? String(body.assigneeId) || null : undefined;
    const milestoneId = body.milestoneId !== undefined ? String(body.milestoneId) || null : undefined;
    const dueDate = body.dueDate !== undefined ? String(body.dueDate) || null : undefined;

    const result = await query<{
      id: string;
      title: string;
      description: string;
      status: string;
      due_date: string | null;
      milestone_id: string | null;
      assignee_id: string | null;
    }>(
      `UPDATE mobion_tasks SET
         title = COALESCE($2, title),
         description = COALESCE($3, description),
         status = COALESCE($4, status),
         assignee_id = CASE WHEN $5::boolean THEN $6::uuid ELSE assignee_id END,
         milestone_id = CASE WHEN $7::boolean THEN $8::uuid ELSE milestone_id END,
         due_date = CASE WHEN $9::boolean THEN $10::date ELSE due_date END
       WHERE id = $1
       RETURNING id, title, description, status, due_date, milestone_id, assignee_id`,
      [
        id,
        title ?? null,
        description ?? null,
        body.status ?? null,
        assigneeId !== undefined,
        assigneeId ?? null,
        milestoneId !== undefined,
        milestoneId ?? null,
        dueDate !== undefined,
        dueDate ?? null,
      ],
    );

    const t = result.rows[0];
    if (!t) {
      return NextResponse.json({ error: "태스크를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({
      task: {
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        dueDate: t.due_date,
        milestoneId: t.milestone_id,
        assigneeId: t.assignee_id,
      },
    });
  } catch (error) {
    return mobionApiError(error, "태스크 수정 실패");
  }
}
```

Note on the `CASE WHEN $N::boolean THEN ... ELSE column END` pattern: unlike `title`/`description`/`status` (where `COALESCE` correctly treats "not provided" as "keep existing" since `undefined` is passed through as SQL `NULL`), `assigneeId`/`milestoneId`/`dueDate` must support being explicitly cleared (set to `NULL`, e.g. un-assigning a task) — a plain `COALESCE($n, column)` could never distinguish "clear this field" from "don't touch this field," since both would arrive as SQL `NULL`. The boolean flag makes that distinction explicit.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 4: Verify against the live server**

Using the `verify-project` id and `<milestone-id>` from earlier tasks:

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/mobion/projects/<verify-project-id>/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"verify-task","description":"검증용 태스크","milestoneId":"<milestone-id>"}'
```

Expected: `{"task":{"id":"...", "title":"verify-task", ..., "status":"todo", "milestoneId":"<milestone-id>", "assigneeId":null}}`. Save the returned `id` as `<task-id>`.

```bash
curl -s -b cookies.txt -X PATCH http://localhost:3000/api/mobion/tasks/<task-id> \
  -H "Content-Type: application/json" -d '{"status":"in_progress"}'
```

Expected: `{"task":{..., "status":"in_progress"}}`.

```bash
curl -s -b cookies.txt -X PATCH http://localhost:3000/api/mobion/tasks/<task-id> \
  -H "Content-Type: application/json" -d '{"assigneeId":null}'
```

Expected: `{"task":{..., "assigneeId":null}}` — confirms the explicit-clear path works (task had no assignee to begin with, but this proves the boolean-flag mechanism doesn't error; re-run after first setting an assignee via a real user id from `mobion_users` if you want to see a non-null-to-null transition).

```bash
curl -s -b cookies.txt -X PATCH http://localhost:3000/api/mobion/tasks/<task-id> \
  -H "Content-Type: application/json" -d '{"status":"bogus"}'
```

Expected: `400` with `{"error":"올바르지 않은 상태 값입니다."}`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mobion/projects/[id]/tasks/route.ts src/app/api/mobion/tasks/[id]/route.ts
git commit -m "feat: add task create/update API"
```

---

### Task 6: `/tasks` page + project picker

**Files:**
- Create: `src/app/tasks/page.tsx`
- Create: `src/components/TasksContent.tsx`

**Interfaces:**
- Consumes: `GET /api/mobion/projects`, `POST /api/mobion/projects` (Task 2).
- Produces: a `TasksContent` component rendering a project list + creation modal; later tasks in this plan (7, 8) add milestone/task rendering into the same component's detail-view region. `selectedProjectId` state (and its setter) must exist under this exact name for Tasks 7/8 to hook into.

- [ ] **Step 1: Write the page**

```typescript
// src/app/tasks/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/mobion-auth";
import TasksContent from "@/components/TasksContent";
import styles from "../page.module.css";

export const metadata = {
  title: "태스크 — MOBICOM",
  description: "Mobi:ON 프로젝트 및 태스크 관리",
};

export default async function TasksPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden />
      <TasksContent />
    </main>
  );
}
```

- [ ] **Step 2: Write the component's project-picker shell**

```typescript
// src/components/TasksContent.tsx
"use client";

import { useEffect, useState } from "react";
import styled from "@emotion/styled";

type Project = {
  id: string;
  name: string;
  description: string;
  createdByName: string;
  createdAt: string;
};

export default function TasksContent() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [createProjectError, setCreateProjectError] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);

  function loadProjects() {
    fetch("/api/mobion/projects")
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => {
        setProjects(data.projects ?? []);
        setLoadError(null);
      })
      .catch(() => setLoadError("프로젝트 목록을 불러오지 못했습니다."));
  }

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  function openCreateProject() {
    setCreateProjectError(null);
    setNewProjectName("");
    setNewProjectDescription("");
    setShowCreateProject(true);
  }

  async function handleCreateProject() {
    setCreateProjectError(null);
    setCreatingProject(true);
    try {
      const res = await fetch("/api/mobion/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName, description: newProjectDescription }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateProjectError(data.error ?? "요청에 실패했습니다. 다시 시도해 주세요.");
        return;
      }
      const data = await res.json();
      setShowCreateProject(false);
      loadProjects();
      setSelectedProjectId(data.project.id);
    } catch {
      setCreateProjectError("요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setCreatingProject(false);
    }
  }

  if (loadError) {
    return (
      <Root>
        <ErrorBanner>{loadError}</ErrorBanner>
      </Root>
    );
  }

  return (
    <Root>
      <Layout>
        <Sidebar>
          <SectionTitle>프로젝트</SectionTitle>
          {projects.map((p) => (
            <ProjectItem
              key={p.id}
              data-active={p.id === selectedProjectId || undefined}
              onClick={() => setSelectedProjectId(p.id)}
            >
              {p.name}
            </ProjectItem>
          ))}
          <AddButton type="button" onClick={openCreateProject}>
            + 프로젝트 추가
          </AddButton>
        </Sidebar>
        <Main>
          {!selectedProjectId && <EmptyState>프로젝트를 선택하거나 새로 만들어 보세요</EmptyState>}
          {/* Task 7/8 render milestone + task detail here, keyed on selectedProjectId */}
        </Main>
      </Layout>
      {showCreateProject && (
        <ModalOverlay onClick={() => setShowCreateProject(false)}>
          <ModalCard onClick={(e) => e.stopPropagation()}>
            <ModalTitle>새 프로젝트 만들기</ModalTitle>
            <Field>
              <label htmlFor="new-project-name">프로젝트 이름</label>
              <input
                id="new-project-name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
            </Field>
            <Field>
              <label htmlFor="new-project-description">설명</label>
              <input
                id="new-project-description"
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
                placeholder="프로젝트 설명 (선택)"
              />
            </Field>
            {createProjectError && <ErrorText>{createProjectError}</ErrorText>}
            <ModalActions>
              <button type="button" onClick={() => setShowCreateProject(false)}>
                취소
              </button>
              <button type="button" onClick={handleCreateProject} disabled={creatingProject}>
                {creatingProject ? "만드는 중..." : "만들기"}
              </button>
            </ModalActions>
          </ModalCard>
        </ModalOverlay>
      )}
    </Root>
  );
}

const Root = styled.div`
  position: relative;
  z-index: 1;
  min-height: 100vh;
  padding: clamp(135px, 14.4vh, 189px) 24px 24px;
`;

const ErrorBanner = styled.div`
  text-align: center;
  color: #ff6767;
  padding: 40px;
`;

const Layout = styled.div`
  display: flex;
  height: calc(100vh - clamp(159px, 17.4vh, 213px));
  max-width: 1100px;
  margin: 0 auto;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.14);
`;

const Sidebar = styled.div`
  width: 240px;
  background: rgba(37, 37, 37, 0.35);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  padding: 12px;
  overflow-y: auto;
`;

const SectionTitle = styled.div`
  color: #9a9a9a;
  font-size: 13px;
  font-weight: 700;
  padding: 4px 0 8px;
`;

const ProjectItem = styled.div`
  padding: 8px 12px;
  border-radius: 8px;
  color: #d4d4d4;
  cursor: pointer;
  font-size: 14px;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  &[data-active] {
    background: rgba(0, 181, 255, 0.15);
    color: #00b5ff;
  }
`;

const AddButton = styled.button`
  width: 100%;
  padding: 8px 12px;
  margin-top: 8px;
  border-radius: 8px;
  border: 1px dashed rgba(255, 255, 255, 0.24);
  background: transparent;
  color: #9a9a9a;
  font-size: 13px;
  cursor: pointer;
  text-align: left;

  &:hover {
    color: #00b5ff;
    border-color: #00b5ff;
  }
`;

const Main = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  background: rgba(37, 37, 37, 0.35);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  overflow-y: auto;
  padding: 20px;
`;

const EmptyState = styled.div`
  margin: auto;
  color: #9a9a9a;
  font-size: 14px;
`;

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
`;

const ModalCard = styled.div`
  width: min(360px, calc(100% - 48px));
  max-height: 80vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 28px;
  border-radius: 16px;
  background: rgba(37, 37, 37, 0.95);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.14);
`;

const ModalTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  color: #fff;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: 13px;
    color: #9a9a9a;
  }

  input {
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(0, 0, 0, 0.25);
    color: #fff;
    font-size: 14px;
    outline: none;
  }
`;

const ErrorText = styled.p`
  color: #ff6767;
  font-size: 12px;
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;

  button {
    padding: 8px 16px;
    border-radius: 10px;
    border: none;
    font-size: 14px;
    cursor: pointer;
  }

  button:first-of-type {
    background: transparent;
    color: #9a9a9a;
  }

  button:last-of-type {
    background: #00b5ff;
    color: #061018;
    font-weight: 700;

    &:disabled {
      opacity: 0.6;
      cursor: default;
    }
  }
`;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 4: Verify in the browser**

With the local dev server running, log in, navigate to `/tasks`. Confirm the project list renders (including `verify-project` from Task 2), confirm clicking a project highlights it, confirm "+ 프로젝트 추가" opens the modal, create a new project and confirm it appears in the list and becomes selected automatically. Confirm an empty-name submission shows `"프로젝트 이름을 입력해 주세요."` inline.

- [ ] **Step 5: Commit**

```bash
git add src/app/tasks/page.tsx src/components/TasksContent.tsx
git commit -m "feat: add /tasks page with project list and creation"
```

---

### Task 7: Milestone list + creation

**Files:**
- Modify: `src/components/TasksContent.tsx`

**Interfaces:**
- Consumes: `GET /api/mobion/projects/[id]` (Task 3), `POST /api/mobion/projects/[id]/milestones`, `PATCH /api/mobion/milestones/[id]` (Task 4).
- Produces: `milestones` state array, kept in sync with `selectedProjectId` — Task 8 reads this same array for its milestone filter dropdown, so it must not be renamed.

- [ ] **Step 1: Add milestone state and the detail-fetch effect**

In `src/components/TasksContent.tsx`, add these types near the top, after the existing `Project` type:

```typescript
type Milestone = { id: string; title: string; targetDate: string | null; status: string };
```

Add this state, right after `const [creatingProject, setCreatingProject] = useState(false);`:

```typescript
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [showCreateMilestone, setShowCreateMilestone] = useState(false);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newMilestoneTargetDate, setNewMilestoneTargetDate] = useState("");
  const [createMilestoneError, setCreateMilestoneError] = useState<string | null>(null);
  const [creatingMilestone, setCreatingMilestone] = useState(false);
```

Add this function, right after `loadProjects`:

```typescript
  function loadProjectDetail(projectId: string) {
    fetch(`/api/mobion/projects/${projectId}`)
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => {
        setMilestones(data.milestones ?? []);
        setDetailError(null);
      })
      .catch(() => setDetailError("프로젝트 정보를 불러오지 못했습니다."));
  }
```

Add this effect right after the existing `useEffect` that auto-selects the first project:

```typescript
  useEffect(() => {
    if (selectedProjectId) loadProjectDetail(selectedProjectId);
  }, [selectedProjectId]);
```

- [ ] **Step 2: Add milestone creation and status-update handlers**

Add these functions, right after `handleCreateProject`:

```typescript
  function openCreateMilestone() {
    setCreateMilestoneError(null);
    setNewMilestoneTitle("");
    setNewMilestoneTargetDate("");
    setShowCreateMilestone(true);
  }

  async function handleCreateMilestone() {
    if (!selectedProjectId) return;
    setCreateMilestoneError(null);
    setCreatingMilestone(true);
    try {
      const res = await fetch(`/api/mobion/projects/${selectedProjectId}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newMilestoneTitle,
          targetDate: newMilestoneTargetDate || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateMilestoneError(data.error ?? "요청에 실패했습니다. 다시 시도해 주세요.");
        return;
      }
      setShowCreateMilestone(false);
      loadProjectDetail(selectedProjectId);
    } catch {
      setCreateMilestoneError("요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setCreatingMilestone(false);
    }
  }

  async function updateMilestoneStatus(milestoneId: string, status: string) {
    if (!selectedProjectId) return;
    await fetch(`/api/mobion/milestones/${milestoneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadProjectDetail(selectedProjectId);
  }
```

- [ ] **Step 3: Render the milestone list and creation modal**

Find:

```typescript
        <Main>
          {!selectedProjectId && <EmptyState>프로젝트를 선택하거나 새로 만들어 보세요</EmptyState>}
          {/* Task 7/8 render milestone + task detail here, keyed on selectedProjectId */}
        </Main>
```

Replace with:

```typescript
        <Main>
          {!selectedProjectId && <EmptyState>프로젝트를 선택하거나 새로 만들어 보세요</EmptyState>}
          {selectedProjectId && detailError && <ErrorText>{detailError}</ErrorText>}
          {selectedProjectId && !detailError && (
            <>
              <DetailSectionHeader>
                <DetailSectionTitle>마일스톤</DetailSectionTitle>
                <AddButton type="button" onClick={openCreateMilestone}>
                  + 마일스톤 추가
                </AddButton>
              </DetailSectionHeader>
              <MilestoneList>
                {milestones.length === 0 && <EmptyState>아직 마일스톤이 없습니다</EmptyState>}
                {milestones.map((m) => (
                  <MilestoneRow key={m.id}>
                    <MilestoneTitle>{m.title}</MilestoneTitle>
                    {m.targetDate && <MilestoneDate>{m.targetDate}</MilestoneDate>}
                    <select
                      value={m.status}
                      onChange={(e) => updateMilestoneStatus(m.id, e.target.value)}
                    >
                      <option value="planned">계획</option>
                      <option value="in_progress">진행중</option>
                      <option value="done">완료</option>
                    </select>
                  </MilestoneRow>
                ))}
              </MilestoneList>
              {/* Task 8 renders the task list here */}
            </>
          )}
        </Main>
```

- [ ] **Step 4: Add the milestone creation modal JSX**

Find the closing `)}` right after the existing create-project `ModalOverlay` block (i.e., right before the component's final closing `</Root>` — the existing project-creation modal's `</ModalOverlay>` followed by `)}`), and add this new modal block immediately after it, still inside the component's return, before the final `</Root>`:

```typescript
      {showCreateMilestone && (
        <ModalOverlay onClick={() => setShowCreateMilestone(false)}>
          <ModalCard onClick={(e) => e.stopPropagation()}>
            <ModalTitle>새 마일스톤 만들기</ModalTitle>
            <Field>
              <label htmlFor="new-milestone-title">제목</label>
              <input
                id="new-milestone-title"
                value={newMilestoneTitle}
                onChange={(e) => setNewMilestoneTitle(e.target.value)}
              />
            </Field>
            <Field>
              <label htmlFor="new-milestone-date">목표 날짜</label>
              <input
                id="new-milestone-date"
                type="date"
                value={newMilestoneTargetDate}
                onChange={(e) => setNewMilestoneTargetDate(e.target.value)}
              />
            </Field>
            {createMilestoneError && <ErrorText>{createMilestoneError}</ErrorText>}
            <ModalActions>
              <button type="button" onClick={() => setShowCreateMilestone(false)}>
                취소
              </button>
              <button type="button" onClick={handleCreateMilestone} disabled={creatingMilestone}>
                {creatingMilestone ? "만드는 중..." : "만들기"}
              </button>
            </ModalActions>
          </ModalCard>
        </ModalOverlay>
      )}
```

- [ ] **Step 5: Add the new styled components**

Add these after the existing `EmptyState` styled component:

```typescript
const DetailSectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
`;

const DetailSectionTitle = styled.h2`
  font-size: 16px;
  font-weight: 700;
  color: #fff;
`;

const MilestoneList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 24px;
`;

const MilestoneRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);

  select {
    margin-left: auto;
    background: rgba(0, 0, 0, 0.25);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 12px;
  }
`;

const MilestoneTitle = styled.span`
  color: #d4d4d4;
  font-size: 14px;
`;

const MilestoneDate = styled.span`
  color: #767676;
  font-size: 12px;
`;
```

Note: `AddButton`'s existing styling (`width: 100%`, dashed border, `margin-top: 8px`) is reused as-is for "+ 마일스톤 추가" here even though it was originally styled for the sidebar's full-width context — accept the visual mismatch (it'll render as a full-width dashed button inline in the detail header) for this task rather than forking a second button style; revisit only if it looks wrong in Step 6's browser check.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 7: Verify in the browser**

With the local dev server running, navigate to `/tasks`, select `verify-project`. Confirm "아직 마일스톤이 없습니다" shows initially (or the milestone from earlier API verification, if that project still has it). Click "+ 마일스톤 추가", create one with a target date, confirm it appears in the list with the date shown. Change its status via the dropdown and confirm it persists after a page reload (re-fetch via `loadProjectDetail`). If the `AddButton` styling looks visually wrong inline (per Step 5's note), adjust it with a small local style override rather than a new shared component.

- [ ] **Step 8: Commit**

```bash
git add src/components/TasksContent.tsx
git commit -m "feat: add milestone list, creation, and status update to /tasks"
```

---

### Task 8: Task list with filters, inline status, and creation

**Files:**
- Create: `src/app/api/mobion/users/all/route.ts`
- Modify: `src/components/TasksContent.tsx`

**Interfaces:**
- Consumes: `GET /api/mobion/projects/[id]` (Task 3, already returns `tasks`), `POST /api/mobion/projects/[id]/tasks`, `PATCH /api/mobion/tasks/[id]` (Task 5), `milestones` (Task 7, for the milestone filter dropdown).
- Produces: `GET /api/mobion/users/all` → `200 {users: [{id, name}]}`, every `mobion_users` row with no filtering. Nothing else consumed elsewhere — this is the last UI-bearing task before the nav-link task.

**Important — do not reuse the existing `GET /api/mobion/users` endpoint for this task.** That endpoint (`src/app/api/mobion/users/route.ts`, from the prior channels+avatars plan) filters to `huly_social_id IS NOT NULL AND is_professor = false` — it was built specifically for the channel member-picker, which only makes sense for Huly-linked, non-professor accounts. Task assignment has nothing to do with Huly linkage, and there is no reason to exclude the professor from being assignable to a task. Reusing that endpoint as-is would silently and incorrectly exclude both groups from the assignee picker. This task creates a separate, unfiltered endpoint instead.

- [ ] **Step 1: Add the unfiltered user-list endpoint**

```typescript
// src/app/api/mobion/users/all/route.ts
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type UserRow = { id: string; name: string };

export async function GET() {
  try {
    await requireCurrentUser();
    const result = await query<UserRow>(
      `SELECT id, name FROM mobion_users ORDER BY name`,
    );
    return NextResponse.json({ users: result.rows });
  } catch (error) {
    return mobionApiError(error, "사용자 목록 조회 실패");
  }
}
```

- [ ] **Step 2: Verify this endpoint against the live server**

With the local dev server running and logged in:

```bash
curl -s -b cookies.txt http://localhost:3000/api/mobion/users/all
```

Expected: a `users` array containing every seeded account by name, including any professor-flagged or not-yet-Huly-linked accounts — unlike `GET /api/mobion/users`, which would omit them.

- [ ] **Step 3: Add task state**

Add this type near the top, after the `Milestone` type:

```typescript
type Task = {
  id: string;
  title: string;
  description: string;
  status: string;
  dueDate: string | null;
  milestoneId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
};
```

Add this state, right after the milestone-related state block added in Task 7:

```typescript
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allUsers, setAllUsers] = useState<{ id: string; name: string }[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [milestoneFilter, setMilestoneFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState("");
  const [newTaskMilestoneId, setNewTaskMilestoneId] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [createTaskError, setCreateTaskError] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
```

- [ ] **Step 4: Extend `loadProjectDetail` to also set tasks, and fetch users once**

Find (as left by Task 7):

```typescript
  function loadProjectDetail(projectId: string) {
    fetch(`/api/mobion/projects/${projectId}`)
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => {
        setMilestones(data.milestones ?? []);
        setDetailError(null);
      })
      .catch(() => setDetailError("프로젝트 정보를 불러오지 못했습니다."));
  }
```

Replace with:

```typescript
  function loadProjectDetail(projectId: string) {
    fetch(`/api/mobion/projects/${projectId}`)
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => {
        setMilestones(data.milestones ?? []);
        setTasks(data.tasks ?? []);
        setDetailError(null);
      })
      .catch(() => setDetailError("프로젝트 정보를 불러오지 못했습니다."));
  }
```

Add this effect right after the effect that calls `loadProjectDetail` on `selectedProjectId` change:

```typescript
  useEffect(() => {
    fetch("/api/mobion/users/all")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setAllUsers(data.users ?? []))
      .catch(() => {});
  }, []);
```

- [ ] **Step 5: Add task creation and inline-update handlers**

Add these functions, right after `updateMilestoneStatus`:

```typescript
  function openCreateTask() {
    setCreateTaskError(null);
    setNewTaskTitle("");
    setNewTaskDescription("");
    setNewTaskAssigneeId("");
    setNewTaskMilestoneId("");
    setNewTaskDueDate("");
    setShowCreateTask(true);
  }

  async function handleCreateTask() {
    if (!selectedProjectId) return;
    setCreateTaskError(null);
    setCreatingTask(true);
    try {
      const res = await fetch(`/api/mobion/projects/${selectedProjectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTaskTitle,
          description: newTaskDescription,
          assigneeId: newTaskAssigneeId || null,
          milestoneId: newTaskMilestoneId || null,
          dueDate: newTaskDueDate || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateTaskError(data.error ?? "요청에 실패했습니다. 다시 시도해 주세요.");
        return;
      }
      setShowCreateTask(false);
      loadProjectDetail(selectedProjectId);
    } catch {
      setCreateTaskError("요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setCreatingTask(false);
    }
  }

  async function updateTaskStatus(taskId: string, status: string) {
    if (!selectedProjectId) return;
    await fetch(`/api/mobion/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadProjectDetail(selectedProjectId);
  }

  const visibleTasks = tasks.filter(
    (t) =>
      (!statusFilter || t.status === statusFilter) &&
      (!milestoneFilter || t.milestoneId === milestoneFilter) &&
      (!assigneeFilter || t.assigneeId === assigneeFilter),
  );
```

- [ ] **Step 6: Render the task list, filters, and creation modal**

Find (as left by Task 7):

```typescript
              </MilestoneList>
              {/* Task 8 renders the task list here */}
            </>
          )}
        </Main>
```

Replace with:

```typescript
              </MilestoneList>

              <DetailSectionHeader>
                <DetailSectionTitle>태스크</DetailSectionTitle>
                <AddButton type="button" onClick={openCreateTask}>
                  + 태스크 추가
                </AddButton>
              </DetailSectionHeader>
              <FilterRow>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">모든 상태</option>
                  <option value="todo">할 일</option>
                  <option value="in_progress">진행중</option>
                  <option value="done">완료</option>
                </select>
                <select value={milestoneFilter} onChange={(e) => setMilestoneFilter(e.target.value)}>
                  <option value="">모든 마일스톤</option>
                  {milestones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
                <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
                  <option value="">모든 담당자</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </FilterRow>
              <TaskList>
                {visibleTasks.length === 0 && <EmptyState>조건에 맞는 태스크가 없습니다</EmptyState>}
                {visibleTasks.map((t) => (
                  <TaskRow key={t.id}>
                    <TaskTitle>{t.title}</TaskTitle>
                    <TaskMeta>{t.assigneeName ?? "미배정"}</TaskMeta>
                    {t.dueDate && <TaskMeta>{t.dueDate}</TaskMeta>}
                    <select
                      value={t.status}
                      onChange={(e) => updateTaskStatus(t.id, e.target.value)}
                    >
                      <option value="todo">할 일</option>
                      <option value="in_progress">진행중</option>
                      <option value="done">완료</option>
                    </select>
                  </TaskRow>
                ))}
              </TaskList>
            </>
          )}
        </Main>
```

- [ ] **Step 7: Add the task creation modal JSX**

Add this right after the milestone creation modal block (`{showCreateMilestone && (...)}`), still before the component's final closing `</Root>`:

```typescript
      {showCreateTask && (
        <ModalOverlay onClick={() => setShowCreateTask(false)}>
          <ModalCard onClick={(e) => e.stopPropagation()}>
            <ModalTitle>새 태스크 만들기</ModalTitle>
            <Field>
              <label htmlFor="new-task-title">제목</label>
              <input
                id="new-task-title"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
              />
            </Field>
            <Field>
              <label htmlFor="new-task-description">설명</label>
              <input
                id="new-task-description"
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                placeholder="태스크 설명 (선택)"
              />
            </Field>
            <Field>
              <label htmlFor="new-task-assignee">담당자</label>
              <select
                id="new-task-assignee"
                value={newTaskAssigneeId}
                onChange={(e) => setNewTaskAssigneeId(e.target.value)}
              >
                <option value="">미배정</option>
                {allUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <label htmlFor="new-task-milestone">마일스톤</label>
              <select
                id="new-task-milestone"
                value={newTaskMilestoneId}
                onChange={(e) => setNewTaskMilestoneId(e.target.value)}
              >
                <option value="">없음</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <label htmlFor="new-task-due-date">마감일</label>
              <input
                id="new-task-due-date"
                type="date"
                value={newTaskDueDate}
                onChange={(e) => setNewTaskDueDate(e.target.value)}
              />
            </Field>
            {createTaskError && <ErrorText>{createTaskError}</ErrorText>}
            <ModalActions>
              <button type="button" onClick={() => setShowCreateTask(false)}>
                취소
              </button>
              <button type="button" onClick={handleCreateTask} disabled={creatingTask}>
                {creatingTask ? "만드는 중..." : "만들기"}
              </button>
            </ModalActions>
          </ModalCard>
        </ModalOverlay>
      )}
```

Note: `Field`'s existing styled rules only style a bare `input` (`label { ... } input { ... }`) — the new `<select>` elements above will render unstyled by default in this modal. This is accepted for this task (functional correctness over visual polish, since no design pass was requested for form `<select>` styling); if it looks jarring in Step 7's browser check, add a matching `select { ... }` rule block to the existing `Field` styled component (mirroring its `input` rule) rather than introducing a new styled component.

- [ ] **Step 8: Add the new styled components**

Add these after the `MilestoneDate` styled component:

```typescript
const FilterRow = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 12px;

  select {
    background: rgba(0, 0, 0, 0.25);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 12px;
  }
`;

const TaskList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const TaskRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);

  select {
    margin-left: auto;
    background: rgba(0, 0, 0, 0.25);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 12px;
  }
`;

const TaskTitle = styled.span`
  color: #d4d4d4;
  font-size: 14px;
`;

const TaskMeta = styled.span`
  color: #767676;
  font-size: 12px;
`;
```

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 10: Verify in the browser**

With the local dev server running, navigate to `/tasks`, select `verify-project`. Confirm the assignee dropdowns (in both the filter row and the creation modal) list every seeded account, including the professor-flagged one if any test account is flagged that way — confirming `GET /api/mobion/users/all` is genuinely unfiltered, unlike the pre-existing `GET /api/mobion/users`. Confirm the task list shows tasks created via earlier API verification (or create new ones via "+ 태스크 추가" — set an assignee, a milestone, and a due date, confirm all three render in the row). Change a task's status via its dropdown, confirm it persists after reload. Use each filter dropdown independently and confirm the list narrows correctly; combine two filters and confirm AND semantics (both conditions must hold). Confirm an empty-title submission shows `"태스크 제목을 입력해 주세요."` inline.

- [ ] **Step 11: Commit**

```bash
git add src/app/api/mobion/users/all/route.ts src/components/TasksContent.tsx
git commit -m "feat: add task list with filters, inline status update, and creation"
```

---

### Task 9: Header nav link

**Files:**
- Modify: `src/components/Header.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Add the nav item**

In `src/components/Header.tsx`, find:

```typescript
const NAV_ITEMS = [
  { label: "About", href: "/about" },
  { label: "Members", href: "/members" },
  { label: "Mobi:ON", href: "/mobion" },
  { label: "Blog", href: "/blog" },
  { label: "Contact", href: "#" },
];
```

Replace with:

```typescript
const NAV_ITEMS = [
  { label: "About", href: "/about" },
  { label: "Members", href: "/members" },
  { label: "Mobi:ON", href: "/mobion" },
  { label: "태스크", href: "/tasks" },
  { label: "Blog", href: "/blog" },
  { label: "Contact", href: "#" },
];
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 3: Verify in the browser**

With the local dev server running, confirm "태스크" appears in the header nav between "Mobi:ON" and "Blog", and clicking it navigates to `/tasks` with the active-page indicator (the small blue dot under the current nav item) showing correctly when on that page.

- [ ] **Step 4: Commit**

```bash
git add src/components/Header.tsx
git commit -m "feat: add 태스크 nav link to header"
```

---

### Task 10: Deploy

**Files:** none (infrastructure step, no source changes)

- [ ] **Step 1: Push and pull on the server**

```bash
git push origin dev
```

Then on the server (`ssh mobicom@203.230.103.35`):

```bash
cd ~/mobicom-app && git pull origin dev
export NVM_DIR=/home/mobicom/.nvm; . /home/mobicom/.nvm/nvm.sh
npm run build
pm2 restart mobicom-app
```

- [ ] **Step 2: Verify on the real deployment**

Open `http://203.230.103.35:3300/tasks`, log in, create a project, a milestone with a target date, and two tasks (one assigned to another seeded account, one unassigned). Change a task's status and confirm it persists after reload. Confirm the header's "태스크" nav link works from every other page.

---
