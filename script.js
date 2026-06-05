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
