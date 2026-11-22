"use client";

import Link from "next/link";
import { type FormEvent, use, useEffect, useRef, useState } from "react";

type IssueSummary = {
  number: number;
  title: string;
};

type CommentSummary = {
  id: string;
  body: string;
  authorId: string | null;
};

type LoadState =
  | { status: "loading" }
  | { status: "missing-env" }
  | { status: "unauthorized" }
  | { status: "not-found" }
  | { status: "forbidden"; message: string }
  | { status: "error"; message: string }
  | { status: "ready"; issue: IssueSummary };

type CommentState =
  | { status: "loading" }
  | { status: "unauthorized" }
  | { status: "forbidden"; message: string }
  | { status: "error"; message: string }
  | { status: "ready"; comments: CommentSummary[] };

type CommentFormNotice =
  { status: "idle" } | { status: "unauthorized" } | { status: "error"; message: string };

type IssuePageProps = {
  params: Promise<{
    orgId: string;
    projectId: string;
    issueId: string;
  }>;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function messageFromBody(body: unknown): string {
  if (typeof body !== "object" || body === null || !("message" in body)) {
    return "Forbidden";
  }

  const { message } = body;
  if (typeof message === "string" && message.length > 0) {
    return message;
  }

  return "Forbidden";
}

function readIssue(body: unknown): IssueSummary | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }

  if (!("number" in body) || !("title" in body)) {
    return undefined;
  }

  if (typeof body.number !== "number" || typeof body.title !== "string") {
    return undefined;
  }

  return { number: body.number, title: body.title };
}

function readComment(item: unknown): CommentSummary | undefined {
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    return undefined;
  }

  if (!("id" in item) || !("body" in item)) {
    return undefined;
  }

  if (typeof item.id !== "string" || typeof item.body !== "string") {
    return undefined;
  }

  const authorId =
    "authorId" in item && (typeof item.authorId === "string" || item.authorId === null)
      ? item.authorId
      : null;

  return { id: item.id, body: item.body, authorId };
}

function readComments(body: unknown): CommentSummary[] | undefined {
  if (!Array.isArray(body)) {
    return undefined;
  }

  const comments: CommentSummary[] = [];

  for (const item of body) {
    const comment = readComment(item);
    if (comment !== undefined) {
      comments.push(comment);
    }
  }

  return comments;
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

export default function IssuePage({ params }: IssuePageProps) {
  const { orgId, projectId, issueId } = use(params);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [commentState, setCommentState] = useState<CommentState>({ status: "loading" });
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formNotice, setFormNotice] = useState<CommentFormNotice>({ status: "idle" });
  const postController = useRef<AbortController | null>(null);

  useEffect(() => {
    if (API_URL === undefined || API_URL.length === 0) {
      setState({ status: "missing-env" });
      return;
    }

    setState({ status: "loading" });
    setCommentState({ status: "loading" });
    setDraft("");
    setSubmitting(false);
    setFormNotice({ status: "idle" });

    const controller = new AbortController();

    async function loadIssue() {
      try {
        const response = await fetch(
          `${API_URL}/orgs/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}`,
          { credentials: "include", signal: controller.signal },
        );

        if (response.status === 401) {
          setState({ status: "unauthorized" });
          return;
        }

        if (response.status === 404) {
          setState({ status: "not-found" });
          return;
        }

        if (response.status === 403) {
          const body: unknown = await response.json().catch(() => null);
          setState({ status: "forbidden", message: messageFromBody(body) });
          return;
        }

        if (response.status !== 200) {
          setState({ status: "error", message: `Request failed (${response.status})` });
          return;
        }

        const issue = readIssue(await response.json().catch(() => null));
        if (issue === undefined) {
          setState({ status: "error", message: "Issue payload was unreadable" });
          return;
        }

        setState({ status: "ready", issue });

        try {
          const commentsResponse = await fetch(
            `${API_URL}/orgs/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}/comments`,
            { credentials: "include", signal: controller.signal },
          );

          if (commentsResponse.status === 401) {
            setCommentState({ status: "unauthorized" });
            return;
          }

          if (commentsResponse.status === 403) {
            const body: unknown = await commentsResponse.json().catch(() => null);
            setCommentState({ status: "forbidden", message: messageFromBody(body) });
            return;
          }

          if (commentsResponse.status !== 200) {
            setCommentState({
              status: "error",
              message: `Request failed (${commentsResponse.status})`,
            });
            return;
          }

          const comments = readComments(await commentsResponse.json().catch(() => null));
          if (comments === undefined) {
            setCommentState({ status: "error", message: "Comments payload was unreadable" });
            return;
          }

          setCommentState({ status: "ready", comments });
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }

          setCommentState({ status: "error", message: "Could not reach the API" });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setState({ status: "error", message: "Could not reach the API" });
      }
    }

    void loadIssue();

    return () => {
      controller.abort();
      postController.current?.abort();
    };
  }, [orgId, projectId, issueId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (body.length === 0) {
      setFormNotice({ status: "error", message: "Enter a comment" });
      return;
    }

    if (API_URL === undefined || API_URL.length === 0) {
      setFormNotice({ status: "error", message: "NEXT_PUBLIC_API_URL is missing" });
      return;
    }

    postController.current?.abort();
    const controller = new AbortController();
    postController.current = controller;
    setSubmitting(true);
    setFormNotice({ status: "idle" });

    try {
      const response = await fetch(
        `${API_URL}/orgs/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}/comments`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
          signal: controller.signal,
        },
      );

      if (controller.signal.aborted) {
        return;
      }

      if (response.status === 401) {
        setFormNotice({ status: "unauthorized" });
        return;
      }

      if (response.status === 403) {
        const responseBody: unknown = await response.json().catch(() => null);
        setFormNotice({ status: "error", message: formMessage(responseBody, "Forbidden") });
        return;
      }

      if (response.status === 400) {
        const responseBody: unknown = await response.json().catch(() => null);
        setFormNotice({
          status: "error",
          message: formMessage(responseBody, "Comment was rejected"),
        });
        return;
      }

      if (response.status !== 201) {
        setFormNotice({ status: "error", message: `Request failed (${response.status})` });
        return;
      }

      const created = readComment(await response.json().catch(() => null));
      if (created === undefined) {
        setFormNotice({ status: "error", message: "Comment payload was unreadable" });
        return;
      }

      setCommentState((current) => {
        if (current.status !== "ready") {
          return current;
        }

        return { status: "ready", comments: [...current.comments, created] };
      });
      setDraft("");
      setFormNotice({ status: "idle" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      if (controller.signal.aborted) {
        return;
      }

      setFormNotice({ status: "error", message: "Could not reach the API" });
    } finally {
      if (!controller.signal.aborted) {
        setSubmitting(false);
      }
    }
  }

  return (
    <main>
      {state.status === "loading" ? <p>Loading issue</p> : null}
      {state.status === "missing-env" ? <p>NEXT_PUBLIC_API_URL is missing</p> : null}
      {state.status === "unauthorized" ? (
        <p>
          You are not logged in. <Link href="/login">Log in</Link>
        </p>
      ) : null}
      {state.status === "not-found" ? <p>Not found</p> : null}
      {state.status === "forbidden" ? <p>{state.message}</p> : null}
      {state.status === "error" ? <p>{state.message}</p> : null}
      {state.status === "ready" ? (
        <>
          <h1>
            #{state.issue.number} {state.issue.title}
          </h1>
          {commentState.status === "loading" ? <p>Loading comments</p> : null}
          {commentState.status === "unauthorized" ? (
            <p>
              You are not logged in. <Link href="/login">Log in</Link>
            </p>
          ) : null}
          {commentState.status === "forbidden" ? <p>{commentState.message}</p> : null}
          {commentState.status === "error" ? <p>{commentState.message}</p> : null}
          {commentState.status === "ready" && commentState.comments.length === 0 ? (
            <p>No comments</p>
          ) : null}
          {commentState.status === "ready" && commentState.comments.length > 0 ? (
            <ul>
              {commentState.comments.map((item) => (
                <li key={item.id}>{item.body}</li>
              ))}
            </ul>
          ) : null}
          {commentState.status === "ready" ? (
            <form onSubmit={onSubmit}>
              <label>
                Comment
                <textarea
                  name="body"
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                  }}
                />
              </label>
              <button type="submit" disabled={submitting}>
                {submitting ? "Posting" : "Post comment"}
              </button>
              {formNotice.status === "unauthorized" ? (
                <p>
                  You are not logged in. <Link href="/login">Log in</Link>
                </p>
              ) : null}
              {formNotice.status === "error" ? <p>{formNotice.message}</p> : null}
            </form>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
