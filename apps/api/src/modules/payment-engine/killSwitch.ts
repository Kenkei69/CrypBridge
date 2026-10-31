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
  return killSwitchActive;
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
