"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Landmark } from "lucide-react";
import { toast } from "sonner";
import { ChartCard } from "@/components/charts/chart-card";
import { SizedContainer } from "@/components/charts/sized-container";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { KpiTile } from "@/components/shared/kpi-tile";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { errorText } from "@/components/tenders/action-helpers";
import { ReasonDialog } from "@/components/tenders/reason-dialog";
import { Button } from "@/components/ui/button";
import { FilterPills } from "@/components/work/parts";
import { formatDate } from "@/lib/dates";
import { addMoney, formatINR, moneyToNumber, sumMoney } from "@/lib/money";
import { ageingTotals, AGEING_BUCKETS, isOpenStatus, KIND_LABEL, STATUS_LABEL, totalsByClient, type LockedKind, type LockedStatus } from "@/modules/money-locked/calc";
import { markReleasedAction, requestRefundAction } from "@/modules/money-locked/actions";
import type { Ledger, LedgerRow } from "@/modules/money-locked/service";

const STATUS_TONE: Record<LockedStatus, StatusTone> = { LOCKED: "accent", REFUND_REQUESTED: "warning", RELEASED: "success", FORFEITED: "danger" };

type StatusFilter = "OPEN" | LockedStatus | "ALL";
type KindFilter = "ALL" | LockedKind;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "OPEN", label: "Open" },
  { key: "REFUND_REQUESTED", label: "Refund requested" },
  { key: "RELEASED", label: "Released" },
  { key: "FORFEITED", label: "Forfeited" },
  { key: "ALL", label: "All" },
];
const KIND_FILTERS: { key: KindFilter; label: string }[] = [
  { key: "ALL", label: "All types" },
  { key: "EMD", label: "EMD" },
  { key: "PBG", label: "PBG" },
  { key: "ADDITIONAL_PBG", label: "Additional PBG" },
  { key: "SECURITY_DEPOSIT", label: "Security deposit" },
  { key: "RETENTION", label: "Retention" },
];

const axis = { fontSize: 11, fill: "var(--text-secondary)" };
const shortName = (s: string) => (s.length > 18 ? `${s.slice(0, 17)}…` : s);

function ExpiryCell({ r }: { r: LedgerRow }) {
  if (!r.expiryDate) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col items-end gap-1 md:items-start">
      <span>{formatDate(r.expiryDate)}</span>
      {r.alert && (
        <StatusBadge
          tone={r.alert.level === "expired" ? "danger" : "warning"}
          label={r.alert.level === "expired" ? `Expired ${-(r.daysToExpiry ?? 0)}d ago` : `Expires in ${r.daysToExpiry}d`}
        />
      )}
    </div>
  );
}

export function MoneyLockedView({
  ledger,
  series,
  canUpdate,
}: {
  ledger: Ledger;
  /** 12-month locked balance, oldest first (sparkline). */
  series: { month: string; total: string }[];
  canUpdate: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<StatusFilter>("OPEN");
  const [kind, setKind] = useState<KindFilter>("ALL");
  const [dialog, setDialog] = useState<{ type: "refund" | "release"; row: LedgerRow } | null>(null);

  const open = useMemo(() => ledger.rows.filter((r) => isOpenStatus(r.status)), [ledger.rows]);
  const perClient = useMemo(() => totalsByClient(ledger.rows), [ledger.rows]);
  const totalOpen = useMemo(() => sumMoney(open.map((r) => r.amount)), [open]);
  const expiring = open.filter((r) => r.alert);
  const refunds = open.filter((r) => r.status === "REFUND_REQUESTED");
  const ageing = useMemo(() => ageingTotals(open.map((r) => ({ amount: r.amount, days: r.daysLocked }))), [open]);

  const rows = useMemo(
    () =>
      ledger.rows.filter(
        (r) => (status === "ALL" ? true : status === "OPEN" ? isOpenStatus(r.status) : r.status === status) && (kind === "ALL" || r.kind === kind),
      ),
    [ledger.rows, status, kind],
  );
  const filteredTotal = useMemo(() => rows.reduce((s, r) => addMoney(s, r.amount), "0.00"), [rows]);

  async function confirm(reason: string): Promise<string | void> {
    if (!dialog) return;
    const { row, type } = dialog;
    if (row.version === null) return "This item cannot be changed here.";
    const res = await (type === "refund" ? requestRefundAction : markReleasedAction)({ instrumentId: row.id, version: row.version, reason });
    if (!res.ok) return errorText(res);
    toast.success(type === "refund" ? "Refund marked as requested" : "Marked as released");
    router.refresh();
  }

  const columns: DataTableColumn<LedgerRow>[] = [
    {
      key: "client",
      header: "Client / project",
      mobile: "title",
      sortValue: (r) => r.clientName,
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-medium">{r.clientName}</p>
          <p className="text-xs text-muted-foreground">{r.projectCode ? `${r.projectCode} · ${r.projectName}` : r.tenderNo ? `Tender ${r.tenderNo}` : "—"}</p>
        </div>
      ),
    },
    { key: "kind", header: "Type", sortValue: (r) => r.kind, cell: (r) => KIND_LABEL[r.kind] },
    { key: "amount", header: "Amount", numeric: true, sortValue: (r) => moneyToNumber(r.amount), cell: (r) => <span className="tabular" data-testid="ledger-amount">{formatINR(r.amount)}</span> },
    { key: "issue", header: "Issued", sortValue: (r) => r.issueDate ?? "", cell: (r) => (r.issueDate ? formatDate(r.issueDate) : "—") },
    { key: "expiry", header: "Expiry", sortValue: (r) => r.expiryDate ?? "9999", cell: (r) => <ExpiryCell r={r} /> },
    { key: "days", header: "Days locked", numeric: true, sortValue: (r) => r.daysLocked ?? -1, cell: (r) => (r.daysLocked ?? "—") },
    { key: "status", header: "Status", mobile: "badge", sortValue: (r) => r.status, cell: (r) => <StatusBadge tone={STATUS_TONE[r.status]} label={STATUS_LABEL[r.status]} /> },
    ...(canUpdate
      ? [
          {
            key: "actions",
            header: "Action",
            cell: (r: LedgerRow) =>
              r.canAct ? (
                <div className="flex flex-wrap gap-2">
                  {r.status === "LOCKED" && (
                    <Button size="sm" variant="outline" className="min-h-11 md:min-h-7" onClick={() => setDialog({ type: "refund", row: r })} data-testid={`request-refund-${r.id}`}>
                      Request refund
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="min-h-11 md:min-h-7" onClick={() => setDialog({ type: "release", row: r })} data-testid={`mark-released-${r.id}`}>
                    Mark released
                  </Button>
                </div>
              ) : null,
          } satisfies DataTableColumn<LedgerRow>,
        ]
      : []),
  ];

  const clientCols: DataTableColumn<(typeof perClient)[number]>[] = [
    { key: "name", header: "Client", mobile: "title", sortValue: (c) => c.clientName, cell: (c) => <span className="font-medium">{c.clientName}</span> },
    { key: "count", header: "Items", numeric: true, cell: (c) => c.count },
    { key: "next", header: "Next expiry", cell: (c) => (c.nextExpiry ? formatDate(c.nextExpiry) : "—") },
    { key: "total", header: "Locked", numeric: true, mobile: "badge", sortValue: (c) => moneyToNumber(c.total), cell: (c) => <span data-testid={`client-total-${c.clientId}`}>{formatINR(c.total)}</span> },
  ];

  const chartData = perClient.slice(0, 8).map((c) => ({ name: shortName(c.clientName), full: c.clientName, value: moneyToNumber(c.total) }));
  const trend = series.map((s) => moneyToNumber(s.total));

  return (
    <>
      <PageHeader title="Money locked with clients" description="EMD, bank guarantees, security deposits and retention held by clients, with expiry alerts." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Total locked" value={formatINR(totalOpen, { compact: true })} hint={`${open.length} open item${open.length === 1 ? "" : "s"}`} icon={Landmark} trend={trend} testId="kpi-money-locked-total" />
        <KpiTile label="Clients holding money" value={String(perClient.length)} testId="kpi-money-locked-clients" />
        <KpiTile
          label="Expiring soon"
          value={String(expiring.length)}
          hint={`Within ${Math.max(...ledger.thresholds, 0)} days or expired`}
          icon={AlertTriangle}
          testId="kpi-money-locked-expiring"
        />
        <KpiTile label="Refund requested" value={String(refunds.length)} hint={formatINR(sumMoney(refunds.map((r) => r.amount)), { compact: true })} testId="kpi-money-locked-refunds" />
      </div>

      {expiring.length > 0 && (
        <section className="mb-6 rounded-lg border bg-surface" aria-label="Expiry alerts" data-testid="expiry-alerts">
          <h2 className="border-b px-4 py-3 text-sm font-semibold">Needs attention: expiring or expired</h2>
          <ul className="divide-y">
            {[...expiring]
              .sort((a, b) => (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0))
              .slice(0, 6)
              .map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{KIND_LABEL[r.kind]}</span> · {r.clientName}
                    {r.projectCode ? ` · ${r.projectCode}` : ""} · <span className="tabular">{formatINR(r.amount)}</span>
                  </span>
                  <ExpiryCell r={r} />
                </li>
              ))}
          </ul>
        </section>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="min-w-0 rounded-lg border bg-surface">
          <h2 className="border-b px-4 py-3 text-sm font-semibold">Locked per client</h2>
          <DataTable columns={clientCols} rows={perClient} getRowId={(c) => c.clientId} caption="Money locked per client" emptyMessage="No money is locked with any client." />
        </section>
        <ChartCard title="Locked per client" unit="₹ Cr / ₹ L, open items" isEmpty={chartData.length === 0} emptyMessage="Nothing is locked right now." heightClassName="h-64">
          <SizedContainer>
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis type="number" tick={axis} tickFormatter={(v: number) => formatINR(v, { compact: true })} />
              <YAxis type="category" dataKey="name" tick={axis} width={110} />
              <Tooltip formatter={(v) => formatINR(Number(v))} labelFormatter={(_, p) => p?.[0]?.payload?.full ?? ""} />
              <Bar dataKey="value" name="Locked" fill="var(--chart-1)" stroke="var(--accent-strong)" strokeWidth={1} radius={[0, 3, 3, 0]}>
              </Bar>
            </BarChart>
          </SizedContainer>
        </ChartCard>
      </div>

      <p className="mb-3 text-xs text-muted-foreground" data-testid="ageing">
        Locked for:{" "}
        {AGEING_BUCKETS.map((b, i) => (
          <span key={b}>
            {i > 0 && " · "}
            {b} days <span className="tabular font-medium text-foreground">{formatINR(ageing[b], { compact: true })}</span>
          </span>
        ))}
      </p>

      <section aria-label="Ledger" className="rounded-lg border bg-surface">
        <div className="flex flex-col gap-3 border-b p-4">
          <FilterPills options={STATUS_FILTERS} value={status} onChange={setStatus} />
          <FilterPills options={KIND_FILTERS} value={kind} onChange={setKind} />
          <p className="text-xs text-muted-foreground">
            {rows.length} item{rows.length === 1 ? "" : "s"} · <span className="tabular font-medium text-foreground" data-testid="ledger-filtered-total">{formatINR(filteredTotal)}</span>
          </p>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          getRowTestId={(r) => `ledger-row-${r.id}`}
          caption="Money locked ledger"
          search={{ placeholder: "Search client or project", getText: (r) => `${r.clientName} ${r.projectCode ?? ""} ${r.projectName ?? ""} ${r.tenderNo ?? ""}` }}
          emptyMessage="Nothing matches. EMDs, guarantees and retention appear here once they are recorded."
          pageSize={25}
        />
      </section>

      <ReasonDialog
        testId="refund-request"
        open={dialog?.type === "refund"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Mark refund requested"
        description={dialog ? `${KIND_LABEL[dialog.row.kind]} of ${formatINR(dialog.row.amount)} with ${dialog.row.clientName}.` : undefined}
        confirmLabel="Mark requested"
        placeholder="For example: letter sent to the client on 12-10-2026"
        onConfirm={confirm}
      />
      <ReasonDialog
        testId="release"
        open={dialog?.type === "release"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Mark released"
        description={dialog ? `${KIND_LABEL[dialog.row.kind]} of ${formatINR(dialog.row.amount)} with ${dialog.row.clientName} has come back.` : undefined}
        confirmLabel="Mark released"
        placeholder="For example: refund received by NEFT, UTR 1234"
        onConfirm={confirm}
      />
    </>
  );
}
