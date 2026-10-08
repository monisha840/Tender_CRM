"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { addStatutoryRateAction, saveApprovalRulesAction, setSettingAction, setStatutoryRateActiveAction } from "@/modules/settings/actions";
import { FEATURE_LABEL, FEATURE_MODULES, PHASE67_FEATURES, SETTING_KEYS, featureKey, parseDayList, validateSetting, type FeatureModule } from "@/modules/settings/keys";
import type { SettingsPageData } from "@/modules/settings/queries";
import { ReadOnlyNote, SaveBar, Section, SelectField, Switch, TextField, fieldError, useRun } from "./controls";

type Props = { data: SettingsPageData; readOnly: boolean };

// ---------------------------------------------------------------------------------------------------------------
// Approval rules
// ---------------------------------------------------------------------------------------------------------------

export function ApprovalsSection({ data, readOnly }: Props) {
  const stored = {
    makerChecker: data.values[SETTING_KEYS.approvalsMakerChecker] as boolean,
    dueDays: data.values[SETTING_KEYS.approvalsDueDays] as number,
    required: data.values[SETTING_KEYS.approvalsRequired] as Record<string, boolean>,
  };
  const [makerChecker, setMakerChecker] = useState(stored.makerChecker);
  const [dueDays, setDueDays] = useState(String(stored.dueDays));
  const [required, setRequired] = useState<Record<string, boolean>>(() => Object.fromEntries(data.approvalFlows.map((f) => [f.key, stored.required[f.key] ?? true])));
  const [reason, setReason] = useState("");
  const { run, pending, error } = useRun();
  const due = Number(dueDays);
  const dueErr = dueDays.trim() === "" || !Number.isInteger(due) || due < 0 || due > 30 ? "Enter a whole number of days from 0 to 30" : null;
  const dirty = makerChecker !== stored.makerChecker || due !== stored.dueDays || data.approvalFlows.some((f) => (required[f.key] ?? true) !== (stored.required[f.key] ?? true));

  return (
    <div className="space-y-6">
      <ReadOnlyNote readOnly={readOnly} />
      <Section title="Approval rules" description="Which actions need the Director's approval, and how requests are handled." testId="settings-approvals">
        <Switch label="Maker-checker" hint="The person who raised a request can never approve it." checked={makerChecker} disabled={readOnly} onChange={setMakerChecker} testId="approvals-makerchecker" />
        <div className="my-3 max-w-xs"><TextField label="Approval due after (days)" value={dueDays} onChange={setDueDays} inputMode="numeric" disabled={readOnly} error={dueErr} testId="approvals-due" /></div>
        <h3 className="mb-1 mt-4 text-sm font-semibold">Needs Director approval</h3>
        <ul className="divide-y rounded-lg border px-3" data-testid="approval-flows">
          {data.approvalFlows.map((f) => (
            <li key={f.key}><Switch label={f.name} hint={f.key} checked={required[f.key] ?? true} disabled={readOnly} onChange={(v) => setRequired({ ...required, [f.key]: v })} testId={`approval-required-${f.key}`} /></li>
          ))}
          {data.approvalFlows.length === 0 && <li className="py-3 text-sm text-muted-foreground">No approval flows are configured.</li>}
        </ul>
        {!readOnly && (
          <>
            <div className="mt-4 max-w-md"><TextField label="Reason for the change" value={reason} onChange={setReason} testId="approvals-reason" hint="Recorded in the audit log." /></div>
            <SaveBar dirty={dirty} pending={pending} error={error} disabled={!!dueErr || reason.trim().length < 3} testId="approvals-save" onSave={() => void run(() => saveApprovalRulesAction({ makerChecker, dueDays: due, required, reason }), "Approval rules saved").then((ok) => ok && setReason(""))} />
          </>
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------------------------------------------

function DayListEditor({ settingKey, label, hint, stored, readOnly, testId }: { settingKey: string; label: string; hint: string; stored: number[]; readOnly: boolean; testId: string }) {
  const [text, setText] = useState(stored.join(", "));
  const { run, pending, error } = useRun();
  const nums = parseDayList(text);
  const checked = nums.some(Number.isNaN) ? ({ ok: false, error: "Use whole numbers separated by commas, e.g. 7, 3, 1" } as const) : validateSetting(settingKey, nums);
  const dirty = checked.ok && JSON.stringify(checked.value) !== JSON.stringify(stored);
  return (
    <div>
      <TextField label={label} value={text} onChange={setText} disabled={readOnly} hint={hint} error={checked.ok ? null : checked.error} testId={testId} />
      {!readOnly && <SaveBar dirty={dirty} pending={pending} error={error} disabled={!checked.ok} testId={`${testId}-save`} onSave={() => checked.ok && void run(() => setSettingAction({ key: settingKey, value: checked.value }), `${label} saved`)} />}
    </div>
  );
}

export function RemindersSection({ data, readOnly }: Props) {
  const enabled = data.values[SETTING_KEYS.remindersEnabled] as boolean;
  const { run } = useRun();
  return (
    <div className="space-y-6">
      <ReadOnlyNote readOnly={readOnly} />
      <Section title="Reminders" description="How many days before a date the app raises an alert. Tender deadlines also drive the Soon and Urgent colours." testId="settings-reminders">
        <Switch label="Reminders on" hint="Turn off to stop deadline and expiry alerts everywhere." checked={enabled} disabled={readOnly} onChange={(v) => void run(() => setSettingAction({ key: SETTING_KEYS.remindersEnabled, value: v }), v ? "Reminders turned on" : "Reminders turned off")} testId="reminders-enabled" />
        <div className="mt-4 grid gap-6 lg:grid-cols-3">
          <DayListEditor settingKey={SETTING_KEYS.deadlineDays} label="Tender deadline reminders (days before)" hint="Largest is Soon, second is Urgent. Example: 7, 3, 1" stored={data.values[SETTING_KEYS.deadlineDays] as number[]} readOnly={readOnly} testId="reminder-deadline" />
          <DayListEditor settingKey={SETTING_KEYS.documentExpiryDays} label="Document expiry alerts (days before)" hint="Example: 60, 30, 7" stored={data.values[SETTING_KEYS.documentExpiryDays] as number[]} readOnly={readOnly} testId="reminder-docs" />
          <DayListEditor settingKey={SETTING_KEYS.moneyLockedExpiryDays} label="Money locked expiry alerts (days before)" hint="EMD, PBG and deposits. Example: 30, 15, 7" stored={data.values[SETTING_KEYS.moneyLockedExpiryDays] as number[]} readOnly={readOnly} testId="reminder-money" />
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Statutory rates and billing defaults
// ---------------------------------------------------------------------------------------------------------------

const UNIT_LABEL: Record<string, string> = { PERCENT: "%", AMOUNT_PER_DAY: "₹ per day", AMOUNT_PER_MONTH: "₹ per month", AMOUNT: "₹" };
const todayIso = () => new Date().toISOString().slice(0, 10);
type Rate = SettingsPageData["statutoryRates"][number];

/** Row in force today for one code: the latest active effectiveFrom not after `date` (generic rows only). */
export function currentRate(rows: Rate[], date: string): Rate | undefined {
  return rows.filter((r) => r.isActive && r.effectiveFrom <= date && !r.regionId && !r.category).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

function BillingDefaults({ data, readOnly }: Props) {
  const [gst, setGst] = useState(String(data.values[SETTING_KEYS.billingDefaultGstPct]));
  const [terms, setTerms] = useState(String(data.values[SETTING_KEYS.billingPaymentTermsDays]));
  const g = useRun();
  const t = useRun();
  const gn = Number(gst);
  const tn = Number(terms);
  const gErr = gst.trim() === "" || Number.isNaN(gn) || gn < 0 || gn > 40 ? "Enter a GST rate from 0 to 40" : null;
  const tErr = terms.trim() === "" || !Number.isInteger(tn) || tn < 0 || tn > 365 ? "Enter whole days from 0 to 365" : null;
  return (
    <Section title="Billing defaults" description="Used when a new invoice, bill or project does not set its own." testId="settings-billing">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <TextField label="Default GST rate (%)" value={gst} onChange={setGst} inputMode="decimal" disabled={readOnly} error={gErr} testId="billing-gst" />
          {!readOnly && <SaveBar dirty={gn !== data.values[SETTING_KEYS.billingDefaultGstPct]} pending={g.pending} disabled={!!gErr} error={g.error} testId="billing-gst-save" onSave={() => void g.run(() => setSettingAction({ key: SETTING_KEYS.billingDefaultGstPct, value: gn }), "Default GST saved")} />}
        </div>
        <div>
          <TextField label="Default payment terms (days)" value={terms} onChange={setTerms} inputMode="numeric" disabled={readOnly} error={tErr} testId="billing-terms" />
          {!readOnly && <SaveBar dirty={tn !== data.values[SETTING_KEYS.billingPaymentTermsDays]} pending={t.pending} disabled={!!tErr} error={t.error} testId="billing-terms-save" onSave={() => void t.run(() => setSettingAction({ key: SETTING_KEYS.billingPaymentTermsDays, value: tn }), "Payment terms saved")} />}
        </div>
      </div>
    </Section>
  );
}

export function StatutorySection({ data, readOnly }: Props) {
  const [adding, setAdding] = useState<{ code?: string } | null>(null);
  const codes = [...new Set(data.statutoryRates.map((r) => r.code))];
  const today = todayIso();
  return (
    <div className="space-y-6">
      <ReadOnlyNote readOnly={readOnly} />
      <BillingDefaults data={data} readOnly={readOnly} />
      <Section
        title="Statutory rates"
        description="PF, ESI, professional tax, minimum wage and other rates by effective date. A change adds a new dated row; old rows stay so past calculations are reproducible."
        testId="settings-statutory"
        actions={!readOnly && <Button variant="outline" data-testid="rate-add" onClick={() => setAdding({})}><Plus data-icon="inline-start" />Add rate</Button>}
      >
        {adding && <RateForm key={adding.code ?? "new"} initialCode={adding.code} data={data} onClose={() => setAdding(null)} />}
        {codes.length === 0 && <p className="text-sm text-muted-foreground">No statutory rates are recorded yet. Add the first one (for example PF_EMPLOYER from 01-04-2026).</p>}
        <div className="space-y-4">
          {codes.map((code) => {
            const rows = data.statutoryRates.filter((r) => r.code === code);
            const cur = currentRate(rows, today);
            return (
              <div key={code} className="rounded-lg border" data-testid="rate-group">
                <div className="flex flex-col gap-2 border-b bg-muted/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm"><p className="font-medium">{rows[0].label} <span className="text-muted-foreground">({code})</span></p>
                    <p className="text-muted-foreground" data-testid="rate-current">{cur ? `In force: ${Number(cur.value)} ${UNIT_LABEL[cur.unit] ?? cur.unit} since ${cur.effectiveFrom}` : "No rate in force yet"}</p></div>
                  {!readOnly && <Button variant="outline" size="sm" onClick={() => setAdding({ code })}>New rate from a date</Button>}
                </div>
                <ul className="divide-y" aria-label={`History of ${code}`}>
                  {rows.map((r) => <RateRow key={r.id} rate={r} current={cur?.id === r.id} readOnly={readOnly} />)}
                </ul>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

function RateRow({ rate, current, readOnly }: { rate: Rate; current: boolean; readOnly: boolean }) {
  const { run, pending } = useRun();
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm" data-testid="rate-row">
      <div className="min-w-0">
        <p className="tabular"><span className="font-medium">{Number(rate.value)} {UNIT_LABEL[rate.unit] ?? rate.unit}</span> from {rate.effectiveFrom}{rate.category ? ` · ${rate.category}` : ""}{current ? " · in force" : ""}</p>
        {rate.sourceNote && <p className="text-xs text-muted-foreground">{rate.sourceNote}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge status={rate.isActive ? "ACTIVE" : "INACTIVE"} />
        {!readOnly && <Button variant="outline" size="sm" disabled={pending} onClick={() => { const reason = window.prompt(rate.isActive ? "Why is this rate being switched off?" : "Why is this rate being switched on?"); if (reason && reason.trim().length >= 3) void run(() => setStatutoryRateActiveAction({ id: rate.id, isActive: !rate.isActive, reason }), "Rate updated"); }}>{rate.isActive ? "Switch off" : "Switch on"}</Button>}
      </div>
    </li>
  );
}

function RateForm({ initialCode, data, onClose }: { initialCode?: string; data: SettingsPageData; onClose: () => void }) {
  const existing = initialCode ? data.statutoryRates.find((r) => r.code === initialCode) : undefined;
  const [f, setF] = useState({
    code: initialCode ?? "", label: existing?.label ?? "", unit: existing?.unit ?? "PERCENT", value: "", effectiveFrom: todayIso(),
    sourceNote: "", regionId: "", category: "", reason: "",
  });
  const { run, pending, error, fieldErrors } = useRun();
  const n = Number(f.value);
  const valueErr = f.value.trim() !== "" && (Number.isNaN(n) || n < 0) ? "Enter a number, zero or more" : null;
  const codeErr = f.code && !/^[A-Z][A-Z0-9_]{1,40}$/.test(f.code.toUpperCase()) ? "Use capital letters, digits and underscores" : null;
  return (
    <div className="mb-4 space-y-3 rounded-lg border bg-muted/40 p-3" data-testid="rate-form">
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="Code" value={f.code} onChange={(v) => setF({ ...f, code: v.toUpperCase() })} disabled={!!initialCode} error={fieldError(fieldErrors, "code") ?? codeErr} hint="e.g. PF_EMPLOYER" testId="rate-code" />
        <TextField label="Label" value={f.label} onChange={(v) => setF({ ...f, label: v })} error={fieldError(fieldErrors, "label")} testId="rate-label" />
        <SelectField label="Unit" value={f.unit} onChange={(v) => setF({ ...f, unit: v })} options={Object.entries(UNIT_LABEL).map(([value, label]) => ({ value, label }))} disabled={!!initialCode} />
        <TextField label="Value" value={f.value} onChange={(v) => setF({ ...f, value: v })} inputMode="decimal" error={fieldError(fieldErrors, "value") ?? valueErr} testId="rate-value" />
        <TextField label="Effective from" type="date" value={f.effectiveFrom} onChange={(v) => setF({ ...f, effectiveFrom: v })} error={fieldError(fieldErrors, "effectiveFrom")} testId="rate-from" />
        <SelectField label="Region (optional)" value={f.regionId} onChange={(v) => setF({ ...f, regionId: v })} options={[{ value: "", label: "All regions" }, ...data.regions.map((r) => ({ value: r.id, label: r.name }))]} />
        <TextField label="Category (optional)" value={f.category} onChange={(v) => setF({ ...f, category: v })} hint="e.g. skilled, unskilled" />
        <div className="sm:col-span-2"><TextField label="Source / notification" value={f.sourceNote} onChange={(v) => setF({ ...f, sourceNote: v })} hint="Where this rate comes from" /></div>
        <div className="sm:col-span-3"><TextField label="Reason for the change" value={f.reason} onChange={(v) => setF({ ...f, reason: v })} error={fieldError(fieldErrors, "reason")} testId="rate-reason" /></div>
      </div>
      <div className="flex gap-2">
        <Button
          disabled={pending || !f.code || !f.label.trim() || f.value.trim() === "" || !!valueErr || !!codeErr || f.reason.trim().length < 3}
          data-testid="rate-save"
          onClick={async () => { if (await run(() => addStatutoryRateAction({ ...f, value: n, regionId: f.regionId || undefined, category: f.category || undefined, sourceNote: f.sourceNote || undefined }), "Rate added")) onClose(); }}
        >Save rate</Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </div>
      {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Feature toggles
// ---------------------------------------------------------------------------------------------------------------

export function FeaturesSection({ data, readOnly }: Props) {
  const { run, pending } = useRun();
  return (
    <div className="space-y-6">
      <ReadOnlyNote readOnly={readOnly} />
      <Section title="Feature toggles" description="Switch whole modules on or off. A module that is off disappears from the menu and its pages return Not Found." testId="settings-features">
        {data.envOverride !== null && (
          <p className="mb-3 rounded-lg border bg-accent-subtle px-3 py-2 text-sm" data-testid="features-env-override">
            The environment flag NEXT_PUBLIC_FEATURE_FINANCE_PAYROLL is set to {String(data.envOverride)} and overrides Daily work, Finance and GST, and Employees and payroll.
          </p>
        )}
        <ul className="divide-y rounded-lg border px-3">
          {FEATURE_MODULES.map((m: FeatureModule) => {
            const overridden = data.envOverride !== null && PHASE67_FEATURES.includes(m);
            const on = overridden ? Boolean(data.envOverride) : data.features[m];
            return (
              <li key={m}>
                <Switch
                  label={FEATURE_LABEL[m].label}
                  hint={overridden ? `${FEATURE_LABEL[m].hint} Set by the environment flag.` : FEATURE_LABEL[m].hint}
                  checked={on}
                  disabled={readOnly || pending || overridden}
                  onChange={(v) => void run(() => setSettingAction({ key: featureKey(m), value: v }), `${FEATURE_LABEL[m].label} turned ${v ? "on" : "off"}`)}
                  testId={`feature-${m}`}
                />
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
