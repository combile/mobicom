# Mobi:ON Task & Milestone Tracker — Design

## Context

Earlier feedback this session ("Huly 쓰는 이유가 task, milestone관리 등등인데 그 기능들은 다 어디갔니?") flagged that Mobi:ON adopted Huly specifically for task/milestone tracking, but only its chat layer (chunter) has been built so far. This spec covers that gap: projects, milestones, and tasks, as the first of two remaining sub-projects toward a Slack+Obsidian-style internal platform (the second — a notes/wiki feature — is out of scope here and follows as its own spec once this one ships).

This design was authored autonomously (per explicit authorization to proceed with best-practice judgment without a live approval round) while decomposing a large ask into independently shippable pieces, consistent with this project's established brainstorming process.

## Architecture Decision: native Postgres, not Huly's Tracker plugin

Huly has a real Tracker plugin (`tracker:class:Project/Issue/Milestone/Component`), but its schema is materially more complex than chunter's, which this app already integrates with via hand-picked class-ID constants (`CHUNTER_CLASS` in `mobion-huly.ts`) rather than installing `@hcengineering/chunter`:

- `Issue.status` is a `Ref<IssueStatus>` — `IssueStatus` is itself a per-project, dynamically-created class instance (a project's own configurable workflow states), not a fixed enum. Creating a single Issue would first require creating/managing a project's `IssueStatus` set, mirroring logic Huly's own workbench UI currently owns.
- `Issue` also carries priority enums, time-tracking fields (`estimation`/`remainingTime`/`reportedTime`), and relationship graphs (`subIssues`, `blockedBy`, `relations`, `parents`/`childInfo`) — none of which this lab's actual need calls for, and all of which raise the same kind of undocumented-server-validation risk that cost multiple fix rounds during the chunter integration (the PersonId/AccountUuid mismatches, the `autoJoin`/service-token requirements, etc.).
- `Project extends TaskProject` with its own `identifier`/`sequence` fields tied into Huly's issue-numbering scheme (e.g. `PROJ-123`), another layer of Huly-side bookkeeping with no payoff for a small lab tool.

Given the same YAGNI calibration already applied to channel tags this session (Huly lacking or over-engineering a needed feature → build it in mobicom's own Postgres instead, joined by whatever id is relevant), task/milestone tracking is built natively here: plain tables, plain CRUD routes, following every convention already established in this codebase (`requireCurrentUser()` first, `mobionApiError` catch-all, Korean user-facing errors, `query()` for all access). No Huly involvement at all for this feature — it doesn't touch `mobion-huly.ts` or the chat/channel system.

## Scope

In scope:
- **Projects**: a named grouping for tasks/milestones (e.g. one per research initiative). Name, description, created-by.
- **Milestones**: within a project. Title, optional target date, status (`계획`/`진행중`/`완료`).
- **Tasks**: within a project, optionally linked to a milestone. Title, description, assignee (any `mobion_users` row, optional/unassigned allowed), status (`할 일`/`진행중`/`완료`), optional due date.
- A `/tasks` page: project picker/list, milestone list per project (with progress — X/Y tasks done), task list filterable by milestone and/or status and/or assignee, inline status change (dropdown, no drag-and-drop), create/edit forms for all three entities.
- Korean error messages for every new failure mode (empty name, invalid status transition input, etc.), consistent with every other feature in this app.

Out of scope (first phase): sub-tasks, task dependencies/blocking, time estimation/tracking, priority levels, due-date reminders/notifications, recurring tasks, Gantt/timeline views, drag-and-drop kanban board, project membership/permissions (every logged-in user can see and edit every project — matches this lab's current trust model, where the chat system's only access-control concept is channel-level private membership, not workspace-wide roles beyond `is_admin`/`is_professor`).

## Data Model (schema v9)

```sql
CREATE TABLE mobion_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES mobion_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE mobion_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES mobion_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE mobion_tasks (
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
);
```

Note the naming reuse from Phase 0's abandoned schema: `mobion-db.ts` already drops old `mobion_tasks`/`mobion_milestones` tables from an earlier iteration (`DROP TABLE IF EXISTS mobion_task_checklist`, `mobion_tasks`, ..., `mobion_milestones` — a "one-time Phase 0 migration cleanup" comment marks these as safe to remove once run everywhere). Since those drops have already shipped and run in every environment (local + production, confirmed by this session's own deploys), reusing these table names now is safe — Postgres has no memory of the old, unrelated schema once the table's been dropped, and the migration ordering places `CREATE TABLE IF NOT EXISTS` for the new tables safely after that cleanup block.

`status` uses a `CHECK` constraint (not a separate enum table) — three fixed values, no dynamic per-project configurability (unlike Huly's `IssueStatus`), matching this feature's deliberately narrower scope.

## API Routes

Following the exact pattern of `src/app/api/mobion/chat/channels/route.ts` (`requireCurrentUser()` first, `mobionApiError(error, fallback)` catch-all, Korean error strings):

- `GET /api/mobion/projects` — list all projects (id, name, description, created_by resolved to a name).
- `POST /api/mobion/projects` — create a project. `{name, description}`. 400 on empty name.
- `GET /api/mobion/projects/[id]` — one project plus its milestones and tasks (with assignee names resolved via join), for the `/tasks` page's detail view.
- `POST /api/mobion/projects/[id]/milestones` — create a milestone. `{title, targetDate}`. 400 on empty title.
- `PATCH /api/mobion/milestones/[id]` — update status/title/targetDate. 404 if not found.
- `POST /api/mobion/projects/[id]/tasks` — create a task. `{title, description, assigneeId, milestoneId, dueDate}`. 400 on empty title.
- `PATCH /api/mobion/tasks/[id]` — update any task field (status change is the most common case, driven by the UI's inline status dropdown). 404 if not found.

No SSE/live-update layer for this feature (unlike chat) — task/milestone lists are refetched on navigation and after a mutating action's response, consistent with a project-management tool where near-real-time multi-user editing isn't the primary use case (matches this app's own `/profile` page's plain request/response pattern, not the chat page's SSE pattern).

## UI

New `/tasks` page (server component, auth-gated via `getCurrentUser()` + `redirect("/login")`, matching `/mobion`'s and `/profile`'s existing pattern) wrapping a new `TasksContent.tsx` client component:

- A project picker (list of project names in a sidebar-like column, matching the chat page's `Sidebar` visual pattern for consistency) with a "+ 프로젝트 추가" control opening a small creation form (name + description), reusing the app's established `ModalOverlay`/`ModalCard`/`Field` styled-component patterns.
- Selecting a project shows its milestones (as a simple list with status badges and a progress count, e.g. "2/5 완료") and its tasks (filterable by milestone/status/assignee via simple dropdown selects, not the tag-chip pattern used for channels — task filtering here is single-select per dimension, not multi-select AND).
- Each task row shows title, assignee name (or "미배정"), due date (if set), and a status dropdown for inline updates.
- "+ 태스크 추가" and "+ 마일스톤 추가" controls open small forms reusing the same modal patterns as channel creation.

`Header.tsx` gains a new nav item ("태스크") alongside the existing About/Members/Mobi:ON/Blog/Contact entries, linking to `/tasks`.

## Error Handling

Every new failure mode (empty name/title, project/milestone/task not found, invalid status value) surfaces a Korean message inline, matching every other feature in this app. Network-level failures get the same generic `"요청에 실패했습니다. 다시 시도해 주세요."` fallback already used elsewhere.

## Testing

No test suite in this repo (consistent with every prior plan). Manual verification: create a project, create a milestone with a target date, create two tasks (one assigned, one unassigned, one linked to the milestone), change a task's status via the dropdown and confirm the milestone's progress count updates on next load, filter the task list by status and by assignee, confirm Korean errors on empty-name submission and on a 404 (e.g. a stale milestone id after deletion — though deletion isn't in scope, a project's `ON DELETE CASCADE` should be exercised at least once to confirm milestones/tasks clean up correctly if a project is ever removed directly via SQL).
