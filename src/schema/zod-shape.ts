/**
 * Convert an InputSchema to a Zod raw shape (Record<string, ZodType>),
 * used by the MCP SDK's `registerTool({ inputSchema })` form.
 *
 * Lives in the CLI package so the adapter can import it directly.
 */

import { z, type ZodTypeAny } from 'zod';
import type { InputSchema } from '../registry.js';

export function toZodShape(schema: InputSchema): Record<string, ZodTypeAny> {
  const shape: Record<string, ZodTypeAny> = {};
  for (const [name, field] of Object.entries(schema)) {
    let t: ZodTypeAny;
    switch (field.type) {
      case 'string':
        t = field.enum ? z.enum(field.enum as [string, ...string[]]) : z.string();
        break;
      case 'number':  t = z.number(); break;
      case 'boolean': t = z.boolean(); break;
      case 'json':    t = z.any(); break;
    }
    if (field.description) t = t.describe(field.description);
    if (!field.required) t = t.optional();
    if (field.default !== undefined) t = t.default(field.default as never);
    shape[name] = t;
  }
  return shape;
}
