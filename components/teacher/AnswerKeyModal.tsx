'use client';

import { useRef, useState } from 'react';
import { Eye, EyeOff, ImagePlus, Sparkles, Trash2 } from 'lucide-react';
import type { Exam, ExamAnswerKey } from '@/lib/types';
import { buildAnswerKeyText } from '@/lib/storage';
import { imageFilesFromClipboard, optimizeImage } from '@/lib/image';
import { Button, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/FeedbackProvider';

type AnswerKeyModalProps = {
  exam: Exam;
  onClose: () => void;
  /** Trả về true khi lưu thành công để modal tự đóng. */
  onSave: (answerKey: ExamAnswerKey) => Promise<boolean>;
};

/** Số ảnh tối đa để không làm phình dữ liệu đề trên Supabase/localStorage. */
const MAX_IMAGES = 8;

/**
 * Hộp thoại công bố đáp án đầy đủ của một đề.
 * Giáo viên có thể tự soạn, dán ảnh bài giải hoặc sinh nhanh từ đáp án đã có.
 */
export function AnswerKeyModal({ exam, onClose, onSave }: AnswerKeyModalProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [enabled, setEnabled] = useState(exam.answerKey?.enabled ?? true);
  const [text, setText] = useState(exam.answerKey?.text ?? '');
  const [images, setImages] = useState<string[]>(exam.answerKey?.images ?? []);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const addImages = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      toast.info('Không có ảnh hợp lệ', 'Chỉ hỗ trợ tệp ảnh PNG, JPG hoặc WEBP.');
      return;
    }

    setUploading(true);
    try {
      const room = Math.max(0, MAX_IMAGES - images.length);
      const optimized = await Promise.all(
        imageFiles.slice(0, room).map((file) => optimizeImage(file, 1400, 0.82)),
      );
      setImages((current) => [...current, ...optimized].slice(0, MAX_IMAGES));
      if (imageFiles.length > room) {
        toast.warning('Đã đạt giới hạn ảnh', `Mỗi đề chỉ nên có tối đa ${MAX_IMAGES} ảnh đáp án.`);
      }
    } catch (error) {
      toast.error(
        'Không thể đọc ảnh',
        error instanceof Error ? error.message : 'Vui lòng thử lại với ảnh khác.',
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAutoFill = () => {
    const generated = buildAnswerKeyText(exam);
    setText(generated);
    setEnabled(true);
    toast.success('Đã điền đáp án từ đề', 'Giáo viên có thể chỉnh sửa lại trước khi lưu.');
  };

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!trimmed && images.length === 0) {
      toast.error('Đáp án đang trống', 'Hãy nhập nội dung, thêm ảnh hoặc bấm "Điền từ đề".');
      return;
    }

    setSaving(true);
    const ok = await onSave({
      enabled,
      text,
      images,
      updatedAt: new Date().toISOString(),
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Đáp án của đề"
      description="Học sinh chỉ xem được mục này sau khi đã nộp bài."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button onClick={() => void handleSave()} loading={saving || uploading}>
            Lưu đáp án
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Đề kiểm tra</p>
          <p className="mt-0.5 text-sm font-bold text-slate-900">{exam.title}</p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 transition hover:bg-slate-50">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="mt-0.5 size-4 accent-emerald-600"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
              {enabled ? <Eye className="size-4 text-emerald-600" /> : <EyeOff className="size-4 text-slate-400" />}
              Cho học sinh xem đáp án sau khi nộp bài
            </span>
            <span className="mt-0.5 block text-xs font-medium text-slate-500">
              Tắt công tắc này nếu muốn tạm ẩn đáp án mà không xóa nội dung.
            </span>
          </span>
        </label>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="answer-key-text" className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Nội dung đáp án / hướng dẫn giải
            </label>
            <Button variant="soft" size="sm" onClick={handleAutoFill}>
              <Sparkles className="size-4" />
              Điền từ đề
            </Button>
          </div>
          <textarea
            id="answer-key-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onPaste={(event) => {
              const files = imageFilesFromClipboard(event);
              if (files.length > 0) {
                event.preventDefault();
                void addImages(files);
              }
            }}
            rows={12}
            placeholder={'Ví dụ:\nPHẦN TRẮC NGHIỆM\nCâu 1: B\nCâu 2: D\n\nPHẦN TỰ LUẬN\nCâu 1: ...'}
            className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium leading-relaxed text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
          />
          <p className="mt-1.5 text-xs font-medium text-slate-500">
            Mẹo: dán ảnh trực tiếp vào ô này để thêm ảnh bài giải.
          </p>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Ảnh đáp án ({images.length}/{MAX_IMAGES})
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              loading={uploading}
              disabled={images.length >= MAX_IMAGES}
            >
              <ImagePlus className="size-4" />
              Thêm ảnh
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length > 0) void addImages(files);
              }}
            />
          </div>

          {images.length > 0 ? (
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((image, index) => (
                <div
                  key={`${index}-${image.slice(-24)}`}
                  className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image}
                    alt={`Ảnh đáp án ${index + 1}`}
                    className="h-24 w-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    className="absolute right-1 top-1 rounded-lg bg-rose-600/90 p-1.5 text-white opacity-90 transition hover:bg-rose-700"
                    aria-label={`Xóa ảnh đáp án ${index + 1}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 rounded-xl bg-slate-50 px-3 py-4 text-center text-xs font-medium text-slate-500">
              Chưa có ảnh đáp án. Có thể thêm ảnh chụp bài giải hoặc bảng đáp án.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
