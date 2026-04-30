export interface HostedDatabaseItem {
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

export interface DatabaseConnectionInfo {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  databaseUrl: string;
}

export interface DatabaseUsagePayload {
  plan: {
    code: string;
    name: string;
    price: number;
  };
  quota: {
    planCode: string;
    planName: string;
    maxDatabases: number;
    maxStorageMb: number;
    maxConnections: number;
  };
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
