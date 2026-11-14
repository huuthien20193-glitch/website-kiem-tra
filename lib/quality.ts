/**
 * Tự kiểm tra chất lượng đề nháp AI trước khi lưu vào đề chính thức.
 * Kiểm tra các lỗi thường gặp: câu trống, câu trùng, thiếu đáp án,
 * số lượng phương án/ý nhận định sai, chỗ trống không khớp đáp án,
 * đáp án tính toán không phải số...
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

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function questionText(item: unknown, fallback = ''): string {
  const text = asText((item as { content?: unknown })?.content);
  return text || fallback;
}

/** Kiểm tra toàn bộ đề nháp, trả về danh sách vấn đề (rỗng = đạt). */
export function checkDraft(draft: AiExamDraft | null | undefined): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (!draft) return issues;

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
  });

  return issues;
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
