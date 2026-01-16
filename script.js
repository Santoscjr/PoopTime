
// Variáveis globais
let valuePerMinute = 0;
let timerInterval = null;
let startTime = null;
let accumulatedValue = 0;

// Variáveis para bônus
let bonuses = {
    overtime50: false,
    overtime100: false,
    danger: false,
    unhealthyMax: false,
    unhealthyMed: false,
    unhealthyMin: false,
    night: false
};

// Elementos do DOM
const form = document.getElementById('data-form');
const salaryInput = document.getElementById('salary');
const hoursInput = document.getElementById('hours');
const valueDisplay = document.getElementById('value-per-minute');
const timerDisplay = document.getElementById('timer-display');

const accumulatedDisplay = document.getElementById('accumulated-value');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const resetBtn = document.getElementById('reset-btn');

// Elementos dos botões de bônus
const toggleBonusesBtn = document.getElementById('toggle-bonuses');
const bonusContent = document.getElementById('bonus-content');
const overtime50Checkbox = document.getElementById('overtime-50-checkbox');
const overtime100Checkbox = document.getElementById('overtime-100-checkbox');
const dangerCheckbox = document.getElementById('danger-checkbox');
const unhealthyMaxCheckbox = document.getElementById('unhealthy-max-checkbox');
const unhealthyMedCheckbox = document.getElementById('unhealthy-med-checkbox');
const unhealthyMinCheckbox = document.getElementById('unhealthy-min-checkbox');
const nightCheckbox = document.getElementById('night-checkbox');

// Função para calcular o valor por minuto
function calculateValuePerMinute(salary, hours) {
    // Salário mensal dividido por (horas semanais * 4 semanas) dividido por 60 minutos
    return (salary / (hours * 4)) / 60;
}

// Função para formatar tempo em HH:MM:SS
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Função para calcular os bônus
function calculateBonuses(baseValue) {
    let totalBonus = 0;

    if (bonuses.overtime50) totalBonus += baseValue * 0.5;
    if (bonuses.overtime100) totalBonus += baseValue * 1.0;
    if (bonuses.danger) totalBonus += baseValue * 0.3;
    if (bonuses.unhealthyMax) totalBonus += baseValue * 0.4;
    if (bonuses.unhealthyMed) totalBonus += baseValue * 0.2;
    if (bonuses.unhealthyMin) totalBonus += baseValue * 0.1;
    if (bonuses.night) totalBonus += baseValue * 0.2;

    return totalBonus;
}

// Função para atualizar o valor por minuto com bônus
function updateValuePerMinute() {
    const salary = parseFloat(salaryInput.value.replace(/,/g, '.'));
    const hours = parseFloat(hoursInput.value);

    if (salary > 0 && hours > 0) {
        const baseValue = calculateValuePerMinute(salary, hours);
        const bonusValue = calculateBonuses(baseValue);
        valuePerMinute = baseValue + bonusValue;
        valueDisplay.textContent = `Valor por minuto: R$ ${valuePerMinute.toFixed(2)}`;
    }
}

// Função para alternar bônus
function toggleBonus(bonusKey) {
    bonuses[bonusKey] = !bonuses[bonusKey];
    updateValuePerMinute();
}

// Função para atualizar o display do timer e valor acumulado
function updateTimer() {
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - startTime) / 1000);
    const elapsedMinutes = elapsedSeconds / 60;
    const elapsedValue = elapsedMinutes * valuePerMinute;

    timerDisplay.textContent = formatTime(elapsedSeconds);
    accumulatedDisplay.textContent = `Valor acumulado: R$ ${elapsedValue.toFixed(2)}`;
}

// Event listener para o formulário
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const salary = parseFloat(salaryInput.value.replace(/,/g, '.'));
    const hours = parseFloat(hoursInput.value);

    if (salary > 0 && hours > 0) {
        updateValuePerMinute();
        startBtn.disabled = false;
    } else {
        alert('Por favor, insira valores válidos.');
    }
});

// Event listener para o botão Iniciar
startBtn.addEventListener('click', () => {
    if (valuePerMinute > 0) {
        startTime = Date.now();
        timerInterval = setInterval(updateTimer, 1000);
        startBtn.disabled = true;
        stopBtn.disabled = false;
    }
});

// Event listener para o botão Parar
stopBtn.addEventListener('click', () => {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
});

// Event listener para o botão Reset
resetBtn.addEventListener('click', () => {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
    timerDisplay.textContent = '00:00:00';
    accumulatedDisplay.textContent = 'Valor acumulado: R$ 0.00';
});

// Event listener para o botão de toggle de bônus
toggleBonusesBtn.addEventListener('click', () => {
    bonusContent.classList.toggle('hidden');
    toggleBonusesBtn.textContent = bonusContent.classList.contains('hidden') ? 'Mostrar' : 'Ocultar';
});

// Event listeners para os toggles de bônus
overtime50Checkbox.addEventListener('change', () => {
    toggleBonus('overtime50');
    // Desativar overtime100 se overtime50 for ativado
    if (bonuses.overtime50) {
        bonuses.overtime100 = false;
        overtime100Checkbox.checked = false;
    }
});
overtime100Checkbox.addEventListener('change', () => {
    toggleBonus('overtime100');
    // Desativar overtime50 se overtime100 for ativado
    if (bonuses.overtime100) {
        bonuses.overtime50 = false;
        overtime50Checkbox.checked = false;
    }
});
dangerCheckbox.addEventListener('change', () => toggleBonus('danger'));
unhealthyMaxCheckbox.addEventListener('change', () => {
    toggleBonus('unhealthyMax');
    // Desativar outros níveis de insalubridade
    bonuses.unhealthyMed = false;
    bonuses.unhealthyMin = false;
    unhealthyMedCheckbox.checked = false;
    unhealthyMinCheckbox.checked = false;
});
unhealthyMedCheckbox.addEventListener('change', () => {
    toggleBonus('unhealthyMed');
    // Desativar outros níveis de insalubridade
    bonuses.unhealthyMax = false;
    bonuses.unhealthyMin = false;
    unhealthyMaxCheckbox.checked = false;
    unhealthyMinCheckbox.checked = false;
});
unhealthyMinCheckbox.addEventListener('change', () => {
    toggleBonus('unhealthyMin');
    // Desativar outros níveis de insalubridade
    bonuses.unhealthyMax = false;
    bonuses.unhealthyMed = false;
    unhealthyMaxCheckbox.checked = false;
    unhealthyMedCheckbox.checked = false;
});
nightCheckbox.addEventListener('change', () => toggleBonus('night'));
