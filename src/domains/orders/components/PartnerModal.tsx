import * as React from 'react';
import {
  createPartner,
  updatePartner,
  type Partner,
  type PartnerType,
} from '../../../services/orders';

interface FormState {
  type: PartnerType;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

interface PartnerModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  onClose: () => void;
  initialPartner?: Partner | null;
  defaultType?: PartnerType;
  onCompleted?: (partner: Partner) => void | Promise<void>;
}

const INITIAL_STATE: FormState = {
  type: 'SUPPLIER',
  name: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
};

const PartnerModal: React.FC<PartnerModalProps> = ({
  open,
  mode,
  onClose,
  initialPartner,
  defaultType,
  onCompleted,
}) => {
  const [formState, setFormState] = React.useState<FormState>(INITIAL_STATE);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isEditMode = mode === 'edit';

  React.useEffect(() => {
    if (open) {
      if (isEditMode && initialPartner) {
        setFormState({
          type: initialPartner.type,
          name: initialPartner.name ?? '',
          phone: initialPartner.phone ?? '',
          email: initialPartner.email ?? '',
          address: initialPartner.address ?? '',
          notes: initialPartner.notes ?? '',
        });
      } else {
        setFormState({ ...INITIAL_STATE, type: defaultType ?? INITIAL_STATE.type });
      }
      setError(null);
      setSubmitting(false);
    }
  }, [defaultType, initialPartner, isEditMode, open]);

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitting(true);
      setError(null);
      try {
        if (isEditMode && !initialPartner?.id) {
          throw new Error('수정할 거래처가 선택되지 않았습니다.');
        }

        const trimmedState = {
          type: formState.type,
          name: formState.name.trim(),
          phone: formState.phone.trim(),
          email: formState.email.trim(),
          address: formState.address.trim(),
          notes: formState.notes.trim(),
        };

        const result = isEditMode
          ? await updatePartner({
              id: initialPartner!.id,
              type: trimmedState.type,
              name: trimmedState.name,
              phone: trimmedState.phone || null,
              email: trimmedState.email || null,
              address: trimmedState.address || null,
              notes: trimmedState.notes || null,
            })
          : await createPartner({
              type: trimmedState.type,
              name: trimmedState.name,
              phone: trimmedState.phone || undefined,
              email: trimmedState.email || undefined,
              address: trimmedState.address || undefined,
              notes: trimmedState.notes || undefined,
            });

        if (onCompleted) {
          await onCompleted(result);
        }
        setSubmitting(false);
        onClose();
      } catch (err) {
        console.error('[orders] PartnerModal submit failed', err);
        const fallbackMessage = isEditMode
          ? '거래처를 수정하지 못했습니다.'
          : '거래처를 추가하지 못했습니다.';
        setError(err instanceof Error ? err.message : fallbackMessage);
        setSubmitting(false);
      }
    },
    [formState, initialPartner?.id, isEditMode, onClose, onCompleted],
  );

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">
            {isEditMode ? '거래처 정보 수정' : '새 거래처 추가'}
          </h2>
          <button type="button" className="text-sm text-slate-500" onClick={onClose} disabled={submitting}>
            닫기
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-4 text-sm">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500" htmlFor="partner-type">
              유형
            </label>
            <select
              id="partner-type"
              className="w-full rounded-md border border-slate-200 px-3 py-2"
              value={formState.type}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, type: event.target.value as PartnerType }))
              }
              disabled={submitting}
            >
              <option value="SUPPLIER">공급업체</option>
              <option value="CUSTOMER">고객사</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500" htmlFor="partner-name">
              거래처명
            </label>
            <input
              id="partner-name"
              type="text"
              className="w-full rounded-md border border-slate-200 px-3 py-2"
              value={formState.name}
              onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="거래처명을 입력하세요"
              disabled={submitting}
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500" htmlFor="partner-phone">
              전화번호
            </label>
            <input
              id="partner-phone"
              type="tel"
              className="w-full rounded-md border border-slate-200 px-3 py-2"
              value={formState.phone}
              onChange={(event) => setFormState((prev) => ({ ...prev, phone: event.target.value }))}
              placeholder="010-0000-0000"
              disabled={submitting}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500" htmlFor="partner-email">
              이메일
            </label>
            <input
              id="partner-email"
              type="email"
              className="w-full rounded-md border border-slate-200 px-3 py-2"
              value={formState.email}
              onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="name@example.com"
              disabled={submitting}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500" htmlFor="partner-address">
              주소
            </label>
            <input
              id="partner-address"
              type="text"
              className="w-full rounded-md border border-slate-200 px-3 py-2"
              value={formState.address}
              onChange={(event) => setFormState((prev) => ({ ...prev, address: event.target.value }))}
              placeholder="주소를 입력하세요"
              disabled={submitting}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500" htmlFor="partner-notes">
              비고
            </label>
            <textarea
              id="partner-notes"
              className="w-full rounded-md border border-slate-200 px-3 py-2"
              value={formState.notes}
              onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="추가 메모를 입력하세요"
              rows={3}
              disabled={submitting}
            />
          </div>

          {error ? <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-600">{error}</div> : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600"
              onClick={onClose}
              disabled={submitting}
            >
              취소
            </button>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
              disabled={submitting}
            >
              {submitting
                ? '저장 중...'
                : isEditMode
                ? '변경 내용 저장'
                : '거래처 추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PartnerModal;
