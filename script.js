// Variáveis globais
let valuePerMinute = 0;
let timerInterval = null;
let startTime = null;
let accumulatedValue = 0;

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
        valuePerMinute = calculateValuePerMinute(salary, hours);
        valueDisplay.textContent = `Valor por minuto: R$ ${valuePerMinute.toFixed(2)}`;
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
