'use client';

import { useMemo, useState } from 'react';
import {
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
import type { Exam, Grade } from '@/lib/types';
import { GRADES, gradeLabel, subjectStyle } from '@/lib/types';
import { cn, formatDate, formatNumber } from '@/lib/utils';

type ExamsTabProps = {
  exams: Exam[];
  onCreate: () => void;
  onDelete: (exam: Exam) => void;
  onDuplicate: (exam: Exam) => void;
  onUpdateGrade: (exam: Exam, grade: Grade) => void | Promise<void>;
};

export function ExamsTab({ exams, onCreate, onDelete, onDuplicate, onUpdateGrade }: ExamsTabProps) {
  const [keyword, setKeyword] = useState('');
  const [subject, setSubject] = useState('all');
  const [gradeFilter, setGradeFilter] = useState<'all' | 'none' | Grade>('all');

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
    const { jsPDF } = await import('jspdf');
    const autoTable = await import('jspdf-autotable');

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;

    let y = 20;

    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 185, 129);
    doc.text('TRƯỜNG HỌC / TRUNG TÂM GIÁO DỤC', margin, y, { align: 'center' });

    y += 8;
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text('ĐỀ KIỂM TRA', margin, y, { align: 'center' });

    y += 8;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(90, 90, 90);
    doc.text(
      `Môn: ${exam.subject}   |   ${gradeLabel(exam.grade)}   |   Thời gian: ${exam.durationMinutes} phút   |   Tổng điểm: ${exam.totalPoints}`,
      margin,
      y,
      { align: 'center' },
    );

    y += 12;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`Tên đề: ${exam.title}`, margin, y);

    // Trắc nghiệm
    y += 10;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('I. PHẦN TRẮC NGHIỆM', margin, y);

    y += 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Số câu: ${exam.mcqCount} · Điểm/câu: ${exam.mcqPointPerQ}`,
      margin,
      y,
    );

    y += 6;
    if (exam.mcqImages?.length > 0) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(120, 120, 120);
      doc.text('[Ảnh đề trắc nghiệm được đính kèm riêng trong hệ thống]', margin, y);
      y += 6;
    }

    if (exam.mcqAnswers?.length > 0) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Đáp án trắc nghiệm:', margin, y);
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
        headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 20 } },
      });

      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // Tự luận
    if ((exam.essayQuestions?.length ?? 0) > 0) {
      y += 4;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('II. PHẦN TỰ LUẬN', margin, y);

      y += 6;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Số câu: ${exam.essayQuestions.length}`, margin, y);

      y += 6;
      (exam.essayQuestions ?? []).forEach((q, qi) => {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(
          `${q.questionLabel || `Câu ${qi + 1}`}. ${q.questionLabel || ''}`,
          margin,
          y,
        );
        y += 5;

        (q.subParts ?? []).forEach((part: any) => {
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.text(
            `   ${part.label}. ${part.content || ''} (${part.points} điểm)`,
            margin,
            y,
          );
          y += 5;
        });

        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(120, 120, 120);
        doc.text(`Rubric: ${q.rubric || 'Chưa có hướng dẫn chấm điểm'}`, margin, y);
        y += 8;

        if (y > 280) {
          doc.addPage();
          y = 20;
        }
      });
    }

    const fileName = `${exam.title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
    doc.save(fileName);
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
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

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="Tìm theo tên đề hoặc môn học..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-10 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
          />
          {keyword ? (
            <button
              type="button"
              onClick={() => setKeyword('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100"
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
        <span className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-[11px] font-bold text-emerald-700">
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
                  'rounded-full px-1.5 py-0.5 text-[10px] font-black',
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
        <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center">
          <span className="flex size-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-400">
            <Layers className="size-7" />
          </span>
          <div>
            <p className="text-base font-black text-slate-800">
              {exams.length === 0 ? 'Chưa có đề kiểm tra nào' : 'Không tìm thấy đề phù hợp'}
            </p>
            <p className="mt-1 text-sm text-slate-400">
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
              className="group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-900/5"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 opacity-0 transition group-hover:opacity-100" />

              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ring-1', subjectStyle(exam.subject))}>
                    {exam.subject}
                  </span>
                  <label
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-indigo-700 ring-1 ring-indigo-600/10"
                    title="Đổi khối lớp"
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
                      className="cursor-pointer bg-transparent text-[10px] font-black uppercase tracking-wide text-indigo-700 outline-none"
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
                    title="Nhân bản đề"
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600"
                  >
                    <Copy className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void exportToPdf(exam);
                    }}
                    title="Xuất PDF"
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-amber-50 hover:text-amber-600"
                  >
                    <Download className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(exam)}
                    title="Xóa đề"
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>

              <h3 className="mt-3 line-clamp-2 min-h-[2.75rem] text-base font-black leading-snug text-slate-900">
                {exam.title}
              </h3>

              <div className="mt-4 grid grid-cols-3 divide-x divide-slate-100 rounded-2xl bg-slate-50 py-3 text-center">
                <div>
                  <p className="flex items-center justify-center gap-1 text-sm font-black text-slate-800">
                    <Clock3 className="size-3.5 text-emerald-500" />
                    {exam.durationMinutes}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Phút</p>
                </div>
                <div>
                  <p className="flex items-center justify-center gap-1 text-sm font-black text-slate-800">
                    <Layers className="size-3.5 text-sky-500" />
                    {exam.mcqCount}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Trắc nghiệm</p>
                </div>
                <div>
                  <p className="flex items-center justify-center gap-1 text-sm font-black text-slate-800">
                    <Layers className="size-3.5 text-violet-500" />
                    {exam.essayQuestions.length}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tự luận</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-[11px] font-semibold text-slate-400">
                  {exam.createdAt ? `Tạo ngày ${formatDate(exam.createdAt)}` : 'Đề kiểm tra'}
                </span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">
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
