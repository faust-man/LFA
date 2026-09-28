"""
Обработка загружаемых пользователями фотографий животных/объявлений.

Реализует стандарты качества из ТЗ:
  - формат: WebP (см. process_photo);
  - полноразмерная версия: не более 1920×1080 px, целевой вес 150-200 КБ;
  - миниатюра: 300×300 px (обрезка по центру, как object-fit: cover),
    целевой вес 20-30 КБ;
  - quality 75-85%, с автоматическим понижением, если файл всё ещё
    получается тяжелее целевого веса (но не ниже MIN_QUALITY — дальше
    сжатие уже заметно портит картинку).

Дополнительно (не входило в ТЗ явно, но важно для безопасности и приватности
пользователей): EXIF-метаданные исходного фото — которые могут содержать
GPS-координаты места съёмки, модель телефона и т.п. — не переносятся в
сохранённые версии. EXIF-ориентация при этом всё равно применяется, чтобы
фото с телефона не оказалось "лёжа на боку".
"""
from __future__ import annotations

import io
from dataclasses import dataclass

from PIL import Image, ImageOps

# --- Полноразмерная версия ---
FULL_MAX_SIZE = (1920, 1080)
FULL_TARGET_BYTES = 200 * 1024        # верхняя граница из ТЗ (150-200 КБ)
FULL_START_QUALITY = 82

# --- Миниатюра ---
THUMB_SIZE = (300, 300)
THUMB_TARGET_BYTES = 30 * 1024        # верхняя граница из ТЗ (20-30 КБ)
THUMB_START_QUALITY = 80

MIN_QUALITY = 40                      # ниже не опускаемся — сильно портит вид
QUALITY_STEP = 10

# Форматы, которые пользователь может загрузить исходником — сами мы всегда
# перекодируем в WebP, независимо от того, что было на входе.
ALLOWED_INPUT_FORMATS = {"JPEG", "PNG", "WEBP", "GIF", "BMP", "TIFF"}
MAX_UPLOAD_BYTES = 15 * 1024 * 1024   # 15 МБ — защита от загрузки гигантских файлов
MIN_DIMENSION = 20                    # отсекаем однопиксельные/битые "картинки"


class InvalidImageError(ValueError):
    """Загруженный файл нельзя обработать как фото (не изображение,
    повреждён, слишком большой/маленький и т.п.) — 400 для клиента."""


@dataclass
class ProcessedImage:
    data: bytes
    width: int
    height: int
    size_bytes: int


def _load_image(raw: bytes) -> Image.Image:
    if not raw:
        raise InvalidImageError("Пустой файл")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise InvalidImageError(f"Файл слишком большой (максимум {MAX_UPLOAD_BYTES // (1024 * 1024)} МБ)")

    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
    except Exception as exc:  # Pillow бросает разные исключения на разный "мусор"
        raise InvalidImageError("Файл повреждён или не является изображением") from exc

    if image.format not in ALLOWED_INPUT_FORMATS:
        raise InvalidImageError(f"Неподдерживаемый формат изображения: {image.format}")

    if image.width < MIN_DIMENSION or image.height < MIN_DIMENSION:
        raise InvalidImageError("Изображение слишком маленькое")

    # Применяем EXIF-ориентацию (фото с телефона часто "лежат на боку" без
    # этого), затем работаем уже с "чистым" изображением без EXIF вообще —
    # это и есть удаление потенциально чувствительных метаданных (GPS и т.д.).
    image = ImageOps.exif_transpose(image)
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA" if "transparency" in image.info or image.mode == "P" else "RGB")
    return image


def _encode_webp_within_budget(image: Image.Image, start_quality: int, target_bytes: int) -> bytes:
    """Кодирует в WebP, постепенно снижая quality, пока не уложится в
    целевой вес (или пока не упрёмся в MIN_QUALITY — тогда отдаём лучшее,
    что получилось)."""
    quality = start_quality
    best = b""
    while quality >= MIN_QUALITY:
        buf = io.BytesIO()
        image.save(buf, format="WEBP", quality=quality, method=6)
        best = buf.getvalue()
        if len(best) <= target_bytes:
            return best
        quality -= QUALITY_STEP
    return best


def _resize_contain(image: Image.Image, max_size: tuple[int, int]) -> Image.Image:
    """Вписывает в рамку max_size с сохранением пропорций, не увеличивая
    изображения меньше рамки (thumbnail никогда не апскейлит)."""
    resized = image.copy()
    resized.thumbnail(max_size, Image.LANCZOS)
    return resized


def _resize_cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Обрезка по центру под квадрат миниатюры (аналог CSS object-fit: cover)."""
    return ImageOps.fit(image, size, Image.LANCZOS, centering=(0.5, 0.5))


def process_photo(raw: bytes) -> tuple[ProcessedImage, ProcessedImage]:
    """Принимает сырые байты загруженного файла, возвращает (full, thumb) —
    обе версии уже в WebP и укладываются в целевой вес по ТЗ (или
    максимально близко к нему, если исходник экстремально детализирован).

    Бросает InvalidImageError, если файл нельзя безопасно обработать —
    вызывающий код должен превращать это в HTTP 400, а не 500.
    """
    image = _load_image(raw)

    full_image = _resize_contain(image, FULL_MAX_SIZE)
    full_bytes = _encode_webp_within_budget(full_image, FULL_START_QUALITY, FULL_TARGET_BYTES)
    full = ProcessedImage(full_bytes, full_image.width, full_image.height, len(full_bytes))

    thumb_image = _resize_cover(image, THUMB_SIZE)
    thumb_bytes = _encode_webp_within_budget(thumb_image, THUMB_START_QUALITY, THUMB_TARGET_BYTES)
    thumb = ProcessedImage(thumb_bytes, thumb_image.width, thumb_image.height, len(thumb_bytes))

    return full, thumb
