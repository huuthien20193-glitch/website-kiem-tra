'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, CircleAlert, LoaderCircle, ScanText, Sparkles } from 'lucide-react';
import type { TeacherDocument } from '@/lib/types';
import { SUBJECTS } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  aiGenerateExam,
  aiPayloadFromDocument,
  aiReadiness,
  type AiExamDraft,
  type AiExamOptions,
  type AiLevelRatios,
} from '@/lib/ai';
import { checkDraft, markNeedsReview, summarizeIssues, type QualityIssue } from '@/lib/quality';
import type { KnowledgeStats } from '@/lib/knowledge';
import { AiKeyBanner } from './AiKeyBanner';
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

const LEVEL_FIELDS: Array<{ key: keyof AiLevelRatios; label: string }> = [
  { key: 'recognize', label: 'Nhận biết' },
  { key: 'understand', label: 'Thông hiểu' },
  { key: 'apply', label: 'Vận dụng' },
  { key: 'applyHigh', label: 'VD cao' },
];

/** Các bước tiến trình hiển thị khi AI đang soạn đề. */
const PHASES = [
  { key: 'sending', label: 'Đang gửi tài liệu cho AI...' },
  { key: 'generating', label: 'AI đang đọc tài liệu và soạn câu hỏi, đáp án, lời giải...' },
  { key: 'checking', label: 'Đang tự kiểm tra chất lượng câu hỏi...' },
] as const;

type Phase = (typeof PHASES)[number]['key'] | 'idle';

export function AiExamPanel({ documents, defaults, onApply }: AiExamPanelProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [keyValid, setKeyValid] = useState<boolean | null>(null);
  /** null = chưa chọn gì, dùng mặc định (2 tài liệu đầu). */
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [subject, setSubject] = useState(defaults.subject);
  const [grade, setGrade] = useState(defaults.grade);
  const [topic, setTopic] = useState('');
  const [useOnlyDocument, setUseOnlyDocument] = useState(true);
  const [mcqCount, setMcqCount] = useState(10);
  const [multiMcqCount, setMultiMcqCount] = useState(0);
  const [trueFalseCount, setTrueFalseCount] = useState(0);
  const [fillBlankCount, setFillBlankCount] = useState(0);
  const [shortCount, setShortCount] = useState(2);
  const [calculationCount, setCalculationCount] = useState(0);
  const [essayCount, setEssayCount] = useState(1);
  const [useLevelRatios, setUseLevelRatios] = useState(false);
  const [ratios, setRatios] = useState<AiLevelRatios>({ recognize: 25, understand: 30, apply: 30, applyHigh: 15 });
  const [difficulty, setDifficulty] = useState(DIFFICULTIES[1].value);
  const [notes, setNotes] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [issues, setIssues] = useState<QualityIssue[]>([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [knowledge, setKnowledge] = useState<KnowledgeStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void aiReadiness().then((readiness) => {
      setAiConfigured(readiness.ready);
      setKeyValid(readiness.reason === 'invalid' ? false : readiness.ready ? true : null);
    });
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

  const totalQuestions =
    mcqCount + shortCount + essayCount + multiMcqCount + trueFalseCount + fillBlankCount + calculationCount;
  const ratioSum = ratios.recognize + ratios.understand + ratios.apply + ratios.applyHigh;

  const generate = async () => {
    if (phase !== 'idle') return;
    const chosen = documents.filter((document) => effectiveSelected.has(document.id));
    if (chosen.length === 0) {
      setError('Hãy chọn ít nhất một tài liệu để AI dựa vào đó soạn đề.');
      return;
    }
    if (totalQuestions === 0) {
      setError('Số lượng câu hỏi phải lớn hơn 0.');
      return;
    }
    if (useLevelRatios && ratioSum <= 0) {
      setError('Tổng tỉ lệ các mức độ phải lớn hơn 0%.');
      return;
    }

    setError(null);
    setIssues([]);
    setPhase('sending');
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
        multiMcqCount,
        trueFalseCount,
        fillBlankCount,
        calculationCount,
        difficulty: useLevelRatios ? 'phân bố theo tỉ lệ mức độ' : difficulty,
        examType: defaults.examType,
        notes,
        topic,
        useOnlyDocument,
        levelRatios: useLevelRatios ? ratios : undefined,
      };

      setPhase('generating');
      const { draft, knowledge: knowledgeStats } = await aiGenerateExam(payload, options);

      setPhase('checking');
      // QC Engine: kiểm tra cấu trúc + căn cứ tài liệu + kiểm chứng câu tính toán.
      const found = checkDraft(draft, {
        documentsText: chosen.map((document) => document.content || '').join('\n'),
        strictGrounding: useOnlyDocument,
      });
      const marked = markNeedsReview(draft, found);
      setIssues(found);
      setReviewCount(marked);
      setKnowledge(knowledgeStats ?? null);
      onApply(draft);
      const summary = summarizeIssues(found);
      if (found.some((issue) => issue.severity === 'error')) {
        toast.warning(
          'AI đã soạn xong nhưng có vấn đề cần kiểm tra',
          `${summary} — xem báo cáo bên dưới và sửa từng câu trong form.`,
        );
      } else {
        toast.success(
          'AI đã soạn xong đề nháp',
          summary ? `Tự kiểm tra: ${summary}. Hãy xem lại trước khi công bố.` : 'Đã qua tự kiểm tra — xem lại rồi công bố nhé.',
        );
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'AI gặp sự cố, vui lòng thử lại.');
    } finally {
      setPhase('idle');
    }
  };

  const notConfigured = aiConfigured === false || (aiConfigured === true && keyValid === false);
  const generating = phase !== 'idle';

  if (notConfigured) {
    return (
      <div className="space-y-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <Sparkles className="size-5" />
          </span>
          <div className="text-xs font-semibold text-amber-800">
            <p className="text-sm font-bold text-amber-900">AI soạn đề</p>
            <p className="mt-1">
              {keyValid === false
                ? 'API key Gemini trên máy chủ không hợp lệ. Dán key của bạn vào ô dưới đây để dùng ngay.'
                : 'Dán API key Gemini của bạn vào ô dưới đây (miễn phí, lấy tại aistudio.google.com/apikey).'}
            </p>
          </div>
        </div>
        <AiKeyBanner reason={keyValid === false ? 'invalid' : 'missing'} onSaved={() => {
          setAiConfigured(true);
          setKeyValid(true);
        }} />
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-violet-200/70 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-3 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-violet-600 px-5 py-4 text-left sm:px-7"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white">
          <Sparkles className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-white">AI soạn đề từ tài liệu</span>
          <span className="block text-xs font-medium text-violet-100">
            7 dạng câu hỏi · chọn mức độ theo tỉ lệ · tự kiểm tra trước khi điền vào form
          </span>
        </span>
        <ChevronDown
          className={cn('size-5 shrink-0 text-white transition-transform', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <div className="space-y-5 p-5 sm:p-7">
          {aiConfigured === null ? (
            <p className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <LoaderCircle className="size-4 animate-spin" /> Đang kiểm tra kết nối AI...
            </p>
          ) : null}

          {documents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-violet-300 bg-violet-50/50 px-4 py-5 text-center">
              <p className="text-xs font-bold text-slate-700">Chưa có tài liệu nào</p>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Hãy vào tab <strong>“Tài liệu học tập”</strong> tải lên bài giảng / SGK / đề cũ trước, sau đó quay lại đây.
              </p>
            </div>
          ) : (
            <>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
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
                          {active ? <span className="text-xs font-bold leading-none">✓</span> : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-bold text-slate-800">{document.title}</span>
                          <span className="block truncate text-xs font-medium text-slate-500">
                            {document.content.trim()
                              ? `${document.content.trim().split(/\s+/).length} từ${document.pageCount ? ` · ${document.pageCount} trang` : ''} · ${document.fileName}`
                              : `${document.fileName} · AI đọc trực tiếp nội dung ${document.fileType === 'image' ? 'ảnh' : 'PDF scan'}`}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  2. Cấu hình đề
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-500">Môn học</label>
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
                    <label className="mb-1 block text-xs font-bold text-slate-500">Khối lớp</label>
                    <input
                      type="number"
                      min={6}
                      max={12}
                      value={grade}
                      onChange={(event) => setGrade(Number(event.target.value))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-emerald-700 outline-none focus:border-violet-400 focus:bg-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-bold text-slate-500">Chủ đề / chương (tùy chọn)</label>
                    <input
                      type="text"
                      value={topic}
                      onChange={(event) => setTopic(event.target.value)}
                      placeholder="Ví dụ: Chương 3 — Phương trình bậc hai (để trống = toàn bộ tài liệu)"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-violet-400 focus:bg-white"
                    />
                  </div>
                </div>

                {/* 7 dạng câu hỏi */}
                <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {[
                    { label: 'TN', value: mcqCount, set: setMcqCount, max: 40, color: 'text-slate-700 focus:border-violet-400' },
                    { label: 'TN nhiều ĐA', value: multiMcqCount, set: setMultiMcqCount, max: 15, color: 'text-indigo-700 focus:border-indigo-400' },
                    { label: 'Đúng/Sai', value: trueFalseCount, set: setTrueFalseCount, max: 10, color: 'text-rose-700 focus:border-rose-400' },
                    { label: 'Điền khuyết', value: fillBlankCount, set: setFillBlankCount, max: 15, color: 'text-cyan-700 focus:border-cyan-400' },
                    { label: 'TLN', value: shortCount, set: setShortCount, max: 15, color: 'text-sky-700 focus:border-sky-400' },
                    { label: 'Tính toán', value: calculationCount, set: setCalculationCount, max: 15, color: 'text-teal-700 focus:border-teal-400' },
                    { label: 'TL', value: essayCount, set: setEssayCount, max: 8, color: 'text-amber-700 focus:border-amber-400' },
                  ].map((field) => (
                    <div key={field.label}>
                      <label className="mb-1 block text-center text-xs font-bold text-slate-500">{field.label}</label>
                      <input
                        type="number"
                        min={0}
                        max={field.max}
                        value={field.value}
                        onChange={(event) => field.set(Math.max(0, Math.min(field.max, Number(event.target.value) || 0)))}
                        className={cn(
                          'w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-bold outline-none focus:bg-white',
                          field.color,
                        )}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-xs font-medium text-slate-500">
                  Tổng: <strong>{totalQuestions}</strong> câu · Điền 0 cho dạng không muốn dùng.
                </p>
              </div>

              {/* Mức độ */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-700">Mức độ câu hỏi</p>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useLevelRatios}
                    onClick={() => setUseLevelRatios((current) => !current)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition',
                      useLevelRatios
                        ? 'border-violet-300 bg-violet-50 text-violet-700'
                        : 'border-slate-200 bg-white text-slate-500',
                    )}
                  >
                    <span
                      className={cn(
                        'relative h-4 w-7 rounded-full transition',
                        useLevelRatios ? 'bg-violet-500' : 'bg-slate-300',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 size-3 rounded-full bg-white shadow-sm transition-all',
                          useLevelRatios ? 'left-3.5' : 'left-0.5',
                        )}
                      />
                    </span>
                    {useLevelRatios ? 'Theo tỉ lệ 4 mức' : 'Theo độ khó chung'}
                  </button>
                </div>

                {useLevelRatios ? (
                  <>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {LEVEL_FIELDS.map((field) => (
                        <div key={field.key}>
                          <label className="mb-1 block text-center text-xs font-bold text-slate-500">{field.label} (%)</label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={ratios[field.key]}
                            onChange={(event) =>
                              setRatios((current) => ({
                                ...current,
                                [field.key]: Math.max(0, Math.min(100, Number(event.target.value) || 0)),
                              }))
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-center text-xs font-bold text-violet-700 outline-none focus:border-violet-400"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <p className={cn('text-xs font-bold', ratioSum === 100 ? 'text-emerald-600' : 'text-amber-600')}>
                        Tổng: {ratioSum}%{ratioSum !== 100 ? ' — AI sẽ làm tròn theo tổng này' : ' — khớp 100%'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setRatios({ recognize: 25, understand: 30, apply: 30, applyHigh: 15 })}
                        className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100"
                      >
                        Mặc định 25/30/30/15
                      </button>
                    </div>
                    {totalQuestions > 0 ? (
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        ≈ {Math.round((ratios.recognize / Math.max(1, ratioSum)) * totalQuestions)} NB ·{' '}
                        {Math.round((ratios.understand / Math.max(1, ratioSum)) * totalQuestions)} TH ·{' '}
                        {Math.round((ratios.apply / Math.max(1, ratioSum)) * totalQuestions)} VD ·{' '}
                        {Math.round((ratios.applyHigh / Math.max(1, ratioSum)) * totalQuestions)} VD cao / {totalQuestions} câu
                      </p>
                    ) : null}
                  </>
                ) : (
                  <div className="mt-3">
                    <select
                      value={difficulty}
                      onChange={(event) => setDifficulty(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-violet-400"
                    >
                      {DIFFICULTIES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Chế độ chỉ dùng tài liệu */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
                <div>
                  <p className="text-xs font-bold text-emerald-800">Chỉ dùng kiến thức trong tài liệu</p>
                  <p className="text-xs font-medium text-emerald-700">
                    Bật: AI không bịa kiến thức ngoài tài liệu. Tắt: AI được bổ sung kiến thức chuẩn của môn.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={useOnlyDocument}
                  onClick={() => setUseOnlyDocument((current) => !current)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition',
                    useOnlyDocument
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-500',
                  )}
                >
                  <span
                    className={cn(
                      'relative h-4 w-7 rounded-full transition',
                      useOnlyDocument ? 'bg-emerald-500' : 'bg-slate-300',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 size-3 rounded-full bg-white shadow-sm transition-all',
                        useOnlyDocument ? 'left-3.5' : 'left-0.5',
                      )}
                    />
                  </span>
                  {useOnlyDocument ? 'Chỉ tài liệu' : 'Cho phép bổ sung'}
                </button>
              </div>

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  3. Yêu cầu thêm (không bắt buộc)
                </p>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={2}
                  placeholder="Ví dụ: tránh trùng các đề trong tài liệu, mỗi câu tự luận có 3 ý, chia 40% câu về chương cuối..."
                  className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium outline-none transition placeholder:text-slate-500 focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-500/20"
                />
              </div>

              {error ? (
                <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  <p className="whitespace-pre-line">{error}</p>
                </div>
              ) : null}

              {/* Báo cáo kho kiến thức + tự kiểm tra sau khi AI soạn xong */}
              {issues.length > 0 || knowledge ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  {knowledge ? (
                    <p className="text-xs font-semibold text-emerald-800">
                      📚 Kho kiến thức: {knowledge.segmentCount} đoạn · {knowledge.documentCount} tài liệu ·{' '}
                      {knowledge.words.toLocaleString('vi-VN')} từ — mỗi câu có kèm nguồn tham chiếu.
                    </p>
                  ) : null}
                  {issues.length > 0 ? (
                    <>
                      <p className="mt-1 flex items-center gap-2 text-xs font-bold text-amber-900">
                        <ScanText className="size-4" />
                        Kết quả tự kiểm tra: {summarizeIssues(issues)}
                        {reviewCount > 0 ? ` · ${reviewCount} câu được đánh dấu "cần xem xét"` : ''}
                      </p>
                      <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
                        {issues.slice(0, 12).map((issue, index) => (
                          <li key={index} className="text-xs font-medium text-amber-800">
                            <span className={issue.severity === 'error' ? 'font-bold text-rose-600' : 'font-bold text-amber-600'}>
                              [{issue.severity === 'error' ? 'LỖI' : 'CẢNH BÁO'}]
                            </span>{' '}
                            {issue.questionLabel}: {issue.message}
                          </li>
                        ))}
                        {issues.length > 12 ? (
                          <li className="text-xs font-bold text-amber-700">... và {issues.length - 12} vấn đề khác</li>
                        ) : null}
                      </ul>
                    </>
                  ) : null}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void generate()}
                disabled={generating}
                className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-violet-950/20 transition hover:opacity-95 disabled:opacity-60"
              >
                {generating ? (
                  <>
                    <LoaderCircle className="size-5 animate-spin" />
                    {PHASES.find((item) => item.key === phase)?.label ?? 'Đang xử lý...'}
                  </>
                ) : (
                  <>
                    <Sparkles className="size-5" />
                    Tạo đề bằng AI
                  </>
                )}
              </button>
              <p className="text-center text-xs font-medium text-slate-500">
                Đề do AI soạn sẽ điền vào form bên dưới — bạn nên kiểm tra và chỉnh sửa trước khi công bố cho học sinh.
              </p>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
