export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export function validDocument(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) return false;
  if (mime === 'application/pdf') return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') return [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v);
  return false;
}
