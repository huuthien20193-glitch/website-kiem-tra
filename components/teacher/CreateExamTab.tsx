'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  CircleAlert,
  GraduationCap,
  ImagePlus,
  Layers,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import type { EssayQuestion, Exam, ExamType, Grade, SubPart } from '@/lib/types';
import { GRADES, OPTION_LABELS, SUBJECTS } from '@/lib/types';
import { cn, formatNumber } from '@/lib/utils';
import { imageFilesFromClipboard, optimizeImage } from '@/lib/image';
import { useToast } from '@/components/ui/FeedbackProvider';

type CreateExamTabProps = {
  onCreate: (exam: Exam) => boolean | Promise<boolean>;
  onCancel: () => void;
};

const newId = () => `essay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Cột exams.id là kiểu uuid trên Supabase nên mã đề phải là UUID hợp lệ.
const newExamId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

const createEmptyEssay = (index: number): EssayQuestion => ({
  id: newId(),
  questionLabel: `Câu ${index}`,
  points: 2,
  questionImage: '',
  subParts: [
    { label: 'a', content: '', points: 1 },
    { label: 'b', content: '', points: 1 },
  ],
  rubric: '',
});

function NumberBadge({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-xs font-black text-white shadow-sm">
      {children}
    </span>
  );
}

export function CreateExamTab({ onCreate, onCancel }: CreateExamTabProps) {
  const toast = useToast();
  const mcqInputRef = useRef<HTMLInputElement>(null);
  const essayInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Toán học');
  const [grade, setGrade] = useState<Grade>(9);
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [totalPoints, setTotalPoints] = useState(10);
  const [examType, setExamType] = useState<ExamType>('official');

  const [mcqImages, setMcqImages] = useState<string[]>([]);
  const [mcqCount, setMcqCount] = useState(10);
  const [mcqPointPerQ, setMcqPointPerQ] = useState(0.5);
  const [mcqAnswers, setMcqAnswers] = useState<number[]>(Array(10).fill(0));
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [essayQuestions, setEssayQuestions] = useState<EssayQuestion[]>([createEmptyEssay(7)]);

  const mcqPoints = useMemo(() => mcqCount * mcqPointPerQ, [mcqCount, mcqPointPerQ]);
  const essayPoints = useMemo(
    () => essayQuestions.reduce((sum, question) => sum + question.points, 0),
    [essayQuestions],
  );
  const configuredPoints = Number((mcqPoints + essayPoints).toFixed(2));
  const pointsMismatch = Math.abs(configuredPoints - totalPoints) > 0.01;

  const updateMcqCount = (value: number) => {
    const safe = Math.min(60, Math.max(1, Math.round(Number(value) || 1)));
    setMcqCount(safe);
    setMcqAnswers((current) => Array.from({ length: safe }, (_, index) => current[index] ?? 0));
  };

  const addMcqFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const optimized = await Promise.all(
        files.map((file) => optimizeImage(file).catch(() => null)),
      );
      const valid = optimized.filter((image): image is string => Boolean(image));
      if (valid.length > 0) {
        setMcqImages((current) => [...current, ...valid]);
        toast.success('Đã thêm ảnh đề', `${valid.length} ảnh đã được tối ưu và tải lên.`);
      } else {
        toast.error('Không thể đọc ảnh', 'Vui lòng chọn tệp ảnh hợp lệ.');
      }
    } finally {
      setUploading(false);
    }
  };

  const addEssayImage = async (questionId: string | number, file: File) => {
    setUploading(true);
    try {
      const image = await optimizeImage(file);
      setEssayQuestions((current) =>
        current.map((question) =>
          question.id === questionId ? { ...question, questionImage: image } : question,
        ),
      );
      toast.success('Đã thêm ảnh câu hỏi');
    } catch {
      toast.error('Không thể đọc ảnh', 'Vui lòng chọn tệp ảnh hợp lệ.');
    } finally {
      setUploading(false);
    }
  };

  const updateEssay = (id: string | number, patch: Partial<EssayQuestion>) => {
    setEssayQuestions((current) =>
      current.map((question) => (question.id === id ? { ...question, ...patch } : question)),
    );
  };

  const updateSubPart = (questionId: string | number, index: number, patch: Partial<SubPart>) => {
    setEssayQuestions((current) =>
      current.map((question) => {
        if (question.id !== questionId) return question;
        const subParts = question.subParts.map((part, partIndex) =>
          partIndex === index ? { ...part, ...patch } : part,
        );
        return { ...question, subParts };
      }),
    );
  };

  const addSubPart = (questionId: string | number) => {
    setEssayQuestions((current) =>
      current.map((question) => {
        if (question.id !== questionId) return question;
        const label = String.fromCharCode(97 + question.subParts.length);
        return {
          ...question,
          subParts: [...question.subParts, { label, content: '', points: 1 }],
        };
      }),
    );
  };

  const removeSubPart = (questionId: string | number, index: number) => {
    setEssayQuestions((current) =>
      current.map((question) => {
        if (question.id !== questionId) return question;
        return {
          ...question,
          subParts: question.subParts
            .filter((_, partIndex) => partIndex !== index)
            .map((part, partIndex) => ({ ...part, label: String.fromCharCode(97 + partIndex) })),
        };
      }),
    );
  };

  const syncQuestionPoints = (questionId: string | number) => {
    setEssayQuestions((current) =>
      current.map((question) => {
        if (question.id !== questionId) return question;
        const total = Number(question.subParts.reduce((sum, part) => sum + part.points, 0).toFixed(2));
        return { ...question, points: total };
      }),
    );
  };

  const resetForm = () => {
    setTitle('');
    setSubject('Toán học');
    setGrade(9);
    setDurationMinutes(45);
    setTotalPoints(10);
    setMcqImages([]);
    setMcqCount(10);
    setMcqPointPerQ(0.5);
    setMcqAnswers(Array(10).fill(0));
    setEssayQuestions([createEmptyEssay(7)]);
  };

  const handleSave = async () => {
    if (saving) return;
    if (!title.trim()) {
      toast.error('Thiếu tên đề kiểm tra', 'Vui lòng nhập tên đề trước khi công bố.');
      return;
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
      toast.error('Thời gian không hợp lệ', 'Thời gian làm bài phải từ 1 phút trở lên.');
      return;
    }
    if (!Number.isFinite(totalPoints) || totalPoints <= 0) {
      toast.error('Thang điểm không hợp lệ', 'Thang điểm tổng phải lớn hơn 0.');
      return;
    }

    const exam: Exam = {
      id: newExamId(),
      title: title.trim(),
      subject,
      grade,
      durationMinutes: Math.round(durationMinutes),
      totalPoints: Number(totalPoints),
      status: 'Đã xuất bản',
      type: examType,
      mcqImages,
      mcqCount,
      mcqPointPerQ: Number(mcqPointPerQ),
      mcqAnswers: mcqAnswers.slice(0, mcqCount),
      essayQuestions: essayQuestions.map((question) => ({
        ...question,
        questionLabel: question.questionLabel.trim() || 'Câu tự luận',
        points: Number(question.points) || 0,
        rubric: (question.rubric || '').trim(),
        subParts: question.subParts.map((part) => ({
          ...part,
          content: part.content.trim(),
          points: Number(part.points) || 0,
        })),
      })),
      createdAt: new Date().toISOString(),
    };

    setSaving(true);
    try {
      const saved = await onCreate(exam);
      if (saved) {
        resetForm();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Tạo đề kiểm tra mới</h1>
          <p className="mt-1 text-sm text-slate-500">
            Thiết kế đề trắc nghiệm dạng ảnh, cài đáp án chuẩn và cấu trúc tự luận theo từng ý.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="self-start rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-50 sm:self-auto"
        >
          Hủy bỏ
        </button>
      </header>

      <div className="space-y-6">
        {/* STEP 1 */}
        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
            <NumberBadge>1</NumberBadge>
            <div>
              <h2 className="text-sm font-black text-slate-900">Thông tin chung</h2>
              <p className="text-[11px] font-medium text-slate-400">Tên đề, môn học, thời gian và thang điểm</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">
                Tên đề kiểm tra <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ví dụ: Kiểm tra giữa kì I – Toán 9"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">Môn học</label>
              <select
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-emerald-700 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
              >
                {SUBJECTS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-slate-500">
              <GraduationCap className="size-3.5 text-emerald-500" />
              Khối lớp <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {GRADES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setGrade(item)}
                  className={cn(
                    'rounded-2xl border px-3 py-2.5 text-sm font-black transition',
                    grade === item
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-emerald-200 hover:text-emerald-700',
                  )}
                >
                  Lớp {item}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] font-medium text-slate-400">
              Đề sẽ được nhóm theo khối này ở trang quản lý và trang làm bài của học sinh.
            </p>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">
                Thời gian làm bài (phút) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={300}
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(Number(event.target.value))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-emerald-700 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">
                Loại đề
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-1 flex gap-1">
                <button
                  type="button"
                  onClick={() => setExamType('official')}
                  className={cn(
                    'px-3 py-2 text-xs font-bold rounded-lg transition',
                    examType === 'official'
                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100',
                  )}
                >
                  Chính thức
                </button>
                <button
                  type="button"
                  onClick={() => setExamType('practice')}
                  className={cn(
                    'px-3 py-2 text-xs font-bold rounded-lg transition',
                    examType === 'practice'
                      ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100',
                  )}
                >
                  Ôn tập
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">
                Thang điểm tổng
              </label>
              <input
                type="number"
                min={1}
                step={0.5}
                value={totalPoints}
                onChange={(event) => setTotalPoints(Number(event.target.value))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-teal-700 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          <div
            className={cn(
              'mt-4 flex flex-col gap-2 rounded-2xl border px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between',
              pointsMismatch
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800',
            )}
          >
            <span className="flex items-center gap-2 font-semibold">
              {pointsMismatch ? <CircleAlert className="size-4 shrink-0" /> : <Check className="size-4 shrink-0" />}
              Tổng điểm đã cấu hình: <strong>{formatNumber(configuredPoints, 2)}đ</strong>
              {pointsMismatch ? ` (lệch ${formatNumber(Math.abs(configuredPoints - totalPoints), 2)}đ so với thang điểm)` : ' — khớp với thang điểm'}
            </span>
            <span className="font-bold">
              TN {formatNumber(mcqPoints, 2)}đ · TL {formatNumber(essayPoints, 2)}đ
            </span>
          </div>
        </section>

        {/* STEP 2 */}
        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
            <NumberBadge>2</NumberBadge>
            <div>
              <h2 className="text-sm font-black text-slate-900">Phần trắc nghiệm</h2>
              <p className="text-[11px] font-medium text-slate-400">Tải ảnh đề và chọn đáp án đúng cho từng câu</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-600">Số lượng câu trắc nghiệm</label>
              <input
                type="number"
                min={1}
                max={60}
                value={mcqCount}
                onChange={(event) => updateMcqCount(Number(event.target.value))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-600">Điểm mỗi câu</label>
              <input
                type="number"
                min={0.1}
                step={0.25}
                value={mcqPointPerQ}
                onChange={(event) => setMcqPointPerQ(Number(event.target.value))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-emerald-700 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => mcqInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') mcqInputRef.current?.click();
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void addMcqFiles(Array.from(event.dataTransfer.files));
            }}
            onPaste={(event) => {
              const files = imageFilesFromClipboard(event);
              if (files.length > 0) {
                event.preventDefault();
                void addMcqFiles(files);
              }
            }}
            className={cn(
              'mt-4 cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center outline-none transition',
              dragging
                ? 'border-emerald-500 bg-emerald-50 ring-4 ring-emerald-500/10'
                : 'border-emerald-300 bg-emerald-50/30 hover:border-emerald-400 hover:bg-emerald-50/60 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10',
            )}
          >
            <input
              ref={mcqInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                void addMcqFiles(Array.from(event.target.files || []));
                event.target.value = '';
              }}
            />
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm">
              <ImagePlus className="size-6" />
            </span>
            <p className="mt-3 text-sm font-bold text-slate-800">
              {uploading ? 'Đang xử lý ảnh...' : 'Kéo thả ảnh, chọn tệp hoặc dán bằng Ctrl + V'}
            </p>
            <p className="mt-1 text-[11px] font-medium text-slate-400">
              Hỗ trợ nhiều ảnh cùng lúc · Ảnh được tự động nén để tiết kiệm bộ nhớ
            </p>
          </div>

          {mcqImages.length > 0 ? (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-bold text-slate-600">
                Đã tải lên {mcqImages.length} ảnh đề:
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {mcqImages.map((image, index) => (
                  <div
                    key={`${image.slice(-24)}-${index}`}
                    className="group relative flex h-36 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-900 p-1"
                  >
                    <img src={image} alt={`Trang đề ${index + 1}`} className="max-h-full max-w-full rounded-lg object-contain" />
                    <span className="absolute bottom-1 left-1 rounded-md bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      Trang {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMcqImages((current) => current.filter((_, imageIndex) => imageIndex !== index))}
                      className="absolute right-1 top-1 rounded-full bg-rose-600 p-1 text-white opacity-0 shadow-md transition group-hover:opacity-100"
                      aria-label={`Xóa ảnh ${index + 1}`}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wide text-slate-600">Đáp án đúng từng câu</label>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">
                {mcqCount} câu · {formatNumber(mcqPoints, 2)} điểm
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: mcqCount }).map((_, index) => (
                <div key={index} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <span className="pl-1 text-xs font-black text-slate-700">Câu {index + 1}</span>
                  <div className="flex gap-1">
                    {OPTION_LABELS.map((label, optionIndex) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() =>
                          setMcqAnswers((current) => {
                            const next = [...current];
                            next[index] = optionIndex;
                            return next;
                          })
                        }
                        className={cn(
                          'flex size-7 items-center justify-center rounded-lg text-[11px] font-black transition',
                          (mcqAnswers[index] ?? 0) === optionIndex
                            ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                            : 'border border-slate-200 bg-white text-slate-500 hover:border-emerald-300 hover:text-emerald-600',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* STEP 3 */}
        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
            <NumberBadge>3</NumberBadge>
            <div>
              <h2 className="text-sm font-black text-slate-900">Phần tự luận</h2>
              <p className="text-[11px] font-medium text-slate-400">Chia câu hỏi thành các ý a, b, c... và đặt điểm tương ứng</p>
            </div>
          </div>

          <div className="space-y-5">
            {essayQuestions.map((question, questionIndex) => {
              const subPartTotal = Number(question.subParts.reduce((sum, part) => sum + part.points, 0).toFixed(2));
              const outOfSync = Math.abs(subPartTotal - question.points) > 0.01;
              return (
                <div key={question.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
                  <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-xl bg-white text-xs font-black text-emerald-700 shadow-sm ring-1 ring-slate-200">
                        {questionIndex + 1}
                      </span>
                      <input
                        type="text"
                        value={question.questionLabel}
                        onChange={(event) => updateEssay(question.id, { questionLabel: event.target.value })}
                        placeholder="Câu 7"
                        className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-emerald-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                      />
                      <span className="text-[11px] font-bold text-slate-500">Điểm câu:</span>
                      <input
                        type="number"
                        min={0}
                        step={0.25}
                        value={question.points}
                        onChange={(event) => updateEssay(question.id, { points: Number(event.target.value) })}
                        className="w-20 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-center text-xs font-black text-emerald-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setEssayQuestions((current) => current.filter((item) => item.id !== question.id))}
                      className="inline-flex items-center gap-1 self-start rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-rose-500 transition hover:bg-rose-100 sm:self-auto"
                    >
                      <Trash2 className="size-3.5" /> Xóa câu
                    </button>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr]">
                    <div>
                      <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-500">
                        Ảnh đề (tùy chọn)
                      </label>
                      <input
                        ref={(element) => {
                          essayInputRefs.current[String(question.id)] = element;
                        }}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void addEssayImage(question.id, file);
                          event.target.value = '';
                        }}
                      />
                      {question.questionImage ? (
                        <div className="relative flex h-32 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-900 p-1">
                          <img src={question.questionImage} alt="Ảnh đề" className="max-h-full max-w-full rounded-lg object-contain" />
                          <button
                            type="button"
                            onClick={() => updateEssay(question.id, { questionImage: '' })}
                            className="absolute right-1 top-1 rounded-full bg-rose-600 p-1 text-white"
                            aria-label="Xóa ảnh câu hỏi"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => essayInputRefs.current[String(question.id)]?.click()}
                          className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-teal-300 bg-white text-teal-600 transition hover:border-teal-400 hover:bg-teal-50/50"
                        >
                          <ImagePlus className="size-5" />
                          <span className="text-[11px] font-bold">Chọn ảnh đề</span>
                        </button>
                      )}
                    </div>

                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">Các ý nhỏ</label>
                        {outOfSync ? (
                          <button
                            type="button"
                            onClick={() => syncQuestionPoints(question.id)}
                            className="rounded-lg bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-200"
                          >
                            Đồng bộ điểm ý: {formatNumber(subPartTotal, 2)}đ
                          </button>
                        ) : null}
                      </div>

                      {question.subParts.map((part, partIndex) => (
                        <div key={partIndex} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-[11px] font-black uppercase text-emerald-700">
                            {part.label}
                          </span>
                          <input
                            type="text"
                            value={part.content}
                            onChange={(event) => updateSubPart(question.id, partIndex, { content: event.target.value })}
                            placeholder={`Nội dung ý ${part.label}...`}
                            className="min-w-0 flex-1 bg-transparent px-1 py-1 text-xs font-medium text-slate-800 outline-none placeholder:text-slate-400"
                          />
                          <div className="flex shrink-0 items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              step={0.25}
                              value={part.points}
                              onChange={(event) => updateSubPart(question.id, partIndex, { points: Number(event.target.value) })}
                              className="w-14 rounded-lg border border-slate-200 bg-slate-50 px-1 py-1 text-center text-[11px] font-black text-emerald-700 outline-none"
                            />
                            <span className="text-[10px] font-bold text-slate-400">đ</span>
                            <button
                              type="button"
                              onClick={() => removeSubPart(question.id, partIndex)}
                              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                              aria-label="Xóa ý"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => addSubPart(question.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100"
                      >
                        <Plus className="size-3.5" />
                        Thêm ý {String.fromCharCode(97 + question.subParts.length)}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-500">
                      Hướng dẫn chấm / Rubric
                    </label>
                    <input
                      type="text"
                      value={question.rubric || ''}
                      onChange={(event) => updateEssay(question.id, { rubric: event.target.value })}
                      placeholder="Ví dụ: Trình bày đúng mỗi ý 1 điểm, thiếu kết luận trừ 0,25 điểm..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => setEssayQuestions((current) => [...current, createEmptyEssay(7 + current.length)])}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-300 py-3.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50"
            >
              <Plus className="size-4" />
              Thêm câu tự luận mới
            </button>
          </div>
        </section>
      </div>

      <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-xl shadow-slate-900/5 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Layers className="size-5" />
          </span>
          <div>
            <p className="text-xs font-black text-slate-800">
              {mcqCount} câu trắc nghiệm · {essayQuestions.length} câu tự luận
            </p>
            <p className="text-[11px] font-medium text-slate-400">
              Tổng điểm cấu hình {formatNumber(configuredPoints, 2)} / {formatNumber(totalPoints, 2)} điểm
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-500 transition hover:bg-slate-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3 text-xs font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:from-emerald-700 hover:to-teal-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="size-4" />
            {saving ? 'Đang công bố...' : 'Lưu & công bố đề'}
          </button>
        </div>
      </div>
    </div>
  );
}
