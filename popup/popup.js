/* =============================================================
 * ОБОЗНАЧЕНИЕ : PP.UI.02
 * НАИМЕНОВАНИЕ: Логика всплывающего окна
 * ДОКУМЕНТ    : Текст программы (ГОСТ 19.401-78)
 * ПРОГРАММА   : Proletarian Player
 * ВЕРСИЯ      : 1.0
 * ЗАВИСИМОСТИ : Chrome Extension API (storage)
 * =============================================================
 * Назначение: открытие плеера в новой вкладке,
 * отображение последнего просмотра из chrome.storage.local.
 * ============================================================= */

'use strict';

/* -------------------------------------------------------------
 * Раздел 1. Константы
 * ------------------------------------------------------------- */

const PLAYER_URL = chrome.runtime.getURL('player/player.html');

/* -------------------------------------------------------------
 * Раздел 2. Открытие плеера
 *
 * Всегда открывает новую вкладку. Поиск существующей вкладки
 * плеера намеренно исключён — он требует разрешения "tabs"
 * (чтение URL всех вкладок браузера).
 * ------------------------------------------------------------- */

/**
 * Открывает плеер в новой вкладке с опциональными параметрами.
 * @param {string} [params=''] - Строка параметров URL (без '?').
 */
function openPlayer(params = '') {
  const url = PLAYER_URL + (params ? '?' + params : '');
  chrome.tabs.create({ url });
  window.close();
}

/* -------------------------------------------------------------
 * Раздел 3. Обработчики кнопок
 * ------------------------------------------------------------- */

document.getElementById('btnOpen').addEventListener('click',
  () => openPlayer());

document.getElementById('btnFile').addEventListener('click',
  () => openPlayer('mode=file'));

document.getElementById('btnFolder').addEventListener('click',
  () => openPlayer('mode=folder'));

/* -------------------------------------------------------------
 * Раздел 4. Вспомогательные функции
 * ------------------------------------------------------------- */

/**
 * Форматирует секунды в строку H:MM:SS / MM:SS.
 * @param {number} sec
 * @returns {string}
 */
function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const p = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

/* -------------------------------------------------------------
 * Раздел 5. Отображение последнего просмотра
 *
 * Загружает запись pp_last_watched из chrome.storage.local
 * и заполняет блок интерфейса. Использует только разрешение
 * "storage" — никаких данных о вкладках не читается.
 * ------------------------------------------------------------- */

(async () => {
  const data = await new Promise(r =>
    chrome.storage.local.get('pp_last_watched', r)
  );
  const last = data.pp_last_watched;
  if (!last) return;

  const block = document.getElementById('lastWatchedBlock');
  block.classList.remove('hidden');

  document.getElementById('lastTitle').textContent = last.filename || '—';
  document.getElementById('lastMeta').textContent  =
    `${formatTime(last.position_sec)} / ${formatTime(last.duration_sec)} · ${last.progress_pct}%`;
  document.getElementById('lastProgress').style.width =
    (last.progress_pct || 0) + '%';

  /* Открывает новую вкладку плеера в режиме возобновления */
  block.addEventListener('click', () => openPlayer('mode=resume'));
})();