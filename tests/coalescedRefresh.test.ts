import assert from 'node:assert/strict';
import test from 'node:test';
import { createCoalescedRefresh } from '../src/lib/coalescedRefresh';

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('coalesces bursts and does not starve under continuous events', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let calls = 0;
  const refresh = createCoalescedRefresh(async () => { calls++; }, { debounceMs: 20, fallbackIntervalMs: 0 });
  for (let i = 0; i < 5; i++) refresh.schedule();
  t.mock.timers.tick(10);
  refresh.schedule();
  t.mock.timers.tick(10);
  await flush();
  assert.equal(calls, 1);
  refresh.dispose();
});

test('queues one follow-up without overlapping an in-flight refresh', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let calls = 0;
  let release!: () => void;
  const refresh = createCoalescedRefresh(async () => {
    calls++;
    if (calls === 1) await new Promise<void>(resolve => { release = resolve; });
  }, { debounceMs: 10, fallbackIntervalMs: 0 });
  refresh.schedule();
  t.mock.timers.tick(10);
  for (let i = 0; i < 5; i++) refresh.schedule();
  t.mock.timers.tick(100);
  assert.equal(calls, 1);
  release();
  await flush();
  t.mock.timers.tick(10);
  await flush();
  assert.equal(calls, 2);
  refresh.dispose();
});

test('dispose cancels pending work and fallback polling', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let calls = 0;
  const refresh = createCoalescedRefresh(async () => { calls++; });
  refresh.schedule();
  refresh.dispose();
  refresh.schedule();
  t.mock.timers.tick(120000);
  assert.equal(calls, 0);
});

test('recovers after a rejected refresh', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let calls = 0;
  const refresh = createCoalescedRefresh(async () => { calls++; throw new Error('offline'); }, { debounceMs: 10, fallbackIntervalMs: 0 });
  refresh.schedule();
  t.mock.timers.tick(10);
  await flush();
  refresh.schedule();
  t.mock.timers.tick(10);
  await flush();
  assert.equal(calls, 2);
  refresh.dispose();
});

test('defers hidden-tab events and polling until visible', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const doc = new EventTarget() as EventTarget & { visibilityState: string };
  doc.visibilityState = 'hidden';
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  let calls = 0;
  const refresh = createCoalescedRefresh(async () => { calls++; }, { debounceMs: 10, fallbackIntervalMs: 100 });
  try {
    refresh.schedule();
    t.mock.timers.tick(300);
    assert.equal(calls, 0);
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    t.mock.timers.tick(10);
    await flush();
    assert.equal(calls, 1);
  } finally {
    refresh.dispose();
    Reflect.deleteProperty(globalThis, 'document');
  }
});
