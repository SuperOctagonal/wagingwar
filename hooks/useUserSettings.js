'use client';
import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const SETTINGS_DEFAULTS = {
  displayName: '', state: 'QLD',
  notifRank1: false, notifBlackbooked: false,
  notifCountdown: 'off', notifSettled: false, notifComp: 'off', notifReply: false,
  defBookmaker: 'Sportsbet', defStake: '', defBetType: 'Win', oddsFormat: 'Decimal',
  bankroll: '', stakingAlert: '',
  racesTab: 'Field', racesGroup: 'All', racesMinRunners: 'None',
  colForm: true, colSpeed: true, colConditions: true, colConnections: true,
  colScore: true, colEdge: true, colValue: true,
  mybetsRange: 'All time', mybetsView: 'Table', mybetsShowScratched: true,
  insightsPeriod: 'All time', insightsMinBets: 5, kellyFraction: 'Half Kelly',
  compAutoEnter: false, compShowPicks: true, compLeaderboard: true,
  theme: 'Dark', density: 'Comfortable', fontSize: 'Medium', paceMapDefault: false,
};

export default function useUserSettings() {
  const { user } = useUser();
  const [settings, setSettings] = useState(SETTINGS_DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id || !SURL || !SKEY) { setLoading(false); return; }
    fetch(`${SURL}/rest/v1/user_settings?clerk_id=eq.${encodeURIComponent(user.id)}&select=settings&limit=1`, {
      headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(rows => {
        const saved = rows?.[0]?.settings || {};
        setSettings({ ...SETTINGS_DEFAULTS, ...saved });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user?.id]);

  return { settings, loading };
}
