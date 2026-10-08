import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDemoGate, DEMO_PERIOD } from "../demo";
import { ourHours, reconcile, summaryText, type OurAttendance, type OurEmployee } from "../match";
import { autoDetectMapping, csvToGrid, excelSerialToIso, hoursBetween, normaliseShift, parseDateValue, parseGateGrid, parseHours, type ColumnMap } from "../parse";
import { parseXlsx, sheetToGrid } from "../xlsx";

const MAP: ColumnMap = { workerRef: "Worker ID", workerName: "Worker Name", date: "Date", inTime: "In Time", outTime: "Out Time", hours: "Hours", shift: "Shift" };

describe("parser and mapping", () => {
  it("reads CSV with quotes, BOM and blank lines into a grid", () => {
    const g = csvToGrid('﻿Worker ID,Name,Date\r\n"A-1","Rao, K",03-08-2026\r\n\r\nB-2,Sen,04-08-2026\r\n');
    expect(g).toEqual([["Worker ID", "Name", "Date"], ["A-1", "Rao, K", "03-08-2026"], ["B-2", "Sen", "04-08-2026"]]);
  });

  it("auto-detects an NTPC-style header row", () => {
    expect(autoDetectMapping(["Sl No", "Contract Worker ID", "Employee Name", "Attendance Date", "Punch In", "Punch Out", "Hours Worked", "Shift Code"])).toMatchObject({
      workerRef: "Contract Worker ID", workerName: "Employee Name", date: "Attendance Date", inTime: "Punch In", outTime: "Punch Out", hours: "Hours Worked", shift: "Shift Code",
    });
  });

  it("parses dates in each supported format and Excel serials", () => {
    expect(parseDateValue("03-08-2026", "DD-MM-YYYY")).toBe("2026-08-03");
    expect(parseDateValue("03/08/2026", "DD/MM/YYYY")).toBe("2026-08-03");
    expect(parseDateValue("08/03/2026", "MM/DD/YYYY")).toBe("2026-08-03");
    expect(parseDateValue("2026-08-03", "DD-MM-YYYY")).toBe("2026-08-03");
    expect(parseDateValue("3-Aug-2026", "DD-MMM-YYYY")).toBe("2026-08-03");
    expect(parseDateValue("31-02-2026")).toBeNull();
    expect(parseDateValue("")).toBeNull();
    expect(excelSerialToIso(46237)).toBe("2026-08-03");
    expect(parseDateValue("46237")).toBe("2026-08-03");
  });

  it("derives hours from in/out, including a night shift across midnight", () => {
    expect(hoursBetween("08:00", "16:30")).toBe(8.5);
    expect(hoursBetween("22:00", "06:00")).toBe(8);
    expect(hoursBetween("8:00 AM", "5:00 PM")).toBe(9);
    expect(parseHours("7:30")).toBe(7.5);
    expect(parseHours("8.25")).toBe(8.25);
    expect(parseHours("abc")).toBeNull();
  });

  it("maps a grid to rows, skipping bad lines with a reason", () => {
    const grid = csvToGrid("Worker ID,Worker Name,Date,In Time,Out Time,Hours,Shift\nW1,Asha,03-08-2026,08:00,16:00,8,G\nW2,Ben,not-a-date,08:00,16:00,8,G\n,,,,,,\nW3,Cy,04-08-2026,08:00,12:00,,H");
    const p = parseGateGrid(grid, MAP, "DD-MM-YYYY");
    expect(p.rows.map((r) => [r.workerRef, r.date, r.hours, r.shift])).toEqual([["W1", "2026-08-03", 8, "G"], ["W3", "2026-08-04", 4, "H"]]);
    expect(p.issues).toHaveLength(1);
    expect(p.issues[0].line).toBe(3);
  });

  it("reports mapped columns that the file lacks", () => {
    const p = parseGateGrid(csvToGrid("ID,Day\nW1,03-08-2026"), MAP);
    expect(p.missingColumns.length).toBeGreaterThan(0);
    expect(p.rows).toHaveLength(0);
  });

  it("normalises shift labels", () => {
    expect(normaliseShift("G")).toBe("GENERAL");
    expect(normaliseShift("Half Day")).toBe("HALF");
    expect(normaliseShift("N")).toBe("NIGHT");
    expect(normaliseShift("")).toBeNull();
    expect(normaliseShift("zzz")).toBeNull();
  });
});

/** A minimal uncompressed (method 0) zip, enough to exercise the xlsx reader without a library. */
function storedZip(files: Record<string, string>): ArrayBuffer {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameB = enc.encode(name);
    const data = enc.encode(text);
    const local = new Uint8Array(30 + nameB.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameB.length, true);
    local.set(nameB, 30);
    const cen = new Uint8Array(46 + nameB.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameB.length, true);
    cv.setUint32(42, offset, true);
    cen.set(nameB, 46);
    parts.push(local, data);
    central.push(cen);
    offset += local.length + data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, eocd];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out.buffer;
}

describe("xlsx reader", () => {
  const sheet = `<worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="E1" t="inlineStr"><is><t>Shift &amp; x</t></is></c></row>
    <row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>46237</v></c><c r="C2"><v>8</v></c><c r="E2" t="str"><v>G</v></c></row>
  </sheetData></worksheet>`;
  const shared = `<sst><si><t>Worker ID</t></si><si><t>Date</t></si><si><t>Hours</t></si><si><t>W-01</t></si></sst>`;

  it("turns sheet XML into a grid with gaps filled", () => {
    expect(sheetToGrid(sheet, ["Worker ID", "Date", "Hours", "W-01"])).toEqual([["Worker ID", "Date", "Hours", "", "Shift & x"], ["W-01", "46237", "8", "", "G"]]);
  });

  it("reads the first sheet of a zip and the result parses with the mapping", async () => {
    const buf = storedZip({
      "xl/workbook.xml": `<workbook><sheets><sheet name="Gate" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>`,
      "xl/sharedStrings.xml": shared,
      "xl/worksheets/sheet1.xml": sheet,
    });
    const grid = await parseXlsx(buf);
    const p = parseGateGrid(grid, { workerRef: "Worker ID", date: "Date", hours: "Hours", shift: "Shift & x" });
    expect(p.rows).toEqual([{ workerRef: "W-01", workerName: null, date: "2026-08-03", inTime: null, outTime: null, hours: 8, shift: "G" }]);
  });

  it("rejects a non-zip file", async () => {
    await expect(parseXlsx(new TextEncoder().encode("not a zip at all, just text padding padding").buffer as ArrayBuffer)).rejects.toThrow();
  });
});

describe("matching engine", () => {
  const emps: OurEmployee[] = [
    { id: "e1", code: "SPH-101", name: "Asha Rao" },
    { id: "e2", code: "SPH-102", name: "Ben Dsouza" },
    { id: "e3", code: "SPH-103", name: "Chitra Nair" },
  ];
  const att = (employeeId: string, date: string, dayFraction = 1, overtimeMinutes = 0): OurAttendance => ({ employeeId, date, dayFraction, overtimeMinutes });
  const gate = (workerRef: string, date: string, hours: number, shift: string | null = "G", workerName: string | null = null) => ({ workerRef, workerName, date, inTime: null, outTime: null, hours, shift });

  it("computes our hours from day fraction and overtime", () => {
    expect(ourHours({ dayFraction: 1, overtimeMinutes: 90 })).toBe(9.5);
    expect(ourHours({ dayFraction: 0.5, overtimeMinutes: 0 })).toBe(4);
    expect(ourHours({ dayFraction: 0, overtimeMinutes: 0 })).toBe(0);
  });

  it("classifies all four exception kinds and matched days", () => {
    const r = reconcile(
      [gate("SPH-101", "2026-08-03", 8), gate("SPH-102", "2026-08-03", 10), gate("SPH-103", "2026-08-03", 8, "N"), gate("SPH-101", "2026-08-04", 8), gate("ZZ-9", "2026-08-05", 8)],
      [att("e1", "2026-08-03"), att("e2", "2026-08-03"), att("e3", "2026-08-03"), att("e2", "2026-08-04")],
      emps,
      "2026-08",
    );
    const kinds = Object.fromEntries(r.exceptions.map((e) => [`${e.workerRef}@${e.date}`, e.kind]));
    expect(r.matched).toBe(1);
    expect(kinds).toEqual({
      "SPH-102@2026-08-03": "HOURS_MISMATCH",
      "SPH-103@2026-08-03": "SHIFT_MISMATCH",
      "SPH-101@2026-08-04": "MISSING_IN_OURS",
      "ZZ-9@2026-08-05": "MISSING_IN_OURS",
      "SPH-102@2026-08-04": "MISSING_IN_THEIRS",
    });
    expect(r.compared).toBe(6);
    expect(r.matchedPct).toBeCloseTo(16.7, 1);
  });

  it("respects the hours tolerance (default 0.5)", () => {
    const g = [gate("SPH-101", "2026-08-03", 8.5)];
    const a = [att("e1", "2026-08-03")];
    expect(reconcile(g, a, emps, "2026-08").matched).toBe(1);
    expect(reconcile(g, a, emps, "2026-08", { toleranceHrs: 0.25 }).exceptions[0].kind).toBe("HOURS_MISMATCH");
  });

  it("falls back to name matching, ignores absent days on our side and rows outside the month", () => {
    const r = reconcile(
      [gate("BADGE-7", "2026-08-03", 8, "G", "asha  RAO"), gate("SPH-102", "2026-07-31", 8)],
      [att("e1", "2026-08-03"), att("e2", "2026-08-03", 0)],
      emps,
      "2026-08",
    );
    expect(r.matched).toBe(1);
    expect(r.exceptions).toHaveLength(0);
    expect(r.outOfPeriod).toBe(1);
  });

  it("sums several swipes in one day and treats a half day as the HALF shift", () => {
    const r = reconcile(
      [gate("SPH-101", "2026-08-03", 2, null), gate("SPH-101", "2026-08-03", 2, null), gate("SPH-102", "2026-08-03", 4, "H")],
      [att("e1", "2026-08-03", 0.5), att("e2", "2026-08-03", 0.5)],
      emps,
      "2026-08",
    );
    expect(r.matched).toBe(2);
  });

  it("summarises like the list text", () => {
    expect(summaryText(97, 14)).toBe("97% matched, 14 exceptions");
    expect(summaryText(100, 1)).toBe("100% matched, 1 exception");
  });
});

describe("demo gate file", () => {
  const demo = buildDemoGate();

  it("plants exactly the documented mismatches", () => {
    const parsed = parseGateGrid(csvToGrid(demo.csv), MAP, "DD-MM-YYYY");
    expect(parsed.issues).toEqual([]);
    const r = reconcile(parsed.rows, demo.ours, demo.employees, DEMO_PERIOD);
    const count = (k: string) => r.exceptions.filter((e) => e.kind === k).length;
    expect(count("MISSING_IN_OURS")).toBe(3);
    expect(count("MISSING_IN_THEIRS")).toBe(4);
    expect(count("HOURS_MISMATCH")).toBe(2);
    expect(count("SHIFT_MISMATCH")).toBe(2);
    expect(r.exceptions).toHaveLength(11);
    expect(r.matched).toBe(demo.expected.matched);
    expect(r.compared).toBe(demo.expected.compared);
    // Pinned counts (docs/gate-demo.md): update both when the seed changes.
    expect(r.matched).toBe(506);
    expect(r.compared).toBe(517);
  });

  it("is what is committed under public/demo", () => {
    const file = readFileSync(resolve(process.cwd(), "public/demo/gate-attendance-demo.csv"), "utf8");
    expect(file.trim()).toBe(demo.csv.trim());
  });

  it("autodetects its own columns", () => {
    expect(autoDetectMapping(demo.headers)).toMatchObject(MAP);
  });
});
