// Admin for races data management (CSV upload, track conditions).
// Distinct from the separate community-moderation admin in app/community/page.js.
export const RACES_ADMIN_ID = 'user_3ELAZyaOPUNLmkzOfuThRoCEHaG';

// Site-wide admin (e.g. /admin/* pages). Same person as RACES_ADMIN_ID today,
// kept as a separate name so races-admin and site-admin can diverge later.
export const SITE_ADMIN_ID = RACES_ADMIN_ID;

export function isRacesAdmin(userId) {
  return userId === RACES_ADMIN_ID;
}

export function isSiteAdmin(userId) {
  return userId === SITE_ADMIN_ID;
}

// Community moderation admin -- a different person from races/site admin
// (see note above). Historically duplicated as a local `ADMIN_ID` const in
// app/community/page.js and app/community/post/[id]/page.js; those two
// client files still keep their own copy (display-only "is this me"
// checks), but server-side authorization now goes through this one.
export const COMMUNITY_ADMIN_ID = 'user_3EI3ZvqwnPRQCX0tWtJQE6JsiwU';

export function isCommunityAdmin(userId) {
  return userId === COMMUNITY_ADMIN_ID;
}
