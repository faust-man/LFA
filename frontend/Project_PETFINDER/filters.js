// =========================================================
// ФИЛЬТРЫ
// =========================================================
// Два режима: "seen" (2 км, круг на карте) и "lost"
// (4 км, без круга). Оба находят адрес через Nominatim
// и фильтруют соответствующие массивы.
// =========================================================

// -------- DOM --------
const filterToggleBtn     = document.getElementById("filter-toggle-btn");
const lostFilterToggleBtn = document.getElementById("lost-filter-toggle-btn");
const sidebarFilters      = document.getElementById("sidebar-filters");
const filterAddressInput  = document.getElementById("filter-address");
const filterAddressLabel  = document.getElementById("filter-address-label");
const filterResetBtn      = document.getElementById("filter-reset-btn");
const filterApplyBtn      = document.getElementById("filter-apply-btn");
const filterCloseBtn      = document.getElementById("filter-close-btn");

// Подключаем автоподсказки к полю адреса фильтра
setupAddressField(filterAddressInput, formatFullAddress);

// ---------------------------------------------------------
// Кнопки-фильтры в шапках панелей
// ---------------------------------------------------------
// Нажатие на кнопку-фильтр в панели «Замеченные» открывает
// окно фильтров в режиме "seen". Повторное нажатие — закрывает.
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

// Крестик в правом верхнем углу окна фильтров
filterCloseBtn.addEventListener("click", () => {
    sidebarFilters.classList.remove("visible");
    filterMode = null;
});

// ---------------------------------------------------------
// Геометрия
// ---------------------------------------------------------

// Строит GeoJSON-полигон, приближающий круг радиуса radiusKm
// вокруг center. Используется для слоя заливки и обводки.
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
        geometry: { type: "Polygon", coordinates: [coords] }
    };
}

// Проверяет, попадает ли точка (lng, lat) в круг радиуса
// radiusKm с центром (centerLng, centerLat).
// Формула гаверсинуса для расстояния между точками на сфере.
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

// ---------------------------------------------------------
// Применение и сброс фильтров
// ---------------------------------------------------------

// Фильтр «Замеченные»: добавляет круг на карту, прячет метки
// вне круга и обновляет панель.
function applySeenFilter(center) {
    // Удаляем старый круг, если был
    if (map.getLayer("filter-circle-fill"))    map.removeLayer("filter-circle-fill");
    if (map.getLayer("filter-circle-outline")) map.removeLayer("filter-circle-outline");
    if (map.getSource("filter-circle"))        map.removeSource("filter-circle");

    // Добавляем новый
    map.addSource("filter-circle", {
        type: "geojson",
        data: createGeoJSONCircle(center, FILTER_RADIUS_SEEN_KM)
    });

    map.addLayer({
        id: "filter-circle-fill",
        type: "fill",
        source: "filter-circle",
        paint: { "fill-color": "#4a9eff", "fill-opacity": 0.12 }
    });

    map.addLayer({
        id: "filter-circle-outline",
        type: "line",
        source: "filter-circle",
        paint: { "line-color": "#4a9eff", "line-width": 1.5, "line-opacity": 0.5 }
    });

    activeFilterCenter = center;

    // Прячем/показываем метки на карте
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

// Фильтр «Пропавшие»: круг не рисуется, только фильтрует
// список карточек.
function applyLostFilter(center) {
    activeLostFilterCenter = center;
    renderLostPanel();
}

function resetSeenFilter() {
    if (map.getLayer("filter-circle-fill"))    map.removeLayer("filter-circle-fill");
    if (map.getLayer("filter-circle-outline")) map.removeLayer("filter-circle-outline");
    if (map.getSource("filter-circle"))        map.removeSource("filter-circle");

    activeFilterCenter = null;

    // Показываем все метки
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

// ---------------------------------------------------------
// Кнопка «Применить»
// ---------------------------------------------------------
// Геокодирует введённый адрес и вызывает соответствующий
// apply-фильтр. Для «Замеченных» ещё и плавно переносит карту.
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

// ---------------------------------------------------------
// Кнопка «Сбросить»
// ---------------------------------------------------------
filterResetBtn.addEventListener("click", () => {
    if (filterMode === "seen")      resetSeenFilter();
    else if (filterMode === "lost") resetLostFilter();

    filterAddressInput.value = "";
});