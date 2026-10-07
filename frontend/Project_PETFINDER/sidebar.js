// =========================================================
// БОКОВЫЕ ПАНЕЛИ
// =========================================================
// Гамбургер открывает основное меню со ссылками. Каждая
// ссылка открывает свою панель. Панели рендерят карточки
// из массивов allMarkers и allLostAds.
// =========================================================

// -------- Основное меню и ссылки --------
const menuButton = document.getElementById("menu-button");
const sidebar    = document.getElementById("sidebar");

const sidebarSeenLink = document.getElementById("sidebar-seen-link");
const sidebarLostLink = document.getElementById("sidebar-lost-link");

// -------- Панель «Замеченные» --------
const sidebarAnimals         = document.getElementById("sidebar-animals");
const sidebarAnimalsBack     = document.getElementById("sidebar-animals-back");
const sidebarAnimalsList     = document.getElementById("sidebar-animals-list");

// -------- Панель «Пропавшие» --------
const sidebarLostAnimals     = document.getElementById("sidebar-lost-animals");
const sidebarLostAnimalsBack = document.getElementById("sidebar-lost-animals-back");
const sidebarLostAnimalsList = document.getElementById("sidebar-lost-animals-list");

// Открытие/закрытие основного меню. Если закрываем — прячем
// и все вложенные панели, и фильтры.
menuButton.addEventListener("click", () => {
    sidebar.classList.toggle("open");

    if (!sidebar.classList.contains("open")) {
        sidebarAnimals.classList.remove("open");
        sidebarLostAnimals.classList.remove("open");
        sidebarFilters.classList.remove("visible");
    }
});

// ---------------------------------------------------------
// Рендер панели «Замеченные животные»
// ---------------------------------------------------------
// При активном фильтре показывает только те метки, что
// попали в круговую область. Иначе — все метки в обратном
// порядке (свежие сверху).
function renderAnimalsPanel() {
    sidebarAnimalsList.innerHTML = "";

    const sorted = [...allMarkers].reverse();

    const visible = activeFilterCenter
        ? sorted.filter(marker =>
            isInCircle(
                marker.lng, marker.lat,
                activeFilterCenter[0], activeFilterCenter[1],
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

        // Красное сердечко поверх фото, если животное приютили
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

        // «Подробнее» → переносим карту к метке и открываем
        // просмотрщик. Панели закрываем, чтобы не мешать.
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
                ad.lng, ad.lat,
                activeLostFilterCenter[0], activeLostFilterCenter[1],
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

        // Базовая часть карточки + скрытая расширенная, которая
        // раскрывается по кнопке «Подробнее» → «Свернуть»
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

        // Переключаем класс expanded — CSS показывает
        // дополнительный блок
        const btn = card.querySelector(".animal-card-btn");
        btn.addEventListener("click", () => {
            const expanded = card.classList.toggle("expanded");
            btn.textContent = expanded ? "Свернуть" : "Подробнее";
        });

        sidebarLostAnimalsList.appendChild(card);
    });
}

// ---------------------------------------------------------
// Открытие панелей по ссылкам в меню
// ---------------------------------------------------------
sidebarSeenLink.addEventListener("click", () => {
    // Закрываем соседнюю панель и фильтры, чтобы не накладывались
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