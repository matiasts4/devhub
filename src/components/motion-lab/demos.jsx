'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';
import { spring, amplified } from '../ui/motion/motionPresets';
import { useDemoTransition } from './useDemoTransition';
import { useDemoTransform } from './useDemoTransform';

/* Shared small UI bits                                                         */

const btnStyle = {
  padding: '6px 12px',
  fontSize: 12,
  borderRadius: 8,
  border: '1px solid var(--border-subtle, #2a2a2a)',
  background: 'var(--surface-2, #1a1a1a)',
  color: 'inherit',
  cursor: 'pointer',
};

const placeholder = {
  width: 220,
  height: 120,
  borderRadius: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 600,
  fontSize: 18,
};

function presetsForMode(mode) {
  return mode === 'amplified' ? amplified : spring;
}

/* 1. View transition (iOS push/pop)                                           */

const VIEWS = ['#3b82f6', '#a855f7', '#10b981'];

function DemoViewTransition({ replayKey }) {
  const transition = useDemoTransition('nav');
  const scaleFrom = useDemoTransform(0.96, 0.85);
  const xShift = useDemoTransform(60, 90);
  const [[index, direction], setState] = useState([0, 0]);
  const paginate = useCallback(
    (dir) => setState(([i]) => [(i + dir + VIEWS.length) % VIEWS.length, dir]),
    []
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      <div
        style={{
          position: 'relative',
          width: 240,
          height: 140,
          overflow: 'hidden',
          borderRadius: 10,
        }}
      >
        <AnimatePresence custom={direction} mode="popLayout" initial={false}>
          <motion.div
            key={`${index}-${replayKey}`}
            custom={direction}
            initial={(d) => ({ opacity: 0, scale: scaleFrom, x: d > 0 ? xShift : -xShift })}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={(d) => ({ opacity: 0, scale: scaleFrom, x: d > 0 ? -xShift : xShift })}
            transition={transition}
            style={{ ...placeholder, position: 'absolute', inset: 0, background: VIEWS[index] }}
          >
            View {index + 1}
          </motion.div>
        </AnimatePresence>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={btnStyle} onClick={() => paginate(-1)}>
          ← prev
        </button>
        <button type="button" style={btnStyle} onClick={() => paginate(1)}>
          next →
        </button>
      </div>
    </div>
  );
}

/* 2. Window open                                                               */

function DemoWindowOpen({ replayKey }) {
  const transition = useDemoTransition('open');
  const scaleFrom = useDemoTransform(0.9, 0.8);
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      <button type="button" style={btnStyle} onClick={() => setOpen(true)} disabled={open}>
        open window
      </button>
      <div style={{ position: 'relative', width: 260, height: 120 }}>
        <AnimatePresence>
          {open && (
            <motion.div
              key={`win-open-${replayKey}`}
              initial={{ opacity: 0, scale: scaleFrom }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: scaleFrom }}
              transition={transition}
              style={{
                ...placeholder,
                width: 260,
                height: 120,
                background: '#f59e0b',
                position: 'absolute',
                inset: 0,
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <span>window</span>
              <button type="button" style={btnStyle} onClick={() => setOpen(false)}>
                close ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* 3. Window close                                                              */

function DemoWindowClose({ replayKey }) {
  const transition = useDemoTransition('open');
  const scaleFrom = useDemoTransform(0.9, 0.8);
  const [open, setOpen] = useState(true);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      <button type="button" style={btnStyle} onClick={() => setOpen(false)} disabled={!open}>
        close window
      </button>
      <div style={{ position: 'relative', width: 260, height: 120 }}>
        <AnimatePresence>
          {open && (
            <motion.div
              key={`win-close-${replayKey}`}
              initial={{ opacity: 0, scale: scaleFrom }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: scaleFrom }}
              transition={transition}
              style={{
                ...placeholder,
                width: 260,
                height: 120,
                background: '#f59e0b',
                position: 'absolute',
                inset: 0,
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <span>window</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {!open && (
        <button type="button" style={btnStyle} onClick={() => setOpen(true)}>
          re-open
        </button>
      )}
    </div>
  );
}

/* 4. Auto-fit / resize settle (transform-only scaleX)                          */

function DemoAutoFitSettle() {
  const transition = useDemoTransition('settle');
  const [wide, setWide] = useState(false);
  const scaleTo = useDemoTransform(1.5, 1.75);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      <div style={{ width: 320, display: 'flex', justifyContent: 'flex-start' }}>
        <motion.div
          animate={{ scaleX: wide ? scaleTo : 1 }}
          transition={transition}
          style={{
            height: 90,
            width: 160,
            borderRadius: 10,
            background: '#22d3ee',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
            transformOrigin: 'left center',
          }}
        >
          {wide ? 'wide' : 'narrow'}
        </motion.div>
      </div>
      <button type="button" style={btnStyle} onClick={() => setWide((w) => !w)}>
        toggle width
      </button>
    </div>
  );
}

/* 5. Workspace change (cross-fade with direction)                              */

const WORKSPACES = ['#ef4444', '#8b5cf6', '#14b8a6'];

function DemoWorkspaceChange({ replayKey }) {
  const transition = useDemoTransition('nav');
  const xShift = useDemoTransform(48, 72);
  const [[index, direction], setState] = useState([0, 0]);
  const paginate = useCallback(
    (dir) => setState(([i]) => [(i + dir + WORKSPACES.length) % WORKSPACES.length, dir]),
    []
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      <div
        style={{
          position: 'relative',
          width: 260,
          height: 110,
          overflow: 'hidden',
          borderRadius: 10,
        }}
      >
        <AnimatePresence custom={direction} mode="popLayout" initial={false}>
          <motion.div
            key={`ws-${index}-${replayKey}`}
            custom={direction}
            initial={(d) => ({ opacity: 0, x: d > 0 ? xShift : -xShift })}
            animate={{ opacity: 1, x: 0 }}
            exit={(d) => ({ opacity: 0, x: d > 0 ? -xShift : xShift })}
            transition={transition}
            style={{
              ...placeholder,
              position: 'absolute',
              inset: 0,
              background: WORKSPACES[index],
            }}
          >
            ws-{index + 1}
          </motion.div>
        </AnimatePresence>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={btnStyle} onClick={() => paginate(-1)}>
          ← prev
        </button>
        <button type="button" style={btnStyle} onClick={() => paginate(1)}>
          next →
        </button>
      </div>
    </div>
  );
}

/* 6. Modal / sheet (two variants)                                             */

function DemoModalSheet() {
  const sheetTransition = useDemoTransition('sheet');
  const openTransition = useDemoTransition('open');
  const sheetFromY = useDemoTransform('100%', '120%');
  const modalScaleFrom = useDemoTransform(0.8, 0.65);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <button type="button" style={btnStyle} onClick={() => setSheetOpen(true)}>
          sheet from bottom
        </button>
        <div
          style={{
            position: 'relative',
            width: 180,
            height: 120,
            overflow: 'hidden',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.04)',
          }}
        >
          <AnimatePresence>
            {sheetOpen && (
              <motion.div
                key="sheet"
                initial={{ y: sheetFromY, opacity: 0.4 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: sheetFromY, opacity: 0.4 }}
                transition={sheetTransition}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: '#6366f1',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <span>sheet</span>
                <button type="button" style={btnStyle} onClick={() => setSheetOpen(false)}>
                  close
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <button type="button" style={btnStyle} onClick={() => setModalOpen(true)}>
          scale-center modal
        </button>
        <div
          style={{
            position: 'relative',
            width: 180,
            height: 120,
            overflow: 'hidden',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.04)',
          }}
        >
          <AnimatePresence>
            {modalOpen && (
              <motion.div
                key="modal"
                initial={{ scale: modalScaleFrom, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: modalScaleFrom, opacity: 0 }}
                transition={openTransition}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: '#ec4899',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <span>modal</span>
                <button type="button" style={btnStyle} onClick={() => setModalOpen(false)}>
                  close
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* 7. Tab indicator (x + scaleX, no layout animation)                           */

const TABS = ['Overview', 'Activity', 'Settings'];

function DemoTabIndicator() {
  const transition = useDemoTransition('toggle');
  const [active, setActive] = useState(0);
  const tabWidth = 100 / TABS.length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, width: 280 }}>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          borderBottom: '1px solid var(--border-subtle, #2a2a2a)',
        }}
      >
        {TABS.map((t, i) => (
          <button
            key={t}
            type="button"
            onClick={() => setActive(i)}
            style={{
              flex: 1,
              padding: '10px 0',
              fontSize: 12,
              background: 'transparent',
              border: 'none',
              color: active === i ? 'inherit' : 'rgba(255,255,255,0.5)',
              cursor: 'pointer',
              fontWeight: active === i ? 600 : 400,
            }}
          >
            {t}
          </button>
        ))}
        <motion.div
          animate={{
            x: `${active * tabWidth}%`,
            scaleX: 1,
          }}
          initial={false}
          transition={transition}
          style={{
            position: 'absolute',
            bottom: -1,
            left: 0,
            height: 2,
            width: `${tabWidth}%`,
            background: '#3b82f6',
            originX: 0,
          }}
        />
      </div>
      <div style={{ padding: '12px 0', fontSize: 12, opacity: 0.7 }}>{TABS[active]} content</div>
    </div>
  );
}

/* 8. Stagger list (6 items, fade + slide up)                                   */

function DemoStaggerList({ replayKey }) {
  const transition = useDemoTransition('toggle');
  const yOffset = useDemoTransform(12, 20);
  const items = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'];
  return (
    <motion.div
      key={replayKey}
      initial="hidden"
      animate="visible"
      style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 240 }}
    >
      {items.map((it, i) => (
        <motion.div
          key={it}
          variants={{
            hidden: { opacity: 0, y: yOffset },
            visible: { opacity: 1, y: 0 },
          }}
          transition={
            transition.type === 'spring' ? { ...transition, delay: i * 0.06 } : transition
          }
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--border-subtle, #2a2a2a)',
            fontSize: 13,
          }}
        >
          {it}
        </motion.div>
      ))}
    </motion.div>
  );
}

/* 9. Side collapse (translateX, NOT width)                                     */

function DemoSideCollapse() {
  const transition = useDemoTransition('toggle');
  const xOffset = useDemoTransform(-170, -200);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div style={{ display: 'flex', gap: 8, height: 130, alignItems: 'stretch' }}>
      <motion.div
        animate={{ x: collapsed ? xOffset : 0, opacity: collapsed ? 0 : 1 }}
        transition={transition}
        style={{
          width: 170,
          flexShrink: 0,
          borderRadius: 8,
          background: '#475569',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 600,
        }}
      >
        sidebar
      </motion.div>
      <div
        style={{
          flex: 1,
          borderRadius: 8,
          background: 'rgba(255,255,255,0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 12, opacity: 0.7 }}>content (width fixed)</span>
        <button type="button" style={btnStyle} onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? 'expand' : 'collapse'} →
        </button>
      </div>
    </div>
  );
}

/* 10. Drag-settle (spring back to origin or snap into drop zone)              */

function DemoDragSettle() {
  const transition = useDemoTransition('drag');
  const containerRef = useRef(null);
  const zoneRef = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [snapped, setSnapped] = useState(false);

  const onDragEnd = useCallback(
    (_e, info) => {
      const container = containerRef.current.getBoundingClientRect();
      const zone = zoneRef.current.getBoundingClientRect();
      const { point } = info;
      const inZone =
        point.x >= zone.left &&
        point.x <= zone.right &&
        point.y >= zone.top &&
        point.y <= zone.bottom;
      if (inZone) {
        const targetX = zone.left + zone.width / 2 - (container.left + 90);
        const targetY = zone.top + zone.height / 2 - (container.top + 30);
        animate(x, targetX, transition);
        animate(y, targetY, transition);
        setSnapped(true);
      } else {
        animate(x, 0, transition);
        animate(y, 0, transition);
        setSnapped(false);
      }
    },
    [transition, x, y]
  );

  return (
    <div ref={containerRef} style={{ position: 'relative', width: 360, height: 160 }}>
      <div
        ref={zoneRef}
        style={{
          position: 'absolute',
          right: 8,
          top: 30,
          width: 120,
          height: 100,
          border: `2px dashed ${snapped ? '#10b981' : 'var(--border-subtle, #2a2a2a)'}`,
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          opacity: 0.7,
        }}
      >
        {snapped ? 'snapped ✓' : 'drop zone'}
      </div>
      <motion.div
        drag
        dragConstraints={containerRef}
        dragMomentum={false}
        onDragEnd={onDragEnd}
        style={{
          x,
          y,
          width: 90,
          height: 60,
          borderRadius: 10,
          background: snapped ? '#10b981' : '#f97316',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'grab',
          position: 'absolute',
          left: 16,
          top: 50,
        }}
      >
        drag me
      </motion.div>
    </div>
  );
}

/* 11. Generic cross-fade                                                       */

function DemoCrossfade({ replayKey }) {
  const transition = useDemoTransition('toggle');
  const [which, setWhich] = useState('A');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      <div
        style={{
          position: 'relative',
          width: 220,
          height: 90,
          overflow: 'hidden',
          borderRadius: 10,
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${which}-${replayKey}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            style={{
              ...placeholder,
              position: 'absolute',
              inset: 0,
              background: which === 'A' ? '#0ea5e9' : '#e2e8f0',
              color: which === 'A' ? '#fff' : '#0f172a',
            }}
          >
            block {which}
          </motion.div>
        </AnimatePresence>
      </div>
      <button
        type="button"
        style={btnStyle}
        onClick={() => setWhich((w) => (w === 'A' ? 'B' : 'A'))}
      >
        swap ({which})
      </button>
    </div>
  );
}

/* Public registry                                                              */

export const demos = [
  {
    title: 'View transition',
    description: 'Navigation between sibling views in pizarra/workspace.',
    config: (mode) => {
      const p = presetsForMode(mode);
      return `nav — ${p.nav.display}`;
    },
    render: ({ replayKey }) => <DemoViewTransition replayKey={replayKey} />,
  },
  {
    title: 'Window open',
    description: 'Browser/terminal panel appearing inside pizarra.',
    config: (mode) => {
      const p = presetsForMode(mode);
      return `open — ${p.open.display}`;
    },
    render: ({ replayKey }) => <DemoWindowOpen replayKey={replayKey} />,
  },
  {
    title: 'Window close',
    description: 'Same panel dismissing (scale-out + fade).',
    config: (mode) => {
      const p = presetsForMode(mode);
      return `open — ${p.open.display} (exit ≈ 75% enter)`;
    },
    render: ({ replayKey }) => <DemoWindowClose replayKey={replayKey} />,
  },
  {
    title: 'Auto-fit / resize settle',
    description: 'Panel autoajuste settling instead of snapping.',
    config: (mode) => {
      const p = presetsForMode(mode);
      return `settle — ${p.settle.display}`;
    },
    render: () => <DemoAutoFitSettle />,
  },
  {
    title: 'Workspace change',
    description: 'Cross-fade with direction between workspaces.',
    config: (mode) => {
      const p = presetsForMode(mode);
      return `nav — ${p.nav.display}`;
    },
    render: ({ replayKey }) => <DemoWorkspaceChange replayKey={replayKey} />,
  },
  {
    title: 'Modal / sheet',
    description: 'Sheet from bottom + scale-center modal, side by side.',
    config: (mode) => {
      const p = presetsForMode(mode);
      return `sheet — ${p.sheet.display} · open — ${p.open.display}`;
    },
    render: () => <DemoModalSheet />,
  },
  {
    title: 'Tab indicator',
    description: 'Underline slides with spring between tabs (not instant).',
    config: (mode) => {
      const p = presetsForMode(mode);
      return `toggle — ${p.toggle.display}`;
    },
    render: () => <DemoTabIndicator />,
  },
  {
    title: 'Stagger list',
    description: '6 items reveal in sequence (fade + slide up).',
    config: (mode) => {
      const p = presetsForMode(mode);
      return `toggle — ${p.toggle.display} (stagger 60ms)`;
    },
    render: ({ replayKey }) => <DemoStaggerList replayKey={replayKey} />,
  },
  {
    title: 'Side collapse',
    description: 'Panel collapses via translateX (NOT width). Correct vs sidebar anti-pattern.',
    config: (mode) => {
      const p = presetsForMode(mode);
      return `toggle — ${p.toggle.display}`;
    },
    render: () => <DemoSideCollapse />,
  },
  {
    title: 'Drag-settle',
    description: 'Drag card; release outside zone → spring back; release inside → snap.',
    config: (mode) => {
      const p = presetsForMode(mode);
      return `drag — ${p.drag.display} (dragMomentum=false)`;
    },
    render: () => <DemoDragSettle />,
  },
  {
    title: 'Generic cross-fade',
    description: 'Two content blocks swap with opacity cross-fade.',
    config: (mode) => {
      const p = presetsForMode(mode);
      return `toggle — ${p.toggle.display}`;
    },
    render: ({ replayKey }) => <DemoCrossfade replayKey={replayKey} />,
  },
];

export {
  DemoViewTransition,
  DemoWindowOpen,
  DemoWindowClose,
  DemoAutoFitSettle,
  DemoWorkspaceChange,
  DemoModalSheet,
  DemoTabIndicator,
  DemoStaggerList,
  DemoSideCollapse,
  DemoDragSettle,
  DemoCrossfade,
};

export default demos;
