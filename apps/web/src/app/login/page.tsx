"use client";
import { type FormEvent, useState } from "react";

type LoginUser = {
  name: string;
  email: string;
};

type SessionCheck = { status: "stored"; userId: string } | { status: "missing" };

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

function messageFromBody(body: unknown): string {
  if (typeof body !== "object" || body === null || !("message" in body)) {
    return "Login failed";
  }
  const { message } = body;

  if (typeof message === "string") {
    return message;
  }

  if (Array.isArray(message) && message.every((item) => typeof item === "string")) {
    return message.join(", ");
  }

  return "Login failed";
}

function readLoginUser(body: unknown): LoginUser | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }

  if (!("name" in body) || !("email" in body)) {
    return undefined;
  }

  if (typeof body.name !== "string" || typeof body.email !== "string") {
    return undefined;
  }

  return { name: body.name, email: body.email };
}

function readUserId(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("userId" in body)) {
    return undefined;
  }
  return typeof body.userId === "string" ? body.userId : undefined;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [user, setUser] = useState<LoginUser | undefined>();
  const [session, setSession] = useState<SessionCheck | undefined>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setUser(undefined);
    setSession(undefined);
    if (apiUrl === undefined || apiUrl.length === 0) {
      setError("NEXT_PUBLIC_API_URL is missing");
      return;
    }
    setSubmitting(true);
    try {
      const loginResponse = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const loginBody: unknown = await loginResponse.json().catch(() => null);

      if (loginResponse.status !== 201) {
        setError(messageFromBody(loginBody));
        return;
      }

      const loggedIn = readLoginUser(loginBody);
      if (loggedIn === undefined) {
        setError("Login succeeded but the user payload was unreadable");
        return;
      }

      setUser(loggedIn);
      const meResponse = await fetch(`${apiUrl}/auth/me`, { credentials: "include" });

      if (meResponse.status === 401) {
        setSession({ status: "missing" });
        return;
      }

      if (meResponse.status !== 200) {
        setError(`Session check failed (${meResponse.status})`);
        return;
      }

      const userId = readUserId(await meResponse.json().catch(() => null));
      if (userId === undefined) {
        setError("Session check returned an unreadable body");
        return;
      }

      setSession({ status: "stored", userId });
    } catch {
      setError("Could not reach the API");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <main>
      <h1>Log in</h1>
      <form onSubmit={onSubmit}>
        <label>
          Email
          <input
            type="email"
            name="email"
            value={email}
            autoComplete="username"
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? "Logging in" : "Log in"}
        </button>
      </form>
      {error !== undefined ? <p>{error}</p> : null}
      {user !== undefined ? (
        <p>
          Logged in as {user.name} ({user.email})
        </p>
      ) : null}
      {session?.status === "stored" ? <p>Session cookie stored. userId {session.userId}</p> : null}
      {session?.status === "missing" ? (
        <p>Login succeeded and the session cookie was not stored.</p>
      ) : null}
    </main>
  );
}
