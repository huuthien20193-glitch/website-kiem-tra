import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type EmptyStateProps = {
  /** Icon lớn phía trên (truyền component của lucide-react vào). */
  icon?: ComponentType<{ className?: string }>;
  /** Câu chính — ví dụ "Chưa có lớp học nào". */
  title: string;
  /** Câu giải thích/hướng dẫn dưới tiêu đề (tùy chọn). */
  description?: string;
  /** Nút hành động dưới cùng (ví dụ "Tạo lớp học"). */
  action?: ReactNode;
  className?: string;
};

/**
 * Màn hình "trống" dùng chung: viền đứt quãng + icon + hướng dẫn + nút hành động.
 * Thay cho các khối UI trống tự viết riêng ở từng tab.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center',
        className,
      )}
    >
      {Icon ? (
        <span className="flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          <Icon className="size-6" aria-hidden="true" />
        </span>
      ) : null}
      <div>
        <p className="text-base font-bold text-slate-800">{title}</p>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
