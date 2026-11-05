'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileText,
  GraduationCap,
  Inbox,
  LogOut,
  Search,
  Sparkles,
  Timer,
  Trophy,
  UserRound,
  X,
} from 'lucide-react';
import type { Exam, Submission } from '@/lib/types';
import { subjectStyle } from '@/lib/types';
import { cn, formatNumber, initials, isPending } from '@/lib/utils';
import {
  clearSession,
  getStudentProfile,
  loadExams,
  saveStudentProfile,
  setStudentSession,
} from '@/lib/storage';
import { createClient, mapRowToSubmission } from '@/lib/supabase';
import { BrandLogo } from '@/components/ui/Brand';
import { useToast } from '@/components/ui/FeedbackProvider';
import { ExamRoom } from '@/components/student/ExamRoom';
import { ExamResult } from '@/components/student/ExamResult';
import { useIsClient } from '@/lib/hooks';

export default function StudentDashboard() {
  const router = useRouter();
  const toast = useToast();
  const isClient = useIsClient();

  const [exams, setExams] = useState<Exam[]>(() =>
    typeof window === 'undefined' ? [] : loadExams(),
  );
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [studentName, setStudentName] = useState(() =>
    typeof window === 'undefined' ? '' : getStudentProfile().name,
  );
  const [keyword, setKeyword] = useState('');
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [result, setResult] = useState<Submission | null>(null);
  const [practiceMode, setPracticeMode] = useState(false);

  useEffect(() => {
    if (!isClient) return;
    const timer = setTimeout(() => saveStudentProfile(studentName, ''), 350);
    return () => clearTimeout(timer);
  }, [isClient, studentName]);

  useEffect(() => {
    async function loadMySubmissions() {
      const supabase = createClient();
      if (!supabase || !studentName.trim()) return;
      try {
        const { data, error } = await supabase
          .from('submissions')
          .select('*')
          .eq('student_name', studentName.trim())
          .order('submitted_at', { ascending: false });
        if (error) throw error;
        setSubmissions((data || []).map(mapRowToSubmission));
      } catch {
        // Bỏ qua lỗi
      }
    }
    loadMySubmissions();
  }, [studentName]);

  const mySubmissions = useMemo(() => {
    const name = studentName.trim().toLowerCase();
    if (!name) return [];
    return submissions.filter(
      (submission) => submission.studentName.trim().toLowerCase() === name,
    );
  }, [studentName, submissions]);

  const pendingCount = mySubmissions.filter((submission) => isPending(submission.status)).length;

  const filteredExams = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (!query) return exams;
    return exams.filter(
      (exam) => exam.title.toLowerCase().includes(query) || exam.subject.toLowerCase().includes(query),
    );
  }, [exams, keyword]);

  const handleStartExam = (exam: Exam, mode: 'official' | 'practice' = 'official') => {
    if (!studentName.trim()) {
      toast.error('Thiếu họ tên', 'Vui lòng nhập họ và tên trước khi bắt đầu làm bài.');
      document.getElementById('student-name')?.focus();
      return;
    }

    const name = studentName.trim();
    setStudentName(name);
    setStudentSession(name, '');
    setSelectedExam(exam);
    setResult(null);
    setPracticeMode(mode === 'practice');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  };

  const handleSubmitted = async (submission: Submission) => {
    setResult(submission);
    setSelectedExam(null);
    toast.success('Đã nộp bài thành công', 'Kết quả trắc nghiệm đã được cập nhật ngay bên dưới.');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });

    // Gửi bài nộp lên Supabase cloud để giáo viên thấy
    const supabase = createClient();
    if (supabase) {
      try {
        await supabase.from('submissions').insert({
          exam_id: submission.examId,
          student_id: submission.studentName,
          student_name: submission.studentName,
          student_class: submission.studentClass || null,
          exam_title: submission.examTitle,
          auto_score: submission.autoScore,
          score: submission.score,
          mcq_count: submission.mcqCount,
          mcq_correct_count: submission.mcqCorrectCount,
          student_mcq_answers: submission.studentMcqAnswers,
          correct_mcq_answers: submission.correctMcqAnswers,
          mcq_images: submission.mcqImages,
          essay_details: submission.essayDetails,
          status: submission.status,
          submitted_at: submission.submittedAt,
          time_spent_seconds: submission.timeSpentSeconds || 0,
        });
      } catch {
        toast.warning('Lưu bài nộp', 'Không thể gửi bài nộp lên cloud. Bài làm đã lưu cục bộ.');
      }
    } else {
      toast.warning('Chưa cấu hình Supabase', 'Vui lòng thiết lập NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_ANON_KEY trong .env.local.');
    }
  };

  const handleBack = () => {
    setResult(null);
    setSelectedExam(null);
    setSubmissions([]);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  };

  const handleLogout = () => {
    clearSession();
    router.push('/');
  };

  if (!isClient) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <span className="size-2.5 animate-pulse rounded-full bg-emerald-500" />
          <span className="text-sm font-semibold text-slate-600">Đang mở phòng thi...</span>
        </div>
      </div>
    );
  }

  if (selectedExam) {
    return (
      <ExamRoom
        key={`${selectedExam.id}-${studentName}`}
        exam={selectedExam}
        studentName={studentName}
        studentClass=""
        onExit={handleBack}
        onSubmitted={handleSubmitted}
        practiceMode={practiceMode}
        onPracticeFinish={handleBack}
      />
    );
  }

  if (result) {
    return <ExamResult submission={result} onBack={handleBack} />;
  }

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <BrandLogo subtitle="Phòng thi học sinh" />
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-600/10 sm:inline-flex">
              <GraduationCap className="size-3.5" />
              Học sinh
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-50 hover:text-rose-600"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Đăng xuất</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-4 pb-16 sm:p-6 lg:p-8">
        <section className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl shadow-slate-900/10 sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 size-72 rounded-full bg-teal-500/15 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-emerald-200 ring-1 ring-white/10">
                <Sparkles className="size-3.5" />
                Cổng làm bài trực tuyến
              </div>
              <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
                {studentName.trim() ? `Chào ${studentName.trim()},` : 'Chào bạn,'} sẵn sàng làm bài?
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
                Chọn đề thi, làm bài trắc nghiệm và tải ảnh tự luận. Hệ thống tự động chấm trắc nghiệm và gửi bài tới
                giáo viên ngay khi bạn nộp.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {[
                { label: 'Đề đang mở', value: exams.length, icon: FileText },
                { label: 'Đã nộp', value: mySubmissions.length, icon: CheckCircle2 },
                { label: 'Chờ chấm', value: pendingCount, icon: Clock3 },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-2xl bg-white/10 px-3 py-3 ring-1 ring-white/10 sm:px-4">
                    <Icon className="size-4 text-emerald-300" />
                    <p className="mt-2 text-xl font-black leading-none sm:text-2xl">{item.value}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-900">Thông tin thí sinh</h2>
              <p className="text-[11px] font-medium text-slate-400">
                Thông tin được lưu trên thiết bị này để bạn không phải nhập lại.
              </p>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold text-emerald-700">
              <BadgeCheck className="size-3.5" /> Lưu tự động
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                id="student-name"
                type="text"
                value={studentName}
                onChange={(event) => setStudentName(event.target.value)}
                placeholder="Họ và tên của bạn..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-semibold text-slate-800 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900">Đề thi đang mở</h2>
              <p className="text-xs font-medium text-slate-400">
                {exams.length > 0 ? `${exams.length} đề sẵn sàng cho bạn lựa chọn` : 'Chưa có đề thi nào được công bố'}
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="Tìm đề thi hoặc môn học..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-xs font-medium text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
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
          </div>

          <div className="mt-6 flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setPracticeMode(false)}
              className={cn(
                'flex-1 rounded-xl py-2 text-xs font-bold transition',
                practiceMode
                  ? 'text-slate-500 hover:text-slate-800'
                  : 'bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-200',
              )}
            >
              Làm bài thi
            </button>
            <button
              type="button"
              onClick={() => setPracticeMode(true)}
              className={cn(
                'flex-1 rounded-xl py-2 text-xs font-bold transition',
                practiceMode
                  ? 'bg-teal-50 text-teal-700 shadow-sm ring-1 ring-teal-200'
                  : 'text-slate-500 hover:text-slate-800',
              )}
            >
              Làm bài ôn tập
            </button>
          </div>

          {filteredExams.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <span className="flex size-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-400">
                <BookOpen className="size-7" />
              </span>
              <div>
                <p className="text-sm font-black text-slate-700">
                  {exams.length === 0 ? 'Chưa có đề thi nào' : 'Không tìm thấy đề phù hợp'}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {exams.length === 0
                    ? 'Vui lòng chờ giáo viên công bố đề kiểm tra.'
                    : 'Thử tìm với từ khóa khác.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredExams.map((exam) => (
                <article
                  key={exam.id}
                  className="group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-900/5"
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 opacity-0 transition group-hover:opacity-100" />
                  <div className="flex items-start justify-between gap-3">
                    <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ring-1', subjectStyle(exam.subject))}>
                      {exam.subject}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      Đang mở
                    </span>
                  </div>

                  <h3 className="mt-3 line-clamp-2 min-h-[2.75rem] text-base font-black leading-snug text-slate-900">
                    {exam.title}
                  </h3>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2">
                      <Timer className="size-3.5 text-emerald-500" />
                      <span className="text-[11px] font-bold text-slate-600">{exam.durationMinutes} phút</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2">
                      <Trophy className="size-3.5 text-amber-500" />
                      <span className="text-[11px] font-bold text-slate-600">{formatNumber(exam.totalPoints)} điểm</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2">
                      <FileText className="size-3.5 text-sky-500" />
                      <span className="text-[11px] font-bold text-slate-600">{exam.mcqCount} câu TN</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2">
                      <BookOpen className="size-3.5 text-violet-500" />
                      <span className="text-[11px] font-bold text-slate-600">{exam.essayQuestions.length} câu TL</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleStartExam(exam, practiceMode ? 'practice' : 'official')}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition hover:from-emerald-700 hover:to-teal-700 active:scale-[0.98]"
                  >
                    Bắt đầu làm bài
                    <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        {mySubmissions.length > 0 ? (
          <section className="rounded-3xl border border-slate-200/80 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-black text-slate-900">Kết quả của bạn</h2>
                <p className="text-[11px] font-medium text-slate-400">
                  {studentName}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">
                {mySubmissions.length} bài nộp
              </span>
            </div>

            <ul className="divide-y divide-slate-100">
              {mySubmissions.slice(0, 6).map((submission) => {
                const pending = isPending(submission.status);
                return (
                  <li key={submission.id} className="flex items-center gap-3 px-5 py-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 text-[11px] font-black text-white">
                      {initials(submission.examTitle)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{submission.examTitle}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-400">
                        <span>{submission.submittedAt}</span>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold',
                            pending ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
                          )}
                        >
                          {pending ? <Clock3 className="size-2.5" /> : <CheckCircle2 className="size-2.5" />}
                          {pending ? 'Chờ chấm tự luận' : 'Đã hoàn tất'}
                        </span>
                      </p>
                    </div>
                    <p className="hidden text-base font-black text-emerald-600 sm:block">
                      {formatNumber(submission.score)}đ
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setResult(submission);
                        if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
                      }}
                      className="shrink-0 rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-600 transition hover:bg-slate-200"
                    >
                      Xem kết quả
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <p className="flex items-center justify-center gap-1.5 pt-2 text-center text-[11px] font-medium text-slate-400">
          <Inbox className="size-3.5" />
          Bài làm được lưu trên thiết bị này và gửi tới giáo viên quản lý lớp.
        </p>
      </main>
    </div>
  );
}
