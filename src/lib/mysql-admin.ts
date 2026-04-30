import { randomUUID } from "node:crypto";
import {
  createPool,
  type Pool,
  type PoolConnection,
  type RowDataPacket,
} from "mysql2/promise";
import { getCurrentGitHubUser, type CurrentGitHubUser } from "@/lib/current-github-user";
import {
  buildMysqlUsername,
  buildRealDatabaseName,
  escapeIdentifier,
  sanitizeDatabaseLabel,
} from "@/lib/db-name";
import { decryptSecret, encryptSecret, generateStrongPassword } from "@/lib/password";
import {
  buildRemainingQuotaSnapshot,
  DEFAULT_PLANS,
  formatStorage,
  getDefaultPlanCode,
  type EffectiveQuota,
} from "@/lib/quota";
import type { NextRequest } from "next/server";

const MYSQL_PRIVILEGES = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "CREATE",
  "DROP",
  "ALTER",
  "INDEX",
  "REFERENCES",
  "CREATE TEMPORARY TABLES",
  "LOCK TABLES",
].join(", ");

const CREATE_WINDOW_MS = 60 * 60 * 1000;
const createRateLimit = new Map<
  string,
  {
    count: number;
    windowStart: number;
  }
>();
const HOSTED_DATABASES_TABLE = escapeIdentifier("databases");

export class DatabaseHostingError extends Error {
  status: number;
  expose: boolean;

  constructor(message: string, status = 400, expose = true) {
    super(message);
    this.name = "DatabaseHostingError";
    this.status = status;
    this.expose = expose;
  }
}

interface AppUserRow extends RowDataPacket {
  id: number;
  github_username: string;
  email: string | null;
  name: string | null;
  plan_id: number;
  created_at: Date;
  updated_at: Date;
}

interface PlanRow extends RowDataPacket {
  id: number;
  code: string;
  name: string;
  max_databases: number;
  max_total_storage_mb: number;
  max_connections: number;
  price: number;
}

interface QuotaRow extends RowDataPacket {
  max_databases: number;
  max_storage_mb: number;
  max_connections: number;
}

interface DatabaseAccountRow extends RowDataPacket {
  id: number;
  user_id: number;
  mysql_username: string;
  encrypted_password_reference: string;
  host_allow: string;
}

interface HostedDatabaseRow extends RowDataPacket {
  id: string;
  user_id: number;
  db_name: string;
  real_db_name: string;
  mysql_username: string;
  host: string;
  port: number;
  status: string;
  current_size_mb: number;
  created_at: Date;
  deleted_at: Date | null;
}

export interface DatabaseListItem {
  id: string;
  displayName: string;
  realDatabaseName: string;
  mysqlUsername: string;
  host: string;
  port: number;
  status: string;
  currentSizeMb: number;
  currentSizeLabel: string;
  createdAt: string;
}

export interface DatabaseUsageSummary {
  plan: {
    code: string;
    name: string;
    price: number;
  };
  quota: EffectiveQuota;
  usage: {
    totalDatabases: number;
    totalStorageMb: number;
    totalStorageLabel: string;
    activeConnections: number;
  };
  remaining: {
    remainingDatabases: number;
    remainingStorageMb: number;
    remainingStorageLabel: string;
    remainingConnections: number;
  };
}

export interface ConnectionInfoPayload {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  databaseUrl: string;
}

export interface CreateDatabaseResult {
  database: DatabaseListItem;
  connection: ConnectionInfoPayload;
  passwordWasCreated: boolean;
}

export interface PasswordResetResult {
  mysqlUsername: string;
  password: string;
}

interface PlatformContext {
  user: AppUserRow;
  github: CurrentGitHubUser;
  plan: PlanRow;
  quota: EffectiveQuota;
}

let adminPool: Pool | null = null;
let bootstrapPromise: Promise<void> | null = null;

function getAdminConfig() {
  const host = process.env.DATABASE_HOSTING_ADMIN_HOST || process.env.MYSQL_ADMIN_HOST;
  const user = process.env.DATABASE_HOSTING_ADMIN_USER || process.env.MYSQL_ADMIN_USER;
  const password =
    process.env.DATABASE_HOSTING_ADMIN_PASSWORD || process.env.MYSQL_ADMIN_PASSWORD;
  const port = Number(
    process.env.DATABASE_HOSTING_ADMIN_PORT || process.env.MYSQL_ADMIN_PORT || 3306,
  );

  if (!host || !user || !password) {
    throw new DatabaseHostingError(
      "Thieu DATABASE_HOSTING_ADMIN_HOST, DATABASE_HOSTING_ADMIN_USER hoac DATABASE_HOSTING_ADMIN_PASSWORD.",
      500,
      true,
    );
  }

  return {
    host,
    user,
    password,
    port,
    connectHost: process.env.DATABASE_HOSTING_CONNECT_HOST || host,
    connectPort: Number(process.env.DATABASE_HOSTING_CONNECT_PORT || port),
    controlDatabase:
      process.env.DATABASE_HOSTING_CONTROL_DATABASE || "orbitstack_control",
    hostAllow: process.env.DATABASE_HOSTING_MYSQL_HOST_ALLOW || "10.%",
    createLimitPerHour: Number(
      process.env.DATABASE_HOSTING_CREATE_LIMIT_PER_HOUR || 8,
    ),
  };
}

function getAdminPool() {
  if (!adminPool) {
    const config = getAdminConfig();
    adminPool = createPool({
      host: config.host,
      user: config.user,
      password: config.password,
      port: config.port,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      decimalNumbers: true,
      namedPlaceholders: false,
      timezone: "Z",
      multipleStatements: false,
    });
  }

  return adminPool;
}

async function ensureBootstrap() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const pool = getAdminPool();
      const connection = await pool.getConnection();
      const config = getAdminConfig();

      try {
        await connection.query(
          `CREATE DATABASE IF NOT EXISTS ${escapeIdentifier(config.controlDatabase)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
        );
        await connection.query(`USE ${escapeIdentifier(config.controlDatabase)}`);

        await connection.query(`
          CREATE TABLE IF NOT EXISTS plans (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            code VARCHAR(32) NOT NULL UNIQUE,
            name VARCHAR(64) NOT NULL,
            max_databases INT NOT NULL,
            max_total_storage_mb INT NOT NULL,
            max_connections INT NOT NULL,
            price DECIMAL(10,2) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await connection.query(`
          CREATE TABLE IF NOT EXISTS users (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            github_username VARCHAR(191) NOT NULL UNIQUE,
            email VARCHAR(191) NULL,
            name VARCHAR(191) NULL,
            plan_id BIGINT UNSIGNED NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_users_plan FOREIGN KEY (plan_id) REFERENCES plans(id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await connection.query(`
          CREATE TABLE IF NOT EXISTS database_accounts (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            user_id BIGINT UNSIGNED NOT NULL UNIQUE,
            mysql_username VARCHAR(64) NOT NULL UNIQUE,
            encrypted_password_reference TEXT NOT NULL,
            host_allow VARCHAR(128) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_accounts_user FOREIGN KEY (user_id) REFERENCES users(id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await connection.query(`
          CREATE TABLE IF NOT EXISTS ${HOSTED_DATABASES_TABLE} (
            id CHAR(36) NOT NULL PRIMARY KEY,
            user_id BIGINT UNSIGNED NOT NULL,
            db_name VARCHAR(64) NOT NULL,
            real_db_name VARCHAR(64) NOT NULL UNIQUE,
            mysql_username VARCHAR(64) NOT NULL,
            host VARCHAR(191) NOT NULL,
            port INT NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'active',
            current_size_mb DECIMAL(12,2) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME NULL,
            INDEX idx_databases_user (user_id),
            INDEX idx_databases_status (status),
            CONSTRAINT fk_databases_user FOREIGN KEY (user_id) REFERENCES users(id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await connection.query(`
          CREATE TABLE IF NOT EXISTS quotas (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            user_id BIGINT UNSIGNED NOT NULL UNIQUE,
            max_databases INT NOT NULL,
            max_storage_mb INT NOT NULL,
            max_connections INT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_quotas_user FOREIGN KEY (user_id) REFERENCES users(id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await connection.query(`
          CREATE TABLE IF NOT EXISTS usage_stats (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            user_id BIGINT UNSIGNED NOT NULL UNIQUE,
            total_databases INT NOT NULL DEFAULT 0,
            total_storage_mb DECIMAL(12,2) NOT NULL DEFAULT 0,
            active_connections INT NOT NULL DEFAULT 0,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_usage_user FOREIGN KEY (user_id) REFERENCES users(id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await connection.query(`
          CREATE TABLE IF NOT EXISTS audit_logs (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            user_id BIGINT UNSIGNED NULL,
            action VARCHAR(64) NOT NULL,
            target_type VARCHAR(64) NOT NULL,
            target_id VARCHAR(191) NOT NULL,
            metadata_json LONGTEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_audit_user (user_id),
            INDEX idx_audit_action (action)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        for (const plan of DEFAULT_PLANS) {
          await connection.execute(
            `
              INSERT INTO plans (code, name, max_databases, max_total_storage_mb, max_connections, price)
              VALUES (?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                max_databases = VALUES(max_databases),
                max_total_storage_mb = VALUES(max_total_storage_mb),
                max_connections = VALUES(max_connections),
                price = VALUES(price)
            `,
            [
              plan.code,
              plan.name,
              plan.maxDatabases,
              plan.maxTotalStorageMb,
              plan.maxConnections,
              plan.price,
            ],
          );
        }
      } finally {
        connection.release();
      }
    })().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }

  return bootstrapPromise;
}

async function withControlConnection<T>(
  work: (connection: PoolConnection) => Promise<T>,
) {
  await ensureBootstrap();
  const connection = await getAdminPool().getConnection();

  try {
    await connection.query(`USE ${escapeIdentifier(getAdminConfig().controlDatabase)}`);
    return await work(connection);
  } finally {
    connection.release();
  }
}

function formatPrincipal(connection: PoolConnection, username: string, hostAllow: string) {
  return connection.format("?@?", [username, hostAllow]);
}

async function appendAuditLog(
  connection: PoolConnection,
  userId: number | null,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown>,
) {
  await connection.execute(
    `
      INSERT INTO audit_logs (user_id, action, target_type, target_id, metadata_json)
      VALUES (?, ?, ?, ?, ?)
    `,
    [userId, action, targetType, targetId, JSON.stringify(metadata)],
  );
}

function assertCreateRateLimit(handle: string) {
  const config = getAdminConfig();
  const now = Date.now();
  const current = createRateLimit.get(handle);

  if (!current || now - current.windowStart >= CREATE_WINDOW_MS) {
    createRateLimit.set(handle, {
      count: 1,
      windowStart: now,
    });
    return;
  }

  if (current.count >= config.createLimitPerHour) {
    throw new DatabaseHostingError(
      "Ban tao database qua nhanh. Hay thu lai sau.",
      429,
      true,
    );
  }

  current.count += 1;
}

async function getPlanByCode(connection: PoolConnection, code: string) {
  const [rows] = await connection.execute<PlanRow[]>(
    `
      SELECT id, code, name, max_databases, max_total_storage_mb, max_connections, price
      FROM plans
      WHERE code = ?
      LIMIT 1
    `,
    [code],
  );

  if (!rows.length) {
    throw new DatabaseHostingError("Khong tim thay plan mac dinh.", 500, true);
  }

  return rows[0];
}

async function getPlanById(connection: PoolConnection, id: number) {
  const [rows] = await connection.execute<PlanRow[]>(
    `
      SELECT id, code, name, max_databases, max_total_storage_mb, max_connections, price
      FROM plans
      WHERE id = ?
      LIMIT 1
    `,
    [id],
  );

  if (!rows.length) {
    throw new DatabaseHostingError("Khong tim thay plan cua user.", 500, true);
  }

  return rows[0];
}

async function getEffectiveQuotaForUser(connection: PoolConnection, user: AppUserRow) {
  const plan = await getPlanById(connection, user.plan_id);
  const loadQuotaRows = () =>
    connection.execute<QuotaRow[]>(
      `
        SELECT max_databases, max_storage_mb, max_connections
        FROM quotas
        WHERE user_id = ?
        LIMIT 1
      `,
      [user.id],
    );

  const [rows] = await loadQuotaRows();

  if (!rows.length) {
    await connection.execute(
      `
        INSERT INTO quotas (user_id, max_databases, max_storage_mb, max_connections)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE user_id = user_id
      `,
      [user.id, plan.max_databases, plan.max_total_storage_mb, plan.max_connections],
    );

    const [persistedRows] = await loadQuotaRows();

    if (!persistedRows.length) {
      throw new DatabaseHostingError("Khong the khoi tao quota cho user.", 500, true);
    }

    return {
      planCode: plan.code,
      planName: plan.name,
      maxDatabases: persistedRows[0].max_databases,
      maxStorageMb: persistedRows[0].max_storage_mb,
      maxConnections: persistedRows[0].max_connections,
    } satisfies EffectiveQuota;
  }

  return {
    planCode: plan.code,
    planName: plan.name,
    maxDatabases: rows[0].max_databases,
    maxStorageMb: rows[0].max_storage_mb,
    maxConnections: rows[0].max_connections,
  } satisfies EffectiveQuota;
}

async function upsertPlatformUser(
  connection: PoolConnection,
  githubUser: CurrentGitHubUser,
) {
  const defaultPlan = await getPlanByCode(connection, getDefaultPlanCode());

  await connection.execute(
    `
      INSERT INTO users (github_username, email, name, plan_id)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        email = VALUES(email),
        name = VALUES(name)
    `,
    [githubUser.login, githubUser.email, githubUser.name, defaultPlan.id],
  );

  const [rows] = await connection.execute<AppUserRow[]>(
    `
      SELECT id, github_username, email, name, plan_id, created_at, updated_at
      FROM users
      WHERE github_username = ?
      LIMIT 1
    `,
    [githubUser.login],
  );

  if (!rows.length) {
    throw new DatabaseHostingError("Khong the khoi tao app user.", 500, true);
  }

  return rows[0];
}

async function getPlatformContext(request: NextRequest) {
  const githubUser = await getCurrentGitHubUser(request);

  if (!githubUser) {
    throw new DatabaseHostingError("Phien GitHub khong hop le.", 401, true);
  }

  return withControlConnection(async (connection) => {
    const user = await upsertPlatformUser(connection, githubUser);
    const plan = await getPlanById(connection, user.plan_id);
    const quota = await getEffectiveQuotaForUser(connection, user);

    return {
      user,
      github: githubUser,
      plan,
      quota,
    } satisfies PlatformContext;
  });
}

async function getDatabaseAccountByUserId(
  connection: PoolConnection,
  userId: number,
) {
  const [rows] = await connection.execute<DatabaseAccountRow[]>(
    `
      SELECT id, user_id, mysql_username, encrypted_password_reference, host_allow
      FROM database_accounts
      WHERE user_id = ?
      LIMIT 1
    `,
    [userId],
  );

  return rows[0] ?? null;
}

async function createMysqlUser(
  connection: PoolConnection,
  mysqlUsername: string,
  hostAllow: string,
  password: string,
) {
  const principal = formatPrincipal(connection, mysqlUsername, hostAllow);
  await connection.query(
    `CREATE USER IF NOT EXISTS ${principal} IDENTIFIED BY ${connection.escape(password)}`,
  );
}

async function dropMysqlUser(
  connection: PoolConnection,
  mysqlUsername: string,
  hostAllow: string,
) {
  const principal = formatPrincipal(connection, mysqlUsername, hostAllow);
  await connection.query(`DROP USER IF EXISTS ${principal}`);
}

async function createDatabase(connection: PoolConnection, databaseName: string) {
  await connection.query(
    `CREATE DATABASE ${escapeIdentifier(databaseName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
}

async function dropDatabase(connection: PoolConnection, databaseName: string) {
  await connection.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(databaseName)}`);
}

async function grantDatabasePrivileges(
  connection: PoolConnection,
  databaseName: string,
  mysqlUsername: string,
  hostAllow: string,
) {
  const principal = formatPrincipal(connection, mysqlUsername, hostAllow);
  await connection.query(
    `GRANT ${MYSQL_PRIVILEGES} ON ${escapeIdentifier(databaseName)}.* TO ${principal}`,
  );
}

async function revokeDatabasePrivileges(
  connection: PoolConnection,
  databaseName: string,
  mysqlUsername: string,
  hostAllow: string,
) {
  const principal = formatPrincipal(connection, mysqlUsername, hostAllow);
  await connection.query(
    `REVOKE ALL PRIVILEGES, GRANT OPTION ON ${escapeIdentifier(databaseName)}.* FROM ${principal}`,
  );
}

async function resetMysqlPassword(
  connection: PoolConnection,
  mysqlUsername: string,
  hostAllow: string,
  nextPassword: string,
) {
  const principal = formatPrincipal(connection, mysqlUsername, hostAllow);
  await connection.query(
    `ALTER USER ${principal} IDENTIFIED BY ${connection.escape(nextPassword)}`,
  );
}

async function getDatabaseSize(
  connection: PoolConnection,
  databaseName: string,
) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `
      SELECT ROUND(COALESCE(SUM(data_length + index_length), 0) / 1024 / 1024, 2) AS size_mb
      FROM information_schema.TABLES
      WHERE table_schema = ?
    `,
    [databaseName],
  );

  return Number(rows[0]?.size_mb || 0);
}

async function getUserDatabaseCount(connection: PoolConnection, userId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `
      SELECT COUNT(*) AS total
      FROM ${HOSTED_DATABASES_TABLE}
      WHERE user_id = ? AND deleted_at IS NULL AND status <> 'deleted'
    `,
    [userId],
  );

  return Number(rows[0]?.total || 0);
}

async function getActiveConnectionCount(
  connection: PoolConnection,
  mysqlUsername: string,
) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `
      SELECT COUNT(*) AS total
      FROM information_schema.PROCESSLIST
      WHERE USER = ?
    `,
    [mysqlUsername],
  );

  return Number(rows[0]?.total || 0);
}

async function listHostedDatabaseRows(
  connection: PoolConnection,
  userId: number,
) {
  const [rows] = await connection.execute<HostedDatabaseRow[]>(
    `
      SELECT id, user_id, db_name, real_db_name, mysql_username, host, port, status, current_size_mb, created_at, deleted_at
      FROM ${HOSTED_DATABASES_TABLE}
      WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
    `,
    [userId],
  );

  return rows;
}

async function refreshUsageStats(
  connection: PoolConnection,
  userId: number,
  mysqlUsername: string | null,
) {
  const databases = await listHostedDatabaseRows(connection, userId);
  let totalStorageMb = 0;

  for (const database of databases) {
    const sizeMb = await getDatabaseSize(connection, database.real_db_name);
    totalStorageMb += sizeMb;
    await connection.execute(
      `
        UPDATE ${HOSTED_DATABASES_TABLE}
        SET current_size_mb = ?
        WHERE id = ?
      `,
      [sizeMb, database.id],
    );
  }

  const activeConnections = mysqlUsername
    ? await getActiveConnectionCount(connection, mysqlUsername)
    : 0;

  await connection.execute(
    `
      INSERT INTO usage_stats (user_id, total_databases, total_storage_mb, active_connections)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        total_databases = VALUES(total_databases),
        total_storage_mb = VALUES(total_storage_mb),
        active_connections = VALUES(active_connections),
        updated_at = CURRENT_TIMESTAMP
    `,
    [userId, databases.length, totalStorageMb, activeConnections],
  );

  return {
    totalDatabases: databases.length,
    totalStorageMb,
    activeConnections,
  };
}

function toDatabaseListItem(row: HostedDatabaseRow) {
  return {
    id: row.id,
    displayName: row.db_name,
    realDatabaseName: row.real_db_name,
    mysqlUsername: row.mysql_username,
    host: row.host,
    port: row.port,
    status: row.status,
    currentSizeMb: Number(row.current_size_mb || 0),
    currentSizeLabel: formatStorage(Number(row.current_size_mb || 0)),
    createdAt: new Date(row.created_at).toISOString(),
  } satisfies DatabaseListItem;
}

async function getHostedDatabaseById(
  connection: PoolConnection,
  userId: number,
  databaseId: string,
) {
  const [rows] = await connection.execute<HostedDatabaseRow[]>(
    `
      SELECT id, user_id, db_name, real_db_name, mysql_username, host, port, status, current_size_mb, created_at, deleted_at
      FROM ${HOSTED_DATABASES_TABLE}
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
      LIMIT 1
    `,
    [databaseId, userId],
  );

  return rows[0] ?? null;
}

export async function listDatabasesForRequest(request: NextRequest) {
  const context = await getPlatformContext(request);

  return withControlConnection(async (connection) => {
    const account = await getDatabaseAccountByUserId(connection, context.user.id);
    await refreshUsageStats(
      connection,
      context.user.id,
      account?.mysql_username ?? null,
    );

    const databases = await listHostedDatabaseRows(connection, context.user.id);
    return databases.map(toDatabaseListItem);
  });
}

export async function getDatabaseUsageForRequest(
  request: NextRequest,
): Promise<DatabaseUsageSummary> {
  const context = await getPlatformContext(request);

  return withControlConnection(async (connection) => {
    const account = await getDatabaseAccountByUserId(connection, context.user.id);
    const usage = await refreshUsageStats(
      connection,
      context.user.id,
      account?.mysql_username ?? null,
    );
    const remaining = buildRemainingQuotaSnapshot(context.quota, usage);

    return {
      plan: {
        code: context.plan.code,
        name: context.plan.name,
        price: Number(context.plan.price),
      },
      quota: context.quota,
      usage: {
        totalDatabases: usage.totalDatabases,
        totalStorageMb: usage.totalStorageMb,
        totalStorageLabel: formatStorage(usage.totalStorageMb),
        activeConnections: usage.activeConnections,
      },
      remaining: {
        remainingDatabases: remaining.remainingDatabases,
        remainingStorageMb: remaining.remainingStorageMb,
        remainingStorageLabel: formatStorage(remaining.remainingStorageMb),
        remainingConnections: remaining.remainingConnections,
      },
    };
  });
}

export async function createHostedDatabaseForRequest(
  request: NextRequest,
  payload: {
    name: string;
  },
): Promise<CreateDatabaseResult> {
  const context = await getPlatformContext(request);
  assertCreateRateLimit(context.github.login);

  const sanitizedLabel = sanitizeDatabaseLabel(payload.name);
  const realDbName = buildRealDatabaseName(context.github.login, sanitizedLabel);
  const mysqlUsername = buildMysqlUsername(context.github.login);
  const config = getAdminConfig();

  return withControlConnection(async (connection) => {
    const existingCount = await getUserDatabaseCount(connection, context.user.id);

    if (existingCount >= context.quota.maxDatabases) {
      await appendAuditLog(connection, context.user.id, "create_denied", "database", realDbName, {
        reason: "quota_databases",
        quota: context.quota.maxDatabases,
        current: existingCount,
      });
      throw new DatabaseHostingError(
        "Ban da dung het quota database cua plan hien tai.",
        403,
        true,
      );
    }

    const [duplicates] = await connection.execute<RowDataPacket[]>(
      `
        SELECT id
        FROM ${HOSTED_DATABASES_TABLE}
        WHERE real_db_name = ? AND deleted_at IS NULL
        LIMIT 1
      `,
      [realDbName],
    );

    if (duplicates.length) {
      throw new DatabaseHostingError("Ten database nay da ton tai.", 409, true);
    }

    let account = await getDatabaseAccountByUserId(connection, context.user.id);
    let password = "";
    let accountCreated = false;

    if (!account) {
      password = generateStrongPassword();
      await createMysqlUser(connection, mysqlUsername, config.hostAllow, password);
      const encrypted = encryptSecret(password);
      await connection.execute(
        `
          INSERT INTO database_accounts (user_id, mysql_username, encrypted_password_reference, host_allow)
          VALUES (?, ?, ?, ?)
        `,
        [context.user.id, mysqlUsername, encrypted, config.hostAllow],
      );
      account = await getDatabaseAccountByUserId(connection, context.user.id);
      accountCreated = true;
    } else {
      password = decryptSecret(account.encrypted_password_reference);
    }

    if (!account) {
      throw new DatabaseHostingError("Khong the tao mysql account noi bo.", 500, true);
    }

    let databaseCreated = false;
    const databaseId = randomUUID();

    try {
      await createDatabase(connection, realDbName);
      databaseCreated = true;
      await grantDatabasePrivileges(
        connection,
        realDbName,
        account.mysql_username,
        account.host_allow,
      );

      await connection.execute(
        `
          INSERT INTO ${HOSTED_DATABASES_TABLE} (
            id,
            user_id,
            db_name,
            real_db_name,
            mysql_username,
            host,
            port,
            status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
        `,
        [
          databaseId,
          context.user.id,
          sanitizedLabel,
          realDbName,
          account.mysql_username,
          config.connectHost,
          config.connectPort,
        ],
      );

      const usage = await refreshUsageStats(
        connection,
        context.user.id,
        account.mysql_username,
      );

      if (usage.totalStorageMb > context.quota.maxStorageMb) {
        throw new DatabaseHostingError(
          "Quota dung luong cua plan da bi vuot qua.",
          403,
          true,
        );
      }

      await appendAuditLog(connection, context.user.id, "database_created", "database", databaseId, {
        dbName: sanitizedLabel,
        realDbName,
        mysqlUsername: account.mysql_username,
        host: config.connectHost,
        port: config.connectPort,
        accountCreated,
      });

      const database = await getHostedDatabaseById(connection, context.user.id, databaseId);

      if (!database) {
        throw new DatabaseHostingError("Khong the doc lai metadata database moi tao.", 500, true);
      }

      return {
        database: toDatabaseListItem(database),
        connection: {
          host: config.connectHost,
          port: config.connectPort,
          database: realDbName,
          username: account.mysql_username,
          password,
          databaseUrl: `mysql://${account.mysql_username}:${encodeURIComponent(password)}@${config.connectHost}:${config.connectPort}/${realDbName}`,
        },
        passwordWasCreated: accountCreated,
      };
    } catch (error) {
      if (databaseCreated) {
        try {
          await revokeDatabasePrivileges(
            connection,
            realDbName,
            account.mysql_username,
            account.host_allow,
          );
        } catch {
          // ignore cleanup failure
        }

        try {
          await dropDatabase(connection, realDbName);
        } catch {
          // ignore cleanup failure
        }
      }

      if (accountCreated) {
        try {
          await dropMysqlUser(connection, mysqlUsername, config.hostAllow);
          await connection.execute(
            `
              DELETE FROM database_accounts
              WHERE user_id = ?
            `,
            [context.user.id],
          );
        } catch {
          // ignore cleanup failure
        }
      }

      await appendAuditLog(
        connection,
        context.user.id,
        "database_create_failed",
        "database",
        realDbName,
        {
          dbName: sanitizedLabel,
          mysqlUsername,
          error:
            error instanceof Error ? error.message : "unknown_error",
        },
      );

      throw error;
    }
  });
}

export async function getDatabaseConnectionForRequest(
  request: NextRequest,
  databaseId: string,
): Promise<ConnectionInfoPayload> {
  const context = await getPlatformContext(request);
  const config = getAdminConfig();

  return withControlConnection(async (connection) => {
    const database = await getHostedDatabaseById(connection, context.user.id, databaseId);

    if (!database) {
      throw new DatabaseHostingError("Khong tim thay database.", 404, true);
    }

    const account = await getDatabaseAccountByUserId(connection, context.user.id);

    if (!account) {
      throw new DatabaseHostingError("Khong tim thay mysql account cua user.", 404, true);
    }

    const password = decryptSecret(account.encrypted_password_reference);

    await appendAuditLog(connection, context.user.id, "database_connection_viewed", "database", database.id, {
      realDbName: database.real_db_name,
      mysqlUsername: account.mysql_username,
    });

    return {
      host: config.connectHost,
      port: config.connectPort,
      database: database.real_db_name,
      username: account.mysql_username,
      password,
      databaseUrl: `mysql://${account.mysql_username}:${encodeURIComponent(password)}@${config.connectHost}:${config.connectPort}/${database.real_db_name}`,
    };
  });
}

export async function resetDatabasePasswordForRequest(
  request: NextRequest,
  databaseId: string,
): Promise<PasswordResetResult> {
  const context = await getPlatformContext(request);

  return withControlConnection(async (connection) => {
    const database = await getHostedDatabaseById(connection, context.user.id, databaseId);

    if (!database) {
      throw new DatabaseHostingError("Khong tim thay database.", 404, true);
    }

    const account = await getDatabaseAccountByUserId(connection, context.user.id);

    if (!account) {
      throw new DatabaseHostingError("Khong tim thay mysql account cua user.", 404, true);
    }

    const nextPassword = generateStrongPassword();
    await resetMysqlPassword(
      connection,
      account.mysql_username,
      account.host_allow,
      nextPassword,
    );
    await connection.execute(
      `
        UPDATE database_accounts
        SET encrypted_password_reference = ?
        WHERE id = ?
      `,
      [encryptSecret(nextPassword), account.id],
    );
    await appendAuditLog(connection, context.user.id, "database_password_reset", "database", database.id, {
      mysqlUsername: account.mysql_username,
      realDbName: database.real_db_name,
    });

    return {
      mysqlUsername: account.mysql_username,
      password: nextPassword,
    };
  });
}

export async function deleteHostedDatabaseForRequest(
  request: NextRequest,
  databaseId: string,
) {
  const context = await getPlatformContext(request);

  return withControlConnection(async (connection) => {
    const database = await getHostedDatabaseById(connection, context.user.id, databaseId);

    if (!database) {
      throw new DatabaseHostingError("Khong tim thay database.", 404, true);
    }

    const account = await getDatabaseAccountByUserId(connection, context.user.id);

    if (!account) {
      throw new DatabaseHostingError("Khong tim thay mysql account cua user.", 404, true);
    }

    await revokeDatabasePrivileges(
      connection,
      database.real_db_name,
      account.mysql_username,
      account.host_allow,
    );
    await dropDatabase(connection, database.real_db_name);
    await connection.execute(
      `
        UPDATE ${HOSTED_DATABASES_TABLE}
        SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [database.id],
    );

    const remainingCount = await getUserDatabaseCount(connection, context.user.id);

    if (remainingCount === 0) {
      await dropMysqlUser(connection, account.mysql_username, account.host_allow);
      await connection.execute(
        `
          DELETE FROM database_accounts
          WHERE id = ?
        `,
        [account.id],
      );
    }

    await refreshUsageStats(
      connection,
      context.user.id,
      remainingCount === 0 ? null : account.mysql_username,
    );
    await appendAuditLog(connection, context.user.id, "database_deleted", "database", database.id, {
      realDbName: database.real_db_name,
      mysqlUsername: account.mysql_username,
      droppedMysqlUser: remainingCount === 0,
    });

    return {
      id: database.id,
      realDatabaseName: database.real_db_name,
    };
  });
}

export async function suspendUserDatabases(userId: number) {
  return withControlConnection(async (connection) => {
    const [userRows] = await connection.execute<AppUserRow[]>(
      `
        SELECT id, github_username, email, name, plan_id, created_at, updated_at
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [userId],
    );

    if (!userRows.length) {
      throw new DatabaseHostingError("Khong tim thay user de suspend.", 404, true);
    }

    const account = await getDatabaseAccountByUserId(connection, userId);

    if (!account) {
      return { suspended: 0 };
    }

    const databases = await listHostedDatabaseRows(connection, userId);

    for (const database of databases) {
      await revokeDatabasePrivileges(
        connection,
        database.real_db_name,
        account.mysql_username,
        account.host_allow,
      );
      await connection.execute(
        `
          UPDATE ${HOSTED_DATABASES_TABLE}
          SET status = 'suspended'
          WHERE id = ?
        `,
        [database.id],
      );
    }

    await appendAuditLog(connection, userId, "user_databases_suspended", "user", String(userId), {
      count: databases.length,
      mysqlUsername: account.mysql_username,
    });

    return {
      suspended: databases.length,
    };
  });
}

export function toSafeErrorResponse(error: unknown) {
  if (error instanceof DatabaseHostingError) {
    return {
      status: error.status,
      message: error.message,
    };
  }

  return {
    status: 500,
    message: "Loi noi bo khi xu ly Database Hosting.",
  };
}
