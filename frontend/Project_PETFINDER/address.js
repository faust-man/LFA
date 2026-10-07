// =========================================================
// АВТОПОДСКАЗКИ АДРЕСА (Nominatim / OpenStreetMap)
// =========================================================
// setupAddressField(input, formatter) — вешается на любое поле.
// formatter задаёт формат: formatFullAddress или formatShortAddress.
// При вводе ≥ 3 символов через 300 мс летит запрос к Nominatim,
// результаты показываются в выпадающем списке #address-suggestions.
// =========================================================

const addressSuggestions = document.getElementById("address-suggestions");
let addressDebounceTimer = null;

// Скрыть выпадающий список подсказок
function hideAddressSuggestions() {
    addressSuggestions.classList.remove("visible");
    addressSuggestions.innerHTML = "";
}

// Полный формат: страна, город, улица, дом, корпус.
// Используется в модалке создания метки (адрес приюта).
function formatFullAddress(item) {
    const a = item.address || {};
    const parts = [];
    if (a.country) parts.push(a.country);
    const city = a.city || a.town || a.village || a.municipality;
    if (city) parts.push(city);
    const road = a.road || a.pedestrian || a.footway || a.path;
    if (road) parts.push(road);
    if (a.house_number) parts.push("д. " + a.house_number);
    if (a.building)     parts.push("корп. " + a.building);
    return parts.join(", ");
}

// Короткий формат: страна, город, улица.
// Используется в анкете «Потерял животное».
function formatShortAddress(item) {
    const a = item.address || {};
    const parts = [];
    if (a.country) parts.push(a.country);
    const city = a.city || a.town || a.village || a.municipality;
    if (city) parts.push(city);
    const road = a.road || a.pedestrian || a.footway || a.path;
    if (road) parts.push(road);
    return parts.join(", ");
}

// Отрисовать подсказки в выпадающем списке.
// Позиционируется под полем ввода через position: fixed
// (top/left/width вычисляются от getBoundingClientRect).
function showAddressSuggestions(items, inputEl, formatter) {
    const formatted = items
        .map(item => ({ item, text: formatter(item) }))
        .filter(x => x.text && x.text.trim() !== "");

    if (!formatted.length) { hideAddressSuggestions(); return; }

    addressSuggestions.innerHTML = "";

    formatted.forEach(({ text }) => {
        const div = document.createElement("div");
        div.className = "address-suggestion";
        div.textContent = text;
        // mousedown нужен, чтобы поле не потеряло фокус до клика
        div.addEventListener("mousedown", (e) => e.preventDefault());
        div.addEventListener("click", () => {
            inputEl.value = text;
            inputEl.classList.remove("input-error");
            hideAddressSuggestions();
        });
        addressSuggestions.appendChild(div);
    });

    const rect = inputEl.getBoundingClientRect();
    addressSuggestions.style.top   = (rect.bottom + 4) + "px";
    addressSuggestions.style.left  = rect.left + "px";
    addressSuggestions.style.width = rect.width + "px";

    addressSuggestions.classList.add("visible");
}

// Основная функция, которая вешается на поле.
function setupAddressField(inputEl, formatter) {
    inputEl.addEventListener("input", () => {
        clearTimeout(addressDebounceTimer);
        const query = inputEl.value.trim();

        // Не дёргаем Nominatim на 1–2 символа
        if (query.length < 3) { hideAddressSuggestions(); return; }

        // Дебаунс 300 мс — Nominatim просит не частить
        addressDebounceTimer = setTimeout(async () => {
            try {
                const url =
                    "https://nominatim.openstreetmap.org/search" +
                    "?format=json&addressdetails=1&extratags=1&accept-language=ru&limit=8" +
                    "&q=" + encodeURIComponent(query);
                const res = await fetch(url, { headers: { "Accept-Language": "ru" } });
                if (!res.ok) { hideAddressSuggestions(); return; }
                const data = await res.json();
                showAddressSuggestions(data, inputEl, formatter);
            } catch (err) {
                console.error("Ошибка загрузки подсказок адреса:", err);
                hideAddressSuggestions();
            }
        }, 300);
    });

    // Enter в поле = выбрать первую подсказку
    inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && addressSuggestions.classList.contains("visible")) {
            const first = addressSuggestions.querySelector(".address-suggestion");
            if (first) {
                e.preventDefault();
                inputEl.value = first.textContent;
                inputEl.classList.remove("input-error");
                hideAddressSuggestions();
            }
        }
    });

    // Потеря фокуса → через 200 мс прячем подсказки
    inputEl.addEventListener("blur", () => setTimeout(hideAddressSuggestions, 200));

    // При скролле модалки — прячем, чтобы подсказки не «висели»
    const modal = inputEl.closest(".modal");
    if (modal) modal.addEventListener("scroll", hideAddressSuggestions);
}