import { NextRequest } from 'next/server';
import {
  criticalProblems,
  deriveKnowledgeSegments,
  formatKnowledgeContext,
  knowledgeStats,
  selectKnowledge,
} from '@/lib/knowledge';

/**
 * API AI cho phần giáo viên — gọi Google Gemini.
 * Cấu hình trong .env.local: GEMINI_API_KEY (lấy miễn phí tại https://aistudio.google.com/apikey)
 */

const DEFAULT_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const PLACEHOLDER_KEYS = new Set(['your_gemini_api_key', 'your_api_key', 'placeholder', 'todo', '']);

function apiKey(): string {
  const key = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
    ''
  )
    .trim();
  return PLACEHOLDER_KEYS.has(key.toLowerCase()) ? '' : key;
}

/** Key hợp lệ khi dùng cho request này: key giáo viên gửi theo request (ưu tiên) hoặc key server. */
function apiKeyForRequest(supplied: unknown): string {
  if (typeof supplied === 'string') {
    const candidate = supplied.trim();
    if (candidate.length >= 20 && !/\s/.test(candidate) && !PLACEHOLDER_KEYS.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
  return apiKey();
}

function modelList(): string[] {
  const custom = (process.env.GEMINI_MODEL || '').trim();
  return custom ? [custom, ...DEFAULT_MODELS] : DEFAULT_MODELS;
}

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

type ChatMessage = { role: 'user' | 'assistant'; content: string };

type AiDocument = {
  title?: string;
  content?: string;
  imageData?: string;
  pdfData?: string;
};

type GenerateBody = {
  action: 'summarize' | 'chat' | 'generate-exam' | 'validate-key' | 'ocr' | 'regenerate-question';
  apiKey?: string;
  documents?: AiDocument[];
  document?: AiDocument;
  messages?: ChatMessage[];
  /** Dùng cho action 'regenerate-question'. */
  kind?: string;
  subject?: string;
  grade?: number;
  topic?: string;
  instruction?: string;
  /** Nội dung các câu hiện có để AI tránh trùng lặp. */
  exclude?: string[];
  options?: {
    subject?: string;
    grade?: number;
    durationMinutes?: number;
    totalPoints?: number;
    mcqCount?: number;
    shortAnswerCount?: number;
    essayCount?: number;
    multiMcqCount?: number;
    trueFalseCount?: number;
    fillBlankCount?: number;
    calculationCount?: number;
    difficulty?: string;
    notes?: string;
    examType?: string;
    topic?: string;
    /** Chỉ dùng kiến thức trong tài liệu. */
    useOnlyDocument?: boolean;
    levelRatios?: {
      recognize?: number;
      understand?: number;
      apply?: number;
      applyHigh?: number;
    };
  };
};

/* ------------------------------ Helpers ------------------------------ */

function dataUrlParts(value: string, fallbackMime = 'image/png'): GeminiPart | null {
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(value.trim());
  if (!match) return null;
  return { inline_data: { mime_type: match[1] || fallbackMime, data: match[2] } };
}

function partsFromDocument(document: AiDocument, index: number): GeminiPart[] {
  const parts: GeminiPart[] = [];
  const header = `TÀI LIỆU ${index + 1}: ${document.title || 'Không tên'}`;
  if (document.content?.trim()) {
    parts.push({ text: `${header}\n"""\n${document.content.trim().slice(0, 60_000)}\n"""` });
  } else {
    parts.push({ text: `${header} (không có văn bản, hãy đọc nội dung đính kèm)` });
  }
  if (document.imageData) {
    const imagePart = dataUrlParts(document.imageData);
    if (imagePart) parts.push(imagePart);
  }
  if (document.pdfData) {
    parts.push({ inline_data: { mime_type: 'application/pdf', data: document.pdfData } });
  }
  return parts;
}

/** Gọi Gemini, thử lần lượt các model khi model không tồn tại. */
async function callGemini(parts: GeminiPart[], systemInstruction: string, useJson: boolean, timeoutMs = 110_000, suppliedKey?: string): Promise<string> {
  const key = apiKeyForRequest(suppliedKey);
  if (!key) {
    throw Object.assign(
      new Error('Chưa có API key Gemini. Dán key vào ô "API key Gemini" trong phần AI, hoặc đặt GEMINI_API_KEY trên server.'),
      { status: 400 },
    );
  }

  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.7,
      ...(useJson ? { responseMimeType: 'application/json' } : {}),
      maxOutputTokens: 32_000,
    },
  };

  let lastError: Error | null = null;

  for (const model of modelList()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${API_BASE}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (response.status === 404 || response.status === 400) {
        const raw = await response.text();
        if (/API_KEY_INVALID|API key not valid/i.test(raw)) {
          throw Object.assign(
            new Error('API key Gemini KHÔNG HỢP LỆ. Hãy dán lại key đầy đủ vào ô "API key Gemini" trong phần AI (hoặc sửa GEMINI_API_KEY trên server).'),
            { status: 401 },
          );
        }
        if (/not found|not supported|unsupported|invalid model|does not exist|no longer available|not_found|deprecated/i.test(raw)) {
          lastError = new Error(`Model ${model} không khả dụng`);
          continue;
        }
        throw new Error(`Gemini trả về lỗi ${response.status}: ${raw.slice(0, 500)}`);
      }
      if (response.status === 401 || response.status === 403) {
        throw Object.assign(new Error('API key không hợp lệ hoặc bị từ chối. Kiểm tra lại GEMINI_API_KEY trong .env.local.'), { status: 401 });
      }
      if (response.status === 429) {
        throw Object.assign(new Error('Đã vượt hạn mức miễn phí của Gemini (429). Thử lại sau ít phút.'), { status: 429 });
      }
      if (!response.ok) {
        const raw = await response.text();
        throw new Error(`Gemini trả về lỗi ${response.status}: ${raw.slice(0, 500)}`);
      }

      const payload = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        promptFeedback?: { blockReason?: string };
      };
      const text = (payload.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? '')
        .join('')
        .trim();

      if (!text) {
        const blocked = payload.promptFeedback?.blockReason;
        throw new Error(blocked ? `Gemini từ chối yêu cầu (${blocked}).` : 'Gemini không trả về nội dung.');
      }
      return text;
    } catch (error) {
      if (error instanceof Error && (error.message.startsWith('Gemini trả về lỗi') || error.message.includes('API key') || error.message.includes('hạn mức'))) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
      // Lỗi mạng/timeout → thử model kế tiếp.
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error('Không gọi được Gemini.');
}

/** Bóc chuỗi JSON từ câu trả lời (loại bỏ ```json fence nếu có, tự vá lỗi nhẹ của model). */
function extractJson<T>(text: string): T {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const attempts = [cleaned];
  // Vá các lỗi JSON thường gặp của model: dấu phẩy thừa trước } hoặc ]
  attempts.push(cleaned.replace(/,\s*([}\]])/g, '$1'));
  try {
    for (const attempt of attempts) {
      try {
        return JSON.parse(attempt) as T;
      } catch {
        // Thử cách vá kế tiếp.
      }
    }
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start >= 0 && end > start) {
      const sliced = cleaned.slice(start, end + 1);
      try {
        return JSON.parse(sliced) as T;
      } catch {
        return JSON.parse(sliced.replace(/,\s*([}\]])/g, '$1')) as T;
      }
    }
    throw new Error('Phản hồi của AI không đúng định dạng JSON.');
  } catch {
    throw new Error('Phản hồi của AI không đúng định dạng JSON.');
  }
}

/* ------------------------------ Chuẩn hóa đề nháp ------------------------------ */

type UnknownRecord = Record<string, unknown>;

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Kiểm tra + làm sạch đề nháp AI trả về trước khi gửi về giao diện:
 * cắt mảng theo giới hạn, bỏ câu rỗng, gạt câu trùng nội dung,
 * đảm bảo số phương án/ý nhận định/chỗ trống hợp lệ, điểm là số dương.
 * Không bịa thêm nội dung — chỉ lọc những gì model trả về.
 */
function normalizeExamDraft(raw: UnknownRecord): UnknownRecord {
  const draft: UnknownRecord = { ...raw };

  // ---- Trắc nghiệm 1 đáp án ----
  if (Array.isArray(draft.mcq)) {
    const seen = new Set<string>();
    draft.mcq = (draft.mcq as UnknownRecord[])
      .slice(0, 40)
      .filter((item) => {
        if (!item || typeof item !== 'object') return false;
        const content = toText(item.content);
        const options = Array.isArray(item.options) ? (item.options as unknown[]).map((option) => toText(option)) : [];
        const key = `${content.toLowerCase()}|${options.join('|').toLowerCase()}`.slice(0, 150);
        if (!content && !options.some(Boolean)) return false;
        if (seen.has(key)) return false; // bỏ câu trùng nội dung
        seen.add(key);
        return true;
      })
      .map((item) => {
        const options = Array.isArray(item.options)
          ? (item.options as unknown[]).slice(0, 4).map((option) => toText(option))
          : [];
        while (options.length < 4) options.push('');
        return {
          ...item,
          content: toText(item.content),
          options,
          correctIndex: Math.min(3, Math.max(0, Math.round(toNumber(item.correctIndex, 0)))),
          explanation: toText(item.explanation),
        };
      });
  }

  // ---- Trắc nghiệm nhiều đáp án ----
  if (Array.isArray(draft.multiMcq)) {
    const seen = new Set<string>();
    draft.multiMcq = (draft.multiMcq as UnknownRecord[])
      .slice(0, 30)
      .filter((item) => {
        if (!item || typeof item !== 'object') return false;
        const content = toText(item.content);
        const key = content.toLowerCase().slice(0, 150);
        if (!content) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item) => {
        const options = Array.isArray(item.options)
          ? (item.options as unknown[]).slice(0, 4).map((option) => toText(option))
          : [];
        while (options.length < 4) options.push('');
        const correctIndexes = Array.isArray(item.correctIndexes)
          ? [...new Set((item.correctIndexes as unknown[]).map((value) => Math.min(3, Math.max(0, Math.round(toNumber(value, 0))))))]
          : [];
        return {
          ...item,
          content: toText(item.content),
          options,
          correctIndexes,
          points: Math.max(0.25, toNumber(item.points, 0.5)),
          explanation: toText(item.explanation),
        };
      });
  }

  // ---- Đúng/Sai ----
  if (Array.isArray(draft.trueFalse)) {
    const seen = new Set<string>();
    draft.trueFalse = (draft.trueFalse as UnknownRecord[])
      .slice(0, 20)
      .filter((item) => {
        if (!item || typeof item !== 'object') return false;
        const content = toText(item.content);
        const key = content.toLowerCase().slice(0, 150);
        if (!content && !Array.isArray(item.statements)) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item) => {
        const statements = Array.isArray(item.statements)
          ? (item.statements as UnknownRecord[]).slice(0, 4).map((statement) => ({
              text: toText(statement?.text),
              answer:
                statement?.answer === true ||
                statement?.answer === 'true' ||
                statement?.answer === 'Đúng' ||
                statement?.answer === 'đúng',
            }))
          : [];
        return {
          ...item,
          content: toText(item.content),
          statements,
          points: Math.max(0.5, toNumber(item.points, 1)),
          explanation: toText(item.explanation),
        };
      });
  }

  // ---- Điền khuyết: đảm bảo số chỗ trống ___ khớp số đáp án ----
  if (Array.isArray(draft.fillBlanks)) {
    const seen = new Set<string>();
    draft.fillBlanks = (draft.fillBlanks as UnknownRecord[])
      .slice(0, 20)
      .filter((item) => {
        if (!item || typeof item !== 'object') return false;
        const content = toText(item.content);
        const key = content.toLowerCase().slice(0, 150);
        if (!content) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item) => {
        const blankCount = (toText(item.content).match(/_{2,}/g) || []).length;
        let blanks = Array.isArray(item.blanks) ? (item.blanks as UnknownRecord[]) : [];
        blanks = blanks
          .slice(0, Math.max(blankCount, 1))
          .map((blank) => ({ answer: toText(blank?.answer) || toText(item.answer) || '' }));
        return {
          ...item,
          content: toText(item.content),
          blanks: blanks.map((blank) => ({ answer: blank.answer })),
          points: Math.max(0.25, toNumber(item.points, 0.5)),
          explanation: toText(item.explanation),
        };
      });
  }

  // ---- Tính toán ----
  if (Array.isArray(draft.calculations)) {
    const seen = new Set<string>();
    draft.calculations = (draft.calculations as UnknownRecord[])
      .slice(0, 20)
      .filter((item) => {
        if (!item || typeof item !== 'object') return false;
        const content = toText(item.content);
        const key = content.toLowerCase().slice(0, 150);
        if (!content) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item) => ({
        ...item,
        content: toText(item.content),
        answer: toText(item.answer),
        points: Math.max(0.25, toNumber(item.points, 0.5)),
        explanation: toText(item.explanation),
      }));
  }

  // ---- Trả lời ngắn / tự luận ----
  if (Array.isArray(draft.shortAnswers)) {
    draft.shortAnswers = (draft.shortAnswers as UnknownRecord[])
      .slice(0, 15)
      .map((item) => ({
        ...item,
        content: toText(item.content),
        answer: toText(item.answer),
        points: Math.max(0.25, toNumber(item.points, 1)),
        explanation: toText(item.explanation),
      }))
      .filter((item) => toText(item.content));
  }
  if (Array.isArray(draft.essays)) {
    draft.essays = (draft.essays as UnknownRecord[])
      .slice(0, 8)
      .map((item) => ({
        ...item,
        content: toText(item.content),
        subParts: Array.isArray(item.subParts)
          ? (item.subParts as UnknownRecord[]).slice(0, 8).map((part, index) => ({
              label: toText(part?.label) || String.fromCharCode(97 + index),
              content: toText(part?.content),
              points: Math.max(0.25, toNumber(part?.points, 1)),
            }))
          : [],
        rubric: toText(item.rubric),
        points: Math.max(0.5, toNumber(item.points, 2)),
      }))
      .filter((item) => toText(item.content) || (Array.isArray(item.subParts) && item.subParts.length > 0));
  }

  draft.title = toText(draft.title);
  draft.subject = toText(draft.subject);
  draft.durationMinutes = Math.min(300, Math.max(1, Math.round(toNumber(draft.durationMinutes, 45))));
  draft.totalPoints = Math.max(1, toNumber(draft.totalPoints, 10));

  return draft;
}

/* ------------------------------ Prompt OCR ------------------------------ */

const OCR_SYSTEM = [
  'Bạn là công cụ nhận diện chữ (OCR) chuyên đọc tài liệu học tập của giáo viên Việt Nam.',
  'NHIỆM VỤ: chuyển toàn bộ nội dung tài liệu (kể cả chữ trong ảnh, bảng biểu, công thức) thành văn bản thuần.',
  'TUYỆT ĐỐI KHÔNG bịa thêm, không giải thích, không tóm tắt, không nhận xét — chỉ sao chép nguyên văn nội dung có trong tài liệu.',
  'Nếu một vùng nội dung mờ/không đọc được, ghi đúng một dòng [KHÔNG ĐỌC ĐƯỢC: phần mờ nằm giữa trang].',
  'Nếu thấy hình vẽ/biểu đồ/sơ đồ, ghi một dòng [HÌNH ẢNH: mô tả ngắn hình đó] rồi tiếp tục phần chữ.',
  'Bảng biểu: chuyển thành các dòng, mỗi dòng là một hàng với các ô cách nhau bởi dấu |.',
  'Công thức toán/lý/hóa: giữ nguyên dạng ký hiệu thường (√, x², a/b, °C, H₂O), không dùng LaTeX.',
  'Với PDF/ảnh nhiều trang: đặt dòng đánh dấu "===== TRANG n =====" ngay trước nội dung từng trang (n bắt đầu từ 1).',
].join('\n');

/* ------------------------------ Prompt tạo lại 1 câu ------------------------------ */

const KIND_LABELS: Record<string, string> = {
  mcq: 'câu trắc nghiệm 4 phương án A/B/C/D, CHỈ MỘT đáp án đúng (correctIndex 0..3)',
  'multi-mcq': 'câu trắc nghiệm 4 phương án, có 2-3 đáp án đúng (correctIndexes là mảng 0..3)',
  'true-false': 'câu đúng/sai gồm đúng 4 ý nhận định (statements: [{text, answer: true|false}])',
  'fill-blank': 'câu điền khuyết có chỗ trống ___ (3 dấu gạch dưới) và blanks: [{answer}] đúng số chỗ trống',
  short: 'câu trả lời ngắn (content, answer - nhiều biến thể cách nhau bởi |)',
  calculation: 'câu tính toán có answer là SỐ kết quả cuối cùng (ví dụ "7.5")',
  essay: 'câu tự luận (content, subParts: [{label, content, points}], rubric)',
};

const REGENERATE_SYSTEM = [
  'Bạn là giáo viên Việt Nam giàu kinh nghiệm, đang soạn lại MỘT câu hỏi cho đề kiểm tra.',
  'Chỉ trả về DUY NHẤT một object JSON của câu hỏi, không thêm chữ nào ngoài JSON.',
  'Dựa CHÍNH XẠC trên nội dung tài liệu được cung cấp; không bịa kiến thức ngoài tài liệu khi không được phép.',
  'Đáp án phải chính xác; tự kiểm tra lại trước khi trả về.',
  'Không trùng với các câu hỏi đã có trong danh sách được cung cấp.',
].join('\n');

/* ------------------------------ Helpers ghép tài liệu ------------------------------ */

function documentSection(documents: AiDocument[]): GeminiPart[] {
  return documents.flatMap((document, index) => partsFromDocument(document, index));
}


const EXAM_JSON_SPEC = `Trả về DUY NHẤT một object JSON theo đúng cấu trúc sau (không thêm chữ nào ngoài JSON). Bỏ hẳn mảng nào có số lượng = 0:
{
  "title": "string - tên đề kiểm tra ngắn gọn",
  "subject": "string - một trong: Toán học, Tin học, Vật lý, Hóa học, Tiếng Anh, Ngữ văn, Sinh học, Lịch sử, Địa lý",
  "grade": number,
  "durationMinutes": number,
  "totalPoints": number,
  "mcq": [
    {
      "content": "string - nội dung câu hỏi",
      "options": ["string A", "string B", "string C", "string D"],
      "correctIndex": 0,
      "topic": "string - chủ đề của câu (theo đoạn kiến thức bạn dùng)",
      "level": "string - một trong: nhận biết, thông hiểu, vận dụng, vận dụng cao",
      "sourcePages": [3],
      "explanation": "string - giải thích ngắn gọn vì sao đáp án đúng"
    }
  ],
  "multiMcq": [
    {
      "content": "string - câu hỏi yêu cầu chọn NHIỀU phương án đúng, ghi rõ 'chọn 2 đáp án' nếu cần",
      "options": ["string A", "string B", "string C", "string D"],
      "correctIndexes": [0, 2],
      "topic": "string",
      "level": "string",
      "sourcePages": [4],
      "explanation": "string"
    }
  ],
  "trueFalse": [
    {
      "content": "string - đề dẫn chung",
      "statements": [
        { "text": "string - ý nhận định a", "answer": true },
        { "text": "string - ý nhận định b", "answer": false },
        { "text": "string - ý nhận định c", "answer": true },
        { "text": "string - ý nhận định d", "answer": true }
      ],
      "topic": "string",
      "level": "string",
      "sourcePages": [5],
      "explanation": "string - giải thích từng ý"
    }
  ],
  "fillBlanks": [
    {
      "content": "string - câu có chỗ trống đánh dấu bằng ___, mỗi chỗ trống là 3 dấu gạch dưới liền nhau",
      "blanks": [ { "answer": "string - đáp án của chỗ trống thứ nhất" } ],
      "topic": "string",
      "level": "string",
      "sourcePages": [6],
      "explanation": "string"
    }
  ],
  "calculations": [
    {
      "content": "string - đề bài tính toán",
      "answer": "số - kết quả cuối cùng, viết dạng số thuần (ví dụ 7.5 hoặc -3)",
      "computation": { "expression": "biểu thức chỉ dùng số và + - * / ^ ( ) cho ra đáp án", "expected": 7.5 },
      "topic": "string",
      "level": "string",
      "sourcePages": [7],
      "explanation": "string - trình bày các bước giải ngắn gọn"
    }
  ],
  "shortAnswers": [
    { "content": "string", "answer": "string - đáp án đúng, nhiều biến thể cách nhau bởi |", "points": number, "topic": "string", "level": "string", "sourcePages": [8], "explanation": "string" }
  ],
  "essays": [
    {
      "content": "string - đề bài chung",
      "subParts": [ { "label": "a", "content": "string", "points": number } ],
      "rubric": "string - hướng dẫn chấm",
      "topic": "string",
      "level": "string",
      "sourcePages": [9]
    }
  ]
}`;

function buildExamSystemPrompt(): string {
  return [
    'Bạn là một giáo viên Việt Nam giàu kinh nghiệm chuyên soạn đề kiểm tra cho học sinh phổ thông.',
    'Dựa CHÍNH XẠC trên nội dung tài liệu được cung cấp. Khi yêu cầu "chỉ dùng tài liệu", tuyệt đối không bịa kiến thức ngoài tài liệu.',
    'Sử dụng tiếng Việt tự nhiên (trừ câu hỏi tiếng Anh nếu môn là Tiếng Anh).',
    'Khi có tài liệu ảnh hoặc PDF scan, hãy đọc kỹ nội dung trong đó (kể cả công thức, hình vẽ, bảng biểu).',
    'Công thức toán viết bằng ký hiệu thường: x², √5, a/b, (x+1)³ — không dùng LaTeX.',
    EXAM_JSON_SPEC,
    'Quy tắc bắt buộc:',
    '- mcq.correctIndex là số 0..3 (0=A, 1=B, 2=C, 3=D). Phân bổ đáp án ngẫu nhiên tự nhiên giữa các phương án, không dồn về A.',
    '- Mỗi câu mcq/multiMcq có đúng 4 phương án; mcq chỉ MỘT phương án đúng; multiMcq có từ 2 đến 3 phương án đúng (correctIndexes là mảng các số 0..3).',
    '- Mỗi câu trueFalse có đúng 4 ý nhận định a, b, c, d với answer là true/false; các ý bám sát nội dung tài liệu, không ghi nhận định gây hiểu lầm.',
    '- fillBlanks: mỗi chỗ trống trong content phải là ___ (3 dấu gạch dưới) và số phần tử của blanks phải BẰNG số chỗ trống, đúng thứ tự.',
    '- calculations: answer chỉ ghi KẾT QUẢ SỐ cuối cùng (ví dụ "7.5"); các bước giải viết trong explanation.',
    '- Không tạo 2 câu trùng nội dung; không để một câu tiết lộ đáp án của câu khác.',
    '- Đáp án phải chính xác theo toán học/khoa học — TRƯỚC KHI TRẢ VỀ, hãy tự kiểm tra lại từng đáp án và lời giải; nếu phát hiện sai thì sửa rồi mới trả JSON.',
    '- Các phương án gây nhiễu phải hợp lý (cùng dạng, cùng đơn vị, dễ nhầm nhưng sai rõ ràng).',
    '- explanation ngắn gọn (1-3 câu), nêu được lý do đúng/sai.',
    '- Điểm các phần cộng lại đúng bằng totalPoints. shortAnswers/fillBlanks/calculations/essays mỗi câu có "points"; nếu giáo viên không yêu cầu riêng thì chia đều hợp lý (ví dụ 0.25/0.5 cho trắc nghiệm).',
    '- Độ khó phân bố theo các mức Nhận biết → Thông hiểu → Vận dụng → Vận dụng cao theo tỉ lệ được yêu cầu.',
    '- MỖI câu phải ghi "topic" (chủ đề), "level" (một trong: nhận biết, thông hiểu, vận dụng, vận dụng cao) và "sourcePages" (mảng số trang của đoạn kiến thức bạn dùng — xem nhãn [KN-… · Tài liệu … · trang …] trong KHO KIẾN THỨC). Không bịa số trang.',
    '- Khi ở chế độ CHỈ DÙNG TÀI LIỆU: chỉ dùng kiến thức trong KHO KIẾN THỨC; nếu kho quá ngắn để đủ số câu thì giảm số câu thay vì bịa kiến thức ngoài.',
    '- calculations: kèm "computation": { "expression": "biểu thức CHỈ dùng số và + - * / ^ ( ) tính ra đáp án", "expected": số }. Hệ thống sẽ tự tính lại biểu thức để kiểm chứng đáp án.',
    '- Không nhắc lại tài liệu nguyên văn dài; viết lại câu hỏi theo cách của bạn.',
  ].join('\n');
}

const TEACHER_SYSTEM = [
  'Bạn là trợ lý AI của một nền tảng soạn đề thi dành cho giáo viên phổ thông Việt Nam.',
  'Bạn luôn trả lời bằng tiếng Việt, ngắn gọn, rõ ràng, có cấu trúc (gạch đầu dòng khi cần).',
  'Câu hỏi của giáo viên luôn liên quan đến các tài liệu được đính kèm. Trả lời bám sát tài liệu; nếu thông tin không có trong tài liệu thì nói rõ điều đó.',
  'Khi được yêu cầu tóm tắt, hãy tóm tắt các ý chính theo gạch đầu dòng, nêu được chủ đề, nội dung trọng tâm và gợi ý dạng câu hỏi có thể ra từ tài liệu.',
].join('\n');

/* ------------------------------ Route ------------------------------ */

export async function GET() {
  const key = apiKey();
  const payload: { ok: boolean; configured: boolean; keyValid?: boolean | null; model: string } = {
    ok: true,
    configured: Boolean(key),
    model: modelList()[0],
  };
  if (key) {
    // Kiểm tra nhanh key có thực sự dùng được không (đặt sai/missing ký tự rất dễ xảy ra).
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(`${API_BASE}?pageSize=1`, {
        headers: { 'x-goog-api-key': key },
        signal: controller.signal,
      });
      clearTimeout(timer);
      payload.keyValid = response.ok ? true : /API_KEY_INVALID|API key not valid/i.test(await response.text()) ? false : null;
    } catch {
      payload.keyValid = null; // không kết luận được (mạng/timeout)
    }
  }
  return Response.json(payload);
}

export async function POST(request: NextRequest) {
  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return Response.json({ ok: false, message: 'Dữ liệu gửi lên không hợp lệ.' }, { status: 400 });
  }

  // Action riêng: kiểm tra một API key (key giáo viên gửi theo request, không lưu lại ở server).
  if (body.action === 'validate-key') {
    const candidate = apiKeyForRequest(body.apiKey);
    if (!candidate) {
      return Response.json({ ok: true, valid: false, reason: 'empty' });
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const check = await fetch(`${API_BASE}?pageSize=1`, {
        headers: { 'x-goog-api-key': candidate },
        signal: controller.signal,
      });
      clearTimeout(timer);
      const raw = check.ok ? '' : await check.text();
      const valid = check.ok || !/API_KEY_INVALID|API key not valid/i.test(raw);
      return Response.json({ ok: true, valid, status: check.status });
    } catch {
      return Response.json({ ok: true, valid: null, reason: 'network' });
    }
  }

  if (!apiKeyForRequest(body.apiKey)) {
    return Response.json(
      {
        ok: false,
        error: 'missing-key',
        message:
          'Chưa có API key Gemini. Dán key vào ô "API key Gemini" trong phần AI (lấy miễn phí tại https://aistudio.google.com/apikey), hoặc đặt GEMINI_API_KEY trên server.',
      },
      { status: 400 },
    );
  }

  try {
    if (body.action === 'summarize') {
      const document = body.document;
      if (!document) {
        return Response.json({ ok: false, message: 'Thiếu tài liệu cần tóm tắt.' }, { status: 400 });
      }
      const text = await callGemini(
        partsFromDocument(document, 0),
        TEACHER_SYSTEM,
        false,
        110_000,
        body.apiKey,
      );
      return Response.json({ ok: true, summary: text });
    }

    if (body.action === 'chat') {
      const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
      const documents = Array.isArray(body.documents) ? body.documents : [];
      const parts: GeminiPart[] = [];
      if (documents.length > 0) {
        parts.push(...documentSection(documents));
      } else {
        parts.push({ text: '(Giáo viên chưa chọn tài liệu nào. Hãy trả lời dựa trên kiến thức chung.)' });
      }
      parts.push({ text: `LỊCH SỬ HỘI THOẠI:\n${messages
        .map((message) => `${message.role === 'user' ? 'Giáo viên' : 'Trợ lý'}: ${message.content}`)
        .join('\n')}\n\nTrả lời câu hỏi MỚI NHẤT của giáo viên ở trên.` });
      const text = await callGemini(parts, TEACHER_SYSTEM, false, 110_000, body.apiKey);
      return Response.json({ ok: true, reply: text });
    }

    if (body.action === 'generate-exam') {
      const documents = Array.isArray(body.documents) ? body.documents : [];
      if (documents.length === 0) {
        return Response.json(
          { ok: false, message: 'Hãy chọn ít nhất một tài liệu để AI dựa vào đó soạn đề.' },
          { status: 400 },
        );
      }

      const options = body.options ?? {};
      const mcqCount = Math.max(0, Math.min(40, Math.round(options.mcqCount ?? 10)));
      const shortCount = Math.max(0, Math.min(15, Math.round(options.shortAnswerCount ?? 2)));
      const essayCount = Math.max(0, Math.min(8, Math.round(options.essayCount ?? 1)));
      const multiMcqCount = Math.max(0, Math.min(15, Math.round(options.multiMcqCount ?? 0)));
      const trueFalseCount = Math.max(0, Math.min(10, Math.round(options.trueFalseCount ?? 0)));
      const fillBlankCount = Math.max(0, Math.min(15, Math.round(options.fillBlankCount ?? 0)));
      const calculationCount = Math.max(0, Math.min(15, Math.round(options.calculationCount ?? 0)));
      const subject = options.subject || 'Không chỉ định';
      const grade = options.grade || 9;
      const duration = Math.round(options.durationMinutes ?? 45);
      const totalPoints = options.totalPoints ?? 10;
      const difficulty = options.difficulty || 'trung bình';
      const examType = options.examType === 'practice' ? 'ôn tập/luyện tập' : 'chính thức';
      const notes = (options.notes || '').trim();
      const topic = (options.topic || '').trim();
      const useOnlyDocument = options.useOnlyDocument !== false; // mặc định: chỉ dùng tài liệu
      const ratios = options.levelRatios ?? {};

      // ---- Knowledge Engine: phân tích tài liệu thành các đoạn kiến thức ----
      const { segments, problems } = deriveKnowledgeSegments(
        documents.map((document) => ({ title: document.title, content: document.content })),
      );
      const blocking = criticalProblems(problems);
      if (blocking.length > 0) {
        // Đặc tả: KHÔNG tự tạo đề khi tài liệu chưa xử lý đầy đủ hoặc có lỗi nghiêm trọng.
        const lines = blocking.map((problem) => `- ${problem.documentTitle}: ${problem.message}`);
        return Response.json(
          {
            ok: false,
            blocked: 'knowledge',
            message: [
              'Chưa thể soạn đề vì tài liệu có lỗi nghiêm trọng:',
              ...lines,
              'Hãy bấm "Nhận diện chữ bằng AI" để OCR lại tài liệu, hoặc thay tài liệu khác rồi thử lại.',
            ].join('\n'),
            problems,
          },
          { status: 422 },
        );
      }
      const stats = knowledgeStats(segments);

      // Tổng số câu để tính tỉ lệ từng mức độ nhận thức.
      const ratioSum =
        (ratios.recognize ?? 0) + (ratios.understand ?? 0) + (ratios.apply ?? 0) + (ratios.applyHigh ?? 0);
      const ratioLine = (batchTotal: number) =>
        ratioSum > 0 && batchTotal > 0
          ? `- Tỉ lệ mức độ cho ${batchTotal} câu của nhóm này: Nhận biết ${Math.round(((ratios.recognize ?? 0) / ratioSum) * batchTotal)} câu, Thông hiểu ${Math.round(((ratios.understand ?? 0) / ratioSum) * batchTotal)} câu, Vận dụng ${Math.round(((ratios.apply ?? 0) / ratioSum) * batchTotal)} câu, Vận dụng cao ${Math.round(((ratios.applyHigh ?? 0) / ratioSum) * batchTotal)} câu (làm tròn cho khớp).`
          : `- Độ khó: ${difficulty}.`;

      // ---- Phân bổ điểm theo trọng số để tổng bằng thang điểm ----
      const kindWeights: Array<{ key: string; count: number; weight: number }> = [
        { key: 'mcq', count: mcqCount, weight: 1 },
        { key: 'multiMcq', count: multiMcqCount, weight: 2 },
        { key: 'trueFalse', count: trueFalseCount, weight: 4 },
        { key: 'fillBlanks', count: fillBlankCount, weight: 2 },
        { key: 'calculations', count: calculationCount, weight: 4 },
        { key: 'shortAnswers', count: shortCount, weight: 2 },
        { key: 'essays', count: essayCount, weight: 8 },
      ];
      const totalWeight = kindWeights.reduce((sum, kind) => sum + kind.count * kind.weight, 0);
      const unit = totalWeight > 0 ? totalPoints / totalWeight : 0;
      const kindPoints = new Map<string, number>(
        kindWeights.map((kind) => [
          kind.key,
          Math.max(0.25, Math.round(unit * kind.weight * 4) / 4),
        ]),
      );
      const pointsLine = (keys: string[]) =>
        keys
          .filter((key) => (kindWeights.find((kind) => kind.key === key)?.count ?? 0) > 0)
          .map((key) => {
            const label: Record<string, string> = {
              mcq: 'trắc nghiệm',
              multiMcq: 'TN nhiều đáp án',
              trueFalse: 'đúng/sai',
              fillBlanks: 'điền khuyết',
              calculations: 'tính toán',
              shortAnswers: 'trả lời ngắn',
              essays: 'tự luận',
            };
            return `${label[key]} ${kindPoints.get(key)}đ/câu`;
          })
          .join(', ');

      const sharedRequest = [
        `Soạn đề kiểm tra ${examType} môn ${subject} — khối lớp ${grade} — thời gian ${duration} phút — thang điểm ${totalPoints}.`,
        topic ? `Chủ đề tập trung: ${topic}.` : 'Chủ đề: toàn bộ nội dung kho kiến thức, chọn các kiến thức trọng tâm.',
        useOnlyDocument
          ? 'CHẾ ĐỘ CHỈ DÙNG TÀI LIỆU: mọi câu hỏi phải xuất phát trực tiếp từ kiến thức trong KHO KIẾN THỨC dưới đây.'
          : 'Được phép bổ sung kiến thức chuẩn của môn học để làm phong phú câu hỏi (vẫn ưu tiên nội dung kho kiến thức).',
        notes ? `Yêu cầu thêm của giáo viên: ${notes}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      // ---- Sinh đề theo từng nhóm nhỏ (batch) rồi ghép lại ----
      type GenerationBatch = { requestLine: string; keys: string[]; total: number; rotate: number };
      const batches: GenerationBatch[] = [];
      const objectiveTotal = mcqCount + multiMcqCount;
      if (objectiveTotal > 0) {
        batches.push({
          requestLine: `Nhóm 1: ${mcqCount} trắc nghiệm 1 đáp án (mảng "mcq") và ${multiMcqCount} trắc nghiệm nhiều đáp án (mảng "multiMcq") — bỏ hẳn mảng nào số lượng 0. Điểm gợi ý: ${pointsLine(['mcq', 'multiMcq'])}.`,
          keys: ['mcq', 'multiMcq'],
          total: objectiveTotal,
          rotate: 0,
        });
      }
      const shortTotal = trueFalseCount + fillBlankCount + calculationCount + shortCount;
      if (shortTotal > 0) {
        batches.push({
          requestLine: `Nhóm 2: ${trueFalseCount} đúng/sai (mảng "trueFalse"), ${fillBlankCount} điền khuyết (mảng "fillBlanks"), ${calculationCount} tính toán (mảng "calculations"), ${shortCount} trả lời ngắn (mảng "shortAnswers") — bỏ hẳn mảng nào số lượng 0. Điểm gợi ý: ${pointsLine(['trueFalse', 'fillBlanks', 'calculations', 'shortAnswers'])}.`,
          keys: ['trueFalse', 'fillBlanks', 'calculations', 'shortAnswers'],
          total: shortTotal,
          rotate: 1,
        });
      }
      if (essayCount > 0) {
        batches.push({
          requestLine: `Nhóm 3: ${essayCount} câu tự luận (mảng "essays") với subParts và rubric. Điểm gợi ý: ${pointsLine(['essays'])}.`,
          keys: ['essays'],
          total: essayCount,
          rotate: 2,
        });
      }
      if (batches.length === 0) {
        return Response.json(
          { ok: false, message: 'Hãy chọn ít nhất một dạng câu hỏi để AI soạn.' },
          { status: 400 },
        );
      }

      const merged: Record<string, unknown> = {
        grade,
        durationMinutes: duration,
        totalPoints,
      };
      const QUESTION_KEYS = ['mcq', 'multiMcq', 'trueFalse', 'fillBlanks', 'calculations', 'shortAnswers', 'essays'];
      let lastParseError: Error | null = null;

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batch = batches[batchIndex];
        // Mỗi batch chỉ nhận phần kho kiến thức cần thiết — không nhồi cả tài liệu lớn.
        const knowledge = selectKnowledge(segments, topic, 2600, batch.rotate);
        const knowledgeText = formatKnowledgeContext(knowledge);
        const parts: GeminiPart[] = [];
        if (knowledgeText) parts.push({ text: knowledgeText });
        // Đính kèm nhị phân (ảnh/PDF gốc) để AI đối chiếu bảng, công thức, hình vẽ.
        documents.forEach((document, documentIndex) => {
          if (document.imageData) {
            const imagePart = dataUrlParts(document.imageData);
            if (imagePart) {
              parts.push({ text: `Ảnh đính kèm TÀI LIỆU ${documentIndex + 1}: ${document.title || 'Không tên'}` });
              parts.push(imagePart);
            }
          }
          if (document.pdfData) {
            parts.push({ text: `PDF gốc TÀI LIỆU ${documentIndex + 1}: ${document.title || 'Không tên'} (đối chiếu khi cần)` });
            parts.push({ inline_data: { mime_type: 'application/pdf', data: document.pdfData } });
          }
        });

        const requestText = [
          sharedRequest,
          batch.requestLine,
          ratioLine(batch.total),
          batchIndex === 0
            ? 'Ngoài các mảng câu hỏi, trả thêm "title" (tên đề ngắn gọn) và "subject" (môn học).'
            : 'CHỈ trả các mảng câu hỏi của nhóm này (không cần title/subject).',
        ]
          .filter(Boolean)
          .join('\n');
        parts.push({ text: requestText });

        let parsedBatch: Record<string, unknown> | null = null;
        for (let attempt = 0; attempt < 2 && !parsedBatch; attempt += 1) {
          const raw = await callGemini(parts, buildExamSystemPrompt(), true, 110_000, body.apiKey);
          try {
            const extracted = extractJson<Record<string, unknown>>(raw);
            parsedBatch = Array.isArray(extracted) ? (extracted[0] as Record<string, unknown>) : extracted;
          } catch (parseError) {
            lastParseError = parseError instanceof Error ? parseError : new Error(String(parseError));
          }
        }
        if (!parsedBatch) {
          throw lastParseError ?? new Error('AI không trả về nhóm câu hỏi hợp lệ.');
        }
        // Ghép mảng câu hỏi của batch vào đề tổng hợp.
        for (const key of QUESTION_KEYS) {
          const items = parsedBatch[key];
          if (Array.isArray(items) && items.length > 0) {
            merged[key] = [...(Array.isArray(merged[key]) ? (merged[key] as unknown[]) : []), ...items];
          }
        }
        if (!merged.title && parsedBatch.title) merged.title = parsedBatch.title;
        if (parsedBatch.subject) merged.subject = parsedBatch.subject;
      }
      if (!merged.title) merged.title = `Đề kiểm tra ${subject !== 'Không chỉ định' ? subject : ''} — khối ${grade}`.trim();
      if (!merged.subject) merged.subject = subject;

      // Kiểm tra + làm sạch cấu trúc đề trước khi trả về giao diện.
      return Response.json({ ok: true, draft: normalizeExamDraft(merged), knowledge: stats });
    }

    if (body.action === 'ocr') {
      const document = body.document;
      if (!document) {
        return Response.json({ ok: false, message: 'Thiếu tài liệu cần nhận diện chữ.' }, { status: 400 });
      }
      const text = await callGemini(partsFromDocument(document, 0), OCR_SYSTEM, false, 110_000, body.apiKey);
      return Response.json({ ok: true, text });
    }

    if (body.action === 'regenerate-question') {
      const documents = Array.isArray(body.documents) ? body.documents : [];
      if (documents.length === 0) {
        return Response.json(
          { ok: false, message: 'Thiếu tài liệu để tạo lại câu hỏi.' },
          { status: 400 },
        );
      }
      const kind = (body.kind || '').trim();
      const kindSpec = KIND_LABELS[kind];
      if (!kindSpec) {
        return Response.json({ ok: false, message: 'Loại câu hỏi không hợp lệ.' }, { status: 400 });
      }
      const subject = body.subject || 'Không chỉ định';
      const grade = body.grade || 9;
      const topic = (body.topic || '').trim();
      const instruction = (body.instruction || '').trim();
      const exclude = Array.isArray(body.exclude) ? body.exclude.filter((item) => typeof item === 'string').slice(0, 60) : [];

      // Knowledge Engine: chọn đúng đoạn kiến thức theo chủ đề thay vì nhồi cả tài liệu.
      const { segments } = deriveKnowledgeSegments(
        documents.map((document) => ({ title: document.title, content: document.content })),
      );
      const knowledge = selectKnowledge(segments, topic || instruction, 2600, 0);
      const knowledgeText = formatKnowledgeContext(knowledge);

      const requestText = [
        `Hãy tạo lại MỘT ${kindSpec} cho đề kiểm tra môn ${subject} — khối lớp ${grade}.`,
        topic ? `Chủ đề: ${topic}.` : '',
        instruction ? `Yêu cầu thêm của giáo viên: ${instruction}` : '',
        exclude.length > 0
          ? `CÁC CÂU ĐÃ CÓ (không được trùng hoặc gần giống):\n${exclude.map((item, index) => `${index + 1}. ${item.slice(0, 200)}`).join('\n')}`
          : '',
        'Ghi rõ "topic" (chủ đề), "level" (một trong: nhận biết, thông hiểu, vận dụng, vận dụng cao) và "sourcePages" (mảng số trang của đoạn kiến thức bạn dùng). Với câu tính toán, kèm thêm "computation": { "expression": "biểu thức chỉ dùng số và + - * / ^ ( )", "expected": số }.',
        'Trả về DUY NHẤT một object JSON của câu hỏi theo đúng cấu trúc loại câu hỏi trên.',
      ]
        .filter(Boolean)
        .join('\n');

      const parts: GeminiPart[] = [];
      if (knowledgeText) parts.push({ text: knowledgeText });
      // Đính kèm nhị phân để AI đối chiếu bảng/công thức/hình khi tạo lại câu.
      documents.forEach((document, documentIndex) => {
        if (document.imageData) {
          const imagePart = dataUrlParts(document.imageData);
          if (imagePart) {
            parts.push({ text: `Ảnh đính kèm TÀI LIỆU ${documentIndex + 1}: ${document.title || 'Không tên'}` });
            parts.push(imagePart);
          }
        }
        if (document.pdfData) {
          parts.push({ text: `PDF gốc TÀI LIỆU ${documentIndex + 1}: ${document.title || 'Không tên'}` });
          parts.push({ inline_data: { mime_type: 'application/pdf', data: document.pdfData } });
        }
      });
      parts.push({ text: requestText });

      let question: Record<string, unknown> | null = null;
      let lastParseError: Error | null = null;
      for (let attempt = 0; attempt < 2 && !question; attempt += 1) {
        const raw = await callGemini(parts, REGENERATE_SYSTEM, true, 110_000, body.apiKey);
        try {
          const parsed = extractJson<Record<string, unknown>>(raw);
          // Model có thể bọc object trong mảng — lấy phần tử đầu.
          question = Array.isArray(parsed) ? (parsed[0] as Record<string, unknown>) : parsed;
        } catch (parseError) {
          lastParseError = parseError instanceof Error ? parseError : new Error(String(parseError));
        }
      }
      if (!question) {
        throw lastParseError ?? new Error('AI không trả về câu hỏi hợp lệ.');
      }
      return Response.json({ ok: true, question });
    }

    return Response.json({ ok: false, message: 'Hành động không được hỗ trợ.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lỗi AI không xác định.';
    const status = (error as { status?: number })?.status ?? 500;
    console.error('AI route error:', message);
    return Response.json({ ok: false, message }, { status: status >= 400 && status < 600 ? status : 500 });
  }
}
