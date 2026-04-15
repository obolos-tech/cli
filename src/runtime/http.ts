/**
 * HTTP client for Obolos backend. Throws `networkError` on non-2xx.
 * Does NOT handle x402 — payment flow lives in runtime/payment.ts.
 */

import { networkError } from './errors.js';

export interface HttpClient {
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T>;
}

export function createHttpClient(baseUrl: string): HttpClient {
  async function parseOrThrow(res: Response): Promise<any> {
    if (res.ok) return res.json();
    let msg = `${res.status} ${res.statusText}`;
    try {
      const err = await res.json();
      if (err?.error) msg = err.error;
      else if (err?.message) msg = err.message;
    } catch {}
    throw networkError(msg, { status: res.status, url: res.url });
  }

  return {
    async get(path) {
      const res = await fetch(`${baseUrl}${path}`);
      return parseOrThrow(res);
    },
    async post(path, body, headers) {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return parseOrThrow(res);
    },
  };
}
