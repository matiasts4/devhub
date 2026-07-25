/**
 * BrowserTabStrip.jsx — Pure presentational tab strip.
 *
 * Phase 3 of pizarra-shared-view-state. Used by both the
 * workspace right-dock (`WorkspaceBrowserPane` mount) and the
 * pizarra browser surface. The component takes the tab list
 * and event callbacks as props and renders a single row of
 * chips plus a `+` button.
 *
 * Visual style follows the existing right-dock chrome —
 * lucide-react icons, low-contrast borders, dark surface. We
 * intentionally use `data-*` attributes instead of CSS class
 * names for the test selectors and the active indicator so
 * refactoring CSS doesn't break the contract.
 *
 * The strip is `role="tablist"` for accessibility. Each chip
 * is a `role="tab"` with `aria-selected` reflecting the active
 * state.
 */

'use client';

import { Plus, X } from 'lucide-react';
import { memo } from 'react';

function BrowserTabItemImpl({ tab, isActive, onSelect, onClose, compact = false }) {
  const handleClose = (event) => {
    // Stop propagation so a close click does not also fire
    // the tab's onSelect handler.
    event.stopPropagation();
    onClose(tab.id);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(tab.id);
    }
  };

  return (
    <div
      role="tab"
      data-testid={`browser-tab-strip-tab-${tab.id}`}
      data-active={isActive ? 'true' : 'false'}
      aria-selected={isActive ? 'true' : 'false'}
      tabIndex={0}
      onClick={() => onSelect(tab.id)}
      onKeyDown={handleKeyDown}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 4 : 6,
        padding: compact ? '2px 5px' : '4px 8px',
        borderRadius: compact ? 6 : 8,
        border: isActive
          ? '1px solid var(--accent-primary, #58a6ff)'
          : '1px solid rgba(255,255,255,0.08)',
        background: isActive ? 'rgba(88,166,255,0.12)' : 'rgba(8,14,24,0.6)',
        color: isActive ? '#f0ece4' : '#9fb5d1',
        cursor: 'pointer',
        maxWidth: compact ? 112 : 200,
        minWidth: 0,
        fontFamily: 'inherit',
        fontSize: compact ? 10 : 12,
        lineHeight: 1.2,
        userSelect: 'none',
      }}
    >
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        {tab.label || tab.url}
      </span>
      {tab.canClose !== false ? (
        <button
          type="button"
          data-testid={`browser-tab-strip-close-${tab.id}`}
          aria-label="Cerrar pestaña"
          onClick={handleClose}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: compact ? 16 : 18,
            height: compact ? 16 : 18,
            flexShrink: 0,
            padding: 0,
            border: 'none',
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
            borderRadius: 4,
          }}
        >
          <X size={12} />
        </button>
      ) : null}
    </div>
  );
}

const BrowserTabItem = memo(BrowserTabItemImpl);

function BrowserTabStripImpl({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onAddTab,
  currentUrl = '',
  tabCap = 20,
  variant = 'standalone',
}) {
  const atCap = tabs.length >= tabCap;
  const inToolbar = variant === 'toolbar';
  const handleAdd = () => {
    onAddTab(currentUrl);
  };

  return (
    <div
      role="tablist"
      data-testid="browser-tab-strip"
      data-variant={variant}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: inToolbar ? 4 : 6,
        minWidth: 0,
        flex: inToolbar ? '1 1 auto' : undefined,
        padding: inToolbar ? 0 : '6px 8px',
        overflowX: inToolbar ? 'hidden' : 'auto',
        background: inToolbar ? 'transparent' : 'rgba(8, 14, 24, 0.7)',
        borderBottom: inToolbar ? 'none' : '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {tabs.map((tab) => (
        <BrowserTabItem
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onSelect={onSelectTab}
          onClose={onCloseTab}
          compact={inToolbar}
        />
      ))}
      <button
        type="button"
        data-testid="browser-tab-strip-add"
        aria-label="Nueva pestaña"
        aria-disabled={atCap ? 'true' : 'false'}
        disabled={atCap}
        title={atCap ? `Cap reached (${tabCap} tabs)` : 'New tab'}
        onClick={handleAdd}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 24,
          flexShrink: 0,
          padding: 0,
          borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.08)',
          background: atCap ? 'rgba(8,14,24,0.3)' : 'rgba(6, 16, 27, 0.9)',
          color: atCap ? 'rgba(159,181,209,0.4)' : '#9fb5d1',
          cursor: atCap ? 'not-allowed' : 'pointer',
        }}
      >
        <Plus size={12} />
      </button>
    </div>
  );
}

const BrowserTabStrip = memo(BrowserTabStripImpl);

export default BrowserTabStrip;
