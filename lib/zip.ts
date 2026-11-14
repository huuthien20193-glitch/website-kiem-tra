/**
 * Bộ đọc ZIP tối giản chạy trên trình duyệt — không cần thư viện ngoài.
 *
 * Các tệp Office (.pptx, .docx) thực chất là tập tin ZIP chứa XML.
 * Trình duyệt hiện đại có sẵn DecompressionStream('deflate-raw') nên ta có thể
 * tự giải nén: đọc bảng mục lục (central directory) ở cuối tệp, duyệt từng mục
 * rồi bung dữ liệu deflate.
 *
 * Hỗ trợ 2 kiểu nén phổ biến của Office: STORED (0) và DEFLATE (8).
 */

const EOCD_SIGNATURE = 0x06054b50; // End Of Central Directory
const CENTRAL_SIGNATURE = 0x02014b50; // Central Directory file header
const LOCAL_SIGNATURE = 0x04034b50; // Local file header

export type ZipEntry = {
  name: string;
  /** Dữ liệu đã giải nén (STORED giữ nguyên, DEFLATE được bung ra). */
  data: Uint8Array;
};

/** Bung dữ liệu deflate-raw bằng DecompressionStream có sẵn của trình duyệt. */
async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(
    new DecompressionStream('deflate-raw'),
  );
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Đọc toàn bộ các mục (entry) của một tệp ZIP.
 * Trả về Map tên → dữ liệu, hoặc null nếu tệp không phải ZIP đọc được.
 */
export async function readZipEntries(file: File): Promise<Map<string, Uint8Array> | null> {
  if (typeof window === 'undefined') return null;
  try {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // 1. Tìm khối EOCD ở cuối tệp (nằm trong 64KB cuối + 22 byte).
    let eocdOffset = -1;
    const searchStart = Math.max(0, bytes.length - 22 - 65_536);
    for (let index = bytes.length - 22; index >= searchStart; index -= 1) {
      if (view.getUint32(index, true) === EOCD_SIGNATURE) {
        eocdOffset = index;
        break;
      }
    }
    if (eocdOffset < 0) return null;

    const entryCount = view.getUint16(eocdOffset + 10, true);
    // Vị trí bắt đầu central directory trong tệp.
    let offset = view.getUint32(eocdOffset + 16, true);

    const entries = new Map<string, Uint8Array>();

    // 2. Duyệt từng mục trong central directory.
    for (let entry = 0; entry < entryCount && offset + 46 <= bytes.length; entry += 1) {
      if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) break;

      const method = view.getUint16(offset + 10, true); // 0 = STORED, 8 = DEFLATE
      const compressedSize = view.getUint32(offset + 20, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);

      const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

      // 3. Đọc dữ liệu từ local header (bỏ qua tên + extra của local header).
      if (
        localOffset + 30 <= bytes.length &&
        view.getUint32(localOffset, true) === LOCAL_SIGNATURE
      ) {
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const dataEnd = dataStart + compressedSize;
        if (dataEnd <= bytes.length) {
          const raw = bytes.subarray(dataStart, dataEnd);
          try {
            const data = method === 8 ? await inflateRaw(raw) : raw;
            if (method === 0 || method === 8) entries.set(name, data);
          } catch {
            // Mục hỏng — bỏ qua, các mục khác vẫn đọc được.
          }
        }
      }

      offset += 46 + nameLength + extraLength + commentLength;
    }

    return entries.size > 0 ? entries : null;
  } catch {
    return null;
  }
}

/** Giải mã các ký tự XML entity cơ bản (&amp; &lt; &gt; &quot; &apos; &#x..; &#..;). */
export function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
