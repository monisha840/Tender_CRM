"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section, textareaClass } from "@/components/work/parts";
import { listProjects } from "@/lib/data";
import { getToday } from "@/lib/dates";
import { useDataStore } from "@/store/data-store";
import { useCurrentPersona, useDb } from "@/store/hooks";

const selectClass =
  "min-h-11 w-full rounded-lg border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function Form() {
  const db = useDb();
  const router = useRouter();
  const persona = useCurrentPersona();
  const upsert = useDataStore((s) => s.upsert);
  const params = useSearchParams();
  const projects = useMemo(() => listProjects(db).filter((r) => r.status.systemKey !== "COMPLETED"), [db]);
  const [projectId, setProjectId] = useState(params.get("project") ?? projects[0]?.project.id ?? "");
  const [date, setDate] = useState(getToday());
  const [work, setWork] = useState<{ boqItemId: string; qty: string }[]>([{ boqItemId: "", qty: "" }]);
  const [workers, setWorkers] = useState("");
  const [equipment, setEquipment] = useState<{ name: string; qty: string }[]>([]);
  const [issues, setIssues] = useState("");
  const [plan, setPlan] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);

  const project = projects.find((r) => r.project.id === projectId)?.project;
  const boq = db.boqItems.filter((b) => b.projectId === projectId);
  const valid = !!project && workers !== "" && work.some((w) => w.boqItemId && Number(w.qty) > 0);

  const submit = () => {
    if (!project || !valid) return;
    const now = new Date().toISOString();
    const reportId = `dr_new_${Date.now()}`;
    upsert("dailyReports", {
      id: reportId,
      createdAt: now,
      updatedAt: now,
      siteId: project.siteId,
      projectId: project.id,
      regionId: project.regionId,
      reportDate: date,
      status: "SUBMITTED",
      workersCount: Number(workers),
      issues: issues.trim() || null,
      planForTomorrow: plan.trim() || null,
      photoCount: photos.length,
      submittedById: persona.user.id,
      submittedAt: now,
    });
    work
      .filter((w) => w.boqItemId && Number(w.qty) > 0)
      .forEach((w, i) =>
        upsert("dailyWorkItems", { id: `${reportId}_i${i}`, createdAt: now, updatedAt: now, reportId, boqItemId: w.boqItemId, plannedQty: w.qty, completedQty: w.qty }),
      );
    toast.success("Report submitted");
    router.push(`/daily-work/${reportId}`);
  };

  return (
    <>
      <PageHeader title="New daily report" description="Fill in what happened on site today." />
      <div className="max-w-2xl space-y-6 pb-4">
        <Field label="Project" htmlFor="project">
          <select id="project" className={selectClass} value={projectId} onChange={(e) => { setProjectId(e.target.value); setWork([{ boqItemId: "", qty: "" }]); }}>
            {projects.map((r) => (
              <option key={r.project.id} value={r.project.id}>
                {r.project.name} — {r.site?.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date" htmlFor="date">
          <Input id="date" type="date" value={date} max={getToday()} onChange={(e) => setDate(e.target.value)} className="min-h-11" />
        </Field>

        <Section title="Work done">
          <div className="space-y-3">
            {work.map((w, i) => {
              const unit = boq.find((b) => b.id === w.boqItemId)?.unit;
              return (
                <div key={i} className="space-y-2 rounded-lg border bg-surface p-3">
                  <select aria-label="Work item" className={selectClass} value={w.boqItemId} onChange={(e) => setWork(work.map((x, j) => (j === i ? { ...x, boqItemId: e.target.value } : x)))}>
                    <option value="">Select work item</option>
                    {boq.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.itemNo} {b.description}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <Input aria-label="Quantity done" inputMode="decimal" placeholder="Quantity done" value={w.qty} onChange={(e) => setWork(work.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} className="min-h-11" />
                    <span className="w-14 shrink-0 text-sm text-muted-foreground">{unit ?? "unit"}</span>
                    {work.length > 1 && (
                      <Button variant="ghost" size="icon" aria-label="Remove work item" onClick={() => setWork(work.filter((_, j) => j !== i))}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            <Button variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => setWork([...work, { boqItemId: "", qty: "" }])}>
              <Plus data-icon="inline-start" aria-hidden="true" />
              Add work item
            </Button>
          </div>
        </Section>

        <Field label="Workers on site" htmlFor="workers">
          <Input id="workers" inputMode="numeric" placeholder="Number of workers" value={workers} onChange={(e) => setWorkers(e.target.value.replace(/\D/g, ""))} className="min-h-11" />
        </Field>

        <Section title="Equipment used">
          <div className="space-y-2">
            {equipment.map((eq, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input aria-label="Equipment" placeholder="e.g. Crane, Compressor" value={eq.name} onChange={(e) => setEquipment(equipment.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="min-h-11" />
                <Input aria-label="Equipment count" inputMode="numeric" placeholder="Qty" value={eq.qty} onChange={(e) => setEquipment(equipment.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/\D/g, "") } : x)))} className="min-h-11 w-20 shrink-0" />
                <Button variant="ghost" size="icon" aria-label="Remove equipment" onClick={() => setEquipment(equipment.filter((_, j) => j !== i))}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => setEquipment([...equipment, { name: "", qty: "" }])}>
              <Plus data-icon="inline-start" aria-hidden="true" />
              Add equipment
            </Button>
          </div>
        </Section>

        <Field label="Issues" htmlFor="issues">
          <textarea id="issues" rows={3} className={textareaClass} placeholder="Delays, shortages, safety concerns (leave blank if none)" value={issues} onChange={(e) => setIssues(e.target.value)} />
        </Field>

        <Section title="Photos">
          <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed bg-surface px-4 py-6 text-sm focus-within:ring-2 focus-within:ring-ring">
            <Camera className="size-5 text-muted-foreground" aria-hidden="true" />
            {photos.length ? `${photos.length} photo${photos.length === 1 ? "" : "s"} selected — add more` : "Take or choose photos"}
            <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => setPhotos([...photos, ...Array.from(e.target.files ?? [])])} />
          </label>
        </Section>

        <Field label="Plan for tomorrow" htmlFor="plan">
          <textarea id="plan" rows={3} className={textareaClass} placeholder="What will be done next" value={plan} onChange={(e) => setPlan(e.target.value)} />
        </Field>
      </div>

      <div className="sticky bottom-14 -mx-4 border-t bg-surface px-4 py-3 md:bottom-0 md:mx-0 md:max-w-2xl md:rounded-lg md:border">
        <Button className="min-h-11 w-full" disabled={!valid} onClick={submit}>
          Submit report
        </Button>
        {!valid && <p className="mt-1.5 text-center text-xs text-muted-foreground">Add at least one work item and the worker count.</p>}
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Form />
    </Suspense>
  );
}
