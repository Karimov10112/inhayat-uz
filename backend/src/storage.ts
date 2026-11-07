import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { issueToken } from "./auth.js";

/** Where uploaded medical files live. */
export interface FileStore {
  readonly kind: "r2" | "local";
  signUpload(key: string, contentType: string, size: number): Promise<string>;
  head(key: string): Promise<{ size: number; contentType: string } | null>;
  readPrefix(key: string, bytes: number): Promise<Uint8Array | null>;
  signView(key: string, fileName: string, contentType: string): Promise<string>;
}

const TTL = 300;

export class R2Store implements FileStore {
  readonly kind = "r2" as const;
  private client: S3Client;
  constructor(accountId: string, accessKeyId: string, secretAccessKey: string, private bucket: string) {
    this.client = new S3Client({ region: "auto", endpoint: `https://${accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } });
  }
  signUpload(key: string, contentType: string, size: number) {
    return getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: size }), { expiresIn: TTL });
  }
  async head(key: string) {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: head.ContentLength ?? 0, contentType: head.ContentType ?? "" };
    } catch { return null; }
  }
  async readPrefix(key: string, bytes: number) {
    const part = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
    return (await part.Body?.transformToByteArray()) ?? null;
  }
  signView(key: string, fileName: string, contentType: string) {
    return getSignedUrl(this.client, new GetObjectCommand({
      Bucket: this.bucket, Key: key, ResponseContentType: contentType,
      ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    }), { expiresIn: TTL });
  }
}

/**
 * Demo storage on the server's disk. Upload/view links are short-lived signed
 * tokens handled by /api/files/* routes, so the browser flow is the same as R2.
 */
export class LocalStore implements FileStore {
  readonly kind = "local" as const;
  constructor(private root: string) { mkdirSync(root, { recursive: true }); }
  pathFor(key: string) {
    const full = resolve(this.root, key);
    if (!full.startsWith(resolve(this.root) + "/") && !full.startsWith(resolve(this.root) + "\\")) throw new Error("Bad key");
    return full;
  }
  write(key: string, content: Uint8Array, contentType: string) {
    const full = this.pathFor(key);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
    writeFileSync(`${full}.type`, contentType);
  }
  async signUpload(key: string, contentType: string, size: number) {
    return `/api/files/upload/${issueToken({ op: "put", key, type: contentType, size }, TTL)}`;
  }
  async head(key: string) {
    const full = this.pathFor(key);
    if (!existsSync(full)) return null;
    return { size: statSync(full).size, contentType: existsSync(`${full}.type`) ? readFileSync(`${full}.type`, "utf8") : "application/octet-stream" };
  }
  async readPrefix(key: string, bytes: number) {
    const full = this.pathFor(key);
    return existsSync(full) ? new Uint8Array(readFileSync(full).subarray(0, bytes)) : null;
  }
  read(key: string) { const full = this.pathFor(key); return existsSync(full) ? readFileSync(full) : null; }
  async signView(key: string, fileName: string, contentType: string) {
    return `/api/files/view/${issueToken({ op: "get", key, name: fileName, type: contentType }, TTL)}`;
  }
}

export function localStoreAt(dataDir: string) { return new LocalStore(join(dataDir, "files")); }
