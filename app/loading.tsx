import { Skeleton } from '@/components/ui';

/**
 * loading.tsx của thư mục gốc: Next.js tự hiển thị màn hình này khi một trang
 * đang được nạp từ máy chủ — dùng khối xám nhấp nháy (skeleton) thay cho chữ
 * "Đang tải..." để cảm giác trang đã xuất hiện ngay.
 */
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6 font-sans">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    </div>
  );
}
