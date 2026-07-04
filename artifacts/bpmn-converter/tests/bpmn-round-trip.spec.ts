import { test, expect } from "@playwright/test";

const DEFAULT_EXAMPLE_START = "A customer places an order on our webshop.";

async function answerAnyClarifications(page: import("@playwright/test").Page) {
  for (let i = 0; i < 3; i++) {
    const answerInput = page.getByPlaceholder("Your answer...");
    const clarificationVisible = await answerInput
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (!clarificationVisible) {
      return;
    }

    await answerInput.fill("Assume the standard/default behavior described.");
    await page.getByRole("button", { name: "Continue" }).click();
  }
}

test.describe("BPMN conversion round trip", () => {
  test("description -> API -> diagram -> mapping -> issues", async ({ page }) => {
    await page.goto("/");

    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue(new RegExp(`^${DEFAULT_EXAMPLE_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

    await page.getByRole("button", { name: /Convert to BPMN/i }).click();

    await answerAnyClarifications(page);

    const diagramTabButton = page.getByRole("button", { name: /^Diagram$/ });
    await expect(diagramTabButton).toBeVisible({ timeout: 150_000 });

    await expect(page.getByText("Process", { exact: true })).toBeVisible();

    const canvas = page.locator(".bpmn-canvas");
    await expect(canvas).toBeVisible();
    const diagramSvg = canvas.locator(".djs-container svg");
    await expect(diagramSvg).toBeVisible({ timeout: 15_000 });
    const shapeCount = await canvas.locator(".djs-element").count();
    expect(shapeCount).toBeGreaterThan(0);

    await page.getByRole("button", { name: /Element Mapping/i }).click();

    const table = page.locator("table");
    await expect(table).toBeVisible();
    await expect(table.locator("th", { hasText: "Original Step" })).toBeVisible();
    await expect(table.locator("th", { hasText: "BPMN Element" })).toBeVisible();
    await expect(table.locator("th", { hasText: "Type" })).toBeVisible();

    const rows = table.locator("tbody tr");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(0);

    const firstRow = rows.first();
    for (const cellIndex of [0, 1, 2]) {
      const text = (await firstRow.locator("td").nth(cellIndex).innerText()).trim();
      expect(text.length).toBeGreaterThan(0);
    }

    await page.getByRole("button", { name: /Issues & Assumptions/i }).click();

    const noIssuesState = page.getByText("No issues found");
    const issueHeading = page.getByRole("heading", { level: 4, name: /^(issue|assumption)$/i }).first();
    const issueCard = page.getByText("Choice made:").first();

    const hasNoIssuesState = await noIssuesState
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    const hasIssueCards = await issueHeading
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);

    expect(hasNoIssuesState || hasIssueCards).toBe(true);

    if (!hasNoIssuesState) {
      await expect(issueCard).toBeVisible({ timeout: 10_000 });
    }
  });
});
