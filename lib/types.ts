export type Role = 'TEACHER' | 'STUDENT';

export type SubPart = {
  label: string;
  content: string;
  points: number;
};

export type EssayQuestion = {
  id: string | number;
  questionLabel: string;
  points: number;
  questionImage?: string;
  subParts: SubPart[];
  rubric?: string;
};

export type ExamType = 'official' | 'practice';

export type Exam = {
  id: string;
  title: string;
  subject: string;
  /** Khối lớp: 6 đến 12. Đề cũ chưa phân khối sẽ là undefined. */
  grade?: Grade;
  durationMinutes: number;
  totalPoints: number;
  status?: string;
  type?: ExamType;
  mcqImages: string[];
  mcqCount: number;
  mcqPointPerQ: number;
  mcqAnswers: number[];
  essayQuestions: EssayQuestion[];
  createdAt?: string;
};

export type EssayDetail = {
  questionId: string | number;
  questionLabel: string;
  questionContent: string;
  maxPoints: number;
  studentImages: string[];
  score: number;
  comment: string;
  graded: boolean;
};

export type Submission = {
  id: string;
  examId: string;
  examTitle: string;
  studentName: string;
  studentClass: string;
  autoScore: number;
  score: number;
  mcqCount: number;
  mcqCorrectCount: number;
  studentMcqAnswers: Record<number, number>;
  correctMcqAnswers: number[];
  mcqImages: string[];
  essayDetails: EssayDetail[];
  status: string;
  submittedAt: string;
  timeSpentSeconds?: number;
};

export type TeacherTab = 'overview' | 'exams' | 'create-exam' | 'submissions';

export const OPTION_LABELS = ['A', 'B', 'C', 'D'];

/** Các khối lớp được hỗ trợ khi đăng đề. */
export const GRADES = [6, 7, 8, 9, 10, 11, 12] as const;
export type Grade = (typeof GRADES)[number];

export function gradeLabel(grade?: number | null): string {
  return typeof grade === 'number' && GRADES.includes(grade as Grade)
    ? `Lớp ${grade}`
    : 'Chưa phân khối';
}

export const SUBJECTS = [
  'Toán học',
  'Tin học',
  'Vật lý',
  'Hóa học',
  'Tiếng Anh',
  'Ngữ văn',
  'Sinh học',
  'Lịch sử',
  'Địa lý',
];

export const SUBJECT_STYLES: Record<string, string> = {
  'Toán học': 'bg-emerald-50 text-emerald-700 ring-emerald-600/10',
  'Tin học': 'bg-sky-50 text-sky-700 ring-sky-600/10',
  'Vật lý': 'bg-indigo-50 text-indigo-700 ring-indigo-600/10',
  'Hóa học': 'bg-amber-50 text-amber-700 ring-amber-600/10',
  'Tiếng Anh': 'bg-violet-50 text-violet-700 ring-violet-600/10',
  'Ngữ văn': 'bg-rose-50 text-rose-700 ring-rose-600/10',
  'Sinh học': 'bg-lime-50 text-lime-700 ring-lime-600/10',
  'Lịch sử': 'bg-orange-50 text-orange-700 ring-orange-600/10',
  'Địa lý': 'bg-cyan-50 text-cyan-700 ring-cyan-600/10',
};

export function subjectStyle(subject?: string) {
  return SUBJECT_STYLES[subject || ''] || 'bg-slate-100 text-slate-700 ring-slate-600/10';
}
