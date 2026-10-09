// =========================================================
// МОДАЛКА СОЗДАНИЯ МЕТКИ («+»)
// =========================================================
// Собирает данные из формы, валидирует их. После «Поставить
// метку» пользователь переходит в режим установки — на ПК
// это превью-пин за курсором, на мобильном — фиксированный
// пин и кнопки (см. mobile-place.js).
// =========================================================

// -------- DOM модалки --------
const plusButton     = document.getElementById("plus-button");
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
const moreBtn        = document.getElementById("more-btn");
const extraFields    = document.getElementById("extra-fields");
const behaviorInput  = document.getElementById("behavior-input");
const stateInput     = document.getElementById("state-input");
const readyToggle    = document.getElementById("ready-toggle");
const readyExtra     = document.getElementById("ready-extra");
const extraContactInp = document.getElementById("extra-contact-input");
const addressInput   = document.getElementById("address-input");

// -------- Превью-курсор для ПК --------
const triangleCursor = document.getElementById("triangle-cursor");
const previewPhoto   = document.getElementById("preview-photo");
const previewAnimal  = document.getElementById("preview-animal");
const previewOkras   = document.getElementById("preview-okras");
const previewDate    = document.getElementById("preview-date");
const previewText    = document.getElementById("preview-text");

// Отслеживаем позицию курсора — нужно, чтобы превью-пин
// появлялся сразу в правильной точке без задержки
document.addEventListener("mousemove", (event) => {
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;

    if (placingMode) {
        triangleCursor.style.left = lastMouseX + "px";
        triangleCursor.style.top  = lastMouseY + "px";
    }
});

// Включить режим постановки метки на ПК
function enablePlacingMode() {
    placingMode = true;
    document.body.classList.add("placing-mode");
    map.getCanvas().style.cursor = "none";

    // Заполняем превью-пин данными из pending-буферов
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

// Выключить режим
function disablePlacingMode() {
    placingMode = false;
    document.body.classList.remove("placing-mode");
    triangleCursor.style.display = "none";
    map.getCanvas().style.cursor = "";
}

// ---------------------------------------------------------
// Открытие / закрытие модалки
// ---------------------------------------------------------
function openModal() {
    document.getElementById("lost-modal-overlay").classList.remove("visible");

    disablePlacingMode();
    plusButton.classList.add("active");

    // Сбрасываем все поля
    pendingPhoto = null;
    photoDrop.classList.remove("has-photo");
    photoDrop.classList.remove("drop-error");
    photoDrop.style.backgroundImage = "";
    photoInput.value = "";

    animalSelect.value = "Кошка";

    okrasInput.value = "";
    okrasInput.classList.remove("input-error");

    // Время и дата подставляются текущие, поле readOnly
    timeInput.value = getCurrentTimeString();
    timeInput.readOnly = true;
    timeInput.classList.remove("input-error");

    dateInput.value = getCurrentDateString();
    dateInput.readOnly = true;
    dateInput.classList.remove("input-error");

    // Скрываем блок доп. полей и сбрасываем его
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

    // На мобильном скрываем верхние кнопки (см. CSS)
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

// Кнопка-крестик
document
    .querySelector("#modal-overlay .modal-close-btn")
    .addEventListener("click", closeModal);

// ---------------------------------------------------------
// Время / дата
// ---------------------------------------------------------
// Кнопка «изм.» разблокирует поле и очищает его
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

// ---------------------------------------------------------
// Загрузка фото
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// «Рассказать больше» и ползунок «Готов приютить»
// ---------------------------------------------------------
moreBtn.addEventListener("click", () => {
    moreBtn.style.display = "none";
    extraFields.classList.add("visible");
});

readyToggle.addEventListener("change", () => {
    if (readyToggle.checked) readyExtra.classList.add("visible");
    else                     readyExtra.classList.remove("visible");
});

// ---------------------------------------------------------
// Подключение масок и подсказок
// ---------------------------------------------------------
setupTimeField(timeInput, submitBtn);
setupDateField(dateInput);
setupAddressField(addressInput, formatFullAddress);

// Снимаем красную подсветку при вводе корректного значения
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

// Enter в поле «Окрас» = отправка формы
okrasInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submitBtn.click(); }
});

// ---------------------------------------------------------
// Кнопка «Поставить метку»
// ---------------------------------------------------------
submitBtn.addEventListener("click", () => {
    const animal = animalSelect.value;
    const okras  = okrasInput.value.trim();
    const time   = timeInput.value.trim();
    const date   = dateInput.value.trim();

    // Сбрасываем все предыдущие подсветки
    okrasInput.classList.remove("input-error");
    timeInput.classList.remove("input-error");
    dateInput.classList.remove("input-error");
    photoDrop.classList.remove("drop-error");
    behaviorInput.classList.remove("input-error");
    stateInput.classList.remove("input-error");
    extraContactInp.classList.remove("input-error");
    addressInput.classList.remove("input-error");

    let hasError = false;

    if (!isValidOkras(okras)) { okrasInput.classList.add("input-error"); hasError = true; }
    if (!isValidTime(time))   { timeInput.classList.add("input-error");  hasError = true; }
    if (!isValidDate(date))   { dateInput.classList.add("input-error");  hasError = true; }
    if (!pendingPhoto)        { photoDrop.classList.add("drop-error");   hasError = true; }

    // Проверяем доп. поля, только если раскрыт блок «Рассказать больше»
    const extrasVisible = extraFields.classList.contains("visible");
    if (extrasVisible) {
        if (behaviorInput.value.trim() === "") { behaviorInput.classList.add("input-error"); hasError = true; }
        if (stateInput.value.trim() === "")    { stateInput.classList.add("input-error");    hasError = true; }

        // Если ползунок на «Да» — контакт и адрес тоже обязательны
        if (readyToggle.checked) {
            if (extraContactInp.value.trim() === "") { extraContactInp.classList.add("input-error"); hasError = true; }
            if (addressInput.value.trim() === "")    { addressInput.classList.add("input-error");    hasError = true; }
        }
    }

    if (hasError) return;

    // Складываем всё в pending-буферы
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

    // На мобильном / ПК — разные режимы
    if (isMobileDevice()) {
        enableMobilePlacingMode();   // см. mobile-place.js
    } else {
        enablePlacingMode();
    }
});

// Клик по фону модалки закрывает её
modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
});