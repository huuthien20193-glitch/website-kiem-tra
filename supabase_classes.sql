-- ============================================================================
-- BẢNG "classes" CHO TRANG LỚP HỌC CỦA THTEDUexam
-- Cách chạy: mở Supabase → SQL Editor → dán toàn bộ file này → Run.
-- An toàn 100%: chỉ THÊM bảng mới, KHÔNG đụng đến bảng exams/submissions/documents
-- hay bất kỳ dữ liệu hiện có nào.
-- ============================================================================

-- 1) Tạo bảng classes: mỗi dòng là một lớp học do giáo viên tạo.
--    "if not exists" = nếu bảng đã tồn tại thì bỏ qua, không báo lỗi, không mất dữ liệu.
create table if not exists public.classes (
  -- Mã định danh do web tự tạo (dạng "class-1699...-x7k2a"). Khóa chính của bảng.
  id text primary key,
  -- Tên lớp hiển thị, ví dụ "Toán 9A". Bắt buộc phải có (not null).
  name text not null,
  -- Mã lớp ngắn để tìm kiếm nhanh, ví dụ "TOAN9A". Để rỗng cũng được.
  code text not null default '',
  -- Môn học của lớp, ví dụ "Toán học".
  subject text not null default 'Chưa phân loại',
  -- Số học sinh của lớp. Số nguyên >= 0.
  student_count integer not null default 0,
  -- Thời điểm tạo lớp, tự điền giờ hiện tại theo chuẩn quốc tế (UTC).
  created_at timestamptz not null default now()
);

-- 2) Bật RLS (Row Level Security = "bảo mật theo dòng").
--    Sau khi bật, MẶC ĐỊNH mọi truy cập đều bị chặn trừ khi có chính sách cho phép.
alter table public.classes enable row level security;

-- 3) Chính sách truy cập tạm thời giống các bảng khác của dự án:
--    ai có anon key của web cũng đọc/ghi/xóa được.
--    LÝ DO: ở giai đoạn 4 dự án sẽ chuyển sang Supabase Auth và viết lại
--    toàn bộ chính sách (chỉ giáo viên đăng nhập mới được sửa). Hiện tại
--    hệ thống chưa có đăng nhập thật nên phải mở như các bảng cũ để web chạy được.
drop policy if exists "Allow all access for classes" on public.classes;
create policy "Allow all access for classes"
  on public.classes
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- 4) Tạo chỉ mục theo thời gian tạo để danh sách lớp tải nhanh và đúng thứ tự mới nhất.
create index if not exists classes_created_at_idx on public.classes (created_at desc);
