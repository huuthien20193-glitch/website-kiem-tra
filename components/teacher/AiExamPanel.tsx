'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, CircleAlert, LoaderCircle, Sparkles } from 'lucide-react';
import type { TeacherDocument } from '@/lib/types';
import { SUBJECTS } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  aiGenerateExam,
  aiPayloadFromDocument,
  aiStatus,
  type AiExamDraft,
  type AiExamOptions,
} from '@/lib/ai';
import { useToast } from '@/components/ui/FeedbackProvider';

type AiExamPanelProps = {
  documents: TeacherDocument[];
  /** Giá trị đang có trên form để AI lấy làm mặc định. */
  defaults: Pick<AiExamOptions, 'subject' | 'grade' | 'durationMinutes' | 'totalPoints' | 'examType'>;
  onApply: (draft: AiExamDraft) => void;
};

const DIFFICULTIES = [
  { value: 'dễ (nhận biết)', label: 'Dễ' },
  { value: 'trung bình (nhận biết + thông hiểu)', label: 'Trung bình' },
  { value: 'khó (thông hiểu + vận dụng)', label: 'Khó' },
  { value: 'phân bố từ dễ đến khó tăng dần', label: 'Tăng dần' },
];

export function AiExamPanel({ documents, defaults, onApply }: AiExamPanelProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  /** null = chưa chọn gì, dùng mặc định (2 tài liệu đầu). */
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [subject, setSubject] = useState(defaults.subject);
  const [grade, setGrade] = useState(defaults.grade);
  const [mcqCount, setMcqCount] = useState(10);
  const [shortCount, setShortCount] = useState(2);
  const [essayCount, setEssayCount] = useState(1);
  const [difficulty, setDifficulty] = useState(DIFFICULTIES[1].value);
  const [notes, setNotes] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void aiStatus().then((status) => setAiConfigured(status.configured));
  }, []);

  const defaultSelection = () => new Set(documents.slice(0, 2).map((document) => document.id));
  const effectiveSelected = selected ?? defaultSelection();

  // Theo dõi subject trên form để panel AI luôn mặc định theo môn đang chọn (pattern adjust-on-prop-change).
  const [prevSubject, setPrevSubject] = useState(defaults.subject);
  if (defaults.subject !== prevSubject) {
    setPrevSubject(defaults.subject);
    setSubject(defaults.subject);
  }

  const toggleDocument = (id: string) => {
    setSelected(() => {
      const base = new Set(selected ?? defaultSelection());
      if (base.has(id)) base.delete(id);
      else base.add(id);
      return base;
    });
  };

  const generate = async () => {
    if (generating) return;
    const chosen = documents.filter((document) => effectiveSelected.has(document.id));
    if (chosen.length === 0) {
      setError('Hãy chọn ít nhất một tài liệu để AI dựa vào đó soạn đề.');
      return;
    }
    if (mcqCount + shortCount + essayCount === 0) {
      setError('Số lượng câu hỏi phải lớn hơn 0.');
      return;
    }

    setError(null);
    setGenerating(true);
    try {
      // Chỉ gửi kèm dữ liệu nhị phân của 3 tài liệu đầu (ảnh/PDF scan).
      let binaryBudget = 3;
      const payload = chosen.map((document) => {
        const item = aiPayloadFromDocument(document);
        if (item.imageData || item.pdfData) {
          if (binaryBudget <= 0) return { ...item, imageData: undefined, pdfData: undefined };
          binaryBudget -= 1;
        }
        return item;
      });

      const options: AiExamOptions = {
        subject,
        grade,
        durationMinutes: defaults.durationMinutes,
        totalPoints: defaults.totalPoints,
        mcqCount,
        shortAnswerCount: shortCount,
        essayCount,
        difficulty,
        examType: defaults.examType,
        notes,
      };

      const { draft } = await aiGenerateExam(payload, options);
      onApply(draft);
      toast.success('AI đã soạn xong đề nháp', 'Kiểm tra lại nội dung rồi công bố cho học sinh nhé.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'AI gặp sự cố, vui lòng thử lại.');
    } finally {
      setGenerating(false);
    }
  };

  if (aiConfigured === false) {
    return (
      <div className="flex items-start gap-3 rounded-3xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-5 shadow-sm">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <Sparkles className="size-5" />
        </span>
        <div className="text-xs font-semibold text-amber-800">
          <p className="text-sm font-black text-amber-900">AI soạn đề</p>
          <p className="mt-1">
            Chưa cấu hình API key. Tạo key miễn phí tại{' '}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              aistudio.google.com/apikey
            </a>
            , rồi thêm <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">GEMINI_API_KEY=...</code> vào{' '}
            <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">.env.local</code> và khởi động lại server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-violet-200/70 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-3 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-violet-600 px-5 py-4 text-left sm:px-7"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white">
          <Sparkles className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black text-white">AI soạn đề từ tài liệu</span>
          <span className="block text-[11px] font-medium text-violet-100">
            Chọn tài liệu → AI tự viết câu hỏi, đáp án và lời giải điền thẳng vào form bên dưới
          </span>
        </span>
        <ChevronDown
          className={cn('size-5 shrink-0 text-white transition-transform', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <div className="space-y-5 p-5 sm:p-7">
          {aiConfigured === null ? (
            <p className="flex items-center gap-2 text-xs font-bold text-slate-400">
              <LoaderCircle className="size-4 animate-spin" /> Đang kiểm tra kết nối AI...
            </p>
          ) : null}

          {documents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-violet-300 bg-violet-50/50 px-4 py-5 text-center">
              <p className="text-xs font-bold text-slate-700">Chưa có tài liệu nào</p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">
                Hãy vào tab <strong>“Tài liệu học tập”</strong> tải lên bài giảng / SGK / đề cũ trước, sau đó quay lại đây.
              </p>
            </div>
          ) : (
            <>
              <div>
                <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500">
                  1. Chọn tài liệu làm nguồn soạn đề
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {documents.map((document) => {
                    const active = effectiveSelected.has(document.id);
                    return (
                      <button
                        key={document.id}
                        type="button"
                        onClick={() => toggleDocument(document.id)}
                        className={cn(
                          'flex items-start gap-2.5 rounded-2xl border p-3 text-left transition',
                          active
                            ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-500/15'
                            : 'border-slate-200 bg-slate-50 hover:border-violet-200',
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-md border transition',
                            active ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 bg-white',
                          )}
                        >
                          {active ? <span className="text-[9px] font-black leading-none">✓</span> : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-bold text-slate-800">{document.title}</span>
                          <span className="block truncate text-[10px] font-medium text-slate-400">
                            {document.content.trim()
                              ? `${document.content.trim().split(/\s+/).length} từ · ${document.fileName}`
                              : `${document.fileName} · AI đọc trực tiếp nội dung ${document.fileType === 'image' ? 'ảnh' : 'PDF scan'}`}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500">
                  2. Cấu hình đề
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold text-slate-500">Môn học</label>
                    <select
                      value={subject}
                      onChange={(event) => setSubject(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-emerald-700 outline-none focus:border-violet-400 focus:bg-white"
                    >
                      {SUBJECTS.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold text-slate-500">Khối lớp</label>
                    <input
                      type="number"
                      min={6}
                      max={12}
                      value={grade}
                      onChange={(event) => setGrade(Number(event.target.value))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-emerald-700 outline-none focus:border-violet-400 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold text-slate-500">Độ khó</label>
                    <select
                      value={difficulty}
                      onChange={(event) => setDifficulty(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-violet-400 focus:bg-white"
                    >
                      {DIFFICULTIES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-bold text-slate-500">TN</label>
                      <input
                        type="number"
                        min={0}
                        max={40}
                        value={mcqCount}
                        onChange={(event) => setMcqCount(Math.max(0, Number(event.target.value) || 0))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-black text-slate-700 outline-none focus:border-violet-400 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold text-slate-500">TLN</label>
                      <input
                        type="number"
                        min={0}
                        max={15}
                        value={shortCount}
                        onChange={(event) => setShortCount(Math.max(0, Number(event.target.value) || 0))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-black text-sky-700 outline-none focus:border-sky-400 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold text-slate-500">TL</label>
                      <input
                        type="number"
                        min={0}
                        max={8}
                        value={essayCount}
                        onChange={(event) => setEssayCount(Math.max(0, Number(event.target.value) || 0))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-black text-amber-700 outline-none focus:border-amber-400 focus:bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500">
                  3. Yêu cầu thêm (không bắt buộc)
                </p>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={2}
                  placeholder="Ví dụ: tập trung vào chương pt bậc 2, tránh trùng các đề trong tài liệu, thêm 2 câu vận dụng cao..."
                  className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-500/20"
                />
              </div>

              {error ? (
                <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  {error}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void generate()}
                disabled={generating}
                className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-violet-950/20 transition hover:opacity-95 disabled:opacity-60"
              >
                {generating ? (
                  <>
                    <LoaderCircle className="size-5 animate-spin" />
                    AI đang đọc tài liệu và soạn đề... (có thể mất 1-2 phút)
                  </>
                ) : (
                  <>
                    <Sparkles className="size-5" />
                    Tạo đề bằng AI
                  </>
                )}
              </button>
              <p className="text-center text-[10px] font-medium text-slate-400">
                Đề do AI soạn sẽ điền vào form bên dưới — bạn nên kiểm tra và chỉnh sửa trước khi công bố cho học sinh.
              </p>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
