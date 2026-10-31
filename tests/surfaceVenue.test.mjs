// Run: npm run test:unit
// resolveSurfaceVenue() on the historical split days, using each date's real
// race_results.track_cond values (one entry per result row, as stored).
// Mirrors tests/test_surface_venue.py in wagingwar-backend -- same cases,
// same expected answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSurfaceVenue, trackSurface } from '../lib/surfaceVenue.mjs';

const rows = (cond, n) => Array(n).fill(cond);

test('30 Oct 2026 Pakenham: turf meeting the CSV labelled synthetic -> PAKENHAM', () => {
  const results = { PAKENHAM: [...rows('Soft 5', 57), ...rows('Soft 6', 29)] };
  assert.equal(resolveSurfaceVenue('PAKENHAM SYNTHETIC', results), 'PAKENHAM');
  assert.equal(resolveSurfaceVenue('PAKENHAM', results), 'PAKENHAM');
});

test('16 Aug 2026 Ballarat: turf -> BALLARAT', () => {
  const results = { BALLARAT: rows('Heavy 9', 40), 'PAKENHAM SYNTHETIC': rows('Synthetic', 73) };
  assert.equal(resolveSurfaceVenue('BALLARAT SYNTHETIC', results), 'BALLARAT');
  assert.equal(resolveSurfaceVenue('BALLARAT', results), 'BALLARAT');
});

test('12 Jul 2026 Ballarat: raced on the synthetic -> BALLARAT SYNTHETIC', () => {
  const results = { 'BALLARAT SYNTHETIC': rows('Synthetic', 50), DEVONPORT: rows('Synthetic', 79) };
  assert.equal(resolveSurfaceVenue('BALLARAT', results), 'BALLARAT SYNTHETIC');
  assert.equal(resolveSurfaceVenue('BALLARAT SYNTHETIC', results), 'BALLARAT SYNTHETIC');
});

test('24 Oct 2026 Gold Coast: raced on the poly -> GOLD COAST POLY', () => {
  const results = { 'GOLD COAST POLY': rows('Synthetic', 71) };
  assert.equal(resolveSurfaceVenue('GOLD COAST', results), 'GOLD COAST POLY');
  assert.equal(resolveSurfaceVenue('GOLD COAST POLY', results), 'GOLD COAST POLY');
});

test('12 Jul 2026 Devonport: not a pair (normaliseVenue already merges it) -> unchanged', () => {
  const results = { DEVONPORT: rows('Synthetic', 79) };
  assert.equal(resolveSurfaceVenue('DEVONPORT', results), 'DEVONPORT');
  assert.equal(resolveSurfaceVenue('DEVONPORT SYNTHETIC', results), 'DEVONPORT SYNTHETIC');
});

test('genuine synthetic day (2 Oct 2026 Pakenham Synthetic) is unchanged', () => {
  const results = { 'PAKENHAM SYNTHETIC': rows('Synthetic', 48) };
  assert.equal(resolveSurfaceVenue('PAKENHAM SYNTHETIC', results), 'PAKENHAM SYNTHETIC');
});

test('no results, mixed surfaces, or results under both names -> unchanged', () => {
  assert.equal(resolveSurfaceVenue('PAKENHAM SYNTHETIC', {}), 'PAKENHAM SYNTHETIC');
  assert.equal(resolveSurfaceVenue('PAKENHAM', { PAKENHAM: [] }), 'PAKENHAM');
  assert.equal(resolveSurfaceVenue('PAKENHAM SYNTHETIC', { PAKENHAM: ['Soft 5', 'Synthetic'] }), 'PAKENHAM SYNTHETIC');
  const both = { BALLARAT: ['Heavy 9'], 'BALLARAT SYNTHETIC': ['Synthetic'] };
  assert.equal(resolveSurfaceVenue('BALLARAT', both), 'BALLARAT');
  assert.equal(resolveSurfaceVenue('BALLARAT SYNTHETIC', both), 'BALLARAT SYNTHETIC');
});

test('blank conditions are ignored; names outside the pairs are unchanged', () => {
  assert.equal(resolveSurfaceVenue('PAKENHAM SYNTHETIC', { PAKENHAM: ['Soft 6', null, ''] }), 'PAKENHAM');
  assert.equal(resolveSurfaceVenue('FLEMINGTON', { FLEMINGTON: ['Good 4'] }), 'FLEMINGTON');
});

test('Sunshine Coast Poly is paired like Gold Coast Poly', () => {
  assert.equal(resolveSurfaceVenue('SUNSHINE COAST', { 'SUNSHINE COAST POLY': ['Synthetic'] }), 'SUNSHINE COAST POLY');
});

test('trackSurface', () => {
  assert.equal(trackSurface('Synthetic'), 'synthetic');
  assert.equal(trackSurface('Polytrack'), 'synthetic');
  assert.equal(trackSurface('Heavy 10'), 'turf');
  assert.equal(trackSurface(null), null);
});

test('normaliseVenue keeps PAKENHAM and SUNSHINE COAST POLY as their own names', async () => {
  const { normaliseVenue, isKnownAuVenue, resolveSurfaceVenue: reExported } = await import('../lib/venues.js');
  assert.equal(normaliseVenue('PAKENHAM'), 'PAKENHAM');
  assert.equal(normaliseVenue('PAKENHAM SYNTHETIC'), 'PAKENHAM SYNTHETIC');
  assert.equal(normaliseVenue('SOUTHSIDE PAKENHAM SYNTHETIC'), 'PAKENHAM SYNTHETIC');
  assert.equal(normaliseVenue('SUNSHINE COAST POLY'), 'SUNSHINE COAST POLY');
  assert.equal(isKnownAuVenue('SUNSHINE COAST POLY'), true);
  assert.equal(reExported, resolveSurfaceVenue);
});

test('bare PAKENHAM falls back to the synthetic only when the turf has no cards that day', async () => {
  const { resolveAmbiguousVenue } = await import('../lib/venues.js');
  assert.equal(resolveAmbiguousVenue('PAKENHAM', new Set(['PAKENHAM SYNTHETIC'])), 'PAKENHAM SYNTHETIC');
  assert.equal(resolveAmbiguousVenue('PAKENHAM', new Set(['PAKENHAM'])), 'PAKENHAM');
  assert.equal(resolveAmbiguousVenue('PAKENHAM', new Set(['PAKENHAM', 'PAKENHAM SYNTHETIC'])), 'PAKENHAM');
});
