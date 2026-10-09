// =========================================================
// РАБОТА С БЭКЕНДОМ
// =========================================================
// Единственный файл, который знает про сеть. Все остальные
// модули вызывают функции отсюда и не знают, откуда берутся
// данные — из localStorage, из API или из памяти.
// =========================================================

// API доступен на адресе сайта через прокси Nginx.
const API_BASE = "";

// ---------------------------------------------------------
// МЕТКИ (замеченные животные)
// ---------------------------------------------------------

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
    const res = await fetch(`${API_BASE}/api/animals/${id}`, {
        method: "DELETE"
    });
    return res.ok;
}

// ---------------------------------------------------------
// ОБЪЯВЛЕНИЯ (пропавшие животные)
// ---------------------------------------------------------

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
    const res = await fetch(`${API_BASE}/api/lost_ads/${id}`, {
        method: "DELETE"
    });
    return res.ok;
}
