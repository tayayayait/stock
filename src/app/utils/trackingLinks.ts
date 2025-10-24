export interface TrackingLinkInput {
  trackingNumber: string;
  carrierId?: string;
  carrierName?: string;
}

export interface TrackingLinkResult {
  carrierId: string;
  carrierLabel: string;
  href: string;
}

interface TrackingCarrierRule {
  id: string;
  label: string;
  buildUrl: (normalizedTrackingNumber: string) => string;
  carrierIdPatterns?: RegExp[];
  carrierNamePatterns?: RegExp[];
  trackingNumberPatterns?: RegExp[];
  rawTrackingNumberPatterns?: RegExp[];
}

const TRACKING_CARRIER_RULES: TrackingCarrierRule[] = [
  {
    id: 'cjlogistics',
    label: 'CJ대한통운',
    buildUrl: (trackingNumber) =>
      `https://www.cjlogistics.com/ko/tool/parcel/tracking?gnbInvcNo=${trackingNumber}`,
    carrierIdPatterns: [/^cj/i, /cjlogistics/i, /cj-logistics/i],
    carrierNamePatterns: [/cj/i, /대한통운/],
  },
  {
    id: 'logen',
    label: '로젠택배',
    buildUrl: (trackingNumber) =>
      `https://www.ilogen.com/web/personal/trace/${trackingNumber}`,
    carrierIdPatterns: [/logen/i],
    carrierNamePatterns: [/로젠/i],
    trackingNumberPatterns: [/^\d{11,12}$/],
    rawTrackingNumberPatterns: [/^\d{3,4}-\d{3,4}-\d{3,4}$/],
  },
  {
    id: 'lotte',
    label: '롯데택배',
    buildUrl: (trackingNumber) =>
      `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${trackingNumber}`,
    carrierIdPatterns: [/lotte/i, /lghk/i],
    carrierNamePatterns: [/롯데/i, /lotte/i],
    trackingNumberPatterns: [/^\d{12}$/],
  },
  {
    id: 'hanjin',
    label: '한진택배',
    buildUrl: (trackingNumber) =>
      `https://www.hanjin.co.kr/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&invoiceNo=${trackingNumber}`,
    carrierIdPatterns: [/hanjin/i],
    carrierNamePatterns: [/한진/i],
    trackingNumberPatterns: [/^\d{10,11}$/],
  },
  {
    id: 'krpost',
    label: '우체국택배',
    buildUrl: (trackingNumber) =>
      `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=${trackingNumber}`,
    carrierIdPatterns: [/epost/i, /krpost/i, /koreapost/i],
    carrierNamePatterns: [/우체국/i, /e-?post/i],
    trackingNumberPatterns: [/^\d{13}$/],
  },
];

function normalizeTrackingNumber(value: string) {
  return value.replace(/[^0-9a-z]/gi, '');
}

function matchesAny(value: string | undefined, patterns: RegExp[] | undefined) {
  if (!value || !patterns?.length) {
    return false;
  }

  return patterns.some((pattern) => pattern.test(value));
}

export function resolveTrackingLink({
  trackingNumber,
  carrierId,
  carrierName,
}: TrackingLinkInput): TrackingLinkResult | null {
  const trimmed = trackingNumber.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = normalizeTrackingNumber(trimmed);
  if (!normalized) {
    return null;
  }

  const byMetaMatch = TRACKING_CARRIER_RULES.find((rule) =>
    matchesAny(carrierId, rule.carrierIdPatterns) || matchesAny(carrierName, rule.carrierNamePatterns),
  );

  const byRawPattern =
    byMetaMatch === undefined
      ? TRACKING_CARRIER_RULES.find((rule) =>
          rule.rawTrackingNumberPatterns?.some((pattern) => pattern.test(trimmed)),
        )
      : undefined;

  const matchedRule =
    byMetaMatch ??
    byRawPattern ??
    TRACKING_CARRIER_RULES.find((rule) =>
      rule.trackingNumberPatterns?.some((pattern) => pattern.test(normalized)),
    );

  if (!matchedRule) {
    return null;
  }

  return {
    carrierId: matchedRule.id,
    carrierLabel: matchedRule.label,
    href: matchedRule.buildUrl(normalized),
  };
}

export const __TESTING__ = {
  TRACKING_CARRIER_RULES,
  normalizeTrackingNumber,
};
