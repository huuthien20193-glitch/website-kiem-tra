// Copy pdf.worker.mjs (worker của pdf.js dùng bởi pdf-parse bản web) vào public/
// để trình duyệt có thể tạo Web Worker cùng origin.
// Chạy tự động qua "postinstall" và "prebuild" trong package.json.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Tìm node_modules/pdf-parse đi ngược lên từ thư mục chứa script này
// (pdf-parse không export "./package.json" nên không dùng require.resolve được).
const scriptDir = dirname(fileURLToPath(import.meta.url));
let workerSource = null;
let current = scriptDir;
for (let depth = 0; depth < 6; depth += 1) {
  const candidate = join(current, 'node_modules', 'pdf-parse', 'dist', 'pdf-parse', 'web', 'pdf.worker.mjs');
  if (existsSync(candidate)) {
    workerSource = candidate;
    break;
  }
  current = dirname(current);
}

const publicDir = join(scriptDir, '..', 'public');
const workerTarget = join(publicDir, 'pdf.worker.mjs');

if (!workerSource) {
  console.warn('[copy-pdf-worker] Không tìm thấy pdf.worker.mjs trong node_modules/pdf-parse — bỏ qua.');
  process.exit(0);
}

if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
copyFileSync(workerSource, workerTarget);
console.log(`[copy-pdf-worker] Đã copy pdf.worker.mjs → public/`);
