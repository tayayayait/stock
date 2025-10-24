import { ProductDraft, ProductClassification, SupplyRiskIndicator } from '../types';

export interface ImportError {
  row: number;
  message: string;
}

export interface ImportResult {
  products: ProductDraft[];
  errors: ImportError[];
  headers: string[];
}

export const REQUIRED_HEADERS = [
  'productName',
  'classification',
  'sku',
  'unitOfMeasure',
  'warehouseLocation',
  'supplier',
  'costPerUnit',
  'leadTimeDays',
  'reorderPoint',
  'currentStock',
  'safetyStock',
];

const OPTIONAL_HEADERS = [
  'notes',
  'billOfMaterials',
  'supplierCode',
  'contractLeadTimeDays',
  'minimumOrderQuantity',
  'isMultiSourced',
  'riskIndicator',
  'averageDailyDemand',
  'inboundUnits',
  'openWorkOrders',
  'supplierRiskScore',
  'supplierDeliverySlaDays',
  'supplierSlaBreachRate',
  'supplierPriceVolatility',
  'hasAlternateSupplier',
  'procurementOwner',
  'procurementDueDate',
];

const classificationMap: Record<string, ProductClassification> = {
  RAW_MATERIAL: 'RAW_MATERIAL',
  'RAW MATERIAL': 'RAW_MATERIAL',
  RAWMATERIAL: 'RAW_MATERIAL',
  RM: 'RAW_MATERIAL',
  WIP: 'WIP',
  'WORK IN PROCESS': 'WIP',
  'WORK_IN_PROCESS': 'WIP',
  FINISHED_GOOD: 'FINISHED_GOOD',
  'FINISHED GOOD': 'FINISHED_GOOD',
  'FINISHED GOODS': 'FINISHED_GOOD',
  FG: 'FINISHED_GOOD',
};

const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
};

const parseBillOfMaterials = (
  value: string,
  rowIndex: number,
  errors: ImportError[],
): ProductDraft['billOfMaterials'] => {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const entries = trimmed.split(/[;|]/).map((entry) => entry.trim()).filter(Boolean);
  if (entries.length === 0) {
    return undefined;
  }

  const references: NonNullable<ProductDraft['billOfMaterials']> = [];
  entries.forEach((entry) => {
    const [componentId, quantityRaw] = entry.split(':').map((token) => token.trim());
    if (!componentId || !quantityRaw) {
      errors.push({ row: rowIndex, message: 'BOM 항목은 "부품 품번:수량" 형식이어야 합니다.' });
      return;
    }

    const quantity = parseFloat(quantityRaw.replace(/,/g, '.'));
    if (Number.isNaN(quantity) || quantity <= 0) {
      errors.push({ row: rowIndex, message: `${componentId} 수량은 0보다 큰 숫자여야 합니다.` });
      return;
    }

    references.push({ componentId, quantity });
  });

  return references.length > 0 ? references : undefined;
};

const parseNumberField = (
  value: string,
  rowIndex: number,
  fieldName: string,
  errors: ImportError[],
  { allowDecimal = false, min = 0 }: { allowDecimal?: boolean; min?: number } = {},
): number | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    errors.push({ row: rowIndex, message: `${fieldName} 값이 비어 있습니다.` });
    return null;
  }

  const parsed = allowDecimal ? parseFloat(trimmed.replace(/,/g, '.')) : parseInt(trimmed, 10);
  if (Number.isNaN(parsed) || parsed < min) {
    errors.push({ row: rowIndex, message: `${fieldName}는 ${min} 이상의 ${allowDecimal ? '숫자' : '정수'}여야 합니다.` });
    return null;
  }

  return parsed;
};

const parseOptionalNumberField = (
  value: string | undefined,
  rowIndex: number,
  fieldName: string,
  errors: ImportError[],
  options?: { allowDecimal?: boolean; min?: number },
): number | undefined => {
  if (!value || !value.trim()) {
    return undefined;
  }

  const parsed = parseNumberField(value, rowIndex, fieldName, errors, options);
  return parsed === null ? undefined : parsed;
};

const parseOptionalBooleanField = (
  value: string | undefined,
  rowIndex: number,
  fieldName: string,
  errors: ImportError[],
): boolean | undefined => {
  if (!value || !value.trim()) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'y', 'yes', 'multi', '다중', 'multi-sourcing'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'n', 'no', 'single', '단일', 'single-sourcing'].includes(normalized)) {
    return false;
  }

  errors.push({ row: rowIndex, message: `${fieldName} 값이 올바르지 않습니다. TRUE/FALSE 또는 단일/다중으로 입력하세요.` });
  return undefined;
};

const normalizeRiskIndicator = (
  value: string | undefined,
  rowIndex: number,
  errors: ImportError[],
): SupplyRiskIndicator | undefined => {
  if (!value || !value.trim()) {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  const allowed = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  if (!allowed.includes(normalized)) {
    errors.push({ row: rowIndex, message: 'riskIndicator는 LOW/MEDIUM/HIGH/CRITICAL 중 하나여야 합니다.' });
    return undefined;
  }

  return normalized as SupplyRiskIndicator;
};

const normalizeClassification = (value: string): ProductClassification | null => {
  const normalized = value.trim().toUpperCase().replace(/-/g, ' ');
  return classificationMap[normalized] ?? null;
};

export const parseImportedProducts = (input: string): ImportResult => {
  const errors: ImportError[] = [];
  const products: ProductDraft[] = [];

  if (!input.trim()) {
    errors.push({ row: 1, message: 'CSV 데이터가 비어 있습니다.' });
    return { products, errors, headers: [] };
  }

  const lines = input.split(/\r?\n/);
  if (lines.length === 0) {
    errors.push({ row: 1, message: 'CSV 데이터가 비어 있습니다.' });
    return { products, errors, headers: [] };
  }

  const headerLine = lines[0];
  const headers = parseCsvLine(headerLine).map((header) => header.trim());

  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    missingHeaders.forEach((header) => {
      errors.push({ row: 1, message: `필수 헤더 '${header}'가 누락되었습니다.` });
    });
    return { products, errors, headers };
  }

  const allowedHeaders = new Set([...REQUIRED_HEADERS, ...OPTIONAL_HEADERS]);
  headers.forEach((header) => {
    if (!allowedHeaders.has(header)) {
      errors.push({ row: 1, message: `알 수 없는 헤더 '${header}'가 포함되어 있습니다.` });
    }
  });
  if (errors.length > 0) {
    return { products, errors, headers };
  }

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      continue;
    }

    const values = parseCsvLine(line);
    const rowNumber = index + 1;

    const record: Record<string, string> = {};
    headers.forEach((header, headerIndex) => {
      record[header] = values[headerIndex] ?? '';
    });

    const rowErrors: ImportError[] = [];

    const classificationValue = normalizeClassification(record.classification ?? '');
    if (!classificationValue) {
      rowErrors.push({ row: rowNumber, message: 'classification 값이 유효하지 않습니다. RAW_MATERIAL, WIP, FINISHED_GOOD 중 선택하세요.' });
    }

    const requiredTextFields: Array<[keyof typeof record, string]> = [
      ['productName', 'productName'],
      ['sku', '품번'],
      ['unitOfMeasure', 'unitOfMeasure'],
      ['warehouseLocation', 'warehouseLocation'],
      ['supplier', 'supplier'],
    ];

    requiredTextFields.forEach(([fieldKey, label]) => {
      if (!(record[fieldKey] && record[fieldKey].trim())) {
        rowErrors.push({ row: rowNumber, message: `${label} 값이 비어 있습니다.` });
      }
    });

    const costPerUnit = parseNumberField(record.costPerUnit ?? '', rowNumber, 'costPerUnit', rowErrors, { allowDecimal: true, min: 0 });
    const leadTimeDays = parseNumberField(record.leadTimeDays ?? '', rowNumber, 'leadTimeDays', rowErrors, { allowDecimal: false, min: 0 });
    const contractLeadTimeDays = parseOptionalNumberField(record.contractLeadTimeDays, rowNumber, 'contractLeadTimeDays', rowErrors, {
      allowDecimal: false,
      min: 0,
    });
    const reorderPoint = parseNumberField(record.reorderPoint ?? '', rowNumber, 'reorderPoint', rowErrors, { allowDecimal: false, min: 0 });
    const currentStock = parseNumberField(record.currentStock ?? '', rowNumber, 'currentStock', rowErrors, { allowDecimal: false, min: 0 });
    const safetyStock = parseNumberField(record.safetyStock ?? '', rowNumber, 'safetyStock', rowErrors, { allowDecimal: false, min: 0 });
    const minimumOrderQuantity = parseOptionalNumberField(
      record.minimumOrderQuantity,
      rowNumber,
      'minimumOrderQuantity',
      rowErrors,
      { allowDecimal: false, min: 1 },
    );
    const isMultiSourced = parseOptionalBooleanField(record.isMultiSourced, rowNumber, 'isMultiSourced', rowErrors);
    const riskIndicator = normalizeRiskIndicator(record.riskIndicator, rowNumber, rowErrors);
    const averageDailyDemand = parseOptionalNumberField(record.averageDailyDemand, rowNumber, 'averageDailyDemand', rowErrors, {
      allowDecimal: true,
      min: 0,
    });
    const inboundUnits = parseOptionalNumberField(record.inboundUnits, rowNumber, 'inboundUnits', rowErrors, {
      allowDecimal: false,
      min: 0,
    });
    const openWorkOrders = parseOptionalNumberField(record.openWorkOrders, rowNumber, 'openWorkOrders', rowErrors, {
      allowDecimal: false,
      min: 0,
    });
    const supplierRiskScore = parseOptionalNumberField(record.supplierRiskScore, rowNumber, 'supplierRiskScore', rowErrors, {
      allowDecimal: true,
      min: 0,
    });
    if (supplierRiskScore !== undefined && supplierRiskScore > 1) {
      rowErrors.push({ row: rowNumber, message: 'supplierRiskScore는 0과 1 사이의 숫자여야 합니다.' });
    }
    const supplierDeliverySlaDays = parseOptionalNumberField(
      record.supplierDeliverySlaDays,
      rowNumber,
      'supplierDeliverySlaDays',
      rowErrors,
      { allowDecimal: false, min: 0 },
    );
    const supplierSlaBreachRate = parseOptionalNumberField(record.supplierSlaBreachRate, rowNumber, 'supplierSlaBreachRate', rowErrors, {
      allowDecimal: true,
      min: 0,
    });
    if (supplierSlaBreachRate !== undefined && supplierSlaBreachRate > 1) {
      rowErrors.push({ row: rowNumber, message: 'supplierSlaBreachRate는 0과 1 사이의 숫자여야 합니다.' });
    }
    const supplierPriceVolatility = parseOptionalNumberField(record.supplierPriceVolatility, rowNumber, 'supplierPriceVolatility', rowErrors, {
      allowDecimal: true,
      min: 0,
    });
    if (supplierPriceVolatility !== undefined && supplierPriceVolatility > 1) {
      rowErrors.push({ row: rowNumber, message: 'supplierPriceVolatility는 0과 1 사이의 숫자여야 합니다.' });
    }
    const hasAlternateSupplier = parseOptionalBooleanField(record.hasAlternateSupplier, rowNumber, 'hasAlternateSupplier', rowErrors);

    const procurementOwner = record.procurementOwner?.trim() ? record.procurementOwner.trim() : undefined;

    let procurementDueDate: Date | undefined;
    if (record.procurementDueDate && record.procurementDueDate.trim()) {
      const parsedDate = new Date(record.procurementDueDate.trim());
      if (Number.isNaN(parsedDate.getTime())) {
        rowErrors.push({ row: rowNumber, message: 'procurementDueDate 형식이 올바르지 않습니다. ISO 날짜를 사용하세요.' });
      } else {
        procurementDueDate = parsedDate;
      }
    }

    const billOfMaterials = parseBillOfMaterials(record.billOfMaterials ?? '', rowNumber, rowErrors);

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      continue;
    }

    products.push({
      productName: record.productName.trim(),
      classification: classificationValue!,
      sku: record.sku.trim(),
      unitOfMeasure: record.unitOfMeasure.trim(),
      warehouseLocation: record.warehouseLocation.trim(),
      supplier: record.supplier.trim(),
      supplierCode: record.supplierCode?.trim() ? record.supplierCode.trim() : undefined,
      costPerUnit: costPerUnit!,
      leadTimeDays: leadTimeDays!,
      contractLeadTimeDays,
      minimumOrderQuantity,
      isMultiSourced,
      riskIndicator,
      averageDailyDemand,
      inboundUnits,
      openWorkOrders,
      supplierRiskScore,
      supplierDeliverySlaDays,
      supplierSlaBreachRate,
      supplierPriceVolatility,
      hasAlternateSupplier,
      procurementOwner,
      procurementDueDate,
      reorderPoint: reorderPoint!,
      currentStock: currentStock!,
      safetyStock: safetyStock!,
      notes: record.notes?.trim() ? record.notes.trim() : undefined,
      billOfMaterials,
    });
  }

  return { products, errors, headers };
};
