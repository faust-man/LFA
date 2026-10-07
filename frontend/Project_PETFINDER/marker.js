// =========================================================
// СОЗДАНИЕ МЕТКИ НА КАРТЕ
// =========================================================
// Две функции:
//   addMarkerToMapFromServer — рисует метку по объекту с сервера
//   placeMarkerAt — отправляет данные на сервер, ждёт ответ,
//                   потом вызывает addMarkerToMapFromServer
// =========================================================

// ---------------------------------------------------------
// Рисует метку по данным с сервера. Используется и при
// создании, и при загрузке всех меток. Отделена от отправки,
// чтобы можно было восстанавливать метки из БД при старте.
// ---------------------------------------------------------
function addMarkerToMapFromServer(row) {
    const el = document.createElement("div");
    el.className = "map-marker";

    // Данные с сервера имеют плоскую структуру —
    // собираем extras из отдельных полей
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

// ---------------------------------------------------------
// Отправляет данные на сервер, ждёт ответ, потом рисует метку.
// Именно эту функцию вызывают main.js и mobile-place.js.
// ---------------------------------------------------------
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
        alert("Не удалось сохранить метку. Проверьте соединение.");
        return null;
    }

    // Сервер вернул сохранённый объект с id — рисуем его
    return addMarkerToMapFromServer(saved);
}