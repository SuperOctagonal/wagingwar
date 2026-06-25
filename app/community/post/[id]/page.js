'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import useIsPro from '@/hooks/useIsPro';
import UpgradeModal from '@/components/UpgradeModal';
import { awardPoints } from '@/lib/points';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ADMIN_ID = 'user_3EI3ZvqwnPRQCX0tWtJQE6JsiwU';

const SECTIONS = [
  { id: 'today_races',     label: "Today's Races" },
  { id: 'tips_analysis',   label: 'Tips & Analysis' },
  { id: 'winning_bets',    label: 'Winning Bets' },
  { id: 'system_feedback', label: 'System Feedback' },
  { id: 'general',         label: 'General Chat' },
];

const CAT = {
  today_races:     { bg: '#dbeafe', text: '#1e40af' },
  tips_analysis:   { bg: '#dcfce7', text: '#166534' },
  winning_bets:    { bg: '#fef9c3', text: '#854d0e' },
  system_feedback: { bg: '#f3e8ff', text: '#6b21a8' },
  general:         { bg: '#f3f4f6', text: '#374151' },
};

async function sb(path, opts = {}) {
  if (!SURL || !SKEY) return null;
  try {
    const res = await fetch(`${SURL}/rest/v1/${path}`, {
      method: opts.method || 'GET',
      headers: {
        apikey: SKEY,
        Authorization: `Bearer ${SKEY}`,
        'Content-Type': 'application/json',
        ...(opts.prefer ? { Prefer: opts.prefer } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 204) return null;
    if (!res.ok) { console.error('[sb]', res.status, path, await res.text()); return null; }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (e) { console.error('[sb] fetch error', path, e); return null; }
}

function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function getTierBadge(points) {
  const pts = points || 0;
  const label = pts >= 10000 ? 'Legend' : pts >= 5000 ? 'Expert' : pts >= 2000 ? 'Advanced' : pts >= 500 ? 'Member' : 'Recruit';
  const palettes = {
    Legend:   { bg: '#7c3aed', color: '#fff' },
    Expert:   { bg: '#dc2626', color: '#fff' },
    Advanced: { bg: '#d97706', color: '#fff' },
    Member:   { bg: '#2563eb', color: '#fff' },
    Recruit:  { bg: '#6b7280', color: '#fff' },
  };
  return { label, ...(palettes[label] || palettes.Recruit) };
}

function Avatar({ profile, size = 32 }) {
  const name = profile?.display_name || '?';
  const initial = name[0]?.toUpperCase() || '?';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: '#00471b',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, fontSize: Math.round(size * 0.4), fontWeight: 700, color: '#fff',
    }}>
      {initial}
    </div>
  );
}

function TierBadge({ profile }) {
  const { label, bg, color } = getTierBadge(profile?.points || 0);
  return (
    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: bg, color }}>
      {label}
    </span>
  );
}

function CatBadge({ section }) {
  const c = CAT[section] || CAT.general;
  const sec = SECTIONS.find(s => s.id === section);
  return (
    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: c.bg, color: c.text, whiteSpace: 'nowrap' }}>
      {sec?.label || section}
    </span>
  );
}

export default function PostDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useUser();
  const userId  = user?.id || null;
  const isPro   = useIsPro();
  const isAdmin = userId === ADMIN_ID;

  const [upgradeOpen,    setUpgradeOpen]    = useState(false);
  const [post,           setPost]           = useState(null);
  const [replies,        setReplies]        = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [upvotedPost,    setUpvotedPost]    = useState(false);
  const [upvotedReplies, setUpvotedReplies] = useState(new Set());
  const [replyText,      setReplyText]      = useState('');
  const [submitting,     setSubmitting]     = useState(false);
  const [userProfile,    setUserProfile]    = useState(null);

  // Load post + replies
  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const posts = await sb(`posts?select=*&id=eq.${id}&limit=1`);
      if (!posts || !posts.length) { setLoading(false); return; }
      const p = { ...posts[0] };
      if (p.user_id) {
        const profs = await sb(`user_profiles?select=*&clerk_id=eq.${p.user_id}&limit=1`);
        if (profs && profs.length) p.author = profs[0];
      }
      setPost(p);

      const replyRows = await sb(`replies?select=*&post_id=eq.${id}&order=created_at.asc`);
      if (replyRows && replyRows.length) {
        const uids = [...new Set(replyRows.map(r => r.clerk_id).filter(Boolean))];
        let profileMap = {};
        if (uids.length) {
          const profs = await sb(`user_profiles?select=*&clerk_id=in.(${uids.join(',')})`);
          if (profs) profs.forEach(pr => { profileMap[pr.clerk_id] = pr; });
        }
        setReplies(replyRows.map(r => ({ ...r, author: profileMap[r.clerk_id] || null })));
      }
      setLoading(false);
    })();
  }, [id]);

  // Load current user profile for reply attribution
  useEffect(() => {
    if (!userId) return;
    sb(`user_profiles?select=*&clerk_id=eq.${userId}&limit=1`).then(r => {
      if (r && r.length) setUserProfile(r[0]);
    });
  }, [userId]);

  const handleUpvotePost = useCallback(async () => {
    if (!post) return;
    const v = upvotedPost ? (post.votes || 0) - 1 : (post.votes || 0) + 1;
    await sb(`posts?id=eq.${post.id}`, { method: 'PATCH', body: { votes: v }, prefer: 'return=minimal' });
    setPost(p => ({ ...p, votes: v }));
    setUpvotedPost(u => !u);
    if (!upvotedPost && post.user_id && post.user_id !== userId) {
      awardPoints(post.user_id, 'upvote_received').catch(() => {});
    }
  }, [post, upvotedPost, userId]);

  const handleUpvoteReply = useCallback(async (replyId, current, authorId) => {
    const already = upvotedReplies.has(replyId);
    const v = already ? (current || 0) - 1 : (current || 0) + 1;
    await sb(`replies?id=eq.${replyId}`, { method: 'PATCH', body: { votes: v }, prefer: 'return=minimal' });
    setReplies(rs => rs.map(r => r.id === replyId ? { ...r, votes: v } : r));
    setUpvotedReplies(prev => { const next = new Set(prev); already ? next.delete(replyId) : next.add(replyId); return next; });
    if (!already && authorId && authorId !== userId) {
      awardPoints(authorId, 'upvote_received').catch(() => {});
    }
  }, [upvotedReplies, userId]);

  const handleDeletePost = useCallback(async () => {
    if (!post) return;
    await sb(`posts?id=eq.${post.id}`, { method: 'DELETE' });
    router.push('/community');
  }, [post, router]);

  const handleDeleteReply = useCallback(async (replyId) => {
    await sb(`replies?id=eq.${replyId}`, { method: 'DELETE' });
    setReplies(rs => rs.filter(r => r.id !== replyId));
  }, []);

  const handleAddReply = useCallback(async () => {
    if (!replyText.trim() || !userId || !post) return;
    setSubmitting(true);
    const result = await sb('replies?select=*', {
      method: 'POST',
      body: { post_id: post.id, clerk_id: userId, content: replyText.trim(), votes: 0 },
      prefer: 'return=representation',
    });
    if (result && result.length) {
      setReplies(rs => [...rs, { ...result[0], author: userProfile }]);
      const newCount = (post.reply_count || 0) + 1;
      await sb(`posts?id=eq.${post.id}`, { method: 'PATCH', body: { reply_count: newCount }, prefer: 'return=minimal' });
      setPost(p => ({ ...p, reply_count: newCount }));
      setReplyText('');
      window.dispatchEvent(new Event('ww:profile:refresh'));
      awardPoints(userId, 'community_reply', replyText.trim().slice(0, 100)).catch(() => {});
    }
    setSubmitting(false);
  }, [replyText, userId, post, userProfile]);

  const sectionLabel = SECTIONS.find(s => s.id === post?.section)?.label || '';

  // ── table cell style shorthand
  const thStyle = (extra = {}) => ({
    padding: '7px 12px', fontSize: 9, fontWeight: 700, color: '#EAF3DE',
    textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'left',
    borderRight: '1px solid #2d5a1b', background: '#173404', ...extra,
  });
  const tdStyle = (extra = {}) => ({
    padding: '10px 12px', borderBottom: '1px solid #E5E7EB', verticalAlign: 'top',
    borderRight: '1px solid #E5E7EB', ...extra,
  });

  if (loading) {
    return (
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>Loading…</span>
      </main>
    );
  }

  if (!post) {
    return (
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#f1f5f9' }}>
        <span style={{ fontSize: 13, color: '#374151' }}>Post not found.</span>
        <button onClick={() => router.push('/community')}
          style={{ fontSize: 11, color: '#00471b', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
          ← Back to Community
        </button>
      </main>
    );
  }

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: '#f1f5f9' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 0 48px' }}>

        {/* Breadcrumb */}
        <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6B7280', flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/community')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#00471b', fontWeight: 700, fontSize: 11, padding: 0 }}>
            ← Community
          </button>
          <span>/</span>
          <span style={{ fontWeight: 600, color: '#374151' }}>{sectionLabel}</span>
        </div>

        {/* Post card */}
        <div style={{ background: '#fff', border: '1px solid #D1D5DB', borderRadius: 0 }}>
          {/* Post header bar */}
          <div style={{ background: '#173404', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <CatBadge section={post.section} />
            {(isAdmin || post.user_id === userId) && (
              <button onClick={handleDeletePost}
                style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: '#ef4444', border: 'none', borderRadius: 3, cursor: 'pointer', padding: '2px 8px' }}>
                Delete Post
              </button>
            )}
          </div>

          <div style={{ padding: '16px 20px' }}>
            {/* Title */}
            <h1 style={{ fontSize: 18, fontWeight: 800, color: '#111827', lineHeight: 1.3, margin: '0 0 10px' }}>{post.title}</h1>

            {/* Meta line */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap', fontSize: 11, color: '#6B7280' }}>
              <Avatar profile={post.author} size={20} />
              <span style={{ fontWeight: 700, color: '#374151' }}>{post.author?.display_name || 'Anonymous'}</span>
              <TierBadge profile={post.author} />
              <span>·</span>
              <span>{timeAgo(post.created_at)}</span>
              <span>·</span>
              <button onClick={isPro ? handleUpvotePost : () => setUpgradeOpen(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, cursor: 'pointer', border: 'none',
                  background: upvotedPost ? '#00471b' : '#f3f4f6', color: upvotedPost ? '#fff' : '#374151' }}>
                ▲ {post.votes || 0} upvotes
              </button>
              <span>· {post.reply_count || 0} replies · Views: —</span>
            </div>

            {/* Body */}
            <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{post.body}</div>
          </div>
        </div>

        {/* Replies section */}
        <div style={{ marginTop: 20, background: '#fff', border: '1px solid #D1D5DB' }}>
          {/* Section heading */}
          <div style={{ padding: '9px 16px', borderBottom: '1px solid #E5E7EB', background: '#FAFAF8' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>
              {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            </span>
          </div>

          {/* Replies table */}
          {replies.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle(), width: 140 }}>Author</th>
                  <th style={{ ...thStyle() }}>Content</th>
                  <th style={{ ...thStyle({ textAlign: 'center', width: 60 }) }}>Votes</th>
                  <th style={{ ...thStyle({ textAlign: 'right', borderRight: 'none', width: 110, whiteSpace: 'nowrap' }) }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {replies.map(r => (
                  <tr key={r.id}>
                    <td style={{ ...tdStyle({ width: 140 }) }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Avatar profile={r.author} size={20} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.author?.display_name || 'Anonymous'}
                        </span>
                      </div>
                      <TierBadge profile={r.author} />
                    </td>
                    <td style={{ ...tdStyle() }}>
                      <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{r.content}</div>
                    </td>
                    <td style={{ ...tdStyle({ textAlign: 'center', width: 60 }) }}>
                      <button onClick={() => isPro ? handleUpvoteReply(r.id, r.votes, r.clerk_id) : setUpgradeOpen(true)}
                        style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, cursor: 'pointer', border: 'none',
                          background: upvotedReplies.has(r.id) ? '#00471b' : '#f3f4f6', color: upvotedReplies.has(r.id) ? '#fff' : '#374151' }}>
                        ▲ {r.votes || 0}
                      </button>
                      {(isAdmin || r.clerk_id === userId) && (
                        <button onClick={() => handleDeleteReply(r.id)}
                          style={{ display: 'block', margin: '5px auto 0', fontSize: 9, fontWeight: 700, color: '#fff', background: '#ef4444', border: 'none', borderRadius: 3, cursor: 'pointer', padding: '1px 5px' }}>
                          Del
                        </button>
                      )}
                    </td>
                    <td style={{ ...tdStyle({ textAlign: 'right', borderRight: 'none', color: '#9CA3AF', whiteSpace: 'nowrap' }) }}>
                      {timeAgo(r.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Reply input */}
          <div style={{ padding: '14px 16px', borderTop: replies.length > 0 ? '1px solid #E5E7EB' : 'none' }}>
            {!userId ? (
              <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>Sign in to reply.</p>
            ) : !isPro ? (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 11, color: '#374151' }}>Upgrade to Pro to join the conversation</span>
                <button onClick={() => setUpgradeOpen(true)}
                  style={{ fontSize: 11, fontWeight: 700, color: '#065f46', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', padding: 0, textDecoration: 'underline' }}>
                  Start free trial →
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Write a reply…"
                  rows={3}
                  style={{ flex: 1, border: '1px solid #E5E7EB', borderRadius: 6, padding: '8px 10px', fontSize: 11, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
                <button onClick={handleAddReply} disabled={submitting || !replyText.trim()}
                  style={{ padding: '8px 18px', background: '#00471b', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                    opacity: submitting || !replyText.trim() ? 0.5 : 1 }}>
                  {submitting ? 'Posting…' : 'Reply'}
                </button>
              </div>
            )}
          </div>
        </div>

      </div>

      {upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} />}
    </main>
  );
}
