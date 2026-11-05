import type { Metadata, Viewport } from 'next'
import './globals.css'
import { FeedbackProvider } from '@/components/ui/FeedbackProvider'

export const metadata: Metadata = {
  title: {
    default: 'THTEDUexam – Hệ thống kiểm tra trực tuyến',
    template: '%s · THTEDUexam',
  },
  description:
    'THTEDUexam – Hệ thống kiểm tra và quản lý bài thi trực tuyến dành cho giáo viên và học sinh. Tạo đề trắc nghiệm dạng ảnh, thu bài tự luận, chấm điểm tự động và xuất bảng điểm.',
  applicationName: 'THTEDUexam',
  authors: [{ name: 'Sư phạm Tin học' }],
  keywords: ['kiểm tra trực tuyến', 'quản lý bài thi', 'chấm trắc nghiệm', 'giáo viên', 'học sinh'],
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#059669',
  colorScheme: 'light',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="h-full">
      <body className="min-h-full">
        <FeedbackProvider>{children}</FeedbackProvider>
      </body>
    </html>
  )
}
