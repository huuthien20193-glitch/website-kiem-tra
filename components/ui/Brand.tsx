import { GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BrandMark({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/25',
        className,
      )}
    >
      <GraduationCap className={cn('size-6', iconClassName)} />
    </span>
  );
}

export function BrandLogo({
  light = false,
  compact = false,
  subtitle = 'Hệ thống kiểm tra trực tuyến',
  className,
}: {
  light?: boolean;
  compact?: boolean;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <BrandMark className="size-11" iconClassName="size-6" />
      <div className="min-w-0">
        <p className={cn('text-lg font-black leading-tight tracking-tight', light ? 'text-white' : 'text-slate-900')}>
          THT<span className="text-emerald-500">EDU</span>exam
        </p>
        {!compact ? (
          <p className={cn('truncate text-[11px] font-semibold', light ? 'text-slate-400' : 'text-slate-500')}>{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}
