import { NextRequest } from 'next/server';

/**
 * API AI cho phần giáo viên — gọi Google Gemini.
 * Cấu hình trong .env.local: GEMINI_API_KEY (lấy miễn phí tại https://aistudio.google.com/apikey)
 */

const DEFAULT_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite',
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
  action: 'summarize' | 'chat' | 'generate-exam';
  documents?: AiDocument[];
  document?: AiDocument;
  messages?: ChatMessage[];
  options?: {
    subject?: string;
    grade?: number;
    durationMinutes?: number;
    totalPoints?: number;
    mcqCount?: number;
    shortAnswerCount?: number;
    essayCount?: number;
    difficulty?: string;
    notes?: string;
    examType?: string;
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
async function callGemini(parts: GeminiPart[], systemInstruction: string, useJson: boolean, timeoutMs = 110_000): Promise<string> {
  const key = apiKey();
  if (!key) {
    throw Object.assign(new Error('MISSING_API_KEY'), { status: 400 });
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
        if (/not found|not supported|unsupported|invalid model|does not exist/i.test(raw)) {
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

/** Bóc chuỗi JSON từ câu trả lời (loại bỏ ```json fence nếu có). */
function extractJson<T>(text: string): T {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new Error('Phản hồi của AI không đúng định dạng JSON.');
  }
}

/* ------------------------------ Prompts ------------------------------ */

function documentSection(documents: AiDocument[]): GeminiPart[] {
  return documents.flatMap((document, index) => partsFromDocument(document, index));
}

const EXAM_JSON_SPEC = `Trả về DUY NHẤT một object JSON theo đúng cấu trúc sau (không thêm chữ nào ngoài JSON):
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
      "explanation": "string - giải thích ngắn gọn vì sao đáp án đúng"
    }
  ],
  "shortAnswers": [
    { "content": "string", "answer": "string - đáp án đúng, nhiều biến thể cách nhau bởi |", "points": number, "explanation": "string" }
  ],
  "essays": [
    {
      "content": "string - đề bài chung",
      "subParts": [ { "label": "a", "content": "string", "points": number } ],
      "rubric": "string - hướng dẫn chấm"
    }
  ]
}`;

function buildExamSystemPrompt(): string {
  return [
    'Bạn là một giáo viên Việt Nam giàu kinh nghiệm chuyên soạn đề kiểm tra cho học sinh phổ thông.',
    'Dựa CHÍNH XẠC trên nội dung tài liệu được cung cấp (bám sát kiến thức trong tài liệu, không bịa ra kiến thức ngoài chương trình).',
    'Sử dụng tiếng Việt tự nhiên (trừ câu hỏi tiếng Anh nếu môn là Tiếng Anh).',
    'Khi có tài liệu ảnh hoặc PDF scan, hãy đọc kỹ nội dung trong đó (kể cả công thức, hình vẽ).',
    EXAM_JSON_SPEC,
    'Quy tắc:',
    '- correctIndex là số 0..3 (0=A, 1=B, 2=C, 3=D). Phân bổ đáp án ngẫu nhiên tự nhiên giữa các phương án, không dồn về A.',
    '- Mỗi câu trắc nghiệm có đúng 4 phương án, chỉ một phương án đúng, các phương án gây nhiễu hợp lý.',
    '- explanation ngắn gọn (1-2 câu).',
    '- Điểm các phần cộng lại đúng bằng totalPoints. Nếu mcq có N câu thì mỗi câu mcq có điểm = mcqPointsPerQ (tự tính để gọn: ví dụ 0.25/0.5). shortAnswers + essays mỗi câu có "points".',
    '- Độ khó theo yêu cầu: dễ (nhận biết), trung bình (nhận biết + thông hiểu), khó (vận dụng), hoặc phân bố theo yêu cầu trong ghi chú.',
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
  return Response.json({ ok: true, configured: Boolean(apiKey()), model: modelList()[0] });
}

export async function POST(request: NextRequest) {
  if (!apiKey()) {
    return Response.json(
      {
        ok: false,
        error: 'missing-key',
        message:
          'Chưa cấu hình GEMINI_API_KEY. Hãy thêm GEMINI_API_KEY vào file .env.local (lấy miễn phí tại https://aistudio.google.com/apikey) rồi khởi động lại server.',
      },
      { status: 400 },
    );
  }

  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return Response.json({ ok: false, message: 'Dữ liệu gửi lên không hợp lệ.' }, { status: 400 });
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
      const text = await callGemini(parts, TEACHER_SYSTEM, false);
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
      const subject = options.subject || 'Không chỉ định';
      const grade = options.grade || 9;
      const duration = Math.round(options.durationMinutes ?? 45);
      const totalPoints = options.totalPoints ?? 10;
      const difficulty = options.difficulty || 'trung bình';
      const examType = options.examType === 'practice' ? 'ôn tập/luyện tập' : 'chính thức';
      const notes = (options.notes || '').trim();

      const requestText = [
        `Hãy soạn một đề kiểm tra ${examType} dựa trên các tài liệu trên với yêu cầu sau:`,
        `- Môn: ${subject} — Khối lớp: ${grade} — Thời gian làm bài: ${duration} phút — Thang điểm: ${totalPoints}`,
        `- Phân bố: ${mcqCount} câu trắc nghiệm, ${shortCount} câu trả lời ngắn, ${essayCount} câu tự luận (bỏ hẳn phần có số lượng = 0).`,
        `- Độ khó: ${difficulty}.`,
        notes ? `- Yêu cầu thêm của giáo viên: ${notes}` : '',
        'Tổng điểm mọi phần phải bằng thang điểm trên.',
      ]
        .filter(Boolean)
        .join('\n');

      const raw = await callGemini(
        [...documentSection(documents), { text: requestText }],
        buildExamSystemPrompt(),
        true,
      );
      const draft = extractJson<Record<string, unknown>>(raw);
      return Response.json({ ok: true, draft });
    }

    return Response.json({ ok: false, message: 'Hành động không được hỗ trợ.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lỗi AI không xác định.';
    const status = (error as { status?: number })?.status ?? 500;
    console.error('AI route error:', message);
    return Response.json({ ok: false, message }, { status: status >= 400 && status < 600 ? status : 500 });
  }
}
