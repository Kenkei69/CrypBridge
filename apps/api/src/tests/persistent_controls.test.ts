import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '@x402/database';
import { getConfig } from '../config/env.js';
import { persistKillSwitch, readPersistentKillSwitch, assertPersistentKillSwitch } from '../modules/payment-engine/killSwitch.js';

it('persists emergency halt across connections and fails closed at the execution boundary', async () => {
  const first = createDatabase(getConfig().DATABASE_URL);
  const second = createDatabase(getConfig().DATABASE_URL);
  const previous = process.env.APP_ENV;
  try {
    await persistKillSwitch(first.db, true, 'restart safety check');
    await first.close();
    const state = await readPersistentKillSwitch(second.db);
    assert.equal(state.active, true);
    assert.equal(state.reason, 'restart safety check');
    assert.ok(state.activatedAt);
    process.env.APP_ENV = 'production';
    await assert.rejects(() => assertPersistentKillSwitch(second.db), /restart safety check/);
    await persistKillSwitch(second.db, false, '');
    await assertPersistentKillSwitch(second.db);
    await assert.rejects(() => assertPersistentKillSwitch({ execute: async () => [] }), /missing/);
  } finally {
    if (previous === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previous;
    await persistKillSwitch(second.db, false, '');
    await first.close(); await second.close();
  }
});
