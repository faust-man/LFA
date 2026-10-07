// =========================================================
// ГЛОБАЛЬНЫЕ СОБЫТИЯ И ЗАПУСК
// =========================================================
// Здесь — только те события, которые касаются нескольких
// модулей сразу: клик по карте (ставит метку на ПК),
// загрузка карты, глобальный Escape.
// =========================================================

// ---------------------------------------------------------
// Клик по карте — ПК-режим
// ---------------------------------------------------------
// Когда пользователь на ПК нажал «Поставить метку», включается
// placingMode, и следующий клик по карте ставит метку.
// На мобильном этот обработчик игнорируется (там свой режим).
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

// ---------------------------------------------------------
// Ошибки карты
// ---------------------------------------------------------
map.on("error", (e) => {
    console.error("Ошибка карты:", e.error);
});

// ---------------------------------------------------------
// Загрузка карты
// ---------------------------------------------------------
// Как только карта готова — считаем начальный масштаб меток
// и запускаем предзагрузку тайлов Московского региона.
map.on("load", async () => {
    console.log("✅ Карта успешно загружена!");
    updateMarkerScale();
    preloadMoscowRegion();

    // Загружаем сохранённые метки с сервера
    try {
        const animals = await apiGetAnimals();
        animals.forEach(addMarkerToMapFromServer);
        console.log(`Восстановлено меток: ${animals.length}`);
    } catch (err) {
        console.error("Ошибка загрузки меток:", err);
    }

    // Загружаем сохранённые объявления
    try {
        const ads = await apiGetLostAds();
        ads.forEach(addLostAdToMemory);
        console.log(`Восстановлено объявлений: ${ads.length}`);
    } catch (err) {
        console.error("Ошибка загрузки объявлений:", err);
    }
});

// ---------------------------------------------------------
// Escape — глобальный
// ---------------------------------------------------------
// Закрывает всё, что открыто, по приоритету: сначала
// мобильный режим и просмотрщик, потом баннер, потом
// модалки и панели.
document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    // 1. Мобильный режим постановки
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

    // 2. Оверлеи и панели
    if (viewerOverlay.classList.contains("visible"))    closeViewer();
    if (bannerOverlay.classList.contains("visible"))    bannerOverlay.classList.remove("visible");
    if (modalOverlay.classList.contains("visible"))     closeModal();
    if (lostModalOverlay.classList.contains("visible")) closeLostModal();
    if (sidebarAnimals.classList.contains("open"))      sidebarAnimals.classList.remove("open");
    if (sidebarLostAnimals.classList.contains("open"))  sidebarLostAnimals.classList.remove("open");
    if (sidebarFilters.classList.contains("visible"))   sidebarFilters.classList.remove("visible");
});