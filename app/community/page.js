'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import useIsPro from '@/hooks/useIsPro';
import useIsMobile from '@/hooks/useIsMobile';
import UpgradeModal from '@/components/UpgradeModal';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ADMIN_ID = 'user_3EI3ZvqwnPRQCX0tWtJQE6JsiwU';

const SECTIONS = [
  { id: 'all',             label: 'All Posts' },
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

function getTierBadge(tier, points) {
  const pts = points || 0;
  const label = tier || (pts >= 10000 ? 'Legend' : pts >= 5000 ? 'Expert' : pts >= 2000 ? 'Advanced' : pts >= 500 ? 'Member' : 'Recruit');
  const palettes = {
    Legend:   { bg: '#7c3aed', color: '#fff' },
    Expert:   { bg: '#dc2626', color: '#fff' },
    Advanced: { bg: '#d97706', color: '#fff' },
    Member:   { bg: '#2563eb', color: '#fff' },
    Recruit:  { bg: '#6b7280', color: '#fff' },
  };
  return { label, ...(palettes[label] || palettes.Recruit) };
}

function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

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
    if (!res.ok) {
      const errText = await res.text();
      console.error('[sb] ERROR', res.status, path, errText);
      return null;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (e) { console.error('[sb] FETCH ERROR', path, e); return null; }
}

async function sbCount(table) {
  if (!SURL || !SKEY) return 0;
  try {
    const res = await fetch(`${SURL}/rest/v1/${table}?select=*`, {
      method: 'HEAD',
      headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, Prefer: 'count=exact' },
    });
    const range = res.headers.get('Content-Range');
    return range ? (parseInt(range.split('/')[1]) || 0) : 0;
  } catch { return 0; }
}

async function loadPosts(section) {
  const filter = section && section !== 'all' ? `&section=eq.${section}` : '';
  const posts = await sb(`posts?select=*${filter}&order=created_at.desc&limit=60`);
  if (!posts || !posts.length) return [];
  const uids = [...new Set(posts.map(p => p.user_id).filter(Boolean))];
  let profileMap = {};
  if (uids.length) {
    const profiles = await sb(`user_profiles?select=*&clerk_id=in.(${uids.join(',')})`);
    if (profiles) profiles.forEach(p => { profileMap[p.clerk_id] = p; });
  }
  return posts.map(p => ({ ...p, author: profileMap[p.user_id] || null }));
}

async function loadReplies(postId) {
  const replies = await sb(`replies?select=*&post_id=eq.${postId}&order=created_at.asc`);
  if (!replies || !replies.length) return [];
  const uids = [...new Set(replies.map(r => r.clerk_id).filter(Boolean))];
  let profileMap = {};
  if (uids.length) {
    const profiles = await sb(`user_profiles?select=*&clerk_id=in.(${uids.join(',')})`);
    if (profiles) profiles.forEach(p => { profileMap[p.clerk_id] = p; });
  }
  return replies.map(r => ({ ...r, author: profileMap[r.clerk_id] || null }));
}

// ─── shared atoms ─────────────────────────────────────────────────────────────

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
  const tier = getTier(profile?.points || 0);
  return (
    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: tier.color + '22', color: tier.color }}>
      {tier.name}
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

// ─── post card ────────────────────────────────────────────────────────────────

function PostCard({ post, onSelect, onUpvote, onDelete, canDelete, isPro, onUpgrade }) {
  return (
    <div
      onClick={() => onSelect(post)}
      style={{ background: '#fff', borderRadius: 8, border: '0.5px solid #e5e7eb', padding: '10px 14px', cursor: 'pointer', marginBottom: 8 }}
      className="hover:shadow-sm transition-shadow"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <CatBadge section={post.section} />
        {canDelete && (
          <button onClick={e => { e.stopPropagation(); onDelete(post.id); }}
            style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: '#fff', background: '#ef4444', border: 'none', borderRadius: 3, cursor: 'pointer', padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 2 }}>
            🗑 Del
          </button>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 3 }}>{post.title}</div>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, lineHeight: 1.4 }}>
        {(post.body || '').slice(0, 120)}{(post.body || '').length > 120 ? '…' : ''}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Avatar profile={post.author} size={20} />
        <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{post.author?.display_name || 'Anonymous'}</span>
        <TierBadge profile={post.author} />
        <span style={{ fontSize: 10, color: '#9ca3af' }}>{timeAgo(post.created_at)}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={e => { e.stopPropagation(); isPro ? onUpvote(post.id, post.votes) : onUpgrade(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: '#374151', background: '#f3f4f6', border: 'none', borderRadius: 20, padding: '2px 8px', cursor: 'pointer' }}>
            ▲ {post.votes || 0}
          </button>
          <span style={{ fontSize: 11, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 2 }}>
            💬 {post.reply_count || 0}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── thread view ──────────────────────────────────────────────────────────────

function ThreadView({ post, replies, onBack, onUpvotePost, onUpvoteReply, onAddReply, onDeletePost, onDeleteReply, userId, isAdmin, upvotedPosts, upvotedReplies, isPro, onUpgrade }) {
  const [replyText,  setReplyText]  = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleReply = async () => {
    if (!replyText.trim() || !userId) return;
    setSubmitting(true);
    const ok = await onAddReply(post.id, replyText.trim());
    if (ok) setReplyText('');
    setSubmitting(false);
  };

  const AuthorSidebar = ({ profile }) => (
    <div style={{ width: 88, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 6px', background: '#f9fafb', borderRight: '0.5px solid #e5e7eb' }}>
      <Avatar profile={profile} size={36} />
      <span style={{ fontSize: 10, fontWeight: 600, color: '#374151', textAlign: 'center', wordBreak: 'break-word', lineHeight: 1.2 }}>
        {profile?.display_name || 'Anon'}
      </span>
      <TierBadge profile={profile} />
      <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>{(profile?.points || 0).toLocaleString()}pts</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ padding: '7px 14px', borderBottom: '0.5px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#374151', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          ← Back
        </button>
        <CatBadge section={post.section} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Post body */}
        <div style={{ display: 'flex', borderBottom: '0.5px solid #e5e7eb' }}>
          <AuthorSidebar profile={post.author} />
          <div style={{ flex: 1, padding: '12px 14px' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 8 }}>{post.title}</div>
            <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{post.body}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <button onClick={() => isPro ? onUpvotePost(post.id, post.votes) : onUpgrade()}
                style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: upvotedPosts?.has(post.id) ? '#fff' : '#374151', background: upvotedPosts?.has(post.id) ? '#00471b' : '#f3f4f6', border: 'none', borderRadius: 20, padding: '3px 10px', cursor: 'pointer' }}>
                ▲ {post.votes || 0}
              </button>
              <span style={{ fontSize: 10, color: '#9ca3af' }}>{timeAgo(post.created_at)}</span>
              {(isAdmin || post.user_id === userId) && (
                <button onClick={() => onDeletePost(post.id)}
                  style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: '#fff', background: '#ef4444', border: 'none', borderRadius: 3, cursor: 'pointer', padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 2 }}>
                  🗑 Del
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Replies */}
        {replies.map(r => (
          <div key={r.id} style={{ display: 'flex', borderBottom: '0.5px solid #f3f4f6' }}>
            <AuthorSidebar profile={r.author} />
            <div style={{ flex: 1, padding: '10px 14px' }}>
              <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{r.content}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <button onClick={() => isPro ? onUpvoteReply(r.id, r.votes) : onUpgrade()}
                  style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, color: upvotedReplies?.has(r.id) ? '#fff' : '#374151', background: upvotedReplies?.has(r.id) ? '#00471b' : '#f3f4f6', border: 'none', borderRadius: 20, padding: '2px 8px', cursor: 'pointer' }}>
                  ▲ {r.votes || 0}
                </button>
                <span style={{ fontSize: 10, color: '#9ca3af' }}>{timeAgo(r.created_at)}</span>
                {(isAdmin || r.user_id === userId) && (
                  <button onClick={() => onDeleteReply(r.id)}
                    style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: '#fff', background: '#ef4444', border: 'none', borderRadius: 3, cursor: 'pointer', padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 2 }}>
                    🗑 Del
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Reply input */}
        <div style={{ padding: '12px 14px' }}>
          {!userId ? (
            <div style={{ fontSize: 11, color: '#9ca3af' }}>Sign in to reply.</div>
          ) : !isPro ? (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontSize: 12, color: '#374151' }}>Upgrade to Pro to join the conversation</span>
              <button onClick={onUpgrade} style={{ fontSize: 11, fontWeight: 700, color: '#065f46', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', padding: 0, textDecoration: 'underline' }}>
                Start free trial →
              </button>
            </div>
          ) : (
            <>
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="Write a reply…"
                rows={3}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 10px', fontSize: 12, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
              <button onClick={handleReply} disabled={submitting || !replyText.trim()}
                style={{ marginTop: 6, padding: '6px 18px', background: '#00471b', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: submitting || !replyText.trim() ? 0.5 : 1 }}>
                {submitting ? 'Posting…' : 'Post Reply'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── new post modal ───────────────────────────────────────────────────────────

function NewPostModal({ onClose, onPost, userId }) {
  const [section,    setSection]    = useState('general');
  const [title,      setTitle]      = useState('');
  const [body,       setBody]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const postSections = SECTIONS.filter(s => s.id !== 'all');

  const handlePost = async () => {
    if (!title.trim() || !body.trim() || !userId) return;
    setSubmitting(true);
    const ok = await onPost({ section, title: title.trim(), body: body.trim() });
    setSubmitting(false);
    if (ok) onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 10, width: 480, maxWidth: '95vw', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ background: '#00471b', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>✏️ New Post</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>Section</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {postSections.map(s => {
                const c = CAT[s.id];
                const active = section === s.id;
                return (
                  <button key={s.id} onClick={() => setSection(s.id)}
                    style={{ fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 20, border: `1.5px solid ${active ? c.text : '#e5e7eb'}`, cursor: 'pointer', background: active ? c.bg : '#fff', color: active ? c.text : '#6b7280' }}>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Post title…"
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>Body</label>
            <textarea value={body} onChange={e => setBody(e.target.value)}
              placeholder="Write your post…"
              rows={5}
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 10px', fontSize: 12, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>
          <button onClick={handlePost} disabled={submitting || !title.trim() || !body.trim() || !userId}
            style={{ width: '100%', padding: 10, background: '#00471b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: submitting || !title.trim() || !body.trim() || !userId ? 0.5 : 1 }}>
            {submitting ? 'Posting…' : 'Post'}
          </button>
          {!userId && <div style={{ marginTop: 8, fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>Sign in to post.</div>}
        </div>
      </div>
    </div>
  );
}

// ─── ranks & points guide modal ───────────────────────────────────────────────

function getTier(pts) {
  pts = pts || 0;
  if (pts >= 365000) return { num: 262, name: 'Melbourne Cup', emoji: '👑', color: '#4c1d95', points: 365000 };
  if (pts >= 360610) return { num: 261, name: 'W.S. Cox Plate', emoji: '👑', color: '#4c1d95', points: 360610 };
  if (pts >= 356270) return { num: 260, name: 'Caulfield Cup', emoji: '👑', color: '#4c1d95', points: 356270 };
  if (pts >= 351980) return { num: 259, name: 'Golden Slipper', emoji: '👑', color: '#4c1d95', points: 351980 };
  if (pts >= 347740) return { num: 258, name: 'Queen Elizabeth Stakes', emoji: '👑', color: '#4c1d95', points: 347740 };
  if (pts >= 343545) return { num: 257, name: 'The Everest', emoji: '👑', color: '#4c1d95', points: 343545 };
  if (pts >= 339400) return { num: 256, name: 'Turnbull Stakes', emoji: '👑', color: '#4c1d95', points: 339400 };
  if (pts >= 335305) return { num: 255, name: 'Coolmore Stud Stakes', emoji: '👑', color: '#4c1d95', points: 335305 };
  if (pts >= 331255) return { num: 254, name: 'Champions Classic', emoji: '👑', color: '#4c1d95', points: 331255 };
  if (pts >= 327250) return { num: 253, name: 'Champions Mile', emoji: '👑', color: '#4c1d95', points: 327250 };
  if (pts >= 323290) return { num: 252, name: 'Champions Sprint', emoji: '👑', color: '#4c1d95', points: 323290 };
  if (pts >= 319375) return { num: 251, name: 'Darley Classic', emoji: '👑', color: '#4c1d95', points: 319375 };
  if (pts >= 315510) return { num: 250, name: 'Caulfield Guineas', emoji: '👑', color: '#4c1d95', points: 315510 };
  if (pts >= 311685) return { num: 249, name: 'Doncaster Handicap', emoji: '👑', color: '#4c1d95', points: 311685 };
  if (pts >= 307905) return { num: 248, name: 'Australian Derby', emoji: '👑', color: '#4c1d95', points: 307905 };
  if (pts >= 304165) return { num: 247, name: 'T.J. Smith Stakes', emoji: '👑', color: '#4c1d95', points: 304165 };
  if (pts >= 300470) return { num: 246, name: 'Victoria Derby', emoji: '👑', color: '#4c1d95', points: 300470 };
  if (pts >= 296820) return { num: 245, name: 'Newmarket Handicap', emoji: '👑', color: '#4c1d95', points: 296820 };
  if (pts >= 293210) return { num: 244, name: 'All Aged Stakes', emoji: '👑', color: '#4c1d95', points: 293210 };
  if (pts >= 289640) return { num: 243, name: 'Australian Cup', emoji: '👑', color: '#4c1d95', points: 289640 };
  if (pts >= 286110) return { num: 242, name: 'Doomben 10,000', emoji: '👑', color: '#4c1d95', points: 286110 };
  if (pts >= 282620) return { num: 241, name: 'Stradbroke Handicap', emoji: '👑', color: '#4c1d95', points: 282620 };
  if (pts >= 279175) return { num: 240, name: 'Sydney Cup', emoji: '👑', color: '#4c1d95', points: 279175 };
  if (pts >= 275765) return { num: 239, name: 'Moonee Valley Gold Cup', emoji: '👑', color: '#4c1d95', points: 275765 };
  if (pts >= 272395) return { num: 238, name: 'Golden Rose', emoji: '👑', color: '#4c1d95', points: 272395 };
  if (pts >= 269060) return { num: 237, name: 'Golden Eagle', emoji: '👑', color: '#4c1d95', points: 269060 };
  if (pts >= 265770) return { num: 236, name: 'Australian Oaks', emoji: '👑', color: '#4c1d95', points: 265770 };
  if (pts >= 262515) return { num: 235, name: 'Thousand Guineas', emoji: '👑', color: '#4c1d95', points: 262515 };
  if (pts >= 259295) return { num: 234, name: 'AAMI Victoria Derby', emoji: '👑', color: '#4c1d95', points: 259295 };
  if (pts >= 256110) return { num: 233, name: 'Emirates Stakes', emoji: '👑', color: '#4c1d95', points: 256110 };
  if (pts >= 252965) return { num: 232, name: 'Lexus Stakes', emoji: '👑', color: '#4c1d95', points: 252965 };
  if (pts >= 249855) return { num: 231, name: 'Myer Classic', emoji: '👑', color: '#4c1d95', points: 249855 };
  if (pts >= 246785) return { num: 230, name: 'Champagne Stakes', emoji: '👑', color: '#4c1d95', points: 246785 };
  if (pts >= 243745) return { num: 229, name: 'Sires Produce Stakes', emoji: '👑', color: '#4c1d95', points: 243745 };
  if (pts >= 240740) return { num: 228, name: 'Empire Rose Stakes', emoji: '👑', color: '#4c1d95', points: 240740 };
  if (pts >= 237770) return { num: 227, name: 'Mackinnon Stakes', emoji: '👑', color: '#4c1d95', points: 237770 };
  if (pts >= 234835) return { num: 226, name: 'Cantala Stakes', emoji: '👑', color: '#4c1d95', points: 234835 };
  if (pts >= 231930) return { num: 225, name: 'Yalumba Stakes', emoji: '👑', color: '#4c1d95', points: 231930 };
  if (pts >= 229065) return { num: 224, name: 'Spring Champion Stakes', emoji: '👑', color: '#4c1d95', points: 229065 };
  if (pts >= 226225) return { num: 223, name: 'George Main Stakes', emoji: '👑', color: '#4c1d95', points: 226225 };
  if (pts >= 223420) return { num: 222, name: 'Epsom Handicap', emoji: '👑', color: '#4c1d95', points: 223420 };
  if (pts >= 220650) return { num: 221, name: 'Doomben Cup', emoji: '👑', color: '#4c1d95', points: 220650 };
  if (pts >= 217910) return { num: 220, name: 'Queensland Derby', emoji: '👑', color: '#4c1d95', points: 217910 };
  if (pts >= 215200) return { num: 219, name: 'Queensland Oaks', emoji: '👑', color: '#4c1d95', points: 215200 };
  if (pts >= 212525) return { num: 218, name: 'Railway Stakes', emoji: '👑', color: '#4c1d95', points: 212525 };
  if (pts >= 209875) return { num: 217, name: 'Winterbottom Stakes', emoji: '👑', color: '#4c1d95', points: 209875 };
  if (pts >= 207260) return { num: 216, name: 'Winx Stakes', emoji: '👑', color: '#4c1d95', points: 207260 };
  if (pts >= 204670) return { num: 215, name: 'Kingston Town Classic', emoji: '👑', color: '#6d28d9', points: 204670 };
  if (pts >= 202115) return { num: 214, name: 'Australian Guineas', emoji: '👑', color: '#6d28d9', points: 202115 };
  if (pts >= 199585) return { num: 213, name: 'Peter Young Stakes', emoji: '👑', color: '#6d28d9', points: 199585 };
  if (pts >= 197085) return { num: 212, name: 'Blamey Stakes', emoji: '👑', color: '#6d28d9', points: 197085 };
  if (pts >= 194615) return { num: 211, name: 'Winx Guineas', emoji: '👑', color: '#6d28d9', points: 194615 };
  if (pts >= 192170) return { num: 210, name: 'Hill Stakes', emoji: '👑', color: '#6d28d9', points: 192170 };
  if (pts >= 189755) return { num: 209, name: 'Sandown Guineas', emoji: '👑', color: '#6d28d9', points: 189755 };
  if (pts >= 187370) return { num: 208, name: 'Caulfield Classic', emoji: '👑', color: '#6d28d9', points: 187370 };
  if (pts >= 185010) return { num: 207, name: 'Heads of the River', emoji: '👑', color: '#6d28d9', points: 185010 };
  if (pts >= 182675) return { num: 206, name: 'Stutt Stakes', emoji: '👑', color: '#6d28d9', points: 182675 };
  if (pts >= 180370) return { num: 205, name: 'Matriarch Stakes', emoji: '👑', color: '#6d28d9', points: 180370 };
  if (pts >= 178090) return { num: 204, name: 'Feehan Stakes', emoji: '👑', color: '#6d28d9', points: 178090 };
  if (pts >= 175835) return { num: 203, name: 'Dato Tan Chin Nam Stakes', emoji: '👑', color: '#6d28d9', points: 175835 };
  if (pts >= 173610) return { num: 202, name: 'P.B. Lawrence Stakes', emoji: '👑', color: '#6d28d9', points: 173610 };
  if (pts >= 171405) return { num: 201, name: 'Hollindale Stakes', emoji: '👑', color: '#6d28d9', points: 171405 };
  if (pts >= 169230) return { num: 200, name: 'Queensland Guineas', emoji: '👑', color: '#6d28d9', points: 169230 };
  if (pts >= 167075) return { num: 199, name: 'Tramway Stakes', emoji: '👑', color: '#6d28d9', points: 167075 };
  if (pts >= 164950) return { num: 198, name: 'Chelmsford Stakes', emoji: '👑', color: '#6d28d9', points: 164950 };
  if (pts >= 162845) return { num: 197, name: 'Ajax Stakes', emoji: '👑', color: '#6d28d9', points: 162845 };
  if (pts >= 160765) return { num: 196, name: 'Flying Handicap', emoji: '🏆', color: '#7c3aed', points: 160765 };
  if (pts >= 158710) return { num: 195, name: 'Carbine Club Stakes', emoji: '🏆', color: '#7c3aed', points: 158710 };
  if (pts >= 156675) return { num: 194, name: 'Naturalism Stakes', emoji: '🏆', color: '#7c3aed', points: 156675 };
  if (pts >= 154670) return { num: 193, name: 'JRA Cup', emoji: '🏆', color: '#7c3aed', points: 154670 };
  if (pts >= 152680) return { num: 192, name: 'Toorak Handicap', emoji: '🏆', color: '#7c3aed', points: 152680 };
  if (pts >= 150720) return { num: 191, name: 'Thoroughbred Club Stakes', emoji: '🏆', color: '#7c3aed', points: 150720 };
  if (pts >= 148775) return { num: 190, name: 'Sunline Stakes', emoji: '🏆', color: '#7c3aed', points: 148775 };
  if (pts >= 146860) return { num: 189, name: 'Victoria Handicap', emoji: '🏆', color: '#7c3aed', points: 146860 };
  if (pts >= 144960) return { num: 188, name: 'Neds Classic', emoji: '🏆', color: '#7c3aed', points: 144960 };
  if (pts >= 143085) return { num: 187, name: 'Palmares Stakes', emoji: '🏆', color: '#7c3aed', points: 143085 };
  if (pts >= 141230) return { num: 186, name: 'Geelong Cup', emoji: '🏆', color: '#7c3aed', points: 141230 };
  if (pts >= 139400) return { num: 185, name: 'Portland Classic', emoji: '🏆', color: '#7c3aed', points: 139400 };
  if (pts >= 137590) return { num: 184, name: 'Standish Handicap', emoji: '🏆', color: '#7c3aed', points: 137590 };
  if (pts >= 135795) return { num: 183, name: 'Caulfield Sprint', emoji: '🏆', color: '#7c3aed', points: 135795 };
  if (pts >= 134025) return { num: 182, name: 'Red Anchor Stakes', emoji: '🏆', color: '#7c3aed', points: 134025 };
  if (pts >= 132275) return { num: 181, name: "Tattersall's Tiara", emoji: '🏆', color: '#7c3aed', points: 132275 };
  if (pts >= 130545) return { num: 180, name: 'Fred Best Classic', emoji: '🏆', color: '#7c3aed', points: 130545 };
  if (pts >= 128835) return { num: 179, name: 'Rough Habit Plate', emoji: '🏆', color: '#7c3aed', points: 128835 };
  if (pts >= 127145) return { num: 178, name: 'Hawkesbury Gold Cup', emoji: '🏆', color: '#7c3aed', points: 127145 };
  if (pts >= 125475) return { num: 177, name: 'Show County Quality', emoji: '🏆', color: '#7c3aed', points: 125475 };
  if (pts >= 123820) return { num: 176, name: 'Exford Plate', emoji: '🏆', color: '#9333ea', points: 123820 };
  if (pts >= 122185) return { num: 175, name: 'Stocks Stakes', emoji: '🏆', color: '#9333ea', points: 122185 };
  if (pts >= 120570) return { num: 174, name: 'Gothic Stakes', emoji: '🏆', color: '#9333ea', points: 120570 };
  if (pts >= 118975) return { num: 173, name: 'Danehill Stakes', emoji: '🏆', color: '#9333ea', points: 118975 };
  if (pts >= 117395) return { num: 172, name: 'Daybreak Lover Stakes', emoji: '🏆', color: '#9333ea', points: 117395 };
  if (pts >= 115835) return { num: 171, name: 'Winter Stakes', emoji: '🏆', color: '#9333ea', points: 115835 };
  if (pts >= 114295) return { num: 170, name: "Lord Mayor's Cup", emoji: '🏆', color: '#9333ea', points: 114295 };
  if (pts >= 112770) return { num: 169, name: 'Hawkesbury Guineas', emoji: '🏆', color: '#9333ea', points: 112770 };
  if (pts >= 111260) return { num: 168, name: 'Dark Jewel Classic', emoji: '🏆', color: '#9333ea', points: 111260 };
  if (pts >= 109770) return { num: 167, name: 'Bernborough Plate', emoji: '🏆', color: '#9333ea', points: 109770 };
  if (pts >= 108300) return { num: 166, name: 'Nudgee Stakes', emoji: '🏆', color: '#9333ea', points: 108300 };
  if (pts >= 106845) return { num: 165, name: "Tattersall's Cup", emoji: '🏆', color: '#9333ea', points: 106845 };
  if (pts >= 105405) return { num: 164, name: 'Dulcify Stakes', emoji: '🏆', color: '#9333ea', points: 105405 };
  if (pts >= 103980) return { num: 163, name: 'Grand Prix Stakes', emoji: '🏆', color: '#9333ea', points: 103980 };
  if (pts >= 102575) return { num: 162, name: 'Angst Stakes', emoji: '🏆', color: '#9333ea', points: 102575 };
  if (pts >= 101180) return { num: 161, name: 'Kewney Stakes', emoji: '🏆', color: '#9333ea', points: 101180 };
  if (pts >= 99805) return { num: 160, name: 'Manion Cup', emoji: '🏆', color: '#9333ea', points: 99805 };
  if (pts >= 98450) return { num: 159, name: 'Rosebud', emoji: '🏆', color: '#9333ea', points: 98450 };
  if (pts >= 97105) return { num: 158, name: 'Missile Stakes', emoji: '🏆', color: '#9333ea', points: 97105 };
  if (pts >= 95775) return { num: 157, name: 'Merson Cooper Stakes', emoji: '🏆', color: '#9333ea', points: 95775 };
  if (pts >= 94465) return { num: 156, name: 'Ascot Open', emoji: '⭐⭐', color: '#dc2626', points: 94465 };
  if (pts >= 93165) return { num: 155, name: 'Rosehill Open', emoji: '⭐⭐', color: '#dc2626', points: 93165 };
  if (pts >= 91880) return { num: 154, name: 'Moonee Valley Open', emoji: '⭐⭐', color: '#dc2626', points: 91880 };
  if (pts >= 90615) return { num: 153, name: 'Caulfield Open', emoji: '⭐⭐', color: '#dc2626', points: 90615 };
  if (pts >= 89360) return { num: 152, name: 'Morphettville Open', emoji: '⭐⭐', color: '#dc2626', points: 89360 };
  if (pts >= 88120) return { num: 151, name: 'Eagle Farm Open', emoji: '⭐⭐', color: '#dc2626', points: 88120 };
  if (pts >= 86895) return { num: 150, name: 'Doomben Saturday Open', emoji: '⭐⭐', color: '#dc2626', points: 86895 };
  if (pts >= 85680) return { num: 149, name: 'Belmont Open', emoji: '⭐⭐', color: '#dc2626', points: 85680 };
  if (pts >= 84485) return { num: 148, name: 'Morphettville Parks BM84', emoji: '⭐⭐', color: '#d97706', points: 84485 };
  if (pts >= 83300) return { num: 147, name: 'Doomben BM84', emoji: '⭐⭐', color: '#d97706', points: 83300 };
  if (pts >= 82130) return { num: 146, name: 'Gold Coast BM84', emoji: '⭐⭐', color: '#d97706', points: 82130 };
  if (pts >= 80970) return { num: 145, name: 'Sunshine Coast BM84', emoji: '⭐⭐', color: '#d97706', points: 80970 };
  if (pts >= 79830) return { num: 144, name: 'Newcastle BM84', emoji: '⭐⭐', color: '#d97706', points: 79830 };
  if (pts >= 78695) return { num: 143, name: 'Sandown BM78', emoji: '⭐', color: '#ca8a04', points: 78695 };
  if (pts >= 77580) return { num: 142, name: 'Geelong BM78', emoji: '⭐', color: '#ca8a04', points: 77580 };
  if (pts >= 76475) return { num: 141, name: 'Ballarat BM78', emoji: '⭐', color: '#ca8a04', points: 76475 };
  if (pts >= 75380) return { num: 140, name: 'Gosford BM78', emoji: '⭐', color: '#ca8a04', points: 75380 };
  if (pts >= 74300) return { num: 139, name: 'Hawkesbury BM78', emoji: '⭐', color: '#ca8a04', points: 74300 };
  if (pts >= 73235) return { num: 138, name: 'Kembla Grange BM78', emoji: '⭐', color: '#ca8a04', points: 73235 };
  if (pts >= 72180) return { num: 137, name: 'Launceston BM72', emoji: '⭐', color: '#16a34a', points: 72180 };
  if (pts >= 71135) return { num: 136, name: 'Sale BM72', emoji: '⭐', color: '#16a34a', points: 71135 };
  if (pts >= 70105) return { num: 135, name: 'Warrnambool BM72', emoji: '⭐', color: '#16a34a', points: 70105 };
  if (pts >= 69085) return { num: 134, name: 'Bendigo BM72', emoji: '⭐', color: '#16a34a', points: 69085 };
  if (pts >= 68075) return { num: 133, name: 'Shepparton BM72', emoji: '⭐', color: '#16a34a', points: 68075 };
  if (pts >= 67080) return { num: 132, name: 'Wodonga BM72', emoji: '⭐', color: '#16a34a', points: 67080 };
  if (pts >= 66095) return { num: 131, name: 'Albury BM72', emoji: '⭐', color: '#16a34a', points: 66095 };
  if (pts >= 65120) return { num: 130, name: 'Ipswich BM72', emoji: '⭐', color: '#16a34a', points: 65120 };
  if (pts >= 64155) return { num: 129, name: 'Canberra BM70', emoji: '🏆', color: '#059669', points: 64155 };
  if (pts >= 63205) return { num: 128, name: 'Toowoomba BM70', emoji: '🏆', color: '#059669', points: 63205 };
  if (pts >= 62265) return { num: 127, name: 'Tamworth BM70', emoji: '🏆', color: '#059669', points: 62265 };
  if (pts >= 61335) return { num: 126, name: 'Wagga Wagga BM70', emoji: '🏆', color: '#059669', points: 61335 };
  if (pts >= 60415) return { num: 125, name: 'Orange BM70', emoji: '🏆', color: '#059669', points: 60415 };
  if (pts >= 59505) return { num: 124, name: 'Dubbo BM70', emoji: '🏆', color: '#059669', points: 59505 };
  if (pts >= 58605) return { num: 123, name: 'Scone BM70', emoji: '🏆', color: '#059669', points: 58605 };
  if (pts >= 57720) return { num: 122, name: 'Taree BM70', emoji: '🏆', color: '#059669', points: 57720 };
  if (pts >= 56840) return { num: 121, name: 'Armidale BM70', emoji: '🏆', color: '#059669', points: 56840 };
  if (pts >= 55970) return { num: 120, name: 'Grafton BM70', emoji: '🏆', color: '#059669', points: 55970 };
  if (pts >= 55115) return { num: 119, name: 'Launceston BM64', emoji: '🏇', color: '#2563eb', points: 55115 };
  if (pts >= 54265) return { num: 118, name: 'Strathalbyn BM64', emoji: '🏇', color: '#2563eb', points: 54265 };
  if (pts >= 53425) return { num: 117, name: 'Donald BM64', emoji: '🏇', color: '#2563eb', points: 53425 };
  if (pts >= 52600) return { num: 116, name: 'Ballina BM64', emoji: '🏇', color: '#2563eb', points: 52600 };
  if (pts >= 51780) return { num: 115, name: 'Ararat BM64', emoji: '🏇', color: '#2563eb', points: 51780 };
  if (pts >= 50970) return { num: 114, name: 'Colac BM64', emoji: '🏇', color: '#2563eb', points: 50970 };
  if (pts >= 50165) return { num: 113, name: 'Lismore BM64', emoji: '🏇', color: '#2563eb', points: 50165 };
  if (pts >= 49375) return { num: 112, name: 'Murwillumbah BM64', emoji: '🏇', color: '#2563eb', points: 49375 };
  if (pts >= 48590) return { num: 111, name: 'Moe BM64', emoji: '🏇', color: '#2563eb', points: 48590 };
  if (pts >= 47820) return { num: 110, name: 'Darwin BM64', emoji: '🏇', color: '#2563eb', points: 47820 };
  if (pts >= 47055) return { num: 109, name: 'Moruya BM64', emoji: '🏇', color: '#2563eb', points: 47055 };
  if (pts >= 46295) return { num: 108, name: 'Mount Gambier BM64', emoji: '🏇', color: '#2563eb', points: 46295 };
  if (pts >= 45550) return { num: 107, name: 'Bunbury BM64', emoji: '🏇', color: '#2563eb', points: 45550 };
  if (pts >= 44810) return { num: 106, name: 'Nowra BM64', emoji: '🏇', color: '#2563eb', points: 44810 };
  if (pts >= 44080) return { num: 105, name: 'Pinjarra BM64', emoji: '🏇', color: '#2563eb', points: 44080 };
  if (pts >= 43355) return { num: 104, name: 'Hobart BM64', emoji: '🏇', color: '#2563eb', points: 43355 };
  if (pts >= 42645) return { num: 103, name: 'Beaudesert BM64', emoji: '🏇', color: '#2563eb', points: 42645 };
  if (pts >= 41935) return { num: 102, name: 'Queanbeyan BM64', emoji: '🏇', color: '#2563eb', points: 41935 };
  if (pts >= 41240) return { num: 101, name: 'Balaklava BM64', emoji: '🏇', color: '#2563eb', points: 41240 };
  if (pts >= 40550) return { num: 100, name: 'Murray Bridge BM64', emoji: '🏇', color: '#2563eb', points: 40550 };
  if (pts >= 39865) return { num: 99, name: 'Port Augusta BM64', emoji: '🏇', color: '#2563eb', points: 39865 };
  if (pts >= 39195) return { num: 98, name: 'Geraldton BM64', emoji: '🏇', color: '#2563eb', points: 39195 };
  if (pts >= 38525) return { num: 97, name: 'Kalgoorlie BM64', emoji: '🏇', color: '#2563eb', points: 38525 };
  if (pts >= 37870) return { num: 96, name: 'Longreach BM64', emoji: '🏇', color: '#2563eb', points: 37870 };
  if (pts >= 37215) return { num: 95, name: 'Mount Isa BM64', emoji: '🏇', color: '#2563eb', points: 37215 };
  if (pts >= 36570) return { num: 94, name: 'Mackay BM64', emoji: '🏇', color: '#2563eb', points: 36570 };
  if (pts >= 35935) return { num: 93, name: 'Rockhampton BM64', emoji: '🏇', color: '#2563eb', points: 35935 };
  if (pts >= 35305) return { num: 92, name: 'Swan Hill BM64', emoji: '🏇', color: '#2563eb', points: 35305 };
  if (pts >= 34685) return { num: 91, name: 'Echuca BM64', emoji: '🏇', color: '#2563eb', points: 34685 };
  if (pts >= 34070) return { num: 90, name: 'Mildura BM64', emoji: '🏇', color: '#2563eb', points: 34070 };
  if (pts >= 33460) return { num: 89, name: 'Emerald BM64', emoji: '🏇', color: '#2563eb', points: 33460 };
  if (pts >= 32860) return { num: 88, name: 'Coonamble BM66', emoji: '🏇', color: '#0891b2', points: 32860 };
  if (pts >= 32265) return { num: 87, name: 'Moree BM58', emoji: '🏇', color: '#0891b2', points: 32265 };
  if (pts >= 31680) return { num: 86, name: 'Inverell BM58', emoji: '🏇', color: '#0891b2', points: 31680 };
  if (pts >= 31100) return { num: 85, name: 'Mudgee BM58', emoji: '🏇', color: '#0891b2', points: 31100 };
  if (pts >= 30525) return { num: 84, name: 'Cootamundra BM58', emoji: '🏇', color: '#0891b2', points: 30525 };
  if (pts >= 29955) return { num: 83, name: 'Cowra BM58', emoji: '🏇', color: '#0891b2', points: 29955 };
  if (pts >= 29395) return { num: 82, name: 'Gundagai BM58', emoji: '🏇', color: '#0891b2', points: 29395 };
  if (pts >= 28840) return { num: 81, name: 'Deniliquin BM58', emoji: '🏇', color: '#0891b2', points: 28840 };
  if (pts >= 28295) return { num: 80, name: 'Corowa BM58', emoji: '🏇', color: '#0891b2', points: 28295 };
  if (pts >= 27750) return { num: 79, name: 'Wangaratta BM58', emoji: '🏇', color: '#0891b2', points: 27750 };
  if (pts >= 27215) return { num: 78, name: 'Walcha BM58', emoji: '🏇', color: '#0891b2', points: 27215 };
  if (pts >= 26685) return { num: 77, name: 'Cooma BM58', emoji: '🏇', color: '#0891b2', points: 26685 };
  if (pts >= 26165) return { num: 76, name: 'Casterton BM58', emoji: '🏇', color: '#0891b2', points: 26165 };
  if (pts >= 25645) return { num: 75, name: 'Narromine BM58', emoji: '🏇', color: '#0891b2', points: 25645 };
  if (pts >= 25135) return { num: 74, name: 'Bourke BM58', emoji: '🏇', color: '#0891b2', points: 25135 };
  if (pts >= 24630) return { num: 73, name: 'Walgett BM58', emoji: '🏇', color: '#0891b2', points: 24630 };
  if (pts >= 24130) return { num: 72, name: 'Elmore BM58', emoji: '🏇', color: '#0891b2', points: 24130 };
  if (pts >= 23635) return { num: 71, name: 'Burrumbeet BM58', emoji: '🏇', color: '#0891b2', points: 23635 };
  if (pts >= 23145) return { num: 70, name: 'Oakbank BM58', emoji: '🏇', color: '#0891b2', points: 23145 };
  if (pts >= 22660) return { num: 69, name: 'Broken Hill BM58', emoji: '🏇', color: '#0891b2', points: 22660 };
  if (pts >= 22185) return { num: 68, name: 'Adaminaby BM58', emoji: '🏇', color: '#0891b2', points: 22185 };
  if (pts >= 21710) return { num: 67, name: 'Gilgandra BM55', emoji: '🏇', color: '#0891b2', points: 21710 };
  if (pts >= 21245) return { num: 66, name: 'Kingscote BM55', emoji: '🏇', color: '#0891b2', points: 21245 };
  if (pts >= 20785) return { num: 65, name: 'Tumut BM55', emoji: '🏇', color: '#0891b2', points: 20785 };
  if (pts >= 20330) return { num: 64, name: 'Wyndham BM55', emoji: '🏇', color: '#0891b2', points: 20330 };
  if (pts >= 19875) return { num: 63, name: 'Yalgoo BM55', emoji: '🏇', color: '#0891b2', points: 19875 };
  if (pts >= 19430) return { num: 62, name: 'Toodyay BM55', emoji: '🏇', color: '#0891b2', points: 19430 };
  if (pts >= 18990) return { num: 61, name: 'Ardlethan BM55', emoji: '🏇', color: '#0891b2', points: 18990 };
  if (pts >= 18555) return { num: 60, name: 'Randwick Maiden', emoji: '🐴', color: '#6b7280', points: 18555 };
  if (pts >= 18125) return { num: 59, name: 'Rosehill Maiden', emoji: '🐴', color: '#6b7280', points: 18125 };
  if (pts >= 17700) return { num: 58, name: 'Flemington Maiden', emoji: '🐴', color: '#6b7280', points: 17700 };
  if (pts >= 17280) return { num: 57, name: 'Moonee Valley Maiden', emoji: '🐴', color: '#6b7280', points: 17280 };
  if (pts >= 16860) return { num: 56, name: 'Caulfield Maiden', emoji: '🐴', color: '#6b7280', points: 16860 };
  if (pts >= 16450) return { num: 55, name: 'Kensington Maiden', emoji: '🐴', color: '#6b7280', points: 16450 };
  if (pts >= 16045) return { num: 54, name: 'Morphettville Maiden', emoji: '🐴', color: '#6b7280', points: 16045 };
  if (pts >= 15640) return { num: 53, name: 'Eagle Farm Maiden', emoji: '🐴', color: '#6b7280', points: 15640 };
  if (pts >= 15245) return { num: 52, name: 'Canterbury Maiden', emoji: '🐴', color: '#6b7280', points: 15245 };
  if (pts >= 14850) return { num: 51, name: 'Warwick Farm Maiden', emoji: '🐴', color: '#6b7280', points: 14850 };
  if (pts >= 14465) return { num: 50, name: 'Belmont Maiden', emoji: '🐴', color: '#6b7280', points: 14465 };
  if (pts >= 14080) return { num: 49, name: 'Doomben Maiden', emoji: '🐴', color: '#6b7280', points: 14080 };
  if (pts >= 13700) return { num: 48, name: 'Cranbourne Maiden', emoji: '🐴', color: '#6b7280', points: 13700 };
  if (pts >= 13325) return { num: 47, name: 'Geelong Maiden', emoji: '🐴', color: '#6b7280', points: 13325 };
  if (pts >= 12955) return { num: 46, name: 'Gosford Maiden', emoji: '🐴', color: '#6b7280', points: 12955 };
  if (pts >= 12590) return { num: 45, name: 'Werribee Maiden', emoji: '🐴', color: '#6b7280', points: 12590 };
  if (pts >= 12225) return { num: 44, name: 'Newcastle Maiden', emoji: '🐴', color: '#6b7280', points: 12225 };
  if (pts >= 11865) return { num: 43, name: 'Ballarat Maiden', emoji: '🐴', color: '#6b7280', points: 11865 };
  if (pts >= 11515) return { num: 42, name: 'Sale Maiden', emoji: '🐴', color: '#6b7280', points: 11515 };
  if (pts >= 11165) return { num: 41, name: 'Scone Maiden', emoji: '🐴', color: '#6b7280', points: 11165 };
  if (pts >= 10815) return { num: 40, name: 'Toowoomba Maiden', emoji: '🐴', color: '#6b7280', points: 10815 };
  if (pts >= 10475) return { num: 39, name: 'Tamworth Maiden', emoji: '🐴', color: '#6b7280', points: 10475 };
  if (pts >= 10135) return { num: 38, name: 'Taree Maiden', emoji: '🐴', color: '#6b7280', points: 10135 };
  if (pts >= 9800) return { num: 37, name: 'Strathalbyn Maiden', emoji: '🐴', color: '#6b7280', points: 9800 };
  if (pts >= 9470) return { num: 36, name: 'Grafton Maiden', emoji: '🐴', color: '#6b7280', points: 9470 };
  if (pts >= 9145) return { num: 35, name: 'Donald Maiden', emoji: '🐴', color: '#6b7280', points: 9145 };
  if (pts >= 8820) return { num: 34, name: 'Ballina Maiden', emoji: '🐴', color: '#6b7280', points: 8820 };
  if (pts >= 8500) return { num: 33, name: 'Ararat Maiden', emoji: '🐴', color: '#6b7280', points: 8500 };
  if (pts >= 8185) return { num: 32, name: 'Colac Maiden', emoji: '🐴', color: '#6b7280', points: 8185 };
  if (pts >= 7875) return { num: 31, name: 'Lismore Maiden', emoji: '🐴', color: '#6b7280', points: 7875 };
  if (pts >= 7565) return { num: 30, name: 'Murwillumbah Maiden', emoji: '🐴', color: '#6b7280', points: 7565 };
  if (pts >= 7260) return { num: 29, name: 'Moe Maiden', emoji: '🐴', color: '#6b7280', points: 7260 };
  if (pts >= 6960) return { num: 28, name: 'Mount Gambier Maiden', emoji: '🐴', color: '#6b7280', points: 6960 };
  if (pts >= 6660) return { num: 27, name: 'Bunbury Maiden', emoji: '🐴', color: '#6b7280', points: 6660 };
  if (pts >= 6365) return { num: 26, name: 'Nowra Maiden', emoji: '🐴', color: '#6b7280', points: 6365 };
  if (pts >= 6075) return { num: 25, name: 'Pinjarra Maiden', emoji: '🐴', color: '#6b7280', points: 6075 };
  if (pts >= 5785) return { num: 24, name: 'Hobart Maiden', emoji: '🐴', color: '#6b7280', points: 5785 };
  if (pts >= 5500) return { num: 23, name: 'Beaudesert Maiden', emoji: '🐴', color: '#6b7280', points: 5500 };
  if (pts >= 5220) return { num: 22, name: 'Queanbeyan Maiden', emoji: '🐴', color: '#6b7280', points: 5220 };
  if (pts >= 4940) return { num: 21, name: 'Moruya Maiden', emoji: '🐴', color: '#6b7280', points: 4940 };
  if (pts >= 4665) return { num: 20, name: 'Darwin Maiden', emoji: '🐴', color: '#6b7280', points: 4665 };
  if (pts >= 4395) return { num: 19, name: 'Gilgandra Maiden', emoji: '🐴', color: '#6b7280', points: 4395 };
  if (pts >= 4125) return { num: 18, name: 'Walcha Maiden', emoji: '🐴', color: '#6b7280', points: 4125 };
  if (pts >= 3860) return { num: 17, name: 'Cooma Maiden', emoji: '🐴', color: '#6b7280', points: 3860 };
  if (pts >= 3600) return { num: 16, name: 'Casterton Maiden', emoji: '🐴', color: '#6b7280', points: 3600 };
  if (pts >= 3340) return { num: 15, name: 'Narromine Maiden', emoji: '🐴', color: '#6b7280', points: 3340 };
  if (pts >= 3080) return { num: 14, name: 'Bourke Maiden', emoji: '🐴', color: '#6b7280', points: 3080 };
  if (pts >= 2830) return { num: 13, name: 'Walgett Maiden', emoji: '🐴', color: '#6b7280', points: 2830 };
  if (pts >= 2575) return { num: 12, name: 'Coonamble Maiden', emoji: '🐴', color: '#6b7280', points: 2575 };
  if (pts >= 2330) return { num: 11, name: 'Kingscote Maiden', emoji: '🐴', color: '#6b7280', points: 2330 };
  if (pts >= 2085) return { num: 10, name: 'Tumut Maiden', emoji: '🐴', color: '#6b7280', points: 2085 };
  if (pts >= 1840) return { num: 9, name: 'Elmore Maiden', emoji: '🐴', color: '#6b7280', points: 1840 };
  if (pts >= 1600) return { num: 8, name: 'Burrumbeet Maiden', emoji: '🐴', color: '#6b7280', points: 1600 };
  if (pts >= 1365) return { num: 7, name: 'Oakbank Picnic Maiden', emoji: '🐴', color: '#6b7280', points: 1365 };
  if (pts >= 1130) return { num: 6, name: 'Wyndham Picnic Maiden', emoji: '🐴', color: '#6b7280', points: 1130 };
  if (pts >= 900) return { num: 5, name: 'Yalgoo Picnic Maiden', emoji: '🐴', color: '#6b7280', points: 900 };
  if (pts >= 670) return { num: 4, name: 'Toodyay Picnic Maiden', emoji: '🐴', color: '#6b7280', points: 670 };
  if (pts >= 445) return { num: 3, name: 'Ardlethan Picnic Maiden', emoji: '🐴', color: '#6b7280', points: 445 };
  if (pts >= 220) return { num: 2, name: 'Broken Hill Maiden', emoji: '🐴', color: '#6b7280', points: 220 };
  return { num: 1, name: 'Adaminaby Picnic Maiden', emoji: '🐴', color: '#6b7280', points: 0 };
}

const ALL_TIERS = [0,220,445,670,900,1130,1365,1600,1840,2085,2330,2575,2830,3080,3340,3600,3860,4125,4395,4665,4940,5220,5500,5785,6075,6365,6660,6960,7260,7565,7875,8185,8500,8820,9145,9470,9800,10135,10475,10815,11165,11515,11865,12225,12590,12955,13325,13700,14080,14465,14850,15245,15640,16045,16450,16860,17280,17700,18125,18555,18990,19430,19875,20330,20785,21245,21710,22185,22660,23145,23635,24130,24630,25135,25645,26165,26685,27215,27750,28295,28840,29395,29955,30525,31100,31680,32265,32860,33460,34070,34685,35305,35935,36570,37215,37870,38525,39195,39865,40550,41240,41935,42645,43355,44080,44810,45550,46295,47055,47820,48590,49375,50165,50970,51780,52600,53425,54265,55115,55970,56840,57720,58605,59505,60415,61335,62265,63205,64155,65120,66095,67080,68075,69085,70105,71135,72180,73235,74300,75380,76475,77580,78695,79830,80970,82130,83300,84485,85680,86895,88120,89360,90615,91880,93165,94465,95775,97105,98450,99805,101180,102575,103980,105405,106845,108300,109770,111260,112770,114295,115835,117395,118975,120570,122185,123820,125475,127145,128835,130545,132275,134025,135795,137590,139400,141230,143085,144960,146860,148775,150720,152680,154670,156675,158710,160765,162845,164950,167075,169230,171405,173610,175835,178090,180370,182675,185010,187370,189755,192170,194615,197085,199585,202115,204670,207260,209875,212525,215200,217910,220650,223420,226225,229065,231930,234835,237770,240740,243745,246785,249855,252965,256110,259295,262515,265770,269060,272395,275765,279175,282620,286110,289640,293210,296820,300470,304165,307905,311685,315510,319375,323290,327250,331255,335305,339400,343545,347740,351980,356270,360610,365000].map(p => getTier(p));



function RanksModal({ onClose }) {
  const ways = [
    { action: 'Post in community',  pts: '+10 pts' },
    { action: 'Reply to a post',    pts: '+5 pts'  },
    { action: 'Upvote received',    pts: '+10 pts' },
    { action: 'Bet logged',         pts: '+5 pts'  },
    { action: 'Refer a friend',     pts: '+200 pts' },
  ];
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 10, width: 440, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ background: '#00471b', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>🏆 Ranks & Points Guide</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 12, lineHeight: 1.5 }}>
            🐴 Every member starts at <strong>Adaminaby Picnic Maiden</strong> and works their way up 115 levels to the ultimate rank — the <strong>Melbourne Cup</strong>. The climb mirrors a racehorse&apos;s career through the grades.
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Earning Points</div>
          {ways.map(w => (
            <div key={w.action} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: '#374151' }}>{w.action}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#059669' }}>{w.pts}</span>
            </div>
          ))}
          <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginTop: 16, marginBottom: 10 }}>Rank Ladder — 262 Tiers</div>
          {ALL_TIERS.map((t, i) => (
            <div key={t.num} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 8px', borderBottom: i < ALL_TIERS.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', width: 22, textAlign: 'right', flexShrink: 0 }}>#{t.num}</span>
              <span style={{ fontSize: 10, color: '#374151', flex: 1 }}>{t.emoji} {t.name}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: t.color, flexShrink: 0 }}>{t.points.toLocaleString()}pts</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ladder page ─────────────────────────────────────────────────────────────

function LadderPage({ profile, onClose }) {
  const [showFull, setShowFull] = useState(false);
  const pts = profile?.points || 0;
  const allTiers = ALL_TIERS;
  const totalTiers = allTiers.length;

  // Find current tier
  const currentTier = getTier(pts);
  const mcProgress = Math.min(100, Math.round(pts / 365000 * 100));

  // Next 20 ranks
  const next20 = allTiers.filter(t => t.points > pts).slice(0, 20);

  function weeksHeavy(needed) {
    if (needed <= 0) return 0;
    return Math.ceil(needed / 700);
  }
  function weeksCasual(needed) {
    if (needed <= 0) return 0;
    return Math.ceil(needed / 300);
  }

  const fastWays = [
    { label: 'Refer a new member', pts: '+200' },
    { label: '30-day streak',      pts: '+200' },
    { label: 'Blackbook horse wins',pts: '+20' },
    { label: 'Log a winning bet',  pts: '+15' },
    { label: 'Post in community',  pts: '+10' },
    { label: 'Post gets upvoted',  pts: '+10' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#fff', zIndex: 200, overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ background: '#00471b', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 1 }}>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}>
          ← Back
        </button>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>🏆 Race Rank Ladder</span>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 14px' }}>

        {/* Current rank card */}
        <div style={{ background: '#00471b', borderRadius: 10, padding: 16, marginBottom: 14, color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 32 }}>{currentTier.emoji || '🏇'}</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{currentTier.name}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                Rank #{currentTier.num} of {totalTiers} · {pts.toLocaleString()} pts
              </div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 5 }}>
            Progress to Melbourne Cup
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.2)', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ height: '100%', width: `${mcProgress}%`, background: '#fbbf24', borderRadius: 99 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10 }}>
            {[
              { label: 'Your Points',       val: pts.toLocaleString() },
              { label: 'Current Rank',      val: `#${currentTier.num}` },
              { label: 'To Melbourne Cup',  val: `${Math.max(0, 365000 - pts).toLocaleString()} pts` },
            ].map(s => (
              <div key={s.label} style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 6px', textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 800 }}>{s.val}</div>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Fastest ways */}
        <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#92400e', marginBottom: 8 }}>⚡ Fastest Ways to Earn</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {fastWays.map(w => (
              <div key={w.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.6)', borderRadius: 5, padding: '5px 8px' }}>
                <span style={{ fontSize: 10, color: '#78350f' }}>{w.label}</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#059669', flexShrink: 0, marginLeft: 6 }}>{w.pts}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Next 20 ranks */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#111827', marginBottom: 10 }}>Your Next 20 Ranks</div>
          {next20.length === 0 && (
            <div style={{ fontSize: 12, color: '#059669', fontWeight: 700, padding: 12, background: '#f0fdf4', borderRadius: 8 }}>
              🏆 You&apos;ve reached the top! Melbourne Cup achieved.
            </div>
          )}
          {next20.map(t => {
            const needed = t.points - pts;
            const tierProgress = Math.min(100, Math.round(pts / t.points * 100));
            return (
              <div key={t.num} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#f9fafb', borderRadius: 8, marginBottom: 6, border: '0.5px solid #e5e7eb' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#374151', flexShrink: 0 }}>
                  {t.num}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>{t.emoji} {t.name}</div>
                  <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 3 }}>
                    {needed.toLocaleString()} pts needed · {weeksHeavy(needed)}w heavy · {weeksCasual(needed)}w casual
                  </div>
                  <div style={{ height: 3, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${tierProgress}%`, background: '#00471b', borderRadius: 99 }} />
                  </div>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', flexShrink: 0 }}>{t.points.toLocaleString()}</div>
              </div>
            );
          })}
        </div>

        {/* Full ladder toggle */}
        <button onClick={() => setShowFull(f => !f)}
          style={{ width: '100%', padding: '10px 0', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#065f46', cursor: 'pointer', marginBottom: 14 }}>
          {showFull ? '▲ Hide Full Ladder' : '▼ View Full 262-Race Ladder'}
        </button>

        {showFull && ALL_TIERS.map(t => {
          const isYou = t.num === currentTier.num;
          const reached = pts >= t.points;
          return (
            <div key={t.num} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderBottom: '0.5px solid #f1f5f9', background: isYou ? '#f0fdf4' : 'transparent' }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', width: 24, textAlign: 'right', flexShrink: 0 }}>#{t.num}</span>
              <span style={{ fontSize: 10, color: '#374151', flex: 1 }}>{t.emoji} {t.name}</span>
              {isYou && <span style={{ fontSize: 8, fontWeight: 800, color: '#fff', background: '#00471b', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>YOU</span>}
              {!isYou && reached && <span style={{ fontSize: 11, flexShrink: 0 }}>✓</span>}
              {!isYou && !reached && <span style={{ fontSize: 11, flexShrink: 0, color: '#d1d5db' }}>🔒</span>}
              <span style={{ fontSize: 9, fontWeight: 700, color: t.color, flexShrink: 0 }}>{t.points.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── left column ─────────────────────────────────────────────────────────────

function LeftColumn({ profile, section, onSection, missions, badges, onShowRanks, onShowLadder }) {
  const tier = getTier(profile?.points || 0);
  const totalPoints = profile?.points || 0;
  const allTierPts = ALL_TIERS.map(t => t.points).sort((a,b)=>a-b);
  const currentTierPts = [...allTierPts].reverse().find(p => totalPoints >= p) ?? 0;
  const nextTierPts = allTierPts.find(p => p > totalPoints) ?? 365000;
  const progress = nextTierPts > currentTierPts ? Math.min(100, Math.round((totalPoints - currentTierPts) / (nextTierPts - currentTierPts) * 100)) : 100;

  return (
    <div className="comm-left-sidebar" style={{ width: 200, background: '#fff', borderRight: '0.5px solid #e5e7eb', overflowY: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
      {/* User card */}
      <div style={{ padding: '14px 12px', borderBottom: '0.5px solid #e5e7eb' }}>
        {profile ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Avatar profile={profile} size={40} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: 3 }}>{profile.display_name}</div>
                <button onClick={onShowLadder} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: `${tier.color}22`, color: tier.color }}>{tier.name}</span>
                </button>
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#9ca3af', marginBottom: 3 }}>
                <span>{totalPoints.toLocaleString()} pts</span>
                <span>{nextTierPts.toLocaleString()} pts</span>
              </div>
              <div style={{ height: 4, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress}%`, background: '#00471b', borderRadius: 99 }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
              {[
                { label: 'Bets',  val: profile.total_bets || 0 },
                { label: 'Win%',  val: profile.total_bets > 0 ? `${Math.round((profile.total_wins||0)/profile.total_bets*100)}%` : '—' },
                { label: 'Posts', val: profile.total_posts || 0 },
              ].map(s => (
                <div key={s.label} style={{ background: '#f9fafb', borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>{s.val}</div>
                  <div style={{ fontSize: 8, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase' }}>{s.label}</div>
                </div>
              ))}
            </div>
            {profile.referral_code && (
              <div style={{ marginTop: 8, padding: '4px 8px', background: '#f0fdf4', borderRadius: 4, fontSize: 9, color: '#065f46', wordBreak: 'break-all' }}>
                🎁 wagingwar.com.au?ref={profile.referral_code}
              </div>
            )}
            {badges.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 8, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>Badges</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {badges.map(b => (
                    <span key={b.id} title={b.name} style={{ fontSize: 16, cursor: 'default' }}>{b.icon || '🏅'}</span>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 11, color: '#9ca3af' }}>Sign in to see your profile.</div>
        )}
      </div>

      {/* Sections nav */}
      <div style={{ padding: '8px 0', borderBottom: '0.5px solid #e5e7eb' }}>
        <div style={{ fontSize: 8, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', padding: '0 12px', marginBottom: 4 }}>Sections</div>
        {SECTIONS.map(s => {
          const active = section === s.id;
          const dot = s.id !== 'all' ? CAT[s.id]?.text : null;
          return (
            <button key={s.id} onClick={() => onSection(s.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 7,
                padding: '6px 12px',
                background: active ? '#f0fdf4' : 'transparent',
                borderTop: 'none', borderRight: 'none', borderBottom: 'none',
                borderLeft: `3px solid ${active ? '#00471b' : 'transparent'}`,
                cursor: 'pointer', textAlign: 'left',
              }}>
              {dot
                ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                : <span style={{ width: 7, height: 7, flexShrink: 0 }} />
              }
              <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? '#00471b' : '#374151' }}>{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Daily missions */}
      {missions.length > 0 && (
        <div style={{ padding: '10px 12px', borderBottom: '0.5px solid #e5e7eb' }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 6 }}>Daily Missions</div>
          {missions.map(m => {
            const pct = m.progress_max > 0 ? Math.min(100, Math.round((m.user_progress || 0) / m.progress_max * 100)) : (m.completed ? 100 : 0);
            return (
              <div key={m.id} style={{ marginBottom: 7 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 10, marginBottom: 2 }}>
                  <span style={{ color: '#374151', fontWeight: 500 }}>{m.title}</span>
                  <span style={{ color: '#059669', fontWeight: 700, fontSize: 9, flexShrink: 0, marginLeft: 4 }}>+{m.points_reward}pts</span>
                </div>
                <div style={{ height: 3, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 99, background: m.completed ? '#059669' : '#00471b', width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Ranks guide button */}
      <div style={{ padding: '10px 12px', marginTop: 'auto' }}>
        <button onClick={onShowRanks}
          style={{ width: '100%', padding: 7, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#065f46', cursor: 'pointer' }}>
          🏆 Ranks &amp; Points Guide
        </button>
      </div>
    </div>
  );
}

// ─── right column ─────────────────────────────────────────────────────────────

function RightColumn({ leaderboard, contributors, stats }) {
  const Medal = ({ i }) => (
    <span style={{ width: 16, height: 16, borderRadius: '50%', background: i===0?'#fbbf24':i===1?'#d1d5db':i===2?'#cd7f32':'#f3f4f6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: i<3?'#78350f':'#6b7280', flexShrink: 0 }}>
      {i + 1}
    </span>
  );
  return (
    <div style={{ width: 200, background: '#fff', overflowY: 'auto', flexShrink: 0, padding: 12 }}>
      {/* Weekly ROI leaderboard */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Weekly ROI</div>
        {leaderboard.length === 0 && <div style={{ fontSize: 10, color: '#d1d5db' }}>No data yet</div>}
        {leaderboard.slice(0, 5).map((e, i) => (
          <div key={e.clerk_id || i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <Medal i={i} />
            <span style={{ fontSize: 10, fontWeight: 600, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.display_name || 'Anonymous'}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#059669', flexShrink: 0 }}>
              {e.roi != null ? `${e.roi > 0 ? '+' : ''}${e.roi}%` : '—'}
            </span>
          </div>
        ))}
      </div>

      {/* Top contributors */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Top Contributors</div>
        {contributors.length === 0 && <div style={{ fontSize: 10, color: '#d1d5db' }}>No data yet</div>}
        {contributors.slice(0, 5).map((c, i) => (
          <div key={c.clerk_id || i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <Medal i={i} />
            <span style={{ fontSize: 10, fontWeight: 600, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.display_name || 'Anonymous'}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#00471b', flexShrink: 0 }}>{(c.points || 0).toLocaleString()}pts</span>
          </div>
        ))}
      </div>

      {/* Community stats */}
      <div style={{ marginBottom: 14, background: '#f9fafb', borderRadius: 8, padding: 10, border: '0.5px solid #e5e7eb' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Community Stats</div>
        {[{ label: 'Members', val: stats.members || 0 }, { label: 'Posts', val: stats.posts || 0 }].map(s => (
          <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: '#6b7280' }}>{s.label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>{s.val.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* Promo */}
      <div style={{ background: 'linear-gradient(135deg, #00471b, #065f46)', borderRadius: 8, padding: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Waging War</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', lineHeight: 1.4, marginBottom: 8 }}>
          Australia&apos;s #1 race analysis platform. Beat the market every day.
        </div>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#6ee7b7' }}>Share with friends →</div>
      </div>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

function CommunityPageInner() {
  const { user } = useUser();
  const userId  = user?.id || null;
  const searchParams = useSearchParams();
  const isAdmin = userId === ADMIN_ID;
  const isPro     = useIsPro();
  const isMobile  = useIsMobile();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const [section,      setSection]      = useState('all');
  const [posts,        setPosts]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [selectedPost, setSelectedPost] = useState(null);
  const [replies,      setReplies]      = useState([]);
  const [newPostModal, setNewPostModal] = useState(false);
  const [ranksModal,   setRanksModal]   = useState(false);
  const [showLadder,   setShowLadder]   = useState(false);

  useEffect(() => {
    if (searchParams.get('ladder') === '1') setShowLadder(true);
  }, [searchParams]);

  const [upvotedPosts,   setUpvotedPosts]   = useState(new Set());
  const [upvotedReplies, setUpvotedReplies] = useState(new Set());
  const [profile,      setProfile]      = useState(null);
  const [badges,       setBadges]       = useState([]);
  const [missions,     setMissions]     = useState([]);
  const [leaderboard,  setLeaderboard]  = useState([]);
  const [contributors, setContributors] = useState([]);
  const [stats,        setStats]        = useState({ members: 0, posts: 0 });

  useEffect(() => {
    setLoading(true);
    setSelectedPost(null);
    loadPosts(section).then(data => { setPosts(data || []); setLoading(false); });
  }, [section]);

  useEffect(() => {
    if (!userId) { console.log('[Community] no userId — not signed in'); return; }
    console.log('[Community] userId:', userId);
    (async () => {
      const r = await sb(`user_profiles?select=*&clerk_id=eq.${userId}&limit=1`);
      console.log('[Community] profile query result:', r);
      if (r && r.length) setProfile(r[0]);
    })();
    setBadges([]);
    sb(`user_missions?select=*,missions(title,points)&clerk_id=eq.${userId}&limit=5`).then(r => {
      if (r) setMissions(r.map(um => ({
        id: um.mission_id,
        title: um.missions?.title,
        points_reward: um.missions?.points || 0,
        progress_max: 1,
        user_progress: um.progress || 0,
        completed: !!um.completed,
      })));
    });
  }, [userId]);

  useEffect(() => {
    sb('competition_entries?select=clerk_id,roi&order=roi.desc.nullslast&limit=5').then(async r => {
      if (!r || !r.length) { setLeaderboard([]); return; }
      const ids = r.map(e => e.clerk_id).filter(Boolean);
      const profs = ids.length ? await sb(`user_profiles?select=clerk_id,display_name&clerk_id=in.(${ids.join(',')})`) : [];
      const nameMap = {};
      if (profs) profs.forEach(p => { nameMap[p.clerk_id] = p.display_name; });
      setLeaderboard(r.map(e => ({ ...e, display_name: nameMap[e.clerk_id] || 'Anonymous' })));
    });
    sb('user_profiles?select=clerk_id,display_name,points&order=points.desc&limit=5').then(r => setContributors(r || []));
    Promise.all([sbCount('user_profiles'), sbCount('posts')]).then(([members, postsCount]) => {
      setStats({ members, posts: postsCount });
    });
  }, []);

  useEffect(() => {
    if (!selectedPost) { setReplies([]); return; }
    loadReplies(selectedPost.id).then(setReplies);
  }, [selectedPost?.id]); // eslint-disable-line

  const handleUpvotePost = useCallback(async (postId, current) => {
    const alreadyVoted = upvotedPosts.has(postId);
    const v = alreadyVoted ? (current || 0) - 1 : (current || 0) + 1;
    await sb(`posts?id=eq.${postId}`, { method: 'PATCH', body: { votes: v }, prefer: 'return=minimal' });
    setPosts(ps => ps.map(p => p.id === postId ? { ...p, votes: v } : p));
    setSelectedPost(sp => sp?.id === postId ? { ...sp, votes: v } : sp);
    setUpvotedPosts(prev => { const next = new Set(prev); alreadyVoted ? next.delete(postId) : next.add(postId); return next; });
  }, [upvotedPosts]);

  const handleUpvoteReply = useCallback(async (replyId, current) => {
    const alreadyVoted = upvotedReplies.has(replyId);
    const v = alreadyVoted ? (current || 0) - 1 : (current || 0) + 1;
    await sb(`replies?id=eq.${replyId}`, { method: 'PATCH', body: { votes: v }, prefer: 'return=minimal' });
    setReplies(rs => rs.map(r => r.id === replyId ? { ...r, votes: v } : r));
    setUpvotedReplies(prev => { const next = new Set(prev); alreadyVoted ? next.delete(replyId) : next.add(replyId); return next; });
  }, [upvotedReplies]);

  const handleDeletePost = useCallback(async (postId) => {
    await sb(`posts?id=eq.${postId}`, { method: 'DELETE' });
    setPosts(ps => ps.filter(p => p.id !== postId));
    setSelectedPost(sp => sp?.id === postId ? null : sp);
  }, []);

  const handleDeleteReply = useCallback(async (replyId) => {
    await sb(`replies?id=eq.${replyId}`, { method: 'DELETE' });
    setReplies(rs => rs.filter(r => r.id !== replyId));
  }, []);

  const handleAddReply = useCallback(async (postId, body) => {
    if (!userId) return false;
    const result = await sb('replies?select=*', {
      method: 'POST',
      body: { post_id: postId, clerk_id: userId, content: body, votes: 0 },
      prefer: 'return=representation',
    });
    if (result && result.length) {
      setReplies(rs => [...rs, { ...result[0], author: profile }]);
      const newCount = (posts.find(p => p.id === postId)?.reply_count || 0) + 1;
      await sb(`posts?id=eq.${postId}`, { method: 'PATCH', body: { reply_count: newCount }, prefer: 'return=minimal' });
      setPosts(ps => ps.map(p => p.id === postId ? { ...p, reply_count: newCount } : p));
      setSelectedPost(sp => sp?.id === postId ? { ...sp, reply_count: newCount } : sp);
      window.dispatchEvent(new Event('ww:profile:refresh'));
    }
    return !!result;
  }, [userId, profile, posts]);

  const handleNewPost = useCallback(async ({ section: sec, title, body }) => {
    if (!userId) return false;
    const result = await sb('posts?select=*', {
      method: 'POST',
      body: { user_id: userId, section: sec, title, body, votes: 0, reply_count: 0 },
      prefer: 'return=representation',
    });
    if (result && result.length) {
      setPosts(ps => [{ ...result[0], author: profile }, ...ps]);
      window.dispatchEvent(new Event('ww:profile:refresh'));
    }
    return !!result;
  }, [userId, profile]);

  const totalVotes   = posts.reduce((s, p) => s + (p.votes || 0), 0);
  const totalReplies = posts.reduce((s, p) => s + (p.reply_count || 0), 0);
  const sectionLabel = SECTIONS.find(s => s.id === section)?.label || 'All Posts';

  return (
    <div className="comm-outer mob-page" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', overflow: 'hidden', background: '#f1f5f9' }}>
      {/* Mobile section pills */}
      {isMobile && (
        <div style={{ display: 'flex', overflowX: 'auto', gap: 6, padding: '8px 16px', height: 44, alignItems: 'center', background: '#fff', borderBottom: '0.5px solid #e5e7eb', flexShrink: 0, scrollbarWidth: 'none' }}>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)}
              style={{ padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0, minHeight: 36,
                background: section === s.id ? '#00471b' : '#fff',
                color: section === s.id ? '#fff' : '#374151',
                border: section === s.id ? '1px solid transparent' : '1px solid #e5e7eb',
              }}>
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'var(--community-cols, 200px 1fr 200px)', overflow: 'hidden', background: '#f1f5f9' }}
        className="community-grid">
      <LeftColumn
        profile={profile}
        section={section}
        onSection={s => setSection(s)}
        missions={missions}
        badges={badges}
        onShowRanks={() => setRanksModal(true)}
        onShowLadder={() => setShowLadder(true)}
      />

      <div style={{ display: 'flex', flexDirection: 'column', background: '#fff', borderRight: '0.5px solid #e5e7eb', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '10px 16px', borderBottom: '0.5px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#111827', letterSpacing: '0.02em' }}>Community</span>
          <button className="mob-hidden" onClick={() => isPro ? setNewPostModal(true) : setUpgradeOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#00471b', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            ✏️ New Post
          </button>
        </div>

        {/* Free member banner */}
        {!isPro && userId && (
          <div style={{ padding: '7px 16px', background: '#f0fdf4', borderBottom: '0.5px solid #86efac', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: '#065f46' }}>You&apos;re browsing as a free member — upgrade to post, reply and earn points</span>
            <button onClick={() => setUpgradeOpen(true)} style={{ fontSize: 11, fontWeight: 700, color: '#065f46', background: 'none', border: '1px solid #86efac', borderRadius: 5, padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Upgrade
            </button>
          </div>
        )}

        {/* Stats bar */}
        <div style={{ padding: '5px 16px', borderBottom: '0.5px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#f3f4f6', color: '#374151' }}>{posts.length} posts</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#f3f4f6', color: '#374151' }}>▲ {totalVotes}</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#f3f4f6', color: '#374151' }}>💬 {totalReplies}</span>
          <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 600, color: '#6b7280' }}>{sectionLabel}</span>
        </div>

        {/* Feed or thread */}
        {selectedPost ? (
          <ThreadView
            post={selectedPost}
            replies={replies}
            onBack={() => setSelectedPost(null)}
            onUpvotePost={handleUpvotePost}
            onUpvoteReply={handleUpvoteReply}
            onAddReply={handleAddReply}
            onDeletePost={handleDeletePost}
            onDeleteReply={handleDeleteReply}
            userId={userId}
            isAdmin={isAdmin}
            upvotedPosts={upvotedPosts}
            upvotedReplies={upvotedReplies}
            isPro={isPro}
            onUpgrade={() => setUpgradeOpen(true)}
          />
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
              {sectionLabel}
            </div>
            {loading && <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: 24 }}>Loading…</div>}
            {!loading && posts.length === 0 && (
              <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: 24 }}>No posts yet — be the first to post!</div>
            )}
            {posts.map((p, i) => {
              if (i === 0) console.log(`[Community] canDelete: userId=${userId} isAdmin=${isAdmin} postUserId=${p.user_id} match=${p.user_id === userId} canDelete=${isAdmin || p.user_id === userId}`);
              return (
                <PostCard
                  key={p.id}
                  post={p}
                  onSelect={setSelectedPost}
                  onUpvote={handleUpvotePost}
                  onDelete={handleDeletePost}
                  canDelete={isAdmin || p.user_id === userId}
                  isPro={isPro}
                  onUpgrade={() => setUpgradeOpen(true)}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="comm-right-sidebar hidden md:block"><RightColumn leaderboard={leaderboard} contributors={contributors} stats={stats} /></div>
      </div>

      {/* Mobile FAB — floating new post button above bottom nav */}
      {isMobile && (
        <button
          onClick={() => isPro ? setNewPostModal(true) : setUpgradeOpen(true)}
          style={{ position: 'fixed', bottom: 72, right: 16, width: 52, height: 52, borderRadius: '50%', background: '#1B4332', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.28)' }}
        >
          <i className="ti ti-plus" style={{ fontSize: 24 }} />
        </button>
      )}

      {newPostModal && <NewPostModal onClose={() => setNewPostModal(false)} onPost={handleNewPost} userId={userId} />}
      {ranksModal   && <RanksModal onClose={() => setRanksModal(false)} />}
      {showLadder   && <LadderPage profile={profile} onClose={() => setShowLadder(false)} />}
      {upgradeOpen  && <UpgradeModal onClose={() => setUpgradeOpen(false)} />}
    </div>
  );
}

export default function CommunityPage() {
  return (
    <Suspense>
      <CommunityPageInner />
    </Suspense>
  );
}
