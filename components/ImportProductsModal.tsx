import React, { useState } from 'react';
import Modal from './ui/Modal';
import { ProductDraft } from '../types';
import {
  parseImportedProducts,
  REQUIRED_HEADERS,
  ImportError,
} from '../utils/importProducts';
import { importCsv } from '@/src/services/api';

interface ImportProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (products: ProductDraft[]) => void;
  useServer?: boolean;
  onServerImportComplete?: () => void | Promise<void>;
}

const ImportProductsModal: React.FC<ImportProductsModalProps> = ({ isOpen, onClose, onImport, useServer = false, onServerImportComplete }) => {
  const [csvText, setCsvText] = useState('');
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [preview, setPreview] = useState<ProductDraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    const result = parseImportedProducts(csvText);
    setErrors(result.errors);
    setPreview(result.products);

    if (result.errors.length === 0 && result.products.length > 0) {
      if (useServer) {
        setIsSubmitting(true);
        try {
          await importCsv({ csvText });
          if (onServerImportComplete) {
            await onServerImportComplete();
          }
          setCsvText('');
          setPreview([]);
          onClose();
        } catch (error) {
          console.error(error);
          alert('CSV 업로드 중 오류가 발생했습니다.');
        } finally {
          setIsSubmitting(false);
        }
        return;
      }

      onImport(result.products);
      setCsvText('');
      setPreview([]);
      onClose();
    }
  };

  const sampleHeader = `${REQUIRED_HEADERS.join(',')},supplierCode,contractLeadTimeDays,minimumOrderQuantity,isMultiSourced,riskIndicator,averageDailyDemand,inboundUnits,openWorkOrders,supplierRiskScore,supplierDeliverySlaDays,supplierSlaBreachRate,supplierPriceVolatility,hasAlternateSupplier,procurementOwner,procurementDueDate,notes,billOfMaterials`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="제품 일괄 업로드">
      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-700">제조용 확장 필드 안내</h4>
          <p className="text-xs text-slate-500">
            아래 헤더를 포함한 CSV를 업로드하면 원자재/재공품/완제품 데이터를 한 번에 등록할 수 있습니다.
          </p>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs font-mono text-slate-700">
            {sampleHeader}
          </div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
            <li><strong>classification</strong>: RAW_MATERIAL, WIP, FINISHED_GOOD 중 하나를 사용하세요.</li>
            <li>
              <strong>costPerUnit</strong>, <strong>leadTimeDays</strong>, <strong>contractLeadTimeDays</strong>, <strong>minimumOrderQuantity</strong>, <strong>reorderPoint</strong>, <strong>currentStock</strong>, <strong>safetyStock</strong>
              은 숫자여야 합니다.
            </li>
            <li><strong>isMultiSourced</strong>: TRUE/FALSE 또는 single/multi 등으로 표기하면 됩니다.</li>
            <li><strong>riskIndicator</strong>: LOW, MEDIUM, HIGH, CRITICAL 중 선택하세요.</li>
            <li><strong>averageDailyDemand</strong>, <strong>inboundUnits</strong>, <strong>openWorkOrders</strong>: 생산 및 입고 계획 수치를 입력합니다. 값이 없으면 비워둘 수 있습니다.</li>
            <li><strong>supplierRiskScore</strong>, <strong>supplierSlaBreachRate</strong>, <strong>supplierPriceVolatility</strong>: 0과 1 사이의 값을 사용하세요.</li>
            <li><strong>supplierDeliverySlaDays</strong>: 공급사 SLA 일수를 정수로 입력하세요. <strong>hasAlternateSupplier</strong>는 TRUE/FALSE로 기재합니다.</li>
            <li><strong>procurementDueDate</strong>: ISO 날짜 형식(예: 2024-04-30)으로 입력하면 자동으로 일정에 반영됩니다.</li>
            <li><strong>billOfMaterials</strong>: "부품 품번:수량" 항목을 세미콜론(;) 또는 파이프(|)로 구분하세요. 예) <code>RM-001:2;WIP-220:0.5</code></li>
          </ul>
        </section>

        <div>
          <label htmlFor="csv" className="block text-sm font-medium text-gray-700">CSV 데이터</label>
          <textarea
            id="csv"
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            rows={10}
            placeholder={`${sampleHeader}\n크루아상 완제품,FINISHED_GOOD,FG-001,ea,완제품-01,내부 제조,3.5,1,30,150,50,SUP-100,2,500,TRUE,HIGH,180,40,3,0.42,12,0.18,0.2,TRUE,김조달,2024-04-30,내부 생산 품목,WIP-220:1`}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
          />
        </div>

        {errors.length > 0 && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-600">
            <p className="font-semibold">가져온 데이터에 문제가 있습니다:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {errors.map((error) => (
                <li key={`${error.row}-${error.message}`}>
                  {`행 ${error.row}: ${error.message}`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {preview.length > 0 && (
          <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm font-semibold text-emerald-700">검증 완료 — {preview.length}개의 제품이 업로드됩니다.</p>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-emerald-200 text-xs text-emerald-900">
                <thead className="bg-emerald-100">
                  <tr>
                    <th className="px-2 py-1 text-left">제품명</th>
                    <th className="px-2 py-1 text-left">유형</th>
                    <th className="px-2 py-1 text-left">품번</th>
                    <th className="px-2 py-1 text-left">공급사 코드</th>
                    <th className="px-2 py-1 text-right">재고</th>
                    <th className="px-2 py-1 text-right">안전재고</th>
                    <th className="px-2 py-1 text-right">MOQ</th>
                    <th className="px-2 py-1 text-right">다중 소싱</th>
                    <th className="px-2 py-1 text-right">계약 LT</th>
                    <th className="px-2 py-1 text-right">리드타임</th>
                    <th className="px-2 py-1 text-right">리스크</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 5).map((product) => (
                    <tr key={`${product.sku}-${product.productName}`} className="odd:bg-white even:bg-emerald-50/60">
                      <td className="px-2 py-1">{product.productName}</td>
                      <td className="px-2 py-1">{product.classification}</td>
                      <td className="px-2 py-1 font-mono">{product.sku}</td>
                      <td className="px-2 py-1 font-mono">{product.supplierCode ?? '-'}</td>
                      <td className="px-2 py-1 text-right">{product.currentStock}</td>
                      <td className="px-2 py-1 text-right">{product.safetyStock}</td>
                      <td className="px-2 py-1 text-right">{product.minimumOrderQuantity ?? '-'}</td>
                      <td className="px-2 py-1 text-right">{product.isMultiSourced === undefined ? '-' : product.isMultiSourced ? 'Y' : 'N'}</td>
                      <td className="px-2 py-1 text-right">{product.contractLeadTimeDays ?? '-'}</td>
                      <td className="px-2 py-1 text-right">{product.leadTimeDays}일</td>
                      <td className="px-2 py-1 text-right">{product.riskIndicator ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.length > 5 && (
              <p className="text-xs text-emerald-600">총 {preview.length}개의 레코드 중 상위 5개만 미리보기로 표시합니다.</p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md bg-gray-200 px-4 py-2 text-sm text-gray-800 hover:bg-gray-300">
            취소
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
              isSubmitting
                ? 'bg-primary-400 cursor-not-allowed'
                : 'bg-primary-600 hover:bg-primary-700'
            }`}
          >
            {isSubmitting ? '업로드 중...' : 'CSV 검증 및 업로드'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default ImportProductsModal;
