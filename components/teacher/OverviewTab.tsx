'use client';

import {
  ArrowRight,
  Award,
  Clock3,
  FileText,
  Inbox,
  Plus,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { Exam, Submission, TeacherTab } from '@/lib/types';
import { subjectStyle } from '@/lib/types';
import { cn, formatNumber, initials, isPending, progressPercent, todayLabel } from '@/lib/utils';

type OverviewTabProps = {
  exams: Exam[];
  submissions: Submission[];
  teacherName: string;
  onNavigate: (tab: TeacherTab) => void;
  onGrade: (submission: Submission) => void;
};

export function OverviewTab({ exams, submissions, teacherName, onNavigate, onGrade }: OverviewTabProps) {
  const pending = submissions.filter((submission) => isPending(submission.status));
  const graded = submissions.length - pending.length;
  const averageScore =
    submissions.length > 0
      ? submissions.reduce((sum, submission) => sum + (submission.score || 0), 0) / submissions.length
      : 0;
  const uniqueStudents = new Set(submissions.map((submission) => `${submission.studentName}-${submission.studentClass}`)).size;
  const gradedPercent = progressPercent(graded, submissions.length);

  const stats = [
    {
      label: 'Đề kiểm tra',
      value: String(exams.length),
      hint: `${exams.reduce((sum, exam) => sum + exam.mcqCount, 0)} câu trắc nghiệm`,
      icon: FileText,
      tone: 'from-emerald-500 to-teal-600',
      onClick: () => onNavigate('exams'),
    },
    {
      label: 'Bài đã nộp',
      value: String(submissions.length),
      hint: `${uniqueStudents} học sinh tham gia`,
      icon: Inbox,
      tone: 'from-sky-500 to-indigo-600',
      onClick: () => onNavigate('submissions'),
    },
    {
      label: 'Chờ chấm tự luận',
      value: String(pending.length),
      hint: pending.length > 0 ? 'Cần xử lý sớm' : 'Đã chấm xong',
      icon: Clock3,
      tone: 'from-amber-500 to-orange-600',
      onClick: () => onNavigate('submissions'),
    },
    {
      label: 'Điểm trung bình',
      value: formatNumber(averageScore),
      hint: submissions.length > 0 ? 'Tính trên toàn bộ bài nộp' : 'Chưa có dữ liệu',
      icon: TrendingUp,
      tone: 'from-violet-500 to-fuchsia-600',
      onClick: () => onNavigate('submissions'),
    },
  ];

  const recentSubmissions = submissions.slice(0, 5);
  const recentExams = exams.slice(0, 4);

  return (
    <div className="space-y-7 animate-fade-up">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-600/10">
            <Sparkles className="size-3.5" />
            {todayLabel()}
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Xin chào, {teacherName || 'Thầy Thiện'} 👋
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Quản lý đề kiểm tra, chấm trắc nghiệm tự động và theo dõi kết quả học sinh.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('create-exam')}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:from-emerald-700 hover:to-teal-700 active:scale-[0.98]"
        >
          <Plus className="size-4" />
          Tạo đề kiểm tra
        </button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <button
              key={stat.label}
              type="button"
              onClick={stat.onClick}
              className="group rounded-3xl border border-slate-200/80 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-900/5"
            >
              <div className="flex items-start justify-between gap-3">
                <span className={cn('flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md', stat.tone)}>
                  <Icon className="size-5" />
                </span>
                <ArrowRight className="size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-500" />
              </div>
              <p className="mt-4 text-2xl font-black tracking-tight text-slate-900">{stat.value}</p>
              <p className="text-sm font-semibold text-slate-600">{stat.label}</p>
              <p className="mt-1 text-[11px] font-medium text-slate-400">{stat.hint}</p>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <section className="rounded-3xl border border-slate-200/80 bg-white shadow-sm xl:col-span-3">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-sm font-black text-slate-900">Bài nộp gần đây</h2>
              <p className="text-[11px] font-medium text-slate-400">Danh sách học sinh vừa hoàn thành bài thi</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('submissions')}
              className="inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50"
            >
              Xem tất cả
              <ArrowRight className="size-3.5" />
            </button>
          </div>

          {recentSubmissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Inbox className="size-6" />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-700">Chưa có bài nộp nào</p>
                <p className="mt-1 text-xs text-slate-400">Khi học sinh nộp bài, kết quả sẽ xuất hiện tại đây.</p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentSubmissions.map((submission) => {
                const pendingSubmission = isPending(submission.status);
                return (
                  <li key={submission.id} className="flex items-center gap-3 px-5 py-4 transition hover:bg-slate-50/70 sm:px-6">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 text-xs font-black text-white">
                      {initials(submission.studentName)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{submission.studentName}</p>
                      <p className="truncate text-[11px] font-medium text-slate-400">
                        {submission.studentClass} · {submission.examTitle}
                      </p>
                    </div>
                    <div className="hidden text-right sm:block">
                      <p className="text-sm font-black text-emerald-600">{formatNumber(submission.score)}đ</p>
                      <p className={cn('text-[10px] font-bold', pendingSubmission ? 'text-amber-600' : 'text-emerald-600')}>
                        {pendingSubmission ? 'Chờ chấm' : 'Hoàn tất'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onGrade(submission)}
                      className={cn(
                        'shrink-0 rounded-xl px-3 py-2 text-[11px] font-bold transition',
                        pendingSubmission
                          ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                      )}
                    >
                      {pendingSubmission ? 'Chấm bài' : 'Xem'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="space-y-6 xl:col-span-2">
          <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black text-slate-900">Tiến độ chấm bài</h2>
                <p className="text-[11px] font-medium text-slate-400">Tự luận cần giáo viên xử lý</p>
              </div>
              <span className="flex size-10 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                <Award className="size-5" />
              </span>
            </div>

            <div className="mt-5 flex items-end justify-between">
              <p className="text-3xl font-black text-slate-900">{gradedPercent}%</p>
              <p className="pb-1 text-xs font-semibold text-slate-400">
                {graded}/{submissions.length || 0} bài
              </p>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                style={{ width: `${gradedPercent}%` }}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-amber-50 p-3">
                <p className="text-lg font-black text-amber-700">{pending.length}</p>
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600">Chờ chấm</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-3">
                <p className="text-lg font-black text-emerald-700">{graded}</p>
                <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Hoàn tất</p>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-black text-slate-900">Đề kiểm tra gần đây</h2>
              <Users className="size-4 text-slate-300" />
            </div>
            {recentExams.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-xs font-semibold text-slate-400">Chưa có đề kiểm tra nào.</p>
                <button
                  type="button"
                  onClick={() => onNavigate('create-exam')}
                  className="mt-3 text-xs font-bold text-emerald-700 hover:underline"
                >
                  Tạo đề đầu tiên →
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentExams.map((exam) => (
                  <li key={exam.id}>
                    <button
                      type="button"
                      onClick={() => onNavigate('exams')}
                      className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-slate-50"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                        <FileText className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-slate-800">{exam.title}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
                          <span className={cn('rounded-full px-1.5 py-0.5 ring-1', subjectStyle(exam.subject))}>{exam.subject}</span>
                          <span>· {exam.durationMinutes} phút</span>
                        </span>
                      </span>
                      <ArrowRight className="size-3.5 text-slate-300" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
