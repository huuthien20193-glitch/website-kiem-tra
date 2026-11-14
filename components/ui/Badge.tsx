import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone = 'emerald' | 'teal' | 'sky' | 'indigo' | 'violet' | 'amber' | 'rose' | 'slate';

const TONE_CLASSES: Record<BadgeTone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10',
  teal: 'bg-teal-50 text-teal-700 ring-teal-600/10',
  sky: 'bg-sky-50 text-sky-700 ring-sky-600/10',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/10',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/10',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/10',
  rose: 'bg-rose-50 text-rose-700 ring-rose-600/10',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/10',
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone };

/**
 * Nhãn nhỏ dạng "viên thuốc" (badge): tên môn, khối lớp, trạng thái...
 * Cỡ chữ tối thiểu 12px để đọc được trên điện thoại.
 */
export function Badge({ tone = 'slate', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ring-1',
        TONE_CLASSES[tone],
        className,
      )}
      {...rest}
    />
  );
}
