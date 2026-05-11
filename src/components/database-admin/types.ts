export interface AdminDatabasePlanItem {
  id: number;
  code: string;
  name: string;
  price: number;
  maxDatabases: number;
  maxStorageMb: number;
  maxConnections: number;
}

export interface AdminDatabaseUserItem {
  id: number;
  githubUsername: string;
  email: string | null;
  name: string | null;
  createdAt: string;
  updatedAt: string;
  plan: {
    id: number;
    code: string;
    name: string;
    price: number;
  };
  quota: {
    maxDatabases: number;
    maxStorageMb: number;
    maxConnections: number;
    isCustomized: boolean;
  };
  usage: {
    totalDatabases: number;
    totalStorageMb: number;
    totalStorageLabel: string;
    activeConnections: number;
  };
  databaseCount: number;
  databaseNames: string[];
  mysqlAccount: {
    username: string;
    hostAllow: string;
  } | null;
}

export interface AdminDatabaseOverviewPayload {
  accessMode: "allowlist" | "development-open";
  allowedAdmins: string[];
  plans: AdminDatabasePlanItem[];
  users: AdminDatabaseUserItem[];
}
