// =========================================================
// 0. АДРЕС БЭКЕНДА
// =========================================================
const API_BASE = "http://localhost:5000";

// =========================================================
// 1. ИНИЦИАЛИЗАЦИЯ КАРТЫ
// =========================================================

maplibregl.setWorkerCount(4);
maplibregl.prewarm();

const map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [37.6173, 55.7558],
    zoom: 10,
    minZoom: 0,
    maxZoom: 18,
    antialias: true
});

maplibregl.setMaxParallelImageRequests(24);

map.scrollZoom.setWheelZoomRate(1 / 800);
map.scrollZoom.setZoomRate(1 / 200);

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
// 2. API: работа с бэкендом
// =========================================================

async function apiGetAnimals() {
    const res = await fetch(`${API_BASE}/api/animals`);
    if (!res.ok) throw new Error("Ошибка загрузки меток");
    return res.json();
}

async function apiCreateAnimal(payload) {
    const res = await fetch(`${API_BASE}/api/animals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Ошибка сохранения метки");
    }
    return res.json();
}

async function apiDeleteAnimal(id) {
    const res = await fetch(`${API_BASE}/api/animals/${id}`, { method: "DELETE" });
    return res.ok;
}

async function apiGetLostAds() {
    const res = await fetch(`${API_BASE}/api/lost_ads`);
    if (!res.ok) throw new Error("Ошибка загрузки объявлений");
    return res.json();
}

async function apiCreateLostAd(payload) {
    const res = await fetch(`${API_BASE}/api/lost_ads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Ошибка сохранения объявления");
    }
    return res.json();
}

async function apiDeleteLostAd(id) {
    const res = await fetch(`${API_BASE}/api/lost_ads/${id}`, { method: "DELETE" });
    return res.ok;
}

// =========================================================
// 3. БОКОВАЯ ПАНЕЛЬ (гамбургер)
// =========================================================
const menuButton = document.getElementById("menu-button");
const sidebar    = document.getElementById("sidebar");

menuButton.addEventListener("click", () => {
    sidebar.classList.toggle("open");

    if (!sidebar.classList.contains("open")) {
        sidebarAnimals.classList.remove("open");
        sidebarLostAnimals.classList.remove("open");
        sidebarFilters.classList.remove("visible");
    }
});

// =========================================================
// 4. НАЧАЛЬНЫЙ БАННЕР
// =========================================================
const bannerOverlay  = document.getElementById("banner-overlay");
const helpButton     = document.getElementById("help-button");
const bannerCloseBtn = document.getElementById("banner-close-btn");

document.addEventListener("DOMContentLoaded", () => {
    bannerOverlay.classList.add("visible");
});

bannerOverlay.addEventListener("click", (e) => {
    if (e.target === bannerOverlay) bannerOverlay.classList.remove("visible");
});

helpButton.addEventListener("click", () => {
    bannerOverlay.classList.add("visible");
});

bannerCloseBtn.addEventListener("click", () => {
    bannerOverlay.classList.remove("visible");
});

// =========================================================
// 5. ПАНЕЛИ «ЗАМЕЧЕННЫЕ» И «ПРОПАВШИЕ»
// =========================================================
const sidebarSeenLink        = document.getElementById("sidebar-seen-link");
const sidebarLostLink        = document.getElementById("sidebar-lost-link");

const sidebarAnimals         = document.getElementById("sidebar-animals");
const sidebarAnimalsBack     = document.getElementById("sidebar-animals-back");
const sidebarAnimalsList     = document.getElementById("sidebar-animals-list");

const sidebarLostAnimals     = document.getElementById("sidebar-lost-animals");
const sidebarLostAnimalsBack = document.getElementById("sidebar-lost-animals-back");
const sidebarLostAnimalsList = document.getElementById("sidebar-lost-animals-list");

const allMarkers = [];
const allLostAds = [];

// ---------------------------------------------------------
// Рендер панели «Замеченные животные»
// ---------------------------------------------------------
function renderAnimalsPanel() {
    sidebarAnimalsList.innerHTML = "";

    const sorted = [...allMarkers].reverse();

    const visible = activeFilterCenter
        ? sorted.filter(marker =>
            isInCircle(
                marker.lng,
                marker.lat,
                activeFilterCenter[0],
                activeFilterCenter[1],
                FILTER_RADIUS_SEEN_KM
            )
        )
        : sorted;

    if (visible.length === 0) {
        const empty = document.createElement("div");
        empty.className = "sidebar-animals-empty";
        empty.textContent = activeFilterCenter
            ? "В выбранной области нет замеченных животных"
            : "Пока нет замеченных животных";
        sidebarAnimalsList.appendChild(empty);
        return;
    }

    visible.forEach(marker => {
        const card = document.createElement("div");
        card.className = "animal-card";

        const photoStyle = marker.photo
            ? `style="background-image:url(${marker.photo})"`
            : "";

        const cardHelpedIcon = (marker.extras && marker.extras.ready)
            ? `
                <span class="pin-helped-icon">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    </svg>
                </span>
            `
            : "";

        card.innerHTML = `
            <div class="animal-card-photo" ${photoStyle}>
                ${cardHelpedIcon}
            </div>
            <div class="animal-card-separator"></div>
            <div class="animal-card-body">
                <div class="animal-card-label">Тип животного:</div>
                <div class="animal-card-value">${escapeHtml(marker.animal)}</div>

                <div class="animal-card-label">Окрас:</div>
                <div class="animal-card-value">${escapeHtml(marker.okras)}</div>

                <div class="animal-card-label">Дата:</div>
                <div class="animal-card-value">${escapeHtml(marker.date)}</div>

                <div class="animal-card-label">Время:</div>
                <div class="animal-card-value">${escapeHtml(marker.time)}</div>
            </div>
            <button class="animal-card-btn" type="button">Подробнее</button>
        `;

        card.querySelector(".animal-card-btn").addEventListener("click", () => {
            map.jumpTo({ center: [marker.lng, marker.lat] });

            openViewer(
                marker.photo,
                marker.animal,
                marker.okras,
                marker.time,
                marker.date,
                marker.extras
            );

            sidebarAnimals.classList.remove("open");
            sidebar.classList.remove("open");
        });

        sidebarAnimalsList.appendChild(card);
    });
}

// ---------------------------------------------------------
// Рендер панели «Пропавшие животные»
// ---------------------------------------------------------
function renderLostPanel() {
    sidebarLostAnimalsList.innerHTML = "";

    const sorted = [...allLostAds].reverse();

    const visible = activeLostFilterCenter
        ? sorted.filter(ad => {
            if (ad.lng == null || ad.lat == null) return false;
            return isInCircle(
                ad.lng,
                ad.lat,
                activeLostFilterCenter[0],
                activeLostFilterCenter[1],
                FILTER_RADIUS_LOST_KM
            );
        })
        : sorted;

    if (visible.length === 0) {
        const empty = document.createElement("div");
        empty.className = "sidebar-animals-empty";
        empty.textContent = activeLostFilterCenter
            ? "В выбранной области нет объявлений"
            : "Пока нет объявлений о пропаже";
        sidebarLostAnimalsList.appendChild(empty);
        return;
    }

    visible.forEach(ad => {
        const card = document.createElement("div");
        card.className = "animal-card";

        const photoStyle = ad.photo
            ? `style="background-image:url(${ad.photo})"`
            : "";

        card.innerHTML = `
            <div class="animal-card-photo" ${photoStyle}></div>
            <div class="animal-card-separator"></div>
            <div class="animal-card-body">
                <div class="animal-card-label">Тип животного:</div>
                <div class="animal-card-value">${escapeHtml(ad.animal)}</div>

                <div class="animal-card-label">Окрас:</div>
                <div class="animal-card-value">${escapeHtml(ad.okras)}</div>

                <div class="animal-card-label">Дата:</div>
                <div class="animal-card-value">${escapeHtml(ad.date)}</div>

                <div class="animal-card-label">Адрес пропажи:</div>
                <div class="animal-card-value">${escapeHtml(ad.address)}</div>
            </div>

            <div class="animal-card-expanded">
                <div class="animal-card-row">
                    <div class="animal-card-label">Кличка:</div>
                    <div class="animal-card-value">${escapeHtml(ad.nickname)}</div>
                </div>
                <div class="animal-card-row">
                    <div class="animal-card-label">Время пропажи:</div>
                    <div class="animal-card-value">${escapeHtml(ad.time)}</div>
                </div>
                <div class="animal-card-row">
                    <div class="animal-card-label">Характер:</div>
                    <div class="animal-card-value">${escapeHtml(ad.character)}</div>
                </div>
                <div class="animal-card-row">
                    <div class="animal-card-label">Контакт:</div>
                    <div class="animal-card-value">${escapeHtml(ad.contact)}</div>
                </div>
            </div>

            <button class="animal-card-btn" type="button">Подробнее</button>
        `;

        const btn = card.querySelector(".animal-card-btn");

        btn.addEventListener("click", () => {
            const expanded = card.classList.toggle("expanded");
            btn.textContent = expanded ? "Свернуть" : "Подробнее";
        });

        sidebarLostAnimalsList.appendChild(card);
    });
}

// ---------------------------------------------------------
// Открытие / закрытие панелей
// ---------------------------------------------------------
sidebarSeenLink.addEventListener("click", () => {
    sidebarLostAnimals.classList.remove("open");
    sidebarFilters.classList.remove("visible");

    renderAnimalsPanel();
    sidebarAnimals.classList.add("open");
});

sidebarAnimalsBack.addEventListener("click", () => {
    sidebarAnimals.classList.remove("open");
    sidebarFilters.classList.remove("visible");
});

sidebarLostLink.addEventListener("click", () => {
    sidebarAnimals.classList.remove("open");
    sidebarFilters.classList.remove("visible");

    renderLostPanel();
    sidebarLostAnimals.classList.add("open");
});

sidebarLostAnimalsBack.addEventListener("click", () => {
    sidebarLostAnimals.classList.remove("open");
    sidebarFilters.classList.remove("visible");
});

// =========================================================
// 6. КРЕСТИКИ ЗАКРЫТИЯ ОКОН
// =========================================================

document
    .querySelector("#modal-overlay .modal-close-btn")
    .addEventListener("click", closeModal);

document
    .querySelector("#lost-modal-overlay .modal-close-btn")
    .addEventListener("click", closeLostModal);

document
    .querySelector("#viewer-overlay .viewer-close-btn")
    .addEventListener("click", closeViewer);

// =========================================================
// 7. ФИЛЬТРЫ
// =========================================================
const filterToggleBtn      = document.getElementById("filter-toggle-btn");
const lostFilterToggleBtn  = document.getElementById("lost-filter-toggle-btn");
const sidebarFilters       = document.getElementById("sidebar-filters");
const filterAddressInput   = document.getElementById("filter-address");
const filterAddressLabel   = document.getElementById("filter-address-label");
const filterResetBtn       = document.getElementById("filter-reset-btn");
const filterApplyBtn       = document.getElementById("filter-apply-btn");
const filterCloseBtn       = document.getElementById("filter-close-btn");

const FILTER_RADIUS_SEEN_KM = 2;
const FILTER_RADIUS_LOST_KM = 4;

let filterMode = null;
let activeFilterCenter     = null;
let activeLostFilterCenter = null;

filterToggleBtn.addEventListener("click", () => {
    if (filterMode === "seen" && sidebarFilters.classList.contains("visible")) {
        sidebarFilters.classList.remove("visible");
        filterMode = null;
        return;
    }

    filterMode = "seen";
    filterAddressLabel.textContent = "Адрес поиска (2 км радиус)";
    filterAddressInput.value = "";
    sidebarFilters.classList.add("visible");
});

lostFilterToggleBtn.addEventListener("click", () => {
    if (filterMode === "lost" && sidebarFilters.classList.contains("visible")) {
        sidebarFilters.classList.remove("visible");
        filterMode = null;
        return;
    }

    filterMode = "lost";
    filterAddressLabel.textContent = "Адрес поиска объявлений";
    filterAddressInput.value = "";
    sidebarFilters.classList.add("visible");
});

filterCloseBtn.addEventListener("click", () => {
    sidebarFilters.classList.remove("visible");
    filterMode = null;
});

setupAddressField(filterAddressInput, formatFullAddress);

function createGeoJSONCircle(center, radiusKm, points = 64) {
    const coords = [];
    const distanceX = radiusKm / (111.320 * Math.cos(center[1] * Math.PI / 180));
    const distanceY = radiusKm / 110.574;

    for (let i = 0; i < points; i++) {
        const theta = (i / points) * (2 * Math.PI);
        const x = distanceX * Math.cos(theta);
        const y = distanceY * Math.sin(theta);
        coords.push([center[0] + x, center[1] + y]);
    }
    coords.push(coords[0]);

    return {
        type: "Feature",
        geometry: {
            type: "Polygon",
            coordinates: [coords]
        }
    };
}

function isInCircle(lng, lat, centerLng, centerLat, radiusKm) {
    const R = 6371;
    const dLat = (lat - centerLat) * Math.PI / 180;
    const dLng = (lng - centerLng) * Math.PI / 180;

    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(centerLat * Math.PI / 180) *
              Math.cos(lat * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c <= radiusKm;
}

function applySeenFilter(center) {
    if (map.getLayer("filter-circle-fill"))    map.removeLayer("filter-circle-fill");
    if (map.getLayer("filter-circle-outline")) map.removeLayer("filter-circle-outline");
    if (map.getSource("filter-circle"))        map.removeSource("filter-circle");

    map.addSource("filter-circle", {
        type: "geojson",
        data: createGeoJSONCircle(center, FILTER_RADIUS_SEEN_KM)
    });

    map.addLayer({
        id: "filter-circle-fill",
        type: "fill",
        source: "filter-circle",
        paint: {
            "fill-color": "#4a9eff",
            "fill-opacity": 0.12
        }
    });

    map.addLayer({
        id: "filter-circle-outline",
        type: "line",
        source: "filter-circle",
        paint: {
            "line-color": "#4a9eff",
            "line-width": 1.5,
            "line-opacity": 0.5
        }
    });

    activeFilterCenter = center;

    allMarkers.forEach(marker => {
        const inside = isInCircle(
            marker.lng, marker.lat,
            center[0], center[1],
            FILTER_RADIUS_SEEN_KM
        );
        const el = marker.instance.getElement();
        if (el) el.style.display = inside ? "" : "none";
    });

    renderAnimalsPanel();
}

function applyLostFilter(center) {
    activeLostFilterCenter = center;
    renderLostPanel();
}

function resetSeenFilter() {
    if (map.getLayer("filter-circle-fill"))    map.removeLayer("filter-circle-fill");
    if (map.getLayer("filter-circle-outline")) map.removeLayer("filter-circle-outline");
    if (map.getSource("filter-circle"))        map.removeSource("filter-circle");

    activeFilterCenter = null;

    allMarkers.forEach(marker => {
        const el = marker.instance.getElement();
        if (el) el.style.display = "";
    });

    renderAnimalsPanel();
}

function resetLostFilter() {
    activeLostFilterCenter = null;
    renderLostPanel();
}

filterApplyBtn.addEventListener("click", async () => {
    const query = filterAddressInput.value.trim();

    if (query.length < 3) {
        filterAddressInput.focus();
        return;
    }

    try {
        const url =
            "https://nominatim.openstreetmap.org/search" +
            "?format=json&limit=1&addressdetails=1&accept-language=ru" +
            "&q=" + encodeURIComponent(query);

        const res = await fetch(url);
        if (!res.ok) return;

        const data = await res.json();
        if (!data.length) return;

        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);

        if (filterMode === "seen") {
            applySeenFilter([lon, lat]);
            map.easeTo({ center: [lon, lat], duration: 800 });
        } else if (filterMode === "lost") {
            applyLostFilter([lon, lat]);
        }

    } catch (err) {
        console.error("Ошибка геокодирования адреса фильтра:", err);
    }
});

filterResetBtn.addEventListener("click", () => {
    if (filterMode === "seen") {
        resetSeenFilter();
    } else if (filterMode === "lost") {
        resetLostFilter();
    }

    filterAddressInput.value = "";
});

// =========================================================
// 8. ОБЩИЕ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =========================================================
function escapeHtml(str) {
    return String(str)
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

function updateMarkerScale() {
    const z = map.getZoom();

    const ZOOM_START = 0;
    const ZOOM_STOP  = 12;

    const SCALE_MIN  = 0.5;
    const SCALE_MAX  = 1.0;

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

function lon2tile(lon, zoom) {
    return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
}

function lat2tile(lat, zoom) {
    return Math.floor(
        (1 - Math.log(
            Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)
        ) / Math.PI) / 2 * Math.pow(2, zoom)
    );
}

function preloadMoscowRegion() {
    const bounds = { minLon: 35.0, maxLon: 40.0, minLat: 54.0, maxLat: 57.0 };
    const zooms = [5, 6, 7, 8, 9];
    const tileUrlTemplate = "https://tiles.openfreemap.org/planet/latest/{z}/{x}/{y}.pbf";

    let scheduled = 0;

    zooms.forEach(z => {
        const xMin = lon2tile(bounds.minLon, z);
        const xMax = lon2tile(bounds.maxLon, z);
        const yMin = lat2tile(bounds.maxLat, z);
        const yMax = lat2tile(bounds.minLat, z);

        for (let x = xMin; x <= xMax; x++) {
            for (let y = yMin; y <= yMax; y++) {
                const url = tileUrlTemplate
                    .replace("{z}", z).replace("{x}", x).replace("{y}", y);
                scheduled++;
                fetch(url, { mode: "cors" }).catch(() => {});
            }
        }
    });

    console.log(`🔄 Предзагрузка Москвы и области запущена (${scheduled} тайлов)`);
}

function setupTimeField(input, submitBtn) {
    input.addEventListener("keydown", (e) => {
        if (input.readOnly) return;
        if (e.key === "Enter") { e.preventDefault(); submitBtn.click(); return; }
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        const allowedKeys = ["Backspace","Delete","ArrowLeft","ArrowRight","Tab","Home","End"];
        if (allowedKeys.includes(e.key)) return;

        if (!/^\d$/.test(e.key)) { e.preventDefault(); return; }

        const digits = input.value.replace(/\D/g, "");
        if (digits.length >= 4) { e.preventDefault(); return; }

        const d = e.key;
        let allowed = true;

        if (digits.length === 0)      allowed = /^[0-2]$/.test(d);
        else if (digits.length === 1) allowed = digits[0] === "2" ? /^[0-3]$/.test(d) : /^\d$/.test(d);
        else if (digits.length === 2) allowed = /^[0-5]$/.test(d);
        else if (digits.length === 3) allowed = /^\d$/.test(d);

        if (!allowed) e.preventDefault();
    });

    input.addEventListener("input", () => {
        let digits = input.value.replace(/\D/g, "").slice(0, 4);
        let formatted = digits.length <= 2 ? digits : digits.slice(0, 2) + ":" + digits.slice(2);
        input.value = formatted;
        input.classList.remove("input-error");
    });
}

function setupDateField(input) {
    input.addEventListener("keydown", (e) => {
        if (input.readOnly) return;
        if (e.key === "Enter") { e.preventDefault(); return; }
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        const allowedKeys = ["Backspace","Delete","ArrowLeft","ArrowRight","Tab","Home","End"];
        if (allowedKeys.includes(e.key)) return;

        if (!/^\d$/.test(e.key)) { e.preventDefault(); return; }

        const digits = input.value.replace(/\D/g, "");
        if (digits.length >= 8) e.preventDefault();
    });

    input.addEventListener("input", () => {
        let digits = input.value.replace(/\D/g, "").slice(0, 8);
        let formatted;

        if (digits.length <= 2) formatted = digits;
        else if (digits.length <= 4) formatted = digits.slice(0, 2) + "." + digits.slice(2);
        else formatted = digits.slice(0, 2) + "." + digits.slice(2, 4) + "." + digits.slice(4);

        input.value = formatted;
        input.classList.remove("input-error");
    });
}

// =========================================================
// 9. АВТОПОДСКАЗКИ АДРЕСА
// =========================================================
const addressSuggestions = document.getElementById("address-suggestions");
let addressDebounceTimer = null;

function hideAddressSuggestions() {
    addressSuggestions.classList.remove("visible");
    addressSuggestions.innerHTML = "";
}

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

    if (!formatted.length) { hideAddressSuggestions(); return; }

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
        if (query.length < 3) { hideAddressSuggestions(); return; }

        addressDebounceTimer = setTimeout(async () => {
            try {
                const url =
                    "https://nominatim.openstreetmap.org/search" +
                    "?format=json&addressdetails=1&extratags=1&accept-language=ru&limit=8" +
                    "&q=" + encodeURIComponent(query);
                const res = await fetch(url, { headers: { "Accept-Language": "ru" } });
                if (!res.ok) { hideAddressSuggestions(); return; }
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

    inputEl.addEventListener("blur", () => setTimeout(hideAddressSuggestions, 200));

    const modal = inputEl.closest(".modal");
    if (modal) modal.addEventListener("scroll", hideAddressSuggestions);
}

// =========================================================
// 10. МОДАЛКА СОЗДАНИЯ МЕТКИ
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

document.addEventListener("mousemove", (event) => {
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;

    if (placingMode) {
        triangleCursor.style.left = lastMouseX + "px";
        triangleCursor.style.top  = lastMouseY + "px";
    }
});

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

    document.body.classList.add("modal-open");

    modalOverlay.classList.add("visible");
    setTimeout(() => timeInput.focus(), 0);
}

function closeModal() {
    modalOverlay.classList.remove("visible");
    plusButton.classList.remove("active");
    hideAddressSuggestions();
    document.body.classList.remove("modal-open");
}

plusButton.addEventListener("click", () => {
    if (modalOverlay.classList.contains("visible")) closeModal();
    else openModal();
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

photoDrop.addEventListener("click", () => photoInput.click());

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
    if (readyToggle.checked) readyExtra.classList.add("visible");
    else                     readyExtra.classList.remove("visible");
});

setupTimeField(timeInput, submitBtn);
setupDateField(dateInput);
setupAddressField(addressInput, formatFullAddress);

okrasInput.addEventListener("input", () => {
    if (isValidOkras(okrasInput.value)) okrasInput.classList.remove("input-error");
});

behaviorInput.addEventListener("input", () => {
    if (behaviorInput.value.trim() !== "") behaviorInput.classList.remove("input-error");
});

stateInput.addEventListener("input", () => {
    if (stateInput.value.trim() !== "") stateInput.classList.remove("input-error");
});

extraContactInp.addEventListener("input", () => {
    if (extraContactInp.value.trim() !== "") extraContactInp.classList.remove("input-error");
});

addressInput.addEventListener("input", () => {
    if (addressInput.value.trim() !== "") addressInput.classList.remove("input-error");
});

okrasInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submitBtn.click(); }
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

    if (!isValidOkras(okras))  { okrasInput.classList.add("input-error"); hasError = true; }
    if (!isValidTime(time))    { timeInput.classList.add("input-error");  hasError = true; }
    if (!isValidDate(date))    { dateInput.classList.add("input-error");  hasError = true; }
    if (!pendingPhoto)         { photoDrop.classList.add("drop-error");   hasError = true; }

    const extrasVisible = extraFields.classList.contains("visible");

    if (extrasVisible) {
        if (behaviorInput.value.trim() === "") { behaviorInput.classList.add("input-error"); hasError = true; }
        if (stateInput.value.trim() === "")    { stateInput.classList.add("input-error");    hasError = true; }

        if (readyToggle.checked) {
            if (extraContactInp.value.trim() === "") { extraContactInp.classList.add("input-error"); hasError = true; }
            if (addressInput.value.trim() === "")    { addressInput.classList.add("input-error");    hasError = true; }
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

    if (isMobileDevice()) {
        enableMobilePlacingMode();
    } else {
        enablePlacingMode();
    }
});

modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
});

// =========================================================
// 11. МОБИЛЬНЫЙ РЕЖИМ ПОСТАНОВКИ МЕТКИ
// =========================================================

const isMobileDevice = () =>
    window.matchMedia("(max-width: 768px)").matches;

let mobilePlacingMode = false;

const mobilePlaceOverlay   = document.getElementById("mobile-place-overlay");
const mobilePreviewPhoto   = document.getElementById("mobile-preview-photo");
const mobilePreviewAnimal  = document.getElementById("mobile-preview-animal");
const mobilePreviewOkras   = document.getElementById("mobile-preview-okras");
const mobilePreviewDate    = document.getElementById("mobile-preview-date");
const mobilePreviewText    = document.getElementById("mobile-preview-text");
const mobilePlaceCancel    = document.getElementById("mobile-place-cancel");
const mobilePlaceConfirm   = document.getElementById("mobile-place-confirm");

function enableMobilePlacingMode() {
    mobilePlacingMode = true;
    document.body.classList.add("placing-mode");

    mobilePreviewAnimal.textContent = pendingAnimal;
    mobilePreviewOkras.textContent  = truncateOkras(pendingOkras);
    mobilePreviewDate.textContent   = formatDateShort(pendingDate);
    mobilePreviewText.textContent   = pendingTime;

    if (pendingPhoto) {
        mobilePreviewPhoto.style.backgroundImage = `url(${pendingPhoto})`;
        mobilePreviewPhoto.style.display = "block";
    } else {
        mobilePreviewPhoto.style.backgroundImage = "";
        mobilePreviewPhoto.style.display = "none";
    }

    mobilePlaceOverlay.classList.add("visible");
}

function disableMobilePlacingMode() {
    mobilePlacingMode = false;
    document.body.classList.remove("placing-mode");
    mobilePlaceOverlay.classList.remove("visible");
}

mobilePlaceCancel.addEventListener("click", () => {
    disableMobilePlacingMode();

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
});

mobilePlaceConfirm.addEventListener("click", async () => {
    const center = map.getCenter();

    await placeMarkerAt(
        center.lng,
        center.lat,
        pendingAnimal,
        pendingOkras,
        pendingTime,
        pendingDate,
        pendingPhoto,
        {
            behavior: pendingBehavior,
            state:    pendingState,
            ready:    pendingReady,
            contact:  pendingContact,
            address:  pendingAddress
        }
    );

    disableMobilePlacingMode();

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
});

// =========================================================
// 12. МОДАЛКА «Потерял животное»
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

    document.body.classList.add("modal-open");

    lostModalOverlay.classList.add("visible");
}

function closeLostModal() {
    lostModalOverlay.classList.remove("visible");
    hideAddressSuggestions();
    document.body.classList.remove("modal-open");
}

lostButton.addEventListener("click", () => {
    if (lostModalOverlay.classList.contains("visible")) closeLostModal();
    else openLostModal();
});

lostPhotoDrop.addEventListener("click", () => lostPhotoInput.click());

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
    if (lostNicknameInput.value.trim() !== "") lostNicknameInput.classList.remove("input-error");
});
lostCharacterInput.addEventListener("input", () => {
    if (lostCharacterInput.value.trim() !== "") lostCharacterInput.classList.remove("input-error");
});
lostContactInput.addEventListener("input", () => {
    if (lostContactInput.value.trim() !== "") lostContactInput.classList.remove("input-error");
});
lostOkrasInput.addEventListener("input", () => {
    if (isValidOkras(lostOkrasInput.value)) lostOkrasInput.classList.remove("input-error");
});
lostAddressInput.addEventListener("input", () => {
    if (lostAddressInput.value.trim() !== "") lostAddressInput.classList.remove("input-error");
});

lostSubmitBtn.addEventListener("click", async () => {
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

    if (nickname === "")              { lostNicknameInput.classList.add("input-error");  hasError = true; }
    if (character === "")             { lostCharacterInput.classList.add("input-error"); hasError = true; }
    if (contact === "")               { lostContactInput.classList.add("input-error");   hasError = true; }
    if (!isValidOkras(okras))         { lostOkrasInput.classList.add("input-error");     hasError = true; }
    if (!isValidTime(time))           { lostTimeInput.classList.add("input-error");      hasError = true; }
    if (!isValidDate(date))           { lostDateInput.classList.add("input-error");      hasError = true; }
    if (address === "")               { lostAddressInput.classList.add("input-error");   hasError = true; }
    if (!lostPhoto)                   { lostPhotoDrop.classList.add("drop-error");       hasError = true; }

    if (hasError) return;

    // Геокодируем адрес потери
    let adLng = null;
    let adLat = null;

    try {
        const url =
            "https://nominatim.openstreetmap.org/search" +
            "?format=json&limit=1&accept-language=ru" +
            "&q=" + encodeURIComponent(address);
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            if (data.length) {
                adLat = parseFloat(data[0].lat);
                adLng = parseFloat(data[0].lon);
            }
        }
    } catch (err) {
        console.error("Не удалось геокодировать адрес потери:", err);
    }

    const payload = {
        nickname,
        character,
        contact,
        species:    lostAnimalSelect.value,
        color:      okras,
        lost_time:  time,
        lost_date:  date,
        address,
        latitude:   adLat,
        longitude:  adLng,
        photo_data: lostPhoto
    };

    let saved;
    try {
        saved = await apiCreateLostAd(payload);
    } catch (err) {
        console.error("Не удалось сохранить объявление:", err);
        alert("Не удалось сохранить объявление. Проверьте соединение.");
        return;
    }

    addLostAdToMemory(saved);
    closeLostModal();
});

lostModalOverlay.addEventListener("click", (e) => {
    if (e.target === lostModalOverlay) closeLostModal();
});

// =========================================================
// 13. ПРОСМОТРЩИК МЕТКИ
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
    viewerText.textContent   = (date && time)
        ? (date + "\u00A0\u00A0\u00A0" + time)
        : (date || time || "");

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
    if (e.target === viewerOverlay) closeViewer();
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        if (mobilePlacingMode) {
            disableMobilePlacingMode();
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
        }

        if (viewerOverlay.classList.contains("visible"))     closeViewer();
        if (bannerOverlay.classList.contains("visible"))     bannerOverlay.classList.remove("visible");
        if (modalOverlay.classList.contains("visible"))      closeModal();
        if (lostModalOverlay.classList.contains("visible"))  closeLostModal();
        if (sidebarAnimals.classList.contains("open"))       sidebarAnimals.classList.remove("open");
        if (sidebarLostAnimals.classList.contains("open"))   sidebarLostAnimals.classList.remove("open");
        if (sidebarFilters.classList.contains("visible"))    sidebarFilters.classList.remove("visible");
    }
});

// =========================================================
// 14. СОЗДАНИЕ МЕТКИ — ОБЩИЕ ФУНКЦИИ
// =========================================================

// Рисует метку на карте по данным с сервера (уже с id)
function addMarkerToMapFromServer(row) {
    const el = document.createElement("div");
    el.className = "map-marker";

    const extras = {
        behavior: row.behavior || "",
        state:    row.state    || "",
        ready:    !!row.ready,
        contact:  row.contact  || "",
        address:  row.address  || ""
    };

    let helpedIcon = "";
    if (extras.ready) {
        helpedIcon = `
            <span class="pin-helped-icon">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
            </span>
        `;
    }

    const photoHtml = row.photo_data
        ? `<div class="pin-photo" style="background-image:url(${row.photo_data})"></div>`
        : "";

    el.innerHTML = `
        <div class="pin">
            <div class="pin-body">
                ${helpedIcon}
                ${photoHtml}
                <div class="pin-text">${escapeHtml(row.species)}</div>
                <div class="pin-text">${escapeHtml(truncateOkras(row.color))}</div>
                <div class="pin-text">${escapeHtml(formatDateShort(row.observed_date))}</div>
                <div class="pin-text">${escapeHtml(row.observed_time)}</div>
            </div>
            <div class="pin-tip"></div>
        </div>
    `;

    const pinBody = el.querySelector(".pin-body");
    pinBody.addEventListener("click", (ev) => {
        if (placingMode || mobilePlacingMode) return;
        ev.stopPropagation();
        openViewer(
            row.photo_data,
            row.species,
            row.color,
            row.observed_time,
            row.observed_date,
            extras
        );
    });

    const markerInstance = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([row.longitude, row.latitude])
        .addTo(map);

    const newMarkerData = {
        id:       row.id,
        lng:      row.longitude,
        lat:      row.latitude,
        animal:   row.species,
        okras:    row.color,
        time:     row.observed_time,
        date:     row.observed_date,
        photo:    row.photo_data,
        extras,
        instance: markerInstance
    };

    allMarkers.push(newMarkerData);

    if (activeFilterCenter) {
        const inside = isInCircle(
            newMarkerData.lng, newMarkerData.lat,
            activeFilterCenter[0], activeFilterCenter[1],
            FILTER_RADIUS_SEEN_KM
        );
        const elStyle = markerInstance.getElement();
        if (elStyle) elStyle.style.display = inside ? "" : "none";
    }

    return newMarkerData;
}

// Отправляет метку на сервер и рисует её
async function placeMarkerAt(lng, lat, animal, okras, time, date, photo, extras) {
    const payload = {
        species:       animal,
        color:         okras,
        observed_time: time,
        observed_date: date,
        latitude:      lng,
        longitude:     lat,
        photo_data:    photo,
        behavior:      extras?.behavior || "",
        state:         extras?.state    || "",
        ready:         !!extras?.ready,
        contact:       extras?.contact  || "",
        address:       extras?.address  || ""
    };

    let saved;
    try {
        saved = await apiCreateAnimal(payload);
    } catch (err) {
        console.error("Не удалось сохранить метку:", err);
        alert("Не удалось сохранить метку на сервере. Проверьте соединение.");
        return null;
    }

    return addMarkerToMapFromServer(saved);
}

// Кладёт данные с сервера в локальный массив объявлений
function addLostAdToMemory(row) {
    allLostAds.push({
        id:        row.id,
        nickname:  row.nickname,
        character: row.character,
        contact:   row.contact,
        animal:    row.species,
        okras:     row.color,
        time:      row.lost_time,
        date:      row.lost_date,
        address:   row.address,
        photo:     row.photo_data,
        lng:       row.longitude,
        lat:       row.latitude
    });
}

// =========================================================
// 15. КЛИК ПО КАРТЕ — ПК-РЕЖИМ
// =========================================================
map.on("click", async (e) => {
    if (!placingMode) return;
    if (mobilePlacingMode) return;

    await placeMarkerAt(
        e.lngLat.lng,
        e.lngLat.lat,
        pendingAnimal,
        pendingOkras,
        pendingTime,
        pendingDate,
        pendingPhoto,
        {
            behavior: pendingBehavior,
            state:    pendingState,
            ready:    pendingReady,
            contact:  pendingContact,
            address:  pendingAddress
        }
    );

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
// 16. ЗАГРУЗКА И ОТЛАДКА
// =========================================================
map.on("error", (e) => {
    console.error("Ошибка карты:", e.error);
});

map.on("load", async () => {
    console.log("✅ Карта успешно загружена!");
    updateMarkerScale();
    preloadMoscowRegion();

    // Загрузка сохранённых меток
    try {
        const animals = await apiGetAnimals();
        animals.forEach(addMarkerToMapFromServer);
        console.log(`Восстановлено меток: ${animals.length}`);
    } catch (err) {
        console.error("Ошибка загрузки меток:", err);
    }

    // Загрузка сохранённых объявлений
    try {
        const ads = await apiGetLostAds();
        ads.forEach(addLostAdToMemory);
        console.log(`Восстановлено объявлений: ${ads.length}`);
    } catch (err) {
        console.error("Ошибка загрузки объявлений:", err);
    }
});

map.on("zoom", updateMarkerScale);