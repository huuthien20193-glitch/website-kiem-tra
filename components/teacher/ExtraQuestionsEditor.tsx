'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronsUpDown,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { ExtraQuestion } from '@/lib/types';
import { EXTRA_KIND_LABELS, OPTION_LABELS } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ProvenanceBadges } from './CreateExamTab';

type ExtraQuestionsEditorProps = {
  questions: ExtraQuestion[];
  /** Số thứ tự bắt đầu khi đánh nhãn lại (sau phần trắc nghiệm thường). */
  numberingStart: number;
  /** Id câu đang được AI tạo lại (nếu có). */
  regeneratingId: string | number | null;
  onRegenerate: (id: string | number) => void;
  onChange: (questions: ExtraQuestion[]) => void;
};

const newExtraId = () => `extra-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const createEmptyMultiMcq = (index: number): ExtraQuestion => ({
  id: newExtraId(),
  kind: 'multi-mcq',
  questionLabel: `Câu ${index}`,
  points: 0.5,
  content: '',
  options: ['', '', '', ''],
  correctIndexes: [],
});

const createEmptyTrueFalse = (index: number): ExtraQuestion => ({
  id: newExtraId(),
  kind: 'true-false',
  questionLabel: `Câu ${index}`,
  points: 1,
  content: '',
  statements: [
    { text: '', answer: true },
    { text: '', answer: false },
    { text: '', answer: true },
    { text: '', answer: true },
  ],
});

/**
 * Trình soạn câu hỏi mở rộng: trắc nghiệm nhiều đáp án + đúng/sai.
 * Hỗ trợ thêm, sửa, xóa, đổi thứ tự và tạo lại từng câu bằng AI.
 */
export function ExtraQuestionsEditor({
  questions,
  numberingStart,
  regeneratingId,
  onRegenerate,
  onChange,
}: ExtraQuestionsEditorProps) {
  const [openId, setOpenId] = useState<string | number | null>(null);

  const renumber = (list: ExtraQuestion[]): ExtraQuestion[] =>
    list.map((question, index) => ({
      ...question,
      questionLabel: question.questionLabel.startsWith('Câu ')
        ? `Câu ${numberingStart + index}`
        : question.questionLabel,
    }));

  const update = (id: string | number, patch: Partial<ExtraQuestion>) => {
    onChange(questions.map((question) => (question.id === id ? { ...question, ...patch } : question)));
  };

  const addQuestion = (kind: ExtraQuestion['kind']) => {
    const index = numberingStart + questions.length;
    onChange([...questions, kind === 'true-false' ? createEmptyTrueFalse(index) : createEmptyMultiMcq(index)]);
  };

  const removeQuestion = (id: string | number) => {
    onChange(renumber(questions.filter((question) => question.id !== id)));
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(renumber(next));
  };

  const toggleCorrect = (question: ExtraQuestion, optionIndex: number) => {
    const current = question.correctIndexes ?? [];
    const next = current.includes(optionIndex)
      ? current.filter((value) => value !== optionIndex)
      : [...current, optionIndex];
    update(question.id, { correctIndexes: next.sort((a, b) => a - b) });
  };

  return (
    <div className="space-y-4">
      {questions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-center">
          <p className="text-xs font-bold text-slate-600">Chưa có câu hỏi dạng mở rộng</p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Thêm câu trắc nghiệm nhiều đáp án hoặc câu đúng/sai (4 ý nhận định) — chấm tự động.
          </p>
        </div>
      ) : null}

      {questions.map((question, index) => {
        const open = openId === question.id;
        const regenerating = regeneratingId !== null && regeneratingId === question.id;
        return (
          <div
            key={question.id}
            className={cn(
              'rounded-2xl border bg-slate-50/70 p-4 sm:p-5',
              question.kind === 'true-false' ? 'border-rose-200' : 'border-indigo-200',
            )}
          >
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'flex size-8 items-center justify-center rounded-xl bg-white text-xs font-bold shadow-sm ring-1 ring-slate-200',
                    question.kind === 'true-false' ? 'text-rose-700' : 'text-indigo-700',
                  )}
                >
                  {index + 1}
                </span>
                <input
                  type="text"
                  value={question.questionLabel}
                  onChange={(event) => update(question.id, { questionLabel: event.target.value })}
                  placeholder="Câu 1"
                  className={cn(
                    'w-28 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold outline-none transition focus:ring-2',
                    question.kind === 'true-false'
                      ? 'text-rose-700 focus:border-rose-400 focus:ring-rose-500/20'
                      : 'text-indigo-700 focus:border-indigo-400 focus:ring-indigo-500/20',
                  )}
                />
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-bold ring-1',
                    question.kind === 'true-false'
                      ? 'bg-rose-50 text-rose-700 ring-rose-600/10'
                      : 'bg-indigo-50 text-indigo-700 ring-indigo-600/10',
                  )}
                >
                  {EXTRA_KIND_LABELS[question.kind]}
                </span>
                <span className="text-xs font-bold text-slate-500">Điểm:</span>
                <input
                  type="number"
                  min={0}
                  step={0.25}
                  value={question.points}
                  onChange={(event) => update(question.id, { points: Number(event.target.value) })}
                  className="w-16 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-center text-xs font-bold text-slate-700 outline-none"
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <ProvenanceBadges provenance={question} />
                <button
                  type="button"
                  onClick={() => onRegenerate(question.id)}
                  disabled={regeneratingId !== null}
                  title="Yêu cầu AI tạo lại câu này"
                  className="inline-flex items-center gap-1 rounded-xl border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-bold text-violet-700 transition hover:bg-violet-100 disabled:opacity-60"
                >
                  {regenerating ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  Tạo lại
                </button>
                <button
                  type="button"
                  onClick={() => moveQuestion(index, -1)}
                  disabled={index === 0}
                  aria-label="Chuyển câu lên trên"
                  className="rounded-xl p-1.5 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronsUpDown className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveQuestion(index, 1)}
                  disabled={index === questions.length - 1}
                  aria-label="Chuyển câu xuống dưới"
                  className="rotate-90 rounded-xl p-1.5 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronsUpDown className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeQuestion(question.id)}
                  className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold text-rose-500 transition hover:bg-rose-100"
                >
                  <Trash2 className="size-3.5" /> Xóa
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOpenId(open ? null : question.id)}
              className="mt-3 flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="min-w-0 truncate text-xs font-semibold text-slate-700">
                {question.content.trim() || '(nhấn để soạn nội dung câu hỏi)'}
              </span>
              <ChevronDown
                className={cn('size-4 shrink-0 text-slate-500 transition-transform', open && 'rotate-180')}
              />
            </button>

            {open ? (
              <div className="mt-3 space-y-3">
                <textarea
                  value={question.content}
                  onChange={(event) => update(question.id, { content: event.target.value })}
                  rows={2}
                  placeholder={
                    question.kind === 'true-false'
                      ? 'Đề dẫn chung, ví dụ: Cho mệnh đề sau, mỗi ý a) b) c) d) hãy chọn Đúng hoặc Sai...'
                      : 'Câu hỏi yêu cầu chọn nhiều phương án đúng, ví dụ: Chọn các số là bội của 6...'
                  }
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium outline-none transition placeholder:text-slate-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
                />

                {question.kind === 'multi-mcq' ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {OPTION_LABELS.map((label, optionIndex) => (
                      <div key={label} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleCorrect(question, optionIndex)}
                          title="Chọn/bỏ chọn là đáp án đúng"
                          aria-label={`Chọn ${label} là đáp án đúng`}
                          className={cn(
                            'flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition',
                            (question.correctIndexes ?? []).includes(optionIndex)
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'border border-slate-200 bg-white text-slate-500 hover:border-emerald-300 hover:text-emerald-600',
                          )}
                        >
                          {label}
                        </button>
                        <input
                          type="text"
                          value={question.options?.[optionIndex] ?? ''}
                          onChange={(event) => {
                            const options = [...(question.options ?? ['', '', '', ''])];
                            options[optionIndex] = event.target.value;
                            update(question.id, { options });
                          }}
                          placeholder={`Nội dung phương án ${label}`}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium outline-none transition placeholder:text-slate-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
                        />
                      </div>
                    ))}
                    <p className="text-xs font-medium text-slate-500 sm:col-span-2">
                      Nhấn nút chữ A/B/C/D để chọn các phương án ĐÚNG (chọn nhiều phương án). Hiện chọn:{' '}
                      <strong>{(question.correctIndexes ?? []).map((value) => OPTION_LABELS[value]).join(', ') || 'chưa chọn'}</strong>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(question.statements ?? []).map((statement, statementIndex) => (
                      <div key={statementIndex} className="flex items-center gap-2">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-xs font-bold text-rose-700">
                          {String.fromCharCode(97 + statementIndex)}
                        </span>
                        <input
                          type="text"
                          value={statement.text}
                          onChange={(event) => {
                            const statements = [...(question.statements ?? [])];
                            statements[statementIndex] = { ...statement, text: event.target.value };
                            update(question.id, { statements });
                          }}
                          placeholder={`Ý nhận định ${String.fromCharCode(97 + statementIndex)}...`}
                          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium outline-none transition placeholder:text-slate-500 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20"
                        />
                        <div className="flex shrink-0 gap-1">
                          {[true, false].map((value) => (
                            <button
                              key={String(value)}
                              type="button"
                              onClick={() => {
                                const statements = [...(question.statements ?? [])];
                                statements[statementIndex] = { ...statement, answer: value };
                                update(question.id, { statements });
                              }}
                              className={cn(
                                'flex h-8 w-9 items-center justify-center rounded-lg text-xs font-bold transition',
                                statement.answer === value
                                  ? value
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'bg-rose-600 text-white shadow-sm'
                                  : 'border border-slate-200 bg-white text-slate-500 hover:text-slate-700',
                              )}
                            >
                              {value ? 'Đ' : 'S'}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <p className="text-xs font-medium text-slate-500">
                      Chọn Đ (Đúng) hoặc S (Sai) cho từng ý. Mỗi ý đúng được {question.points && (question.statements ?? []).length ? (question.points / (question.statements ?? []).length).toFixed(2) : '0'} điểm.
                    </p>
                  </div>
                )}

                <textarea
                  value={question.explanation?.text ?? ''}
                  onChange={(event) =>
                    update(question.id, {
                      explanation: { text: event.target.value, images: question.explanation?.images ?? [] },
                    })
                  }
                  rows={2}
                  placeholder="Lời giải (học sinh xem sau khi nộp bài)..."
                  className="w-full resize-y rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2.5 text-xs font-medium outline-none transition placeholder:text-slate-500 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20"
                />
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => addQuestion('multi-mcq')}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-indigo-300 py-3 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50"
        >
          <Plus className="size-4" />
          Thêm TN nhiều đáp án
        </button>
        <button
          type="button"
          onClick={() => addQuestion('true-false')}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-rose-300 py-3 text-xs font-bold text-rose-700 transition hover:bg-rose-50"
        >
          <Plus className="size-4" />
          Thêm câu Đúng/Sai
        </button>
      </div>
    </div>
  );
}
