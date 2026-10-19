import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const MOCK = "http://localhost:4010";

export const SEED = {
  photoPost: "8f2e1c3a-0000-4000-8000-000000000001",
  videoPost: "8f2e1c3a-0000-4000-8000-000000000002",
  sensitivePost: "8f2e1c3a-0000-4000-8000-000000000003",
};

// A real (tiny) PNG to upload.
export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

export async function resetMock(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${MOCK}/__reset`);
  expect(response.ok()).toBeTruthy();
}

/** Sign in through the (mock) identity server, the same redirects as the real one, and come back. */
export async function signIn(page: Page, returnTo = "/"): Promise<void> {
  await page.goto(`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  await page.waitForURL((url) => url.pathname === returnTo.split("?")[0]);
}
