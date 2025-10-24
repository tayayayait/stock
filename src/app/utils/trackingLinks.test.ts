import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveTrackingLink } from './trackingLinks';

const snapshot = (value: unknown) => JSON.stringify(value, null, 2);

describe('resolveTrackingLink', () => {
  it('builds CJ대한통운 tracking link from carrier metadata', () => {
    const result = resolveTrackingLink({
      trackingNumber: '123456789012',
      carrierId: 'cjlogistics',
    });

    assert.equal(
      snapshot(result),
      `{
  "carrierId": "cjlogistics",
  "carrierLabel": "CJ대한통운",
  "href": "https://www.cjlogistics.com/ko/tool/parcel/tracking?gnbInvcNo=123456789012"
}`,
    );
  });

  it('infers 로젠택배 tracking link using invoice pattern', () => {
    const result = resolveTrackingLink({
      trackingNumber: '4100-1234-5678',
    });

    assert.equal(
      snapshot(result),
      `{
  "carrierId": "logen",
  "carrierLabel": "로젠택배",
  "href": "https://www.ilogen.com/web/personal/trace/410012345678"
}`,
    );
  });

  it('returns null for unsupported carriers', () => {
    assert.equal(
      resolveTrackingLink({ trackingNumber: 'ABC-123-XYZ' }),
      null,
    );
  });
});
