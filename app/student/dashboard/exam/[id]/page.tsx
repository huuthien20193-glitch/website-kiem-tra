import { redirect } from 'next/navigation';

// This route only performs a redirect, so there is no static shell to validate for instant navigation.
export const instant = false;

/**
 * Route cũ được giữ lại để các liên kết đã chia sẻ không bị lỗi.
 * Toàn bộ luồng làm bài hiện nằm tại /student/dashboard.
 */
export default function LegacyExamRoomPage() {
  redirect('/student/dashboard');
}
