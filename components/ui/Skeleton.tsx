import type { HTMLAttributes } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Khối xám nhạt nhấp nháy thể hiện "đang tải dữ liệu" (skeleton).
 * aria-hidden vì đây chỉ là hiệu ứng hình, trình đọc màn hình không cần đọc.
 */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-lg bg-slate-200/80', className)} {...rest} />;
}

/** Skeleton cho hàng thẻ thống kê (như tab Bài nộp: 4 thẻ số liệu). */
export function StatsRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-3 h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Skeleton cho danh sách hàng ngang (bảng bài nộp, danh sách tài liệu...). */
export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"
        >
          <Skeleton className="size-10 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-9 w-24 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

/** Skeleton cho lưới thẻ (trang lớp học, trang đề thi của học sinh...). */
export function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <Skeleton className="size-10 rounded-2xl" />
          <Skeleton className="mt-3 h-4 w-2/3" />
          <Skeleton className="mt-2 h-3 w-1/3" />
          <Skeleton className="mt-4 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** Màn hình chờ toàn trang (kiểm tra đăng nhập, chuyển hướng) — vòng xoay + dòng chữ. */
export function LoadingBlock({ label = 'Đang tải...' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6" role="status" aria-live="polite">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <LoaderCircle className="size-5 animate-spin text-emerald-600" aria-hidden="true" />
        <span className="text-sm font-semibold text-slate-600">{label}</span>
      </div>
    </div>
  );
}
