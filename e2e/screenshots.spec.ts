import path from "path";
import { expect, test } from "@playwright/test";

const artifacts = "/opt/cursor/artifacts";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByTestId("profile-Eric").click();
  await page.getByTestId("pin-input").fill("family-admin");
  await page.getByTestId("pin-submit").click();
  await page.waitForURL("**/home");
}

async function openLearn(page: import("@playwright/test").Page) {
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === "POST" && response.ok()),
    page.goto("/learn/sll_a1_1_2"),
  ]);
  await expect(page.getByTestId("learn-title")).toHaveText("Conditionals");
  await expect(page.getByTestId("diagram").locator("svg")).toBeVisible({ timeout: 20000 });
}

test("phone learn, quiz, result, and course tree", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await signIn(page);
  await openLearn(page);
  await expect(page.getByTestId("swipe-hint")).toBeVisible();
  await expect(page.getByTestId("learn-next")).toBeHidden();
  await page.screenshot({ path: path.join(artifacts, "learn_phone.png") });

  await page.goto("/course");
  await expect(page.getByTestId("sublesson-sll_a1_1_2")).toContainText("1 of 2 bites");
  await page.screenshot({ path: path.join(artifacts, "course_tree_phone.png") });

  await page.goto("/quiz/sll_a1_1_2");
  await page.getByTestId("quiz-start").click();
  await expect(page.getByTestId("quiz-prompt")).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, "quiz_phone.png") });

  for (let index = 0; index < 4; index += 1) {
    await page.getByTestId(index === 1 ? "quiz-choice-a" : "quiz-choice-b").click();
    await page.getByTestId("quiz-answer").click();
    await expect(page.getByTestId("quiz-feedback")).toBeVisible();
    await page.getByTestId("quiz-next").click();
  }
  await expect(page.getByTestId("quiz-score")).toBeVisible();
  await expect(page.getByTestId("quiz-next-sublesson")).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, "quiz_result_phone.png") });
});

test("desktop learn, quiz, result, and course tree", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page);
  await openLearn(page);
  await expect(page.getByTestId("learn-next")).toBeVisible();
  await expect(page.getByTestId("learn-back")).toBeVisible();
  await expect(page.getByTestId("swipe-hint")).toBeHidden();
  await page.screenshot({ path: path.join(artifacts, "learn_desktop.png") });

  await page.goto("/course");
  await expect(page.getByTestId("course-tree")).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, "course_tree_desktop.png") });

  await page.goto("/quiz/sll_a1_1_2");
  await page.getByTestId("quiz-start").click();
  await expect(page.getByTestId("quiz-prompt")).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, "quiz_desktop.png") });

  for (let index = 0; index < 4; index += 1) {
    await page.getByTestId("quiz-choice-b").click();
    await page.getByTestId("quiz-answer").click();
    await page.getByTestId("quiz-next").click();
  }
  await expect(page.getByTestId("quiz-score")).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, "quiz_result_desktop.png") });
});
