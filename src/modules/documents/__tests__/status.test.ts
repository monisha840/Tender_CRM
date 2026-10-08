import { describe, expect, it } from "vitest";
import { blockingIssues, checkRequiredDocs, documentStatus, packNotes, soonWindow, submissionBlockMessage, unpackNotes } from "../status";

const TODAY = "2026-10-08";

describe("documentStatus", () => {
  it("no expiry is valid", () => expect(documentStatus(null, TODAY)).toBe("VALID"));
  it("past expiry is expired", () => expect(documentStatus("2026-10-07", TODAY)).toBe("EXPIRED"));
  it("expiring today is still expiring, not expired", () => expect(documentStatus(TODAY, TODAY, 60)).toBe("EXPIRING"));
  it("within the window is expiring soon", () => expect(documentStatus("2026-12-07", TODAY, 60)).toBe("EXPIRING"));
  it("just outside the window is valid", () => expect(documentStatus("2026-12-08", TODAY, 60)).toBe("VALID"));
});

describe("soonWindow", () => {
  it("uses the largest configured period", () => expect(soonWindow([30, 90, 7])).toBe(90));
  it("falls back to the default [60,30,7]", () => {
    expect(soonWindow(undefined)).toBe(60);
    expect(soonWindow([])).toBe(60);
  });
});

describe("checkRequiredDocs (expired by submission date)", () => {
  const req = [{ documentTypeId: "iso", name: "ISO certificate" }, { documentTypeId: "gst", name: "GST certificate" }];

  it("flags a document that expires before the submission date", () => {
    const issues = checkRequiredDocs(req, [{ documentTypeId: "iso", expiryDate: "2026-11-01" }, { documentTypeId: "gst", expiryDate: null }], "2026-11-15", TODAY);
    expect(issues).toEqual([{ documentTypeId: "iso", name: "ISO certificate", kind: "EXPIRES_BEFORE_SUBMISSION", expiryDate: "2026-11-01" }]);
  });
  it("flags an already expired document", () => {
    const issues = checkRequiredDocs(req, [{ documentTypeId: "iso", expiryDate: "2026-01-01" }, { documentTypeId: "gst", expiryDate: null }], "2026-11-15", TODAY);
    expect(issues[0].kind).toBe("EXPIRED");
    expect(blockingIssues(issues)).toHaveLength(1);
  });
  it("expiring on the submission day is fine", () => {
    expect(checkRequiredDocs(req.slice(0, 1), [{ documentTypeId: "iso", expiryDate: "2026-11-15" }], "2026-11-15", TODAY)).toEqual([]);
  });
  it("the latest-expiring vault document of a type counts (a renewal covers the old one)", () => {
    const vault = [{ documentTypeId: "iso", expiryDate: "2026-01-01" }, { documentTypeId: "iso", expiryDate: "2027-01-01" }];
    expect(checkRequiredDocs(req.slice(0, 1), vault, "2026-11-15", TODAY)).toEqual([]);
  });
  it("a missing document is reported but does not block", () => {
    const issues = checkRequiredDocs(req.slice(0, 1), [], "2026-11-15", TODAY);
    expect(issues[0].kind).toBe("MISSING");
    expect(blockingIssues(issues)).toEqual([]);
    expect(submissionBlockMessage(issues)).toBeNull();
  });
  it("a past submission date is checked against today", () => {
    const issues = checkRequiredDocs(req.slice(0, 1), [{ documentTypeId: "iso", expiryDate: "2026-10-01" }], "2026-09-01", TODAY);
    expect(issues[0].kind).toBe("EXPIRED");
  });
  it("block message lists every blocking document", () => {
    const msg = submissionBlockMessage(checkRequiredDocs(req, [{ documentTypeId: "iso", expiryDate: "2026-01-01" }, { documentTypeId: "gst", expiryDate: "2026-10-20" }], "2026-11-15", TODAY));
    expect(msg).toContain("ISO certificate");
    expect(msg).toContain("GST certificate");
    expect(msg).toContain("Submitted");
  });
});

describe("notes packing (file placeholder)", () => {
  it("round-trips file reference and notes", () => {
    expect(unpackNotes(packNotes("iso.pdf", "renew in March"))).toEqual({ fileRef: "iso.pdf", notes: "renew in March" });
    expect(unpackNotes(packNotes(null, "just notes"))).toEqual({ fileRef: null, notes: "just notes" });
    expect(packNotes(null, null)).toBeNull();
  });
});
