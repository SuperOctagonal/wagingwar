// AEST calendar day (YYYY-MM-DD) for an ISO timestamp or Date. Fixed UTC+10
// via 'Australia/Brisbane', the same basis the rest of the codebase uses for
// "today". Safe on server and client.
export function aestDay(input = new Date()) {
  return new Date(input).toLocaleDateString('sv-SE', { timeZone: 'Australia/Brisbane' });
}
