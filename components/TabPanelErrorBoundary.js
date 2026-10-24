'use client';
import { Component } from 'react';

// Wraps a single race-page tab panel (Field/Form/Odds/etc.) so a bug in
// one view's render can never blank the whole /races page -- only that
// panel falls back to a small retry message. Class component because
// getDerivedStateFromError/componentDidCatch have no hook equivalent.
export default class TabPanelErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Tab panel crashed:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Reset once the caller switches away and back, or to a different
    // race/view, so a transient failure doesn't permanently lock the tab.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '48px 16px', color: '#6b7280', textAlign: 'center' }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 24, color: '#d1d5db' }} />
          <div style={{ fontSize: 13 }}>{this.props.label || 'This tab'} couldn&apos;t load. Try again.</div>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 6, background: '#00471b', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
