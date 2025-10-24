import React, { useCallback } from 'react';
import type { ProductClassification, SupplyRiskIndicator, WarehouseLocationDetail } from '../../../../types';
import { ProductTemplate, SettingsState, useSettings } from '../SettingsProvider';
import { decimalInputProps, handleDecimalInputKeyDown } from '@/utils/numericInput';

type NumericSettingKey =
  | 'lowStockWarningThreshold'
  | 'criticalStockWarningThreshold'
  | 'safetyStockMultiplier'
  | 'minimumDaysOfCover'
  | 'autoRefreshCadenceMinutes';

type BooleanSettingKey = 'useServer' | 'slackNotificationsEnabled' | 'webhookNotificationsEnabled';

type StringSettingKey = 'slackWebhookUrl' | 'webhookUrl';

const Section: React.FC<{
  title: string;
  description: string;
  children: React.ReactNode;
}> = ({ title, description, children }) => (
  <section className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm">
    <div className="mb-4">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
    </div>
    <div className="flex flex-col gap-4">{children}</div>
  </section>
);

const classificationOptions: { value: ProductClassification; label: string }[] = [
  { value: 'RAW_MATERIAL', label: '원자재' },
  { value: 'WIP', label: '재공품 (WIP)' },
  { value: 'FINISHED_GOOD', label: '완제품' },
];

const riskIndicatorOptions: { value: SupplyRiskIndicator; label: string }[] = [
  { value: 'LOW', label: 'LOW' },
  { value: 'MEDIUM', label: 'MEDIUM' },
  { value: 'HIGH', label: 'HIGH' },
  { value: 'CRITICAL', label: 'CRITICAL' },
];

const storageHierarchyFields: Array<{ key: keyof WarehouseLocationDetail; label: string }> = [
  { key: 'site', label: '사업장' },
  { key: 'warehouse', label: '창고' },
  { key: 'zone', label: '존' },
  { key: 'aisle', label: '통로' },
  { key: 'rack', label: '랙' },
  { key: 'shelf', label: '선반' },
  { key: 'bin', label: '빈' },
];

const generateTemplateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `template-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const createNewTemplate = (): ProductTemplate => ({
  id: generateTemplateId(),
  name: '새 템플릿',
  description: '제품 등록 시 자동으로 불러올 기본값을 정의하세요.',
  defaults: {
    classification: 'RAW_MATERIAL',
    unitOfMeasure: 'EA',
    supplier: '',
    warehouseLocation: '',
    leadTimeDays: 7,
    minimumOrderQuantity: 1,
    costPerUnit: 0,
    reorderPoint: 0,
    safetyStock: 0,
    currentStock: 0,
  },
});

const normalizeEmptyString = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeIntegerInput = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.max(0, Math.round(parsed));
};

const normalizeDecimalInput = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.max(0, parsed);
};

const normalizeRatioInput = (value: string): number | undefined => {
  const decimal = normalizeDecimalInput(value);
  if (typeof decimal !== 'number') {
    return undefined;
  }
  return Math.min(1, Math.max(0, decimal));
};

export const SettingsPage: React.FC = () => {
  const {
    useServer,
    slackNotificationsEnabled,
    slackWebhookUrl,
    webhookNotificationsEnabled,
    webhookUrl,
    lowStockWarningThreshold,
    criticalStockWarningThreshold,
    safetyStockMultiplier,
    minimumDaysOfCover,
    autoRefreshCadenceMinutes,
    productTemplates,
    defaultProductTemplateId,
    updateSettings,
  } = useSettings();

  const handleCheckboxChange = useCallback(
    (key: BooleanSettingKey) => (event: React.ChangeEvent<HTMLInputElement>) => {
      updateSettings({ [key]: event.target.checked } as Partial<SettingsState>);
    },
    [updateSettings],
  );

  const handleNumericChange = useCallback(
    (key: NumericSettingKey) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value);
      updateSettings({ [key]: Number.isFinite(value) ? value : 0 } as Partial<SettingsState>);
    },
    [updateSettings],
  );

  const handleEndpointChange = useCallback(
    (key: StringSettingKey) => (event: React.ChangeEvent<HTMLInputElement>) => {
      updateSettings({ [key]: event.target.value } as Partial<SettingsState>);
    },
    [updateSettings],
  );

  const updateTemplate = useCallback(
    (id: string, updater: (template: ProductTemplate) => ProductTemplate) => {
      updateSettings({
        productTemplates: productTemplates.map((template) =>
          template.id === id ? updater(template) : template,
        ),
      });
    },
    [productTemplates, updateSettings],
  );

  const updateTemplateDefaults = useCallback(
    <K extends keyof ProductTemplate['defaults']>(
      id: string,
      key: K,
      value: ProductTemplate['defaults'][K] | undefined,
    ) => {
      updateTemplate(id, (template) => {
        const nextDefaults: ProductTemplate['defaults'] = { ...template.defaults };
        if (value === undefined) {
          (nextDefaults as Record<string, unknown>)[key] = null as unknown as ProductTemplate['defaults'][K];
        } else {
          (nextDefaults as Record<string, unknown>)[key] = value;
        }
        return { ...template, defaults: nextDefaults };
      });
    },
    [updateTemplate],
  );

  const handleTemplateNameChange = useCallback(
    (id: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      updateTemplate(id, (template) => ({ ...template, name: value }));
    },
    [updateTemplate],
  );

  const handleTemplateDescriptionChange = useCallback(
    (id: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      updateTemplate(id, (template) => ({ ...template, description: event.target.value }));
    },
    [updateTemplate],
  );

  const handleTemplateStringDefaultChange = useCallback(
    (
        id: string,
        key:
          | 'unitOfMeasure'
          | 'supplier'
          | 'supplierCode'
          | 'warehouseLocation'
          | 'procurementOwner'
          | 'notes',
      ) =>
      (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const normalized = normalizeEmptyString(event.target.value);
        updateTemplateDefaults(id, key, normalized as never);
      },
    [updateTemplateDefaults],
  );

  const handleTemplateClassificationChange = useCallback(
    (id: string) => (event: React.ChangeEvent<HTMLSelectElement>) => {
      updateTemplateDefaults(id, 'classification', event.target.value as ProductClassification);
    },
    [updateTemplateDefaults],
  );

  const handleTemplateRiskChange = useCallback(
    (id: string) => (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      updateTemplateDefaults(id, 'riskIndicator', value ? (value as SupplyRiskIndicator) : undefined);
    },
    [updateTemplateDefaults],
  );

  const handleTemplateBooleanChange = useCallback(
    (id: string, key: 'isMultiSourced') => (event: React.ChangeEvent<HTMLInputElement>) => {
      updateTemplateDefaults(id, key, event.target.checked as never);
    },
    [updateTemplateDefaults],
  );

  const handleTemplateIntegerDefaultChange = useCallback(
    (
        id: string,
        key:
          | 'leadTimeDays'
          | 'contractLeadTimeDays'
          | 'minimumOrderQuantity'
          | 'supplierDeliverySlaDays'
          | 'reorderPoint'
          | 'safetyStock',
      ) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = normalizeIntegerInput(event.target.value);
        updateTemplateDefaults(id, key, value as never);
      },
    [updateTemplateDefaults],
  );

  const handleTemplateDecimalDefaultChange = useCallback(
    (id: string, key: 'costPerUnit') => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = normalizeDecimalInput(event.target.value);
      updateTemplateDefaults(id, key, value as never);
    },
    [updateTemplateDefaults],
  );

  const handleTemplateRatioDefaultChange = useCallback(
    (id: string, key: 'supplierSlaBreachRate') => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = normalizeRatioInput(event.target.value);
      updateTemplateDefaults(id, key, value as never);
    },
    [updateTemplateDefaults],
  );

  const handleTemplateNotesChange = useCallback(
    (id: string) => (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const normalized = normalizeEmptyString(event.target.value);
      updateTemplateDefaults(id, 'notes', normalized as never);
    },
    [updateTemplateDefaults],
  );

  const handleTemplateStorageFieldChange = useCallback(
    (id: string, field: keyof WarehouseLocationDetail) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = normalizeEmptyString(event.target.value);
        updateTemplate(id, (template) => {
          const existing = template.defaults.storageHierarchy ?? {};
          const nextHierarchy: WarehouseLocationDetail = { ...existing };
          if (value) {
            nextHierarchy[field] = value;
          } else {
            delete nextHierarchy[field];
          }
          const hasValues = Object.values(nextHierarchy).some(
            (entry) => typeof entry === 'string' && entry.trim().length > 0,
          );
          const nextDefaults: ProductTemplate['defaults'] = { ...template.defaults };
          if (hasValues) {
            nextDefaults.storageHierarchy = nextHierarchy;
          } else {
            delete (nextDefaults as Record<string, unknown>).storageHierarchy;
          }
          return { ...template, defaults: nextDefaults };
        });
      },
    [updateTemplate],
  );

  const handleAddTemplate = useCallback(() => {
    const newTemplate = createNewTemplate();
    updateSettings({ productTemplates: [...productTemplates, newTemplate] });
  }, [productTemplates, updateSettings]);

  const handleRemoveTemplate = useCallback(
    (id: string) => () => {
      if (productTemplates.length <= 1) {
        return;
      }
      const filtered = productTemplates.filter((template) => template.id !== id);
      const fallbackDefault =
        defaultProductTemplateId === id ? filtered[0]?.id ?? defaultProductTemplateId : defaultProductTemplateId;
      updateSettings({
        productTemplates: filtered,
        defaultProductTemplateId: fallbackDefault ?? filtered[0]?.id ?? '',
      });
    },
    [defaultProductTemplateId, productTemplates, updateSettings],
  );

  const handleDefaultTemplateChange = useCallback(
    (id: string) => () => {
      updateSettings({ defaultProductTemplateId: id });
    },
    [updateSettings],
  );

  return (
    <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-5xl flex-col gap-6 px-6 py-10">
      <div>
        <h2 className="text-3xl font-bold text-slate-900">설정</h2>
        <p className="mt-2 text-base text-slate-600">
          서비스 연동과 재고 경고 기준, 알림 채널을 구성해 운영 경험을 맞춤화하세요.
        </p>
      </div>

      <div className="grid gap-6">
        <Section
          title="제품 템플릿"
          description="자주 사용하는 제품 유형의 기본값을 저장해 두고 제품 등록 폼을 빠르게 채워보세요. 템플릿에서 설정한 값은 추가/수정 모달의 초기값으로 사용됩니다."
        >
          <div className="flex flex-col gap-6">
            {productTemplates.map((template) => {
              const defaults = template.defaults;
              const storage = defaults.storageHierarchy ?? {};
              return (
                <div
                  key={template.id}
                  className="rounded-xl border border-slate-200 bg-white/70 p-5 shadow-sm transition hover:border-indigo-200"
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1">
                        <label
                          htmlFor={`template-name-${template.id}`}
                          className="block text-sm font-medium text-slate-700"
                        >
                          템플릿 이름
                        </label>
                        <input
                          id={`template-name-${template.id}`}
                          type="text"
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          value={template.name}
                          onChange={handleTemplateNameChange(template.id)}
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-sm text-slate-600">
                          <input
                            type="radio"
                            name="default-product-template"
                            className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            checked={template.id === defaultProductTemplateId}
                            onChange={handleDefaultTemplateChange(template.id)}
                          />
                          기본 템플릿으로 사용
                        </label>
                        <button
                          type="button"
                          className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                          onClick={handleRemoveTemplate(template.id)}
                          disabled={productTemplates.length <= 1}
                        >
                          삭제
                        </button>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor={`template-description-${template.id}`}
                        className="block text-sm font-medium text-slate-700"
                      >
                        설명
                      </label>
                      <input
                        id={`template-description-${template.id}`}
                        type="text"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        value={template.description ?? ''}
                        onChange={handleTemplateDescriptionChange(template.id)}
                        placeholder="예: 핵심 원자재 기준"
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700">제품 분류</label>
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          value={defaults.classification ?? 'RAW_MATERIAL'}
                          onChange={handleTemplateClassificationChange(template.id)}
                        >
                          {classificationOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700">표준 단위</label>
                        <input
                          type="text"
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          value={defaults.unitOfMeasure ?? ''}
                          onChange={handleTemplateStringDefaultChange(template.id, 'unitOfMeasure')}
                          placeholder="예: KG, EA"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700">주요 공급처</label>
                        <input
                          type="text"
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          value={defaults.supplier ?? ''}
                          onChange={handleTemplateStringDefaultChange(template.id, 'supplier')}
                          placeholder="공급사 이름"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700">공급사 코드</label>
                        <input
                          type="text"
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          value={defaults.supplierCode ?? ''}
                          onChange={handleTemplateStringDefaultChange(template.id, 'supplierCode')}
                          placeholder="ERP 공급사 코드"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700">조달 담당자</label>
                        <input
                          type="text"
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          value={defaults.procurementOwner ?? ''}
                          onChange={handleTemplateStringDefaultChange(template.id, 'procurementOwner')}
                          placeholder="담당자 이름"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700">보관 위치 라벨</label>
                        <input
                          type="text"
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          value={defaults.warehouseLocation ?? ''}
                          onChange={handleTemplateStringDefaultChange(template.id, 'warehouseLocation')}
                          placeholder="예: 자재창고-A1"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700">평균 리드타임(일)</label>
                        <input
                          type="number"
                          {...decimalInputProps}
                          min={0}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          value={defaults.leadTimeDays ?? ''}
                          onChange={handleTemplateIntegerDefaultChange(template.id, 'leadTimeDays')}
                          onKeyDown={handleDecimalInputKeyDown}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700">계약 리드타임(일)</label>
                        <input
                          type="number"
                          {...decimalInputProps}
                          min={0}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          value={defaults.contractLeadTimeDays ?? ''}
                          onChange={handleTemplateIntegerDefaultChange(template.id, 'contractLeadTimeDays')}
                          onKeyDown={handleDecimalInputKeyDown}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700">MOQ</label>
                        <input
                          type="number"
                          {...decimalInputProps}
                          min={0}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          value={defaults.minimumOrderQuantity ?? ''}
                          onChange={handleTemplateIntegerDefaultChange(template.id, 'minimumOrderQuantity')}
                          onKeyDown={handleDecimalInputKeyDown}
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700">단가</label>
                        <input
                          type="number"
                          {...decimalInputProps}
                          min={0}
                          step="0.01"
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          value={defaults.costPerUnit ?? ''}
                          onChange={handleTemplateDecimalDefaultChange(template.id, 'costPerUnit')}
                          onKeyDown={handleDecimalInputKeyDown}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700">재주문점</label>
                        <input
                          type="number"
                          {...decimalInputProps}
                          min={0}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          value={defaults.reorderPoint ?? ''}
                          onChange={handleTemplateIntegerDefaultChange(template.id, 'reorderPoint')}
                          onKeyDown={handleDecimalInputKeyDown}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700">안전재고</label>
                        <input
                          type="number"
                          {...decimalInputProps}
                          min={0}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          value={defaults.safetyStock ?? ''}
                          onChange={handleTemplateIntegerDefaultChange(template.id, 'safetyStock')}
                          onKeyDown={handleDecimalInputKeyDown}
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium text-slate-700">공급사 SLA(일)</label>
                        <input
                          type="number"
                          {...decimalInputProps}
                          min={0}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          value={defaults.supplierDeliverySlaDays ?? ''}
                          onChange={handleTemplateIntegerDefaultChange(template.id, 'supplierDeliverySlaDays')}
                          onKeyDown={handleDecimalInputKeyDown}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700">SLA 위반율</label>
                        <input
                          type="number"
                          {...decimalInputProps}
                          min={0}
                          max={1}
                          step="0.01"
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          value={defaults.supplierSlaBreachRate ?? ''}
                          onChange={handleTemplateRatioDefaultChange(template.id, 'supplierSlaBreachRate')}
                          onKeyDown={handleDecimalInputKeyDown}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 rounded-lg bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          checked={Boolean(defaults.isMultiSourced)}
                          onChange={handleTemplateBooleanChange(template.id, 'isMultiSourced')}
                        />
                        다중 공급원 확보
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600">리스크 지표</span>
                        <select
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          value={defaults.riskIndicator ?? ''}
                          onChange={handleTemplateRiskChange(template.id)}
                        >
                          <option value="">선택 안 함</option>
                          {riskIndicatorOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <h5 className="text-sm font-medium text-slate-700">보관 위치 계층</h5>
                      <p className="mt-1 text-xs text-slate-500">
                        창고, 존, 랙 정보를 정의하면 제품 등록 시 자동으로 위치 계층이 구성됩니다.
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                        {storageHierarchyFields.map((field) => (
                          <div key={`${template.id}-${field.key}`}>
                            <label className="block text-xs font-medium text-slate-600">{field.label}</label>
                            <input
                              type="text"
                              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                              value={(storage as Record<string, string | undefined>)[field.key] ?? ''}
                              onChange={handleTemplateStorageFieldChange(template.id, field.key)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor={`template-notes-${template.id}`}
                        className="block text-sm font-medium text-slate-700"
                      >
                        메모
                      </label>
                      <textarea
                        id={`template-notes-${template.id}`}
                        className="mt-1 h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        value={defaults.notes ?? ''}
                        onChange={handleTemplateNotesChange(template.id)}
                        placeholder="보충 설명이나 운영 유의사항을 기록하세요."
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg border border-dashed border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-600 transition hover:border-indigo-400 hover:bg-indigo-50"
              onClick={handleAddTemplate}
            >
              + 새 템플릿 추가
            </button>
          </div>
        </Section>

        <Section title="데이터 소스" description="StockWise에서 데이터를 어디에서 불러올지 선택합니다.">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              checked={useServer}
              onChange={handleCheckboxChange('useServer')}
            />
            <span className="text-sm text-slate-700">
              서버 API 사용
              <span className="mt-1 block text-xs text-slate-500">
                서버 연동을 활성화하면 재고 데이터가 백엔드 API에서 주기적으로 동기화됩니다. 비활성화하면 로컬에 저장된 데이터만
                사용합니다.
              </span>
            </span>
          </label>
        </Section>

        <Section title="재고 경고" description="경고 알림이 발생하는 재고 임계값을 조정합니다.">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span className="font-medium">주의 재고 임계값</span>
              <input
                type="number"
                {...decimalInputProps}
                min={0}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                value={lowStockWarningThreshold}
                onChange={handleNumericChange('lowStockWarningThreshold')}
                onKeyDown={handleDecimalInputKeyDown}
              />
              <span className="text-xs text-slate-500">
                가용 재고가 이 값 이하로 떨어지면 주의 알림이 표시됩니다.
              </span>
            </label>

            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span className="font-medium">심각 재고 임계값</span>
              <input
                type="number"
                {...decimalInputProps}
                min={0}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                value={criticalStockWarningThreshold}
                onChange={handleNumericChange('criticalStockWarningThreshold')}
                onKeyDown={handleDecimalInputKeyDown}
              />
              <span className="text-xs text-slate-500">
                이 값 이하면 즉시 조치가 필요한 심각 경고로 표시합니다.
              </span>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span className="font-medium">안전 재고 배수</span>
              <input
                type="number"
                {...decimalInputProps}
                min={0}
                step="0.1"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                value={safetyStockMultiplier}
                onChange={handleNumericChange('safetyStockMultiplier')}
                onKeyDown={handleDecimalInputKeyDown}
              />
              <span className="text-xs text-slate-500">
                안전 재고에 이 배수를 곱해 실질 경고 임계값을 계산합니다.
              </span>
            </label>

            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span className="font-medium">최소 커버 일수</span>
              <input
                type="number"
                {...decimalInputProps}
                min={0}
                step="0.5"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                value={minimumDaysOfCover}
                onChange={handleNumericChange('minimumDaysOfCover')}
                onKeyDown={handleDecimalInputKeyDown}
              />
              <span className="text-xs text-slate-500">
                평균 일별 수요 기준으로 확보해야 할 최소 재고 일수를 설정합니다.
              </span>
            </label>

            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span className="font-medium">자동 새로고침(분)</span>
              <input
                type="number"
                {...decimalInputProps}
                min={0}
                step={1}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                value={autoRefreshCadenceMinutes}
                onChange={handleNumericChange('autoRefreshCadenceMinutes')}
                onKeyDown={handleDecimalInputKeyDown}
              />
              <span className="text-xs text-slate-500">
                서버 사용 시 재고를 자동 새로고침할 간격을 분 단위로 지정합니다. 0이면 비활성화됩니다.
              </span>
            </label>
          </div>
        </Section>

        <Section title="알림 채널" description="재고 경고를 받을 채널과 엔드포인트를 관리합니다.">
          <div className="flex flex-col gap-6">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">슬랙 웹훅</h4>
                    <p className="text-xs text-slate-500">
                      슬랙 채널로 재고 경고를 전송하려면 웹훅 URL을 입력하고 활성화하세요.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      checked={slackNotificationsEnabled}
                      onChange={handleCheckboxChange('slackNotificationsEnabled')}
                    />
                    슬랙 전송 활성화
                  </label>
                </div>

                <input
                  type="url"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="https://hooks.slack.com/services/..."
                  value={slackWebhookUrl}
                  onChange={handleEndpointChange('slackWebhookUrl')}
                  disabled={!slackNotificationsEnabled}
                />
                <p className="text-xs text-slate-500">
                  저장 후 실제 재고 경고가 발생하면 입력한 슬랙 웹훅으로 알림이 전송됩니다. 별도의 테스트 전송 기능은 제공되지 않습니다.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">일반 웹훅</h4>
                    <p className="text-xs text-slate-500">
                      사내 시스템이나 외부 서비스로 경고 이벤트를 전송하려면 HTTPS 엔드포인트를 등록하세요.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      checked={webhookNotificationsEnabled}
                      onChange={handleCheckboxChange('webhookNotificationsEnabled')}
                    />
                    웹훅 전송 활성화
                  </label>
                </div>

                <input
                  type="url"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="https://hooks.example.com/stockwise"
                  value={webhookUrl}
                  onChange={handleEndpointChange('webhookUrl')}
                  disabled={!webhookNotificationsEnabled}
                />

                <p className="text-xs text-slate-500">
                  JSON 페이로드로 이벤트 세부 정보를 POST 합니다. 엔드포인트에서 HTTPS를 사용하고 2xx 응답을 반환해야 합니다.
                </p>
              </div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
};

export default SettingsPage;
