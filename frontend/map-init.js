// =========================================================
// ИНИЦИАЛИЗАЦИЯ КАРТЫ
// =========================================================
// Создаёт map, вешает контролы (zoom, fullscreen, geolocate),
// содержит логику динамического масштаба меток и предзагрузку
// тайлов для ускоренной загрузки Московского региона.
// =========================================================

// Воркеры и прогрев — ускоряют обработку тайлов
maplibregl.setWorkerCount(4);
maplibregl.prewarm();

// Создание карты
const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/bright",
  center: [37.6173, 55.7558], // Москва
  zoom: 10,
  minZoom: 0,
  maxZoom: 18,
  antialias: true,
});

maplibregl.setMaxParallelImageRequests(24);

// Настройка плавности зума колесиком мыши
map.scrollZoom.setWheelZoomRate(1 / 800);
map.scrollZoom.setZoomRate(1 / 200);

// Контролы
map.addControl(new maplibregl.NavigationControl(), "top-right");
map.addControl(new maplibregl.FullscreenControl(), "top-right");
map.addControl(
  new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
  }),
  "top-right",
);

// ПК: отключаем вращение правой кнопкой мыши
map.dragRotate.disable();

// Мобильные: отключаем вращение и наклон двумя пальцами.
// Zoom (pinch) остаётся — только он и разрешён на мобильном.
// На ПК эти вызовы безвредны, так как touch-жестов там нет.
map.touchZoomRotate.disableRotation();
map.touchPitch.disable();

// ---------------------------------------------------------
// Динамический масштаб меток
// ---------------------------------------------------------
// При отдалении метки уменьшаются, при приближении — растут,
// но только до zoom=12. Дальше размер фиксируется.
function updateMarkerScale() {
  const z = map.getZoom();

  const ZOOM_START = 0;
  const ZOOM_STOP = 12;

  const SCALE_MIN = 0.5;
  const SCALE_MAX = 1.0;

  let scale;

  if (z >= ZOOM_STOP) scale = SCALE_MAX;
  else if (z <= ZOOM_START) scale = SCALE_MIN;
  else {
    const t = (z - ZOOM_START) / (ZOOM_STOP - ZOOM_START);
    scale = SCALE_MIN + t * (SCALE_MAX - SCALE_MIN);
  }

  // Пишем результат в CSS-переменную --marker-scale
  document.documentElement.style.setProperty(
    "--marker-scale",
    scale.toFixed(3),
  );
}

map.on("zoom", updateMarkerScale);

// ---------------------------------------------------------
// Предзагрузка тайлов Московского региона
// ---------------------------------------------------------
// При загрузке страницы в фоновом режиме скачиваются тайлы
// для Москвы и области на зумах 5–9. Они попадут в кэш,
// и когда пользователь отдалится, всё отрисуется моментально.

function lon2tile(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function lat2tile(lat, zoom) {
  return Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180),
      ) /
        Math.PI) /
      2) *
      Math.pow(2, zoom),
  );
}

function preloadMoscowRegion() {
  const bounds = { minLon: 35.0, maxLon: 40.0, minLat: 54.0, maxLat: 57.0 };
  const zooms = [5, 6, 7, 8, 9];
  const tileUrlTemplate =
    "https://tiles.openfreemap.org/planet/latest/{z}/{x}/{y}.pbf";

  let scheduled = 0;

  zooms.forEach((z) => {
    const xMin = lon2tile(bounds.minLon, z);
    const xMax = lon2tile(bounds.maxLon, z);
    const yMin = lat2tile(bounds.maxLat, z);
    const yMax = lat2tile(bounds.minLat, z);

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const url = tileUrlTemplate
          .replace("{z}", z)
          .replace("{x}", x)
          .replace("{y}", y);
        scheduled++;
        fetch(url, { mode: "cors" }).catch(() => {});
      }
    }
  });

  console.log(
    `🔄 Предзагрузка Москвы и области запущена (${scheduled} тайлов)`,
  );
}
