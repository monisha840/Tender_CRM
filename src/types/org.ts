import type { BaseEntity, Id, IsoDate } from "./common";

export interface State extends BaseEntity {
  code: string;
  name: string;
  gstStateCode: string;
}

export interface Region extends BaseEntity {
  name: string;
  code: string;
  stateId: Id;
  isActive: boolean;
}

export interface GstRegistration extends BaseEntity {
  gstin: string;
  legalName: string;
  tradeName?: string | null;
  stateId: Id;
  panNumber: string;
  address: string;
  validFrom?: IsoDate | null;
  validTo?: IsoDate | null;
  isActive: boolean;
}

/** Many-to-many: a region can hold several GSTINs, a GSTIN can serve several regions. */
export interface RegionGstRegistration extends BaseEntity {
  regionId: Id;
  gstRegistrationId: Id;
  isDefault: boolean;
  validFrom?: IsoDate | null;
  validTo?: IsoDate | null;
}

/** A customer organisation (power utility, PSU). Referenced by tenders, projects and invoices. */
export interface Organisation extends BaseEntity {
  name: string;
  /** Short code used in numbering and labels, e.g. "NTPC". */
  shortName: string;
  gstin?: string | null;
  address?: string | null;
  stateId: Id;
  parentId?: Id | null;
}

export type OfficeKind = "REGISTERED" | "BRANCH" | "REGIONAL" | "SITE_OFFICE";

export interface Office extends BaseEntity {
  regionId: Id;
  name: string;
  kind: OfficeKind;
  address: string;
}

/** Configurable list of what the company sells (tenders and projects reference it). */
export interface ServiceLine extends BaseEntity {
  name: string;
  /** Default measurement unit for BOQ items: "man-day", "sq m", "running metre", "MT". */
  defaultUnit: string;
  isActive: boolean;
}

/** MVP: identity only. No auth, roles or permissions yet. */
export interface User extends BaseEntity {
  name: string;
  email: string;
  isActive: boolean;
}

/** MVP: the minimum needed to name a project manager. */
export interface Employee extends BaseEntity {
  code: string;
  name: string;
  phone?: string | null;
  homeRegionId: Id;
  userId?: Id | null;
}
