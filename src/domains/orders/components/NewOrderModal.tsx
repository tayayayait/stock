import * as React from 'react';

import NewOrderForm, {
  type NewOrderFormProps,
  type NewOrderFormState,
  type OrderKind,
} from './NewOrderForm';

interface NewOrderModalProps
  extends Omit<NewOrderFormProps, 'onCancel' | 'active' | 'className' | 'submitButtonLabel' | 'cancelButtonLabel' | 'formId' | 'aria-labelledby'> {
  open: boolean;
  onClose: () => void;
}

const NewOrderModal: React.FC<NewOrderModalProps> = ({ open, onClose, ...formProps }) => {
  const titleId = React.useId();

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
      <div
        className="w-full max-w-2xl rounded-xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-slate-800">
            새 주문 작성
          </h2>
          <button type="button" className="text-sm text-slate-500" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="max-h-[75vh] overflow-auto px-6 py-4">
          <NewOrderForm
            {...formProps}
            onCancel={onClose}
            active={open}
            submitButtonLabel="저장"
            cancelButtonLabel="취소"
            aria-labelledby={titleId}
          />
        </div>
      </div>
    </div>
  );
};

export type { NewOrderFormState, OrderKind };
export default NewOrderModal;
