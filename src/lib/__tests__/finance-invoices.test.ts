/**
 * Wave A, finance agent: invoice builder, numbering, seed GSTINs and subcontractor registration checks.
 * Covers B1, B4, B5, B6, B7, B17, B18.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { buildSeedDatabase } from "@/lib/data/seed";
import { gstinError, gstinStateCode, isValidGstin, isValidPan, makeGstin } from "@/lib/gst-validation";
import { sumMoney } from "@/lib/money";
import { buildInvoice, defaultGstRegistrationId, resolveInvoiceRecord, suggestInvoiceNo, type InvoiceEntry } from "@/modules/finance/entry";
import { fyCode, invoiceNoError, MAX_INVOICE_NO_LENGTH } from "@/modules/finance/numbering";
import { buildSubcontractor, buildSubcontractors } from "@/modules/subcontractors/entry";
import type { Database, Invoice, Project } from "@/types";

let db: Database;
beforeAll(() => {
  db = buildSeedDatabase();
});

const live = () => db.projects.filter((p) => !p.deletedAt);
const supplyState = (p: Project) => db.sites.find((s) => s.id === p.siteId)?.stateId ?? db.organisations.find((o) => o.id === p.organisationId)!.stateId;
const regOf = (p: Project) => db.gstRegistrations.find((g) => g.id === p.gstRegistrationId)!;
const intraProject = () => live().find((p) => regOf(p).stateId === supplyState(p))!;
const interProject = () => live().find((p) => regOf(p).stateId !== supplyState(p))!;

function entryOf(p: Project, over: Partial<InvoiceEntry> = {}): InvoiceEntry {
  return {
    gstRegistrationId: p.gstRegistrationId,
    organisationId: p.organisationId,
    projectId: p.id,
    invoiceNo: "TEST/0001",
    invoiceDate: "2026-10-07",
    invoiceType: "MONTHLY",
    periodFrom: "2026-09-01",
    periodTo: "2026-09-30",
    taxableValue: "100000.00",
    gstPercent: "18",
    deductions: "",
    deductionTypeId: "",
    ...over,
  };
}
const ok = (r: ReturnType<typeof buildInvoice>) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe("B1: every organisation and invoice carries a valid GSTIN", () => {
  it("seed has at least one intra-state and one inter-state project (so the tests below are not vacuous)", () => {
    expect(intraProject()).toBeDefined();
    expect(interProject()).toBeDefined();
  });
  it("our four GSTINs are valid and match their registered state", () => {
    expect(db.gstRegistrations).toHaveLength(4);
    for (const g of db.gstRegistrations) {
      expect(gstinError(g.gstin), g.gstin).toBeNull();
      expect(gstinStateCode(g.gstin), g.gstin).toBe(db.states.find((s) => s.id === g.stateId)!.gstStateCode);
      expect(g.gstin.slice(2, 12)).toBe(g.panNumber);
    }
  });
  it("every seeded organisation has a valid GSTIN in its own state", () => {
    for (const o of db.organisations) {
      expect(o.gstin, o.name).toBeTruthy();
      expect(gstinError(o.gstin!), o.name).toBeNull();
      expect(gstinStateCode(o.gstin!), o.name).toBe(db.states.find((s) => s.id === o.stateId)!.gstStateCode);
    }
  });
  it("every seeded invoice has a valid customer GSTIN in the plant state and never 'UNREGISTERED'", () => {
    for (const i of db.invoices) {
      expect(i.customerGstin, i.invoiceNo).not.toBe("UNREGISTERED");
      expect(gstinError(i.customerGstin), `${i.invoiceNo} ${i.customerGstin}`).toBeNull();
    }
  });
  it("a new invoice takes the customer's GSTIN (plant-state one when it differs) and is never 'UNREGISTERED'", () => {
    const p = interProject();
    const r = ok(buildInvoice(db, entryOf(p)));
    expect(isValidGstin(r.invoice.customerGstin)).toBe(true);
    const org = db.organisations.find((o) => o.id === p.organisationId)!;
    expect(r.invoice.customerGstin.slice(2, 12)).toBe(org.gstin!.slice(2, 12)); // same PAN
    const pos = db.states.find((s) => s.id === supplyState(p))!;
    expect(gstinStateCode(r.invoice.customerGstin)).toBe(pos.gstStateCode);
    expect(r.gstTransaction.partyGstin).toBe(r.invoice.customerGstin);
  });
  it("refuses to invoice a customer without a GSTIN, or with an invalid one", () => {
    const p = interProject();
    const noGstin: Database = { ...db, organisations: db.organisations.map((o) => (o.id === p.organisationId ? { ...o, gstin: null } : o)) };
    const r = buildInvoice(noGstin, entryOf(p));
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.error).toMatch(/no GSTIN/);
    const bad: Database = { ...db, organisations: db.organisations.map((o) => (o.id === p.organisationId ? { ...o, gstin: "27AAPFU0939F1ZA" } : o)) };
    expect(buildInvoice(bad, entryOf(p))).toMatchObject({ ok: false });
  });
});

describe("B4: invoice numbers", () => {
  const regId = "gst_mh";
  const base = (): Invoice => db.invoices.find((i) => i.gstRegistrationId === regId)!;
  const withNos = (nos: string[]): Database => ({ ...db, invoices: nos.map((invoiceNo, k) => ({ ...base(), id: `t${k}`, invoiceNo, deletedAt: null })) });

  it("seeded invoice numbers are at most 16 characters and unique within a GSTIN", () => {
    const seen = new Set<string>();
    for (const i of db.invoices) {
      expect(i.invoiceNo.length, i.invoiceNo).toBeLessThanOrEqual(MAX_INVOICE_NO_LENGTH);
      expect(invoiceNoError(i.invoiceNo), i.invoiceNo).toBeNull();
      const k = `${i.gstRegistrationId}|${i.invoiceNo}`;
      expect(seen.has(k), k).toBe(false);
      seen.add(k);
    }
  });
  it("seeded series: one per GSTIN per financial year, consecutive from 0001 in date order", () => {
    const groups = new Map<string, Invoice[]>();
    for (const i of db.invoices) groups.set(`${i.gstRegistrationId}|${fyCode(i.invoiceDate)}`, [...(groups.get(`${i.gstRegistrationId}|${fyCode(i.invoiceDate)}`) ?? []), i]);
    expect(groups.size).toBeGreaterThan(4); // more than one FY seeded
    for (const [key, list] of groups) {
      const seqs = list.map((i) => Number(i.invoiceNo.split("/").pop())).sort((a, b) => a - b);
      expect(seqs, key).toEqual(seqs.map((_, k) => k + 1));
      expect(new Set(list.map((i) => i.invoiceNo.split("/").slice(0, 3).join("/"))).size, key).toBe(1);
    }
  });
  it("suggested numbers are at most 16 characters", () => {
    for (const g of db.gstRegistrations) expect(suggestInvoiceNo(db, g.id, "2026-10-07").length).toBeLessThanOrEqual(MAX_INVOICE_NO_LENGTH);
  });
  it("rejects a number over 16 characters or with illegal characters", () => {
    const p = interProject();
    expect(buildInvoice(db, entryOf(p, { invoiceNo: "SPH/MH/2025-26/0001" }))).toMatchObject({ ok: false });
    expect(buildInvoice(db, entryOf(p, { invoiceNo: "A".repeat(16) }))).toMatchObject({ ok: true });
    expect(buildInvoice(db, entryOf(p, { invoiceNo: "INV #1" }))).toMatchObject({ ok: false });
  });
  it("'latest' is chosen numerically, so …/999 is followed by …/1000 and …/1000 by …/1001", () => {
    expect(suggestInvoiceNo(withNos(["SPH/MH/2627/999", "SPH/MH/2627/1000", "SPH/MH/2627/0123"]), regId, "2026-10-07")).toBe("SPH/MH/2627/1001");
    expect(suggestInvoiceNo(withNos(["SPH/MH/2627/0998", "SPH/MH/2627/0999"]), regId, "2026-10-07")).toBe("SPH/MH/2627/1000");
  });
  it("the series restarts at 0001 on 1 April and continues until 31 March", () => {
    const d = withNos(["SPH/MH/2526/0419", "SPH/MH/2526/0420"]);
    expect(suggestInvoiceNo(d, regId, "2026-03-31")).toBe("SPH/MH/2526/0421");
    expect(suggestInvoiceNo(d, regId, "2026-04-01")).toBe("SPH/MH/2627/0001");
    expect(suggestInvoiceNo(d, regId, "2027-03-31")).toBe("SPH/MH/2627/0001");
    expect(suggestInvoiceNo(d, regId, "2027-04-01")).toBe("SPH/MH/2728/0001");
  });
  it("series are separate per GSTIN", () => {
    const d = withNos(["SPH/MH/2627/0005"]);
    expect(suggestInvoiceNo(d, "gst_tn", "2026-10-07")).toBe("SPH/TN/2627/0001");
  });
  it("ignores soft-deleted invoices and numbers already used in the same import", () => {
    const d = withNos(["SPH/MH/2627/0005"]);
    d.invoices[0].deletedAt = "2026-10-01T00:00:00.000Z";
    expect(suggestInvoiceNo(d, regId, "2026-10-07")).toBe("SPH/MH/2627/0001");
    expect(suggestInvoiceNo(d, regId, "2026-10-07", [`${regId}|sph/mh/2627/0001`, `${regId}|sph/mh/2627/0002`])).toBe("SPH/MH/2627/0003");
  });
  it("a CSV import with blank numbers gets consecutive numbers", () => {
    const p = interProject();
    const org = db.organisations.find((o) => o.id === p.organisationId)!;
    const row = { Customer: org.name, Project: p.code, GSTIN: "", "Invoice date": "07-10-2026", "Taxable value": "1000" };
    const pending: string[] = [];
    const nos: string[] = [];
    for (let k = 0; k < 3; k++) {
      const { entry, error } = resolveInvoiceRecord(db, row, pending);
      expect(error).toBeUndefined();
      const built = ok(buildInvoice(db, entry!, pending));
      pending.push(`${entry!.gstRegistrationId}|${built.invoice.invoiceNo.toLowerCase()}`);
      nos.push(built.invoice.invoiceNo);
    }
    expect(new Set(nos).size).toBe(3);
  });
});

describe("B5: dates", () => {
  const p = () => interProject();
  it("rejects impossible dates instead of rolling them over", () => {
    for (const bad of ["2026-02-30", "30-02-2026", "2026-13-01", "2026-04-31", "2026-02-29", "29/02/2026", "0000-00-00"])
      expect(buildInvoice(db, entryOf(p(), { invoiceDate: bad })), bad).toMatchObject({ ok: false });
    expect(buildInvoice(db, entryOf(p(), { periodFrom: "2026-02-30" }))).toMatchObject({ ok: false });
    expect(buildInvoice(db, entryOf(p(), { periodTo: "31-06-2026" }))).toMatchObject({ ok: false });
    // an invalid period date must fail on its own, not by accident of ordering against the invoice-date default
    expect(buildInvoice(db, entryOf(p(), { invoiceDate: "2026-12-01", periodFrom: "", periodTo: "31-06-2026" }))).toMatchObject({ ok: false });
    expect(buildInvoice(db, entryOf(p(), { invoiceDate: "2026-01-01", periodFrom: "2026-02-30", periodTo: "" }))).toMatchObject({ ok: false });
  });
  it("accepts YYYY-MM-DD and DD-MM-YYYY (also with '/') and stores ISO", () => {
    for (const good of ["2026-10-07", "07-10-2026", "7/10/2026", "2026/10/07"]) {
      const r = ok(buildInvoice(db, entryOf(p(), { invoiceDate: good, periodFrom: "", periodTo: "" }), []));
      expect(r.invoice.invoiceDate, good).toBe("2026-10-07");
      expect(r.invoice.periodFrom).toBe("2026-10-07");
      expect(r.invoice.gstFilingDueDate).toBe("2026-11-11");
    }
    expect(ok(buildInvoice(db, entryOf(p(), { invoiceDate: "29-02-2028", periodFrom: "01-02-2028", periodTo: "2028-02-29" }))).invoice.invoiceDate).toBe("2028-02-29");
  });
  it("requires an invoice date", () => {
    expect(buildInvoice(db, entryOf(p(), { invoiceDate: "" }))).toMatchObject({ ok: false });
  });
  it("the CSV path accepts DD-MM-YYYY like the other importers", () => {
    const proj = p();
    const org = db.organisations.find((o) => o.id === proj.organisationId)!;
    const { entry } = resolveInvoiceRecord(db, { Customer: org.name, Project: proj.code, "Invoice date": "07-10-2026", "Period from": "01-09-2026", "Period to": "30-09-2026", "Taxable value": "5000" });
    const r = ok(buildInvoice(db, entry!));
    expect(r.invoice).toMatchObject({ invoiceDate: "2026-10-07", periodFrom: "2026-09-01", periodTo: "2026-09-30" });
  });
});

describe("B6: the GSTIN follows the project", () => {
  it("a blank GSTIN defaults to the project's", () => {
    const proj = interProject();
    const r = ok(buildInvoice(db, entryOf(proj, { gstRegistrationId: "" })));
    expect(r.invoice.gstRegistrationId).toBe(proj.gstRegistrationId);
    expect(defaultGstRegistrationId(db, proj)).toBe(proj.gstRegistrationId);
  });
  it("blocks a GSTIN from a different state than the project's", () => {
    const proj = interProject();
    const other = db.gstRegistrations.find((g) => g.stateId !== regOf(proj).stateId)!;
    const r = buildInvoice(db, entryOf(proj, { gstRegistrationId: other.id }));
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.error).toMatch(/does not fit project/);
  });
  it("allows another registration in the project's own state", () => {
    const proj = interProject();
    const twin = { ...regOf(proj), id: "gst_twin", gstin: makeGstin(gstinStateCode(regOf(proj).gstin), regOf(proj).panNumber, "2") };
    const d: Database = { ...db, gstRegistrations: [...db.gstRegistrations, twin] };
    expect(buildInvoice(d, entryOf(proj, { gstRegistrationId: "gst_twin" }))).toMatchObject({ ok: true });
  });
  it("falls back to the region's default GSTIN when the project has none (B16 projects)", () => {
    const proj = interProject();
    const d: Database = { ...db, projects: db.projects.map((x) => (x.id === proj.id ? { ...x, gstRegistrationId: "" } : x)) };
    const regionDefault = db.regionGstRegistrations.find((r) => r.regionId === proj.regionId && r.isDefault)!.gstRegistrationId;
    expect(ok(buildInvoice(d, entryOf({ ...proj, gstRegistrationId: "" }, { gstRegistrationId: "" }))).invoice.gstRegistrationId).toBe(regionDefault);
  });
  it("the CSV path defaults a blank GSTIN to the project's and blocks a mismatching one", () => {
    const proj = interProject();
    const org = db.organisations.find((o) => o.id === proj.organisationId)!;
    const row = { Customer: org.name, Project: proj.code, "Invoice date": "2026-10-07", "Taxable value": "5000" };
    expect(resolveInvoiceRecord(db, row).entry?.gstRegistrationId).toBe(proj.gstRegistrationId);
    const other = db.gstRegistrations.find((g) => g.stateId !== regOf(proj).stateId)!;
    const { entry } = resolveInvoiceRecord(db, { ...row, GSTIN: other.gstin });
    expect(buildInvoice(db, entry!)).toMatchObject({ ok: false });
  });
});

describe("B7: retention and GST-TDS deductions reach their ledgers", () => {
  it("a retention deduction creates a WITHHELD client retention entry for the invoice", () => {
    const proj = interProject();
    const r = ok(buildInvoice(db, entryOf(proj, { deductions: "5000", deductionTypeId: "ded_retention" })));
    expect(r.retentionEntries).toHaveLength(1);
    expect(r.retentionEntries[0]).toMatchObject({ side: "CLIENT", type: "WITHHELD", amount: "5000.00", invoiceId: r.invoice.id, projectId: proj.id, date: r.invoice.invoiceDate });
    expect(r.tdsTransactions).toHaveLength(0);
  });
  it("a GST-TDS deduction creates a TDS_RECEIVED transaction (inter-state: IGST)", () => {
    const proj = interProject();
    const r = ok(buildInvoice(db, entryOf(proj, { deductions: "2000", deductionTypeId: "ded_tds_gst" })));
    expect(r.tdsTransactions).toHaveLength(1);
    expect(r.tdsTransactions[0]).toMatchObject({ direction: "TDS_RECEIVED", sourceId: r.invoice.id, gstRegistrationId: r.invoice.gstRegistrationId, igst: "2000.00", cgst: "0.00", sgst: "0.00", taxableValue: "100000.00", rate: "2.0000" });
    expect(r.tdsTransactions[0].id).not.toBe(r.gstTransaction.id);
    expect(r.retentionEntries).toHaveLength(0);
  });
  it("a GST-TDS deduction on an intra-state invoice splits into equal CGST and SGST", () => {
    const proj = intraProject();
    const r = ok(buildInvoice(db, entryOf(proj, { deductions: "2000.02", deductionTypeId: "ded_tds_gst" })));
    const t = r.tdsTransactions[0];
    expect(t.cgst).toBe("1000.01");
    expect(t.sgst).toBe(t.cgst);
    expect(t.igst).toBe("0.00");
  });
  it("other deduction types (income-tax TDS, penalty) create neither", () => {
    const proj = interProject();
    for (const type of ["ded_tds_it", "ded_penalty", ""]) {
      const r = ok(buildInvoice(db, entryOf(proj, { deductions: "1000", deductionTypeId: type })));
      expect(r.retentionEntries).toHaveLength(0);
      expect(r.tdsTransactions).toHaveLength(0);
      expect(r.deductions).toHaveLength(1);
    }
  });
  it("no deduction, no extra rows", () => {
    const r = ok(buildInvoice(db, entryOf(interProject(), { deductionTypeId: "ded_retention" })));
    expect(r.retentionEntries).toHaveLength(0);
    expect(r.deductions).toHaveLength(0);
  });
});

describe("B18: CGST equals SGST on invoices", () => {
  it("new intra-state invoice with an odd-paisa tax", () => {
    const r = ok(buildInvoice(db, entryOf(intraProject(), { taxableValue: "100.25" })));
    expect(r.invoice.cgst).toBe(r.invoice.sgst);
    expect(r.invoice.cgst).toBe("9.03");
    expect(r.invoice.total).toBe("118.31"); // 100.25 + 18.06
    expect(sumMoney([r.invoice.taxableValue, r.invoice.cgst, r.invoice.sgst, r.invoice.igst])).toBe(r.invoice.total);
    expect(r.gstTransaction.cgst).toBe(r.gstTransaction.sgst);
  });
  it("every seeded invoice and GST transaction has CGST === SGST", () => {
    for (const i of db.invoices) expect(i.cgst, i.invoiceNo).toBe(i.sgst);
    for (const t of db.gstTransactions) expect(t.cgst, `${t.direction} ${t.invoiceNo}`).toBe(t.sgst);
  });
  it("seeded invoices still add up: taxable + taxes = total", () => {
    for (const i of db.invoices) expect(sumMoney([i.taxableValue, i.cgst, i.sgst, i.igst]), i.invoiceNo).toBe(i.total);
  });
});

describe("B17: parties and subcontractor registration", () => {
  const stateCode = (stateId: string) => db.states.find((s) => s.id === stateId)!.gstStateCode;

  it("every seeded party has a valid GSTIN whose state code matches its state, and a valid PAN", () => {
    expect(db.parties.length).toBeGreaterThan(10);
    for (const party of db.parties) {
      expect(gstinError(party.gstin!), `${party.name} ${party.gstin}`).toBeNull();
      expect(gstinStateCode(party.gstin!), party.name).toBe(stateCode(party.stateId));
      expect(party.gstin!.slice(2, 12), party.name).toBe(party.pan);
      expect(isValidPan(party.pan), party.name).toBe(true);
    }
  });
  it("sub-bill GST type comes from the GSTIN recorded: CGST+SGST only if the subcontractor's GSTIN state equals our GSTIN's state", () => {
    const txns = db.gstTransactions.filter((t) => t.sourceType === "SUBCONTRACTOR_BILL");
    expect(txns.length).toBeGreaterThan(10);
    let sawIntra = false;
    let sawInter = false;
    for (const t of txns) {
      const ours = db.gstRegistrations.find((g) => g.id === t.gstRegistrationId)!;
      expect(isValidGstin(t.partyGstin!), t.invoiceNo).toBe(true);
      const intra = gstinStateCode(t.partyGstin!) === gstinStateCode(ours.gstin);
      if (intra) {
        sawIntra = true;
        expect(t.igst, t.invoiceNo).toBe("0.00");
        expect(t.cgst, t.invoiceNo).toBe(t.sgst);
      } else {
        sawInter = true;
        expect(t.cgst, t.invoiceNo).toBe("0.00");
        expect(t.sgst, t.invoiceNo).toBe("0.00");
      }
    }
    expect(sawIntra || sawInter).toBe(true);
    for (const b of db.subcontractorBills) {
      const t = txns.find((x) => x.sourceId === b.id)!;
      expect(sumMoney([t.cgst, t.sgst, t.igst]), b.billNo).toBe(b.gstAmount);
    }
  });
  it("vendor-invoice GST rows carry valid vendor GSTINs", () => {
    for (const t of db.gstTransactions.filter((x) => x.sourceType === "VENDOR_INVOICE")) expect(isValidGstin(t.partyGstin!), t.invoiceNo).toBe(true);
  });

  const valid = {
    name: "Test Scaffolders", contactName: "A Person", phone: "98400 12345", gstin: makeGstin("33", "AAJFT1234Q"), pan: "AAJFT1234Q", address: "Chennai",
    state: "Tamil Nadu", tradeCategory: "Scaffolding", isLabourSupplier: "No", status: "ACTIVE",
  };
  it("accepts a well-formed subcontractor, and a blank GSTIN", () => {
    expect(buildSubcontractor(db, valid).error).toBeNull();
    expect(buildSubcontractor(db, { ...valid, gstin: "" }).error).toBeNull();
  });
  it("rejects a GSTIN with a bad checksum, a bad state code or the wrong layout", () => {
    expect(buildSubcontractor(db, { ...valid, gstin: valid.gstin.slice(0, 14) + (valid.gstin[14] === "A" ? "B" : "A") }).error).toMatch(/checksum/);
    expect(buildSubcontractor(db, { ...valid, gstin: "33AAJFT1234Q1Z" }).error).toMatch(/GSTIN/);
    expect(buildSubcontractor(db, { ...valid, gstin: makeGstin("00", "AAJFT1234Q") }).error).toMatch(/state code/);
  });
  it("rejects a GSTIN whose state differs from the selected state, or whose PAN differs from the PAN", () => {
    expect(buildSubcontractor(db, { ...valid, state: "Karnataka" }).error).toMatch(/does not match the state/);
    expect(buildSubcontractor(db, { ...valid, pan: "AAJFX9999Q" }).error).toMatch(/differs from the PAN/);
  });
  it("validates PAN format", () => {
    expect(buildSubcontractor(db, { ...valid, pan: "ABC", gstin: "" }).error).toMatch(/PAN/);
    expect(buildSubcontractor(db, { ...valid, pan: "AAJXT1234Q", gstin: "" }).error).toMatch(/PAN/);
  });
  it("duplicate check by GSTIN, even under a different name", () => {
    const existing = db.parties.find((p) => db.subcontractors.some((s) => s.partyId === p.id))!;
    const st = db.states.find((s) => s.id === existing.stateId)!;
    const r = buildSubcontractor(db, { ...valid, name: "Completely New Name", gstin: existing.gstin!, pan: existing.pan, state: st.name });
    expect(r.error).toMatch(/GSTIN .* already belongs to/);
  });
  it("duplicate check by PAN when no GSTIN is given, or the GSTIN is in the same state", () => {
    const existing = db.parties.find((p) => db.subcontractors.some((s) => s.partyId === p.id))!;
    const st = db.states.find((s) => s.id === existing.stateId)!;
    expect(buildSubcontractor(db, { ...valid, name: "Another Name", gstin: "", pan: existing.pan, state: st.name }).error).toMatch(/PAN .* already belongs to/);
    // same PAN, GSTIN in a different state = a second registration of one entity: allowed
    const otherState = db.states.find((s) => s.id !== existing.stateId && s.gstStateCode !== gstinStateCode(existing.gstin!))!;
    const r = buildSubcontractor(db, { ...valid, name: "Another Name", gstin: makeGstin(otherState.gstStateCode, existing.pan), pan: existing.pan, state: otherState.name });
    expect(r.error).toBeNull();
  });
  it("duplicate check inside one import file, by GSTIN and by PAN", () => {
    const a = { ...valid, name: "File Sub A" };
    const sameGstin = { ...valid, name: "File Sub B" };
    const samePan = { ...valid, name: "File Sub C", gstin: "" };
    const { parties, errors } = buildSubcontractors(db, [a, sameGstin, samePan]);
    expect(parties).toHaveLength(1);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/^Row 3: .*GSTIN .* twice/);
    expect(errors[1]).toMatch(/^Row 4: .*PAN .* twice/);
  });
  it("the name check still works", () => {
    const name = db.parties.find((p) => db.subcontractors.some((s) => s.partyId === p.id))!.name;
    expect(buildSubcontractor(db, { ...valid, name: name.toUpperCase() }).error).toMatch(/already exists/);
  });
});
