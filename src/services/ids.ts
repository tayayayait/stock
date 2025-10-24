export function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const getRandomValues =
    typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
      ? (array: Uint8Array) => crypto.getRandomValues(array)
      : (array: Uint8Array) => {
          for (let i = 0; i < array.length; i += 1) {
            array[i] = Math.floor(Math.random() * 256);
          }
          return array;
        };

  const bytes = getRandomValues(new Uint8Array(16));

  // Set version (4) and variant bits according to RFC 4122
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const toHex: string[] = [];
  for (const byte of bytes) {
    toHex.push(byte.toString(16).padStart(2, '0'));
  }

  const segments = [
    toHex.slice(0, 4).join(''),
    toHex.slice(4, 6).join(''),
    toHex.slice(6, 8).join(''),
    toHex.slice(8, 10).join(''),
    toHex.slice(10, 16).join(''),
  ];

  return segments.join('-');
}
