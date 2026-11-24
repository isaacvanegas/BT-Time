import { describe, expect, it } from 'vitest';
import {
  collectIntegerKeys,
  parseLosslessJson,
  stringifyLosslessJson,
  toClientDto,
} from '../server/lib/losslessJson.ts';

describe('losslessJson 64-bit integer handling', () => {
  it('preserves integers larger than Number.MAX_SAFE_INTEGER without rounding', () => {
    const rawJson = `{
      "id": 9007199254740993,
      "taskId": 9223372036854775807,
      "negativeId": -9007199254740995,
      "normalNumber": 42,
      "decimalValue": 12.5,
      "note": "Test 9007199254740993"
    }`;

    const parsed = parseLosslessJson(rawJson) as Record<string, unknown>;
    expect(parsed.id).toBe(9007199254740993n);
    expect(parsed.taskId).toBe(9223372036854775807n);
    expect(parsed.negativeId).toBe(-9007199254740995n);
    expect(parsed.normalNumber).toBe(42);
    expect(parsed.decimalValue).toBe(12.5);

    const dto = toClientDto(parsed) as Record<string, unknown>;
    expect(dto.id).toBe('9007199254740993');
    expect(dto.taskId).toBe('9223372036854775807');
    expect(dto.negativeId).toBe('-9007199254740995');

    const intKeys = collectIntegerKeys(parsed);
    const serialized = stringifyLosslessJson(dto, intKeys);

    expect(serialized).toContain('"id":9007199254740993');
    expect(serialized).toContain('"taskId":9223372036854775807');
    expect(serialized).toContain('"negativeId":-9007199254740995');
    expect(serialized).toContain('"note":"Test 9007199254740993"');
  });

  it('keeps string customField values like Commit ID quoted even when numeric', () => {
    const payload = {
      note: 'Actualización completada',
      percentComplete: 0,
      customFields: [
        { id: '9007199254740999', name: 'Activity Type', value: 'Gestión' },
        { id: '9007199254741001', name: 'Commit ID', value: '123456' },
      ],
    };

    const json = stringifyLosslessJson(payload);
    expect(json).toContain('"id":9007199254740999');
    expect(json).toContain('"id":9007199254741001');
    expect(json).toContain('"value":"123456"');
    expect(json).toContain('"value":"Gestión"');
  });
});
