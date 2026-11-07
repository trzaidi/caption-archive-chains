import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findVariables, remapReferences, renderTemplate, validateTemplate } from '../lib/template.ts';

test('finds variables with optional spaces', () => {
  assert.deepEqual(findVariables('a {{input}} b {{ previous }} {{step_2}}'), ['input', 'previous', 'step_2']);
});

test('step 1 cannot use previous or step references', () => {
  assert.match(validateTemplate('{{previous}}', 1)!, /no previous/);
  assert.match(validateTemplate('{{step_1}}', 1)!, /earlier step/);
  assert.equal(validateTemplate('Describe {{input}}', 1), null);
});

test('later steps may only reference earlier steps', () => {
  assert.equal(validateTemplate('{{step_1}} {{step_2}} {{previous}}', 3), null);
  assert.match(validateTemplate('{{step_3}}', 3)!, /earlier step/);
  assert.match(validateTemplate('{{step_0}}', 3)!, /earlier step/);
  assert.match(validateTemplate('{{foo}}', 2)!, /Unknown variable/);
});

test('renders input, previous and numbered outputs', () => {
  const outputs = new Map([[1, 'a cat'], [2, 'cats are funny']]);
  assert.equal(renderTemplate('{{input}} | {{step_1}} | {{previous}}', 3, { input: 'hi', outputs }), 'hi | a cat | cats are funny');
  assert.equal(renderTemplate('{{step_9}}x', 3, { input: '', outputs }), 'x');
});

test('fills the rating app single-brace placeholders', () => {
  const out = renderTemplate('Tone: {tone}.{context}\nScene: {scene} / {{input}}', 1, { input: 'a pigeon', outputs: new Map(), tone: 'Deadpan' });
  assert.equal(out, 'Tone: Deadpan.\nScene: a pigeon / a pigeon');
});

test('references follow their step when steps move', () => {
  // Old order 1,2,3 -> new order 2,1,3: old step 1 is now 2, old step 2 is now 1.
  const map = (n: number) => ({ 1: 2, 2: 1, 3: 3 } as Record<number, number>)[n] ?? null;
  assert.deepEqual(remapReferences('{{step_1}} and {{ step_2 }}', map), { text: '{{step_2}} and {{step_1}}', broken: null });
});

test('reports a reference to a deleted step', () => {
  const afterDeleting2 = (n: number) => (n === 2 ? null : n > 2 ? n - 1 : n);
  assert.deepEqual(remapReferences('{{step_1}} {{step_3}}', afterDeleting2), { text: '{{step_1}} {{step_2}}', broken: null });
  assert.equal(remapReferences('{{step_2}}', afterDeleting2).broken, 2);
});
