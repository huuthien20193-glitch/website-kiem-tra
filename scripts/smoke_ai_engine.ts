/**
 * Bộ kiểm thử Smoke cho AI Exam Engine — chạy bằng lệnh:
 *   npx tsx scripts/smoke_ai_engine.ts
 *
 * Dùng dữ liệu mô phỏng tài liệu thật (đủ marker trang, định nghĩa, công thức,
 * bảng, trang lỗi, tài liệu rỗng). KHÔNG gọi mạng, KHÔNG cần API key — chỉ
 * kiểm tra phần logic chạy cục bộ của các Engine:
 *   1. Knowledge Engine  (phân đoạn kiến thức, kho truy xuất, lỗi nghiêm trọng)
 *   2. Bộ kiểm chứng biểu thức của QC Engine
 *   3. QC Engine         (7 phép kiểm tra chất lượng đề nháp)
 *   4. markNeedsReview   (đánh dấu câu rớt QC)
 *   5. Figure Engine     (SVG bar/graph, lọc SVG độc hại)
 *   6. Chấm tự động      (answerMatches, gradeExtraQuestion)
 *
 * Đầu ra: tỉ lệ pass/total từng nhóm — chỉ báo cáo con số đo được,
 * KHÔNG tuyên bố 100% nếu không đạt. Mã thoát khác 0 khi có test rớt.
 */

import {
  deriveKnowledgeSegments,
  selectKnowledge,
  knowledgeStats,
  criticalProblems,
} from '../lib/knowledge';
import { checkDraft, evaluateExpression, markNeedsReview, type QualityIssue } from '../lib/quality';
import { figureDataUrlFromAi, renderFigureSvg, sanitizeSvg } from '../lib/figure';
import { answerMatches } from '../lib/utils';
import { gradeExtraQuestion } from '../lib/storage';
import type { ExtraQuestion } from '../lib/types';
import type { AiExamDraft } from '../lib/ai';

/* ------------------------------ Bộ đếm chung ------------------------------ */

type GroupReport = { name: string; pass: number; fail: number; failures: string[] };
const groups: GroupReport[] = [];

function runGroup(name: string, cases: Array<[string, boolean]>) {
  const report: GroupReport = { name, pass: 0, fail: 0, failures: [] };
  for (const [label, ok] of cases) {
    if (ok) report.pass += 1;
    else {
      report.fail += 1;
      report.failures.push(label);
    }
  }
  groups.push(report);
}

/* ------------------------------ Dữ liệu mô phỏng ------------------------------ */

/** Tài liệu mô phỏng chương "Căn thức bậc hai" — Toán 9, có đủ marker trang,
 *  định nghĩa, công thức, ví dụ, bảng, một trang lỗi OCR và một trang sai phạm. */
const DOC_TOAN = [
  '===== TRANG 1 =====',
  'CHƯƠNG 1: CĂN THỨC BẬC HAI',
  '1.1. Định nghĩa: Căn bậc hai của số a không âm là số x sao cho x² = a. Ký hiệu √a.',
  'Ví dụ: √144 = 12; √(49/4) = 7/2.',
  '1.2. Tính chất của căn bậc hai: √(a·b) = √a · √b với a, b không âm.',
  '√(a/b) = √a / √b với a ≥ 0 và b > 0.',
  'Quy tắc: √(a²) = |a| với mọi số thực a.',
  '===== TRANG 2 =====',
  '1.3. Hằng đẳng thức chứa căn: (√a + √b)² = a + b + 2√(ab), với a, b ≥ 0.',
  'Ví dụ: Rút gọn (2√3 + √5)² = 12 + 5 + 4√15 = 17 + 4√15.',
  '1.4. Hệ thức Vi-et: Nếu phương trình bậc hai ax² + bx + c = 0 (a ≠ 0) có hai nghiệm x₁, x₂ thì',
  'x₁ + x₂ = -b/a và x₁ · x₂ = c/a.',
  'Bảng minh họa: x₁ | x₂ | x₁+x₂ | x₁·x₂',
  '2 | 3 | 5 | 6',
  '===== TRANG 3 =====',
  '[HÌNH ẢNH: đồ thị parabol y = x² cắt trục hoành tại hai điểm]',
  '[KHÔNG ĐỌC ĐƯỢC: phần công thức mờ ở nửa dưới trang]',
  '===== TRANG 4 =====',
  '2.1. Điều kiện xác định của biểu thức chứa căn bậc hai: biểu thức dưới dấu căn phải không âm.',
  'Quy tắc giải phương trình chứa căn: đặt điều kiện, bình phương hai vế, kết luận nghiệm.',
].join('\n');

const DOC_RONG = { title: 'Tài liệu scan lỗi (trống)', content: '' };

/** Đề nháp ĐẠT QC — tổng điểm 9.5, mọi câu có đủ dữ kiện, bám tài liệu. */
const DRAFT_DAT: AiExamDraft = {
  title: 'Đề kiểm tra căn thức bậc hai',
  subject: 'Toán học',
  grade: 9,
  durationMinutes: 45,
  totalPoints: 9.5,
  mcq: [
    { content: 'Căn bậc hai của số 144 là bao nhiêu?', options: ['10', '11', '12', '14'], correctIndex: 2, explanation: 'Vì 12² = 144 nên √144 = 12.', sourcePages: [1] },
    { content: 'Biểu thức √(a·b) bằng biểu thức nào (a, b không âm)?', options: ['√a · √b', '√a + √b', 'a·b', 'a + b'], correctIndex: 0, explanation: 'Tính chất nhân của căn bậc hai.', sourcePages: [1] },
    { content: '√(a²) bằng nào với mọi số thực a?', options: ['a', '|a|', 'a²', '-a'], correctIndex: 1, explanation: 'Quy tắc dấu của căn bậc hai.', sourcePages: [1] },
    { content: 'Nếu x₁ = 2 và x₂ = 3 là nghiệm thì tổng x₁+x₂ và tích x₁·x₂ là?', options: ['5 và 6', '6 và 5', '5 và 5', '6 và 6'], correctIndex: 0, explanation: 'Tổng 2+3=5, tích 2·3=6.', sourcePages: [2] },
  ],
  multiMcq: [
    { content: 'Chọn các giá trị ĐÚNG theo hệ thức Vi-et với nghiệm 2 và 3:', options: ['x₁+x₂ = 5', 'x₁·x₂ = 6', 'x₁+x₂ = 6', 'x₁·x₂ = 5'], correctIndexes: [0, 1], points: 0.5, explanation: 'Vi-et: tổng = 5, tích = 6.', sourcePages: [2] },
    { content: 'Chọn các phát biểu ĐÚNG về căn bậc hai (a, b ≥ 0):', options: ['√(a·b) = √a·√b', '(√a+√b)² = a+b+2√(ab)', '√a = a', '√(a+b) = √a+√b'], correctIndexes: [0, 1], points: 0.5, explanation: 'Hai tính chất đúng được ghi trong tài liệu.', sourcePages: [1, 2] },
  ],
  trueFalse: [
    {
      content: 'Xét tính đúng sai của các ý về căn bậc hai:',
      statements: [
        { text: '√144 = 12', answer: true },
        { text: '√(49/4) = 7/2', answer: true },
        { text: '√9 = -3', answer: false },
        { text: '√(a·b) = √a + √b', answer: false },
      ],
      points: 1,
      explanation: 'Căn bậc hai số dương duy nhất; tính chất nhân đúng.',
      sourcePages: [1],
    },
    {
      content: 'Xét các ý về điều kiện xác định:',
      statements: [
        { text: 'Biểu thức dưới dấu căn bậc hai phải không âm', answer: true },
        { text: '√a xác định với mọi a', answer: false },
        { text: 'Mẫu số trong √(a/b) phải khác 0', answer: true },
        { text: 'b > 0 trong √(a/b)', answer: true },
      ],
      points: 1,
      explanation: 'Điều kiện xác định theo tài liệu.',
      sourcePages: [4],
    },
  ],
  fillBlanks: [
    { content: 'Theo Vi-et: x₁+x₂ = ___ và x₁·x₂ = ___ khi phương trình ax²+bx+c=0 có nghiệm.', blanks: [{ answer: '-b/a' }, { answer: 'c/a' }], points: 0.5, explanation: 'Hệ thức Vi-et.', sourcePages: [2] },
  ],
  calculations: [
    { content: 'Tính giá trị biểu thức (2+3)*4', answer: '20', computation: { expression: '(2+3)*4', expected: 20 }, points: 0.5, explanation: 'Trong ngoặc trước, rồi nhân.', sourcePages: [2] },
    { content: 'Tính 10/4 viết dạng số thập phân', answer: '2.5', computation: { expression: '10/4', expected: 2.5 }, points: 0.5, explanation: 'Chia trực tiếp.', sourcePages: [2] },
  ],
  shortAnswers: [
    { content: 'Nghiệm của phương trình x² - 5x + 6 = 0 là x₁ và x₂ — viết tổng hai nghiệm', answer: '5 | năm', points: 1, explanation: 'Vi-et hoặc giải trực tiếp.', sourcePages: [2] },
  ],
  essays: [
    {
      content: 'Cho phương trình x² - 5x + 6 = 0. Hãy giải phương trình bằng hệ thức Vi-et.',
      subParts: [
        { label: 'a', content: 'Kiểm tra hai số 2 và 3 thỏa mãn tổng x₁+x₂ = -b/a và tích x₁·x₂ = c/a', points: 1.5 },
        { label: 'b', content: 'Kết luận nghiệm của phương trình theo hệ thức Vi-et', points: 1.5 },
      ],
      rubric: 'a) mỗi hệ 0.75đ; b) kết luận đúng 1.5đ.',
      points: 3,
      sourcePages: [2],
    },
  ],
};

/** Đề nháp LỖI — cài cắm đủ 7 loại vấn đề để kiểm QC bắt từng phép. */
const DRAFT_LOI: AiExamDraft = {
  ...DRAFT_DAT,
  totalPoints: 15, // lệch lớn so với điểm khai báo từng câu → cảnh báo tổng điểm
  mcq: [
    ...DRAFT_DAT.mcq ?? [],
    { content: 'Căn bậc hai của số 144 là bao nhiêu?', options: ['10', '11', '12', '14'], correctIndex: 2, explanation: 'trùng câu 1' }, // trùng lặp
    { content: 'Câu chỉ có một phương án', options: ['A'], correctIndex: 0, explanation: '' }, // <2 phương án + thiếu lời giải
    { content: '', options: [], correctIndex: 5, explanation: '' }, // câu rỗng (bị chặn sớm)
    { content: 'Câu có đáp án đúng vượt phạm vi phương án', options: ['A', 'B', 'C', 'D'], correctIndex: 5, explanation: 'đáp án ngoài 0..3' }, // đáp án không hợp lệ
  ],
  fillBlanks: [
    { content: 'Điền hệ thức Vi-et không có chỗ trống nào', blanks: [{ answer: 'x' }], points: 0.5, explanation: '' }, // không có ___
    { content: 'Điền ___ và ___ theo Vi-et', blanks: [{ answer: '-b/a' }], points: 0.5, explanation: '' }, // 2 chỗ trống, 1 đáp án
  ],
  calculations: [
    { content: 'Tính (2+3)*4', answer: '25', computation: { expression: '(2+3)*4', expected: 25 }, points: 0.5, explanation: 'sai cố ý' }, // đáp án SAI
    { content: 'Tính sqrt(2)+1', answer: '2.414', computation: { expression: 'sqrt(2)+1', expected: 2.414 }, points: 0.5, explanation: '' }, // biểu thức không hợp lệ
  ],
  trueFalse: [
    {
      content: 'Xét các ý thiếu đáp án:',
      statements: [{ text: 'Ý a đúng', answer: true }, { text: '', answer: undefined as unknown as boolean }],
      points: 1,
      explanation: '',
      sourcePages: [1],
    },
  ],
  multiMcq: [
    { content: 'Câu nhiều đáp án không chọn đáp án nào:', options: ['A', 'B', 'C', 'D'], correctIndexes: [], points: 0.5, explanation: '' },
  ],
  shortAnswers: [
    { content: 'Câu trả lời ngắn không có đáp án', answer: '', points: 1, explanation: '' },
    { content: 'Nội dung hoàn toàn ngoài phạm vi tài liệu: công thức hóa học phân tử đường sucrose C12H22O11 phản ứng tráng gương銀?', answer: 'x', points: 1, explanation: '' }, // grounding thấp
  ],
  essays: [
    {
      content: 'Câu tự luận có ý con trống:',
      subParts: [
        { label: 'a', content: 'Giải theo hệ thức Vi-et', points: 1 },
        { label: 'b', content: '', points: 1 },
      ],
      points: 2,
    },
  ],
};

/* ------------------------------ 1. Knowledge Engine ------------------------------ */

const { segments, problems } = deriveKnowledgeSegments([
  { title: 'SGK Toán 9 — Chương 1', content: DOC_TOAN },
  DOC_RONG,
]);
const stats = knowledgeStats(segments);
const viEt = selectKnowledge(segments, 'hệ thức Vi-et', 1200, 0);
const critical = criticalProblems(problems);

runGroup('Knowledge Engine (phân đoạn + truy xuất)', [
  ['Tài liệu có nội dung → tạo được đoạn kiến thức', segments.length >= 1],
  ['ID đoạn đúng định dạng KN-T…', segments.length === 0 || /^KN-T\d+-P\d+/.test(segments[0].id)],
  ['Đoạn có trang nguồn hợp lệ (start ≤ end)', segments.every((s) => s.startPage >= 1 && s.endPage >= s.startPage)],
  ['Đoạn có trạng thái + độ tin cậy', segments.every((s) => typeof s.confidence === 'number' && s.confidence >= 0 && s.confidence <= 1)],
  ['Thống kê kho có số liệu thật', stats.segmentCount === segments.length && stats.words > 0],
  ['Truy xuất theo chủ đề Vi-et ra kết quả', viEt.length >= 1],
  ['Kết quả truy xuất chứa đúng kiến thức Vi-et', viEt.some((s) => s.content.includes('Vi-et'))],
  ['Tài liệu rỗng → đúng 1 lỗi nghiêm trọng', critical.length === 1],
  ['Lỗi nghiêm trọng ghi rõ tên tài liệu', critical.length === 0 || critical[0].documentTitle.includes('Tài liệu scan lỗi')],
]);

/* ------------------------------ 2. Bộ kiểm chứng biểu thức ------------------------------ */

const evalCases: Array<[string, number | null]> = [  ['2+3*4', 14],
  ['(2+3)*4', 20],
  ['2^3', 8],
  ['-3+5', 2],
  ['10/4', 2.5],
  ['(1+2)^2', 9],
  ['2*(3+4)/(5-1)', 3.5],
  ['2,5*4', 10],
  ['√2', null], // ký hiệu không hợp lệ → chặn
  ['sqrt(4)', null], // hàm chữ → chặn
  ['1/0', null], // chia 0 → không xác định
  ['1+2)', null], // thiếu ngoặc mở
  ['(1+2', null], // thiếu ngoặc đóng
  ['abc', null], // chữ → chặn
  ['', null], // rỗng
  ['9^0.5', 3], // lũy thừa số thập phân
];

runGroup(
  'Bộ kiểm chứng biểu thức (QC dùng kiểm chứng đáp án)',
  evalCases.map(([expr, expected], index) => {
    const got = evaluateExpression(expr);
    const ok = got === expected || (got !== null && expected !== null && Math.abs(got - expected) < 1e-9);
    return [`case ${index + 1} (${expr || '(rỗng)'} → ${expected ?? 'null'})`, ok] as [string, boolean];
  }),
);

/* ------------------------------ 3. QC Engine — 7 phép kiểm ------------------------------ */

const issuesDat = checkDraft(DRAFT_DAT, { documentsText: DOC_TOAN, strictGrounding: true });
const errorsDat = issuesDat.filter((issue) => issue.severity === 'error');
const issuesLoi = checkDraft(DRAFT_LOI, { documentsText: DOC_TOAN, strictGrounding: true });

const hasIssue = (issues: QualityIssue[], labelPrefix: string, fragment: string) =>
  issues.some((issue) => issue.questionLabel.startsWith(labelPrefix) && issue.message.includes(fragment));

runGroup('QC Engine (7 phép kiểm tra đề nháp)', [
  ['Đề đạt → KHÔNG có lỗi', errorsDat.length === 0],
  ['Đề đạt → câu ngoài phạm vi chỉ bị cảnh báo (không chặn)', issuesDat.every((issue) => issue.severity === 'warning' || !issue.message.includes('từ khóa'))],
  ['Phép 1 — câu rỗng', hasIssue(issuesLoi, 'Câu trắc nghiệm', 'Câu hỏi rỗng')],
  ['Phép 2 — trùng lặp', hasIssue(issuesLoi, 'Câu trắc nghiệm', 'Trùng nội dung')],
  ['Phép 3 — thiếu phương án hợp lệ', hasIssue(issuesLoi, 'Câu trắc nghiệm', 'ít hơn 2 phương án')],
  ['Phép 4 — đáp án đúng không hợp lệ', hasIssue(issuesLoi, 'Câu trắc nghiệm', 'Đáp án đúng không hợp lệ')],
  ['Phép 5a — câu tính toán SAI đáp án (kiểm chứng bằng code)', hasIssue(issuesLoi, 'Câu tính toán', 'Kiểm chứng bằng tính toán')],
  ['Phép 5b — biểu thức kiểm chứng không hợp lệ', hasIssue(issuesLoi, 'Câu tính toán', 'Biểu thức kiểm chứng không hợp lệ')],
  ['Phép 5c — điền khuyết thiếu chỗ trống ___', hasIssue(issuesLoi, 'Câu điền khuyết', 'không có chỗ trống')],
  ['Phép 5d — điền khuyết lệch số đáp án', hasIssue(issuesLoi, 'Câu điền khuyết', 'chỗ trống nhưng chỉ có')],
  ['Phép 6a — đúng/sai thiếu đáp án ý', hasIssue(issuesLoi, 'Câu Đúng/Sai', 'chưa có đáp án Đúng/Sai')],
  ['Phép 6b — TN nhiều đáp án chưa chọn đúng', hasIssue(issuesLoi, 'Câu TN nhiều đáp án', 'Chưa chọn đáp án đúng nào')],
  ['Phép 6c — trả lời ngắn thiếu đáp án', hasIssue(issuesLoi, 'Câu trả lời ngắn', 'Chưa có đáp án đúng')],
  ['Phép 6d — tự luận ý trống', hasIssue(issuesLoi, 'Câu tự luận', 'còn trống')],
  ['Phép 7a — vượt phạm vi tài liệu (căn cứ thấp)', hasIssue(issuesLoi, 'Câu trả lời ngắn', 'từ khóa')],
  ['Phép 7b — thiếu sourcePages ở chế độ chỉ dùng tài liệu', issuesLoi.some((issue) => issue.message.includes('sourcePages'))],
  ['Phép 7c — tổng điểm lệch thang điểm', issuesLoi.some((issue) => issue.questionLabel === 'Toàn đề' && issue.message.includes('thang điểm'))],
]);

/* ------------------------------ 4. markNeedsReview ------------------------------ */

const draftForReview = JSON.parse(JSON.stringify(DRAFT_LOI)) as AiExamDraft;
const marked = markNeedsReview(draftForReview, issuesLoi);
const calcWrong = (draftForReview.calculations ?? [])[0] as { needsReview?: boolean } | undefined;
const mcqEmpty = (draftForReview.mcq ?? [])[6] as { needsReview?: boolean } | undefined;

runGroup('markNeedsReview (câu rớt QC cần GV xem xét)', [
  ['Đánh dấu được ít nhất 4 câu lỗi', marked >= 4],
  ['Câu tính toán sai đáp án có needsReview', calcWrong?.needsReview === true],
  ['Câu trắc nghiệm rỗng có needsReview', mcqEmpty?.needsReview === true],
  ['markNeedsReview: Đề đạt không bị đánh dấu', markNeedsReview(DRAFT_DAT, issuesDat) === 0],
]);

/* ------------------------------ 5. Figure Engine ------------------------------ */

const barSvg = renderFigureSvg({ kind: 'bar', title: 'Chiều cao', labels: ['A', 'B', 'C'], values: [152, 160, 158], unit: 'cm' });
const graphSvg = renderFigureSvg({ kind: 'graph', expression: 'x^2-2*x', xMin: -1, xMax: 3 });
const asymptoteSvg = renderFigureSvg({ kind: 'graph', expression: '1/(x-1)', xMin: 0, xMax: 2 });
const badSvg = renderFigureSvg({ kind: 'graph', expression: 'import fs', xMin: 0, xMax: 1 });
const evilSvg = sanitizeSvg('<svg width="100" height="50"><script>alert(1)</script><rect onload="x()" width="100" height="50"/><a href="javascript:bad()"><text>hi</text></a></svg>');
const figureFromSpec = figureDataUrlFromAi({ figure: { kind: 'bar', labels: ['A', 'B'], values: [1, 2] } });

runGroup('Figure Engine (SVG minh họa, lọc an toàn)', [
  ['Biểu đồ cột sinh SVG đủ 3 cột', Boolean(barSvg && (barSvg.match(/<rect x=/g) || []).length === 3 && barSvg.includes('viewBox'))],
  ['Đồ thị hàm x²−2x sinh polyline', Boolean(graphSvg && graphSvg.includes('<polyline'))],
  ['Tiệm cận 1/(x−1) đứt đoạn (≥2 đoạn)', Boolean(asymptoteSvg && (asymptoteSvg.match(/<polyline/g) || []).length >= 2)],
  ['Biểu thức không hợp lệ → từ chối vẽ', badSvg === null],
  ['SVG độc hại bị làm sạch script/onload/javascript:', Boolean(evilSvg && !evilSvg.includes('<script') && !evilSvg.includes('onload') && !evilSvg.includes('javascript:'))],
  ['Đặc tả figure → data URL SVG', Boolean(figureFromSpec?.startsWith('data:image/svg+xml;charset=utf-8,'))],
  ['SVG thô của AI → data URL sau lọc', Boolean(figureDataUrlFromAi({ figure: '<svg width="10" height="10"><rect width="10" height="10"/></svg>' })?.startsWith('data:image/svg+xml'))],
]);

/* ------------------------------ 6. Chấm tự động ------------------------------ */

const multiQuestion: ExtraQuestion = {
  id: 'x1',
  kind: 'multi-mcq',
  questionLabel: 'Câu 1',
  points: 1,
  content: 'Chọn 2 đáp án đúng',
  options: ['A', 'B', 'C', 'D'],
  correctIndexes: [1, 2],
};
const trueFalseQuestion: ExtraQuestion = {
  id: 'x2',
  kind: 'true-false',
  questionLabel: 'Câu 2',
  points: 2,
  content: 'Đúng/Sai từng ý',
  statements: [
    { text: 'a', answer: true },
    { text: 'b', answer: false },
    { text: 'c', answer: true },
    { text: 'd', answer: false },
  ],
};

const multiRight = gradeExtraQuestion(multiQuestion, { choices: [2, 1], statements: [] });
const multiWrong = gradeExtraQuestion(multiQuestion, { choices: [0, 2], statements: [] });
const tfThreeQuarter = gradeExtraQuestion(trueFalseQuestion, { choices: [], statements: [true, false, true, true] });
const tfAllRight = gradeExtraQuestion(trueFalseQuestion, { choices: [], statements: [true, false, true, false] });

runGroup('Chấm tự động (đáp án ngắn + câu mở rộng)', [
  ['TN nhiều đáp án đúng đủ → đủ điểm', multiRight.score === 1 && multiRight.detail.correct === true],
  ['TN nhiều đáp án sai 1 phương án → 0 điểm', multiWrong.score === 0 && multiWrong.detail.correct === false],
  ['Đúng/Sai đúng 3/4 ý → điểm từng ý (1.5/2)', Math.abs(tfThreeQuarter.score - 1.5) < 0.01 && tfThreeQuarter.detail.correct === false],
  ['Đúng/Sai đúng cả 4 ý → đủ điểm', tfAllRight.score === 2 && tfAllRight.detail.correct === true],
  ['Đáp án số chấp nhận dấu phẩy (7,5 = 7.5)', answerMatches('7,5', '7.5')],
  ['Đáp án chấp nhận nhiều biến thể qua |', answerMatches('năm', '5 | năm')],
  ['Đáp án sai → không khớp', answerMatches('6', '5 | năm') === false],
  ['Đáp án bỏ qua khoảng trắng/hoa thường', answerMatches('  Căn bậc hai ', 'căn bậc hai')],
]);

/* ------------------------------ Báo cáo ------------------------------ */

let totalPass = 0;
let totalFail = 0;
console.log('='.repeat(72));
console.log('AI EXAM ENGINE — SMOKE TEST (dữ liệu mô phỏng, không cần API key)');
console.log('='.repeat(72));
for (const group of groups) {
  totalPass += group.pass;
  totalFail += group.fail;
  const ratio = `${group.pass}/${group.pass + group.fail}`;
  console.log(`\n[${group.name}] — đạt ${ratio}`);
  for (const failure of group.failures) console.log(`  ✗ RỚT: ${failure}`);
}
console.log('\n' + '-'.repeat(72));
console.log(`TỔNG: đạt ${totalPass}/${totalPass + totalFail} case (${Math.round((totalPass / (totalPass + totalFail)) * 100)}%)`);
console.log('- Số liệu trên đo trên phần logic CỤC BỘ (knowledge/QC/figure/chấm).');
console.log('- Độ chính xác CÂU HỎI của model Gemini cần đo bằng live test với API key');
console.log('  và tài liệu thật — chưa có số liệu, không tuyên bố tỉ lệ này.');
if (totalFail > 0) process.exit(1);
