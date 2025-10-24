
import React, { useMemo, useState } from 'react';
import { Product, StockHistory } from '../types';
import {
  buildHistoryReportFilename,
  downloadHistoryReport,
  shareHistoryReport,
  type HistoryReportAction,
  type HistoryReportFormat,
} from '../utils/reportHelpers';
import Modal from './ui/Modal';
import { fetchHistoryCsv } from '@/src/services/api';
import { useSettings } from '@/src/domains/settings';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  history: StockHistory[];
  useServer?: boolean;
  serverProductId?: number;
}

const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose, product, history, useServer = false, serverProductId }) => {
  const { reportPreferences } = useSettings();
  const historyPreferences = reportPreferences.history;

  const defaultFormat = historyPreferences.defaultFormat ?? 'pdf';
  const defaultAction = historyPreferences.defaultAction ?? 'download';
  const columns = historyPreferences.enabledColumns?.length
    ? historyPreferences.enabledColumns
    : undefined;
  const reportTitle = historyPreferences.title?.trim().length
    ? historyPreferences.title.trim()
    : undefined;

  const actionCombos = useMemo(() => {
    const combos: Array<{ action: HistoryReportAction; format: HistoryReportFormat }> = [];
    const addCombo = (combo: { action: HistoryReportAction; format: HistoryReportFormat }) => {
      if (!combos.some((entry) => entry.action === combo.action && entry.format === combo.format)) {
        combos.push(combo);
      }
    };

    addCombo({ action: defaultAction, format: defaultFormat });
    addCombo({ action: defaultAction === 'download' ? 'share' : 'download', format: defaultFormat });
    addCombo({ action: 'download', format: defaultFormat === 'csv' ? 'pdf' : 'csv' });
    addCombo({ action: 'share', format: defaultFormat === 'csv' ? 'pdf' : 'csv' });

    return combos;
  }, [defaultAction, defaultFormat]);

  if (!product) return null;

  const [isCsvDownloading, setIsCsvDownloading] = useState(false);

  const getChangeColor = (change: number) => {
    if (change > 0) return 'text-green-600';
    if (change < 0) return 'text-red-600';
    return 'text-gray-500';
  };

  const getInspectionBadge = (result?: string) => {
    if (!result) {
      return { label: '검사 정보 없음', className: 'bg-slate-100 text-slate-600' };
    }
    if (/합격|pass/i.test(result)) {
      return { label: result, className: 'bg-emerald-100 text-emerald-700' };
    }
    if (/조건|보류|pending/i.test(result)) {
      return { label: result, className: 'bg-amber-100 text-amber-700' };
    }
    return { label: result, className: 'bg-rose-100 text-rose-700' };
  };

  const handleReportAction = (format: HistoryReportFormat, action: HistoryReportAction) => {
    const filename = buildHistoryReportFilename(product, format, historyPreferences.filenamePattern);
    const options = {
      product,
      history,
      filename,
      columns,
      title: reportTitle,
    };

    if (action === 'download') {
      if (useServer && format === 'csv') {
        if (!serverProductId) {
          alert('이 제품의 서버 식별자를 찾을 수 없어 CSV를 다운로드할 수 없습니다.');
          return;
        }

        setIsCsvDownloading(true);
        void (async () => {
          try {
            const response = await fetchHistoryCsv({ productId: serverProductId });
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
          } catch (error) {
            console.error(error);
            alert('서버에서 CSV 내역을 내려받는 데 실패했습니다.');
          } finally {
            setIsCsvDownloading(false);
          }
        })();

        return;
      }

      void downloadHistoryReport(format, options);
      return;
    }

    void shareHistoryReport(format, options);
  };

  const formatLabels: Record<HistoryReportFormat, string> = {
    csv: 'CSV',
    pdf: 'PDF',
  };

  const actionLabels: Record<HistoryReportAction, string> = {
    download: '다운로드',
    share: '공유',
  };

  const getButtonClass = (combo: { action: HistoryReportAction; format: HistoryReportFormat }, isDefault: boolean) => {
    const base = 'rounded-lg px-3 py-1.5 text-xs font-semibold transition';
    if (combo.action === 'share') {
      return isDefault
        ? `${base} bg-emerald-600 text-white hover:bg-emerald-500`
        : `${base} bg-emerald-100 text-emerald-700 hover:bg-emerald-200`;
    }

    if (combo.format === 'csv' && useServer) {
      return isDefault
        ? `${base} bg-blue-600 text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50`
        : `${base} bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50`;
    }

    return isDefault
      ? `${base} bg-slate-900 text-white hover:bg-slate-800`
      : `${base} bg-slate-100 text-slate-600 hover:bg-slate-200`;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`재고 내역: ${product.productName}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
        <div className="text-xs text-gray-500">
          Lot/Batch, 작업지시, 검사 결과까지 포함한 상세 이력입니다.
        </div>
        <div className="flex flex-wrap gap-2">
          {actionCombos.map((combo) => {
            const isDefault = combo.action === defaultAction && combo.format === defaultFormat;
            const isCsvDownloadAction = combo.action === 'download' && combo.format === 'csv';
            const isDisabled = isCsvDownloadAction && useServer && !serverProductId;
            const label = isCsvDownloadAction && isCsvDownloading
              ? '다운로드 중...'
              : `${isDefault ? '기본 ' : ''}${formatLabels[combo.format]} ${actionLabels[combo.action]}`;

            return (
              <button
                key={`${combo.action}-${combo.format}`}
                type="button"
                onClick={() => handleReportAction(combo.format, combo.action)}
                disabled={isDisabled}
                className={getButtonClass(combo, isDefault)}
              >
                {label}
              </button>
            );
          })}
        </div>
        {useServer && !serverProductId && (
          <p className="text-xs text-amber-600">서버 제품 ID가 없어 CSV 다운로드를 사용할 수 없습니다.</p>
        )}
      </div>
      <div className="max-h-96 overflow-y-auto">
        {history.length === 0 ? (
          <p className="text-gray-500 text-center py-4">이 제품에 대한 내역이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {history.map((record) => {
              const inspection = getInspectionBadge(record.inspectionResult);
              return (
                <li key={record.id} className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{record.reason}</p>
                      <p className="text-xs text-gray-500">{new Date(record.timestamp).toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-semibold ${getChangeColor(record.change)}`}>
                        {record.change > 0 ? `+${record.change}` : record.change}
                      </p>
                      <p className="text-xs text-gray-500">변경 후 재고: {record.newStockLevel}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
                      Lot/Batch {record.lotBatch ?? '미등록'}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
                      작업지시 {record.workOrder ?? '미지정'}
                    </span>
                    <span className={`rounded-full px-3 py-1 font-semibold ${inspection.className}`}>
                      {inspection.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="mt-4 flex justify-end border-t pt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-300"
        >
          닫기
        </button>
      </div>
    </Modal>
  );
};

export default HistoryModal;
