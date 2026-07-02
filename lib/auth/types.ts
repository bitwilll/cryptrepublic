export const KYC_STATUSES = ["NONE", "PENDING", "APPROVED", "REJECTED"] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

export const USER_ROLES = ["USER", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const APPLICATION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "MINTED",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const CHAIN_FAMILIES = ["EVM"] as const; // v1: EVM only for LinkedWallet
export type ChainFamily = (typeof CHAIN_FAMILIES)[number];
