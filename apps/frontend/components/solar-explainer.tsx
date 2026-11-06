'use client';

import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export function SolarExplainer({ title, stage, background = '#f4f3ed', accent = '#4c8f6c', textColor = '#17362f', animationSpeed = 1, diagramLabels }: { title: string; stage: 'sunlight' | 'panel' | 'home'; background?: string; accent?: string; textColor?: string; animationSpeed?: number; diagramLabels?: string[] }) {
  const frame = useCurrentFrame() * animationSpeed;
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const scale = Math.min(width, height) / 1080;
  const portrait = height > width;
  const hindi = /[\u0900-\u097f]/u.test(title);
  const enter = spring({ frame, fps, config: { damping: 22 } });
  const progress = frame / Math.max(1, durationInFrames - 1);
  const panelX = portrait ? 125 : 360, panelY = portrait ? 250 : 145;
  const houseX = portrait ? 355 : 900, houseY = portrait ? 530 : 220;
  const sunX = 140, sunY = portrait ? 80 : 110;
  const panelCenterX = panelX + 145, panelCenterY = panelY + 80;
  const cable = portrait ? `M${panelX + 290},${panelY + 125} H560 V${houseY + 50} H${houseX + 130}` : `M${panelX + 290},${panelY + 110} H${houseX}`;
  const labels = hindi ? { light: 'सूरज की रोशनी', panel: 'सौर पैनल', home: 'घर की बिजली', heading: 'ऊर्जा को समझें' } : { light: 'Sunlight', panel: 'Solar cells', home: 'Power for home', heading: 'ENERGY, EXPLAINED' };
  if (diagramLabels?.length === 3) [labels.light, labels.panel, labels.home] = diagramLabels;
  const step = stage === 'sunlight' ? 1 : stage === 'panel' ? 2 : 3;
  return <AbsoluteFill style={{ background, color: textColor, fontFamily: 'Arial, sans-serif', padding: 64 * scale, paddingBottom: 180 * scale, overflow: 'hidden' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20 * scale, color: '#64766b', letterSpacing: '.14em' }}><span>{labels.heading}</span><span>0{step} / 03</span></div>
    <h2 style={{ margin: `${26 * scale}px 0 0`, fontSize: (portrait ? 70 : 78) * scale, lineHeight: 1.12, letterSpacing: '-.035em', opacity: enter, transform: `translateY(${(1 - enter) * 20 * scale}px)` }}>{title}</h2>
    <svg viewBox={portrait ? '0 0 650 740' : '0 0 1100 410'} style={{ width: '100%', flex: 1, minHeight: 0, overflow: 'visible' }} aria-label={hindi ? 'रोशनी से पैनल और घर तक ऊर्जा का प्रवाह' : 'Energy moves from sunlight through solar cells to a home'}>
      <defs>
        <linearGradient id="solar-panel" x2="1" y2="1"><stop stopColor="#23485c" /><stop offset="1" stopColor="#142d41" /></linearGradient>
        <radialGradient id="solar-glow"><stop stopColor="#ffd36a" stopOpacity=".55" /><stop offset="1" stopColor="#ffd36a" stopOpacity="0" /></radialGradient>
        <filter id="solar-shadow"><feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#234b3b" floodOpacity=".13" /></filter>
      </defs>
      <circle cx={sunX} cy={sunY} r={105 + Math.sin(frame / fps * 1.5) * 6} fill="url(#solar-glow)" />
      <g transform={`translate(${sunX},${sunY}) rotate(${frame / fps * 4})`}>
        {Array.from({ length: 12 }, (_, index) => <line key={index} x1={Math.cos(index * Math.PI / 6) * 62} y1={Math.sin(index * Math.PI / 6) * 62} x2={Math.cos(index * Math.PI / 6) * 80} y2={Math.sin(index * Math.PI / 6) * 80} stroke="#d99b2f" strokeWidth="4" strokeLinecap="round" />)}
        <circle r="45" fill="#f2bc50" /><circle cx="-12" cy="-12" r="23" fill="#ffdc83" opacity=".55" />
      </g>
      <text x={sunX} y={sunY + 116} textAnchor="middle" fill="#77613a" fontSize="25" fontWeight="600">{labels.light}</text>
      {Array.from({ length: 7 }, (_, index) => {
        const t = (frame / (fps * 2.5) + index / 7) % 1;
        return <circle key={index} cx={sunX + 55 + (panelCenterX - sunX - 55) * t} cy={sunY + 10 + (panelCenterY - sunY - 10) * t} r={4 + index % 2} fill="#e9ae3f" opacity={Math.sin(t * Math.PI) * .85} />;
      })}
      <path d={cable} fill="none" stroke="#cbd7c6" strokeWidth="13" strokeLinecap="round" />
      <path d={cable} fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round" strokeDasharray="12 28" strokeDashoffset={-frame * 2.6} />
      <g transform={`translate(${portrait ? 510 : 735},${portrait ? 450 : 220})`}>
        <rect width="100" height="70" rx="12" fill={stage === 'home' ? '#426f5b' : '#657d75'} stroke="#a6b4a8" strokeWidth="3" />
        <text x="50" y="41" textAnchor="middle" fill="#fff" fontSize="21" fontWeight="600">DC → AC</text>
        <text x="50" y="102" textAnchor="middle" fill="#53695c" fontSize="20">{hindi ? 'इन्वर्टर' : 'Inverter'}</text>
      </g>
      <g transform={`translate(${panelX},${panelY})`} filter="url(#solar-shadow)">
        <path d="M50 177 L35 210 M240 177 L255 210" stroke="#7b8b89" strokeWidth="9" strokeLinecap="round" />
        <rect width="290" height="177" rx="13" fill="url(#solar-panel)" stroke="#91a5af" strokeWidth="6" />
        {Array.from({ length: 18 }, (_, index) => {
          const active = stage === 'panel' && (Math.floor(frame / 8) + index) % 6 < 2;
          return <rect key={index} x={12 + index % 6 * 45} y={12 + Math.floor(index / 6) * 51} width="40" height="45" rx="3" fill={active ? '#75bdbe' : '#315b76'} stroke="#86a4b5" strokeWidth="1" />;
        })}
        <path d="M14 14 L125 14 L14 156 Z" fill="#cce4ed" opacity=".09" />
      </g>
      <text x={panelCenterX} y={panelY + 248} textAnchor="middle" fill="#334d57" fontSize="25" fontWeight="600">{labels.panel}</text>
      <g transform={`translate(${houseX},${houseY})`} filter="url(#solar-shadow)">
        <path d="M-2 0 L70 -60 L142 0" fill="#71917c" stroke="#426650" strokeWidth="5" strokeLinejoin="round" />
        <rect x="10" y="0" width="120" height="105" rx="4" fill="#e4e8d8" stroke="#8fa18c" strokeWidth="3" />
        <rect x="58" y="50" width="27" height="55" rx="3" fill="#829c88" />
        {[29, 91].map(x => <rect key={x} x={x} y="23" width="25" height="27" rx="3" fill={stage === 'home' ? '#f6c95f' : '#b5cbd0'} />)}
      </g>
      <text x={houseX + 70} y={houseY + 150} textAnchor="middle" fill="#426650" fontSize="25" fontWeight="600">{labels.home}</text>
    </svg>
    <div style={{ position: 'absolute', bottom: '3%', left: '6%', right: '6%', height: 5 * scale, background: '#dce2d5', borderRadius: 10 }}><div style={{ height: '100%', width: `${progress * 100}%`, background: accent, borderRadius: 10 }} /></div>
  </AbsoluteFill>;
}
