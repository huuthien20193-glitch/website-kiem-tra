'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ImagePlus,
  LoaderCircle,
  Send,
  Sparkles,
  X,
  ZoomIn,
} from 'lucide-react';
import type { Exam, Submission } from '@/lib/types';
import { OPTION_LABELS, gradeLabel, subjectStyle } from '@/lib/types';
import { answerMatches, cn, formatClock, formatNumber, progressPercent, round1 } from '@/lib/utils';
import {
  addSubmission,
  buildSubmission,
  clearDraft,
  examDraftKey,
  loadDraft,
  saveDraft,
} from '@/lib/storage';
import { imageFilesFromClipboard, optimizeImage } from '@/lib/image';
import { insertSubmissionToCloud } from '@/lib/supabase';
import { useConfirm, useToast } from '@/components/ui/FeedbackProvider';

type ExamRoomProps = {
  exam: Exam;
  studentName: string;
  studentClass: string;
  onExit: () => void;
  onSubmitted: (submission: Submission) => void;
  practiceMode?: boolean;
  onPracticeFinish?: () => void;
};

export function ExamRoom({
  exam,
  studentName,
  studentClass,
  onExit,
  onSubmitted,
  practiceMode = false,
  onPracticeFinish,
}: ExamRoomProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const draftKey = useMemo(() => examDraftKey(exam.id, studentName), [exam.id, studentName]);
  const totalSeconds = exam.durationMinutes * 60;
  /** Đề có câu trắc nghiệm dạng văn bản (không cần ảnh đề). */
  const hasTextMcq = (exam.mcqQuestions ?? []).some(Boolean);

  // Read any saved draft once, on mount, so the first render already shows restored work.
  const [restored] = useState(() => {
    const draft = loadDraft(draftKey);
    const now = Date.now();
    const deadline = draft?.deadline && draft.deadline > now ? draft.deadline : now + totalSeconds * 1000;
    return {
      mcqAnswers: draft?.mcqAnswers || {},
      shortAnswers: draft?.shortAnswers || {},
      essayImages: draft?.essayImages || {},
      deadline,
      timeLeft: Math.max(0, Math.ceil((deadline - now) / 1000)),
    };
  });

  const [mcqAnswers, setMcqAnswers] = useState<Record<number, number>>(restored.mcqAnswers);
  const [shortAnswers, setShortAnswers] = useState<Record<string, string>>(
    restored.shortAnswers,
  );
  const [essayImages, setEssayImages] = useState<Record<string, string[]>>(restored.essayImages);
  const [timeLeft, setTimeLeft] = useState(restored.timeLeft);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [practiceFinished, setPracticeFinished] = useState(false);
  const [practiceScore, setPracticeScore] = useState(0);
  const [practiceCorrect, setPracticeCorrect] = useState({ mcq: 0, short: 0 });
  const [activeFeedback, setActiveFeedback] = useState<{ questionIndex: number; correct: boolean } | null>(null);

  const answersRef = useRef<Record<number, number>>(restored.mcqAnswers);
  const shortAnswersRef = useRef<Record<string, string>>(restored.shortAnswers);
  const imagesRef = useRef<Record<string, string[]>>(restored.essayImages);
  const deadlineRef = useRef<number>(restored.deadline);
  const submittedRef = useRef(false);
  const submitRef = useRef<(auto?: boolean) => void>(() => {});

  useEffect(() => {
    if (practiceMode || practiceFinished) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        submitRef.current(true);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [practiceMode, practiceFinished]);

  useEffect(() => {
    answersRef.current = mcqAnswers;
  }, [mcqAnswers]);

  useEffect(() => {
    shortAnswersRef.current = shortAnswers;
  }, [shortAnswers]);

  useEffect(() => {
    imagesRef.current = essayImages;
  }, [essayImages]);

  useEffect(() => {
    if (practiceMode) return;
    saveDraft(draftKey, {
      mcqAnswers,
      shortAnswers,
      essayImages,
      deadline: deadlineRef.current,
    });
  }, [draftKey, essayImages, mcqAnswers, practiceMode, shortAnswers]);

  const submit = async (auto = false) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const submission: Submission = {
      ...buildSubmission(
        exam,
        studentName,
        studentClass,
        answersRef.current,
        shortAnswersRef.current,
        imagesRef.current,
      ),
      timeSpentSeconds: Math.max(0, totalSeconds - timeLeft),
    };
    clearDraft(draftKey);
    // Luôn lưu một bản cục bộ để không mất bài khi mạng/cloud gặp sự cố.
    addSubmission(submission);
    if (auto) {
      toast.warning('Hết giờ làm bài', 'Hệ thống đã tự động nộp bài làm của bạn.');
    }

    // Ghi bài nộp lên Supabase để giáo viên thấy trên mọi thiết bị.
    const result = await insertSubmissionToCloud(submission);
    if (!result.ok) {
      toast.warning(
        'Chưa đồng bộ được lên máy chủ',
        `${result.message ?? 'Vui lòng kiểm tra kết nối mạng.'} Bài làm vẫn được lưu trên thiết bị này.`,
      );
    }

    onSubmitted(submission);
  };

  useEffect(() => {
    submitRef.current = submit;
  });

  const mcqAnsweredCount = Object.keys(mcqAnswers).filter((key) => {
    const index = Number(key);
    return index >= 0 && index < exam.mcqCount && Number.isFinite(mcqAnswers[index]);
  }).length;

  const shortAnsweredCount = exam.shortAnswerQuestions.filter(
    (question) => (shortAnswers[String(question.id)] || '').trim().length > 0,
  ).length;

  const essayAnsweredCount = exam.essayQuestions.filter(
    (question) => (essayImages[String(question.id)] || []).length > 0,
  ).length;

  const totalSteps =
    exam.mcqCount + exam.shortAnswerQuestions.length + exam.essayQuestions.length;
  const answeredSteps =
    Math.min(exam.mcqCount, mcqAnsweredCount) + shortAnsweredCount + essayAnsweredCount;
  const percent = progressPercent(answeredSteps, totalSteps);
  const urgent = timeLeft <= 300;
  const warning = timeLeft <= 600 && !urgent;
  const shortAnswerSectionNumber = exam.mcqCount > 0 ? 2 : 1;
  const essaySectionNumber =
    (exam.mcqCount > 0 ? 1 : 0) + (exam.shortAnswerQuestions.length > 0 ? 1 : 0) + 1;

  const chooseAnswer = (questionIndex: number, optionIndex: number) => {
    setMcqAnswers((current) => ({ ...current, [questionIndex]: optionIndex }));
    if (practiceMode) {
      const correct = exam.mcqAnswers[questionIndex] === optionIndex;
      setActiveFeedback({ questionIndex, correct });
      setTimeout(() => setActiveFeedback(null), 900);
    }
  };

  const addEssayFiles = async (questionId: string | number, files: File[]) => {
    if (files.length === 0) return;
    const key = String(questionId);
    setUploadingKey(key);
    try {
      const optimized = await Promise.all(files.map((file) => optimizeImage(file)));
      setEssayImages((current) => ({
        ...current,
        [key]: [...(current[key] || []), ...optimized],
      }));
      toast.success('Đã thêm ảnh bài làm', `${optimized.length} ảnh cho ${exam.essayQuestions.find((question) => String(question.id) === key)?.questionLabel || 'câu tự luận'}.`);
    } catch {
      toast.error('Không thể đọc ảnh', 'Vui lòng chọn tệp ảnh hợp lệ.');
    } finally {
      setUploadingKey(null);
    }
  };

  const removeEssayImage = (questionId: string | number, imageIndex: number) => {
    const key = String(questionId);
    setEssayImages((current) => ({
      ...current,
      [key]: (current[key] || []).filter((_, index) => index !== imageIndex),
    }));
  };

  const handleSubmitClick = async () => {
    if (practiceMode) {
      handleFinishPractice();
      return;
    }
    if (submittedRef.current) return;
    const unansweredMcq = Math.max(0, exam.mcqCount - mcqAnsweredCount);
    const unansweredShort = Math.max(
      0,
      exam.shortAnswerQuestions.length - shortAnsweredCount,
    );
    const missingEssayImages = exam.essayQuestions.filter(
      (question) => (essayImages[String(question.id)] || []).length === 0,
    ).length;

    const warnings: string[] = [];
    if (unansweredMcq > 0) warnings.push(`${unansweredMcq} câu trắc nghiệm chưa trả lời`);
    if (unansweredShort > 0) warnings.push(`${unansweredShort} câu trả lời ngắn chưa điền`);
    if (missingEssayImages > 0) warnings.push(`${missingEssayImages} câu tự luận chưa nộp ảnh`);

    const confirmed = await confirm({
      title: 'Nộp bài kiểm tra?',
      message:
        warnings.length > 0
          ? `Bạn còn ${warnings.join(' và ')}. Sau khi nộp, bài làm sẽ không thể chỉnh sửa.`
          : 'Bạn đã hoàn thành tất cả câu hỏi. Nộp bài và kết thúc bài thi?',
      confirmLabel: 'Nộp bài',
      cancelLabel: 'Làm tiếp',
      tone: warnings.length > 0 ? 'warning' : 'primary',
    });

    if (confirmed) submit(false);
  };

  const handleFinishPractice = () => {
    let correctMcq = 0;
    for (let index = 0; index < exam.mcqCount; index += 1) {
      if (mcqAnswers[index] === exam.mcqAnswers[index]) correctMcq += 1;
    }

    let correctShort = 0;
    const shortScore = exam.shortAnswerQuestions.reduce((sum, question) => {
      const isCorrect = answerMatches(
        shortAnswers[String(question.id)] || '',
        question.answer,
      );
      if (isCorrect) {
        correctShort += 1;
        return sum + question.points;
      }
      return sum;
    }, 0);

    const score = round1(correctMcq * (exam.mcqPointPerQ || 0) + shortScore);
    setPracticeScore(score);
    setPracticeCorrect({ mcq: correctMcq, short: correctShort });
    const percent = Math.round((score / (exam.totalPoints || 1)) * 100);
    setPracticeFinished(true);
    // Store lightweight practice result in session storage for the result view.
    sessionStorage.setItem(
      `tht_practice_result_${exam.id}`,
      JSON.stringify({
        examTitle: exam.title,
        subject: exam.subject,
        correctCount: correctMcq + correctShort,
        mcqCount: exam.mcqCount,
        shortCount: exam.shortAnswerQuestions.length,
        score,
        totalPoints: exam.totalPoints,
        percent,
        studentName,
        studentClass,
        finishedAt: new Date().toLocaleString('vi-VN'),
      }),
    );
  };

  const handleExit = async () => {
    const confirmed = await confirm({
      title: 'Thoát phòng thi?',
      message: practiceMode
        ? 'Bài ôn tập hiện tại chưa được lưu điểm. Bạn có chắc muốn thoát?'
        : 'Bài làm hiện tại đã được lưu nháp trên thiết bị này. Bạn có chắc muốn thoát?',
      confirmLabel: 'Thoát phòng thi',
      cancelLabel: 'Ở lại',
      tone: 'warning',
    });
    if (confirmed) onExit();
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={handleExit}
            aria-label="Thoát phòng thi"
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-50"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Thoát</span>
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={cn('hidden rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide ring-1 sm:inline-flex', subjectStyle(exam.subject))}>
                {exam.subject}
              </span>
              <span className="hidden rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-indigo-700 ring-1 ring-indigo-600/10 sm:inline-flex">
                {gradeLabel(exam.grade)}
              </span>
              {practiceMode ? (
                <span className="hidden rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide ring-1 sm:inline-flex bg-teal-50 text-teal-700 ring-teal-600/10">
                  ÔN TẬP
                </span>
              ) : null}
              <h1 className="truncate text-sm font-bold text-slate-900 sm:text-base">{exam.title}</h1>
            </div>
            <p className="truncate text-xs font-semibold text-slate-500">
              {studentName} · {exam.mcqCount} câu TN · {exam.shortAnswerQuestions.length} câu TLN ·{' '}
              {exam.essayQuestions.length} câu TL
            </p>
          </div>

          <div
            className={cn(
              'flex items-center gap-2 rounded-2xl border px-3 py-2 font-mono text-sm font-bold tabular-nums sm:text-base',
              urgent
                ? 'animate-pulse border-rose-200 bg-rose-50 text-rose-600'
                : warning
                  ? 'border-amber-200 bg-amber-50 text-amber-600'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700',
            )}
          >
            <Clock3 className={cn('size-4', urgent && 'animate-pulse')} />
            {formatClock(timeLeft)}
          </div>

          {practiceMode ? (
            <button
              type="button"
              onClick={handleSubmitClick}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-teal-600/20 transition hover:from-teal-700 hover:to-emerald-700 active:scale-[0.98]"
            >
              <Send className="size-4" />
              Kết thúc ôn tập
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmitClick}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition hover:from-emerald-700 hover:to-teal-700 active:scale-[0.98]"
            >
              <Send className="size-4" />
              Nộp bài
            </button>
          )}
        </div>

        <div className="h-1.5 w-full bg-slate-100">
          <div
            className={cn(
              'h-full transition-all duration-500',
              urgent ? 'bg-gradient-to-r from-rose-500 to-orange-500' : 'bg-gradient-to-r from-emerald-500 to-teal-500',
            )}
            style={{ width: `${progressPercent(totalSeconds - timeLeft, totalSeconds)}%` }}
          />
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 p-4 pb-16 sm:p-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-8">
        <div className="min-w-0 space-y-6">
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs font-semibold text-emerald-800">
            <Sparkles className="size-4 shrink-0" />
            Bài làm được tự động lưu nháp trên thiết bị này. Nếu lỡ tải lại trang, bạn có thể làm tiếp.
          </div>

          {exam.mcqCount > 0 ? (
            <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-600 text-xs font-bold text-white">1</span>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Phần trắc nghiệm</h2>
                    <p className="text-xs font-medium text-slate-500">{exam.mcqPointPerQ} điểm/câu · Chọn một đáp án cho mỗi câu</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  Đã trả lời {mcqAnsweredCount}/{exam.mcqCount}
                </span>
              </div>

              {exam.mcqImages.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {exam.mcqImages.map((image, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setPreviewImage(image)}
                      className="group relative block w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 p-1 text-left"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image} alt={`Trang đề ${index + 1}`} className="max-h-[560px] w-full rounded-xl object-contain" />
                      <span className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-slate-950/70 px-2 py-1 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100">
                        <ZoomIn className="size-3" /> Phóng to
                      </span>
                    </button>
                  ))}
                </div>
              ) : hasTextMcq ? null : (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-800">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  Giáo viên chưa đính kèm ảnh đề trắc nghiệm. Hãy làm theo đề được phát và điền đáp án bên dưới.
                </div>
              )}

              <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                {Array.from({ length: exam.mcqCount }).map((_, questionIndex) => {
                  const answered = mcqAnswers[questionIndex] !== undefined;
                  return (
                    <div
                      key={questionIndex}
                      id={`question-${questionIndex}`}
                      className={cn(
                        'rounded-2xl border p-3 transition',
                        answered ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50/60',
                      )}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className={cn('text-xs font-bold', answered ? 'text-emerald-700' : 'text-slate-700')}>
                          Câu {questionIndex + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-500">
                          {formatNumber(exam.mcqPointPerQ)}đ
                        </span>
                      </div>
                      {(() => {
                        const textQuestion = exam.mcqQuestions?.[questionIndex];
                        if (!textQuestion) return null;
                        const options = textQuestion.options.filter((option) => option.trim());
                        return (
                          <div className="mb-2 rounded-xl bg-white p-2.5 ring-1 ring-slate-100">
                            <p className="whitespace-pre-wrap text-xs font-semibold leading-relaxed text-slate-800">
                              {textQuestion.content.trim() || '(Đề bài trong ảnh)'}
                            </p>
                            {textQuestion.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={textQuestion.image}
                                alt={`Minh họa câu ${questionIndex + 1}`}
                                className="mt-2 max-h-48 rounded-lg object-contain ring-1 ring-slate-100"
                              />
                            ) : null}
                            {options.length > 0 ? (
                              <div className="mt-2 space-y-1">
                                {textQuestion.options.map((option, optionIndex) =>
                                  option.trim() ? (
                                    <p key={optionIndex} className="text-xs leading-snug text-slate-600">
                                      <span className="font-bold text-slate-700">{OPTION_LABELS[optionIndex]}.</span>{' '}
                                      {option}
                                    </p>
                                  ) : null,
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                      <div className="grid grid-cols-4 gap-1.5">
                        {OPTION_LABELS.map((label, optionIndex) => {
                          const selected = mcqAnswers[questionIndex] === optionIndex;
                          const isCorrect = exam.mcqAnswers[questionIndex] === optionIndex;
                          const showFeedback = practiceMode && activeFeedback?.questionIndex === questionIndex;
                          return (
                            <button
                              key={label}
                              type="button"
                              onClick={() => chooseAnswer(questionIndex, optionIndex)}
                              className={cn(
                                'rounded-xl py-2 text-xs font-bold transition disabled:opacity-60 disabled:pointer-events-none',
                                selected
                                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/25'
                                  : showFeedback && isCorrect
                                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm shadow-emerald-600/20'
                                    : showFeedback && !isCorrect
                                      ? 'bg-rose-100 text-rose-700 border border-rose-200 shadow-sm shadow-rose-600/20'
                                      : 'border border-slate-200 bg-white text-slate-500 hover:border-emerald-300 hover:text-emerald-600',
                              )}
                              disabled={practiceMode && selected && showFeedback}
                            >
                              {label}
                              {showFeedback && isCorrect ? (
                                <Check className="ml-1 size-3.5" />
                              ) : showFeedback && !isCorrect ? (
                                <X className="ml-1 size-3.5" />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {exam.shortAnswerQuestions.length > 0 ? (
            <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-xl bg-sky-600 text-xs font-bold text-white">
                    {shortAnswerSectionNumber}
                  </span>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Phần trả lời ngắn</h2>
                    <p className="text-xs font-medium text-slate-500">
                      Điền đáp án ngắn cho từng câu — hệ thống tự chấm ngay khi nộp bài
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">
                  Đã trả lời {shortAnsweredCount}/{exam.shortAnswerQuestions.length}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {exam.shortAnswerQuestions.map((question, questionIndex) => {
                  const key = String(question.id);
                  const value = shortAnswers[key] || '';
                  return (
                    <div
                      key={key}
                      id={`short-${questionIndex}`}
                      className={cn(
                        'rounded-2xl border p-4 transition',
                        value.trim()
                          ? 'border-sky-200 bg-sky-50/40'
                          : 'border-slate-200 bg-slate-50/60',
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="flex size-7 items-center justify-center rounded-lg bg-white text-xs font-bold text-sky-700 shadow-sm ring-1 ring-slate-200">
                            {questionIndex + 1}
                          </span>
                          <h3 className="text-sm font-bold text-slate-900">
                            {question.questionLabel}
                          </h3>
                          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-500 ring-1 ring-slate-200">
                            {formatNumber(question.points)} điểm
                          </span>
                        </div>
                        <span
                          className={cn(
                            'text-xs font-bold',
                            value.trim() ? 'text-emerald-600' : 'text-rose-500',
                          )}
                        >
                          {value.trim() ? 'Đã trả lời' : 'Chưa trả lời'}
                        </span>
                      </div>

                      {question.questionImage ? (
                        <button
                          type="button"
                          onClick={() => setPreviewImage(question.questionImage || '')}
                          className="mt-3 block w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-900 p-1"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={question.questionImage}
                            alt={question.questionLabel}
                            className="max-h-72 w-full rounded-lg object-contain"
                          />
                        </button>
                      ) : null}

                      {question.content ? (
                        <p className="mt-3 whitespace-pre-line text-xs font-medium leading-relaxed text-slate-700">
                          {question.content}
                        </p>
                      ) : null}

                      <input
                        type="text"
                        value={value}
                        onChange={(event) =>
                          setShortAnswers((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                        placeholder="Nhập câu trả lời ngắn..."
                        autoComplete="off"
                        className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition placeholder:font-medium placeholder:text-slate-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {!practiceMode && exam.essayQuestions.length > 0 ? (
            <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-xl bg-teal-600 text-xs font-bold text-white">{essaySectionNumber}</span>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Phần tự luận</h2>
                    <p className="text-xs font-medium text-slate-500">Chụp ảnh bài làm và tải lên cho từng câu</p>
                  </div>
                </div>
                <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700">
                  Đã nộp {essayAnsweredCount}/{exam.essayQuestions.length} câu
                </span>
              </div>

              <div className="mt-4 space-y-5">
                {exam.essayQuestions.map((question, questionIndex) => {
                  const key = String(question.id);
                  const images = essayImages[key] || [];
                  return (
                    <div key={key} id={`essay-${questionIndex}`} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="flex size-7 items-center justify-center rounded-lg bg-white text-xs font-bold text-teal-700 shadow-sm ring-1 ring-slate-200">
                            {questionIndex + 1}
                          </span>
                          <h3 className="text-sm font-bold text-slate-900">{question.questionLabel}</h3>
                          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-500 ring-1 ring-slate-200">
                            {formatNumber(question.points)} điểm
                          </span>
                        </div>
                        <span className={cn('text-xs font-bold', images.length > 0 ? 'text-emerald-600' : 'text-rose-500')}>
                          {images.length > 0 ? `Đã nộp ${images.length} ảnh` : 'Chưa nộp ảnh'}
                        </span>
                      </div>

                      {question.questionImage ? (
                        <button
                          type="button"
                          onClick={() => setPreviewImage(question.questionImage || '')}
                          className="mt-3 block w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-900 p-1"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={question.questionImage} alt={question.questionLabel} className="max-h-80 w-full rounded-lg object-contain" />
                        </button>
                      ) : null}

                      <div className="mt-3 space-y-1.5">
                        {question.subParts.map((part, partIndex) => (
                          <div key={partIndex} className="flex items-start gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
                            <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-teal-50 text-xs font-bold uppercase text-teal-700">
                              {part.label}
                            </span>
                            <p className="min-w-0 flex-1 text-xs font-medium leading-relaxed text-slate-700">{part.content || '—'}</p>
                            <span className="shrink-0 text-xs font-bold text-slate-500">{formatNumber(part.points)}đ</span>
                          </div>
                        ))}
                      </div>

                      {images.length > 0 ? (
                        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                          {images.map((image, imageIndex) => (
                            <div key={imageIndex} className="group relative flex h-28 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-900 p-1">
                              <button type="button" onClick={() => setPreviewImage(image)} className="flex h-full w-full items-center justify-center">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={image} alt={`Bài làm ${imageIndex + 1}`} className="max-h-full max-w-full rounded-lg object-contain" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeEssayImage(question.id, imageIndex)}
                                className="absolute right-1 top-1 rounded-full bg-rose-600 p-1 text-white opacity-0 shadow transition group-hover:opacity-100"
                                aria-label="Xóa ảnh"
                              >
                                <X className="size-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div
                        className="mt-3 rounded-2xl border-2 border-dashed border-teal-300 bg-white p-4 text-center transition hover:bg-teal-50/40"
                        onPaste={(event) => {
                          const files = imageFilesFromClipboard(event);
                          if (files.length > 0) {
                            event.preventDefault();
                            void addEssayFiles(question.id, files);
                          }
                        }}
                      >
                        <label className="flex cursor-pointer flex-col items-center gap-2">
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(event) => {
                              void addEssayFiles(question.id, Array.from(event.target.files || []));
                              event.target.value = '';
                            }}
                          />
                          {uploadingKey === key ? (
                            <LoaderCircle className="size-6 animate-spin text-teal-600" />
                          ) : (
                            <ImagePlus className="size-6 text-teal-600" />
                          )}
                          <span className="text-xs font-bold text-slate-800">
                            {uploadingKey === key ? 'Đang xử lý ảnh...' : 'Chọn ảnh bài làm hoặc dán Ctrl + V'}
                          </span>
                          <span className="text-xs font-medium text-slate-500">
                            Có thể tải nhiều ảnh · Ảnh được tự động nén
                          </span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Tiến độ bài làm</h2>
              <span className="text-lg font-bold text-emerald-600">{percent}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500" style={{ width: `${percent}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-slate-50 p-2.5 text-center">
                <p className="text-base font-bold text-slate-800">{mcqAnsweredCount}/{exam.mcqCount}</p>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Trắc nghiệm</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5 text-center">
                <p className="text-base font-bold text-slate-800">{shortAnsweredCount}/{exam.shortAnswerQuestions.length}</p>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">TL ngắn</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5 text-center">
                <p className="text-base font-bold text-slate-800">{essayAnsweredCount}/{exam.essayQuestions.length}</p>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Tự luận</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Phiếu trả lời</h2>
            <div className="mt-3 grid grid-cols-6 gap-1.5">
              {Array.from({ length: exam.mcqCount }).map((_, index) => {
                const answered = mcqAnswers[index] !== undefined;
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => document.getElementById(`question-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                    className={cn(
                      'flex aspect-square items-center justify-center rounded-lg text-xs font-bold transition',
                      answered
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                    )}
                    title={`Câu ${index + 1}`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>

            {exam.shortAnswerQuestions.length > 0 ? (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Câu trả lời ngắn
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {exam.shortAnswerQuestions.map((question, index) => {
                    const done = (shortAnswers[String(question.id)] || '').trim().length > 0;
                    return (
                      <button
                        key={String(question.id)}
                        type="button"
                        onClick={() =>
                          document
                            .getElementById(`short-${index}`)
                            ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        }
                        className={cn(
                          'inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold transition',
                          done
                            ? 'bg-sky-600 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                        )}
                      >
                        {done ? <Check className="size-3" /> : null}
                        {question.questionLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {!practiceMode && exam.essayQuestions.length > 0 ? (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Câu tự luận</p>
                <div className="flex flex-wrap gap-1.5">
                  {exam.essayQuestions.map((question, index) => {
                    const done = (essayImages[String(question.id)] || []).length > 0;
                    return (
                      <button
                        key={String(question.id)}
                        type="button"
                        onClick={() => document.getElementById(`essay-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold transition',
                          done ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                        )}
                      >
                        {done ? <Check className="size-3" /> : null}
                        {question.questionLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" /> Đã làm
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-slate-300" /> Chưa làm
              </span>
            </div>
          </section>

          {practiceMode ? (
            <>
              <button
                type="button"
                onClick={handleSubmitClick}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-teal-600/25 transition hover:from-teal-700 hover:to-emerald-700 active:scale-[0.98]"
              >
                <Send className="size-4" />
                Kết thúc ôn tập
              </button>
              <p className="text-center text-xs font-medium text-slate-500">
                Thời gian còn lại: {formatClock(timeLeft)}
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSubmitClick}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:from-emerald-700 hover:to-teal-700 active:scale-[0.98]"
              >
                <Send className="size-4" />
                Nộp bài hoàn tất
              </button>
              <p className="text-center text-xs font-medium text-slate-500">
                Thời gian còn lại: {formatClock(timeLeft)}
              </p>
            </>
          )}
        </aside>
      </main>

      {practiceFinished ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/90 p-6 sm:p-12">
          <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white p-8 text-center shadow-2xl animate-pop-in">
            <div className="flex size-20 items-center justify-center rounded-full bg-teal-50 text-teal-600 mx-auto mb-6">
              <CheckCircle2 className="size-10" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Bài ôn tập hoàn tất</h2>
            <p className="text-sm text-slate-500 mb-6">{exam.title}</p>
            <div className="space-y-3 text-left mb-8">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Đúng trắc nghiệm</span>
                <span className="font-bold text-emerald-600">
                  {practiceCorrect.mcq}/{exam.mcqCount}
                </span>
              </div>
              {exam.shortAnswerQuestions.length > 0 ? (
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Đúng trả lời ngắn</span>
                  <span className="font-bold text-sky-600">
                    {practiceCorrect.short}/{exam.shortAnswerQuestions.length}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Điểm số</span>
                <span className="font-bold text-slate-900">
                  {formatNumber(practiceScore)} / {formatNumber(exam.totalPoints)} điểm
                </span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-slate-500">Tỉ lệ chính xác</span>
                <span className="font-bold text-slate-900">
                  {Math.round(
                    ((practiceCorrect.mcq + practiceCorrect.short) /
                      Math.max(exam.mcqCount + exam.shortAnswerQuestions.length, 1)) *
                      100,
                  )}
                  %
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setPracticeFinished(false);
                onPracticeFinish?.();
              }}
              className="w-full rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-teal-600/25 transition hover:from-teal-700 hover:to-emerald-700 active:scale-[0.98]"
            >
              Về trang chủ
            </button>
          </div>
        </div>
      ) : null}

      {previewImage ? (
        <button
          type="button"
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/85 p-4"
          aria-label="Đóng ảnh"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewImage} alt="Ảnh phóng to" className="max-h-[90vh] max-w-full rounded-2xl object-contain shadow-2xl" />
        </button>
      ) : null}
    </div>
  );
}
