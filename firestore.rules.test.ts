/**
 * Verification specification for Dirty Dozen security rule tests.
 * Designed for @firebase/rules-unit-testing against firestore.rules.
 */

export const DIRTY_DOZEN_CASES = [
  { id: 1, name: 'Unauthenticated Room Create', expected: 'PERMISSION_DENIED' },
  { id: 2, name: 'Unverified Email Create', expected: 'PERMISSION_DENIED' },
  { id: 3, name: 'Host Spoofing on Create', expected: 'PERMISSION_DENIED' },
  { id: 4, name: 'Shadow Field Injection on Room Create', expected: 'PERMISSION_DENIED' },
  { id: 5, name: 'ID Poisoning on Room Path', expected: 'PERMISSION_DENIED' },
  { id: 6, name: 'Host Takeover Update by Non-Host', expected: 'PERMISSION_DENIED' },
  { id: 7, name: 'Terminal State Tampering in GAME_OVER', expected: 'PERMISSION_DENIED' },
  { id: 8, name: 'Cross-Player Secret Snooping', expected: 'PERMISSION_DENIED' },
  { id: 9, name: 'Host Vault Snooping by Participant', expected: 'PERMISSION_DENIED' },
  { id: 10, name: 'Forged Request Author UID', expected: 'PERMISSION_DENIED' },
  { id: 11, name: 'Oversized Array / String Resource Poisoning', expected: 'PERMISSION_DENIED' },
  { id: 12, name: 'Unauthorized Blanket Collection List', expected: 'PERMISSION_DENIED' },
] as const;
