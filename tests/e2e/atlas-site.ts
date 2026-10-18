import { expect, type Page } from "@playwright/test";

// The atlas has no site dropdown: sites are picked from the inspector's ranked list.
export async function pickSite(page: Page, id: string) {
  const back = page.getByRole("button", { name: "Back to all sites" });
  if (await back.isVisible()) await back.click();
  await page.locator(`.atlas-site-list button[data-site-id="${id}"]`).click();
}

export async function expectSite(page: Page, id: string) {
  await expect(page.locator(".atlas-site-heading")).toHaveAttribute("data-site-id", id);
}
