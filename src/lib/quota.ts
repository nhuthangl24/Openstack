export interface PlanDefinition {
  code: "free" | "pro" | "business";
  name: string;
  maxDatabases: number;
  maxTotalStorageMb: number;
  maxConnections: number;
  price: number;
}

export interface EffectiveQuota {
  planCode: string;
  planName: string;
  maxDatabases: number;
  maxStorageMb: number;
  maxConnections: number;
}

export const DEFAULT_PLANS: PlanDefinition[] = [
  {
    code: "free",
    name: "Free",
    maxDatabases: 1,
    maxTotalStorageMb: 1024,
    maxConnections: 10,
    price: 0,
  },
  {
    code: "pro",
    name: "Pro",
    maxDatabases: 5,
    maxTotalStorageMb: 20 * 1024,
    maxConnections: 40,
    price: 12,
  },
  {
    code: "business",
    name: "Business",
    maxDatabases: 20,
    maxTotalStorageMb: 100 * 1024,
    maxConnections: 120,
    price: 49,
  },
];

export function getDefaultPlanCode() {
  const requested = (process.env.DATABASE_HOSTING_DEFAULT_PLAN || "free").toLowerCase();
  return DEFAULT_PLANS.some((plan) => plan.code === requested)
    ? (requested as PlanDefinition["code"])
    : "free";
}

export function formatStorage(valueMb: number) {
  if (valueMb >= 1024) {
    return `${(valueMb / 1024).toFixed(1)} GB`;
  }

  return `${valueMb.toFixed(1)} MB`;
}

export function buildRemainingQuotaSnapshot(
  quota: EffectiveQuota,
  usage: {
    totalDatabases: number;
    totalStorageMb: number;
    activeConnections: number;
  },
) {
  return {
    remainingDatabases: Math.max(quota.maxDatabases - usage.totalDatabases, 0),
    remainingStorageMb: Math.max(quota.maxStorageMb - usage.totalStorageMb, 0),
    remainingConnections: Math.max(
      quota.maxConnections - usage.activeConnections,
      0,
    ),
  };
}
