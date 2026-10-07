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

/** Government department / client. `parentId` models e.g. PWD -> Division. */
export interface Client extends BaseEntity {
  name: string;
  gstin?: string | null;
  address?: string | null;
  stateId: Id;
  parentId?: Id | null;
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
