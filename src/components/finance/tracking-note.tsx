import { Info } from "lucide-react";

/** Boundary of the module: this is a tracking layer, not the books. */
export function TrackingNote() {
  return (
    <div className="mb-4 flex gap-2 rounded-lg border bg-accent-subtle p-3 text-sm" role="note">
      <Info className="mt-0.5 size-4 shrink-0 text-accent-strong" aria-hidden="true" />
      <p>
        <span className="font-medium">A tracking layer, not an accounting system.</span>{" "}
        <span className="text-muted-foreground">
          This view tracks invoices, receivables and GST filing status for follow-up. Statutory books, GST returns and TDS stay in your
          accounting software or with your CA.
        </span>
      </p>
    </div>
  );
}
