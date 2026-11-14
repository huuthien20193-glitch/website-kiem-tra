import Link from 'next/link';
import { Compass, Home } from 'lucide-react';

/**
 * not-found.tsx: trang hiện khi người dùng gõ một địa chỉ không tồn tại (lỗi 404).
 * Đây là trang tĩnh (không cần 'use client').
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6 font-sans">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <Compass className="size-6" aria-hidden="true" />
        </span>
        <p className="mt-4 text-4xl font-bold tracking-tight text-slate-900">404</p>
        <h1 className="mt-1 text-lg font-bold text-slate-800">Không tìm thấy trang</h1>
        <p className="mt-2 text-sm text-slate-500">
          Trang bạn cần không tồn tại hoặc đã bị di chuyển. Hãy quay về trang chủ để đăng nhập và làm bài.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700"
        >
          <Home className="size-4" aria-hidden="true" />
          Về trang chủ
        </Link>
      </div>
    </main>
  );
}
