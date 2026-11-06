import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validationMessage } from '../lib/api';

test('validation messages name the field a person can fix', () => {
  assert.equal(validationMessage({ issues: [{ path: ['body', 'email'], message: 'Invalid email' }] }), 'Email: Invalid email');
  assert.equal(validationMessage({ issues: [{ path: ['body', 'password'], message: 'String must contain at least 1 character(s)' }] }),
    'Password: String must contain at least 1 character(s)');
});

test('validation messages humanize other field paths and cap the number shown', () => {
  assert.equal(validationMessage({ issues: [{ path: ['body', 'settings', 'aspectRatio'], message: 'Invalid enum value' }] }),
    'Aspect ratio: Invalid enum value');
  assert.equal(validationMessage({ issues: [
    { path: ['body', 'a'], message: 'one' },
    { path: ['body', 'b'], message: 'two' },
    { path: ['body', 'c'], message: 'three' },
    { path: ['body', 'd'], message: 'four' },
  ] }), 'A: one B: two C: three');
});

test('validation messages fall back when the backend sends no field issues', () => {
  assert.equal(validationMessage(undefined), null);
  assert.equal(validationMessage(null), null);
  assert.equal(validationMessage({}), null);
  assert.equal(validationMessage({ issues: [{ path: ['body', 'email'] }] }), null);
});
