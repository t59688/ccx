import crypto from "node:crypto";
import path from "node:path";
import fs from "fs-extra";
import zlib from "node:zlib";
import { Archive, ArchiveSchema, EncryptedEnvelope, EncryptedEnvelopeSchema } from "../types/schema.js";
import { listFilesRecursive } from "../utils/fs.js";
import { CcxError } from "../utils/errors.js";
import { t } from "../utils/i18n.js";

const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_BYTES = 32;
const MAXMEM = 128 * 1024 * 1024;

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  if (!passphrase) throw new CcxError("Encryption passphrase is required.");
  return crypto.scryptSync(passphrase, salt, KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAXMEM
  });
}

export function passphraseHash(passphrase: string): string {
  const digest = crypto.createHash("sha256").update(passphrase, "utf8").digest("hex");
  return `sha256:${digest}`;
}

export function encryptBuffer(plain: Buffer, passphrase: string): Buffer {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope: EncryptedEnvelope = {
    schema: "ccx.encrypted.v1",
    kdf: {
      name: "scrypt",
      salt: salt.toString("base64"),
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      keyBytes: KEY_BYTES
    },
    cipher: {
      name: "aes-256-gcm",
      iv: iv.toString("base64"),
      tag: tag.toString("base64")
    },
    ciphertext: encrypted.toString("base64")
  };
  return Buffer.from(JSON.stringify(envelope, null, 2));
}

export function decryptBuffer(envelopeBuffer: Buffer, passphrase: string): Buffer {
  const envelope = EncryptedEnvelopeSchema.parse(JSON.parse(envelopeBuffer.toString("utf8")));
  const salt = Buffer.from(envelope.kdf.salt, "base64");
  const iv = Buffer.from(envelope.cipher.iv, "base64");
  const tag = Buffer.from(envelope.cipher.tag, "base64");
  const ciphertext = Buffer.from(envelope.ciphertext, "base64");
  const key = crypto.scryptSync(passphrase, salt, envelope.kdf.keyBytes, {
    N: envelope.kdf.N,
    r: envelope.kdf.r,
    p: envelope.kdf.p,
    maxmem: MAXMEM
  });
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new CcxError(t("decryptFailed"), t("decryptFailedHint"));
  }
}

export async function packDirectory(dir: string): Promise<Buffer> {
  const files = await listFilesRecursive(dir);
  const entries = [];
  for (const file of files) {
    const relative = path.relative(dir, file).split(path.sep).join("/");
    const stat = await fs.stat(file);
    entries.push({
      path: relative,
      mode: stat.mode & 0o777,
      content: (await fs.readFile(file)).toString("base64")
    });
  }
  const archive: Archive = ArchiveSchema.parse({
    schema: "ccx.archive.v1",
    createdAt: new Date().toISOString(),
    entries
  });
  return zlib.gzipSync(Buffer.from(JSON.stringify(archive)));
}

export async function packNamedPaths(rootDir: string, relativePaths: string[]): Promise<Buffer> {
  const entries = [];
  for (const relRoot of relativePaths) {
    const absRoot = path.join(rootDir, relRoot);
    if (!(await fs.pathExists(absRoot))) continue;
    const files = await listFilesRecursive(absRoot);
    for (const file of files) {
      const relative = path.join(relRoot, path.relative(absRoot, file)).split(path.sep).join("/");
      const stat = await fs.stat(file);
      entries.push({
        path: relative,
        mode: stat.mode & 0o777,
        content: (await fs.readFile(file)).toString("base64")
      });
    }
  }
  const archive: Archive = ArchiveSchema.parse({
    schema: "ccx.archive.v1",
    createdAt: new Date().toISOString(),
    entries
  });
  return zlib.gzipSync(Buffer.from(JSON.stringify(archive)));
}

export async function unpackDirectory(buffer: Buffer, targetDir: string, overwrite: boolean): Promise<number> {
  const archive = ArchiveSchema.parse(JSON.parse(zlib.gunzipSync(buffer).toString("utf8")));
  let written = 0;
  for (const entry of archive.entries) {
    const safePath = path.normalize(entry.path);
    if (safePath.startsWith("..") || path.isAbsolute(safePath)) {
      throw new CcxError(`Unsafe archive path: ${entry.path}`);
    }
    const target = path.join(targetDir, safePath);
    if (!overwrite && (await fs.pathExists(target))) continue;
    await fs.ensureDir(path.dirname(target));
    await fs.writeFile(target, Buffer.from(entry.content, "base64"));
    if (process.platform !== "win32" && entry.mode) await fs.chmod(target, entry.mode).catch(() => undefined);
    written += 1;
  }
  return written;
}
