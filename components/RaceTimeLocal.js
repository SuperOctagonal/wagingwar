'use client';
import { useState, useEffect } from 'react';
import { formatRaceTimeViewerLocal } from '@/lib/raceTime';

// Renders a race_schedule-style post_time string ("01.46 pm", Sydney-clock
// -- see lib/raceTime.js) converted to the VIEWER's own local timezone with
// a short zone label (e.g. "12:46 pm AEST" for a Brisbane viewer, "1:46 pm
// AEDT" for a Sydney one, looking at the exact same race).
//
// Renders the raw Sydney string on first paint (server and client agree,
// so no hydration mismatch) and swaps to the viewer-local formatted string
// in a useEffect after mount -- Render's server timezone differs from the
// browser's, so this conversion can only safely happen client-side.
export default function RaceTimeLocal({ dateISO, time, style, fallback = null }) {
  const [display, setDisplay] = useState(time || fallback);

  useEffect(() => {
    if (!dateISO || !time) { setDisplay(time || fallback); return; }
    const local = formatRaceTimeViewerLocal(dateISO, time);
    setDisplay(local || time);
  }, [dateISO, time, fallback]);

  if (!time) return fallback;
  return <span style={style} suppressHydrationWarning>{display}</span>;
}
