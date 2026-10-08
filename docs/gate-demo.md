# Gate attendance demo file

`public/demo/gate-attendance-demo.csv` is a fake client gate export (columns `Worker ID, Worker Name, Date, In Time, Out Time, Hours, Shift`, dates `DD-MM-YYYY`) for **SPH-CG-001 (Stone picking manpower, CHP: NTPC Korba), August 2026** (`2026-08`).

It is generated offline from the deterministic demo seed (no database access):

```
npx tsx scripts/make-demo-gate-file.ts
```

Generator code: `src/modules/gate-reconciliation/demo.ts`. Our side is the seed's attendance for that project and month (workers `emp_w_p1_ntpc_stone_*`); hours = `dayFraction x 8 + overtimeMinutes / 60`.

## Planted mismatches (expected result)

| Kind | Count | How it is planted |
|---|---|---|
| MISSING_IN_OURS | 3 | gate shows a worker on a day we marked absent / on leave (2), plus an unknown badge `GX-9001` (1) |
| MISSING_IN_THEIRS | 4 | four worked days we recorded are left out of the gate file |
| HOURS_MISMATCH | 2 | one row +1.5 h, one row -2 h against ours (tolerance 0.5 h) |
| SHIFT_MISMATCH | 2 | same hours, gate shift `N` (night) where we have a general shift |

Reconciling the file against the seed must give: **11 exceptions, 506 matched worker-days, 517 compared, 97.9% matched** ("97.9% matched, 11 exceptions").

These numbers are pinned in `src/modules/gate-reconciliation/__tests__/gate.test.ts` (which also checks the committed CSV equals the generator output) and asserted by `tests/e2e/enhancement/gate-reconciliation.spec.ts`. If the seed changes, regenerate the file and update both.

The demo database must contain the seed's attendance for SPH-CG-001 in August 2026 (loaded by the normal seed) for the upload to give these counts.

## Settings used

| Setting key | Default | Meaning |
|---|---|---|
| `gate.hoursToleranceHrs` | 0.5 | hours may differ by up to this much before HOURS_MISMATCH |
| `gate.shiftHours` | 8 | hours in one full day on our side; also the hours assumed for a gate row with no hours / in-out |

Shift comparison: our side is `HALF` for a half day, otherwise `GENERAL`. The gate shift is normalised (`G/GEN/DAY/A` general, `H/HALF` half, `B/EVENING` evening, `N/C/NIGHT` night); an unrecognised or blank shift is not compared.
