import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const API_URL = "http://localhost:4000";

const password = "TestPassword123!";

const name = "testUser";

// Convert Set-Cookie response headers into a Cookie request header.
function getCookieHeader(response: Response): string {
  const cookies = response.headers.getSetCookie();

  const cookieHeader = cookies.map((cookie) => cookie.split(";")[0]).join("; ");

  assert.ok(cookieHeader.length > 0, "Login should set authentication cookies");

  return cookieHeader;
}

// Register a user.
async function register(email: string): Promise<void> {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      name,
    }),
  });

  assert.equal(response.status, 201, "Registration should succeed");
}

// Log in and return that user's cookies.
async function login(email: string): Promise<string> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });

  assert.ok(response.ok, "Login should succeed");

  return getCookieHeader(response);
}

test("users cannot access or delete another user's organization", async () => {
  // 1. Generate unique emails so the test can run repeatedly.
  const aliceEmail = `alice-${randomUUID()}@example.com`;
  const bobEmail = `bob-${randomUUID()}@example.com`;

  // 2. Register both users.
  await register(aliceEmail);
  await register(bobEmail);

  // 3. Log in both users and keep their cookies separate.
  const aliceCookies = await login(aliceEmail);
  const bobCookies = await login(bobEmail);

  // 4. Alice creates an organization.
  const createResponse = await fetch(`${API_URL}/orgs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: aliceCookies,
    },
    body: JSON.stringify({
      name: `Alice Organization ${randomUUID()}`,
    }),
  });

  assert.equal(createResponse.status, 201);

  const organization = (await createResponse.json()) as {
    id: string;
  };

  assert.ok(organization.id, "Created organization should have an ID");

  const organizationUrl = `${API_URL}/orgs/${organization.id}`;

  // 5. Bob tries to access Alice's organization.
  // The organization still exists at this point.
  const bobGetResponse = await fetch(organizationUrl, {
    headers: {
      Cookie: bobCookies,
    },
  });

  assert.equal(bobGetResponse.status, 404, "Bob should not be able to access Alice's organization");

  // 6. Bob tries to delete Alice's organization.
  const bobDeleteResponse = await fetch(organizationUrl, {
    method: "DELETE",
    headers: {
      Cookie: bobCookies,
    },
  });

  assert.equal(
    bobDeleteResponse.status,
    404,
    "Bob should not be able to delete Alice's organization",
  );

  // 7. Alice verifies that her organization still exists.
  const aliceGetResponse = await fetch(organizationUrl, {
    headers: {
      Cookie: aliceCookies,
    },
  });

  assert.equal(
    aliceGetResponse.status,
    200,
    "Alice should still be able to access her organization",
  );

  // 8. Alice deletes her own organization.
  const aliceDeleteResponse = await fetch(organizationUrl, {
    method: "DELETE",
    headers: {
      Cookie: aliceCookies,
    },
  });

  assert.equal(aliceDeleteResponse.status, 204, "Alice should be able to delete her organization");
});
