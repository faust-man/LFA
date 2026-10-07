// =========================================================
// МОБИЛЬНЫЙ РЕЖИМ ПОСТАНОВКИ МЕТКИ
// =========================================================
// Активируется, когда пользователь на мобильном заполнил
// модалку «+» и нажал «Поставить метку». Показывает пин
// по центру экрана и две кнопки: отмена и подтверждение.
// На ПК не используется (там превью-пин за курсором).
// =========================================================

const mobilePlaceOverlay   = document.getElementById("mobile-place-overlay");
const mobilePreviewPhoto   = document.getElementById("mobile-preview-photo");
const mobilePreviewAnimal  = document.getElementById("mobile-preview-animal");
const mobilePreviewOkras   = document.getElementById("mobile-preview-okras");
const mobilePreviewDate    = document.getElementById("mobile-preview-date");
const mobilePreviewText    = document.getElementById("mobile-preview-text");
const mobilePlaceCancel    = document.getElementById("mobile-place-cancel");
const mobilePlaceConfirm   = document.getElementById("mobile-place-confirm");

// Включить режим. Заполняем фиксированный пин текущими
// pending-данными.
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

// Выключить режим. Не очищает pending — это делает
// вызывающий код.
function disableMobilePlacingMode() {
    mobilePlacingMode = false;
    document.body.classList.remove("placing-mode");
    mobilePlaceOverlay.classList.remove("visible");
}

// -------- Кнопка «крестик» — отмена --------
mobilePlaceCancel.addEventListener("click", () => {
    disableMobilePlacingMode();

    // Чистим буферы, чтобы данные не «утекли» в следующую метку
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

// -------- Кнопка «галочка» — поставить метку --------
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