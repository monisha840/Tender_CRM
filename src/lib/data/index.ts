/**
 * Data access for the front-end MVP. Every function is a pure read over a `Database` snapshot
 * (the Zustand store holds it), so screens call e.g. `listTenders(db, { region })`.
 * When a backend arrives, these signatures become async queries and the screens barely change.
 */
export * from "./shared";
export * from "./access";
export * from "./links";
export * from "./tenders";
export * from "./projects";
export * from "./sites";
export * from "./workforce";
export * from "./parties";
export * from "./purchases";
export * from "./accounts";
export * from "./gst";
export * from "./approvals";
export * from "./notifications";
export * from "./dashboard";
