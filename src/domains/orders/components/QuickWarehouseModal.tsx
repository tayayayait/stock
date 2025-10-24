import * as React from 'react';

import Modal from '../../../../components/ui/Modal';
import { createLocation, createWarehouse } from '../../../services/api';
import type { ApiLocation, ApiWarehouse } from '../../../services/api';
import { generateWarehouseCode } from '../../../utils/warehouse';

interface QuickWarehouseModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (warehouse: ApiWarehouse, location: ApiLocation) => void;
}

interface FormState {
  warehouseName: string;
  warehouseAddress: string;
  locationName: string;
  memo: string;
}

type TouchedState = {
  warehouseName: boolean;
  warehouseAddress: boolean;
  locationName: boolean;
};

const INITIAL_FORM: FormState = {
  warehouseName: '',
  warehouseAddress: '',
  locationName: '',
  memo: '',
};

const QuickWarehouseModal: React.FC<QuickWarehouseModalProps> = ({ open, onClose, onCreated }) => {
  const [form, setForm] = React.useState<FormState>(INITIAL_FORM);
  const [touched, setTouched] = React.useState<TouchedState>({
    warehouseName: false,
    warehouseAddress: false,
    locationName: false,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const resetState = React.useCallback(() => {
    setForm(INITIAL_FORM);
    setTouched({ warehouseName: false, warehouseAddress: false, locationName: false });
    setError(null);
  }, []);

  const handleClose = React.useCallback(() => {
    if (submitting) {
      return;
    }
    resetState();
    onClose();
  }, [onClose, resetState, submitting]);

  const handleChange = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleBlur = (key: keyof TouchedState) => () => {
    setTouched((prev) => ({ ...prev, [key]: true }));
  };

  const warehouseError = touched.warehouseName && !form.warehouseName.trim();
  const addressError = touched.warehouseAddress && !form.warehouseAddress.trim();
  const locationError = touched.locationName && !form.locationName.trim();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched({ warehouseName: true, warehouseAddress: true, locationName: true });

    const warehouseName = form.warehouseName.trim();
    const warehouseAddress = form.warehouseAddress.trim();
    const locationCode = form.locationName.trim();
    const descriptionInput = form.memo.trim();

    if (!warehouseName || !warehouseAddress || !locationCode) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const warehouseCode = generateWarehouseCode(warehouseName);
      const warehouse = await createWarehouse({
        code: warehouseCode,
        name: warehouseName,
        address: warehouseAddress,
      });
      if (!warehouse?.id) {
        throw new Error('창고 정보를 확인할 수 없습니다.');
      }
      const location = await createLocation({
        warehouseCode: warehouse.code,
        code: locationCode,
        description: descriptionInput || locationCode,
      });
      onCreated?.(warehouse, location);
      resetState();
      onClose();
    } catch (submitError) {
      const message =
        submitError instanceof Error && submitError.message
          ? submitError.message
          : '창고를 저장하지 못했습니다. 다시 시도해주세요.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={handleClose} title="창고 추가">
      <form onSubmit={handleSubmit} className="space-y-4 text-sm text-slate-700">
        <p className="text-xs text-slate-500">창고와 상세위치를 함께 등록하세요.</p>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">창고명</span>
          <input
            type="text"
            value={form.warehouseName}
            onChange={handleChange('warehouseName')}
            onBlur={handleBlur('warehouseName')}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
            placeholder="예: 서울 센터"
            autoFocus
            disabled={submitting}
          />
          {warehouseError ? <span className="text-xs text-rose-500">창고명을 입력하세요.</span> : null}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">창고 주소</span>
          <input
            type="text"
            value={form.warehouseAddress}
            onChange={handleChange('warehouseAddress')}
            onBlur={handleBlur('warehouseAddress')}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
            placeholder="예: 서울특별시 송파구 물류로 1"
            disabled={submitting}
          />
          {addressError ? <span className="text-xs text-rose-500">창고 주소를 입력하세요.</span> : null}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">상세위치</span>
          <input
            type="text"
            value={form.locationName}
            onChange={handleChange('locationName')}
            onBlur={handleBlur('locationName')}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
            placeholder="예: 입고존-A1"
            disabled={submitting}
          />
          {locationError ? <span className="text-xs text-rose-500">상세위치를 입력하세요.</span> : null}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">메모 (선택)</span>
          <textarea
            value={form.memo}
            onChange={handleChange('memo')}
            className="h-20 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
            placeholder="보관 특이사항을 입력하세요"
            disabled={submitting}
          />
        </label>
        {error ? <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={submitting}
          >
            취소
          </button>
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
            disabled={submitting}
          >
            {submitting ? '저장 중...' : '저장'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default QuickWarehouseModal;
