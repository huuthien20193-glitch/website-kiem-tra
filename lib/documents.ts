/**
 * Trích xuất nội dung tài liệu ngay trên trình duyệt:
 * - TXT / MD: đọc thẳng văn bản
 * - DOCX: mammoth (browser build)
 * - PDF: pdf-parse (browser build). PDF scan (không có chữ) sẽ giữ nguyên dữ liệu gốc
 *   để gửi cho AI đọc bằng đa phương thức (multimodal).
 * - Ảnh: nén lại và giữ dạng data URL cho AI đọc ảnh (OCR).
 */
import type { TeacherDocument } from './types';
import { optimizeImage } from './image';

export type ExtractResult = Pick<TeacherDocument, 'fileType' | 'content' | 'imageData' | 'pdfData'> & {
  /** true nếu PDF scan không trích xuất được chữ nào. */
  scanned: boolean;
};

const TEXT_EXTENSIONS = ['txt', 'md', 'csv', 'json'];

export function fileKind(file: File): TeacherDocument['fileType'] | null {
  const name = file.name.toLowerCase();
  if (file.type.startsWith('image/')) return 'image';
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
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

/** Đọc DOCX bằng bản browser của mammoth (tránh phụ thuộc fs của Node). */
async function extractDocx(file: File): Promise<string> {
  const mammoth = (await import('mammoth/mammoth.browser.js')) as unknown as {
    extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
  };
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return (result?.value ?? '').trim();
}

/** Đọc PDF bằng pdf-parse bản web; trả về chữ + (khi scan) ảnh trang đầu. */
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

  const keepOriginal = () => (file.size <= 4 * 1024 * 1024 ? bufferToBase64(data) : undefined);
  let text = '';
  let imageData: string | undefined;

  try {
    try {
      const textResult = await parser.getText();
      text = (textResult?.text ?? '').replace(/\u0000/g, '').trim();
    } catch {
      // PDF hỏng/được bảo mật — vẫn thử chụp trang cho AI đọc.
    }

    if (text.length < 80) {
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

  return {
    fileType: 'pdf',
    content: text,
    imageData,
    // Giữ nguyên PDF (base64) khi file nhỏ để gửi trực tiếp cho AI đọc.
    pdfData: text.length >= 80 ? undefined : keepOriginal(),
    scanned: text.length < 80,
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

export async function extractDocumentContent(file: File): Promise<ExtractResult> {
  const kind = fileKind(file);
  if (!kind) {
    throw new Error('Chỉ hỗ trợ tệp PDF, DOCX, TXT/MD hoặc ảnh.');
  }

  if (kind === 'text') {
    const content = (await file.text()).trim();
    return { fileType: 'text', content, scanned: false };
  }

  if (kind === 'docx') {
    const content = await extractDocx(file);
    return { fileType: 'docx', content, scanned: false };
  }

  if (kind === 'image') {
    const imageData = await optimizeImage(file, 1400, 0.78);
    return { fileType: 'image', content: '', imageData, scanned: false };
  }

  return extractPdf(file);
}

export const FILE_KIND_LABELS: Record<TeacherDocument['fileType'], string> = {
  pdf: 'PDF',
  docx: 'Word',
  text: 'Văn bản',
  image: 'Ảnh',
};
