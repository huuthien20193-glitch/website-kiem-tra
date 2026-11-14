'use client';

import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Độ rộng tối đa của hộp thoại theo từng cỡ. */
const SIZE_CLASSES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  /** Cỡ lớn nhất — dùng cho modal chấm bài cần nhiều không gian. */
  full: 'max-w-5xl',
} as const;

export type ModalSize = keyof typeof SIZE_CLASSES;

/** Bộ chọn các phần tử có thể nhận focus (dùng cho focus trap). */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Lấy danh sách phần tử đang hiển thị và nhận được focus bên trong một khối. */
function getFocusableElements(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getClientRects().length > 0,
  );
}

type ModalProps = {
  /** Modal có đang mở không — khi false không render gì cả. */
  open: boolean;
  /** Được gọi khi người dùng muốn đóng (Esc, nút ✕, bấm nền mờ). */
  onClose: () => void;
  /** Tiêu đề hiển thị trên đầu hộp thoại. */
  title?: string;
  /** Dòng mô tả nhỏ ngay dưới tiêu đề (tùy chọn). */
  description?: string;
  /** Nội dung chính nằm giữa phần đầu và phần chân. */
  children: ReactNode;
  /** Hàng nút ở đáy hộp thoại (tùy chọn). */
  footer?: ReactNode;
  /**
   * Khối nội dung phần đầu thay cho title/description
   * (ví dụ modal chấm bài hiển thị thông tin học sinh).
   */
  header?: ReactNode;
  /** Icon nhỏ đứng trước tiêu đề (ví dụ icon cảnh báo của hộp xác nhận). */
  headerIcon?: ReactNode;
  /** Nhãn mô tả hộp thoại cho trình đọc màn hình khi không dùng title. */
  ariaLabel?: string;
  /** Cỡ hộp thoại, mặc định "md". */
  size?: ModalSize;
  /** Cho phép nhấn Esc để đóng. Tắt khi bên trong đang mở một lớp khác (vd. xem ảnh phóng to). */
  closeOnEscape?: boolean;
  /** Cho phép bấm vào nền mờ để đóng (mặc định có). */
  closeOnBackdrop?: boolean;
  /** Ẩn nút ✕ góc phải (chỉ dùng khi hộp thoại vẫn còn cách đóng khác). */
  hideClose?: boolean;
  /** Phần tử muốn focus ngay khi mở (ví dụ ô nhập đầu tiên của form). */
  initialFocusRef?: RefObject<HTMLElement | null>;
};

/**
 * Modal dùng chung cho toàn dự án.
 * - role="dialog" + aria-modal="true" + aria-labelledby → trình đọc màn hình đọc đúng.
 * - Nhấn Esc để đóng; phím Tab luôn chạy vòng trong modal (focus trap).
 * - Khóa cuộn trang nền khi modal mở, trả lại focus cho nút đã mở modal khi đóng.
 * - Trên điện thoại modal tự trượt từ đáy lên (bottom sheet), trên máy tính nằm giữa màn hình.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  header,
  headerIcon,
  ariaLabel,
  size = 'md',
  closeOnEscape = true,
  closeOnBackdrop = true,
  hideClose = false,
  initialFocusRef,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  /** Phần tử đang giữ focus trước khi modal mở — để trả lại đúng chỗ khi đóng. */
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // Khóa cuộn của trang nền để người dùng không cuộn hụt ra ngoài modal.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Khi mở: ghi nhớ focus cũ, rồi đưa focus vào bên trong modal.
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // requestAnimationFrame: đợi panel được vẽ xong đã, rồi mới tìm nút để focus.
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = initialFocusRef?.current ?? getFocusableElements(panel)[0] ?? panel;
      target.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      // Trả focus về nút đã mở modal (cleanup chạy cả khi đóng lẫn khi gỡ component).
      previousFocusRef.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Xử lý phím: Esc để đóng, Tab để giữ focus luôn nằm trong modal.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel) return;

      // Nếu có modal khác đang chồng lên (ví dụ hộp xác nhận), chỉ để modal
      // trên cùng xử lý phím — tránh việc Esc đóng cả hai modal cùng lúc.
      const panels = Array.from(document.querySelectorAll<HTMLElement>('[data-modal-panel="true"]'));
      if (panels.length > 1 && panels[panels.length - 1] !== panel) return;

      if (event.key === 'Escape') {
        if (!closeOnEscape) return;
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusables = getFocusableElements(panel);
      if (focusables.length === 0) {
        // Modal không có gì để focus (ví dụ chỉ có nội dung chữ) → giữ focus trên panel.
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        // Shift + Tab từ phần tử đầu tiên (hoặc khi focus đang lọt ra ngoài) → nhảy về cuối.
        if (active === first || !panel.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        // Tab từ phần tử cuối cùng → quay về đầu, focus không bao giờ lọt ra ngoài.
        event.preventDefault();
        first.focus();
      }
    };

    // Bắt ở pha capture để can thiệp trước các handler khác của trang.
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, closeOnEscape, onClose]);

  if (!open) return null;

  /** Bấm vào chính nền mờ (không phải modal) mới đóng — tránh đóng khi kéo chọn chữ. */
  const handleBackdropMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!closeOnBackdrop) return;
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div
      onMouseDown={handleBackdropMouseDown}
      className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/50 p-4 backdrop-blur-sm sm:items-center sm:p-6"
    >
      <div
        ref={panelRef}
        data-modal-panel="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title && ariaLabel ? ariaLabel : undefined}
        tabIndex={-1}
        className={cn(
          'flex max-h-[92dvh] w-full animate-pop-in flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none',
          SIZE_CLASSES[size],
        )}
      >
        {/* Phần đầu: icon (tùy chọn) + tiêu đề/mô tả hoặc khối header riêng, luôn có nút đóng */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3.5">
            {headerIcon ? <span className="shrink-0">{headerIcon}</span> : null}
            {header ?? (
              <div className="min-w-0">
                {title ? (
                  <h2 id={titleId} className="text-lg font-bold text-slate-900">
                    {title}
                  </h2>
                ) : null}
                {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
              </div>
            )}
          </div>
          {hideClose ? null : (
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng hộp thoại"
              className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Phần thân: cuộn riêng khi nội dung dài (overscroll-contain: cuộn hụt không làm cuộn nền) */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>

        {/* Phần chân: hàng nút hành động (tùy chọn) */}
        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
