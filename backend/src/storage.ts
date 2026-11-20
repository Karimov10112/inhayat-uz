import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { issueToken } from "./auth.js";
import type { DataCipher } from "./encryption.js";
import { GetObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";

export interface FileStore {
  readonly kind: "local";
  signUpload(key: string, contentType: string, size: number): Promise<string>;
  head(key: string): Promise<{ size: number; contentType: string } | null>;
  readPrefix(key: string, bytes: number): Promise<Uint8Array | null>;
}

export class LocalStore implements FileStore {
  readonly kind = "local" as const;
  constructor(private root: string, private cipher: DataCipher = null) { mkdirSync(root, { recursive: true }); }

  pathFor(key: string) {
    const full = resolve(this.root, key);
    if (!full.startsWith(resolve(this.root) + "/") && !full.startsWith(resolve(this.root) + "\\")) throw new Error("Bad key");
    return full;
  }

  write(key: string, content: Uint8Array, contentType: string, immutable = false) {
    const full = this.pathFor(key);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, this.cipher ? this.cipher.seal(content, key) : content, { flag: immutable ? "wx" : "w", mode: 0o600 });
    writeFileSync(`${full}.type`, contentType);
  }

  async signUpload(key: string, contentType: string, size: number) {
    return `/api/files/upload/${issueToken({ op: "put", key, type: contentType, size }, 300)}`;
  }

  async head(key: string) {
    const full = this.pathFor(key);
    if (!existsSync(full)) return null;
    return { size: statSync(full).size - (this.cipher ? 28 : 0), contentType: existsSync(`${full}.type`) ? readFileSync(`${full}.type`, "utf8") : "application/octet-stream" };
  }

  async readPrefix(key: string, bytes: number) {
    return this.read(key)?.subarray(0, bytes) ?? null;
  }

  read(key: string) {
    const full = this.pathFor(key);
    if (!existsSync(full)) return null;
    const data = readFileSync(full);
    return this.cipher ? this.cipher.open(data, key) : data;
  }

}

export function localStoreAt(dataDir: string, cipher: DataCipher = null) {
  return new LocalStore(join(dataDir, "files"), cipher);
}

export class R2Store {
  private client: S3Client;
  constructor(env: NodeJS.ProcessEnv, private bucket: string, private cipher: NonNullable<DataCipher>) {
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = env;
    if (!R2_ACCOUNT_ID || !/^[a-f0-9]{32}$/i.test(R2_ACCOUNT_ID) || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) throw new Error("R2 credentials are incomplete.");
    this.client = new S3Client({
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      region: "auto",
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      maxAttempts: 2,
    });
  }

  async write(key: string, data: Buffer, mime: string) {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket, Key: key, Body: this.cipher.seal(data, key),
      ContentType: "application/octet-stream", Metadata: { mime }, IfNoneMatch: "*",
    }), { abortSignal: AbortSignal.timeout(20000) });
  }

  async read(key: string) {
    try {
      const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }), { abortSignal: AbortSignal.timeout(15000) });
      if (!object.Body || !object.ContentLength || object.ContentLength > 10 * 1024 * 1024 + 28) return null;
      return { body: this.cipher.open(Buffer.from(await object.Body.transformToByteArray()), key), mime: object.Metadata?.mime ?? "" };
    } catch (error) {
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) return null;
      throw error;
    }
  }
}
