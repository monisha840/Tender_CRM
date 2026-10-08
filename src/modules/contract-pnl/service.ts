import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import { getSettingValue } from "@/lib/server/settings-read";
import { addMoney } from "@/lib/money";
import type { Money } from "@/types";
import {
  allocateByWeights,
  averageMoney,
  averagePct,
  buildPnl,
  isOtherCostSource,
  marginOf,
  mergeMonthly,
  parseLowMarginPct,
  type DatedAmount,
  type Pnl,
  type PnlMonth,
  type ProjectFacts,
} from "./calc";

export const LOW_MARGIN_SETTING_KEY = "pnl.lowMarginPct";

const ym = (d: Date) => d.toISOString().slice(0, 7);

export interface ProjectPnlRow extends Pnl {
  projectId: string;
  code: string;
  name: string;
  clientName: string;
  regionId: string;
  regionName: string;
  serviceLineId: string;
  serviceLineName: string;
  statusName: string;
  completed: boolean;
  contractValue: Money;
}

export interface PortfolioPnl {
  lowMarginPct: number;
  projects: ProjectPnlRow[];
  totals: { billed: Money; received: Money; totalCost: Money; margin: Money; marginPct: number | null };
  monthly: PnlMonth[];
  /** Labour cost of payslips with no attendance to allocate it by (not in any project). */
  unallocatedLabour: Money;
}

/** Labour = payslip cost to company (gross + employer EPF + employer ESI), split over projects by the days each employee worked there that month. */
async function loadLabour(): Promise<{ byProject: Map<string, DatedAmount[]>; unallocated: Money }> {
  const [slips, att] = await Promise.all([
    prisma.payslip.findMany({
      where: { deletedAt: null, payrollRun: { deletedAt: null } },
      select: { employeeId: true, gross: true, epfEmployer: true, esiEmployer: true, payrollRun: { select: { periodMonth: true } } },
    }),
    prisma.$queryRaw<{ employeeId: string; projectId: string; month: string; days: number }[]>(Prisma.sql`
      SELECT "employeeId", "projectId", to_char("date", 'YYYY-MM') AS month, SUM("dayFraction")::float8 AS days
      FROM "Attendance" WHERE "deletedAt" IS NULL GROUP BY 1, 2, 3`),
  ]);
  const days = new Map<string, { key: string; weight: number }[]>();
  for (const a of att) {
    const k = `${a.employeeId}|${a.month}`;
    days.set(k, [...(days.get(k) ?? []), { key: a.projectId, weight: Number(a.days) }]);
  }
  const byProject = new Map<string, DatedAmount[]>();
  let unallocated: Money = "0.00";
  for (const s of slips) {
    const month = s.payrollRun.periodMonth;
    const cost = addMoney(addMoney(s.gross.toFixed(2), s.epfEmployer.toFixed(2)), s.esiEmployer.toFixed(2));
    const parts = allocateByWeights(cost, days.get(`${s.employeeId}|${month}`) ?? []);
    if (parts.size === 0) {
      unallocated = addMoney(unallocated, cost);
      continue;
    }
    for (const [projectId, amount] of parts) byProject.set(projectId, [...(byProject.get(projectId) ?? []), { month, amount }]);
  }
  return { byProject, unallocated };
}

/** Builds the P&L of every (or one) project. */
export async function getPortfolioPnl(onlyProjectId?: string): Promise<PortfolioPnl> {
  const pw = onlyProjectId ? { projectId: onlyProjectId } : {};
  const [lowRaw, projects, invoices, bills, costs, labour] = await Promise.all([
    getSettingValue<unknown>(LOW_MARGIN_SETTING_KEY, 10),
    prisma.project.findMany({
      where: { deletedAt: null, ...(onlyProjectId ? { id: onlyProjectId } : {}) },
      select: {
        id: true, code: true, name: true, regionId: true, serviceLineId: true, contractValue: true,
        organisation: { select: { name: true } }, region: { select: { name: true } },
        serviceLine: { select: { name: true } }, status: { select: { name: true, systemKey: true } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.invoice.findMany({ where: { deletedAt: null, ...pw }, select: { projectId: true, invoiceDate: true, taxableValue: true, receivedAmount: true } }),
    prisma.subcontractorBill.findMany({
      where: { deletedAt: null, status: { in: ["APPROVED", "PARTLY_PAID", "PAID"] }, ...pw },
      select: { projectId: true, billDate: true, grossAmount: true },
    }),
    prisma.costEntry.findMany({ where: { deletedAt: null, kind: "ACTUAL", ...pw }, select: { projectId: true, date: true, amount: true, sourceType: true } }),
    loadLabour(),
  ]);
  const lowMarginPct = parseLowMarginPct(lowRaw);

  const facts = new Map<string, ProjectFacts>();
  const f = (id: string) => {
    let x = facts.get(id);
    if (!x) facts.set(id, (x = { billed: [], received: [], subCost: [], labourCost: [], otherCost: [] }));
    return x;
  };
  for (const i of invoices) {
    f(i.projectId).billed.push({ month: ym(i.invoiceDate), amount: i.taxableValue.toFixed(2) });
    f(i.projectId).received.push({ month: ym(i.invoiceDate), amount: i.receivedAmount.toFixed(2) });
  }
  for (const b of bills) f(b.projectId).subCost.push({ month: ym(b.billDate), amount: b.grossAmount.toFixed(2) });
  for (const c of costs) if (isOtherCostSource(c.sourceType)) f(c.projectId).otherCost.push({ month: ym(c.date), amount: c.amount.toFixed(2) });
  for (const [pid, list] of labour.byProject) if (!onlyProjectId || pid === onlyProjectId) f(pid).labourCost.push(...list);

  const rows: ProjectPnlRow[] = projects.map((p) => ({
    ...buildPnl(f(p.id), lowMarginPct),
    projectId: p.id,
    code: p.code,
    name: p.name,
    clientName: p.organisation.name,
    regionId: p.regionId,
    regionName: p.region.name,
    serviceLineId: p.serviceLineId,
    serviceLineName: p.serviceLine.name,
    statusName: p.status.name,
    completed: p.status.systemKey === "COMPLETED",
    contractValue: p.contractValue.toFixed(2),
  }));

  const sum = (pick: (r: ProjectPnlRow) => Money) => rows.reduce((s, r) => addMoney(s, pick(r)), "0.00");
  const billed = sum((r) => r.billed);
  const totalCost = sum((r) => r.totalCost);
  const { margin, pct } = marginOf(billed, totalCost);
  return {
    lowMarginPct,
    projects: rows,
    totals: { billed, received: sum((r) => r.received), totalCost, margin, marginPct: pct },
    monthly: mergeMonthly(rows.map((r) => r.monthly)),
    unallocatedLabour: labour.unallocated,
  };
}

/** P&L of one project (null when it does not exist). Server-only; callers check contract_pnl:VIEW. */
export async function getProjectPnl(projectId: string): Promise<ProjectPnlRow | null> {
  const p = await getPortfolioPnl(projectId);
  return p.projects[0] ?? null;
}

export interface PnlBenchmarks {
  /** "completed" when based on finished projects, "all" when there were none and billed projects of any status were used. */
  basis: "completed" | "all" | "none";
  sampleSize: number;
  avgBilled: Money;
  /** Average actual cost of similar past projects. */
  avgActualCost: Money;
  avgMargin: Money;
  /** Average margin %, null when nothing was billed. */
  avgMarginPct: number | null;
  projectCodes: string[];
}

/** Average actual cost and margin of past projects with the same service line (and region, when given). Feeds bid pricing. */
export async function getPnlBenchmarks(opts: { serviceLineId?: string | null; regionId?: string | null }): Promise<PnlBenchmarks> {
  const { projects } = await getPortfolioPnl();
  const similar = projects.filter(
    (p) => (!opts.serviceLineId || p.serviceLineId === opts.serviceLineId) && (!opts.regionId || p.regionId === opts.regionId) && p.billed !== "0.00",
  );
  const done = similar.filter((p) => p.completed);
  const basis = done.length ? "completed" : similar.length ? "all" : "none";
  const set = basis === "completed" ? done : similar;
  return {
    basis,
    sampleSize: set.length,
    avgBilled: averageMoney(set.map((p) => p.billed)),
    avgActualCost: averageMoney(set.map((p) => p.totalCost)),
    avgMargin: averageMoney(set.map((p) => p.margin)),
    avgMarginPct: averagePct(set.map((p) => p.marginPct)),
    projectCodes: set.map((p) => p.code),
  };
}
