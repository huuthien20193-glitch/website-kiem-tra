'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Award,
  BookOpen,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import type { Exam, ExamAnswerKey, Grade, Submission, TeacherDocument, TeacherTab } from '@/lib/types'
import { DEFAULT_TEACHER_NAME } from '@/lib/types'
import { clearSession, getSession, loadDocuments, loadExams, loadSubmissions, saveExams, saveSubmissions } from '@/lib/storage'
import { cn, formatNumber, isPending } from '@/lib/utils'
import { downloadCsv } from '@/lib/export'
import { BrandLogo } from '@/components/ui/Brand'
import { LoadingBlock } from '@/components/ui'
import {
  createClient,
  deleteExamFromCloud,
  fetchDocumentsFromCloud,
  fetchExamsFromCloud,
  fetchSubmissionsFromCloud,
  saveExamToCloud,
  updateSubmissionInCloud,
} from '@/lib/supabase'
import { useConfirm, useToast } from '@/components/ui/FeedbackProvider'
import { useIsClient } from '@/lib/hooks'
import { OverviewTab } from '@/components/teacher/OverviewTab'
import { ExamsTab } from '@/components/teacher/ExamsTab'
import { CreateExamTab } from '@/components/teacher/CreateExamTab'
import { DocumentsTab } from '@/components/teacher/DocumentsTab'
import { SubmissionsTab } from '@/components/teacher/SubmissionsTab'
import { GradingModal } from '@/components/teacher/GradingModal'
import { AnswerKeyModal } from '@/components/teacher/AnswerKeyModal'

const NAV_ITEMS: Array<{ key: TeacherTab; label: string; icon: typeof LayoutDashboard; hint: string }> = [
  { key: 'overview', label: 'Tổng quan', icon: LayoutDashboard, hint: 'Bảng điều khiển' },
  { key: 'documents', label: 'Tài liệu học tập', icon: BookOpen, hint: 'AI đọc & hỏi đáp' },
  { key: 'exams', label: 'Quản lý đề thi', icon: FileText, hint: 'Danh sách đề' },
  { key: 'create-exam', label: 'Tạo đề kiểm tra', icon: Plus, hint: 'AI soạn đề từ tài liệu' },
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
  const [documents, setDocuments] = useState<TeacherDocument[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [submissionsLoading, setSubmissionsLoading] = useState(true)
  const [submissionsError, setSubmissionsError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [gradingSubmission, setGradingSubmission] = useState<Submission | null>(null)
  const [answerKeyExam, setAnswerKeyExam] = useState<Exam | null>(null)
  /** ID các bài nộp đã biết — dùng để phát hiện bài mới khi tự động tải lại. */
  const knownSubmissionIds = useRef<Set<string> | null>(null)

  // Tên giáo viên lấy từ phiên đăng nhập; chỉ dự phòng bằng hằng số chung khi session rỗng.
  const teacherName = session.username || DEFAULT_TEACHER_NAME

  // Tải danh sách đề thi: ưu tiên Supabase, dự phòng localStorage khi mất mạng.
  // Không bao giờ ghi đè danh sách đang có bằng dữ liệu local rỗng.
  const fetchExams = async () => {
    try {
      const cloud = await fetchExamsFromCloud()
      if (cloud) {
        setExams(cloud)
        saveExams(cloud)
        return
      }
    } catch (error) {
      console.error('Lỗi khi tải đề thi:', error)
    }
    setExams((current) => {
      if (current.length > 0) return current
      return typeof window !== 'undefined' ? loadExams() : []
    })
  }

  // Tải tài liệu học tập: ưu tiên Supabase, dự phòng localStorage.
  const fetchDocuments = async () => {
    try {
      const cloud = await fetchDocumentsFromCloud()
      if (cloud) {
        setDocuments(cloud)
        return
      }
    } catch (error) {
      console.error('Lỗi khi tải tài liệu:', error)
    }
    setDocuments((current) => {
      if (current.length > 0) return current
      return typeof window !== 'undefined' ? loadDocuments() : []
    })
  }

  // Tải danh sách bài nộp từ Supabase (dự phòng localStorage khi mất mạng).
  // Hàm này được gọi lặp lại mỗi 15 giây nên học sinh nộp bài là giáo viên thấy ngay.
  const fetchSubmissions = useCallback(async (silent = false) => {
    if (!silent) setSubmissionsLoading(true)
    try {
      const cloud = await fetchSubmissionsFromCloud()
      if (cloud) {
        const previous = knownSubmissionIds.current
        if (previous) {
          const fresh = cloud.filter((submission) => !previous.has(submission.id))
          if (fresh.length > 0) {
            toast.info(
              fresh.length === 1 ? 'Có bài nộp mới' : `Có ${fresh.length} bài nộp mới`,
              fresh.length === 1
                ? `${fresh[0].studentName} vừa nộp "${fresh[0].examTitle}".`
                : 'Danh sách bài nộp vừa được cập nhật.',
            )
          }
        }
        knownSubmissionIds.current = new Set(cloud.map((submission) => submission.id))
        setSubmissions(cloud)
        setSubmissionsError(null)
        return
      }
      setSubmissionsError('Máy chủ không phản hồi hoặc chưa được cấu hình.')
      setSubmissions((current) => {
        if (current.length > 0) return current
        return typeof window !== 'undefined' ? loadSubmissions() : []
      })
    } catch (error) {
      console.error('Lỗi khi tải bài nộp:', error)
      setSubmissionsError(error instanceof Error ? error.message : 'Lỗi kết nối máy chủ.')
      setSubmissions((current) => {
        if (current.length > 0) return current
        return typeof window !== 'undefined' ? loadSubmissions() : []
      })
    } finally {
      if (!silent) setSubmissionsLoading(false)
    }
  }, [toast])

  // Tải dữ liệu khi mở trang
  useEffect(() => {
    // Trì hoãn tải dữ liệu ra sau khi mount để không setState đồng bộ trong effect.
    const timer = setTimeout(() => {
      void fetchExams()
      void fetchSubmissions()
      void fetchDocuments()
    }, 0)
    return () => clearTimeout(timer)
     
  }, [fetchSubmissions])

  // Tự động làm mới bài nộp mỗi 15 giây — không cần giáo viên bấm tải lại.
  useEffect(() => {
    const timer = setInterval(() => {
      void fetchSubmissions(true)
    }, 15_000)
    return () => clearInterval(timer)
     
  }, [fetchSubmissions])

  // Tải lại dữ liệu khi quay lại tab trình duyệt
  useEffect(() => {
    const handleFocus = () => {
      void fetchExams()
      void fetchSubmissions()
      void fetchDocuments()
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleFocus()
    }
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
     
  }, [fetchSubmissions])

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

  const handleCreateExam = async (exam: Exam): Promise<boolean> => {
    const result = await saveExamToCloud(exam)
    if (!result.ok) {
      toast.error('Không thể công bố đề', result.message ?? 'Vui lòng thử lại.')
      return false
    }

    const next = [exam, ...exams.filter((item) => item.id !== exam.id)]
    setExams(next)
    saveExams(next)
    toast.success('Đã công bố đề kiểm tra', exam.title)
    navigate('exams')
    return true
  }

  const handleDeleteExam = async (exam: Exam) => {
    const confirmed = await confirm({
      title: 'Xóa đề kiểm tra?',
      message: `Đề "${exam.title}" sẽ bị xóa khỏi danh sách. Học sinh sẽ không thể làm đề này nữa.`,
      confirmLabel: 'Xóa đề',
      tone: 'danger',
    })
    if (!confirmed) return

    const result = await deleteExamFromCloud(exam.id)
    if (!result.ok) {
      toast.error('Lỗi', result.message ?? 'Không thể xóa đề kiểm tra.')
      return
    }

    const next = exams.filter((item) => item.id !== exam.id)
    setExams(next)
    saveExams(next)
    toast.success('Đã xóa đề kiểm tra')
  }

  const handleUpdateExamGrade = async (exam: Exam, grade: Grade) => {
    const updated: Exam = { ...exam, grade }
    setExams((current) => current.map((item) => (item.id === exam.id ? updated : item)))

    const result = await saveExamToCloud(updated)
    if (!result.ok) {
      toast.error('Không thể đổi khối lớp', result.message ?? 'Vui lòng thử lại.')
      void fetchExams()
      return
    }

    toast.success('Đã đổi khối lớp', `${exam.title} → Lớp ${grade}`)
  }

  // Lưu đáp án công bố của đề. Nội dung rỗng thì xóa hẳn để dữ liệu gọn nhẹ.
  const handleSaveAnswerKey = async (answerKey: ExamAnswerKey): Promise<boolean> => {
    if (!answerKeyExam) return false

    const hasContent = answerKey.text.trim().length > 0 || answerKey.images.length > 0
    const updated: Exam = {
      ...answerKeyExam,
      answerKey: hasContent ? answerKey : undefined,
    }

    const result = await saveExamToCloud(updated)
    if (!result.ok) {
      toast.error('Không thể lưu đáp án', result.message ?? 'Vui lòng thử lại.')
      return false
    }

    const next = exams.map((item) => (item.id === updated.id ? updated : item))
    setExams(next)
    saveExams(next)
    toast.success(
      'Đã lưu đáp án',
      answerKey.enabled
        ? 'Học sinh sẽ xem được đáp án sau khi nộp bài.'
        : 'Đáp án đã lưu nhưng đang tạm ẩn với học sinh.',
    )
    return true
  }

  // Nhân bản đề: tạo một bản sao với id mới và tên thêm "(bản sao)".
  // Copy sâu (deep copy) các mảng lồng nhau — nếu chỉ copy tham chiếu thì sửa
  // câu hỏi của bản sao sẽ làm thay đổi cả đề gốc.
  const handleDuplicateExam = async (exam: Exam) => {
    const copy: Exam = {
      ...exam,
      id: `exam-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: `${exam.title} (bản sao)`,
      createdAt: new Date().toISOString(),
      mcqImages: [...exam.mcqImages],
      mcqQuestions: exam.mcqQuestions?.map((question) =>
        question ? { ...question, options: [...question.options] } : null,
      ),
      mcqExplanations: exam.mcqExplanations?.map((explanation) => ({
        ...explanation,
        images: [...explanation.images],
      })),
      shortAnswerQuestions: exam.shortAnswerQuestions.map((question) => ({ ...question })),
      essayQuestions: exam.essayQuestions.map((question) => ({
        ...question,
        subParts: question.subParts.map((part) => ({ ...part })),
      })),
      answerKey: exam.answerKey
        ? { ...exam.answerKey, images: [...exam.answerKey.images] }
        : undefined,
    }

    const result = await saveExamToCloud(copy)
    if (!result.ok) {
      toast.error('Không thể nhân bản đề', result.message ?? 'Vui lòng thử lại.')
      return
    }

    const next = [copy, ...exams]
    setExams(next)
    saveExams(next)
    toast.success('Đã nhân bản đề', `Bản sao: ${copy.title}`)
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
    // Lưu lên Supabase trước (không để lỗi mạng chặn việc chấm bài).
    const result = await updateSubmissionInCloud(updated)

    // Luôn cập nhật danh sách trên máy hiện tại (dù có mạng hay mất mạng).
    const next = submissions.map((item) => (item.id === updated.id ? updated : item))
    saveSubmissions(next)
    setSubmissions(next)
    setGradingSubmission(null)

    if (!result.ok) {
      toast.warning(
        'Chưa đồng bộ lên máy chủ',
        'Điểm đã được lưu trên thiết bị này nhưng chưa đẩy lên máy chủ. Kiểm tra kết nối mạng rồi thử lại.',
      )
      return
    }
    toast.success('Đã lưu điểm', `${updated.studentName}: ${formatNumber(updated.score)} điểm.`)
  }

  const handleLogout = () => {
    clearSession()
    router.push('/')
  }

  if (!isClient || session.role !== 'TEACHER') {
    return <LoadingBlock label="Đang tải không gian giáo viên..." />
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
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-bold text-white">
              GV
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">{teacherName}</p>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Giáo viên</p>
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
                    <span className="block truncate text-sm font-bold">{item.label}</span>
                    <span className={cn('block text-xs font-medium', active ? 'text-emerald-100' : 'text-slate-500')}>
                      {item.hint}
                    </span>
                  </span>
                  {item.key === 'submissions' && pendingCount > 0 ? (
                    <span className="flex size-5 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-amber-950">
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
              onClick={() => router.push('/teacher/classes')}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-400 transition hover:bg-white/5 hover:text-white"
            >
              <Users className="size-4" />
              Lớp học
            </button>
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
              <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-amber-950">
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

          {activeTab === 'documents' ? (
            <DocumentsTab documents={documents} onDocumentsChange={setDocuments} />
          ) : null}

          {activeTab === 'exams' ? (
            <ExamsTab
              exams={exams}
              onCreate={() => navigate('create-exam')}
              onDelete={handleDeleteExam}
              onDuplicate={handleDuplicateExam}
              onUpdateGrade={handleUpdateExamGrade}
              onEditAnswerKey={(exam) => setAnswerKeyExam(exam)}
            />
          ) : null}

          {activeTab === 'create-exam' ? (
            <CreateExamTab
              onCreate={handleCreateExam}
              onCancel={() => navigate('exams')}
              documents={documents}
            />
          ) : null}

          {activeTab === 'submissions' ? (
            <SubmissionsTab
              submissions={submissions}
              isLoading={submissionsLoading}
              error={submissionsError}
              onRefresh={() => void fetchSubmissions()}
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

      {answerKeyExam ? (
        <AnswerKeyModal
          exam={answerKeyExam}
          onClose={() => setAnswerKeyExam(null)}
          onSave={handleSaveAnswerKey}
        />
      ) : null}
    </div>
  )
}
