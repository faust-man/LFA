import io

import pytest
from PIL import Image

from backend.media import (
    FULL_MAX_SIZE,
    FULL_TARGET_BYTES,
    MAX_UPLOAD_BYTES,
    THUMB_SIZE,
    THUMB_TARGET_BYTES,
    InvalidImageError,
    process_photo,
)


def _make_test_image(width: int, height: int, fmt: str = "PNG", color=(200, 50, 50)) -> bytes:
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


def test_process_photo_downscales_and_converts_to_webp():
    raw = _make_test_image(3000, 2000)
    full, thumb = process_photo(raw)

    assert full.width <= FULL_MAX_SIZE[0]
    assert full.height <= FULL_MAX_SIZE[1]
    assert full.data[:4] == b"RIFF"  # контейнер WebP начинается с RIFF-заголовка
    # однотонная картинка сожмётся сильно лучше целевого веса — проверяем
    # лишь то, что мы не вышли за разумные пределы
    assert full.size_bytes <= FULL_TARGET_BYTES * 2

    assert thumb.width == THUMB_SIZE[0]
    assert thumb.height == THUMB_SIZE[1]
    assert thumb.size_bytes <= THUMB_TARGET_BYTES * 2


def test_process_photo_does_not_upscale_small_full_version():
    raw = _make_test_image(100, 80)
    full, thumb = process_photo(raw)
    assert (full.width, full.height) == (100, 80)
    # миниатюра всё равно ровно THUMB_SIZE — обрезка/увеличение по центру
    assert (thumb.width, thumb.height) == THUMB_SIZE


def test_process_photo_accepts_jpeg_input():
    raw = _make_test_image(1200, 800, fmt="JPEG")
    full, _ = process_photo(raw)
    assert full.data[:4] == b"RIFF"


def test_process_photo_rejects_garbage_bytes():
    with pytest.raises(InvalidImageError):
        process_photo(b"this is definitely not an image")


def test_process_photo_rejects_empty_file():
    with pytest.raises(InvalidImageError):
        process_photo(b"")


def test_process_photo_rejects_oversized_upload():
    huge = b"\x00" * (MAX_UPLOAD_BYTES + 1)
    with pytest.raises(InvalidImageError):
        process_photo(huge)
