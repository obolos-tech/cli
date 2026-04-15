/**
 * Typed errors with stable exit codes. Shared by CLI and MCP adapter.
 *
 * Exit codes:
 *   1 = user error (bad input, missing flag)
 *   2 = network error (fetch failed, non-2xx from API)
 *   3 = payment / signing error (wallet missing, 402 retry failed)
 *   4 = on-chain error (revert, unknown event)
 */

export type ExitCode = 1 | 2 | 3 | 4;

export class CliError extends Error {
  readonly code: ExitCode;
  readonly details?: Record<string, unknown>;
  constructor(message: string, code: ExitCode, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export const userError = (msg: string, details?: Record<string, unknown>) =>
  new CliError(msg, 1, details);
export const networkError = (msg: string, details?: Record<string, unknown>) =>
  new CliError(msg, 2, details);
export const paymentError = (msg: string, details?: Record<string, unknown>) =>
  new CliError(msg, 3, details);
export const chainError = (msg: string, details?: Record<string, unknown>) =>
  new CliError(msg, 4, details);
