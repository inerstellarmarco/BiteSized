import path from "path";
import { expect, test, type Page } from "@playwright/test";

const artifacts = "/opt/cursor/artifacts";

async function signIn(page: Page) {
  await page.goto("/");
  if (page.url().includes("/home")) return;
  await page.getByTestId("profile-Eric").click();
  await page.getByTestId("pin-input").fill("family-admin");
  await page.getByTestId("pin-submit").click();
  await page.waitForURL("**/home");
}

async function prepare(page: Page) {
  await signIn(page);
  await page.goto("/admin/style");
  await page.getByTestId("lock-style").click();
  await expect(page.getByText(/Version \d+/).first()).toBeVisible();
}

test("phone regenerate, personal version, flags, and placement", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await prepare(page);
  await page.goto("/learn/sll_a1_1_2");
  await page.getByTestId("regenerate-menu").click();
  await expect(page.getByTestId("regenerate-options")).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, "regenerate_phone.png") });
  await page.getByTestId("preset-simpler").click();
  await page.getByTestId("save-personal").click();
  await expect(page.getByTestId("personal-badge")).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, "personal_version_phone.png") });
  await page.getByTestId("flag-rework").click();
  await page.goto("/admin/flags");
  await expect(page.getByTestId("flag-list")).toBeVisible();
  await expect(page.getByText("rework", { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, "flags_phone.png") });
  await page.goto("/propose");
  await page.getByTestId("proposal-title").fill("Boiling point of tea");
  await page.getByRole("button", { name: "Suggest a place" }).click();
  await expect(page.getByText("Sent for placement")).toBeVisible();
  await page.goto("/admin/proposals");
  await expect(page.getByTestId("placement-approval")).toBeVisible();
  await expect(page.getByText("Boiling point of tea")).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, "placement_phone.png") });
});

test("desktop regenerate, personal version, flags, and placement", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await prepare(page);
  await page.goto("/learn/sll_a1_1_1");
  await page.getByTestId("regenerate-menu").click();
  await expect(page.getByTestId("regenerate-options")).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, "regenerate_desktop.png") });
  await page.getByTestId("preset-analogy").click();
  await page.getByTestId("save-personal").click();
  await expect(page.getByTestId("personal-badge")).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, "personal_version_desktop.png") });
  await page.getByTestId("flag-rework").click();
  await page.goto("/admin/flags");
  await expect(page.getByTestId("flag-list")).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, "flags_desktop.png") });
  await page.goto("/admin/proposals");
  await expect(page.getByTestId("placement-approval")).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, "placement_desktop.png") });
});
