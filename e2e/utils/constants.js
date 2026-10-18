// Every piece of content this suite creates (bets, blackbook notes,
// community posts/replies, usernames/text fields) is prefixed with this so
// it's unmistakable in the live UI and trivially greppable for a manual
// sweep if a test's own cleanup ever fails to run.
const QA_PREFIX = 'QA e2e -';

// A tag appended to free-text fields for an extra, even-more-specific
// marker (e.g. inside a bet's note) -- QA_PREFIX alone is enough for
// anything user-visible, this is for fields a human wouldn't normally see.
const qa = (suffix) => `${QA_PREFIX} ${suffix}`;

module.exports = { QA_PREFIX, qa };
