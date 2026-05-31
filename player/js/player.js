/* =============================================================
 * ОБОЗНАЧЕНИЕ : PP.JS.06
 * НАИМЕНОВАНИЕ: Ядро плеера
 * ДОКУМЕНТ    : Текст программы (ГОСТ 19.401-78)
 * ПРОГРАММА   : Proletarian Player
 * ВЕРСИЯ      : 1.0
 * ЗАВИСИМОСТИ : helpers.js · storage.js · subtitles.js
 *               zoom.js · queue.js
 * =============================================================
 * Назначение: инициализация, состояние, воспроизведение,
 * управление громкостью и скоростью, полноэкранный режим,
 * горячие клавиши, Drag & Drop, интеграция с всплывающим окном.
 * ============================================================= */

'use strict';

/* -------------------------------------------------------------
 * Раздел 1. Константы
 * ------------------------------------------------------------- */

/** Режимы масштабирования изображения. */
const ASPECT_MODES = ['fit', 'fill', 'stretch'];

/** Порог начала (< 3%) — считается непросмотренным. */
const RESUME_START = 0.03;

/** Порог конца (> 92%) — считается просмотренным. */
const RESUME_END   = 0.92;

/* -------------------------------------------------------------
 * Раздел 2. Карта DOM-элементов (Els)
 * ------------------------------------------------------------- */

const $ = id => document.getElementById(id);

const Els = {
  /* Глобальные зоны */
  dropZone:         $('dropZone'),
  playerWrap:       $('playerWrap'),
  notifications:    $('notifications'),

  /* Видео */
  video:            $('video'),
  clickOverlay:     $('clickOverlay'),

  /* OSD */
  osdIcon:          $('osdIcon'),
  osdTime:          $('osdTime'),
  osdInfo:          $('osdInfo'),
  osdZoom:          $('osdZoom'),

  /* Прогресс */
  progressBar:      $('progressBar'),
  progressFill:     $('progressFill'),
  progressBuffered: $('progressBuffered'),
  progressHandle:   $('progressHandle'),
  progressTooltip:  $('progressTooltip'),
  abLoopA:          $('abLoopA'),
  abLoopB:          $('abLoopB'),
  timeCurrent:      $('timeCurrent'),
  timeDuration:     $('timeDuration'),

  /* Кнопки панели управления */
  btnPlayPause:     $('btnPlayPause'),
  btnPrev:          $('btnPrev'),
  btnNext:          $('btnNext'),
  btnMute:          $('btnMute'),
  volumeBar:        $('volumeBar'),
  volumeFill:       $('volumeFill'),
  volumeLabel:      $('volumeLabel'),
  speedDisplay:     $('speedDisplay'),
  btnAspect:        $('btnAspect'),
  btnSubs:          $('btnSubs'),
  btnQueue:         $('btnQueue'),
  btnPiP:           $('btnPiP'),
  btnFullscreen:    $('btnFullscreen'),
  btnSettings:      $('btnSettings'),

  /* Панель очереди */
  queuePanel:       $('queuePanel'),
  queueList:        $('queueList'),
  btnQueueShuffle:  $('btnQueueShuffle'),
  btnQueueLoop:     $('btnQueueLoop'),
  btnQueueAdd:      $('btnQueueAdd'),
  btnQueueClose:    $('btnQueueClose'),

  /* Панель настроек */
  settingsPanel:    $('settingsPanel'),
  btnSettingsClose: $('btnSettingsClose'),

  /* Настройки — субтитры */
  btnSubLoad:       $('btnSubLoad'),
  subOffsetLabel:   $('subOffsetLabel'),
  btnSubSyncM500:   $('btnSubSync-500'),
  btnSubSyncM100:   $('btnSubSync-100'),
  btnSubSyncReset:  $('btnSubSyncReset'),
  btnSubSyncP100:   $('btnSubSync+100'),
  btnSubSyncP500:   $('btnSubSync+500'),

  /* Настройки — зум */
  zoomLabel:        $('zoomLabel'),
  btnZoomOut:       $('btnZoomOut'),
  btnZoomReset:     $('btnZoomReset'),
  btnZoomIn:        $('btnZoomIn'),

  /* Настройки — скорость */
  speedSteps:       $('speedSteps'),

  /* Настройки — инструменты */
  btnScreenshot:    $('btnScreenshot'),
  btnFileInfo:      $('btnFileInfo'),

  /* Настройки — A-B Loop */
  abStatus:         $('abStatus'),
  btnSetA:          $('btnSetA'),
  btnSetB:          $('btnSetB'),
  btnResetAB:       $('btnResetAB'),

  /* Drop-зона */
  btnOpenFile:      $('btnOpenFile'),
  btnOpenFolder:    $('btnOpenFolder'),

  /* Модальное окно SmartResume */
  resumeModal:      $('resumeModal'),
  resumeText:       $('resumeText'),
  resumeYes:        $('resumeYes'),
  resumeNo:         $('resumeNo'),

  /* Контекстное меню очереди */
  queueContextMenu: $('queueContextMenu'),
  ctxPlay:          $('ctxPlay'),
  ctxRemove:        $('ctxRemove'),
};

/* -------------------------------------------------------------
 * Раздел 3. Объект состояния (единственный источник истины)
 * ------------------------------------------------------------- */

const State = {
  /* Очередь воспроизведения */
  queue:             [],
  queueIndex:        -1,
  loopAll:           false,

  /* Воспроизведение */
  aspectModeIndex:   0,
  isMuted:           false,
  volume:            1.0,
  speedIndex:        3,
  isPlaying:         false,
  duration:          0,

  /* A-B Loop */
  abA:               null,
  abB:               null,
  abActive:          false,

  /* Зум и перемещение */
  zoom:              1.0,
  panX:              0,
  panY:              0,
  zoomDragging:      false,
  zoomDragStartX:    0,
  zoomDragStartY:    0,
  zoomDragPanX:      0,
  zoomDragPanY:      0,

  /* Интерфейс */
  activePanel:       null,   /* 'queue' | 'settings' | null */
  controlsHideTimer: null,
  isFullscreen:      false,

  /* Субтитры */
  subsEnabled:       false,

  /* Перетаскивание ползунков */
  seekDragging:      false,
  volDragging:       false,

  /* Автосохранение */
  saveTimer:         null,

  /* Контекстное меню */
  ctxTargetIndex:    -1,
};

/* -------------------------------------------------------------
 * Раздел 4. Уведомления
 * ------------------------------------------------------------- */

/**
 * Показывает всплывающее уведомление.
 * @param {string} text
 * @param {number} [duration=2200] - Время показа в миллисекундах.
 */
function notify(text, duration = 2200) {
  const el = document.createElement('div');
  el.className   = 'notification';
  el.textContent = text;
  Els.notifications.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.3s, transform 0.3s';
    el.style.opacity    = '0';
    el.style.transform  = 'translateY(-6px)';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/* -------------------------------------------------------------
 * Раздел 5. OSD-отображение
 * ------------------------------------------------------------- */

let _osdIconTimer = null;

/**
 * Показывает OSD-иконку на 650 мс.
 * @param {string} icon
 */
function showOsdIcon(icon) {
  Els.osdIcon.textContent     = icon;
  Els.osdIcon.classList.remove('hidden');
  Els.osdIcon.style.animation = 'none';
  void Els.osdIcon.offsetWidth;           /* Сброс анимации */
  Els.osdIcon.style.animation = '';
  clearTimeout(_osdIconTimer);
  _osdIconTimer = setTimeout(() => Els.osdIcon.classList.add('hidden'), 650);
}

let _osdTimeTimer = null;

/**
 * Показывает OSD-текст времени на 1200 мс.
 * @param {string} text
 */
function showOsdTime(text) {
  Els.osdTime.textContent = text;
  Els.osdTime.classList.remove('hidden');
  clearTimeout(_osdTimeTimer);
  _osdTimeTimer = setTimeout(() => Els.osdTime.classList.add('hidden'), 1200);
}

/* -------------------------------------------------------------
 * Раздел 6. Автоскрытие панели управления
 * ------------------------------------------------------------- */

/**
 * Показывает панель управления и запускает таймер автоскрытия
 * (только если воспроизведение активно и панели закрыты).
 */
function showControls() {
  Els.playerWrap.classList.remove('controls-hidden');
  clearTimeout(State.controlsHideTimer);
  if (State.isPlaying && !State.activePanel) {
    State.controlsHideTimer = setTimeout(() => {
      if (!State.seekDragging && !State.volDragging && !State.zoomDragging) {
        Els.playerWrap.classList.add('controls-hidden');
      }
    }, 3000);
  }
}

/* -------------------------------------------------------------
 * Раздел 7. Боковые панели (очередь / настройки)
 *
 * Панели взаимоисключающие: открытие одной закрывает другую.
 * ------------------------------------------------------------- */

/**
 * Переключает боковую панель.
 * @param {'queue'|'settings'} name
 */
function togglePanel(name) {
  if (State.activePanel === name) {
    _closePanel();
  } else {
    _closePanel();
    State.activePanel = name;
    if (name === 'queue') {
      Els.queuePanel.classList.remove('hidden');
      Els.btnQueue.classList.add('active');
      scrollQueueToActive();
    } else if (name === 'settings') {
      Els.settingsPanel.classList.remove('hidden');
      Els.btnSettings.classList.add('settings-open');
    }
    showControls();
  }
}

/** Закрывает активную боковую панель. */
function _closePanel() {
  if (State.activePanel === 'queue') {
    Els.queuePanel.classList.add('hidden');
    Els.btnQueue.classList.remove('active');
  } else if (State.activePanel === 'settings') {
    Els.settingsPanel.classList.add('hidden');
    Els.btnSettings.classList.remove('settings-open');
  }
  State.activePanel = null;
}

/* -------------------------------------------------------------
 * Раздел 8. Зона перетаскивания
 * ------------------------------------------------------------- */

/**
 * Переключает видимость зоны Drop и контейнера плеера.
 * @param {boolean} show - true — показать зону, скрыть плеер.
 */
function showDropZone(show) {
  if (show) {
    Els.dropZone.classList.remove('hidden');
    Els.playerWrap.classList.add('hidden');
  } else {
    Els.dropZone.classList.add('hidden');
    Els.playerWrap.classList.remove('hidden');
  }
}

/* -------------------------------------------------------------
 * Раздел 9. Сохранение позиции просмотра
 * ------------------------------------------------------------- */

/** Запускает таймер отложенного сохранения (5 с). */
function scheduleSave() {
  clearTimeout(State.saveTimer);
  State.saveTimer = setTimeout(saveCurrentPosition, 5000);
}

/**
 * Сохраняет текущую позицию в IndexedDB и chrome.storage.local.
 */
async function saveCurrentPosition() {
  const item = State.queue[State.queueIndex];
  if (!item?.file) return;
  const pos = Els.video.currentTime;
  const dur = Els.video.duration || State.duration;
  if (!dur) return;
  const rec = await DB.saveRecord(item.file, pos, dur);
  updateQueueItemProgress(State.queueIndex, rec.progress_pct, rec.status);
  chrome.storage.local.set({
    pp_last_watched: {
      filename:     item.file.name,
      position_sec: pos,
      duration_sec: dur,
      progress_pct: rec.progress_pct,
    }
  });
}

/* -------------------------------------------------------------
 * Раздел 10. Воспроизведение
 * ------------------------------------------------------------- */

/**
 * Начинает воспроизведение элемента очереди по индексу.
 * @param {number} index
 */
async function playIndex(index) {
  if (index < 0 || index >= State.queue.length) return;

  if (State.queueIndex >= 0) await saveCurrentPosition();

  /* Освобождаем Blob предыдущего элемента */
  const prev = State.queue[State.queueIndex];
  if (prev?.blobUrl) { URL.revokeObjectURL(prev.blobUrl); prev.blobUrl = null; }

  State.queueIndex = index;
  const item   = State.queue[index];
  item.blobUrl = URL.createObjectURL(item.file);

  resetABLoop();
  resetZoom();
  SubtitleManager.unload();

  Els.video.src          = item.blobUrl;
  Els.video.playbackRate = SPEED_STEPS[State.speedIndex] ?? 1.0;
  Els.video.load();

  document.title = `▶ ${item.name} — Proletarian Player`;
  renderQueue();
  showDropZone(false);

  const history = item.history || await DB.getRecord(item.file);
  item.history  = history;

  Els.video.addEventListener('loadedmetadata', async function onMeta() {
    Els.video.removeEventListener('loadedmetadata', onMeta);
    State.duration               = Els.video.duration;
    Els.timeDuration.textContent = formatTime(State.duration);

    /* Автозагрузка субтитров, если найден сопоставленный файл */
    if (item.subFile) await SubtitleManager.load(item.subFile);

    /* SmartResume: предлагаем продолжить, если прогресс в допустимом диапазоне */
    if (history?.position_sec > 0) {
      const pct = history.position_sec / Els.video.duration;
      if (pct >= RESUME_START && pct <= RESUME_END) {
        showResumeModal(history.position_sec, Els.video.duration);
        return;
      }
    }
    await Els.video.play().catch(() => {});
  }, { once: true });

  scheduleSave();
}

/** Переходит к следующему элементу очереди (с учётом loopAll). */
async function playNext() {
  if (!State.queue.length) return;
  let next = State.queueIndex + 1;
  if (next >= State.queue.length) {
    if (State.loopAll) next = 0;
    else { notify('🏁 Конец очереди'); return; }
  }
  await playIndex(next);
}

/** Переходит к предыдущему элементу очереди. */
async function playPrev() {
  if (State.queueIndex > 0) await playIndex(State.queueIndex - 1);
}

/** Переключает воспроизведение / паузу. */
function togglePlay() {
  Els.video.paused
    ? Els.video.play().catch(() => {})
    : Els.video.pause();
}

/* -------------------------------------------------------------
 * Раздел 11. SmartResume — возобновление просмотра
 * ------------------------------------------------------------- */

let _resumePosition = 0;

/**
 * Показывает модальное окно с предложением продолжить просмотр.
 * @param {number} position - Позиция в секундах.
 * @param {number} duration - Длительность в секундах.
 */
function showResumeModal(position, duration) {
  _resumePosition = position;
  Els.resumeText.textContent =
    `Вы остановились на ${formatTime(position)} из ${formatTime(duration)} ` +
    `(${Math.round(position / duration * 100)}%)`;
  Els.resumeModal.classList.remove('hidden');
}

Els.resumeYes.addEventListener('click', async () => {
  Els.resumeModal.classList.add('hidden');
  Els.video.currentTime = _resumePosition;
  await Els.video.play().catch(() => {});
});

Els.resumeNo.addEventListener('click', async () => {
  Els.resumeModal.classList.add('hidden');
  Els.video.currentTime = 0;
  await Els.video.play().catch(() => {});
});

/* -------------------------------------------------------------
 * Раздел 12. Режим масштабирования изображения (Aspect)
 * ------------------------------------------------------------- */

/** Переключает режим масштабирования по кругу: fit → fill → stretch. */
function cycleAspect() {
  State.aspectModeIndex = (State.aspectModeIndex + 1) % ASPECT_MODES.length;
  applyAspect(true);
}

/**
 * Применяет текущий режим масштабирования к видеоэлементу.
 * @param {boolean} [withNotify=false]
 */
function applyAspect(withNotify = false) {
  const mode     = ASPECT_MODES[State.aspectModeIndex];
  const wasZoomed = Els.video.classList.contains('zoomed');
  Els.video.className = `video mode-${mode}${wasZoomed ? ' zoomed' : ''}`;
  Els.btnAspect.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
  if (withNotify) notify(`Масштаб: ${mode.toUpperCase()}`);
  Settings.save(State);
}

/* -------------------------------------------------------------
 * Раздел 13. Управление громкостью
 * ------------------------------------------------------------- */

/**
 * Устанавливает громкость в диапазоне [0, 1].
 * @param {number} v
 */
function setVolume(v) {
  State.volume              = Math.max(0, Math.min(1, v));
  Els.video.volume          = State.volume;
  Els.volumeFill.style.width  = (State.volume * 100) + '%';
  Els.volumeLabel.textContent = Math.round(State.volume * 100) + '%';
  Els.btnMute.textContent     = State.volume === 0 ? '🔇'
    : State.volume < 0.5 ? '🔉' : '🔊';
  Settings.save(State);
}

/** Переключает режим без звука. */
function toggleMute() {
  State.isMuted   = !State.isMuted;
  Els.video.muted = State.isMuted;
  Els.btnMute.textContent = State.isMuted ? '🔇'
    : State.volume < 0.5 ? '🔉' : '🔊';
  notify(State.isMuted ? '🔇 Звук выключен' : '🔊 Звук включён');
}

/* -------------------------------------------------------------
 * Раздел 14. Управление скоростью воспроизведения
 * ------------------------------------------------------------- */

/**
 * Устанавливает скорость по индексу в массиве SPEED_STEPS.
 * @param {number} idx
 */
function setSpeedIndex(idx) {
  State.speedIndex = Math.max(0, Math.min(SPEED_STEPS.length - 1, idx));
  const speed = SPEED_STEPS[State.speedIndex];
  Els.video.playbackRate       = speed;
  Els.speedDisplay.textContent = speed.toFixed(2) + '×';
  Els.speedDisplay.classList.toggle('non-default', speed !== 1.0);
  _renderSpeedSteps();
  Settings.save(State);
}

/**
 * Изменяет скорость на delta шагов.
 * @param {number} delta
 */
function changeSpeed(delta) {
  setSpeedIndex(State.speedIndex + delta);
  notify(`Скорость: ${SPEED_STEPS[State.speedIndex].toFixed(2)}×`);
}

/** Сбрасывает скорость к 1.0×. */
function resetSpeed() {
  setSpeedIndex(SPEED_STEPS.indexOf(1.0));
  notify('Скорость: 1.00×');
}

/** Перестраивает кнопки шагов скорости в панели настроек. */
function _renderSpeedSteps() {
  Els.speedSteps.innerHTML = '';
  SPEED_STEPS.forEach((s, i) => {
    const btn = document.createElement('button');
    btn.className   = 'speed-step' + (i === State.speedIndex ? ' active' : '');
    btn.textContent = s.toFixed(2) + '×';
    btn.addEventListener('click', () => {
      setSpeedIndex(i);
      notify(`Скорость: ${s.toFixed(2)}×`);
    });
    Els.speedSteps.appendChild(btn);
  });
}

/* -------------------------------------------------------------
 * Раздел 15. A-B Loop (цикличное воспроизведение фрагмента)
 * ------------------------------------------------------------- */

/** Устанавливает точку A в текущей позиции. */
function setAPoint() {
  State.abA    = Els.video.currentTime;
  State.abB    = null;
  State.abActive = false;
  _updateABMarkers();
  _updateABStatus();
  notify(`🅐 A: ${formatTime(State.abA)}`);
}

/** Устанавливает точку B в текущей позиции и активирует цикл. */
function setBPoint() {
  if (State.abA === null) { notify('⚠ Сначала поставьте точку A'); return; }
  const t = Els.video.currentTime;
  if (t <= State.abA)    { notify('⚠ Точка B должна быть позже A'); return; }
  State.abB    = t;
  State.abActive = true;
  _updateABMarkers();
  _updateABStatus();
  notify(`🅑 B: ${formatTime(State.abB)} · Цикл активен`);
}

/** Сбрасывает A-B Loop. */
function resetABLoop() {
  State.abA    = null;
  State.abB    = null;
  State.abActive = false;
  Els.abLoopA.classList.add('hidden');
  Els.abLoopB.classList.add('hidden');
  _updateABStatus();
}

/** Обновляет позиции маркеров A и B на прогресс-баре. */
function _updateABMarkers() {
  const dur = Els.video.duration;
  if (!dur) return;
  if (State.abA !== null) {
    Els.abLoopA.style.left = (State.abA / dur * 100) + '%';
    Els.abLoopA.classList.remove('hidden');
  }
  if (State.abB !== null) {
    Els.abLoopB.style.left = (State.abB / dur * 100) + '%';
    Els.abLoopB.classList.remove('hidden');
  }
}

/** Обновляет текстовый статус A-B в панели настроек. */
function _updateABStatus() {
  const el = Els.abStatus;
  if (!el) return;
  if (State.abActive && State.abA !== null && State.abB !== null) {
    el.textContent = `${formatTime(State.abA)} → ${formatTime(State.abB)}`;
    el.classList.add('active');
  } else if (State.abA !== null) {
    el.textContent = `A: ${formatTime(State.abA)} · B: не задана`;
    el.classList.remove('active');
  } else {
    el.textContent = 'Не активен';
    el.classList.remove('active');
  }
}

/* -------------------------------------------------------------
 * Раздел 16. Снимок кадра (скриншот)
 * ------------------------------------------------------------- */

/** Создаёт PNG-снимок текущего кадра и скачивает его. */
function takeScreenshot() {
  if (!Els.video.src) return;
  const canvas  = document.createElement('canvas');
  canvas.width  = Els.video.videoWidth;
  canvas.height = Els.video.videoHeight;
  canvas.getContext('2d').drawImage(Els.video, 0, 0);
  const item = State.queue[State.queueIndex];
  const ts   = formatTime(Els.video.currentTime).replace(/:/g, '-');
  const name = item ? item.name.replace(/\.[^.]+$/, '') : 'screenshot';
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: url, download: `${name}__${ts}.png`
    }).click();
    URL.revokeObjectURL(url);
    notify(`📸 ${name}__${ts}.png`);
  }, 'image/png');
}

/* -------------------------------------------------------------
 * Раздел 17. OSD-информация о файле
 * ------------------------------------------------------------- */

/** Переключает отображение OSD с метаданными текущего файла. */
function toggleFileInfo() {
  if (!Els.osdInfo.classList.contains('hidden')) {
    Els.osdInfo.classList.add('hidden');
    return;
  }
  const item = State.queue[State.queueIndex];
  if (!item) return;

  const v      = Els.video;
  const sizeMb = item.file ? (item.file.size / 1048576).toFixed(1) : '?';
  const ext    = item.file ? getExt(item.file.name).toUpperCase()  : '?';

  const rows = [
    ['📁 Файл',       escHtml(item.name)],
    ['🎞 Контейнер',  ext],
    ['📐 Разрешение', `${v.videoWidth} × ${v.videoHeight}`],
    ['⏱ Длина',       formatTime(v.duration || 0)],
    ['💾 Размер',      `${sizeMb} МБ`],
    ['⚡ Скорость',    `${v.playbackRate}×`],
    ['🔍 Зум',         `${Math.round(State.zoom * 100)}%`],
    ['💬 Субтитры',    State.subsEnabled ? 'вкл' : 'выкл'],
  ];

  Els.osdInfo.innerHTML = rows.map(([label, value]) => `
    <div class="osd-info-row">
      <span class="osd-info-label">${label}</span>
      <span class="osd-info-value">${value}</span>
    </div>
  `).join('');
  Els.osdInfo.classList.remove('hidden');
}

/* -------------------------------------------------------------
 * Раздел 18. Прогресс-бар: обновление и взаимодействие
 * ------------------------------------------------------------- */

/** Обновляет визуальное состояние прогресс-бара и времени. */
function updateProgressUI() {
  const v   = Els.video;
  const dur = v.duration || 1;
  const cur = v.currentTime;
  const pct = (cur / dur) * 100;

  Els.progressFill.style.width  = pct + '%';
  Els.progressHandle.style.left = pct + '%';
  Els.timeCurrent.textContent   = formatTime(cur);

  if (v.buffered.length > 0) {
    Els.progressBuffered.style.width =
      (v.buffered.end(v.buffered.length - 1) / dur * 100) + '%';
  }
}

/**
 * Устанавливает позицию видео по координатам клика на прогресс-баре.
 * @param {MouseEvent} e
 */
function _seekTo(e) {
  const rect = Els.progressBar.getBoundingClientRect();
  const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  if (!Els.video.duration) return;
  Els.video.currentTime = pct * Els.video.duration;
  updateProgressUI();
}

/* Перетаскивание ползунка прогресса */
Els.progressBar.addEventListener('mousedown', e => {
  State.seekDragging = true;
  _seekTo(e);
  e.preventDefault();
});

/* Всплывающая подсказка времени при наведении */
Els.progressBar.addEventListener('mousemove', e => {
  const rect = Els.progressBar.getBoundingClientRect();
  const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const dur  = Els.video.duration;
  if (!dur) return;
  Els.progressTooltip.textContent = formatTime(pct * dur);
  Els.progressTooltip.style.left  = (pct * 100) + '%';
  Els.progressTooltip.classList.remove('hidden');
});

Els.progressBar.addEventListener('mouseleave', () => {
  Els.progressTooltip.classList.add('hidden');
});

/* Глобальные обработчики перетаскивания */
document.addEventListener('mousemove', e => {
  if (State.seekDragging) _seekTo(e);
  if (State.volDragging)  _setVolumeFromBar(e);
});

document.addEventListener('mouseup', () => {
  State.seekDragging = false;
  State.volDragging  = false;
});

/**
 * Устанавливает громкость по координатам указателя на полосе громкости.
 * @param {MouseEvent} e
 */
function _setVolumeFromBar(e) {
  const rect = Els.volumeBar.getBoundingClientRect();
  setVolume(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
}

Els.volumeBar.addEventListener('mousedown', e => {
  State.volDragging = true;
  _setVolumeFromBar(e);
  e.preventDefault();
});
Els.volumeBar.addEventListener('click', _setVolumeFromBar);

/* -------------------------------------------------------------
 * Раздел 19. Обработчики событий видеоэлемента
 * ------------------------------------------------------------- */

Els.video.addEventListener('play', () => {
  State.isPlaying              = true;
  Els.btnPlayPause.textContent = '⏸';
  showControls();
});

Els.video.addEventListener('pause', () => {
  State.isPlaying              = false;
  Els.btnPlayPause.textContent = '▶';
  showControls();
  saveCurrentPosition();
});

Els.video.addEventListener('ended', async () => {
  await saveCurrentPosition();
  if (State.abActive) return;
  await playNext();
});

Els.video.addEventListener('timeupdate', () => {
  updateProgressUI();
  scheduleSave();
  /* Проверка цикла A-B */
  if (State.abActive && State.abA !== null && State.abB !== null) {
    if (Els.video.currentTime >= State.abB) {
      Els.video.currentTime = State.abA;
    }
  }
});

Els.video.addEventListener('loadedmetadata', () => {
  State.duration               = Els.video.duration;
  Els.timeDuration.textContent = formatTime(State.duration);
  _updateABMarkers();
});

Els.video.addEventListener('error', () => {
  const msgs = {
    1: 'Загрузка прервана',
    2: 'Сетевая ошибка',
    3: 'Ошибка декодирования',
    4: 'Формат не поддерживается',
  };
  notify(`⚠ ${msgs[Els.video.error?.code] || 'Ошибка воспроизведения'}`);
});

/* -------------------------------------------------------------
 * Раздел 20. File System Access API
 * ------------------------------------------------------------- */

/** Открывает диалог выбора видео и/или субтитров. */
async function openFile() {
  try {
    const handles = await window.showOpenFilePicker({
      multiple: true,
      types: [{
        description: 'Видео и субтитры',
        accept: {
          'video/*':    SUPPORTED_VIDEO_EXTS.map(e => '.' + e),
          'text/plain': SUPPORTED_SUB_EXTS.map(e  => '.' + e),
        }
      }]
    });
    await addFilesToQueue(
      await Promise.all(handles.map(h => h.getFile()))
    );
  } catch (e) {
    if (e.name !== 'AbortError') notify('⚠ Ошибка открытия файла');
  }
}

/** Открывает диалог выбора папки и рекурсивно сканирует её (до 3 уровней). */
async function openFolder() {
  try {
    const dir   = await window.showDirectoryPicker({ mode: 'read' });
    const files = [];

    async function scanDir(handle, depth = 0) {
      if (depth > 3) return;
      for await (const entry of handle.values()) {
        if (entry.kind === 'file') {
          if (isVideoFile(entry.name) || isSubtitleFile(entry.name)) {
            files.push(await entry.getFile());
          }
        } else if (entry.kind === 'directory') {
          await scanDir(entry, depth + 1);
        }
      }
    }

    await scanDir(dir);
    if (!files.some(f => isVideoFile(f.name))) {
      notify('⚠ Видеофайлы не найдены');
      return;
    }
    await addFilesToQueue(files);
  } catch (e) {
    if (e.name !== 'AbortError') notify('⚠ Ошибка открытия папки');
  }
}

/** Открывает диалог выбора файла субтитров. */
async function openSubtitleFile() {
  try {
    const handles = await window.showOpenFilePicker({
      multiple: false,
      types: [{
        description: 'Субтитры',
        accept: { 'text/plain': SUPPORTED_SUB_EXTS.map(e => '.' + e) }
      }]
    });
    await SubtitleManager.load(await handles[0].getFile());
  } catch (e) {
    if (e.name !== 'AbortError') notify('⚠ Ошибка загрузки субтитров');
  }
}

/* -------------------------------------------------------------
 * Раздел 21. Полноэкранный режим и PiP
 * ------------------------------------------------------------- */

/** Переключает полноэкранный режим. */
function toggleFullscreen() {
  document.fullscreenElement
    ? document.exitFullscreen()
    : Els.playerWrap.requestFullscreen().catch(() => {});
}

/** Переключает режим «картинка в картинке». */
function togglePiP() {
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture().catch(() => {});
  } else if (Els.video.src) {
    Els.video.requestPictureInPicture()
             .catch(() => notify('⚠ PiP недоступен'));
  }
}

document.addEventListener('fullscreenchange', () => {
  State.isFullscreen = !!document.fullscreenElement;
});

/* -------------------------------------------------------------
 * Раздел 22. Drag & Drop файлов и папок
 * ------------------------------------------------------------- */

document.addEventListener('dragover', e => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  Els.dropZone.classList.add('drag-over');
});

document.addEventListener('dragleave', e => {
  if (!e.relatedTarget) Els.dropZone.classList.remove('drag-over');
});

document.addEventListener('drop', async e => {
  e.preventDefault();
  Els.dropZone.classList.remove('drag-over');

  const files = [];
  if (e.dataTransfer.items) {
    const entries = Array.from(e.dataTransfer.items)
      .filter(i => i.kind === 'file')
      .map(i => i.webkitGetAsEntry?.())
      .filter(Boolean);
    for (const entry of entries) {
      if (entry.isFile) {
        await new Promise(r => entry.file(f => { files.push(f); r(); }));
      } else if (entry.isDirectory) {
        await _readDirEntry(entry, files);
      }
    }
  } else {
    Array.from(e.dataTransfer.files).forEach(f => files.push(f));
  }

  if (!files.length) return;

  /* Если брошены только субтитры — загружаем к текущему файлу */
  const videoFiles = files.filter(f => isVideoFile(f.name));
  const subFiles   = files.filter(f => isSubtitleFile(f.name));
  if (!videoFiles.length && subFiles.length) {
    await SubtitleManager.load(subFiles[0]);
    return;
  }

  await addFilesToQueue(files);
});

/**
 * Рекурсивно читает содержимое директории через FileSystemDirectoryEntry.
 * @param {FileSystemDirectoryEntry} dirEntry
 * @param {File[]} files - Накапливающий массив.
 */
async function _readDirEntry(dirEntry, files) {
  return new Promise(resolve => {
    const reader = dirEntry.createReader();
    const readAll = () => {
      reader.readEntries(async entries => {
        if (!entries.length) { resolve(); return; }
        for (const entry of entries) {
          if (entry.isFile) {
            await new Promise(r => entry.file(f => { files.push(f); r(); }));
          } else if (entry.isDirectory) {
            await _readDirEntry(entry, files);
          }
        }
        readAll();
      });
    };
    readAll();
  });
}

/* -------------------------------------------------------------
 * Раздел 23. Горячие клавиши
 * ------------------------------------------------------------- */

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (handleHotkey(e.key, e.ctrlKey, e.shiftKey)) e.preventDefault();
});

/**
 * Обрабатывает нажатие клавиши.
 * @param {string}  key
 * @param {boolean} ctrl
 * @param {boolean} shift
 * @returns {boolean} true — клавиша обработана (для preventDefault).
 */
function handleHotkey(key, ctrl, shift) {
  const v      = Els.video;
  const hasSrc = !!v.src;

  /* --- Управление файлами --- */
  if (ctrl && !shift && key === 'o') { openFile();         return true; }
  if (ctrl &&  shift && key === 'O') { openFolder();       return true; }
  if (ctrl && !shift && key === 'l') { openSubtitleFile(); return true; }
  if (ctrl && !shift && key === '0') { resetZoom();        return true; }

  if (!hasSrc) return false;

  /* --- Воспроизведение --- */
  if (key === ' ' || key === 'k' || key === 'K') { togglePlay(); return true; }

  /* --- Перемотка --- */
  if (key === 'ArrowRight' && !ctrl && !shift) { _seekBy(+5);  showOsdTime(`+5с  ${formatTime(v.currentTime)}`);  return true; }
  if (key === 'ArrowLeft'  && !ctrl && !shift) { _seekBy(-5);  showOsdTime(`-5с  ${formatTime(v.currentTime)}`);  return true; }
  if (key === 'ArrowRight' &&  shift)          { _seekBy(+30); showOsdTime(`+30с  ${formatTime(v.currentTime)}`); return true; }
  if (key === 'ArrowLeft'  &&  shift)          { _seekBy(-30); showOsdTime(`-30с  ${formatTime(v.currentTime)}`); return true; }
  if (key === 'ArrowRight' &&  ctrl)           { _seekBy(+90); showOsdTime(`+90с  ${formatTime(v.currentTime)}`); return true; }
  if (key === 'ArrowLeft'  &&  ctrl)           { _seekBy(-90); showOsdTime(`-90с  ${formatTime(v.currentTime)}`); return true; }
  if (key === '.') { _seekBy(+1/30); return true; }
  if (key === ',') { _seekBy(-1/30); return true; }

  /* --- Громкость --- */
  if (key === 'ArrowUp'   && !shift) { setVolume(State.volume + 0.05); return true; }
  if (key === 'ArrowDown' && !shift) { setVolume(State.volume - 0.05); return true; }
  if (key === 'ArrowUp'   &&  shift) { setVolume(State.volume + 0.15); return true; }
  if (key === 'ArrowDown' &&  shift) { setVolume(State.volume - 0.15); return true; }
  if (key === 'm' || key === 'M') { toggleMute(); return true; }

  /* --- Скорость --- */
  if (key === ']')  { changeSpeed(+1); return true; }
  if (key === '[')  { changeSpeed(-1); return true; }
  if (key === '\\') { resetSpeed();    return true; }

  /* --- Зум --- */
  if (key === '+' || key === '=') { zoomBy(+ZOOM_STEP); return true; }
  if (key === '-')                { zoomBy(-ZOOM_STEP); return true; }

  /* --- Позиция в файле --- */
  if (key === 'Home') { v.currentTime = 0;          updateProgressUI(); return true; }
  if (key === 'End')  { v.currentTime = v.duration; updateProgressUI(); return true; }
  for (let i = 1; i <= 9; i++) {
    if (key === String(i)) {
      v.currentTime = v.duration * (i / 10);
      showOsdTime(formatTime(v.currentTime));
      return true;
    }
  }

  /* --- Навигация по очереди --- */
  if (key === 'n' || key === 'N') { playNext(); return true; }
  if (key === 'b' || key === 'B') { playPrev(); return true; }

  /* --- Экран --- */
  if (key === 'f' || key === 'F')             { toggleFullscreen(); return true; }
  if (key === 'p' || key === 'P')             { togglePiP();        return true; }
  if (key === 'w' || key === 'W')             { cycleAspect();      return true; }
  if (key === 'Escape' && State.isFullscreen) { document.exitFullscreen(); return true; }

  /* --- Интерфейс --- */
  if (key === 'q' || key === 'Q') { togglePanel('queue');                  return true; }
  if (key === 'i' || key === 'I') { toggleFileInfo();                      return true; }
  if (key === 't' || key === 'T') { _toggleTimerOSD();                     return true; }
  if (key === 'c' || key === 'C') { SubtitleManager.toggleVisibility();    return true; }
  if (key === 'l' || key === 'L') { openSubtitleFile();                    return true; }
  if (key === 's' || key === 'S') { takeScreenshot();                      return true; }

  /* --- A-B Loop --- */
  if ((key === 'a' || key === 'A') && !ctrl) { setAPoint();   return true; }
  if ((key === 'a' || key === 'A') &&  ctrl) {
    resetABLoop();
    notify('✕ A-B сброшен');
    return true;
  }
  if (key === 'z' || key === 'Z') { setBPoint(); return true; }

  return false;
}

/**
 * Перематывает видео на delta секунд.
 * @param {number} delta
 */
function _seekBy(delta) {
  const v = Els.video;
  v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
  updateProgressUI();
}

/* --- Таймер OSD (постоянное отображение времени) --- */

let _timerOSDActive   = false;
let _timerOSDInterval = null;

/** Переключает постоянный OSD-таймер. */
function _toggleTimerOSD() {
  _timerOSDActive = !_timerOSDActive;
  if (_timerOSDActive) {
    _updateTimerOSD();
    _timerOSDInterval = setInterval(_updateTimerOSD, 1000);
  } else {
    clearInterval(_timerOSDInterval);
    Els.osdTime.classList.add('hidden');
  }
}

function _updateTimerOSD() {
  Els.osdTime.textContent =
    `${formatTime(Els.video.currentTime)} / ${formatTime(Els.video.duration || 0)}`;
  Els.osdTime.classList.remove('hidden');
}

/* -------------------------------------------------------------
 * Раздел 24. Привязка событий к кнопкам интерфейса
 * ------------------------------------------------------------- */

function _bindButtons() {
  /* Панель управления */
  Els.btnPlayPause.addEventListener('click', togglePlay);
  Els.btnPrev.addEventListener('click', playPrev);
  Els.btnNext.addEventListener('click', playNext);
  Els.btnMute.addEventListener('click', toggleMute);
  Els.btnAspect.addEventListener('click', cycleAspect);
  Els.btnSubs.addEventListener('click', () => SubtitleManager.toggleVisibility());
  Els.btnQueue.addEventListener('click', () => togglePanel('queue'));
  Els.btnSettings.addEventListener('click', () => togglePanel('settings'));
  Els.btnPiP.addEventListener('click', togglePiP);
  Els.btnFullscreen.addEventListener('click', toggleFullscreen);

  /* Drop-зона */
  Els.btnOpenFile.addEventListener('click', openFile);
  Els.btnOpenFolder.addEventListener('click', openFolder);

  /* Панель настроек */
  Els.btnSettingsClose.addEventListener('click', () => _closePanel());

  /* Настройки — субтитры */
  Els.btnSubLoad.addEventListener('click', openSubtitleFile);
  Els.btnSubSyncM500.addEventListener('click', () => SubtitleManager.setOffset(-500));
  Els.btnSubSyncM100.addEventListener('click', () => SubtitleManager.setOffset(-100));
  Els.btnSubSyncReset.addEventListener('click', () => SubtitleManager.resetOffset());
  Els.btnSubSyncP100.addEventListener('click', () => SubtitleManager.setOffset(+100));
  Els.btnSubSyncP500.addEventListener('click', () => SubtitleManager.setOffset(+500));

  /* Настройки — инструменты */
  Els.btnScreenshot.addEventListener('click', takeScreenshot);
  Els.btnFileInfo.addEventListener('click', toggleFileInfo);

  /* Настройки — A-B Loop */
  Els.btnSetA.addEventListener('click', setAPoint);
  Els.btnSetB.addEventListener('click', setBPoint);
  Els.btnResetAB.addEventListener('click', () => {
    resetABLoop();
    notify('✕ A-B сброшен');
  });

  /* Click overlay — одинарный клик: пауза/воспроизведение,
                     двойной клик: полноэкранный режим         */
  let _clickTimer = null;
  Els.clickOverlay.addEventListener('click', () => {
    clearTimeout(_clickTimer);
    _clickTimer = setTimeout(() => {
      if (Els.video.paused) {
        Els.video.play().catch(() => {});
        showOsdIcon('▶');
      } else {
        Els.video.pause();
        showOsdIcon('⏸');
      }
    }, 200);
  });
  Els.clickOverlay.addEventListener('dblclick', () => {
    clearTimeout(_clickTimer);
    toggleFullscreen();
  });

  /* Автоскрытие контролов при движении мыши */
  Els.playerWrap.addEventListener('mousemove',  showControls);
  Els.playerWrap.addEventListener('mouseenter', showControls);

  /* Колесо прокрутки: Ctrl — зум, иначе — громкость */
  Els.playerWrap.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey) {
      zoomBy(e.deltaY < 0 ? +ZOOM_STEP : -ZOOM_STEP, e.clientX, e.clientY);
    } else {
      setVolume(State.volume + (e.deltaY < 0 ? 0.05 : -0.05));
    }
  }, { passive: false });
}

/* -------------------------------------------------------------
 * Раздел 25. Интеграция с всплывающим окном расширения
 * ------------------------------------------------------------- */

/** Обрабатывает параметры URL при открытии страницы плеера. */
function _handleUrlParams() {
  const mode = new URLSearchParams(window.location.search).get('mode');
  if (mode === 'file')   openFile();
  if (mode === 'folder') openFolder();
};

/* -------------------------------------------------------------
 * Раздел 26. Инициализация
 * ------------------------------------------------------------- */

/**
 * Точка входа. Открывает БД, восстанавливает настройки,
 * инициализирует все модули.
 */
async function init() {
  await DB.open();

  /* Восстановление пользовательских настроек */
  const saved = Settings.load();
  setVolume(saved.volume);
  State.aspectModeIndex = saved.aspectModeIndex;
  applyAspect(false);
  setSpeedIndex(saved.speedIndex);

  /* Инициализация модулей */
  initZoomEvents();
  initQueueEvents();
  _renderSpeedSteps();
  _bindButtons();

  showDropZone(true);
  _handleUrlParams();

  console.log('[PP] Proletarian Player v1.0 — готов.');
}

init();