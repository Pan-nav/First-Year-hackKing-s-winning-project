import { bus } from '../bus.js';

export function initHud() {
  const root = document.getElementById('hud');
  root.innerHTML = `<div class="top-hud"><div class="hud-stat"><small>SCORE</small><strong id="score">000000</strong></div><div class="rule-chip" id="rule-small">WAITING FOR COIN</div><div class="hud-stat combo-stat"><small>COMBO</small><strong id="combo">x1</strong></div><div class="hud-stat"><small>HEALTH</small><strong id="lives" aria-label="3 lives">🧠🧠🧠</strong></div><button class="hud-mute" id="mute-button" aria-label="Toggle audio" title="Mute (M)">♫</button></div><div class="timer-track"><div id="timer-fill"></div></div><div id="hand-calibration" class="hand-calibration" hidden aria-live="polite"><span class="calibration-title">CAMERA CALIBRATION</span><span class="calibration-guide">Stand back. Raise both hands to shoulder height, shoulder-width apart.</span><span class="calibration-dots"><span id="cal-dot-0" class="cal-dot">● LEFT</span><span id="cal-dot-1" class="cal-dot">● RIGHT</span></span><strong id="calibration-status">LOOK FOR TWO LASER DOTS</strong></div><div class="rule-announcement" id="rule-announcement" aria-live="polite"></div><div class="mascot mascot-0" id="brain-mascot" aria-hidden="true"><span>🧠</span><small>STAY SHARP!</small></div>`;
  const $ = id => document.getElementById(id);
  let roundLength = 20;
  let announceTimer;
  const calibration = $('hand-calibration');
  const wrists = new Map();
  let calibrationEnabled = false;
  let calibrated = false;
  // No new engine event required: the existing blade:point contract identifies hands 0 and 1.
  function updateCalibration() {
    if (!calibrationEnabled || calibrated) return;
    const now = performance.now();
    for (const id of [0, 1]) $('cal-dot-' + id).classList.toggle('detected', now - (wrists.get(id) ?? -Infinity) < 850);
    const active = [0, 1].filter(id => now - (wrists.get(id) ?? -Infinity) < 850).length;
    $('calibration-status').textContent = active === 2 ? 'READY TO SLICE! BOTH LASERS ONLINE' : active === 1 ? 'ONE LASER FOUND — RAISE YOUR OTHER HAND' : 'LOOK FOR TWO LASER DOTS';
    if (active === 2) {
      calibrated = true;
      calibration.classList.add('is-ready');
      setTimeout(() => { calibration.hidden = true; calibrationEnabled = false; }, 1700);
    }
  }
  bus.on('blade:point', ({ id }) => {
    if (id !== 0 && id !== 1) return;
    wrists.set(id, performance.now());
    updateCalibration();
  });
  bus.on('blade:end', ({ id }) => { wrists.delete(id); updateCalibration(); });
  setInterval(updateCalibration, 250);
  const rule = $('rule-small');
  const announcement = $('rule-announcement');
  bus.on('game:start', () => {
    wrists.clear(); calibrated = false; calibrationEnabled = true;
    calibration.hidden = false; calibration.classList.remove('is-ready');
    updateCalibration();
    $('score').textContent = '000000'; $('combo').textContent = 'x1';
    $('timer-fill').style.width = '100%'; $('lives').textContent = '🧠🧠🧠';
    $('brain-mascot').className = 'mascot mascot-0';
  });
  bus.on('round:start', ({ index = 0, total = 1, rule: ruleText = '', seconds = 20 }) => {
    roundLength = Math.max(1, Number(seconds) || 20);
    rule.textContent = `R${index + 1}/${total}: ${ruleText}`;
    announcement.textContent = ruleText;
    announcement.classList.add('visible');
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => announcement.classList.remove('visible'), 2000);
    $('timer-fill').style.width = '100%';
  });
  bus.on('timer:update', ({ secondsLeft = 0 }) => {
    const ratio = Math.max(0, Math.min(1, Number(secondsLeft) / roundLength));
    $('timer-fill').style.width = `${ratio * 100}%`;
    $('timer-fill').classList.toggle('timer-low', ratio <= 0.25);
    $('timer-fill').setAttribute('aria-label', `${Math.ceil(secondsLeft)} seconds left`);
  });
  bus.on('score:update', ({ score = 0, combo = 0 }) => {
    $('score').textContent = String(score).padStart(6, '0');
    $('combo').textContent = `x${Math.max(1, combo)}`;
    $('combo').classList.toggle('hot-combo', combo >= 3);
  });
  bus.on('lives:update', ({ lives = 3, max = 3 }) => {
    const maximum = Math.max(1, Math.min(8, Number(max) || 3));
    const remaining = Math.max(0, Math.min(maximum, Number(lives) || 0));
    $('lives').textContent = '🧠'.repeat(remaining) + '💀'.repeat(maximum - remaining);
    $('lives').setAttribute('aria-label', `${remaining} of ${maximum} lives`);
    const damage = Math.min(3, Math.max(0, maximum - remaining));
    $('brain-mascot').className = `mascot mascot-${damage}`;
    $('brain-mascot').querySelector('small').textContent = remaining ? ['STAY SHARP!', 'OW!', 'CRITICAL!', 'MELTING!'][damage] : 'GAME OVER';
  });
  bus.on('round:end', () => announcement.classList.remove('visible'));
  bus.on('game:over', () => { announcement.classList.remove('visible'); calibration.hidden = true; calibrationEnabled = false; });
}
