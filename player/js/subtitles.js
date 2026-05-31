/* =============================================================
 * ОБОЗНАЧЕНИЕ : PP.JS.03
 * НАИМЕНОВАНИЕ: Управление субтитрами
 * ДОКУМЕНТ    : Текст программы (ГОСТ 19.401-78)
 * ПРОГРАММА   : Proletarian Player
 * ВЕРСИЯ      : 1.0
 * ЗАВИСИМОСТИ : helpers.js · State · Els
 * =============================================================
 * Назначение: загрузка файлов субтитров (SRT, VTT, ASS/SSA),
 * конвертация в формат WebVTT, синхронизация со сдвигом по
 * времени, управление видимостью трека.
 * ============================================================= */

'use strict';

const SubtitleManager = {

  _originalVtt: null,  /* оригинальный VTT-текст до применения сдвига */
  _blobUrl:     null,  /* текущий Blob URL загруженного трека          */
  _offsetMs:    0,     /* текущий сдвиг в миллисекундах                */

  /* -----------------------------------------------------------
   * Раздел 1. Публичный API
   * ----------------------------------------------------------- */

  /**
   * Загружает файл субтитров, конвертирует и применяет к видео.
   * @param {File} file
   */
  async load(file) {
    try {
      this.unload();
      const ext  = getExt(file.name);
      const text = await file.text();

      if      (ext === 'vtt')                 { this._originalVtt = text; }
      else if (ext === 'srt')                 { this._originalVtt = this._srtToVtt(text); }
      else if (ext === 'ass' || ext === 'ssa'){ this._originalVtt = this._assToVtt(text); }
      else { throw new Error(`Неизвестный формат: ${ext}`); }

      this._offsetMs = 0;
      this._applyVtt(this._originalVtt);
      this._updateOffsetLabel();

      State.subsEnabled = true;
      Els.btnSubs.classList.add('active');
      notify(`💬 ${file.name}`);
    } catch (e) {
      notify(`⚠ Субтитры: ${e.message}`);
    }
  },

  /**
   * Выгружает текущий трек субтитров и сбрасывает состояние.
   */
  unload() {
    this._revokeBlob();
    Array.from(Els.video.querySelectorAll('track')).forEach(t => t.remove());
    this._originalVtt = null;
    this._offsetMs    = 0;
    State.subsEnabled = false;
    Els.btnSubs.classList.remove('active');
    Els.btnSubLoad.classList.remove('sub-loaded');
    this._updateOffsetLabel();
  },

  /**
   * Сдвигает субтитры на deltaMs миллисекунд.
   * @param {number} deltaMs
   */
  setOffset(deltaMs) {
    if (!this._originalVtt) { notify('⚠ Субтитры не загружены'); return; }
    this._offsetMs += deltaMs;
    const shifted = this._shiftVtt(this._originalVtt, this._offsetMs);
    this._applyVtt(shifted);
    this._updateOffsetLabel();
    notify(`💬 Сдвиг: ${this._offsetMs > 0 ? '+' : ''}${this._offsetMs} мс`);
  },

  /**
   * Сбрасывает сдвиг субтитров к нулю.
   */
  resetOffset() {
    if (!this._originalVtt) return;
    this._offsetMs = 0;
    this._applyVtt(this._originalVtt);
    this._updateOffsetLabel();
    notify('💬 Сдвиг субтитров сброшен');
  },

  /**
   * Переключает видимость субтитров.
   */
  toggleVisibility() {
    if (!Els.video.textTracks.length) {
      notify('⚠ Субтитры не загружены — используй SUB+ в настройках');
      return;
    }
    State.subsEnabled = !State.subsEnabled;
    for (const t of Els.video.textTracks) {
      t.mode = State.subsEnabled ? 'showing' : 'hidden';
    }
    Els.btnSubs.classList.toggle('active', State.subsEnabled);
    notify(State.subsEnabled ? '💬 Субтитры: вкл' : '💬 Субтитры: выкл');
  },

  /**
   * Ищет файл субтитров среди набора файлов по базовому имени видео.
   * Приоритет форматов: vtt > srt > ass > ssa.
   * @param {File}   videoFile
   * @param {File[]} allFiles
   * @returns {File|null}
   */
  findMatchingSubtitle(videoFile, allFiles) {
    const vBase = baseName(videoFile.name);
    for (const ext of ['vtt', 'srt', 'ass', 'ssa']) {
      const found = allFiles.find(f => {
        if (getExt(f.name) !== ext) return false;
        const sBase = baseName(f.name);
        return sBase === vBase || sBase.startsWith(vBase);
      });
      if (found) return found;
    }
    return null;
  },

  /** @returns {number} Текущий сдвиг в миллисекундах. */
  getOffsetMs() { return this._offsetMs; },

  /* -----------------------------------------------------------
   * Раздел 2. Внутренние методы — применение трека
   * ----------------------------------------------------------- */

  /**
   * Создаёт Blob из VTT-текста и подключает как <track> к видео.
   * @param {string} vttText
   */
  _applyVtt(vttText) {
    this._revokeBlob();
    const blob    = new Blob([vttText], { type: 'text/vtt' });
    this._blobUrl = URL.createObjectURL(blob);

    Array.from(Els.video.querySelectorAll('track')).forEach(t => t.remove());

    const track   = document.createElement('track');
    track.kind    = 'subtitles';
    track.srclang = 'ru';
    track.src     = this._blobUrl;
    track.default = true;
    Els.video.appendChild(track);

    /* Браузеру требуется небольшая задержка для загрузки трека */
    setTimeout(() => {
      for (const t of Els.video.textTracks) {
        t.mode = State.subsEnabled ? 'showing' : 'hidden';
      }
      Els.btnSubLoad.classList.add('sub-loaded');
    }, 80);
  },

  /** Освобождает предыдущий Blob URL. */
  _revokeBlob() {
    if (this._blobUrl) {
      URL.revokeObjectURL(this._blobUrl);
      this._blobUrl = null;
    }
  },

  /** Обновляет метку текущего сдвига в панели настроек. */
  _updateOffsetLabel() {
    if (!Els.subOffsetLabel) return;
    const ms = this._offsetMs;
    Els.subOffsetLabel.textContent =
      ms === 0 ? '0 мс' : `${ms > 0 ? '+' : ''}${ms} мс`;
  },

  /* -----------------------------------------------------------
   * Раздел 3. Конвертация форматов субтитров
   * ----------------------------------------------------------- */

  /**
   * Конвертирует SubRip (SRT) в WebVTT.
   * @param {string} srt
   * @returns {string}
   */
  _srtToVtt(srt) {
    const text = srt.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return 'WEBVTT\n\n' + text
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
      .replace(/<font[^>]*>/gi,  '')
      .replace(/<\/font>/gi,     '')
      .replace(/\{[^}]*\}/g,     '');
  },

  /**
   * Конвертирует Advanced SubStation Alpha (ASS/SSA) в WebVTT.
   * @param {string} ass
   * @returns {string}
   */
  _assToVtt(ass) {
    const lines  = ass.split(/\r?\n/);
    const events = [];
    let inEvents = false;
    let format   = [];

    for (const line of lines) {
      const t = line.trim();
      if (t === '[Events]')                      { inEvents = true;  continue; }
      if (t.startsWith('[') && t !== '[Events]') { inEvents = false; continue; }
      if (!inEvents) continue;

      if (t.startsWith('Format:')) {
        format = t.replace('Format:', '').split(',').map(s => s.trim());
        continue;
      }

      if (t.startsWith('Dialogue:')) {
        const rest   = t.replace('Dialogue:', '').trim();
        const vals   = rest.split(',');
        const iStart = format.indexOf('Start');
        const iEnd   = format.indexOf('End');
        const iText  = format.indexOf('Text');
        if (iStart < 0 || iEnd < 0 || iText < 0) continue;

        const start   = this._assTime(vals[iStart]);
        const end     = this._assTime(vals[iEnd]);
        const rawText = vals.slice(iText).join(',');
        const text    = rawText
          .replace(/\{[^}]*\}/g, '')
          .replace(/\\N/gi,      '\n')
          .replace(/\\h/g,       '\u00A0')
          .trim();

        if (start && end && text) events.push({ start, end, text });
      }
    }

    events.sort((a, b) => a.start.localeCompare(b.start));

    return 'WEBVTT\n\n' +
      events.map((e, i) => `${i + 1}\n${e.start} --> ${e.end}\n${e.text}`)
            .join('\n\n') + '\n\n';
  },

  /**
   * Преобразует время формата ASS "H:MM:SS.cs" в "HH:MM:SS.mmm".
   * @param {string} t
   * @returns {string}
   */
  _assTime(t) {
    if (!t) return '';
    const m = t.trim().match(/^(\d+):(\d{2}):(\d{2})\.(\d{2})$/);
    if (!m) return '';
    const h   = parseInt(m[1]);
    const min = parseInt(m[2]);
    const sec = parseInt(m[3]);
    const ms  = m[4].padEnd(3, '0');
    return h > 0
      ? `${pad(h)}:${pad(min)}:${pad(sec)}.${ms}`
      : `${pad(min)}:${pad(sec)}.${ms}`;
  },

  /* -----------------------------------------------------------
   * Раздел 4. Сдвиг таймкодов VTT
   * ----------------------------------------------------------- */

  /**
   * Сдвигает все таймкоды в VTT-тексте на offsetMs миллисекунд.
   * @param {string} vtt
   * @param {number} offsetMs
   * @returns {string}
   */
  _shiftVtt(vtt, offsetMs) {
    return vtt.replace(
      /(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})/g,
      ts => this._shiftTimestamp(ts, offsetMs)
    );
  },

  /**
   * Сдвигает один таймкод VTT на offsetMs миллисекунд.
   * @param {string} ts       - Таймкод в формате MM:SS.mmm или HH:MM:SS.mmm.
   * @param {number} offsetMs
   * @returns {string}
   */
  _shiftTimestamp(ts, offsetMs) {
    const parts = ts.split(':');
    let h, m, s, ms;

    if (parts.length === 3) {
      h  = parseInt(parts[0]);
      m  = parseInt(parts[1]);
      const sp = parts[2].split('.');
      s  = parseInt(sp[0]);
      ms = parseInt(sp[1]);
    } else {
      h  = 0;
      m  = parseInt(parts[0]);
      const sp = parts[1].split('.');
      s  = parseInt(sp[0]);
      ms = parseInt(sp[1]);
    }

    let total = (h * 3600000 + m * 60000 + s * 1000 + ms) + offsetMs;
    if (total < 0) total = 0;

    const rMs = total % 1000;
    const rS  = Math.floor(total / 1000)    % 60;
    const rM  = Math.floor(total / 60000)   % 60;
    const rH  = Math.floor(total / 3600000);

    const msStr = String(rMs).padStart(3, '0');
    return rH > 0
      ? `${pad(rH)}:${pad(rM)}:${pad(rS)}.${msStr}`
      : `${pad(rM)}:${pad(rS)}.${msStr}`;
  },
};