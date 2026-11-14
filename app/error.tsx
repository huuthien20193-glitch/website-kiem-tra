'use client'; // Bắt buộc: error.tsx phải là Client Component để bắt lỗi lúc chạy.

import { useEffect } from 'react';
import { CircleAlert, RotateCcw } from 'lucide-react';

/**
 * error.tsx: bắt lỗi bất ngờ khi hiển thị một phân đoạn trang (ví dụ Supabase
 * trả lỗi, mạng chập chờn) thay vì để web sập trắng trang.
 * LƯU Ý cho bản Next.js này: props là { error, retry } — hàm thử lại tên "retry",
 * không phải "reset" như bản Next cũ.
 */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    // Ghi lỗi ra console để có thể mở DevTools xem chi tiết khi cần báo lỗi.
    console.error(error);
  }, [error]);

  // Chỉ lấy mã lỗi rút gọn (digest) để người dùng chụp màn hình báo lại,
  // không hiện chi tiết kỹ thuật trên màn hình.
  const digest =
    typeof error === 'object' && error !== null && 'digest' in error
      ? String((error as { digest?: unknown }).digest ?? '')
      : '';

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6 font-sans">
      <div className="w-full max-w-md rounded-2xl border border-rose-200/80 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <CircleAlert className="size-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-lg font-bold text-slate-900">Đã xảy ra lỗi</h1>
        <p className="mt-2 text-sm text-slate-500">
          Hệ thống gặp sự cố khi hiển thị trang này. Bạn có thể thử tải lại — bài làm nháp trên thiết bị
          vẫn được giữ nguyên.
        </p>
        {digest ? (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500">
            Mã lỗi: {digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={retry}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Thử lại
        </button>
      </div>
    </main>
  );
}
