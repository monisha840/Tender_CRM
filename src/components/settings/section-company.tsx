"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { gstinError } from "@/lib/gst-validation";
import { saveGstinAction, saveOfficeAction, saveRegionAction, setSettingAction } from "@/modules/settings/actions";
import { companyProfileSchema, SETTING_KEYS } from "@/modules/settings/keys";
import type { SettingsPageData } from "@/modules/settings/queries";
import { ReadOnlyNote, SaveBar, SelectField, Section, Switch, TextField, fieldError, useRun } from "./controls";

type Props = { data: SettingsPageData; readOnly: boolean };

export function CompanySection({ data, readOnly }: Props) {
  const [form, setForm] = useState(data.company);
  const { run, pending, error } = useRun();
  const [touched, setTouched] = useState(false);
  const parsed = companyProfileSchema.safeParse(form);
  const errors: Record<string, string> = {};
  if (!parsed.success) for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
  const dirty = JSON.stringify(form) !== JSON.stringify(data.company);
  const set = (k: keyof typeof form) => (v: string) => { setTouched(true); setForm((f) => ({ ...f, [k]: v })); };
  const regionName = (id: string) => data.regions.find((r) => r.id === id)?.name ?? "";

  return (
    <div className="space-y-6">
      <ReadOnlyNote readOnly={readOnly} />
      <Section title="Company profile" description="Shown on documents and exports." testId="settings-company">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Company name" value={form.name} onChange={set("name")} disabled={readOnly} error={touched ? errors.name : null} testId="company-name" />
          <TextField label="Logo web address" value={form.logoUrl} onChange={set("logoUrl")} disabled={readOnly} error={touched ? errors.logoUrl : null} hint="https://... or /logo.png" />
          <div className="sm:col-span-2"><TextField label="Registered address" value={form.address} onChange={set("address")} disabled={readOnly} error={touched ? errors.address : null} /></div>
          <TextField label="Phone" value={form.phone} onChange={set("phone")} disabled={readOnly} />
          <TextField label="Email" value={form.email} onChange={set("email")} disabled={readOnly} error={touched ? errors.email : null} />
          <TextField label="CIN" value={form.cin} onChange={set("cin")} disabled={readOnly} />
          <TextField label="PAN" value={form.pan} onChange={set("pan")} disabled={readOnly} />
        </div>
        {!readOnly && (
          <SaveBar
            dirty={dirty}
            pending={pending}
            error={error}
            testId="company-save"
            disabled={!parsed.success}
            onSave={() => { setTouched(true); if (parsed.success) void run(() => setSettingAction({ key: SETTING_KEYS.companyProfile, value: parsed.data }), "Company profile saved"); }}
          />
        )}
      </Section>

      <Section title="Offices" description="Registered office, branches and regional offices.">
        <ul className="divide-y rounded-lg border" data-testid="office-list">
          {data.offices.map((o) => <OfficeRow key={o.id} office={o} regionLabel={regionName(o.regionId)} readOnly={readOnly} />)}
          {data.offices.length === 0 && <li className="p-3 text-sm text-muted-foreground">No offices yet. Add one under a region below.</li>}
        </ul>
      </Section>
    </div>
  );
}

function OfficeRow({ office, regionLabel, readOnly }: { office: SettingsPageData["offices"][number]; regionLabel: string; readOnly: boolean }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(office.name);
  const [address, setAddress] = useState(office.address);
  const { run, pending, error, fieldErrors } = useRun();
  if (!editing) {
    return (
      <li className="flex items-start justify-between gap-3 p-3">
        <div className="min-w-0 text-sm"><p className="font-medium">{office.name}</p><p className="text-muted-foreground">{regionLabel} · {office.kind.replace("_", " ").toLowerCase()} · {office.address}</p></div>
        {!readOnly && <Button variant="ghost" size="icon-sm" aria-label={`Edit ${office.name}`} onClick={() => setEditing(true)}><Pencil /></Button>}
      </li>
    );
  }
  return (
    <li className="space-y-3 p-3">
      <TextField label="Office name" value={name} onChange={setName} error={fieldError(fieldErrors, "name")} />
      <TextField label="Address" value={address} onChange={setAddress} error={fieldError(fieldErrors, "address")} />
      <div className="flex gap-2">
        <Button disabled={pending} onClick={async () => { if (await run(() => saveOfficeAction({ id: office.id, regionId: office.regionId, kind: office.kind, name, address }), "Office saved")) setEditing(false); }}>Save</Button>
        <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
      {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}
    </li>
  );
}

// ---------------------------------------------------------------------------------------------------------------

type GstRow = SettingsPageData["gstins"][number];

export function RegionsSection({ data, readOnly }: Props) {
  const [regionForm, setRegionForm] = useState<{ id?: string; name: string; code: string; stateId: string; isActive: boolean } | null>(null);
  const [gstForm, setGstForm] = useState<(Partial<GstRow> & { regionId?: string }) | null>(null);
  const stateName = (id: string) => data.states.find((s) => s.id === id)?.name ?? "";

  return (
    <div className="space-y-6">
      <ReadOnlyNote readOnly={readOnly} />
      <Section
        title="Regions"
        description="Operating regions. A deactivated region disappears from pickers but keeps its history."
        testId="settings-regions"
        actions={!readOnly && <Button variant="outline" data-testid="region-add" onClick={() => setRegionForm({ name: "", code: "", stateId: data.states[0]?.id ?? "", isActive: true })}><Plus data-icon="inline-start" />Add region</Button>}
      >
        {regionForm && <RegionForm key={regionForm.id ?? "new"} initial={regionForm} states={data.states} onClose={() => setRegionForm(null)} />}
        <ul className="divide-y rounded-lg border">
          {data.regions.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 p-3" data-testid="region-row">
              <div className="min-w-0 text-sm"><p className="font-medium">{r.name} <span className="text-muted-foreground">({r.code})</span></p><p className="text-muted-foreground">{stateName(r.stateId)}</p></div>
              <div className="flex items-center gap-2">
                <StatusBadge status={r.isActive ? "ACTIVE" : "INACTIVE"} />
                {!readOnly && <Button variant="ghost" size="icon-sm" aria-label={`Edit ${r.name}`} onClick={() => setRegionForm({ ...r })}><Pencil /></Button>}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="GSTINs"
        description="One per state registration. The check character is validated; mark a GSTIN as a placeholder until the real one is issued."
        testId="settings-gstins"
        actions={!readOnly && <Button variant="outline" data-testid="gstin-add" onClick={() => setGstForm({ gstin: "", legalName: data.company.name, stateId: data.states[0]?.id ?? "", panNumber: "", address: "", isActive: true, isPlaceholder: false })}><Plus data-icon="inline-start" />Add GSTIN</Button>}
      >
        {gstForm && <GstinForm key={gstForm.id ?? "new"} initial={gstForm} data={data} onClose={() => setGstForm(null)} />}
        <ul className="divide-y rounded-lg border">
          {data.gstins.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 p-3" data-testid="gstin-row">
              <div className="min-w-0 text-sm">
                <p className="tabular font-medium">{g.gstin}</p>
                <p className="text-muted-foreground">{g.legalName} · {stateName(g.stateId)} · {g.regionIds.map((id) => data.regions.find((r) => r.id === id)?.name).filter(Boolean).join(", ") || "No region"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {g.isPlaceholder && <span data-testid="gstin-placeholder" className="rounded-md bg-status-warning-tint px-2 py-0.5 text-xs text-status-warning">Placeholder</span>}
                <StatusBadge status={g.isActive ? "ACTIVE" : "INACTIVE"} />
                {!readOnly && <Button variant="ghost" size="icon-sm" aria-label={`Edit ${g.gstin}`} onClick={() => setGstForm({ ...g, regionId: g.regionIds[0] })}><Pencil /></Button>}
              </div>
            </li>
          ))}
          {data.gstins.length === 0 && <li className="p-3 text-sm text-muted-foreground">No GSTINs yet.</li>}
        </ul>
      </Section>
    </div>
  );
}

function RegionForm({ initial, states, onClose }: { initial: { id?: string; name: string; code: string; stateId: string; isActive: boolean }; states: SettingsPageData["states"]; onClose: () => void }) {
  const [f, setF] = useState(initial);
  const { run, pending, error, fieldErrors } = useRun();
  return (
    <div className="mb-4 space-y-3 rounded-lg border bg-muted/40 p-3" data-testid="region-form">
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="Region name" value={f.name} onChange={(v) => setF({ ...f, name: v })} error={fieldError(fieldErrors, "name")} testId="region-name" />
        <TextField label="Code" value={f.code} onChange={(v) => setF({ ...f, code: v.toUpperCase() })} error={fieldError(fieldErrors, "code")} testId="region-code" />
        <SelectField label="State" value={f.stateId} onChange={(v) => setF({ ...f, stateId: v })} options={states.map((s) => ({ value: s.id, label: s.name }))} />
      </div>
      <Switch label="Active" checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} />
      <div className="flex gap-2">
        <Button disabled={pending} data-testid="region-save" onClick={async () => { if (await run(() => saveRegionAction(f), "Region saved")) onClose(); }}>Save region</Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </div>
      {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}
    </div>
  );
}

function GstinForm({ initial, data, onClose }: { initial: Partial<GstRow> & { regionId?: string }; data: SettingsPageData; onClose: () => void }) {
  const [f, setF] = useState({
    id: initial.id, gstin: initial.gstin ?? "", legalName: initial.legalName ?? "", tradeName: initial.tradeName ?? "", stateId: initial.stateId ?? "", panNumber: initial.panNumber ?? "",
    address: initial.address ?? "", regionId: initial.regionId ?? "", isActive: initial.isActive ?? true, isPlaceholder: initial.isPlaceholder ?? false,
  });
  const { run, pending, error, fieldErrors } = useRun();
  const liveError = f.gstin.length >= 15 && !f.isPlaceholder ? gstinError(f.gstin) : null;
  return (
    <div className="mb-4 space-y-3 rounded-lg border bg-muted/40 p-3" data-testid="gstin-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="GSTIN" value={f.gstin} onChange={(v) => setF({ ...f, gstin: v.toUpperCase().slice(0, 15) })} error={fieldError(fieldErrors, "gstin") ?? liveError} hint="15 characters, e.g. 27AAAAA0000A1Z5" testId="gstin-input" />
        <TextField label="PAN" value={f.panNumber} onChange={(v) => setF({ ...f, panNumber: v.toUpperCase().slice(0, 10) })} error={fieldError(fieldErrors, "panNumber")} />
        <TextField label="Legal name" value={f.legalName} onChange={(v) => setF({ ...f, legalName: v })} error={fieldError(fieldErrors, "legalName")} />
        <TextField label="Trade name (optional)" value={f.tradeName} onChange={(v) => setF({ ...f, tradeName: v })} />
        <SelectField label="State" value={f.stateId} onChange={(v) => setF({ ...f, stateId: v })} options={data.states.map((s) => ({ value: s.id, label: `${s.name} (${s.gstStateCode})` }))} />
        <SelectField label="Region" value={f.regionId} onChange={(v) => setF({ ...f, regionId: v })} options={[{ value: "", label: "No region" }, ...data.regions.map((r) => ({ value: r.id, label: r.name }))]} />
        <div className="sm:col-span-2"><TextField label="Address" value={f.address} onChange={(v) => setF({ ...f, address: v })} error={fieldError(fieldErrors, "address")} /></div>
      </div>
      <Switch label="Active" checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} />
      <Switch label="Placeholder GSTIN" hint="Not issued yet. The checksum is not enforced, and the GSTIN is flagged everywhere it is listed." checked={f.isPlaceholder} onChange={(v) => setF({ ...f, isPlaceholder: v })} testId="gstin-placeholder-toggle" />
      <div className="flex gap-2">
        <Button disabled={pending} data-testid="gstin-save" onClick={async () => { if (await run(() => saveGstinAction({ ...f, tradeName: f.tradeName || undefined, regionId: f.regionId || undefined }), "GSTIN saved")) onClose(); }}>Save GSTIN</Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </div>
      {error && <p role="alert" className="text-sm text-status-danger" data-testid="gstin-error">{error}</p>}
    </div>
  );
}
