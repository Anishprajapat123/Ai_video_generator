import type { GenerativeVisualPlan } from '@ai-video-studio/shared-types';
export const visualPlanFixture: GenerativeVisualPlan = {
  version: 1, width: 1600, height: 900, background: '#eef6ff', accent: '#2266cc', textColor: '#142840', description: 'A custom water cycle illustration with moving raindrops.',
  elements: [
    { id: 'cloud', kind: 'ellipse', x: 300, y: 200, width: 300, height: 120, fill: '#b0cddd', motion: 'float' },
    { id: 'mountain', kind: 'path', x: 700, y: 300, path: 'M0 350 L200 0 L400 350 Z', fill: '#739f80' },
    { id: 'water', kind: 'path', x: 180, y: 650, path: 'M0 0 Q300 -50 600 0 T1200 0', fill: 'none', stroke: '#2266cc', strokeWidth: 8, motion: 'draw' },
    { id: 'rain', kind: 'path', x: 430, y: 350, path: 'M0 0 L0 30', fill: 'none', stroke: '#2266cc', strokeWidth: 8, motion: 'flow', moveY: 200 },
    { id: 'label', kind: 'text', x: 300, y: 500, fill: '#142840', text: 'Rainfall', fontSize: 32 },
    { id: 'river-label', kind: 'text', x: 1000, y: 560, fill: '#142840', text: 'River', fontSize: 32 },
  ],
};
