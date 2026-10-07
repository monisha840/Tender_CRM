import { addDays } from "@/lib/dates";
import { addMoney, percentOf, subMoney, sumMoney } from "@/lib/money";
import type { Money, PayrollRunStatus, SalaryPaymentStatus } from "@/types";
import { addApproval } from "./approvals";
import { at, dayOffset, meta, rupees, RegionKey, type RegionKeyName, type SeedCtx } from "./helpers";
import { userId } from "./org";

const MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"] as const;
const REGIONS: RegionKeyName[] = ["cg", "mh", "south", "delhi"];
const REGION_LABEL: Record<RegionKeyName, string> = { cg: "Chhattisgarh", mh: "Maharashtra", south: "South", delhi: "Delhi" };
/** Statutory rules; these move to settings later (CLAUDE.md → configurable, not hard-coded). */
const EPF_CEILING = 15000;
const EPF_RATE = 12;
const ESI_EMPLOYEE_RATE = 0.75;
const ESI_EMPLOYER_RATE = 3.25;
/** Professional tax per month by region (Delhi has none). */
const PT: Record<RegionKeyName, number> = { cg: 200, mh: 200, south: 208, delhi: 0 };

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
      const locked = period !== "2026-09";
      const status: PayrollRunStatus = locked ? "LOCKED" : region === "cg" || region === "delhi" ? "APPROVED" : "PENDING_APPROVAL";
      const end = monthEnd(period);
      const slips: { gross: Money; epfE: Money; epfR: Money; net: Money }[] = [];

      staff.forEach(({ p, e }) => {
        const daily = p.labourTypeId === "lt_daily";
        const days = daily ? rng.int(22, 26) : rng.int(24, 26);
        const ot = daily && rng.chance(0.5) ? rupees(rng.pick([900, 1200, 1800, 2400, 3000])) : "0.00";
        const base: Money = daily ? rupees(Number(p.wageAmount) * days) : percentOf(p.wageAmount, (days / 26) * 100);
        const gross = addMoney(base, ot);
        const epfWages = p.pfApplicable ? (Number(gross) > EPF_CEILING ? rupees(EPF_CEILING) : gross) : "0.00";
        const epfE = percentOf(epfWages, EPF_RATE);
        const epfR = percentOf(epfWages, EPF_RATE);
        const esiE = p.esiApplicable ? percentOf(gross, ESI_EMPLOYEE_RATE) : "0.00";
        const esiR = p.esiApplicable ? percentOf(gross, ESI_EMPLOYER_RATE) : "0.00";
        const advance = Number(p.advanceBalance) > 0 ? rupees(rng.pick([500, 1000, 1500])) : "0.00";
        const other = Number(gross) > 15000 ? rupees(PT[region]) : "0.00";
        const totalDed = addMoney(addMoney(addMoney(epfE, esiE), advance), other);
        const net = subMoney(gross, totalDed);
        const paymentStatus: SalaryPaymentStatus = locked ? "PAID" : rng.chance(0.03) ? "ON_HOLD" : "PENDING";
        slips.push({ gross, epfE, epfR, net });
        db.payslips.push({
          ...meta(`pslip_${period}_${e.id}`), payrollRunId: runId, employeeId: e.id, daysWorked: days, overtimeAmount: ot, gross, epfWages, epfEmployee: epfE, epfEmployer: epfR,
          advanceRecovered: advance, esiEmployee: esiE, esiEmployer: esiR, otherDeductions: other, totalDeductions: totalDed, net, paymentStatus,
          paidOn: paymentStatus === "PAID" ? addDays(end, 5) : null,
        });
      });

      const netTotal = sumMoney(slips.map((s) => s.net));
      const approvalId = status === "PENDING_APPROVAL" ? `apr_${runId}` : null;
      db.payrollRuns.push({
        ...meta(runId, at(addDays(end, 1))), periodMonth: period, regionId, status, employeeCount: slips.length, grossTotal: sumMoney(slips.map((s) => s.gross)),
        epfEmployeeTotal: sumMoney(slips.map((s) => s.epfE)), epfEmployerTotal: sumMoney(slips.map((s) => s.epfR)), netTotal, lockedAt: locked ? at(addDays(end, 6)) : null,
        approvalRequestId: approvalId,
      });

      if (approvalId) {
        addApproval(ctx, {
          id: approvalId, entityType: "PAYROLL_RUN", entityId: runId, amount: netTotal, regionId, projectId: null, title: `Payroll ${period}, ${REGION_LABEL[region]}`,
          requestedById: userId("accounts"), approverId: userId("stalin"), status: "PENDING", submittedOn: dayOffset(-3),
        });
      }
      if (locked) {
        db.payments.push({
          ...meta(`pay_sal_${period}_${region}`), direction: "OUT", purpose: "SALARY", amount: netTotal, paidOn: addDays(end, 5), mode: "BANK_TRANSFER", utr: `UTR${rng.int(100000000, 999999999)}`,
          regionId, projectId: null, gstRegistrationId: null, remarks: `Salary ${period}`,
        });
      }
    });
  });
}
