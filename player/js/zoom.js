/* =============================================================
 * ОБОЗНАЧЕНИЕ : PP.JS.04
 * НАИМЕНОВАНИЕ: Масштабирование видео
 * ДОКУМЕНТ    : Текст программы (ГОСТ 19.401-78)
 * ПРОГРАММА   : Proletarian Player
 * ВЕРСИЯ      : 1.0
 * ЗАВИСИМОСТИ : helpers.js · State · Els
 * =============================================================
 * Назначение: масштабирование видеоэлемента с сохранением
 * положения курсора, перемещение (pan) мышью при зуме.
 * ============================================================= */

'use strict';

/* -------------------------------------------------------------
 * Раздел 1. Константы
 * ------------------------------------------------------------- */

const ZOOM_MIN  = 1.0;
const ZOOM_MAX  = 5.0;
const ZOOM_STEP = 0.1;

let _osdZoomTimer = null;

/* -------------------------------------------------------------
 * Раздел 2. Публичный API
 * ------------------------------------------------------------- */

/**
 * Изменяет масштаб на delta от текущего значения.
 * При наличии cx/cy — зум к позиции курсора.
 * @param {number}  delta
 * @param {number}  [cx] - X курсора в пикселях экрана.
 * @param {number}  [cy] - Y курсора в пикселях экрана.
 */
function zoomBy(delta, cx, cy) {
  const oldZoom = State.zoom;
  const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, oldZoom + delta));
  if (newZoom === oldZoom) return;

  if (newZoom > 1 && cx !== undefined && cy !== undefined) {
    const rect  = Els.video.getBoundingClientRect();
    const relX  = (cx - rect.left  - rect.width  / 2) / oldZoom;
    const relY  = (cy - rect.top   - rect.height / 2) / oldZoom;
    State.panX -= relX * (newZoom - oldZoom);
    State.panY -= relY * (newZoom - oldZoom);
  }

  State.zoom = newZoom;
  if (newZoom <= 1) { State.panX = 0; State.panY = 0; }

  applyZoom();
}

/**
 * Сбрасывает масштаб к 100% и обнуляет смещение.
 */
function resetZoom() {
  State.zoom = 1.0;
  State.panX = 0;
  State.panY = 0;
  applyZoom();
  notify('🔍 Зум: 100%');
}

/**
 * Применяет текущие значения State.zoom / panX / panY к видеоэлементу.
 */
function applyZoom() {
  const { zoom, panX, panY } = State;
  const isZoomed = zoom > 1.001;

  if (isZoomed) {
    Els.video.style.transform = `scale(${zoom}) translate(${panX}px, ${panY}px)`;
    Els.video.classList.add('zoomed');
  } else {
    Els.video.style.transform = '';
    Els.video.classList.remove('zoomed');
    Els.video.classList.remove('grabbing');
  }

  const pct = Math.round(zoom * 100);
  Els.osdZoom.textContent   = `${pct}%`;
  Els.zoomLabel.textContent = `${pct}%`;

  if (isZoomed) {
    Els.osdZoom.classList.remove('hidden');
    clearTimeout(_osdZoomTimer);
    _osdZoomTimer = setTimeout(
      () => Els.osdZoom.classList.add('hidden'), 1500
    );
  } else {
    Els.osdZoom.classList.add('hidden');
  }

  Els.btnZoomReset.classList.toggle('active', isZoomed);
}

/* -------------------------------------------------------------
 * Раздел 3. Инициализация событий
 * ------------------------------------------------------------- */

/**
 * Привязывает события мыши для перемещения при зуме
 * и кнопки управления масштабом в панели настроек.
 */
function initZoomEvents() {
  /* Начало перемещения (pan) при зуме */
  Els.video.addEventListener('mousedown', e => {
    if (State.zoom <= 1.001 || e.button !== 0) return;
    State.zoomDragging   = true;
    State.zoomDragStartX = e.clientX;
    State.zoomDragStartY = e.clientY;
    State.zoomDragPanX   = State.panX;
    State.zoomDragPanY   = State.panY;
    Els.video.classList.add('grabbing');
    e.preventDefault();
    e.stopPropagation();
  });

  /* Обновление смещения при перемещении */
  document.addEventListener('mousemove', e => {
    if (!State.zoomDragging) return;
    State.panX = State.zoomDragPanX + (e.clientX - State.zoomDragStartX) / State.zoom;
    State.panY = State.zoomDragPanY + (e.clientY - State.zoomDragStartY) / State.zoom;
    applyZoom();
  });

  /* Завершение перемещения */
  document.addEventListener('mouseup', () => {
    if (State.zoomDragging) {
      State.zoomDragging = false;
      Els.video.classList.remove('grabbing');
    }
  });

  /* Кнопки в панели настроек */
  Els.btnZoomIn.addEventListener('click',    () => zoomBy(+ZOOM_STEP));
  Els.btnZoomOut.addEventListener('click',   () => zoomBy(-ZOOM_STEP));
  Els.btnZoomReset.addEventListener('click', () => resetZoom());
}