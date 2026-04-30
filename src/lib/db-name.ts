const DISPLAY_NAME_REGEX = /^[a-z0-9_]{3,32}$/;

export function sanitizeDatabaseLabel(input: string) {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");

  if (!DISPLAY_NAME_REGEX.test(normalized)) {
    throw new Error(
      "Ten database phai dai 3-32 ky tu, chi gom chu thuong, so va dau gach duoi.",
    );
  }

  return normalized;
}

export function sanitizeHandle(input: string) {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");

  if (!normalized) {
    throw new Error("Khong the tao mysql username tu handle hien tai.");
  }

  return normalized.slice(0, 20);
}

export function buildMysqlUsername(handle: string) {
  const slug = sanitizeHandle(handle);
  return `gh_${slug}`.slice(0, 32);
}

export function buildRealDatabaseName(handle: string, databaseLabel: string) {
  const handleSlug = sanitizeHandle(handle);
  const databaseSlug = sanitizeDatabaseLabel(databaseLabel);
  const raw = `gh_${handleSlug}_${databaseSlug}`;

  return raw.length <= 64 ? raw : raw.slice(0, 64);
}

export function escapeIdentifier(identifier: string) {
  if (!/^[a-z0-9_]{1,64}$/i.test(identifier)) {
    throw new Error("Identifier khong hop le.");
  }

  return `\`${identifier.replace(/`/g, "``")}\``;
}
