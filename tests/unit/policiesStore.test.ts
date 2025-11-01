import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { savePolicyDrafts, listPolicyDrafts, __test__ } from '@/server/src/stores/policiesStore';

describe('policiesStore persistence', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'policies-store-'));
  let storeFile: string;

  beforeAll(() => {
    if (!fs.existsSync(tempRoot)) {
      fs.mkdirSync(tempRoot, { recursive: true });
    }
  });

  afterAll(() => {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  });

  beforeEach(() => {
    storeFile = path.join(tempRoot, `policies-${Date.now()}.json`);
    __test__.setStoragePathForTests(storeFile);
    __test__.clearStore();
    __test__.deleteStoreFile();
  });

  it('persists saved drafts to disk', () => {
    savePolicyDrafts([
      {
        sku: 'SKU-TEST',
        forecastDemand: 100,
        demandStdDev: 20,
        leadTimeDays: 5,
        serviceLevelPercent: 95,
      },
    ]);

    expect(fs.existsSync(storeFile)).toBe(true);
    const raw = fs.readFileSync(storeFile, 'utf8');
    const parsed = JSON.parse(raw);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].sku).toBe('SKU-TEST');
    expect(parsed[0].serviceLevelPercent).toBe(95);
  });

  it('loads drafts from disk when reinitialised', () => {
    savePolicyDrafts([
      {
        sku: 'SKU-KEEP',
        forecastDemand: 80,
        demandStdDev: 15,
        leadTimeDays: 7,
        serviceLevelPercent: 90,
      },
    ]);

    expect(listPolicyDrafts()).toHaveLength(1);

    __test__.clearStore();
    __test__.loadFromDisk();

    const drafts = listPolicyDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].sku).toBe('SKU-KEEP');
    expect(drafts[0].leadTimeDays).toBe(7);
  });
});
