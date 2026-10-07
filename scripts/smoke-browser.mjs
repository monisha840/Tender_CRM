// Dev smoke: signs in by cookie and visits pages, printing KPI testids, console errors and timings.
//   node scripts/smoke-browser.mjs <baseUrl> <cookieFile> [width]
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const [base, cookieFile, width = "1280"] = process.argv.slice(2);
const cookie = readFileSync(cookieFile, "utf8").trim();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: Number(width), height: 900 } });
await ctx.addCookies(cookie.split("; ").map((c) => {
  const i = c.indexOf("=");
  return { name: c.slice(0, i), value: c.slice(i + 1), url: base };
}));
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 300)));
for (const path of ["/dashboard", "/projects", "/subcontractors", "/tenders", "/approvals", "/daily-work", "/finance"]) {
  const t = Date.now();
  const res = await page.goto(base + path, { waitUntil: "load" });
  await page.waitForTimeout(800);
  const ids = await page.$$eval("[data-testid]", (els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getAttribute("data-testid")));
  const h1 = await page.$eval("h1", (e) => e.textContent).catch(() => "(no h1)");
  console.log(`${path} -> ${res?.status()} ${Date.now() - t}ms h1="${h1}" testids=${JSON.stringify([...new Set(ids)].slice(0, 30))}`);
  if (path === "/dashboard") {
    for (const id of ["kpi-active-tenders", "kpi-active-projects", "kpi-headcount"]) {
      const el = await page.$(`[data-testid="${id}"]`);
      console.log(`  ${id}: ${el ? (await el.innerText()).replace(/\n/g, " | ") : "(absent)"}`);
    }
    await page.screenshot({ path: `${process.env.SHOTS ?? "."}/dashboard-${width}.png`, fullPage: false });
  }
  if (path === "/projects" || path === "/subcontractors") await page.screenshot({ path: `${process.env.SHOTS ?? "."}/${path.slice(1)}-${width}.png` });
}
console.log("console errors:", errors.length ? errors : "none");
await browser.close();
