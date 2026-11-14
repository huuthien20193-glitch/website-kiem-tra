'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Các "màu" nút dùng chung — chọn 1 trong 5, đừng tự viết class màu mới. */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'warning' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // Nút hành động chính (xanh emerald đậm)
  primary: 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700',
  // Nút phụ (viền xám, nền trắng) — dùng cho Hủy, Quay lại...
  secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
  // Nút "vô hình" chỉ có chữ/hover
  ghost: 'text-slate-600 hover:bg-slate-100',
  // Nút nền xanh nhạt cùng tông emerald
  soft: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  // Nút cảnh báo màu hổ phách (hộp xác nhận tone warning)
  warning: 'bg-amber-600 text-white shadow-md shadow-amber-600/20 hover:bg-amber-700',
  // Nút nguy hiểm (xóa dữ liệu)
  danger: 'bg-rose-600 text-white shadow-md shadow-rose-600/20 hover:bg-rose-700',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-xs',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3 text-sm',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Đang xử lý: hiện vòng xoay và chặn bấm thêm lần nữa. */
  loading?: boolean;
};

/**
 * Nút bấm dùng chung — bo góc, cỡ chữ và hiệu ứng nhất quán toàn dự án.
 * Mặc định type="button" để nút thường không vô tình submit form.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-xl font-bold transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:pointer-events-none disabled:opacity-60',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
});
