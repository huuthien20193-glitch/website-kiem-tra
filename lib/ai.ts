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

async function post<T>(body: unknown): Promise<T> {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
