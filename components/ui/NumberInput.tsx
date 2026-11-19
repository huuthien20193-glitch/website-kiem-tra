'use client';

import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { trimFloat } from '@/lib/utils';

/**
 * Hiển thị số gọn để đưa lại vào ô nhập — chỉ cắt nhiễu dấu phẩy động
 * (ví dụ 0.30000000000000004 → 0.3), không tự làm tròn số giáo viên đã nhập.
 */
function displayNumber(value: number) {
  if (!Number.isFinite(value)) return '0';
  return String(trimFloat(value));
}

/** Đọc số từ chuỗi đang gõ, chấp nhận cả dấu phẩy thập phân kiểu Việt Nam (0,75). */
function parseNumber(raw: string): number | null {
  const normalized = raw.replace(',', '.').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export type NumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'min' | 'max' | 'step' | 'inputMode'
> & {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Cho phép nhập phần thập phân (mặc định true). */
  allowDecimal?: boolean;
};

/**
 * Ô nhập số dùng chung cho điểm/thời gian/số lượng.
 *
 * Vì sao không dùng `<input type="number">` có kiểm soát?
 * Khi gõ "0." hoặc "1.", `Number("0.") = 0` làm React ghi đè lại thành "0"
 * khiến dấu chấm biến mất; gõ tiếp "75" sẽ thành 75 thay vì 0.75.
 * Ô này giữ nguyên chuỗi đang gõ, chỉ đẩy số hợp lệ lên state cha, nên gõ
 * điểm thập phân bất kỳ (0.1, 0.33, 1.25…) diễn ra bình thường.
 */
export function NumberInput({
  value,
  onValueChange,
  min,
  max,
  allowDecimal = true,
  className,
  onFocus,
  onBlur,
  ...rest
}: NumberInputProps) {
  const [text, setText] = useState(() => displayNumber(value));
  const focusedRef = useRef(false);

  // Đồng bộ khi giá trị bên ngoài đổi (AI điền đề, đồng bộ điểm ý…) — không đè lúc đang gõ.
  useEffect(() => {
    if (!focusedRef.current) setText(displayNumber(value));
  }, [value]);

  const clampValue = (input: number) => {
    let next = input;
    if (typeof min === 'number') next = Math.max(min, next);
    if (typeof max === 'number') next = Math.min(max, next);
    return next;
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      autoComplete="off"
      spellCheck={false}
      value={text}
      onChange={(event) => {
        const raw = event.target.value;
        if (!(allowDecimal ? /^\d*[.,]?\d*$/ : /^\d*$/).test(raw)) return;
        setText(raw);
        const parsed = parseNumber(raw);
        if (parsed !== null) onValueChange(parsed);
      }}
      onFocus={(event) => {
        focusedRef.current = true;
        onFocus?.(event);
      }}
      onBlur={(event) => {
        focusedRef.current = false;
        const parsed = parseNumber(text);
        if (parsed === null) {
          // Ô đang trống hoặc chỉ có dấu chấm — trả lại giá trị hợp lệ gần nhất.
          setText(displayNumber(clampValue(value)));
        } else {
          const next = clampValue(parsed);
          setText(displayNumber(next));
          if (next !== value) onValueChange(next);
        }
        onBlur?.(event);
      }}
      className={className}
    />
  );
}
