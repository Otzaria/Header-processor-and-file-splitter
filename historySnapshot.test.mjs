import test from 'node:test';
import assert from 'node:assert/strict';
import { sameFileSnapshot } from './historySnapshot.js';

test('same snapshot or copied array is unchanged', () => {
  const file = { name: 'one', content: '<h1>text</h1>' };
  assert.equal(sameFileSnapshot([file], [file]), true);
  const snapshot = [file];
  assert.equal(sameFileSnapshot(snapshot, snapshot), true);
});

test('immutable content and name edits both create history states', () => {
  const original = { name: 'one', content: 'before' };
  assert.equal(sameFileSnapshot([original], [{ ...original, content: 'after' }]), false);
  assert.equal(sameFileSnapshot([original], [{ ...original, name: 'two' }]), false);
});

test('adding, removing and reordering files are different states', () => {
  const a = { name: 'a', content: 'a' }, b = { name: 'b', content: 'b' };
  assert.equal(sameFileSnapshot([a], [a, b]), false);
  assert.equal(sameFileSnapshot([a, b], [a]), false);
  assert.equal(sameFileSnapshot([a, b], [b, a]), false);
});

test('large files do not require inspecting content', () => {
  const inaccessibleContent = new Proxy({}, { get() { throw Error('content must not be inspected'); } });
  const first = { name: 'a', content: inaccessibleContent };
  assert.equal(sameFileSnapshot([first], [first]), true);
});
