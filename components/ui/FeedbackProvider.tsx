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
// Modal + Button dùng chung của dự án (import trực tiếp, tránh vòng lặp qua barrel index).
import { Modal } from './Modal';
import { Button } from './Button';

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

const CONFIRM_STYLES: Record<ConfirmTone, { icon: typeof TriangleAlert; iconWrap: string; buttonVariant: 'danger' | 'warning' | 'primary' }> = {
  danger: {
    icon: TriangleAlert,
    iconWrap: 'bg-rose-100 text-rose-600',
    buttonVariant: 'danger',
  },
  warning: {
    icon: TriangleAlert,
    iconWrap: 'bg-amber-100 text-amber-600',
    buttonVariant: 'warning',
  },
  primary: {
    icon: Info,
    iconWrap: 'bg-emerald-100 text-emerald-600',
    buttonVariant: 'primary',
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

  // LƯU Ý: đóng bằng Esc, focus trap và khóa cuộn trang do Modal dùng chung đảm nhiệm
  // nên không cần lắng nghe phím riêng ở đây nữa.
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
                  className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Đóng thông báo"
                >
                  <X className="size-4" />
                </button>
              </div>
            );
          })}
        </div>

        {confirmState ? (
          <Modal
            open
            onClose={() => resolveConfirm(false)}
            title={confirmState.options.title}
            size="sm"
            headerIcon={
              <span
                className={cn(
                  'flex size-11 items-center justify-center rounded-2xl',
                  CONFIRM_STYLES[confirmState.options.tone || 'primary'].iconWrap,
                )}
              >
                {(() => {
                  const Icon = CONFIRM_STYLES[confirmState.options.tone || 'primary'].icon;
                  return <Icon className="size-5" aria-hidden="true" />;
                })()}
              </span>
            }
            footer={
              <>
                <Button variant="secondary" onClick={() => resolveConfirm(false)}>
                  {confirmState.options.cancelLabel || 'Hủy bỏ'}
                </Button>
                <Button
                  variant={CONFIRM_STYLES[confirmState.options.tone || 'primary'].buttonVariant}
                  onClick={() => resolveConfirm(true)}
                >
                  {confirmState.options.confirmLabel || 'Xác nhận'}
                </Button>
              </>
            }
          >
            {confirmState.options.message ? (
              <div className="px-5 py-5 sm:px-6">
                <p className="text-sm leading-relaxed text-slate-600">{confirmState.options.message}</p>
              </div>
            ) : null}
          </Modal>
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
