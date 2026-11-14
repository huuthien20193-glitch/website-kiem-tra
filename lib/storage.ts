import type {
  EssayDetail,
  EssayQuestion,
  Exam,
  Grade,
  McqExplanation,
  McqQuestion,
  ShortAnswerDetail,
  ShortAnswerQuestion,
  Submission,
  SubPart,
  TeacherClass,
  TeacherDocument,
} from './types';
import { GRADES } from './types';
import { answerMatches, round1 } from './utils';

export const STORAGE_KEYS = {
  exams: 'tht_teacher_exams',
  availableExams: 'tht_available_exams',
  submissions: 'tht_student_submissions',
  documents: 'tht_teacher_documents',
  role: 'tht_user_role',
  username: 'tht_username',
  studentName: 'tht_student_name',
  studentClass: 'tht_student_class',
  /** Danh sách lớp học của giáo viên (trang /teacher/classes). */
  classes: 'tht_teacher_classes',
  /** Tên trường in đầu trang khi giáo viên xuất đề ra PDF. */
  schoolName: 'tht_school_name',
} as const;

export type ExamDraft = {
  mcqAnswers: Record<number, number>;
  shortAnswers?: Record<string, string>;
  essayImages: Record<string, string[]>;
  deadline?: number;
  savedAt?: number;
};

const hasWindow = () => typeof window !== 'undefined';

export function readJSON<T>(key: string, fallback: T): T {
  if (!hasWindow()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  if (!hasWindow()) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error('Không thể lưu dữ liệu vào bộ nhớ trình duyệt:', error);
    return false;
  }
}

function asNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeSubPart(raw: Partial<SubPart>, index: number): SubPart {
  return {
    label: typeof raw?.label === 'string' && raw.label ? raw.label : String.fromCharCode(97 + index),
    content: typeof raw?.content === 'string' ? raw.content : '',
    points: Math.max(0, asNumber(raw?.points, 0)),
  };
}

export function normalizeEssayQuestion(raw: Partial<EssayQuestion>, index: number): EssayQuestion {
  return {
    id: raw?.id ?? `essay-${index}-${Date.now()}`,
    questionLabel: typeof raw?.questionLabel === 'string' && raw.questionLabel ? raw.questionLabel : `Câu ${index + 1}`,
    points: Math.max(0, asNumber(raw?.points, 0)),
    questionImage: typeof raw?.questionImage === 'string' ? raw.questionImage : '',
    subParts: Array.isArray(raw?.subParts)
      ? raw.subParts.map((part, partIndex) => normalizeSubPart(part, partIndex))
      : [],
    rubric: typeof raw?.rubric === 'string' ? raw.rubric : '',
  };
}

function normalizeMcqExplanation(
  raw: Partial<McqExplanation> | undefined,
): McqExplanation {
  const imagesSource = raw?.images;
  return {
    text: typeof raw?.text === 'string' ? raw.text : '',
    images: Array.isArray(imagesSource)
      ? imagesSource.filter((image): image is string => typeof image === 'string')
      : [],
  };
}

export function normalizeMcqExplanations(raw: unknown, expectedCount: number): McqExplanation[] {
  const list = Array.isArray(raw) ? raw : [];
  const safeCount = Math.min(100, Math.max(0, expectedCount));
  return Array.from({ length: safeCount }, (_, index) =>
    normalizeMcqExplanation((list[index] ?? {}) as Partial<McqExplanation>),
  );
}

export function normalizeShortAnswerQuestion(
  raw: Partial<ShortAnswerQuestion>,
  index: number,
): ShortAnswerQuestion {
  return {
    id: raw?.id ?? `short-${index}-${Date.now()}`,
    questionLabel:
      typeof raw?.questionLabel === 'string' && raw.questionLabel
        ? raw.questionLabel
        : `Câu ${index + 1}`,
    points: Math.max(0, asNumber(raw?.points, 0)),
    questionImage: typeof raw?.questionImage === 'string' ? raw.questionImage : '',
    content: typeof raw?.content === 'string' ? raw.content : '',
    answer: typeof raw?.answer === 'string' ? raw.answer : '',
    rubric: typeof raw?.rubric === 'string' ? raw.rubric : '',
    explanation: raw?.explanation
      ? normalizeMcqExplanation(raw.explanation as Partial<McqExplanation>)
      : undefined,
  };
}

/** Chuẩn hóa câu trắc nghiệm văn bản: giữ nguyên vị trí, chỉ nhận dữ liệu hợp lệ. */
function normalizeMcqQuestions(raw: unknown, mcqCount: number): (McqQuestion | null)[] {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: mcqCount }, (_, index) => {
    const item = list[index];
    if (!item || typeof item !== 'object') return null;
    const content = typeof (item as McqQuestion).content === 'string' ? (item as McqQuestion).content : '';
    const options = Array.isArray((item as McqQuestion).options)
      ? (item as McqQuestion).options
          .slice(0, 4)
          .map((option) => (typeof option === 'string' ? option : ''))
      : [];
    while (options.length < 4) options.push('');
    const image = typeof (item as McqQuestion).image === 'string' ? (item as McqQuestion).image : '';
    if (!content.trim() && !image) return null;
    return { content, options, image: image || undefined } satisfies McqQuestion;
  });
}

export function normalizeExam(raw: Partial<Exam>): Exam {
  const mcqCount = clamp(Math.round(asNumber(raw?.mcqCount, 0)), 0, 100);
  const mcqAnswers = Array.from({ length: mcqCount }, (_, index) => {
    const value = Array.isArray(raw?.mcqAnswers) ? asNumber(raw.mcqAnswers[index], 0) : 0;
    return clamp(Math.round(value), 0, 3);
  });
  const gradeValue = Number(raw?.grade);
  const grade = GRADES.includes(gradeValue as Grade) ? (gradeValue as Grade) : undefined;

  return {
    id: String(raw?.id ?? `exam-${Date.now()}`),
    title: typeof raw?.title === 'string' && raw.title ? raw.title : 'Đề kiểm tra chưa đặt tên',
    subject: typeof raw?.subject === 'string' && raw.subject ? raw.subject : 'Toán học',
    grade,
    durationMinutes: clamp(Math.round(asNumber(raw?.durationMinutes, 45)), 1, 600),
    totalPoints: Math.max(0, asNumber(raw?.totalPoints, 10)),
    status: typeof raw?.status === 'string' ? raw.status : 'Đã xuất bản',
    type: raw?.type === 'practice' ? 'practice' : 'official',
    mcqImages: Array.isArray(raw?.mcqImages) ? raw.mcqImages.filter((image): image is string => typeof image === 'string') : [],
    mcqQuestions: normalizeMcqQuestions(raw?.mcqQuestions, mcqCount),
    mcqCount,
    mcqPointPerQ: Math.max(0, asNumber(raw?.mcqPointPerQ, 0.5)),
    mcqAnswers,
    mcqExplanationEnabled: raw?.mcqExplanationEnabled === true,
    mcqExplanations: normalizeMcqExplanations(raw?.mcqExplanations, mcqCount),
    shortAnswerQuestions: Array.isArray(raw?.shortAnswerQuestions)
      ? raw.shortAnswerQuestions.map((question, index) =>
          normalizeShortAnswerQuestion(question, index),
        )
      : [],
    essayQuestions: Array.isArray(raw?.essayQuestions)
      ? raw.essayQuestions.map((question, index) => normalizeEssayQuestion(question, index))
      : [],
    createdAt: typeof raw?.createdAt === 'string' ? raw.createdAt : undefined,
  };
}

export function normalizeSubmission(raw: Partial<Submission>): Submission {
  const answersSource = raw?.studentMcqAnswers as unknown;
  const studentMcqAnswers: Record<number, number> = {};

  if (Array.isArray(answersSource)) {
    answersSource.forEach((value, index) => {
      if (typeof value === 'number') studentMcqAnswers[index] = value;
    });
  } else if (answersSource && typeof answersSource === 'object') {
    Object.entries(answersSource as Record<string, unknown>).forEach(([key, value]) => {
      const index = Number(key);
      const answer = Number(value);
      if (Number.isFinite(index) && Number.isFinite(answer)) {
        studentMcqAnswers[index] = answer;
      }
    });
  }

  const essayDetails: EssayDetail[] = Array.isArray(raw?.essayDetails)
    ? raw.essayDetails.map((detail, index) => ({
        questionId: detail?.questionId ?? index,
        questionLabel: typeof detail?.questionLabel === 'string' ? detail.questionLabel : `Câu ${index + 1}`,
        questionContent: typeof detail?.questionContent === 'string' ? detail.questionContent : '',
        maxPoints: Math.max(0, asNumber(detail?.maxPoints, 0)),
        studentImages: Array.isArray(detail?.studentImages)
          ? detail.studentImages.filter((image): image is string => typeof image === 'string')
          : [],
        score: Math.max(0, asNumber(detail?.score, 0)),
        comment: typeof detail?.comment === 'string' ? detail.comment : '',
        graded: Boolean(detail?.graded),
        subParts: Array.isArray(detail?.subParts)
          ? detail.subParts.map((part, partIndex) => normalizeSubPart(part, partIndex))
          : [],
        subPartScores:
          detail?.subPartScores && typeof detail.subPartScores === 'object' && !Array.isArray(detail.subPartScores)
            ? Object.fromEntries(
                Object.entries(detail.subPartScores as Record<string, unknown>).map(([key, value]) => [
                  Number(key),
                  Math.max(0, asNumber(value, 0)),
                ]),
              )
            : {},
      }))
    : [];

  const shortAnswerDetails: ShortAnswerDetail[] = Array.isArray(raw?.shortAnswerDetails)
    ? raw.shortAnswerDetails.map((detail, index) => ({
        questionId: detail?.questionId ?? index,
        questionLabel:
          typeof detail?.questionLabel === 'string'
            ? detail.questionLabel
            : `Câu ${index + 1}`,
        questionContent:
          typeof detail?.questionContent === 'string' ? detail.questionContent : '',
        questionImage:
          typeof detail?.questionImage === 'string' ? detail.questionImage : '',
        maxPoints: Math.max(0, asNumber(detail?.maxPoints, 0)),
        correctAnswer: typeof detail?.correctAnswer === 'string' ? detail.correctAnswer : '',
        studentAnswer: typeof detail?.studentAnswer === 'string' ? detail.studentAnswer : '',
        correct: Boolean(detail?.correct),
        score: Math.max(0, asNumber(detail?.score, 0)),
        comment: typeof detail?.comment === 'string' ? detail.comment : '',
        explanation: detail?.explanation
          ? normalizeMcqExplanation(detail.explanation as Partial<McqExplanation>)
          : undefined,
      }))
    : [];

  const correctMcqAnswers = Array.isArray(raw?.correctMcqAnswers)
    ? raw.correctMcqAnswers.map((value) => clamp(Math.round(asNumber(value, 0)), 0, 3))
    : [];

  return {
    id: String(raw?.id ?? `submission-${Date.now()}`),
    examId: String(raw?.examId ?? ''),
    examTitle: typeof raw?.examTitle === 'string' && raw.examTitle ? raw.examTitle : 'Bài kiểm tra',
    studentName: typeof raw?.studentName === 'string' && raw.studentName ? raw.studentName : 'Học sinh',
    studentClass: typeof raw?.studentClass === 'string' && raw.studentClass ? raw.studentClass : '—',
    autoScore: Math.max(0, round1(asNumber(raw?.autoScore, 0))),
    score: Math.max(0, round1(asNumber(raw?.score, asNumber(raw?.autoScore, 0)))),
    mcqCount: clamp(Math.round(asNumber(raw?.mcqCount, correctMcqAnswers.length)), 0, 100),
    mcqCorrectCount: clamp(Math.round(asNumber(raw?.mcqCorrectCount, 0)), 0, 100),
    studentMcqAnswers,
    correctMcqAnswers,
    mcqImages: Array.isArray(raw?.mcqImages) ? raw.mcqImages.filter((image): image is string => typeof image === 'string') : [],
    mcqQuestions: normalizeMcqQuestions(raw?.mcqQuestions, clamp(Math.round(asNumber(raw?.mcqCount, correctMcqAnswers.length)), 0, 100)),
    mcqExplanationEnabled: raw?.mcqExplanationEnabled === true,
    mcqExplanations: Array.isArray(raw?.mcqExplanations)
      ? raw.mcqExplanations.map((item) =>
          normalizeMcqExplanation((item ?? {}) as Partial<McqExplanation>),
        )
      : [],
    shortAnswerDetails,
    essayDetails,
    status:
      typeof raw?.status === 'string' && raw.status
        ? raw.status
        : essayDetails.some((detail) => !detail.graded)
          ? 'Chờ giáo viên chấm tự luận'
          : 'Đã chấm điểm hoàn tất',
    submittedAt:
      typeof raw?.submittedAt === 'string'
        ? raw.submittedAt
        : typeof (raw as { timestamp?: string })?.timestamp === 'string'
          ? (raw as { timestamp?: string }).timestamp!
          : new Date().toLocaleString('vi-VN'),
    timeSpentSeconds: Math.max(0, Math.round(asNumber(raw?.timeSpentSeconds, 0))),
  };
}

export function seedExam(): Exam {
  return {
    id: 'seed-toan-9-giua-ki',
    title: 'Kiểm tra giữa kì I – Toán 9',
    subject: 'Toán học',
    grade: 9,
    durationMinutes: 45,
    totalPoints: 10,
    status: 'Đã xuất bản',
    type: 'official',
    mcqImages: [],
    mcqCount: 6,
    mcqPointPerQ: 0.5,
    mcqAnswers: [0, 1, 2, 3, 0, 2],
    shortAnswerQuestions: [],
    essayQuestions: [
      {
        id: 'seed-essay-1',
        questionLabel: 'Câu 7',
        points: 3,
        questionImage: '',
        subParts: [
          { label: 'a', content: 'Rút gọn biểu thức chứa căn bậc hai.', points: 1 },
          { label: 'b', content: 'Giải phương trình bậc nhất một ẩn.', points: 1 },
          { label: 'c', content: 'Tính giá trị của biểu thức tại x = 2.', points: 1 },
        ],
        rubric: 'Trình bày đúng mỗi ý 1 điểm. Thiếu điều kiện trừ 0,25 điểm.',
      },
      {
        id: 'seed-essay-2',
        questionLabel: 'Câu 8',
        points: 4,
        questionImage: '',
        subParts: [
          { label: 'a', content: 'Giải hệ phương trình 3x − 2y = 5 và x + 2y = −1.', points: 2 },
          { label: 'b', content: 'Giải phương trình (2x + 3)(3 − 5x) = 0.', points: 2 },
        ],
        rubric: 'Mỗi ý đúng đạt điểm tối đa. Kết luận nghiệm đầy đủ.',
      },
    ],
    createdAt: new Date().toISOString(),
  };
}

export function loadExams(): Exam[] {
  if (!hasWindow()) return [];

  const teacherRaw = window.localStorage.getItem(STORAGE_KEYS.exams);
  const availableRaw = window.localStorage.getItem(STORAGE_KEYS.availableExams);

  if (teacherRaw === null && availableRaw === null) {
    const seeded = [seedExam()];
    saveExams(seeded);
    return seeded;
  }

  const raw = teacherRaw ?? availableRaw;
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map((exam) => normalizeExam(exam));
  } catch {
    return [];
  }
}

export function saveExams(exams: Exam[]): boolean {
  const first = writeJSON(STORAGE_KEYS.exams, exams);
  const second = writeJSON(STORAGE_KEYS.availableExams, exams);
  return first && second;
}

export function loadSubmissions(): Submission[] {
  if (!hasWindow()) return [];
  const raw = window.localStorage.getItem(STORAGE_KEYS.submissions);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((submission) => normalizeSubmission(submission));
  } catch {
    return [];
  }
}

export function saveSubmissions(submissions: Submission[]): boolean {
  return writeJSON(STORAGE_KEYS.submissions, submissions);
}

export function addSubmission(submission: Submission): Submission[] {
  const list = [submission, ...loadSubmissions()];
  saveSubmissions(list);
  return list;
}

export function updateSubmission(submission: Submission): Submission[] {
  const list = loadSubmissions().map((item) => (item.id === submission.id ? submission : item));
  saveSubmissions(list);
  return list;
}

export function deleteSubmissionById(id: string): Submission[] {
  const list = loadSubmissions().filter((item) => item.id !== id);
  saveSubmissions(list);
  return list;
}

export function clearSubmissions(): Submission[] {
  saveSubmissions([]);
  return [];
}

/* ------------------------------ Tài liệu (documents) ------------------------------ */

function normalizeDocument(raw: Partial<TeacherDocument>): TeacherDocument {
  const fileType =
    raw?.fileType === 'pdf' || raw?.fileType === 'docx' || raw?.fileType === 'image'
      ? raw.fileType
      : 'text';
  return {
    id: String(raw?.id ?? `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    title: typeof raw?.title === 'string' && raw.title ? raw.title : 'Tài liệu chưa đặt tên',
    fileName: typeof raw?.fileName === 'string' ? raw.fileName : '',
    fileType,
    fileSize: Math.max(0, Math.round(asNumber(raw?.fileSize, 0))),
    content: typeof raw?.content === 'string' ? raw.content : '',
    imageData: typeof raw?.imageData === 'string' ? raw.imageData : undefined,
    pdfData: typeof raw?.pdfData === 'string' ? raw.pdfData : undefined,
    summary: typeof raw?.summary === 'string' ? raw.summary : undefined,
    createdAt: typeof raw?.createdAt === 'string' ? raw.createdAt : undefined,
  };
}

export function loadDocuments(): TeacherDocument[] {
  if (!hasWindow()) return [];
  const raw = window.localStorage.getItem(STORAGE_KEYS.documents);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((document) => normalizeDocument(document));
  } catch {
    return [];
  }
}

export function saveDocuments(documents: TeacherDocument[]): boolean {
  return writeJSON(STORAGE_KEYS.documents, documents);
}

/* ------------------------------ Lớp học (classes) ------------------------------ */

/** Chuẩn hóa một lớp học đọc từ localStorage: chỉ nhận dữ liệu hợp lệ. */
function normalizeClass(raw: Partial<TeacherClass>): TeacherClass {
  return {
    id: String(raw?.id ?? `class-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    name: typeof raw?.name === 'string' && raw.name ? raw.name : 'Lớp chưa đặt tên',
    code: typeof raw?.code === 'string' ? raw.code : '',
    subject: typeof raw?.subject === 'string' && raw.subject ? raw.subject : 'Chưa phân loại',
    studentCount: Math.max(0, Math.round(asNumber(raw?.studentCount, 0))),
    createdAt: typeof raw?.createdAt === 'string' ? raw.createdAt : undefined,
  };
}

export function loadClasses(): TeacherClass[] {
  if (!hasWindow()) return [];
  const raw = window.localStorage.getItem(STORAGE_KEYS.classes);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => normalizeClass(item as Partial<TeacherClass>));
  } catch {
    return [];
  }
}

export function saveClasses(classes: TeacherClass[]): boolean {
  return writeJSON(STORAGE_KEYS.classes, classes);
}

export function buildSubmission(
  exam: Exam,
  studentName: string,
  studentClass: string,
  mcqAnswers: Record<number, number>,
  shortAnswers: Record<string, string>,
  essayImages: Record<string, string[]>,
): Submission {
  let mcqCorrectCount = 0;
  for (let index = 0; index < exam.mcqCount; index += 1) {
    if (mcqAnswers[index] === exam.mcqAnswers[index]) mcqCorrectCount += 1;
  }

  const mcqScore = round1(mcqCorrectCount * (exam.mcqPointPerQ || 0));

  const shortAnswerDetails: ShortAnswerDetail[] = exam.shortAnswerQuestions.map((question) => {
    const studentAnswer = shortAnswers[String(question.id)] || '';
    const correct = answerMatches(studentAnswer, question.answer);
    return {
      questionId: question.id,
      questionLabel: question.questionLabel,
      questionContent: question.content,
      questionImage: question.questionImage || '',
      maxPoints: question.points,
      correctAnswer: question.answer,
      studentAnswer,
      correct,
      score: correct ? question.points : 0,
      comment: '',
      explanation: question.explanation,
    };
  });
  const shortScore = round1(
    shortAnswerDetails.reduce((sum, detail) => sum + detail.score, 0),
  );
  const autoScore = round1(mcqScore + shortScore);

  const essayDetails: EssayDetail[] = exam.essayQuestions.map((question) => ({
    questionId: question.id,
    questionLabel: question.questionLabel,
    questionContent: question.subParts
      .map((part) => `${part.label}) ${part.content}`.trim())
      .join('  •  '),
    maxPoints: question.points,
    subParts: question.subParts.map((part) => ({ ...part })),
    subPartScores: {},
    studentImages: essayImages[String(question.id)] || [],
    score: 0,
    comment: '',
    graded: false,
  }));

  const pending = essayDetails.length > 0;

  return {
    id: `submission-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    examId: exam.id,
    examTitle: exam.title,
    studentName: studentName.trim() || 'Học sinh',
    studentClass: studentClass.trim() || '—',
    autoScore,
    score: autoScore,
    mcqCount: exam.mcqCount,
    mcqCorrectCount,
    studentMcqAnswers: mcqAnswers,
    correctMcqAnswers: exam.mcqAnswers,
    mcqImages: exam.mcqImages,
    mcqQuestions: exam.mcqQuestions ? exam.mcqQuestions.map((item) => (item ? { ...item } : null)) : [],
    mcqExplanationEnabled: exam.mcqExplanationEnabled === true,
    mcqExplanations: exam.mcqExplanations ? [...exam.mcqExplanations] : [],
    shortAnswerDetails,
    essayDetails,
    status: pending ? 'Chờ giáo viên chấm tự luận' : 'Đã chấm điểm hoàn tất',
    submittedAt: new Date().toLocaleString('vi-VN'),
  };
}

export function totalConfiguredPoints(
  exam: Pick<Exam, 'mcqCount' | 'mcqPointPerQ' | 'shortAnswerQuestions' | 'essayQuestions'>,
) {
  const mcqPoints = (exam.mcqCount || 0) * (exam.mcqPointPerQ || 0);
  const shortAnswerPoints = (exam.shortAnswerQuestions || []).reduce(
    (sum, question) => sum + (question.points || 0),
    0,
  );
  const essayPoints = (exam.essayQuestions || []).reduce((sum, question) => sum + (question.points || 0), 0);
  return round1(mcqPoints + shortAnswerPoints + essayPoints);
}

/* ------------------------------ Session / profile ------------------------------ */

export function getSession() {
  if (!hasWindow()) return { role: null as string | null, username: '' };
  return {
    role: window.localStorage.getItem(STORAGE_KEYS.role),
    username: window.localStorage.getItem(STORAGE_KEYS.username) || '',
  };
}

export function setTeacherSession(username: string) {
  if (!hasWindow()) return;
  window.localStorage.setItem(STORAGE_KEYS.role, 'TEACHER');
  window.localStorage.setItem(STORAGE_KEYS.username, username);
}

export function setStudentSession(name: string, className: string) {
  if (!hasWindow()) return;
  window.localStorage.setItem(STORAGE_KEYS.role, 'STUDENT');
  saveStudentProfile(name, className);
}

export function saveStudentProfile(name: string, className: string) {
  if (!hasWindow()) return;
  window.localStorage.setItem(STORAGE_KEYS.studentName, name);
  window.localStorage.setItem(STORAGE_KEYS.studentClass, className);
}

export function clearSession() {
  if (!hasWindow()) return;
  window.localStorage.removeItem(STORAGE_KEYS.role);
  window.localStorage.removeItem(STORAGE_KEYS.username);
}

export function getStudentProfile() {
  if (!hasWindow()) return { name: '', className: '' };
  return {
    name: window.localStorage.getItem(STORAGE_KEYS.studentName) || '',
    className: window.localStorage.getItem(STORAGE_KEYS.studentClass) || '',
  };
}

/* ------------------------------ Draft ------------------------------ */

/** Chuyển chuỗi tiếng Việt thành tên file an toàn: bỏ dấu, chỉ còn chữ/số/gạch nối. */
export function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40);
}

export function examDraftKey(examId: string, studentName: string) {
  return `tht_exam_draft_${examId}_${slugify(studentName) || 'hoc-sinh'}`;
}

export function loadDraft(key: string): ExamDraft | null {
  if (!hasWindow()) return null;
  return readJSON<ExamDraft | null>(key, null);
}

export function saveDraft(key: string, draft: ExamDraft): boolean {
  return writeJSON(key, { ...draft, savedAt: Date.now() });
}

export function clearDraft(key: string) {
  if (!hasWindow()) return;
  window.localStorage.removeItem(key);
}
