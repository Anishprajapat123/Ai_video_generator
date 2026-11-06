/** Declarative vector artwork. It contains data only, never executable SVG or JavaScript. */
export type VisualEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
/** Milliseconds and integer percentages keep generated timelines compact and precise. */
export interface VisualKeyframe {
  timeMs: number; x: number; y: number; scalePercent: number;
  rotation: number; opacity: number; easing: VisualEasing;
}
export interface VisualGroup {
  id: string; pivotX: number; pivotY: number; keyframes: VisualKeyframe[];
}
export interface GenerativeVisualElement {
  groupId?: string; keyframes?: VisualKeyframe[];
  id: string;
  kind: 'rect' | 'ellipse' | 'path' | 'text';
  x: number; y: number;
  width?: number; height?: number;
  fill: string; stroke?: string; strokeWidth?: number;
  path?: string; text?: string; fontSize?: number; rotation?: number;
  start?: number; end?: number;
  motion?: 'still' | 'draw' | 'float' | 'pulse' | 'flow';
  moveX?: number; moveY?: number;
}
export interface GenerativeVisualPlan {
  groups?: VisualGroup[]; camera?: VisualKeyframe[];
  version: 1;
  width: number; height: number;
  background: string; accent: string; textColor: string;
  description: string;
  elements: GenerativeVisualElement[];
}
