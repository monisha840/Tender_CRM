"use client";

import { useRef } from "react";
import { Download, FileDown, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadCsv, parseCsv, toCsv } from "@/lib/csv";

export interface ImportResult {
  imported: number;
  /** One message per rejected row, e.g. "Row 3: Organisation not found". */
  errors: string[];
}

interface Props {
  /** File name without extension, e.g. "tenders". */
  filename: string;
  /** Column headers, also used for the import template. */
  headers: string[];
  /** The rows currently shown, already flattened to strings in `headers` order. */
  rows: (string | number | null | undefined)[][];
  /** Omit for sections that are export-only. Receives one record per CSV row, keyed by header. */
  onImport?: (records: Record<string, string>[]) => ImportResult | Promise<ImportResult>;
}

/** Export (CSV of what is on screen), Import (CSV file) and a template download. Same look in every section. */
export function ImportExport({ filename, headers, rows, onImport }: Props) {
  const input = useRef<HTMLInputElement>(null);

  const exportRows = () => {
    if (rows.length === 0) {
      toast.info("Nothing to export with the current filters");
      return;
    }
    downloadCsv(filename, toCsv(headers, rows));
    toast.success(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"}`);
  };

  const readFile = async (file: File) => {
    if (!onImport) return;
    const records = parseCsv(await file.text());
    if (records.length === 0) {
      toast.error("No rows found. Use the template: the first row must be the column headers.");
      return;
    }
    const { imported, errors } = await onImport(records);
    if (imported > 0) toast.success(`Imported ${imported} row${imported === 1 ? "" : "s"}${errors.length ? `, ${errors.length} skipped` : ""}`);
    if (errors.length) toast.error(errors.slice(0, 3).join("\n") + (errors.length > 3 ? `\n…and ${errors.length - 3} more` : ""), { duration: 8000 });
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Import and export">
      {onImport && (
        <>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void readFile(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => input.current?.click()}>
            <Upload data-icon="inline-start" aria-hidden="true" />
            Import CSV
          </Button>
          <Button variant="ghost" onClick={() => downloadCsv(`${filename}-template`, toCsv(headers, []))}>
            <FileDown data-icon="inline-start" aria-hidden="true" />
            Template
          </Button>
        </>
      )}
      <Button variant="outline" onClick={exportRows}>
        <Download data-icon="inline-start" aria-hidden="true" />
        Export CSV
      </Button>
    </div>
  );
}
