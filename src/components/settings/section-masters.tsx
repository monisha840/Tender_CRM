"use client";

import { useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  reorderProjectStatusesAction, saveProjectStatusAction, saveServiceLineAction, setDeductionRateAction, setHealthThresholdsAction, setSettingAction,
} from "@/modules/settings/actions";
import { SETTING_KEYS, healthThresholdError } from "@/modules/settings/keys";
import type { SettingsPageData } from "@/modules/settings/queries";
import { ReadOnlyNote, ReorderList, SaveBar, Section, SelectField, Switch, TextField, fieldError, useRun } from "./controls";

type Props = { data: SettingsPageData; readOnly: boolean };

export function ServiceLinesSection({ data, readOnly }: Props) {
  const units = data.values[SETTING_KEYS.catalogUnits] as string[];
  const [editing, setEditing] = useState<{ id?: string; name: string; defaultUnit: string; isActive: boolean } | null>(null);
  const [newUnit, setNewUnit] = useState("");
  const unitRun = useRun();
  const unitError = newUnit && units.some((u) => u.toLowerCase() === newUnit.trim().toLowerCase()) ? "This unit already exists" : null;

  return (
    <div className="space-y-6">
      <ReadOnlyNote readOnly={readOnly} />
      <Section
        title="Service lines"
        description="What the company sells. Each has a default unit for BOQ lines."
        testId="settings-service-lines"
        actions={!readOnly && <Button variant="outline" data-testid="service-add" onClick={() => setEditing({ name: "", defaultUnit: units[0] ?? "", isActive: true })}><Plus data-icon="inline-start" />Add service line</Button>}
      >
        {editing && <ServiceForm key={editing.id ?? "new"} initial={editing} units={units} onClose={() => setEditing(null)} />}
        <ul className="divide-y rounded-lg border">
          {data.serviceLines.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 p-3" data-testid="service-row">
              <div className="min-w-0 text-sm"><p className="font-medium">{s.name}</p><p className="text-muted-foreground">Default unit: {s.defaultUnit}</p></div>
              <div className="flex items-center gap-2">
                <StatusBadge status={s.isActive ? "ACTIVE" : "INACTIVE"} />
                {!readOnly && <Button variant="ghost" size="icon-sm" aria-label={`Edit ${s.name}`} onClick={() => setEditing({ ...s })}><Pencil /></Button>}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Units of measure" description="Man-day, sq m, running metre, MT and any others used in BOQs." testId="settings-units">
        <ul className="flex flex-wrap gap-2" data-testid="unit-list">
          {units.map((u) => (
            <li key={u} className="flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-sm">
              {u}
              {!readOnly && units.length > 1 && (
                <button type="button" aria-label={`Remove unit ${u}`} className="grid size-5 place-items-center rounded hover:bg-background" onClick={() => void unitRun.run(() => setSettingAction({ key: SETTING_KEYS.catalogUnits, value: units.filter((x) => x !== u) }), "Unit removed")}><X className="size-3" /></button>
              )}
            </li>
          ))}
        </ul>
        {!readOnly && (
          <div className="mt-3 flex max-w-sm items-end gap-2">
            <div className="flex-1"><TextField label="New unit" value={newUnit} onChange={setNewUnit} error={unitError} testId="unit-input" /></div>
            <Button disabled={!newUnit.trim() || !!unitError || unitRun.pending} data-testid="unit-add" onClick={async () => { if (await unitRun.run(() => setSettingAction({ key: SETTING_KEYS.catalogUnits, value: [...units, newUnit.trim()] }), "Unit added")) setNewUnit(""); }}>Add</Button>
          </div>
        )}
        {unitRun.error && <p role="alert" className="mt-2 text-sm text-status-danger">{unitRun.error}</p>}
      </Section>
    </div>
  );
}

function ServiceForm({ initial, units, onClose }: { initial: { id?: string; name: string; defaultUnit: string; isActive: boolean }; units: string[]; onClose: () => void }) {
  const [f, setF] = useState(initial);
  const { run, pending, error, fieldErrors } = useRun();
  const options = units.includes(f.defaultUnit) || !f.defaultUnit ? units : [...units, f.defaultUnit];
  return (
    <div className="mb-4 space-y-3 rounded-lg border bg-muted/40 p-3" data-testid="service-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Service line" value={f.name} onChange={(v) => setF({ ...f, name: v })} error={fieldError(fieldErrors, "name")} testId="service-name" />
        <SelectField label="Default unit" value={f.defaultUnit} onChange={(v) => setF({ ...f, defaultUnit: v })} options={options.map((u) => ({ value: u, label: u }))} />
      </div>
      <Switch label="Active" checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} />
      <div className="flex gap-2">
        <Button disabled={pending || f.name.trim().length < 2} data-testid="service-save" onClick={async () => { if (await run(() => saveServiceLineAction(f), "Service line saved")) onClose(); }}>Save</Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </div>
      {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------

export function DeductionsSection({ data, readOnly }: Props) {
  return (
    <div className="space-y-6">
      <ReadOnlyNote readOnly={readOnly} />
      <Section title="Deduction types" description="Default percentage applied when a deduction is added to a bill. Changing it needs a reason and does not touch bills already raised." testId="settings-deductions">
        <ul className="divide-y rounded-lg border">
          {data.deductionTypes.map((d) => <DeductionRow key={d.id} row={d} readOnly={readOnly} />)}
        </ul>
      </Section>
    </div>
  );
}

function DeductionRow({ row, readOnly }: { row: SettingsPageData["deductionTypes"][number]; readOnly: boolean }) {
  const [editing, setEditing] = useState(false);
  const [rate, setRate] = useState(row.defaultRate ?? "");
  const [reason, setReason] = useState("");
  const { run, pending, error } = useRun();
  const n = Number(rate);
  const rateError = rate !== "" && (Number.isNaN(n) || n < 0 || n > 100) ? "Enter a percentage from 0 to 100" : null;
  const isPercent = row.calcMethod === "PERCENT";
  return (
    <li className="p-3" data-testid="deduction-row">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 text-sm"><p className="font-medium">{row.name}</p><p className="text-muted-foreground">{row.code} · {isPercent ? `${Number(row.defaultRate ?? 0)}% default` : row.calcMethod === "FIXED" ? "Fixed amount" : "Entered manually"}</p></div>
        {!readOnly && isPercent && !editing && <Button variant="ghost" size="icon-sm" aria-label={`Edit ${row.name}`} onClick={() => setEditing(true)}><Pencil /></Button>}
      </div>
      {editing && (
        <div className="mt-3 grid gap-3 sm:grid-cols-[10rem_1fr_auto]">
          <TextField label="Default %" value={rate} onChange={setRate} inputMode="decimal" error={rateError} testId="deduction-rate" />
          <TextField label="Reason for the change" value={reason} onChange={setReason} testId="deduction-reason" />
          <div className="flex items-end gap-2">
            <Button disabled={pending || !!rateError || rate === "" || reason.trim().length < 3} data-testid="deduction-save" onClick={async () => { if (await run(() => setDeductionRateAction({ id: row.id, defaultRate: n, reason }), "Default rate saved")) { setEditing(false); setReason(""); } }}>Save</Button>
            <Button variant="outline" onClick={() => { setEditing(false); setRate(row.defaultRate ?? ""); }}>Cancel</Button>
          </div>
          {error && <p role="alert" className="text-sm text-status-danger sm:col-span-3">{error}</p>}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------------------------------------------

export function ProjectsSection({ data, readOnly }: Props) {
  const amberStored = data.values[SETTING_KEYS.healthAmberDelayPct] as number;
  const redStored = data.values[SETTING_KEYS.healthRedDelayPct] as number;
  const [amber, setAmber] = useState(String(amberStored));
  const [red, setRed] = useState(String(redStored));
  const [low, setLow] = useState(String(data.values[SETTING_KEYS.pnlLowMarginPct]));
  const health = useRun();
  const lowRun = useRun();
  const a = Number(amber);
  const r = Number(red);
  const bad = (v: string, n: number) => v.trim() === "" || Number.isNaN(n) || n < 0 || n > 100;
  const amberErr = bad(amber, a) ? "Enter a percentage from 0 to 100" : null;
  const redErr = bad(red, r) ? "Enter a percentage from 0 to 100" : !amberErr ? healthThresholdError(a, r) : null;
  const lowN = Number(low);
  const lowErr = bad(low, lowN) ? "Enter a percentage from 0 to 100" : null;

  const [order, setOrder] = useState(data.projectStatuses.map((s) => s.id));
  const serverKey = data.projectStatuses.map((s) => s.id).join(",");
  const [seenKey, setSeenKey] = useState(serverKey);
  if (seenKey !== serverKey) { setSeenKey(serverKey); setOrder(serverKey.split(",")); }
  const [editing, setEditing] = useState<{ id?: string; name: string; isActive: boolean; systemKey?: string | null } | null>(null);
  const reorder = useRun();
  const byId = new Map(data.projectStatuses.map((s) => [s.id, s]));
  const items = order.map((id) => byId.get(id)).filter((s): s is NonNullable<typeof s> => !!s);

  return (
    <div className="space-y-6">
      <ReadOnlyNote readOnly={readOnly} />
      <Section title="Project health thresholds" description="Health compares work done with the time-based plan. Behind by more than the amber figure is Amber; more than the red figure is Red." testId="settings-health">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Amber when behind plan by (% points)" value={amber} onChange={setAmber} inputMode="decimal" disabled={readOnly} error={amberErr} testId="health-amber" />
          <TextField label="Red when behind plan by (% points)" value={red} onChange={setRed} inputMode="decimal" disabled={readOnly} error={redErr} testId="health-red" />
        </div>
        {!readOnly && <SaveBar dirty={Number(amber) !== amberStored || Number(red) !== redStored} pending={health.pending} disabled={!!amberErr || !!redErr} error={health.error} testId="health-save" onSave={() => void health.run(() => setHealthThresholdsAction({ amber: a, red: r }), "Health thresholds saved")} />}
      </Section>

      <Section title="Contract margin" description="Contracts with a profit margin below this show a low-margin warning." testId="settings-margin">
        <div className="max-w-xs"><TextField label="Low margin below (%)" value={low} onChange={setLow} inputMode="decimal" disabled={readOnly} error={lowErr} testId="margin-low" /></div>
        {!readOnly && <SaveBar dirty={lowN !== (data.values[SETTING_KEYS.pnlLowMarginPct] as number)} pending={lowRun.pending} disabled={!!lowErr} error={lowRun.error} testId="margin-save" onSave={() => void lowRun.run(() => setSettingAction({ key: SETTING_KEYS.pnlLowMarginPct, value: lowN }), "Margin threshold saved")} />}
      </Section>

      <Section
        title="Project statuses"
        description="Drag or use the arrows to reorder. System statuses can be renamed but not deactivated."
        testId="settings-project-statuses"
        actions={!readOnly && <Button variant="outline" data-testid="pstatus-add" onClick={() => setEditing({ name: "", isActive: true })}><Plus data-icon="inline-start" />Add status</Button>}
      >
        {editing && (
          <StatusForm key={editing.id ?? "new"} initial={editing} onClose={() => setEditing(null)} />
        )}
        {reorder.error && <p role="alert" className="mb-2 text-sm text-status-danger">{reorder.error}</p>}
        <ReorderList
          label="Project statuses"
          testIdPrefix="pstatus"
          items={items}
          disabled={readOnly || reorder.pending}
          onChange={async (ids) => { const prev = order; setOrder(ids); if (!(await reorder.run(() => reorderProjectStatusesAction({ orderedIds: ids }), "Status order saved"))) setOrder(prev); }}
          render={(s) => (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{s.name}</span>
              <div className="flex items-center gap-1">
                <StatusBadge status={s.isActive ? "ACTIVE" : "INACTIVE"} />
                {!readOnly && <Button variant="ghost" size="icon-sm" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}><Pencil /></Button>}
              </div>
            </div>
          )}
        />
      </Section>
    </div>
  );
}

function StatusForm({ initial, onClose }: { initial: { id?: string; name: string; isActive: boolean; systemKey?: string | null }; onClose: () => void }) {
  const [f, setF] = useState({ name: initial.name, isActive: initial.isActive });
  const { run, pending, error, fieldErrors } = useRun();
  return (
    <div className="mb-4 space-y-3 rounded-lg border bg-muted/40 p-3">
      <TextField label="Status name" value={f.name} onChange={(v) => setF({ ...f, name: v })} error={fieldError(fieldErrors, "name")} testId="pstatus-name" />
      <Switch label="Active" checked={f.isActive} disabled={!!initial.systemKey} onChange={(v) => setF({ ...f, isActive: v })} />
      <div className="flex gap-2">
        <Button disabled={pending || f.name.trim().length < 2} data-testid="pstatus-save" onClick={async () => { if (await run(() => saveProjectStatusAction({ id: initial.id, ...f }), "Status saved")) onClose(); }}>Save</Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </div>
      {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}
    </div>
  );
}
