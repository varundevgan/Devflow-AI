export const API_URL = process.env.NEXT_PUBLIC_API_URL;

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (API_URL === undefined || API_URL.length === 0) {
    return Promise.reject(new Error("NEXT_PUBLIC_API_URL is missing"));
  }

  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${API_URL}${path}`, { ...init, credentials: "include", headers });
}
