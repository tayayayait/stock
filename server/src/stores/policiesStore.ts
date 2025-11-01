import fs from 'node:fs';
import path from 'node:path';

const normalizeSku = (value: string): string => value.trim().toUpperCase();

export interface PolicyDraftRecord {
  sku: string;
  forecastDemand: number | null;
  demandStdDev: number | null;
  leadTimeDays: number | null;
  serviceLevelPercent: number | null;
}

const policyStore = new Map<string, PolicyDraftRecord>();
let dataDir = path.resolve(process.cwd(), 'server', '.data');
let storeFile = path.join(dataDir, 'policies.json');

const safeParseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const ensureDataDir = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
};

const loadFromDisk = () => {
  try {
    if (!fs.existsSync(storeFile)) {
      return;
    }
    const raw = fs.readFileSync(storeFile, 'utf8');
    const parsed = safeParseJson(raw);
    if (!Array.isArray(parsed)) {
      return;
    }
    parsed.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const record = entry as Partial<PolicyDraftRecord>;
      if (!record?.sku || typeof record.sku !== 'string') {
        return;
      }

      policyStore.set(normalizeSku(record.sku), {
        sku: normalizeSku(record.sku),
        forecastDemand: typeof record.forecastDemand === 'number' ? record.forecastDemand : null,
        demandStdDev: typeof record.demandStdDev === 'number' ? record.demandStdDev : null,
        leadTimeDays: typeof record.leadTimeDays === 'number' ? record.leadTimeDays : null,
        serviceLevelPercent:
          typeof record.serviceLevelPercent === 'number' ? record.serviceLevelPercent : null,
      });
    });
  } catch {
    // Ignore load errors; store will start empty
  }
};

const persistToDisk = () => {
  try {
    ensureDataDir();
    const payload = JSON.stringify(Array.from(policyStore.values()), null, 2);
    fs.writeFileSync(storeFile, payload, 'utf8');
  } catch {
    // Ignore persistence errors to avoid crashing request handlers
  }
};

loadFromDisk();

const toNullableNumber = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (!Number.isFinite(value)) {
    return null;
  }
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return null;
  }
  return normalized >= 0 ? normalized : 0;
};

const clampServiceLevel = (value: number | null): number | null => {
  if (value === null) {
    return null;
  }
  if (!Number.isFinite(value)) {
    return null;
  }
  const clamped = Math.max(50, Math.min(99.9, value));
  return clamped;
};

export const listPolicyDrafts = (): PolicyDraftRecord[] =>
  Array.from(policyStore.values()).map((record) => ({ ...record }));

export const getPolicyDraft = (sku: string): PolicyDraftRecord | null => {
  if (!sku) {
    return null;
  }
  const normalizedSku = normalizeSku(sku);
  const record = policyStore.get(normalizedSku);
  return record ? { ...record } : null;
};

export const savePolicyDrafts = (drafts: PolicyDraftRecord[]): void => {
  drafts.forEach((draft) => {
    if (!draft?.sku) {
      return;
    }
    const normalizedSku = normalizeSku(draft.sku);
    if (!normalizedSku) {
      return;
    }

    const existing = policyStore.get(normalizedSku) ?? {
      sku: normalizedSku,
      forecastDemand: null,
      demandStdDev: null,
      leadTimeDays: null,
      serviceLevelPercent: null,
    };

    const updated: PolicyDraftRecord = {
      sku: normalizedSku,
      forecastDemand: toNullableNumber(draft.forecastDemand),
      demandStdDev: toNullableNumber(draft.demandStdDev),
      leadTimeDays: toNullableNumber(draft.leadTimeDays),
      serviceLevelPercent: clampServiceLevel(draft.serviceLevelPercent),
    };

    policyStore.set(normalizedSku, {
      ...existing,
      ...updated,
    });
  });

  persistToDisk();
};

const setStoragePath = (filePath: string) => {
  const resolved = path.resolve(filePath);
  dataDir = path.dirname(resolved);
  storeFile = resolved;
  ensureDataDir();
};

export const __test__ = {
  normalizeSku,
  loadFromDisk,
  persistToDisk,
  get storeFile() {
    return storeFile;
  },
  get dataDir() {
    return dataDir;
  },
  setStoragePathForTests: (filePath: string) => {
    policyStore.clear();
    setStoragePath(filePath);
    loadFromDisk();
  },
  clearStore: () => {
    policyStore.clear();
  },
  deleteStoreFile: () => {
    try {
      if (fs.existsSync(storeFile)) {
        fs.unlinkSync(storeFile);
      }
    } catch {
      // ignore
    }
  },
  policyStore,
};
