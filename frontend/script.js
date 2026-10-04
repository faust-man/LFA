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
const bannerOverlay  = document.getElementById("banner-overlay");
const helpButton     = document.getElementById("help-button");
const bannerCloseBtn = document.getElementById("banner-close-btn");

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

bannerCloseBtn.addEventListener("click", () => {
    bannerOverlay.classList.remove("visible");
});

// =========================================================
// 4. ОБЩИЕ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =========================================================
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

// Преобразуем "ДД.ММ.ГГГГ" → "ДД.ММ" (только день и месяц)
function formatDateShort(str) {
    if (!str) return "";
    const m = str.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return str;
    const [, dd, mm] = m;
    return dd + "." + mm;
}

function getCurrentTimeString() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return hh + ":" + mm;
}

function getCurrentDateString() {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return dd + "." + mm + "." + yyyy;
}

function isValidTime(str) {
    if (!/^\d{2}:\d{2}$/.test(str)) return false;
    const [hh, mm] = str.split(":").map(Number);
    return hh <= 23 && mm <= 59;
}

function isValidDate(str) {
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(str)) return false;
    const [dd, mm, yyyy] = str.split(".").map(Number);
    if (mm < 1 || mm > 12) return false;
    if (dd < 1 || dd > 31) return false;
    if (yyyy < 1900 || yyyy > 2100) return false;
    const daysInMonth = new Date(yyyy, mm, 0).getDate();
    return dd <= daysInMonth;
}

function isValidOkras(str) {
    const trimmed = str.trim();
    if (trimmed.length === 0) return false;
    const words = trimmed.split(/[\s\u00A0\-_\/]+/).filter(w => w.length > 0);
    return words.length >= 1 && words.length <= 3;
}

// ---------------------------------------------------------
// Масштаб меток в зависимости от зума
// ---------------------------------------------------------
function updateMarkerScale() {
    const z = map.getZoom();

    // Диапазон зумов, на которых метка меняет размер
    const ZOOM_START = 0;    // на этом зуме метка самая маленькая
    const ZOOM_STOP  = 12;   // с этого зума метка перестаёт расти

    const SCALE_MIN  = 0.5;  // масштаб при zoom = ZOOM_START
    const SCALE_MAX  = 1.0;  // максимальный масштаб (дальше не растёт)

    let scale;

    if (z >= ZOOM_STOP) {
        scale = SCALE_MAX;
    } else if (z <= ZOOM_START) {
        scale = SCALE_MIN;
    } else {
        const t = (z - ZOOM_START) / (ZOOM_STOP - ZOOM_START);
        scale = SCALE_MIN + t * (SCALE_MAX - SCALE_MIN);
    }

    document.documentElement.style.setProperty("--marker-scale", scale.toFixed(3));
}

// ---------------------------------------------------------
// Обработчики для полей «Время» и «Дата»
// ---------------------------------------------------------
function setupTimeField(input, submitBtn) {
    input.addEventListener("keydown", (e) => {
        if (input.readOnly) return;

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

        const digits = input.value.replace(/\D/g, "");
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

    input.addEventListener("input", () => {
        let digits = input.value.replace(/\D/g, "");
        digits = digits.slice(0, 4);

        let formatted;
        if (digits.length <= 2) {
            formatted = digits;
        } else {
            formatted = digits.slice(0, 2) + ":" + digits.slice(2);
        }

        input.value = formatted;
        input.classList.remove("input-error");
    });
}

function setupDateField(input) {
    input.addEventListener("keydown", (e) => {
        if (input.readOnly) return;

        if (e.key === "Enter") {
            e.preventDefault();
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

        const digits = input.value.replace(/\D/g, "");
        if (digits.length >= 8) {
            e.preventDefault();
            return;
        }
    });

    input.addEventListener("input", () => {
        let digits = input.value.replace(/\D/g, "").slice(0, 8);
        let formatted;

        if (digits.length <= 2) {
            formatted = digits;
        } else if (digits.length <= 4) {
            formatted = digits.slice(0, 2) + "." + digits.slice(2);
        } else {
            formatted = digits.slice(0, 2) + "." + digits.slice(2, 4) + "." + digits.slice(4);
        }

        input.value = formatted;
        input.classList.remove("input-error");
    });
}

// =========================================================
// 5. АВТОПОДСКАЗКИ АДРЕСА (Nominatim / OpenStreetMap)
// =========================================================
const addressSuggestions = document.getElementById("address-suggestions");

let addressDebounceTimer = null;

function hideAddressSuggestions() {
    addressSuggestions.classList.remove("visible");
    addressSuggestions.innerHTML = "";
}

// Страна, город, улица, дом, корпус
function formatFullAddress(item) {
    const a = item.address || {};
    const parts = [];

    if (a.country) parts.push(a.country);

    const city = a.city || a.town || a.village || a.municipality;
    if (city) parts.push(city);

    const road = a.road || a.pedestrian || a.footway || a.path;
    if (road) parts.push(road);

    if (a.house_number) parts.push("д. " + a.house_number);
    if (a.building)     parts.push("корп. " + a.building);

    return parts.join(", ");
}

// Страна, город, улица
function formatShortAddress(item) {
    const a = item.address || {};
    const parts = [];

    if (a.country) parts.push(a.country);

    const city = a.city || a.town || a.village || a.municipality;
    if (city) parts.push(city);

    const road = a.road || a.pedestrian || a.footway || a.path;
    if (road) parts.push(road);

    return parts.join(", ");
}

function showAddressSuggestions(items, inputEl, formatter) {
    const formatted = items
        .map(item => ({ item, text: formatter(item) }))
        .filter(x => x.text && x.text.trim() !== "");

    if (!formatted.length) {
        hideAddressSuggestions();
        return;
    }

    addressSuggestions.innerHTML = "";

    formatted.forEach(({ text }) => {
        const div = document.createElement("div");
        div.className = "address-suggestion";
        div.textContent = text;

        div.addEventListener("mousedown", (e) => e.preventDefault());
        div.addEventListener("click", () => {
            inputEl.value = text;
            inputEl.classList.remove("input-error");
            hideAddressSuggestions();
        });

        addressSuggestions.appendChild(div);
    });

    const rect = inputEl.getBoundingClientRect();
    addressSuggestions.style.top   = (rect.bottom + 4) + "px";
    addressSuggestions.style.left  = rect.left + "px";
    addressSuggestions.style.width = rect.width + "px";

    addressSuggestions.classList.add("visible");
}

function setupAddressField(inputEl, formatter) {
    inputEl.addEventListener("input", () => {
        clearTimeout(addressDebounceTimer);
        const query = inputEl.value.trim();

        if (query.length < 3) {
            hideAddressSuggestions();
            return;
        }

        addressDebounceTimer = setTimeout(async () => {
            try {
                const url =
                    "https://nominatim.openstreetmap.org/search" +
                    "?format=json&addressdetails=1&extratags=1&accept-language=ru&limit=8" +
                    "&q=" + encodeURIComponent(query);

                const res = await fetch(url, {
                    headers: {
                        "Accept-Language": "ru"
                    }
                });

                if (!res.ok) {
                    console.warn("Nominatim вернул статус:", res.status);
                    hideAddressSuggestions();
                    return;
                }

                const data = await res.json();
                showAddressSuggestions(data, inputEl, formatter);
            } catch (err) {
                console.error("Ошибка загрузки подсказок адреса:", err);
                hideAddressSuggestions();
            }
        }, 300);
    });

    inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && addressSuggestions.classList.contains("visible")) {
            const first = addressSuggestions.querySelector(".address-suggestion");
            if (first) {
                e.preventDefault();
                inputEl.value = first.textContent;
                inputEl.classList.remove("input-error");
                hideAddressSuggestions();
            }
        }
    });

    inputEl.addEventListener("blur", () => {
        setTimeout(hideAddressSuggestions, 200);
    });

    const modal = inputEl.closest(".modal");
    if (modal) {
        modal.addEventListener("scroll", hideAddressSuggestions);
    }
}

// =========================================================
// 6. РЕЖИМ УСТАНОВКИ МЕТОК (модалка «+»)
// =========================================================

const plusButton     = document.getElementById("plus-button");
const triangleCursor = document.getElementById("triangle-cursor");
const previewPhoto   = document.getElementById("preview-photo");
const previewAnimal  = document.getElementById("preview-animal");
const previewOkras   = document.getElementById("preview-okras");
const previewDate    = document.getElementById("preview-date");
const previewText    = document.getElementById("preview-text");

const modalOverlay   = document.getElementById("modal-overlay");
const animalSelect   = document.getElementById("animal-type");
const okrasInput     = document.getElementById("okras-input");
const timeInput      = document.getElementById("time-input");
const editTimeBtn    = document.getElementById("edit-time-btn");
const dateInput      = document.getElementById("date-input");
const editDateBtn    = document.getElementById("edit-date-btn");
const submitBtn      = document.getElementById("submit-btn");

const photoDrop      = document.getElementById("photo-drop");
const photoInput     = document.getElementById("photo-input");

const moreBtn         = document.getElementById("more-btn");
const extraFields     = document.getElementById("extra-fields");
const behaviorInput   = document.getElementById("behavior-input");
const stateInput      = document.getElementById("state-input");
const readyToggle     = document.getElementById("ready-toggle");
const readyExtra      = document.getElementById("ready-extra");
const extraContactInp = document.getElementById("extra-contact-input");
const addressInput    = document.getElementById("address-input");

// Просмотрщик
const viewerOverlay = document.getElementById("viewer-overlay");
const viewerPhoto   = document.getElementById("viewer-photo");
const viewerAnimal  = document.getElementById("viewer-animal");
const viewerOkras   = document.getElementById("viewer-okras");
const viewerText    = document.getElementById("viewer-text");
const viewerExtra   = document.getElementById("viewer-extra");

let placingMode   = false;
let pendingAnimal = "Кошка";
let pendingOkras  = "";
let pendingTime   = "";
let pendingDate   = "";
let pendingPhoto  = null;

let pendingBehavior = "";
let pendingState    = "";
let pendingReady    = false;
let pendingContact  = "";
let pendingAddress  = "";

let lastMouseX = -1000;
let lastMouseY = -1000;

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
    previewDate.textContent   = formatDateShort(pendingDate);
    previewText.textContent   = pendingTime;

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
// Модалка «+»
// ---------------------------------------------------------
function openModal() {
    document.getElementById("lost-modal-overlay").classList.remove("visible");

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

    timeInput.value = getCurrentTimeString();
    timeInput.readOnly = true;
    timeInput.classList.remove("input-error");

    dateInput.value = getCurrentDateString();
    dateInput.readOnly = true;
    dateInput.classList.remove("input-error");

    moreBtn.style.display = "";
    extraFields.classList.remove("visible");

    behaviorInput.value = "";
    behaviorInput.classList.remove("input-error");

    stateInput.value = "";
    stateInput.classList.remove("input-error");

    readyToggle.checked = false;
    readyExtra.classList.remove("visible");

    extraContactInp.value = "";
    extraContactInp.classList.remove("input-error");

    addressInput.value = "";
    addressInput.classList.remove("input-error");

    hideAddressSuggestions();

    modalOverlay.classList.add("visible");
    setTimeout(() => timeInput.focus(), 0);
}

function closeModal() {
    modalOverlay.classList.remove("visible");
    plusButton.classList.remove("active");
    hideAddressSuggestions();
}

plusButton.addEventListener("click", () => {
    if (modalOverlay.classList.contains("visible")) {
        closeModal();
    } else {
        openModal();
    }
});

editTimeBtn.addEventListener("click", () => {
    timeInput.value = "";
    timeInput.readOnly = false;
    timeInput.classList.remove("input-error");
    timeInput.focus();
});

editDateBtn.addEventListener("click", () => {
    dateInput.value = "";
    dateInput.readOnly = false;
    dateInput.classList.remove("input-error");
    dateInput.focus();
});

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

moreBtn.addEventListener("click", () => {
    moreBtn.style.display = "none";
    extraFields.classList.add("visible");
});

readyToggle.addEventListener("change", () => {
    if (readyToggle.checked) {
        readyExtra.classList.add("visible");
    } else {
        readyExtra.classList.remove("visible");
    }
});

setupTimeField(timeInput, submitBtn);
setupDateField(dateInput);

setupAddressField(addressInput, formatFullAddress);

okrasInput.addEventListener("input", () => {
    if (isValidOkras(okrasInput.value)) {
        okrasInput.classList.remove("input-error");
    }
});

behaviorInput.addEventListener("input", () => {
    if (behaviorInput.value.trim() !== "") {
        behaviorInput.classList.remove("input-error");
    }
});

stateInput.addEventListener("input", () => {
    if (stateInput.value.trim() !== "") {
        stateInput.classList.remove("input-error");
    }
});

extraContactInp.addEventListener("input", () => {
    if (extraContactInp.value.trim() !== "") {
        extraContactInp.classList.remove("input-error");
    }
});

addressInput.addEventListener("input", () => {
    if (addressInput.value.trim() !== "") {
        addressInput.classList.remove("input-error");
    }
});

okrasInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        submitBtn.click();
    }
});

submitBtn.addEventListener("click", () => {
    const animal = animalSelect.value;
    const okras  = okrasInput.value.trim();
    const time   = timeInput.value.trim();
    const date   = dateInput.value.trim();

    okrasInput.classList.remove("input-error");
    timeInput.classList.remove("input-error");
    dateInput.classList.remove("input-error");
    photoDrop.classList.remove("drop-error");
    behaviorInput.classList.remove("input-error");
    stateInput.classList.remove("input-error");
    extraContactInp.classList.remove("input-error");
    addressInput.classList.remove("input-error");

    let hasError = false;

    if (!isValidOkras(okras)) {
        okrasInput.classList.add("input-error");
        hasError = true;
    }

    if (!isValidTime(time)) {
        timeInput.classList.add("input-error");
        hasError = true;
    }

    if (!isValidDate(date)) {
        dateInput.classList.add("input-error");
        hasError = true;
    }

    if (!pendingPhoto) {
        photoDrop.classList.add("drop-error");
        hasError = true;
    }

    const extrasVisible = extraFields.classList.contains("visible");

    if (extrasVisible) {
        if (behaviorInput.value.trim() === "") {
            behaviorInput.classList.add("input-error");
            hasError = true;
        }
        if (stateInput.value.trim() === "") {
            stateInput.classList.add("input-error");
            hasError = true;
        }

        if (readyToggle.checked) {
            if (extraContactInp.value.trim() === "") {
                extraContactInp.classList.add("input-error");
                hasError = true;
            }
            if (addressInput.value.trim() === "") {
                addressInput.classList.add("input-error");
                hasError = true;
            }
        }
    }

    if (hasError) return;

    pendingBehavior = extrasVisible ? behaviorInput.value.trim() : "";
    pendingState    = extrasVisible ? stateInput.value.trim()    : "";
    pendingReady    = extrasVisible ? readyToggle.checked        : false;
    pendingContact  = (extrasVisible && pendingReady) ? extraContactInp.value.trim() : "";
    pendingAddress  = (extrasVisible && pendingReady) ? addressInput.value.trim()   : "";

    pendingAnimal = animal;
    pendingOkras  = okras;
    pendingTime   = time;
    pendingDate   = date;
    closeModal();
    enablePlacingMode();
});

modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) {
        closeModal();
    }
});

// =========================================================
// 7. МОДАЛКА «Потерял животное»
// =========================================================

const lostButton         = document.getElementById("lost-button");
const lostModalOverlay   = document.getElementById("lost-modal-overlay");

const lostPhotoDrop      = document.getElementById("lost-photo-drop");
const lostPhotoInput     = document.getElementById("lost-photo-input");
const lostNicknameInput  = document.getElementById("lost-nickname");
const lostCharacterInput = document.getElementById("lost-character");
const lostContactInput   = document.getElementById("lost-contact");
const lostAnimalSelect   = document.getElementById("lost-animal-type");
const lostOkrasInput     = document.getElementById("lost-okras");
const lostTimeInput      = document.getElementById("lost-time");
const lostEditTimeBtn    = document.getElementById("lost-edit-time-btn");
const lostDateInput      = document.getElementById("lost-date");
const lostEditDateBtn    = document.getElementById("lost-edit-date-btn");
const lostAddressInput   = document.getElementById("lost-address");
const lostSubmitBtn      = document.getElementById("lost-submit-btn");

let lostPhoto = null;

setupTimeField(lostTimeInput, lostSubmitBtn);
setupDateField(lostDateInput);

setupAddressField(lostAddressInput, formatShortAddress);

function openLostModal() {
    modalOverlay.classList.remove("visible");
    plusButton.classList.remove("active");
    disablePlacingMode();

    lostPhoto = null;
    lostPhotoDrop.classList.remove("has-photo");
    lostPhotoDrop.classList.remove("drop-error");
    lostPhotoDrop.style.backgroundImage = "";
    lostPhotoInput.value = "";

    lostNicknameInput.value = "";
    lostNicknameInput.classList.remove("input-error");

    lostCharacterInput.value = "";
    lostCharacterInput.classList.remove("input-error");

    lostContactInput.value = "";
    lostContactInput.classList.remove("input-error");

    lostAnimalSelect.value = "Кошка";

    lostOkrasInput.value = "";
    lostOkrasInput.classList.remove("input-error");

    lostTimeInput.value = getCurrentTimeString();
    lostTimeInput.readOnly = true;
    lostTimeInput.classList.remove("input-error");

    lostDateInput.value = getCurrentDateString();
    lostDateInput.readOnly = true;
    lostDateInput.classList.remove("input-error");

    lostAddressInput.value = "";
    lostAddressInput.classList.remove("input-error");

    hideAddressSuggestions();

    lostModalOverlay.classList.add("visible");
}

function closeLostModal() {
    lostModalOverlay.classList.remove("visible");
    hideAddressSuggestions();
}

lostButton.addEventListener("click", () => {
    if (lostModalOverlay.classList.contains("visible")) {
        closeLostModal();
    } else {
        openLostModal();
    }
});

lostPhotoDrop.addEventListener("click", () => {
    lostPhotoInput.click();
});

lostPhotoInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        lostPhoto = ev.target.result;
        lostPhotoDrop.style.backgroundImage = `url(${lostPhoto})`;
        lostPhotoDrop.classList.add("has-photo");
        lostPhotoDrop.classList.remove("drop-error");
    };
    reader.readAsDataURL(file);
});

lostEditTimeBtn.addEventListener("click", () => {
    lostTimeInput.value = "";
    lostTimeInput.readOnly = false;
    lostTimeInput.classList.remove("input-error");
    lostTimeInput.focus();
});

lostEditDateBtn.addEventListener("click", () => {
    lostDateInput.value = "";
    lostDateInput.readOnly = false;
    lostDateInput.classList.remove("input-error");
    lostDateInput.focus();
});

lostNicknameInput.addEventListener("input", () => {
    if (lostNicknameInput.value.trim() !== "") {
        lostNicknameInput.classList.remove("input-error");
    }
});

lostCharacterInput.addEventListener("input", () => {
    if (lostCharacterInput.value.trim() !== "") {
        lostCharacterInput.classList.remove("input-error");
    }
});

lostContactInput.addEventListener("input", () => {
    if (lostContactInput.value.trim() !== "") {
        lostContactInput.classList.remove("input-error");
    }
});

lostOkrasInput.addEventListener("input", () => {
    if (isValidOkras(lostOkrasInput.value)) {
        lostOkrasInput.classList.remove("input-error");
    }
});

lostAddressInput.addEventListener("input", () => {
    if (lostAddressInput.value.trim() !== "") {
        lostAddressInput.classList.remove("input-error");
    }
});

lostSubmitBtn.addEventListener("click", () => {
    const nickname  = lostNicknameInput.value.trim();
    const character = lostCharacterInput.value.trim();
    const contact   = lostContactInput.value.trim();
    const okras     = lostOkrasInput.value.trim();
    const time      = lostTimeInput.value.trim();
    const date      = lostDateInput.value.trim();
    const address   = lostAddressInput.value.trim();

    lostNicknameInput.classList.remove("input-error");
    lostCharacterInput.classList.remove("input-error");
    lostContactInput.classList.remove("input-error");
    lostOkrasInput.classList.remove("input-error");
    lostTimeInput.classList.remove("input-error");
    lostDateInput.classList.remove("input-error");
    lostAddressInput.classList.remove("input-error");
    lostPhotoDrop.classList.remove("drop-error");

    let hasError = false;

    if (nickname === "") {
        lostNicknameInput.classList.add("input-error");
        hasError = true;
    }

    if (character === "") {
        lostCharacterInput.classList.add("input-error");
        hasError = true;
    }

    if (contact === "") {
        lostContactInput.classList.add("input-error");
        hasError = true;
    }

    if (!isValidOkras(okras)) {
        lostOkrasInput.classList.add("input-error");
        hasError = true;
    }

    if (!isValidTime(time)) {
        lostTimeInput.classList.add("input-error");
        hasError = true;
    }

    if (!isValidDate(date)) {
        lostDateInput.classList.add("input-error");
        hasError = true;
    }

    if (address === "") {
        lostAddressInput.classList.add("input-error");
        hasError = true;
    }

    if (!lostPhoto) {
        lostPhotoDrop.classList.add("drop-error");
        hasError = true;
    }

    if (hasError) return;

    console.log("Форма «Потерял животное» валидна:", {
        photo: lostPhoto ? "(есть)" : "(нет)",
        nickname,
        character,
        contact,
        animal: lostAnimalSelect.value,
        okras,
        time,
        date,
        address
    });
});

lostModalOverlay.addEventListener("click", (e) => {
    if (e.target === lostModalOverlay) {
        closeLostModal();
    }
});

// =========================================================
// 8. ПРОСМОТРЩИК МЕТКИ
// =========================================================
function openViewer(photo, animal, okras, time, date, extras) {
    if (photo) {
        viewerPhoto.src = photo;
        viewerPhoto.style.display = "block";
    } else {
        viewerPhoto.src = "";
        viewerPhoto.style.display = "none";
    }

    viewerAnimal.textContent = animal || "";
    viewerOkras.textContent  = okras ? ("Окрас: " + okras) : "";

    viewerText.textContent =
        (date && time) ? (date + "\u00A0\u00A0\u00A0" + time) :
        (date || time || "");

    viewerExtra.innerHTML = "";

    if (extras) {
        if (extras.behavior) {
            const item = document.createElement("div");
            item.className = "viewer-extra-item";
            item.innerHTML = `
                <div class="viewer-extra-label">Поведение животного</div>
                <div class="viewer-extra-value">${escapeHtml(extras.behavior)}</div>
            `;
            viewerExtra.appendChild(item);
        }

        if (extras.state) {
            const item = document.createElement("div");
            item.className = "viewer-extra-item";
            item.innerHTML = `
                <div class="viewer-extra-label">Состояние животного</div>
                <div class="viewer-extra-value">${escapeHtml(extras.state)}</div>
            `;
            viewerExtra.appendChild(item);
        }

        if (extras.ready) {
            const item = document.createElement("div");
            item.className = "viewer-extra-item";

            const contactLine = extras.contact
                ? `<div class="viewer-extra-value"><strong>Контакты для связи:</strong> ${escapeHtml(extras.contact)}</div>`
                : "";

            const addressLine = extras.address
                ? `<div class="viewer-extra-value"><strong>Адрес пребывания животного:</strong> ${escapeHtml(extras.address)}</div>`
                : "";

            item.innerHTML = `
                <div class="viewer-extra-label">Человек временно приютил это животное</div>
                ${contactLine}
                ${addressLine}
            `;
            viewerExtra.appendChild(item);
        }
    }

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
        if (modalOverlay.classList.contains("visible")) {
            closeModal();
        }
        if (lostModalOverlay.classList.contains("visible")) {
            closeLostModal();
        }
    }
});

// =========================================================
// 9. КЛИК ПО КАРТЕ — СТАВИМ МЕТКУ
// =========================================================
map.on("click", (e) => {
    if (!placingMode) return;

    const markerAnimal = pendingAnimal;
    const markerOkras  = pendingOkras;
    const markerTime   = pendingTime;
    const markerDate   = pendingDate;
    const markerPhoto  = pendingPhoto;

    const markerExtras = {
        behavior: pendingBehavior,
        state:    pendingState,
        ready:    pendingReady,
        contact:  pendingContact,
        address:  pendingAddress
    };

    const el = document.createElement("div");
    el.className = "map-marker";

    // Если ползунок «Да» — красное сердечко в углу всей метки
    let helpedIcon = "";

    if (markerExtras.ready) {
        helpedIcon = `
            <span class="pin-helped-icon">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
            </span>
        `;
    }

    const photoHtml = markerPhoto
        ? `<div class="pin-photo" style="background-image:url(${markerPhoto})"></div>`
        : "";

    el.innerHTML = `
        <div class="pin">
            <div class="pin-body">
                ${helpedIcon}
                ${photoHtml}
                <div class="pin-text">${escapeHtml(markerAnimal)}</div>
                <div class="pin-text">${escapeHtml(truncateOkras(markerOkras))}</div>
                <div class="pin-text">${escapeHtml(formatDateShort(markerDate))}</div>
                <div class="pin-text">${escapeHtml(markerTime)}</div>
            </div>
            <div class="pin-tip"></div>
        </div>
    `;

    const pinBody = el.querySelector(".pin-body");
    pinBody.addEventListener("click", (ev) => {
        if (placingMode) return;
        ev.stopPropagation();
        openViewer(markerPhoto, markerAnimal, markerOkras, markerTime, markerDate, markerExtras);
    });

    new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat(e.lngLat)
        .addTo(map);

    pendingAnimal   = "Кошка";
    pendingOkras    = "";
    pendingTime     = "";
    pendingDate     = "";
    pendingPhoto    = null;
    pendingBehavior = "";
    pendingState    = "";
    pendingReady    = false;
    pendingContact  = "";
    pendingAddress  = "";

    disablePlacingMode();
});

map.dragRotate.disable();

// =========================================================
// 10. ОТЛАДКА
// =========================================================
map.on("error", (e) => {
    console.error("Ошибка карты:", e.error);
});

map.on("load", () => {
    console.log("✅ Карта успешно загружена!");
    updateMarkerScale();
});

// Обновляем масштаб меток при каждом изменении зума
map.on("zoom", updateMarkerScale);