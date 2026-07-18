// Admin for races data management (CSV upload, track conditions).
// Distinct from the separate community-moderation admin in app/community/page.js.
export const RACES_ADMIN_ID = 'user_3ELAZyaOPUNLmkzOfuThRoCEHaG';

export function isRacesAdmin(userId) {
  return userId === RACES_ADMIN_ID;
}
