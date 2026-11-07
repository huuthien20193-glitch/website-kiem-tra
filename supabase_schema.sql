-- =====================================================================
-- THTEDUexam – Supabase schema
-- Chạy TOÀN BỘ file này một lần trong Supabase Dashboard → SQL Editor.
-- File được viết để chạy lại nhiều lần vẫn an toàn (idempotent).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. BÀI NỘP (submissions)
-- ---------------------------------------------------------------------
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
  student_mcq_answers jsonb default '[]'::jsonb,
  correct_mcq_answers jsonb default '[]'::jsonb,
  mcq_images jsonb default '[]'::jsonb,
  short_answer_details jsonb default '[]'::jsonb,
  essay_details jsonb default '[]'::jsonb,
  status text default 'pending',
  submitted_at timestamptz default now(),
  time_spent_seconds integer default 0
);

-- Bổ sung cột còn thiếu nếu bảng đã được tạo từ phiên bản cũ.
alter table submissions add column if not exists time_spent_seconds integer default 0;
alter table submissions add column if not exists mcq_images jsonb default '[]'::jsonb;
alter table submissions add column if not exists short_answer_details jsonb default '[]'::jsonb;
alter table submissions add column if not exists essay_details jsonb default '[]'::jsonb;
alter table submissions add column if not exists student_mcq_answers jsonb default '[]'::jsonb;
alter table submissions add column if not exists correct_mcq_answers jsonb default '[]'::jsonb;
alter table submissions add column if not exists student_class text;
alter table submissions add column if not exists exam_title text;
alter table submissions add column if not exists auto_score numeric default 0;
alter table submissions add column if not exists score numeric default 0;
alter table submissions add column if not exists mcq_count integer default 0;
alter table submissions add column if not exists mcq_correct_count integer default 0;
alter table submissions add column if not exists status text default 'pending';
alter table submissions add column if not exists submitted_at timestamptz default now();

alter table submissions enable row level security;
drop policy if exists "Allow all access" on submissions;
create policy "Allow all access" on submissions
  for all
  using (true)
  with check (true);

-- ---------------------------------------------------------------------
-- 2. ĐỀ THI (exams)
-- Cột `data` (jsonb) chứa TOÀN BỘ đề: ảnh, đáp án, câu tự luận...
-- Các cột còn lại chỉ là bản tóm tắt để lọc/thống kê.
-- ---------------------------------------------------------------------
create table if not exists exams (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  subject text not null,
  duration_minutes integer default 45,
  total_points numeric default 10,
  mcq_count integer default 0,
  essay_questions integer default 0,
  status text default 'Đã xuất bản',
  created_at timestamptz default now()
);

-- Bổ sung cột cho bảng đã tồn tại từ phiên bản cũ.
alter table exams add column if not exists data jsonb;
alter table exams add column if not exists title text;
alter table exams add column if not exists subject text;
alter table exams add column if not exists duration_minutes integer default 45;
alter table exams add column if not exists total_points numeric default 10;
alter table exams add column if not exists mcq_count integer default 0;
alter table exams add column if not exists essay_questions integer default 0;
alter table exams add column if not exists status text default 'Đã xuất bản';
alter table exams add column if not exists created_at timestamptz default now();

-- Cho phép điểm số thập phân (ví dụ 9.5).
alter table exams alter column total_points type numeric using total_points::numeric;

alter table exams enable row level security;
drop policy if exists "Allow all access" on exams;
create policy "Allow all access" on exams
  for all
  using (true)
  with check (true);

-- =====================================================================
-- XONG. Sau khi chạy, tải lại trang web và tạo đề mới để kiểm tra.
-- =====================================================================
