'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CircleCheck, CircleX, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastKind = 'success' | 'error' | 'info' | 'warning';

type ToastItem = {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
};

type ToastFn = (title: string, message?: string) => void;

export type ToastApi = {
  success: ToastFn;
  error: ToastFn;
  info: ToastFn;
  warning: ToastFn;
};

type ConfirmTone = 'danger' | 'primary' | 'warning';

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type ConfirmApi = (options: ConfirmOptions) => Promise<boolean>;

type ConfirmState = {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
};

const ToastContext = createContext<ToastApi | null>(null);
const ConfirmContext = createContext<ConfirmApi | null>(null);

const TOAST_STYLES: Record<ToastKind, { icon: typeof CircleCheck; wrap: string; iconWrap: string }> = {
  success: {
    icon: CircleCheck,
    wrap: 'border-emerald-200/80 bg-white',
    iconWrap: 'bg-emerald-100 text-emerald-600',
  },
  error: {
    icon: CircleX,
    wrap: 'border-rose-200/80 bg-white',
    iconWrap: 'bg-rose-100 text-rose-600',
  },
  warning: {
    icon: TriangleAlert,
    wrap: 'border-amber-200/80 bg-white',
    iconWrap: 'bg-amber-100 text-amber-600',
  },
  info: {
    icon: Info,
    wrap: 'border-sky-200/80 bg-white',
    iconWrap: 'bg-sky-100 text-sky-600',
  },
};

const CONFIRM_STYLES: Record<ConfirmTone, { icon: typeof TriangleAlert; wrap: string; iconWrap: string; button: string }> = {
  danger: {
    icon: TriangleAlert,
    wrap: 'bg-rose-100 text-rose-600',
    iconWrap: 'bg-rose-100 text-rose-600',
    button: 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/25',
  },
  warning: {
    icon: TriangleAlert,
    wrap: 'bg-amber-100 text-amber-600',
    iconWrap: 'bg-amber-100 text-amber-600',
    button: 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/25',
  },
  primary: {
    icon: Info,
    wrap: 'bg-emerald-100 text-emerald-600',
    iconWrap: 'bg-emerald-100 text-emerald-600',
    button: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25',
  },
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const confirmRef = useRef<ConfirmState | null>(null);
  const idRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, title: string, message?: string) => {
      idRef.current += 1;
      const id = idRef.current;
      setToasts((current) => [...current.slice(-3), { id, kind, title, message }]);
      const timer = setTimeout(() => dismiss(id), kind === 'error' ? 6500 : 4500);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  const toastApi = useMemo<ToastApi>(
    () => ({
      success: (title, message) => push('success', title, message),
      error: (title, message) => push('error', title, message),
      info: (title, message) => push('info', title, message),
      warning: (title, message) => push('warning', title, message),
    }),
    [push],
  );

  const resolveConfirm = useCallback((value: boolean) => {
    const current = confirmRef.current;
    confirmRef.current = null;
    current?.resolve(value);
    setConfirmState(null);
  }, []);

  const confirm = useCallback<ConfirmApi>((options) => {
    return new Promise<boolean>((resolve) => {
      confirmRef.current?.resolve(false);
      const next = { options, resolve };
      confirmRef.current = next;
      setConfirmState(next);
    });
  }, []);

  useEffect(() => {
    if (!confirmState) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') resolveConfirm(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [confirmState, resolveConfirm]);

  return (
    <ToastContext.Provider value={toastApi}>
      <ConfirmContext.Provider value={confirm}>
        {children}

        <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[120] flex flex-col items-end gap-3 sm:inset-x-auto sm:right-6 sm:bottom-6">
          {toasts.map((toast) => {
            const style = TOAST_STYLES[toast.kind];
            const Icon = style.icon;
            return (
              <div
                key={toast.id}
                role="status"
                className={cn(
                  'pointer-events-auto flex w-full items-start gap-3 rounded-2xl border p-4 shadow-xl shadow-slate-900/10 animate-toast-in sm:w-[380px]',
                  style.wrap,
                )}
              >
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', style.iconWrap)}>
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm font-bold text-slate-900">{toast.title}</p>
                  {toast.message ? (
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{toast.message}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Đóng thông báo"
                >
                  <X className="size-4" />
                </button>
              </div>
            );
          })}
        </div>

        {confirmState ? (
          <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
            <div
              role="alertdialog"
              aria-modal="true"
              className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl animate-pop-in"
            >
              <div className="flex items-start gap-4 p-6">
                <span
                  className={cn(
                    'flex size-12 shrink-0 items-center justify-center rounded-2xl',
                    CONFIRM_STYLES[confirmState.options.tone || 'primary'].iconWrap,
                  )}
                >
                  {(() => {
                    const Icon = CONFIRM_STYLES[confirmState.options.tone || 'primary'].icon;
                    return <Icon className="size-6" />;
                  })()}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-black text-slate-900">{confirmState.options.title}</h2>
                  {confirmState.options.message ? (
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{confirmState.options.message}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 p-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => resolveConfirm(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  {confirmState.options.cancelLabel || 'Hủy bỏ'}
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => resolveConfirm(true)}
                  className={cn(
                    'rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-lg transition',
                    CONFIRM_STYLES[confirmState.options.tone || 'primary'].button,
                  )}
                >
                  {confirmState.options.confirmLabel || 'Xác nhận'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast phải được dùng bên trong FeedbackProvider');
  return context;
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm phải được dùng bên trong FeedbackProvider');
  return context;
}
