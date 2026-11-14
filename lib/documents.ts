/**
 * Trích xuất nội dung tài liệu ngay trên trình duyệt:
 * - TXT / MD: đọc thẳng văn bản
 * - DOCX: mammoth (browser build) chuyển sang HTML rồi đổi sang văn bản
 *   có cấu trúc (giữ nguyên bảng biểu, đếm hình ảnh)
 * - PPTX: giải nén ZIP và đọc XML từng slide (mỗi slide = một trang)
 * - PDF: pdf-parse (browser build) trích xuất TỪNG TRANG, giữ thứ tự;
 *   PDF scan (không có chữ) giữ nguyên dữ liệu gốc để AI đọc trực tiếp (OCR).
 * - Ảnh: nén lại và giữ dạng data URL cho AI đọc ảnh (OCR).
 *
 * Nội dung nhiều trang được ghép bằng dòng đánh dấu `===== TRANG n =====`
 * và phần không đọc được được đánh dấu `[KHÔNG ĐỌC ĐƯỢC: lý do]` — nhờ đó
 * giáo viên xem được nội dung từng trang và AI biết chính xác trang nào lỗi.
 */
import type {
  DocumentDetection,
  DocumentPage,
  TeacherDocument,
} from './types';
import { optimizeImage } from './image';
import { decodeXmlEntities, readZipEntries } from './zip';

export type ExtractResult = Pick<
  TeacherDocument,
  'fileType' | 'content' | 'imageData' | 'pdfData' | 'pageCount' | 'pages' | 'detected' | 'warnings'
> & {
  /** true nếu PDF scan không trích xuất được chữ nào. */
  scanned: boolean;
};

const TEXT_EXTENSIONS = ['txt', 'md', 'csv', 'json'];

/** Dấu phân cách trang dùng khi ghép nội dung nhiều trang. */
export const PAGE_MARKER_PATTERN = /^\s*=====\s*TRANG\s+(\d+)\s*=====\s*$/;

const IMAGE_MARKER = '[HÌNH ẢNH';
const TABLE_MARKER = '[BẢNG BIỂU';
const UNREADABLE_MARKER = '[KHÔNG ĐỌC ĐƯỢC';

export function fileKind(file: File): TeacherDocument['fileType'] | null {
  const name = file.name.toLowerCase();
  if (file.type.startsWith('image/')) return 'image';
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.pptx')) return 'pptx';
  if (file.type.startsWith('text/') || TEXT_EXTENSIONS.some((extension) => name.endsWith(`.${extension}`))) {
    return 'text';
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* --------------------------- Ghép / phân tích nội dung --------------------------- */

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** Ghép nội dung các trang thành văn bản có đánh dấu trang. */
export function joinPages(pages: Array<{ page: number; text: string }>): string {
  return pages
    .map((page) => `===== TRANG ${page.page} =====\n${page.text.trim()}`)
    .join('\n\n')
    .trim();
}

/**
 * Phân tích nội dung tài liệu (có hoặc không có đánh dấu trang) thành:
 * - danh sách trang + trạng thái từng trang (ok / low / failed),
 * - số hình ảnh, bảng biểu, công thức phát hiện được,
 * - danh sách cảnh báo cho giáo viên kiểm tra.
 * Dùng cả sau khi trích xuất và khi tải lại tài liệu từ bộ nhớ/Supabase.
 */
export function parseDocumentContent(
  content: string,
): {
  pages: DocumentPage[];
  detected: DocumentDetection;
  warnings: string[];
} {
  const text = content || '';
  const pages: DocumentPage[] = [];

  // Tách theo đánh dấu trang nếu có.
  const lines = text.split('\n');
  let current: { page: number; lines: string[] } | null = null;
  const hasMarkers = lines.some((line) => PAGE_MARKER_PATTERN.test(line));

  const flush = () => {
    if (!current) return;
    const pageText = current.lines.join('\n').trim();
    const words = countWords(pageText.replace(/\[[^\]]*\]/g, ' '));
    const unreadable = pageText.includes(UNREADABLE_MARKER);
    let status: DocumentPage['status'] = 'ok';
    if (unreadable || (pageText.trim() && words === 0)) status = 'failed';
    else if (words > 0 && words < 12) status = 'low';
    else if (words === 0) status = 'failed';
    pages.push({ page: current.page, text: pageText, words, status });
  };

  if (hasMarkers) {
    for (const line of lines) {
      const match = PAGE_MARKER_PATTERN.exec(line);
      if (match) {
        flush();
        current = { page: Number(match[1]) || pages.length + 1, lines: [] };
      } else if (current) {
        current.lines.push(line);
      }
    }
    flush();
  }

  // Đếm hình ảnh / bảng biểu / công thức phát hiện được.
  const detected: DocumentDetection = {
    images: (text.match(/\[HÌNH ẢNH/g) || []).length,
    tables: (text.match(/\[BẢNG BIỂU/g) || []).length,
    formulas: countFormulaLines(text),
  };

  // Cảnh báo cho giáo viên.
  const warnings: string[] = [];
  if (!text.trim()) {
    warnings.push('Không trích xuất được nội dung chữ nào. Nếu đây là tài liệu scan, hãy dùng “Nhận diện chữ bằng AI”.');
  } else {
    for (const page of pages) {
      if (page.status === 'failed') {
        warnings.push(`Trang ${page.page} không đọc được nội dung — cần kiểm tra hoặc OCR lại.`);
      } else if (page.status === 'low') {
        warnings.push(`Trang ${page.page} có rất ít chữ (${page.words} từ) — có thể là trang scan/mờ.`);
      }
    }
  }

  return { pages, detected, warnings };
}

/** Đếm số dòng mang ký hiệu công thức / ký hiệu toán - lý - hóa. */
function countFormulaLines(text: string): number {
  let count = 0;
  for (const line of text.split('\n')) {
    if (/(?:\\frac|\\sqrt|[∫∑∏√π≈≠≤≥±×÷Δθαβλ°])|(^|\s)[a-zA-Z0-9]+\^[{(]?|[a-z]_\{?\d/.test(line)) {
      count += 1;
    }
  }
  return count;
}

/* --------------------------------- PDF --------------------------------- */

/** Đọc PDF bằng pdf-parse bản web; trích xuất TỪNG TRANG, giữ thứ tự. */
async function extractPdf(file: File): Promise<ExtractResult> {
  const { PDFParse } = await import('pdf-parse');

  // pdf.js trong trình duyệt cần Web Worker cùng origin. Bản web của pdf-parse
  // không tự cấu hình worker, nên chỉ định file được copy vào public/ lúc build
  // (scripts/copy-pdf-worker.mjs). Thiếu bước này getText() sẽ luôn lỗi
  // "No GlobalWorkerOptions.workerSrc specified" và mọi PDF bị coi là scan.
  if (typeof window !== 'undefined') {
    PDFParse.setWorker('/pdf.worker.mjs');
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const parser = new PDFParse({ data });

  let pageTexts: Array<{ page: number; text: string }> = [];
  let totalPages = 0;
  let extractFailed = false;
  let imageData: string | undefined;

  try {
    try {
      const textResult = await parser.getText();
      totalPages = textResult.total || textResult.pages?.length || 0;
      pageTexts = (textResult.pages ?? []).map((page) => ({
        page: page.num,
        text: (page.text ?? '').replace(/\u0000/g, '').trim(),
      }));
    } catch {
      extractFailed = true; // PDF hỏng/được bảo mật — vẫn thử chụp trang cho AI đọc.
    }

    if (pageTexts.length === 0) {
      try {
        const screenshots = await parser.getScreenshot({ first: 1, desiredWidth: 1200, imageDataUrl: true });
        imageData = screenshots?.pages?.[0]?.dataUrl ?? undefined;
      } catch {
        // Bỏ qua — một số PDF không render được trang.
      }
    }
  } finally {
    await parser.destroy().catch(() => undefined);
  }

  const totalWords = pageTexts.reduce((sum, page) => sum + countWords(page.text), 0);
  // Tính là "scan" khi hầu như không có chữ nào hoặc trình đọc lỗi hoàn toàn.
  const scanned = totalWords < 80 || extractFailed;
  const scannedPages = pageTexts.filter((page) => countWords(page.text) < 12).length;

  const pages: DocumentPage[] = pageTexts.map((page) => {
    const words = countWords(page.text);
    const status: DocumentPage['status'] =
      page.text.trim() && words === 0 ? 'failed' : words < 12 ? 'low' : 'ok';
    return { page: page.page, text: page.text, words, status };
  });
  if (pages.length === 0 && totalPages > 0) {
    // Trình đọc lỗi: tạo các trang rỗng báo lỗi để giáo viên biết có bao nhiêu trang.
    for (let page = 1; page <= totalPages; page += 1) {
      pages.push({ page, text: '', words: 0, status: 'failed' });
    }
  }

  const warnings: string[] = [];
  if (extractFailed) warnings.push('Không trích xuất được chữ từ PDF (tệp hỏng hoặc được bảo mật). AI vẫn đọc được nội dung scan.');
  else if (scanned) warnings.push('PDF scan: không có sẵn chữ trong tệp — hãy dùng “Nhận diện chữ bằng AI” để OCR.');
  else if (scannedPages > 0) warnings.push(`${scannedPages} trang có rất ít chữ — có thể chứa hình scan, AI sẽ đọc trực tiếp các trang này.`);

  return {
    fileType: 'pdf',
    content: pages.length > 0 ? joinPages(pages) : '',
    imageData,
    // Giữ PDF gốc (khi file đủ nhỏ) để AI đọc trực tiếp: giúp AI nắm được bảng
    // biểu, công thức, hình vẽ mà văn bản trích xuất không thể hiện hết.
    pdfData: file.size <= 4 * 1024 * 1024 ? bufferToBase64(data) : undefined,
    pageCount: totalPages || pages.length || undefined,
    pages,
    detected: parseDocumentContent(joinPages(pages)).detected,
    warnings,
    scanned,
  };
}

function bufferToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

/* --------------------------------- DOCX --------------------------------- */

/**
 * Đọc DOCX bằng bản browser của mammoth, chuyển sang HTML rồi đổi sang văn bản
 * có cấu trúc: bảng biểu giữ nguyên dạng hàng/cột, hình ảnh được đánh dấu.
 * (extractRawText cũ làm mất cấu trúc bảng — nguyên nhân AI đọc sai bảng biểu.)
 */
async function extractDocx(file: File): Promise<ExtractResult> {
  const mammoth = (await import('mammoth/mammoth.browser.js')) as unknown as {
    convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
  };
  const buffer = await file.arrayBuffer();
  const html = (await mammoth.convertToHtml({ arrayBuffer: buffer }))?.value ?? '';

  const text = htmlToStructuredText(html);
  const pageCount = await readOfficePageCount(file, 'Pages');

  const { pages, detected, warnings } = parseDocumentContent(text);
  return {
    fileType: 'docx',
    content: text,
    pageCount: pageCount || undefined,
    pages: pages.length > 1 ? pages : undefined,
    detected,
    warnings,
    scanned: false,
  };
}

/**
 * Đổi HTML của mammoth thành văn bản có cấu trúc:
 * - <p>/<h1..h6>/<li> → dòng chữ
 * - <table> → các dòng `| ô | ô |` kèm đánh dấu [BẢNG BIỂU]
 * - <img> → đánh dấu [HÌNH ẢNH: ...] để AI và giáo viên biết có hình
 */
function htmlToStructuredText(html: string): string {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    // Phòng thủ: môi trường không có DOMParser (rất hiếm) — bỏ tag thô.
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+\n/g, '\n').trim();
  }
  const document_ = new DOMParser().parseFromString(html, 'text/html');
  const out: string[] = [];

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = (node.textContent || '').replace(/\s+/g, ' ');
      if (value.trim()) out.push(value.trim());
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    const tag = element.tagName.toLowerCase();
    if (tag === 'table') {
      out.push(TABLE_MARKER + ']');
      element.querySelectorAll('tr').forEach((row) => {
        const cells = Array.from(row.querySelectorAll('th,td')).map(
          (cell) => (cell.textContent || '').replace(/\s+/g, ' ').trim(),
        );
        if (cells.some(Boolean)) out.push(`| ${cells.join(' | ')} |`);
      });
      out.push('');
      return;
    }
    if (tag === 'img') {
      const alt = element.getAttribute('alt') || 'hình trong tài liệu Word';
      out.push(`${IMAGE_MARKER}: ${alt}]`);
      return;
    }
    if (/^h[1-6]$/.test(tag)) {
      out.push('');
      element.childNodes.forEach(walk);
      out.push('');
      return;
    }
    if (tag === 'br') {
      out.push('');
      return;
    }
    element.childNodes.forEach(walk);
    if (tag === 'p' || tag === 'li') out.push('');
  };

  document_.body?.childNodes.forEach(walk);
  // Gộp các dòng trống liên tiếp + ghép các mảnh văn bản liền nhau thành dòng.
  const merged: string[] = [];
  for (const line of out) {
    if (line === '' && merged[merged.length - 1] === '') continue;
    merged.push(line);
  }
  return merged.join('\n').replace(/[ \t]+\n/g, '\n').trim();
}

/** Đọc số trang/slide từ docProps/app.xml của tệp Office (DOCX/PPTX). */
async function readOfficePageCount(file: File, property: 'Pages' | 'Slides'): Promise<number | null> {
  try {
    const entries = await readZipEntries(file);
    const appXml = entries?.get('docProps/app.xml');
    if (!appXml) return null;
    const xml = decodeXmlEntities(new TextDecoder().decode(appXml));
    const match = new RegExp(`<${property}>(\\d+)</${property}>`).exec(xml);
    return match ? Number(match[1]) || null : null;
  } catch {
    return null;
  }
}

/* --------------------------------- PPTX --------------------------------- */

/**
 * Đọc PPTX: giải nén ZIP bằng bộ đọc tối giản và phân tích XML từng slide.
 * Mỗi slide = một "trang", giữ đúng thứ tự slide trong bài giảng.
 */
async function extractPptx(file: File): Promise<ExtractResult> {
  const entries = await readZipEntries(file);
  if (!entries) {
    throw new Error('Không đọc được tệp PowerPoint (tệp hỏng hoặc không phải .pptx hợp lệ).');
  }

  // Liệt kê slide theo số thứ tự: ppt/slides/slide1.xml, slide2.xml, ...
  const slides: Array<{ number: number; name: string }> = [];
  for (const name of entries.keys()) {
    const match = /^ppt\/slides\/slide(\d+)\.xml$/.exec(name);
    if (match) slides.push({ number: Number(match[1]), name });
  }
  slides.sort((a, b) => a.number - b.number);

  const pages: DocumentPage[] = slides.map((slide) => {
    const xml = decodeXmlEntities(new TextDecoder().decode(entries.get(slide.name) ?? new Uint8Array()));
    // Mỗi đoạn <a:p>...</a:p> là một dòng; mỗi <a:t>..</a:t> là một mảnh chữ.
    const paragraphs = xml.split(/<a:p[ >]/).slice(1);
    const lines = paragraphs
      .map((paragraph) => {
        const runs = paragraph.match(/<a:t>([\s\S]*?)<\/a:t>/g) ?? [];
        return runs
          .map((run) => run.replace(/<\/?a:t>/g, '').trim())
          .filter(Boolean)
          .join('');
      })
      .filter(Boolean);
    const images = (xml.match(/<p:pic[\s>]/g) || []).length;
    const text = [...lines, images > 0 ? `${IMAGE_MARKER}: ${images} hình trong slide ${slide.number}]` : '']
      .filter(Boolean)
      .join('\n')
      .trim();
    const words = countWords(text.replace(/\[[^\]]*\]/g, ' '));
    const status: DocumentPage['status'] = text.trim() && words === 0 && !text.includes(IMAGE_MARKER) ? 'low' : words < 12 ? 'low' : 'ok';
    return { page: slide.number, text, words, status };
  });

  const declaredSlides = await readOfficePageCount(file, 'Slides');
  const content = joinPages(pages);
  const { detected, warnings } = parseDocumentContent(content);
  if (pages.length === 0) warnings.push('Tệp PowerPoint không có slide nào đọc được nội dung.');

  return {
    fileType: 'pptx',
    content,
    pageCount: declaredSlides || pages.length || undefined,
    pages,
    detected,
    warnings,
    scanned: false,
  };
}

/* ------------------------------ Entry point ------------------------------ */

export async function extractDocumentContent(file: File): Promise<ExtractResult> {
  const kind = fileKind(file);
  if (!kind) {
    throw new Error('Chỉ hỗ trợ tệp PDF, DOCX, PPTX, TXT/MD hoặc ảnh.');
  }

  if (kind === 'text') {
    const content = (await file.text()).trim();
    const { detected, warnings } = parseDocumentContent(content);
    return { fileType: 'text', content, detected, warnings, scanned: false };
  }

  if (kind === 'docx') return extractDocx(file);
  if (kind === 'pptx') return extractPptx(file);

  if (kind === 'image') {
    const imageData = await optimizeImage(file, 1400, 0.78);
    return { fileType: 'image', content: '', imageData, pageCount: 1, scanned: false };
  }

  return extractPdf(file);
}

export const FILE_KIND_LABELS: Record<TeacherDocument['fileType'], string> = {
  pdf: 'PDF',
  docx: 'Word',
  pptx: 'PowerPoint',
  text: 'Văn bản',
  image: 'Ảnh',
};
