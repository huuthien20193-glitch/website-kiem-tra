import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import './globals.css';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';

/**
 * Font chủ đạo của toàn web: Be Vietnam Pro — hỗ trợ đầy đủ dấu tiếng Việt,
 * hiển thị giống nhau trên Windows/Mac/Android (Segoe UI chỉ có trên Windows).
 * next/font tự tải font về và host cùng web, nên lúc chạy KHÔNG cần mạng tới Google.
 * - subset 'vietnamese' bắt buộc để có đủ chữ có dấu.
 * - variable '--font-be-vietnam' được gắn vào <html> và dùng trong globals.css (--font-sans).
 */
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-be-vietnam',
});

export const metadata: Metadata = {
  // Địa chỉ gốc của web — cần để các thẻ openGraph sinh ra đường dẫn tuyệt đối.
  metadataBase: new URL('https://website-kiem-tra.onrender.com'),
  title: {
    default: 'THTEDUexam – Hệ thống kiểm tra trực tuyến',
    template: '%s · THTEDUexam',
  },
  description:
    'THTEDUexam – Hệ thống kiểm tra và quản lý bài thi trực tuyến dành cho giáo viên và học sinh. Tạo đề trắc nghiệm dạng ảnh, thu bài tự luận, chấm điểm tự động và xuất bảng điểm.',
  applicationName: 'THTEDUexam',
  authors: [{ name: 'Sư phạm Tin học' }],
  keywords: ['kiểm tra trực tuyến', 'quản lý bài thi', 'chấm trắc nghiệm', 'giáo viên', 'học sinh'],
  openGraph: {
    title: 'THTEDUexam – Hệ thống kiểm tra trực tuyến',
    description:
      'Tạo đề nhanh, chấm điểm tự động — nền tảng kiểm tra trực tuyến dành cho giáo viên và học sinh.',
    type: 'website',
    locale: 'vi_VN',
    siteName: 'THTEDUexam',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#059669',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // className của font đặt lên <html> để biến CSS --font-be-vietnam dùng được toàn trang.
    <html lang="vi" className={`h-full ${beVietnamPro.variable}`}>
      <body className="min-h-full">
        <FeedbackProvider>{children}</FeedbackProvider>
      </body>
    </html>
  );
}
