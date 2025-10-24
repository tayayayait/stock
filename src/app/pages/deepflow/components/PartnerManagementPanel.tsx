import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';

import PartnerModal from '../../../../domains/orders/components/PartnerModal';
import { deletePartner, listPartners, type Partner } from '../../../../services/orders';

const buildSupplierKey = (partner: Partner) => partner.id;

const PartnerManagementPanel: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [partnerPendingDeletion, setPartnerPendingDeletion] = useState<Partner | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteDialogTitleId = useId();

  const supplierCount = suppliers.length;

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listPartners({ type: 'SUPPLIER' });
      setSuppliers(Array.isArray(items) ? items : []);
    } catch (err) {
      console.error('[deepflow] Failed to load supplier partners', err);
      const message =
        err instanceof Error && err.message ? err.message : '공급업체 목록을 불러오지 못했습니다.';
      setError(message);
      setSuppliers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);

  const handleOpenModal = useCallback(() => {
    setModalMode('create');
    setEditingPartner(null);
    setModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
    setModalMode('create');
    setEditingPartner(null);
  }, []);

  const handlePartnerCompleted = useCallback(async () => {
    await loadSuppliers();
  }, [loadSuppliers]);

  const handleEditPartner = useCallback((partner: Partner) => {
    setModalMode('edit');
    setEditingPartner(partner);
    setModalOpen(true);
  }, []);

  const handleRequestDelete = useCallback((partner: Partner) => {
    setPartnerPendingDeletion(partner);
    setDeleteError(null);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setPartnerPendingDeletion(null);
    setDeleteError(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!partnerPendingDeletion) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deletePartner(partnerPendingDeletion.id);
      setPartnerPendingDeletion(null);
      await loadSuppliers();
    } catch (err) {
      console.error('[deepflow] Failed to delete partner', err);
      const message =
        err instanceof Error && err.message ? err.message : '거래처를 삭제하지 못했습니다.';
      setDeleteError(message);
    } finally {
      setDeleting(false);
    }
  }, [loadSuppliers, partnerPendingDeletion]);

  const sortedSuppliers = useMemo(() => {
    return [...suppliers].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [suppliers]);

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">공급업체 관리</h2>
          <p className="mt-1 text-sm text-slate-500">대시보드를 떠나지 않고 주요 공급업체 정보를 확인하고 추가하세요.</p>
        </div>
        <button
          type="button"
          onClick={handleOpenModal}
          className="rounded-full bg-indigo-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          거래처 추가
        </button>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-800">공급업체 목록</h3>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600">
            총 {supplierCount.toLocaleString()}곳
          </span>
        </div>
        <div className="px-6 pb-6">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">공급업체 정보를 불러오는 중입니다...</div>
          ) : error ? (
            <div className="rounded-xl bg-rose-50 px-4 py-6 text-center text-sm text-rose-600">{error}</div>
          ) : supplierCount === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">등록된 공급업체가 없습니다. 상단의 거래처 추가 버튼을 눌러 등록하세요.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm" aria-label="공급업체 목록">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th scope="col" className="px-4 py-3 font-medium">거래처명</th>
                    <th scope="col" className="px-4 py-3 font-medium">연락처</th>
                    <th scope="col" className="px-4 py-3 font-medium">이메일</th>
                    <th scope="col" className="px-4 py-3 font-medium">주소</th>
                    <th scope="col" className="px-4 py-3 font-medium">비고</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700">
                  {sortedSuppliers.map((partner) => (
                    <tr key={buildSupplierKey(partner)} className="hover:bg-indigo-50/40">
                      <td className="px-4 py-3 font-medium text-slate-900">{partner.name}</td>
                      <td className="px-4 py-3">{partner.phone ?? '—'}</td>
                      <td className="px-4 py-3">{partner.email ?? '—'}</td>
                      <td className="px-4 py-3">{partner.address ?? '—'}</td>
                      <td className="px-4 py-3">{partner.notes ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                            onClick={() => handleEditPartner(partner)}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-rose-200 px-3 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                            onClick={() => handleRequestDelete(partner)}
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <PartnerModal
        open={modalOpen}
        mode={modalMode}
        initialPartner={editingPartner}
        defaultType="SUPPLIER"
        onClose={handleCloseModal}
        onCompleted={handlePartnerCompleted}
      />

      {partnerPendingDeletion ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={deleteDialogTitleId}
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
          >
            <h3 id={deleteDialogTitleId} className="text-lg font-semibold text-slate-900">
              거래처 삭제
            </h3>
            <p className="mt-3 text-sm text-slate-600">
              {partnerPendingDeletion.name} 거래처를 삭제하시겠어요? 삭제 후에는 다시 복구할 수 없습니다.
            </p>
            {deleteError ? (
              <div className="mt-3 rounded-md bg-rose-50 p-3 text-sm text-rose-600">{deleteError}</div>
            ) : null}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600"
                onClick={handleCancelDelete}
                disabled={deleting}
              >
                취소
              </button>
              <button
                type="button"
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? '삭제 중...' : '삭제 확인'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default PartnerManagementPanel;
