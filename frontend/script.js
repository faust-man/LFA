// =========================================================
// 0. ОПТИМИЗАЦИЯ ЗАГРУЗКИ
// =========================================================

maplibregl.setWorkerCount(4);
maplibregl.prewarm();

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

maplibregl.setMaxParallelImageRequests(24);

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
// 3.1. БОКОВАЯ ПАНЕЛЬ (гамбургер)
// =========================================================
const menuButton = document.getElementById("menu-button");
const sidebar    = document.getElementById("sidebar");

menuButton.addEventListener("click", () => {
    sidebar.classList.toggle("open");
});

// =========================================================
// 3.2. НАЧАЛЬНЫЙ БАННЕР
// =========================================================
const bannerOverlay = document.getElementById("banner-overlay");
const helpButton    = document.getElementById("help-button");

document.addEventListener("DOMContentLoaded", () => {
    bannerOverlay.classList.add("visible");
});

bannerOverlay.addEventListener("click", (e) => {
    if (e.target === bannerOverlay) {
        bannerOverlay.classList.remove("visible");
    }
});

helpButton.addEventListener("click", () => {
    bannerOverlay.classList.add("visible");
});

// =========================================================
// 4. РЕЖИМ УСТАНОВКИ МЕТОК
// =========================================================

const plusButton     = document.getElementById("plus-button");
const triangleCursor = document.getElementById("triangle-cursor");
const previewPhoto   = document.getElementById("preview-photo");
const previewAnimal  = document.getElementById("preview-animal");
const previewOkras   = document.getElementById("preview-okras");
const previewText    = document.getElementById("preview-text");

const modalOverlay   = document.getElementById("modal-overlay");
const animalSelect   = document.getElementById("animal-type");
const okrasInput     = document.getElementById("okras-input");
const timeInput      = document.getElementById("time-input");
const editTimeBtn    = document.getElementById("edit-time-btn");
const submitBtn      = document.getElementById("submit-btn");

const photoDrop      = document.getElementById("photo-drop");
const photoInput     = document.getElementById("photo-input");

// Просмотрщик
const viewerOverlay = document.getElementById("viewer-overlay");
const viewerPhoto   = document.getElementById("viewer-photo");
const viewerAnimal  = document.getElementById("viewer-animal");
const viewerOkras   = document.getElementById("viewer-okras");
const viewerText    = document.getElementById("viewer-text");

let placingMode   = false;
let pendingAnimal = "Кошка";
let pendingOkras  = "";
let pendingText   = "";
let pendingPhoto  = null;

let lastMouseX = -1000;
let lastMouseY = -1000;

// ---------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------
function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function truncateOkras(str) {
    if (!str) return "";
    if (str.length <= 4) return str;
    return str.slice(0, 4) + "..";
}

// Текущее время в формате ЧЧ:ММ
function getCurrentTimeString() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return hh + ":" + mm;
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

    previewAnimal.textContent = pendingAnimal;
    previewOkras.textContent  = truncateOkras(pendingOkras);
    previewText.textContent   = pendingText;

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

    animalSelect.value = "Кошка";

    okrasInput.value = "";
    okrasInput.classList.remove("input-error");

    // Автоподстановка текущего времени, поле только для чтения
    timeInput.value = getCurrentTimeString();
    timeInput.readOnly = true;
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
// Кнопка «изм.» — включает ручной ввод времени
// ---------------------------------------------------------
editTimeBtn.addEventListener("click", () => {
    timeInput.value = "";
    timeInput.readOnly = false;
    timeInput.classList.remove("input-error");
    timeInput.focus();
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
// ---------------------------------------------------------
function isValidOkras(str) {
    const trimmed = str.trim();
    if (trimmed.length === 0) return false;

    const words = trimmed
        .split(/[\s\u00A0\-_\/]+/)
        .filter(w => w.length > 0);

    return words.length >= 1 && words.length <= 3;
}

okrasInput.addEventListener("input", () => {
    if (isValidOkras(okrasInput.value)) {
        okrasInput.classList.remove("input-error");
    }
});

okrasInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        submitBtn.click();
    }
});

timeInput.addEventListener("keydown", (e) => {
    // Пока поле «только для чтения» — клавиатуру не перехватываем
    if (timeInput.readOnly) return;

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
    const animal = animalSelect.value;
    const okras  = okrasInput.value.trim();
    const text   = timeInput.value.trim();

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

    pendingAnimal = animal;
    pendingOkras  = okras;
    pendingText   = text;
    closeModal();
    enablePlacingMode();
});

modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) {
        closeModal();
    }
});

// ---------------------------------------------------------
// Просмотр метки
// ---------------------------------------------------------
function openViewer(photo, animal, okras, text) {
    if (photo) {
        viewerPhoto.src = photo;
        viewerPhoto.style.display = "block";
    } else {
        viewerPhoto.src = "";
        viewerPhoto.style.display = "none";
    }

    viewerAnimal.textContent = animal || "";
    viewerOkras.textContent  = okras  || "";
    viewerText.textContent   = text   || "";

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
    if (e.key === "Escape") {
        if (viewerOverlay.classList.contains("visible")) {
            closeViewer();
        }
        if (bannerOverlay.classList.contains("visible")) {
            bannerOverlay.classList.remove("visible");
        }
    }
});

// ---------------------------------------------------------
// Backend API: создаём и загружаем метки через Nginx
// ---------------------------------------------------------
function addAnimalMarker(animal) {
    const markerAnimal = animal.species || "";
    const markerOkras = animal.color || "";
    const markerText = animal.observed_time || "";
    const markerPhoto = animal.photo_data || null;

    const el = document.createElement("div");
    el.className = "map-marker";

    const photoHtml = markerPhoto
        ? `<div class="pin-photo" style="background-image:url(${markerPhoto})"></div>`
        : "";

    el.innerHTML = `
        <div class="pin">
            <div class="pin-body">
                ${photoHtml}
                <div class="pin-text">${escapeHtml(markerAnimal)}</div>
                <div class="pin-text">${escapeHtml(truncateOkras(markerOkras))}</div>
                <div class="pin-text">${escapeHtml(markerText)}</div>
            </div>
            <div class="pin-tip"></div>
        </div>
    `;

    const pinBody = el.querySelector(".pin-body");
    pinBody.addEventListener("click", (ev) => {
        if (placingMode) return;
        ev.stopPropagation();
        openViewer(markerPhoto, markerAnimal, markerOkras, markerText);
    });

    new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([animal.longitude, animal.latitude])
        .addTo(map);
}

async function loadAnimals() {
    const response = await fetch("/api/animals");
    if (!response.ok) {
        throw new Error(`GET /api/animals: ${response.status}`);
    }

    const animals = await response.json();
    animals.forEach(addAnimalMarker);
}

async function saveAnimal(animal) {
    const response = await fetch("/api/animals", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(animal)
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `POST /api/animals: ${response.status}`);
    }

    return response.json();
}

// ---------------------------------------------------------
// Клик по карте — сохраняем метку в PostgreSQL через Flask
// ---------------------------------------------------------
map.on("click", async (e) => {
    if (!placingMode) return;

    const animal = {
        species: pendingAnimal,
        color: pendingOkras,
        observed_time: pendingText,
        photo_data: pendingPhoto,
        latitude: e.lngLat.lat,
        longitude: e.lngLat.lng
    };

    try {
        const savedAnimal = await saveAnimal(animal);
        addAnimalMarker(savedAnimal);

        pendingAnimal = "Кошка";
        pendingOkras = "";
        pendingText = "";
        pendingPhoto = null;
        disablePlacingMode();
    } catch (error) {
        console.error("Не удалось сохранить животное:", error);
        alert("Не удалось сохранить метку. Проверь backend и PostgreSQL.");
    }
});

map.dragRotate.disable();

// =========================================================
// 5. ОТЛАДКА
// =========================================================
map.on("error", (e) => {
    console.error("Ошибка карты:", e.error);
});

map.on("load", async () => {
    console.log("✅ Карта успешно загружена!");

    try {
        await loadAnimals();
        console.log("✅ Метки загружены из PostgreSQL");
    } catch (error) {
        console.error("Не удалось загрузить метки:", error);
    }
});