"use client";

import Link from "next/link";
import { type FormEvent, use, useEffect, useRef, useState } from "react";

import { apiFetch, API_URL } from "@/lib/api";

type IssueSummary = {
  number: number;
  title: string;
};

type CommentSummary = {
  id: string;
  body: string;
  authorId: string | null;
};

type LabelSummary = {
  id: string;
  name: string;
};

type LoadState =
  | { status: "loading" }
  | { status: "missing-env" }
  | { status: "unauthorized" }
  | { status: "not-found" }
  | { status: "forbidden"; message: string }
  | { status: "error"; message: string }
  | { status: "ready"; issue: IssueSummary };

type RemoteState<T> =
  | { status: "loading" }
  | { status: "unauthorized" }
  | { status: "forbidden"; message: string }
  | { status: "error"; message: string }
  | { status: "ready"; value: T };

type Notice =
  { status: "idle" } | { status: "unauthorized" } | { status: "error"; message: string };

type IssuePageProps = {
  params: Promise<{
    orgId: string;
    projectId: string;
    issueId: string;
  }>;
};

function issuePath(orgId: string, projectId: string, issueId: string): string {
  return `/orgs/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}`;
}

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

function withLabel(
  current: RemoteState<LabelSummary[]>,
  label: LabelSummary,
): RemoteState<LabelSummary[]> {
  if (current.status !== "ready" || current.value.some((item) => item.id === label.id)) {
    return current;
  }

  const value = [...current.value, label].sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
  return { status: "ready", value };
}

function withoutLabel(
  current: RemoteState<LabelSummary[]>,
  labelId: string,
): RemoteState<LabelSummary[]> {
  if (current.status !== "ready") {
    return current;
  }

  return { status: "ready", value: current.value.filter((item) => item.id !== labelId) };
}

function withoutComment(
  current: RemoteState<CommentSummary[]>,
  commentId: string,
): RemoteState<CommentSummary[]> {
  if (current.status !== "ready") {
    return current;
  }

  return { status: "ready", value: current.value.filter((item) => item.id !== commentId) };
}

function replaceComment(
  current: RemoteState<CommentSummary[]>,
  comment: CommentSummary,
): RemoteState<CommentSummary[]> {
  if (current.status !== "ready") {
    return current;
  }

  return {
    status: "ready",
    value: current.value.map((item) => (item.id === comment.id ? comment : item)),
  };
}

function readList<T>(body: unknown, readItem: (item: unknown) => T | undefined): T[] | undefined {
  if (!Array.isArray(body)) {
    return undefined;
  }

  const items: T[] = [];
  for (const item of body) {
    const parsed = readItem(item);
    if (parsed !== undefined) {
      items.push(parsed);
    }
  }

  return items;
}

async function loadCollection<T>(
  path: string,
  signal: AbortSignal,
  read: (body: unknown) => T | undefined,
  unreadable: string,
): Promise<RemoteState<T> | undefined> {
  try {
    const response = await apiFetch(path, { signal });
    if (signal.aborted) {
      return undefined;
    }

    if (response.status === 401) {
      return { status: "unauthorized" };
    }

    if (response.status === 403) {
      const body: unknown = await response.json().catch(() => null);
      return { status: "forbidden", message: formMessage(body, "Forbidden") };
    }

    if (response.status !== 200) {
      return { status: "error", message: `Request failed (${response.status})` };
    }

    const value = read(await response.json().catch(() => null));
    if (value === undefined) {
      return { status: "error", message: unreadable };
    }

    return { status: "ready", value };
  } catch (error) {
    if (isAbort(error) || signal.aborted) {
      return undefined;
    }

    return { status: "error", message: "Could not reach the API" };
  }
}

async function failureNotice(
  response: Response,
  fallbacks: Partial<Record<number, string>>,
): Promise<Notice | undefined> {
  if (response.ok) {
    return undefined;
  }

  if (response.status === 401) {
    return { status: "unauthorized" };
  }

  const fallback = fallbacks[response.status];
  if (fallback !== undefined) {
    const body: unknown = await response.json().catch(() => null);
    return { status: "error", message: formMessage(body, fallback) };
  }

  return { status: "error", message: `Request failed (${response.status})` };
}

async function withRequest(
  ref: { current: AbortController | null },
  setBusy: (busy: boolean) => void,
  setNotice: (notice: Notice) => void,
  work: (signal: AbortSignal) => Promise<Notice | undefined>,
): Promise<void> {
  ref.current?.abort();
  const controller = new AbortController();
  ref.current = controller;
  setBusy(true);
  setNotice({ status: "idle" });

  try {
    const notice = await work(controller.signal);
    if (controller.signal.aborted || notice === undefined) {
      return;
    }

    setNotice(notice);
  } catch (error) {
    if (isAbort(error) || controller.signal.aborted) {
      return;
    }

    setNotice({ status: "error", message: "Could not reach the API" });
  } finally {
    if (!controller.signal.aborted) {
      setBusy(false);
    }
  }
}

function LoginLink() {
  return (
    <p>
      You are not logged in. <Link href="/login">Log in</Link>
    </p>
  );
}

function RemoteStatus({ state, loading }: { state: RemoteState<unknown>; loading?: string }) {
  if (state.status === "loading") {
    return loading === undefined ? null : <p>{loading}</p>;
  }

  if (state.status === "unauthorized") {
    return <LoginLink />;
  }

  if (state.status === "forbidden" || state.status === "error") {
    return <p>{state.message}</p>;
  }

  return null;
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

export default function IssuePage({ params }: IssuePageProps) {
  const { orgId, projectId, issueId } = use(params);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [commentState, setCommentState] = useState<RemoteState<CommentSummary[]>>({
    status: "loading",
  });
  const [labelState, setLabelState] = useState<RemoteState<LabelSummary[]>>({ status: "loading" });
  const [organizationLabels, setOrganizationLabels] = useState<RemoteState<LabelSummary[]>>({
    status: "loading",
  });
  const [selectedLabelId, setSelectedLabelId] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [attachNotice, setAttachNotice] = useState<Notice>({ status: "idle" });
  const [detachingId, setDetachingId] = useState<string | null>(null);
  const [detachNotice, setDetachNotice] = useState<Notice>({ status: "idle" });
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formNotice, setFormNotice] = useState<Notice>({ status: "idle" });
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [deleteCommentNotice, setDeleteCommentNotice] = useState<Notice>({ status: "idle" });
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editNotice, setEditNotice] = useState<Notice>({ status: "idle" });
  const postController = useRef<AbortController | null>(null);
  const deleteCommentController = useRef<AbortController | null>(null);
  const deleteCommentLock = useRef(false);
  const editCommentController = useRef<AbortController | null>(null);
  const editCommentLock = useRef(false);
  const attachController = useRef<AbortController | null>(null);
  const attachLock = useRef(false);
  const detachController = useRef<AbortController | null>(null);
  const detachLock = useRef(false);
  const path = issuePath(orgId, projectId, issueId);

  useEffect(() => {
    if (API_URL === undefined || API_URL.length === 0) {
      setState({ status: "missing-env" });
      return;
    }

    setState({ status: "loading" });
    setCommentState({ status: "loading" });
    setLabelState({ status: "loading" });
    setOrganizationLabels({ status: "loading" });
    setSelectedLabelId("");
    setAttaching(false);
    setAttachNotice({ status: "idle" });
    attachLock.current = false;
    setDetachingId(null);
    setDetachNotice({ status: "idle" });
    detachLock.current = false;
    setDraft("");
    setSubmitting(false);
    setFormNotice({ status: "idle" });
    setDeletingCommentId(null);
    setDeleteCommentNotice({ status: "idle" });
    deleteCommentLock.current = false;
    setEditingCommentId(null);
    setEditDraft("");
    setSavingEdit(false);
    setEditNotice({ status: "idle" });
    editCommentLock.current = false;

    const controller = new AbortController();

    async function loadIssue() {
      try {
        const response = await apiFetch(path, { signal: controller.signal });
        if (controller.signal.aborted) {
          return;
        }

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
          setState({ status: "forbidden", message: formMessage(body, "Forbidden") });
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

        const organizationTask = loadCollection(
          `/orgs/${encodeURIComponent(orgId)}/labels`,
          controller.signal,
          (body) => readList(body, readLabel),
          "Labels payload was unreadable",
        ).then((next) => {
          if (next !== undefined) {
            setOrganizationLabels(next);
          }
        });

        const comments = await loadCollection(
          `${path}/comments`,
          controller.signal,
          (body) => readList(body, readComment),
          "Comments payload was unreadable",
        );
        if (controller.signal.aborted) {
          return;
        }
        if (comments !== undefined) {
          setCommentState(comments);
        }

        const labels = await loadCollection(
          `${path}/labels`,
          controller.signal,
          (body) => readList(body, readLabel),
          "Labels payload was unreadable",
        );
        if (controller.signal.aborted) {
          return;
        }
        if (labels !== undefined) {
          setLabelState(labels);
        }

        await organizationTask;
      } catch (error) {
        if (isAbort(error)) {
          return;
        }

        setState({ status: "error", message: "Could not reach the API" });
      }
    }

    void loadIssue();

    return () => {
      controller.abort();
      postController.current?.abort();
      deleteCommentController.current?.abort();
      editCommentController.current?.abort();
      attachController.current?.abort();
      detachController.current?.abort();
    };
  }, [orgId, path]);

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

    await withRequest(postController, setSubmitting, setFormNotice, async (signal) => {
      const response = await apiFetch(`${path}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
        signal,
      });
      if (signal.aborted) {
        return;
      }

      const failure = await failureNotice(response, {
        400: "Comment was rejected",
        403: "Forbidden",
      });
      if (failure !== undefined) {
        return failure;
      }

      const created = readComment(await response.json().catch(() => null));
      if (created === undefined) {
        return { status: "error", message: "Comment payload was unreadable" };
      }

      setCommentState((current) => {
        if (current.status !== "ready") {
          return current;
        }

        return { status: "ready", value: [...current.value, created] };
      });
      setDraft("");
      return { status: "idle" };
    });
  }

  async function onDeleteComment(commentId: string) {
    if (deleteCommentLock.current) {
      return;
    }

    if (API_URL === undefined || API_URL.length === 0) {
      setDeleteCommentNotice({ status: "error", message: "NEXT_PUBLIC_API_URL is missing" });
      return;
    }

    deleteCommentLock.current = true;
    const controller = new AbortController();
    deleteCommentController.current = controller;
    setDeletingCommentId(commentId);
    setDeleteCommentNotice({ status: "idle" });

    try {
      const response = await apiFetch(`${path}/comments/${encodeURIComponent(commentId)}`, {
        method: "DELETE",
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }

      const failure = await failureNotice(response, {
        403: "Forbidden",
        404: "Not found",
      });
      if (controller.signal.aborted) {
        return;
      }
      if (failure !== undefined) {
        setDeleteCommentNotice(failure);
        return;
      }

      if (response.status !== 204) {
        setDeleteCommentNotice({ status: "error", message: `Request failed (${response.status})` });
        return;
      }

      setCommentState((current) => withoutComment(current, commentId));
    } catch (error) {
      if (isAbort(error) || controller.signal.aborted) {
        return;
      }

      setDeleteCommentNotice({ status: "error", message: "Could not reach the API" });
    } finally {
      if (deleteCommentController.current === controller) {
        deleteCommentController.current = null;
      }
      deleteCommentLock.current = false;
      if (!controller.signal.aborted) {
        setDeletingCommentId(null);
      }
    }
  }

  function onStartEdit(comment: CommentSummary) {
    if (editCommentLock.current || editingCommentId !== null) {
      return;
    }

    setEditingCommentId(comment.id);
    setEditDraft(comment.body);
    setEditNotice({ status: "idle" });
  }

  function onCancelEdit() {
    if (editCommentLock.current) {
      return;
    }

    setEditingCommentId(null);
    setEditDraft("");
    setEditNotice({ status: "idle" });
  }

  async function onSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const commentId = editingCommentId;
    if (commentId === null || editCommentLock.current) {
      return;
    }

    const body = editDraft.trim();
    if (body.length === 0) {
      setEditNotice({ status: "error", message: "Enter a comment" });
      return;
    }

    if (API_URL === undefined || API_URL.length === 0) {
      setEditNotice({ status: "error", message: "NEXT_PUBLIC_API_URL is missing" });
      return;
    }

    editCommentLock.current = true;
    const controller = new AbortController();
    editCommentController.current = controller;
    setSavingEdit(true);
    setEditNotice({ status: "idle" });

    try {
      const response = await apiFetch(`${path}/comments/${encodeURIComponent(commentId)}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }

      const failure = await failureNotice(response, {
        400: "Comment was rejected",
        403: "Forbidden",
        404: "Not found",
      });
      if (controller.signal.aborted) {
        return;
      }
      if (failure !== undefined) {
        setEditNotice(failure);
        return;
      }

      if (response.status !== 200) {
        setEditNotice({ status: "error", message: `Request failed (${response.status})` });
        return;
      }

      const updated = readComment(await response.json().catch(() => null));
      if (updated === undefined) {
        setEditNotice({ status: "error", message: "Comment payload was unreadable" });
        return;
      }

      setCommentState((current) => replaceComment(current, updated));
      setEditingCommentId(null);
      setEditDraft("");
    } catch (error) {
      if (isAbort(error) || controller.signal.aborted) {
        return;
      }

      setEditNotice({ status: "error", message: "Could not reach the API" });
    } finally {
      if (editCommentController.current === controller) {
        editCommentController.current = null;
      }
      editCommentLock.current = false;
      if (!controller.signal.aborted) {
        setSavingEdit(false);
      }
    }
  }

  async function onAttach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const labelId = selectedLabelId;
    if (labelId.length === 0) {
      return;
    }

    const label =
      organizationLabels.status === "ready"
        ? organizationLabels.value.find((item) => item.id === labelId)
        : undefined;
    if (label === undefined) {
      setAttachNotice({ status: "error", message: "Label was rejected" });
      return;
    }

    if (API_URL === undefined || API_URL.length === 0) {
      setAttachNotice({ status: "error", message: "NEXT_PUBLIC_API_URL is missing" });
      return;
    }

    if (attachLock.current) {
      return;
    }

    attachLock.current = true;
    const controller = new AbortController();
    attachController.current = controller;
    setAttaching(true);
    setAttachNotice({ status: "idle" });

    try {
      const response = await apiFetch(`${path}/labels`, {
        method: "POST",
        body: JSON.stringify({ labelId }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }

      const failure = await failureNotice(response, {
        400: "Label was rejected",
        403: "Forbidden",
        404: "Label was rejected",
        409: "This label is already attached to the issue",
      });
      if (controller.signal.aborted) {
        return;
      }
      if (failure !== undefined) {
        setAttachNotice(failure);
        return;
      }

      if (response.status !== 201) {
        setAttachNotice({ status: "error", message: `Request failed (${response.status})` });
        return;
      }

      setLabelState((current) => withLabel(current, label));
      setSelectedLabelId("");
    } catch (error) {
      if (isAbort(error) || controller.signal.aborted) {
        return;
      }

      setAttachNotice({ status: "error", message: "Could not reach the API" });
    } finally {
      if (attachController.current === controller) {
        attachController.current = null;
      }
      attachLock.current = false;
      if (!controller.signal.aborted) {
        setAttaching(false);
      }
    }
  }

  async function onDetach(labelId: string) {
    if (detachLock.current) {
      return;
    }

    if (API_URL === undefined || API_URL.length === 0) {
      setDetachNotice({ status: "error", message: "NEXT_PUBLIC_API_URL is missing" });
      return;
    }

    detachLock.current = true;
    const controller = new AbortController();
    detachController.current = controller;
    setDetachingId(labelId);
    setDetachNotice({ status: "idle" });

    try {
      const response = await apiFetch(`${path}/labels/${encodeURIComponent(labelId)}`, {
        method: "DELETE",
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }

      const failure = await failureNotice(response, {
        403: "Forbidden",
        404: "Not found",
      });
      if (controller.signal.aborted) {
        return;
      }
      if (failure !== undefined) {
        setDetachNotice(failure);
        return;
      }

      if (response.status !== 204) {
        setDetachNotice({ status: "error", message: `Request failed (${response.status})` });
        return;
      }

      setLabelState((current) => withoutLabel(current, labelId));
    } catch (error) {
      if (isAbort(error) || controller.signal.aborted) {
        return;
      }

      setDetachNotice({ status: "error", message: "Could not reach the API" });
    } finally {
      if (detachController.current === controller) {
        detachController.current = null;
      }
      detachLock.current = false;
      if (!controller.signal.aborted) {
        setDetachingId(null);
      }
    }
  }

  const attachedIds =
    labelState.status === "ready"
      ? new Set(labelState.value.map((label) => label.id))
      : new Set<string>();
  const availableLabels =
    organizationLabels.status === "ready"
      ? organizationLabels.value.filter((label) => !attachedIds.has(label.id))
      : [];

  return (
    <main>
      {state.status === "loading" ? <p>Loading issue</p> : null}
      {state.status === "missing-env" ? <p>NEXT_PUBLIC_API_URL is missing</p> : null}
      {state.status === "unauthorized" ? <LoginLink /> : null}
      {state.status === "not-found" ? <p>Not found</p> : null}
      {state.status === "forbidden" || state.status === "error" ? <p>{state.message}</p> : null}
      {state.status === "ready" ? (
        <>
          <h1>
            #{state.issue.number} {state.issue.title}
          </h1>
          <RemoteStatus state={labelState} loading="Loading labels" />
          {labelState.status === "ready" && labelState.value.length === 0 ? <p>No labels</p> : null}
          {labelState.status === "ready" && labelState.value.length > 0 ? (
            <ul>
              {labelState.value.map((label) => (
                <li key={label.id}>
                  {label.name}{" "}
                  <button
                    type="button"
                    disabled={detachingId !== null}
                    onClick={() => {
                      void onDetach(label.id);
                    }}
                  >
                    {detachingId === label.id ? "Removing" : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <FormNotice notice={detachNotice} />
          <RemoteStatus
            state={organizationLabels}
            loading={labelState.status === "ready" ? "Loading organization labels" : undefined}
          />
          {organizationLabels.status === "ready" &&
          labelState.status === "ready" &&
          availableLabels.length === 0 ? (
            <p>No labels to attach</p>
          ) : null}
          {organizationLabels.status === "ready" &&
          labelState.status === "ready" &&
          availableLabels.length > 0 ? (
            <form onSubmit={onAttach}>
              <label>
                Label
                <select
                  name="labelId"
                  value={selectedLabelId}
                  onChange={(event) => {
                    setSelectedLabelId(event.target.value);
                  }}
                >
                  <option value="">Choose a label</option>
                  {availableLabels.map((label) => (
                    <option key={label.id} value={label.id}>
                      {label.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={attaching || selectedLabelId.length === 0}>
                {attaching ? "Attaching" : "Attach label"}
              </button>
              <FormNotice notice={attachNotice} />
            </form>
          ) : null}
          <RemoteStatus state={commentState} loading="Loading comments" />
          {commentState.status === "ready" && commentState.value.length === 0 ? (
            <p>No comments</p>
          ) : null}
          {commentState.status === "ready" && commentState.value.length > 0 ? (
            <ul>
              {commentState.value.map((comment) => (
                <li key={comment.id}>
                  {comment.body}{" "}
                  <button
                    type="button"
                    disabled={deletingCommentId !== null}
                    onClick={() => {
                      void onDeleteComment(comment.id);
                    }}
                  >
                    {deletingCommentId === comment.id ? "Deleting" : "Delete"}
                  </button>{" "}
                  <button
                    type="button"
                    disabled={editingCommentId !== null}
                    onClick={() => {
                      onStartEdit(comment);
                    }}
                  >
                    Edit
                  </button>
                  {editingCommentId === comment.id ? (
                    <form onSubmit={onSaveEdit}>
                      <label>
                        Comment
                        <textarea
                          name="body"
                          value={editDraft}
                          onChange={(event) => {
                            setEditDraft(event.target.value);
                          }}
                        />
                      </label>
                      <button type="submit" disabled={savingEdit}>
                        {savingEdit ? "Saving" : "Save"}
                      </button>{" "}
                      <button type="button" disabled={savingEdit} onClick={onCancelEdit}>
                        Cancel
                      </button>
                      <FormNotice notice={editNotice} />
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          <FormNotice notice={deleteCommentNotice} />
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
              <FormNotice notice={formNotice} />
            </form>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
