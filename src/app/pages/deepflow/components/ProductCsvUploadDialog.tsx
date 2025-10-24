import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  downloadJobErrors,
  fetchJob,
  requestCommit,
  requestPreview,
  type CsvCommitJob,
  type CsvPreviewResponse,
} from '../../../../services/csv';

interface ProductCsvUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('파일을 읽는 중 오류가 발생했습니다.'));
    reader.readAsText(file, 'utf-8');
  });
}

const STATUS_LABELS: Record<CsvCommitJob['status'], string> = {
  pending: '대기 중',
  processing: '처리 중',
  completed: '완료',
  failed: '실패',
};

const ProductCsvUploadDialog: React.FC<ProductCsvUploadDialogProps> = ({ open, onClose, onCompleted }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvPreviewResponse | null>(null);
  const [job, setJob] = useState<CsvCommitJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedFile(null);
      setPreview(null);
      setJob(null);
      setError(null);
      setSuccessMessage(null);
    }
  }, [open]);

  useEffect(() => {
    if (!job || (job.status !== 'pending' && job.status !== 'processing')) {
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        const { job: latest } = await fetchJob(job.id);
        setJob(latest);
      } catch (pollError) {
        setError(pollError instanceof Error ? pollError.message : '작업 상태를 불러오지 못했습니다.');
      }
    }, 750);

    return () => window.clearInterval(interval);
  }, [job]);

  useEffect(() => {
    if (job?.status === 'completed') {
      setSuccessMessage('CSV 적용이 완료되었습니다.');
      onCompleted();
    }
  }, [job?.status, onCompleted]);

  const handleSelectFile = async (file: File | null) => {
    if (!file) {
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const text = await readFileAsText(file);
      const previewResponse = await requestPreview('products', text);
      setSelectedFile(file);
      setPreview(previewResponse);
      setJob(null);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'CSV를 분석하지 못했습니다.');
      setPreview(null);
      setSelectedFile(null);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview || loading) {
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const { job: created } = await requestCommit('products', preview.previewId);
      setJob(created);
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : 'CSV 반영 요청에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadErrors = async () => {
    if (!job) {
      return;
    }
    try {
      const blob = await downloadJobErrors(job.id);
      if (!blob) {
        setSuccessMessage('오류 행 없이 완료되었습니다.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `products-errors-${job.id}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : '오류 행을 내려받지 못했습니다.');
    }
  };

  const handleFileInputClick = () => {
    fileInputRef.current?.click();
  };

  const progress = useMemo(() => {
    if (!job || job.total === 0) {
      return 0;
    }
    return Math.round((job.processed / job.total) * 100);
  }, [job]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-800">품목 CSV 업로드</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-2 py-1 text-sm text-slate-500 hover:border-slate-300 hover:text-slate-700"
          >
            닫기
          </button>
        </div>
        <div className="space-y-4 px-5 py-6 text-sm text-slate-700">
          <p className="text-slate-500">
            품목 CSV를 업로드하면 신규 품목은 자동 등록되고, 동일 SKU는 최신 정보로 갱신됩니다. 업로드 전 프리뷰에서
            요약 정보를 확인하세요.
          </p>

          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => handleSelectFile(event.target.files?.[0] ?? null)}
            />
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-700">{selectedFile ? selectedFile.name : '선택된 파일이 없습니다.'}</p>
                <p className="text-xs text-slate-500">
                  CSV 형식, UTF-8 인코딩. 헤더 행이 포함되어야 합니다.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleFileInputClick}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
                >
                  파일 선택
                </button>
                {selectedFile && (
                  <button
                    type="button"
                    onClick={() => handleSelectFile(selectedFile)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
                  >
                    다시 분석
                  </button>
                )}
              </div>
            </div>
          </div>

          {loading && <p className="text-xs text-indigo-600">분석 중입니다. 잠시만 기다려 주세요...</p>}
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
          {successMessage && <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-600">{successMessage}</p>}

          {preview && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-400">총 행</p>
                  <p className="text-lg font-semibold text-slate-800">{preview.summary.total}</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs text-emerald-600">신규 등록</p>
                  <p className="text-lg font-semibold text-emerald-700">{preview.summary.newCount}</p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs text-blue-600">갱신</p>
                  <p className="text-lg font-semibold text-blue-700">{preview.summary.updateCount}</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-500">
                  오류 행 {preview.summary.errorCount}개
                  {preview.errors.length > 0 && ' (상위 20건 표시)'}
                </div>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={loading || !preview}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
                >
                  업로드 확정
                </button>
              </div>

              {preview.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <ul className="space-y-1">
                    {preview.errors.map((row) => (
                      <li key={row.rowNumber}>
                        <span className="font-semibold">행 {row.rowNumber}:</span> {row.messages.join(', ')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {job && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>작업 ID: {job.id}</span>
                <span className="font-medium text-slate-600">상태: {STATUS_LABELS[job.status]}</span>
              </div>
              <div className="h-2 rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>
                  진행률 {job.processed}/{job.total} ({progress}%)
                </span>
                <span>오류 행 {job.errorCount}개</span>
              </div>
              {job.status === 'completed' && job.errorCount > 0 && (
                <button
                  type="button"
                  onClick={handleDownloadErrors}
                  className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
                >
                  오류 행 다운로드
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductCsvUploadDialog;
