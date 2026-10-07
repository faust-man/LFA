// =========================================================
// НАЧАЛЬНЫЙ БАННЕР
// =========================================================
// Серая карточка с описанием функционала. Появляется при
// загрузке страницы, закрывается кликом по фону или по
// кнопке «Ясно». Может быть снова открыт кнопкой «?».
// =========================================================

const bannerOverlay  = document.getElementById("banner-overlay");
const helpButton     = document.getElementById("help-button");
const bannerCloseBtn = document.getElementById("banner-close-btn");

// При загрузке страницы сразу показываем баннер
document.addEventListener("DOMContentLoaded", () => {
    bannerOverlay.classList.add("visible");
});

// Клик по затемнённому фону закрывает
bannerOverlay.addEventListener("click", (e) => {
    if (e.target === bannerOverlay) {
        bannerOverlay.classList.remove("visible");
    }
});

// Кнопка «?» в левом нижнем углу открывает баннер снова
helpButton.addEventListener("click", () => {
    bannerOverlay.classList.add("visible");
});

// Кнопка «Ясно» внизу баннера закрывает его
bannerCloseBtn.addEventListener("click", () => {
    bannerOverlay.classList.remove("visible");
});