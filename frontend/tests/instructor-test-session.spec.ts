import { expect, test } from '@playwright/test';

const email = process.env.E2E_INSTRUCTOR_EMAIL;
const password = process.env.E2E_INSTRUCTOR_PASSWORD;
const courseId = process.env.E2E_COURSE_ID;
const assignmentId = process.env.E2E_ASSIGNMENT_ID;

test.describe('Instructor test assignment flow', () => {
  test.skip(
    !email || !password || !courseId || !assignmentId,
    'Set E2E_INSTRUCTOR_EMAIL, E2E_INSTRUCTOR_PASSWORD, E2E_COURSE_ID, and E2E_ASSIGNMENT_ID.',
  );

  test('creates and stores a test session', async ({ page }) => {
    await page.goto('/auth?mode=login');

    await page.locator('#email').fill(email!);
    await page.locator('#password').fill(password!);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await page.waitForURL('**/dashboard');

    await page.goto(`/dashboard/courses/${courseId}/assignments/${assignmentId}`);

    const testButton = page.getByRole('button', { name: 'Test Assignment' });
    await expect(testButton).toBeVisible();
    await expect(testButton).toBeEnabled();
    await testButton.click();

    await page.waitForURL(new RegExp(`/dashboard/courses/${courseId}/sessions/[^/]+$`));
    const sessionUrl = page.url();
    const sessionId = sessionUrl.split('/').pop();
    expect(sessionId).toBeTruthy();

    await expect(page.getByText('Test Session', { exact: false })).toBeVisible();

    await page.goto(`/dashboard/courses/${courseId}/assignments/${assignmentId}`);
    await expect(page.getByRole('heading', { name: 'My Test Sessions' })).toBeVisible();

    await expect(
      page.locator(`a[href="/dashboard/courses/${courseId}/sessions/${sessionId}"]`),
    ).toBeVisible();
  });
});

