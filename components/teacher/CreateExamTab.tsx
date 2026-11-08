'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  ChevronDown,
  CircleAlert,
  GraduationCap,
  ImagePlus,
  Layers,
  Lightbulb,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import type {
  EssayQuestion,
  Exam,
  ExamType,
  Grade,
  McqExplanation,
  ShortAnswerQuestion,
  SubPart,
} from '@/lib/types';
import { GRADES, OPTION_LABELS, SUBJECTS } from '@/lib/types';
import { cn, formatNumber } from '@/lib/utils';
import { imageFilesFromClipboard, optimizeImage } from '@/lib/image';
import { useToast } from '@/components/ui/FeedbackProvider';

type CreateExamTabProps = {
  onCreate: (exam: Exam) => boolean | Promise<boolean>;
  onCancel: () => void;
};

const newId = (prefix = 'essay') =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

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

const createEmptyShortAnswer = (index: number): ShortAnswerQuestion => ({
  id: newId('short'),
  questionLabel: `Câu ${index}`,
  points: 1,
  questionImage: '',
  content: '',
  answer: '',
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
  const shortExplanationInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Toán học');
  const [grade, setGrade] = useState<Grade>(9);
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [totalPoints, setTotalPoints] = useState(10);
  const [examType, setExamType] = useState<ExamType>('official');

  const [hasMcq, setHasMcq] = useState(true);
  const [mcqImages, setMcqImages] = useState<string[]>([]);
  const [mcqCount, setMcqCount] = useState(10);
  const [mcqPointPerQ, setMcqPointPerQ] = useState(0.5);
  const [mcqAnswers, setMcqAnswers] = useState<number[]>(Array(10).fill(0));
  const [mcqExplanationEnabled, setMcqExplanationEnabled] = useState(false);
  const [mcqExplanations, setMcqExplanations] = useState<McqExplanation[]>(() =>
    Array.from({ length: 10 }, () => ({ text: '', images: [] })),
  );
  const [openExplanation, setOpenExplanation] = useState<number | null>(null);
  const explanationInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [shortAnswerQuestions, setShortAnswerQuestions] = useState<ShortAnswerQuestion[]>([]);
  const [essayQuestions, setEssayQuestions] = useState<EssayQuestion[]>([createEmptyEssay(7)]);

  const effectiveMcqCount = hasMcq ? mcqCount : 0;
  const mcqPoints = useMemo(
    () => effectiveMcqCount * mcqPointPerQ,
    [effectiveMcqCount, mcqPointPerQ],
  );
  const shortAnswerPoints = useMemo(
    () => shortAnswerQuestions.reduce((sum, question) => sum + question.points, 0),
    [shortAnswerQuestions],
  );
  const essayPoints = useMemo(
    () => essayQuestions.reduce((sum, question) => sum + question.points, 0),
    [essayQuestions],
  );
  const configuredPoints = Number((mcqPoints + shortAnswerPoints + essayPoints).toFixed(2));
  const pointsMismatch = Math.abs(configuredPoints - totalPoints) > 0.01;

  const updateMcqCount = (value: number) => {
    const safe = Math.min(60, Math.max(1, Math.round(Number(value) || 1)));
    setMcqCount(safe);
    setMcqAnswers((current) => Array.from({ length: safe }, (_, index) => current[index] ?? 0));
    setMcqExplanations((current) =>
      Array.from({ length: safe }, (_, index) => current[index] ?? { text: '', images: [] }),
    );
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

  const addExplanationImages = async (index: number, files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const optimized = await Promise.all(
        files.map((file) => optimizeImage(file).catch(() => null)),
      );
      const valid = optimized.filter((image): image is string => Boolean(image));
      if (valid.length === 0) {
        toast.error('Không thể đọc ảnh', 'Vui lòng chọn tệp ảnh hợp lệ.');
        return;
      }
      setMcqExplanations((current) =>
        current.map((item, i) =>
          i === index ? { ...item, images: [...item.images, ...valid] } : item,
        ),
      );
      toast.success('Đã thêm ảnh lời giải', `${valid.length} ảnh cho câu ${index + 1}.`);
    } finally {
      setUploading(false);
    }
  };

  const updateExplanation = (index: number, patch: Partial<McqExplanation>) => {
    setMcqExplanations((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  };

  const removeExplanationImage = (index: number, imageIndex: number) => {
    setMcqExplanations((current) =>
      current.map((item, i) =>
        i === index
          ? { ...item, images: item.images.filter((_, imgIndex) => imgIndex !== imageIndex) }
          : item,
      ),
    );
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

  const addShortAnswerImage = async (questionId: string | number, file: File) => {
    setUploading(true);
    try {
      const image = await optimizeImage(file);
      setShortAnswerQuestions((current) =>
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

  const updateShortExplanation = (
    questionId: string | number,
    patch: Partial<McqExplanation>,
  ) => {
    setShortAnswerQuestions((current) =>
      current.map((question) => {
        if (question.id !== questionId) return question;
        const explanation = question.explanation ?? { text: '', images: [] };
        return { ...question, explanation: { ...explanation, ...patch } };
      }),
    );
  };

  const addShortExplanationImages = async (questionId: string | number, files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const optimized = await Promise.all(
        files.map((file) => optimizeImage(file).catch(() => null)),
      );
      const valid = optimized.filter((image): image is string => Boolean(image));
      if (valid.length === 0) {
        toast.error('Không thể đọc ảnh', 'Vui lòng chọn tệp ảnh hợp lệ.');
        return;
      }
      setShortAnswerQuestions((current) =>
        current.map((question) => {
          if (question.id !== questionId) return question;
          const explanation = question.explanation ?? { text: '', images: [] };
          return { ...question, explanation: { ...explanation, images: [...explanation.images, ...valid] } };
        }),
      );
      toast.success('Đã thêm ảnh lời giải', `${valid.length} ảnh cho câu trả lời ngắn.`);
    } finally {
      setUploading(false);
    }
  };

  const removeShortExplanationImage = (questionId: string | number, imageIndex: number) => {
    setShortAnswerQuestions((current) =>
      current.map((question) => {
        if (question.id !== questionId) return question;
        const explanation = question.explanation ?? { text: '', images: [] };
        return {
          ...question,
          explanation: { ...explanation, images: explanation.images.filter((_, index) => index !== imageIndex) },
        };
      }),
    );
  };

  // Dán ảnh (Ctrl + V) ở bất kỳ đâu trong form đều thêm đúng chỗ:
  // paste bên trong khối câu trả lời ngắn/tự luận -> ảnh của câu đó,
  // ngược lại -> ảnh đề trắc nghiệm.
  const pasteTargetRef = useRef({ hasMcq });
  useEffect(() => {
    pasteTargetRef.current = { hasMcq };
  }, [hasMcq]);

  useEffect(() => {
    const handlePaste = (event: globalThis.ClipboardEvent) => {
      const files = imageFilesFromClipboard(event);
      if (files.length === 0) return;
      const target = event.target instanceof Element ? event.target : null;
      const explanationBlock = target?.closest<HTMLElement>('[data-paste-explanation-index]');
      if (explanationBlock) {
        event.preventDefault();
        const index = Number(explanationBlock.dataset.pasteExplanationIndex);
        if (Number.isFinite(index)) void addExplanationImages(index, files);
        return;
      }
      const shortExplanationBlock = target?.closest<HTMLElement>('[data-paste-short-explanation]');
      if (shortExplanationBlock) {
        event.preventDefault();
        const id = shortExplanationBlock.dataset.pasteShortExplanation;
        if (id) void addShortExplanationImages(id, files);
        return;
      }
      const block = target?.closest<HTMLElement>('[data-paste-question]');
      if (block) {
        const type = block.dataset.pasteQuestion;
        const id = block.dataset.pasteId;
        if (type === 'short' && id) {
          event.preventDefault();
          void addShortAnswerImage(id, files[0]);
          return;
        }
        if (type === 'essay' && id) {
          event.preventDefault();
          void addEssayImage(id, files[0]);
          return;
        }
      }
      if (pasteTargetRef.current.hasMcq) {
        event.preventDefault();
        void addMcqFiles(files);
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateShortAnswer = (
    id: string | number,
    patch: Partial<ShortAnswerQuestion>,
  ) => {
    setShortAnswerQuestions((current) =>
      current.map((question) => (question.id === id ? { ...question, ...patch } : question)),
    );
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
    setHasMcq(true);
    setMcqImages([]);
    setMcqCount(10);
    setMcqPointPerQ(0.5);
    setMcqAnswers(Array(10).fill(0));
    setMcqExplanationEnabled(false);
    setMcqExplanations(Array.from({ length: 10 }, () => ({ text: '', images: [] })));
    setOpenExplanation(null);
    setShortAnswerQuestions([]);
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

    if (effectiveMcqCount + shortAnswerQuestions.length + essayQuestions.length === 0) {
      toast.error('Đề chưa có câu hỏi', 'Hãy thêm ít nhất một câu trắc nghiệm, trả lời ngắn hoặc tự luận.');
      return;
    }

    const missingAnswer = shortAnswerQuestions.find((question) => !question.answer.trim());
    if (missingAnswer) {
      toast.error(
        'Thiếu đáp án câu trả lời ngắn',
        `Vui lòng nhập đáp án đúng cho ${missingAnswer.questionLabel.trim() || 'câu trả lời ngắn'}.`,
      );
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
      mcqImages: hasMcq ? mcqImages : [],
      mcqCount: effectiveMcqCount,
      mcqPointPerQ: Number(mcqPointPerQ),
      mcqAnswers: hasMcq ? mcqAnswers.slice(0, mcqCount) : [],
      mcqExplanationEnabled: hasMcq ? mcqExplanationEnabled : false,
      mcqExplanations: hasMcq
        ? mcqExplanations.slice(0, effectiveMcqCount).map((item) => ({
            text: (item.text || '').trim(),
            images: item.images,
          }))
        : [],
      shortAnswerQuestions: shortAnswerQuestions.map((question) => ({
        ...question,
        questionLabel: question.questionLabel.trim() || 'Câu trả lời ngắn',
        points: Number(question.points) || 0,
        content: (question.content || '').trim(),
        answer: (question.answer || '').trim(),
        rubric: (question.rubric || '').trim(),
      })),
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
            Linh hoạt trắc nghiệm, trả lời ngắn và tự luận — có thể bỏ hẳn phần trắc nghiệm nếu muốn.
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
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
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
              TN {formatNumber(mcqPoints, 2)}đ · TLN {formatNumber(shortAnswerPoints, 2)}đ · TL{' '}
              {formatNumber(essayPoints, 2)}đ
            </span>
          </div>
        </section>

        {/* STEP 2 */}
        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex flex-wrap items-center gap-3 border-b border-slate-100 pb-4">
            <NumberBadge>2</NumberBadge>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-black text-slate-900">Phần trắc nghiệm</h2>
              <p className="text-[11px] font-medium text-slate-400">
                {hasMcq
                  ? 'Tải ảnh đề và chọn đáp án đúng cho từng câu'
                  : 'Đề này không có phần trắc nghiệm'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={hasMcq}
              onClick={() => setHasMcq((current) => !current)}
              className={cn(
                'inline-flex items-center gap-3 rounded-2xl border-2 px-4 py-2.5 text-xs font-black uppercase tracking-wide transition',
                hasMcq
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300',
              )}
            >
              <span>{hasMcq ? 'Có trắc nghiệm' : 'Không trắc nghiệm'}</span>
              <span
                className={cn(
                  'relative h-6 w-11 rounded-full transition',
                  hasMcq ? 'bg-emerald-500' : 'bg-slate-300',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 size-5 rounded-full bg-white shadow transition-all',
                    hasMcq ? 'left-5.5' : 'left-0.5',
                  )}
                />
              </span>
            </button>
          </div>

          {hasMcq ? (
          <>
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

          <div className="mt-6 border-t border-slate-100 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-600">
                  <Lightbulb className="size-4 text-amber-500" />
                  Lời giải từng câu <span className="font-medium normal-case text-slate-400">(tùy chọn)</span>
                </label>
                <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                  Ghi bằng chữ hoặc ảnh. Bật công tắc để học sinh xem lời giải (trắc nghiệm + trả lời ngắn) sau khi nộp bài và ra điểm.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={mcqExplanationEnabled}
                onClick={() => setMcqExplanationEnabled((current) => !current)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black transition',
                  mcqExplanationEnabled
                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                    : 'border-slate-200 bg-slate-50 text-slate-500',
                )}
              >
                <span
                  className={cn(
                    'relative h-4 w-7 rounded-full transition',
                    mcqExplanationEnabled ? 'bg-amber-500' : 'bg-slate-300',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 size-3 rounded-full bg-white shadow-sm transition-all',
                      mcqExplanationEnabled ? 'left-3.5' : 'left-0.5',
                    )}
                  />
                </span>
                {mcqExplanationEnabled ? 'Học sinh xem được lời giải' : 'Ẩn lời giải'}
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {Array.from({ length: mcqCount }).map((_, index) => {
                const explanation = mcqExplanations[index] ?? { text: '', images: [] };
                const hasContent = explanation.text.trim().length > 0 || explanation.images.length > 0;
                const open = openExplanation === index;
                return (
                  <div
                    key={index}
                    data-paste-explanation-index={index}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/60"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenExplanation(open ? null : index)}
                      className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition hover:bg-slate-100/60"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white text-[10px] font-black text-slate-600 ring-1 ring-slate-200">
                          {index + 1}
                        </span>
                        <span
                          className={cn(
                            'text-[11px] font-bold',
                            hasContent ? 'text-emerald-700' : 'text-slate-400',
                          )}
                        >
                          {hasContent ? 'Đã có lời giải' : 'Chưa có lời giải'}
                        </span>
                      </span>
                      <ChevronDown
                        className={cn('size-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
                      />
                    </button>

                    {open ? (
                      <div className="border-t border-slate-200 p-3">
                        <textarea
                          value={explanation.text}
                          onChange={(event) => updateExplanation(index, { text: event.target.value })}
                          rows={2}
                          placeholder={`Giải thích tại sao đáp án ${OPTION_LABELS[mcqAnswers[index] ?? 0]} đúng...`}
                          className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20"
                        />
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <input
                            ref={(element) => {
                              explanationInputRefs.current[index] = element;
                            }}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(event) => {
                              void addExplanationImages(index, Array.from(event.target.files || []));
                              event.target.value = '';
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => explanationInputRefs.current[index]?.click()}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800 transition hover:bg-amber-100"
                          >
                            <ImagePlus className="size-4" />
                            Thêm ảnh / dán Ctrl + V
                          </button>
                          {explanation.images.length > 0 ? (
                            <span className="text-[10px] font-bold text-slate-400">
                              {explanation.images.length} ảnh
                            </span>
                          ) : null}
                        </div>

                        {explanation.images.length > 0 ? (
                          <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                            {explanation.images.map((image, imageIndex) => (
                              <div
                                key={imageIndex}
                                className="group relative flex h-20 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-900 p-1"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={image}
                                  alt={`Lời giải câu ${index + 1} - ảnh ${imageIndex + 1}`}
                                  onClick={() => setPreviewImage(image)}
                                  className="max-h-full max-w-full cursor-zoom-in rounded-lg object-contain"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeExplanationImage(index, imageIndex)}
                                  className="absolute right-1 top-1 rounded-full bg-rose-600 p-1 text-white opacity-0 shadow transition group-hover:opacity-100"
                                  aria-label="Xóa ảnh"
                                >
                                  <X className="size-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          </>
          ) : (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              Đề sẽ được tạo không có câu trắc nghiệm. Bạn vẫn có thể thêm câu trả lời ngắn và tự luận bên dưới.
            </div>
          )}
        </section>

        {/* STEP 3 */}
        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
            <NumberBadge>3</NumberBadge>
            <div>
              <h2 className="text-sm font-black text-slate-900">Phần trả lời ngắn</h2>
              <p className="text-[11px] font-medium text-slate-400">
                Học sinh gõ đáp án trực tiếp — hệ thống tự chấm theo đáp án đúng
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {shortAnswerQuestions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-center">
                <p className="text-xs font-bold text-slate-600">Chưa có câu trả lời ngắn</p>
                <p className="mt-1 text-[11px] font-medium text-slate-400">
                  Thêm câu hỏi để học sinh nhập đáp án trực tiếp.
                </p>
              </div>
            ) : null}

            {shortAnswerQuestions.map((question, questionIndex) => (
              <div
                key={question.id}
                data-paste-question="short"
                data-paste-id={String(question.id)}
                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5"
              >
                <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-xl bg-white text-xs font-black text-sky-700 shadow-sm ring-1 ring-slate-200">
                      {questionIndex + 1}
                    </span>
                    <input
                      type="text"
                      value={question.questionLabel}
                      onChange={(event) =>
                        updateShortAnswer(question.id, { questionLabel: event.target.value })
                      }
                      placeholder="Câu 1"
                      className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-sky-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
                    />
                    <span className="text-[11px] font-bold text-slate-500">Điểm câu:</span>
                    <input
                      type="number"
                      min={0}
                      step={0.25}
                      value={question.points}
                      onChange={(event) =>
                        updateShortAnswer(question.id, { points: Number(event.target.value) })
                      }
                      className="w-20 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-center text-xs font-black text-sky-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setShortAnswerQuestions((current) =>
                        current.filter((item) => item.id !== question.id),
                      )
                    }
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
                        if (file) void addShortAnswerImage(question.id, file);
                        event.target.value = '';
                      }}
                    />
                    {question.questionImage ? (
                      <div className="relative flex h-32 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-900 p-1">
                        <img
                          src={question.questionImage}
                          alt="Ảnh đề"
                          className="max-h-full max-w-full rounded-lg object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => updateShortAnswer(question.id, { questionImage: '' })}
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
                        className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-sky-300 bg-white text-sky-600 transition hover:border-sky-400 hover:bg-sky-50/50"
                      >
                        <ImagePlus className="size-5" />
                        <span className="text-[11px] font-bold">Chọn ảnh đề</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    <div>
                      <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-500">
                        Nội dung câu hỏi
                      </label>
                      <textarea
                        value={question.content}
                        onChange={(event) =>
                          updateShortAnswer(question.id, { content: event.target.value })
                        }
                        rows={2}
                        placeholder="Ví dụ: Tính giá trị của biểu thức..."
                        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-500">
                        Đáp án đúng <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={question.answer}
                        onChange={(event) =>
                          updateShortAnswer(question.id, { answer: event.target.value })
                        }
                        placeholder="Ví dụ: 4 | bốn | 2^2 (nhiều đáp án cách nhau bởi | hoặc ;)"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-sky-700 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
                      />
                      <p className="mt-1 text-[10px] font-medium text-slate-400">
                        Không phân biệt hoa thường, tự động chấp nhận 0,5 và 0.5.
                      </p>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-500">
                        Hướng dẫn chấm (tùy chọn)
                      </label>
                      <input
                        type="text"
                        value={question.rubric || ''}
                        onChange={(event) =>
                          updateShortAnswer(question.id, { rubric: event.target.value })
                        }
                        placeholder="Ví dụ: Đúng đơn vị mới được tính điểm..."
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
                      />
                    </div>
                    <div
                      data-paste-short-explanation={String(question.id)}
                      className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3"
                    >
                      <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-amber-700">
                        Lời giải (tùy chọn) — học sinh xem sau khi nộp bài
                      </label>
                      <textarea
                        value={question.explanation?.text ?? ''}
                        onChange={(event) => updateShortExplanation(question.id, { text: event.target.value })}
                        rows={2}
                        placeholder="Ví dụ: Vì 2² = 4, nên căn bậc hai của 4 là ±2..."
                        className="w-full resize-y rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-xs font-medium outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20"
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input
                          ref={(element) => {
                            shortExplanationInputRefs.current[String(question.id)] = element;
                          }}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(event) => {
                            void addShortExplanationImages(question.id, Array.from(event.target.files || []));
                            event.target.value = '';
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => shortExplanationInputRefs.current[String(question.id)]?.click()}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800 transition hover:bg-amber-100"
                        >
                          <ImagePlus className="size-4" />
                          Thêm ảnh / dán Ctrl + V
                        </button>
                        {question.explanation?.images && question.explanation.images.length > 0 ? (
                          <span className="text-[10px] font-bold text-slate-500">
                            {question.explanation.images.length} ảnh
                          </span>
                        ) : null}
                      </div>
                      {question.explanation?.images && question.explanation.images.length > 0 ? (
                        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                          {question.explanation.images.map((image, imageIndex) => (
                            <div
                              key={imageIndex}
                              className="group relative flex h-20 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-900 p-1"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={image}
                                alt={`Lời giải câu trả lời ngắn - ảnh ${imageIndex + 1}`}
                                onClick={() => setPreviewImage(image)}
                                className="max-h-full max-w-full cursor-zoom-in rounded-lg object-contain"
                              />
                              <button
                                type="button"
                                onClick={() => removeShortExplanationImage(question.id, imageIndex)}
                                className="absolute right-1 top-1 rounded-full bg-rose-600 p-1 text-white opacity-0 shadow transition group-hover:opacity-100"
                                aria-label="Xóa ảnh"
                              >
                                <X className="size-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() =>
                setShortAnswerQuestions((current) => [
                  ...current,
                  createEmptyShortAnswer(1 + current.length),
                ])
              }
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-sky-300 py-3.5 text-xs font-bold text-sky-700 transition hover:bg-sky-50"
            >
              <Plus className="size-4" />
              Thêm câu trả lời ngắn
            </button>
          </div>
        </section>

        {/* STEP 4 */}
        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
            <NumberBadge>4</NumberBadge>
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
                <div
                  key={question.id}
                  data-paste-question="essay"
                  data-paste-id={String(question.id)}
                  className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5"
                >
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
                          <span className="text-[11px] font-bold">Chọn ảnh / dán Ctrl + V</span>
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

      {previewImage ? (
        <button
          type="button"
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/85 p-4"
          aria-label="Đóng ảnh"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewImage}
            alt="Ảnh lời giải phóng to"
            className="max-h-[90vh] max-w-full rounded-2xl object-contain shadow-2xl"
          />
        </button>
      ) : null}

      <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-xl shadow-slate-900/5 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Layers className="size-5" />
          </span>
          <div>
            <p className="text-xs font-black text-slate-800">
              {effectiveMcqCount} câu trắc nghiệm · {shortAnswerQuestions.length} câu trả lời ngắn ·{' '}
              {essayQuestions.length} câu tự luận
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
