import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { getConfig } from '../config/env.js';

describe('PostgreSQL Row Level Security & Role Boundaries', () => {
  it('verifies that postgres superuser role has BYPASS RLS documented', async () => {
    const config = getConfig();
    const sql = postgres(config.DATABASE_URL, { max: 1 });
    try {
      const [roleInfo] = await sql`
        SELECT rolname, rolsuper, rolbypassrls 
        FROM pg_roles 
        WHERE rolname = 'postgres';
      `;
      assert.ok(roleInfo, 'postgres role must exist');
      assert.equal(roleInfo.rolbypassrls, true, 'postgres superuser role has BYPASS RLS');
    } finally {
      await sql.end();
    }
  });

  it('tests PostgreSQL engine-level RLS policy isolation with an unprivileged role', async () => {
    const config = getConfig();
    const adminSql = postgres(config.DATABASE_URL, { max: 1 });
    const userA = '11111111-aaaa-1111-aaaa-111111111111';
    const userB = '22222222-bbbb-2222-bbbb-222222222222';

    try {
      // 1. Setup profiles and conversations for User A and User B
      await adminSql`
        INSERT INTO profiles (id, email, display_name) 
        VALUES 
          (${userA}, 'rls_a@test.com', 'RLS User A'),
          (${userB}, 'rls_b@test.com', 'RLS User B')
        ON CONFLICT (id) DO NOTHING;
      `;

      await adminSql`
        INSERT INTO conversations (id, user_id, title)
        VALUES 
          ('aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', ${userA}, 'User A RLS Secret Conv'),
          ('bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb', ${userB}, 'User B RLS Secret Conv')
        ON CONFLICT (id) DO NOTHING;
      `;

      // 2. Create unprivileged role without BYPASS RLS to test policy execution
      await adminSql.unsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'rls_unprivileged_test') THEN
            CREATE ROLE rls_unprivileged_test LOGIN NOBYPASSRLS;
          END IF;
        END
        $$;
        GRANT USAGE ON SCHEMA public TO rls_unprivileged_test;
        GRANT SELECT, INSERT ON conversations TO rls_unprivileged_test;
      `);

      // 3. Test policy inside transaction setting app.current_user_id as User A
      const rowsSeenByUserA = await adminSql.begin(async (tx) => {
        // Switch execution role to unprivileged role
        await tx.unsafe('SET LOCAL ROLE rls_unprivileged_test;');
        // Set user context
        await tx`SELECT set_config('app.current_user_id', ${userA}, true);`;

        // Run query without WHERE clause; RLS must filter to only User A
        return tx`SELECT id, user_id, title FROM conversations;`;
      });

      // User A MUST NOT see User B's rows!
      assert.ok(rowsSeenByUserA.length > 0);
      assert.ok(
        rowsSeenByUserA.every((r) => r['user_id'] === userA),
        'RLS must strictly filter out User B rows at SQL engine level'
      );
      assert.ok(
        !rowsSeenByUserA.some((r) => r['user_id'] === userB),
        'User B rows must never be returned under User A context'
      );
    } finally {
      // Cleanup
      try {
        await adminSql.unsafe(`
          DROP OWNED BY rls_unprivileged_test CASCADE;
          DROP ROLE IF EXISTS rls_unprivileged_test;
        `);
      } catch (err) {
        console.warn('RLS test role cleanup warning:', err);
      }
      await adminSql.end();
    }
  });
});
