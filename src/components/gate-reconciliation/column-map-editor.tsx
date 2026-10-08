"use client";

import { Input } from "@/components/ui/input";
import { DATE_FORMATS, MAP_FIELDS, type ColumnMap, type DateFormat } from "@/modules/gate-reconciliation/parse";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8 md:text-sm";

/**
 * Which column of the client's file feeds each field. With `headers` (a file is loaded) every field is a dropdown of the file's
 * columns; without, the column names are typed (the saved-mappings panel).
 */
export function ColumnMapEditor({
  value,
  onChange,
  headers,
  dateFormat,
  onDateFormat,
  idPrefix = "map",
}: {
  value: Partial<ColumnMap>;
  onChange: (next: Partial<ColumnMap>) => void;
  headers?: string[];
  dateFormat: DateFormat;
  onDateFormat: (f: DateFormat) => void;
  idPrefix?: string;
}) {
  const set = (k: keyof ColumnMap, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {MAP_FIELDS.map((f) => (
        <div key={f.key} className="min-w-0">
          <label htmlFor={`${idPrefix}-${f.key}`} className="mb-1 block text-xs font-medium text-muted-foreground">
            {f.label} {f.required && <span className="text-status-danger">*</span>}
          </label>
          {headers ? (
            <select id={`${idPrefix}-${f.key}`} data-testid={`${idPrefix}-${f.key}`} className={selectClass} value={value[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}>
              <option value="">{f.required ? "Choose column" : "Not in file"}</option>
              {headers.map((h, i) => (
                <option key={`${h}-${i}`} value={h}>
                  {h}
                </option>
              ))}
            </select>
          ) : (
            <Input id={`${idPrefix}-${f.key}`} data-testid={`${idPrefix}-${f.key}`} value={value[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} placeholder="Column heading" />
          )}
        </div>
      ))}
      <div className="min-w-0">
        <label htmlFor={`${idPrefix}-dateFormat`} className="mb-1 block text-xs font-medium text-muted-foreground">
          Date format
        </label>
        <select id={`${idPrefix}-dateFormat`} data-testid={`${idPrefix}-dateFormat`} className={selectClass} value={dateFormat} onChange={(e) => onDateFormat(e.target.value as DateFormat)}>
          {DATE_FORMATS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
