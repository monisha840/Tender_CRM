import type { BaseEntity, Id, IsoDateTime } from "./common";

export interface Document extends BaseEntity {
  storageKey: string;
  fileName: string;
  mime: string;
  size: number;
  documentTypeId?: Id | null;
  version: number;
  uploadedById: Id;
}

/** One file can be linked to a tender and later to its project (no copy). */
export interface DocumentLink extends BaseEntity {
  documentId: Id;
  entityType: string;
  entityId: Id;
}

/** Feeds the dashboard "Attention" area and alerts. */
export interface Notification extends BaseEntity {
  userId: Id;
  type: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: Id | null;
  readAt?: IsoDateTime | null;
  dedupeKey?: string | null;
}
