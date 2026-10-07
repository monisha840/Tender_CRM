import type { Locator, Page } from "@playwright/test";
import { action, orTestId } from "./ui";

// Page objects. Semantic selectors first, data-testid fallback (contract: docs/e2e-testids.md).

export class LoginPage {
  constructor(private page: Page) {}
  goto() {
    return this.page.goto("/login");
  }
  async login(email: string, password: string) {
    await this.page.getByLabel(/email/i).fill(email);
    await this.page.getByLabel(/password/i).fill(password);
    await this.page.getByRole("button", { name: /sign in/i }).click();
  }
  error(): Locator {
    return this.page.getByRole("alert").filter({ hasText: /\S/ });
  }
}

export class DashboardPage {
  constructor(private page: Page) {}
  goto() {
    return this.page.goto("/dashboard");
  }
  heading() {
    return this.page.getByRole("heading").first();
  }
  /** Tile whose label says "Active tenders". */
  activeTendersTile(): Locator {
    return orTestId(
      this.page,
      this.page.getByRole("group", { name: /active tenders/i }).or(this.page.getByText(/^active tenders$/i).first().locator("xpath=../..")),
      "kpi-active-tenders",
    ).first();
  }
}

export class TendersListPage {
  constructor(private page: Page) {}
  goto() {
    return this.page.goto("/tenders");
  }
  rows() {
    return this.page.getByRole("row").or(this.page.getByTestId("tender-row"));
  }
  create() {
    return action(this.page, /^(new|add|register|create)\b.*tender|^new$|^add tender$/i, "tender-create");
  }
  search(text: string) {
    return this.page.getByRole("searchbox").or(this.page.getByPlaceholder(/search/i)).first().fill(text);
  }
  open(text: string | RegExp) {
    return this.page.getByRole("link", { name: text }).first().click();
  }
}

export class TenderDetailPage {
  constructor(private page: Page) {}
  heading() {
    return this.page.getByRole("heading").first();
  }
  goNoGo() {
    return action(this.page, /request.*(go|approval)|go\s*\/\s*no-?go|submit for approval/i, "go-nogo-request");
  }
  markWon() {
    return action(this.page, /mark.*won|^won$/i, "mark-won");
  }
  convert() {
    return action(this.page, /convert.*project|^convert\b/i, "convert");
  }
}
