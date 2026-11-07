import type { Submission } from './types';
import { isPending, round1 } from './utils';

function escapeCsv(value: unknown) {
  const text = String(value ?? '').replace(/"/g, '""');
  return `"${text}"`;
}

export function submissionsToCsv(submissions: Submission[]) {
  const header = [
    'STT',
    'Họ và tên',
    'Lớp',
    'Đề thi',
    'Điểm trắc nghiệm',
    'Điểm trả lời ngắn',
    'Điểm tự luận',
    'Tổng điểm',
    'Trạng thái',
    'Thời gian nộp',
  ];

  const rows = submissions.map((submission, index) => {
    const essayScore = round1(Math.max(0, (submission.score || 0) - (submission.autoScore || 0)));
    const shortScore = round1(
      (submission.shortAnswerDetails || []).reduce(
        (sum, detail) => sum + (detail.score || 0),
        0,
      ),
    );
    const mcqScore = round1(Math.max(0, (submission.autoScore || 0) - shortScore));
    return [
      index + 1,
      submission.studentName,
      submission.studentClass,
      submission.examTitle,
      mcqScore,
      shortScore,
      essayScore,
      submission.score,
      isPending(submission.status) ? 'Chờ chấm tự luận' : submission.status,
      submission.submittedAt,
    ];
  });

  return '\uFEFF' + [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
}

export function downloadCsv(submissions: Submission[], fileName?: string) {
  const csv = submissionsToCsv(submissions);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || `Bang_diem_THTEDUexam_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
