// Server-only: Prisma loaders for the organisation slice of `Database`.
// Same table shapes as the mock seed (src/types/org.ts); soft-deleted rows are excluded.
//
// Mapping notes (Prisma -> UI type)
//  - Date columns (@db.Date) -> "YYYY-MM-DD"; timestamps -> ISO UTC; version/createdById/updatedById are dropped.
//  - Optional columns keep `null` (never undefined), as the UI types allow `| null`.
//  - Order is stable (createdAt, id) so snapshots and tests are deterministic.
import type {
  GstRegistration as PGst,
  Office as POffice,
  Organisation as POrganisation,
  PrismaClient,
  Region as PRegion,
  RegionGstRegistration as PRegionGst,
  ServiceLine as PServiceLine,
  State as PState,
} from "@prisma/client";
import type { Database, GstRegistration, Office, Organisation, Region, RegionGstRegistration, ServiceLine, State } from "@/types";
import { base, isoDateOrNull, LIVE, STABLE_ORDER } from "./map-common";

export const mapState = (r: PState): State => ({ ...base(r), code: r.code, name: r.name, gstStateCode: r.gstStateCode });

export const mapRegion = (r: PRegion): Region => ({ ...base(r), name: r.name, code: r.code, stateId: r.stateId, isActive: r.isActive });

export const mapOffice = (r: POffice): Office => ({ ...base(r), regionId: r.regionId, name: r.name, kind: r.kind, address: r.address });

export const mapServiceLine = (r: PServiceLine): ServiceLine => ({
  ...base(r),
  name: r.name,
  defaultUnit: r.defaultUnit,
  isActive: r.isActive,
});

export const mapGstRegistration = (r: PGst): GstRegistration => ({
  ...base(r),
  gstin: r.gstin,
  legalName: r.legalName,
  tradeName: r.tradeName,
  stateId: r.stateId,
  panNumber: r.panNumber,
  address: r.address,
  validFrom: isoDateOrNull(r.validFrom),
  validTo: isoDateOrNull(r.validTo),
  isActive: r.isActive,
});

export const mapRegionGstRegistration = (r: PRegionGst): RegionGstRegistration => ({
  ...base(r),
  regionId: r.regionId,
  gstRegistrationId: r.gstRegistrationId,
  isDefault: r.isDefault,
  validFrom: isoDateOrNull(r.validFrom),
  validTo: isoDateOrNull(r.validTo),
});

export const mapOrganisation = (r: POrganisation): Organisation => ({
  ...base(r),
  name: r.name,
  shortName: r.shortName,
  gstin: r.gstin,
  address: r.address,
  stateId: r.stateId,
  parentId: r.parentId,
});

export type OrgSlice = Pick<
  Database,
  "states" | "regions" | "offices" | "serviceLines" | "gstRegistrations" | "regionGstRegistrations" | "organisations"
>;

/** Org tables are reference data shared by everyone, so they are loaded unscoped. */
export async function loadOrg(prisma: PrismaClient): Promise<OrgSlice> {
  const args = { where: LIVE, orderBy: STABLE_ORDER };
  const [states, regions, offices, serviceLines, gst, regionGst, organisations] = await Promise.all([
    prisma.state.findMany(args),
    prisma.region.findMany(args),
    prisma.office.findMany(args),
    prisma.serviceLine.findMany(args),
    prisma.gstRegistration.findMany(args),
    prisma.regionGstRegistration.findMany(args),
    prisma.organisation.findMany(args),
  ]);
  return {
    states: states.map(mapState),
    regions: regions.map(mapRegion),
    offices: offices.map(mapOffice),
    serviceLines: serviceLines.map(mapServiceLine),
    gstRegistrations: gst.map(mapGstRegistration),
    regionGstRegistrations: regionGst.map(mapRegionGstRegistration),
    organisations: organisations.map(mapOrganisation),
  };
}
