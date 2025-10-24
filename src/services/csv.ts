import { get, getRaw, post } from './api';

export type CsvUploadType = 'products' | 'initial_stock' | 'movements';

export interface CsvPreviewSummary {
  total: number;
  newCount: number;
  updateCount: number;
  errorCount: number;
}

export interface CsvPreviewError {
  rowNumber: number;
  messages: string[];
}

export interface CsvPreviewResponse {
  previewId: string;
  type: CsvUploadType;
  columns: string[];
  summary: CsvPreviewSummary;
  errors: CsvPreviewError[];
}

export interface CsvCommitJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total: number;
  processed: number;
  summary: CsvPreviewSummary;
  errorCount: number;
  createdAt: number;
  updatedAt?: number;
}

export interface CsvCommitResponse {
  job: CsvCommitJob;
}

export interface CsvJobStatusResponse {
  job: CsvCommitJob;
}

export async function requestPreview(type: CsvUploadType, csvText: string): Promise<CsvPreviewResponse> {
  return post<CsvPreviewResponse>(`/csv/upload?type=${type}`, { stage: 'preview', content: csvText });
}

export async function requestCommit(type: CsvUploadType, previewId: string): Promise<CsvCommitResponse> {
  return post<CsvCommitResponse>(`/csv/upload?type=${type}`, { stage: 'commit', previewId });
}

export async function fetchJob(jobId: string): Promise<CsvJobStatusResponse> {
  return get<CsvJobStatusResponse>(`/csv/jobs/${jobId}`);
}

export async function downloadTemplate(type: CsvUploadType): Promise<Blob> {
  const response = await getRaw(`/csv/template?type=${type}`);
  return await response.blob();
}

export async function downloadJobErrors(jobId: string): Promise<Blob | null> {
  const response = await getRaw(`/csv/jobs/${jobId}/errors`);
  if (response.status === 204) {
    return null;
  }
  return await response.blob();
}
