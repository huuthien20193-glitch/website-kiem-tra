/**
 * Tự kiểm tra chất lượng đề nháp AI trước khi lưu vào đề chính thức (QC Engine).
 * Kiểm tra các lỗi thường gặp: câu trống, câu trùng, thiếu đáp án,
 * số lượng phương án/ý nhận định sai, chỗ trống không khớp đáp án,
 * đáp án tính toán không phải số, căn cứ tài liệu, và kiểm chứng
 * câu tính toán bằng bộ tính biểu thức độc lập.
 */
import type {
  AiExamDraft,
  AiMcqDraft,
  AiFillBlankDraft,
  AiCalculationDraft,
  AiMultiMcqDraft,
  AiTrueFalseDraft,
} from './ai';

export type QualityIssue = {
  severity: 'error' | 'warning';
  /** Nhãn câu hỏi có vấn đề, ví dụ "Câu trắc nghiệm 3". */
  questionLabel: string;
  message: string;
};

/** Ngữ cảnh kiểm tra: văn bản tài liệu để đối chiếu căn cứ. */
export type DraftCheckContext = {
  /** Toàn bộ văn bản các tài liệu đã chọn (nối lại). */
  documentsText?: string;
  /** Chế độ chỉ dùng tài liệu — câu không có căn cứ bị coi là cảnh báo nghiêm. */
  strictGrounding?: boolean;
};

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function questionText(item: unknown, fallback = ''): string {
  const text = asText((item as { content?: unknown })?.content);
  return text || fallback;
}

/* ----------------------- Bộ kiểm chứng biểu thức ----------------------- */
/**
 * Tính giá trị một biểu thức số học chỉ chứa số và + - * / ^ ( ).
 * Dùng để kiểm chứng ĐỘC LẬP đáp án của câu tính toán (không tin lời giải AI).
 * Trả về null nếu biểu thức không hợp lệ.
 */
export function evaluateExpression(expression: string): number | null {
  const expr = expression.replace(/\s+/g, '').replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/');
  if (!expr || expr.length > 200) return null;
  // Chỉ cho phép ký tự số học an toàn — chặn mọi thứ khác (letter, hàm...).
  if (!/^[-+*/^().0-9]+$/.test(expr)) return null;

  let position = 0;
  const peek = () => expr[position];

  const parseNumber = (): number | null => {
    const match = /^\d+(?:\.\d+)?/.exec(expr.slice(position));
    if (!match) return null;
    position += match[0].length;
    return Number(match[0]);
  };

  const parseFactor = (): number | null => {
    if (peek() === '(') {
      position += 1;
      const value = parseAdditive();
      if (peek() !== ')') return null;
      position += 1;
      return value;
    }
    if (peek() === '-') {
      position += 1;
      const value = parseFactor();
      return value === null ? null : -value;
    }
    if (peek() === '+') {
      position += 1;
      return parseFactor();
    }
    return parseNumber();
  };

  const parsePower = (): number | null => {
    const base = parseFactor();
    if (base === null) return null;
    if (peek() === '^') {
      position += 1;
      const exponent = parseFactor();
      if (exponent === null) return null;
      return Math.pow(base, exponent);
    }
    return base;
  };

  const parseMultiplicative = (): number | null => {
    let value = parsePower();
    if (value === null) return null;
    while (peek() === '*' || peek() === '/') {
      const operator = expr[position];
      position += 1;
      const right = parsePower();
      if (right === null) return null;
      if (operator === '/') {
        if (right === 0) return null; // chia 0 — biểu thức không xác định
        value /= right;
      } else {
        value *= right;
      }
    }
    return value;
  };

  function parseAdditive(): number | null {
    let value = parseMultiplicative();
    if (value === null) return null;
    while (peek() === '+' || peek() === '-') {
      const operator = expr[position];
      position += 1;
      const right = parseMultiplicative();
      if (right === null) return null;
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }

  const result = parseAdditive();
  if (result === null || position !== expr.length || !Number.isFinite(result)) return null;
  return result;
}

/** So sánh hai số với dung sai nhỏ (làm tròn 6 chữ số). */
function numbersClose(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 1e-6);
}

/* ----------------------- Đối chiếu căn cứ tài liệu ----------------------- */

const GROUNDING_STOPWORDS = new Set([
  'và', 'hoặc', 'của', 'các', 'cho', 'với', 'trong', 'ngoài', 'trên', 'dưới', 'khi', 'một', 'hai',
  'những', 'này', 'nó', 'là', 'có', 'được', 'theo', 'từ', 'đến', 'về', 'bởi', 'thì', 'mà', 'nếu',
  'không', 'cũng', 'đã', 'đang', 'sẽ', 'cần', 'nhiều', 'hơn', 'nhất', 'như', 'điều', 'việc', 'câu',
  'hỏi', 'đáp', 'án', 'đúng', 'sai', 'phương', 'án', 'dưới', 'đây', 'đó', 'bao', 'nhieu', 'the',
  'and', 'for', 'with', 'that', 'this', 'from', 'what', 'which',
]);

/** Trích từ khóa của câu hỏi để đối chiếu với tài liệu. */
function groundingKeywords(text: string, max = 6): string[] {
  const frequency = new Map<string, number>();
  const tokens = text
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/);
  for (const token of tokens) {
    const word = token.trim();
    if (word.length < 3 || GROUNDING_STOPWORDS.has(word) || /^\d+$/.test(word)) continue;
    frequency.set(word, (frequency.get(word) || 0) + 1);
  }
  return [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([word]) => word);
}

/**
 * Kiểm tra căn cứ: câu hỏi có bám tài liệu không (dựa trên trùng từ khóa).
 * Trả về null nếu không thể kết luận (không có văn bản tài liệu).
 */
function groundingIssue(content: string, documentsText: string, label: string): QualityIssue | null {
  if (!documentsText.trim()) return null;
  const keywords = groundingKeywords(content);
  if (keywords.length === 0) return null;
  const lowerDocuments = documentsText.toLowerCase();
  const hits = keywords.filter((keyword) => lowerDocuments.includes(keyword)).length;
  const coverage = hits / keywords.length;
  if (coverage < 0.34) {
    return {
      severity: 'warning',
      questionLabel: label,
      message: `Chỉ khớp ${hits}/${keywords.length} từ khóa với tài liệu — có thể ngoài phạm vi tài liệu, hãy xem xét.`,
    };
  }
  return null;
}

/** Kiểm tra toàn bộ đề nháp, trả về danh sách vấn đề (rỗng = đạt). */
export function checkDraft(draft: AiExamDraft | null | undefined, context: DraftCheckContext = {}): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (!draft) return issues;
  const documentsText = context.documentsText || '';
  const strictGrounding = context.strictGrounding === true;

  // Gom nội dung mọi câu để phát hiện trùng lặp.
  const seenContents = new Map<string, string>();

  const markDuplicate = (content: string, label: string) => {
    if (!content) return;
    const key = content.toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
    const firstLabel = seenContents.get(key);
    if (firstLabel) {
      issues.push({
        severity: 'error',
        questionLabel: label,
        message: `Trùng nội dung với ${firstLabel}.`,
      });
    } else {
      seenContents.set(key, label);
    }
  };

  // ---- Trắc nghiệm 1 đáp án ----
  const mcq = Array.isArray(draft.mcq) ? draft.mcq : [];
  mcq.forEach((item: AiMcqDraft, index) => {
    const label = `Câu trắc nghiệm ${index + 1}`;
    const content = questionText(item);
    if (!content && !asText((item as { options?: unknown })?.options)) {
      issues.push({ severity: 'error', questionLabel: label, message: 'Câu hỏi rỗng.' });
      return;
    }
    markDuplicate(content, label);
    const options = Array.isArray(item.options) ? item.options.map((option) => asText(option)) : [];
    if (options.filter(Boolean).length < 2) {
      issues.push({ severity: 'error', questionLabel: label, message: 'Có ít hơn 2 phương án hợp lệ.' });
    }
    const correct = Number(item.correctIndex);
    if (!Number.isInteger(correct) || correct < 0 || correct >= Math.max(4, options.length)) {
      issues.push({ severity: 'error', questionLabel: label, message: 'Đáp án đúng không hợp lệ.' });
    }
    if (!asText(item.explanation)) {
      issues.push({ severity: 'warning', questionLabel: label, message: 'Chưa có lời giải.' });
    }
    const grounding = groundingIssue(content, documentsText, label);
    if (grounding) issues.push(grounding);
    if (strictGrounding && !item.sourcePages) {
      issues.push({
        severity: 'warning',
        questionLabel: label,
        message: 'Không ghi trang tài liệu tham chiếu (sourcePages) — cần kiểm tra căn cứ.',
      });
    }
  });

  // ---- Trắc nghiệm nhiều đáp án ----
  const multi = Array.isArray(draft.multiMcq) ? draft.multiMcq : [];
  multi.forEach((item: AiMultiMcqDraft, index) => {
    const label = `Câu TN nhiều đáp án ${index + 1}`;
    const content = questionText(item);
    if (!content) {
      issues.push({ severity: 'error', questionLabel: label, message: 'Câu hỏi rỗng.' });
      return;
    }
    markDuplicate(content, label);
    const options = Array.isArray(item.options) ? item.options.map((option) => asText(option)) : [];
    if (options.filter(Boolean).length < 2) {
      issues.push({ severity: 'error', questionLabel: label, message: 'Có ít hơn 2 phương án hợp lệ.' });
    }
    const correct = Array.isArray(item.correctIndexes)
      ? item.correctIndexes.map((value) => Number(value)).filter((value) => Number.isInteger(value))
      : [];
    if (correct.length === 0) {
      issues.push({ severity: 'error', questionLabel: label, message: 'Chưa chọn đáp án đúng nào.' });
    } else if (correct.length === 4) {
      issues.push({ severity: 'warning', questionLabel: label, message: 'Chọn cả 4 phương án — câu hỏi dễ mất ý nghĩa.' });
    }
    if (!asText(item.explanation)) {
      issues.push({ severity: 'warning', questionLabel: label, message: 'Chưa có lời giải.' });
    }
    const grounding = groundingIssue(content, documentsText, label);
    if (grounding) issues.push(grounding);
  });

  // ---- Đúng/Sai ----
  const trueFalse = Array.isArray(draft.trueFalse) ? draft.trueFalse : [];
  trueFalse.forEach((item: AiTrueFalseDraft, index) => {
    const label = `Câu Đúng/Sai ${index + 1}`;
    markDuplicate(questionText(item), label);
    const statements = Array.isArray(item.statements) ? item.statements : [];
    if (statements.length < 2) {
      issues.push({ severity: 'error', questionLabel: label, message: 'Cần ít nhất 2 ý nhận định.' });
    }
    statements.forEach((statement, statementIndex) => {
      if (!asText(statement?.text)) {
        issues.push({
          severity: 'error',
          questionLabel: label,
          message: `Ý ${String.fromCharCode(97 + statementIndex)} còn trống.`,
        });
      }
      if (typeof statement?.answer !== 'boolean' && statement?.answer !== 'true' && statement?.answer !== 'false') {
        issues.push({
          severity: 'error',
          questionLabel: label,
          message: `Ý ${String.fromCharCode(97 + statementIndex)} chưa có đáp án Đúng/Sai.`,
        });
      }
    });
    const statementKeys = statements.map((statement) => asText(statement?.text).toLowerCase().slice(0, 80));
    if (new Set(statementKeys.filter(Boolean)).size !== statementKeys.filter(Boolean).length) {
      issues.push({ severity: 'warning', questionLabel: label, message: 'Có các ý nhận định trùng nhau.' });
    }
    const grounding = groundingIssue(questionText(item), documentsText, label);
    if (grounding) issues.push(grounding);
  });

  // ---- Điền khuyết ----
  const fills = Array.isArray(draft.fillBlanks) ? draft.fillBlanks : [];
  fills.forEach((item: AiFillBlankDraft, index) => {
    const label = `Câu điền khuyết ${index + 1}`;
    const content = questionText(item);
    if (!content) {
      issues.push({ severity: 'error', questionLabel: label, message: 'Câu hỏi rỗng.' });
      return;
    }
    markDuplicate(content, label);
    const blanks = (content.match(/_{2,}/g) || []).length;
    const answers = Array.isArray(item.blanks) ? item.blanks.filter((blank) => asText(blank?.answer)) : [];
    if (blanks === 0) {
      issues.push({ severity: 'error', questionLabel: label, message: 'Nội dung không có chỗ trống "___".' });
    } else if (answers.length !== blanks) {
      issues.push({
        severity: 'error',
        questionLabel: label,
        message: `Có ${blanks} chỗ trống nhưng chỉ có ${answers.length} đáp án.`,
      });
    }
    const grounding = groundingIssue(content, documentsText, label);
    if (grounding) issues.push(grounding);
  });

  // ---- Tính toán ----
  const calcs = Array.isArray(draft.calculations) ? draft.calculations : [];
  calcs.forEach((item: AiCalculationDraft, index) => {
    const label = `Câu tính toán ${index + 1}`;
    const content = questionText(item);
    if (!content) {
      issues.push({ severity: 'error', questionLabel: label, message: 'Câu hỏi rỗng.' });
      return;
    }
    markDuplicate(content, label);
    const answer = asText(item.answer).replace(',', '.');
    if (!answer) {
      issues.push({ severity: 'error', questionLabel: label, message: 'Chưa có đáp án số.' });
    } else if (!/^-?\d+(\.\d+)?$/.test(answer)) {
      issues.push({ severity: 'warning', questionLabel: label, message: 'Đáp án không phải số thuần — hệ thống chấm theo so khớp chữ.' });
    }
    if (!asText(item.explanation)) {
      issues.push({ severity: 'warning', questionLabel: label, message: 'Chưa có lời giải.' });
    }

    // Kiểm chứng độc lập bằng bộ tính biểu thức (không tin lời giải AI).
    const computation = (item as { computation?: { expression?: unknown; expected?: unknown } }).computation;
    const expression = asText(computation?.expression);
    if (expression) {
      const evaluated = evaluateExpression(expression);
      if (evaluated === null) {
        issues.push({
          severity: 'error',
          questionLabel: label,
          message: `Biểu thức kiểm chứng không hợp lệ ("${expression.slice(0, 60)}") — hãy sửa đáp án hoặc biểu thức.`,
        });
      } else {
        const expected = Number(computation?.expected);
        const declared = Number(answer);
        const expectedMatches = Number.isFinite(expected) ? numbersClose(evaluated, expected) : true;
        const answerMatchesComputed = Number.isFinite(declared) ? numbersClose(evaluated, declared) : false;
        if (!expectedMatches || !answerMatchesComputed) {
          issues.push({
            severity: 'error',
            questionLabel: label,
            message: `Kiểm chứng bằng tính toán: biểu thức cho ra ${evaluated} nhưng đáp án khai báo là ${Number.isFinite(declared) ? declared : answer}${Number.isFinite(expected) && !expectedMatches ? ` (expected=${expected})` : ''} — đáp án SAI, cần sửa.`,
          });
        }
      }
    } else if (Number.isFinite(Number(answer)) && /^[-+*/^().\d\s]+$/.test(content)) {
      // Không có computation — thử tự tìm biểu thức trong đề bài thuần số học.
      const embedded = evaluateExpression(content);
      if (embedded !== null && Number.isFinite(Number(answer)) && !numbersClose(embedded, Number(answer))) {
        issues.push({
          severity: 'error',
          questionLabel: label,
          message: `Tự tính đề bài cho ra ${embedded} nhưng đáp án là ${Number(answer)} — đáp án SAI, cần sửa.`,
        });
      }
    }
    const grounding = groundingIssue(content, documentsText, label);
    if (grounding) issues.push(grounding);
  });

  // ---- Trả lời ngắn ----
  const shorts = Array.isArray(draft.shortAnswers) ? draft.shortAnswers : [];
  shorts.forEach((item, index) => {
    const label = `Câu trả lời ngắn ${index + 1}`;
    const content = questionText(item);
    if (!content) {
      issues.push({ severity: 'error', questionLabel: label, message: 'Câu hỏi rỗng.' });
      return;
    }
    markDuplicate(content, label);
    if (!asText(item.answer)) {
      issues.push({ severity: 'error', questionLabel: label, message: 'Chưa có đáp án đúng.' });
    }
    const grounding = groundingIssue(content, documentsText, label);
    if (grounding) issues.push(grounding);
  });

  // ---- Tự luận ----
  const essays = Array.isArray(draft.essays) ? draft.essays : [];
  essays.forEach((item, index) => {
    const label = `Câu tự luận ${index + 1}`;
    const content = questionText(item);
    const subParts = Array.isArray(item.subParts) ? item.subParts : [];
    if (!content && subParts.length === 0) {
      issues.push({ severity: 'error', questionLabel: label, message: 'Câu hỏi rỗng.' });
      return;
    }
    markDuplicate(content || questionText(subParts[0], ''), label);
    subParts.forEach((part, partIndex) => {
      if (!asText(part?.content)) {
        issues.push({
          severity: 'error',
          questionLabel: label,
          message: `Ý ${part?.label ?? String.fromCharCode(97 + partIndex)} còn trống.`,
        });
      }
    });
    const grounding = groundingIssue(content || questionText(subParts[0], ''), documentsText, label);
    if (grounding) issues.push(grounding);
  });

  // ---- Tổng điểm ----
  const declaredPoints = [
    ...mcq.map((item) => Number((item as { points?: unknown }).points)).filter((value) => Number.isFinite(value) && value > 0),
    ...multi.map((item) => Number(item.points)).filter((value) => Number.isFinite(value) && value > 0),
    ...trueFalse.map((item) => Number(item.points)).filter((value) => Number.isFinite(value) && value > 0),
    ...fills.map((item) => Number(item.points)).filter((value) => Number.isFinite(value) && value > 0),
    ...calcs.map((item) => Number(item.points)).filter((value) => Number.isFinite(value) && value > 0),
    ...shorts.map((item) => Number(item.points)).filter((value) => Number.isFinite(value) && value > 0),
    ...essays.map((item) => Number(item.points)).filter((value) => Number.isFinite(value) && value > 0),
  ];
  const totalPoints = Number(draft.totalPoints);
  if (Number.isFinite(totalPoints) && declaredPoints.length > 0) {
    const declaredSum = declaredPoints.reduce((sum, value) => sum + value, 0);
    // Trắc nghiệm 1 đáp án thường không khai points — tính 0.25đ/câu theo quy ước.
    const estimated = declaredSum + mcq.filter((item) => !Number.isFinite(Number((item as { points?: unknown }).points))).length * 0.25;
    if (Math.abs(estimated - totalPoints) > 0.5) {
      issues.push({
        severity: 'warning',
        questionLabel: 'Toàn đề',
        message: `Tổng điểm các câu khai báo ≈ ${Math.round(estimated * 100) / 100} khác thang điểm ${totalPoints} — hãy rà lại điểm từng phần.`,
      });
    }
  }

  return issues;
}

/**
 * Đánh dấu các câu có LỖI (severity error) là cần giáo viên xem xét
 * (cờ needsReview lưu cùng câu hỏi, hiển thị badge trong form soạn đề).
 * Trả về số câu được đánh dấu.
 */
export function markNeedsReview(draft: AiExamDraft, issues: QualityIssue[]): number {
  const errorLabels = new Set(
    issues.filter((issue) => issue.severity === 'error').map((issue) => issue.questionLabel),
  );
  if (errorLabels.size === 0) return 0;
  let marked = 0;
  const markList = (items: Array<Record<string, unknown>> | undefined, prefix: string) => {
    (items || []).forEach((item, index) => {
      const label = `${prefix} ${index + 1}`;
      if (errorLabels.has(label) && item && typeof item === 'object') {
        item.needsReview = true;
        marked += 1;
      }
    });
  };
  markList(draft.mcq as Array<Record<string, unknown>> | undefined, 'Câu trắc nghiệm');
  markList(draft.multiMcq as Array<Record<string, unknown>> | undefined, 'Câu TN nhiều đáp án');
  markList(draft.trueFalse as Array<Record<string, unknown>> | undefined, 'Câu Đúng/Sai');
  markList(draft.fillBlanks as Array<Record<string, unknown>> | undefined, 'Câu điền khuyết');
  markList(draft.calculations as Array<Record<string, unknown>> | undefined, 'Câu tính toán');
  markList(draft.shortAnswers as Array<Record<string, unknown>> | undefined, 'Câu trả lời ngắn');
  markList(draft.essays as Array<Record<string, unknown>> | undefined, 'Câu tự luận');
  return marked;
}

/** Gom vấn đề thành 1 dòng ngắn để hiển thị toast/báo cáo. */
export function summarizeIssues(issues: QualityIssue[]): string {
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.length - errors;
  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} lỗi cần sửa`);
  if (warnings > 0) parts.push(`${warnings} cảnh báo`);
  return parts.join(' · ');
}
