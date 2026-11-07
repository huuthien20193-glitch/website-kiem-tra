'use client'

import { useMemo, useState } from 'react'
import {
  Award,
  CheckCircle2,
  Clock3,
  Download,
  Inbox,
  LoaderCircle,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import type { Submission } from '@/lib/types'
import { cn, formatNumber, initials, isPending } from '@/lib/utils'

type StatusFilter = 'all' | 'pending' | 'done'

type SubmissionsTabProps = {
  submissions: Submission[]
  isLoading?: boolean
  onGrade: (submission: Submission) => void
  onDelete: (id: string) => void
  onClearAll: () => void
  onExport: () => void
}

function StatusBadge({ status }: { status: string }) {
  const pending = isPending(status)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black',
        pending ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/10' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10',
      )}
    >
      <span className={cn('size-1.5 rounded-full', pending ? 'bg-amber-500' : 'bg-emerald-500')} />
      {pending ? 'Chờ chấm tự luận' : 'Đã hoàn tất'}
    </span>
  )
}

export function SubmissionsTab({
  submissions,
  isLoading = false,
  onGrade,
  onDelete,
  onClearAll,
  onExport,
}: SubmissionsTabProps) {
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const pendingCount = submissions.filter((submission) => isPending(submission.status)).length
  const gradedCount = submissions.length - pendingCount
  const averageScore =
    submissions.length > 0
      ? submissions.reduce((sum, submission) => sum + submission.score, 0) / submissions.length
      : 0

  const filtered = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return submissions.filter((submission) => {
      const matchesKeyword =
        !query ||
        submission.studentName.toLowerCase().includes(query) ||
        submission.studentClass?.toLowerCase().includes(query) ||
        submission.examTitle.toLowerCase().includes(query)
      const pending = isPending(submission.status)
      const matchesStatus =
        statusFilter === 'all' || (statusFilter === 'pending' ? pending : !pending)
      return matchesKeyword && matchesStatus
    })
  }, [submissions, keyword, statusFilter])

  const filterButtons: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: 'all', label: 'Tất cả', count: submissions.length },
    { key: 'pending', label: 'Chờ chấm', count: pendingCount },
    { key: 'done', label: 'Hoàn tất', count: gradedCount },
  ]

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Kết quả thi & Chấm bài</h1>
          <p className="mt-1 text-sm text-slate-500">Theo dõi bài nộp, chấm tự luận và xuất bảng điểm cho giáo viên.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onExport}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition:hover:bg-emerald-700 active:scale-[0.98]"
          >
            <Download className="size-4" />
            Xuất file điểm
          </button>
          <button
            type="button"
            onClick={onClearAll}
            disabled={submissions.length === 0}
            className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-2.5 text-xs font-bold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="size-4" />
            Xóa tất cả
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Tổng bài nộp', value: String(submissions.length), icon: Inbox, tone: 'bg-sky-50 text-sky-600' },
          { label: 'Chờ chấm', value: String(pendingCount), icon: Clock3, tone: 'bg-amber-50 text-amber-600' },
          { label: 'Hoàn tất', value: String(gradedCount), icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-600' },
          {
            label: 'Điểm trung bình',
            value: formatNumber(averageScore),
            icon: Award,
            tone: 'bg-violet-50 text-violet-600',
          },
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', stat.tone)}>
                <Icon className="size-5" />
              </span>
              <div>
                <p className="text-xl font-black leading-none text-slate-900">{stat.value}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{stat.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="rounded-3xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {filterButtons.map((button) => (
              <button
                key={button.key}
                type="button"
                onClick={() => setStatusFilter(button.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold transition',
                  statusFilter === button.key
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                )}
              >
                {button.label}
                <span
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-[10px]',
                    statusFilter === button.key ? 'bg-white/15 text-white' : 'bg-white text-slate-500',
                  )}
                >
                  {button.count}
                </span>
              </button>
            ))}
          </div>

          <div className="relative w-full lg:w-72">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Tìm học sinh, lớp, đề thi..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-10 text-xs font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
            />
            {keyword ? (
              <button
                type="button"
                onClick={() => setKeyword('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Xóa tìm kiếm"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        {isLoading && submissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <LoaderCircle className="size-7 animate-spin text-emerald-500" />
            <p className="text-sm font-bold text-slate-600">Đang tải bài nộp từ máy chủ...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <span className="flex size-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-400">
              <Inbox className="size-7" />
            </span>
            <div>
              <p className="text-sm font-black text-slate-700">
                {submissions.length === 0 ? 'Chưa có học sinh nộp bài' : 'Không tìm thấy bài nộp phù hợp'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {submissions.length === 0
                  ? 'Kết quả bài làm của học sinh sẽ xuất hiện tại đây.'
                  : 'Thử đổi từ khóa hoặc bộ lọc trạng thái.'}
              </p>
            </div>
          </div>
        ) : (
          <>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-black uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3.5">Học sinh</th>
                  <th className="px-5 py-3.5">Đề thi</th>
                  <th className="px-5 py-3.5">Điểm</th>
                  <th className="px-5 py-3.5">Trạng thái</th>
                  <th className="px-5 py-3.5">Thời gian nộp</th>
                  <th className="px-5 py-3.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((submission) => {
                  const essayScore = Math.max(0, Number((submission.score - submission.autoScore).toFixed(1)))
                  return (
                    <tr key={submission.id} className="transition hover:bg-slate-50/70">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-[10px] font-black text-white">
                            {initials(submission.studentName)}
                          </span>
                          <div>
                            <p className="font-bold text-slate-900">{submission.studentName}</p>
                            <p className="text-[11px] font-medium text-slate-400">{submission.studentClass}</p>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-[240px] px-5 py-4">
                        <p className="truncate text-xs font-semibold text-slate-700">{submission.examTitle}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-base font-black text-emerald-600">{formatNumber(submission.score)}đ</p>
                        <p className="text-[10px] font-medium text-slate-400">
                          TN {formatNumber(submission.autoScore)} · TL {formatNumber(essayScore)}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={submission.status} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-[11px] font-medium text-slate-400">
                        {submission.submittedAt}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => onGrade(submission)}
                          className="rounded-xl bg-teal-50 px-3 py-2 text-[11px] font-bold text-teal-700 transition:hover:bg-teal-100"
                        >
                          {isPending(submission.status) ? 'Chấm bài' : 'Xem chi tiết'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(submission.id)}
                          className="ml-1 rounded-xl p-2 text-rose-400 transition:hover:bg-rose-50 hover:text-rose-600"
                          aria-label="Xóa bài nộp"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Mobile cards */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {filtered.map((submission) => (
                <li key={submission.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-[10px] font-black text-white">
                      {initials(submission.studentName)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900">{submission.studentName}</p>
                          <p className="text-[11px] font-medium text-slate-400">
                            {submission.studentClass} · {submission.submittedAt}
                          </p>
                        </div>
                        <p className="shrink-0 text-base font-black text-emerald-600">{formatNumber(submission.score)}đ</p>
                      </div>
                      <p className="mt-1 truncate text-[11px] font-semibold text-slate-600">{submission.examTitle}</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <StatusBadge status={submission.status} />
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onGrade(submission)}
                            className="rounded-lg bg-teal-50 px-3 py-2 text-[11px] font-bold text-teal-700"
                          >
                            {isPending(submission.status) ? 'Chấm bài' : 'Xem'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(submission.id)}
                            className="rounded-lg p-2 text-rose-400 hover:bg-rose-50"
                            aria-label="Xóa bài nộp"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}