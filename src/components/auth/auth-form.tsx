"use client";

import { Suspense, useActionState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AuthFormState } from "@/lib/auth/actions";

export interface AuthField {
  name: string;
  label: string;
  type: "email" | "password";
  autoComplete: string;
  hint?: string;
}

interface AuthFormProps {
  title: string;
  description: string;
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  fields: AuthField[];
  submitLabel: string;
  pendingLabel: string;
  /** Shown above the form when the URL has ?error=link (expired or reused email link). */
  linkNotice?: string;
  footer?: ReactNode;
}

function LinkNotice({ message }: { message: string }) {
  const params = useSearchParams();
  if (params.get("error") !== "link") return null;
  return (
    <p role="status" className="mt-4 flex items-start gap-2 rounded-md bg-accent-subtle px-3 py-2 text-sm">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-accent-strong" aria-hidden="true" />
      {message}
    </p>
  );
}

/** Centered single-column card used by every pre-login screen; fine at 360px, inputs and button are 44px tall on touch. */
export function AuthForm({ title, description, action, fields, submitLabel, pendingLabel, linkNotice, footer }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <Brand className="mb-6 justify-center" />
        <div className="rounded-lg border bg-surface p-5 sm:p-6">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>

          {linkNotice && (
            <Suspense>
              <LinkNotice message={linkNotice} />
            </Suspense>
          )}

          <form action={formAction} className="mt-5 space-y-4" noValidate>
            {fields.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <label htmlFor={f.name} className="text-sm font-medium">
                  {f.label}
                </label>
                <Input
                  id={f.name}
                  name={f.name}
                  type={f.type}
                  autoComplete={f.autoComplete}
                  required
                  aria-invalid={state.error ? true : undefined}
                  aria-describedby={f.hint ? `${f.name}-hint` : undefined}
                />
                {f.hint && (
                  <p id={`${f.name}-hint`} className="text-xs text-muted-foreground">
                    {f.hint}
                  </p>
                )}
              </div>
            ))}

            {state.error && (
              <p role="alert" className="flex items-start gap-2 text-sm text-status-danger">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {state.error}
              </p>
            )}
            {state.message && (
              <p role="status" className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-success" aria-hidden="true" />
                {state.message}
              </p>
            )}

            <Button type="submit" className="h-11 w-full md:h-9" disabled={pending}>
              {pending ? pendingLabel : submitLabel}
            </Button>
          </form>
        </div>
        {footer && <div className="mt-4 text-center text-sm">{footer}</div>}
      </div>
    </main>
  );
}

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center text-accent-strong underline-offset-4 hover:underline md:min-h-0">
      {children}
    </Link>
  );
}
