/* =============================================================
 * ОБОЗНАЧЕНИЕ : PP.JS.02
 * НАИМЕНОВАНИЕ: Хранилище данных (история и настройки)
 * ДОКУМЕНТ    : Текст программы (ГОСТ 19.401-78)
 * ПРОГРАММА   : Proletarian Player
 * ВЕРСИЯ      : 1.0
 * ЗАВИСИМОСТИ : helpers.js
 * =============================================================
 * Назначение:
 *   PlayerDB — история просмотров на базе IndexedDB;
 *   Settings  — пользовательские настройки на базе localStorage.
 * ============================================================= */

'use strict';

/* -------------------------------------------------------------
 * Раздел 1. Константы базы данных
 * ------------------------------------------------------------- */

const DB_NAME       = 'ProletarianPlayerDB';
const DB_VERSION    = 1;
const STORE_HISTORY = 'history';

/* -------------------------------------------------------------
 * Раздел 2. Класс PlayerDB — история просмотров (IndexedDB)
 * ------------------------------------------------------------- */

class PlayerDB {
  constructor() { this.db = null; }

  /**
   * Открывает (или создаёт) базу данных.
   * @returns {Promise<PlayerDB>}
   */
  async open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_HISTORY)) {
          const store = db.createObjectStore(STORE_HISTORY, { keyPath: 'id' });
          store.createIndex('last_watched', 'last_watched', { unique: false });
        }
      };

      req.onsuccess = e => { this.db = e.target.result; resolve(this); };
      req.onerror   = e => reject(e.target.error);
    });
  }

  /**
   * Формирует уникальный идентификатор файла по имени и размеру.
   * @param {File} file
   * @returns {string}
   */
  static makeId(file) {
    return `${file.name}__${file.size}`;
  }

  /**
   * Возвращает запись истории для указанного файла или null.
   * @param {File} file
   * @returns {Promise<Object|null>}
   */
  async getRecord(file) {
    const id = PlayerDB.makeId(file);
    return new Promise(resolve => {
      const tx  = this.db.transaction(STORE_HISTORY, 'readonly');
      const req = tx.objectStore(STORE_HISTORY).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => resolve(null);
    });
  }

  /**
   * Сохраняет или обновляет запись истории для файла.
   * @param {File}   file
   * @param {number} position - Текущая позиция в секундах.
   * @param {number} duration - Полная длительность в секундах.
   * @returns {Promise<Object>} Сохранённая запись.
   */
  async saveRecord(file, position, duration) {
    const id  = PlayerDB.makeId(file);
    const pct = duration > 0 ? Math.round((position / duration) * 100) : 0;

    let status = 'watching';
    if (pct < 3)  status = 'unwatched';
    if (pct > 92) status = 'completed';

    const record = {
      id,
      filename:     file.name,
      filesize:     file.size,
      position_sec: position,
      duration_sec: duration,
      progress_pct: pct,
      status,
      last_watched: new Date().toISOString(),
    };

    return new Promise(resolve => {
      const tx = this.db.transaction(STORE_HISTORY, 'readwrite');
      tx.objectStore(STORE_HISTORY).put(record);
      tx.oncomplete = () => resolve(record);
    });
  }

  /**
   * Возвращает все записи истории.
   * @returns {Promise<Object[]>}
   */
  async getAllRecords() {
    return new Promise(resolve => {
      const tx  = this.db.transaction(STORE_HISTORY, 'readonly');
      const req = tx.objectStore(STORE_HISTORY).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => resolve([]);
    });
  }
}

/** Единственный экземпляр базы данных. */
const DB = new PlayerDB();

/* -------------------------------------------------------------
 * Раздел 3. Настройки пользователя (localStorage)
 * ------------------------------------------------------------- */

/** Доступные шаги скорости воспроизведения. */
const SPEED_STEPS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];

/**
 * Объект Settings управляет сохранением и загрузкой
 * пользовательских настроек через localStorage.
 */
const Settings = {
  KEY: 'pp_settings_v1',

  defaults: {
    volume:          1.0,
    speedIndex:      3,   /* индекс 1.0× в SPEED_STEPS */
    aspectModeIndex: 0,   /* 0 = fit                   */
  },

  /**
   * Загружает настройки из localStorage.
   * При ошибке парсинга возвращает значения по умолчанию.
   * @returns {Object}
   */
  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      return raw ? { ...this.defaults, ...JSON.parse(raw) } : { ...this.defaults };
    } catch {
      return { ...this.defaults };
    }
  },

  /**
   * Сохраняет настройки в localStorage.
   * @param {Object} state - Объект состояния плеера.
   */
  save(state) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify({
        volume:          state.volume,
        speedIndex:      state.speedIndex,
        aspectModeIndex: state.aspectModeIndex,
      }));
    } catch { /* Игнорируем ошибки записи (приватный режим и т.п.) */ }
  },
};