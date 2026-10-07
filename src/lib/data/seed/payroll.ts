import { addDays } from "@/lib/dates";
import { addMoney, percentOf, sumMoney, subMoney } from "@/lib/money";
import type { Money, PayrollRunStatus } from "@/types";
import { addApproval } from "./approvals";
import { userId } from "./org";
import { at, dayOffset, meta, rupees, RegionKey, type RegionKeyName, type SeedCtx } from "./helpers";

const MONTHS = ["2026-07", "2026-08", "2026-09"] as const;
const REGIONS: RegionKeyName[] = ["korba", "delhi", "mh"];
/** EPF wage ceiling (₹15,000) — a payroll rule that will move to settings. */
const EPF_CEILING = 15000;
const PT: Record<RegionKeyName, number> = { korba: 200, delhi: 0, mh: 200 };

function monthEnd(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function seedPayroll(ctx: SeedCtx) {
  const { db, rng } = ctx;

  MONTHS.forEach((period) => {
    REGIONS.forEach((region) => {
      const regionId = RegionKey[region];
      const staff = db.employeeProfiles
        .map((p) => ({ p, e: db.employees.find((e) => e.id === p.employeeId)! }))
        .filter(({ p, e }) => e.homeRegionId === regionId && Number(p.wageAmount) > 0);
      const runId = `prun_${period}_${region}`;
      const slips: { gross: Money; epfE: Money; epfR: Money; net: Money }[] = [];

      staff.forEach(({ p, e }) => {
        const daily = p.labourTypeId === "lt_daily";
        const days = daily ? rng.int(22, 26) : rng.int(24, 26);
        const ot = daily && rng.chance(0.5) ? rupees(rng.pick([900, 1200, 1800, 2400, 3000])) : "0.00";
        const base: Money = daily ? rupees(Number(p.wageAmount) * days) : percentOf(p.wageAmount, (days / 26) * 100);
        const gross = addMoney(base, ot);
        const epfWages = Number(gross) > EPF_CEILING ? rupees(EPF_CEILING) : gross;
        const epfE = percentOf(epfWages, 12);
        const epfR = percentOf(epfWages, 12);
        const other = Number(gross) > 15000 ? rupees(PT[region]) : "0.00";
        const net = subMoney(subMoney(gross, epfE), other);
        slips.push({ gross, epfE, epfR, net });
        db.payslips.push({
          ...meta(`pslip_${period}_${e.id}`), payrollRunId: runId, employeeId: e.id, daysWorked: days, overtimeAmount: ot, gross, epfWages, epfEmployee: epfE,
          epfEmployer: epfR, otherDeductions: other, net,
        });
      });

      const locked = period !== "2026-09";
      const status: PayrollRunStatus = locked ? "LOCKED" : region === "korba" ? "APPROVED" : "PENDING_APPROVAL";
      const netTotal = sumMoney(slips.map((s) => s.net));
      const end = monthEnd(period);
      const approvalId = status === "PENDING_APPROVAL" ? `apr_${runId}` : null;
      db.payrollRuns.push({
        ...meta(runId, at(addDays(end, 1))),
        periodMonth: period, regionId, status, employeeCount: slips.length, grossTotal: sumMoney(slips.map((s) => s.gross)),
        epfEmployeeTotal: sumMoney(slips.map((s) => s.epfE)), epfEmployerTotal: sumMoney(slips.map((s) => s.epfR)), netTotal,
        lockedAt: locked ? at(addDays(end, 6)) : null, approvalRequestId: approvalId,
      });

      if (approvalId) {
        addApproval(ctx, {
          id: approvalId, entityType: "PAYROLL_RUN", entityId: runId, amount: netTotal, regionId, projectId: null,
          title: `Payroll ${period} — ${region === "delhi" ? "Delhi" : "Maharashtra"}`, requestedById: userId("accounts"),
          approverId: userId("director"), status: "PENDING", submittedOn: dayOffset(-3),
        });
      }
      if (locked) {
        db.payments.push({
          ...meta(`pay_sal_${period}_${region}`), direction: "OUT", purpose: "SALARY", amount: netTotal, paidOn: addDays(end, 5), mode: "BANK_TRANSFER",
          utr: `UTR${rng.int(100000000, 999999999)}`, regionId, projectId: null, gstRegistrationId: null, remarks: `Salary ${period}`,
        });
      }
    });
  });
}
