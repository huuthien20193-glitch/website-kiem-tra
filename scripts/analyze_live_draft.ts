/**
 * Phân tích đề LIVE AI trả về — chạy:
 *   npx tsx scripts/analyze_live_draft.ts <file-draft.json> [file-payload.json]
 * Kiểm tra: đủ số câu, provenance (topic/level/sourcePages), QC checkDraft,
 * kiểm chứng độc lập đáp án tính toán, tổng điểm.
 */
import * as fs from 'fs';
import { checkDraft, evaluateExpression, summarizeIssues, type QualityIssue } from '../lib/quality';

const file = process.argv[2] ?? 'draft_live.json';
const payloadFile = process.argv[3] ?? '';
/** Đọc file JSON bỏ qua BOM mà PowerShell ghi vào đầu file. */
function readJson(path: string): unknown {
  const raw = fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}
const payload = readJson(file) as { draft: Record<string, unknown>; knowledge: unknown };
const draft = payload.draft;

// Văn bản tài liệu gốc (nếu có) để QC đối chiếu căn cứ.
const sourceDoc = payloadFile
  ? ((readJson(payloadFile) as { documents?: Array<{ content: string }> }).documents?.[0]?.content ?? '')
  : '';

const kinds: Array<[string, string]> = [
  ['mcq', 'Trắc nghiệm'],
  ['multiMcq', 'TN nhiều đáp án'],
  ['trueFalse', 'Đúng/Sai'],
  ['fillBlanks', 'Điền khuyết'],
  ['calculations', 'Tính toán'],
  ['shortAnswers', 'Trả lời ngắn'],
  ['essays', 'Tự luận'],
];

console.log('='.repeat(72));
console.log('PHÂN TÍCH ĐỀ LIVE AI (tài liệu: SGK Toán 9 — Căn thức bậc hai)');
console.log('='.repeat(72));
console.log(`title: ${draft.title} | subject: ${draft.subject} | grade: ${draft.grade} | totalPoints khai: ${draft.totalPoints}`);

let totalQuestions = 0;
let withTopic = 0;
let withLevel = 0;
let withPages = 0;
const allItems: Array<Record<string, unknown>> = [];

for (const [key, label] of kinds) {
  const items = Array.isArray(draft[key]) ? (draft[key] as Array<Record<string, unknown>>) : [];
  totalQuestions += items.length;
  allItems.push(...items);
  const topicCount = items.filter((item) => typeof item.topic === 'string' && item.topic).length;
  const levelCount = items.filter((item) => typeof item.level === 'string' && item.level).length;
  const pagesCount = items.filter(
    (item) => Array.isArray(item.sourcePages) && (item.sourcePages as number[]).length > 0,
  ).length;
  withTopic += topicCount;
  withLevel += levelCount;
  withPages += pagesCount;
  const pointsList = items.map((item) => (typeof item.points === 'number' ? item.points : item === items[0] && key === 'mcq' ? '(theo mcqPointPerQ)' : '—'));
  console.log(
    `  ${label.padEnd(16)} ${items.length} câu · topic ${topicCount}/${items.length} · level ${levelCount}/${items.length} · trang ${pagesCount}/${items.length} · points: ${pointsList.join(', ')}`,
  );
}

console.log(`\nTổng số câu: ${totalQuestions}`);
console.log(`Provenance: topic ${withTopic}/${totalQuestions} (${Math.round((withTopic / totalQuestions) * 100)}%) · level ${withLevel}/${totalQuestions} · sourcePages ${withPages}/${totalQuestions}`);

// ---- QC Engine trên đề thật ----
const issues: QualityIssue[] = checkDraft(draft as never, { documentsText: sourceDoc, strictGrounding: true });
console.log(`\nQC Engine: ${summarizeIssues(issues) || 'Sạch — không có vấn đề'}`);
issues.forEach((issue) => console.log(`  [${issue.severity}] ${issue.questionLabel}: ${issue.message}`));

// ---- Kiểm chứng độc lập đáp án tính toán ----
const calcs = Array.isArray(draft.calculations) ? (draft.calculations as Array<Record<string, unknown>>) : [];
let calcOk = 0;
calcs.forEach((item, index) => {
  const computation = item.computation as { expression?: string; expected?: number } | undefined;
  const answer = String(item.answer ?? '').replace(',', '.');
  if (computation?.expression) {
    const evaluated = evaluateExpression(computation.expression);
    const match = evaluated !== null && Math.abs(evaluated - Number(answer)) < 1e-6;
    if (match) calcOk += 1;
    console.log(`  [calc ${index + 1}] ${item.content} | answer=${answer} | hệ thống tự tính ${computation.expression} = ${evaluated} → ${match ? 'KHỚP ✓' : 'LỆCH ✗'}`);
  }
});
if (calcs.length > 0) console.log(`Đáp án tính toán: hệ thống tự kiểm chứng khớp ${calcOk}/${calcs.length}`);

// ---- In 2 câu mẫu để soát bằng mắt ----
const mcq = Array.isArray(draft.mcq) ? (draft.mcq as Array<Record<string, unknown>>) : [];
if (mcq[0]) console.log(`\nMẫu mcq 1: ${JSON.stringify(mcq[0], null, 2).slice(0, 700)}`);
const essays = Array.isArray(draft.essays) ? (draft.essays as Array<Record<string, unknown>>) : [];
if (essays[0]) console.log(`\nMẫu essay 1: ${JSON.stringify(essays[0], null, 2).slice(0, 700)}`);

// Kiểm tra hình minh họa (nếu AI thấy cần)
const figures = allItems.filter((item) => typeof item.figureSvg === 'string' && item.figureSvg);
console.log(`\nHình minh họa AI tự gắn: ${figures.length} câu`);
