import { jsPDF } from 'jspdf';
import { Product, StockHistory } from '../types';

export type HistoryReportFormat = 'csv' | 'pdf';
export type HistoryReportAction = 'download' | 'share';

export type HistoryReportColumnKey =
  | 'productName'
  | 'sku'
  | 'timestamp'
  | 'reason'
  | 'change'
  | 'newStockLevel'
  | 'lotBatch'
  | 'workOrder'
  | 'inspectionResult'
  | 'userId';

export const DEFAULT_HISTORY_REPORT_COLUMNS: readonly HistoryReportColumnKey[] = [
  'productName',
  'sku',
  'timestamp',
  'reason',
  'change',
  'newStockLevel',
  'lotBatch',
  'workOrder',
  'inspectionResult',
  'userId',
] as const;

export interface HistoryReportOptions {
  product: Product;
  history: StockHistory[];
  filename?: string;
  filenamePattern?: string;
  columns?: HistoryReportColumnKey[];
  title?: string;
}

const formatDateTime = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
};

const ensureExtension = (filename: string, format: HistoryReportFormat): string => {
  const normalized = filename.trim();
  const expected = `.${format}`;
  return normalized.toLowerCase().endsWith(expected) ? normalized : `${normalized}${expected}`;
};

const sanitizeSegment = (value: string) => value.replace(/[^\w가-힣-]+/g, '-');

export const buildHistoryReportFilename = (
  product: Product,
  format: HistoryReportFormat,
  pattern?: string,
): string => {
  const safeProductName = sanitizeSegment(product.productName);
  const safeSku = sanitizeSegment(product.sku);
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
  const replacements: Record<string, string> = {
    '{productName}': safeProductName,
    '{sku}': safeSku,
    '{timestamp}': timestamp,
    '{format}': format,
  };

  const basePattern = pattern?.trim().length ? pattern.trim() : `history-{productName}-{timestamp}`;
  const replaced = Object.entries(replacements).reduce(
    (acc, [token, value]) => acc.replace(new RegExp(token, 'g'), value),
    basePattern,
  );

  const sanitized = sanitizeSegment(replaced).replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
  const fallback = `history-${safeProductName}-${timestamp}`;
  const filename = sanitized.length > 0 ? sanitized : fallback;
  return ensureExtension(filename, format);
};

const resolveColumns = (columns?: HistoryReportColumnKey[]): HistoryReportColumnKey[] => {
  if (!columns || columns.length === 0) {
    return Array.from(DEFAULT_HISTORY_REPORT_COLUMNS);
  }

  const validSet = new Set(DEFAULT_HISTORY_REPORT_COLUMNS);
  const filtered = columns.filter((column) => validSet.has(column));
  return filtered.length > 0 ? Array.from(new Set(filtered)) : Array.from(DEFAULT_HISTORY_REPORT_COLUMNS);
};

const columnHeaders: Record<HistoryReportColumnKey, string> = {
  productName: '제품명',
  sku: '품번',
  timestamp: '일시',
  reason: '변경 사유',
  change: '변동 수량',
  newStockLevel: '변경 후 재고',
  lotBatch: 'Lot/Batch',
  workOrder: '작업지시',
  inspectionResult: '검사 결과',
  userId: '담당자',
};

const getColumnValue = (
  key: HistoryReportColumnKey,
  product: Product,
  record: StockHistory,
): string => {
  switch (key) {
    case 'productName':
      return product.productName;
    case 'sku':
      return product.sku;
    case 'timestamp':
      return formatDateTime(record.timestamp);
    case 'reason':
      return record.reason ?? '';
    case 'change':
      return record.change > 0 ? `+${record.change}` : record.change.toString();
    case 'newStockLevel':
      return record.newStockLevel.toString();
    case 'lotBatch':
      return record.lotBatch ?? '';
    case 'workOrder':
      return record.workOrder ?? '';
    case 'inspectionResult':
      return record.inspectionResult ?? '';
    case 'userId':
      return record.userId ?? '';
    default:
      return '';
  }
};

const getPdfValue = (
  key: HistoryReportColumnKey,
  product: Product,
  record: StockHistory,
  columns: HistoryReportColumnKey[],
): string => {
  const value = getColumnValue(key, product, record);
  switch (key) {
    case 'reason':
      return value || '사유 미기록';
    case 'change':
      if (!value) return '0';
      if (!columns.includes('newStockLevel')) {
        const next = getColumnValue('newStockLevel', product, record) || '정보 없음';
        return `${value} → ${next}`;
      }
      return value;
    case 'lotBatch':
      return value || '정보 없음';
    case 'workOrder':
      return value || '정보 없음';
    case 'inspectionResult':
      return value || '정보 없음';
    case 'userId':
      return value || '담당자 미기록';
    case 'productName':
    case 'sku':
    case 'timestamp':
    case 'newStockLevel':
    default:
      return value || '정보 없음';
  }
};

const buildCsvContent = (options: HistoryReportOptions) => {
  const { product, history } = options;
  const columns = resolveColumns(options.columns);
  const header = columns.map((column) => columnHeaders[column]);

  const rows = history.map((record) =>
    columns.map((column) => getColumnValue(column, product, record)),
  );

  return [header, ...rows]
    .map((cells) =>
      cells
        .map((cell) => {
          const value = cell?.toString() ?? '';
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(','),
    )
    .join('\n');
};

const buildPdfBlob = (options: HistoryReportOptions) => {
  const { product, history } = options;
  const columns = resolveColumns(options.columns);
  const doc = new jsPDF();
  const title = options.title?.trim().length ? options.title.trim() : '재고 내역 리포트';

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, 105, 18, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont('Helvetica', 'normal');
  doc.text(`제품: ${product.productName} (품번 ${product.sku})`, 14, 30);
  doc.text(`생성일: ${formatDateTime(new Date())}`, 14, 36);
  doc.text(`총 기록 수: ${history.length}`, 14, 42);

  let y = 52;
  const lineHeight = 6;

  if (history.length === 0) {
    doc.text('등록된 재고 변동 기록이 없습니다.', 14, y);
  } else {
    history.forEach((record, index) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      doc.setFont('Helvetica', 'bold');
      const reasonValue = columns.includes('reason')
        ? getPdfValue('reason', product, record, columns)
        : undefined;
      const heading = reasonValue ?? `기록 #${index + 1}`;
      doc.text(`${index + 1}. ${heading}`, 14, y);
      y += lineHeight;

      doc.setFont('Helvetica', 'normal');
      columns.forEach((column) => {
        if (column === 'reason') return;
        const label = columnHeaders[column];
        const value = getPdfValue(column, product, record, columns);
        doc.text(`${label}: ${value}`, 18, y);
        y += lineHeight;
      });

      y += 2;
    });
  }

  return doc.output('blob');
};

const triggerDownload = (blob: Blob, filename: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const createHistoryReportBlob = (format: HistoryReportFormat, options: HistoryReportOptions) => {
  if (format === 'csv') {
    const csv = buildCsvContent(options);
    return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  }

  return buildPdfBlob(options);
};

export const downloadHistoryReport = async (format: HistoryReportFormat, options: HistoryReportOptions) => {
  const blob = await createHistoryReportBlob(format, options);
  const filename = ensureExtension(
    options.filename ?? buildHistoryReportFilename(options.product, format, options.filenamePattern),
    format,
  );
  triggerDownload(blob, filename);
};

const shareWithNavigator = async (blob: Blob, filename: string, title: string) => {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const filesSupported = typeof (navigator as any).canShare === 'function'
    ? (navigator as any).canShare({ files: [new File([blob], filename, { type: blob.type })] })
    : false;

  if ('share' in navigator && typeof navigator.share === 'function' && filesSupported) {
    const file = new File([blob], filename, { type: blob.type });
    try {
      await navigator.share({
        files: [file],
        title,
        text: `${title} (${filename})`,
      });
      return true;
    } catch (error) {
      console.warn('Report share cancelled or failed', error);
    }
  }

  return false;
};

export const shareHistoryReport = async (format: HistoryReportFormat, options: HistoryReportOptions) => {
  const blob = await createHistoryReportBlob(format, options);
  const filename = ensureExtension(
    options.filename ?? buildHistoryReportFilename(options.product, format, options.filenamePattern),
    format,
  );
  const shareTitle = options.title?.trim().length ? options.title.trim() : '재고 내역 리포트';
  const shared = await shareWithNavigator(blob, filename, shareTitle);

  if (!shared) {
    triggerDownload(blob, filename);
  }
};

export const generateHistoryPreviewRows = (history: StockHistory[]) => {
  return history.slice(0, 5).map((record) => ({
    id: record.id,
    timestamp: formatDateTime(record.timestamp),
    reason: record.reason,
    change: record.change,
    lotBatch: record.lotBatch ?? '-',
    workOrder: record.workOrder ?? '-',
    inspectionResult: record.inspectionResult ?? '-',
  }));
};
