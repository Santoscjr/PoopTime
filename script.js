/* ===========================================================
   PoopTime ⏱️💩 — lógica do trono
   =========================================================== */

'use strict';

/* ---------- Constantes ---------- */
const WEEKS_PER_MONTH = 4.345; // média real de semanas por mês (52,14 / 12)

// Recompensas em ordem crescente de preço (valores aproximados 2026)
const REWARDS = [
    { emoji: '☕', name: 'um cafezinho',          price: 5   },
    { emoji: '🧀', name: 'um pão de queijo',      price: 8   },
    { emoji: '🍗', name: 'uma coxinha',           price: 11  },
    { emoji: '🥟', name: 'um pastel',             price: 15  },
    { emoji: '🍫', name: 'uma barra de chocolate', price: 20 },
    { emoji: '🍺', name: 'uma gelada',            price: 26  },
    { emoji: '🍔', name: 'um X-burguer',          price: 32  },
    { emoji: '🍱', name: 'uma marmita',           price: 40  },
    { emoji: '🎬', name: 'um cinema com pipoca',  price: 55  },
    { emoji: '🍕', name: 'uma pizza inteira',     price: 75  },
    { emoji: '👕', name: 'uma camiseta nova',     price: 95  },
    { emoji: '🍣', name: 'um rodízio japonês',    price: 130 },
    { emoji: '👟', name: 'um tênis maneiro',      price: 230 },
    { emoji: '🎧', name: 'um fone top',           price: 500 },
    { emoji: '📱', name: 'um celular novo',       price: 1200 },
];

// Conquistas
const ACHIEVEMENTS = [
    { id: 'first',    icon: '🥇', name: 'Primeira Sentada', desc: 'Dê sua 1ª descarga',        test: s => s.sessions >= 1 },
    { id: 'serial',   icon: '💩', name: 'Produção em Série', desc: '10 idas ao trono',          test: s => s.sessions >= 10 },
    { id: 'marathon', icon: '⏱️', name: 'Maratonista',       desc: 'Uma sentada de 15+ min',    test: s => s.bestTime >= 900 },
    { id: 'gold',     icon: '💰', name: 'Minerador de Ouro', desc: 'R$ 50 faturados no total',  test: s => s.total >= 50 },
    { id: 'king',     icon: '👑', name: 'Rei do Trono',      desc: 'R$ 200 faturados no total', test: s => s.total >= 200 },
    { id: 'owl',      icon: '🌙', name: 'Coruja do Trono',   desc: 'Fature com adicional noturno', test: s => !!s.flags.night },
];

const STORAGE_KEY = 'pooptime.v2';
const CONFETTI_EMOJIS = ['💩', '🪙', '💰', '✨', '🧻'];

/* ---------- Estado ---------- */
let valuePerMinute = 0;
let bonusPct = 0;
let nightActive = false;

let running = false;
let startTs = 0;
let elapsedBefore = 0;       // ms acumulados antes da pausa atual
let tickTimer = null;
let sessionMaxRewardIdx = -1;

let muted = false;

let stats = {
    total: 0, sessions: 0, totalTime: 0,
    record: 0, bestTime: 0,
    flags: { night: false },
    unlocked: [],
};

/* ---------- Atalhos ---------- */
const $ = id => document.getElementById(id);
const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const BRL = n => fmtBRL.format(isFinite(n) ? n : 0);

const els = {
    form: $('data-form'), salary: $('salary'), hours: $('hours'), error: $('form-error'),
    rateMin: $('rate-min'), rateExtra: $('rate-extra'),
    toggleBonuses: $('toggle-bonuses'), bonusContent: $('bonus-content'),
    mascot: $('mascot'), timer: $('timer-display'), accumulated: $('accumulated-value'),
    rewardCurrent: $('reward-current'), rewardFill: $('reward-fill'), rewardNext: $('reward-next'),
    startBtn: $('start-btn'), startLabel: $('start-label'), flushBtn: $('flush-btn'), throneHint: $('throne-hint'),
    achGrid: $('ach-grid'),
    statTotal: $('stat-total'), statSessions: $('stat-sessions'), statTime: $('stat-time'), statRecord: $('stat-record'),
    soundToggle: $('sound-toggle'), wipe: $('wipe-data'),
    confettiRoot: $('confetti-root'), toast: $('toast'),
};
const startIcon = els.startBtn.querySelector('span[aria-hidden]');

/* ===========================================================
   Persistência
   =========================================================== */
function save() {
    const bonuses = [...document.querySelectorAll('input[data-bonus]:checked')].map(i => i.dataset.bonus);
    const data = {
        stats, muted, bonuses,
        salary: els.salary.value,
        hours: els.hours.value,
        session: { elapsed: currentElapsedMs() }, // sempre salvo como pausado
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* ignora */ }
}

function load() {
    let data = {};
    try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { data = {}; }

    if (data.stats) stats = { ...stats, ...data.stats, flags: { ...stats.flags, ...(data.stats.flags || {}) } };
    muted = !!data.muted;
    if (data.salary) els.salary.value = data.salary;
    if (data.hours) els.hours.value = data.hours;
    if (Array.isArray(data.bonuses)) {
        data.bonuses.forEach(key => {
            const el = document.querySelector(`input[data-bonus="${key}"]`);
            if (el) el.checked = true;
        });
    }
    if (data.session && data.session.elapsed > 0) elapsedBefore = data.session.elapsed;
}

/* ===========================================================
   Cálculo
   =========================================================== */
function parseBRNumber(str) {
    if (!str) return NaN;
    str = String(str).trim().replace(/[^\d.,]/g, '');
    if (str.includes(',')) {
        str = str.replace(/\./g, '').replace(',', '.');     // 3.000,00 -> 3000.00
    } else if ((str.match(/\./g) || []).length > 1) {
        str = str.replace(/\./g, '');                        // 1.000.000 -> 1000000
    }
    return parseFloat(str);
}

function recomputeBonuses() {
    let sumRates = 0;
    nightActive = false;
    document.querySelectorAll('input[data-bonus]:checked').forEach(i => {
        sumRates += parseFloat(i.dataset.rate) || 0;
        if (i.dataset.bonus === 'night') nightActive = true;
    });
    bonusPct = Math.round(sumRates * 100);
    return 1 + sumRates;
}

function updateRate() {
    const salary = parseBRNumber(els.salary.value);
    const hours = parseFloat(els.hours.value);
    const multiplier = recomputeBonuses();

    if (salary > 0 && hours > 0) {
        const base = salary / (hours * WEEKS_PER_MONTH * 60);
        valuePerMinute = base * multiplier;
        const perHour = valuePerMinute * 60;
        flashPulse(els.rateMin);
        els.rateMin.textContent = BRL(valuePerMinute);
        els.rateExtra.textContent = bonusPct > 0
            ? `≈ ${BRL(perHour)}/hora • +${bonusPct}% de adicionais 🔥`
            : `≈ ${BRL(perHour)}/hora trabalhada`;
        unlockThrone(true);
    } else {
        valuePerMinute = 0;
        els.rateMin.textContent = BRL(0);
        els.rateExtra.textContent = 'preencha seus dados para começar';
        unlockThrone(false);
    }
}

function unlockThrone(enabled) {
    const hasSession = elapsedBefore > 0;
    els.startBtn.disabled = !enabled;
    els.flushBtn.disabled = !(enabled && (hasSession || running));
    els.throneHint.classList.toggle('hidden', enabled);
}

/* ===========================================================
   Cronômetro
   =========================================================== */
function currentElapsedMs() {
    return elapsedBefore + (running ? Date.now() - startTs : 0);
}

function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

function render() {
    const ms = currentElapsedMs();
    const seconds = ms / 1000;
    const value = (ms / 60000) * valuePerMinute;
    els.timer.textContent = formatTime(seconds);
    els.accumulated.textContent = BRL(value);
    updateReward(value);
}

function startTimer() {
    if (running || valuePerMinute <= 0) return;
    ensureAudio();
    running = true;
    startTs = Date.now();
    tickTimer = setInterval(render, 100);
    els.mascot.classList.add('is-running');
    els.startLabel.textContent = 'Pausar';
    if (startIcon) startIcon.textContent = '⏸️';
    els.startBtn.classList.add('is-running');
    els.flushBtn.disabled = false;
}

function pauseTimer() {
    if (!running) return;
    elapsedBefore = currentElapsedMs();
    running = false;
    clearInterval(tickTimer);
    els.mascot.classList.remove('is-running');
    els.startLabel.textContent = 'Continuar';
    if (startIcon) startIcon.textContent = '▶️';
    els.startBtn.classList.remove('is-running');
    save();
}

function toggleTimer() {
    running ? pauseTimer() : startTimer();
}

function resetSession() {
    clearInterval(tickTimer);
    running = false;
    elapsedBefore = 0;
    startTs = 0;
    sessionMaxRewardIdx = -1;
    els.mascot.classList.remove('is-running');
    els.startLabel.textContent = 'Sentar';
    if (startIcon) startIcon.textContent = '▶️';
    els.startBtn.classList.remove('is-running');
    els.timer.textContent = '00:00:00';
    els.accumulated.textContent = BRL(0);
    updateReward(0);
    unlockThrone(valuePerMinute > 0);
}

function flush() {
    const ms = currentElapsedMs();
    if (ms < 1000) { toast('Senta um pouquinho primeiro 😅'); return; }

    ensureAudio();
    const seconds = Math.floor(ms / 1000);
    const value = (ms / 60000) * valuePerMinute;

    // Atualiza estatísticas
    stats.total += value;
    stats.sessions += 1;
    stats.totalTime += seconds;
    stats.record = Math.max(stats.record, value);
    stats.bestTime = Math.max(stats.bestTime, seconds);
    if (nightActive) stats.flags.night = true;

    const isRecord = value >= stats.record && value > 0;

    // Animação de descarga 🚽
    clearInterval(tickTimer);
    running = false;
    els.mascot.classList.remove('is-running');
    els.mascot.classList.add('is-flushing');
    flushSound();
    confettiBurst(34);

    toast(isRecord ? `🏆 Novo recorde: ${BRL(value)}!` : `🚽 Faturou ${BRL(value)} nessa sentada!`);

    setTimeout(() => {
        els.mascot.classList.remove('is-flushing');
        resetSession();
        renderStats(true);
        checkAchievements();
        save();
    }, 900);
}

/* ===========================================================
   Recompensas / progresso
   =========================================================== */
function updateReward(value) {
    let curIdx = -1;
    for (let i = 0; i < REWARDS.length; i++) {
        if (value >= REWARDS[i].price) curIdx = i; else break;
    }
    const cur = curIdx >= 0 ? REWARDS[curIdx] : null;
    const next = REWARDS[curIdx + 1] || null;

    els.rewardCurrent.innerHTML = cur
        ? `Isso já dá pra <span class="big">${cur.emoji} ${cur.name}</span>!`
        : 'Ainda nem deu um cafezinho ☕… continua sentado!';

    if (next) {
        const base = cur ? cur.price : 0;
        const pct = Math.max(0, Math.min(100, ((value - base) / (next.price - base)) * 100));
        els.rewardFill.style.width = pct + '%';
        els.rewardNext.textContent = `Faltam ${BRL(Math.max(0, next.price - value))} pra ${next.emoji} ${next.name}`;
    } else {
        els.rewardFill.style.width = '100%';
        els.rewardNext.textContent = 'Você zerou o cardápio. Lenda do trono! 🏆';
    }

    // Comemora quando cruza um novo nível durante a contagem
    if (curIdx > sessionMaxRewardIdx) {
        const isFirstPaint = sessionMaxRewardIdx === -2;
        sessionMaxRewardIdx = curIdx;
        if (running && curIdx >= 0 && !isFirstPaint) {
            confettiBurst(16);
            coin();
            mascotCelebrate();
            toast(`🎉 Liberou ${cur.emoji} ${cur.name}!`);
        }
    }
}

/* ===========================================================
   Estatísticas + Conquistas
   =========================================================== */
function renderStats(pulse) {
    setStat(els.statTotal, BRL(stats.total), pulse);
    setStat(els.statSessions, String(stats.sessions), pulse);
    setStat(els.statTime, formatTime(stats.totalTime), pulse);
    setStat(els.statRecord, BRL(stats.record), pulse);
}
function setStat(el, text, pulse) {
    el.textContent = text;
    if (pulse) flashPulse(el);
}
function flashPulse(el) {
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
}

function buildAchievements() {
    els.achGrid.innerHTML = '';
    ACHIEVEMENTS.forEach(a => {
        const div = document.createElement('div');
        div.className = 'ach';
        div.dataset.id = a.id;
        div.innerHTML =
            `<span class="ach__icon">${a.icon}</span>` +
            `<span class="ach__name">${a.name}</span>` +
            `<span class="ach__desc">${a.desc}</span>`;
        els.achGrid.appendChild(div);
    });
    paintAchievements();
}
function paintAchievements() {
    ACHIEVEMENTS.forEach(a => {
        const el = els.achGrid.querySelector(`[data-id="${a.id}"]`);
        if (el) el.classList.toggle('unlocked', stats.unlocked.includes(a.id));
    });
}
function checkAchievements() {
    let newly = false;
    ACHIEVEMENTS.forEach(a => {
        if (!stats.unlocked.includes(a.id) && a.test(stats)) {
            stats.unlocked.push(a.id);
            newly = true;
            toast(`🏅 Conquista: ${a.name}!`);
            confettiBurst(20, [a.icon, '✨', '🎉']);
            coin();
        }
    });
    if (newly) paintAchievements();
}

/* ===========================================================
   Efeitos: confete, som, toast
   =========================================================== */
function confettiBurst(count = 24, emojis = CONFETTI_EMOJIS) {
    for (let i = 0; i < count; i++) {
        const s = document.createElement('span');
        s.className = 'confetti';
        s.textContent = emojis[(Math.random() * emojis.length) | 0];
        s.style.left = Math.random() * 100 + 'vw';
        const dur = 2 + Math.random() * 1.8;
        s.style.animationDuration = dur + 's';
        s.style.fontSize = (1.1 + Math.random() * 1.6) + 'rem';
        els.confettiRoot.appendChild(s);
        setTimeout(() => s.remove(), dur * 1000 + 100);
    }
}

let audioCtx = null;
function ensureAudio() {
    if (muted) return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { audioCtx = null; }
}
function coin() {
    if (muted || !audioCtx) return;
    const t0 = audioCtx.currentTime;
    [[988, t0], [1319, t0 + 0.08]].forEach(([freq, start]) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'square'; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.16, start + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(start); o.stop(start + 0.2);
    });
}
function flushSound() {
    if (muted || !audioCtx) return;
    const dur = 0.7;
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.4);
    const src = audioCtx.createBufferSource(); src.buffer = buffer;
    const filt = audioCtx.createBiquadFilter(); filt.type = 'lowpass';
    const t0 = audioCtx.currentTime;
    filt.frequency.setValueAtTime(1400, t0);
    filt.frequency.exponentialRampToValueAtTime(280, t0 + dur);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.28, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(audioCtx.destination);
    src.start();
}

let toastTimer = null;
function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2800);
}

function mascotCelebrate() {
    els.mascot.classList.remove('celebrate');
    void els.mascot.offsetWidth;
    els.mascot.classList.add('celebrate');
    setTimeout(() => els.mascot.classList.remove('celebrate'), 650);
}

/* ===========================================================
   Eventos
   =========================================================== */
els.form.addEventListener('submit', e => {
    e.preventDefault();
    const salary = parseBRNumber(els.salary.value);
    const hours = parseFloat(els.hours.value);

    if (!(salary > 0) || !(hours > 0)) {
        els.error.hidden = false;
        els.error.textContent = '🤨 Coloca um salário e as horas certinhas aí!';
        flashPulse(els.error);
        return;
    }
    els.error.hidden = true;
    formatSalaryField();
    updateRate();
    confettiBurst(12);
    toast('Trono liberado! Senta lá 🚽');
    $('timer-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
    save();
});

// Atualização ao vivo enquanto digita
['input', 'change'].forEach(ev => {
    els.salary.addEventListener(ev, () => { els.error.hidden = true; updateRate(); save(); });
    els.hours.addEventListener(ev, () => { els.error.hidden = true; updateRate(); save(); });
});
els.salary.addEventListener('blur', formatSalaryField);

function formatSalaryField() {
    const n = parseBRNumber(els.salary.value);
    if (n > 0) els.salary.value = n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Adicionais (exclusividade por grupo, lógica genérica)
document.querySelectorAll('input[data-bonus]').forEach(input => {
    input.addEventListener('change', e => {
        const el = e.target;
        if (el.checked && el.dataset.group) {
            document.querySelectorAll(`input[data-group="${el.dataset.group}"]`).forEach(o => {
                if (o !== el) o.checked = false;
            });
        }
        updateRate();
        save();
    });
});

// Mostrar/ocultar adicionais
els.toggleBonuses.addEventListener('click', () => {
    const open = els.bonusContent.hasAttribute('hidden');
    if (open) els.bonusContent.removeAttribute('hidden');
    else els.bonusContent.setAttribute('hidden', '');
    els.toggleBonuses.textContent = open ? 'Ocultar' : 'Mostrar';
    els.toggleBonuses.setAttribute('aria-expanded', String(open));
});

// Trono
els.startBtn.addEventListener('click', toggleTimer);
els.flushBtn.addEventListener('click', flush);

// Som
els.soundToggle.addEventListener('click', () => {
    muted = !muted;
    els.soundToggle.textContent = muted ? '🔇' : '🔊';
    els.soundToggle.classList.toggle('is-muted', muted);
    if (!muted) { ensureAudio(); coin(); }
    save();
});

// Zerar tudo
els.wipe.addEventListener('click', () => {
    if (!confirm('Isso apaga TODAS as suas estatísticas e conquistas. Dar descarga geral? 🧻')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignora */ }
    stats = { total: 0, sessions: 0, totalTime: 0, record: 0, bestTime: 0, flags: { night: false }, unlocked: [] };
    resetSession();
    renderStats(true);
    paintAchievements();
    confettiBurst(20, ['🧻']);
    toast('Tudo limpinho! ✨');
});

// Salva ao sair
window.addEventListener('beforeunload', save);

/* ===========================================================
   Inicialização
   =========================================================== */
function init() {
    load();
    muted = !!muted;
    els.soundToggle.textContent = muted ? '🔇' : '🔊';
    els.soundToggle.classList.toggle('is-muted', muted);

    buildAchievements();
    renderStats(false);
    updateRate();

    // Restaura sessão pausada sem disparar confete
    if (elapsedBefore > 0) {
        sessionMaxRewardIdx = -2;   // sentinela: suprime confete na 1ª pintura
        render();                   // updateReward ajusta sessionMaxRewardIdx p/ o nível atual
        els.startLabel.textContent = 'Continuar';
    } else {
        updateReward(0);
    }
    unlockThrone(valuePerMinute > 0);
}

init();
