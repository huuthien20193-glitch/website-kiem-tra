import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PageHeaderProps = {
  /** Tiêu đề lớn của trang (thẻ h1). */
  title: string;
  /** Dòng mô tả ngắn dưới tiêu đề (tùy chọn). */
  description?: string;
  /** Khu nút hành động bên phải (ví dụ "Tạo lớp mới"). */
  actions?: ReactNode;
  className?: string;
};

/**
 * Đầu trang chuẩn: tiêu đề bên trái, nút hành động bên phải,
 * tự xuống dòng gọn trên điện thoại (cột dọc) và nằm ngang từ sm trở lên.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}
