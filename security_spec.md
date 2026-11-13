# Security Specification & Threat Model

## 1. Data Invariants
1. **Room Ownership & Identity**: A room document `/rooms/{roomId}` must have `roomId == roomCode` (`^[0-9]{4,6}$`), a valid verified `hostUid == request.auth.uid` on creation, and `hostUid` / `roomCode` / `createdAt` remain immutable after creation.
2. **Secret Isolation**: `/rooms/{roomId}/secrets/{playerUid}` may ONLY be read by `playerUid` or the room's verified `hostUid` (for game state setup), and ONLY created/updated by the verified `hostUid`. No non-owner participant may read another participant's secret role card.
3. **Host Vault Isolation**: `/rooms/{roomId}/hostState/{docId}` may ONLY be read, created, updated, or deleted by `hostUid`.
4. **Authenticated Request Queue**: `/rooms/{roomId}/playerRequests/{reqId}` may ONLY be created by a verified user with `authorUid == request.auth.uid`, `processed == false`, `createdAt == request.time`, and `hostUid` matching the parent room's `hostUid`.
5. **Bounded Arrays & Strings**: `memberUids`, `players`, `readyPlayerIds`, `tiedCandidateIds` are strictly capped at `<= 10`; `chat` is capped at `<= 80`; all string fields have explicit `.size()` upper bounds.
6. **Temporal Integrity**: `createdAt == request.time` on creation and `updatedAt == request.time` on updates.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Room Create**: `request.auth == null` creating `/rooms/4829`. Expected: `PERMISSION_DENIED`.
2. **Unverified Email Create**: `email_verified == false` creating `/rooms/4829`. Expected: `PERMISSION_DENIED`.
3. **Host Spoofing on Create**: `hostUid: "victim_uid"` while `request.auth.uid == "attacker_uid"`. Expected: `PERMISSION_DENIED`.
4. **Shadow Field Injection on Room Create**: Adding `"isAdmin": true` ghost field on `/rooms/4829`. Expected: `PERMISSION_DENIED`.
5. **ID Poisoning**: Creating `/rooms/invalid_room_id_too_long_or_symbols!@#`. Expected: `PERMISSION_DENIED`.
6. **Host Takeover Update**: Non-host participant updating `/rooms/4829` with `hostUid: "attacker_uid"`. Expected: `PERMISSION_DENIED`.
7. **Terminal State Tampering**: Host attempting to set `winner: "MAFIA"` after `phase == "GAME_OVER"` without resetting to `"LOBBY"`. Expected: `PERMISSION_DENIED`.
8. **Cross-Player Secret Snooping**: Participant A reading `/rooms/4829/secrets/participantB`. Expected: `PERMISSION_DENIED`.
9. **Host Vault Snooping**: Participant reading `/rooms/4829/hostState/private`. Expected: `PERMISSION_DENIED`.
10. **Forged Request Author**: Participant creating `/rooms/4829/playerRequests/req1` with `authorUid: "other_uid"`. Expected: `PERMISSION_DENIED`.
11. **Oversized Array / Denial of Wallet**: Creating `/rooms/4829` with 11 items in `memberUids` or 300-char `text` in `playerRequests`. Expected: `PERMISSION_DENIED`.
12. **Blanket Room Scraping**: Calling `list` on `/rooms` without filtering to `memberUids` or `hostUid`. Expected: `PERMISSION_DENIED`.
