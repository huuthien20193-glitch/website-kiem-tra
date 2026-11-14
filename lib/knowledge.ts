/**
 * Knowledge Engine (Giai đoạn 3 của AI Exam Engine) — kho kiến thức trung gian
 * nằm giữa Document Engine (lib/documents.ts) và AI soạn đề.
 *
 * Nhiệm vụ:
 * 1. Chia tài liệu đã trích xuất thành các ĐOẠN KIẾN THỨC nhỏ, mỗi đoạn có:
 *    ID, nội dung, tên tài liệu, số trang, chủ đề, loại kiến thức,
 *    trạng thái nhận diện và mức độ tin cậy.
 * 2. Truy xuất đúng những đoạn cần thiết theo chủ đề khi soạn đề —
 *    KHÔNG nhồi toàn bộ tài liệu lớn vào một prompt duy nhất.
 * 3. Phát hiện tài liệu có lỗi nghiêm trọng để chặn tạo đề tự động.
 *
 * Toàn bộ chạy deterministic (không gọi AI) nên kết quả ổn định và nhanh.
 */
import { parseDocumentContent } from './documents';
import type { DocumentPage } from './types';

/** Loại kiến thức của một đoạn. */
export type KnowledgeKind = 'definition' | 'formula' | 'example' | 'rule' | 'general';

export const KNOWLEDGE_KIND_LABELS: Record<KnowledgeKind, string> = {
  definition: 'Định nghĩa',
  formula: 'Công thức',
  example: 'Ví dụ',
  rule: 'Quy tắc / định lý',
  general: 'Kiến thức chung',
};

/** Một đoạn kiến thức có nguồn gốc rõ ràng. */
export type KnowledgeSegment = {
  /** ID duy nhất, ví dụ "KN-T1-P03". */
  id: string;
  /** Thứ tự tài liệu trong danh sách đã chọn (1-based). */
  documentIndex: number;
  documentTitle: string;
  startPage: number;
  endPage: number;
  /** Nội dung đã làm sạch marker lỗi. */
  content: string;
  words: number;
  /** Chủ đề suy từ tiêu đề chương/bài trong đoạn. */
  topic: string;
  kind: KnowledgeKind;
  /** 'ok' | 'low' (ít chữ) | 'failed' (trang không đọc được). */
  status: 'ok' | 'low' | 'failed';
  /** 0..1 — ước lượng tin cậy dựa trên trạng thái nhận diện. */
  confidence: number;
  keywords: string[];
};

/** Vấn đề phát hiện được ở tài liệu — dùng để chặn/cảnh báo trước khi soạn đề. */
export type KnowledgeProblem = {
  documentTitle: string;
  severity: 'critical' | 'warning';
  message: string;
};

/** Từ dừng tiếng Việt — loại khỏi từ khóa để tránh nhiễu. */
const VIETNAMESE_STOPWORDS = new Set([
  'và', 'hoặc', 'của', 'các', 'cho', 'với', 'trong', 'ngoài', 'trên', 'dưới', 'khi', 'một', 'hai',
  'những', 'này', 'nó', 'là', 'có', 'được', 'theo', 'từ', 'đến', 'về', 'bởi', 'thì', 'mà', 'nếu',
  'không', 'cũng', 'đã', 'đang', 'sẽ', 'phải', 'cần', 'phải', 'nhiều', 'hơn', 'nhất', 'như', 'theo',
  'each', 'that', 'this', 'with', 'from', 'have', 'has', 'the', 'and', 'for', 'are', 'not', 'was',
]);

/** Regex marker lỗi do OCR/trích xuất tạo ra — loại khỏi nội dung đoạn. */
const UNREADABLE_PATTERN = /\[KHÔNG ĐỌC ĐƯỢC[^\]]*\]/g;

function countWords(text: string): number {
  return (text.replace(/\[[^\]]*\]/g, ' ').match(/[^\s]+/g) || []).length;
}

function cleanContent(text: string): string {
  return text
    .replace(UNREADABLE_PATTERN, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Trích từ khóa: các từ có nghĩa xuất hiện nhiều nhất. */
function extractKeywords(text: string, max = 8): string[] {
  const frequency = new Map<string, number>();
  const tokens = text
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/);
  for (const token of tokens) {
    const word = token.trim();
    if (word.length < 3 || VIETNAMESE_STOPWORDS.has(word) || /^\d+$/.test(word)) continue;
    frequency.set(word, (frequency.get(word) || 0) + 1);
  }
  return [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([word]) => word);
}

/** Dò chủ đề: dòng tiêu đề chương/bài/phần đầu tiên trong đoạn. */
function detectTopic(text: string): string {
  const lines = text.split('\n');
  const headingPattern = /^(?:\s*)(chương|bài|phần|unit|chapter|đề|phần i|topic)\b[^\n]{0,90}$/i;
  const numberingPattern = /^(?:\s*)(?:[IVX]+|\d{1,2})[.)]\s+\S[^\n]{0,90}$/;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 100) continue;
    if (headingPattern.test(trimmed) || numberingPattern.test(trimmed)) {
      return trimmed.replace(/[:.]+$/, '').slice(0, 90);
    }
  }
  return 'Chung';
}

/** Phân loại loại kiến thức của đoạn theo dấu hiệu ngôn ngữ. */
function classifyKind(text: string): KnowledgeKind {
  const lower = text.toLowerCase();
  if (/\\frac|\\sqrt|√|\bx\s*[²³]|\^[{(]?\d|∫|∑|lim\s|dx\b/.test(text) || lower.includes('công thức')) {
    return 'formula';
  }
  if (/(định nghĩa|khái niệm|gọi là|được gọi|là gì)/.test(lower)) return 'definition';
  if (/(ví dụ|vd:|ví dụ minh họa|bài toán ví dụ)/.test(lower)) return 'example';
  if (/(quy tắc|định lý|tính chất|hệ thức|luật|nguyên tắc|bất đẳng thức)/.test(lower)) return 'rule';
  return 'general';
}

/** Ước lượng độ tin cậy của đoạn theo trạng thái nhận diện. */
function confidenceFor(pages: DocumentPage[], status: KnowledgeSegment['status'], kind: KnowledgeKind): number {
  if (status === 'failed') return 0;
  let confidence = status === 'low' ? 0.45 : 0.9;
  // Trang nhiều chữ hơn → tin cậy hơn một chút (nội dung trích xuất đầy đủ).
  const words = pages.reduce((sum, page) => sum + page.words, 0);
  if (status === 'ok' && words >= 120) confidence += 0.05;
  if (kind !== 'general') confidence += 0.03;
  return Math.min(0.99, Math.round(confidence * 100) / 100);
}

/** Nhóm các trang liên tiếp thành đoạn ~<= 300 từ để prompt nhỏ gọn. */
const TARGET_WORDS = 300;

export function deriveKnowledgeSegments(
  documents: Array<{ title?: string; content?: string }>,
): { segments: KnowledgeSegment[]; problems: KnowledgeProblem[] } {
  const segments: KnowledgeSegment[] = [];
  const problems: KnowledgeProblem[] = [];

  documents.forEach((document, docIndex) => {
    const title = document.title?.trim() || `Tài liệu ${docIndex + 1}`;
    const parsed = parseDocumentContent(document.content || '');
    const pages = parsed.pages.filter((page) => page.text.trim());
    const totalWords = parsed.pages.reduce((sum, page) => sum + page.words, 0);

    if (totalWords === 0) {
      problems.push({
        documentTitle: title,
        severity: 'critical',
        message:
          'Không trích xuất được nội dung chữ nào. Hãy dùng "Nhận diện chữ bằng AI" (OCR) hoặc tải tài liệu dạng văn bản.',
      });
      return;
    }

    // Nhóm trang liên tiếp.
    let buffer: DocumentPage[] = [];
    let bufferWords = 0;
    const flush = () => {
      if (buffer.length === 0) return;
      const rawText = buffer.map((page) => page.text).join('\n');
      const content = cleanContent(rawText);
      const words = countWords(content);
      const kind = classifyKind(content);
      const failedPages = buffer.filter((page) => page.status === 'failed').length;
      const lowPages = buffer.filter((page) => page.status === 'low').length;
      const status: KnowledgeSegment['status'] =
        failedPages === buffer.length || words === 0
          ? 'failed'
          : failedPages > 0 || lowPages > 0 || words < 40
            ? 'low'
            : 'ok';
      segments.push({
        id: `KN-T${docIndex + 1}-P${String(buffer[0].page).padStart(2, '0')}`,
        documentIndex: docIndex,
        documentTitle: title,
        startPage: buffer[0].page,
        endPage: buffer[buffer.length - 1].page,
        content,
        words,
        topic: detectTopic(rawText),
        kind,
        status,
        confidence: confidenceFor(buffer, status, kind),
        keywords: extractKeywords(rawText),
      });
      buffer = [];
      bufferWords = 0;
    };

    for (const page of pages) {
      buffer.push(page);
      bufferWords += page.words;
      if (bufferWords >= TARGET_WORDS) flush();
    }
    flush();

    // Cảnh báo trang lỗi / ít chữ.
    const failedPages = parsed.pages.filter((page) => page.status === 'failed');
    for (const page of failedPages) {
      problems.push({
        documentTitle: title,
        severity: 'warning',
        message: `Trang ${page.page} không đọc được nội dung — nên OCR lại hoặc kiểm tra tài liệu gốc.`,
      });
    }
    const lowPages = parsed.pages.filter((page) => page.status === 'low');
    for (const page of lowPages) {
      problems.push({
        documentTitle: title,
        severity: 'warning',
        message: `Trang ${page.page} có rất ít chữ (${page.words} từ) — có thể là trang scan/mờ.`,
      });
    }
  });

  return { segments, problems };
}

/** Tài liệu có lỗi nghiêm trọng khiến KHÔNG thể soạn đề tự động hay không. */
export function criticalProblems(problems: KnowledgeProblem[]): KnowledgeProblem[] {
  return problems.filter((problem) => problem.severity === 'critical');
}

/** Cân bằng điểm khi truy xuất: đoạn đạt trạng thái tốt và khớp chủ đề được ưu tiên. */
function scoreSegment(segment: KnowledgeSegment, topicTokens: string[]): number {
  const haystack = `${segment.topic} ${segment.keywords.join(' ')}`.toLowerCase();
  let topicHits = 0;
  for (const token of topicTokens) {
    if (token.length >= 3 && haystack.includes(token)) topicHits += 1;
  }
  const contentHits = topicTokens.filter((token) => segment.content.toLowerCase().includes(token)).length;
  const statusWeight = segment.status === 'ok' ? 1 : segment.status === 'low' ? 0.4 : 0;
  return topicHits * 2 + contentHits * 1.5 + statusWeight * 2 + segment.confidence;
}

/**
 * Chọn các đoạn kiến thức cho một lượt soạn đề.
 * @param topic chủ đề giáo viên nhập (có thể rỗng — chọn đoạn tin cậy nhất)
 * @param maxWords giới hạn tổng số từ đưa vào prompt
 * @param rotate xoay danh sách để các lượt sinh khác nhau phủ nhiều phần tài liệu
 */
export function selectKnowledge(
  segments: KnowledgeSegment[],
  topic: string,
  maxWords = 2600,
  rotate = 0,
): KnowledgeSegment[] {
  if (segments.length === 0) return [];
  const topicTokens = extractKeywords(topic, 10);
  const ranked = [...segments].sort((a, b) => scoreSegment(b, topicTokens) - scoreSegment(a, topicTokens));
  // Xoay để các lượt (batch) khác nhau dùng nguồn khác nhau nhưng vẫn ưu tiên đoạn tốt.
  const offset = ranked.length > 0 ? Math.abs(rotate) % ranked.length : 0;
  const ordered = [...ranked.slice(offset), ...ranked.slice(0, offset)];
  const picked: KnowledgeSegment[] = [];
  let words = 0;
  for (const segment of ordered) {
    if (picked.length > 0 && words + segment.words > maxWords) continue;
    if (picked.length >= 14) break;
    picked.push(segment);
    words += segment.words;
    if (words >= maxWords) break;
  }
  return picked;
}

/** Dựng khối văn bản kho kiến thức để đưa vào prompt AI. */
export function formatKnowledgeContext(segments: KnowledgeSegment[]): string {
  if (segments.length === 0) return '';
  const blocks = segments.map((segment) => {
    const pages = segment.startPage === segment.endPage ? `trang ${segment.startPage}` : `trang ${segment.startPage}-${segment.endPage}`;
    const header = [
      `[${segment.id} · Tài liệu "${segment.documentTitle}" · ${pages} · Chủ đề: ${segment.topic} · ${KNOWLEDGE_KIND_LABELS[segment.kind]} · Tin cậy ${Math.round(segment.confidence * 100)}%]`,
    ].join('');
    return `${header}\n"""\n${segment.content.slice(0, 2400)}\n"""`;
  });
  const totalWords = segments.reduce((sum, segment) => sum + segment.words, 0);
  return [
    `KHO KIẾN THỨC (${segments.length} đoạn · ${totalWords} từ, trích từ tài liệu gốc):`,
    'Khi tạo câu hỏi, ghi "sourcePages" là số trang thật của đoạn bạn dùng và "topic" là chủ đề tương ứng.',
    ...blocks,
  ].join('\n\n');
}

/** Tổng hợp số liệu kho kiến thức để hiển thị cho giáo viên. */
export function knowledgeStats(segments: KnowledgeSegment[]) {
  const documents = new Set(segments.map((segment) => segment.documentIndex));
  return {
    segmentCount: segments.length,
    documentCount: documents.size,
    words: segments.reduce((sum, segment) => sum + segment.words, 0),
    withSource: segments.filter((segment) => segment.status === 'ok').length,
  };
}

export type KnowledgeStats = ReturnType<typeof knowledgeStats>;
