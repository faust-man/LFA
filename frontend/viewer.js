// =========================================================
// ПРОСМОТРЩИК МЕТКИ
// =========================================================
// Открывается по клику на метку на карте или по кнопке
// «Подробнее» в карточке. Показывает фото, тип, окрас,
// дату/время и все дополнительные поля.
// =========================================================

const viewerOverlay = document.getElementById("viewer-overlay");
const viewerPhoto   = document.getElementById("viewer-photo");
const viewerAnimal  = document.getElementById("viewer-animal");
const viewerOkras   = document.getElementById("viewer-okras");
const viewerText    = document.getElementById("viewer-text");
const viewerExtra   = document.getElementById("viewer-extra");

// Открыть просмотрщик.
// photo  — base64 фото или null
// animal — «Кошка» / «Собака»
// okras  — окрас
// time   — ЧЧ:ММ
// date   — ДД.ММ.ГГГГ
// extras — объект { behavior, state, ready, contact, address }
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
    // Три неразрывных пробела между датой и временем — чтобы
    // они визуально не слипались
    viewerText.textContent   = (date && time)
        ? (date + "\u00A0\u00A0\u00A0" + time)
        : (date || time || "");

    viewerExtra.innerHTML = "";

    if (extras) {
        // Поведение животного
        if (extras.behavior) {
            const item = document.createElement("div");
            item.className = "viewer-extra-item";
            item.innerHTML = `
                <div class="viewer-extra-label">Поведение животного</div>
                <div class="viewer-extra-value">${escapeHtml(extras.behavior)}</div>
            `;
            viewerExtra.appendChild(item);
        }

        // Состояние животного
        if (extras.state) {
            const item = document.createElement("div");
            item.className = "viewer-extra-item";
            item.innerHTML = `
                <div class="viewer-extra-label">Состояние животного</div>
                <div class="viewer-extra-value">${escapeHtml(extras.state)}</div>
            `;
            viewerExtra.appendChild(item);
        }

        // Блок «Человек временно приютил это животное» — только
        // если пользователь переключил ползунок на «Да»
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

// Закрыть просмотрщик
function closeViewer() {
    viewerOverlay.classList.remove("visible");
    viewerPhoto.src = "";
}

// Клик по затемнённому фону (не по самому фото) закрывает
viewerOverlay.addEventListener("click", (e) => {
    if (e.target === viewerOverlay) closeViewer();
});

// Кнопка-крестик в правом верхнем углу
document
    .querySelector("#viewer-overlay .viewer-close-btn")
    .addEventListener("click", closeViewer);