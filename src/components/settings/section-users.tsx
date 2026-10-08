"use client";

import { useState } from "react";
import { KeyRound, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/dates";
import { sendPasswordResetAction, updateUserAction } from "@/modules/settings/actions";
import type { SettingsPageData } from "@/modules/settings/queries";
import { ReadOnlyNote, Section, SelectField, Switch, TextField, fieldError, useRun } from "./controls";

type User = SettingsPageData["users"][number];

export function UsersSection({ data, readOnly }: { data: SettingsPageData; readOnly: boolean }) {
  const [editing, setEditing] = useState<User | null>(null);
  const reset = useRun();
  return (
    <div className="space-y-6">
      <ReadOnlyNote readOnly={readOnly} />
      <Section title="Users and roles" description="Everyone who can sign in. A System Admin enters data; a Director views everything and approves." testId="settings-users">
        {editing && <UserForm key={editing.id} user={editing} roles={data.roles} onClose={() => setEditing(null)} />}
        {!readOnly && !data.canResetPasswords && <p className="mb-3 text-xs text-muted-foreground">Password reset emails need the Supabase service-role key, which is not set on this server.</p>}
        <ul className="divide-y rounded-lg border">
          {data.users.map((u) => (
            <li key={u.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between" data-testid="user-row">
              <div className="min-w-0 text-sm">
                <p className="font-medium">{u.name}</p>
                <p className="truncate text-muted-foreground">{u.email} · {u.roleName ?? "No role"}{u.lastLoginAt ? ` · last sign-in ${formatDateTime(u.lastLoginAt)}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={u.isActive ? "ACTIVE" : "INACTIVE"} />
                {!readOnly && (
                  <>
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${u.name}`} data-testid="user-edit" onClick={() => setEditing(u)}><Pencil /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Send password reset to ${u.name}`} disabled={!data.canResetPasswords || !u.isActive || reset.pending} onClick={() => void reset.run(() => sendPasswordResetAction({ id: u.id }), `Password reset email sent to ${u.email}`)}><KeyRound /></Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
        {reset.error && <p role="alert" className="mt-2 text-sm text-status-danger">{reset.error}</p>}
      </Section>
    </div>
  );
}

function UserForm({ user, roles, onClose }: { user: User; roles: SettingsPageData["roles"]; onClose: () => void }) {
  const [f, setF] = useState({ name: user.name, roleKey: user.roleKey ?? roles[0]?.key ?? "", isActive: user.isActive });
  const { run, pending, error, fieldErrors } = useRun();
  return (
    <div className="mb-4 space-y-3 rounded-lg border bg-muted/40 p-3" data-testid="user-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} error={fieldError(fieldErrors, "name")} />
        <SelectField label="Role" value={f.roleKey} onChange={(v) => setF({ ...f, roleKey: v })} options={roles.map((r) => ({ value: r.key, label: r.name }))} />
      </div>
      <Switch label="Active" hint="An inactive user cannot sign in." checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} />
      <div className="flex gap-2">
        <Button disabled={pending || f.name.trim().length < 2} data-testid="user-save" onClick={async () => { if (await run(() => updateUserAction({ id: user.id, ...f }), "User saved")) onClose(); }}>Save user</Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </div>
      {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}
    </div>
  );
}
