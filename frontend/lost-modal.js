// =========================================================
// МОДАЛКА «ПОТЕРЯЛ ЖИВОТНОЕ»
// =========================================================
// Анкета о пропаже питомца. Собранные данные идут в массив
// allLostAds, потом рендерятся в панели «Пропавшие».
// =========================================================

// -------- DOM --------
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

// Маски и подсказки
setupTimeField(lostTimeInput, lostSubmitBtn);
setupDateField(lostDateInput);
setupAddressField(lostAddressInput, formatShortAddress);

// ---------------------------------------------------------
// Открытие / закрытие
// ---------------------------------------------------------
function openLostModal() {
    modalOverlay.classList.remove("visible");
    plusButton.classList.remove("active");
    disablePlacingMode();

    // Полный сброс полей
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

// Кнопка-крестик
document
    .querySelector("#lost-modal-overlay .modal-close-btn")
    .addEventListener("click", closeLostModal);

// ---------------------------------------------------------
// Фото
// ---------------------------------------------------------
lostPhotoDrop.addEventListener("click", () => lostPhotoInput.click());

lostPhotoInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
        alert("Фото должно быть не больше 5 МБ");
        lostPhotoInput.value = "";
        return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
        lostPhoto = ev.target.result;
        lostPhotoDrop.style.backgroundImage = `url(${lostPhoto})`;
        lostPhotoDrop.classList.add("has-photo");
        lostPhotoDrop.classList.remove("drop-error");
    };
    reader.readAsDataURL(file);
});

// ---------------------------------------------------------
// Время / дата
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// Снятие подсветки ошибок при вводе
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// Кнопка «Разместить объявление»
// ---------------------------------------------------------
lostSubmitBtn.addEventListener("click", async () => {
    const nickname  = lostNicknameInput.value.trim();
    const character = lostCharacterInput.value.trim();
    const contact   = lostContactInput.value.trim();
    const okras     = lostOkrasInput.value.trim();
    const time      = lostTimeInput.value.trim();
    const date      = lostDateInput.value.trim();
    const address   = lostAddressInput.value.trim();

    // Сброс подсветок
    lostNicknameInput.classList.remove("input-error");
    lostCharacterInput.classList.remove("input-error");
    lostContactInput.classList.remove("input-error");
    lostOkrasInput.classList.remove("input-error");
    lostTimeInput.classList.remove("input-error");
    lostDateInput.classList.remove("input-error");
    lostAddressInput.classList.remove("input-error");
    lostPhotoDrop.classList.remove("drop-error");

    let hasError = false;

    if (nickname === "")      { lostNicknameInput.classList.add("input-error");  hasError = true; }
    if (character === "")     { lostCharacterInput.classList.add("input-error"); hasError = true; }
    if (contact === "")       { lostContactInput.classList.add("input-error");   hasError = true; }
    if (!isValidOkras(okras)) { lostOkrasInput.classList.add("input-error");     hasError = true; }
    if (!isValidTime(time))   { lostTimeInput.classList.add("input-error");      hasError = true; }
    if (!isValidDate(date))   { lostDateInput.classList.add("input-error");      hasError = true; }
    if (address === "")       { lostAddressInput.classList.add("input-error");   hasError = true; }
    if (!lostPhoto)           { lostPhotoDrop.classList.add("drop-error");       hasError = true; }

    if (hasError) return;

    // Пытаемся получить координаты адреса, чтобы потом можно
    // было фильтровать объявления по кругу
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
        alert(err.message || "Не удалось сохранить объявление. Проверьте соединение.");
        return;
    }

    // Складываем ответ сервера (уже с id) в массив — теперь
    // объявление появится в панели «Пропавшие»
    addLostAdToMemory(saved);

    closeLostModal();
});

// ---------------------------------------------------------
// Кладёт данные с сервера в локальный массив объявлений.
// Используется и при создании, и при загрузке с сервера.
// ---------------------------------------------------------
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

// Клик по фону закрывает
lostModalOverlay.addEventListener("click", (e) => {
    if (e.target === lostModalOverlay) closeLostModal();
});
