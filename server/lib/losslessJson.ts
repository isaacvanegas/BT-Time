/**
 * Lossless JSON parser and serializer for 64-bit integer IDs (> Number.MAX_SAFE_INTEGER).
 * Preserves exact integer representation without JavaScript IEEE-754 rounding.
 */

const ID_FIELD_KEYS = new Set([
  'id',
  'taskId',
  'timesheetId',
  'timeSheetId',
  'projectId',
  'userId',
  'activityId',
  'customFieldId',
  'fieldId',
  'sprintId',
  'customerId',
  'parentId',
  'taskTypeId',
  'projectTaskId',
  'bugId',
]);

const INT_REGEX = /^-?(?:0|[1-9]\d*)$/;

export function parseLosslessJson(input: string): unknown {
  let index = 0;
  const len = input.length;

  function skipWhitespace(): void {
    while (index < len) {
      const ch = input.charCodeAt(index);
      if (ch === 32 || ch === 10 || ch === 13 || ch === 9) {
        index++;
      } else {
        break;
      }
    }
  }

  function parseValue(): unknown {
    skipWhitespace();
    if (index >= len) {
      throw new SyntaxError('Unexpected end of JSON input');
    }
    const ch = input[index];
    if (ch === '{') return parseObject();
    if (ch === '[') return parseArray();
    if (ch === '"') return parseString();
    if (ch === 't') return parseLiteral('true', true);
    if (ch === 'f') return parseLiteral('false', false);
    if (ch === 'n') return parseLiteral('null', null);
    if (ch === '-' || (ch >= '0' && ch <= '9')) return parseNumber();
    throw new SyntaxError(`Unexpected token '${ch}' at position ${index}`);
  }

  function parseLiteral<T>(literal: string, value: T): T {
    if (input.startsWith(literal, index)) {
      index += literal.length;
      return value;
    }
    throw new SyntaxError(`Invalid literal at position ${index}`);
  }

  function parseString(): string {
    const startQuote = index;
    index++; // skip opening "
    let result = '';
    let chunkStart = index;

    while (index < len) {
      const ch = input[index];
      if (ch === '"') {
        result += input.slice(chunkStart, index);
        index++;
        return result;
      }
      if (ch === '\\') {
        result += input.slice(chunkStart, index);
        index++;
        if (index >= len) {
          throw new SyntaxError(`Unterminated escape sequence at ${index}`);
        }
        const esc = input[index];
        switch (esc) {
          case '"':
            result += '"';
            index++;
            break;
          case '\\':
            result += '\\';
            index++;
            break;
          case '/':
            result += '/';
            index++;
            break;
          case 'b':
            result += '\b';
            index++;
            break;
          case 'f':
            result += '\f';
            index++;
            break;
          case 'n':
            result += '\n';
            index++;
            break;
          case 'r':
            result += '\r';
            index++;
            break;
          case 't':
            result += '\t';
            index++;
            break;
          case 'u': {
            const hex = input.slice(index + 1, index + 5);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
              throw new SyntaxError(`Invalid unicode escape at ${index}`);
            }
            result += String.fromCharCode(parseInt(hex, 16));
            index += 5;
            break;
          }
          default:
            throw new SyntaxError(`Invalid escape '\\${esc}' at ${index}`);
        }
        chunkStart = index;
      } else {
        index++;
      }
    }
    throw new SyntaxError(`Unterminated string starting at ${startQuote}`);
  }

  function parseNumber(): number | bigint {
    const start = index;
    if (input[index] === '-') index++;
    if (index >= len || input[index] < '0' || input[index] > '9') {
      throw new SyntaxError(`Invalid number at position ${start}`);
    }
    if (input[index] === '0') {
      index++;
    } else {
      while (index < len && input[index] >= '0' && input[index] <= '9') {
        index++;
      }
    }
    let isFloat = false;
    if (index < len && input[index] === '.') {
      isFloat = true;
      index++;
      if (index >= len || input[index] < '0' || input[index] > '9') {
        throw new SyntaxError(`Invalid fraction in number at ${start}`);
      }
      while (index < len && input[index] >= '0' && input[index] <= '9') {
        index++;
      }
    }
    if (index < len && (input[index] === 'e' || input[index] === 'E')) {
      isFloat = true;
      index++;
      if (index < len && (input[index] === '+' || input[index] === '-')) {
        index++;
      }
      if (index >= len || input[index] < '0' || input[index] > '9') {
        throw new SyntaxError(`Invalid exponent in number at ${start}`);
      }
      while (index < len && input[index] >= '0' && input[index] <= '9') {
        index++;
      }
    }

    const token = input.slice(start, index);
    if (!isFloat) {
      const big = BigInt(token);
      if (
        big > BigInt(Number.MAX_SAFE_INTEGER) ||
        big < BigInt(Number.MIN_SAFE_INTEGER)
      ) {
        return big;
      }
      return Number(token);
    }
    return Number(token);
  }

  function parseArray(): unknown[] {
    index++; // skip [
    const arr: unknown[] = [];
    skipWhitespace();
    if (index < len && input[index] === ']') {
      index++;
      return arr;
    }
    while (index < len) {
      arr.push(parseValue());
      skipWhitespace();
      if (index < len && input[index] === ',') {
        index++;
        continue;
      }
      if (index < len && input[index] === ']') {
        index++;
        return arr;
      }
      throw new SyntaxError(`Expected ',' or ']' at position ${index}`);
    }
    throw new SyntaxError('Unterminated array');
  }

  function parseObject(): Record<string, unknown> {
    index++; // skip {
    const obj: Record<string, unknown> = {};
    skipWhitespace();
    if (index < len && input[index] === '}') {
      index++;
      return obj;
    }
    while (index < len) {
      skipWhitespace();
      if (input[index] !== '"') {
        throw new SyntaxError(`Expected property key at position ${index}`);
      }
      const key = parseString();
      skipWhitespace();
      if (input[index] !== ':') {
        throw new SyntaxError(`Expected ':' at position ${index}`);
      }
      index++;
      const val = parseValue();
      if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
        obj[key] = val;
      }
      skipWhitespace();
      if (index < len && input[index] === ',') {
        index++;
        continue;
      }
      if (index < len && input[index] === '}') {
        index++;
        return obj;
      }
      throw new SyntaxError(`Expected ',' or '}' at position ${index}`);
    }
    throw new SyntaxError('Unterminated object');
  }

  const parsed = parseValue();
  skipWhitespace();
  if (index < len) {
    throw new SyntaxError(`Unexpected trailing character at position ${index}`);
  }
  return parsed;
}

/**
 * Extracts paths/keys that were originally numbers in the parsed upstream object,
 * so when resending modified payloads back to Java/upstream, integer fields keep integer JSON types.
 */
export function collectIntegerKeys(value: unknown, result: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectIntegerKeys(item, result);
    }
    return result;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'bigint' || (typeof v === 'number' && Number.isInteger(v))) {
        result.add(k);
      } else if (v && typeof v === 'object') {
        collectIntegerKeys(v, result);
      }
    }
  }
  return result;
}

/**
 * Converts parsed upstream data into browser-safe DTOs:
 * - Any bigint becomes a string.
 * - Any known ID key holding an integer becomes a string.
 */
export function toClientDto<T = unknown>(value: T, keyName?: string): T {
  if (typeof value === 'bigint') {
    return value.toString() as unknown as T;
  }
  if (typeof value === 'number' && keyName && ID_FIELD_KEYS.has(keyName) && Number.isInteger(value)) {
    return String(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toClientDto(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = toClientDto(v, k);
    }
    return out as T;
  }
  return value;
}

/**
 * Serializes a payload for upstream Java/JSON endpoints without losing precision
 * on 64-bit integer IDs. String IDs matching integerKeys or ID_FIELD_KEYS
 * (when clean integer digits) are emitted as unquoted JSON integers.
 */
export function stringifyLosslessJson(
  value: unknown,
  extraIntegerKeys?: Set<string>
): string {
  function isIntegerKey(key?: string): boolean {
    if (!key) return false;
    return ID_FIELD_KEYS.has(key) || (extraIntegerKeys ? extraIntegerKeys.has(key) : false);
  }

  function serialize(val: unknown, key?: string): string {
    if (val === null || val === undefined) {
      return 'null';
    }
    if (typeof val === 'bigint') {
      return val.toString();
    }
    if (typeof val === 'boolean') {
      return val ? 'true' : 'false';
    }
    if (typeof val === 'number') {
      if (!Number.isFinite(val)) return 'null';
      return String(val);
    }
    if (typeof val === 'string') {
      if (isIntegerKey(key) && INT_REGEX.test(val)) {
        return val;
      }
      return JSON.stringify(val);
    }
    if (Array.isArray(val)) {
      return `[${val.map((item) => serialize(item)).join(',')}]`;
    }
    if (typeof val === 'object') {
      const entries: string[] = [];
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        if (v === undefined) continue;
        entries.push(`${JSON.stringify(k)}:${serialize(v, k)}`);
      }
      return `{${entries.join(',')}}`;
    }
    return 'null';
  }

  return serialize(value);
}
