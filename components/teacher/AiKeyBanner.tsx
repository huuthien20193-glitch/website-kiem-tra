'use client';

import { useState } from 'react';
import { CheckCircle2, CircleAlert, Eye, EyeOff, LoaderCircle, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { clearLocalAiKey, setLocalAiKey, validateAiKey } from '@/lib/ai';

type AiKeyBannerProps = {
  /** reason: 'missing' | 'invalid' — hiển thị lời dẫn phù hợp. */
  reason: 'missing' | 'invalid';
  /** Gọi lại khi key mới được lưu (để UI reload trạng thái AI). */
  onSaved?: (valid: boolean) => void;
};

/** Ô cho giáo viên dán API key Gemini trực tiếp trong web (lưu trên trình duyệt này). */
export function AiKeyBanner({ reason, onSaved }: AiKeyBannerProps) {
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<null | 'valid' | 'invalid'>(null);

  const save = async () => {
    const key = value.trim();
    if (!key) return;
    setChecking(true);
    setResult(null);
    const valid = await validateAiKey(key);
    setChecking(false);
    if (valid) {
      setLocalAiKey(key);
      setResult('valid');
      onSaved?.(true);
    } else {
      clearLocalAiKey();
      setResult('invalid');
    }
  };

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <p className="flex items-center gap-2 text-xs font-bold text-amber-900">
        <KeyRound className="size-4" />
        {reason === 'invalid' ? 'API key trên máy chủ KHÔNG HỢP LỆ' : 'Chưa có API key Gemini'}
      </p>
      <p className="mt-1 text-xs font-medium text-amber-800">
        Dán API key Gemini của bạn vào đây (lấy miễn phí tại{' '}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="font-bold underline">
          aistudio.google.com/apikey
        </a>
        ). Key chỉ lưu trên trình duyệt này, gửi kèm từng yêu cầu AI — không lưu trên máy chủ.
      </p>
      <div className="mt-2.5 flex gap-2">
        <div className="relative flex-1">
          <input
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setResult(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void save();
            }}
            placeholder="Dán API key (dạng AQ.Ab... hoặc AIza...)"
            className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 pr-9 text-xs font-medium outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
          />
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-600"
            aria-label={visible ? 'Ẩn key' : 'Hiện key'}
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={checking || value.trim().length === 0}
          className={cn(
            'flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-700 disabled:opacity-50',
          )}
        >
          {checking ? <LoaderCircle className="size-4 animate-spin" /> : null}
          Lưu key
        </button>
      </div>
      {result === 'valid' ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-emerald-700">
          <CheckCircle2 className="size-4" /> Key hợp lệ — đã lưu trên trình duyệt này. AI sẵn sàng!
        </p>
      ) : null}
      {result === 'invalid' ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-rose-700">
          <CircleAlert className="size-4" /> Key này không dùng được — kiểm tra lại (dán trọn vẹn, không thừa thiếu ký tự).
        </p>
      ) : null}
    </div>
  );
}
