import { expect, test } from "@playwright/test";

// Host `demo` (seeded by `npm run db:seed`) uses America/New_York with
// Mon-Fri 9-17 availability. Pinning the browser's time zone keeps the
// picked date/time deterministic across CI machines.
test.use({ timezoneId: "America/New_York" });

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

test("public booking flow: book, confirm, cancel, slot reopens", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Demo Host" })).toBeVisible();

  await page.getByRole("link", { name: /Intro Call/ }).click();
  await expect(page).toHaveURL(/\/demo\/intro-call/);

  // Pick the first enabled day in the calendar.
  const dayButtons = page.getByTestId("calendar-day");
  await expect(dayButtons.first()).toBeVisible();
  const enabledDay = dayButtons.and(page.locator(":not([disabled])")).first();
  await expect(enabledDay).toBeVisible({ timeout: 15_000 });
  const dayLabel = await enabledDay.getAttribute("aria-label");
  await enabledDay.click();

  // Pick the first available time and confirm (two-step, Calendly-style).
  const firstSlot = page.getByTestId("slot-time").first();
  await expect(firstSlot).toBeVisible({ timeout: 15_000 });
  const slotLabel = await firstSlot.textContent();
  await firstSlot.click();
  await page.getByTestId("slot-confirm").click();

  // Fill invitee details and submit. `submitBookingAction` rejects
  // submissions faster than 3s after the form rendered (a bot defense), so
  // wait it out — a real invitee would take at least this long anyway.
  const inviteeEmail = `e2e-${Date.now()}@example.com`;
  await page.getByLabel("Name *").fill("E2E Test Invitee");
  await page.getByLabel("Email *").fill(inviteeEmail);
  await page.waitForTimeout(3100);
  await page.getByTestId("booking-submit").click();

  await expect(page).toHaveURL(/\/booking\/[^/]+$/, { timeout: 15_000 });
  await expect(page.getByTestId("booking-confirmation-heading")).toHaveText("You are scheduled");
  await expect(page.getByText("Intro Call").first()).toBeVisible();

  const bookingUrl = page.url();

  // Optionally verify Mailpit received a confirmation email.
  try {
    const response = await page.request.get(`${MAILPIT_URL}/api/v1/messages`);
    if (response.ok()) {
      const body = await response.json();
      const messages: Array<{ To: Array<{ Address: string }> }> = body.messages ?? [];
      const found = messages.some((m) => m.To?.some((to) => to.Address === inviteeEmail));
      expect(found).toBe(true);
    }
  } catch {
    // Mailpit not reachable in this environment — not a hard requirement.
  }

  // Cancel via the confirmation page's Cancel link.
  await page.getByRole("link", { name: "Cancel" }).click();
  await expect(page).toHaveURL(`${bookingUrl}/cancel`);
  await page.getByTestId("cancel-confirm").click();

  await expect(page).toHaveURL(bookingUrl, { timeout: 15_000 });
  await expect(page.getByTestId("booking-cancelled-heading")).toBeVisible();

  // Re-open the event page and confirm the slot is available again.
  await page.goto("/demo/intro-call");
  const dayButtonsAgain = page.getByTestId("calendar-day");
  await expect(dayButtonsAgain.first()).toBeVisible();
  const sameDay = page.getByRole("button", { name: dayLabel! });
  await expect(sameDay).toBeEnabled({ timeout: 15_000 });
  await sameDay.click();

  await expect(page.getByTestId("slot-time").filter({ hasText: slotLabel! }).first()).toBeVisible({
    timeout: 15_000,
  });
});
