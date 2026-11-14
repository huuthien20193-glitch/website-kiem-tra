import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Khối thẻ trắng dùng chung: bo góc 1rem + viền xám nhạt + bóng nhẹ.
 * Thay cho hàng loạt class "rounded-2xl border border-slate-200/80 bg-white shadow-sm"
 * lặp lại ở mọi tab để nhìn toàn web đồng nhất.
 */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-slate-200/80 bg-white shadow-sm', className)} {...rest} />;
}
