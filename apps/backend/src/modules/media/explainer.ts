export function explainerPlan(title: string, narration: string, direction = '') {
  const text = title + ' ' + direction;
  const content = text + ' ' + narration;
  const solar = /solar|sunlight|sun.?s energy|सौर|सूरज|सूर्य/i.test(content);
  const illustration = solar ? (/home|house|appliance|घर|उपकरण/i.test(title) ? 'home'
    : /solar cell|inside|electron|convert|कोशिका|इलेक्ट्रॉन|बदल/i.test(title) ? 'panel'
    : /sunlight|सूरज|सूर्य/i.test(title) ? 'sunlight'
    : /home|house|appliance|inverter|घर|इन्वर्टर|उपकरण/i.test(narration) ? 'home'
    : /electron|convert|direct current|current|इलेक्ट्रॉन|बदल|करंट/i.test(narration) ? 'panel' : 'sunlight') : undefined;
  const layout = /versus|\bvs\b|compar|difference|तुलना|अंतर/i.test(text) ? 'comparison'
    : /steps|process|how|stage|चरण|प्रक्रिया|कैसे/i.test(text) ? 'steps' : 'concept';
  const points = (narration.match(/[^.!?।]+[.!?।]?/gu) || []).map(value => value.trim()).filter(Boolean).slice(0, 3).map(value => value.length > 120 ? value.slice(0, 117) + '…' : value);
  return { type: 'remotion-explainer', properties: { text: title, layout, points: points.length ? points : [title], ...(illustration ? { illustration } : {}) } };
}
