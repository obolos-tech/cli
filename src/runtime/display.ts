/**
 * Shared formatting helpers for pretty output.
 */

export const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', magenta: '\x1b[35m',
  cyan: '\x1b[36m', red: '\x1b[31m', gray: '\x1b[90m',
};

export function shortenAddr(addr: string | undefined | null): string {
  if (!addr) return `${c.dim}—${c.reset}`;
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function shortenId(id: string): string {
  return id.length <= 12 ? id : `${id.slice(0, 8)}...`;
}

export function formatDate(iso: string | undefined | null): string {
  if (!iso) return `${c.dim}—${c.reset}`;
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function statusColor(status: string): string {
  switch (status) {
    case 'open':        return `${c.yellow}${status}${c.reset}`;
    case 'funded':      return `${c.blue}${status}${c.reset}`;
    case 'submitted':   return `${c.cyan}${status}${c.reset}`;
    case 'completed':   return `${c.green}${status}${c.reset}`;
    case 'rejected':    return `${c.red}${status}${c.reset}`;
    case 'expired':     return `${c.gray}${status}${c.reset}`;
    case 'negotiating': return `${c.magenta}${status}${c.reset}`;
    case 'accepted':    return `${c.green}${status}${c.reset}`;
    case 'cancelled':   return `${c.gray}${status}${c.reset}`;
    default:            return status;
  }
}

export function parseRelativeTime(input: string): string {
  const match = input.match(/^(\d+)\s*(h|hr|hrs|hour|hours|d|day|days|m|min|mins|minute|minutes)$/i);
  if (!match) {
    const d = new Date(input);
    if (!isNaN(d.getTime())) return d.toISOString();
    throw new Error(`Cannot parse expiry: "${input}". Use formats like "24h", "7d".`);
  }
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const ms = unit.startsWith('h') ? num * 3600e3 : unit.startsWith('d') ? num * 86400e3 : num * 60e3;
  return new Date(Date.now() + ms).toISOString();
}

export function parseTimeToSeconds(input: string): number {
  const match = input.match(/^(\d+)\s*(s|sec|secs|second|seconds|h|hr|hrs|hour|hours|d|day|days|m|min|mins|minute|minutes)$/i);
  if (!match) throw new Error(`Cannot parse time: "${input}". Use formats like "48h", "7d".`);
  const n = parseInt(match[1], 10);
  const u = match[2].toLowerCase();
  if (u.startsWith('s')) return n;
  if (u.startsWith('m')) return n * 60;
  if (u.startsWith('h')) return n * 3600;
  if (u.startsWith('d')) return n * 86400;
  return n;
}
