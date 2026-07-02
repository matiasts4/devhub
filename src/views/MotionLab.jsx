'use client';

import { useState, useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import { MotionModeProvider } from '@/components/motion-lab/MotionModeContext';
import { MotionModeToggle } from '@/components/motion-lab/MotionModeToggle';
import { DemoCard } from '@/components/motion-lab/DemoCard';
import { demos } from '@/components/motion-lab/demos';
import { spring, amplified } from '@/components/ui/motion/motionPresets';
import { useMotionMode } from '@/components/ui/motion/MotionModeContext';

/**
 * MotionLab — /project/:projectId/motion-lab
 *
 * Showcase page for picking DevHub's unified motion pattern. Renders inside
 * WorkspaceLayout, so it does NOT use full-viewport styles. Each demo is an
 * isolated candidate the team can vote on. The local mode defaults to the
 * global motion preference but can be overridden without persisting.
 */
export default function MotionLab() {
  const globalMode = useMotionMode();
  const [motionMode, setMotionMode] = useState('normal');
  const [votes, setVotes] = useState({});

  useEffect(() => {
    setMotionMode(globalMode);
  }, [globalMode]);

  const handleVote = (index, type) => {
    setVotes((prev) => ({
      ...prev,
      [index]: prev[index] === type ? null : type,
    }));
  };

  const isReduced = motionMode === 'reduced';
  const activePresets = motionMode === 'amplified' ? amplified : spring;
  const presetNamespace = motionMode === 'amplified' ? 'amplified' : 'spring';

  const presets = [
    { key: 'toggle', label: `${presetNamespace}.toggle`, ...activePresets.toggle },
    { key: 'drag', label: `${presetNamespace}.drag`, ...activePresets.drag },
    { key: 'sheet', label: `${presetNamespace}.sheet`, ...activePresets.sheet },
    { key: 'open', label: `${presetNamespace}.open`, ...activePresets.open },
    { key: 'settle', label: `${presetNamespace}.settle`, ...activePresets.settle },
    { key: 'nav', label: `${presetNamespace}.nav`, ...activePresets.nav },
  ];

  return (
    <MotionConfig reducedMotion={isReduced ? 'always' : 'user'}>
      <MotionModeProvider value={motionMode}>
        <div style={{ height: '100%', overflowY: 'auto', position: 'relative', zIndex: 20 }}>
          <div
            style={{
              padding: '24px 20px 64px',
              maxWidth: 900,
              margin: '0 auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
            }}
          >
            <header style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>Motion Lab</h1>
              <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
                Showcase for picking the unified motion pattern. Vote
                <em>like</em> / <em>dislike</em> for each demo. Each card shows the
                spring/transition config used.
              </p>
            </header>

            <MotionModeToggle mode={motionMode} onModeChange={setMotionMode} />

            {/* Spring presets readout */}
            <section
              style={{
                border: '1px solid var(--border-subtle, #2a2a2a)',
                borderRadius: 12,
                padding: 14,
                background: 'var(--surface-1, #141414)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
                {motionMode === 'amplified' ? 'Amplified presets' : 'Spring presets'} (candidates)
              </h2>
              {presets.map((p) => (
                <div
                  key={p.key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    gap: 12,
                  }}
                >
                  <code style={{ opacity: 0.9 }}>{p.label}</code>
                  <span style={{ opacity: 0.6 }}>
                    stiffness {p.transition.stiffness} · damping {p.transition.damping} · mass{' '}
                    {p.transition.mass}
                  </span>
                </div>
              ))}
            </section>

            {/* Demos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {demos.map((demo, i) => (
                <DemoCard
                  key={demo.title}
                  index={i + 1}
                  title={demo.title}
                  description={demo.description}
                  config={demo.config(motionMode)}
                  render={demo.render}
                  vote={votes[i]}
                  onVote={(type) => handleVote(i, type)}
                  isReduced={isReduced}
                />
              ))}
            </div>
          </div>
        </div>
      </MotionModeProvider>
    </MotionConfig>
  );
}
