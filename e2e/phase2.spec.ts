import path from "path";
import { expect, test, type Page } from "@playwright/test";

const artifacts = "/opt/cursor/artifacts";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByTestId("profile-Eric").click();
  await page.getByTestId("pin-input").fill("family-admin");
  await page.getByTestId("pin-submit").click();
  await page.waitForURL("**/home");
}

async function openPhase2(page: Page, viewport: { width: number; height: number }, suffix: string) {
  await page.setViewportSize(viewport);
  await signIn(page);
  await page.goto("/admin/style");
  await expect(page.getByTestId("style-page")).toBeVisible();
  await expect(page.getByTestId("style-tone")).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, `style_${suffix}.png`) });
  await page.getByTestId("lock-style").click();
  await expect(page.getByText(/Locked style version/)).toBeVisible();

  await page.goto("/admin/import");
  await page.getByTestId("import-file").setInputFiles(path.join(process.cwd(), "e2e/fixtures/kitchen.html"));
  await page.getByRole("button", { name: "Read document" }).click();
  await expect(page.getByTestId("import-preview")).toBeVisible();
  await expect(page.getByText("Z1.1 Boiling")).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, `import_preview_${suffix}.png`) });
  await page.getByTestId("import-apply").click();
  await page.waitForURL("**/admin/review/**");
  await expect(page.getByTestId("review-page")).toBeVisible();
  await expect(page.locator('input[name="title"]').first()).toHaveValue("What a boil is");
  await page.getByTestId("batch-approve").evaluate((element) => element.scrollIntoView({ block: "center" }));
  await expect(page.getByTestId("batch-approve")).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, `review_${suffix}.png`) });
}

test("phone style, import preview, and review", async ({ page }) => {
  await openPhase2(page, { width: 412, height: 915 }, "phone");
});

test("desktop style, import preview, and review", async ({ page }) => {
  await openPhase2(page, { width: 1280, height: 800 }, "desktop");
});
