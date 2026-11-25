"use client";

import Link from "next/link";
import { type FormEvent, use, useEffect, useRef, useState } from "react";

import { apiFetch, API_URL } from "@/lib/api";

type LabelSummary = {
  id: string;
  name: string;
};

type LoadState =
  | { status: "loading" }
  | { status: "missing-env" }
  | { status: "unauthorized" }
  | { status: "error"; message: string }
  | { status: "ready"; labels: LabelSummary[] };

type Notice =
  { status: "idle" } | { status: "unauthorized" } | { status: "error"; message: string };

type LabelsPageProps = {
  params: Promise<{ orgId: string }>;
};

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function formMessage(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null || !("message" in body)) {
    return fallback;
  }

  const { message } = body;
  if (typeof message === "string" && message.length > 0) {
    return message;
  }

  if (Array.isArray(message)) {
    const lines = message.filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
    if (lines.length > 0) {
      return lines.join(", ");
    }
  }

  return fallback;
}

function readLabel(item: unknown): LabelSummary | undefined {
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    return undefined;
  }

  if (!("id" in item) || !("name" in item)) {
    return undefined;
  }

  if (typeof item.id !== "string" || typeof item.name !== "string") {
    return undefined;
  }

  return { id: item.id, name: item.name };
}

function readLabelList(body: unknown): LabelSummary[] | undefined {
  if (!Array.isArray(body)) {
    return undefined;
  }

  const labels: LabelSummary[] = [];
  for (const item of body) {
    const label = readLabel(item);
    if (label !== undefined) {
      labels.push(label);
    }
  }

  return labels;
}

function insertLabel(labels: LabelSummary[], label: LabelSummary): LabelSummary[] {
  if (labels.some((item) => item.id === label.id)) {
    return labels;
  }

  return [...labels, label].sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
}

function LoginLink() {
  return (
    <p>
      You are not logged in. <Link href="/login">Log in</Link>
    </p>
  );
}

function FormNotice({ notice }: { notice: Notice }) {
  if (notice.status === "unauthorized") {
    return <LoginLink />;
  }

  if (notice.status === "error") {
    return <p>{notice.message}</p>;
  }

  return null;
}

export default function LabelsPage({ params }: LabelsPageProps) {
  const { orgId } = use(params);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<Notice>({ status: "idle" });
  const createController = useRef<AbortController | null>(null);
  const createLock = useRef(false);
  const path = `/orgs/${encodeURIComponent(orgId)}/labels`;

  useEffect(() => {
    if (API_URL === undefined || API_URL.length === 0) {
      setState({ status: "missing-env" });
      return;
    }

    setState({ status: "loading" });
    setName("");
    setCreating(false);
    setNotice({ status: "idle" });
    createLock.current = false;

    const controller = new AbortController();

    async function loadLabels() {
      try {
        const response = await apiFetch(path, { signal: controller.signal });
        if (controller.signal.aborted) {
          return;
        }

        if (response.status === 401) {
          setState({ status: "unauthorized" });
          return;
        }

        if (response.status === 403 || response.status === 404) {
          const body: unknown = await response.json().catch(() => null);
          const fallback = response.status === 404 ? "Not found" : "Forbidden";
          setState({ status: "error", message: formMessage(body, fallback) });
          return;
        }

        if (response.status !== 200) {
          setState({ status: "error", message: `Request failed (${response.status})` });
          return;
        }

        const labels = readLabelList(await response.json().catch(() => null));
        if (labels === undefined) {
          setState({ status: "error", message: "Labels payload was unreadable" });
          return;
        }

        setState({ status: "ready", labels });
      } catch (error) {
        if (isAbort(error) || controller.signal.aborted) {
          return;
        }

        setState({ status: "error", message: "Could not reach the API" });
      }
    }

    void loadLabels();

    return () => {
      controller.abort();
      createController.current?.abort();
    };
  }, [path]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createLock.current) {
      return;
    }

    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setNotice({ status: "error", message: "Enter a label name" });
      return;
    }

    if (API_URL === undefined || API_URL.length === 0) {
      setNotice({ status: "error", message: "NEXT_PUBLIC_API_URL is missing" });
      return;
    }

    createLock.current = true;
    const controller = new AbortController();
    createController.current = controller;
    setCreating(true);
    setNotice({ status: "idle" });

    try {
      const response = await apiFetch(path, {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }

      if (response.status === 401) {
        setNotice({ status: "unauthorized" });
        return;
      }

      if (response.status !== 201) {
        const body: unknown = await response.json().catch(() => null);
        const fallbacks: Partial<Record<number, string>> = {
          400: "Label was rejected",
          403: "Forbidden",
          409: "A label with this name already exists in this organization",
        };
        const fallback = fallbacks[response.status] ?? `Request failed (${response.status})`;
        setNotice({ status: "error", message: formMessage(body, fallback) });
        return;
      }

      const created = readLabel(await response.json().catch(() => null));
      if (created === undefined) {
        setNotice({ status: "error", message: "Label payload was unreadable" });
        return;
      }

      setState((current) => {
        if (current.status !== "ready") {
          return current;
        }

        return { status: "ready", labels: insertLabel(current.labels, created) };
      });
      setName("");
    } catch (error) {
      if (isAbort(error) || controller.signal.aborted) {
        return;
      }

      setNotice({ status: "error", message: "Could not reach the API" });
    } finally {
      if (createController.current === controller) {
        createController.current = null;
      }
      createLock.current = false;
      if (!controller.signal.aborted) {
        setCreating(false);
      }
    }
  }

  return (
    <main>
      <h1>Labels</h1>
      {state.status === "loading" ? <p>Loading labels</p> : null}
      {state.status === "missing-env" ? <p>NEXT_PUBLIC_API_URL is missing</p> : null}
      {state.status === "unauthorized" ? <LoginLink /> : null}
      {state.status === "error" ? <p>{state.message}</p> : null}
      {state.status === "ready" && state.labels.length === 0 ? <p>No labels</p> : null}
      {state.status === "ready" && state.labels.length > 0 ? (
        <ul>
          {state.labels.map((label) => (
            <li key={label.id}>{label.name}</li>
          ))}
        </ul>
      ) : null}
      {state.status === "ready" ? (
        <form onSubmit={onSubmit}>
          <label>
            Name
            <input
              name="name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </label>
          <button type="submit" disabled={creating}>
            {creating ? "Creating" : "Create label"}
          </button>
          <FormNotice notice={notice} />
        </form>
      ) : null}
    </main>
  );
}
