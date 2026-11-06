'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Award,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Plus,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import type { Exam, Submission, TeacherTab } from '@/lib/types'
import { clearSession, getSession, loadExams } from '@/lib/storage'
import { cn, formatNumber, isPending } from '@/lib/utils'
import { downloadCsv } from '@/lib/export'
import { BrandLogo } from '@/components/ui/Brand'
import { createClient, mapRowToSubmission } from '@/lib/supabase'
import { useConfirm, useToast } from '@/components/ui/FeedbackProvider'
import { useIsClient } from '@/lib/hooks'
import { OverviewTab } from '@/components/teacher/OverviewTab'
import { ExamsTab } from '@/components/teacher/ExamsTab'
import { CreateExamTab } from '@/components/teacher/CreateExamTab'
import { SubmissionsTab } from '@/components/teacher/SubmissionsTab'
import { GradingModal } from '@/components/teacher/GradingModal'

const NAV_ITEMS: Array<{ key: TeacherTab; label: string; icon: typeof LayoutDashboard; hint: string }> = [
  { key: 'overview', label: 'Tổng quan', icon: LayoutDashboard, hint: 'Bảng điều khiển' },
  { key: 'exams', label: 'Quản lý đề thi', icon: FileText, hint: 'Danh sách đề' },
  { key: 'create-exam', label: 'Tạo đề kiểm tra', icon: Plus, hint: 'Thiết kế đề mới' },
  { key: 'submissions', label: 'Kết quả & Chấm bài', icon: Award, hint: 'Bài nộp học sinh' },
]

export default function TeacherDashboard() {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const isClient = useIsClient()

  const session = isClient ? getSession() : { role: null as string | null, username: '' }
  const [activeTab, setActiveTab] = useState<TeacherTab>('overview')
  const [exams, setExams] = useState<Exam[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [gradingSubmission, setGradingSubmission] = useState<Submission | null>(null)

  const teacherName = session.username || 'Thầy Thiện'

  // Tải danh sách đề thi từ Supabase
  const fetchExams = async () => {
    const supabase = createClient()
    if (!supabase) {
      setExams(typeof window !== 'undefined' ? loadExams() : [])
      return
    }

    const { data, error } = await supabase.from('exams').select('*')
    if (error || !data) {
      setExams(typeof window !== 'undefined' ? loadExams() : [])
      return
    }
    setExams(data as Exam[])
  }

  // Tải danh sách bài nộp từ Supabase
  const fetchSubmissions = async () => {
    const supabase = createClient()
    if (!supabase) return

    const { data, error } = await supabase.from('submissions').select('*')
    if (error) {
      console.error('Không thể tải bài nộp:', error)
      return
    }
    if (data) {
      const formattedSubmissions = data.map((row) => mapRowToSubmission(row))
      setSubmissions(formattedSubmissions)
    }
  }

  // Tải dữ liệu khi mở trang
  useEffect(() => {
    fetchExams()
    fetchSubmissions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tải lại dữ liệu khi quay lại tab trình duyệt
  useEffect(() => {
    const handleFocus = () => {
      fetchExams()
      fetchSubmissions()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (isClient && session.role !== 'TEACHER') {
      router.replace('/')
    }
  }, [isClient, router, session.role])

  const pendingCount = submissions.filter((submission) => isPending(submission.status)).length

  const navigate = (tab: TeacherTab) => {
    setActiveTab(tab)
    setSidebarOpen(false)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCreateExam = async (exam: any) => {
    const supabase = createClient()
    if (!supabase) {
      toast.warning('Chưa cấu hình Supabase', 'Vui lòng thiết lập biến môi trường Supabase.')
      return
    }

    const examData = {
      title: exam.title,
      subject: exam.subject,
      durationMinutes: exam.durationMinutes,
      totalPoints: exam.totalPoints,
      mcqCount: exam.mcqCount,
      essayQuestions: exam.essayQuestions,
      mcqImages: exam.mcqImages ?? [],
      mcqPointPerQ: exam.mcqPointPerQ ?? 0,
      mcqAnswers: exam.mcqAnswers ?? [],
    }

    const { data, error } = await supabase.from('exams').insert(examData).select().single()

    if (error || !data) {
      toast.error('Lỗi', 'Không thể công bố đề kiểm tra.')
      return
    }

    setExams((prev) => [...prev, data as Exam])
    toast.success('Đã công bố đề kiểm tra', exam.title)
    navigate('exams')
  }

  const handleDeleteExam = async (exam: Exam) => {
    const confirmed = await confirm({
      title: 'Xóa đề kiểm tra?',
      message: `Đề "${exam.title}" sẽ bị xóa khỏi danh sách. Học sinh sẽ không thể làm đề này nữa.`,
      confirmLabel: 'Xóa đề',
      tone: 'danger',
    })
    if (!confirmed) return

    const supabase = createClient()
    if (!supabase) return

    const { error } = await supabase.from('exams').delete().eq('id', exam.id)
    if (error) {
      toast.error('Lỗi', 'Không thể xóa đề kiểm tra.')
      return
    }

    setExams(exams.filter((item) => item.id !== exam.id))
    toast.success('Đã xóa đề kiểm tra')
  }

  const handleDeleteSubmission = async (id: string) => {
    const submission = submissions.find((item) => item.id === id)
    const confirmed = await confirm({
      title: 'Xóa bài nộp này?',
      message: submission
        ? `Bài làm của ${submission.studentName} (${submission.studentClass}) sẽ bị xóa vĩnh viễn.`
        : 'Bài nộp sẽ bị xóa vĩnh viễn.',
      confirmLabel: 'Xóa bài nộp',
      tone: 'danger',
    })
    if (!confirmed) return

    const supabase = createClient()
    if (!supabase) return

    const { error } = await supabase.from('submissions').delete().eq('id', id)
    if (error) {
      toast.error('Lỗi', 'Không thể xóa bài nộp.')
      return
    }

    setSubmissions(submissions.filter((item) => item.id !== id))
    toast.success('Đã xóa bài nộp')
  }

  const handleClearAllSubmissions = async () => {
    if (submissions.length === 0) {
      toast.info('Danh sách đang trống', 'Chưa có bài nộp nào để xóa.')
      return
    }

    const confirmed = await confirm({
      title: 'Xóa toàn bộ kết quả?',
      message: `Toàn bộ ${submissions.length} bài nộp sẽ bị xóa khỏi cơ sở dữ liệu. Hành động không thể hoàn tác.`,
      confirmLabel: 'Xóa tất cả',
      tone: 'danger',
    })
    if (!confirmed) return

    const supabase = createClient()
    if (!supabase) return

    const { error } = await supabase
      .from('submissions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (error) {
      toast.error('Lỗi', 'Không thể xóa toàn bộ bài nộp.')
      return
    }

    setSubmissions([])
    setGradingSubmission(null)
    toast.success('Đã xóa toàn bộ kết quả', 'Bộ nhớ đã được giải phóng.')
  }

  const handleExportCsv = () => {
    if (submissions.length === 0) {
      toast.info('Chưa có dữ liệu để xuất', 'Hãy chờ học sinh nộp bài trước khi xuất bảng điểm.')
      return
    }
    downloadCsv(submissions)
    toast.success('Đã xuất bảng điểm', `Tệp CSV gồm ${submissions.length} bài nộp.`)
  }

  const handleSaveGrading = async (updated: Submission) => {
    const supabase = createClient()
    if (!supabase) return

    const { error } = await supabase
      .from('submissions')
      .update({
        score: updated.score,
        status: updated.status,
        essay_details: updated.essayDetails,
      })
      .eq('id', updated.id)

    if (error) {
      toast.error('Lỗi', 'Không thể lưu điểm.')
      return
    }

    setSubmissions(submissions.map((item) => (item.id === updated.id ? updated : item)))
    setGradingSubmission(null)
    toast.success('Đã lưu điểm', `${updated.studentName}: ${formatNumber(updated.score)} điểm.`)
  }

  const handleLogout = () => {
    clearSession()
    router.push('/')
  }

  if (!isClient || session.role !== 'TEACHER') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <LoaderCircle className="size-5 animate-spin text-emerald-600" />
          <span className="text-sm font-semibold text-slate-600">Đang tải không gian giáo viên...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-700">
      {sidebarOpen ? (
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm lg:hidden"
          aria-label="Đóng menu"
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 transform flex-col justify-between bg-slate-950 p-5 transition-transform duration-300 ease-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="min-h-0 overflow-y-auto">
          <div className="flex items-start justify-between">
            <BrandLogo light subtitle="Không gian giáo viên" />
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="rounded-xl p-2 text-slate-400 transition hover:bg-white/10 hover:text-white lg:hidden"
              aria-label="Đóng menu"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="mt-7 flex items-center gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-black text-white">
              GV
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">{teacherName}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Giáo viên</p>
            </div>
            <Sparkles className="ml-auto size-4 text-emerald-400" />
          </div>

          <nav className="mt-6 space-y-1.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const active = activeTab === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => navigate(item.key)}
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition',
                    active
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-950/40'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-xl transition',
                      active ? 'bg-white/15 text-white' : 'bg-white/5 text-slate-400 group-hover:text-emerald-400',
                    )}
                  >
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold">{item.label}</span>
                    <span className={cn('block text-[10px] font-medium', active ? 'text-emerald-100' : 'text-slate-500')}>
                      {item.hint}
                    </span>
                  </span>
                  {item.key === 'submissions' && pendingCount > 0 ? (
                    <span className="flex size-5 items-center justify-center rounded-full bg-amber-400 text-[10px] font-black text-amber-950">
                      {pendingCount > 9 ? '9+' : pendingCount}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </nav>

          <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={() => router.push('/student/dashboard')}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-400 transition hover:bg-white/5 hover:text-white"
            >
              <GraduationCap className="size-4" />
              Cổng học sinh
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-xl bg-rose-500/10 px-3 py-2.5 text-xs font-bold text-rose-300 transition hover:bg-rose-500/20"
            >
              <LogOut className="size-4" />
              Đăng xuất
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col lg:pl-72">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
              aria-label="Mở menu"
            >
              <Menu className="size-5" />
            </button>
            <BrandLogo compact />
          </div>
          <button
            type="button"
            onClick={() => navigate('submissions')}
            className="relative rounded-xl border border-slate-200 p-2 text-slate-600"
            aria-label="Kết quả thi"
          >
            <Users className="size-5" />
            {pendingCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-amber-400 text-[9px] font-black text-amber-950">
                {pendingCount}
              </span>
            ) : null}
          </button>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 pb-14 sm:p-6 lg:p-8">
          {activeTab === 'overview' ? (
            <OverviewTab
              exams={exams}
              submissions={submissions}
              teacherName={teacherName}
              onNavigate={navigate}
              onGrade={(submission) => setGradingSubmission(submission)}
            />
          ) : null}

          {activeTab === 'exams' ? (
            <ExamsTab
              exams={exams}
              onCreate={() => navigate('create-exam')}
              onDelete={handleDeleteExam}
              onDuplicate={() => {
                toast.info('Chức năng sắp ra mắt', 'Tính năng nhân bản đề đang được phát triển.')
                return true as boolean
              }}
            />
          ) : null}

          {activeTab === 'create-exam' ? (
            <CreateExamTab onCreate={handleCreateExam as any} onCancel={() => navigate('exams')} />
          ) : null}

          {activeTab === 'submissions' ? (
            <SubmissionsTab
              onGrade={(submission) => setGradingSubmission(submission)}
              onDelete={handleDeleteSubmission}
              onClearAll={handleClearAllSubmissions}
              onExport={handleExportCsv}
            />
          ) : null}
        </main>
      </div>

      {gradingSubmission ? (
        <GradingModal
          submission={gradingSubmission}
          onClose={() => setGradingSubmission(null)}
          onSave={handleSaveGrading}
        />
      ) : null}
    </div>
  )
}