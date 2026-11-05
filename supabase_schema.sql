-- Chạy đoạn SQL này trong Supabase Dashboard → SQL Editor

create table if not exists submissions (
  id uuid default gen_random_uuid() primary key,
  exam_id text not null,
  student_id text not null,
  student_name text not null,
  student_class text,
  exam_title text not null,
  auto_score numeric default 0,
  score numeric default 0,
  mcq_count integer default 0,
  mcq_correct_count integer default 0,
  student_mcq_answers jsonb default '[]',
  correct_mcq_answers jsonb default '[]',
  mcq_images text[] default '{}',
  essay_details jsonb default '[]',
  status text default 'pending',
  submitted_at timestamptz default now(),
  time_spent_seconds integer default 0
);

alter table submissions enable row level security;

create policy "Allow all access" on submissions
  for all
  using (true)
  with check (true);
