/**
 * Figure Engine — sinh hình minh họa cho câu hỏi theo nguyên tắc "SVG trước".
 *
 * Ưu tiên thứ tự:
 *  1. Vẽ bằng CODE (xác định 100%, không phụ thuộc AI): biểu đồ cột (bar),
 *     đồ thị hàm số y=f(x) (graph) — hình sạch, nhãn rõ, in PDF đẹp.
 *  2. AI trả về code SVG cho hình hình học/sơ đồ (shape) → qua bộ lọc
 *     `sanitizeSvg` để loại bỏ script, sự kiện, liên kết ngoài trước khi dùng.
 *
 * Kết quả cuối cùng là chuỗi SVG hoặc data URL SVG, lưu thẳng vào
 * `questionImage` / `image` của câu hỏi (giống ảnh data URL hiện có) nên
 * mọi nơi render (GV, HS, kết quả) không cần thay đổi gì.
 */

import { evaluateExpression } from './quality';

/** Biểu đồ cột: nhãn + giá trị (dùng cho thống kê, dữ liệu bảng). */
export type BarFigure = {
  kind: 'bar';
  title?: string;
  labels: string[];
  values: number[];
  unit?: string;
};

/** Đồ thị hàm số y = f(x): biểu thức theo biến x, hệ thống tự tính điểm. */
export type GraphFigure = {
  kind: 'graph';
  title?: string;
  /** Biểu thức theo biến x — phép nhân viết rõ ràng (2*x, không phải 2x). */
  expression: string;
  xMin: number;
  xMax: number;
  yMin?: number;
  yMax?: number;
  xLabel?: string;
  yLabel?: string;
};

/** Hình vẽ tự do (hình học, sơ đồ): AI trả code SVG, hệ thống lọc an toàn. */
export type ShapeFigure = {
  kind: 'shape';
  svg: string;
};

export type FigureSpec = BarFigure | GraphFigure | ShapeFigure;

/* ------------------------------ Lọc SVG an toàn ------------------------------ */

/** Độ dài tối đa cho phép của một code SVG do AI trả về. */
const MAX_SVG_LENGTH = 50_000;

/**
 * Làm sạch code SVG từ AI: loại script, thuộc tính sự kiện (on*),
 * liên kết ngoài và javascript:, chuẩn hóa viewBox để co giãn được.
 * Trả về chuỗi SVG hợp lệ hoặc null nếu không dùng được.
 */
export function sanitizeSvg(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  let svg = raw.trim();
  if (svg.length > MAX_SVG_LENGTH * 2) return null;

  // Chỉ giữ từ <svg ...> đến </svg> (bỏ XML prolog, DOCTYPE, chữ thừa).
  const start = svg.indexOf('<svg');
  const end = svg.lastIndexOf('</svg>');
  if (start === -1 || end === -1 || end <= start) return null;
  svg = svg.slice(start, end + 6);

  // Loại các phần tử nguy hiểm (kể cả dạng tự đóng).
  svg = svg
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script[^>]*\/?>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/<foreignObject[^>]*\/?>/gi, '')
    .replace(/<iframe[\s\S]*?(<\/iframe\s*>|\/?>)/gi, '')
    .replace(/<use[^>]*>/gi, '');

  // Loại thuộc tính sự kiện (onclick, onload, ...) và liên kết ngoài/javascript:.
  svg = svg
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\son\w+\s*=\s*\{[^}]*\}/gi, '')
    .replace(/(xlink:)?href\s*=\s*("|')\s*(https?:)?\/\/[^"']*\2/gi, '')
    .replace(/(xlink:)?href\s*=\s*("|')\s*javascript:[^"']*\2/gi, '')
    .replace(/javascript:/gi, '');

  if (svg.length > MAX_SVG_LENGTH) return null;
  if (!/<svg[^>]*>[\s\S]+<\/svg\s*>/i.test(svg)) return null;

  // Bảo đảm có viewBox để hình co giãn đúng trong <img> và khi in PDF.
  if (!/viewBox\s*=/i.test(svg)) {
    const width = Number(/<svg[^>]*\bwidth\s*=\s*"([\d.]+)/i.exec(svg)?.[1] ?? 0);
    const height = Number(/<svg[^>]*\bheight\s*=\s*"([\d.]+)/i.exec(svg)?.[1] ?? 0);
    const box =
      Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
        ? `0 0 ${Math.round(width)} ${Math.round(height)}`
        : '0 0 400 300';
    svg = svg.replace(/<svg([^>]*)>/i, `<svg$1 viewBox="${box}" preserveAspectRatio="xMidYMid meet">`);
  }
  return svg;
}

/** Đóng gói chuỗi SVG thành data URL dùng trực tiếp trong <img src>. */
export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Kích thước tối đa của data URL hình (chặn đề phình to trong jsonb). */
const MAX_DATA_URL_LENGTH = 200_000;

/* ------------------------------ Định dạng số ------------------------------ */

/** Format số gọn cho nhãn trục: bỏ số 0 dư, tối đa 4 số lẻ. */
function fmtNumber(value: number): string {
  if (!Number.isFinite(value)) return '?';
  const rounded = Number(value.toFixed(4));
  return String(rounded);
}

/** Thay biến x trong biểu thức bằng một giá trị cụ thể rồi tính bằng QC evaluator. */
function evaluateAtX(expression: string, x: number): number | null {
  if (!/^[x\d\s+\-*/^().,]+$/i.test(expression)) return null;
  const value = Number(x.toFixed(6)); // tránh 0.30000000000000004 trên nhãn/biểu thức
  const substituted = expression.replace(/\bx\b/gi, `(${fmtNumber(value)})`);
  return evaluateExpression(substituted);
}

/* ------------------------------ Vẽ biểu đồ cột ------------------------------ */

const PALETTE = ['#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#6366f1'];

/** Làm tròn "đẹp" lên để trục Y kết thúc ở số tròn(x1.15). */
function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  const scaled = value / power;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10;
  return nice * power;
}

/** Rút gọn nhãn hiển thị trên trục. */
function truncateLabel(label: string, max: number): string {
  const text = label.trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Vẽ biểu đồ cột xác định (không dùng AI) — trả SVG hoặc null nếu dữ liệu hỏng. */
function renderBarFigure(spec: BarFigure): string | null {
  const labels = (spec.labels || []).map((label) => String(label ?? '')).slice(0, 12);
  const values = (spec.values || []).map((value) => Number(value)).slice(0, 12);
  if (labels.length === 0 || values.length === 0 || labels.length !== values.length) return null;
  if (!values.every((value) => Number.isFinite(value))) return null;

  const width = 460;
  const height = 280;
  const padLeft = 52;
  const padRight = 18;
  const padTop = spec.title ? 42 : 24;
  const padBottom = 46;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const maxValue = Math.max(...values, 0);
  const top = niceCeil(maxValue === 0 ? 1 : maxValue * 1.15);
  const yScale = (value: number) => padTop + plotHeight * (1 - Math.max(0, value) / top);

  // Đường lưới ngang + nhãn trục Y (5 mức).
  const gridLines: string[] = [];
  for (let index = 0; index <= 5; index += 1) {
    const value = (top / 5) * index;
    const y = yScale(value);
    gridLines.push(
      `<line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1" />`,
      `<text x="${padLeft - 6}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="#64748b">${fmtNumber(value)}</text>`,
    );
  }

  // Cột dữ liệu + nhãn giá trị trên cột.
  const slot = plotWidth / values.length;
  const barWidth = Math.min(slot * 0.62, 52);
  const bars: string[] = [];
  values.forEach((value, index) => {
    const y = yScale(value);
    const barHeight = padTop + plotHeight - y;
    const x = padLeft + slot * index + (slot - barWidth) / 2;
    bars.push(
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(1, barHeight).toFixed(1)}" rx="4" fill="${PALETTE[index % PALETTE.length]}" />`,
      `<text x="${(x + barWidth / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="bold" fill="#0f172a">${fmtNumber(value)}</text>`,
      `<text x="${(padLeft + slot * index + slot / 2).toFixed(1)}" y="${padTop + plotHeight + 16}" text-anchor="middle" font-size="10.5" fill="#334155">${escapeXml(truncateLabel(labels[index], 12))}</text>`,
    );
  });

  const unitText = spec.unit ? ` — đơn vị: ${escapeXml(spec.unit)}` : '';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="'Be Vietnam Pro', Arial, sans-serif">`,
    `<rect width="${width}" height="${height}" fill="#ffffff" />`,
    spec.title
      ? `<text x="${width / 2}" y="22" text-anchor="middle" font-size="13" font-weight="bold" fill="#0f172a">${escapeXml(spec.title)}</text>`
      : '',
    ...gridLines,
    `<line x1="${padLeft}" y1="${padTop + plotHeight}" x2="${width - padRight}" y2="${padTop + plotHeight}" stroke="#94a3b8" stroke-width="1.5" />`,
    ...bars,
    unitText ? `<text x="${width - padRight}" y="${padTop + plotHeight + 34}" text-anchor="end" font-size="10" fill="#64748b">${unitText}</text>` : '',
    `</svg>`,
  ]
    .filter(Boolean)
    .join('');
}

/** Escape ký tự XML để nhúng nhãn tiếng Việt an toàn vào SVG. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ------------------------------ Vẽ đồ thị hàm số ------------------------------ */

const GRAPH_SAMPLES = 120;

/**
 * Vẽ đồ thị y = f(x) xác định: thay x vào biểu thức rồi dùng evaluateExpression
 * (cùng bộ tính toán với QC Engine) để tính từng điểm — không đánh giá chuỗi tùy ý.
 */
function renderGraphFigure(spec: GraphFigure): string | null {
  const expression = String(spec.expression ?? '').trim();
  const xMin = Number(spec.xMin);
  const xMax = Number(spec.xMax);
  if (!expression || !Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax <= xMin) return null;
  if (!/\bx\b/i.test(expression)) return null; // phải là hàm theo biến x

  // Tính điểm dữ liệu; chỗ evaluator không tính được (điểm rời, chia 0) bỏ trống.
  const step = (xMax - xMin) / GRAPH_SAMPLES;
  const samples: Array<{ x: number; y: number }> = [];
  for (let index = 0; index <= GRAPH_SAMPLES; index += 1) {
    const x = xMin + step * index;
    const y = evaluateAtX(expression, x);
    if (y !== null && Number.isFinite(y) && Math.abs(y) < 1e9) samples.push({ x, y });
  }
  if (samples.length < 4) return null;

  const width = 460;
  const height = 320;
  const padLeft = 54;
  const padRight = 20;
  const padTop = spec.title ? 42 : 26;
  const padBottom = 46;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  // Phạm vi Y: ưu tiên do giáo viên/AI khai báo; tự tính thì dùng phân vị 10–90%
  // để loại giá trị đuôi gần tiệm cận (ví dụ 1/(x-1) nhảy tới ±hàng nghìn).
  const sortedY = samples.map((point) => point.y).sort((a, b) => a - b);
  let yLo = Number.isFinite(Number(spec.yMin)) ? Number(spec.yMin) : sortedY[Math.floor(sortedY.length * 0.1)];
  let yHi = Number.isFinite(Number(spec.yMax)) ? Number(spec.yMax) : sortedY[Math.ceil(sortedY.length * 0.9) - 1];
  if (!Number.isFinite(yLo) || !Number.isFinite(yHi) || yHi <= yLo) {
    // Degenerate (hàm hằng, phân vị trùng): nới hai biên quanh giá trị.
    const center = Number.isFinite(yLo) ? yLo : 0;
    yLo = center - 1;
    yHi = center + 1;
  }
  // Điểm ngoài khung (gần tiệm cận) bị cắt — đường cong đứt tại đó, không vẽ tràn.
  const visibleLo = yLo - (yHi - yLo) * 0.08;
  const visibleHi = yHi + (yHi - yLo) * 0.08;
  const yScale = (y: number) => padTop + plotHeight * (1 - (y - visibleLo) / (visibleHi - visibleLo));
  const xScale = (x: number) => padLeft + plotWidth * ((x - xMin) / (xMax - xMin));

  // Đường cong: cắt polyline tại điểm ngoài khung hiển thị (tiệm cận, điểm rời).
  const segments: string[] = [];
  let current: Array<{ x: number; y: number }> = [];
  const flush = () => {
    if (current.length >= 2) {
      const points = current
        .map((point) => `${xScale(point.x).toFixed(1)},${yScale(point.y).toFixed(1)}`)
        .join(' ');
      segments.push(`<polyline points="${points}" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />`);
    }
    current = [];
  };
  samples.forEach((point) => {
    if (point.y < visibleLo || point.y > visibleHi) {
      flush(); // điểm ngoài khung → ngắt nét tại đây, bỏ điểm
      return;
    }
    current.push(point);
  });
  flush();

  // Lưới + nhãn trục.
  const gridLines: string[] = [];
  for (let index = 0; index <= 5; index += 1) {
    const y = yLo + ((yHi - yLo) / 5) * index;
    const py = yScale(y);
    gridLines.push(
      `<line x1="${padLeft}" y1="${py.toFixed(1)}" x2="${width - padRight}" y2="${py.toFixed(1)}" stroke="#e2e8f0" stroke-width="1" />`,
      `<text x="${padLeft - 6}" y="${(py + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="#64748b">${fmtNumber(y)}</text>`,
    );
  }
  for (let index = 0; index <= 6; index += 1) {
    const x = xMin + ((xMax - xMin) / 6) * index;
    const px = xScale(x);
    gridLines.push(
      `<line x1="${px.toFixed(1)}" y1="${padTop}" x2="${px.toFixed(1)}" y2="${padTop + plotHeight}" stroke="#eef2f7" stroke-width="1" />`,
      `<text x="${px.toFixed(1)}" y="${padTop + plotHeight + 16}" text-anchor="middle" font-size="10" fill="#64748b">${fmtNumber(x)}</text>`,
    );
  }

  // Hai trục toạ độ Oxy (mũi tên) — kẹp gốc O trong khung hiển thị.
  const originY = yScale(Math.min(visibleHi, Math.max(visibleLo, 0)));
  const originX = xScale(Math.min(xMax, Math.max(xMin, 0)));
  const axes = [
    `<line x1="${padLeft - 6}" y1="${originY.toFixed(1)}" x2="${width - padRight + 8}" y2="${originY.toFixed(1)}" stroke="#334155" stroke-width="1.5" marker-end="url(#arrow)" />`,
    `<line x1="${originX.toFixed(1)}" y1="${padTop + plotHeight + 6}" x2="${originX.toFixed(1)}" y2="${padTop - 10}" stroke="#334155" stroke-width="1.5" marker-end="url(#arrow)" />`,
    `<text x="${width - padRight + 4}" y="${originY - 6}" font-size="11" font-weight="bold" fill="#334155">${escapeXml(spec.xLabel || 'x')}</text>`,
    `<text x="${originX + 8}" y="${padTop - 2}" font-size="11" font-weight="bold" fill="#334155">${escapeXml(spec.yLabel || 'y')}</text>`,
    `<text x="${originX - 12}" y="${originY + 14}" font-size="11" fill="#334155">O</text>`,
  ];

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="'Be Vietnam Pro', Arial, sans-serif">`,
    '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#334155" /></marker></defs>',
    `<rect width="${width}" height="${height}" fill="#ffffff" />`,
    spec.title ? `<text x="${width / 2}" y="22" text-anchor="middle" font-size="13" font-weight="bold" fill="#0f172a">${escapeXml(spec.title)}</text>` : '',
    ...gridLines,
    ...axes,
    ...segments,
    `</svg>`,
  ]
    .filter(Boolean)
    .join('');
}

/* ------------------------------ Cổng vào chung ------------------------------ */

/**
 * Sinh SVG từ đặc tả hình (do AI hoặc hệ thống trả về).
 * Không bao giờ ném lỗi — dữ liệu hỏng thì trả null để bỏ qua hình.
 */
export function renderFigureSvg(spec: unknown): string | null {
  if (!spec || typeof spec !== 'object') {
    return typeof spec === 'string' ? sanitizeSvg(spec) : null;
  }
  const figure = spec as FigureSpec;
  try {
    if (figure.kind === 'bar') return renderBarFigure(figure);
    if (figure.kind === 'graph') return renderGraphFigure(figure);
    if (figure.kind === 'shape') return sanitizeSvg(figure.svg);
    return null;
  } catch {
    return null;
  }
}

/**
 * Trích hình minh họa từ một câu hỏi AI trả về (trường "figure").
 * Hỗ trợ cả 2 dạng AI hay trả:
 *  - object đặc tả { kind: 'bar'|'graph'|'shape', ... } → vẽ bằng code.
 *  - chuỗi code SVG thô → lọc an toàn rồi dùng.
 * Trả về data URL SVG hoặc undefined khi không có/hỏng.
 */
export function figureDataUrlFromAi(item: unknown): string | undefined {
  const figure = (item as { figure?: unknown } | null)?.figure;
  if (!figure) return undefined;
  let svg: string | null = null;
  if (typeof figure === 'string') {
    svg = figure.includes('<svg') ? sanitizeSvg(figure) : null;
  } else {
    svg = renderFigureSvg(figure);
  }
  if (!svg) return undefined;
  const dataUrl = svgToDataUrl(svg);
  return dataUrl.length <= MAX_DATA_URL_LENGTH ? dataUrl : undefined;
}
