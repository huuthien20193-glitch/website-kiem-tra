export type Role = 'TEACHER' | 'STUDENT';

/**
 * Tên hiển thị khi phiên đăng nhập chưa lưu tên giáo viên.
 * Chỉ định nghĩa Ở MỘT NƠI này — các component phải lấy tên từ session,
 * không tự gán cứng "Thầy Thiện" rải rác trong code.
 */
export const DEFAULT_TEACHER_NAME = 'Giáo viên';

export type SubPart = {
  label: string;
  content: string;
  points: number;
};

/**
 * Nguồn gốc câu hỏi do AI tạo (Knowledge Engine): chủ đề, mức độ nhận thức
 * và trang tài liệu tham chiếu. Tất cả đều tùy chọn — đề thủ công không có.
 */
export type QuestionProvenance = {
  /** Chủ đề của câu hỏi (suy từ kho kiến thức). */
  topic?: string;
  /** Mức độ nhận thức: 'nhận biết' | 'thông hiểu' | 'vận dụng' | 'vận dụng cao'. */
  level?: string;
  /** Số trang tài liệu tham chiếu khi tạo câu. */
  sourcePages?: number[];
  /** QC Engine đánh dấu câu cần giáo viên xem xét trước khi xuất bản. */
  needsReview?: boolean;
};

export type EssayQuestion = {
  id: string | number;
  questionLabel: string;
  points: number;
  questionImage?: string;
  subParts: SubPart[];
  rubric?: string;
} & QuestionProvenance;

/* ------------------------------------------------------------------ */
/* Câu hỏi dạng mở rộng (AI soạn hoặc giáo viên thêm trực tiếp):       */
/*  - Trắc nghiệm nhiều đáp án (chọn nhiều phương án, đúng hết mới     */
/*    được điểm).                                                      */
/*  - Đúng/Sai kiểu mới: 4 ý nhận định, mỗi ý chọn Đúng hoặc Sai,      */
/*    có điểm từng ý (chấm tự động).                                   */
/* ------------------------------------------------------------------ */

/** Loại câu hỏi mở rộng. */
export type ExtraQuestionKind = 'multi-mcq' | 'true-false';

/** Một ý nhận định của câu Đúng/Sai. */
export type TrueFalseStatement = {
  text: string;
  /** Đáp án đúng của ý này. */
  answer: boolean;
};

export type ExtraQuestion = {
  id: string | number;
  kind: ExtraQuestionKind;
  questionLabel: string;
  points: number;
  content: string;
  questionImage?: string;
  /** Chỉ dùng cho 'multi-mcq': 4 phương án A/B/C/D. */
  options?: string[];
  /** Chỉ dùng cho 'multi-mcq': các index phương án đúng (0..3), ≥ 1 phần tử. */
  correctIndexes?: number[];
  /** Chỉ dùng cho 'true-false': 4 ý nhận định kèm đáp án Đúng/Sai. */
  statements?: TrueFalseStatement[];
  /** Lời giải hiển thị cho học sinh sau khi nộp bài (khi giáo viên bật). */
  explanation?: McqExplanation;
} & QuestionProvenance;

/** Kết quả chấm tự động của một câu hỏi mở rộng (lưu trong bài nộp). */
export type ExtraDetail = {
  questionId: string | number;
  kind: ExtraQuestionKind;
  questionLabel: string;
  questionContent: string;
  maxPoints: number;
  /** Đáp án đúng dạng tóm tắt ("B, D" hoặc "Đ, S, S, Đ"). */
  correctAnswer: string;
  /** Bài làm học sinh dạng tóm tắt ("B, C" hoặc "Đ, Đ, S, Đ"). */
  studentAnswer: string;
  /** Đúng trọn vẹn câu (multi-mcq) hoặc đúng toàn bộ 4 ý (đúng/sai). */
  correct: boolean;
  score: number;
  comment: string;
};

/** Nhãn hiển thị cho từng loại câu hỏi mở rộng. */
export const EXTRA_KIND_LABELS: Record<ExtraQuestionKind, string> = {
  'multi-mcq': 'TN nhiều đáp án',
  'true-false': 'Đúng / Sai',
};

/**
 * Câu trắc nghiệm dạng văn bản (AI hoặc giáo viên soạn trực tiếp trên web).
 * Đáp án đúng vẫn được quản lý bằng `mcqAnswers` theo vị trí của câu.
 */
export type McqQuestion = {
  content: string;
  /** 4 phương án A/B/C/D. */
  options: string[];
  /** Ảnh minh họa của câu hỏi (tùy chọn, data URL). */
  image?: string;
} & QuestionProvenance;

/** Lời giải một câu trắc nghiệm: text và/hoặc ảnh, giáo viên soạn khi tạo đề. */
export type McqExplanation = {
  text: string;
  images: string[];
};

/** Loại câu trả lời ngắn:
 *  - 'text': trả lời ngắn thường.
 *  - 'fill-blank': điền khuyết — nội dung chứa chỗ trống đánh dấu "___".
 *  - 'calculation': câu hỏi tính toán — đáp án là số.
 *  Cả 3 đều chấm tự động bằng so khớp đáp án (answerMatches). */
export type ShortAnswerKind = 'text' | 'fill-blank' | 'calculation';

export const SHORT_KIND_LABELS: Record<ShortAnswerKind, string> = {
  text: 'Trả lời ngắn',
  'fill-blank': 'Điền khuyết',
  calculation: 'Tính toán',
};

/** Câu trả lời ngắn: học sinh gõ đáp án, hệ thống tự chấm theo `answer`. */
export type ShortAnswerQuestion = {
  id: string | number;
  questionLabel: string;
  points: number;
  questionImage?: string;
  content: string;
  /** Đáp án đúng. Nhiều đáp án hợp lệ cách nhau bởi `|`, `;` hoặc xuống dòng. */
  answer: string;
  rubric?: string;
  /** Loại câu hỏi (mặc định 'text' với đề cũ không có trường này). */
  kind?: ShortAnswerKind;
  /** Lời giải hiển thị cho học sinh sau khi nộp bài (khi giáo viên bật công tắc). */
  explanation?: McqExplanation;
  /** Với kind 'calculation': biểu thức kiểm chứng độc lập do QC dùng để xác nhận đáp án. */
  computation?: { expression: string; expected: number };
} & QuestionProvenance;

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
  /** Nội dung câu hỏi trắc nghiệm dạng văn bản (theo index, có thể null với câu chỉ có ảnh). */
  mcqQuestions?: (McqQuestion | null)[];
  /** Bật để học sinh xem lời giải sau khi nộp bài. */
  mcqExplanationEnabled?: boolean;
  mcqExplanations?: McqExplanation[];
  /** Câu hỏi dạng mở rộng: trắc nghiệm nhiều đáp án + đúng/sai (tùy chọn, đề cũ không có). */
  extraQuestions?: ExtraQuestion[];
  shortAnswerQuestions: ShortAnswerQuestion[];
  essayQuestions: EssayQuestion[];
  createdAt?: string;
};

/** Lớp học do giáo viên tạo ở trang /teacher/classes (lưu trên Supabase). */
export type TeacherClass = {
  id: string;
  /** Tên lớp hiển thị, ví dụ "Toán 9A". */
  name: string;
  /** Mã lớp ngắn để tìm kiếm nhanh, ví dụ "TOAN9A". */
  code: string;
  /** Môn học của lớp (một trong SUBJECTS hoặc "Chưa phân loại"). */
  subject: string;
  /** Số học sinh đang theo dõi. Hiện tại chưa có danh sách học sinh riêng. */
  studentCount: number;
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
  /** Cấu trúc từng ý kèm điểm tối đa, để giáo viên chấm chi tiết từng ý. */
  subParts?: SubPart[];
  /** Điểm giáo viên cho từng ý (theo index của subParts). */
  subPartScores?: Record<number, number>;
};

export type ShortAnswerDetail = {
  questionId: string | number;
  questionLabel: string;
  questionContent: string;
  questionImage?: string;
  maxPoints: number;
  correctAnswer: string;
  studentAnswer: string;
  correct: boolean;
  score: number;
  comment: string;
  /** Lời giải của giáo viên, hiển thị cho học sinh sau khi nộp bài. */
  explanation?: McqExplanation;
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
  /** Bản chụp nội dung câu trắc nghiệm văn bản của đề lúc nộp, để trang kết quả hiển thị được. */
  mcqQuestions?: (McqQuestion | null)[];
  /** Bản chụp lời giải của đề lúc nộp, để trang kết quả hiện được mà không cần tải lại đề. */
  mcqExplanationEnabled?: boolean;
  mcqExplanations?: McqExplanation[];
  shortAnswerDetails: ShortAnswerDetail[];
  /** Kết quả chấm tự động của câu hỏi mở rộng (TN nhiều đáp án, Đúng/Sai). */
  extraDetails?: ExtraDetail[];
  essayDetails: EssayDetail[];
  status: string;
  submittedAt: string;
  timeSpentSeconds?: number;
};

export type TeacherTab = 'overview' | 'documents' | 'exams' | 'create-exam' | 'submissions';

/** Một trang (hoặc slide) của tài liệu đã được trích xuất nội dung. */
export type DocumentPage = {
  /** Số trang theo tài liệu gốc (bắt đầu từ 1). */
  page: number;
  /** Nội dung chữ trích xuất được của trang. */
  text: string;
  /** Số từ trích xuất được — dùng để cảnh báo trang ít nội dung. */
  words: number;
  /** ok: đủ chữ · low: rất ít chữ (có thể là trang scan) · failed: không đọc được. */
  status: 'ok' | 'low' | 'failed';
};

/** Số lượng hình ảnh / bảng biểu / công thức phát hiện trong tài liệu. */
export type DocumentDetection = {
  images: number;
  tables: number;
  formulas: number;
};

/** Tài liệu học tập giáo viên tải lên để AI đọc và soạn đề. */
export type TeacherDocument = {
  id: string;
  title: string;
  fileName: string;
  /** pdf | docx | pptx | text | image */
  fileType: 'pdf' | 'docx' | 'pptx' | 'text' | 'image';
  fileSize: number;
  /**
   * Nội dung văn bản đã trích xuất ('' với ảnh hoặc PDF scan).
   * Tài liệu có nhiều trang sẽ chứa các dòng đánh dấu `===== TRANG n =====`,
   * và nội dung không đọc được được đánh dấu `[KHÔNG ĐỌC ĐƯỢC: lý do]`.
   */
  content: string;
  /** Ảnh đã nén (data URL) — dùng cho tài liệu dạng ảnh. */
  imageData?: string;
  /** PDF gốc dạng base64 khi PDF scan không trích xuất được chữ. */
  pdfData?: string;
  /** Tổng số trang (PDF) hoặc số slide (PPTX) nếu biết. */
  pageCount?: number;
  /** Nội dung từng trang/slide (khi nguồn có cấu trúc trang: PDF, PPTX, OCR). */
  pages?: DocumentPage[];
  /** Hình ảnh / bảng biểu / công thức được phát hiện khi trích xuất. */
  detected?: DocumentDetection;
  /** Cảnh báo trích xuất (trang lỗi, trang mờ, thiếu chữ...). */
  warnings?: string[];
  /** Trạng thái nhận diện chữ bằng AI (OCR) cho tài liệu scan/ảnh. */
  ocrStatus?: 'pending' | 'done' | 'failed' | 'skipped';
  /** Lỗi OCR lần gần nhất (nếu có). */
  ocrError?: string;
  /** Tóm tắt do AI tạo (tùy chọn). */
  summary?: string;
  createdAt?: string;
};

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
