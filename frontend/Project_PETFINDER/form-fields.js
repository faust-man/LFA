// =========================================================
// МАСКИ ПОЛЕЙ «ВРЕМЯ» И «ДАТА»
// =========================================================
// Функции принимают на вход ссылку на input и кнопку «Поставить»,
// которая должна срабатывать при нажатии Enter. Поля не дают
// ввести буквы и лишние символы, а также автоматически
// расставляют разделители «:» и «.».
// =========================================================

function setupTimeField(input, submitBtn) {
    // Фильтрация каждой клавиши
    input.addEventListener("keydown", (e) => {
        if (input.readOnly) return;

        // Enter = нажатие на кнопку отправки формы
        if (e.key === "Enter") {
            e.preventDefault();
            submitBtn.click();
            return;
        }

        // Ctrl/Cmd/Alt-комбинации не блокируем (копирование и т.п.)
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        // Управляющие клавиши разрешены всегда
        const allowedKeys = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Home", "End"];
        if (allowedKeys.includes(e.key)) return;

        // Не цифра — блок
        if (!/^\d$/.test(e.key)) {
            e.preventDefault();
            return;
        }

        // Больше 4 цифр — блок
        const digits = input.value.replace(/\D/g, "");
        if (digits.length >= 4) {
            e.preventDefault();
            return;
        }

        // Проверяем, может ли эта цифра дать валидное ЧЧ:ММ.
        // Первая цифра часов: 0–2
        // Вторая (если первая = 2): 0–3
        // Первая минут: 0–5
        const d = e.key;
        let allowed = true;

        if (digits.length === 0)      allowed = /^[0-2]$/.test(d);
        else if (digits.length === 1) allowed = digits[0] === "2" ? /^[0-3]$/.test(d) : /^\d$/.test(d);
        else if (digits.length === 2) allowed = /^[0-5]$/.test(d);
        else if (digits.length === 3) allowed = /^\d$/.test(d);

        if (!allowed) e.preventDefault();
    });

    // Автоформатирование ЧЧ:ММ
    input.addEventListener("input", () => {
        let digits = input.value.replace(/\D/g, "").slice(0, 4);
        let formatted = digits.length <= 2
            ? digits
            : digits.slice(0, 2) + ":" + digits.slice(2);
        input.value = formatted;
        input.classList.remove("input-error");
    });
}

function setupDateField(input) {
    input.addEventListener("keydown", (e) => {
        if (input.readOnly) return;
        if (e.key === "Enter") { e.preventDefault(); return; }
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        const allowedKeys = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Home", "End"];
        if (allowedKeys.includes(e.key)) return;

        // Разрешаем только цифры
        if (!/^\d$/.test(e.key)) { e.preventDefault(); return; }

        // Не больше 8 цифр (ДДММГГГГ)
        const digits = input.value.replace(/\D/g, "");
        if (digits.length >= 8) e.preventDefault();
    });

    // Автоформатирование ДД.ММ.ГГГГ
    input.addEventListener("input", () => {
        let digits = input.value.replace(/\D/g, "").slice(0, 8);
        let formatted;

        if (digits.length <= 2)      formatted = digits;
        else if (digits.length <= 4) formatted = digits.slice(0, 2) + "." + digits.slice(2);
        else                         formatted = digits.slice(0, 2) + "." + digits.slice(2, 4) + "." + digits.slice(4);

        input.value = formatted;
        input.classList.remove("input-error");
    });
}