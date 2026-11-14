'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  Lock,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  User,
  UserCheck,
  UserRound,
} from 'lucide-react';
import { BrandLogo, BrandMark } from '@/components/ui/Brand';
import { useToast } from '@/components/ui/FeedbackProvider';
import { setStudentSession, setTeacherSession } from '@/lib/storage';

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [role, setRole] = useState<'TEACHER' | 'STUDENT'>('TEACHER');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [studentName, setStudentName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleTeacherLogin = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    setTimeout(() => {
      setLoading(false);
      if (username.trim() === 'thien20193' && password === 'thien123') {
        // Lưu tên đăng nhập vào phiên — mọi trang sẽ hiển thị theo session này.
        setTeacherSession(username.trim());
        toast.success('Đăng nhập thành công', 'Chào mừng thầy quay lại không gian giáo viên.');
        router.push('/teacher/dashboard');
      } else {
        setError('Sai tên đăng nhập hoặc mật khẩu giáo viên. Vui lòng kiểm tra lại.');
      }
    }, 500);
  };

  const handleStudentAccess = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!studentName.trim()) {
      setError('Vui lòng nhập họ tên trước khi vào phòng thi.');
      return;
    }

    setStudentSession(studentName.trim(), '');
    toast.success('Đã vào phòng thi', `${studentName.trim()}`);
    router.push('/student/dashboard');
  };

  const switchRole = (nextRole: 'TEACHER' | 'STUDENT') => {
    setRole(nextRole);
    setError('');
  };

  const inputClass =
    'w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-500/10';

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 font-sans">
      <div className="pointer-events-none absolute -left-32 top-0 size-[28rem] rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 right-0 size-[34rem] rounded-full bg-teal-500/15 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_35%)]" />

      <div className="relative z-10 mx-auto grid min-h-screen max-w-6xl lg:grid-cols-[1.05fr_0.95fr]">
        {/* Marketing panel */}
        <section className="hidden flex-col justify-between p-10 lg:flex xl:p-14">
          <BrandLogo light subtitle="Sư phạm Tin học · THTEDUexam" />

          <div className="max-w-lg">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-bold text-emerald-300">
              <Sparkles className="size-3.5" />
              Nền tảng kiểm tra trực tuyến thế hệ mới
            </div>
            <h1 className="mt-5 text-4xl font-black leading-[1.15] tracking-tight text-white xl:text-[2.9rem]">
              Tạo đề nhanh, chấm điểm tự động,{' '}
              <span className="bg-gradient-to-r from-emerald-300 to-teal-200 bg-clip-text text-transparent">
                quản lý kết quả dễ dàng.
              </span>
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              THTEDUexam giúp giáo viên công bố đề trắc nghiệm dạng ảnh, thu bài tự luận và theo dõi tiến độ học sinh
              chỉ trong vài phút.
            </p>

            <ul className="mt-8 space-y-3.5">
              {[
                { icon: FileText, title: 'Đề trắc nghiệm dạng ảnh', desc: 'Tải ảnh hoặc dán trực tiếp bằng Ctrl + V, tự động nén dung lượng.' },
                { icon: Clock3, title: 'Chấm trắc nghiệm tức thì', desc: 'Học sinh nhận kết quả ngay sau khi nộp, giáo viên chỉ chấm phần tự luận.' },
                { icon: ShieldCheck, title: 'Dữ liệu lưu trên thiết bị', desc: 'Không cần máy chủ phức tạp, bài làm được lưu nháp và bảo toàn khi tải lại.' },
              ].map((feature) => {
                const Icon = feature.icon;
                return (
                  <li key={feature.title} className="flex gap-3.5">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-emerald-300 ring-1 ring-white/10">
                      <Icon className="size-5" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-white">{feature.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{feature.desc}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex items-center gap-6 text-[11px] font-semibold text-slate-500">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-emerald-400" /> Miễn phí
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-emerald-400" /> Không cần cài đặt
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-emerald-400" /> Hỗ trợ tiếng Việt
            </span>
          </div>
        </section>

        {/* Login panel */}
        <section className="flex items-center justify-center p-4 py-8 sm:p-6 lg:p-10">
          <div className="w-full max-w-md rounded-[2rem] border border-white/60 bg-white p-6 shadow-2xl shadow-emerald-950/30 sm:p-8">
            <div className="flex items-center justify-between lg:hidden">
              <BrandLogo compact />
              <BrandMark className="size-9" iconClassName="size-5" />
            </div>

            <div className="mt-6 space-y-1.5 lg:mt-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">Chào mừng trở lại</p>
              <h2 className="text-2xl font-black tracking-tight text-slate-900">Đăng nhập hệ thống</h2>
              <p className="text-xs font-medium text-slate-500">Chọn vai trò của bạn để tiếp tục.</p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-1.5 rounded-2xl border border-slate-200 bg-slate-100 p-1.5">
              <button
                type="button"
                onClick={() => switchRole('TEACHER')}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition ${
                  role === 'TEACHER'
                    ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <GraduationCap className="size-4" />
                Giáo viên
              </button>
              <button
                type="button"
                onClick={() => switchRole('STUDENT')}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition ${
                  role === 'STUDENT'
                    ? 'bg-white text-teal-700 shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <UserRound className="size-4" />
                Học sinh
              </button>
            </div>

            {error ? (
              <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-700">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-rose-500" />
                <span>{error}</span>
              </div>
            ) : null}

            {role === 'TEACHER' ? (
              <form onSubmit={handleTeacherLogin} autoComplete="off" className="mt-5 space-y-4">
                <div>
                  <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">
                    Tên đăng nhập
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      required
                      autoComplete="off"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="Nhập tên đăng nhập..."
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">
                    Mật khẩu
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="••••••••"
                      className={`${inputClass} pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                      aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:from-emerald-700 hover:to-teal-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? (
                    <>
                      <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Đang xác thực...
                    </>
                  ) : (
                    <>
                      Đăng nhập
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleStudentAccess} className="mt-5 space-y-4">
                <div className="flex items-start gap-3 rounded-2xl border border-teal-100 bg-teal-50 p-3.5">
                  <UserCheck className="mt-0.5 size-4 shrink-0 text-teal-600" />
                  <p className="text-[11px] leading-relaxed text-teal-800">
                    Nhập đúng họ tên để giáo viên có thể đối chiếu kết quả bài làm của bạn.
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">
                    Họ và tên
                  </label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={studentName}
                      onChange={(event) => setStudentName(event.target.value)}
                      placeholder="Nguyễn Văn A..."
                      className={inputClass}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-teal-600/25 transition hover:from-teal-700 hover:to-emerald-700 active:scale-[0.98]"
                >
                  <UserCheck className="size-4" />
                  Vào phòng thi ngay
                </button>
              </form>
            )}

            <div className="mt-7 flex items-center justify-center gap-1.5 border-t border-slate-100 pt-5 text-[10px] font-semibold text-slate-400">
              <Award className="size-3.5 text-emerald-500" />
              Sư phạm Tin học © 2026 · THTEDUexam
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
