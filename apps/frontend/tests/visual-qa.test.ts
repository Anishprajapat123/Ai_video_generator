import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GenerativeVisualPlan, GenerativeVisualElement, VisualKeyframe } from '@ai-video-studio/shared-types';
import { auditVisualPlan } from '../lib/visual-qa';

const label = (id: string, x: number, y: number): GenerativeVisualElement => ({id,kind:'text',x,y,text:'Label',fontSize:20,fill:'#111111'});
const plan = (elements: GenerativeVisualElement[]): GenerativeVisualPlan => ({version:1,width:400,height:300,background:'#ffffff',accent:'#008800',textColor:'#111111',description:'Test artwork',elements});
const pose = (timeMs: number, x = 0, scalePercent = 100): VisualKeyframe => ({timeMs,x,y:0,scalePercent,rotation:0,opacity:100,easing:'linear'});

test('visual QA distinguishes separated labels, simultaneous overlaps and different visibility windows', () => {
  assert.deepEqual(auditVisualPlan(plan([label('a',20,80),label('b',200,80)]),10),[]);
  const overlap=auditVisualPlan(plan([label('a',20,80),label('b',30,80)]),10);
  assert.equal(overlap.filter(issue=>issue.code==='overlap').length,1);
  assert.deepEqual(auditVisualPlan(plan([{...label('a',20,80),end:4},{...label('b',20,80),start:4}]),10),[]);
});
test('visual QA samples object, group and camera transforms and respects animation speed', () => {
  const moving=plan([{...label('moving',20,80),keyframes:[pose(0),pose(9000,400)]}]);
  assert(auditVisualPlan(moving,10).some(issue=>issue.code==='clipping'));
  assert.equal(auditVisualPlan(moving,4,.5).length,0);
  const grouped=plan([{...label('grouped',20,80),groupId:'group'}]);
  grouped.groups=[{id:'group',pivotX:0,pivotY:0,keyframes:[pose(0,400)]}];
  assert(auditVisualPlan(grouped,10).some(issue=>issue.code==='clipping'));
  const camera=plan([label('camera',20,80)]);camera.camera=[pose(0,400)];
  assert(auditVisualPlan(camera,10).some(issue=>issue.code==='clipping'));
});
test('visual QA reports invalid windows and clipping while ignoring hidden objects and path bounds', () => {
  const artwork=plan([{...label('outside',390,80)}, {...label('hidden',900,80),keyframes:[{...pose(0),opacity:0}]}, {...label('late',10,80),start:12}, {id:'path',kind:'path',x:0,y:0,path:'M 0 0 L 900 900',fill:'none'}]);
  const warnings=auditVisualPlan(artwork,10);
  assert(warnings.some(issue=>issue.code==='clipping' && issue.elements[0]==='outside'));
  assert(warnings.some(issue=>issue.code==='timing' && issue.elements[0]==='late'));
  assert(!warnings.some(issue=>issue.elements.includes('hidden') || issue.elements.includes('path')));
  assert.deepEqual(artwork.elements[0],label('outside',390,80));
});
