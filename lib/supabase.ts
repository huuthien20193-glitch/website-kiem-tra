import { createBrowserClient } from '@supabase/ssr'
import type { Submission } from './types'

export function createClient() {
  if (typeof window === 'undefined') return null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key || url.includes('your_supabase') || !url.startsWith('http')) {
    return null
  }

  return createBrowserClient(url, key)
}

// Kiểu dữ liệu Supabase trả về (snake_case)
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
  student_mcq_answers: Record<number, number>
  correct_mcq_answers: number[]
  mcq_images: string[]
  essay_details: any[]
  status: string
  submitted_at: string
  time_spent_seconds: number
}

export function mapRowToSubmission(row: SubmissionRow): Submission {
  return {
    id: row.id,
    examId: row.exam_id,
    examTitle: row.exam_title,
    studentName: row.student_name,
    studentClass: row.student_class ?? '',
    autoScore: row.auto_score,
    score: row.score,
    mcqCount: row.mcq_count,
    mcqCorrectCount: row.mcq_correct_count,
    studentMcqAnswers: row.student_mcq_answers,
    correctMcqAnswers: row.correct_mcq_answers,
    mcqImages: row.mcq_images,
    essayDetails: row.essay_details,
    status: row.status,
    submittedAt: row.submitted_at,
  }
}

export type Database = {
  public: {
    Tables: {
      submissions: {
        Row: SubmissionRow
        Insert: {
          id?: string
          exam_id: string
          student_id: string
          student_name: string
          student_class?: string | null
          exam_title: string
          auto_score?: number
          score?: number
          mcq_count?: number
          mcq_correct_count?: number
          student_mcq_answers?: Record<number, number>
          correct_mcq_answers?: number[]
          mcq_images?: string[]
          essay_details?: any[]
          status?: string
          submitted_at?: string
          time_spent_seconds?: number
        }
        Update: {
          id?: string
          exam_id?: string
          student_id?: string
          student_name?: string
          student_class?: string | null
          exam_title?: string
          auto_score?: number
          score?: number
          mcq_count?: number
          mcq_correct_count?: number
          student_mcq_answers?: Record<number, number>
          correct_mcq_answers?: number[]
          mcq_images?: string[]
          essay_details?: any[]
          status?: string
          submitted_at?: string
          time_spent_seconds?: number
        }
      }
    }
  }
}
