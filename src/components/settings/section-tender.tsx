"use client";

import { useState } from "react";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import {
  addChecklistItemAction, removeChecklistItemAction, reorderStagesAction, saveStageAction, toggleChecklistMandatoryAction,
} from "@/modules/settings/actions";
import { STAGE_COLOR_TOKENS, type StageColorToken } from "@/modules/settings/keys";
import type { SettingsPageData } from "@/modules/settings/queries";
import { ReadOnlyNote, ReorderList, Section, SelectField, Switch, TextField, fieldError, useRun } from "./controls";

type Props = { data: SettingsPageData; readOnly: boolean };
type Stage = SettingsPageData["stages"][number];

export const KIND_LABEL: Record<string, string> = { OPEN: "In progress", WON: "Won", LOST: "Lost", NO_GO: "No-Go", TERMINAL: "Closed" };
const COLOR_LABEL: Record<StageColorToken, string> = { neutral: "Grey", accent: "Yellow", success: "Green", warning: "Orange", danger: "Red" };
export const TONE_CLASS: Record<StageColorToken, string> = {
  neutral: "bg-status-neutral-tint text-status-neutral",
  accent: "bg-accent-subtle text-accent-strong",
  success: "bg-status-success-tint text-status-success",
  warning: "bg-status-warning-tint text-status-warning",
  danger: "bg-status-danger-tint text-status-danger",
};

export function StagesSection({ data, readOnly }: Props) {
  const [order, setOrder] = useState<string[]>(data.stages.map((s) => s.id));
  const [editing, setEditing] = useState<Partial<Stage> | null>(null);
  const reorder = useRun();
  // Follow the server after a refresh (e.g. another admin's change).
  const serverKey = data.stages.map((s) => s.id).join(",");
  const [seenKey, setSeenKey] = useState(serverKey);
  if (seenKey !== serverKey) { setSeenKey(serverKey); setOrder(serverKey.split(",")); }
  const byId = new Map(data.stages.map((s) => [s.id, s]));
  const items = order.map((id) => byId.get(id)).filter((s): s is Stage => !!s);

  async function onReorder(next: string[]) {
    const prev = order;
    setOrder(next);
    if (!(await reorder.run(() => reorderStagesAction({ orderedIds: next }), "Stage order saved"))) setOrder(prev);
  }

  return (
    <div className="space-y-6">
      <ReadOnlyNote readOnly={readOnly} />
      <Section
        title="Tender stages"
        description="Drag the grip to reorder, or use the arrows. Won and Lost come from the stage meaning, not its name."
        testId="settings-stages"
        actions={!readOnly && <Button variant="outline" data-testid="stage-add" onClick={() => setEditing({ name: "", kind: "OPEN", color: null, isActive: true })}><Plus data-icon="inline-start" />Add stage</Button>}
      >
        {editing && <StageForm key={editing.id ?? "new"} initial={editing} onClose={() => setEditing(null)} />}
        {reorder.error && <p role="alert" className="mb-2 text-sm text-status-danger">{reorder.error}</p>}
        <ReorderList
          label="Tender stages"
          testIdPrefix="stage"
          items={items}
          disabled={readOnly || reorder.pending}
          onChange={(ids) => void onReorder(ids)}
          render={(s) => (
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className={cn("rounded-md px-2 py-0.5 text-sm font-medium", TONE_CLASS[(s.color as StageColorToken) ?? "neutral"] ?? TONE_CLASS.neutral)} data-testid="stage-name">{s.name}</span>
                <span className="text-xs text-muted-foreground">{KIND_LABEL[s.kind] ?? s.kind}</span>
                {s.systemKey && <Lock aria-label="System stage" className="size-3 text-muted-foreground" />}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <StatusBadge status={s.isActive ? "ACTIVE" : "INACTIVE"} />
                {!readOnly && <Button variant="ghost" size="icon-sm" aria-label={`Edit ${s.name}`} data-testid="stage-edit" onClick={() => setEditing(s)}><Pencil /></Button>}
              </div>
            </div>
          )}
        />
      </Section>
    </div>
  );
}

function StageForm({ initial, onClose }: { initial: Partial<Stage>; onClose: () => void }) {
  const [f, setF] = useState({ name: initial.name ?? "", kind: initial.kind ?? "OPEN", color: (initial.color as StageColorToken | null) ?? null, isActive: initial.isActive ?? true });
  const { run, pending, error, fieldErrors } = useRun();
  const locked = !!initial.systemKey;
  const nameError = f.name.trim().length > 0 && f.name.trim().length < 2 ? "Enter the stage name" : null;
  return (
    <div className="mb-4 space-y-3 rounded-lg border bg-muted/40 p-3" data-testid="stage-form">
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="Stage name" value={f.name} onChange={(v) => setF({ ...f, name: v })} error={fieldError(fieldErrors, "name") ?? nameError} testId="stage-name-input" />
        <SelectField label="Meaning" value={f.kind} disabled={locked} onChange={(v) => setF({ ...f, kind: v })} options={Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))} hint={locked ? "System stage: meaning is fixed." : undefined} />
        <SelectField label="Colour" value={f.color ?? ""} onChange={(v) => setF({ ...f, color: (v || null) as StageColorToken | null })} options={[{ value: "", label: "Default" }, ...STAGE_COLOR_TOKENS.map((t) => ({ value: t, label: COLOR_LABEL[t] }))]} />
      </div>
      <Switch label="Active" checked={f.isActive} disabled={locked} onChange={(v) => setF({ ...f, isActive: v })} hint={locked ? "System stages cannot be deactivated." : undefined} />
      <div className="flex gap-2">
        <Button disabled={pending || f.name.trim().length < 2} data-testid="stage-save" onClick={async () => { if (await run(() => saveStageAction({ id: initial.id, ...f }), "Stage saved")) onClose(); }}>Save stage</Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </div>
      {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------

export function ChecklistSection({ data, readOnly }: Props) {
  const [typeId, setTypeId] = useState(data.tenderTypes[0]?.id ?? "");
  const [docId, setDocId] = useState("");
  const [newDoc, setNewDoc] = useState("");
  const [mandatory, setMandatory] = useState(true);
  const { run, pending, error } = useRun();
  const docName = (id: string) => data.documentTypes.find((d) => d.id === id)?.name ?? "Document";
  const rows = data.checklist.filter((c) => c.tenderTypeId === typeId);
  const used = new Set(rows.map((r) => r.documentTypeId));
  const available = data.documentTypes.filter((d) => !used.has(d.id));

  return (
    <div className="space-y-6">
      <ReadOnlyNote readOnly={readOnly} />
      <Section title="Tender document checklists" description="Documents required for each tender type. A new tender copies this list; existing tenders keep theirs." testId="settings-checklist">
        <div className="mb-4 max-w-sm">
          <SelectField label="Tender type" value={typeId} onChange={setTypeId} options={data.tenderTypes.map((t) => ({ value: t.id, label: t.name }))} testId="checklist-type" />
        </div>
        <ul className="divide-y rounded-lg border" data-testid="checklist-list">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-1" data-testid="checklist-row">
              <span className="min-w-0 text-sm font-medium">{docName(r.documentTypeId)}</span>
              <div className="flex shrink-0 items-center gap-2">
                <Switch label="Mandatory" checked={r.isMandatory} disabled={readOnly || pending} onChange={(v) => void run(() => toggleChecklistMandatoryAction({ id: r.id, isMandatory: v }), "Checklist updated")} testId="checklist-mandatory" />
                {!readOnly && <Button variant="ghost" size="icon-sm" aria-label={`Remove ${docName(r.documentTypeId)}`} onClick={() => void run(() => removeChecklistItemAction({ id: r.id }), "Document removed")}><Trash2 /></Button>}
              </div>
            </li>
          ))}
          {rows.length === 0 && <li className="p-3 text-sm text-muted-foreground">No documents on this checklist yet.</li>}
        </ul>
        {!readOnly && (
          <div className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
            <SelectField label="Add existing document" value={docId} onChange={setDocId} options={[{ value: "", label: "Choose..." }, ...available.map((d) => ({ value: d.id, label: d.name }))]} />
            <TextField label="Or a new document" value={newDoc} onChange={setNewDoc} placeholder="e.g. Labour licence" />
            <Switch label="Mandatory" checked={mandatory} onChange={setMandatory} />
            <Button
              disabled={pending || !typeId || (!docId && newDoc.trim().length < 2)}
              data-testid="checklist-add"
              onClick={async () => { if (await run(() => addChecklistItemAction({ tenderTypeId: typeId, documentTypeId: docId || undefined, newDocumentTypeName: docId ? undefined : newDoc.trim(), isMandatory: mandatory }), "Document added")) { setDocId(""); setNewDoc(""); } }}
            >Add</Button>
          </div>
        )}
        {error && <p role="alert" className="mt-2 text-sm text-status-danger">{error}</p>}
      </Section>
    </div>
  );
}
