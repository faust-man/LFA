// =========================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =========================================================
// Ничего не знают про карту или DOM. Чистые функции,
// которые можно безопасно вызывать откуда угодно.
// =========================================================

// Защита от XSS: экранирует спецсимволы HTML в пользовательском
// тексте, чтобы его нельзя было вставить как теги.
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Обрезает окрас до 4 символов и добавляет «..», если строка
// длиннее. Используется на метке, чтобы текст не растягивался.
function truncateOkras(str) {
    if (!str) return "";
    if (str.length <= 4) return str;
    return str.slice(0, 4) + "..";
}

// Превращает «03.10.2026» → «03.10». Для отображения на метке,
// где нет места под полный год.
function formatDateShort(str) {
    if (!str) return "";
    const m = str.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return str;
    const [, dd, mm] = m;
    return dd + "." + mm;
}

// Возвращает текущее время в формате ЧЧ:ММ.
function getCurrentTimeString() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return hh + ":" + mm;
}

// Возвращает текущую дату в формате ДД.ММ.ГГГГ.
function getCurrentDateString() {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return dd + "." + mm + "." + yyyy;
}

// Проверяет, что строка — валидное время ЧЧ:ММ.
// Часы 00–23, минуты 00–59.
function isValidTime(str) {
    if (!/^\d{2}:\d{2}$/.test(str)) return false;
    const [hh, mm] = str.split(":").map(Number);
    return hh <= 23 && mm <= 59;
}

// Проверяет, что строка — валидная дата ДД.ММ.ГГГГ.
// Дополнительно учитывает количество дней в месяце
// (чтобы 31.02.2026 не прошло).
function isValidDate(str) {
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(str)) return false;
    const [dd, mm, yyyy] = str.split(".").map(Number);
    if (mm < 1 || mm > 12) return false;
    if (dd < 1 || dd > 31) return false;
    if (yyyy < 1900 || yyyy > 2100) return false;
    const daysInMonth = new Date(yyyy, mm, 0).getDate();
    return dd <= daysInMonth;
}

// Проверяет окрас: от 1 до 3 слов. Разделители — пробел,
// дефис, подчёркивание, слэш и неразрывный пробел.
function isValidOkras(str) {
    const trimmed = str.trim();
    if (trimmed.length === 0) return false;
    const words = trimmed.split(/[\s\u00A0\-_\/]+/).filter(w => w.length > 0);
    return words.length >= 1 && words.length <= 3;
}

// Определяет, что пользователь на мобильном / узком экране.
// Тот же порог 768px, что и в CSS media query.
function isMobileDevice() {
    return window.matchMedia("(max-width: 768px)").matches;
}