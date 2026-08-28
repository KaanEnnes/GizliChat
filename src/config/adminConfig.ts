/**
 * Uid of the app's single, openly disclosed admin account (username
 * "admin", created via scripts/createAdminAccount.js — see that script's
 * doc comment and ObsidianVault/Changelog.md for the full rationale).
 *
 * This is NOT a secret backdoor: every chat room's UI shows a persistent
 * banner disclosing that the admin account can also read that conversation
 * (see ChatRoomScreen.tsx), and firestore.rules grants this account
 * read-only access to every room/message (see isAdmin()). The uid below must
 * match the identical constant in web-client/src/config/adminConfig.ts and
 * the inline `ADMIN_UID` in pc-client/index.html.
 */
export const ADMIN_UID = '8PCGPrrJpfP2Scmw731gzsEol9H2';
