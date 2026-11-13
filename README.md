# THTEDUexam – Hệ thống kiểm tra trực tuyến thế hệ mới

Dự án Next.js 16 (App Router) hỗ trợ giáo viên tạo đề kiểm tra, học sinh làm bài trực tuyến và chấm điểm tự động.

## ✨ Tính năng chính

- **Đăng nhập/đăng ký thực tế** (Supabase Auth) – giáo viên và học sinh
- **Tạo đề kiểm tra** – trắc nghiệm, tự luận, dạng ảnh
- **Phân loại theo khối lớp** – Lớp 6, 7, 8, 9, 10, 11, 12 với bộ lọc riêng cho giáo viên và học sinh
- **Tạo đề bằng AI** – AI đọc tài liệu giáo viên tải lên (PDF, Word, TXT, ảnh scan) và tự soạn đề: câu trắc nghiệm kèm 4 phương án + đáp án + lời giải, trả lời ngắn, tự luận
- **Tài liệu học tập & Trợ lý AI** – kho tài liệu cho giáo viên, tóm tắt nội dung bằng AI, hỏi đáp trực tiếp theo tài liệu
- **Trắc nghiệm dạng văn bản** – AI soạn câu hỏi text hiển thị thẳng cho học sinh, không cần chụp ảnh đề
- **Quản lý lớp học** – tạo lớp, mời học sinh, theo dõi tiến độ
- **Làm thi online real-time** – đếm ngược thời gian, nộp bài tự động
- **Chấm điểm tự động** – trắc nghiệm chấm ngay, tự luận chấm thủ công
- **Bảng xếp hạng & thống kê** – top điểm, phân bố điểm, báo cáo chi tiết
- **Xuất file đề** – PDF và Word (.docx)
- **Giao diện hiện đại** – dark mode, responsive, animations

## 🚀 Cách chạy trên VS Code

### 1. Cài dependencies

```powershell
npm install
```

### 2. Cấu hình Supabase

Tạo tài khoản miễn phí tại [supabase.com](https://supabase.com), tạo project mới, sau đó lấy `URL` và `ANON KEY` từ **Project Settings → API**.

Tạo file `.env.local` tại gốc dự án:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# AI — Google Gemini (đọc tài liệu & soạn đề)
# Tạo API key miễn phí tại: https://aistudio.google.com/apikey
GEMINI_API_KEY=your-gemini-api-key
# (Tùy chọn) Đổi model AI — mặc định: gemini-3.5-flash-lite
# GEMINI_MODEL=gemini-3.5-flash-lite
```

### 3. Tạo database (SQL)

Trong Supabase Dashboard → **SQL Editor**, mở file [`supabase_schema.sql`](./supabase_schema.sql) của dự án, copy **toàn bộ** nội dung và chạy **một lần**.

File SQL này:

- Tạo (hoặc nâng cấp) các bảng `exams`, `submissions` và `documents` (tài liệu học tập cho AI).
- Thêm cột `exams.data` (jsonb) để lưu đầy đủ đề thi: ảnh, đáp án trắc nghiệm, câu tự luận...
- Thêm cột `submissions.mcq_questions` (jsonb) chụp nội dung câu trắc nghiệm văn bản khi nộp bài.
- Bật RLS và tạo policy `"Allow all access"` cho các bảng.
- Chạy lại nhiều lần vẫn an toàn, không báo lỗi "policy already exists".

Sau khi chạy SQL, tải lại trang web là dữ liệu đề thi/bài nộp sẽ đồng bộ giữa mọi thiết bị.

### 4. Chạy dev server

```powershell
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000).

### 5. Triển khai trên Render

Dự án có sẵn [`render.yaml`](./render.yaml) (Render Blueprint) nên cách deploy nhanh nhất:

1. Vào [render.com](https://render.com) → **New +** → **Blueprint** → chọn repo `website-kiem-tra`.
2. Khi được hỏi, nhập 2 biến môi trường (cùng giá trị trong `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. **Apply** → đợi build xong → website chạy tại URL do Render cấp (dạng `https://website-kiem-tra.onrender.com`).

Nếu không muốn dùng Blueprint: **New + → Web Service** → chọn repo → **Build Command** `npm install && npm run build`, **Start Command** `npm start`, Node `20`.

Lưu ý: biến `NEXT_PUBLIC_*` được nhúng vào lúc build, nên sau khi thêm/sửa biến môi trường trên Render phải **redeploy** thì trang mới nhận cấu hình mới. Nếu chưa chạy `supabase_schema.sql`, việc tạo đề sẽ báo lỗi thiếu cột `data`. Gói **free** của Render sẽ tự "ngủ" khi không có truy cập, lần vào đầu có thể chậm vài chục giây.

## 📁 Cấu trúc thư mục

```
app/
  page.tsx              # Trang đăng nhập/đăng ký
  api/
    ai-config/          # Kiểm tra cấu hình AI
    generate-exam/      # Tạo đề bằng AI (server-side)
    extract-text/       # Trích xuất văn bản từ PDF/Word
    export-exam-docx/   # Xuất file Word
    status/             # Kiểm tra trạng thái hệ thống
  teacher/
    dashboard/          # Dashboard giáo viên
    classes/            # Quản lý lớp học
    create-exam/        # Tạo đề mới (CreateExamTab)
  student/
    dashboard/          # Dashboard học sinh
    exam/[id]/          # Làm thi online
components/
  auth/
    AuthProvider.tsx    # Quản lý xác thực
  teacher/
    CreateExamTab.tsx   # Tạo đề (có tích hợp AI)
    ExamsTab.tsx        # Quản lý đề thi
    GradingModal.tsx    # Chấm bài tự luận
    OverviewTab.tsx     # Tổng quan
    SubmissionsTab.tsx  # Bài nộp
  student/
    ExamRoom.tsx        # Phòng thi
    ExamResult.tsx      # Kết quả bài làm
  ui/
    Brand.tsx
    FeedbackProvider.tsx
lib/
  supabase.ts           # Cấu hình Supabase & Database types
  ai.ts                 # Server Action gọi AI
  storage.ts            # localStorage helpers (fallback)
  types.ts              # TypeScript types
  utils.ts              # Helper định dạng
```

## 🔐 Bảo mật

- API key AI chỉ tồn tại ở phía server (Next.js Route Handler), không rò rỉ lên trình duyệt
- Supabase Auth quản lý phiên làm việc an toàn
- RLS (Row Level Security) bảo vệ dữ liệu trong database
- Không commit file `.env.local` lên GitHub

## 📞 Liên hệ

Sư phạm Tin học · THTEDUexam © 2026
