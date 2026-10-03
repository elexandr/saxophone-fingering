// Saxophone Fingering Assistant - Full Range Version
// Использует полный диапазон C2 - A5 из JSON файла

// Геометрия стана: те же числа, что в loadPositionsFromJSON и drawFullStaff
const STAFF_LINE_SPACING = 20;
const STAFF_MAIN_TOP = 160;
const STAFF_MAIN_BOTTOM = STAFF_MAIN_TOP + 4 * STAFF_LINE_SPACING; // 240
const STAFF_MIDDLE_LINE_Y = STAFF_MAIN_TOP + 2 * STAFF_LINE_SPACING; // 200
const STAFF_TOP_LEDGER = STAFF_MAIN_TOP - 4 * STAFF_LINE_SPACING; // 80
const STAFF_BOTTOM_LEDGER = STAFF_MAIN_BOTTOM + 4 * STAFF_LINE_SPACING; // 320
const STAFF_CLEF_WIDTH = 72; // место под скрипичный ключ и отступ до первой ноты
// Знак ноты рисуется в рамке 60px по центру ноты, то есть на 30px в каждую сторону
const GLYPH_HALF_WIDTH = 30;
// Высота ряда аппликатур при полном масштабе: карточка и панель вариантов
const FINGERING_ROW_HEIGHT = 230;
// Ниже этого предела строку не уменьшаем: аппликатуру уже не разобрать
const MIN_SYSTEM_SCALE = 0.6;
// Отступ от верха области, когда показываем звучащую строку
const PLAYBACK_SCROLL_MARGIN = 8;
// Пауза между кругами при игре по кругу: за неё стан успевает подняться
// на первую строку, и видно первые аппликатуры
const LOOP_PAUSE_SECONDS = 2;
// Части адреса для связи, записанные задом наперёд и по отдельности.
// Готового адреса нет ни в разметке, ни здесь: он собирается только тогда,
// когда посетитель сам нажмёт «показать адрес». Это не защита, а помеха
// простым сборщикам адресов, которые читают исходный код страницы.
const CONTACT_PARTS = ['moc', 'liamg', 'idabis'];
const DEFAULT_TIME_SIGNATURE = '4/4';

// Короткий доступ к переводам: строки интерфейса живут в i18n.js
function t(key, params) {
    return I18n.t(key, params);
}

class FullRangeStaffManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.notes = [];
        this.selectedNoteId = null;
        this.selectedBarLineId = null;
        this.showNoteNames = true;
        this.showFingerings = true; // Показывать ряды аппликатур под станом
        this.imageSize = 80; // Ширина 80px, высота 200px
        this.displayMode = 'sharps'; // 'sharps' или 'flats'
        this.tempo = 80; // Темп воспроизведения, ударов в минуту
        this.loopPlayback = false; // Играть по кругу
        this.timeSignature = DEFAULT_TIME_SIGNATURE; // Размер такта
        this.barLineMode = 'auto'; // 'auto' - черты по размеру, 'manual' - вручную
        this.notationMarks = []; // Элементы тактовых черт и знаков репризы
        this.measureCount = 0;
        this.staffContainers = []; // Станы по строкам
        this.fingeringContainers = []; // Ряды аппликатур по строкам
        this.resizeTimer = null;
        this.melodyPlayer = null;
        this.imageCache = null;
        this.autosaveTimer = null;
        this.loading = false;
        
        // Загружаем позиции из JSON (упрощенная версия)
        this.positions = this.loadPositionsFromJSON();
        
        this.init();
    }
    
    // Загрузка позиций из JSON (упрощенная версия)
    loadPositionsFromJSON() {
        // Создаем упрощенную версию данных на основе JSON
        // Всего 27 позиций от C2 до A5
        const positions = [];
        
        // Базовые координаты Y для нотного стана
        // 4 дополнительные линии снизу, 5 основных, 4 дополнительные сверху
        // В музыке: повышение идет снизу вверх, поэтому C2 (низ) должна быть внизу
        const baseY = 340; // C2 (самая низкая) внизу
        const lineSpacing = STAFF_LINE_SPACING;
        const verticalOffset = 0; // Сдвиг вверх убран: сверху нужно место под окошки длительности
        const noteOffset = lineSpacing; // Сдвиг нот ниже линеек на расстояние одного промежутка
        
        // Создаем позиции на основе данных из JSON
        // position_id от 1 до 27
        for (let i = 1; i <= 27; i++) {
            // Вычисляем Y координату на основе position_id
            // В JSON: y_half_steps от -1 до 25
            // C2 (position_id 1) должна быть внизу, A5 (position_id 27) вверху
            const yHalfSteps = i - 2; // position_id 1 -> y_half_steps -1
            const y = baseY - (yHalfSteps * (lineSpacing / 2)) - verticalOffset - noteOffset; // Обратный знак! и сдвиг вверх - сдвиг нот выше (в другую сторону)
        
            // Определяем имя ноты на основе position_id
            const noteInfo = this.getNoteInfoByPositionId(i);
            
            positions.push({
                id: i,
                name: noteInfo.name,
                displayName: noteInfo.displayName,
                y: y,
                description: noteInfo.description,
                fingering: noteInfo.fingering,
                hasFingering: noteInfo.hasFingering,
                variants: noteInfo.variants || 1
            });
        }
        
        return positions;
    }
    
    // Получение информации о ноте по position_id с учетом стратегии отображения
    getNoteInfoByPositionId(positionId) {
        // Базовое сопоставление position_id -> базовая нота и октава
        const baseNoteMap = {
            1: { baseNote: 'C', octave: 2 },
            2: { baseNote: 'D', octave: 2 },
            3: { baseNote: 'E', octave: 2 },
            4: { baseNote: 'F', octave: 2 },
            5: { baseNote: 'G', octave: 2 },
            6: { baseNote: 'A', octave: 2 },
            7: { baseNote: 'B', octave: 2 },
            8: { baseNote: 'C', octave: 3 },
            9: { baseNote: 'D', octave: 3 },
            10: { baseNote: 'E', octave: 3 },
            11: { baseNote: 'F', octave: 3 },
            12: { baseNote: 'G', octave: 3 },
            13: { baseNote: 'A', octave: 3 },
            14: { baseNote: 'B', octave: 3 },
            15: { baseNote: 'C', octave: 4 },
            16: { baseNote: 'D', octave: 4 },
            17: { baseNote: 'E', octave: 4 },
            18: { baseNote: 'F', octave: 4 },
            19: { baseNote: 'G', octave: 4 },
            20: { baseNote: 'A', octave: 4 },
            21: { baseNote: 'B', octave: 4 },
            22: { baseNote: 'C', octave: 5 },
            23: { baseNote: 'D', octave: 5 },
            24: { baseNote: 'E', octave: 5 },
            25: { baseNote: 'F', octave: 5 },
            26: { baseNote: 'G', octave: 5 },
            27: { baseNote: 'A', octave: 5 }
        };
        
        const baseInfo = baseNoteMap[positionId] || { baseNote: '?', octave: 0 };
        
        // По умолчанию используем натуральную ноту
        const name = `${baseInfo.baseNote}${baseInfo.octave}`;
        const displayName = name;
        
        // Определяем аппликатуру на основе данных из JSON
        // Исправляем названия файлов согласно JSON
        const fingeringMap = {
            6: { fingering: '045_A2_v1.jpg', hasFingering: true, variants: 1 },
            7: { fingering: '047_B2_v1.jpg', hasFingering: true, variants: 1 },
            8: { fingering: '048_C3_v1.jpg', hasFingering: true, variants: 1 },
            9: { fingering: '050_D3_v1.jpg', hasFingering: true, variants: 1 },
            10: { fingering: '052_E3_v1.jpg', hasFingering: true, variants: 1 },
            11: { fingering: '053_F3_v1.jpg', hasFingering: true, variants: 1 },
            12: { fingering: '055_G3_v1.jpg', hasFingering: true, variants: 1 },
            13: { fingering: '057_A3_v1.jpg', hasFingering: true, variants: 1 }, // В JSON только 1 вариант для A3
            14: { fingering: '059_B3_v1.jpg', hasFingering: true, variants: 1 }, // В JSON только 1 вариант для B3
            15: { fingering: '060_C4_v1.jpg', hasFingering: true, variants: 2 }, // В JSON 2 варианта для C4
            16: { fingering: '062_D4_v1.jpg', hasFingering: true, variants: 1 },
            17: { fingering: '064_E4_v1.jpg', hasFingering: true, variants: 1 },
            18: { fingering: '065_F4_v1.jpg', hasFingering: true, variants: 1 },
            19: { fingering: '067_G4_v1.jpg', hasFingering: true, variants: 1 },
            20: { fingering: '069_A4_v1.jpg', hasFingering: true, variants: 1 }, // В JSON только 1 вариант для A4
            21: { fingering: '071_B4_v1.jpg', hasFingering: true, variants: 1 }, // В JSON только 1 вариант для B4
            22: { fingering: '072_C5_v1.jpg', hasFingering: true, variants: 2 }, // В JSON 2 варианта для C5
            23: { fingering: '074_D5_v1.jpg', hasFingering: true, variants: 1 },
            24: { fingering: '076_E5_v1.jpg', hasFingering: true, variants: 2 }, // В JSON 2 варианта для E5
            25: { fingering: '077_F5_v1.jpg', hasFingering: true, variants: 2 }, // В JSON 2 варианта для F5
            26: { fingering: null, hasFingering: false, variants: 1 },
            27: { fingering: null, hasFingering: false, variants: 1 }
        };
        
        const fingeringInfo = fingeringMap[positionId] || { fingering: null, hasFingering: false, variants: 1 };
        
        return {
            name: name,
            displayName: displayName,
            description: `${name} (позиция ${positionId})`,
            fingering: fingeringInfo.fingering,
            hasFingering: fingeringInfo.hasFingering,
            variants: fingeringInfo.variants,
            baseNote: baseInfo.baseNote,
            octave: baseInfo.octave
        };
    }
    
    init() {
        // Язык ставим до первой отрисовки, чтобы все подписи были на нём
        I18n.setLang(I18n.detectLang(), false);

        this.syncSystems(1);
        this.updateNoteCount();
        this.updateAllFingerings();
        this.setFingeringsVisible(this.showFingerings, true);
        this.initImageCache();
        this.melodyPlayer = Playback.createPlayer();
        document.addEventListener('click', () => this.closeDurationMenus());
        
        // При изменении ширины окна строки пересобираются
        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => this.relayout(), 150);
        });
        
        const signatureSelect = document.getElementById('time-signature');
        if (signatureSelect) signatureSelect.value = this.timeSignature;
        
        const fingeringsCheckbox = document.getElementById('show-fingerings');
        if (fingeringsCheckbox) {
            fingeringsCheckbox.checked = this.showFingerings;
            fingeringsCheckbox.addEventListener('change', (e) => {
                this.setFingeringsVisible(e.target.checked);
            });
        }
        
        const loopCheckbox = document.getElementById('loop-playback');
        if (loopCheckbox) {
            loopCheckbox.checked = this.loopPlayback;
            loopCheckbox.addEventListener('change', (e) => {
                this.setLoopPlayback(e.target.checked);
            });
        }
        
        this.bindLanguageSwitch();
        this.bindAboutModal();
        this.initConsent();
        this.updateLanguageButtons();
        this.updateBarLineButtons();
        this.updateMeasureInfo();
        this.updateStatus(t('status.ready'));
    }
    
    // === Язык, окно «О проекте», предупреждение о настройках ===
    
    bindLanguageSwitch() {
        document.querySelectorAll('.lang-btn').forEach(button => {
            button.addEventListener('click', () => this.applyLanguage(button.dataset.lang));
        });
    }
    
    updateLanguageButtons() {
        const current = I18n.getLang();
        document.querySelectorAll('.lang-btn').forEach(button => {
            button.classList.toggle('active', button.dataset.lang === current);
        });
    }
    
    applyLanguage(lang, persist = true) {
        I18n.setLang(lang, persist);
        this.refreshTexts();
        this.updateLanguageButtons();
    }
    
    // Перевыводит всё, что формируется кодом: подписи знаков, окошки, строки
    refreshTexts() {
        this.closeDurationMenus();
        
        this.staffContainers.forEach(staff => {
            staff.title = t('staff.staffTitle');
            const clef = staff.querySelector('.staff-clef');
            if (clef) clef.title = t('staff.clef');
        });
        
        this.notes.forEach(element => {
            const label = element.element ? element.element.querySelector('.note-label') : null;
            if (label) label.textContent = element.displayName;
            this.refreshElement(element);
        });
        
        const selected = this.notes.find(n => n.id === this.selectedNoteId);
        if (selected) this.updateSelectionInfo(selected);
        else document.getElementById('selected-note').textContent = t('app.none');
        
        this.relayout();
        this.updateBarLineButtons();
        this.updateCacheStatus();
    }
    
    // Обновляет подписи о выделенном элементе в шапке
    updateSelectionInfo(element) {
        document.getElementById('selected-note').textContent = element.isRest ? t('rest.word') : element.displayName;
        document.getElementById('selected-note-info').textContent = element.isRest
            ? t(element.dotted ? 'rest.infoDotted' : 'rest.info', { name: this.durationLabel(element.duration) })
            : t('note.info', { name: element.displayName, position: element.positionId });
    }
    
    bindAboutModal() {
        const modal = document.getElementById('about-modal');
        const openButton = document.getElementById('btn-about');
        if (!modal || !openButton) return;
        
        const close = () => { modal.hidden = true; };
        
        openButton.addEventListener('click', () => { modal.hidden = false; });
        modal.querySelectorAll('[data-close-modal]').forEach(node => {
            node.addEventListener('click', close);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.hidden) close();
        });
        
        this.bindContactReveal();
    }
    
    // Адрес для связи собирается из частей в обратном порядке:
    // имя и почтовый сервис соединяются собачкой, домен - точкой
    contactAddress() {
        const parts = CONTACT_PARTS
            .map(part => part.split('').reverse().join(''))
            .reverse();
        
        return parts[0] + '@' + parts.slice(1).join('.');
    }
    
    // Пока адрес не попросили, в разметке нет ни его, ни ссылки mailto
    bindContactReveal() {
        const button = document.getElementById('about-contact-show');
        if (!button || button.dataset.ready === '1') return;
        
        button.dataset.ready = '1';
        button.addEventListener('click', () => {
            const address = this.contactAddress();
            
            const link = document.createElement('a');
            link.className = 'about-contact-link';
            link.href = 'mailto:' + address;
            link.textContent = address;
            
            button.replaceWith(link);
        });
    }
    
    initConsent() {
        const banner = document.getElementById('consent');
        const okButton = document.getElementById('consent-ok');
        if (!banner || !okButton) return;
        
        if (!I18n.consentGiven()) banner.hidden = false;
        
        okButton.addEventListener('click', () => {
            I18n.giveConsent();
            banner.hidden = true;
        });
    }
    
    // Показ рядов аппликатур под станом
    setFingeringsVisible(show, silent = false) {        this.showFingerings = show !== false;
        
        if (this.container) {
            this.container.classList.toggle('hide-fingerings', !this.showFingerings);
        }
        
        const checkbox = document.getElementById('show-fingerings');
        if (checkbox && checkbox.checked !== this.showFingerings) {
            checkbox.checked = this.showFingerings;
        }
        
        if (!silent) this.scheduleAutosave();
    }
    
    // Зацикливание воспроизведения
    setLoopPlayback(loop, silent = false) {
        this.loopPlayback = !!loop;
        
        const checkbox = document.getElementById('loop-playback');
        if (checkbox && checkbox.checked !== this.loopPlayback) {
            checkbox.checked = this.loopPlayback;
        }
        
        if (!silent) this.scheduleAutosave();
    }
    
    // === Строки стана ===
    
    // Строит одну строку: стан с линейками и маркерами плюс ряд аппликатур под ним
    buildSystem(index) {
        const system = document.createElement('div');
        system.className = 'system';
        
        const wrapper = document.createElement('div');
        wrapper.className = 'staff-wrapper';
        
        const staff = document.createElement('div');
        staff.className = 'staff';
        staff.title = t('staff.staffTitle');
        
        this.drawStaffLines(staff);
        this.drawClef(staff);
        this.drawPositionMarkers(staff);
        
        staff.addEventListener('click', (e) => {
            if (e.target === staff) {
                this.deselectNote();
            }
        });
        
        wrapper.appendChild(staff);
        system.appendChild(wrapper);
        
        const row = document.createElement('div');
        row.className = 'fingerings-row';
        row.style.paddingLeft = STAFF_CLEF_WIDTH + 'px'; // карточки выравниваются с нотами
        row.style.gap = '0px'; // между карточками не должно быть промежутков
        row.style.columnGap = '0px';
        system.appendChild(row);
        
        this.container.appendChild(system);
        this.staffContainers.push(staff);
        this.fingeringContainers.push(row);
    }
    
    // Приводит число строк к нужному. Пересобирает их только при изменении количества,
    // ноты при этом переносятся заново в раскладке.
    syncSystems(count) {
        if (this.staffContainers.length === count) return;
        
        this.container.innerHTML = '';
        this.staffContainers = [];
        this.fingeringContainers = [];
        
        for (let index = 0; index < count; index++) {
            this.buildSystem(index);
        }
        
        // Запас под последней строкой, высоту задаёт updateStaffTail
        this.staffTail = document.createElement('div');
        this.staffTail.className = 'staff-tail';
        this.container.appendChild(this.staffTail);
    }
    
    // Ширина, доступная под одну строку
    staffWidth() {
        const width = this.container ? this.container.clientWidth : 0;
        // При уменьшении строки её собственная ширина больше экранной:
        // раскладка должна считать в её собственных пикселях
        const usable = width / (this.systemScaleValue || 1);
        return usable > 120 ? usable : 900;
    }
    
    // Сколько высоты остаётся под строку: окно минус шапка, панель и подвал
    viewportFreeHeight() {
        let chrome = 0;
        ['.app-header', '.staff-header', '.app-footer'].forEach(selector => {
            const node = document.querySelector(selector);
            if (node && !node.hidden) chrome += node.getBoundingClientRect().height;
        });
        return window.innerHeight - chrome - 24;
    }
    
    // Масштаб строки. На низком экране строка со станом и аппликатурами
    // не помещается целиком, а учиться по обрезанной картинке нельзя.
    // Уменьшаем строку целиком: zoom, в отличие от transform, меняет и
    // раскладку, поэтому ширина задаётся обратной долей - и строка
    // по-прежнему занимает всю ширину экрана, просто мельче.
    systemScale() {
        const metrics = this.systemMetrics();
        const required = metrics.height + FINGERING_ROW_HEIGHT + 34;
        const available = this.viewportFreeHeight();
        
        if (available <= 0 || required <= available) return 1;
        
        const scale = available / required;
        return Math.max(MIN_SYSTEM_SCALE, Math.round(scale * 100) / 100);
    }
    
    // Применяем масштаб к строкам: zoom плюс обратная ширина
    applySystemScale() {
        const scale = this.systemScaleValue || 1;
        
        this.staffContainers.forEach(staff => {
            const system = staff.closest('.system');
            if (!system) return;
            
            if (scale === 1) {
                system.style.zoom = '';
                system.style.width = '';
            } else {
                system.style.zoom = String(scale);
                system.style.width = (100 / scale) + '%';
            }
        });
    }
    
    // Сколько элементов влезает в одну строку (минус место под ключ)
    elementsPerSystem() {
        const slot = this.imageSize + 2;
        
        // Знак ноты шире половины шага при узких картинках: он по центру ноты
        // и выступает на 30px вправо. Плюс 2px запаса на разделитель такта.
        // Без этого запаса внизу поля появляется горизонтальная прокрутка.
        const overhang = Math.max(0, GLYPH_HALF_WIDTH - slot / 2) + 2;
        const usable = this.staffWidth() - STAFF_CLEF_WIDTH - overhang;
        
        return Math.max(1, Math.floor(usable / slot));
    }
    
    // Элементы, сгруппированные по тактам
    measureGroups() {
        const marks = this.computeBarLines();
        const groups = [];
        let current = [];
        
        this.notes.forEach(element => {
            current.push(element);
            if (marks.has(element.id)) {
                groups.push(current);
                current = [];
            }
        });
        
        if (current.length) groups.push(current);
        return groups;
    }
    
    // Разбивка мелодии на строки. Граница строки - граница такта.
    // Такт, который не влезает в строку целиком, режется принудительно.
    computeSystems() {
        if (!this.notes.length) return [[]];
        
        const perSystem = this.elementsPerSystem();
        const systems = [];
        let current = [];
        
        const flush = () => {
            if (current.length) {
                systems.push(current);
                current = [];
            }
        };
        
        this.measureGroups().forEach(group => {
            let rest = group;
            
            while (rest.length > perSystem) {
                flush();
                systems.push(rest.slice(0, perSystem));
                rest = rest.slice(perSystem);
            }
            
            if (current.length && current.length + rest.length > perSystem) flush();
            current = current.concat(rest);
        });
        
        flush();
        return systems.length ? systems : [[]];
    }
    
    // Кэш картинок аппликатур. Под file:// браузер обычно запрещает странице
    // читать соседние файлы, поэтому кэш включается только там, где чтение разрешено.
    initImageCache() {
        if (typeof FingeringImageCache !== 'function') return;
        
        this.imageCache = new FingeringImageCache('fingerings_images/');
        
        this.imageCache.init()
            .then(() => this.imageCache.sync(this.collectFingeringFiles(), (done, total) => {
                this.updateCacheStatus(t('status.caching', { done: done, total: total }));
            }))
            .then(status => {
                this.updateCacheStatus();
                if (status && status.readable && status.stored > 0) {
                    this.updateAllFingerings();
                }
            })
            .catch(() => this.updateCacheStatus());
    }
    
    // Список всех файлов аппликатур, которые могут понадобиться
    collectFingeringFiles() {
        this.getNoteInfoByName('C4'); // Гарантируем построение карты нот
        const files = new Set();
        
        Object.keys(this._noteMap || {}).forEach(key => {
            const info = this._noteMap[key];
            if (!info.hasFingering || !info.fingering) return;
            const base = info.fingering.replace(/_v\d+\.jpg$/, '');
            const count = info.variants || 1;
            for (let variant = 1; variant <= count; variant++) {
                files.add(`${base}_v${variant}.jpg`);
            }
        });
        
        return Array.from(files);
    }
    
    updateCacheStatus(message) {
        const node = document.getElementById('cache-status');
        if (!node) return;
        
        if (message) {
            node.textContent = message;
            return;
        }
        
        const status = this.imageCache ? this.imageCache.status() : null;
        if (!status) {
            node.textContent = '';
            return;
        }
        
        if (status.readable && status.stored > 0) {
            node.textContent = t('status.cacheReady', { n: status.stored });
        } else {
            node.textContent = t('status.cacheFallback');
        }
    }
    
    // Путь к картинке: из кэша, если он доступен, иначе напрямую из папки
    imageUrl(fileName) {
        if (this.imageCache && this.imageCache.has(fileName)) {
            return this.imageCache.url(fileName);
        }
        return 'fingerings_images/' + encodeURIComponent(fileName);
    }
    
    accidentalOf(noteName) {
        if (!noteName) return '';
        if (noteName.indexOf('#') !== -1) return '#';
        if (noteName.indexOf('b') !== -1) return 'b';
        return '';
    }
    
    // Линейки стана: 4 дополнительные сверху, 5 основных, 4 дополнительные снизу
    drawStaffLines(staff) {
        const verticalOffset = 0; // Стан не сдвигаем: сверху место под окошки длительности
        
        // 4 дополнительные линии сверху (A5 и выше)
        for (let i = 0; i < 4; i++) {
            const y = 80 + i * 20 - verticalOffset;
            const line = document.createElement('div');
            line.className = 'staff-line';
            line.style.top = y + 'px';
            line.style.opacity = '0.5';
            staff.appendChild(line);
        }
        
        // 5 основных линий
        for (let i = 0; i < 5; i++) {
            const y = 160 + i * 20 - verticalOffset;
            const line = document.createElement('div');
            line.className = 'staff-line';
            line.style.top = y + 'px';
            staff.appendChild(line);
        }
        
        // 4 дополнительные линии снизу (C2 и ниже)
        for (let i = 0; i < 4; i++) {
            const y = 260 + i * 20 - verticalOffset;
            const line = document.createElement('div');
            line.className = 'staff-line';
            line.style.top = y + 'px';
            line.style.opacity = '0.5';
            staff.appendChild(line);
        }
    }
    
    // Скрипичный ключ в начале строки
    drawClef(staff) {
        const clef = document.createElement('div');
        clef.className = 'staff-clef';
        clef.textContent = '\uD834\uDD1E'; // U+1D11E, скрипичный ключ
        clef.title = t('staff.clef');
        staff.appendChild(clef);
    }
    
    drawPositionMarkers(staff) {
        this.positions.forEach(position => {
            const marker = document.createElement('div');
            marker.className = 'position-marker';
            marker.style.top = (position.y - 25) + 'px';
            marker.style.left = '0'; // Начинаем от левого края
            marker.style.width = '100%'; // Занимаем всю ширину
            marker.setAttribute('data-position-id', position.id);
            marker.setAttribute('title', t('marker.title', { name: position.displayName, position: position.id }));
            
            marker.addEventListener('click', (e) => {
                e.stopPropagation();
                this.addNote(position.id);
            });
            
            staff.appendChild(marker);
        });
    }
    
    // Добавление ноты. insertIndex не задан - нота встаёт в конец мелодии.
    addNote(positionId, noteName = null, insertIndex = null, options = {}) {
        // Если передан noteName, используем его для получения правильной информации о ноте
        let noteInfo;
        let position;
        
        if (noteName) {
            // Получаем информацию о ноте по имени (учитывает диезы/бемоли)
            noteInfo = this.getNoteInfoByName(noteName);
            // Находим позицию для этой ноты
            position = this.positions.find(p => p.id === noteInfo.positionId);
        } else {
            // Используем positionId для получения базовой информации
            position = this.positions.find(p => p.id === positionId);
            if (position) {
                // Получаем информацию о ноте по имени из позиции
                noteInfo = this.getNoteInfoByName(position.name);
            }
        }
        
        if (!position || !noteInfo) return null;
        
        const noteId = 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        const note = {
            id: noteId,
            element: null,
            isRest: false,
            positionId: noteInfo.positionId,
            noteName: noteInfo.displayName,
            displayName: noteInfo.displayName,
            accidental: this.accidentalOf(noteInfo.displayName),
            fingering: noteInfo.fingering,
            fingeringBase: noteInfo.fingering ? noteInfo.fingering.replace(/_v\d+\.jpg$/, '') : null,
            hasFingering: noteInfo.hasFingering,
            variants: noteInfo.variants || 1,
            currentVariant: 1,
            duration: 4, // четвертная по умолчанию
            dotted: false,
            stemUp: position.y > STAFF_MIDDLE_LINE_Y,
            x: 0,
            y: position.y,
            hasBarLine: false, // Тактовая черта после ноты (ручной режим)
            repeatStart: false, // Начало репризы перед нотой
            repeatEnd: false, // Конец репризы после ноты
            crossesBoundary: false // Нота переходит через границу такта
        };
        
        this.buildElementDom(note);
        this.insertElement(note, insertIndex, !!options.silent);
        
        if (!options.silent) {
            this.selectNote(noteId);
            this.updateStatus(t('status.addedNote', { name: noteInfo.displayName, position: noteInfo.positionId }));
            this.scheduleAutosave();
            this.scrollToRight();
        }
        
        return noteId;
    }
    
    // Добавление паузы. insertIndex не задан - пауза встаёт в конец мелодии.
    addRest(insertIndex = null, options = {}) {
        const restId = 'rest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        const rest = {
            id: restId,
            element: null,
            isRest: true,
            positionId: null,
            noteName: null,
            displayName: t('rest.word'),
            accidental: '',
            fingering: null,
            fingeringBase: null,
            hasFingering: false,
            variants: 1,
            currentVariant: 1,
            duration: 4, // четвертная по умолчанию
            dotted: false,
            stemUp: false,
            x: 0,
            y: STAFF_MIDDLE_LINE_Y, // пауза стоит у средней линии
            hasBarLine: false,
            repeatStart: false,
            repeatEnd: false,
            crossesBoundary: false
        };
        
        this.buildElementDom(rest);
        this.insertElement(rest, insertIndex, !!options.silent);
        
        if (!options.silent) {
            this.selectNote(restId);
            this.updateStatus(t('status.addedRest'));
            this.scheduleAutosave();
            this.scrollToRight();
        }
        
        return restId;
    }
    
    // Создаёт DOM элемента: знак ноты или паузы, окошко длительности и подпись названия
    buildElementDom(element) {
        const anchor = document.createElement('div');
        anchor.className = 'note-anchor fade-in';
        anchor.id = element.id;
        anchor.setAttribute('data-type', element.isRest ? 'rest' : 'note');
        anchor.setAttribute('data-stem', element.stemUp ? 'up' : 'down');
        anchor.setAttribute('data-element-id', element.id);
        
        anchor.innerHTML = this.glyphMarkup(element) +
            this.durationPanelMarkup(element) +
            (this.showNoteNames && !element.isRest ? `<div class="note-label">${element.displayName}</div>` : '');
        
        anchor.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectNote(element.id);
        });
        
        this.bindDurationPanel(anchor, element);
        
        element.element = anchor;
        // Предварительно в первую строку: раскладка перенесёт элемент куда надо
        (this.staffContainers[0] || this.container).appendChild(anchor);
        return anchor;
    }
    
    glyphMarkup(element) {
        if (element.isRest) {
            return NoteSymbols.restSvg({ duration: element.duration, dotted: element.dotted });
        }
        return NoteSymbols.noteSvg({
            duration: element.duration,
            dotted: element.dotted,
            stemUp: element.stemUp,
            accidental: element.accidental
        });
    }
    
    // Название длительности на текущем языке
    durationLabel(value) {
        const key = 'duration.' + value;
        const translated = t(key);
        return translated === key ? NoteSymbols.durationInfo(value).label : translated;
    }
    
    durationPanelMarkup(element) {
        const options = NoteSymbols.DURATIONS.map(item =>
            `<button type="button" class="duration-option${item.value === element.duration ? ' active' : ''}" ` +
            `data-duration="${item.value}">${this.durationLabel(item.value)}</button>`
        ).join('');
        
        return '<div class="duration-panel">' +
            `<button type="button" class="duration-btn" title="${t('duration.buttonTitle')}">` +
            NoteSymbols.durationInfo(element.duration).short + '</button>' +
            `<label class="dot-toggle" title="${t('duration.dotTitle')}">` +
            `<input type="checkbox"${element.dotted ? ' checked' : ''}></label>` +
            `<div class="duration-menu">${options}</div>` +
            '</div>';
    }
    
    bindDurationPanel(anchor, element) {
        const button = anchor.querySelector('.duration-btn');
        const menu = anchor.querySelector('.duration-menu');
        const dot = anchor.querySelector('.dot-toggle input');
        
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDurationMenu(menu, anchor);
        });
        
        menu.querySelectorAll('.duration-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeDurationMenus();
                this.setElementDuration(element, parseInt(option.dataset.duration, 10));
            });
        });
        
        dot.addEventListener('click', (e) => e.stopPropagation());
        dot.addEventListener('change', (e) => {
            e.stopPropagation();
            this.setElementDotted(element, dot.checked);
        });
    }
    
    toggleDurationMenu(menu, anchor) {
        const wasOpen = menu.classList.contains('open');
        this.closeDurationMenus();
        if (!wasOpen) this.openDurationMenu(menu, anchor);
    }
    
    // Меню показывается поверх всего: переносим его в body и ставим по координатам
    // кнопки, иначе его обрезают контейнеры стана, а соседние ноты перекрывают.
    openDurationMenu(menu, anchor) {
        const button = anchor.querySelector('.duration-btn');
        if (!button) return;
        
        if (!menu.__origin) menu.__origin = menu.parentElement;
        
        document.body.appendChild(menu);
        menu.classList.add('open');
        anchor.classList.add('menu-open');
        
        const buttonRect = button.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        
        // Над кнопкой, а если не влезает - под ней
        let top = buttonRect.top - menuRect.height - 4;
        if (top < 4) top = buttonRect.bottom + 4;
        
        let left = buttonRect.left + buttonRect.width / 2 - menuRect.width / 2;
        left = Math.max(4, Math.min(left, window.innerWidth - menuRect.width - 4));
        
        menu.style.left = Math.round(left) + 'px';
        menu.style.top = Math.round(top) + 'px';
    }
    
    closeDurationMenus() {
        document.querySelectorAll('.duration-menu.open').forEach(menu => {
            menu.classList.remove('open');
            menu.style.left = '';
            menu.style.top = '';
            if (menu.__origin && menu.parentElement !== menu.__origin) {
                menu.__origin.appendChild(menu);
            }
        });
        document.querySelectorAll('.note-anchor.menu-open').forEach(anchor => anchor.classList.remove('menu-open'));
    }
    
    setElementDuration(element, duration) {
        if (!duration || element.duration === duration) return;
        
        element.duration = duration;
        this.refreshElement(element);
        // Длительность влияет на границы тактов, поэтому черты пересчитываем
        this.relayout();
        this.updateStatus(t(element.dotted ? 'status.durationSetDotted' : 'status.durationSet',
            { name: this.durationLabel(duration) }));
        this.scheduleAutosave();
    }
    
    setElementDotted(element, dotted) {
        element.dotted = !!dotted;
        this.refreshElement(element);
        // Точка меняет длительность, а значит и границы тактов
        this.relayout();
        this.updateStatus(t(element.dotted ? 'status.dotOn' : 'status.dotOff'));
        this.scheduleAutosave();
    }
    
    // Перерисовка знака и окошка длительности без изменения положения элемента
    refreshElement(element) {
        const anchor = element.element;
        if (!anchor) return;
        
        const svg = anchor.querySelector('.glyph-svg');
        if (svg) {
            const holder = document.createElement('div');
            holder.innerHTML = this.glyphMarkup(element);
            svg.replaceWith(holder.firstElementChild);
        }
        
        const button = anchor.querySelector('.duration-btn');
        if (button) {
            button.textContent = NoteSymbols.durationInfo(element.duration).short;
            button.title = t('duration.buttonTitle');
        }
        
        const dotLabel = anchor.querySelector('.dot-toggle');
        if (dotLabel) dotLabel.title = t('duration.dotTitle');
        
        anchor.querySelectorAll('.duration-option').forEach(option => {
            const value = parseInt(option.dataset.duration, 10);
            option.textContent = this.durationLabel(value);
            option.classList.toggle('active', value === element.duration);
        });
        
        const dot = anchor.querySelector('.dot-toggle input');
        if (dot) dot.checked = !!element.dotted;
    }
    
    // Вставка элемента в мелодию и полный пересчёт раскладки
    // skipRelayout - для массовой загрузки: перерисовывать после каждого
    // элемента нельзя, иначе получается квадрат по времени и большие мелодии
    // встают намертво. Вызывающий обязан перерисовать всё один раз в конце.
    insertElement(element, insertIndex, skipRelayout) {
        const index = (insertIndex === null || insertIndex === undefined ||
            insertIndex < 0 || insertIndex > this.notes.length)
            ? this.notes.length
            : insertIndex;
        
        this.notes.splice(index, 0, element);
        
        if (!skipRelayout) this.relayout();
    }
    
    relayout() {
        this.closeDurationMenus();
        this.updateNotePositions();
        this.updateNoteCount();
        this.updateAllFingerings();
    }
    
    selectedIndex() {
        return this.notes.findIndex(n => n.id === this.selectedNoteId);
    }
    
    scrollToRight() {
        // Прокручиваем scrollable-area вправо, чтобы новый элемент был виден
        setTimeout(() => {
            const scrollableArea = document.querySelector('.scrollable-area');
            if (scrollableArea) {
                scrollableArea.scrollLeft = scrollableArea.scrollWidth - scrollableArea.clientWidth;
            }
        }, 50);
    }
    
    selectNote(noteId) {
        if (this.selectedNoteId === noteId) {
            this.deselectNote();
            return;
        }
        
        this.deselectNote();
        
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;
        
        note.element.classList.add('selected');
        this.selectedNoteId = noteId;
        
        document.getElementById('selected-note').textContent = note.isRest ? t('rest.word') : note.displayName;
        document.getElementById('selected-note-info').textContent = note.isRest
            ? t(note.dotted ? 'rest.infoDotted' : 'rest.info', { name: this.durationLabel(note.duration) })
            : `${note.displayName} (позиция ${note.positionId})`;
        
        // Включаем кнопки управления нотой; у паузы высоты нет
        document.getElementById('btn-note-up').disabled = note.isRest;
        document.getElementById('btn-note-down').disabled = note.isRest;
        document.getElementById('btn-delete-note').disabled = false;
        
        // Кнопки тактовых черт и репризы зависят от выделения
        this.updateBarLineButtons();
        
        // Обновляем аппликатуры
        this.updateFingering(note);
        
        this.updateStatus(note.isRest ? t('status.selectedRest') : t('status.selectedNote', { name: note.displayName }));
    }
    
    deselectNote() {
        if (this.selectedNoteId) {
            const note = this.notes.find(n => n.id === this.selectedNoteId);
            if (note) {
                note.element.classList.remove('selected');
            }
        }
        
        this.selectedNoteId = null;
        document.getElementById('selected-note').textContent = t('app.none');
        document.getElementById('selected-note-info').textContent = t('staff.noSelection');
        
        // Отключаем кнопки управления
        document.getElementById('btn-note-up').disabled = true;
        document.getElementById('btn-note-down').disabled = true;
        document.getElementById('btn-delete-note').disabled = true;
        
        // Очищаем аппликатуры
        this.clearFingering();
        this.updateBarLineButtons();
        
        this.updateStatus(t('status.deselected'));
    }
    
    updateNoteCount() {
        const notes = this.notes.filter(n => !n.isRest).length;
        const rests = this.notes.length - notes;
        document.getElementById('note-count').textContent = rests > 0
            ? t('notes.countWithRests', { n: notes, m: rests, word: I18n.plural('rests.short', rests) })
            : t('notes.count', { n: notes });
    }
    
    changeSelectedNotePitch(direction) {
        if (!this.selectedNoteId) return false;
        
        const note = this.notes.find(n => n.id === this.selectedNoteId);
        if (!note) return false;
        
        if (note.isRest) {
            this.updateStatus(t('status.restNoPitch'));
            return false;
        }
        
        // Получаем следующую ноту в последовательности
        const newNoteName = this.getNextNoteInSequence(note.noteName, direction);
        
        if (newNoteName === note.noteName) {
            this.updateStatus(t('status.pitchLimit'));
            return false;
        }
        
        // Получаем информацию о новой ноте
        const newNoteInfo = this.getNoteInfoByName(newNoteName);
        
        // Находим позицию для новой ноты
        const newPosition = this.positions.find(p => p.id === newNoteInfo.positionId);
        if (!newPosition) {
            this.updateStatus(t('status.positionMissing', { position: newNoteInfo.positionId, name: newNoteName }));
            return false;
        }
        
        // Обновляем ноту
        note.positionId = newNoteInfo.positionId;
        note.noteName = newNoteName;
        note.displayName = newNoteInfo.displayName;
        note.accidental = this.accidentalOf(newNoteInfo.displayName);
        note.fingering = newNoteInfo.fingering;
        note.fingeringBase = newNoteInfo.fingering ? newNoteInfo.fingering.replace(/_v\d+\.jpg$/, '') : null;
        note.hasFingering = newNoteInfo.hasFingering;
        note.variants = newNoteInfo.variants || 1;
        // Выбранный вариант сохраняем, если он есть у новой ноты
        note.currentVariant = Math.min(note.currentVariant || 1, note.variants);
        if (note.fingeringBase) {
            note.fingering = `${note.fingeringBase}_v${note.currentVariant}.jpg`;
        }
        note.y = newPosition.y;
        note.stemUp = newPosition.y > STAFF_MIDDLE_LINE_Y;
        
        // Обновляем отображение
        note.element.style.top = newPosition.y + 'px';
        note.element.setAttribute('data-stem', note.stemUp ? 'up' : 'down');
        note.element.setAttribute('data-position-id', newNoteInfo.positionId);
        const label = note.element.querySelector('.note-label');
        if (label) label.textContent = newNoteInfo.displayName;
        this.refreshElement(note);
        
        document.getElementById('selected-note').textContent = newNoteInfo.displayName;
        document.getElementById('selected-note-info').textContent = t('note.info', { name: newNoteInfo.displayName, position: newNoteInfo.positionId });
        
        // Обновляем аппликатуры
        this.updateFingering(note);
        
        this.updateStatus(t('status.noteChanged', { name: newNoteInfo.displayName }));
        this.scheduleAutosave();
        return true;
    }
    
    deleteSelectedNote() {
        if (!this.selectedNoteId) return false;
        
        const noteIndex = this.notes.findIndex(n => n.id === this.selectedNoteId);
        if (noteIndex === -1) return false;
        
        const note = this.notes[noteIndex];
        
        note.element.remove();
        this.notes.splice(noteIndex, 1);
        
        this.deselectNote();
        this.relayout();
        
        this.updateStatus(note.isRest ? t('status.restDeleted') : t('status.noteDeleted', { name: note.displayName }));
        this.scheduleAutosave();
        return true;
    }
    
    clearAllNotes() {
        this.notes.forEach(note => {
            note.element.remove();
        });
        this.notes = [];
        this.clearNotationMarks();
        this.deselectNote();
        this.relayout();
        
        this.updateStatus(t('status.allCleared'));
        this.scheduleAutosave();
    }
    
    transposeAllNotes(direction) {
        if (this.notes.length === 0) {
            this.updateStatus(t('status.noNotesToTranspose'));
            return false;
        }
        
        let changedCount = 0;
        const selectedNoteId = this.selectedNoteId;
        
        // Снимаем выделение, чтобы избежать конфликтов
        this.deselectNote();
        
        // Транспонируем все ноты (паузы не трогаем)
        this.notes.forEach(note => {
            if (note.isRest) return;
            
            // Получаем следующую ноту в последовательности
            const newNoteName = this.getNextNoteInSequence(note.noteName, direction);
            
            if (newNoteName === note.noteName) {
                return; // Невозможно изменить высоту ноты (достигнут предел диапазона)
            }
            
            // Получаем информацию о новой ноте
            const newNoteInfo = this.getNoteInfoByName(newNoteName);
            
            // Находим позицию для новой ноты
            const newPosition = this.positions.find(p => p.id === newNoteInfo.positionId);
            if (!newPosition) {
                return;
            }
            
            // Обновляем ноту
            note.positionId = newNoteInfo.positionId;
            note.noteName = newNoteName;
            note.displayName = newNoteInfo.displayName;
            note.accidental = this.accidentalOf(newNoteInfo.displayName);
            note.fingering = newNoteInfo.fingering;
            note.fingeringBase = newNoteInfo.fingering ? newNoteInfo.fingering.replace(/_v\d+\.jpg$/, '') : null;
            note.hasFingering = newNoteInfo.hasFingering;
            note.variants = newNoteInfo.variants || 1;
            // Выбранный вариант сохраняем, если он есть у новой ноты
            note.currentVariant = Math.min(note.currentVariant || 1, note.variants);
            if (note.fingeringBase) {
                note.fingering = `${note.fingeringBase}_v${note.currentVariant}.jpg`;
            }
            note.y = newPosition.y;
            note.stemUp = newPosition.y > STAFF_MIDDLE_LINE_Y;
            
            // Обновляем отображение
            note.element.style.top = newPosition.y + 'px';
            note.element.setAttribute('data-stem', note.stemUp ? 'up' : 'down');
            note.element.setAttribute('data-position-id', newNoteInfo.positionId);
            const label = note.element.querySelector('.note-label');
            if (label) label.textContent = newNoteInfo.displayName;
            this.refreshElement(note);
            
            changedCount++;
        });
        
        // Восстанавливаем выделение, если была выделена нота
        if (selectedNoteId && this.notes.find(n => n.id === selectedNoteId)) {
            this.selectNote(selectedNoteId);
        }
        
        // Обновляем аппликатуры
        this.updateAllFingerings();
        
        this.updateStatus(t('status.transposed', { n: changedCount }));
        this.scheduleAutosave();
        return changedCount > 0;
    }
    
    updateFingering(note) {
        // Обновляем все аппликатуры для всех нот
        this.updateAllFingerings();
        
        // Выделяем карточку текущей ноты
        const cards = document.querySelectorAll('.fingering-card');
        cards.forEach(card => {
            card.classList.remove('selected');
            if (card.getAttribute('data-note-id') === note.id) {
                card.classList.add('selected');
            }
        });
        
        // Обновляем информацию о выделенном элементе
        this.setFingeringInfo(note.isRest
            ? t('rest.inRow', { name: this.durationLabel(note.duration) })
            : note.displayName);
    }
    
    // Переключение варианта аппликатуры
    changeFingeringVariant(direction) {
        if (!this.selectedNoteId) {
            this.updateStatus(t('staff.noSelection'));
            return false;
        }
        
        const note = this.notes.find(n => n.id === this.selectedNoteId);
        if (!note) return false;
        
        if (note.isRest) {
            this.updateStatus(t('status.restNoFingering'));
            return false;
        }
        
        if (!note.hasFingering || note.variants <= 1) {
            this.updateStatus(t('status.noVariants'));
            return false;
        }
        
        // Вычисляем новый вариант
        let newVariant = note.currentVariant + direction;
        
        // Проверяем границы
        if (newVariant < 1) newVariant = note.variants;
        if (newVariant > note.variants) newVariant = 1;
        
        if (newVariant === note.currentVariant) {
            return false;
        }
        
        // Обновляем текущий вариант
        note.currentVariant = newVariant;
        
        // Обновляем имя файла аппликатуры с учетом варианта
        // Заменяем _v1 на _v2, _v3 и т.д.
        if (note.fingeringBase) {
            note.fingering = `${note.fingeringBase}_v${newVariant}.jpg`;
        }
        
        // Обновляем отображение
        this.updateFingering(note);
        
        this.updateStatus(t('status.variantChanged', { current: newVariant, total: note.variants }));
        this.scheduleAutosave();
        return true;
    }
    
    // Размеры переключателя вариантов. Кнопки обязаны влезать в карточку
    // при любой ширине картинки, вплоть до минимальных 50px.
    variantControlMetrics() {
        const size = this.imageSize;
        const button = size < 70 ? 16 : (size < 120 ? 20 : 24);
        const gap = size < 70 ? 2 : (size < 120 ? 6 : 10);
        const panelHeight = size < 70 ? 20 : 30;
        const fontSize = size < 70 ? 9 : (size < 120 ? 11 : 12);
        
        // 2 кнопки + 2 промежутка + место под надпись вида "1/4"
        const neededWithCounter = button * 2 + gap * 2 + fontSize * 2.4;
        return {
            button: button,
            gap: gap,
            panelHeight: panelHeight,
            fontSize: fontSize,
            showCounter: neededWithCounter <= size
        };
    }
    
    updateAllFingerings() {
        // Каждая строка наполняется своими карточками
        this.fingeringContainers.forEach(row => { row.innerHTML = ''; });
        
        if (this.notes.length === 0) {
            this.showNoFingeringsPlaceholder();
            this.updateStaffTail();
            return;
        }
        
        let fingeringCount = 0;
        
        this.notes.forEach(note => {
            const container = this.fingeringContainers[note.system || 0] || this.fingeringContainers[0];
            if (!container) return;
            
            // Напротив паузы аппликатуры нет, но место сохраняем - иначе сдвинется выравнивание
            if (note.isRest) {
                const spacer = document.createElement('div');
                spacer.className = 'fingering-spacer';
                spacer.setAttribute('data-note-id', note.id);
                spacer.style.boxSizing = 'border-box';
                spacer.style.width = (this.imageSize + 2) + 'px';
                spacer.style.margin = '0px';
                spacer.style.padding = '0px';
                spacer.style.height = '200px';
                container.appendChild(spacer);
                return;
            }
            
            // Создаем карточку аппликатуры напрямую без дополнительных оберток
            const card = document.createElement('div');
            card.className = 'fingering-card fade-in';
            if (note.id === this.selectedNoteId) {
                card.classList.add('selected');
            }
            card.setAttribute('data-note-id', note.id);
            // Внешняя ширина карточки ровно равна шагу ноты. Задаём её целиком,
            // через border-box и с нулевыми отступами: любого из этих слагаемых
            // достаточно, чтобы шаг карточек разошёлся с шагом нот,
            // а расхождение копится от первой ноты к последней.
            card.style.boxSizing = 'border-box';
            card.style.width = (this.imageSize + 2) + 'px';
            card.style.margin = '0px';
            card.style.padding = '0px';
            // Высота зависит от наличия вариантов: 200px для одной аппликатуры, 230px для нескольких вариантов
            const cardHeight = note.hasFingering && note.variants > 1 ? '230px' : '200px';
            card.style.height = cardHeight;
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.alignItems = 'center';
            card.style.justifyContent = 'flex-start';
            card.style.borderRadius = '0'; // Убираем скругления для плотного прилегания
            card.style.overflow = 'hidden';
            card.style.background = 'white';
            card.style.cursor = 'pointer';
            card.style.transition = 'all 0.2s';
            card.style.margin = '0'; // Убираем маржины
            card.style.padding = '0'; // Убираем паддинги
            
            if (note.hasFingering) {
                // Создаем контейнер для изображения
                const imgContainer = document.createElement('div');
                imgContainer.style.width = '100%';
                imgContainer.style.height = '100%'; // Занимаем всю высоту карточки
                imgContainer.style.overflow = 'hidden';
                imgContainer.style.display = 'flex';
                imgContainer.style.alignItems = 'center';
                imgContainer.style.justifyContent = 'center';
                
                const img = document.createElement('img');
                img.className = 'fingering-image';
                // Путь берём из кэша, если он доступен; иначе - напрямую из папки
                img.src = this.imageUrl(note.fingering);
                img.alt = t('card.imageAlt', { name: note.displayName });
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'contain';
                img.style.display = 'block';
                img.style.margin = '0';
                img.style.padding = '0';
                
                imgContainer.appendChild(img);
                card.appendChild(imgContainer);
                fingeringCount++;
                
                // Добавляем панель управления вариантами, если есть несколько вариантов
                if (note.variants > 1) {
                    const metrics = this.variantControlMetrics();
                    
                    const controlsPanel = document.createElement('div');
                    controlsPanel.className = 'fingering-controls';
                    controlsPanel.style.width = '100%';
                    controlsPanel.style.height = metrics.panelHeight + 'px';
                    controlsPanel.style.display = 'flex';
                    controlsPanel.style.alignItems = 'center';
                    controlsPanel.style.justifyContent = 'center';
                    controlsPanel.style.gap = metrics.gap + 'px';
                    controlsPanel.style.background = '#f8f9fa';
                    controlsPanel.style.borderTop = '1px solid #e2e8f0';
                    controlsPanel.style.fontSize = metrics.fontSize + 'px';
                    controlsPanel.style.color = '#4a5568';
                    controlsPanel.style.padding = '0';
                    controlsPanel.style.overflow = 'hidden';
                    
                    // Кнопка "влево"
                    const prevBtn = document.createElement('button');
                    prevBtn.innerHTML = '&larr;';
                    prevBtn.style.background = 'none';
                    prevBtn.style.border = '1px solid #cbd5e0';
                    prevBtn.style.borderRadius = '3px';
                    prevBtn.style.width = metrics.button + 'px';
                    prevBtn.style.height = metrics.button + 'px';
                    prevBtn.style.flex = '0 0 auto';
                    prevBtn.style.cursor = 'pointer';
                    prevBtn.style.fontSize = metrics.fontSize + 'px';
                    prevBtn.style.lineHeight = '1';
                    prevBtn.style.padding = '0';
                    prevBtn.style.color = '#4a5568';
                    prevBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (note.id === this.selectedNoteId) {
                            this.changeFingeringVariant(-1);
                        } else {
                            // Если нота не выделена, сначала выделяем ее
                            this.selectNote(note.id);
                            // Затем меняем вариант
                            setTimeout(() => this.changeFingeringVariant(-1), 10);
                        }
                    });
                    
                    // Номер варианта
                    const variantText = document.createElement('span');
                    variantText.textContent = `${note.currentVariant}/${note.variants}`;
                    variantText.style.fontWeight = 'bold';
                    variantText.style.flex = '0 0 auto';
                    
                    // Кнопка "вправо"
                    const nextBtn = document.createElement('button');
                    nextBtn.innerHTML = '&rarr;';
                    nextBtn.style.background = 'none';
                    nextBtn.style.border = '1px solid #cbd5e0';
                    nextBtn.style.borderRadius = '3px';
                    nextBtn.style.width = metrics.button + 'px';
                    nextBtn.style.height = metrics.button + 'px';
                    nextBtn.style.flex = '0 0 auto';
                    nextBtn.style.cursor = 'pointer';
                    nextBtn.style.fontSize = metrics.fontSize + 'px';
                    nextBtn.style.lineHeight = '1';
                    nextBtn.style.padding = '0';
                    nextBtn.style.color = '#4a5568';
                    nextBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (note.id === this.selectedNoteId) {
                            this.changeFingeringVariant(1);
                        } else {
                            // Если нота не выделена, сначала выделяем ее
                            this.selectNote(note.id);
                            // Затем меняем вариант
                            setTimeout(() => this.changeFingeringVariant(1), 10);
                        }
                    });
                    
                    controlsPanel.appendChild(prevBtn);
                    // Номер варианта убираем на самых узких карточках, чтобы кнопки влезли
                    if (metrics.showCounter) controlsPanel.appendChild(variantText);
                    controlsPanel.appendChild(nextBtn);
                    card.appendChild(controlsPanel);
                }
            } else {
                card.style.background = '#f8f9fa';
                card.style.display = 'flex';
                card.style.alignItems = 'center';
                card.style.justifyContent = 'center';
                card.innerHTML = `<div style="text-align: center; color: #a0aec0; font-size: 12px; padding: 0; margin: 0;">${t('card.noFingering')}</div>`;
            }
            
            container.appendChild(card);
            
            // Добавляем обработчик клика для выбора ноты
            card.addEventListener('click', () => {
                this.selectNote(note.id);
            });
        });
        
        const countNode = document.getElementById('fingering-count');
        if (countNode) countNode.textContent = t('cards.count', { n: fingeringCount });
        
        this.renderMeasureDividers();
        this.updateStaffTail();
    }
    
    // Запас под последней строкой, кратный её высоте: чтобы последнюю строку
    // можно было подтянуть наверх и читать её на удобной высоте.
    // Добавляем только когда мелодия и так не помещается целиком.
    updateStaffTail() {
        const tail = this.staffTail;
        if (!tail) return;
        
        tail.style.height = '0px';
        
        const area = document.querySelector('.scrollable-area');
        if (!area || this.staffContainers.length < 2) return;
        
        const lastStaff = this.staffContainers[this.staffContainers.length - 1];
        const lastSystem = lastStaff ? lastStaff.closest('.system') : null;
        const step = lastSystem ? lastSystem.offsetHeight : 0;
        if (!step) return;
        
        if (this.container.scrollHeight <= area.clientHeight + 1) return;
        
        const need = Math.max(step, area.clientHeight - step);
        tail.style.height = (Math.ceil(need / step) * step) + 'px';
    }
    
    // Границы тактов продолжаются в ряду аппликатур. Координату берём у самой
    // карточки, а не считаем от ноты: тогда черта всегда стоит на её краю,
    // как бы браузер ни разложил карточки.
    renderMeasureDividers() {
        const marks = this.computeBarLines();
        
        this.notes.forEach(element => {
            if (!marks.has(element.id)) return;
            
            const row = this.fingeringContainers[element.system || 0];
            if (!row) return;
            
            const card = row.querySelector('.fingering-card[data-note-id="' + element.id + '"], ' +
                '.fingering-spacer[data-note-id="' + element.id + '"]');
            if (!card) return;
            
            const divider = document.createElement('div');
            divider.className = 'measure-divider';
            divider.style.left = (card.offsetLeft + card.offsetWidth) + 'px';
            row.appendChild(divider);
        });
    }
    
    // Сведения о выбранной аппликатуре в шапке (может отсутствовать в разметке)
    setFingeringInfo(text) {
        const node = document.getElementById('current-fingering-info');
        if (node) node.textContent = text;
    }
    
    showNoFingeringsPlaceholder() {
        const container = this.fingeringContainers[0];
        if (!container) return;
        
        container.innerHTML = '';
        
        const placeholder = document.createElement('div');
        placeholder.className = 'fingering-placeholder fade-in';
        
        const icon = document.createElement('div');
        icon.className = 'placeholder-icon';
        icon.innerHTML = '<i class="fas fa-music"></i>';
        
        const text = document.createElement('div');
        text.className = 'placeholder-text';
        text.textContent = t('cards.placeholderText');
        
        placeholder.appendChild(icon);
        placeholder.appendChild(text);
        container.appendChild(placeholder);
        
        const countNode = document.getElementById('fingering-count');
        if (countNode) countNode.textContent = t('cards.none');
        this.setFingeringInfo(t('staff.noSelection'));
    }
    
    showNoFingeringPlaceholder(noteName) {
        const container = this.fingeringContainers[0];
        if (!container) return;
        
        container.innerHTML = '';
        
        const placeholder = document.createElement('div');
        placeholder.className = 'fingering-placeholder fade-in';
        
        const icon = document.createElement('div');
        icon.className = 'placeholder-icon';
        icon.innerHTML = '<i class="fas fa-times-circle"></i>';
        
        const text = document.createElement('div');
        text.className = 'placeholder-text';
        text.textContent = t('cards.noFingeringFor', { name: noteName });
        
        placeholder.appendChild(icon);
        placeholder.appendChild(text);
        container.appendChild(placeholder);
        
        const countNode = document.getElementById('fingering-count');
        if (countNode) countNode.textContent = t('cards.none');
        this.setFingeringInfo(t('cards.noFingeringFor', { name: noteName }));
    }
    
    clearFingering() {
        this.updateAllFingerings();
    }
    
    updateImageSize(newSize) {
        this.imageSize = newSize;
        
        const value = document.getElementById('image-size-value');
        if (value) value.textContent = newSize + 'px';
        
        // Размер карточек и раскладка строк пересчитываются заново
        this.relayout();
    }
    
    // Раскладка мелодии по строкам: системы, координаты, черты и аппликатуры.
    // Разбивка на строки описана в computeSystems.
    updateNotePositions() {
        // Масштаб строки считаем до раскладки: от него зависит, сколько
        // нот помещается в строку на этом экране
        this.systemScaleValue = this.systemScale();
        
        // Ширина строки зависит от того, появилась ли вертикальная прокрутка,
        // а прокрутка - от числа строк. Поэтому считаем раскладку, пока она
        // не установится: иначе карточки сжимаются и расходятся с чертами.
        let systems = this.computeSystems();
        this.syncSystems(systems.length);
        
        for (let pass = 0; pass < 5; pass++) {
            const next = this.computeSystems();
            const changed = next.length !== systems.length;
            systems = next;
            if (!changed) break;
            this.syncSystems(systems.length);
        }
        
        this.applySystemScale();
        
        const slot = this.imageSize + 2;
        
        systems.forEach((system, systemIndex) => {
            const staff = this.staffContainers[systemIndex];
            if (!staff) return;
            
            system.forEach((element, position) => {
                element.system = systemIndex;
                element.lastInSystem = position === system.length - 1;
                element.x = STAFF_CLEF_WIDTH + slot / 2 + position * slot;
                element.element.style.left = element.x + 'px';
                element.element.style.top = element.y + 'px';
                
                if (element.element.parentElement !== staff) {
                    staff.appendChild(element.element);
                }
            });
        });
        
        this.applyStaffMetrics();
        
        // Черты и знаки репризы привязаны к координатам, поэтому перерисовываем их
        this.renderNotationMarks();
    }
    
    // Что занимает элемент по вертикали: окошко длительности сверху, подпись снизу
    elementExtent(element) {
        if (element.isRest) return { top: 58, bottom: 22 };
        return element.stemUp ? { top: 78, bottom: 30 } : { top: 42, bottom: 68 };
    }
    
    // Стан подгоняется под фактическое содержимое мелодии: иначе сверху
    // и между станом и аппликатурами остаются пустые полосы.
    systemMetrics() {
        let top = STAFF_TOP_LEDGER;
        let bottom = STAFF_BOTTOM_LEDGER;
        
        this.notes.forEach(element => {
            const extent = this.elementExtent(element);
            if (element.y - extent.top < top) top = element.y - extent.top;
            if (element.y + extent.bottom > bottom) bottom = element.y + extent.bottom;
        });
        
        const offset = Math.max(0, Math.ceil(top) - 6); // 6px поля сверху
        const height = Math.max(140, Math.ceil(bottom - offset + 8));
        return { offset: offset, height: height };
    }
    
    applyStaffMetrics() {
        const metrics = this.systemMetrics();
        
        this.staffContainers.forEach(staff => {
            const wrapper = staff.parentElement;
            if (wrapper) wrapper.style.height = metrics.height + 'px';
            staff.style.transform = 'translateY(-' + metrics.offset + 'px)';
        });
    }
    
    
    updateNoteNamesVisibility(show) {
        this.showNoteNames = show;
        
        this.notes.forEach(note => {
            if (note.isRest) return;
            
            const existing = note.element.querySelector('.note-label');
            if (show && !existing) {
                note.element.insertAdjacentHTML('beforeend', `<div class="note-label">${note.displayName}</div>`);
            } else if (!show && existing) {
                existing.remove();
            }
        });
    }
    
    // Получение следующей ноты в последовательности (вверх или вниз)
    getNextNoteInSequence(currentNoteName, direction = 1) {
        // direction: 1 = вверх, -1 = вниз
        
        // Определяем последовательность в зависимости от стратегии
        const sequence = this.getNoteSequence();
        
        // Находим индекс текущей ноты в последовательности
        const currentIndex = sequence.indexOf(currentNoteName);
        
        if (currentIndex === -1) {
            console.error('Нота не найдена в последовательности:', currentNoteName);
            return currentNoteName;
        }
        
        // Вычисляем новый индекс
        let newIndex = currentIndex + direction;
        
        // Проверяем границы
        if (newIndex < 0) newIndex = 0;
        if (newIndex >= sequence.length) newIndex = sequence.length - 1;
        
        return sequence[newIndex];
    }
    
    // Получение последовательности нот в зависимости от стратегии
    getNoteSequence() {
        if (this.displayMode === 'sharps') {
            // Последовательность с диезами
            return [
                'C2', 'C#2', 'D2', 'D#2', 'E2', 'F2', 'F#2', 'G2', 'G#2', 'A2', 'A#2', 'B2',
                'C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3',
                'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4',
                'C5', 'C#5', 'D5', 'D#5', 'E5', 'F5', 'F#5', 'G5', 'G#5', 'A5'
            ];
        } else {
            // Последовательность с бемолями
            return [
                'C2', 'Db2', 'D2', 'Eb2', 'E2', 'F2', 'Gb2', 'G2', 'Ab2', 'A2', 'Bb2', 'B2',
                'C3', 'Db3', 'D3', 'Eb3', 'E3', 'F3', 'Gb3', 'G3', 'Ab3', 'A3', 'Bb3', 'B3',
                'C4', 'Db4', 'D4', 'Eb4', 'E4', 'F4', 'Gb4', 'G4', 'Ab4', 'A4', 'Bb4', 'B4',
                'C5', 'Db5', 'D5', 'Eb5', 'E5', 'F5', 'Gb5', 'G5', 'Ab5', 'A5'
            ];
        }
    }
    
    // Получение информации о ноте по имени (упрощенная версия на основе JSON)
    getNoteInfoByName(noteName) {
        // Упрощенное сопоставление на основе данных из JSON.
        // Карта строится один раз: она же используется для списка файлов аппликатур.
        const noteMap = this._noteMap || (this._noteMap = {
            // C2 - B2
            'C2': { positionId: 1, displayName: 'C2', hasFingering: false, fingering: null, variants: 1 },
            'C#2': { positionId: 1, displayName: 'C#2', hasFingering: false, fingering: null, variants: 1 },
            'Db2': { positionId: 2, displayName: 'Db2', hasFingering: false, fingering: null, variants: 1 },
            'D2': { positionId: 2, displayName: 'D2', hasFingering: false, fingering: null, variants: 1 },
            'D#2': { positionId: 2, displayName: 'D#2', hasFingering: false, fingering: null, variants: 1 },
            'Eb2': { positionId: 3, displayName: 'Eb2', hasFingering: false, fingering: null, variants: 1 },
            'E2': { positionId: 3, displayName: 'E2', hasFingering: false, fingering: null, variants: 1 },
            'F2': { positionId: 4, displayName: 'F2', hasFingering: false, fingering: null, variants: 1 },
            'F#2': { positionId: 4, displayName: 'F#2', hasFingering: false, fingering: null, variants: 1 },
            'Gb2': { positionId: 5, displayName: 'Gb2', hasFingering: false, fingering: null, variants: 1 },
            'G2': { positionId: 5, displayName: 'G2', hasFingering: false, fingering: null, variants: 1 },
            'G#2': { positionId: 5, displayName: 'G#2', hasFingering: false, fingering: null, variants: 1 },
            'Ab2': { positionId: 6, displayName: 'Ab2', hasFingering: false, fingering: null, variants: 1 },
            'A2': { positionId: 6, displayName: 'A2', hasFingering: true, fingering: '045_A2_v1.jpg', variants: 1 },
            'A#2': { positionId: 6, displayName: 'A#2', hasFingering: true, fingering: '046_A#2_Bb2_v1.jpg', variants: 1 },
            'Bb2': { positionId: 7, displayName: 'Bb2', hasFingering: true, fingering: '046_A#2_Bb2_v1.jpg', variants: 1 },
            'B2': { positionId: 7, displayName: 'B2', hasFingering: true, fingering: '047_B2_v1.jpg', variants: 1 },
            
            // C3 - B3
            'C3': { positionId: 8, displayName: 'C3', hasFingering: true, fingering: '048_C3_v1.jpg', variants: 1 },
            'C#3': { positionId: 8, displayName: 'C#3', hasFingering: true, fingering: '049_C#3_Db3_v1.jpg', variants: 1 },
            'Db3': { positionId: 9, displayName: 'Db3', hasFingering: true, fingering: '049_C#3_Db3_v1.jpg', variants: 1 },
            'D3': { positionId: 9, displayName: 'D3', hasFingering: true, fingering: '050_D3_v1.jpg', variants: 1 },
            'D#3': { positionId: 9, displayName: 'D#3', hasFingering: true, fingering: '051_D#3_Eb3_v1.jpg', variants: 1 },
            'Eb3': { positionId: 10, displayName: 'Eb3', hasFingering: true, fingering: '051_D#3_Eb3_v1.jpg', variants: 1 },
            'E3': { positionId: 10, displayName: 'E3', hasFingering: true, fingering: '052_E3_v1.jpg', variants: 1 },
            'F3': { positionId: 11, displayName: 'F3', hasFingering: true, fingering: '053_F3_v1.jpg', variants: 1 },
            'F#3': { positionId: 11, displayName: 'F#3', hasFingering: true, fingering: '054_F#3_Gb3_v1.jpg', variants: 1 },
            'Gb3': { positionId: 12, displayName: 'Gb3', hasFingering: true, fingering: '054_F#3_Gb3_v1.jpg', variants: 1 },
            'G3': { positionId: 12, displayName: 'G3', hasFingering: true, fingering: '055_G3_v1.jpg', variants: 1 },
            'G#3': { positionId: 12, displayName: 'G#3', hasFingering: true, fingering: '056_G#3_Ab3_v1.jpg', variants: 1 },
            'Ab3': { positionId: 13, displayName: 'Ab3', hasFingering: true, fingering: '056_G#3_Ab3_v1.jpg', variants: 1 },
            'A3': { positionId: 13, displayName: 'A3', hasFingering: true, fingering: '057_A3_v1.jpg', variants: 1 },
            'A#3': { positionId: 13, displayName: 'A#3', hasFingering: true, fingering: '058_A#3_Bb3_v1.jpg', variants: 4 },
            'Bb3': { positionId: 14, displayName: 'Bb3', hasFingering: true, fingering: '058_A#3_Bb3_v1.jpg', variants: 4 },
            'B3': { positionId: 14, displayName: 'B3', hasFingering: true, fingering: '059_B3_v1.jpg', variants: 1 },
            
            // C4 - B4
            'C4': { positionId: 15, displayName: 'C4', hasFingering: true, fingering: '060_C4_v1.jpg', variants: 2 },
            'C#4': { positionId: 15, displayName: 'C#4', hasFingering: true, fingering: '061_C#4_Db4_v1.jpg', variants: 1 },
            'Db4': { positionId: 16, displayName: 'Db4', hasFingering: true, fingering: '061_C#4_Db4_v1.jpg', variants: 1 },
            'D4': { positionId: 16, displayName: 'D4', hasFingering: true, fingering: '062_D4_v1.jpg', variants: 1 },
            'D#4': { positionId: 16, displayName: 'D#4', hasFingering: true, fingering: '063_D#4_Eb4_v1.jpg', variants: 1 },
            'Eb4': { positionId: 17, displayName: 'Eb4', hasFingering: true, fingering: '063_D#4_Eb4_v1.jpg', variants: 1 },
            'E4': { positionId: 17, displayName: 'E4', hasFingering: true, fingering: '064_E4_v1.jpg', variants: 1 },
            'F4': { positionId: 18, displayName: 'F4', hasFingering: true, fingering: '065_F4_v1.jpg', variants: 1 },
            'F#4': { positionId: 18, displayName: 'F#4', hasFingering: true, fingering: '066_F#4_Gb4_v1.jpg', variants: 1 },
            'Gb4': { positionId: 19, displayName: 'Gb4', hasFingering: true, fingering: '066_F#4_Gb4_v1.jpg', variants: 1 },
            'G4': { positionId: 19, displayName: 'G4', hasFingering: true, fingering: '067_G4_v1.jpg', variants: 1 },
            'G#4': { positionId: 19, displayName: 'G#4', hasFingering: true, fingering: '068_G#4_Ab4_v1.jpg', variants: 1 },
            'Ab4': { positionId: 20, displayName: 'Ab4', hasFingering: true, fingering: '068_G#4_Ab4_v1.jpg', variants: 1 },
            'A4': { positionId: 20, displayName: 'A4', hasFingering: true, fingering: '069_A4_v1.jpg', variants: 1 },
            'A#4': { positionId: 20, displayName: 'A#4', hasFingering: true, fingering: '070_A#4_Bb4_v1.jpg', variants: 4 },
            'Bb4': { positionId: 21, displayName: 'Bb4', hasFingering: true, fingering: '070_A#4_Bb4_v1.jpg', variants: 4 },
            'B4': { positionId: 21, displayName: 'B4', hasFingering: true, fingering: '071_B4_v1.jpg', variants: 1 },
            
            // C5 - A5
            'C5': { positionId: 22, displayName: 'C5', hasFingering: true, fingering: '072_C5_v1.jpg', variants: 2 },
            'C#5': { positionId: 22, displayName: 'C#5', hasFingering: true, fingering: '073_C#5_Db5_v1.jpg', variants: 1 },
            'Db5': { positionId: 23, displayName: 'Db5', hasFingering: true, fingering: '073_C#5_Db5_v1.jpg', variants: 1 },
            'D5': { positionId: 23, displayName: 'D5', hasFingering: true, fingering: '074_D5_v1.jpg', variants: 1 },
            'D#5': { positionId: 23, displayName: 'D#5', hasFingering: true, fingering: '075_D#5_Eb5_v1.jpg', variants: 1 },
            'Eb5': { positionId: 24, displayName: 'Eb5', hasFingering: true, fingering: '075_D#5_Eb5_v1.jpg', variants: 1 },
            'E5': { positionId: 24, displayName: 'E5', hasFingering: true, fingering: '076_E5_v1.jpg', variants: 2 },
            'F5': { positionId: 25, displayName: 'F5', hasFingering: true, fingering: '077_F5_v1.jpg', variants: 2 },
            'F#5': { positionId: 25, displayName: 'F#5', hasFingering: true, fingering: '078_F#5_Gb5_v1.jpg', variants: 1 },
            'Gb5': { positionId: 26, displayName: 'Gb5', hasFingering: true, fingering: '078_F#5_Gb5_v1.jpg', variants: 1 },
            'G5': { positionId: 26, displayName: 'G5', hasFingering: false, fingering: null, variants: 1 },
            'G#5': { positionId: 26, displayName: 'G#5', hasFingering: false, fingering: null, variants: 1 },
            'Ab5': { positionId: 27, displayName: 'Ab5', hasFingering: false, fingering: null, variants: 1 },
            'A5': { positionId: 27, displayName: 'A5', hasFingering: false, fingering: null, variants: 1 },
            'A#5': { positionId: 27, displayName: 'A#5', hasFingering: false, fingering: null, variants: 1 }
        });
        
        return noteMap[noteName] || { positionId: 1, displayName: noteName, hasFingering: false, fingering: null, variants: 1 };
    }
    
    // === Тактовые черты, размер такта и реприза ===
    
    // Длительность элемента в четвертях
    elementBeats(element) {
        return Playback.beatsFor(element.duration, element.dotted);
    }
    
    // Длина такта в четвертях: 4/4 -> 4, 6/8 -> 3
    measureBeats() {
        const parts = String(this.timeSignature || DEFAULT_TIME_SIGNATURE).split('/');
        const numerator = parseInt(parts[0], 10) || 4;
        const denominator = parseInt(parts[1], 10) || 4;
        return numerator * (4 / denominator);
    }
    
    // Какие элементы закрываются тактовой чертой. В автоматическом режиме черта
    // встаёт после элемента, на котором сумма длительностей доходит до границы
    // такта или переходит её. Знак конца репризы сам является тактовой чертой.
    computeBarLines() {
        const marks = new Map(); // id элемента -> 'barline' | 'repeat-end'
        const measure = this.measureBeats();
        let total = 0;
        
        if (this.barLineMode === 'auto') {
            let nextBoundary = measure;
            
            this.notes.forEach(element => {
                const start = total;
                total += this.elementBeats(element);
                
                // Граница такта попала внутрь длительности ноты
                element.crossesBoundary = Math.floor((total - 1e-6) / measure) >
                    Math.floor((start + 1e-6) / measure);
                
                if (total >= nextBoundary - 1e-6) {
                    marks.set(element.id, 'barline');
                    while (nextBoundary <= total + 1e-6) {
                        nextBoundary += measure;
                    }
                }
            });
            
            const complete = Math.floor((total + 1e-6) / measure);
            const hasTail = total - complete * measure > 1e-6;
            this.measureCount = total > 0 ? complete + (hasTail ? 1 : 0) : 0;
        } else {
            this.notes.forEach(element => {
                element.crossesBoundary = false;
                if (element.hasBarLine) marks.set(element.id, 'barline');
            });
            this.measureCount = this.notes.length ? marks.size + 1 : 0;
        }
        
        this.notes.forEach(element => {
            if (element.repeatEnd) {
                marks.set(element.id, 'repeat-end');
            }
        });
        
        return marks;
    }
    
    clearNotationMarks() {
        this.notationMarks.forEach(node => node.remove());
        this.notationMarks = [];
    }
    
    // Перерисовка черт и знаков репризы. Всё вычисляется из состояния заново,
    // поэтому любое изменение даёт согласованную картинку.
    renderNotationMarks() {
        this.clearNotationMarks();
        
        const marks = this.computeBarLines();
        const slot = this.imageSize + 2;
        const height = STAFF_MAIN_BOTTOM - STAFF_MAIN_TOP;
        
        // Точки, занятые знаками репризы: знак сам содержит тактовую черту
        const repeatStarts = new Set();
        const repeatEnds = new Set();
        this.notes.forEach(element => {
            if (element.repeatStart) repeatStarts.add(Math.round(element.x - slot / 2));
            if (element.repeatEnd) repeatEnds.add(Math.round(element.x + slot / 2));
        });
        
        this.notes.forEach(element => {
            element.element.classList.toggle('crosses-boundary', !!element.crossesBoundary);
            
            // Поясняем оранжевую подсветку: нота звучит через границу такта
            if (element.crossesBoundary) {
                element.element.setAttribute('title', t('note.crossesBoundary'));
            } else {
                element.element.removeAttribute('title');
            }
            
            const mark = marks.get(element.id);
            const rightEdge = element.x + slot / 2;
            
            if (mark === 'repeat-end') {
                this.notationMarks.push(this.createRepeatSign(element, 'end', rightEdge, height));
            } else if (mark === 'barline' && !repeatStarts.has(Math.round(rightEdge))) {
                this.notationMarks.push(this.createBarLine(element, rightEdge));
            }
            
            if (element.repeatStart) {
                const leftEdge = element.x - slot / 2;
                // Если здесь же заканчивается другая реприза, отодвигаем знак вправо
                const x = repeatEnds.has(Math.round(leftEdge)) ? leftEdge + 15 : leftEdge;
                this.notationMarks.push(this.createRepeatSign(element, 'start', x, height));
            }
        });
        
        this.updateMeasureInfo();
    }
    
    createBarLine(element, x) {
        const barLine = document.createElement('div');
        barLine.className = 'bar-line fade-in';
        barLine.style.left = x + 'px';
        barLine.style.top = STAFF_MAIN_TOP + 'px';
        barLine.style.height = (STAFF_MAIN_BOTTOM - STAFF_MAIN_TOP) + 'px';
        barLine.title = t('barline.title', { target: this.elementLabel(element) });
        
        barLine.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectNote(element.id);
        });
        
        this.systemContainer(element).appendChild(barLine);
        return barLine;
    }
    
    // Стан той строки, в которой стоит элемент
    systemContainer(element) {
        const index = element.system || 0;
        return this.staffContainers[index] || this.staffContainers[0] || this.container;
    }
    
    // side: 'start' - знак |:, 'end' - знак :|
    createRepeatSign(element, side, x, height) {
        const sign = document.createElement('div');
        sign.className = 'repeat-sign ' + side + ' fade-in';
        sign.style.left = x + 'px';
        sign.style.top = STAFF_MAIN_TOP + 'px';
        sign.style.height = height + 'px';
        sign.innerHTML = '<span class="repeat-bar thick"></span>' +
            '<span class="repeat-bar thin"></span>' +
            '<span class="repeat-dot upper"></span>' +
            '<span class="repeat-dot lower"></span>';
        sign.title = t(side === 'start' ? 'barline.repeatStartTitle' : 'barline.repeatEndTitle',
            { target: this.elementLabel(element) });
        
        sign.addEventListener('click', (e) => {
            e.stopPropagation();
            if (side === 'start') {
                element.repeatStart = false;
            } else {
                element.repeatEnd = false;
            }
            this.relayout();
            this.updateBarLineButtons();
            this.scheduleAutosave();
            this.updateStatus(t(side === 'start' ? 'status.repeatStartOff' : 'status.repeatEndOff'));
        });
        
        this.systemContainer(element).appendChild(sign);
        return sign;
    }
    
    elementLabel(element) {
        return element.isRest ? t('target.rest') : t('target.note', { name: element.displayName });
    }
    
    updateMeasureInfo() {
        const node = document.getElementById('measure-info');
        if (!node) return;
        
        node.textContent = this.notes.length
            ? t('staff.measures', { signature: this.timeSignature, n: this.measureCount })
            : t('staff.metre', { signature: this.timeSignature });
    }
    
    setTimeSignature(value) {
        this.timeSignature = value || DEFAULT_TIME_SIGNATURE;
        
        const select = document.getElementById('time-signature');
        if (select && select.value !== this.timeSignature) select.value = this.timeSignature;
        
        this.relayout();
        this.scheduleAutosave();
        
        if (this.notes.length) {
            this.updateStatus(t('status.signatureSet', { signature: this.timeSignature, n: this.measureCount }));
        }
    }
    
    setBarLineMode(mode) {
        if (mode !== 'auto' && mode !== 'manual') return;
        this.barLineMode = mode;
        
        const radio = document.querySelector(`input[name="barline-mode"][value="${mode}"]`);
        if (radio) radio.checked = true;
        
        this.relayout();
        this.updateBarLineButtons();
        this.scheduleAutosave();
        this.updateStatus(t(mode === 'auto' ? 'status.barlinesAuto' : 'status.barlinesManual'));
    }
    
    // Добавление тактовой черты после выделенного элемента (ручной режим)
    addBarLine() {
        if (this.barLineMode !== 'manual') {
            this.updateStatus(t('status.manualOnly'));
            return null;
        }
        
        const note = this.notes.find(n => n.id === this.selectedNoteId);
        if (!note) {
            this.updateStatus(t('status.selectForBarline'));
            return null;
        }
        
        note.hasBarLine = true;
        this.relayout();
        this.updateBarLineButtons();
        this.updateStatus(t('status.barlineAdded', { target: this.elementLabel(note) }));
        this.scheduleAutosave();
        return note.id;
    }
    
    // Удаление тактовой черты у выделенного элемента (ручной режим)
    removeBarLine() {
        if (this.barLineMode !== 'manual') {
            this.updateStatus(t('status.manualOnly'));
            return false;
        }
        
        const note = this.notes.find(n => n.id === this.selectedNoteId);
        if (!note) return false;
        
        if (!note.hasBarLine) {
            this.updateStatus(t('status.barlineMissing', { target: this.elementLabel(note) }));
            return false;
        }
        
        note.hasBarLine = false;
        this.relayout();
        this.updateBarLineButtons();
        this.updateStatus(t('status.barlineRemoved', { target: this.elementLabel(note) }));
        this.scheduleAutosave();
        return true;
    }
    
    clearAllBarLines() {
        this.notes.forEach(note => { note.hasBarLine = false; });
        this.relayout();
        this.updateBarLineButtons();
        this.updateStatus(t('status.barlinesCleared'));
    }
    
    // Начало репризы у выделенного элемента
    toggleRepeatStart() {
        const note = this.notes.find(n => n.id === this.selectedNoteId);
        if (!note) {
            this.updateStatus(t('status.selectForRepeatStart'));
            return false;
        }
        
        note.repeatStart = !note.repeatStart;
        this.relayout();
        this.updateBarLineButtons();
        this.scheduleAutosave();
        this.updateStatus(t(note.repeatStart ? 'status.repeatStartOn' : 'status.repeatStartOff'));
        return note.repeatStart;
    }
    
    // Конец репризы у выделенного элемента
    toggleRepeatEnd() {
        const note = this.notes.find(n => n.id === this.selectedNoteId);
        if (!note) {
            this.updateStatus(t('status.selectForRepeatEnd'));
            return false;
        }
        
        note.repeatEnd = !note.repeatEnd;
        this.relayout();
        this.updateBarLineButtons();
        this.scheduleAutosave();
        this.updateStatus(t(note.repeatEnd ? 'status.repeatEndOn' : 'status.repeatEndOff'));
        return note.repeatEnd;
    }
    
    // Состояние кнопок тактовых черт и репризы
    updateBarLineButtons() {
        const note = this.notes.find(n => n.id === this.selectedNoteId);
        const manual = this.barLineMode === 'manual';
        
        const addButton = document.getElementById('btn-add-barline');
        const removeButton = document.getElementById('btn-remove-barline');
        const startButton = document.getElementById('btn-repeat-start');
        const endButton = document.getElementById('btn-repeat-end');
        
        if (addButton) addButton.disabled = !manual || !note;
        if (removeButton) removeButton.disabled = !manual || !note || !note.hasBarLine;
        
        if (startButton) {
            startButton.disabled = !note;
            startButton.classList.toggle('active', !!note && !!note.repeatStart);
        }
        if (endButton) {
            endButton.disabled = !note;
            endButton.classList.toggle('active', !!note && !!note.repeatEnd);
        }
    }
    
    updateStatus(message) {
        document.getElementById('status-message').textContent = message;
        console.log('Status:', message);
    }
    
    // Прокручивает область стана к строке, которая звучит, плавным движением.
    // Если это последняя нота строки, заранее показываем следующую:
    // переключение происходит, пока нота ещё звучит.
    followPlayback(element) {
        if (!element) return;
        
        const area = document.querySelector('.scrollable-area');
        if (!area) return;
        
        let systemIndex = element.system || 0;
        if (element.lastInSystem && this.staffContainers[systemIndex + 1]) {
            systemIndex += 1;
        }
        
        const staff = this.staffContainers[systemIndex];
        // Именно строка целиком: в неё входят и стан, и ряд аппликатур.
        // Если взять обёртку стана, аппликатуры остаются за краем области.
        const system = staff ? staff.closest('.system') : null;
        if (!system) return;
        
        const areaRect = area.getBoundingClientRect();
        const systemRect = system.getBoundingClientRect();
        const top = systemRect.top - areaRect.top + area.scrollTop;
        const bottom = top + systemRect.height;
        const viewTop = area.scrollTop;
        const viewBottom = viewTop + area.clientHeight;
        
        // Строка уже видна целиком - не дёргаем область
        if (top >= viewTop && bottom <= viewBottom) return;
        
        const limit = Math.max(0, area.scrollHeight - area.clientHeight);
        const target = Math.max(0, Math.min(top - PLAYBACK_SCROLL_MARGIN, limit));
        
        this.scrollAreaTo(area, target);
    }
    
    // Плавная прокрутка области. При отключённой анимации в системе - сразу.
    scrollAreaTo(area, top) {
        const reduce = window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        
        if (reduce || typeof area.scrollTo !== 'function') {
            area.scrollTop = top;
            return;
        }
        
        area.scrollTo({ top: top, behavior: 'smooth' });
    }
    
    // Подсветка элемента, который звучит сейчас: знак на стане и карточка аппликатуры
    highlightElement(element) {        document.querySelectorAll('.note-anchor.playing').forEach(node => node.classList.remove('playing'));
        document.querySelectorAll('.fingering-card.playing').forEach(node => node.classList.remove('playing'));
        
        if (!element) return;
        
        if (element.element) element.element.classList.add('playing');
        
        const card = document.querySelector('.fingering-card[data-note-id="' + element.id + '"]');
        if (card) card.classList.add('playing');
    }
    
    // Переключение диезов и бемолей переписывает уже добавленные ноты
    setDisplayMode(mode) {
        if (mode !== 'sharps' && mode !== 'flats') return;
        if (this.displayMode === mode) return;
        
        this.displayMode = mode;
        
        this.notes.forEach(element => {
            if (element.isRest) return;
            
            const converted = this.convertNoteName(element.noteName, mode);
            if (!converted) return;
            
            const info = this.getNoteInfoByName(converted);
            const position = this.positions.find(p => p.id === info.positionId);
            if (!position) return;
            
            element.noteName = converted;
            element.displayName = info.displayName;
            element.accidental = this.accidentalOf(info.displayName);
            element.positionId = info.positionId;
            element.y = position.y;
            element.stemUp = position.y > STAFF_MIDDLE_LINE_Y;
            element.fingering = info.fingering;
            element.fingeringBase = info.fingering ? info.fingering.replace(/_v\d+\.jpg$/, '') : null;
            element.hasFingering = info.hasFingering;
            element.variants = info.variants || 1;
            element.currentVariant = Math.min(element.currentVariant || 1, element.variants);
            if (element.fingeringBase) {
                element.fingering = `${element.fingeringBase}_v${element.currentVariant}.jpg`;
            }
            
            element.element.style.top = position.y + 'px';
            element.element.setAttribute('data-stem', element.stemUp ? 'up' : 'down');
            const label = element.element.querySelector('.note-label');
            if (label) label.textContent = info.displayName;
            this.refreshElement(element);
        });
        
        const selected = this.notes.find(n => n.id === this.selectedNoteId);
        if (selected) {
            document.getElementById('selected-note').textContent = selected.isRest ? t('rest.word') : selected.displayName;
            this.updateFingering(selected);
        }
        
        this.scheduleAutosave();
        this.updateStatus(t(mode === 'sharps' ? 'status.sharps' : 'status.flats'));
    }
    
    // Энгармоническая замена: C#4 <-> Db4 и так далее
    convertNoteName(noteName, mode) {
        const replacements = {
            sharps: { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' },
            flats: { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' }
        }[mode];
        
        if (!replacements || !noteName) return noteName;
        
        const prefix = noteName.slice(0, 2);
        return replacements[prefix] ? replacements[prefix] + noteName.slice(2) : noteName;
    }
    
    // Единый формат сохранения для файла и LocalStorage
    serializeMelody() {
        return {
            elements: this.notes.map(note => ({
                isRest: !!note.isRest,
                positionId: note.positionId,
                noteName: note.noteName,
                displayName: note.displayName,
                duration: note.duration,
                dotted: !!note.dotted,
                currentVariant: note.currentVariant || 1,
                hasBarLine: !!note.hasBarLine,
                repeatStart: !!note.repeatStart,
                repeatEnd: !!note.repeatEnd
            })),
            settings: {
                imageSize: this.imageSize,
                showNoteNames: this.showNoteNames,
                showFingerings: this.showFingerings,
                loopPlayback: this.loopPlayback,
                displayMode: this.displayMode,
                tempo: this.tempo,
                timeSignature: this.timeSignature,
                barLineMode: this.barLineMode
            },
            timestamp: new Date().toISOString(),
            version: '1.5.0',
            range: 'C2 - A5'
        };
    }
    
    // Автосохранение после каждого изменения: раньше оно висело только на закрытии
    // вкладки и терялось, если вкладку закрывали не штатно.
    scheduleAutosave() {
        if (this.loading) return;
        clearTimeout(this.autosaveTimer);
        this.autosaveTimer = setTimeout(() => this.saveToLocalStorage(true), 400);
    }
    
    saveToLocalStorage(silent = false) {
        try {
            localStorage.setItem('saxophone-fullrange-data', JSON.stringify(this.serializeMelody()));
            if (!silent) this.updateStatus(t('status.savedLocal'));
            return true;
        } catch (error) {
            this.updateStatus(t('status.saveError', { message: error.message }));
            return false;
        }
    }
    
    // Восстановление мелодии из сохранённых данных. Понимает и новый формат (elements),
    // и старый (notes) - чтобы ранее сохранённые мелодии не потерялись.
    applyMelody(data) {
        const elements = (data && (data.elements || data.notes)) || [];
        
        this.loading = true;
        this.clearAllNotes();
        
        elements.forEach(item => {
            const elementId = item.isRest
                ? this.addRest(null, { silent: true })
                : this.addNote(item.positionId, item.noteName, null, { silent: true });
            if (!elementId) return;
            
            const element = this.notes.find(n => n.id === elementId);
            if (!element) return;
            
            element.duration = item.duration || 4;
            element.dotted = !!item.dotted;
            
            // Возвращаем выбранный вариант аппликатуры
            if (!element.isRest && element.hasFingering && item.currentVariant > 1) {
                element.currentVariant = Math.min(item.currentVariant, element.variants);
                if (element.fingeringBase) {
                    element.fingering = `${element.fingeringBase}_v${element.currentVariant}.jpg`;
                }
            }
            this.refreshElement(element);
            
            element.hasBarLine = !!item.hasBarLine;
            element.repeatStart = !!item.repeatStart;
            element.repeatEnd = !!item.repeatEnd;
        });
        
        this.applySettings(data && data.settings);
        
        this.loading = false;
        this.deselectNote();
        this.relayout();
    }
    
    // Загрузка мелодии из MIDI-файла: разбор, преобразование и перенос на стан.
    // Возвращает сведения о переносе, чтобы их можно было проверить.
    applyMidiBuffer(buffer) {
        const parsed = Midi.parse(buffer);
        
        if (!parsed.ok) {
            const reason = (parsed.errors && parsed.errors.length)
                ? parsed.errors[0]
                : t('midi.badFile');
            this.updateStatus(t('midi.failed', { reason: reason }));
            return null;
        }
        
        const converted = Midi.toElements(parsed);
        
        if (!converted.elements.length) {
            this.updateStatus(t('midi.empty'));
            return null;
        }
        
        this.applyMelody({
            elements: converted.elements,
            settings: {
                imageSize: this.imageSize,
                showNoteNames: this.showNoteNames,
                showFingerings: this.showFingerings,
                loopPlayback: this.loopPlayback,
                displayMode: this.displayMode
            }
        });
        
        this.applyMidiSettings(converted);
        this.updateStatus(this.midiStatusText(converted));
        
        return converted;
    }
    
    // Темп и размер такта из файла переносим, если приложение их поддерживает
    applyMidiSettings(converted) {
        if (converted.tempoBpm) {
            this.setTempo(Math.max(30, Math.min(240, converted.tempoBpm)));
        }
        
        const signature = converted.timeSignature;
        if (!signature) return;
        
        const text = signature.numerator + '/' + signature.denominator;
        const select = document.getElementById('time-signature');
        const known = select && Array.prototype.some.call(select.options, option => option.value === text);
        
        if (known) this.setTimeSignature(text);
    }
    
    // Что сказать о загруженном файле: сколько нот, одноголосый ли он,
    // не пришлось ли переносить и не потерялось ли что-то
    midiStatusText(converted) {
        const stats = converted.stats;
        const poly = stats.polyphony;
        
        let text = t('midi.loaded', { notes: stats.notes, rests: stats.rests });
        
        text += poly.isMonophonic
            ? t('midi.monophonic')
            : t('midi.polyphonic', { max: poly.maxSimultaneous });
        
        if (converted.shift) text += t('midi.shifted', { semitones: converted.shift });
        if (stats.skipped) text += t('midi.skipped', { n: stats.skipped });
        
        return text;
    }
    
    // Чтение выбранного MIDI-файла
    readMidiFile(file) {
        if (!file) return;
        
        if (typeof FileReader === 'undefined') {
            this.updateStatus(t('midi.failed', { reason: t('midi.badFile') }));
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = () => this.applyMidiBuffer(reader.result);
        reader.onerror = () => this.updateStatus(t('midi.failed', { reason: t('midi.badFile') }));
        reader.readAsArrayBuffer(file);
    }
    
    applySettings(settings) {
        if (!settings) return;
        
        if (settings.imageSize) {
            this.updateImageSize(settings.imageSize);
            const slider = document.getElementById('image-size-slider');
            if (slider) slider.value = settings.imageSize;
        }
        
        if (settings.showNoteNames !== undefined) {
            this.updateNoteNamesVisibility(settings.showNoteNames);
            const checkbox = document.getElementById('show-note-names');
            if (checkbox) checkbox.checked = settings.showNoteNames;
        }
        
        if (settings.showFingerings !== undefined) {
            this.setFingeringsVisible(settings.showFingerings, true);
        }
        
        if (settings.loopPlayback !== undefined) {
            this.setLoopPlayback(settings.loopPlayback, true);
        }
        
        if (settings.displayMode) {
            this.displayMode = settings.displayMode;
            const radio = document.querySelector(`input[name="accidentals-mode"][value="${settings.displayMode}"]`);
            if (radio) radio.checked = true;
        }
        
        if (settings.tempo) {
            this.setTempo(settings.tempo);
        }
        
        if (settings.timeSignature) {
            this.setTimeSignature(settings.timeSignature);
        }
        
        if (settings.barLineMode) {
            this.setBarLineMode(settings.barLineMode);
        }
    }
    
    setTempo(value) {
        const parsed = parseInt(value, 10);
        const tempo = Math.min(240, Math.max(30, parsed || 80));
        this.tempo = tempo;
        
        const input = document.getElementById('tempo-input');
        if (input && parseInt(input.value, 10) !== tempo) input.value = tempo;
        
        return tempo;
    }
    
    loadFromLocalStorage() {
        try {
            const dataStr = localStorage.getItem('saxophone-fullrange-data');
            if (!dataStr) {
                this.updateStatus(t('status.noSavedMelody'));
                return false;
            }
            
            const data = JSON.parse(dataStr);
            this.applyMelody(data);
            
            const savedAt = data.timestamp ? new Date(data.timestamp) : null;
            const when = savedAt && !isNaN(savedAt.getTime())
                ? savedAt.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                : '';
            
            this.updateStatus(when ? t('status.lastMelody', { when: when }) : t('status.lastMelodyPlain'));
            return true;
        } catch (error) {
            this.updateStatus(t('status.loadError', { message: error.message }));
            return false;
        }
    }
    
    saveToFile() {
        try {
            const data = this.serializeMelody();
            const dataStr = JSON.stringify(data, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = 'saxophone-fullrange-' + new Date().toISOString().slice(0, 10) + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.updateStatus(t('status.melodySaved'));
            return true;
        } catch (error) {
            this.updateStatus(t('status.saveError', { message: error.message }));
            return false;
        }
    }
    
    loadFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    this.applyMelody(JSON.parse(e.target.result));
                    this.updateStatus(t('status.melodyLoaded'));
                    this.scheduleAutosave();
                    resolve(true);
                } catch (error) {
                    this.updateStatus(t('status.fileLoadError', { message: error.message }));
                    reject(error);
                }
            };
            
            reader.onerror = () => {
                this.updateStatus(t('status.fileReadError'));
                reject(new Error('Ошибка чтения файла'));
            };
            
            reader.readAsText(file);
        });
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    const staffManager = new FullRangeStaffManager('systems');
    window.staffManager = staffManager;
    
    // Кнопки быстрых нот были удалены из HTML
    
    // Управление нотами
    document.getElementById('btn-note-up').addEventListener('click', () => {
        staffManager.changeSelectedNotePitch(1);
    });
    
    document.getElementById('btn-note-down').addEventListener('click', () => {
        staffManager.changeSelectedNotePitch(-1);
    });
    
    document.getElementById('btn-delete-note').addEventListener('click', () => {
        staffManager.deleteSelectedNote();
    });
    
    document.getElementById('btn-clear').addEventListener('click', () => {
        if (confirm(t('status.confirmClear'))) {
            staffManager.clearAllNotes();
        }
    });
    
    document.getElementById('btn-transpose-up').addEventListener('click', () => {
        staffManager.transposeAllNotes(1);
    });
    
    document.getElementById('btn-transpose-down').addEventListener('click', () => {
        staffManager.transposeAllNotes(-1);
    });
    
    // Сохранение/загрузка
    document.getElementById('btn-save').addEventListener('click', () => {
        staffManager.saveToFile();
    });
    
    document.getElementById('btn-load').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });
    
    document.getElementById('file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            staffManager.loadFromFile(file);
        }
        e.target.value = ''; // Сбрасываем значение
    });
    
    // Загрузка MIDI
    const midiButton = document.getElementById('btn-midi');
    const midiInput = document.getElementById('midi-input');
    
    if (midiButton && midiInput) {
        midiButton.addEventListener('click', () => midiInput.click());
        
        midiInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                staffManager.readMidiFile(file);
            }
            e.target.value = ''; // Чтобы тот же файл можно было выбрать снова
        });
    }
    
    // Настройки
    document.getElementById('image-size-slider').addEventListener('input', (e) => {
        const size = parseInt(e.target.value);
        staffManager.updateImageSize(size);
        staffManager.scheduleAutosave();
    });
    
    document.getElementById('show-note-names').addEventListener('change', (e) => {
        staffManager.updateNoteNamesVisibility(e.target.checked);
        staffManager.scheduleAutosave();
    });
    
    // Режим отображения альтераций: переписываем уже добавленные ноты
    document.querySelectorAll('input[name="accidentals-mode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            staffManager.setDisplayMode(e.target.value);
        });
    });
    
    // Паузы
    document.getElementById('btn-add-rest').addEventListener('click', () => {
        const index = staffManager.selectedIndex();
        staffManager.addRest(index === -1 ? null : index + 1);
    });
    
    // Темп и воспроизведение
    document.getElementById('tempo-input').addEventListener('change', (e) => {
        staffManager.setTempo(e.target.value);
        staffManager.scheduleAutosave();
    });
    
    document.getElementById('btn-play').addEventListener('click', playMelody);
    document.getElementById('btn-stop').addEventListener('click', stopMelody);
    
    function setPlayingState(playing) {
        document.getElementById('btn-play').disabled = playing;
        document.getElementById('btn-stop').disabled = !playing;
    }
    
    function playMelody() {
        if (staffManager.notes.length === 0) {
            staffManager.updateStatus(t('status.addNotesFirst'));
            return;
        }
        
        // Порядок воспроизведения учитывает репризу: участок играется дважды
        const fullSequence = Playback.buildSequence(staffManager.notes);
        const repeats = Playback.computeRepeatPairs(staffManager.notes).length;
        const repeatText = repeats ? t('status.playingRepeat', { n: repeats }) : '';
        
        // Если нота выделена, начинаем с неё
        const fromIndex = selectedStartIndex(fullSequence);
        const sequence = fromIndex > 0 ? fullSequence.slice(fromIndex) : fullSequence;
        const fromText = fromIndex > 0 ? t('status.playingFrom') : '';
        
        function start(isRepeat) {
            const started = staffManager.melodyPlayer.play(sequence, staffManager.tempo, {
                onElement: (index, element) => {
                    staffManager.highlightElement(element);
                    staffManager.followPlayback(element);
                },
                onEnd: () => {
                    // По кругу - пауза, за неё стан поднимается на первую строку,
                    // и только потом начинается следующий круг
                    if (staffManager.loopPlayback) {
                        staffManager.highlightElement(null);
                        staffManager.followPlayback(sequence[0]);
                        staffManager.updateStatus(t('status.loopPause'));
                        start(true);
                        return;
                    }
                    staffManager.highlightElement(null);
                    setPlayingState(false);
                    staffManager.updateStatus(t('status.playDone'));
                },
                onUnsupported: () => {
                    setPlayingState(false);
                    staffManager.updateStatus(t('status.noAudio'));
                }
            }, isRepeat ? { leadIn: LOOP_PAUSE_SECONDS, tailMs: 0 } : undefined);
            
            if (!started) return;
            
            setPlayingState(true);
            
            if (staffManager.loopPlayback) {
                staffManager.updateStatus(t('status.playingLoop', {
                    tempo: staffManager.tempo,
                    count: sequence.length,
                    repeat: repeatText,
                    from: fromText
                }));
            } else {
                const seconds = Playback.totalSeconds(sequence, staffManager.tempo);
                staffManager.updateStatus(t('status.playing', {
                    tempo: staffManager.tempo,
                    count: sequence.length,
                    repeat: repeatText,
                    from: fromText,
                    seconds: seconds.toFixed(1)
                }));
            }
        }
        
        start();
    }
    
    // Место выделенной ноты в порядке воспроизведения.
    // 0 - если ничего не выделено или выделен первый элемент.
    function selectedStartIndex(sequence) {
        const id = staffManager.selectedNoteId;
        if (!id) return 0;
        
        const selected = staffManager.notes.find(note => note.id === id);
        if (!selected) return 0;
        
        const index = sequence.indexOf(selected);
        return index > 0 ? index : 0;
    }
    
    // Пробел запускает и останавливает проигрывание
    function isTypingTarget(node) {
        if (!node || !node.tagName) return false;
        const tag = node.tagName.toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'select' ||
            node.isContentEditable === true;
    }
    
    function toggleMelody() {
        if (staffManager.melodyPlayer && staffManager.melodyPlayer.playing) {
            stopMelody();
        } else {
            playMelody();
        }
    }
    
    document.addEventListener('keydown', (event) => {
        const isSpace = event.key === ' ' || event.code === 'Space';
        if (!isSpace || event.repeat) return;
        
        // В полях ввода пробел остаётся пробелом
        if (isTypingTarget(event.target)) return;
        
        // На кнопке или ссылке пробел нажимает её - не отбираем
        if (event.target && event.target.closest && event.target.closest('button, a')) return;
        
        // При открытом окне «О проекте» пробел не должен включать музыку
        if (document.querySelector('#about-modal:not([hidden])')) return;
        
        event.preventDefault();
        toggleMelody();
    });
    
    function stopMelody() {
        staffManager.melodyPlayer.stop();
        staffManager.highlightElement(null);
        setPlayingState(false);
        staffManager.updateStatus(t('status.playStopped'));
    }
    
    // Автосохранение при закрытии - подстраховка к автосохранению после каждого изменения
    window.addEventListener('beforeunload', () => {
        staffManager.saveToLocalStorage(true);
    });
    
    // Размер такта и режим тактовых черт
    document.getElementById('time-signature').addEventListener('change', (e) => {
        staffManager.setTimeSignature(e.target.value);
    });
    
    document.querySelectorAll('input[name="barline-mode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            staffManager.setBarLineMode(e.target.value);
        });
    });
    
    // Управление тактовыми чертами
    document.getElementById('btn-add-barline').addEventListener('click', () => {
        staffManager.addBarLine();
    });
    
    document.getElementById('btn-remove-barline').addEventListener('click', () => {
        staffManager.removeBarLine();
    });
    
    // Реприза
    document.getElementById('btn-repeat-start').addEventListener('click', () => {
        staffManager.toggleRepeatStart();
    });
    
    document.getElementById('btn-repeat-end').addEventListener('click', () => {
        staffManager.toggleRepeatEnd();
    });
    
    // Автозагрузка при старте
    setTimeout(() => {
        staffManager.loadFromLocalStorage();
    }, 100);
    
    console.log('Saxophone Fingering Assistant - Full Range Version загружен');
});


