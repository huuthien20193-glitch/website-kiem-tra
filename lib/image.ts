import type { ClipboardEvent } from 'react';

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Đọc ảnh và thu nhỏ trước khi lưu vào localStorage để tránh vượt quá dung lượng.
 */
export async function optimizeImage(file: File, maxSize = 1600, quality = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Tệp được chọn không phải là ảnh.');
  }

  const originalDataUrl = await readAsDataUrl(file);

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const largestSide = Math.max(image.width, image.height);
      const scale = largestSide > maxSize ? maxSize / largestSide : 1;

      if (scale === 1 && file.size < 350_000) {
        resolve(originalDataUrl);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));

      const context = canvas.getContext('2d');
      if (!context) {
        resolve(originalDataUrl);
        return;
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    image.onerror = () => resolve(originalDataUrl);
    image.src = originalDataUrl;
  });
}

export function dataUrlFromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function imageFilesFromClipboard(event: ClipboardEvent): File[] {
  const items = event.clipboardData?.items;
  if (!items) return [];
  const files: File[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}
