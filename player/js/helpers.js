/* =============================================================
 * ОБОЗНАЧЕНИЕ : PP.JS.01
 * НАИМЕНОВАНИЕ: Вспомогательные функции общего назначения
 * ДОКУМЕНТ    : Текст программы (ГОСТ 19.401-78)
 * ПРОГРАММА   : Proletarian Player
 * ВЕРСИЯ      : 1.0
 * ЗАВИСИМОСТИ : нет
 * =============================================================
 * Назначение: чистые функции без побочных эффектов.
 * Используются всеми остальными модулями плеера.
 * ============================================================= */

'use strict';

/* -------------------------------------------------------------
 * Раздел 1. Форматирование времени
 * ------------------------------------------------------------- */

/**
 * Преобразует секунды в строку формата H:MM:SS или MM:SS.
 * @param {number} sec - Время в секундах.
 * @returns {string}
 */
function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Дополняет число до двух цифр ведущим нулём.
 * @param {number} n
 * @returns {string}
 */
function pad(n) { return String(n).padStart(2, '0'); }

/* -------------------------------------------------------------
 * Раздел 2. Работа с файлами
 * ------------------------------------------------------------- */

/**
 * Возвращает расширение имени файла в нижнем регистре.
 * @param {string} filename
 * @returns {string}
 */
function getExt(filename) {
  return filename.split('.').pop().toLowerCase();
}

/** Поддерживаемые форматы видео. */
const SUPPORTED_VIDEO_EXTS = [
  'mp4', 'webm', 'mkv', 'avi', 'mov',
  'flv', 'ts',   'ogv', 'ogg', 'm4v',
  'wmv', '3gp',  'm2ts',
];

/** Поддерживаемые форматы субтитров. */
const SUPPORTED_SUB_EXTS = ['srt', 'vtt', 'ass', 'ssa'];

/**
 * Проверяет, является ли файл видеофайлом по расширению.
 * @param {string} filename
 * @returns {boolean}
 */
function isVideoFile(filename) {
  return SUPPORTED_VIDEO_EXTS.includes(getExt(filename));
}

/**
 * Проверяет, является ли файл файлом субтитров по расширению.
 * @param {string} filename
 * @returns {boolean}
 */
function isSubtitleFile(filename) {
  return SUPPORTED_SUB_EXTS.includes(getExt(filename));
}

/**
 * Возвращает базовое имя файла (без расширения, в нижнем регистре).
 * @param {string} filename
 * @returns {string}
 */
function baseName(filename) {
  return filename.replace(/\.[^.]+$/, '').toLowerCase();
}

/* -------------------------------------------------------------
 * Раздел 3. Работа со строками
 * ------------------------------------------------------------- */

/**
 * Экранирует спецсимволы HTML.
 * @param {string} str
 * @returns {string}
 */
function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Сокращает строку до maxLen символов с многоточием посередине.
 * @param {string} name
 * @param {number} [maxLen=48]
 * @returns {string}
 */
function shortName(name, maxLen = 48) {
  if (name.length <= maxLen) return name;
  const half = Math.floor((maxLen - 1) / 2);
  return name.slice(0, half) + '…' + name.slice(-half);
}

/* -------------------------------------------------------------
 * Раздел 4. Разбор имён файлов
 *
 * Возвращает объект { show, season, episode, type, sortKey, label }.
 * Поддерживаемые шаблоны имён перечислены по приоритету.
 * ------------------------------------------------------------- */

/**
 * Разбирает имя файла и извлекает метаданные серии/фильма.
 * @param {string} name - Имя файла с расширением.
 * @returns {{ show: string, season: number, episode: number,
 *             type: string, sortKey: number, label: string }}
 */
function parseFilename(name) {
  const base = name.replace(/\.[^.]+$/, '');

  /* 1. Русский: "Название.Сезон X.Серия Y" */
  const mRu = base.match(/^(.+?)\s*[.]\s*[Сс]езон\s*(\d+)\s*[.]\s*[Сс]ери[яи]\s*(\d+)/i);
  if (mRu) {
    const season  = parseInt(mRu[2], 10);
    const episode = parseInt(mRu[3], 10);
    return {
      show: mRu[1].replace(/\.+$/, '').trim(), season, episode,
      type: 'series', sortKey: season * 100000 + episode,
      label: `Сезон ${season}, Серия ${episode}`,
    };
  }

  /* 2. Русский: "Название - Серия X" */
  const mRuEp = base.match(/^(.+?)\s*[-–—]\s*[Сс]ери[яи]\s*(\d+)/i);
  if (mRuEp) {
    const episode = parseInt(mRuEp[2], 10);
    return {
      show: mRuEp[1].replace(/\.+$/, '').trim(), season: 1, episode,
      type: 'series', sortKey: episode, label: `Серия ${episode}`,
    };
  }

  /* 3. S01E02 */
  const mSE = base.match(/[Ss](\d{1,2})[Ee](\d{1,3})/);
  if (mSE) {
    const show    = base.split(/[Ss]\d{1,2}[Ee]/)[0]
      .replace(/[._-]+$/, '').replace(/[._]+/g, ' ').trim();
    const season  = parseInt(mSE[1], 10);
    const episode = parseInt(mSE[2], 10);
    return {
      show: show || base, season, episode,
      type: 'series', sortKey: season * 100000 + episode,
      label: `S${pad(season)}E${pad(episode)}`,
    };
  }

  /* 4. Аниме: "[Group] Title - 001 [quality]" */
  const mAnime = base.match(/\]\s*(.+?)\s*[-–]\s*(\d{1,4})\s*(?:\[|$)/);
  if (mAnime) {
    const episode = parseInt(mAnime[2], 10);
    return {
      show: mAnime[1].trim(), season: 1, episode,
      type: 'anime', sortKey: episode, label: `Эп. ${episode}`,
    };
  }

  /* 5. ep/episode */
  const mEp = base.match(/(?:ep(?:isode)?)[._\s-]*(\d{1,4})(?!\d)/i);
  if (mEp) {
    const show    = base.split(mEp[0])[0]
      .replace(/[._-]+$/, '').replace(/[._]+/g, ' ').trim();
    const episode = parseInt(mEp[1], 10);
    return {
      show: show || base, season: 1, episode,
      type: 'series', sortKey: episode, label: `Эп. ${episode}`,
    };
  }

  /* 6. Часть / Part */
  const mPart = base.match(/(?:[Чч]асть|[Pp]art)[.\s_-]*(\d+)/i);
  if (mPart) {
    const show = base.split(mPart[0])[0]
      .replace(/[._-]+$/, '').replace(/[._]+/g, ' ').trim();
    const part = parseInt(mPart[1], 10);
    return {
      show: show || base, season: 0, episode: part,
      type: 'movie', sortKey: part, label: `Часть ${part}`,
    };
  }

  /* 7. Дата: "2024-01-15_..." */
  const mDate = base.match(/^(\d{4})[-._](\d{2})[-._](\d{2})/);
  if (mDate) {
    const sortKey = parseInt(mDate[1]) * 10000
                  + parseInt(mDate[2]) * 100
                  + parseInt(mDate[3]);
    return {
      show: 'Записи', season: 0, episode: 0,
      type: 'dated', sortKey,
      label: `${mDate[1]}-${mDate[2]}-${mDate[3]}`,
    };
  }

  /* 8. Номер в начале: "01. Название" */
  const mNum = base.match(/^(\d{1,4})[.\s_-]+(.+)/);
  if (mNum) {
    const episode = parseInt(mNum[1], 10);
    return {
      show: mNum[2].replace(/[._]+/g, ' ').trim(), season: 1, episode,
      type: 'series', sortKey: episode, label: `${episode}`,
    };
  }

  /* По умолчанию: одиночный фильм */
  return {
    show: base.replace(/[._]+/g, ' ').trim(),
    season: 0, episode: 0, type: 'movie', sortKey: 0, label: '',
  };
}