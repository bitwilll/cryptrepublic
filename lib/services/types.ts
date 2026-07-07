/**
 * Wave 15 — string-union types for the citizen-services models
 * (prisma keeps String columns for SQLite/Postgres portability; these unions
 * are the app-level source of truth, mirroring lib/auth/types.ts conventions).
 */

export const STORE_CATEGORIES = ["GOODS", "SERVICES", "COLLECTIBLES", "OTHER"] as const;
export type StoreCategory = (typeof STORE_CATEGORIES)[number];

export const LISTING_STATUSES = ["ACTIVE", "SOLD", "WITHDRAWN", "REMOVED"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const INQUIRY_STATUSES = ["OPEN", "ANSWERED", "CLOSED"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const CERTIFICATE_KINDS = ["MESSAGE", "DOCUMENT"] as const;
export type CertificateKind = (typeof CERTIFICATE_KINDS)[number];

export const DIRECTIVE_STATUSES = ["ACTIVE", "REVOKED", "SUPERSEDED"] as const;
export type DirectiveStatus = (typeof DIRECTIVE_STATUSES)[number];

export const INSURANCE_PRODUCTS = ["ASSET", "HEALTH"] as const;
export type InsuranceProduct = (typeof INSURANCE_PRODUCTS)[number];

export const INSURANCE_STATUSES = ["SUBMITTED", "IN_REVIEW", "APPROVED", "DECLINED"] as const;
export type InsuranceStatus = (typeof INSURANCE_STATUSES)[number];

export function isStoreCategory(v: string): v is StoreCategory {
  return (STORE_CATEGORIES as readonly string[]).includes(v);
}
export function isInsuranceProduct(v: string): v is InsuranceProduct {
  return (INSURANCE_PRODUCTS as readonly string[]).includes(v);
}
