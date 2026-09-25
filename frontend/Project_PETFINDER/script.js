// =========================================================
// 1. ИНИЦИАЛИЗАЦИЯ КАРТЫ
// =========================================================
const map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [0, 20],
    zoom: 2,
    minZoom: 0,
    maxZoom: 18,
    antialias: true
});

// =========================================================
// 2. НАСТРОЙКА ПЛАВНОСТИ ЗУМА
// =========================================================
map.scrollZoom.setWheelZoomRate(1 / 800);
map.scrollZoom.setZoomRate(1 / 200);

// =========================================================
// 3. ЭЛЕМЕНТЫ УПРАВЛЕНИЯ
// =========================================================
map.addControl(new maplibregl.NavigationControl(), "top-right");
map.addControl(new maplibregl.FullscreenControl(), "top-right");
map.addControl(
    new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true
    }),
    "top-right"
);

// =========================================================
// 4. РЕЖИМ УСТАНОВКИ МЕТОК
// =========================================================

const plusButton     = document.getElementById("plus-button");
const triangleCursor = document.getElementById("triangle-cursor");
const previewPhoto   = document.getElementById("preview-photo");
const previewOkras   = document.getElementById("preview-okras");
const previewText    = document.getElementById("preview-text");

const modalOverlay   = document.getElementById("modal-overlay");
const okrasInput     = document.getElementById("okras-input");
const timeInput      = document.getElementById("time-input");
const submitBtn      = document.getElementById("submit-btn");

const photoDrop      = document.getElementById("photo-drop");
const photoInput     = document.getElementById("photo-input");

// Просмотрщик
const viewerOverlay = document.getElementById("viewer-overlay");
const viewerPhoto   = document.getElementById("viewer-photo");
const viewerOkras   = document.getElementById("viewer-okras");
const viewerText    = document.getElementById("viewer-text");

let placingMode  = false;
let pendingOkras = "";
let pendingText  = "";
let pendingPhoto = null;

let lastMouseX = -1000;
let lastMouseY = -1000;

// ---------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------

// Защита от XSS при вставке пользовательского текста
function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Обрезаем окрас до 4 символов + ".."
function truncateOkras(str) {
    if (!str) return "";
    if (str.length <= 4) return str;
    return str.slice(0, 4) + "..";
}

// ---------------------------------------------------------
// Позиция курсора
// ---------------------------------------------------------
document.addEventListener("mousemove", (event) => {
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;

    if (placingMode) {
        triangleCursor.style.left = lastMouseX + "px";
        triangleCursor.style.top  = lastMouseY + "px";
    }
});

// ---------------------------------------------------------
// Режим установки метки
// ---------------------------------------------------------
function enablePlacingMode() {
    placingMode = true;
    document.body.classList.add("placing-mode");
    map.getCanvas().style.cursor = "none";

    previewOkras.textContent = truncateOkras(pendingOkras);
    previewText.textContent  = pendingText;

    if (pendingPhoto) {
        previewPhoto.style.backgroundImage = `url(${pendingPhoto})`;
        previewPhoto.style.display = "block";
    } else {
        previewPhoto.style.backgroundImage = "";
        previewPhoto.style.display = "none";
    }

    triangleCursor.style.left = lastMouseX + "px";
    triangleCursor.style.top  = lastMouseY + "px";
    triangleCursor.style.display = "block";
}

function disablePlacingMode() {
    placingMode = false;
    document.body.classList.remove("placing-mode");
    triangleCursor.style.display = "none";
    map.getCanvas().style.cursor = "";
}

// ---------------------------------------------------------
// Модальное окно создания
// ---------------------------------------------------------
function openModal() {
    disablePlacingMode();
    plusButton.classList.add("active");

    pendingPhoto = null;
    photoDrop.classList.remove("has-photo");
    photoDrop.classList.remove("drop-error");
    photoDrop.style.backgroundImage = "";
    photoInput.value = "";

    okrasInput.value = "";
    okrasInput.classList.remove("input-error");

    timeInput.value = "";
    timeInput.classList.remove("input-error");

    modalOverlay.classList.add("visible");
    setTimeout(() => timeInput.focus(), 0);
}

function closeModal() {
    modalOverlay.classList.remove("visible");
    plusButton.classList.remove("active");
}

plusButton.addEventListener("click", () => {
    if (modalOverlay.classList.contains("visible")) {
        closeModal();
    } else {
        openModal();
    }
});

// ---------------------------------------------------------
// Загрузка фото
// ---------------------------------------------------------
photoDrop.addEventListener("click", () => {
    photoInput.click();
});

photoInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        pendingPhoto = ev.target.result;
        photoDrop.style.backgroundImage = `url(${pendingPhoto})`;
        photoDrop.classList.add("has-photo");
        photoDrop.classList.remove("drop-error");
    };
    reader.readAsDataURL(file);
});

// ---------------------------------------------------------
// Валидация времени
// ---------------------------------------------------------
const TIME_REGEX = /^\d{2}:\d{2}$/;

function isValidTime(str) {
    if (!TIME_REGEX.test(str)) return false;
    const [hh, mm] = str.split(":").map(Number);
    return hh <= 23 && mm <= 59;
}

// ---------------------------------------------------------
// Валидация окраса: 1–3 слова.
// Разделителями считаются пробелы, дефисы, подчёркивания,
// слэши и неразрывные пробелы (на случай копирования из Word).
// ---------------------------------------------------------
function isValidOkras(str) {
    const trimmed = str.trim();
    if (trimmed.length === 0) return false;

    const words = trimmed
        .split(/[\s\u00A0\-_\/]+/)
        .filter(w => w.length > 0);

    return words.length >= 1 && words.length <= 3;
}

// Снимаем подсветку ошибки у окраса при вводе
okrasInput.addEventListener("input", () => {
    if (isValidOkras(okrasInput.value)) {
        okrasInput.classList.remove("input-error");
    }
});

// Enter в поле «Окрас» = нажатие на «Поставить»
okrasInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        submitBtn.click();
    }
});

timeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        submitBtn.click();
        return;
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const allowedKeys = [
        "Backspace", "Delete",
        "ArrowLeft", "ArrowRight",
        "Tab", "Home", "End"
    ];
    if (allowedKeys.includes(e.key)) return;

    if (!/^\d$/.test(e.key)) {
        e.preventDefault();
        return;
    }

    const digits = timeInput.value.replace(/\D/g, "");
    if (digits.length >= 4) {
        e.preventDefault();
        return;
    }

    const d = e.key;
    let allowed = true;

    if (digits.length === 0) {
        allowed = /^[0-2]$/.test(d);
    } else if (digits.length === 1) {
        allowed = digits[0] === "2" ? /^[0-3]$/.test(d) : /^\d$/.test(d);
    } else if (digits.length === 2) {
        allowed = /^[0-5]$/.test(d);
    } else if (digits.length === 3) {
        allowed = /^\d$/.test(d);
    }

    if (!allowed) e.preventDefault();
});

timeInput.addEventListener("input", () => {
    let digits = timeInput.value.replace(/\D/g, "");
    digits = digits.slice(0, 4);

    let formatted;
    if (digits.length <= 2) {
        formatted = digits;
    } else {
        formatted = digits.slice(0, 2) + ":" + digits.slice(2);
    }

    timeInput.value = formatted;

    if (isValidTime(formatted)) {
        timeInput.classList.remove("input-error");
    }
});

// ---------------------------------------------------------
// Кнопка «Поставить»
// ---------------------------------------------------------
submitBtn.addEventListener("click", () => {
    const okras = okrasInput.value.trim();
    const text  = timeInput.value.trim();

    okrasInput.classList.remove("input-error");
    timeInput.classList.remove("input-error");
    photoDrop.classList.remove("drop-error");

    let hasError = false;

    if (!isValidOkras(okras)) {
        okrasInput.classList.add("input-error");
        hasError = true;
    }

    if (!isValidTime(text)) {
        timeInput.classList.add("input-error");
        hasError = true;
    }

    if (!pendingPhoto) {
        photoDrop.classList.add("drop-error");
        hasError = true;
    }

    if (hasError) return;

    pendingOkras = okras;
    pendingText  = text;
    closeModal();
    enablePlacingMode();
});

// Клик по фону модалки
modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) {
        closeModal();
    }
});

// ---------------------------------------------------------
// Просмотр метки
// ---------------------------------------------------------
function openViewer(photo, okras, text) {
    if (photo) {
        viewerPhoto.src = photo;
        viewerPhoto.style.display = "block";
    } else {
        viewerPhoto.src = "";
        viewerPhoto.style.display = "none";
    }

    viewerOkras.textContent = okras || "";
    viewerText.textContent  = text  || "";

    viewerOverlay.classList.add("visible");
}

function closeViewer() {
    viewerOverlay.classList.remove("visible");
    viewerPhoto.src = "";
}

viewerOverlay.addEventListener("click", (e) => {
    if (e.target === viewerOverlay) {
        closeViewer();
    }
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && viewerOverlay.classList.contains("visible")) {
        closeViewer();
    }
});

// ---------------------------------------------------------
// Клик по карте — ставим метку
// ---------------------------------------------------------
map.on("click", (e) => {
    if (!placingMode) return;

    // Фиксируем данные этой метки в замыкании
    const markerOkras = pendingOkras;
    const markerText  = pendingText;
    const markerPhoto = pendingPhoto;

    const el = document.createElement("div");
    el.className = "map-marker";

    const photoHtml = markerPhoto
        ? `<div class="pin-photo" style="background-image:url(${markerPhoto})"></div>`
        : "";

    el.innerHTML = `
        <div class="pin">
            <div class="pin-body">
                ${photoHtml}
                <div class="pin-text">${escapeHtml(truncateOkras(markerOkras))}</div>
                <div class="pin-text">${escapeHtml(markerText)}</div>
            </div>
            <div class="pin-tip"></div>
        </div>
    `;

    // Клик по телу метки — открываем просмотрщик
    const pinBody = el.querySelector(".pin-body");
    pinBody.addEventListener("click", (ev) => {
        if (placingMode) return;
        ev.stopPropagation();
        openViewer(markerPhoto, markerOkras, markerText);
    });

    new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat(e.lngLat)
        .addTo(map);

    pendingOkras = "";
    pendingText  = "";
    pendingPhoto = null;
    disablePlacingMode();
});

map.dragRotate.disable();

// =========================================================
// 5. ОТЛАДКА
// =========================================================
map.on("error", (e) => {
    console.error("Ошибка карты:", e.error);
});

map.on("load", () => {
    console.log("✅ Карта успешно загружена!");
});