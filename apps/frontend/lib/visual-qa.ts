import { sampleVisualMotion, type GenerativeVisualPlan } from '@ai-video-studio/shared-types';

export type VisualWarning = { code: 'clipping' | 'overlap' | 'timing'; elements: string[]; seconds: number; message: string };
type Point = { x: number; y: number };
const rotate = (p: Point, degrees: number): Point => {
  const radians = degrees * Math.PI / 180;
  return { x: p.x * Math.cos(radians) - p.y * Math.sin(radians), y: p.x * Math.sin(radians) + p.y * Math.cos(radians) };
};
const around = (p: Point, center: Point, scale: number, degrees: number): Point => {
  const r = rotate({ x: (p.x - center.x) * scale, y: (p.y - center.y) * scale }, degrees);
  return { x: r.x + center.x, y: r.y + center.y };
};

/** Advisory geometry checks, not pixel inspection. Paths and font metrics require human preview. */
export function auditVisualPlan(plan: GenerativeVisualPlan, duration: number, speed = 1): VisualWarning[] {
  const warnings = new Map<string, VisualWarning>();
  const add = (warning: VisualWarning) => {
    const key = warning.code + ':' + [...warning.elements].sort().join(':');
    if (!warnings.has(key)) warnings.set(key, warning);
  };
  const times = new Set(Array.from({ length: 41 }, (_, index) => duration * index / 40));
  const tracks = [plan.camera, ...(plan.groups || []).map(group => group.keyframes), ...plan.elements.map(element => element.keyframes)];
  for (const track of tracks) for (const frame of track || []) times.add(frame.timeMs / 1000 / speed);
  for (const item of plan.elements) {
    const start = item.start || 0, end = item.end ?? duration;
    if (start >= duration || end > duration || end <= start) add({code:'timing',elements:[item.id],seconds:start,message:`“${item.id}” has a visibility window outside this scene.`});
    times.add(start + Math.min(.5, (end - start) / 2));
    times.add(Math.min(end, duration) - .001);
    // Element keyframes use a timeline offset by the visibility start.
    for (const frame of item.keyframes || []) times.add(start + (frame.timeMs / 1000 - start) / speed);
  }
  for (const seconds of [...times].sort((a,b) => a-b)) {
    if (seconds < 0 || seconds >= duration) continue;
    const camera = sampleVisualMotion(plan.camera, seconds * speed * 1000);
    if (camera.opacity < 10) continue;
    const labels: { id: string; left: number; right: number; top: number; bottom: number }[] = [];
    for (const item of plan.elements) {
      const start = item.start || 0, end = item.end ?? duration;
      if (seconds < start || seconds >= end || item.kind === 'path') continue;
      const local = (seconds - start) * speed;
      const pose = sampleVisualMotion(item.keyframes, start * 1000 + local * 1000);
      const group = plan.groups?.find(group => group.id === item.groupId);
      const groupPose = sampleVisualMotion(group?.keyframes, seconds * speed * 1000);
      const enter = item.keyframes?.length ? 1 : Math.min(1, local / .45);
      if (enter * pose.opacity * groupPose.opacity / 10000 < .1) continue;
      const width = item.kind === 'text' ? Array.from(item.text || '').length * (item.fontSize || 28) * .62 : item.width || 0;
      const height = item.kind === 'text' ? (item.fontSize || 28) * 1.2 : item.height || 0;
      const flow = item.motion === 'flow' ? local % 1.5 / 1.5 : Math.min(1, local / Math.max(.1,end-start));
      const dx = (item.moveX || 0) * flow, dy = (item.moveY || 0) * flow + (item.motion === 'float' ? Math.sin(local * 2) * 6 : 0);
      const pulse = item.motion === 'pulse' ? 1 + Math.sin(local * 3) * .035 : 1;
      const corners = [{x:0,y:0},{x:width,y:0},{x:width,y:height},{x:0,y:height}].map(point => {
        // The renderer uses declared dimensions (zero for plain text) as the pivot.
        const center = {x:(item.width || 0)/2,y:(item.height || 0)/2};
        let p = around(point, center, pulse * pose.scalePercent / 100, 0);
        p = around(p, center, 1, (item.rotation || 0) + pose.rotation);
        p = {x:p.x+item.x+dx+pose.x,y:p.y+item.y+dy+pose.y};
        if (group) { p = around(p,{x:group.pivotX,y:group.pivotY},groupPose.scalePercent/100,groupPose.rotation); p={x:p.x+groupPose.x,y:p.y+groupPose.y}; }
        const c={x:plan.width/2,y:plan.height/2};
        return around({x:p.x-camera.x,y:p.y-camera.y},c,camera.scalePercent/100,camera.rotation);
      });
      const box={id:item.id,left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y))};
      if (box.left < -2 || box.top < -2 || box.right > plan.width+2 || box.bottom > plan.height+2) add({code:'clipping',elements:[item.id],seconds,message:`“${item.id}” may extend beyond the canvas.`});
      if (item.kind === 'text' && item.text?.trim()) labels.push(box);
    }
    for (let a=0;a<labels.length;a++) for(let b=a+1;b<labels.length;b++) {
      const one=labels[a],two=labels[b];
      if (Math.min(one.right,two.right)-Math.max(one.left,two.left)>2 && Math.min(one.bottom,two.bottom)-Math.max(one.top,two.top)>2) add({code:'overlap',elements:[one.id,two.id],seconds,message:`Labels “${one.id}” and “${two.id}” may overlap.`});
    }
  }
  return [...warnings.values()];
}
