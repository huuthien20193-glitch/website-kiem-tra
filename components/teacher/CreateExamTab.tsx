'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  ChevronDown,
  CircleAlert,
  GraduationCap,
  ImagePlus,
  Images,
  Layers,
  Lightbulb,
  LoaderCircle,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type {
  EssayQuestion,
  Exam,
  ExamType,
  ExtraQuestion,
  Grade,
  McqExplanation,
  McqQuestion,
  ShortAnswerKind,
  ShortAnswerQuestion,
  SubPart,
  TeacherDocument,
} from '@/lib/types';
import { GRADES, OPTION_LABELS, SHORT_KIND_LABELS, SUBJECTS } from '@/lib/types';
import { cn, formatNumber } from '@/lib/utils';
import { imageFilesFromClipboard, optimizeImage } from '@/lib/image';
import { useToast } from '@/components/ui/FeedbackProvider';
import { AiExamPanel } from '@/components/teacher/AiExamPanel';
import { ExtraQuestionsEditor } from '@/components/teacher/ExtraQuestionsEditor';
import {
  aiPayloadFromDocument,
  aiRegenerateQuestion,
  aiGenerateFigure,
  type AiCalculationDraft,
  type AiExamDraft,
  type AiFillBlankDraft,
  type AiShortDraft,
} from '@/lib/ai';
import { normalizeExtraQuestion } from '@/lib/storage';

type CreateExamTabProps = {
  onCreate: (exam: Exam) => boolean | Promise<boolean>;
  onCancel: () => void;
  /** Tài liệu học tập giáo viên đã tải lên — nguồn cho AI soạn đề. */
  documents?: TeacherDocument[];
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

/** Trích nguồn gốc câu hỏi AI (chủ đề, mức độ, trang tham chiếu, cần xem xét). */
function provenanceOf(item: unknown): {
  topic?: string;
  level?: string;
  sourcePages?: number[];
  needsReview?: boolean;
} {
  const raw = item as { topic?: unknown; level?: unknown; sourcePages?: unknown; needsReview?: unknown };
  const sourcePages = Array.isArray(raw?.sourcePages)
    ? raw.sourcePages
        .map((page) => Math.round(Number(page)))
        .filter((page) => Number.isInteger(page) && page >= 1)
        .slice(0, 12)
    : [];
  return {
    topic: typeof raw?.topic === 'string' && raw.topic.trim() ? raw.topic.trim() : undefined,
    level: typeof raw?.level === 'string' && raw.level.trim() ? raw.level.trim() : undefined,
    sourcePages: sourcePages.length > 0 ? sourcePages : undefined,
    needsReview: raw?.needsReview === true ? true : undefined,
  };
}

/** Trích biểu thức kiểm chứng của câu tính toán từ đề nháp AI. */
function computationOf(item: unknown): { expression: string; expected: number } | undefined {
  const raw = (item as { computation?: { expression?: unknown; expected?: unknown } })?.computation;
  const expression = typeof raw?.expression === 'string' ? raw.expression.trim() : '';
  if (!expression) return undefined;
  const expected = Number(raw?.expected);
  return { expression, expected: Number.isFinite(expected) ? expected : 0 };
}

/** Dải chip hiển thị nguồn gốc câu hỏi AI (chủ đề / mức độ / trang tài liệu / cần xem xét). */
export function ProvenanceBadges({ provenance }: { provenance: { topic?: string; level?: string; sourcePages?: number[]; needsReview?: boolean } }) {
  const { topic, level, sourcePages, needsReview } = provenance;
  if (!topic && !level && !sourcePages && !needsReview) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {needsReview ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 ring-1 ring-rose-300">
          <CircleAlert className="size-3" /> Cần xem xét
        </span>
      ) : null}
      {topic ? (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
          📚 {topic}
        </span>
      ) : null}
      {level ? (
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200">
          {level}
        </span>
      ) : null}
      {sourcePages && sourcePages.length > 0 ? (
        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200">
          📄 Trang {sourcePages.join(', ')}
        </span>
      ) : null}
    </div>
  );
}

function NumberBadge({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-xs font-bold text-white shadow-sm">
      {children}
    </span>
  );
}

export function CreateExamTab({ onCreate, onCancel, documents = [] }: CreateExamTabProps) {
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
  /** Nội dung câu trắc nghiệm dạng văn bản (AI hoặc giáo viên nhập), theo index. */
  const [mcqQuestions, setMcqQuestions] = useState<(McqQuestion | null)[]>(() =>
    Array.from({ length: 10 }, () => null),
  );
  const [openTextQuestion, setOpenTextQuestion] = useState<number | null>(null);
  const [openExplanation, setOpenExplanation] = useState(null as number | null);
  const explanationInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [shortAnswerQuestions, setShortAnswerQuestions] = useState<ShortAnswerQuestion[]>([]);
  const [extraQuestions, setExtraQuestions] = useState<ExtraQuestion[]>([]);
  const [essayQuestions, setEssayQuestions] = useState<EssayQuestion[]>([createEmptyEssay(7)]);
  /** Id câu đang được AI tạo lại (nếu có). */
  const [regeneratingId, setRegeneratingId] = useState<string | number | null>(null);
  /** Id câu đang được AI vẽ hình minh họa (nếu có). */
  const [figuringId, setFiguringId] = useState<string | number | null>(null);

  const effectiveMcqCount = hasMcq ? mcqCount : 0;
  const mcqPoints = useMemo(
    () => effectiveMcqCount * mcqPointPerQ,
    [effectiveMcqCount, mcqPointPerQ],
  );
  const shortAnswerPoints = useMemo(
    () => shortAnswerQuestions.reduce((sum, question) => sum + question.points, 0),
    [shortAnswerQuestions],
  );
  const extraPoints = useMemo(
    () => extraQuestions.reduce((sum, question) => sum + question.points, 0),
    [extraQuestions],
  );
  const essayPoints = useMemo(
    () => essayQuestions.reduce((sum, question) => sum + question.points, 0),
    [essayQuestions],
  );
  const configuredPoints = Number((mcqPoints + shortAnswerPoints + extraPoints + essayPoints).toFixed(2));
  const pointsMismatch = Math.abs(configuredPoints - totalPoints) > 0.01;

  const updateMcqCount = (value: number) => {
    const safe = Math.min(60, Math.max(1, Math.round(Number(value) || 1)));
    setMcqCount(safe);
    setMcqAnswers((current) => Array.from({ length: safe }, (_, index) => current[index] ?? 0));
    setMcqExplanations((current) =>
      Array.from({ length: safe }, (_, index) => current[index] ?? { text: '', images: [] }),
    );
    setMcqQuestions((current) => Array.from({ length: safe }, (_, index) => current[index] ?? null));
    setOpenTextQuestion((current) => (current !== null && current >= safe ? null : current));
  };

  const updateMcqQuestion = (index: number, patch: Partial<McqQuestion>) => {
    setMcqQuestions((current) => {
      const item = current[index] ?? { content: '', options: ['', '', '', ''] };
      const next = [...current];
      next[index] = { ...item, ...patch };
      return next;
    });
  };

  const addTextMcq = (index: number) => {
    setMcqQuestions((current) => {
      const next = [...current];
      if (!next[index]) next[index] = { content: '', options: ['', '', '', ''] };
      return next;
    });
    setOpenTextQuestion(index);
  };

  const removeTextMcq = (index: number) => {
    setMcqQuestions((current) => {
      const next = [...current];
      next[index] = null;
      return next;
    });
    if (openTextQuestion === index) setOpenTextQuestion(null);
  };

  const aiNumber = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  /** Điền cả form bằng đề nháp AI vừa sinh (7 dạng câu hỏi). */
  const applyAiDraft = (draft: AiExamDraft) => {
    const aiMcq = Array.isArray(draft?.mcq) ? draft.mcq : [];
    const aiMulti = Array.isArray(draft?.multiMcq) ? draft.multiMcq : [];
    const aiTrueFalse = Array.isArray(draft?.trueFalse) ? draft.trueFalse : [];
    const aiFill = Array.isArray(draft?.fillBlanks) ? draft.fillBlanks : [];
    const aiCalc = Array.isArray(draft?.calculations) ? draft.calculations : [];
    const aiShort = Array.isArray(draft?.shortAnswers) ? draft.shortAnswers : [];
    const aiEssay = Array.isArray(draft?.essays) ? draft.essays : [];

    const aiTotalQuestions =
      aiMcq.length + aiMulti.length + aiTrueFalse.length + aiFill.length + aiCalc.length + aiShort.length + aiEssay.length;
    if (aiTotalQuestions === 0) {
      toast.error('AI không trả về câu hỏi nào', 'Thử đổi tài liệu khác hoặc gửi lại yêu cầu.');
      return;
    }

    // Thông tin chung
    const nextTitle = typeof draft.title === 'string' && draft.title.trim() ? draft.title.trim() : title;
    const aiSubject = String(draft.subject ?? '');
    const nextSubject = SUBJECTS.includes(aiSubject) ? aiSubject : subject;
    const aiGrade = Math.round(aiNumber(draft.grade, grade));
    const nextGrade = GRADES.includes(aiGrade as Grade) ? (aiGrade as Grade) : grade;
    const aiDuration = Math.round(aiNumber(draft.durationMinutes, durationMinutes));
    const nextDuration = Math.min(300, Math.max(1, aiDuration));
    const aiTotal = aiNumber(draft.totalPoints, totalPoints);
    const nextTotal = Number.isFinite(aiTotal) && aiTotal > 0 ? aiTotal : totalPoints;

    // Trắc nghiệm 1 đáp án
    const nextHasMcq = aiMcq.length > 0;
    const nextMcqCount = nextHasMcq ? Math.min(60, aiMcq.length) : effectiveMcqCount;
    const nextMcqQuestions: (McqQuestion | null)[] = [];
    const nextMcqAnswers: number[] = [];
    const nextMcqExplanations: McqExplanation[] = [];
    let hasExplanationText = false;
    aiMcq.slice(0, 60).forEach((item) => {
      const options = Array.isArray(item?.options)
        ? item.options.slice(0, 4).map((option) => String(option ?? '').trim())
        : [];
      while (options.length < 4) options.push('');
      const content = String(item?.content ?? '').trim();
      const figureSvg = typeof item?.figureSvg === 'string' && item.figureSvg.startsWith('data:image/svg') ? item.figureSvg : undefined;
      nextMcqQuestions.push(
        content || options.some(Boolean) || figureSvg
          ? { content, options, image: figureSvg, ...provenanceOf(item) }
          : null,
      );
      nextMcqAnswers.push(Math.min(3, Math.max(0, Math.round(aiNumber(item?.correctIndex, 0)))));
      const explanationText = String(item?.explanation ?? '').trim();
      if (explanationText) hasExplanationText = true;
      nextMcqExplanations.push({ text: explanationText, images: [] });
    });

    // Câu hỏi mở rộng: TN nhiều đáp án + Đúng/Sai — đánh số tiếp sau trắc nghiệm
    const nextExtra: ExtraQuestion[] = [];
    aiMulti.forEach((item, index) => {
      const options = Array.isArray(item?.options)
        ? item.options.slice(0, 4).map((option) => String(option ?? '').trim())
        : [];
      while (options.length < 4) options.push('');
      const correctIndexes = Array.isArray(item?.correctIndexes)
        ? [...new Set(item.correctIndexes.map((value) => Math.min(3, Math.max(0, Math.round(aiNumber(value, 0))))))]
        : [];
      const explanationText = String(item?.explanation ?? '').trim();
      if (explanationText) hasExplanationText = true;
      nextExtra.push({
        id: newId('extra'),
        kind: 'multi-mcq',
        questionLabel: `Câu ${nextMcqCount + index + 1}`,
        points: Math.max(0.25, aiNumber(item?.points, 0.5)),
        content: String(item?.content ?? '').trim(),
        options,
        correctIndexes,
        explanation: { text: explanationText, images: [] },
        questionImage: typeof item?.figureSvg === 'string' ? item.figureSvg : '',
        ...provenanceOf(item),
      });
    });
    aiTrueFalse.forEach((item) => {
      const statements = Array.isArray(item?.statements)
        ? item.statements.slice(0, 4).map((statement, statementIndex) => ({
            text: String(statement?.text ?? '').trim(),
            answer: statement?.answer === true || statement?.answer === 'true' || statementIndex % 2 === 0,
          }))
        : [];
      const explanationText = String(item?.explanation ?? '').trim();
      if (explanationText) hasExplanationText = true;
      nextExtra.push({
        id: newId('extra'),
        kind: 'true-false',
        questionLabel: `Câu ${nextMcqCount + nextExtra.length + 1}`,
        points: Math.max(0.5, aiNumber(item?.points, 1)),
        content: String(item?.content ?? '').trim(),
        statements,
        explanation: { text: explanationText, images: [] },
        questionImage: typeof item?.figureSvg === 'string' ? item.figureSvg : '',
        ...provenanceOf(item),
      });
    });

    // Trả lời ngắn + điền khuyết + tính toán — đánh số tiếp sau câu hỏi mở rộng
    const nextShort: ShortAnswerQuestion[] = [];
    // Hợp nhất 3 loại draft để xử lý chung; điền khuyết lấy đáp án từ từng chỗ trống.
    type ShortDraftItem = Partial<AiFillBlankDraft & AiCalculationDraft & AiShortDraft>;
    const fillAndShort: Array<{ item: ShortDraftItem; kind: ShortAnswerKind }> = [
      ...aiFill.map((item) => ({ item: { ...item }, kind: 'fill-blank' as const })),
      ...aiCalc.map((item) => ({ item: { ...item }, kind: 'calculation' as const })),
      ...aiShort.map((item) => ({ item: { ...item }, kind: 'text' as const })),
    ];
    fillAndShort.forEach(({ item, kind }, index) => {
      const content = String(item?.content ?? '').trim();
      let answer = String(item?.answer ?? '').trim();
      if (kind === 'fill-blank') {
        // Ghép đáp án từng chỗ trống theo thứ tự, cách nhau bởi | để chấm tự động.
        const blanks = Array.isArray(item?.blanks)
          ? item.blanks.map((blank) => String(blank?.answer ?? '').trim()).filter(Boolean)
          : [];
        if (blanks.length > 0) answer = blanks.join(' | ');
      }
      const explanationText = String(item?.explanation ?? '').trim();
      if (explanationText) hasExplanationText = true;
      nextShort.push({
        id: newId('short'),
        questionLabel: `Câu ${nextMcqCount + nextExtra.length + index + 1}`,
        points: Math.max(0.25, aiNumber(item?.points, 1)),
        questionImage: typeof item?.figureSvg === 'string' ? item.figureSvg : '',
        content,
        answer,
        rubric: '',
        kind,
        explanation: { text: explanationText, images: [] },
        computation: kind === 'calculation' ? computationOf(item) : undefined,
        ...provenanceOf(item),
      });
    });

    // Tự luận — đánh số tiếp sau trả lời ngắn
    const nextEssay: EssayQuestion[] = aiEssay.map((item, index) => {
      const subParts: SubPart[] = Array.isArray(item?.subParts)
        ? item.subParts.slice(0, 8).map((part, partIndex) => ({
            label: String(part?.label ?? '') || String.fromCharCode(97 + partIndex),
            content: String(part?.content ?? '').trim(),
            points: Math.max(0, aiNumber(part?.points, 1)),
          }))
        : [{ label: 'a', content: String(item?.content ?? '').trim(), points: 2 }];
      const total = Number(subParts.reduce((sum, part) => sum + part.points, 0).toFixed(2));
      return {
        id: newId(),
        questionLabel: `Câu ${nextMcqCount + nextExtra.length + nextShort.length + index + 1}`,
        points: total > 0 ? total : Math.max(0, aiNumber(item?.points, 2)),
        questionImage: typeof item?.figureSvg === 'string' ? item.figureSvg : '',
        subParts,
        rubric: String(item?.rubric ?? '').trim(),
        ...provenanceOf(item),
      };
    });

    // Điểm mỗi câu TN = phần điểm còn lại của thang điểm
    const nextExtraPoints = nextExtra.reduce((sum, question) => sum + question.points, 0);
    const shortPoints = nextShort.reduce((sum, question) => sum + question.points, 0);
    const essayPointsTotal = nextEssay.reduce((sum, question) => sum + question.points, 0);
    const remaining = nextTotal - shortPoints - essayPointsTotal - nextExtraPoints;
    const nextMcqPointPerQ =
      nextMcqCount > 0 && remaining > 0
        ? Math.round((remaining / nextMcqCount) * 100) / 100
        : mcqPointPerQ;

    setTitle(nextTitle);
    setSubject(nextSubject);
    setGrade(nextGrade);
    setDurationMinutes(nextDuration);
    setTotalPoints(nextTotal);
    setHasMcq(nextHasMcq);
    setMcqCount(Math.max(1, nextMcqCount));
    setMcqPointPerQ(nextMcqPointPerQ);
    setMcqAnswers(nextMcqAnswers);
    setMcqQuestions(nextMcqQuestions);
    setMcqExplanations(nextMcqExplanations);
    setMcqExplanationEnabled(hasExplanationText);
    setExtraQuestions(nextExtra);
    setShortAnswerQuestions(nextShort);
    setEssayQuestions(nextEssay);
    setOpenTextQuestion(null);
    setOpenExplanation(null);

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  /** Gom payload tài liệu gửi cho AI (giới hạn 3 tài liệu nhị phân đầu). */
  const buildAiPayload = () => {
    let binaryBudget = 3;
    return documents.map((document) => {
      const item = aiPayloadFromDocument(document);
      if (item.imageData || item.pdfData) {
        if (binaryBudget <= 0) return { ...item, imageData: undefined, pdfData: undefined };
        binaryBudget -= 1;
      }
      return item;
    });
  };

  /** Danh sách nội dung các câu khác để AI tránh trùng khi tạo lại một câu. */
  const buildExcludeList = (kind: string, targetId: string | number): string[] => {
    const exclude: string[] = [];
    mcqQuestions.forEach((question, index) => {
      if (question && !(kind === 'mcq' && Number(targetId) === index)) exclude.push(question.content);
    });
    shortAnswerQuestions.forEach((question) => {
      if (!(kind !== 'mcq' && String(question.id) === String(targetId))) exclude.push(question.content);
    });
    extraQuestions.forEach((question) => {
      if (!(kind !== 'mcq' && String(question.id) === String(targetId))) exclude.push(question.content);
    });
    essayQuestions.forEach((question) => {
      if (!(kind === 'essay' && String(question.id) === String(targetId))) {
        question.subParts.forEach((part) => exclude.push(part.content));
      }
    });
    return exclude.filter((item) => item.trim());
  };

  /** Yêu cầu AI tạo lại MỘT câu hỏi — không ảnh hưởng các câu còn lại. */
  const regenerateQuestion = async (
    kind: 'mcq' | 'multi-mcq' | 'true-false' | 'fill-blank' | 'short' | 'calculation' | 'essay',
    targetId: string | number,
  ) => {
    if (regeneratingId) return;
    setRegeneratingId(targetId);
    try {
      const { question } = await aiRegenerateQuestion({
        documents: buildAiPayload(),
        kind,
        subject,
        grade,
        instruction: '',
        exclude: buildExcludeList(kind, targetId),
      });
      applyRegeneratedQuestion(kind, targetId, question);
      toast.success('Đã tạo lại câu hỏi', 'AI đã viết câu mới — kiểm tra lại đáp án nhé.');
    } catch (error) {
      toast.error('AI gặp sự cố', error instanceof Error ? error.message : 'Vui lòng thử lại.');
    } finally {
      setRegeneratingId(null);
    }
  };

  /** Yêu cầu AI vẽ hình minh họa SVG cho một câu hỏi rồi gắn vào ảnh đề của câu đó. */
  const generateFigure = async (target: 'mcq' | 'short' | 'essay', targetId: string | number) => {
    if (figuringId) return;
    setFiguringId(targetId);
    try {
      // Gom nội dung câu hỏi theo loại để AI hiểu phải vẽ hình gì.
      let content = '';
      if (target === 'mcq' && typeof targetId === 'number') {
        content = mcqQuestions[targetId]?.content ?? '';
      } else if (target === 'short') {
        content = shortAnswerQuestions.find((question) => String(question.id) === String(targetId))?.content ?? '';
      } else {
        content =
          essayQuestions
            .find((question) => String(question.id) === String(targetId))
            ?.subParts.map((part) => part.content)
            .filter(Boolean)
            .join('\n') ?? '';
      }
      if (!content.trim()) {
        toast.error('Chưa có nội dung câu hỏi', 'Nhập nội dung câu hỏi trước khi yêu cầu AI vẽ hình.');
        setFiguringId(null);
        return;
      }
      const { figureSvg } = await aiGenerateFigure({ documents: buildAiPayload(), content });
      if (target === 'mcq' && typeof targetId === 'number') {
        updateMcqQuestion(targetId, { image: figureSvg });
      } else if (target === 'short') {
        updateShortAnswer(targetId, { questionImage: figureSvg });
      } else {
        updateEssay(targetId, { questionImage: figureSvg });
      }
      toast.success('Đã tạo hình minh họa', 'AI đã vẽ hình SVG — xem lại trước khi xuất bản nhé.');
    } catch (error) {
      toast.error('AI không vẽ được hình', error instanceof Error ? error.message : 'Vui lòng thử lại.');
    } finally {
      setFiguringId(null);
    }
  };

  /** Gán câu hỏi AI vừa tạo lại vào đúng vị trí cũ trên form. */
  const applyRegeneratedQuestion = (
    kind: 'mcq' | 'multi-mcq' | 'true-false' | 'fill-blank' | 'short' | 'calculation' | 'essay',
    targetId: string | number,
    question: Record<string, unknown>,
  ) => {
    const content = String(question?.content ?? '').trim();
    const explanationText = String(question?.explanation ?? '').trim();
    const points = Math.max(0, aiNumber(question?.points, 1));

    if (kind === 'mcq' && typeof targetId === 'number') {
      const options = Array.isArray(question?.options)
        ? question.options.slice(0, 4).map((option) => String(option ?? '').trim())
        : [];
      while (options.length < 4) options.push('');
      updateMcqQuestion(targetId, {
        content,
        options,
        image: typeof question?.figureSvg === 'string' ? question.figureSvg : undefined,
        ...provenanceOf(question),
      });
      setMcqAnswers((current) => {
        const next = [...current];
        next[targetId] = Math.min(3, Math.max(0, Math.round(aiNumber(question?.correctIndex, 0))));
        return next;
      });
      setMcqExplanations((current) =>
        current.map((item, index) => (index === targetId ? { text: explanationText, images: [] } : item)),
      );
      return;
    }

    if (kind === 'multi-mcq' || kind === 'true-false') {
      // Tạo lại câu hỏi mở rộng: giữ nguyên kind/label, chỉ thay nội dung AI trả về.
      setExtraQuestions((current) =>
        current.map((item) => {
          if (String(item.id) !== String(targetId)) return item;
          return normalizeExtraQuestion(
            {
              ...item,
              content,
              points,
              ...provenanceOf(question),
              options: Array.isArray(question?.options)
                ? question.options.slice(0, 4).map((option) => String(option ?? '').trim())
                : undefined,
              correctIndexes: Array.isArray(question?.correctIndexes)
                ? question.correctIndexes.map((value) => Math.min(3, Math.max(0, Math.round(aiNumber(value, 0)))))
                : undefined,
              statements: Array.isArray(question?.statements)
                ? question.statements.slice(0, 4).map((statement) => ({
                    text: String(statement?.text ?? '').trim(),
                    answer: statement?.answer === true || statement?.answer === 'true',
                  }))
                : undefined,
              explanation: { text: explanationText, images: [] },
            },
            0,
          );
        }),
      );
      return;
    }

    if (kind === 'essay') {
      // EssayQuestion không có cột content — nội dung nằm trong subParts.
      updateEssay(targetId, {
        points,
        rubric: String(question?.rubric ?? '').trim(),
        questionImage: typeof question?.figureSvg === 'string' ? question.figureSvg : undefined,
        subParts: Array.isArray(question?.subParts)
          ? question.subParts.slice(0, 8).map((part, index) => ({
              label: String(part?.label ?? '') || String.fromCharCode(97 + index),
              content: String(part?.content ?? '').trim(),
              points: Math.max(0, aiNumber(part?.points, 1)),
            }))
          : [{ label: 'a', content, points }],
        ...provenanceOf(question),
      });
      return;
    }

    // short / fill-blank / calculation
    let answer = String(question?.answer ?? '').trim();
    if (kind === 'fill-blank') {
      const blanks = Array.isArray(question?.blanks)
        ? question.blanks.map((blank) => String(blank?.answer ?? '').trim()).filter(Boolean)
        : [];
      if (blanks.length > 0) answer = blanks.join(' | ');
    }
    updateShortAnswer(targetId, {
      content,
      answer,
      points,
      questionImage: typeof question?.figureSvg === 'string' ? question.figureSvg : undefined,
      computation: kind === 'calculation' ? computationOf(question) : undefined,
      ...provenanceOf(question),
    });
    updateShortExplanation(targetId, { text: explanationText, images: [] });
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
    setMcqQuestions(Array.from({ length: 10 }, () => null));
    setOpenTextQuestion(null);
    setOpenExplanation(null);
    setShortAnswerQuestions([]);
    setExtraQuestions([]);
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

    if (effectiveMcqCount + shortAnswerQuestions.length + extraQuestions.length + essayQuestions.length === 0) {
      toast.error('Đề chưa có câu hỏi', 'Hãy thêm ít nhất một câu hỏi vào đề trước khi công bố.');
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

    // Kiểm tra câu hỏi mở rộng có đủ đáp án đúng không.
    const badMulti = extraQuestions.find(
      (question) => question.kind === 'multi-mcq' && (question.correctIndexes ?? []).length === 0,
    );
    if (badMulti) {
      toast.error(
        'Thiếu đáp án câu trắc nghiệm nhiều đáp án',
        `Vui lòng chọn ít nhất một phương án đúng cho ${badMulti.questionLabel.trim() || 'câu hỏi'}.`,
      );
      return;
    }
    const badTrueFalse = extraQuestions.find(
      (question) =>
        question.kind === 'true-false' &&
        (question.statements ?? []).length < 2,
    );
    if (badTrueFalse) {
      toast.error(
        'Câu Đúng/Sai chưa có ý nhận định',
        `${badTrueFalse.questionLabel.trim() || 'Câu hỏi'} cần ít nhất 2 ý nhận định.`,
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
      mcqQuestions: hasMcq ? mcqQuestions.slice(0, effectiveMcqCount) : [],
      mcqExplanationEnabled: hasMcq ? mcqExplanationEnabled : false,
      mcqExplanations: hasMcq
        ? mcqExplanations.slice(0, effectiveMcqCount).map((item) => ({
            text: (item.text || '').trim(),
            images: item.images,
          }))
        : [],
      extraQuestions: extraQuestions.map((question) => ({
        ...question,
        questionLabel: question.questionLabel.trim() || 'Câu hỏi',
        points: Number(question.points) || 0,
        content: (question.content || '').trim(),
        options: question.options?.map((option) => option.trim()) ?? undefined,
        correctIndexes: question.correctIndexes ?? undefined,
        statements: question.statements?.map((statement) => ({ ...statement })) ?? undefined,
        explanation: question.explanation
          ? { text: (question.explanation.text || '').trim(), images: question.explanation.images }
          : undefined,
      })),
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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Tạo đề kiểm tra mới</h1>
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
        {/* AI soạn đề — luôn hiển thị, panel tự báo thiếu API key / thiếu tài liệu */}
        <AiExamPanel
          documents={documents}
          defaults={{
            subject,
            grade,
            durationMinutes,
            totalPoints,
            examType: examType === 'practice' ? 'practice' : 'official',
          }}
          onApply={applyAiDraft}
        />

        {/* STEP 1 */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
            <NumberBadge>1</NumberBadge>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Thông tin chung</h2>
              <p className="text-xs font-medium text-slate-500">Tên đề, môn học, thời gian và thang điểm</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Tên đề kiểm tra <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ví dụ: Kiểm tra giữa kì I – Toán 9"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-medium placeholder:text-slate-500 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Môn học</label>
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
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
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
                    'rounded-2xl border px-3 py-2.5 text-sm font-bold transition',
                    grade === item
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-emerald-200 hover:text-emerald-700',
                  )}
                >
                  Lớp {item}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs font-medium text-slate-500">
              Đề sẽ được nhóm theo khối này ở trang quản lý và trang làm bài của học sinh.
            </p>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Thời gian làm bài (phút) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={300}
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(Number(event.target.value))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-emerald-700 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
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
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Thang điểm tổng
              </label>
              <input
                type="number"
                min={1}
                step={0.5}
                value={totalPoints}
                onChange={(event) => setTotalPoints(Number(event.target.value))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-teal-700 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
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
              TN {formatNumber(mcqPoints, 2)}đ · Mở rộng {formatNumber(extraPoints, 2)}đ · TLN{' '}
              {formatNumber(shortAnswerPoints, 2)}đ · TL {formatNumber(essayPoints, 2)}đ
            </span>
          </div>
        </section>

        {/* STEP 2 */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex flex-wrap items-center gap-3 border-b border-slate-100 pb-4">
            <NumberBadge>2</NumberBadge>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-slate-900">Phần trắc nghiệm</h2>
              <p className="text-xs font-medium text-slate-500">
                {hasMcq
                  ? 'Tải ảnh đề, soạn câu hỏi văn bản hoặc để AI soạn — rồi chọn đáp án đúng cho từng câu'
                  : 'Đề này không có phần trắc nghiệm'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={hasMcq}
              onClick={() => setHasMcq((current) => !current)}
              className={cn(
                'inline-flex items-center gap-3 rounded-2xl border-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition',
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
            <p className="mt-1 text-xs font-medium text-slate-500">
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image} alt={`Trang đề ${index + 1}`} className="max-h-full max-w-full rounded-lg object-contain" />
                    <span className="absolute bottom-1 left-1 rounded-md bg-slate-950/70 px-1.5 py-0.5 text-xs font-bold text-white">
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
              <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Đáp án đúng từng câu</label>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
                {mcqCount} câu · {formatNumber(mcqPoints, 2)} điểm
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: mcqCount }).map((_, index) => (
                <div key={index} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <span className="flex min-w-0 items-center gap-1.5 pl-1">
                    <button
                      type="button"
                      onClick={() => (mcqQuestions[index] ? setOpenTextQuestion(index) : addTextMcq(index))}
                      title={
                        mcqQuestions[index]
                          ? 'Sửa nội dung câu hỏi văn bản'
                          : 'Soạn nội dung câu này bằng văn bản'
                      }
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition',
                        mcqQuestions[index]
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'border border-slate-200 bg-white text-slate-500 hover:border-violet-300 hover:text-violet-600',
                      )}
                    >
                      Aa
                    </button>
                    <span className="text-xs font-bold text-slate-700">Câu {index + 1}</span>
                    {mcqQuestions[index] ? (
                      <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-bold text-violet-700">
                        có nội dung
                      </span>
                    ) : null}
                  </span>
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
                          'flex size-7 items-center justify-center rounded-lg text-xs font-bold transition',
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

          {/* Nội dung câu hỏi trắc nghiệm dạng văn bản */}
          {mcqQuestions.some(Boolean) ? (
            <div className="mt-6 border-t border-slate-100 pt-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                    <Sparkles className="size-4 text-violet-500" />
                    Nội dung câu hỏi văn bản
                  </label>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">
                    Câu có nội dung văn bản sẽ hiển thị trực tiếp cho học sinh, không cần ảnh đề. Đáp án đúng chọn ở bảng phía trên.
                  </p>
                </div>
                <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700">
                  {mcqQuestions.filter(Boolean).length}/{mcqCount} câu có nội dung
                </span>
              </div>

              <div className="space-y-2">
                {mcqQuestions.map((question, index) =>
                  question ? (
                    <div key={index} className="overflow-hidden rounded-2xl border border-violet-200 bg-violet-50/40">
                      <div className="flex items-center justify-between gap-2 px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => setOpenTextQuestion(openTextQuestion === index ? null : index)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-bold text-violet-700 ring-1 ring-violet-200">
                            {index + 1}
                          </span>
                          <span className="truncate text-xs font-bold text-slate-700">
                            {question.content.trim() || '(chưa nhập nội dung)'}
                          </span>
                          <ChevronDown
                            className={cn(
                              'ml-auto size-4 shrink-0 text-slate-500 transition-transform',
                              openTextQuestion === index && 'rotate-180',
                            )}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeTextMcq(index)}
                          className="shrink-0 rounded-lg p-1.5 text-rose-500 transition hover:bg-rose-100"
                          aria-label={`Xóa nội dung câu ${index + 1}`}
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>

                      {openTextQuestion === index ? (
                        <div className="space-y-3 border-t border-violet-100 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <ProvenanceBadges provenance={question} />
                            <div className="flex items-center gap-1.5">
                              {question.image ? (
                                <button
                                  type="button"
                                  onClick={() => updateMcqQuestion(index, { image: undefined })}
                                  className="inline-flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-bold text-rose-500 transition hover:bg-rose-100"
                                >
                                  <X className="size-3.5" /> Gỡ hình
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => void generateFigure('mcq', index)}
                                disabled={figuringId !== null}
                                title="Yêu cầu AI vẽ hình minh họa cho câu này"
                                className="inline-flex items-center gap-1 rounded-xl border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs font-bold text-teal-700 transition hover:bg-teal-100 disabled:opacity-60"
                              >
                                {figuringId === index ? (
                                  <LoaderCircle className="size-3.5 animate-spin" />
                                ) : (
                                  <Images className="size-3.5" />
                                )}
                                AI vẽ hình
                              </button>
                            </div>
                          </div>
                          {question.image ? (
                            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={question.image}
                                alt={`Hình minh họa câu ${index + 1}`}
                                className="max-h-44 w-full rounded-lg bg-white object-contain"
                              />
                            </div>
                          ) : null}
                          <textarea
                            value={question.content}
                            onChange={(event) =>
                              updateMcqQuestion(index, { content: event.target.value })
                            }
                            rows={3}
                            placeholder={`Nội dung câu ${index + 1}... (hỗ trợ nhiều dòng)`}
                            className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium outline-none transition placeholder:text-slate-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
                          />
                          <div className="grid gap-2 sm:grid-cols-2">
                            {OPTION_LABELS.map((label, optionIndex) => (
                              <div key={label} className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setMcqAnswers((current) => {
                                      const next = [...current];
                                      next[index] = optionIndex;
                                      return next;
                                    })
                                  }
                                  title="Chọn làm đáp án đúng" aria-label="Chọn làm đáp án đúng"
                                  className={cn(
                                    'flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition',
                                    (mcqAnswers[index] ?? 0) === optionIndex
                                      ? 'bg-emerald-600 text-white shadow-sm'
                                      : 'border border-slate-200 bg-white text-slate-500 hover:border-emerald-300 hover:text-emerald-600',
                                  )}
                                >
                                  {label}
                                </button>
                                <input
                                  type="text"
                                  value={question.options[optionIndex] ?? ''}
                                  onChange={(event) => {
                                    const options = [...question.options];
                                    options[optionIndex] = event.target.value;
                                    updateMcqQuestion(index, { options });
                                  }}
                                  placeholder={`Nội dung phương án ${label}`}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium outline-none transition placeholder:text-slate-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null,
                )}
              </div>
            </div>
          ) : null}

          <div className="mt-6 border-t border-slate-100 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                  <Lightbulb className="size-4 text-amber-500" />
                  Lời giải từng câu <span className="font-medium normal-case text-slate-500">(tùy chọn)</span>
                </label>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  Ghi bằng chữ hoặc ảnh. Bật công tắc để học sinh xem lời giải (trắc nghiệm + trả lời ngắn) sau khi nộp bài và ra điểm.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={mcqExplanationEnabled}
                onClick={() => setMcqExplanationEnabled((current) => !current)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition',
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
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                          {index + 1}
                        </span>
                        <span
                          className={cn(
                            'text-xs font-bold',
                            hasContent ? 'text-emerald-700' : 'text-slate-500',
                          )}
                        >
                          {hasContent ? 'Đã có lời giải' : 'Chưa có lời giải'}
                        </span>
                      </span>
                      <ChevronDown
                        className={cn('size-4 shrink-0 text-slate-500 transition-transform', open && 'rotate-180')}
                      />
                    </button>

                    {open ? (
                      <div className="border-t border-slate-200 p-3">
                        <textarea
                          value={explanation.text}
                          onChange={(event) => updateExplanation(index, { text: event.target.value })}
                          rows={2}
                          placeholder={`Giải thích tại sao đáp án ${OPTION_LABELS[mcqAnswers[index] ?? 0]} đúng...`}
                          className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium outline-none transition placeholder:text-slate-500 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20"
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
                            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-100"
                          >
                            <ImagePlus className="size-4" />
                            Thêm ảnh / dán Ctrl + V
                          </button>
                          {explanation.images.length > 0 ? (
                            <span className="text-xs font-bold text-slate-500">
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

        {/* Câu hỏi dạng mở rộng: TN nhiều đáp án + Đúng/Sai */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
            <NumberBadge>3</NumberBadge>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Câu hỏi trắc nghiệm nhiều đáp án &amp; Đúng/Sai</h2>
              <p className="text-xs font-medium text-slate-500">
                Chấm tự động — TN nhiều đáp án phải chọn đúng toàn bộ, Đúng/Sai có điểm từng ý
              </p>
            </div>
          </div>

          <ExtraQuestionsEditor
            questions={extraQuestions}
            numberingStart={effectiveMcqCount + 1}
            regeneratingId={regeneratingId}
            onRegenerate={(id) => {
              const target = extraQuestions.find((question) => String(question.id) === String(id));
              void regenerateQuestion(target?.kind === 'true-false' ? 'true-false' : 'multi-mcq', id);
            }}
            onChange={setExtraQuestions}
          />
        </section>

        {/* STEP 4 */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
            <NumberBadge>4</NumberBadge>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Phần trả lời ngắn</h2>
              <p className="text-xs font-medium text-slate-500">
                Học sinh gõ đáp án trực tiếp — hệ thống tự chấm theo đáp án đúng
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {shortAnswerQuestions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-center">
                <p className="text-xs font-bold text-slate-600">Chưa có câu trả lời ngắn</p>
                <p className="mt-1 text-xs font-medium text-slate-500">
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
                    <span className="flex size-8 items-center justify-center rounded-xl bg-white text-xs font-bold text-sky-700 shadow-sm ring-1 ring-slate-200">
                      {questionIndex + 1}
                    </span>
                    <input
                      type="text"
                      value={question.questionLabel}
                      onChange={(event) =>
                        updateShortAnswer(question.id, { questionLabel: event.target.value })
                      }
                      placeholder="Câu 1"
                      className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-sky-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
                    />
                    {(question.kind ?? 'text') !== 'text' ? (
                      <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-bold text-cyan-700 ring-1 ring-cyan-600/10">
                        {SHORT_KIND_LABELS[question.kind ?? 'text']}
                      </span>
                    ) : null}
                    <span className="text-xs font-bold text-slate-500">Điểm câu:</span>
                    <input
                      type="number"
                      min={0}
                      step={0.25}
                      value={question.points}
                      onChange={(event) =>
                        updateShortAnswer(question.id, { points: Number(event.target.value) })
                      }
                      className="w-20 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-center text-xs font-bold text-sky-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void regenerateQuestion(
                          question.kind === 'fill-blank'
                            ? 'fill-blank'
                            : question.kind === 'calculation'
                              ? 'calculation'
                              : 'short',
                          question.id,
                        )
                      }
                      disabled={regeneratingId !== null}
                      title="Yêu cầu AI tạo lại câu này"
                      className="inline-flex items-center gap-1 rounded-xl border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-bold text-violet-700 transition hover:bg-violet-100 disabled:opacity-60"
                    >
                      {regeneratingId === question.id ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="size-3.5" />
                      )}
                      Tạo lại
                    </button>
                    <button
                      type="button"
                      onClick={() => void generateFigure('short', question.id)}
                      disabled={figuringId !== null}
                      title="Yêu cầu AI vẽ hình minh họa cho câu này"
                      className="inline-flex items-center gap-1 rounded-xl border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs font-bold text-teal-700 transition hover:bg-teal-100 disabled:opacity-60"
                    >
                      {figuringId === question.id ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : (
                        <Images className="size-3.5" />
                      )}
                      AI vẽ hình
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setShortAnswerQuestions((current) =>
                          current.filter((item) => item.id !== question.id),
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold text-rose-500 transition hover:bg-rose-100"
                    >
                      <Trash2 className="size-3.5" /> Xóa câu
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <ProvenanceBadges provenance={question} />
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr]">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
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
                        {/* eslint-disable-next-line @next/next/no-img-element */}
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
                        <span className="text-xs font-bold">Chọn ảnh đề</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                        Nội dung câu hỏi
                      </label>
                      <textarea
                        value={question.content}
                        onChange={(event) =>
                          updateShortAnswer(question.id, { content: event.target.value })
                        }
                        rows={2}
                        placeholder="Ví dụ: Tính giá trị của biểu thức..."
                        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium outline-none transition placeholder:text-slate-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                        Đáp án đúng <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={question.answer}
                        onChange={(event) =>
                          updateShortAnswer(question.id, { answer: event.target.value })
                        }
                        placeholder="Ví dụ: 4 | bốn | 2^2 (nhiều đáp án cách nhau bởi | hoặc ;)"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-sky-700 outline-none transition placeholder:font-medium placeholder:text-slate-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
                      />
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        Không phân biệt hoa thường, tự động chấp nhận 0,5 và 0.5.
                      </p>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                        Hướng dẫn chấm (tùy chọn)
                      </label>
                      <input
                        type="text"
                        value={question.rubric || ''}
                        onChange={(event) =>
                          updateShortAnswer(question.id, { rubric: event.target.value })
                        }
                        placeholder="Ví dụ: Đúng đơn vị mới được tính điểm..."
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium outline-none transition placeholder:text-slate-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
                      />
                    </div>
                    <div
                      data-paste-short-explanation={String(question.id)}
                      className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3"
                    >
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-amber-700">
                        Lời giải (tùy chọn) — học sinh xem sau khi nộp bài
                      </label>
                      <textarea
                        value={question.explanation?.text ?? ''}
                        onChange={(event) => updateShortExplanation(question.id, { text: event.target.value })}
                        rows={2}
                        placeholder="Ví dụ: Vì 2² = 4, nên căn bậc hai của 4 là ±2..."
                        className="w-full resize-y rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-xs font-medium outline-none transition placeholder:text-slate-500 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20"
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
                          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-100"
                        >
                          <ImagePlus className="size-4" />
                          Thêm ảnh / dán Ctrl + V
                        </button>
                        {question.explanation?.images && question.explanation.images.length > 0 ? (
                          <span className="text-xs font-bold text-slate-500">
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

        {/* STEP 5 */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
            <NumberBadge>5</NumberBadge>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Phần tự luận</h2>
              <p className="text-xs font-medium text-slate-500">Chia câu hỏi thành các ý a, b, c... và đặt điểm tương ứng</p>
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
                      <span className="flex size-8 items-center justify-center rounded-xl bg-white text-xs font-bold text-emerald-700 shadow-sm ring-1 ring-slate-200">
                        {questionIndex + 1}
                      </span>
                      <input
                        type="text"
                        value={question.questionLabel}
                        onChange={(event) => updateEssay(question.id, { questionLabel: event.target.value })}
                        placeholder="Câu 7"
                        className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                      />
                      <span className="text-xs font-bold text-slate-500">Điểm câu:</span>
                      <input
                        type="number"
                        min={0}
                        step={0.25}
                        value={question.points}
                        onChange={(event) => updateEssay(question.id, { points: Number(event.target.value) })}
                        className="w-20 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-center text-xs font-bold text-emerald-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void regenerateQuestion('essay', question.id)}
                        disabled={regeneratingId !== null}
                        title="Yêu cầu AI tạo lại câu này"
                        className="inline-flex items-center gap-1 self-start rounded-xl border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-bold text-violet-700 transition hover:bg-violet-100 disabled:opacity-60 sm:self-auto"
                      >
                        {regeneratingId === question.id ? (
                          <LoaderCircle className="size-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="size-3.5" />
                        )}
                        Tạo lại
                      </button>
                      <button
                        type="button"
                        onClick={() => void generateFigure('essay', question.id)}
                        disabled={figuringId !== null}
                        title="Yêu cầu AI vẽ hình minh họa cho câu này"
                        className="inline-flex items-center gap-1 self-start rounded-xl border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs font-bold text-teal-700 transition hover:bg-teal-100 disabled:opacity-60 sm:self-auto"
                      >
                        {figuringId === question.id ? (
                          <LoaderCircle className="size-3.5 animate-spin" />
                        ) : (
                          <Images className="size-3.5" />
                        )}
                        AI vẽ hình
                      </button>
                      <button
                        type="button"
                        onClick={() => setEssayQuestions((current) => current.filter((item) => item.id !== question.id))}
                        className="inline-flex items-center gap-1 self-start rounded-xl px-2.5 py-1.5 text-xs font-bold text-rose-500 transition hover:bg-rose-100 sm:self-auto"
                      >
                        <Trash2 className="size-3.5" /> Xóa câu
                      </button>
                    </div>
                  </div>

                  <div className="mt-3">
                    <ProvenanceBadges provenance={question} />
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr]">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
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
                          {/* eslint-disable-next-line @next/next/no-img-element */}
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
                          <span className="text-xs font-bold">Chọn ảnh / dán Ctrl + V</span>
                        </button>
                      )}
                    </div>

                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Các ý nhỏ</label>
                        {outOfSync ? (
                          <button
                            type="button"
                            onClick={() => syncQuestionPoints(question.id)}
                            className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700 hover:bg-amber-200"
                          >
                            Đồng bộ điểm ý: {formatNumber(subPartTotal, 2)}đ
                          </button>
                        ) : null}
                      </div>

                      {question.subParts.map((part, partIndex) => (
                        <div key={partIndex} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-xs font-bold uppercase text-emerald-700">
                            {part.label}
                          </span>
                          <input
                            type="text"
                            value={part.content}
                            onChange={(event) => updateSubPart(question.id, partIndex, { content: event.target.value })}
                            placeholder={`Nội dung ý ${part.label}...`}
                            className="min-w-0 flex-1 bg-transparent px-1 py-1 text-xs font-medium text-slate-800 outline-none placeholder:text-slate-500"
                          />
                          <div className="flex shrink-0 items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              step={0.25}
                              value={part.points}
                              onChange={(event) => updateSubPart(question.id, partIndex, { points: Number(event.target.value) })}
                              className="w-14 rounded-lg border border-slate-200 bg-slate-50 px-1 py-1 text-center text-xs font-bold text-emerald-700 outline-none"
                            />
                            <span className="text-xs font-bold text-slate-500">đ</span>
                            <button
                              type="button"
                              onClick={() => removeSubPart(question.id, partIndex)}
                              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-rose-50 hover:text-rose-500"
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
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100"
                      >
                        <Plus className="size-3.5" />
                        Thêm ý {String.fromCharCode(97 + question.subParts.length)}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                      Hướng dẫn chấm / Rubric
                    </label>
                    <input
                      type="text"
                      value={question.rubric || ''}
                      onChange={(event) => updateEssay(question.id, { rubric: event.target.value })}
                      placeholder="Ví dụ: Trình bày đúng mỗi ý 1 điểm, thiếu kết luận trừ 0,25 điểm..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium outline-none transition placeholder:text-slate-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
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

      <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl shadow-slate-900/5 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Layers className="size-5" />
          </span>
          <div>
            <p className="text-xs font-bold text-slate-800">
              {effectiveMcqCount} câu trắc nghiệm · {shortAnswerQuestions.length} câu trả lời ngắn ·{' '}
              {essayQuestions.length} câu tự luận
            </p>
            <p className="text-xs font-medium text-slate-500">
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
