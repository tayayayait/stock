import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";

import type { Product, InventoryRisk } from "../../../domains/products";
import type { ForecastResponse, ApiWarehouse } from "../../../../services/api";
import { fetchWarehouses } from "../../../../services/api";
import {
  fetchInventoryAnalysis,
  fetchInventoryWarehouseItems,
  type InventoryAnalysisResponse,
  type InventoryWarehouseItemsResponse,
  type InventoryWarehouseItem,
} from "../../../../services/inventoryDashboard";

interface KpiSummary {
  opening: number;
  avgDOS: number;
  turns: number;
  serviceLevel: number;
}

interface RiskSummaryEntry {
  risk: InventoryRisk;
  count: number;
  ratio: number;
}

interface ForecastStateEntry {
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
}

interface InventoryOverviewPageProps {
  skus: Product[];
  selected: Product | null;
  setSelected: (row: Product) => void;
  kpis: KpiSummary;
  riskSummary: RiskSummaryEntry[];
  forecastCache: Record<string, ForecastResponse>;
  forecastStatusBySku: Record<string, ForecastStateEntry>;
}

type WarehouseScopedItem = InventoryWarehouseItem & {
  risk: InventoryRisk;
  category: string;
};

const RISK_STABLE = "\uC548\uC815";
const RISK_SHORTAGE = "\uACB0\uD488\uC704\uD5D8";
const RISK_OVERSTOCK = "\uACFC\uC694";

const riskDisplayLabel: Record<InventoryRisk, string> = {
  [RISK_STABLE]: "안정",
  [RISK_SHORTAGE]: "결품위험",
  [RISK_OVERSTOCK]: "과잉",
};

const riskClassName: Record<InventoryRisk, string> = {
  [RISK_STABLE]: "bg-emerald-100 text-emerald-700",
  [RISK_SHORTAGE]: "bg-red-100 text-red-700",
  [RISK_OVERSTOCK]: "bg-amber-100 text-amber-700",
};

const RISK_ORDER: InventoryRisk[] = [RISK_SHORTAGE, RISK_STABLE, RISK_OVERSTOCK];

const calculateAvailableStock = (row: Product): number => Math.max(row.onHand - row.reserved, 0);

const toDateInputValue = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;

const createDefaultRange = () => {
  const end = new Date();
  const endUtc = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  const startUtc = new Date(endUtc);
  startUtc.setUTCDate(startUtc.getUTCDate() - 29);
  return { from: toDateInputValue(startUtc), to: toDateInputValue(endUtc) };
};

const isValidRange = (from: string, to: string) => {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  return Number.isFinite(start) && Number.isFinite(end) && start <= end;
};

const formatDateLabel = (value: string) => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};

const Card: React.FC<{ title?: string; actions?: React.ReactNode; className?: string; children: React.ReactNode }> = ({
  title,
  actions,
  className = "",
  children,
}) => (
  <div className={`rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur ${className}`}>
    {title ? (
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-800">{title}</h3>
        {actions}
      </div>
    ) : null}
    {children}
  </div>
);

const RiskTag: React.FC<{ risk: InventoryRisk }> = ({ risk }) => (
  <span className={`rounded-full px-2 py-1 text-xs ${riskClassName[risk] ?? "bg-slate-100 text-slate-600"}`}>
    {riskDisplayLabel[risk] ?? risk}
  </span>
);

const InventoryOverviewPage: React.FC<InventoryOverviewPageProps> = ({
  skus,
  selected,
  setSelected,
  riskSummary,
}) => {
  const safeRiskSummary = Array.isArray(riskSummary) ? riskSummary : [];
  const [{ from: defaultFrom, to: defaultTo }] = useState(createDefaultRange);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<"all" | InventoryRisk>("all");
  const [warehouses, setWarehouses] = useState<ApiWarehouse[]>([]);
  const [warehousesLoading, setWarehousesLoading] = useState(false);
  const [warehousesError, setWarehousesError] = useState<string | null>(null);
  const [warehouseFetchVersion, setWarehouseFetchVersion] = useState(0);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [rangeFrom, setRangeFrom] = useState(defaultFrom);
  const [rangeTo, setRangeTo] = useState(defaultTo);
  const [analysis, setAnalysis] = useState<InventoryAnalysisResponse | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [warehouseSnapshot, setWarehouseSnapshot] = useState<InventoryWarehouseItemsResponse | null>(null);
  const [warehouseSnapshotLoading, setWarehouseSnapshotLoading] = useState(false);
  const [warehouseSnapshotError, setWarehouseSnapshotError] = useState<string | null>(null);

  const reloadWarehouses = useCallback(() => setWarehouseFetchVersion((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    setWarehousesLoading(true);
    setWarehousesError(null);

    fetchWarehouses({ pageSize: 100 })
      .then((response) => {
        if (cancelled) {
          return;
        }
        const items = Array.isArray(response.items) ? response.items : [];
        setWarehouses(items);
        setSelectedWarehouseId((current) => {
          if (current !== null && items.some((entry) => entry.id === current)) {
            return current;
          }
          return items.length > 0 ? items[0].id ?? null : null;
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error && error.message ? error.message : "Unable to load warehouses.";
        setWarehousesError(message);
        setWarehouses([]);
      })
      .finally(() => {
        if (!cancelled) {
          setWarehousesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [warehouseFetchVersion]);

  const selectedWarehouse = useMemo(() => {
    if (selectedWarehouseId === null) {
      return null;
    }
    return warehouses.find((entry) => entry.id === selectedWarehouseId) ?? null;
  }, [selectedWarehouseId, warehouses]);

  const selectedWarehouseCode = selectedWarehouse?.code ?? null;

  useEffect(() => {
    if (!isValidRange(rangeFrom, rangeTo)) {
      setAnalysis(null);
      setAnalysisError("Invalid date range.");
      return;
    }

    let cancelled = false;
    setAnalysisLoading(true);
    setAnalysisError(null);

    const params: { from: string; to: string; warehouseCode?: string; groupBy: "month" } = {
      from: rangeFrom,
      to: rangeTo,
      groupBy: "month",
    };
    if (selectedWarehouseCode) {
      params.warehouseCode = selectedWarehouseCode;
    }

    fetchInventoryAnalysis(params)
      .then((response) => {
        if (!cancelled) {
          setAnalysis(response);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error && error.message ? error.message : "Unable to load analysis data.";
        setAnalysisError(message);
        setAnalysis(null);
      })
      .finally(() => {
        if (!cancelled) {
          setAnalysisLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [rangeFrom, rangeTo, selectedWarehouseCode]);

  useEffect(() => {
    if (!selectedWarehouseCode) {
      setWarehouseSnapshot(null);
      setWarehouseSnapshotError(null);
      setWarehouseSnapshotLoading(false);
      return;
    }

    if (!isValidRange(rangeFrom, rangeTo)) {
      setWarehouseSnapshot(null);
      setWarehouseSnapshotError("Invalid date range.");
      return;
    }

    let cancelled = false;
    setWarehouseSnapshotLoading(true);
    setWarehouseSnapshotError(null);

    fetchInventoryWarehouseItems({ from: rangeFrom, to: rangeTo, warehouseCode: selectedWarehouseCode })
      .then((response) => {
        if (!cancelled) {
          setWarehouseSnapshot(response);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        const message =
          error instanceof Error && error.message ? error.message : "Unable to load warehouse items.";
        setWarehouseSnapshotError(message);
        setWarehouseSnapshot(null);
      })
      .finally(() => {
        if (!cancelled) {
          setWarehouseSnapshotLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [rangeFrom, rangeTo, selectedWarehouseCode]);

  const warehouseItemsIndex = useMemo(() => {
    const map = new Map<string, WarehouseScopedItem>();
    if (!warehouseSnapshot?.items) {
      return map;
    }

    warehouseSnapshot.items.forEach((item) => {
      const product = skus.find((row) => row.sku === item.sku);
      if (!product) {
        return;
      }
      map.set(item.sku, { ...item, risk: product.risk, category: product.category });
    });

    return map;
  }, [skus, warehouseSnapshot]);

  const filteredSkus = useMemo(() => {
    const term = search.trim().toLowerCase();
    return skus.filter((row) => {
      const matchesTerm =
        term.length === 0 ||
        row.sku.toLowerCase().includes(term) ||
        row.name.toLowerCase().includes(term) ||
        row.category.toLowerCase().includes(term) ||
        row.subCategory.toLowerCase().includes(term);
      const matchesRisk = riskFilter === "all" || row.risk === riskFilter;
      return matchesTerm && matchesRisk;
    });
  }, [riskFilter, search, skus]);

  const tableRows = useMemo(() => {
    return filteredSkus
      .map((product) => {
        const scoped = warehouseItemsIndex.get(product.sku);
        const onHand = scoped ? scoped.onHand : product.onHand;
        const reserved = scoped ? scoped.reserved : product.reserved;
        const available = scoped ? scoped.available : calculateAvailableStock(product);
        const inbound = scoped ? scoped.inbound : product.totalInbound ?? 0;
        const outbound = scoped ? scoped.outbound : product.totalOutbound ?? 0;
        const avgOutbound = scoped ? scoped.avgDailyOutbound : product.avgOutbound7d ?? 0;
        const safetyStock = scoped ? scoped.safetyStock : Math.round(Math.max(product.dailyAvg, 0) * 12);
        const etaDays = scoped?.stockoutEtaDays ?? (avgOutbound > 0 ? available / avgOutbound : null);

        return {
          sku: product.sku,
          name: product.name,
          category: product.category,
          risk: product.risk,
          onHand,
          reserved,
          available,
          inbound,
          outbound,
          avgDailyOutbound: avgOutbound,
          safetyStock,
          stockoutEtaDays: etaDays,
        };
      })
      .sort((a, b) => b.available - a.available);
  }, [filteredSkus, warehouseItemsIndex]);

  const quickRangeHandler = useCallback((days: number) => {
    const end = new Date();
    const endUtc = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
    const startUtc = new Date(endUtc);
    startUtc.setUTCDate(startUtc.getUTCDate() - (days - 1));
    setRangeFrom(toDateInputValue(startUtc));
    setRangeTo(toDateInputValue(endUtc));
  }, []);

  const riskCounters = useMemo(() => {
    const counters: Record<InventoryRisk, number> = {
      [RISK_STABLE]: 0,
      [RISK_SHORTAGE]: 0,
      [RISK_OVERSTOCK]: 0,
    };
    safeRiskSummary.forEach((entry) => {
      counters[entry.risk] = entry.count;
    });
    return counters;
  }, [riskSummary]);

  const totalSkuCount = useMemo(
    () => safeRiskSummary.reduce((sum, entry) => sum + entry.count, 0),
    [riskSummary],
  );

  const monthlyOutboundData = useMemo(() => {
    if (!analysis?.periodSeries) {
      return [];
    }

    return analysis.periodSeries.map((period) => ({
      label: period.label,
      outbound: period.outbound,
    }));
  }, [analysis]);

  const availableTrendData = useMemo(() => {
    if (!analysis?.stockSeries) {
      return [];
    }

    return analysis.stockSeries.map((point) => ({
      date: formatDateLabel(point.date),
      available: point.available,
    }));
  }, [analysis]);

  const availableVsSafetyData = useMemo(() => {
    if (!analysis?.stockSeries) {
      return [];
    }

    return analysis.stockSeries.map((point) => ({
      date: formatDateLabel(point.date),
      available: point.available,
      safety: point.safetyStock,
    }));
  }, [analysis]);

  const overstockRateData = useMemo(() => {
    if (!analysis?.stockSeries) {
      return [];
    }

    return analysis.stockSeries.map((point) => {
      const safety = point.safetyStock;
      const available = point.available;
      const rate = safety > 0 ? Math.max(((available - safety) / safety) * 100, 0) : available > 0 ? 100 : 0;

      return {
        date: formatDateLabel(point.date),
        overstockRate: Number.isFinite(rate) ? Math.round(rate * 10) / 10 : 0,
      };
    });
  }, [analysis]);

  const analysisTotals = analysis?.totals ?? null;

  return (
    <div className="grid grid-cols-12 gap-6 p-6">
      <Card className="col-span-12">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="sm:w-64">
              <label htmlFor="inventory-search" className="sr-only">
                SKU 또는 상품 검색
              </label>
              <input
                id="inventory-search"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="SKU, 상품명, 카테고리 검색"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex flex-col">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">창고</label>
                <select
                  className="min-w-[160px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100 disabled:text-slate-400"
                  value={selectedWarehouseId !== null ? String(selectedWarehouseId) : ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSelectedWarehouseId(value ? Number(value) : null);
                  }}
                  disabled={warehousesLoading && warehouses.length === 0}
                >
                  <option value="">전체 창고</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name} ({warehouse.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">기간</label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    value={rangeFrom}
                    max={rangeTo}
                    onChange={(event) => setRangeFrom(event.target.value)}
                  />
                  <span className="text-slate-400">~</span>
                  <input
                    type="date"
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    value={rangeTo}
                    min={rangeFrom}
                    onChange={(event) => setRangeTo(event.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {[7, 30, 90].map((days) => (
                  <button
                    key={days}
                    type="button"
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                    onClick={() => quickRangeHandler(days)}
                  >
                    최근 {days}일
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-500 lg:text-right">
            {selectedWarehouse ? `${selectedWarehouse.name} (${selectedWarehouse.code}) 기준` : "전체 창고 기준"}
          </div>
        </div>
        {warehousesError && (
          <div className="mt-3 flex items-center gap-2 text-xs text-rose-500">
            <span>{warehousesError}</span>
            <button
              type="button"
              className="rounded-full border border-rose-200 px-2 py-0.5 text-[11px] font-medium text-rose-500 transition hover:border-rose-300 hover:bg-rose-50"
              onClick={reloadWarehouses}
            >
              다시 시도
            </button>
          </div>
        )}
      </Card>

      <Card title="품목별 재고 현황" className="col-span-12">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <div>
            총 {tableRows.length}개 SKU / {selectedWarehouse ? `${selectedWarehouse.name} 기준` : "전체 창고 기준"}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`rounded-full px-3 py-1 border ${
                riskFilter === "all"
                  ? "border-indigo-300 bg-indigo-50 text-indigo-600"
                  : "border-slate-200 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50"
              }`}
              onClick={() => setRiskFilter("all")}
            >
              전체 {totalSkuCount}
            </button>
            {RISK_ORDER.map((risk) => (
              <button
                key={risk}
                type="button"
                className={`rounded-full px-3 py-1 border ${
                  riskFilter === risk
                    ? "border-indigo-300 bg-indigo-50 text-indigo-600"
                    : "border-slate-200 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50"
                }`}
                onClick={() => setRiskFilter(risk)}
              >
                {riskDisplayLabel[risk] ?? risk} {riskCounters[risk] ?? 0}
              </button>
            ))}
          </div>
        </div>
        {warehouseSnapshotError && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            {warehouseSnapshotError}
          </div>
        )}
        {warehouseSnapshotLoading && <div className="mb-3 text-xs text-slate-400">창고별 데이터를 불러오는 중입니다...</div>}
        <div className="overflow-auto max-h-[420px] rounded-xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">상품명</th>
                <th className="px-3 py-2">카테고리</th>
                <th className="px-3 py-2 text-right">현재고</th>
                <th className="px-3 py-2 text-right">가용 재고</th>
                <th className="px-3 py-2 text-right">안전 재고</th>
                <th className="px-3 py-2 text-right">기간 입고</th>
                <th className="px-3 py-2 text-right">기간 출고</th>
                <th className="px-3 py-2 text-right">일 평균 출고</th>
                <th className="px-3 py-2 text-right">소진 ETA(일)</th>
                <th className="px-3 py-2 text-center">위험도</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center text-slate-500">
                    조건에 맞는 품목이 없습니다.
                  </td>
                </tr>
              ) : (
                tableRows.map((row) => (
                  <tr
                    key={row.sku}
                    className="border-t border-slate-100 transition hover:bg-indigo-50/40"
                    onClick={() => {
                      const product = skus.find((sku) => sku.sku === row.sku);
                      if (product) {
                        setSelected(product);
                      }
                    }}
                  >
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.sku}</td>
                    <td className="px-3 py-2 text-slate-800">{row.name}</td>
                    <td className="px-3 py-2 text-slate-500">{row.category}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800">{row.onHand.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.available.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.safetyStock.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{row.inbound.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{row.outbound.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-slate-600">
                      {row.avgDailyOutbound ? row.avgDailyOutbound.toFixed(1) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600">
                      {Number.isFinite(row.stockoutEtaDays ?? NaN) && row.stockoutEtaDays !== null
                        ? Math.max(0, Math.round(row.stockoutEtaDays)).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <RiskTag risk={row.risk} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="월별 출고량" className="col-span-12 lg:col-span-6">
        <div className="h-60">
          {monthlyOutboundData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              해당 기간의 출고 데이터가 없습니다.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyOutboundData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="outbound" fill="#f97316" name="출고" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card title="가용 재고 추이" className="col-span-12 lg:col-span-6">
        <div className="h-60">
          {availableTrendData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              표시할 가용 재고 데이터가 없습니다.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={availableTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="available" stroke="#22c55e" strokeWidth={2} name="가용 재고" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card title="가용 재고 vs 안전 재고" className="col-span-12 lg:col-span-6">
        <div className="h-60">
          {availableVsSafetyData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              비교할 데이터가 없습니다.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={availableVsSafetyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="available" stroke="#2563eb" strokeWidth={2} name="가용 재고" dot={false} />
                <Line
                  type="monotone"
                  dataKey="safety"
                  stroke="#f97316"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  name="안전 재고"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card title="초과 재고율 추이" className="col-span-12 lg:col-span-6">
        <div className="h-60">
          {overstockRateData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              초과 재고율 데이터가 없습니다.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={overstockRateData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis tickFormatter={(value) => `${value}%`} />
                <Tooltip formatter={(value: number) => [`${value}%`, "초과 재고율"]} />
                <Legend />
                <Line type="monotone" dataKey="overstockRate" stroke="#ef4444" strokeWidth={2} name="초과 재고율" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </div>
  );
};

export default InventoryOverviewPage;
