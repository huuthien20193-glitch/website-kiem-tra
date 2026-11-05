'use client';

import { useState } from 'react';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  CircleX,
  Clock3,
  Printer,
  Trophy,
  X,
} from 'lucide-react';
import type { Submission } from '@/lib/types';
import { OPTION_LABELS } from '@/lib/types';
import { cn, formatNumber, isPending, progressPercent } from '@/lib/utils';

type ExamResultProps = {
  submission: Submission;
  onBack: () => void;
};

export function ExamResult({ submission, onBack }: ExamResultProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const pending = isPending(submission.status);
  const essayScore = Math.max(0, Number((submission.score - submission.autoScore).toFixed(1)));
  const correctPercent = progressPercent(submission.mcqCorrectCount, submission.mcqCount);

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur no-print">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-50"
          >
            <ArrowLeft className="size-4" />
            Về danh sách đề
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
          >
            <Printer className="size-4" />
            In kết quả
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 p-4 pb-16 sm:p-6 lg:p-8">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-6 text-white shadow-xl shadow-emerald-900/20 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold text-emerald-50 ring-1 ring-white/20">
                <CheckCircle2 className="size-3.5" />
                Đã nộp bài thành công
              </div>
              <h1 className="mt-3 text-xl font-black sm:text-2xl">{submission.examTitle}</h1>
              <p className="mt-1 text-xs font-medium text-emerald-100/90">
                {submission.studentName} · {submission.studentClass} · {submission.submittedAt}
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-3xl bg-white/10 p-4 ring-1 ring-white/20">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-white/15">
                <Trophy className="size-7" />
              </span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-100/80">
                  {pending ? 'Điểm tạm tính' : 'Tổng điểm'}
                </p>
                <p className="text-3xl font-black leading-none">
                  {formatNumber(submission.score)}
                  <span className="ml-1 text-sm font-bold text-emerald-100/80">điểm</span>
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Trắc nghiệm', value: `${formatNumber(submission.autoScore)}đ` },
              { label: 'Tự luận', value: `${formatNumber(essayScore)}đ` },
              { label: 'Câu đúng', value: `${submission.mcqCorrectCount}/${submission.mcqCount}` },
              { label: 'Trạng thái', value: pending ? 'Chờ chấm' : 'Hoàn tất' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10">
                <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-100/70">{item.label}</p>
                <p className="mt-0.5 text-sm font-black">{item.value}</p>
              </div>
            ))}
          </div>

          {pending ? (
            <div className="mt-4 flex items-start gap-2 rounded-2xl bg-white/10 px-4 py-3 text-[11px] font-medium text-emerald-50 ring-1 ring-white/10">
              <Clock3 className="mt-0.5 size-4 shrink-0" />
              Phần tự luận đang chờ giáo viên chấm. Điểm tổng sẽ được cập nhật sau khi giáo viên hoàn tất.
            </div>
          ) : null}
        </section>

        <section className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <Award className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-black text-slate-900">Chi tiết trắc nghiệm</h2>
                <p className="text-[11px] font-medium text-slate-400">Đáp án đúng màu xanh, câu sai màu đỏ</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700">
                {correctPercent}% chính xác
              </span>
            </div>
          </div>

          {submission.correctMcqAnswers.length > 0 ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {submission.correctMcqAnswers.map((correctOption, index) => {
                const studentOption = submission.studentMcqAnswers[index];
                const isCorrect = studentOption === correctOption;
                return (
                  <div
                    key={index}
                    className={cn(
                      'flex items-center justify-between rounded-2xl border px-3 py-2.5',
                      isCorrect ? 'border-emerald-200 bg-emerald-50/60' : 'border-rose-200 bg-rose-50/60',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {isCorrect ? (
                        <CheckCircle2 className="size-4 text-emerald-600" />
                      ) : (
                        <CircleX className="size-4 text-rose-500" />
                      )}
                      <span className="text-xs font-black text-slate-800">Câu {index + 1}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-bold text-slate-600">
                        Bạn chọn:{' '}
                        <span className={isCorrect ? 'text-emerald-700' : 'text-rose-600'}>
                          {studentOption !== undefined ? OPTION_LABELS[studentOption] : 'Bỏ trống'}
                        </span>
                      </p>
                      {!isCorrect ? (
                        <p className="text-[10px] font-semibold text-slate-400">
                          Đáp án: <span className="font-black text-emerald-700">{OPTION_LABELS[correctOption]}</span>
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-xs font-medium text-slate-400">Bài thi không có phần trắc nghiệm.</p>
          )}
        </section>

        {submission.essayDetails.length > 0 ? (
          <section className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-sm font-black text-slate-900">Phần tự luận</h2>
              <p className="text-[11px] font-medium text-slate-400">
                {pending ? 'Bài làm đã được gửi tới giáo viên để chấm điểm.' : 'Điểm và nhận xét từ giáo viên.'}
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {submission.essayDetails.map((detail, index) => (
                <div key={`${detail.questionId}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-white text-[11px] font-black text-teal-700 shadow-sm ring-1 ring-slate-200">
                        {index + 1}
                      </span>
                      <h3 className="text-sm font-black text-slate-900">{detail.questionLabel}</h3>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-emerald-700 ring-1 ring-emerald-200">
                      {formatNumber(detail.score)}/{formatNumber(detail.maxPoints)} điểm
                    </span>
                  </div>

                  {detail.questionContent ? (
                    <p className="mt-2 text-[11px] font-medium leading-relaxed text-slate-600">{detail.questionContent}</p>
                  ) : null}

                  {detail.studentImages.length > 0 ? (
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {detail.studentImages.map((image, imageIndex) => (
                        <button
                          key={imageIndex}
                          type="button"
                          onClick={() => setPreviewImage(image)}
                          className="flex h-24 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-900 p-1"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={image} alt={`Bài làm ${imageIndex + 1}`} className="max-h-full max-w-full rounded-lg object-contain" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-[11px] font-semibold text-rose-500">Không có ảnh bài làm cho câu này.</p>
                  )}

                  {detail.comment ? (
                    <div className="mt-3 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
                      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Nhận xét của giáo viên</p>
                      <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-700">{detail.comment}</p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {submission.mcqImages.length > 0 ? (
          <details className="group rounded-3xl border border-slate-200/80 bg-white shadow-sm">
            <summary className="cursor-pointer list-none px-5 py-4 text-sm font-black text-slate-700 marker:hidden">
              <span className="flex items-center justify-between gap-2">
                Xem lại ảnh đề trắc nghiệm
                <span className="text-xs font-bold text-emerald-600 group-open:hidden">Mở</span>
                <span className="hidden text-xs font-bold text-slate-400 group-open:inline">Đóng</span>
              </span>
            </summary>
            <div className="space-y-3 border-t border-slate-100 p-4">
              {submission.mcqImages.map((image, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setPreviewImage(image)}
                  className="block w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 p-1"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image} alt={`Trang đề ${index + 1}`} className="w-full rounded-xl object-contain" />
                </button>
              ))}
            </div>
          </details>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row no-print">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:from-emerald-700 hover:to-teal-700"
          >
            Về danh sách đề thi
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
          >
            In kết quả
          </button>
        </div>
      </main>

      {previewImage ? (
        <button
          type="button"
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/85 p-4"
          aria-label="Đóng ảnh"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewImage} alt="Ảnh phóng to" className="max-h-[90vh] max-w-full rounded-2xl object-contain shadow-2xl" />
          <span className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white">
            <X className="size-5" />
          </span>
        </button>
      ) : null}
    </div>
  );
}
