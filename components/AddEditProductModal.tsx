
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Product, ProductDraft, ProductClassification } from '../types';
import { useSettings, type ProductTemplate } from '../src/domains/settings';
import Modal from './ui/Modal';
import { decimalInputProps, handleDecimalInputKeyDown } from '@/utils/numericInput';

type RequiredFieldKey =
  | 'productName'
  | 'sku'
  | 'unitOfMeasure'
  | 'leadTimeDays'
  | 'safetyStock'
  | 'reorderPoint';

const createEmptyFieldErrors = (): Record<RequiredFieldKey, string> => ({
  productName: '',
  sku: '',
  unitOfMeasure: '',
  leadTimeDays: '',
  safetyStock: '',
  reorderPoint: '',
});

const MAX_PRODUCT_NOTES_LENGTH = 500;

interface AddEditProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (product: ProductDraft, id?: string) => Promise<void> | void;
  productToEdit?: Product | null;
}

const AddEditProductModal: React.FC<AddEditProductModalProps> = ({ isOpen, onClose, onSave, productToEdit }) => {
  const [productName, setProductName] = useState('');
  const [classification, setClassification] = useState<ProductClassification>('RAW_MATERIAL');
  const [sku, setSku] = useState('');
  const [unitOfMeasure, setUnitOfMeasure] = useState('');
  const [supplier, setSupplier] = useState('');
  const [warehouseLocation, setWarehouseLocation] = useState('');
  const [costPerUnit, setCostPerUnit] = useState('');
  const [leadTimeDays, setLeadTimeDays] = useState('');
  const [reorderPoint, setReorderPoint] = useState('');
  const [currentStock, setCurrentStock] = useState('');
  const [safetyStock, setSafetyStock] = useState('');
  const [notes, setNotes] = useState('');
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<RequiredFieldKey, string>>(
    () => createEmptyFieldErrors(),
  );

  const isEditMode = !!productToEdit;
  const { productTemplates, defaultProductTemplateId } = useSettings();
  const templates = productTemplates ?? [];

  const defaultTemplate = useMemo(() => {
    if (!templates.length) {
      return undefined;
    }
    if (templates.some((template) => template.id === defaultProductTemplateId)) {
      return templates.find((template) => template.id === defaultProductTemplateId);
    }
    return templates[0];
  }, [defaultProductTemplateId, templates]);

  const findTemplateById = useCallback(
    (id: string | null | undefined) => templates.find((template) => template.id === id),
    [templates],
  );

  const selectedTemplate = useMemo(
    () => findTemplateById(selectedTemplateId),
    [findTemplateById, selectedTemplateId],
  );

  const toNumberString = (value?: number | null): string =>
    typeof value === 'number' && Number.isFinite(value) ? String(value) : '';

  const applyTemplateDefaults = useCallback(
    (template?: ProductTemplate) => {
      const baseDefaults = defaultTemplate?.defaults ?? {};
      const templateDefaults = template?.defaults ?? {};
      const resolvedDefaults: ProductTemplate['defaults'] = {
        ...baseDefaults,
        ...templateDefaults,
      };

      setClassification(resolvedDefaults.classification ?? 'RAW_MATERIAL');
      setUnitOfMeasure(resolvedDefaults.unitOfMeasure ?? '');
      setSupplier(resolvedDefaults.supplier ?? '');
      setWarehouseLocation(resolvedDefaults.warehouseLocation ?? '');
      setCostPerUnit(toNumberString(resolvedDefaults.costPerUnit));
      setLeadTimeDays(toNumberString(resolvedDefaults.leadTimeDays));
      setReorderPoint(toNumberString(resolvedDefaults.reorderPoint));
      const resolvedCurrentStock =
        resolvedDefaults.currentStock ?? baseDefaults.currentStock ?? 0;
      setCurrentStock(toNumberString(resolvedCurrentStock));
      setSafetyStock(toNumberString(resolvedDefaults.safetyStock));
      setNotes(resolvedDefaults.notes ?? '');
      setFormErrors([]);
      setFieldErrors(createEmptyFieldErrors());
    },
    [defaultTemplate],
  );

  const resetForm = useCallback(
    (template?: ProductTemplate) => {
      setProductName('');
      setSku('');
      applyTemplateDefaults(template);
      setFieldErrors(createEmptyFieldErrors());
    },
    [applyTemplateDefaults],
  );

  const hydrateFormFromProduct = useCallback(
    (product: Product) => {
      setProductName(product.productName);
      setClassification(product.classification);
      setSku(product.sku);
      setUnitOfMeasure(product.unitOfMeasure);
      setSupplier(product.supplier);
      setWarehouseLocation(product.warehouseLocation);
      setCostPerUnit(product.costPerUnit.toString());
      setLeadTimeDays(product.leadTimeDays.toString());
      setReorderPoint(product.reorderPoint.toString());
      setCurrentStock(product.currentStock.toString());
      setSafetyStock(product.safetyStock.toString());
      setNotes(product.notes || '');
      setFormErrors([]);
      setFieldErrors(createEmptyFieldErrors());
    },
    [],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (isEditMode && productToEdit) {
      hydrateFormFromProduct(productToEdit);
      setSelectedTemplateId('');
      return;
    }

    const templateToApply = defaultTemplate;
    const resolvedTemplateId = templateToApply?.id ?? '';
    setSelectedTemplateId(resolvedTemplateId);
    resetForm(templateToApply);
  }, [isOpen, isEditMode, productToEdit, defaultTemplate, hydrateFormFromProduct, resetForm]);

  useEffect(() => {
    if (!isOpen || isEditMode) {
      return;
    }

    if (!selectedTemplateId) {
      return;
    }

    if (!findTemplateById(selectedTemplateId)) {
      const fallbackTemplate = defaultTemplate ?? templates[0];
      const fallbackId = fallbackTemplate?.id ?? '';
      setSelectedTemplateId(fallbackId);
      if (fallbackTemplate) {
        applyTemplateDefaults(fallbackTemplate);
      }
    }
  }, [
    isOpen,
    isEditMode,
    selectedTemplateId,
    findTemplateById,
    defaultTemplate,
    templates,
    applyTemplateDefaults,
  ]);

  const handleTemplateSelectChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const templateId = event.target.value;
      setSelectedTemplateId(templateId);
      if (templateId) {
        const template = findTemplateById(templateId);
        if (template) {
          applyTemplateDefaults(template);
        }
        return;
      }

      if (isEditMode && productToEdit) {
        hydrateFormFromProduct(productToEdit);
      } else {
        resetForm(defaultTemplate);
      }
    },
    [
      applyTemplateDefaults,
      defaultTemplate,
      findTemplateById,
      hydrateFormFromProduct,
      isEditMode,
      productToEdit,
      resetForm,
    ],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: string[] = [];
    const requiredFieldErrors = createEmptyFieldErrors();

    const trimmedName = productName.trim();
    if (!trimmedName) {
      requiredFieldErrors.productName = '필수 항목입니다';
    }

    const trimmedSku = sku.trim();
    if (!trimmedSku) {
      requiredFieldErrors.sku = '필수 항목입니다';
    }

    const trimmedUnitOfMeasure = unitOfMeasure.trim();
    if (!trimmedUnitOfMeasure) {
      requiredFieldErrors.unitOfMeasure = '필수 항목입니다';
    }

    let parsedCost: number | undefined;
    if (costPerUnit.trim()) {
      parsedCost = parseFloat(costPerUnit.replace(/,/g, '.'));
      if (Number.isNaN(parsedCost) || parsedCost < 0) {
        errors.push('단가(Cost)는 0 이상 숫자여야 합니다.');
      }
    }

    const trimmedLeadTime = leadTimeDays.trim();
    let parsedLeadTime: number | undefined;
    if (!trimmedLeadTime) {
      requiredFieldErrors.leadTimeDays = '필수 항목입니다';
    } else {
      parsedLeadTime = parseInt(trimmedLeadTime, 10);
      if (Number.isNaN(parsedLeadTime) || parsedLeadTime < 0) {
        errors.push('리드타임은 0 이상 정수로 입력해야 합니다.');
      }
    }

    const trimmedReorderPoint = reorderPoint.trim();
    let parsedReorderPoint: number | undefined;
    if (!trimmedReorderPoint) {
      requiredFieldErrors.reorderPoint = '필수 항목입니다';
    } else {
      parsedReorderPoint = parseInt(trimmedReorderPoint, 10);
      if (Number.isNaN(parsedReorderPoint) || parsedReorderPoint < 0) {
        errors.push('재주문점은 0 이상 정수로 입력해야 합니다.');
      }
    }

    const trimmedCurrentStock = currentStock.trim();
    let parsedCurrentStock: number | undefined;
    if (trimmedCurrentStock) {
      const value = parseInt(trimmedCurrentStock, 10);
      if (Number.isNaN(value) || value < 0) {
        errors.push('현재 재고는 0 이상 정수로 입력해야 합니다.');
      } else {
        parsedCurrentStock = value;
      }
    }

    const trimmedSafetyStock = safetyStock.trim();
    let parsedSafetyStock: number | undefined;
    if (!trimmedSafetyStock) {
      requiredFieldErrors.safetyStock = '필수 항목입니다';
    } else {
      parsedSafetyStock = parseInt(trimmedSafetyStock, 10);
      if (Number.isNaN(parsedSafetyStock) || parsedSafetyStock < 0) {
        errors.push('안전 재고는 0 이상 정수로 입력해야 합니다.');
      }
    }

    setFieldErrors(requiredFieldErrors);

    const hasRequiredFieldErrors = Object.values(requiredFieldErrors).some(Boolean);

    if (errors.length > 0 || hasRequiredFieldErrors) {
      setFormErrors(errors);
      return;
    }

    if (
      parsedLeadTime === undefined ||
      parsedSafetyStock === undefined ||
      parsedReorderPoint === undefined ||
      !trimmedName ||
      !trimmedSku ||
      !trimmedUnitOfMeasure
    ) {
      return;
    }

    const trimmedSupplier = supplier.trim();
    const trimmedLocationLabel = warehouseLocation.trim();
    const trimmedNotes = notes.trim();

    if (trimmedNotes.length > MAX_PRODUCT_NOTES_LENGTH) {
      setFormErrors([`메모는 최대 ${MAX_PRODUCT_NOTES_LENGTH}자까지 입력할 수 있습니다.`]);
      return;
    }

    const productData: ProductDraft = {
      productName: trimmedName,
      classification,
      sku: trimmedSku,
      unitOfMeasure: trimmedUnitOfMeasure,
      warehouseLocation: trimmedLocationLabel || '미지정',
      storageHierarchy: undefined,
      supplier: trimmedSupplier || '미지정',
      supplierCode: undefined,
      costPerUnit: parsedCost ?? 0,
      leadTimeDays: parsedLeadTime,
      reorderPoint: parsedReorderPoint,
      currentStock: parsedCurrentStock ?? 0,
      safetyStock: parsedSafetyStock,
      notes: trimmedNotes || undefined,
      billOfMaterials: undefined,
      averageDailyDemand: undefined,
      inboundUnits: undefined,
      openWorkOrders: undefined,
      supplierRiskScore: undefined,
      supplierDeliverySlaDays: undefined,
      supplierSlaBreachRate: undefined,
      supplierPriceVolatility: undefined,
      hasAlternateSupplier: undefined,
      procurementOwner: undefined,
      procurementDueDate: undefined,
    };

    setFormErrors([]);

    try {
      setIsSaving(true);
      await onSave(productData, productToEdit?.id);
      onClose();
    } catch (error) {
      console.error('[AddEditProductModal] Failed to save product', error);
      setFormErrors([
        '제품을 저장하는 동안 문제가 발생했습니다. 다시 시도해주세요.',
      ]);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditMode ? '제품 수정' : '새 제품 추가'}>
      <form onSubmit={handleSubmit} className="space-y-6">
        {formErrors.length > 0 && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-600">
            <p className="font-semibold">제조 데이터 확인이 필요합니다:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {formErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        <section className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-700">템플릿</h4>
            <p className="text-xs text-slate-400">
              템플릿을 선택하면 주요 필드가 기본값으로 채워집니다. 간소화된 기본값은 중소기업 필수 항목에 맞춰 구성되어 있습니다.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="product-template" className="block text-sm font-medium text-gray-700">
                기본값 템플릿
              </label>
              <select
                id="product-template"
                value={selectedTemplateId}
                onChange={handleTemplateSelectChange}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
              >
                <option value="">선택 안 함</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              {selectedTemplate ? (
                <div className="space-y-1">
                  <p className="font-medium text-slate-700">{selectedTemplate.name}</p>
                  <p className="text-slate-600">
                    {selectedTemplate.description?.trim() || '설정된 설명이 없습니다.'}
                  </p>
                  <div className="text-[11px] text-slate-500">
                    <p>단위: {selectedTemplate.defaults.unitOfMeasure ?? '-'}</p>
                    <p>공급처: {selectedTemplate.defaults.supplier ?? '-'}</p>
                    <p>리드타임: {selectedTemplate.defaults.leadTimeDays ?? '-'}일</p>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500">템플릿을 선택하면 저장된 기본값이 폼에 반영됩니다.</p>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-700">기본 정보</h4>
            <p className="text-xs text-slate-400">핵심 식별자와 공급처 정보만 간결하게 입력하세요.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="productName" className="block text-sm font-medium text-gray-700">제품명 <span className="text-red-500">*</span></label>
              <input
                type="text"
                id="productName"
                value={productName}
                onChange={(e) => {
                  const value = e.target.value;
                  setProductName(value);
                  setFieldErrors((prev) => {
                    if (!prev.productName || !value.trim()) {
                      return prev;
                    }
                    return { ...prev, productName: '' };
                  });
                }}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
              />
              {fieldErrors.productName && (
                <p className="mt-1 text-xs text-rose-500">{fieldErrors.productName}</p>
              )}
            </div>
            <div>
              <label htmlFor="sku" className="block text-sm font-medium text-gray-700">품번 <span className="text-red-500">*</span></label>
              <input
                type="text"
                id="sku"
                value={sku}
                onChange={(e) => {
                  const value = e.target.value;
                  setSku(value);
                  setFieldErrors((prev) => {
                    if (!prev.sku || !value.trim()) {
                      return prev;
                    }
                    return { ...prev, sku: '' };
                  });
                }}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
              />
              {fieldErrors.sku && (
                <p className="mt-1 text-xs text-rose-500">{fieldErrors.sku}</p>
              )}
            </div>
            <div>
              <label htmlFor="classification" className="block text-sm font-medium text-gray-700">제품 유형</label>
              <select
                id="classification"
                value={classification}
                onChange={(e) => setClassification(e.target.value as ProductClassification)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
              >
                <option value="RAW_MATERIAL">원자재</option>
                <option value="WIP">재공품 (WIP)</option>
                <option value="FINISHED_GOOD">완제품</option>
              </select>
            </div>
            <div>
              <label htmlFor="supplier" className="block text-sm font-medium text-gray-700">주요 공급처</label>
              <input
                type="text"
                id="supplier"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="unitOfMeasure" className="block text-sm font-medium text-gray-700">단위 (UOM) <span className="text-red-500">*</span></label>
              <input
                type="text"
                id="unitOfMeasure"
                value={unitOfMeasure}
                onChange={(e) => {
                  const value = e.target.value;
                  setUnitOfMeasure(value);
                  setFieldErrors((prev) => {
                    if (!prev.unitOfMeasure || !value.trim()) {
                      return prev;
                    }
                    return { ...prev, unitOfMeasure: '' };
                  });
                }}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
              />
              {fieldErrors.unitOfMeasure && (
                <p className="mt-1 text-xs text-rose-500">{fieldErrors.unitOfMeasure}</p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="warehouseLocation" className="block text-sm font-medium text-gray-700">보관 위치</label>
              <input
                type="text"
                id="warehouseLocation"
                value={warehouseLocation}
                onChange={(e) => setWarehouseLocation(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
              />
              <p className="mt-1 text-xs text-slate-400">미입력 시 ‘미지정’으로 저장됩니다.</p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-700">리드타임 & 비용</h4>
            <p className="text-xs text-slate-400">리드타임은 필수이며, 단가는 필요 시 입력하세요.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="leadTimeDays" className="block text-sm font-medium text-gray-700">리드타임 (일) <span className="text-red-500">*</span></label>
              <input
                type="number"
                {...decimalInputProps}
                min="0"
                id="leadTimeDays"
                value={leadTimeDays}
                onChange={(e) => {
                  const value = e.target.value;
                  setLeadTimeDays(value);
                  setFieldErrors((prev) => {
                    if (!prev.leadTimeDays || !value.trim()) {
                      return prev;
                    }
                    return { ...prev, leadTimeDays: '' };
                  });
                }}
                onKeyDown={handleDecimalInputKeyDown}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
              />
              {fieldErrors.leadTimeDays && (
                <p className="mt-1 text-xs text-rose-500">{fieldErrors.leadTimeDays}</p>
              )}
            </div>
            <div>
              <label htmlFor="costPerUnit" className="block text-sm font-medium text-gray-700">단가 (₩)</label>
              <input
                type="number"
                {...decimalInputProps}
                step="0.01"
                min="0"
                id="costPerUnit"
                value={costPerUnit}
                onChange={(e) => setCostPerUnit(e.target.value)}
                onKeyDown={handleDecimalInputKeyDown}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
              />
              <p className="mt-1 text-xs text-slate-400">입력하지 않으면 0원으로 저장됩니다.</p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-700">재고 핵심 지표</h4>
            <p className="text-xs text-slate-400">안전 재고와 재주문점을 반드시 입력하세요.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="currentStock" className="block text-sm font-medium text-gray-700">현재 재고</label>
              <input
                type="number"
                {...decimalInputProps}
                min="0"
                id="currentStock"
                value={currentStock}
                onChange={(e) => setCurrentStock(e.target.value)}
                onKeyDown={handleDecimalInputKeyDown}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
              />
            </div>
            <div>
              <label htmlFor="safetyStock" className="block text-sm font-medium text-gray-700">안전 재고 <span className="text-red-500">*</span></label>
              <input
                type="number"
                {...decimalInputProps}
                min="0"
                id="safetyStock"
                value={safetyStock}
                onChange={(e) => {
                  const value = e.target.value;
                  setSafetyStock(value);
                  setFieldErrors((prev) => {
                    if (!prev.safetyStock || !value.trim()) {
                      return prev;
                    }
                    return { ...prev, safetyStock: '' };
                  });
                }}
                onKeyDown={handleDecimalInputKeyDown}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
              />
              {fieldErrors.safetyStock && (
                <p className="mt-1 text-xs text-rose-500">{fieldErrors.safetyStock}</p>
              )}
            </div>
            <div>
              <label htmlFor="reorderPoint" className="block text-sm font-medium text-gray-700">재주문점 (ROP) <span className="text-red-500">*</span></label>
              <input
                type="number"
                {...decimalInputProps}
                min="0"
                id="reorderPoint"
                value={reorderPoint}
                onChange={(e) => {
                  const value = e.target.value;
                  setReorderPoint(value);
                  setFieldErrors((prev) => {
                    if (!prev.reorderPoint || !value.trim()) {
                      return prev;
                    }
                    return { ...prev, reorderPoint: '' };
                  });
                }}
                onKeyDown={handleDecimalInputKeyDown}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
              />
              {fieldErrors.reorderPoint && (
                <p className="mt-1 text-xs text-rose-500">{fieldErrors.reorderPoint}</p>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-700">운영 메모</h4>
            <p className="text-xs text-slate-400">현장 공유가 필요한 특이사항이나 업무 인수인계 메모를 기록하세요.</p>
          </div>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={MAX_PRODUCT_NOTES_LENGTH}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500"
            placeholder="예: 포장 시 2차 검수 필요"
          />
        </section>

        <div className="flex justify-end pt-4 space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving}
          >
            취소
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving}
          >
            {isSaving ? '저장 중…' : isEditMode ? '변경사항 저장' : '제품 추가'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default AddEditProductModal;