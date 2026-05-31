/* =============================================================
 * ОБОЗНАЧЕНИЕ : PP.JS.05
 * НАИМЕНОВАНИЕ: Управление очередью воспроизведения
 * ДОКУМЕНТ    : Текст программы (ГОСТ 19.401-78)
 * ПРОГРАММА   : Proletarian Player
 * ВЕРСИЯ      : 1.0
 * ЗАВИСИМОСТИ : helpers.js · storage.js · State · Els
 * =============================================================
 * Назначение: добавление файлов в очередь, сортировка,
 * отрисовка списка, управление порядком и контекстным меню.
 * ============================================================= */

'use strict';

/* -------------------------------------------------------------
 * Раздел 1. Добавление файлов в очередь
 * ------------------------------------------------------------- */

/**
 * Принимает набор файлов, фильтрует видео, загружает историю,
 * сопоставляет субтитры, сортирует и добавляет в State.queue.
 * @param {FileList|File[]} files
 */
async function addFilesToQueue(files) {
  const allFiles   = Array.from(files);
  const videoFiles = allFiles.filter(f => isVideoFile(f.name));

  if (!videoFiles.length) {
    notify('⚠ Видеофайлы не найдены');
    return;
  }

  const allHistory = await DB.getAllRecords();
  const historyMap = {};
  for (const rec of allHistory) historyMap[rec.id] = rec;

  const items = videoFiles.map(file => {
    const id      = PlayerDB.makeId(file);
    const history = historyMap[id] || null;
    const subFile = SubtitleManager.findMatchingSubtitle(file, allFiles);
    return {
      file,
      name:     file.name,
      parsed:   parseFilename(file.name),
      blobUrl:  null,
      history,
      progress: history ? history.progress_pct : 0,
      status:   history ? history.status : 'unwatched',
      subFile:  subFile || null,
    };
  });

  /* Сортировка: шоу → сезон → ключ сортировки → натуральное имя */
  items.sort((a, b) => {
    const sc = a.parsed.show.localeCompare(b.parsed.show, 'ru', { sensitivity: 'base' });
    if (sc !== 0) return sc;
    if (a.parsed.season  !== b.parsed.season)  return a.parsed.season  - b.parsed.season;
    if (a.parsed.sortKey !== b.parsed.sortKey) return a.parsed.sortKey - b.parsed.sortKey;
    return a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' });
  });

  const wasEmpty = State.queue.length === 0;
  State.queue.push(...items);
  renderQueue();

  const subCount = items.filter(i => i.subFile).length;
  let msg = `✚ Добавлено: ${items.length} файл(ов)`;
  if (subCount) msg += ` · 💬 ${subCount} с субтитрами`;
  notify(msg);

  if (wasEmpty) await playIndex(0);
}

/* -------------------------------------------------------------
 * Раздел 2. Отрисовка списка очереди
 * ------------------------------------------------------------- */

/**
 * Полностью перестраивает DOM-список очереди на основе State.queue.
 */
function renderQueue() {
  Els.queueList.innerHTML = '';

  State.queue.forEach((item, i) => {
    const el     = document.createElement('div');
    el.className = 'queue-item'
      + (i === State.queueIndex       ? ' active'    : '')
      + (item.status === 'completed'  ? ' completed' : '');
    el.dataset.index = i;

    const statusIcon = item.status === 'completed' ? '✓'
      : item.status === 'watching'  ? '▶' : '';

    const subIcon = item.subFile
      ? `<span class="qi-sub" title="Субтитры: ${escHtml(item.subFile.name)}">💬</span>`
      : '';

    el.innerHTML = `
      <span class="qi-num">${i + 1}</span>
      <div class="qi-info">
        <div class="qi-name" title="${escHtml(item.name)}">
          ${escHtml(shortName(item.name))} ${subIcon}
        </div>
        <div class="qi-meta">
          ${escHtml(item.parsed.show)}${item.parsed.label
            ? ' · ' + escHtml(item.parsed.label) : ''}
        </div>
        <div class="qi-progress">
          <div class="qi-progress-fill" style="width:${item.progress}%"></div>
        </div>
      </div>
      <span class="qi-status">${statusIcon}</span>
    `;

    el.addEventListener('click',       () => playIndex(i));
    el.addEventListener('contextmenu', e  => {
      e.preventDefault();
      _showContextMenu(e.clientX, e.clientY, i);
    });

    Els.queueList.appendChild(el);
  });
}

/* -------------------------------------------------------------
 * Раздел 3. Обновление прогресса элемента очереди
 * ------------------------------------------------------------- */

/**
 * Обновляет полосу прогресса и статус для элемента по индексу
 * без полной перерисовки всего списка.
 * @param {number} index
 * @param {number} pct    - Прогресс в процентах (0–100).
 * @param {string} status - 'unwatched' | 'watching' | 'completed'.
 */
function updateQueueItemProgress(index, pct, status) {
  if (index < 0 || index >= State.queue.length) return;
  State.queue[index].progress = pct;
  State.queue[index].status   = status;

  const el = Els.queueList.querySelector(`[data-index="${index}"]`);
  if (!el) return;

  const fill = el.querySelector('.qi-progress-fill');
  if (fill) fill.style.width = pct + '%';

  const st = el.querySelector('.qi-status');
  if (st) st.textContent =
    status === 'completed' ? '✓' : status === 'watching' ? '▶' : '';

  el.classList.toggle('completed', status === 'completed');
}

/* -------------------------------------------------------------
 * Раздел 4. Утилиты очереди
 * ------------------------------------------------------------- */

/** Прокручивает список очереди к активному элементу. */
function scrollQueueToActive() {
  const el = Els.queueList.querySelector('.queue-item.active');
  if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/**
 * Перемешивает очередь алгоритмом Фишера-Йетса,
 * корректируя State.queueIndex.
 */
function shuffleQueue() {
  if (State.queue.length < 2) return;
  for (let i = State.queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [State.queue[i], State.queue[j]] = [State.queue[j], State.queue[i]];
    if      (State.queueIndex === i) State.queueIndex = j;
    else if (State.queueIndex === j) State.queueIndex = i;
  }
  renderQueue();
  notify('⇄ Очередь перемешана');
}

/**
 * Удаляет элемент из очереди по индексу.
 * Если удаляется воспроизводимый — останавливает воспроизведение.
 * @param {number} index
 */
function removeFromQueue(index) {
  if (index < 0 || index >= State.queue.length) return;

  if (index === State.queueIndex) {
    Els.video.pause();
    Els.video.src    = '';
    State.queueIndex = -1;
    showDropZone(true);
  } else if (index < State.queueIndex) {
    State.queueIndex--;
  }

  /* Освобождаем Blob, если был создан */
  const item = State.queue[index];
  if (item.blobUrl) { URL.revokeObjectURL(item.blobUrl); item.blobUrl = null; }

  State.queue.splice(index, 1);
  renderQueue();
  if (!State.queue.length) showDropZone(true);
  notify('✕ Удалено из очереди');
}

/* -------------------------------------------------------------
 * Раздел 5. Контекстное меню очереди
 * ------------------------------------------------------------- */

function _showContextMenu(x, y, index) {
  State.ctxTargetIndex = index;
  Els.queueContextMenu.style.left = x + 'px';
  Els.queueContextMenu.style.top  = y + 'px';
  Els.queueContextMenu.classList.remove('hidden');
  setTimeout(() => {
    document.addEventListener('click', _hideContextMenu, { once: true });
  }, 0);
}

function _hideContextMenu() {
  Els.queueContextMenu.classList.add('hidden');
}

/* -------------------------------------------------------------
 * Раздел 6. Инициализация событий панели очереди
 * ------------------------------------------------------------- */

function initQueueEvents() {
  /* Контекстное меню */
  Els.ctxPlay.addEventListener('click', () => {
    if (State.ctxTargetIndex >= 0) playIndex(State.ctxTargetIndex);
    _hideContextMenu();
  });
  Els.ctxRemove.addEventListener('click', () => {
    removeFromQueue(State.ctxTargetIndex);
    _hideContextMenu();
  });

  /* Шапка панели очереди */
  Els.btnQueueShuffle.addEventListener('click', () => {
    shuffleQueue();
    Els.btnQueueShuffle.classList.toggle('active');
  });
  Els.btnQueueLoop.addEventListener('click', () => {
    State.loopAll = !State.loopAll;
    Els.btnQueueLoop.classList.toggle('active', State.loopAll);
    notify(State.loopAll ? '↺ Повтор: вкл' : '↺ Повтор: выкл');
  });
  Els.btnQueueAdd.addEventListener('click', () => openFile());
  Els.btnQueueClose.addEventListener('click', () => togglePanel('queue'));
}