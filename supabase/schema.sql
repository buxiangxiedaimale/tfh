-- FlowTodo 多设备同步表（在 Supabase SQL Editor 中执行）

create table if not exists workspace_snapshots (
  workspace_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table workspace_snapshots enable row level security;

-- 开发阶段：允许匿名读写（生产环境请改为认证用户 + workspace 成员校验）
create policy "allow anon read" on workspace_snapshots
  for select using (true);

create policy "allow anon insert" on workspace_snapshots
  for insert with check (true);

create policy "allow anon update" on workspace_snapshots
  for update using (true) with check (true);

-- 启用 Realtime
do $$
begin
  alter publication supabase_realtime add table workspace_snapshots;
exception
  when duplicate_object then null;
end $$;
