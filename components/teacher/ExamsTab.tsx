'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Clock3,
  Copy,
  Download,
  GraduationCap,
  Layers,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { jsPDF } from 'jspdf';
import type { Exam, Grade } from '@/lib/types';
import { GRADES, gradeLabel, subjectStyle } from '@/lib/types';
import { cn, formatDate, formatNumber } from '@/lib/utils';
import { STORAGE_KEYS, slugify } from '@/lib/storage';
import { useToast } from '@/components/ui/FeedbackProvider';

/* ----------------------- Font tiếng Việt cho file PDF -----------------------
 * jsPDF mặc định chỉ có font Helvetica (không hỗ trợ tiếng Việt có dấu).
 * Ta nhúng font Be Vietnam Pro (đặt trong public/fonts) vào file PDF:
 *   1. Tải file .ttf từ thư mục public bằng fetch.
 *   2. Chuyển sang chuỗi base64.
 *   3. Đăng ký vào jsPDF bằng addFileToVFS + addFont.
 * Kết quả base64 được lưu trong biến `fontBase64Cache` để lần xuất sau
 * không phải tải lại từ đầu.
 * -------------------------------------------------------------------------- */
const VIETNAMESE_FONTS = [
  { file: 'BeVietnamPro-Regular.ttf', style: 'normal' as const },
  { file: 'BeVietnamPro-Bold.ttf', style: 'bold' as const },
];
const FONT_FAMILY = 'BeVietnamPro';
/** null = chưa nạp; true = đã nạp xong. */
let fontBase64Cache: Record<string, string> | null = null;

/** Đổi một ArrayBuffer thành chuỗi base64 (chia nhỏ để không tràn bộ nhớ). */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000; // 32KB mỗi vòng lặp
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return btoa(binary);
}

/** Nạp và đăng ký font tiếng Việt vào tài liệu PDF. Nạp lần đầu rồi dùng lại cache. */
async function ensureVietnameseFonts(doc: jsPDF): Promise<void> {
  if (!fontBase64Cache) {
    fontBase64Cache = {};
    for (const font of VIETNAMESE_FONTS) {
      const response = await fetch(`/fonts/${font.file}`);
      if (!response.ok) {
        fontBase64Cache = null; // nạp lỗi thì reset để lần sau thử lại
        throw new Error(`Không tải được font ${font.file} (HTTP ${response.status}).`);
      }
      fontBase64Cache[font.file] = arrayBufferToBase64(await response.arrayBuffer());
    }
  }
  for (const font of VIETNAMESE_FONTS) {
    doc.addFileToVFS(font.file, fontBase64Cache[font.file]);
    doc.addFont(font.file, FONT_FAMILY, font.style);
  }
}

/* ----------------------- Nhúng hình minh họa vào PDF -----------------------
 * jsPDF không nhúng trực tiếp được SVG (vector). Mọi ảnh — kể cả data URL
 * SVG do AI vẽ — được rasterize qua <canvas> thành PNG trước khi addImage.
 * Ảnh nạp lỗi thì trả về null, phía gọi in dòng chú thích thay thế.
 * -------------------------------------------------------------------------- */
type RasterizedImage = { dataUrl: string; width: number; height: number; format: 'PNG' | 'JPEG' };

async function rasterizeImageForPdf(dataUrl: string): Promise<RasterizedImage | null> {
  if (typeof document === 'undefined') return null;
  try {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return null;

    // SVG: vẽ lên canvas phóng 2x để nét khi in, rồi đổi sang PNG.
    if (/^data:image\/svg/i.test(dataUrl)) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * 2);
      canvas.height = Math.round(height * 2);
      const context = canvas.getContext('2d');
      if (!context) return null;
      // Nền trắng — SVG minh họa đề in ra giấy trắng.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const png = canvas.toDataURL('image/png');
      if (!png.startsWith('data:image/png')) return null;
      return { dataUrl: png, width: canvas.width, height: canvas.height, format: 'PNG' };
    }
    return {
      dataUrl,
      width,
      height,
      format: /^data:image\/jpe?g/i.test(dataUrl) ? 'JPEG' : 'PNG',
    };
  } catch {
    return null;
  }
}

/**
 * Nhúng một ảnh data URL vào PDF, co giãn vừa khung (mm). Trả về chiều cao
 * thực đã chiếm (mm) hoặc null nếu không nhúng được.
 */
async function embedImageInPdf(
  doc: jsPDF,
  dataUrl: string,
  x: number,
  y: number,
  maxWidth = 80,
  maxHeight = 62,
): Promise<number | null> {
  const image = await rasterizeImageForPdf(dataUrl);
  if (!image) return null;
  // Đổi pixel → mm (96 dpi) rồi co về khung cho phép.
  let widthMm = (image.width * 25.4) / 96;
  let heightMm = (image.height * 25.4) / 96;
  const scale = Math.min(1, maxWidth / widthMm, maxHeight / heightMm);
  widthMm *= scale;
  heightMm *= scale;
  try {
    doc.addImage(image.dataUrl, image.format, x, y, widthMm, heightMm);
    return heightMm;
  } catch {
    return null;
  }
}

type ExamsTabProps = {
  exams: Exam[];
  onCreate: () => void;
  onDelete: (exam: Exam) => void;
  onDuplicate: (exam: Exam) => void;
  onUpdateGrade: (exam: Exam, grade: Grade) => void | Promise<void>;
};

export function ExamsTab({ exams, onCreate, onDelete, onDuplicate, onUpdateGrade }: ExamsTabProps) {
  const toast = useToast();
  const [keyword, setKeyword] = useState('');
  const [subject, setSubject] = useState('all');
  const [gradeFilter, setGradeFilter] = useState<'all' | 'none' | Grade>('all');
  // Tên trường in đầu trang PDF. Lưu vào localStorage để giáo viên chỉ nhập một lần.
  const [schoolName, setSchoolName] = useState('');

  useEffect(() => {
    // Trì hoãn đọc localStorage ra sau khi mount để không setState đồng bộ trong effect.
    const timer = setTimeout(() => {
      setSchoolName(window.localStorage.getItem(STORAGE_KEYS.schoolName) || '');
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleSchoolNameChange = (value: string) => {
    setSchoolName(value);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEYS.schoolName, value);
    }
  };

  const subjects = useMemo(() => Array.from(new Set(exams.map((exam) => exam.subject))).sort(), [exams]);

  const gradeCounts = useMemo(() => {
    const counts = Object.fromEntries(GRADES.map((item) => [item, 0])) as Record<Grade, number>;
    let unassigned = 0;
    exams.forEach((exam) => {
      if (exam.grade) counts[exam.grade] += 1;
      else unassigned += 1;
    });
    return { counts, unassigned };
  }, [exams]);

  const filtered = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return exams.filter((exam) => {
      const matchesKeyword =
        !query ||
        exam.title.toLowerCase().includes(query) ||
        exam.subject.toLowerCase().includes(query) ||
        (exam.grade ? `lớp ${exam.grade}`.includes(query) : false);
      const matchesSubject = subject === 'all' || exam.subject === subject;
      const matchesGrade =
        gradeFilter === 'all' ||
        (gradeFilter === 'none' ? !exam.grade : exam.grade === gradeFilter);
      return matchesKeyword && matchesSubject && matchesGrade;
    });
  }, [exams, keyword, subject, gradeFilter]);

  /* ---------- Xuất PDF (client-side) ---------- */
  const exportToPdf = async (exam: Exam) => {
    const { jsPDF: JsPdf } = await import('jspdf');
    const autoTable = await import('jspdf-autotable');

    const doc = new JsPdf('p', 'mm', 'a4');
    // Bắt buộc nạp font tiếng Việt trước khi viết bất kỳ chữ nào.
    await ensureVietnameseFonts(doc);

    const pageWidth = doc.internal.pageSize.getWidth(); // A4 = 210mm
    const pageHeight = doc.internal.pageSize.getHeight(); // A4 = 297mm
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    const centerX = pageWidth / 2; // tọa độ x dùng để căn giữa chữ
    const bottomLimit = pageHeight - 20; // không viết chữ sát đáy trang

    let y = 18;

    /** Nếu đoạn tiếp theo không đủ chỗ thì sang trang mới (viết từ mép trên). */
    const ensureSpace = (needed: number) => {
      if (y + needed > bottomLimit) {
        doc.addPage();
        y = 20;
      }
    };

    /** Viết một đoạn văn tự động xuống dòng, trả về số dòng đã viết. */
    const writeParagraph = (text: string, size: number, indent = 0, lineHeight = 4.5) => {
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, contentWidth - indent) as string[];
      doc.text(lines, margin + indent, y);
      y += lines.length * lineHeight;
      return lines.length;
    };

    /**
     * In dòng nguồn gốc câu hỏi AI (chủ đề, mức độ, trang tài liệu tham chiếu)
     * bằng chữ nhỏ màu xám; câu bị QC đánh dấu thì thêm nhãn đỏ [CẦN XEM XÉT].
     */
    const writeProvenance = (provenance: { topic?: string; level?: string; sourcePages?: number[]; needsReview?: boolean }) => {
      const parts: string[] = [];
      if (provenance.topic) parts.push(`Chủ đề: ${provenance.topic}`);
      if (provenance.level) parts.push(`Mức độ: ${provenance.level}`);
      if (provenance.sourcePages?.length) parts.push(`Tham chiếu tài liệu, trang ${provenance.sourcePages.join(', ')}`);
      if (parts.length === 0 && !provenance.needsReview) return;
      ensureSpace(5);
      doc.setFont(FONT_FAMILY, 'normal');
      doc.setFontSize(7.5);
      let cursorX = margin;
      if (provenance.needsReview) {
        doc.setTextColor(225, 29, 72); // rose-600
        doc.text('[CẦN XEM XÉT]', cursorX, y);
        cursorX += 18;
      }
      doc.setTextColor(120, 120, 120);
      doc.text(parts.join('  ·  '), cursorX, y);
      y += 4;
      doc.setTextColor(0, 0, 0);
    };

    /** Nhúng ảnh minh họa (kể cả SVG do AI vẽ) vào vị trí hiện tại; ảnh lỗi thì in chú thích. */
    const embedFigure = async (dataUrl: string) => {
      const height = await embedImageInPdf(doc, dataUrl, margin, y);
      if (height !== null) {
        y += height + 2;
        return;
      }
      doc.setFont(FONT_FAMILY, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text('[Có hình minh họa hiển thị trong hệ thống]', margin, y);
      y += 5;
      doc.setTextColor(0, 0, 0);
    };

    doc.setTextColor(0, 0, 0);

    // ---- Đầu trang: tên trường → tên đề → thông tin chung (tất cả căn giữa) ----
    doc.setFont(FONT_FAMILY, 'bold');
    doc.setFontSize(13);
    doc.text(schoolName.trim() || 'TRƯỜNG: ........................................', centerX, y, { align: 'center' });

    y += 8;
    doc.setFontSize(16);
    doc.setTextColor(16, 185, 129);
    doc.text('ĐỀ KIỂM TRA', centerX, y, { align: 'center' });

    y += 8;
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(exam.title, centerX, y, { align: 'center' });

    y += 7;
    doc.setFont(FONT_FAMILY, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    doc.text(
      `Môn: ${exam.subject}   |   ${gradeLabel(exam.grade)}   |   Thời gian: ${exam.durationMinutes} phút   |   Tổng điểm: ${exam.totalPoints}`,
      centerX,
      y,
      { align: 'center' },
    );

    y += 6;
    // Đường kẻ ngang màu xanh phân tách phần đầu trang với nội dung đề.
    doc.setDrawColor(16, 185, 129);
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageWidth - margin, y);
    doc.setTextColor(0, 0, 0);

    y += 8;
    doc.setFontSize(10);
    doc.text(
      'Họ và tên: ..........................................................   Lớp: ................',
      margin,
      y,
    );

    const roman = ['I', 'II', 'III', 'IV'];
    let sectionIndex = 0;

    // ---- Phần I: Trắc nghiệm (nội dung câu hỏi + bảng đáp án) ----
    if (exam.mcqCount > 0) {
      y += 10;
      ensureSpace(12);
      doc.setFontSize(12);
      doc.setFont(FONT_FAMILY, 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(`${roman[sectionIndex]}. PHẦN TRẮC NGHIỆM`, margin, y);
      sectionIndex += 1;

      y += 6;
      doc.setFont(FONT_FAMILY, 'normal');
      doc.setFontSize(10);
      doc.text(`Số câu: ${exam.mcqCount} · Điểm/câu: ${exam.mcqPointPerQ}`, margin, y);
      y += 7;

      // In toàn bộ nội dung câu hỏi dạng văn bản cùng 4 phương án A/B/C/D.
      const questions = exam.mcqQuestions ?? [];
      for (let index = 0; index < exam.mcqCount; index += 1) {
        const question = questions[index];
        ensureSpace(12);

        // Nhãn "Câu N." in đậm; nội dung câu hỏi thụt lề đúng sau nhãn (hanging indent).
        const label = `Câu ${index + 1}.`;
        doc.setFont(FONT_FAMILY, 'bold');
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(label, margin, y);
        const indent = doc.getTextWidth(label) + 2;

        if (question?.content?.trim()) {
          doc.setFont(FONT_FAMILY, 'normal');
          const lines = doc.splitTextToSize(question.content.trim(), contentWidth - indent) as string[];
          lines.forEach((line, lineIndex) => {
            doc.text(line, margin + indent, y + lineIndex * 4.5);
          });
          y += lines.length * 4.5 + 1.5;

          // Hình minh họa do AI vẽ (nếu có) đặt ngay dưới nội dung câu hỏi.
          if (question.image) {
            await embedFigure(question.image);
          }

          // 4 phương án A/B/C/D, căn lề trái thống nhất cho gọn.
          const optionLabels = ['A', 'B', 'C', 'D'];
          doc.setFontSize(9.5);
          (question.options ?? []).forEach((option, optionIndex) => {
            ensureSpace(5);
            const optionLines = doc.splitTextToSize(
              `${optionLabels[optionIndex]}. ${option || '...'}`,
              contentWidth - 8,
            ) as string[];
            optionLines.forEach((line, lineIndex) => {
              doc.text(line, margin + 8, y + lineIndex * 4.5);
            });
            y += optionLines.length * 4.5;
          });
          y += 3;
          writeProvenance(question);
        } else if (question?.image) {
          // Câu chỉ có hình, không có nội dung văn bản.
          y += 2;
          await embedFigure(question.image);
          writeProvenance(question);
        } else {
          // Câu chỉ có ảnh (không có nội dung văn bản): ghi chú để giáo viên in ảnh đề riêng.
          y += 5;
          doc.setFont(FONT_FAMILY, 'normal');
          doc.setFontSize(9);
          doc.setTextColor(120, 120, 120);
          doc.text('[Câu hỏi dạng ảnh — ảnh đề được hiển thị trong hệ thống]', margin + 8, y);
          y += 7;
          doc.setTextColor(0, 0, 0);
        }
      }

      // Bảng đáp án đúng, đặt SAU phần câu hỏi (giáo viên giữ lại để đối chiếu).
      if (exam.mcqAnswers?.length > 0) {
        ensureSpace(20);
        doc.setFont(FONT_FAMILY, 'bold');
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.text('BẢNG ĐÁP ÁN (dành cho giáo viên)', margin, y);
        y += 5;

        const rows = exam.mcqAnswers.map((ans, i) => {
          const label = ['A', 'B', 'C', 'D'][ans] ?? '?';
          return [`Câu ${i + 1}`, label];
        });

        autoTable.default(doc, {
          startY: y,
          head: [['Câu', 'Đáp án']],
          body: rows,
          margin: { left: margin, right: margin },
          theme: 'grid',
          // Bảng cũng phải dùng font tiếng Việt, nếu ký tự có dấu sẽ hiển thị sai.
          styles: { font: FONT_FAMILY, fontSize: 9 },
          headStyles: {
            font: FONT_FAMILY,
            fontStyle: 'bold',
            fillColor: [16, 185, 129],
            textColor: [255, 255, 255],
            fontSize: 9,
          },
          bodyStyles: { fontSize: 9 },
          columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 20 } },
        });

        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }
    }

    // ---- Phần: Câu hỏi mở rộng (TN nhiều đáp án + Đúng/Sai) ----
    const extraQuestions = exam.extraQuestions ?? [];
    if (extraQuestions.length > 0) {
      ensureSpace(16);
      doc.setFontSize(12);
      doc.setFont(FONT_FAMILY, 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(`${roman[sectionIndex]}. PHẦN CÂU HỎI MỞ RỘNG`, margin, y);
      sectionIndex += 1;

      y += 6;
      doc.setFont(FONT_FAMILY, 'normal');
      doc.setFontSize(10);
      doc.text(`Số câu: ${extraQuestions.length} · Điểm/câu: in trên từng câu`, margin, y);
      y += 7;

      const extraAnswerRows: string[][] = [];

      for (let questionIndex = 0; questionIndex < extraQuestions.length; questionIndex += 1) {
        const question = extraQuestions[questionIndex];
        ensureSpace(18);

        doc.setFont(FONT_FAMILY, 'bold');
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(`${question.questionLabel || `Câu ${questionIndex + 1}`} (${question.points} điểm)`, margin, y);
        y += 5;

        if (question.content?.trim()) {
          doc.setFont(FONT_FAMILY, 'normal');
          writeParagraph(question.content.trim(), 9);
          y += 1;
        }

        // Hình minh họa của câu (nếu có).
        if (question.questionImage) {
          await embedFigure(question.questionImage);
        }

        const options = question.kind === 'multi-mcq' ? question.options ?? [] : [];
        const statements = question.kind === 'true-false' ? question.statements ?? [] : [];

        if (question.kind === 'multi-mcq') {
          doc.setFont(FONT_FAMILY, 'normal');
          doc.setFontSize(9);
          doc.setTextColor(120, 120, 120);
          doc.text('(Chọn nhiều phương án đúng)', margin + 8, y);
          y += 5;
          doc.setTextColor(0, 0, 0);
          options.forEach((option, optionIndex) => {
            ensureSpace(5);
            const optionLines = doc.splitTextToSize(
              `${['A', 'B', 'C', 'D'][optionIndex]}. ${option || '...'}`,
              contentWidth - 8,
            ) as string[];
            optionLines.forEach((line, lineIndex) => {
              doc.text(line, margin + 8, y + lineIndex * 4.5);
            });
            y += optionLines.length * 4.5;
          });
          extraAnswerRows.push([
            question.questionLabel || `Câu ${questionIndex + 1}`,
            (question.correctIndexes ?? []).map((value) => 'ABCD'[value] ?? '?').join(', ') || '?',
          ]);
        } else {
          doc.setFont(FONT_FAMILY, 'normal');
          doc.setFontSize(9);
          doc.setTextColor(120, 120, 120);
          doc.text('(Xét Đúng/Sai từng ý)', margin + 8, y);
          y += 5;
          doc.setTextColor(0, 0, 0);
          statements.forEach((statement, statementIndex) => {
            ensureSpace(5);
            const statementLines = doc.splitTextToSize(
              `${String.fromCharCode(97 + statementIndex)}) ${statement.text}`,
              contentWidth - 8,
            ) as string[];
            statementLines.forEach((line, lineIndex) => {
              doc.text(line, margin + 8, y + lineIndex * 4.5);
            });
            y += statementLines.length * 4.5;
          });
          extraAnswerRows.push([
            question.questionLabel || `Câu ${questionIndex + 1}`,
            statements.map((statement) => (statement.answer ? 'Đ' : 'S')).join(' · ') || '?',
          ]);
        }
        y += 2;
        writeProvenance(question);
        y += 2;
      }

      // Bảng đáp án đúng của phần mở rộng (giáo viên giữ để đối chiếu).
      if (extraAnswerRows.length > 0) {
        ensureSpace(18);
        doc.setFont(FONT_FAMILY, 'bold');
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.text('BẢNG ĐÁP ÁN PHẦN MỞ RỘNG (dành cho giáo viên)', margin, y);
        y += 5;

        autoTable.default(doc, {
          startY: y,
          head: [['Câu', 'Đáp án']],
          body: extraAnswerRows,
          margin: { left: margin, right: margin },
          theme: 'grid',
          styles: { font: FONT_FAMILY, fontSize: 9 },
          headStyles: {
            font: FONT_FAMILY,
            fontStyle: 'bold',
            fillColor: [13, 148, 136], // teal-600
            textColor: [255, 255, 255],
            fontSize: 9,
          },
          bodyStyles: { fontSize: 9 },
          columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 'auto' } },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }
    }

    // ---- Phần II: Trả lời ngắn ----
    if ((exam.shortAnswerQuestions?.length ?? 0) > 0) {
      ensureSpace(14);
      doc.setFontSize(12);
      doc.setFont(FONT_FAMILY, 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(`${roman[sectionIndex]}. PHẦN TRẢ LỜI NGẮN`, margin, y);
      sectionIndex += 1;

      y += 6;
      doc.setFont(FONT_FAMILY, 'normal');
      doc.setFontSize(10);
      doc.text(`Số câu: ${exam.shortAnswerQuestions.length}`, margin, y);
      y += 6;

      for (let qi = 0; qi < exam.shortAnswerQuestions.length; qi += 1) {
        const q = exam.shortAnswerQuestions[qi];
        ensureSpace(14);

        doc.setFont(FONT_FAMILY, 'bold');
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(`${q.questionLabel || `Câu ${qi + 1}`} (${q.points} điểm)`, margin, y);
        y += 5;

        if (q.content) {
          doc.setFont(FONT_FAMILY, 'normal');
          writeParagraph(q.content, 9);
          y += 1;
        }

        // Ảnh đề/hình minh họa của câu — nhúng thẳng vào PDF.
        if (q.questionImage) {
          await embedFigure(q.questionImage);
        }

        doc.setFont(FONT_FAMILY, 'bold');
        doc.setFontSize(9);
        doc.setTextColor(16, 185, 129);
        doc.text(`Đáp án: ${q.answer}`, margin, y);
        doc.setTextColor(0, 0, 0);
        y += 5;

        // Biểu thức kiểm chứng của câu tính toán (QC Engine) — ghi để giáo viên đối chiếu.
        if (q.computation?.expression) {
          doc.setFont(FONT_FAMILY, 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(120, 120, 120);
          doc.text(`Biểu thức kiểm chứng: ${q.computation.expression} = ${q.computation.expected}`, margin, y);
          y += 4;
          doc.setTextColor(0, 0, 0);
        }

        if (q.rubric) {
          doc.setFont(FONT_FAMILY, 'normal');
          doc.setFontSize(8);
          doc.setTextColor(120, 120, 120);
          writeParagraph(`Rubric: ${q.rubric}`, 8, 0, 4);
        }
        writeProvenance(q);
        y += 4;
      }
    }

    // ---- Phần III: Tự luận ----
    if ((exam.essayQuestions?.length ?? 0) > 0) {
      ensureSpace(14);
      doc.setFontSize(12);
      doc.setFont(FONT_FAMILY, 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(`${roman[sectionIndex]}. PHẦN TỰ LUẬN`, margin, y);

      y += 6;
      doc.setFont(FONT_FAMILY, 'normal');
      doc.setFontSize(10);
      doc.text(`Số câu: ${exam.essayQuestions.length}`, margin, y);

      y += 6;
      for (let questionIndex = 0; questionIndex < exam.essayQuestions.length; questionIndex += 1) {
        const q = exam.essayQuestions[questionIndex];
        ensureSpace(14);

        doc.setFont(FONT_FAMILY, 'bold');
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(`${q.questionLabel || `Câu ${questionIndex + 1}`} (${q.points} điểm)`, margin, y);
        y += 5;

        (q.subParts ?? []).forEach((part) => {
          ensureSpace(5);
          doc.setFont(FONT_FAMILY, 'normal');
          doc.setFontSize(9);
          writeParagraph(`   ${part.label}. ${part.content || ''} (${part.points} điểm)`, 9);
        });

        // Hình minh họa của câu tự luận (nếu có).
        if (q.questionImage) {
          await embedFigure(q.questionImage);
        }

        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        ensureSpace(5);
        writeParagraph(`Rubric: ${q.rubric || 'Chưa có hướng dẫn chấm điểm'}`, 8, 0, 4);
        writeProvenance(q);
        y += 2;
      }
    }

    // Tên file bỏ dấu tiếng Việt để không lỗi khi tải về trên mọi hệ điều hành.
    const fileName = `${slugify(exam.title) || 'de-kiem-tra'}.pdf`;
    doc.save(fileName);
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Quản lý đề kiểm tra
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Theo dõi, nhân bản, xuất file và quản lý toàn bộ đề thi của bạn.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:from-emerald-700 hover:to-teal-700 active:scale-[0.98]"
        >
          <Plus className="size-4" />
          Thêm đề mới
        </button>
      </header>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="Tìm theo tên đề hoặc môn học..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-10 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-500 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
          />
          {keyword ? (
            <button
              type="button"
              onClick={() => setKeyword('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              aria-label="Xóa tìm kiếm"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        <select
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-600 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 sm:w-44"
        >
          <option value="all">Tất cả môn học</option>
          {subjects.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <div className="relative sm:w-64">
          <Building2 className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={schoolName}
            onChange={(event) => handleSchoolNameChange(event.target.value)}
            placeholder="Tên trường in trên PDF..."
            aria-label="Tên trường in đầu trang khi xuất PDF"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-500 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <span className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-bold text-emerald-700">
          {filtered.length}/{exams.length} đề
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([
          { key: 'all' as const, label: 'Tất cả', count: exams.length },
          ...GRADES.map((item) => ({ key: item, label: gradeLabel(item), count: gradeCounts.counts[item] })),
          ...(gradeCounts.unassigned > 0
            ? [{ key: 'none' as const, label: 'Chưa phân khối', count: gradeCounts.unassigned }]
            : []),
        ]).map((tab) => {
          const active = gradeFilter === tab.key;
          return (
            <button
              key={String(tab.key)}
              type="button"
              onClick={() => setGradeFilter(tab.key)}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition',
                active
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-emerald-50 hover:text-emerald-700',
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-xs font-bold',
                  active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500',
                )}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <Layers className="size-7" />
          </span>
          <div>
            <p className="text-base font-bold text-slate-800">
              {exams.length === 0 ? 'Chưa có đề kiểm tra nào' : 'Không tìm thấy đề phù hợp'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {exams.length === 0
                ? 'Tạo đề đầu tiên để học sinh có thể bắt đầu làm bài.'
                : 'Thử từ khóa khác hoặc bỏ bộ lọc môn học / khối lớp.'}
            </p>
          </div>
          {exams.length === 0 ? (
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-emerald-700"
            >
              <Plus className="size-4" /> Tạo đề kiểm tra
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setKeyword('');
                setSubject('all');
                setGradeFilter('all');
              }}
              className="text-sm font-bold text-emerald-700 hover:underline"
            >
              Xóa bộ lọc
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((exam) => (
            <article
              key={exam.id}
              className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-900/5"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 opacity-0 transition group-hover:opacity-100" />

              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ring-1', subjectStyle(exam.subject))}>
                    {exam.subject}
                  </span>
                  <label
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-indigo-700 ring-1 ring-indigo-600/10"
                    title="Đổi khối lớp" aria-label="Đổi khối lớp"
                  >
                    <GraduationCap className="size-3 shrink-0" />
                    <select
                      value={exam.grade ?? ''}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (GRADES.includes(value as Grade)) {
                          void onUpdateGrade(exam, value as Grade);
                        }
                      }}
                      className="cursor-pointer bg-transparent text-xs font-bold uppercase tracking-wide text-indigo-700 outline-none"
                      aria-label="Khối lớp của đề"
                    >
                      <option value="" disabled>
                        Chưa phân khối
                      </option>
                      {GRADES.map((item) => (
                        <option key={item} value={item}>
                          Lớp {item}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onDuplicate(exam)}
                    title="Nhân bản đề" aria-label="Nhân bản đề"
                    className="rounded-lg p-2 text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-600"
                  >
                    <Copy className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      exportToPdf(exam).catch((error: unknown) => {
                        console.error('Lỗi xuất PDF:', error);
                        toast.error(
                          'Không thể xuất PDF',
                          error instanceof Error ? error.message : 'Vui lòng thử lại.',
                        );
                      });
                    }}
                    title="Xuất PDF" aria-label="Xuất PDF"
                    className="rounded-lg p-2 text-slate-500 transition hover:bg-amber-50 hover:text-amber-600"
                  >
                    <Download className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(exam)}
                    title="Xóa đề" aria-label="Xóa đề"
                    className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>

              <h3 className="mt-3 line-clamp-2 min-h-[2.75rem] text-base font-bold leading-snug text-slate-900">
                {exam.title}
              </h3>

              <div className="mt-4 grid grid-cols-4 divide-x divide-slate-100 rounded-2xl bg-slate-50 py-3 text-center">
                <div>
                  <p className="flex items-center justify-center gap-1 text-sm font-bold text-slate-800">
                    <Clock3 className="size-3.5 text-emerald-500" />
                    {exam.durationMinutes}
                  </p>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Phút</p>
                </div>
                <div>
                  <p className="flex items-center justify-center gap-1 text-sm font-bold text-slate-800">
                    <Layers className="size-3.5 text-sky-500" />
                    {exam.mcqCount}
                  </p>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Trắc nghiệm</p>
                </div>
                <div>
                  <p className="flex items-center justify-center gap-1 text-sm font-bold text-slate-800">
                    <Layers className="size-3.5 text-cyan-500" />
                    {exam.shortAnswerQuestions.length}
                  </p>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">TL ngắn</p>
                </div>
                <div>
                  <p className="flex items-center justify-center gap-1 text-sm font-bold text-slate-800">
                    <Layers className="size-3.5 text-violet-500" />
                    {exam.essayQuestions.length}
                  </p>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Tự luận</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-xs font-semibold text-slate-500">
                  {exam.createdAt ? `Tạo ngày ${formatDate(exam.createdAt)}` : 'Đề kiểm tra'}
                </span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                  {formatNumber(exam.totalPoints)} điểm
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
