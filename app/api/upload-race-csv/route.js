import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { parseCSV, buildRaces } from '@/lib/csvParser';
import { normaliseVenue } from '@/lib/venues';
import { isRacesAdmin } from '@/lib/admin';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

// Mirrors VENUE_STATE_MAP in app/api/import-csv/route.js and app/races/page.js
const VENUE_STATE_MAP = {
  'ROSEHILL':'NSW','ROSEHILL GARDENS':'NSW','NEWCASTLE':'NSW','RANDWICK':'NSW',
  'WARWICK FARM':'NSW','KEMBLA GRANGE':'NSW','GOSFORD':'NSW','HAWKESBURY':'NSW',
  'NARRANDERA':'NSW','MUDGEE':'NSW','GOULBURN':'NSW','BATHURST':'NSW','ORANGE':'NSW',
  'TAMWORTH':'NSW','GRAFTON':'NSW','LISMORE':'NSW','ARMIDALE':'NSW','TAREE':'NSW',
  'COFFS HARBOUR':'NSW','PORT MACQUARIE':'NSW','DUBBO':'NSW','WAGGA WAGGA':'NSW',
  'MUSWELLBROOK':'NSW','INVERELL':'NSW','MORUYA':'NSW','SCONE':'NSW','WYONG':'NSW',
  'FLEMINGTON':'VIC','CAULFIELD':'VIC','MOONEE VALLEY':'VIC','SANDOWN':'VIC',
  'SANDOWN-HILLSIDE':'VIC','SANDOWN HILLSIDE':'VIC','SANDOWN LAKESIDE':'VIC',
  'BENDIGO':'VIC','BALLARAT':'VIC','BALLARAT SYN':'VIC','BALLARAT SYNTHETIC':'VIC',
  'GEELONG':'VIC','PAKENHAM':'VIC','CRANBOURNE':'VIC','MORNINGTON':'VIC',
  'SEYMOUR':'VIC','ECHUCA':'VIC','HAMILTON':'VIC','HORSHAM':'VIC',
  'SWAN HILL':'VIC','WODONGA':'VIC','WANGARATTA':'VIC',
  'EAGLE FARM':'QLD','DOOMBEN':'QLD','GOLD COAST':'QLD','GOLD COAST POLY':'QLD',
  'TOOWOOMBA':'QLD','WARWICK':'QLD','IPSWICH':'QLD','SUNSHINE COAST':'QLD',
  'ROCKHAMPTON':'QLD','TOWNSVILLE':'QLD','CAIRNS':'QLD','MACKAY':'QLD',
  'BEAUDESERT':'QLD','DALBY':'QLD','KILCOY':'QLD','BUNDABERG':'QLD',
  'MORPHETTVILLE':'SA','MORPHETTVILLE PARKS':'SA','MURRAY BRIDGE':'SA','GAWLER':'SA',
  'PORT AUGUSTA':'SA','NARACOORTE':'SA','BALAKLAVA':'SA','MOUNT GAMBIER':'SA',
  'BELMONT PARK':'WA','BELMONT':'WA','ASCOT':'WA','PINJARRA':'WA',
  'BUNBURY':'WA','GERALDTON':'WA','KALGOORLIE':'WA','ALBANY':'WA',
  'DARWIN':'NT','ALICE SPRINGS':'NT',
  'HOBART':'TAS','LAUNCESTON':'TAS','SPREYTON':'TAS','DEVONPORT':'TAS',
  'THOROUGHBRED PARK':'ACT',
  'PAKENHAM SYNTHETIC':'VIC',
  'MOUNT ISA':'QLD',
};

function toISO(d) {
  if (!d) return null;
  const p = d.split('/');
  if (p.length === 3) return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return null;
}

export async function POST(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!isRacesAdmin(userId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (!SURL || !SKEY) {
    return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
  }

  const { text } = await req.json().catch(() => ({}));
  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'Missing CSV text' }, { status: 400 });
  }

  let allRaces, allVenues;
  try {
    ({ allRaces, allVenues } = buildRaces(parseCSV(text)));
  } catch (err) {
    return NextResponse.json({ error: `CSV parse failed: ${err.message}` }, { status: 400 });
  }

  const raceKeys = Object.keys(allRaces);
  const firstKey = raceKeys[0];
  const dateISO = firstKey ? toISO(allRaces[firstKey]?.date) : null;

  const sbHeaders = {
    'Content-Type': 'application/json',
    apikey: SKEY,
    Authorization: `Bearer ${SKEY}`,
  };

  let meetingsSynced = false;

  if (dateISO) {
    // Filter unknown-state venues so a single missing entry doesn't abort the batch.
    // Use ignore-duplicates so the worker's track_condition is never overwritten by CSV reload.
    const rows = Object.keys(allVenues)
      .map(v => { const normV = normaliseVenue(v); return { venue: normV, state: VENUE_STATE_MAP[normV] || null, date: dateISO }; })
      .filter(r => r.state !== null);

    if (rows.length) {
      const r = await fetch(`${SURL}/rest/v1/today_meetings`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(rows),
      });
      if (r.ok) {
        meetingsSynced = true;
      } else {
        console.error('[upload-race-csv] today_meetings sync failed:', r.status, await r.text());
      }
    }
  }

  // Upsert race post times to race_schedule for historical backfill in mybets
  const scheduleRows = [];
  for (const k of raceKeys) {
    const rc = allRaces[k];
    if (!rc.time || !rc.date || !rc.venue) continue;
    const d = toISO(rc.date);
    if (!d) continue;
    scheduleRows.push({ date: d, venue: rc.venue.toUpperCase(), race_num: String(rc.num), post_time: rc.time });
  }

  if (scheduleRows.length) {
    const r = await fetch(`${SURL}/rest/v1/race_schedule`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(scheduleRows),
    });
    if (!r.ok) {
      console.error('[upload-race-csv] race_schedule upsert failed:', r.status, await r.text());
    }
  }

  return NextResponse.json({ ok: true, meetingsSynced, raceCount: raceKeys.length });
}
