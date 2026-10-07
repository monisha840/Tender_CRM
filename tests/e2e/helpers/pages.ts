import type { Page } from "@playwright/test";

// Page-object stubs. TODO-verify selectors/routes once the real UI exists.

export class LoginPage {
  constructor(private page: Page) {}
  goto() { return this.page.goto("/login"); }
  async login(email: string, password: string) {
    await this.page.getByLabel(/email/i).fill(email);
    await this.page.getByLabel(/password/i).fill(password);
    await this.page.getByRole("button", { name: /sign in/i }).click();
  }
}

export class DashboardPage {
  constructor(private page: Page) {}
  goto() { return this.page.goto("/dashboard"); }
  heading() { return this.page.getByRole("heading").first(); }
}

export class TendersListPage {
  constructor(private page: Page) {}
  goto() { return this.page.goto("/tenders"); }
  rows() { return this.page.getByRole("row"); }
  open(text: string | RegExp) { return this.page.getByRole("link", { name: text }).first().click(); }
}

export class TenderDetailPage {
  constructor(private page: Page) {}
  heading() { return this.page.getByRole("heading").first(); }
  action(name: string | RegExp) { return this.page.getByRole("button", { name }); }
}
