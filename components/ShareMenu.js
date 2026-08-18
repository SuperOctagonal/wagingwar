'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { awardPoints } from '@/lib/points';

// Reusable share menu: device-share / Facebook / X / download / copy, plus
// an optional extra actions slot (used by Bet Share's "Share to Community").
// Built for the Battle Card share button and reused as-is for Bet Share --
// see app/mybets/page.js for both usages.
//
// Flow on open: award points once (not per-button), call createPublicUrl()
// to get {id,url}, then call fetchImage({id,url}) to get the PNG Response.
// createPublicUrl always runs first because Bet Share's image route only
// knows how to render from a stored snapshot -- there's no separate
// "authenticated live" image endpoint the way Battle Card has.
export default function ShareMenu({
  userId,
  qualifies = true,
  lockedTitle,
  openTitle = 'Share',
  label,
  icon = 'ti-share',
  lockedIcon = 'ti-lock',
  pointsAction,
  createPublicUrl,
  fetchImage,
  fileName,
  shareTitle,
  shareText,
  extraActions = [], // [{ label, icon, onClick: async ({id,url,blob}) => void, disabledUntilReady }]
  isMobile = false,
  wrapperStyle,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [imgStatus, setImgStatus] = useState('idle'); // idle | loading | error
  const [imgFallback, setImgFallback] = useState(null); // { blob, url }
  const [publicShare, setPublicShare] = useState(null); // { id, url }
  const [publicStatus, setPublicStatus] = useState('idle'); // idle | loading | error
  const objectUrlRef = useRef(null);

  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); }, []);

  const handleOpen = useCallback(async () => {
    if (!userId || menuOpen) return;
    setMenuOpen(true);
    if (pointsAction) awardPoints(userId, pointsAction).catch(() => {});

    setPublicStatus('loading');
    setImgStatus('loading');
    try {
      const share = await createPublicUrl();
      setPublicShare(share);
      setPublicStatus('idle');

      const res = await fetchImage(share);
      if (!res.ok) throw new Error(`image fetch ${res.status}`);
      const blob = await res.blob();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setImgFallback({ blob, url });
      setImgStatus('idle');
    } catch (err) {
      console.error('[ShareMenu] open failed:', err);
      setPublicStatus('error');
      setImgStatus('error');
    }
  }, [userId, menuOpen, pointsAction, createPublicUrl, fetchImage]);

  const handleClose = useCallback(() => setMenuOpen(false), []);

  const handleDeviceShare = useCallback(async () => {
    if (!imgFallback) return;
    const file = new File([imgFallback.blob], fileName, { type: 'image/png' });
    try {
      await navigator.share({ files: [file], title: shareTitle, text: shareText });
      setMenuOpen(false);
    } catch (err) {
      if (err?.name !== 'AbortError') console.error('[ShareMenu] device share failed:', err);
    }
  }, [imgFallback, fileName, shareTitle, shareText]);

  const handleDownload = useCallback(() => {
    if (!imgFallback) return;
    const a = document.createElement('a');
    a.href = imgFallback.url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setMenuOpen(false);
  }, [imgFallback, fileName]);

  const handleCopy = useCallback(async () => {
    if (!imgFallback || !navigator.clipboard?.write) return;
    try {
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': imgFallback.blob })]);
      setMenuOpen(false);
    } catch (err) {
      console.error('[ShareMenu] copy failed:', err);
    }
  }, [imgFallback]);

  const handleFacebook = useCallback(() => {
    if (!publicShare) return;
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicShare.url)}`, '_blank', 'noopener,noreferrer,width=600,height=500');
    setMenuOpen(false);
  }, [publicShare]);

  const handleX = useCallback(() => {
    if (!publicShare) return;
    window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(publicShare.url)}&text=${encodeURIComponent(shareText || '')}`, '_blank', 'noopener,noreferrer,width=600,height=500');
    setMenuOpen(false);
  }, [publicShare, shareText]);

  const ready = !!(imgFallback && publicShare);
  const itemStyle = enabled => ({
    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 5, border: 'none',
    background: 'none', fontSize: 11, fontWeight: 600, textAlign: 'left',
    color: enabled ? '#111827' : '#c1c7d0', cursor: enabled ? 'pointer' : 'default',
  });

  return (
    <div style={{ position: 'relative', display: 'inline-block', ...wrapperStyle }}>
      <button
        onClick={qualifies ? (menuOpen ? handleClose : handleOpen) : undefined}
        disabled={!qualifies}
        title={qualifies ? openTitle : lockedTitle}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: isMobile ? '4px 6px' : '4px 8px',
          borderRadius: 6, border: `1px solid ${qualifies ? '#e8b84a' : '#e5e7eb'}`,
          background: qualifies ? '#0d2416' : '#f9fafb',
          color: qualifies ? '#e8b84a' : '#9ca3af',
          fontSize: 10, fontWeight: 700, cursor: qualifies ? 'pointer' : 'default',
        }}
      >
        <i className={`ti ${qualifies ? icon : lockedIcon}`} style={{ fontSize: 11 }} />
        {!isMobile && label}
      </button>
      {menuOpen && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', padding: 6, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 30, width: 190 }}>
          {typeof navigator !== 'undefined' && navigator.share && (
            <button onClick={handleDeviceShare} disabled={!ready} style={itemStyle(ready)}>
              <i className="ti ti-share-2" style={{ fontSize: 12 }} /> Share via device… {imgStatus === 'loading' && '(loading)'}
            </button>
          )}
          <button onClick={handleFacebook} disabled={!publicShare} style={itemStyle(!!publicShare)}>
            <i className="ti ti-brand-facebook" style={{ fontSize: 12 }} /> Share to Facebook {publicStatus === 'loading' && '(loading)'}
          </button>
          <button onClick={handleX} disabled={!publicShare} style={itemStyle(!!publicShare)}>
            <i className="ti ti-brand-x" style={{ fontSize: 12 }} /> Share to X {publicStatus === 'loading' && '(loading)'}
          </button>
          {extraActions.map(action => (
            <button
              key={action.label}
              onClick={async () => {
                if (!ready) return;
                await Promise.resolve(action.onClick({ ...publicShare, blob: imgFallback.blob }))
                  .catch(err => console.error('[ShareMenu] extra action failed:', err));
                setMenuOpen(false);
              }}
              disabled={!ready}
              style={itemStyle(ready)}
            >
              {action.icon && <i className={`ti ${action.icon}`} style={{ fontSize: 12 }} />} {action.label}
            </button>
          ))}
          <button onClick={handleDownload} disabled={!imgFallback} style={itemStyle(!!imgFallback)}>
            <i className="ti ti-download" style={{ fontSize: 12 }} /> Download image
          </button>
          {typeof window !== 'undefined' && window.ClipboardItem && (
            <button onClick={handleCopy} disabled={!imgFallback} style={itemStyle(!!imgFallback)}>
              <i className="ti ti-copy" style={{ fontSize: 12 }} /> Copy to clipboard
            </button>
          )}
          <button onClick={handleClose} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 5, border: 'none', background: 'none', fontSize: 11, color: '#9ca3af', cursor: 'pointer', textAlign: 'left' }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
