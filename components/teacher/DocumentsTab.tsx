'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Bot,
  Eye,
  FileText,
  FileUp,
  LoaderCircle,
  ScanText,
  Send,
  Sparkles,
  Table2,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import type { TeacherDocument } from '@/lib/types';
import { cn, formatNumber } from '@/lib/utils';
import {
  extractDocumentContent,
  FILE_KIND_LABELS,
  formatFileSize,
  parseDocumentContent,
} from '@/lib/documents';
import {
  aiOcrDocument,
  aiPayloadFromDocument,
  aiReadiness,
  aiSummarizeDocument,
  aiChat,
  type ChatEntry,
} from '@/lib/ai';
import { AiKeyBanner } from './AiKeyBanner';
import { createClient, deleteDocumentFromCloud, saveDocumentToCloud } from '@/lib/supabase';
import { useConfirm, useToast } from '@/components/ui/FeedbackProvider';

type DocumentsTabProps = {
  documents: TeacherDocument[];
  onDocumentsChange: (documents: TeacherDocument[]) => void;
};

const KIND_BADGES: Record<TeacherDocument['fileType'], string> = {
  pdf: 'bg-rose-50 text-rose-700 ring-rose-600/10',
  docx: 'bg-sky-50 text-sky-700 ring-sky-600/10',
  pptx: 'bg-orange-50 text-orange-700 ring-orange-600/10',
  text: 'bg-slate-100 text-slate-700 ring-slate-600/10',
  image: 'bg-amber-50 text-amber-700 ring-amber-600/10',
};

/** Tài liệu cần OCR: là ảnh hoặc PDF scan (không có chữ trích xuất được). */
function needsOcr(document: TeacherDocument): boolean {
  if (document.fileType === 'image') return true;
  return document.fileType === 'pdf' && !document.content.trim() && Boolean(document.pdfData);
}

export function DocumentsTab({ documents, onDocumentsChange }: DocumentsTabProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  const [openPageByDoc, setOpenPageByDoc] = useState<Record<string, number>>({});
  const [summarizingId, setSummarizingId] = useState<string | null>(null);
  const [ocrRunningId, setOcrRunningId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [keyValid, setKeyValid] = useState<boolean | null>(null);

  // Trợ lý AI hỏi đáp theo tài liệu
  /** null = dùng mặc định (tất cả tài liệu). */
  const [chatDocs, setChatDocs] = useState<Set<string> | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatEntry[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void aiReadiness().then((readiness) => {
      setAiConfigured(readiness.ready);
      setKeyValid(readiness.reason === 'invalid' ? false : readiness.ready ? true : null);
    });
  }, []);

  const effectiveChatDocs = chatDocs ?? new Set(documents.map((document) => document.id));

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatMessages, chatSending]);

  const updateDocument = (updated: TeacherDocument) => {
    onDocumentsChange(documents.map((item) => (item.id === updated.id ? updated : item)));
    void saveDocumentToCloud(updated);
  };

  /** Nhận diện chữ bằng AI (OCR) cho tài liệu scan/ảnh — teacher duyệt lại sau đó. */
  const runOcr = async (target: TeacherDocument, silent = false): Promise<boolean> => {
    if (!target.imageData && !target.pdfData) return false;
    setOcrRunningId(target.id);
    try {
      const { text } = await aiOcrDocument(aiPayloadFromDocument(target));
      const analyzed = parseDocumentContent(text);
      if (!text.trim()) {
        updateDocument({
          ...target,
          ocrStatus: 'failed',
          ocrError: 'AI không đọc được nội dung nào trong tài liệu.',
        });
        if (!silent) toast.error('OCR không có kết quả', 'Tài liệu quá mờ hoặc sai định dạng ảnh.');
        return false;
      }
      updateDocument({
        ...target,
        content: text,
        pageCount: target.pageCount ?? (analyzed.pages.length || undefined) ?? 1,
        pages: analyzed.pages.length > 0 ? analyzed.pages : target.pages,
        detected: analyzed.detected,
        warnings: analyzed.warnings,
        ocrStatus: 'done',
        ocrError: undefined,
      });
      if (!silent) toast.success('Đã nhận diện chữ xong', `Kiểm tra lại nội dung của "${target.title}".`);
      return true;
    } catch (error) {
      updateDocument({
        ...target,
        ocrStatus: 'failed',
        ocrError: error instanceof Error ? error.message : 'Không nhận diện được chữ.',
      });
      if (!silent) toast.error('OCR gặp sự cố', error instanceof Error ? error.message : 'Vui lòng thử lại.');
      return false;
    } finally {
      setOcrRunningId(null);
    }
  };

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    const created: TeacherDocument[] = [];
    try {
      for (const file of files) {
        try {
          const extracted = await extractDocumentContent(file);
          const nameParts = file.name.replace(/\.[^.]+$/, '');
          const document: TeacherDocument = {
            id: (typeof crypto !== 'undefined' && crypto.randomUUID)
              ? crypto.randomUUID()
              : `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            title: nameParts || 'Tài liệu chưa đặt tên',
            fileName: file.name,
            fileType: extracted.fileType,
            fileSize: file.size,
            content: extracted.content,
            imageData: extracted.imageData,
            pdfData: extracted.pdfData,
            pageCount: extracted.pageCount,
            pages: extracted.pages,
            detected: extracted.detected,
            warnings: extracted.warnings,
            createdAt: new Date().toISOString(),
          };
          created.push(document);
          void saveDocumentToCloud(document);
        } catch (error) {
          toast.error(
            'Không đọc được tệp',
            `${file.name}: ${error instanceof Error ? error.message : 'Định dạng không hỗ trợ.'}`,
          );
        }
      }

      if (created.length > 0) {
        onDocumentsChange([...created, ...documents]);
        const ocrTargets = created.filter(needsOcr);
        const emptyText = created.filter((document) => !document.content.trim()).length;
        toast.success(
          'Đã tải lên ' + created.length + ' tài liệu',
          ocrTargets.length > 0 && aiConfigured === true && keyValid !== false
            ? `${ocrTargets.length} tài liệu scan/ảnh — đang nhận diện chữ bằng AI...`
            : emptyText > 0
              ? `${emptyText} tệp không có chữ (ảnh/PDF scan) — dùng "Nhận diện chữ bằng AI" để đọc nội dung.`
              : 'Nội dung đã sẵn sàng cho AI đọc và soạn đề.',
        );

        // Tự động OCR các tài liệu scan/ảnh (lần lượt từng tệp để không quá tải API).
        if (aiConfigured === true && keyValid !== false) {
          for (const target of ocrTargets) {
            await runOcr(target, true);
          }
        }
      }
    } finally {
      setUploading(false);
    }
  };

  const handleSummarize = async (document: TeacherDocument) => {
    if (summarizingId) return;
    setSummarizingId(document.id);
    try {
      const { summary } = await aiSummarizeDocument(document);
      updateDocument({ ...document, summary });
      setOpenDocId(document.id);
      toast.success('Đã tóm tắt tài liệu', document.title);
    } catch (error) {
      toast.error('AI gặp sự cố', error instanceof Error ? error.message : 'Vui lòng thử lại.');
    } finally {
      setSummarizingId(null);
    }
  };

  const handleDelete = async (document: TeacherDocument) => {
    const confirmed = await confirm({
      title: 'Xóa tài liệu này?',
      message: `"${document.title}" sẽ bị xóa và không còn dùng để soạn đề bằng AI.`,
      confirmLabel: 'Xóa tài liệu',
      tone: 'danger',
    });
    if (!confirmed) return;

    onDocumentsChange(documents.filter((item) => item.id !== document.id));
    void deleteDocumentFromCloud(document.id);
    if (openDocId === document.id) setOpenDocId(null);
    toast.success('Đã xóa tài liệu');
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatSending) return;
    const nextMessages: ChatEntry[] = [...chatMessages, { role: 'user', content: text }];
    setChatMessages(nextMessages);
    setChatInput('');
    setChatSending(true);
    try {
      // Chỉ kèm dữ liệu ảnh/PDF của 3 tài liệu đầu để tránh vượt giới hạn dung lượng yêu cầu.
      let binaryBudget = 3;
      const selected = documents
        .filter((document) => effectiveChatDocs.has(document.id))
        .map((document) => {
          const payload = aiPayloadFromDocument(document);
          if (payload.imageData || payload.pdfData) {
            if (binaryBudget <= 0) {
              return { ...payload, imageData: undefined, pdfData: undefined };
            }
            binaryBudget -= 1;
          }
          return payload;
        });

      const { reply } = await aiChat(nextMessages, selected);
      setChatMessages((current) => [...current, { role: 'assistant', content: reply }]);
    } catch (error) {
      toast.error('AI gặp sự cố', error instanceof Error ? error.message : 'Vui lòng thử lại.');
    } finally {
      setChatSending(false);
    }
  };

  const hasSupabase = createClient() !== null;

  return (
    <div className="space-y-6 animate-fade-up">
      <header>
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-lg shadow-violet-950/20">
            <BookOpen className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Tài liệu học tập</h1>
            <p className="text-sm text-slate-500">
              Tải tài liệu lên — AI đọc, OCR tài liệu scan và dùng chúng để soạn đề kiểm tra.
            </p>
          </div>
        </div>
      </header>

      {aiConfigured === false || (aiConfigured === true && keyValid === false) ? (
        <AiKeyBanner
          reason={keyValid === false ? 'invalid' : 'missing'}
          onSaved={() => {
            setAiConfigured(true);
            setKeyValid(true);
          }}
        />
      ) : null}

      {/* Khu tải tài liệu lên */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void addFiles(Array.from(event.dataTransfer.files));
          }}
          className={cn(
            'cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center outline-none transition',
            dragging
              ? 'border-violet-500 bg-violet-50 ring-4 ring-violet-500/10'
              : 'border-violet-300 bg-violet-50/30 hover:border-violet-400 hover:bg-violet-50/60 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10',
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept=".pdf,.docx,.pptx,.txt,.md,image/*"
            onChange={(event) => {
              void addFiles(Array.from(event.target.files || []));
              event.target.value = '';
            }}
          />
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white text-violet-600 shadow-sm">
            {uploading ? <LoaderCircle className="size-6 animate-spin" /> : <FileUp className="size-6" />}
          </span>
          <p className="mt-3 text-sm font-bold text-slate-800">
            {uploading ? 'Đang đọc tài liệu...' : 'Kéo thả hoặc chọn tệp tài liệu'}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            PDF · Word (.docx) · PowerPoint (.pptx) · TXT/MD · Ảnh — AI đọc được cả ảnh scan, giữ đúng thứ tự từng trang
          </p>
        </div>
      </section>

      {/* Danh sách tài liệu */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Tài liệu của bạn ({documents.length})</h2>
          {!hasSupabase ? (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
              Chỉ lưu trên thiết bị này
            </span>
          ) : null}
        </div>

        {documents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-8 text-center">
            <FileText className="mx-auto size-8 text-slate-300" />
            <p className="mt-2 text-xs font-bold text-slate-600">Chưa có tài liệu nào</p>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Tải lên bài giảng, sách giáo khoa hoặc đề thi cũ để AI dựa vào đó soạn đề mới.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((document) => {
              const open = openDocId === document.id;
              const analyzed = document.pages?.length
                ? { pages: document.pages, detected: document.detected, warnings: document.warnings ?? [] }
                : parseDocumentContent(document.content);
              // detected là cột tùy chọn trên bản lưu cũ — fallback về giá trị 0.
              const detected = analyzed.detected ?? { images: 0, tables: 0, formulas: 0 };
              const pages = analyzed.pages;
              const warnings = analyzed.warnings ?? [];
              const canOcr = needsOcr(document);
              const pageNumbers = pages.length > 1 ? pages.map((page) => page.page) : [];
              const activePage = openPageByDoc[document.id] ?? pageNumbers[0] ?? 1;
              const activePageData = pages.find((page) => page.page === activePage) ?? pages[0];

              return (
                <div key={document.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/60">
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    {document.fileType === 'image' && document.imageData ? (
                      <button
                        type="button"
                        onClick={() => setPreviewImage(document.imageData ?? null)}
                        className="shrink-0 overflow-hidden rounded-xl ring-1 ring-slate-200"
                        aria-label="Xem ảnh"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={document.imageData} alt={document.title} className="h-14 w-20 object-cover" />
                      </button>
                    ) : null}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-bold ring-1',
                            KIND_BADGES[document.fileType],
                          )}
                        >
                          {FILE_KIND_LABELS[document.fileType]}
                        </span>
                        <p className="truncate text-sm font-bold text-slate-800">{document.title}</p>
                        {document.pageCount ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                            {document.fileType === 'pptx' ? `${document.pageCount} slide` : `${document.pageCount} trang`}
                          </span>
                        ) : null}
                        {ocrRunningId === document.id || document.ocrStatus === 'pending' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">
                            <LoaderCircle className="size-3 animate-spin" /> Đang nhận diện chữ...
                          </span>
                        ) : document.ocrStatus === 'done' ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                            Đã OCR
                          </span>
                        ) : document.ocrStatus === 'failed' ? (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                            OCR lỗi
                          </span>
                        ) : null}
                      </div>

                      {/* Hình ảnh / bảng biểu / công thức phát hiện được */}
                      {detected.images + detected.tables + detected.formulas > 0 ? (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {detected.images > 0 ? (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
                              {detected.images} hình ảnh
                            </span>
                          ) : null}
                          {detected.tables > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-xs font-bold text-sky-700 ring-1 ring-sky-200">
                              <Table2 className="size-3" /> {detected.tables} bảng biểu
                            </span>
                          ) : null}
                          {detected.formulas > 0 ? (
                            <span className="rounded bg-violet-50 px-1.5 py-0.5 text-xs font-bold text-violet-700 ring-1 ring-violet-200">
                              {detected.formulas} dòng công thức
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      <p className="mt-0.5 text-xs font-medium text-slate-500">
                        {document.fileName || '—'} · {formatFileSize(document.fileSize)} ·{' '}
                        {document.content.trim()
                          ? `${formatNumber(document.content.trim().split(/\s+/).length)} từ`
                          : 'Nội dung dạng ảnh/PDF scan'}
                        {document.summary ? ' · Đã có tóm tắt AI' : ''}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setOpenDocId(open ? null : document.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
                      >
                        <Eye className="size-3.5" />
                        {open ? 'Đóng' : 'Nội dung'}
                      </button>
                      {canOcr && aiConfigured !== false ? (
                        <button
                          type="button"
                          onClick={() => void runOcr(document)}
                          disabled={ocrRunningId !== null || summarizingId !== null}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 transition hover:bg-violet-100 disabled:opacity-60"
                        >
                          {ocrRunningId === document.id ? (
                            <LoaderCircle className="size-3.5 animate-spin" />
                          ) : (
                            <ScanText className="size-3.5" />
                          )}
                          Nhận diện chữ bằng AI
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void handleSummarize(document)}
                        disabled={summarizingId !== null}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
                      >
                        {summarizingId === document.id ? (
                          <LoaderCircle className="size-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="size-3.5" />
                        )}
                        Tóm tắt bằng AI
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(document)}
                        className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold text-rose-500 transition hover:bg-rose-100"
                      >
                        <Trash2 className="size-3.5" /> Xóa
                      </button>
                    </div>
                  </div>

                  {open ? (
                    <div className="border-t border-slate-200 bg-white p-4">
                      {document.ocrStatus === 'failed' && document.ocrError ? (
                        <div className="mb-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700">
                          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                          {document.ocrError}
                        </div>
                      ) : null}

                      {warnings.length > 0 ? (
                        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                          <p className="mb-1 text-xs font-bold text-amber-800">Cảnh báo khi đọc tài liệu:</p>
                          <ul className="list-inside list-disc space-y-0.5">
                            {warnings.slice(0, 6).map((warning, index) => (
                              <li key={index} className="text-xs font-medium text-amber-700">
                                {warning}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {document.summary ? (
                        <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
                          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-violet-700">
                            <Sparkles className="size-3" /> Tóm tắt AI
                          </p>
                          <p className="whitespace-pre-wrap text-xs font-medium leading-relaxed text-slate-700">
                            {document.summary}
                          </p>
                        </div>
                      ) : null}

                      {pages.length > 1 ? (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {pageNumbers.map((pageNumber) => {
                            const pageData = pages.find((page) => page.page === pageNumber);
                            return (
                              <button
                                key={pageNumber}
                                type="button"
                                onClick={() => setOpenPageByDoc((current) => ({ ...current, [document.id]: pageNumber }))}
                                className={cn(
                                  'rounded-lg px-2.5 py-1 text-xs font-bold transition',
                                  activePage === pageNumber
                                    ? 'bg-violet-600 text-white shadow-sm'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                                  pageData?.status === 'failed' && activePage !== pageNumber ? 'text-rose-600' : '',
                                  pageData?.status === 'low' && activePage !== pageNumber ? 'text-amber-600' : '',
                                )}
                                title={pageData?.status === 'failed' ? 'Trang không đọc được' : pageData?.status === 'low' ? 'Trang ít chữ' : `Trang ${pageNumber}`}
                              >
                                {pageNumber}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}

                      {document.content.trim() ? (
                        <div className="max-h-72 overflow-y-auto rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                          {activePageData ? (
                            <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                              {activePageData.text || '(Trang này không có nội dung chữ — có thể là hình ảnh.)'}
                            </p>
                          ) : (
                            <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                              {document.content}
                            </p>
                          )}
                        </div>
                      ) : document.imageData ? (
                        <button type="button" onClick={() => setPreviewImage(document.imageData ?? null)}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={document.imageData}
                            alt={document.title}
                            className="max-h-72 rounded-xl object-contain ring-1 ring-slate-200"
                          />
                        </button>
                      ) : (
                        <p className="text-xs font-medium text-slate-500">
                          Tệp này không trích xuất được chữ.
                          {canOcr && aiConfigured !== false
                            ? ' Hãy dùng nút "Nhận diện chữ bằng AI" để đọc nội dung.'
                            : ' Cần API key Gemini để AI đọc trực tiếp nội dung.'}
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Trợ lý AI hỏi đáp */}
      <section className="rounded-2xl border border-violet-200/70 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white">
            <Bot className="size-4.5" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Hỏi đáp với AI về tài liệu</h2>
            <p className="text-xs font-medium text-slate-500">
              Ví dụ: “Đề tài liệu này gồm những phần nào?” · “Ra 5 câu hỏi ôn tập từ tài liệu số 2”
            </p>
          </div>
        </div>

        {documents.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {documents.map((document) => {
              const active = effectiveChatDocs.has(document.id);
              return (
                <button
                  key={document.id}
                  type="button"
                  onClick={() =>
                    setChatDocs(() => {
                      const next = new Set(effectiveChatDocs);
                      if (next.has(document.id)) next.delete(document.id);
                      else next.add(document.id);
                      return next;
                    })
                  }
                  className={cn(
                    'max-w-[240px] truncate rounded-full border px-3 py-1 text-xs font-bold transition',
                    active
                      ? 'border-violet-300 bg-violet-50 text-violet-700'
                      : 'border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-600',
                  )}
                  title={document.title}
                >
                  {active ? '✓ ' : ''}
                  {document.title}
                </button>
              );
            })}
          </div>
        ) : null}

        <div
          ref={chatScrollRef}
          className="max-h-80 min-h-40 space-y-3 overflow-y-auto rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100"
        >
          {chatMessages.length === 0 ? (
            <p className="py-6 text-center text-xs font-medium text-slate-500">
              Đặt câu hỏi về tài liệu — AI sẽ trả lời dựa trên nội dung bạn đã chọn.
            </p>
          ) : null}
          {chatMessages.map((message, index) => (
            <div
              key={index}
              className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed',
                  message.role === 'user'
                    ? 'rounded-br-md bg-emerald-600 font-semibold text-white'
                    : 'rounded-bl-md bg-white font-medium text-slate-700 ring-1 ring-slate-200',
                )}
              >
                {message.content}
              </div>
            </div>
          ))}
          {chatSending ? (
            <div className="flex items-center gap-2 text-xs font-bold text-violet-600">
              <LoaderCircle className="size-4 animate-spin" /> AI đang đọc tài liệu và soạn câu trả lời...
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex items-end gap-2">
          <textarea
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void sendChat();
              }
            }}
            rows={2}
            placeholder="Nhập câu hỏi... (Enter để gửi)"
            className="flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-medium outline-none transition placeholder:text-slate-500 focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-500/20"
          />
          <button
            type="button"
            onClick={() => void sendChat()}
            disabled={chatSending || !chatInput.trim()}
            className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
            aria-label="Gửi câu hỏi"
          >
            {chatSending ? <LoaderCircle className="size-4.5 animate-spin" /> : <Send className="size-4.5" />}
          </button>
        </div>
      </section>

      {previewImage ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-6 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            aria-label="Đóng xem trước"
          >
            <X className="size-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewImage}
            alt="Xem trước tài liệu"
            className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
