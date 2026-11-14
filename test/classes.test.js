import test from 'node:test';
import assert from 'node:assert/strict';
import { DISPLAY_DIGITS, digitForClass, classForRow } from '../src/shared/classes.js';

test('every class ID maps to the same digit in display order 1…9,0', () => {
  assert.deepEqual(DISPLAY_DIGITS, [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);
  for (let classId = 0; classId < 10; classId += 1) {
    assert.equal(digitForClass(classId), DISPLAY_DIGITS[classId]);
    assert.equal(classForRow(classId), DISPLAY_DIGITS[classId]);
    assert.equal(DISPLAY_DIGITS.indexOf(digitForClass(classId)), classId);
  }
});

test('invalid output class and row indices are rejected', () => {
  for (const value of [-1, 10, 0.5, NaN]) {
    assert.throws(() => digitForClass(value), /class/i);
    assert.throws(() => classForRow(value), /row/i);
  }
});
