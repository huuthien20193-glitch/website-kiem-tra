'use client';

import { useState } from 'react'
import { useToast } from '@/components/ui/FeedbackProvider'
import {
  LayoutDashboard,
  FileText,
  Users,
  Plus,
  Trash2,
  Edit3,
  Search,
  Sparkles,
} from 'lucide-react'

export default function ClassesPage() {
  const toast = useToast()
  const [classes, setClasses] = useState<Array<{ id: string; name: string; code: string; studentCount: string; subject: string; createdAt: string }>>([
    { id: '1', name: 'Toán 9A', code: 'MATH9A', studentCount: '35', subject: 'Toán học', createdAt: '2026-10-01' },
    { id: '2', name: 'Tiếng Anh 8B', code: 'ENG8B', studentCount: '40', subject: 'Tiếng Anh', createdAt: '2026-10-05' },
    { id: '3', name: 'Vật lý 10A', code: 'PHYS10A', studentCount: '32', subject: 'Vật lý', createdAt: '2026-10-10' },
  ])
  const [search, setSearch] = useState('')

  const filteredClasses = classes.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  )

  const addClass = () => {
    const name = prompt('Nhập tên lớp học:')
    if (!name) return
    const code = prompt('Nhập mã lớp (ví dụ: MATH9A):')
    if (!code) return
    const newClass = {
      id: String(Date.now()),
      name,
      code,
      studentCount: '0',
      subject: 'Chưa phân loại',
      createdAt: new Date().toISOString().split('T')[0],
    }
    setClasses([newClass, ...classes])
    toast.success('Đã tạo lớp', `Lớp ${name} đã được tạo thành công.`)
  }

  const deleteClass = (id: string) => {
    if (confirm('Bạn chắc chắn muốn xóa lớp này?')) {
      setClasses(classes.filter((c) => c.id !== id))
      toast.success('Đã xóa lớp', 'Lớp học đã bị xóa.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-700">
      <div className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm lg:hidden" />
      <aside className="fixed inset-y-0 left-0 z-50 flex w-72 transform flex-col justify-between bg-white p-5 transition-transform duration-300 ease-out lg:translate-x-0 shadow-xl -translate-x-full">
        <div className="min-h-0 overflow-y-auto">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-center">
                <Sparkles className="size-5 text-white" />
              </div>
              <span className="font-black text-emerald-600 tracking-tight text-lg">THTEDUexam</span>
            </div>
            <button type="button" className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-50 lg:hidden">
              <span className="size-4">✕</span>
            </button>
          </div>
          <nav className="mt-6 space-y-1">
            <button type="button" className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left bg-emerald-50 text-emerald-600">
              <Users className="size-[18px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold">Lớp học</span>
              </span>
            </button>
            <button type="button" className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-slate-400 hover:bg-slate-50 hover:text-emerald-600">
              <LayoutDashboard className="size-[18px]" />
              <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-bold">Tổng quan</span></span>
            </button>
          </nav>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col lg:pl-72">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
          <button type="button" className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50">
            <span className="size-4">☰</span>
          </button>
          <div className="flex items-center gap-2">
            <div className="size-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-center">
              <Sparkles className="size-4 text-white" />
            </div>
            <span className="font-black text-emerald-600 tracking-tight">THTEDUexam</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50">
              Giáo viên
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 pb-14 sm:p-6 lg:p-8">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Quản lý lớp học</h1>
              <p className="mt-1 text-sm text-slate-500">Tạo lớp, mời học sinh và theo dõi tiến độ.</p>
            </div>
            <button
              type="button"
              onClick={addClass}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:from-emerald-700 hover:to-teal-700 active:scale-[0.98]"
            >
              <Plus className="size-4" />
              Tạo lớp mới
            </button>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm theo tên lớp hoặc mã lớp..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm font-medium text-slate-800 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-3 text-[11px] font-black uppercase tracking-wide text-slate-400">Tên lớp</th>
                    <th className="pb-3 text-[11px] font-black uppercase tracking-wide text-slate-400">Mã lớp</th>
                    <th className="pb-3 text-[11px] font-black uppercase tracking-wide text-slate-400">Học sinh</th>
                    <th className="pb-3 text-[11px] font-black uppercase tracking-wide text-slate-400">Môn học</th>
                    <th className="pb-3 text-[11px] font-black uppercase tracking-wide text-slate-400">Tạo ngày</th>
                    <th className="pb-3 text-[11px] font-black uppercase tracking-wide text-slate-400 text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClasses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        <span className="flex size-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-400 mx-auto mb-3">
                          <Users className="size-7" />
                        </span>
                        <p className="text-sm font-bold text-slate-800 dark:text-white">Không tìm thấy lớp học</p>
                      </td>
                    </tr>
                  ) : (
                    filteredClasses.map((cls) => (
                      <tr key={cls.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                        <td className="py-4">
                          <p className="text-sm font-bold text-slate-900">{cls.name}</p>
                        </td>
                        <td className="py-4">
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-100">
                            {cls.code}
                          </span>
                        </td>
                        <td className="py-4">
                          <span className="text-sm font-medium text-slate-600">{cls.studentCount}</span>
                        </td>
                        <td className="py-4">
                          <span className="text-sm font-medium text-slate-600">{cls.subject}</span>
                        </td>
                        <td className="py-4">
                          <span className="text-xs text-slate-400">{cls.createdAt}</span>
                        </td>
                        <td className="py-4 text-right">
                          <button
                            type="button"
                            onClick={() => deleteClass(cls.id)}
                            className="p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                            title="Xóa lớp"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
