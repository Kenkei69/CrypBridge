import { sql } from 'drizzle-orm';
import { AppError } from '@x402/shared';
/**
 * Payment Engine Kill Switch
 *
 * Emergency control to halt new payment authorization and execution.
 * When enabled, authorization gate blocks new authorizations immediately.
 * Status inspection, audit viewing, and reconciliation remain enabled.
 */

let killSwitchActive = false;
let killSwitchReason = '';
let killSwitchActivatedAt: Date | null = null;

export function isKillSwitchActive(): boolean {
  return process.env.APP_ENV === 'production' ? false : killSwitchActive;
}

export function getKillSwitchStatus(): { active: boolean; reason: string; activatedAt: string | null } {
  return {
    active: killSwitchActive,
    reason: killSwitchReason,
    activatedAt: killSwitchActivatedAt ? killSwitchActivatedAt.toISOString() : null,
  };
}

export function setKillSwitch(active: boolean, reason = 'Administrative emergency halt'): void {
  killSwitchActive = active;
  killSwitchReason = active ? reason : '';
  killSwitchActivatedAt = active ? new Date() : null;
}

// Production controls are read at the signing/settlement boundary, never cached.
export async function readPersistentKillSwitch(db: any) {
  const rows = await db.execute(sql`SELECT active, reason, activated_at FROM simulation_controls WHERE id = TRUE`);
  const state = rows[0];
  if (!state) throw new Error('Simulation control row missing; refusing execution');
  return { active: state.active as boolean, reason: state.reason as string,
    activatedAt: state.activated_at ? new Date(state.activated_at).toISOString() : null };
}
export async function assertPersistentKillSwitch(db: any): Promise<void> {
  if (process.env.APP_ENV !== 'production') return;
  const state = await readPersistentKillSwitch(db);
  if (state.active) throw AppError.forbidden('Emergency simulation halt: ' + state.reason);
}
export async function persistKillSwitch(db: any, active: boolean, reason: string): Promise<void> {
  await db.execute(sql`UPDATE simulation_controls SET active = ${active}, reason = ${active ? reason : ''}, activated_at = ${active ? new Date() : null} WHERE id = TRUE`);
}
