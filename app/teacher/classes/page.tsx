'use client';

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { Button, EmptyState, GridSkeleton, LoadingBlock, Modal, PageHeader } from '@/components/ui'
import type { TeacherClass } from '@/lib/types'
import { DEFAULT_TEACHER_NAME, SUBJECTS } from '@/lib/types'
import { cn, formatDate } from '@/lib/utils'
import { clearSession, getSession, loadClasses, saveClasses, slugify } from '@/lib/storage'
import {
  deleteClassFromCloud,
  fetchClassesFromCloud,
  saveClassToCloud,
} from '@/lib/supabase'
import { BrandLogo } from '@/components/ui/Brand'
import { useConfirm, useToast } from '@/components/ui/FeedbackProvider'
import { useIsClient } from '@/lib/hooks'

/**
 * Trang quản lý lớp học của giáo viên (/teacher/classes).
 * - Dữ liệu lưu trên Supabase (bảng "classes"), dự phòng localStorage khi mất mạng.
 * - Tạo lớp bằng modal (không dùng prompt() của trình duyệt).
 * - Xóa lớp hỏi xác nhận bằng useConfirm (không dùng confirm() của trình duyệt).
 */
export default function ClassesPage() {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const isClient = useIsClient()

  // Phiên đăng nhập: chưa đăng nhập giáo viên thì đẩy về trang chủ.
  const session = isClient ? getSession() : { role: null as string | null, username: '' }
  const teacherName = session.username || DEFAULT_TEACHER_NAME

  const [classes, setClasses] = useState<TeacherClass[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Trạng thái modal tạo lớp.
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', code: '', subject: 'Chưa phân loại', studentCount: '0' })
  const [codeTouched, setCodeTouched] = useState(false)
  /** Focus vào ô "Tên lớp" ngay khi mở modal tạo lớp. */
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Tải danh sách lớp: ưu tiên Supabase, dự phòng localStorage khi mất mạng
  // hoặc khi bảng "classes" chưa được tạo trên Supabase.
  useEffect(() => {
    if (!isClient) return
    let cancelled = false
    const load = async () => {
      const cloud = await fetchClassesFromCloud()
      if (cancelled) return
      if (cloud) {
        setClasses(cloud)
        saveClasses(cloud)
      } else {
        setClasses(loadClasses())
      }
      setIsLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [isClient])

  // Chặn truy cập khi chưa đăng nhập giáo viên.
  useEffect(() => {
    if (isClient && session.role !== 'TEACHER') {
      router.replace('/')
    }
  }, [isClient, router, session.role])

  // Đóng modal bằng phím Esc.
  useEffect(() => {
    if (!modalOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModalOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [modalOpen])

  const filteredClasses = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return classes
    return classes.filter(
      (item) => item.name.toLowerCase().includes(query) || item.code.toLowerCase().includes(query),
    )
  }, [classes, search])

  /** Gợi ý mã lớp từ tên lớp: "Toán 9A" → "TOAN9A". */
  const suggestCode = (name: string) =>
    slugify(name).replace(/-/g, '').toUpperCase().slice(0, 8)

  const openCreateModal = () => {
    setForm({ name: '', code: '', subject: 'Chưa phân loại', studentCount: '0' })
    setCodeTouched(false)
    setModalOpen(true)
  }

  const handleNameChange = (value: string) => {
    setForm((current) => ({
      ...current,
      name: value,
      // Mã lớp tự điền theo tên, trừ khi giáo viên đã tự sửa mã.
      code: codeTouched ? current.code : suggestCode(value),
    }))
  }

  const handleSaveClass = async () => {
    const trimmedName = form.name.trim()
    if (!trimmedName) {
      toast.error('Thiếu thông tin', 'Vui lòng nhập tên lớp.')
      return
    }

    const cls: TeacherClass = {
      id: `class-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: trimmedName,
      code: form.code.trim().toUpperCase() || suggestCode(trimmedName),
      subject: form.subject,
      studentCount: Math.max(0, Math.round(Number(form.studentCount) || 0)),
      createdAt: new Date().toISOString(),
    }

    setSaving(true)
    const result = await saveClassToCloud(cls)
    setSaving(false)

    if (!result.ok) {
      // Chưa đẩy được lên máy chủ → vẫn giữ trên thiết bị để không mất công nhập lại.
      const next = [cls, ...classes]
      setClasses(next)
      saveClasses(next)
      toast.warning('Chưa đồng bộ lên máy chủ', 'Lớp đã lưu trên thiết bị này. Kiểm tra kết nối mạng rồi thử lại.')
    } else {
      const next = [cls, ...classes]
      setClasses(next)
      saveClasses(next)
      toast.success('Đã tạo lớp', `Lớp ${cls.name} đã được lưu.`)
    }
    setModalOpen(false)
  }

  const handleDeleteClass = async (cls: TeacherClass) => {
    const confirmed = await confirm({
      title: 'Xóa lớp học?',
      message: `Lớp "${cls.name}" sẽ bị xóa khỏi danh sách. Hành động không thể hoàn tác.`,
      confirmLabel: 'Xóa lớp',
      tone: 'danger',
    })
    if (!confirmed) return

    const result = await deleteClassFromCloud(cls.id)
    if (!result.ok) {
      // Xóa thất bại trên máy chủ thì KHÔNG xóa ở máy (lớp sẽ hiện lại ở lần tải sau).
      toast.error('Không xóa được trên máy chủ', result.message ?? 'Vui lòng thử lại.')
      return
    }

    const next = classes.filter((item) => item.id !== cls.id)
    setClasses(next)
    saveClasses(next)
    toast.success('Đã xóa lớp', `Lớp ${cls.name} đã bị xóa.`)
  }

  const handleLogout = () => {
    clearSession()
    router.push('/')
  }

  // Trang chỉ hiển thị khi đã xác thực trên trình duyệt.
  if (!isClient || session.role !== 'TEACHER') {
    return <LoadingBlock label="Đang tải trang lớp học..." />
  }

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-500 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20'

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-700">
      {/* Lớp phủ tối khi mở menu trên điện thoại */}
      {sidebarOpen ? (
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm lg:hidden"
          aria-label="Đóng menu"
        />
      ) : null}

      {/* Menu dọc: ẩn hẳn sang trái trên điện thoại, trượt vào khi bấm nút menu */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 transform flex-col justify-between bg-slate-950 p-5 transition-transform duration-300 ease-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="min-h-0 overflow-y-auto">
          <div className="flex items-start justify-between">
            <BrandLogo light subtitle="Không gian giáo viên" />
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="rounded-xl p-2 text-slate-400 transition hover:bg-white/10 hover:text-white lg:hidden"
              aria-label="Đóng menu"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="mt-7 flex items-center gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-bold text-white">
              GV
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">{teacherName}</p>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Giáo viên</p>
            </div>
            <Sparkles className="ml-auto size-4 text-emerald-400" />
          </div>

          <nav className="mt-6 space-y-1.5">
            <button
              type="button"
              onClick={() => router.push('/teacher/dashboard')}
              className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-slate-400 transition hover:bg-white/5 hover:text-white"
            >
              <LayoutDashboard className="size-[18px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">Tổng quan</span>
                <span className="block text-xs font-medium text-slate-500">Bảng điều khiển</span>
              </span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 py-3 text-left text-white shadow-lg shadow-emerald-950/40"
              aria-current="page"
            >
              <Users className="size-[18px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">Lớp học</span>
                <span className="block text-xs font-medium text-emerald-100">Danh sách lớp</span>
              </span>
            </button>
          </nav>
        </div>

        <div className="space-y-2 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-xl bg-rose-500/10 px-3 py-2.5 text-xs font-bold text-rose-300 transition hover:bg-rose-500/20"
          >
            <LogOut className="size-4" />
            Đăng xuất
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col lg:pl-72">
        {/* Thanh đầu trang trên điện thoại: nút mở menu + nút quay lại dashboard */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
              aria-label="Mở menu"
            >
              <Menu className="size-5" />
            </button>
            <BrandLogo compact />
          </div>
          <button
            type="button"
            onClick={() => router.push('/teacher/dashboard')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
          >
            <ArrowLeft className="size-4" />
            Về dashboard
          </button>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 pb-14 sm:p-6 lg:p-8">
          <PageHeader
            className="mb-8"
            title="Quản lý lớp học"
            description="Tạo lớp, tìm kiếm và theo dõi số học sinh của từng lớp."
            actions={
              <Button size="lg" onClick={openCreateModal}>
                <Plus className="size-4" aria-hidden="true" />
                Tạo lớp mới
              </Button>
            }
          />

          {/* Ô tìm kiếm theo tên hoặc mã lớp */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm theo tên lớp hoặc mã lớp..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm font-medium text-slate-800 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="mt-6">
              {/* Skeleton thay cho chữ "Đang tải danh sách lớp..." */}
              <GridSkeleton count={6} />
            </div>
          ) : filteredClasses.length === 0 ? (
            <EmptyState
              className="mt-6"
              icon={Users}
              title={classes.length === 0 ? 'Chưa có lớp học nào' : 'Không tìm thấy lớp phù hợp'}
              description={
                classes.length === 0
                  ? 'Tạo lớp đầu tiên để sắp xếp học sinh theo từng lớp.'
                  : 'Thử từ khóa khác hoặc xóa ô tìm kiếm.'
              }
              action={
                classes.length === 0 ? (
                  <Button onClick={openCreateModal}>
                    <Plus className="size-4" aria-hidden="true" /> Tạo lớp học
                  </Button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="text-sm font-bold text-emerald-700 hover:underline"
                  >
                    Xóa tìm kiếm
                  </button>
                )
              }
            />
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredClasses.map((cls) => (
                <article
                  key={cls.id}
                  className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-900/5"
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 opacity-0 transition group-hover:opacity-100" />

                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                      <Users className="size-5" />
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteClass(cls)}
                      title="Xóa lớp"
                      aria-label={`Xóa lớp ${cls.name}`}
                      className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>

                  <h2 className="mt-3 truncate text-base font-bold leading-snug text-slate-900">{cls.name}</h2>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {cls.code ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-600/10">
                        {cls.code}
                      </span>
                    ) : null}
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">
                      {cls.subject}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="text-xs font-semibold text-slate-500">
                      {cls.studentCount} học sinh
                      {cls.createdAt ? ` · ${formatDate(cls.createdAt)}` : ''}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Modal tạo lớp học — dùng Modal dùng chung (Esc, focus trap, a11y đã có sẵn) */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Tạo lớp mới"
        description="Nhập tên lớp — mã lớp sẽ tự gợi ý theo tên."
        size="sm"
        initialFocusRef={nameInputRef}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Hủy bỏ
            </Button>
            {/* type="submit" + form="..." : nút nằm ngoài thẻ form nhưng vẫn submit đúng form theo id */}
            <Button type="submit" form="create-class-form" loading={saving}>
              <Plus className="size-4" aria-hidden="true" />
              Tạo lớp
            </Button>
          </>
        }
      >
        <form
          id="create-class-form"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSaveClass()
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="class-name" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Tên lớp *
            </label>
            <input
              id="class-name"
              ref={nameInputRef}
              type="text"
              required
              value={form.name}
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder="Ví dụ: Toán 9A"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="class-code" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Mã lớp
            </label>
            <input
              id="class-code"
              type="text"
              value={form.code}
              onChange={(event) => {
                setCodeTouched(true)
                setForm((current) => ({ ...current, code: event.target.value }))
              }}
              placeholder="Ví dụ: TOAN9A"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="class-subject" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Môn học
              </label>
              <select
                id="class-subject"
                value={form.subject}
                onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
                className={inputClass}
              >
                <option value="Chưa phân loại">Chưa phân loại</option>
                {SUBJECTS.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="class-count" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Số học sinh
              </label>
              <input
                id="class-count"
                type="number"
                min={0}
                step={1}
                value={form.studentCount}
                onChange={(event) => setForm((current) => ({ ...current, studentCount: event.target.value }))}
                className={inputClass}
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
