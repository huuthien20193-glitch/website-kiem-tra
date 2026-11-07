import { createBrowserClient } from '@supabase/ssr'
import type { Exam, Submission } from './types'
import { normalizeExam, normalizeSubmission } from './storage'

export function createClient() {
  if (typeof window === 'undefined') return null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key || url.includes('your_supabase') || !url.startsWith('http')) {
    return null
  }

  return createBrowserClient(url, key)
}

const MISSING_DATA_COLUMN = /'data'|"data"|data.*does not exist|PGRST204/i

function errorMessage(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return 'Lỗi không xác định.'
  return [error.code, error.message].filter(Boolean).join(' · ')
}

/** Chuyển thời gian ISO trong database sang chuỗi hiển thị kiểu Việt Nam. */
export function formatTimestamp(value?: string | null): string {
  if (!value) return new Date().toLocaleString('vi-VN')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('vi-VN')
}

/** Database chỉ nhận ISO 8601, không nhận chuỗi toLocaleString của Việt Nam. */
function toIsoTimestamp(value?: string): string {
  if (value && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  return new Date().toISOString()
}

/* ------------------------------ Đề thi (exams) ------------------------------ */

export type ExamRow = {
  id: string
  data?: Exam | null
  title?: string | null
  subject?: string | null
  duration_minutes?: number | null
  total_points?: number | null
  mcq_count?: number | null
  essay_questions?: number | null
  status?: string | null
  created_at?: string | null
}

/**
 * Lưu toàn bộ đề trong cột `data` (jsonb) để không mất ảnh, đáp án,
 * câu tự luận... Các cột tóm tắt bên ngoài chỉ dùng để lọc/thống kê.
 */
export function examToRow(exam: Exam) {
  return {
    id: exam.id,
    data: exam,
    title: exam.title,
    subject: exam.subject,
    duration_minutes: Math.round(exam.durationMinutes),
    total_points: Number(exam.totalPoints) || 0,
    mcq_count: exam.mcqCount,
    essay_questions: exam.essayQuestions.length,
    status: exam.status ?? 'Đã xuất bản',
  }
}

export function mapRowToExam(row: ExamRow & Record<string, unknown>): Exam {
  const payload = row.data
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return normalizeExam({ ...(payload as Partial<Exam>), id: String((payload as Exam).id ?? row.id) })
  }
  // Tương thích với các bản ghi cũ chỉ có cột tóm tắt.
  return normalizeExam({
    id: String(row.id),
    title: row.title ?? undefined,
    subject: row.subject ?? undefined,
    durationMinutes: row.duration_minutes ?? undefined,
    totalPoints: row.total_points ?? undefined,
    mcqCount: row.mcq_count ?? undefined,
    status: row.status ?? undefined,
    createdAt: row.created_at ?? undefined,
  })
}

export async function fetchExamsFromCloud(): Promise<Exam[] | null> {
  const supabase = createClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('exams')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Không thể tải đề thi từ Supabase:', errorMessage(error))
    return null
  }

  return (data ?? []).map((row) => mapRowToExam(row as ExamRow & Record<string, unknown>))
}

export async function saveExamToCloud(exam: Exam): Promise<{ ok: boolean; message?: string }> {
  const supabase = createClient()
  if (!supabase) {
    return { ok: false, message: 'Chưa cấu hình NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.' }
  }

  const { error } = await supabase.from('exams').upsert(examToRow(exam), { onConflict: 'id' })

  if (error) {
    console.error('Không thể lưu đề thi lên Supabase:', errorMessage(error))
    if (MISSING_DATA_COLUMN.test(`${error.code ?? ''} ${error.message ?? ''}`)) {
      return {
        ok: false,
        message: 'Bảng exams chưa có cột data (jsonb). Hãy chạy file supabase_schema.sql trong Supabase → SQL Editor.',
      }
    }
    return { ok: false, message: errorMessage(error) }
  }

  return { ok: true }
}

export async function deleteExamFromCloud(id: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = createClient()
  if (!supabase) {
    return { ok: false, message: 'Chưa cấu hình NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.' }
  }

  const { error } = await supabase.from('exams').delete().eq('id', id)
  if (error) {
    console.error('Không thể xóa đề thi trên Supabase:', errorMessage(error))
    return { ok: false, message: errorMessage(error) }
  }
  return { ok: true }
}

/* ------------------------------ Bài nộp (submissions) ------------------------------ */

export type SubmissionRow = {
  id: string
  exam_id: string
  student_id: string
  student_name: string
  student_class: string | null
  exam_title: string
  auto_score: number
  score: number
  mcq_count: number
  mcq_correct_count: number
  student_mcq_answers: Record<number, number> | number[]
  correct_mcq_answers: number[]
  mcq_images: string[] | null
  essay_details: unknown[] | null
  status: string
  submitted_at: string
  time_spent_seconds: number | null
}

export function mapSubmissionToRow(submission: Submission) {
  return {
    exam_id: submission.examId,
    student_id: submission.studentName,
    student_name: submission.studentName,
    student_class: submission.studentClass || null,
    exam_title: submission.examTitle,
    auto_score: submission.autoScore,
    score: submission.score,
    mcq_count: submission.mcqCount,
    mcq_correct_count: submission.mcqCorrectCount,
    student_mcq_answers: submission.studentMcqAnswers,
    correct_mcq_answers: submission.correctMcqAnswers,
    mcq_images: submission.mcqImages,
    essay_details: submission.essayDetails,
    status: submission.status,
    submitted_at: toIsoTimestamp(submission.submittedAt),
    time_spent_seconds: submission.timeSpentSeconds ?? 0,
  }
}

export function mapRowToSubmission(row: SubmissionRow): Submission {
  return normalizeSubmission({
    id: row.id,
    examId: row.exam_id,
    examTitle: row.exam_title,
    studentName: row.student_name,
    studentClass: row.student_class ?? '',
    autoScore: row.auto_score,
    score: row.score,
    mcqCount: row.mcq_count,
    mcqCorrectCount: row.mcq_correct_count,
    studentMcqAnswers: row.student_mcq_answers as Record<number, number>,
    correctMcqAnswers: row.correct_mcq_answers,
    mcqImages: row.mcq_images ?? [],
    essayDetails: (row.essay_details ?? []) as Submission['essayDetails'],
    status: row.status,
    submittedAt: formatTimestamp(row.submitted_at),
    timeSpentSeconds: row.time_spent_seconds ?? 0,
  })
}

export async function fetchSubmissionsFromCloud(): Promise<Submission[] | null> {
  const supabase = createClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .order('submitted_at', { ascending: false })

  if (error) {
    console.error('Không thể tải bài nộp từ Supabase:', errorMessage(error))
    return null
  }

  return (data ?? []).map((row) => mapRowToSubmission(row as SubmissionRow))
}

export async function fetchStudentSubmissionsFromCloud(studentName: string): Promise<Submission[] | null> {
  const supabase = createClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('student_name', studentName)
    .order('submitted_at', { ascending: false })

  if (error) {
    console.error('Không thể tải bài nộp của học sinh:', errorMessage(error))
    return null
  }

  return (data ?? []).map((row) => mapRowToSubmission(row as SubmissionRow))
}

export async function insertSubmissionToCloud(
  submission: Submission,
): Promise<{ ok: boolean; message?: string }> {
  const supabase = createClient()
  if (!supabase) {
    return { ok: false, message: 'Chưa cấu hình NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.' }
  }

  const { error } = await supabase.from('submissions').insert(mapSubmissionToRow(submission))

  if (error) {
    console.error('Không thể nộp bài lên Supabase:', errorMessage(error))
    return { ok: false, message: errorMessage(error) }
  }

  return { ok: true }
}
