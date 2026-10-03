// Saxophone Fingering Assistant - воспроизведение мелодии
// Звук синтезируется через Web Audio API: без внешних библиотек и без файлов сэмплов.
// Расчёт длительностей и частот вынесен в чистые функции, пригодные для проверки в Node.

(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.Playback = api;
    }
}(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    var NOTE_RE = /^([A-Ga-g])([#b]?)(-?\d+)$/;
    var SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

    // 'C#4' / 'Db4' -> частота в герцах. A4 = 440 Гц.
    function noteToFrequency(name) {
        var m = NOTE_RE.exec(String(name == null ? '' : name).trim());
        if (!m) return null;
        var base = SEMITONE[m[1].toUpperCase()];
        var accidental = m[2] === '#' ? 1 : (m[2] === 'b' ? -1 : 0);
        var midi = (parseInt(m[3], 10) + 1) * 12 + base + accidental;
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    // Длительность элемента в долях (четвертях). duration - знаменатель, dotted - точка.
    function beatsFor(duration, dotted) {
        var denominator = duration || 4;
        var beats = 4 / denominator;
        return dotted ? beats * 1.5 : beats;
    }

    // Длительность элемента в секундах при заданном темпе.
    function secondsFor(element, tempo) {
        var bpm = tempo > 0 ? tempo : 80;
        return beatsFor(element && element.duration, element && element.dotted) * (60 / bpm);
    }

    function totalSeconds(elements, tempo) {
        var sum = 0;
        for (var i = 0; i < (elements || []).length; i++) {
            sum += secondsFor(elements[i], tempo);
        }
        return sum;
    }

    // --- реприза ---

    // Пары «начало - конец» репризы.
    // Участки идут последовательно и не вкладываются друг в друга: вложенное
    // начало игнорируется. Закрывающий знак без открывающего означает повтор
    // с начала мелодии - так это читается и в нотной записи.
    function computeRepeatPairs(elements) {
        var list = elements || [];
        var pairs = [];
        var openStart = -1;

        for (var i = 0; i < list.length; i++) {
            var element = list[i];

            // Начало и конец на одном элементе - участок из одного элемента
            if (element.repeatStart && element.repeatEnd && openStart === -1) {
                pairs.push({ start: i, end: i, fromStart: false });
                continue;
            }

            if (element.repeatEnd) {
                var fromStart = openStart === -1;
                pairs.push({
                    start: fromStart ? 0 : openStart,
                    end: i,
                    fromStart: fromStart
                });
                openStart = -1;
                continue;
            }

            if (element.repeatStart && openStart === -1) {
                openStart = i;
            }
        }

        return pairs;
    }

    // Порядок индексов для воспроизведения: участок репризы играется дважды.
    function buildPlaybackOrder(elements) {
        var list = elements || [];
        var pairs = computeRepeatPairs(list);
        var repeatFrom = {};

        pairs.forEach(function (pair) {
            repeatFrom[pair.end] = pair.start;
        });

        var order = [];
        var used = {};
        var index = 0;
        var guard = list.length * 6 + 64; // страховка от зацикливания

        while (index < list.length && guard-- > 0) {
            order.push(index);

            if (Object.prototype.hasOwnProperty.call(repeatFrom, index) && !used[index]) {
                used[index] = true;
                index = repeatFrom[index];
                continue;
            }

            index++;
        }

        return order;
    }

    // Готовая последовательность элементов для проигрывателя
    function buildSequence(elements) {
        var list = elements || [];
        return buildPlaybackOrder(list).map(function (index) {
            return list[index];
        });
    }

    function audioSupported() {
        return typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
    }

    function MelodyPlayer() {
        this.ctx = null;
        this.master = null;
        this.voices = [];
        this.timers = [];
        this.playing = false;
    }

    MelodyPlayer.prototype.ensureContext = function () {
        if (this.ctx) return this.ctx;
        if (!audioSupported()) return null;
        var Ctor = window.AudioContext || window.webkitAudioContext;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.45;
        this.master.connect(this.ctx.destination);
        return this.ctx;
    };

    // Одна нота: две расстроенные пилы через фильтр, огибающая и вибрато.
    MelodyPlayer.prototype.scheduleNote = function (frequency, startAt, durationSec) {
        var ctx = this.ctx;
        var attack = 0.025;
        var release = 0.09;
        var end = startAt + durationSec;
        var peak = 0.3;

        var osc1 = ctx.createOscillator();
        var osc2 = ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc2.type = 'triangle';
        osc1.frequency.value = frequency;
        osc2.frequency.value = frequency * 1.006;

        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = Math.min(7000, frequency * 6);
        filter.Q.value = 2.5;

        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(peak, startAt + attack);
        gain.gain.exponentialRampToValueAtTime(peak * 0.72, startAt + attack + 0.06);
        gain.gain.setTargetAtTime(0.0001, Math.max(startAt + attack + 0.07, end - release), 0.035);

        var lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 5.2;
        var lfoGain = ctx.createGain();
        lfoGain.gain.value = frequency * 0.005;
        lfo.connect(lfoGain);
        lfoGain.connect(osc1.frequency);
        lfoGain.connect(osc2.frequency);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.master);

        var stopAt = end + 0.2;
        osc1.start(startAt);
        osc2.start(startAt);
        lfo.start(startAt);
        osc1.stop(stopAt);
        osc2.stop(stopAt);
        lfo.stop(stopAt);

        var voices = [osc1, osc2, lfo];
        this.voices.push.apply(this.voices, voices);

        // Возвращаем голоса: вызывающий может погасить звук раньше срока
        return voices;
    };

    // elements: [{ noteName, duration, dotted, isRest }], handlers: { onElement, onEnd, onUnsupported }
    // options: { leadIn, tailMs } - пауза перед началом и после конца в секундах и миллисекундах.
    // Для повтора по кругу их задают нулевыми, чтобы круг начинался без разрыва.
    MelodyPlayer.prototype.play = function (elements, tempo, handlers, options) {
        handlers = handlers || {};
        options = options || {};
        this.stop();

        var ctx = this.ensureContext();
        if (!ctx) {
            if (handlers.onUnsupported) handlers.onUnsupported();
            return false;
        }
        if (ctx.state === 'suspended' && ctx.resume) ctx.resume();

        var self = this;
        var leadIn = options.leadIn === undefined ? 0.15 : options.leadIn;
        var tailMs = options.tailMs === undefined ? 120 : options.tailMs;
        var cursor = ctx.currentTime + leadIn;
        var list = elements || [];

        this.playing = true;

        list.forEach(function (element, index) {
            var durationSec = secondsFor(element, tempo);
            var startAt = cursor;

            if (!element.isRest) {
                var frequency = noteToFrequency(element.noteName);
                if (frequency) {
                    self.scheduleNote(frequency, startAt, durationSec * 0.92);
                }
            }

            self.timers.push(setTimeout(function () {
                if (handlers.onElement) handlers.onElement(index, element);
            }, Math.max(0, (startAt - ctx.currentTime) * 1000)));

            cursor += durationSec;
        });

        this.timers.push(setTimeout(function () {
            self.playing = false;
            if (handlers.onEnd) handlers.onEnd();
        }, Math.max(0, (cursor - ctx.currentTime) * 1000 + tailMs)));

        return true;
    };

    MelodyPlayer.prototype.stop = function () {
        this.timers.forEach(function (id) { clearTimeout(id); });
        this.timers = [];

        this.voices.forEach(function (voice) {
            try { voice.stop(); } catch (e) { /* уже остановлен */ }
            try { voice.disconnect(); } catch (e) { /* уже отключён */ }
        });
        this.voices = [];
        this.playing = false;
    };

    function createPlayer() {
        return new MelodyPlayer();
    }

    return {
        noteToFrequency: noteToFrequency,
        beatsFor: beatsFor,
        secondsFor: secondsFor,
        totalSeconds: totalSeconds,
        computeRepeatPairs: computeRepeatPairs,
        buildPlaybackOrder: buildPlaybackOrder,
        buildSequence: buildSequence,
        audioSupported: audioSupported,
        MelodyPlayer: MelodyPlayer,
        createPlayer: createPlayer
    };
}));
