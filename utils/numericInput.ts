import { KeyboardEvent } from 'react';

const ALLOWED_CONTROL_KEYS = new Set([
  'Backspace',
  'Delete',
  'Tab',
  'Enter',
  'Escape',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
]);

export const DECIMAL_INPUT_PATTERN = '[0-9]*[.,]?[0-9]*';

export const handleDecimalInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.nativeEvent.isComposing) {
    return;
  }

  if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }

  if (ALLOWED_CONTROL_KEYS.has(event.key)) {
    return;
  }

  if (/^\d$/.test(event.key)) {
    return;
  }

  if (event.key === '.' || event.key === ',') {
    const { value, selectionStart, selectionEnd } = event.currentTarget;

    if (selectionStart !== null && selectionEnd !== null && selectionStart !== selectionEnd) {
      const nextValue =
        value.slice(0, selectionStart) + event.key + value.slice(selectionEnd ?? selectionStart);
      if (!nextValue.includes('.') && !nextValue.includes(',')) {
        return;
      }
    }

    if (!value.includes('.') && !value.includes(',')) {
      return;
    }

    event.preventDefault();
    return;
  }

  event.preventDefault();
};

export const decimalInputProps = {
  inputMode: 'decimal' as const,
  pattern: DECIMAL_INPUT_PATTERN,
};
