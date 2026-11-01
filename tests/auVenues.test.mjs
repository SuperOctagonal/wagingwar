// Run: npm run test:unit
// Venues added 2026-11-01 (Traralgon + the 90-day sweep's 16): each is a known
// AU venue with its Racing Australia state. Mirrors
// wagingwar-backend/tests/test_venue_sweep_2026_11.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AU_VENUE_STATE, isKnownAuVenue, normaliseVenue } from '../lib/venues.js';

const ADDED = {
  TRARALGON: 'VIC', AVOCA: 'VIC', MORTLAKE: 'VIC', 'ST ARNAUD': 'VIC', WYCHEPROOF: 'VIC', 'YARRA VALLEY': 'VIC',
  BALRANALD: 'NSW', BOMBALA: 'NSW', COONAMBLE: 'NSW', DENILIQUIN: 'NSW', TUMUT: 'NSW', WAUCHOPE: 'NSW',
  ISISFORD: 'QLD', COLLIE: 'WA', LAVERTON: 'WA', LEINSTER: 'WA', PENOLA: 'SA',
};

test('added venues are known AU venues with their RA state', () => {
  for (const [name, state] of Object.entries(ADDED)) {
    assert.equal(normaliseVenue(name), name, name);
    assert.equal(isKnownAuVenue(name), true, name);
    assert.equal(AU_VENUE_STATE[name], state, name);
  }
});

test('A PARK (NZ) stays unknown', () => {
  assert.equal(isKnownAuVenue('A PARK'), false);
});
