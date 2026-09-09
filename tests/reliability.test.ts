import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createSaveQueue } from '../src/lib/saveQueue.ts';
import { createAuthObserver } from '../src/lib/authObserver.ts';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('saves in order and flush waits for edits made during the first request', async () => {
  const first = deferred();
  const writes: number[] = [];
  const queue = createSaveQueue(0, async value => {
    writes.push(value);
    if (value === 1) await first.promise;
  });
  queue.update(1);
  const saving = queue.flush();
  await delay(0);
  queue.update(2);
  queue.update(3);
  const leaving = queue.flush();
  assert.equal(saving, leaving);
  assert.deepEqual(writes, [1]);
  first.resolve();
  await leaving;
  assert.deepEqual(writes, [1, 3]);
  assert.equal(queue.isDirty(), false);
});

test('failed save rejects navigation and retry saves the newest snapshot', async () => {
  let offline = true;
  let stored = 0;
  let navigated = false;
  const queue = createSaveQueue(0, async value => {
    if (offline) throw new Error('offline');
    stored = value;
  });
  queue.update(1);
  await assert.rejects(async () => { await queue.flush(); navigated = true; }, /offline/);
  assert.equal(navigated, false);
  assert.equal(queue.isDirty(), true);
  offline = false;
  queue.update(2);
  await queue.flush();
  assert.equal(stored, 2);
  assert.equal(queue.isDirty(), false);
});

test('opening an unchanged gradebook does not issue a write', async () => {
  let writes = 0;
  const queue = createSaveQueue({}, async () => { writes++; });
  await queue.flush();
  assert.equal(writes, 0);
});

test('auth callback returns before resolving and stale profile cannot restore a signed-out user', async () => {
  const profile = deferred<string>();
  const users: Array<string | null> = [];
  let started = false;
  const observer = createAuthObserver({
    resolve: async (_session: string) => { started = true; return profile.promise; },
    apply: user => users.push(user), fail: assert.fail,
  });
  assert.equal(observer.onChange('SIGNED_IN', 'session'), undefined);
  assert.equal(started, false);
  await delay(5);
  assert.equal(started, true);
  observer.onChange('SIGNED_OUT', null);
  profile.resolve('old-user');
  await delay(5);
  assert.deepEqual(users, [null]);
  observer.dispose();
});

test('auth failures surface and a subsequent event can recover', async () => {
  const failures: unknown[] = [];
  const users: string[] = [];
  const observer = createAuthObserver({
    resolve: async (session: string) => { if (session === 'bad') throw new Error('network'); return session; },
    apply: user => users.push(user!), fail: error => failures.push(error),
  });
  observer.onChange('INITIAL_SESSION', 'bad');
  await delay(10);
  assert.equal(failures.length, 1);
  observer.onChange('SIGNED_IN', 'good');
  await delay(10);
  assert.deepEqual(users, ['good']);
  observer.dispose();
});

test('timed-out and disposed auth work cannot apply late results', { timeout: 2000 }, async () => {
  const profile = deferred<string>();
  const timedOut = deferred();
  let failures = 0;
  let applied = 0;
  const observer = createAuthObserver({
    resolve: async (_s: string) => profile.promise,
    apply: () => applied++, fail: () => { failures++; timedOut.resolve(); }, timeoutMs: 5,
  });
  observer.onChange('INITIAL_SESSION', 'slow');
  await timedOut.promise;
  assert.equal(failures, 1);
  profile.resolve('late');
  await delay(5);
  assert.equal(applied, 0);
  observer.onChange('SIGNED_IN', 'disposed');
  observer.dispose();
  await delay(5);
  assert.equal(applied, 0);
});
