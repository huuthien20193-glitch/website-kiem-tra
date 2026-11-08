'use client';

import { useEffect, useMemo, useState } from 'react';
import { Award, CheckCircle2, CircleX, Save, X, ZoomIn } from 'lucide-react';
import type { Submission } from '@/lib/types';
import { OPTION_LABELS } from '@/lib/types';
import { cn, formatNumber, initials, round1 } from '@/lib/utils';

type GradingModalProps = {
  submission: Submission;
  onClose: () => void;
  onSave: (updated: Submission) => void;
};

type EssayScoreState = Record<string, { subParts: Record<number, number>; score: number; comment: string }>;

const clampPoints = (max: number, value: number) => {
  const safeMax = Math.max(0, Number(max) || 0);
  return Math.min(safeMax, Math.max(0, Number.isFinite(value) ? value : 0));
};

const round1Safe = (value: number) => Math.round(value * 10) / 10;

/**
 * Khởi tạo điểm từng ý từ dữ liệu đã lưu.
 * - Nếu đã có subPartScores (chấm lại), lấy ra trực tiếp (kẹp trong 0..maxPoints).
 * - Nếu chưa có nhưng có điểm câu cũ, chia tỉ lệ theo điểm tối đa của từng ý rồi điều chỉnh để tổng khớp đúng điểm cũ.
 */
const distributeScore = (detail: import('@/lib/types').EssayDetail): Record<number, number> => {
  const parts = detail.subParts ?? [];
  const result: Record<number, number> = {};
  if (parts.length === 0) return result;
  parts.forEach((_, index) => (result[index] = 0));

  if (detail.subPartScores && Object.keys(detail.subPartScores).length > 0) {
    parts.forEach((part, index) => {
      result[index] = clampPoints(Number(part.points) || 0, Number(detail.subPartScores?.[index]) || 0);
    });
    return result;
  }

  const target = clampPoints(detail.maxPoints, detail.score || 0);
  const partPoints = parts.map((part) => Math.max(0, Number(part.points) || 0));
  const totalPartPoints = partPoints.reduce((sum, value) => sum + value, 0);
  if (target <= 0 || totalPartPoints <= 0) return result;

  let allocated = 0;
  parts.forEach((_, index) => {
    const raw = (target * partPoints[index]) / totalPartPoints;
    result[index] = clampPoints(partPoints[index], round1Safe(raw));
    allocated = round1Safe(allocated + result[index]);
  });

  let diff = round1Safe(target - allocated);
  for (let i = parts.length - 1; i >= 0 && Math.abs(diff) >= 0.01; i -= 1) {
    const max = partPoints[i];
    const room = round1Safe(max - result[i]);
    const apply = Math.sign(diff) * Math.min(Math.abs(diff), room);
    result[i] = clampPoints(max, round1Safe(result[i] + apply));
    diff = round1Safe(diff - apply);
  }
  return result;
};

export function GradingModal({ submission, onClose, onSave }: GradingModalProps) {
  const [scores, setScores] = useState<EssayScoreState>(() => {
    const initial: EssayScoreState = {};
    submission.essayDetails.forEach((detail) => {
      initial[String(detail.questionId)] = {
        subParts: distributeScore(detail),
        score: Math.min(detail.maxPoints, Math.max(0, detail.score || 0)),
        comment: detail.comment || '',
      };
    });
    return initial;
  });
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (previewImage) setPreviewImage(null);
        else onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, previewImage]);

  const questionScoreOf = (detail: Submission['essayDetails'][number]) => {
    const parts = detail.subParts ?? [];
    const state = scores[String(detail.questionId)];
    if (parts.length === 0) {
      return clampPoints(detail.maxPoints, state?.score ?? detail.score ?? 0);
    }
    const sum = parts.reduce((sum, part, index) => {
      const max = Math.max(0, Number(part.points) || 0);
      return sum + Math.min(max, Math.max(0, Number(state?.subParts?.[index]) || 0));
    }, 0);
    return Math.min(detail.maxPoints, round1Safe(sum));
  };

  const essayTotal = useMemo(
    () => round1Safe(submission.essayDetails.reduce((sum, detail) => sum + questionScoreOf(detail), 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scores, submission.essayDetails],
  );

  const shortAnswerDetails = submission.shortAnswerDetails || [];
  const shortAnswerTotal = round1(
    shortAnswerDetails.reduce((sum, detail) => sum + (detail.score || 0), 0),
  );
  const mcqScore = Math.max(0, round1((submission.autoScore || 0) - shortAnswerTotal));
  const hasShortAnswers = shortAnswerDetails.length > 0;
  const finalTotal = round1((submission.autoScore || 0) + essayTotal);

  const updatePartScore = (questionId: string | number, partIndex: number, rawValue: string, partMax: number) => {
    const parsed = Number(rawValue);
    const value = Number.isFinite(parsed) ? clampPoints(partMax, parsed) : 0;
    setScores((current) => ({
      ...current,
      [String(questionId)]: {
        ...current[String(questionId)],
        subParts: {
          ...current[String(questionId)]?.subParts,
          [partIndex]: value,
        },
      },
    }));
  };

  const setPartMax = (questionId: string | number, partIndex: number, partMax: number) => {
    updatePartScore(questionId, partIndex, String(partMax), partMax);
  };

  const clearPartScore = (questionId: string | number, partIndex: number) => {
    updatePartScore(questionId, partIndex, '0', 999999);
  };

  const updateFlatScore = (questionId: string | number, rawValue: string, maxPoints: number) => {
    const parsed = Number(rawValue);
    const value = Number.isFinite(parsed) ? clampPoints(maxPoints, parsed) : 0;
    setScores((current) => ({
      ...current,
      [String(questionId)]: { ...current[String(questionId)], score: value },
    }));
  };

  const updateComment = (questionId: string | number, comment: string) => {
    setScores((current) => ({
      ...current,
      [String(questionId)]: { ...current[String(questionId)], comment },
    }));
  };

  const handleSave = () => {
    const essayDetails = submission.essayDetails.map((detail) => {
      const parts = detail.subParts ?? [];
      const state = scores[String(detail.questionId)];
      const subPartScores: Record<number, number> = {};
      if (parts.length > 0) {
        parts.forEach((part, index) => {
          const max = Math.max(0, Number(part.points) || 0);
          subPartScores[index] = clampPoints(max, Number(state?.subParts?.[index]) || 0);
        });
      }
      const questionScore = questionScoreOf(detail);
      return {
        ...detail,
        score: questionScore,
        comment: state?.comment ?? detail.comment,
        subPartScores,
        graded: true,
      };
    });
    const total = round1((submission.autoScore || 0) + essayDetails.reduce((sum, detail) => sum + detail.score, 0));
    onSave({
      ...submission,
      essayDetails,
      score: total,
      status: 'Đã chấm điểm hoàn tất',
    });
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl animate-pop-in">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 text-xs font-black text-white">
              {initials(submission.studentName)}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-black text-slate-900">
                {submission.studentName} <span className="font-semibold text-slate-400">({submission.studentClass})</span>
              </h2>
              <p className="truncate text-[11px] font-medium text-slate-400">{submission.examTitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
            aria-label="Đóng"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto bg-slate-50/60 p-4 sm:p-6">
          <div className="rounded-2xl border border-emerald-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-black uppercase tracking-wide text-emerald-800">
                Phần 1 · Trắc nghiệm
              </h3>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700">
                {submission.mcqCorrectCount}/{submission.mcqCount} câu đúng · {formatNumber(mcqScore)}đ
              </span>
            </div>

            {submission.correctMcqAnswers.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {submission.correctMcqAnswers.map((correctOption, index) => {
                  const studentOption = submission.studentMcqAnswers[index];
                  const isCorrect = studentOption === correctOption;
                  return (
                    <div
                      key={index}
                      className={cn(
                        'rounded-xl border p-2.5 text-center',
                        isCorrect ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50',
                      )}
                    >
                      <p className={cn('text-[10px] font-black uppercase', isCorrect ? 'text-emerald-700' : 'text-rose-600')}>
                        Câu {index + 1}
                      </p>
                      <p className="mt-1 flex items-center justify-center gap-1 text-xs font-bold text-slate-800">
                        {isCorrect ? (
                          <CheckCircle2 className="size-3.5 text-emerald-600" />
                        ) : (
                          <CircleX className="size-3.5 text-rose-500" />
                        )}
                        {studentOption !== undefined ? OPTION_LABELS[studentOption] : '—'}
                      </p>
                      {!isCorrect ? (
                        <p className="text-[10px] font-semibold text-slate-500">
                          Đúng: <span className="font-black text-emerald-700">{OPTION_LABELS[correctOption]}</span>
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 text-xs font-medium text-slate-400">Bài thi không có phần trắc nghiệm.</p>
            )}
          </div>

          {hasShortAnswers ? (
            <div className="rounded-2xl border border-sky-200 bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-black uppercase tracking-wide text-sky-800">
                  Phần 2 · Trả lời ngắn
                </h3>
                <span className="rounded-full bg-sky-50 px-3 py-1 text-[11px] font-black text-sky-700">
                  {shortAnswerDetails.filter((detail) => detail.correct).length}/
                  {shortAnswerDetails.length} câu đúng · {formatNumber(shortAnswerTotal)}đ
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {shortAnswerDetails.map((detail, index) => (
                  <div
                    key={`${detail.questionId}-${index}`}
                    className={cn(
                      'rounded-xl border p-3',
                      detail.correct
                        ? 'border-emerald-200 bg-emerald-50/50'
                        : 'border-rose-200 bg-rose-50/50',
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {detail.correct ? (
                          <CheckCircle2 className="size-4 text-emerald-600" />
                        ) : (
                          <CircleX className="size-4 text-rose-500" />
                        )}
                        <span className="text-xs font-black text-slate-800">
                          {detail.questionLabel}
                        </span>
                      </div>
                      <span
                        className={cn(
                          'text-[11px] font-black',
                          detail.correct ? 'text-emerald-700' : 'text-rose-600',
                        )}
                      >
                        {formatNumber(detail.score)}/{formatNumber(detail.maxPoints)}đ
                      </span>
                    </div>
                    {detail.questionContent ? (
                      <p className="mt-1.5 text-[11px] font-medium leading-relaxed text-slate-600">
                        {detail.questionContent}
                      </p>
                    ) : null}
                    <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                      <p className="rounded-lg bg-white/70 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-100">
                        Học sinh:{' '}
                        <span
                          className={cn(
                            'font-black',
                            detail.correct ? 'text-emerald-700' : 'text-rose-600',
                          )}
                        >
                          {detail.studentAnswer || 'Bỏ trống'}
                        </span>
                      </p>
                      {!detail.correct ? (
                        <p className="rounded-lg bg-white/70 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-100">
                          Đáp án:{' '}
                          <span className="font-black text-emerald-700">
                            {detail.correctAnswer}
                          </span>
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {submission.essayDetails.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <Award className="mx-auto size-8 text-slate-300" />
              <p className="mt-2 text-sm font-bold text-slate-700">Bài thi không có phần tự luận</p>
              <p className="mt-1 text-xs text-slate-400">Nhấn &quot;Hoàn tất chấm bài&quot; để xác nhận kết quả.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wide text-slate-600">
                Phần {hasShortAnswers ? 3 : 2} · Tự luận ({submission.essayDetails.length} câu)
              </h3>

              {submission.essayDetails.map((detail, index) => (
                <div key={`${detail.questionId}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-100 text-[11px] font-black text-emerald-700">
                        {index + 1}
                      </span>
                      <h4 className="text-sm font-black text-slate-900">{detail.questionLabel}</h4>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                        Tối đa {formatNumber(detail.maxPoints)}đ
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-slate-400">
                      Điểm câu:{' '}
                      <span className="text-emerald-600">
                        {formatNumber(questionScoreOf(detail))}/{formatNumber(detail.maxPoints)}đ
                      </span>
                    </span>
                  </div>

                  {detail.studentImages.length > 0 ? (
                    <div className="mt-3">
                      <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-teal-700">
                        Ảnh bài làm ({detail.studentImages.length})
                      </p>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                        {detail.studentImages.map((image, imageIndex) => (
                          <button
                            key={imageIndex}
                            type="button"
                            onClick={() => setPreviewImage(image)}
                            className="group relative flex h-24 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-900 p-1"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={image} alt={`Bài làm ${imageIndex + 1}`} className="max-h-full max-w-full rounded-lg object-contain" />
                            <span className="absolute inset-0 flex items-center justify-center bg-slate-950/0 text-white opacity-0 transition group-hover:bg-slate-950/40 group-hover:opacity-100">
                              <ZoomIn className="size-5" />
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-500">
                      Học sinh chưa nộp ảnh cho câu này.
                    </p>
                  )}

                  {(detail.subParts && detail.subParts.length > 0) ? (
                    <div className="mt-3 space-y-2">
                      {detail.subParts.map((part, partIndex) => {
                        const max = Math.max(0, Number(part.points) || 0);
                        const value = scores[String(detail.questionId)]?.subParts?.[partIndex] ?? 0;
                        return (
                          <div
                            key={partIndex}
                            className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5"
                          >
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-[11px] font-black uppercase text-emerald-700">
                              {part.label}
                            </span>
                            <div className="min-w-40 flex-1">
                              <p className="text-[11px] font-medium leading-snug text-slate-700">
                                {part.content || '—'}
                              </p>
                              <p className="mt-0.5 text-[10px] font-bold text-slate-400">
                                Tối đa {formatNumber(max)}đ
                              </p>
                            </div>
                            <div className="w-24 shrink-0">
                              <input
                                type="number"
                                min={0}
                                max={max}
                                step={0.25}
                                value={value}
                                onChange={(event) =>
                                  updatePartScore(detail.questionId, partIndex, event.target.value, max)
                                }
                                aria-label={`Điểm ý ${part.label}`}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-emerald-700 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                              />
                            </div>
                            <div className="flex shrink-0 gap-1.5">
                              <button
                                type="button"
                                onClick={() => setPartMax(detail.questionId, partIndex, max)}
                                className="rounded-lg bg-emerald-50 px-2 py-1.5 text-[10px] font-bold text-emerald-700 transition hover:bg-emerald-100"
                              >
                                Tối đa
                              </button>
                              <button
                                type="button"
                                onClick={() => clearPartScore(detail.questionId, partIndex)}
                                className="rounded-lg bg-slate-100 px-2 py-1.5 text-[10px] font-bold text-slate-500 transition hover:bg-slate-200"
                              >
                                0đ
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50/70 px-3 py-2 text-[11px] font-bold text-emerald-800">
                        <span>
                          Tổng điểm ý tối đa:{' '}
                          {formatNumber(
                            detail.subParts.reduce((sum, part) => sum + Math.max(0, Number(part.points) || 0), 0),
                          )}
                          đ
                        </span>
                        <span>
                          Câu này:{' '}
                          <span className="text-emerald-700">
                            {formatNumber(questionScoreOf(detail))} / {formatNumber(detail.maxPoints)}đ
                          </span>
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">
                        Điểm câu (0 – {formatNumber(detail.maxPoints)})
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={detail.maxPoints}
                        step={0.25}
                        value={scores[String(detail.questionId)]?.score ?? 0}
                        onChange={(event) => updateFlatScore(detail.questionId, event.target.value, detail.maxPoints)}
                        className="w-40 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-emerald-700 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                  )}

                  <div className="mt-3">
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">
                      Nhận xét
                    </label>
                    <input
                      type="text"
                      value={scores[String(detail.questionId)]?.comment ?? ''}
                      onChange={(event) => updateComment(detail.questionId, event.target.value)}
                      placeholder="Nhận xét bài làm của học sinh..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Trắc nghiệm</p>
              <p className="text-sm font-black text-slate-800">{formatNumber(mcqScore)}đ</p>
            </div>
            {hasShortAnswers ? (
              <>
                <div className="h-8 w-px bg-slate-200" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">TL ngắn</p>
                  <p className="text-sm font-black text-slate-800">{formatNumber(shortAnswerTotal)}đ</p>
                </div>
              </>
            ) : null}
            <div className="h-8 w-px bg-slate-200" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Tự luận</p>
              <p className="text-sm font-black text-slate-800">{formatNumber(essayTotal)}đ</p>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Tổng điểm</p>
              <p className="text-lg font-black text-emerald-600">{formatNumber(finalTotal)}đ</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-500 transition hover:bg-slate-50 sm:flex-none"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 active:scale-[0.98] sm:flex-none"
            >
              <Save className="size-4" />
              Hoàn tất chấm bài
            </button>
          </div>
        </div>
      </div>

      {previewImage ? (
        <button
          type="button"
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-4"
          aria-label="Đóng ảnh"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewImage} alt="Ảnh bài làm phóng to" className="max-h-[90vh] max-w-full rounded-2xl object-contain shadow-2xl" />
        </button>
      ) : null}
    </div>
  );
}
