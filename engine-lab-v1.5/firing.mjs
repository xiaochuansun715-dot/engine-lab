// One 720-degree model drives the audio event fields, 2D diagram and 3D motion.
// Packaged phase tables establish model timing, not measured combustion or valve lift.
export const CYCLE = Math.PI * 4;
export const wrapCycle = angle => ((angle % CYCLE) + CYCLE) % CYCLE;
const radians = degrees => degrees * Math.PI / 180;

export function createFiringSchedule(preset = {}) {
  const n = Math.max(1, Math.min(16, Math.round(Number(preset.cylinders) || 1)));
  const order = preset.firingOrder, angles = preset.firingAngles;
  const usable = Array.isArray(order) && Array.isArray(angles) && order.length === n && angles.length === n
    && new Set(order).size === n && order.every(cyl => Number.isInteger(cyl) && cyl >= 1 && cyl <= n)
    && new Set(angles).size === n && angles.every(deg => Number.isFinite(deg) && deg >= 0 && deg < 720)
    && angles.every((deg, i) => i === 0 || deg > angles[i - 1]);
  const packaged = usable && preset.firingSource === 'ipa-packaged-profile';
  const events = Array.from({length:n}, (_, i) => {
    const cylinder = usable ? order[i] : i + 1, deg = usable ? angles[i] : i * 720 / n;
    const source = usable ? preset.firing?.find(event => event.cyl === cylinder && event.deg === deg) : null;
    return {cylinder, deg, offset:radians(deg), bank:source?.bank ?? null, bankIndex:source?.bankIndex ?? null};
  });
  return {events, cylinders:n, packaged, source:packaged ? 'ipa-packaged-profile' : usable ? 'specified-timing' : 'illustrative',
    byCylinder:Object.fromEntries(events.map(event => [event.cylinder, event]))};
}

export function cylinderPhase(angle, cylinder, schedule) {
  const offset = schedule.byCylinder[cylinder]?.offset;
  if (!Number.isFinite(offset)) throw new RangeError('Cylinder is absent from this firing schedule');
  return wrapCycle(angle - offset);
}

export function strokeState(phase) {
  const cycle = wrapCycle(phase), stage = Math.min(3, Math.floor(cycle / Math.PI));
  return {phase:cycle, stage, intakeOpen:stage === 2, exhaustOpen:stage === 1};
}

// Axis positive toward the cylinder head. rodRatio is rod length / full stroke.
export function crankKinematics(phase, radius, rodRatio) {
  const pinAcross = radius * Math.sin(phase), pinAlong = radius * Math.cos(phase), rodLength = radius * 2 * rodRatio;
  return {pinAcross, pinAlong, pistonAlong:pinAlong + Math.sqrt(Math.max(0, rodLength * rodLength - pinAcross * pinAcross))};
}

export function cylinderBanks(preset, schedule) {
  const count = preset.layout === 'inline' ? 1 : preset.layout === 'w' ? 4 : 2;
  const labels = [...new Set(schedule.events.map(event => event.bank))].filter(Boolean).sort();
  // bankIndex is an audio/display lane in some source profiles. Only bank labels
  // with a complete, balanced layout can place cylinders in the procedural model.
  if (schedule.packaged && labels.length === count) {
    const banks = labels.map(label => schedule.events.filter(event => event.bank === label).map(event => event.cylinder).sort((a,b) => a-b));
    if (banks.every(bank => bank.length === schedule.cylinders / count)) return banks;
  }
  return Array.from({length:count}, (_, bank) => schedule.events.map(event => event.cylinder).sort((a,b) => a-b).filter((_,i) => i % count === bank));
}
