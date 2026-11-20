import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function dataCipher(encodedKey?: string) {
  if (!encodedKey) return null;
  if (!/^[a-f0-9]{64}$/i.test(encodedKey)) throw new Error("DATA_ENCRYPTION_KEY must contain 64 hex characters.");
  const key = Buffer.from(encodedKey, "hex");
  return {
    seal(data: Uint8Array, context: string) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(context));
      const body = Buffer.concat([cipher.update(data), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]);
    },
    open(data: Buffer, context: string) {
      const cipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
      cipher.setAAD(Buffer.from(context));
      cipher.setAuthTag(data.subarray(12, 28));
      return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]);
    },
  };
}

export type DataCipher = ReturnType<typeof dataCipher>;
