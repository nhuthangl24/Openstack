import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PASSWORD_CHARSET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+?";

function getEncryptionKey() {
  const raw =
    process.env.DATABASE_HOSTING_ENCRYPTION_KEY ||
    process.env.DB_ENCRYPTION_KEY ||
    "";

  if (!raw) {
    throw new Error(
      "Thieu DATABASE_HOSTING_ENCRYPTION_KEY de ma hoa password reference.",
    );
  }

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  if (/^[A-Za-z0-9+/=]+$/.test(raw)) {
    try {
      const asBase64 = Buffer.from(raw, "base64");

      if (asBase64.length === 32) {
        return asBase64;
      }
    } catch {
      // ignore, fallback to utf8 path below
    }
  }

  const utf8 = Buffer.from(raw, "utf8");

  if (utf8.length !== 32) {
    throw new Error(
      "DATABASE_HOSTING_ENCRYPTION_KEY phai la 32 bytes raw, 64 hex hoac base64 cua 32 bytes.",
    );
  }

  return utf8;
}

export function generateStrongPassword(length = 24) {
  const bytes = randomBytes(length);
  let password = "";

  for (let index = 0; index < length; index += 1) {
    password += PASSWORD_CHARSET[bytes[index] % PASSWORD_CHARSET.length];
  }

  return password;
}

export function encryptSecret(secret: string) {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptSecret(payload: string) {
  const key = getEncryptionKey();
  const buffer = Buffer.from(payload, "base64");
  const iv = buffer.subarray(0, 12);
  const authTag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}
