"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Right-align and use tabular numerals (amounts, quantities). */
  numeric?: boolean;
  /** Enables click-to-sort; return a string or number. */
  sortValue?: (row: T) => string | number;
  /**
   * How the column appears in the mobile card:
   * "title" (the card heading, one per table), "badge" (top-right status), "detail" (label: value, default), "hide".
   */
  mobile?: "title" | "badge" | "detail" | "hide";
  /** Extra classes for the desktop cells of this column. */
  className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  /** Row (and card) navigates here when set. */
  getRowHref?: (row: T) => string;
  /** Adds a search box that filters on this text. */
  search?: { placeholder?: string; getText: (row: T) => string };
  /** Filters (region, status, date range…) rendered beside the search box. */
  toolbar?: ReactNode;
  emptyMessage?: string;
  emptyAction?: { label: string; href?: string; onClick?: () => void };
  loading?: boolean;
  /** Rows shown initially; "Show more" reveals the next page. */
  pageSize?: number;
  /** Danger / warning rows get a coloured edge and tint (overdue, due in 1-2 days). Pair with a badge: colour is never the only signal. */
  getRowTone?: (row: T) => "danger" | "warning" | undefined;
  /** data-testid for each desktop row; mobile cards get `<rowTestId>-card`. */
  rowTestId?: string;
  /** Accessible name for the table. */
  caption: string;
  className?: string;
}

const toneRow = (t?: "danger" | "warning") => (t === "danger" ? "bg-status-danger/5 shadow-[inset_3px_0_0_var(--status-danger)]" : t === "warning" ? "shadow-[inset_3px_0_0_var(--status-warning)]" : undefined);
const toneCard = (t?: "danger" | "warning") => (t === "danger" ? "border-l-4 border-l-status-danger bg-status-danger/5" : t === "warning" ? "border-l-4 border-l-status-warning" : undefined);

/**
 * Responsive table. From `md` up it is a compact table; below that every row becomes a stacked
 * card showing the title, status badge and key fields, so there is never horizontal page scroll.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  getRowHref,
  search,
  toolbar,
  emptyMessage = "Nothing to show yet.",
  emptyAction,
  loading,
  pageSize = 25,
  caption,
  getRowTone,
  rowTestId,
  className,
}: DataTableProps<T>) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [visible, setVisible] = useState(pageSize);

  const processed = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = q && search ? rows.filter((r) => search.getText(r).toLowerCase().includes(q)) : rows;
    const col = sort && columns.find((c) => c.key === sort.key);
    if (sort && col?.sortValue) {
      const get = col.sortValue;
      out = [...out].sort((a, b) => {
        const x = get(a);
        const y = get(b);
        const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [rows, query, search, sort, columns]);

  const shown = processed.slice(0, visible);
  const titleCol = columns.find((c) => c.mobile === "title") ?? columns[0];
  const badgeCol = columns.find((c) => c.mobile === "badge");
  const detailCols = columns.filter((c) => c !== titleCol && c !== badgeCol && c.mobile !== "hide");

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));

  return (
    <div className={cn("space-y-3", className)}>
      {(search || toolbar) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {search && (
            <div className="relative sm:max-w-xs sm:flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setVisible(pageSize);
                }}
                placeholder={search.placeholder ?? "Search"}
                aria-label={search.placeholder ?? "Search"}
                className="pl-9"
              />
            </div>
          )}
          {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
        </div>
      )}

      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : processed.length === 0 ? (
        <div className="rounded-lg border bg-surface">
          <EmptyState message={query ? "No results match your search." : emptyMessage} action={query ? undefined : emptyAction} />
        </div>
      ) : (
        <>
          {/* Desktop / tablet table */}
          <div className="hidden overflow-hidden rounded-lg border bg-surface md:block">
            <table className="w-full text-sm">
              <caption className="sr-only">{caption}</caption>
              <thead className="border-b bg-background text-xs text-muted-foreground">
                <tr>
                  {columns.map((c) => {
                    const sorted = sort?.key === c.key ? sort.dir : null;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined}
                        className={cn("px-3 py-2 font-medium", c.numeric ? "text-right" : "text-left")}
                      >
                        {c.sortValue ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(c.key)}
                            className={cn("inline-flex items-center gap-1 rounded-sm hover:text-foreground", c.numeric && "flex-row-reverse")}
                          >
                            {c.header}
                            {sorted === "asc" ? <ArrowUp className="size-3" aria-hidden="true" /> : sorted === "desc" ? <ArrowDown className="size-3" aria-hidden="true" /> : null}
                          </button>
                        ) : (
                          c.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((row) => {
                  const href = getRowHref?.(row);
                  return (
                    <tr
                      key={getRowId(row)}
                      data-testid={rowTestId}
                      onClick={href ? () => router.push(href) : undefined}
                      className={cn("h-10 align-middle", href && "cursor-pointer hover:bg-accent-subtle", toneRow(getRowTone?.(row)))}
                    >
                      {columns.map((c, i) => (
                        <td key={c.key} className={cn("px-3 py-1.5", c.numeric && "tabular text-right", c.className)}>
                          {i === 0 && href ? (
                            <Link href={href} className="font-medium hover:text-accent-strong hover:underline">
                              {c.cell(row)}
                            </Link>
                          ) : (
                            c.cell(row)
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-2 md:hidden" aria-label={caption}>
            {shown.map((row) => {
              const href = getRowHref?.(row);
              const content = (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-sm font-medium">{titleCol.cell(row)}</div>
                    {badgeCol && <div className="shrink-0">{badgeCol.cell(row)}</div>}
                  </div>
                  {detailCols.length > 0 && (
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      {detailCols.map((c) => (
                        <div key={c.key} className={cn("min-w-0", c.numeric && "tabular")}>
                          <dt className="text-muted-foreground">{c.header}</dt>
                          <dd className="truncate text-foreground">{c.cell(row)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </>
              );
              return (
                <li key={getRowId(row)} data-testid={rowTestId ? `${rowTestId}-card` : undefined}>
                  {href ? (
                    <Link href={href} className={cn("flex min-h-11 items-center gap-2 rounded-lg border bg-surface p-3 active:bg-accent-subtle", toneCard(getRowTone?.(row)))}>
                      <div className="min-w-0 flex-1">{content}</div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  ) : (
                    <div className={cn("rounded-lg border bg-surface p-3", toneCard(getRowTone?.(row)))}>{content}</div>
                  )}
                </li>
              );
            })}
          </ul>

          {processed.length > shown.length && (
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>
                Showing {shown.length} of {processed.length}
              </span>
              <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + pageSize)}>
                Show more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
