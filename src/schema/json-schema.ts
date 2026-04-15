/**
 * Convert an InputSchema to JSON Schema (draft-07, MCP-compatible).
 * Used by the MCP adapter to auto-generate tool schemas.
 */

import type { InputSchema } from '../registry.js';

export function toJsonSchema(schema: InputSchema): {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
} {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [name, field] of Object.entries(schema)) {
    const prop: Record<string, unknown> = { description: field.description };
    switch (field.type) {
      case 'string':
        prop.type = 'string';
        if (field.enum) prop.enum = field.enum;
        break;
      case 'number':
        prop.type = 'number';
        break;
      case 'boolean':
        prop.type = 'boolean';
        break;
      case 'json':
        // accept any JSON — MCP clients will pass objects directly
        break;
    }
    if (field.default !== undefined) prop.default = field.default;
    properties[name] = prop;
    if (field.required) required.push(name);
  }

  return { type: 'object', properties, required };
}
