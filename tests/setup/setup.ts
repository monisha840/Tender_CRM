import { afterEach } from "vitest";
import { setAsOfDate } from "@/lib/dates";

// The "as of" date is module state; make sure no test leaks it into the next one.
afterEach(() => setAsOfDate(null));
