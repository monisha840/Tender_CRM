import { moneyToNumber } from "@/lib/money";
import type { Database } from "@/types";
import { getPayablesSummary, getReceivablesSummary } from "./accounts";
import { listProjects } from "./projects";
import type { RegionFilter } from "./shared";
import { getManpowerTrend } from "./sites";
import { getSecuritiesSummary, getTenderStats } from "./tenders";

export interface DashboardKpis {
  activeTenders: number;
  pipelineValue: number;
  winRate: number | null;
  activeProjects: number;
  contractValue: number;
  delayedProjects: number;
  receivables: number;
  receivablesOverdue: number;
  payables: number;
  emdLocked: number;
  pbgOutstanding: number;
  workersToday: number;
  /** Last 14 days of reported manpower, for a KPI sparkline. */
  manpowerTrend: number[];
}

export function getDashboardKpis(db: Database, region: RegionFilter = "ALL"): DashboardKpis {
  const tenders = getTenderStats(db, region);
  const projects = listProjects(db, region);
  const securities = getSecuritiesSummary(db, region);
  const trend = getManpowerTrend(db, region, 14);
  return {
    activeTenders: tenders.activeCount,
    pipelineValue: tenders.activeValue,
    winRate: tenders.winRate,
    activeProjects: projects.length,
    contractValue: projects.reduce((a, p) => a + moneyToNumber(p.project.contractValue), 0),
    delayedProjects: projects.filter((p) => p.health === "RED").length,
    receivables: moneyToNumber(getReceivablesSummary(db, region).total),
    receivablesOverdue: moneyToNumber(getReceivablesSummary(db, region).overdue),
    payables: moneyToNumber(getPayablesSummary(db, region).total),
    emdLocked: moneyToNumber(securities.emdLocked),
    pbgOutstanding: moneyToNumber(securities.pbgOutstanding),
    workersToday: trend[trend.length - 1]?.workers ?? 0,
    manpowerTrend: trend.map((t) => t.workers),
  };
}
