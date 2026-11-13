'use client';

import type { TeacherDocument } from './types';

/** Tài liệu gửi cho AI: văn bản + ảnh/PDF scan khi có. */
export type AiDocumentPayload = {
  title: string;
  content: string;
  imageData?: string;
  pdfData?: string;
};

export function aiPayloadFromDocument(document: TeacherDocument): AiDocumentPayload {
  return {
    title: document.title,
    content: document.content,
    imageData: document.imageData,
    pdfData: document.pdfData,
  };
}

/** Ô lưu API key Gemini trên trình duyệt giáo viên (không lưu ở server). */
const AI_KEY_STORAGE = 'thtedu:gemini_api_key';

export function getLocalAiKey(): string {
  if (typeof window === 'undefined') return '';
  return (window.localStorage.getItem(AI_KEY_STORAGE) || '').trim();
}

export function setLocalAiKey(key: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AI_KEY_STORAGE, key.trim());
}

export function clearLocalAiKey(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(AI_KEY_STORAGE);
}

/** Kiểm tra một key (giáo viên nhập hoặc key server) có dùng được không. */
export async function validateAiKey(key: string): Promise<boolean> {
  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'validate-key', apiKey: key.trim() }),
    });
    const data = (await response.json().catch(() => ({}))) as { valid?: boolean };
    return Boolean(data.valid);
  } catch {
    return false;
  }
}

export type AiReadiness = { ready: boolean; reason: 'missing' | 'invalid' | null };

/** AI sẵn sàng chưa? Ưu tiên key giáo viên lưu trên máy, sau đó đến key server. */
export async function aiReadiness(): Promise<AiReadiness> {
  const local = getLocalAiKey();
  if (local) {
    const valid = await validateAiKey(local);
    if (valid) return { ready: true, reason: null };
  }
  try {
    const response = await fetch('/api/ai');
    const status = (await response.json()) as { configured?: boolean; keyValid?: boolean | null };
    if (status.configured && status.keyValid !== false) return { ready: true, reason: null };
    return { ready: false, reason: status.configured ? 'invalid' : 'missing' };
  } catch {
    return { ready: false, reason: 'missing' };
  }
}

async function post<T>(body: unknown): Promise<T> {
  // Gắn key Gemini giáo viên lưu trên máy (nếu có) vào mọi request AI.
  const localKey = getLocalAiKey();
  const payload =
    typeof body === 'object' && body !== null
      ? { apiKey: localKey || undefined, ...body }
      : body;
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || data.ok !== true) {
    throw new Error((data.message as string) || 'AI gặp sự cố, vui lòng thử lại.');
  }
  return data as T;
}

export async function aiStatus(): Promise<{ configured: boolean; keyValid?: boolean | null; model?: string }> {
  try {
    const response = await fetch('/api/ai');
    const data = (await response.json()) as { configured?: boolean; keyValid?: boolean | null; model?: string };
    return { configured: Boolean(data.configured), keyValid: data.keyValid, model: data.model };
  } catch {
    return { configured: false };
  }
}

export function aiSummarizeDocument(document: TeacherDocument) {
  return post<{ summary: string }>({ action: 'summarize', document: aiPayloadFromDocument(document) });
}

export type ChatEntry = { role: 'user' | 'assistant'; content: string };

export function aiChat(messages: ChatEntry[], documents: AiDocumentPayload[]) {
  return post<{ reply: string }>({ action: 'chat', messages, documents });
}

export type AiExamOptions = {
  subject: string;
  grade: number;
  durationMinutes: number;
  totalPoints: number;
  mcqCount: number;
  shortAnswerCount: number;
  essayCount: number;
  difficulty: string;
  examType: string;
  notes: string;
};

export type AiMcqDraft = {
  content?: string;
  options?: unknown;
  correctIndex?: unknown;
  explanation?: unknown;
};

export type AiShortDraft = {
  content?: unknown;
  answer?: unknown;
  points?: unknown;
  explanation?: unknown;
};

export type AiEssayDraft = {
  content?: unknown;
  subParts?: Array<{ label?: unknown; content?: unknown; points?: unknown }>;
  rubric?: unknown;
  points?: unknown;
};

export type AiExamDraft = {
  title?: unknown;
  subject?: unknown;
  grade?: unknown;
  durationMinutes?: unknown;
  totalPoints?: unknown;
  mcq?: AiMcqDraft[];
  shortAnswers?: AiShortDraft[];
  essays?: AiEssayDraft[];
};

export function aiGenerateExam(documents: AiDocumentPayload[], options: AiExamOptions) {
  return post<{ draft: AiExamDraft }>({ action: 'generate-exam', documents, options });
}
