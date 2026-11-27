/* Interactive UI controller for the Integer Encoding Visualizer */
(function (global) {
  'use strict';

  const M = global.IntLab.math;
  const Circle = global.IntLab.circle;

  // Curated 8-bit demo presets (chosen so they never match individual worksheet variants)
  const DEMO8_BITS = [
    { id: 'd0', label: '0 (0000 0000)', raw: 0, note: 'Единственный ноль в дополнительном коде.' },
    { id: 'd1', label: '+1 (0000 0001)', raw: 1, note: 'Положительные числа одинаковы во всех четырёх кодах.' },
    { id: 'd127', label: '+127 (0111 1111)', raw: 127, note: 'Максимум 8-битного знакового числа: старший бит 0, остальные 1.' },
    { id: 'd128', label: '128 / -128 (1000 0000)', raw: 128, note: 'В прямом коде это -0, а в дополнительном коде этот код освободился под -128!' },
    { id: 'd200', label: '200 / -56 (1100 1000)', raw: 200, note: 'Один и тот же байт: как беззнаковое это 200, а в доп. коде это -56.' },
    { id: 'd_25', label: '-25 (1110 0111)', raw: M.signedToRawTwos(-25, 8), note: 'Пример отрицательного числа: 25 = 00011001 → ОК 11100110 → ДК 11100111.' },
    { id: 'd255', label: '255 / -1 (1111 1111)', raw: 255, note: 'Все единицы: максимум без знака (255), -0 в обратном коде и -1 в дополнительном.' }
  ];

  const DEMO8_CIRCLE = [
    { id: 'c_u_up', label: '255 + 1 → 0 (без знака)', mode: 'unsigned', startRaw: 255, delta: 1, desc: 'Классический одометр: 11111111 + 1 перескакивает через красную линию в 00000000.' },
    { id: 'c_u_dn', label: '0 − 1 → 255 (без знака)', mode: 'unsigned', startRaw: 0, delta: -1, desc: 'Вычитание 1 из беззнакового нуля «отматывает» счётчик назад в 255.' },
    { id: 'c_s_up', label: '+127 + 1 → −128 (со знаком)', mode: 'signed', startRaw: 127, delta: 1, desc: 'Знаковое переполнение вверх: 01111111 + 1 = 10000000 (резкий скачок в −128).' },
    { id: 'c_s_dn', label: '−128 − 1 → +127 (со знаком)', mode: 'signed', startRaw: 128, delta: -1, desc: 'Знаковое переполнение вниз: 10000000 − 1 = 01111111 (+127).' },
    { id: 'c_u_big', label: '200 + 100 → 44 (без знака)', mode: 'unsigned', startRaw: 200, delta: 100, desc: '200 + 100 = 300, пересечение границы 255|0: 300 − 256 = 44.' },
    { id: 'c_s_big', label: '100 + 50 → −106 (со знаком)', mode: 'signed', startRaw: 100, delta: 50, desc: '100 + 50 = 150 > 127, переход через +127|−128: 150 − 256 = −106.' }
  ];

  const DEMO8_ADDER = [
    { id: 'a_u', label: '200 + 100 (беззнак. переполнение)', rawA: 200, rawB: 100, focus: 'unsigned', note: 'Сумма 300 не помещается в 8 бит. Перенос c₈ = 1 выпадает, остаётся 44.' },
    { id: 'a_sp', label: '100 + 50 (знаковое + и +)', rawA: 100, rawB: 50, focus: 'signed', note: 'Два положительных дали отрицательное (−106). Заметьте: выпавшего переноса c₈ НЕТ (= 0), но знаковое переполнение ЕСТЬ!' },
    { id: 'a_sn', label: '(−100) + (−50) (знаковое − и −)', rawA: M.signedToRawTwos(-100, 8), rawB: M.signedToRawTwos(-50, 8), focus: 'signed', note: 'Два отрицательных дали положительное (+106). Сумма −150 < −128.' },
    { id: 'a_trap', label: '5 + (−3) (ловушка: перенос ≠ переполнение!)', rawA: 5, rawB: M.signedToRawTwos(-3, 8), focus: 'signed', note: 'Перенос из старшего разряда c₈ = 1 ЕСТЬ (отбрасывается), но результат +2 абсолютно точен — знакового переполнения НЕТ!' },
    { id: 'a_hp', label: '120 + 20 (баг счётчика здоровья)', rawA: 120, rawB: 20, focus: 'signed', note: 'Если хранить HP как знаковый байт, 120 + 20 = 140 превращается в −116.' }
  ];

  const state = {
    bits: 4, // 4, 5, or 8 (demo-only)
    activeTab: 'bits', // 'bits' | 'circle' | 'adder'

    // Tab 1: Bits & codes
    rawBits: 11, // 1011 in 4-bit (-5 / 11)
    encodeVal: -5,
    demoBitsIdx: 5,

    // Tab 2: Number circle
    circleMode: 'signed', // 'unsigned' | 'signed'
    circleRaw: 6,
    circlePrevRaw: null,
    circleDelta: 0,
    circleOverflow: false,
    circleMessage: 'Нажимайте +1 / −1 или кликайте по точкам окружности, чтобы увидеть переход через красную границу.',
    demoCircleIdx: 2,

    // Tab 3: Adder
    adderInputMode: 'signed', // controls how A and B inputs are interpreted in 4/5-bit sandbox
    adderRawA: 5,
    adderRawB: 4,
    demoAdderIdx: 0
  };

  function isDemo() {
    return state.bits === 8;
  }

  function formatWithSignHighlight(binStr) {
    if (!binStr) return '—';
    const grouped = M.formatBinaryGrouped(binStr);
    return `<span class="bit-char-sign">${grouped[0]}</span>${grouped.slice(1)}`;
  }

  function setBits(newBits) {
    state.bits = newBits;

    if (newBits === 4) {
      state.rawBits = 11; // 1011 (-5 / 11)
      state.encodeVal = -5;
      state.circleRaw = 6;
      state.circlePrevRaw = null;
      state.circleDelta = 0;
      state.circleOverflow = false;
      state.circleMessage = '4-битная песочница: все 16 чисел видны целиком. Попробуйте нажать +1 несколько раз!';
      state.adderInputMode = 'signed';
      state.adderRawA = 5;
      state.adderRawB = 4;
    } else if (newBits === 5) {
      state.rawBits = 21; // 10101 (-11 / 21)
      state.encodeVal = -11;
      state.circleRaw = 14;
      state.circlePrevRaw = null;
      state.circleDelta = 0;
      state.circleOverflow = false;
      state.circleMessage = '5-битная песочница (32 числа): сравните границу разрыва без знака (31|0) и со знаком (+15|−16).';
      state.adderInputMode = 'signed';
      state.adderRawA = 12;
      state.adderRawB = 7;
    } else {
      // 8-bit demo-only mode
      applyDemoBits(state.demoBitsIdx);
      applyDemoCircle(state.demoCircleIdx);
      applyDemoAdder(state.demoAdderIdx);
    }

    renderAll();
  }

  function applyDemoBits(idx) {
    state.demoBitsIdx = idx;
    const item = DEMO8_BITS[idx];
    state.rawBits = item.raw;
    state.encodeVal = M.rawToTwos(item.raw, 8);
  }

  function applyDemoCircle(idx) {
    state.demoCircleIdx = idx;
    const item = DEMO8_CIRCLE[idx];
    state.circleMode = item.mode;
    state.circlePrevRaw = item.startRaw;
    state.circleDelta = item.delta;
    state.circleRaw = ((item.startRaw + item.delta) % 256 + 256) % 256;
    state.circleOverflow = checkCircleStepOverflow(item.startRaw, item.delta, 8, item.mode);
    state.circleMessage = item.desc;
  }

  function applyDemoAdder(idx) {
    state.demoAdderIdx = idx;
    const item = DEMO8_ADDER[idx];
    state.adderRawA = item.rawA;
    state.adderRawB = item.rawB;
    state.adderInputMode = item.focus;
  }

  function checkCircleStepOverflow(startRaw, delta, bits, mode) {
    if (delta === 0) return false;
    if (mode === 'unsigned') {
      const exact = startRaw + delta;
      return exact < 0 || exact > M.maxUnsigned(bits);
    } else {
      const exact = M.rawToTwos(startRaw, bits) + delta;
      return exact < M.minSigned(bits) || exact > M.maxSigned(bits);
    }
  }

  /* ==================== TAB 1: BITS & CODES ==================== */
  function renderTabBits() {
    const bits = state.bits;
    const demo = isDemo();
    const raw = state.rawBits & M.maskFor(bits);
    const bin = M.toBinary(raw, bits);

    // Demo preset bar or sandbox hint
    const presetContainer = document.getElementById('bits-demo-presets');
    if (demo) {
      presetContainer.style.display = 'block';
      presetContainer.innerHTML =
        '<div style="font-size:0.82rem;font-weight:700;color:#4c1d95;margin-bottom:6px;">Выберите 8-битный демонстрационный пример:</div>' +
        '<div class="preset-strip">' +
        DEMO8_BITS.map(
          (item, idx) =>
            `<button class="preset-btn ${idx === state.demoBitsIdx ? 'active' : ''}" data-demo-bits="${idx}">${item.label}</button>`
        ).join('') +
        '</div>' +
        `<div class="log-box" style="margin-top:8px;">${DEMO8_BITS[state.demoBitsIdx].note}</div>`;

      presetContainer.querySelectorAll('[data-demo-bits]').forEach((btn) => {
        btn.addEventListener('click', () => {
          applyDemoBits(Number(btn.dataset.demoBits));
          renderTabBits();
        });
      });
    } else {
      presetContainer.style.display = 'none';
    }

    // Bit switches
    const bitRow = document.getElementById('bit-switches');
    const weights = M.getBitWeights(raw, bits);
    bitRow.innerHTML = weights
      .map((w) => {
        const signWeightLabel = w.isMSB ? `±${w.unsignedWeight}` : `+${w.unsignedWeight}`;
        return `
          <div class="bit-cell">
            <span class="bit-weight ${w.isMSB ? 'bit-weight--sign' : ''}" title="${w.isMSB ? 'В беззнаковом: +' + w.unsignedWeight + ', в доп. коде: −' + w.unsignedWeight : 'Вес разряда'}">${signWeightLabel}</span>
            <button class="bit-toggle ${w.bit ? 'is-one' : ''} ${w.isMSB ? 'is-sign' : ''}"
                    data-bit-index="${w.index}" ${demo ? 'disabled' : ''}>${w.bit}</button>
            <span class="bit-index">b<sub>${w.index}</sub></span>
          </div>`;
      })
      .join('');

    if (!demo) {
      bitRow.querySelectorAll('.bit-toggle').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.bitIndex);
          state.rawBits = (state.rawBits ^ (1 << idx)) & M.maskFor(bits);
          state.encodeVal = M.rawToTwos(state.rawBits, bits);
          renderTabBits();
        });
      });
    }

    // Quick sandbox buttons
    const quickBar = document.getElementById('bits-quick-controls');
    if (demo) {
      quickBar.style.display = 'none';
    } else {
      quickBar.style.display = 'flex';
      const maxU = M.maxUnsigned(bits);
      const minS = M.minSigned(bits);
      const signBitRaw = M.signBitMask(bits);
      quickBar.innerHTML = `
        <button class="btn" data-set-raw="0">000…0 (0)</button>
        <button class="btn" data-set-raw="${signBitRaw - 1}">011…1 (+${M.maxSigned(bits)})</button>
        <button class="btn" data-set-raw="${signBitRaw}">100…0 (${signBitRaw} / ${minS})</button>
        <button class="btn" data-set-raw="${maxU}">111…1 (${maxU} / −1)</button>
        <button class="btn btn-soft" id="btn-invert-all">Инвертировать все биты</button>
        <button class="btn btn-soft" id="btn-plus-one">+1 (по модулю 2<sup>${bits}</sup>)</button>
      `;
      quickBar.querySelectorAll('[data-set-raw]').forEach((b) => {
        b.addEventListener('click', () => {
          state.rawBits = Number(b.dataset.setRaw);
          state.encodeVal = M.rawToTwos(state.rawBits, bits);
          renderTabBits();
        });
      });
      document.getElementById('btn-invert-all').addEventListener('click', () => {
        state.rawBits = (~state.rawBits) & M.maskFor(bits);
        state.encodeVal = M.rawToTwos(state.rawBits, bits);
        renderTabBits();
      });
      document.getElementById('btn-plus-one').addEventListener('click', () => {
        state.rawBits = (state.rawBits + 1) & M.maskFor(bits);
        state.encodeVal = M.rawToTwos(state.rawBits, bits);
        renderTabBits();
      });
    }

    // 4 interpretations of the exact same bit pattern
    const uVal = M.rawToUnsigned(raw, bits);
    const sm = M.rawToSignMagnitude(raw, bits);
    const ones = M.rawToOnes(raw, bits);
    const twos = M.rawToTwos(raw, bits);

    document.getElementById('interp-unsigned').textContent = String(uVal);
    document.getElementById('interp-unsigned-note').textContent = `Диапазон 0 .. ${M.maxUnsigned(bits)}`;
    document.getElementById('interp-direct').textContent = sm.label;
    document.getElementById('interp-direct-note').textContent = sm.isNegZero
      ? 'Отрицательный ноль!'
      : 'Старший бит = знак';
    document.getElementById('interp-ones').textContent = ones.label;
    document.getElementById('interp-ones-note').textContent = ones.isNegZero
      ? 'Отрицательный ноль!'
      : (raw & M.signBitMask(bits)) ? 'Инверсия всех бит |x|' : 'Как без знака';
    document.getElementById('interp-twos').textContent = twos > 0 ? '+' + twos : String(twos);
    document.getElementById('interp-twos-note').textContent = `Диапазон ${M.minSigned(bits)} .. +${M.maxSigned(bits)}`;

    // Weighted breakdown formulas
    const unsignedTerms = weights.filter((w) => w.bit === 1).map((w) => w.unsignedWeight);
    const signedTerms = weights.filter((w) => w.bit === 1).map((w) => (w.signedWeight < 0 ? `(${w.signedWeight})` : `+${w.signedWeight}`));
    const uFormula = unsignedTerms.length ? unsignedTerms.join(' + ') + ` = ${uVal}` : '0 = 0';
    let sFormula = '0 = 0';
    if (signedTerms.length) {
      sFormula = signedTerms.join(' ').replace(/^\+/, '') + ` = ${twos}`;
    }

    document.getElementById('weight-formulas').innerHTML = `
      <div class="formula-line"><span class="tag">Без знака:</span> ${uFormula}</div>
      <div class="formula-line"><span class="tag">Доп. код (вес b<sub>${bits - 1}</sub> = −${1 << (bits - 1)}):</span> ${sFormula}</div>
    `;

    // Reverse decoding guide (Two's complement -> decimal) whenever MSB = 1
    const decBox = document.getElementById('decode-guide-box');
    if (twos < 0) {
      const invRaw = (~raw) & M.maskFor(bits);
      const invBin = M.formatBinaryGrouped(M.toBinary(invRaw, bits));
      const magRaw = (invRaw + 1) & M.maskFor(bits);
      const magBin = M.formatBinaryGrouped(M.toBinary(magRaw, bits));
      const isMinEdge = twos === M.minSigned(bits);
      decBox.style.display = 'block';
      decBox.innerHTML = `
        <div class="decode-guide-title">Как расшифровать дополнительный код <code>${M.formatBinaryGrouped(bin)}</code> обратно в десятичное число?</div>
        <div class="decode-guide-row"><strong>Способ 1 (обратный ход: инверсия + 1):</strong> старший бит = 1 → число отрицательное. Инвертируем все биты: <code>${invBin}</code>, прибавляем 1 → <code>${magBin}</code>${isMinEdge ? ` (= ${Math.abs(twos)} без знака)` : ` (= ${Math.abs(twos)})`}, ставим «−» → <strong>${twos}</strong>.</div>
        <div class="decode-guide-row"><strong>Способ 2 (через веса разрядов):</strong> старший бит даёт <strong>−${1 << (bits - 1)}</strong>, остальные — с плюсом: <code>${sFormula}</code>.</div>
      `;
    } else {
      decBox.style.display = 'none';
    }

    // Step-by-step negative encoder
    const encCtrl = document.getElementById('encoder-controls');
    const minS = M.minSigned(bits);
    const maxS = M.maxSigned(bits);
    if (demo) {
      encCtrl.innerHTML = `<span style="font-size:0.86rem;color:var(--muted);">Показаны шаги для выбранного 8-битного демо-числа: <strong style="color:var(--text);font-family:var(--mono);">${state.encodeVal}</strong></span>`;
    } else {
      encCtrl.innerHTML = `
        <label style="font-size:0.86rem;font-weight:600;">Десятичное число (${minS} .. +${maxS}):</label>
        <input type="number" class="num-input" id="encode-num-input" min="${minS}" max="${maxS}" value="${state.encodeVal}" />
        <button class="btn" id="enc-minus">−1</button>
        <button class="btn" id="enc-plus">+1</button>
        <button class="btn btn-soft" id="enc-neg-sample">Пример −${bits === 4 ? 5 : 11}</button>
        <button class="btn btn-soft" id="enc-min-edge">Граница ${minS}</button>
      `;
      const inputEl = document.getElementById('encode-num-input');
      inputEl.addEventListener('change', () => {
        let v = parseInt(inputEl.value, 10);
        if (isNaN(v)) v = 0;
        v = Math.max(minS, Math.min(maxS, v));
        state.encodeVal = v;
        state.rawBits = M.signedToRawTwos(v, bits);
        renderTabBits();
      });
      document.getElementById('enc-minus').addEventListener('click', () => {
        state.encodeVal = Math.max(minS, state.encodeVal - 1);
        state.rawBits = M.signedToRawTwos(state.encodeVal, bits);
        renderTabBits();
      });
      document.getElementById('enc-plus').addEventListener('click', () => {
        state.encodeVal = Math.min(maxS, state.encodeVal + 1);
        state.rawBits = M.signedToRawTwos(state.encodeVal, bits);
        renderTabBits();
      });
      document.getElementById('enc-neg-sample').addEventListener('click', () => {
        state.encodeVal = bits === 4 ? -5 : -11;
        state.rawBits = M.signedToRawTwos(state.encodeVal, bits);
        renderTabBits();
      });
      document.getElementById('enc-min-edge').addEventListener('click', () => {
        state.encodeVal = minS;
        state.rawBits = M.signedToRawTwos(minS, bits);
        renderTabBits();
      });
    }

    const steps = M.encodeSignedSteps(state.encodeVal, bits);
    const stepsEl = document.getElementById('encoder-steps');
    if (!steps.isNegative) {
      stepsEl.innerHTML = `
        <div class="step-row step-row--highlight">
          <div class="step-name">Неотрицательное число (${steps.val})</div>
          <div class="step-desc">Старший бит равен 0; прямой, обратный и дополнительный коды совпадают.</div>
          <div class="step-bits">${formatWithSignHighlight(steps.twosBin)}</div>
        </div>`;
    } else if (steps.isMinEdge) {
      stepsEl.innerHTML = `
        <div class="step-row">
          <div class="step-name">Особый случай: ${steps.val}</div>
          <div class="step-desc">Модуль |${steps.val}| = ${Math.abs(steps.val)} не помещается в ${bits - 1} бит без знака, поэтому в прямом и обратном кодах этого числа нет.</div>
          <div class="step-bits">—</div>
        </div>
        <div class="step-row step-row--highlight">
          <div class="step-name">Дополнительный код</div>
          <div class="step-desc">Освободившийся код «−0» используется для хранения ${steps.val} (вес старшего бита = ${steps.val}).</div>
          <div class="step-bits">${formatWithSignHighlight(steps.twosBin)}</div>
        </div>`;
    } else {
      stepsEl.innerHTML = `
        <div class="step-row">
          <div class="step-name">1. Модуль |${steps.val}| = ${Math.abs(steps.val)}</div>
          <div class="step-desc">Записываем положительное число в ${bits} битах.</div>
          <div class="step-bits">${formatWithSignHighlight(steps.magnitudeBin)}</div>
        </div>
        <div class="step-row">
          <div class="step-name">2. Прямой код (ПК)</div>
          <div class="step-desc">Меняем старший (знаковый) бит на 1, остальные биты — модуль числа.</div>
          <div class="step-bits">${formatWithSignHighlight(steps.directBin)}</div>
        </div>
        <div class="step-row">
          <div class="step-name">3. Обратный код (ОК)</div>
          <div class="step-desc">Инвертируем все биты модуля (или все биты числа |x|).</div>
          <div class="step-bits">${formatWithSignHighlight(steps.onesBin)}</div>
        </div>
        <div class="step-row step-row--highlight">
          <div class="step-name">4. Дополнительный код (ДК)</div>
          <div class="step-desc">Прибавляем 1 к обратному коду: ОК + 1.</div>
          <div class="step-bits">${formatWithSignHighlight(steps.twosBin)}</div>
        </div>`;
    }

    // Zero comparison table
    const zeroTableBody = document.getElementById('zero-table-body');
    const zPos = M.formatBinaryGrouped(M.toBinary(0, bits));
    const zNegDirect = M.formatBinaryGrouped(M.toBinary(M.signBitMask(bits), bits));
    const zNegOnes = M.formatBinaryGrouped(M.toBinary(M.maxUnsigned(bits), bits));
    zeroTableBody.innerHTML = `
      <tr>
        <td><strong>Прямой код</strong></td>
        <td class="mono">${zPos}</td>
        <td class="mono" style="color:var(--red);">${zNegDirect}</td>
        <td>Два нуля; диапазон ${-(M.maxSigned(bits))} .. +${M.maxSigned(bits)}</td>
      </tr>
      <tr>
        <td><strong>Обратный код</strong></td>
        <td class="mono">${zPos}</td>
        <td class="mono" style="color:var(--red);">${zNegOnes}</td>
        <td>Два нуля; диапазон ${-(M.maxSigned(bits))} .. +${M.maxSigned(bits)}</td>
      </tr>
      <tr style="background:var(--purple-soft);">
        <td><strong>Дополнительный код</strong></td>
        <td class="mono">${zPos}</td>
        <td><em>Нет!</em> (код ${zNegDirect} = <strong>${M.minSigned(bits)}</strong>)</td>
        <td>Один ноль; диапазон <strong>${M.minSigned(bits)} .. +${M.maxSigned(bits)}</strong></td>
      </tr>
    `;
  }

  /* ==================== TAB 2: NUMBER CIRCLE ==================== */
  function stepCircle(delta) {
    const bits = state.bits;
    const total = 1 << bits;
    const startRaw = state.circleRaw;
    const nextRaw = ((startRaw + delta) % total + total) % total;
    const of = checkCircleStepOverflow(startRaw, delta, bits, state.circleMode);

    state.circlePrevRaw = startRaw;
    state.circleDelta = delta;
    state.circleRaw = nextRaw;
    state.circleOverflow = of;

    const startVal = state.circleMode === 'unsigned' ? startRaw : M.rawToTwos(startRaw, bits);
    const exactVal = startVal + delta;
    const resVal = state.circleMode === 'unsigned' ? nextRaw : M.rawToTwos(nextRaw, bits);
    const opStr = delta >= 0 ? `+ ${delta}` : `− ${Math.abs(delta)}`;

    if (of) {
      const seam = state.circleMode === 'unsigned'
        ? `${M.maxUnsigned(bits)} | 0`
        : `+${M.maxSigned(bits)} | ${M.minSigned(bits)}`;
      state.circleMessage = `ПЕРЕПОЛНЕНИЕ! ${startVal} ${opStr} = ${exactVal} (вне диапазона). Стрелка пересекла красную линию (${seam}) и попала в ${resVal} (${M.toBinary(nextRaw, bits)}).`;
    } else {
      state.circleMessage = `Без переполнения: ${startVal} ${opStr} = ${resVal} (${M.toBinary(nextRaw, bits)}). Красная линия не пересечена.`;
    }
    renderTabCircle();
  }

  function renderTabCircle() {
    const bits = state.bits;
    const demo = isDemo();

    // Update mode toggle buttons
    document.querySelectorAll('[data-circle-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.circleMode === state.circleMode);
    });

    // Render SVG circle
    const mount = document.getElementById('circle-mount');
    Circle.render(mount, {
      bits,
      mode: state.circleMode,
      currentRaw: state.circleRaw,
      prevRaw: state.circlePrevRaw,
      stepDelta: state.circleDelta,
      overflow: state.circleOverflow,
      compact: false,
      onSelectRaw: demo
        ? null
        : (raw) => {
            state.circlePrevRaw = null;
            state.circleDelta = 0;
            state.circleRaw = raw;
            state.circleOverflow = false;
            const v = state.circleMode === 'unsigned' ? raw : M.rawToTwos(raw, bits);
            state.circleMessage = `Выбрана позиция ${v} (биты ${M.toBinary(raw, bits)}). Нажмите +1 / −1, чтобы двигаться по окружности.`;
            renderTabCircle();
          }
    });

    // Controls: sandbox vs 8-bit demo
    const ctrl = document.getElementById('circle-controls');
    if (demo) {
      ctrl.innerHTML =
        '<div style="font-size:0.84rem;font-weight:700;color:#4c1d95;margin-bottom:8px;">Выберите 8-битный демонстрационный переход:</div>' +
        '<div class="preset-strip">' +
        DEMO8_CIRCLE.map(
          (item, idx) =>
            `<button class="preset-btn ${idx === state.demoCircleIdx ? 'active' : ''}" data-demo-circle="${idx}">${item.label}</button>`
        ).join('') +
        '</div>';

      ctrl.querySelectorAll('[data-demo-circle]').forEach((btn) => {
        btn.addEventListener('click', () => {
          applyDemoCircle(Number(btn.dataset.demoCircle));
          renderTabCircle();
        });
      });
    } else {
      const bigStep = bits === 4 ? 3 : 5;
      ctrl.innerHTML = `
        <div style="font-size:0.84rem;font-weight:700;margin-bottom:8px;">Сдвиг по окружности:</div>
        <div class="controls-row" style="justify-content:flex-start;margin-top:0;">
          <button class="btn" data-step="${-bigStep}">−${bigStep}</button>
          <button class="btn btn-primary" data-step="-1">−1</button>
          <button class="btn btn-primary" data-step="1">+1</button>
          <button class="btn" data-step="${bigStep}">+${bigStep}</button>
        </div>
        <div style="font-size:0.84rem;font-weight:700;margin:12px 0 6px;">Быстро перейти к границе:</div>
        <div class="preset-strip">
          <button class="preset-btn" data-jump="${M.maxUnsigned(bits)}">Макс. без знака (${M.maxUnsigned(bits)})</button>
          <button class="preset-btn" data-jump="0">Ноль (0)</button>
          <button class="preset-btn" data-jump="${M.maxSigned(bits)}">Макс. со знаком (+${M.maxSigned(bits)})</button>
          <button class="preset-btn" data-jump="${M.signBitMask(bits)}">Мин. со знаком (${M.minSigned(bits)})</button>
        </div>
      `;

      ctrl.querySelectorAll('[data-step]').forEach((b) => {
        b.addEventListener('click', () => stepCircle(Number(b.dataset.step)));
      });
      ctrl.querySelectorAll('[data-jump]').forEach((b) => {
        b.addEventListener('click', () => {
          state.circleRaw = Number(b.dataset.jump);
          state.circlePrevRaw = null;
          state.circleDelta = 0;
          state.circleOverflow = false;
          state.circleMessage = 'Вы у границы разрыва! Попробуйте сделать шаг +1 или −1.';
          renderTabCircle();
        });
      });
    }

    // Status readout & insight
    const logEl = document.getElementById('circle-log');
    logEl.className = 'log-box' + (state.circleOverflow ? ' log-box--alert' : '');
    logEl.textContent = state.circleMessage;

    const uNow = M.rawToUnsigned(state.circleRaw, bits);
    const sNow = M.rawToTwos(state.circleRaw, bits);
    document.getElementById('circle-dual-readout').innerHTML = `
      Текущие биты <strong>${M.formatBinaryGrouped(M.toBinary(state.circleRaw, bits))}</strong>:
      без знака = <strong>${uNow}</strong>, в доп. коде = <strong>${sNow > 0 ? '+' + sNow : sNow}</strong>.
    `;
  }

  /* ==================== TAB 3: ADDER & OVERFLOW ==================== */
  function renderTabAdder() {
    const bits = state.bits;
    const demo = isDemo();
    const res = M.addRaw(state.adderRawA, state.adderRawB, bits);

    // Inputs area (sandbox vs 8-bit demo)
    const inputsEl = document.getElementById('adder-inputs-panel');
    if (demo) {
      inputsEl.innerHTML =
        '<div style="font-size:0.84rem;font-weight:700;color:#4c1d95;margin-bottom:6px;">Выберите 8-битный демонстрационный кейс сложения:</div>' +
        '<div class="preset-strip">' +
        DEMO8_ADDER.map(
          (item, idx) =>
            `<button class="preset-btn ${idx === state.demoAdderIdx ? 'active' : ''}" data-demo-adder="${idx}">${item.label}</button>`
        ).join('') +
        '</div>' +
        `<div class="log-box" style="margin-top:10px;">${DEMO8_ADDER[state.demoAdderIdx].note}</div>`;

      inputsEl.querySelectorAll('[data-demo-adder]').forEach((btn) => {
        btn.addEventListener('click', () => {
          applyDemoAdder(Number(btn.dataset.demoAdder));
          renderTabAdder();
        });
      });
    } else {
      const isSigned = state.adderInputMode === 'signed';
      const minV = isSigned ? M.minSigned(bits) : 0;
      const maxV = isSigned ? M.maxSigned(bits) : M.maxUnsigned(bits);
      const valA = isSigned ? res.signed.a : res.unsigned.a;
      const valB = isSigned ? res.signed.b : res.unsigned.b;

      const presets = bits === 4
        ? [
            { label: '12 + 7 (беззн. переп.)', mode: 'unsigned', a: 12, b: 7 },
            { label: '5 + 4 (знак. + и +)', mode: 'signed', a: 5, b: 4 },
            { label: '(−5) + (−4) (знак. − и −)', mode: 'signed', a: -5, b: -4 },
            { label: '5 + (−3) (перенос без переп.!)', mode: 'signed', a: 5, b: -3 }
          ]
        : [
            { label: '22 + 15 (беззн. переп.)', mode: 'unsigned', a: 22, b: 15 },
            { label: '12 + 7 (знак. + и +)', mode: 'signed', a: 12, b: 7 },
            { label: '(−10) + (−9) (знак. − и −)', mode: 'signed', a: -10, b: -9 },
            { label: '11 + (−6) (перенос без переп.!)', mode: 'signed', a: 11, b: -6 }
          ];

      inputsEl.innerHTML = `
        <div class="adder-inputs">
          <div class="mode-toggle" id="adder-mode-toggle">
            <button class="${!isSigned ? 'active' : ''}" data-amode="unsigned">Ввод без знака (0..${M.maxUnsigned(bits)})</button>
            <button class="${isSigned ? 'active' : ''}" data-amode="signed">Ввод со знаком (${M.minSigned(bits)}..+${M.maxSigned(bits)})</button>
          </div>
          <div class="adder-field">
            <span>A =</span>
            <input type="number" class="num-input" id="adder-a" min="${minV}" max="${maxV}" value="${valA}" />
          </div>
          <div class="adder-field">
            <span>B =</span>
            <input type="number" class="num-input" id="adder-b" min="${minV}" max="${maxV}" value="${valB}" />
          </div>
        </div>
        <div style="font-size:0.8rem;color:var(--muted);margin-bottom:6px;">Быстрые эксперименты:</div>
        <div class="preset-strip">
          ${presets.map((p, i) => `<button class="preset-btn" data-apreset="${i}">${p.label}</button>`).join('')}
        </div>
      `;

      inputsEl.querySelectorAll('[data-amode]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.adderInputMode = btn.dataset.amode;
          renderTabAdder();
        });
      });

      const onInputChange = () => {
        let a = parseInt(document.getElementById('adder-a').value, 10);
        let b = parseInt(document.getElementById('adder-b').value, 10);
        if (isNaN(a)) a = 0;
        if (isNaN(b)) b = 0;
        a = Math.max(minV, Math.min(maxV, a));
        b = Math.max(minV, Math.min(maxV, b));
        state.adderRawA = isSigned ? M.signedToRawTwos(a, bits) : a;
        state.adderRawB = isSigned ? M.signedToRawTwos(b, bits) : b;
        renderTabAdder();
      };
      document.getElementById('adder-a').addEventListener('change', onInputChange);
      document.getElementById('adder-b').addEventListener('change', onInputChange);

      inputsEl.querySelectorAll('[data-apreset]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const p = presets[Number(btn.dataset.apreset)];
          state.adderInputMode = p.mode;
          state.adderRawA = p.mode === 'signed' ? M.signedToRawTwos(p.a, bits) : p.a;
          state.adderRawB = p.mode === 'signed' ? M.signedToRawTwos(p.b, bits) : p.b;
          renderTabAdder();
        });
      });
    }

    // Column binary addition grid
    const colMount = document.getElementById('adder-column');
    const cols = bits + 2; // label + carryOut col + bits cols
    let gridHtml = `<div class="column-grid" style="grid-template-columns: auto repeat(${bits + 1}, 34px);">`;

    // Row 1: Carries
    gridHtml += `<div class="col-cell col-label">переносы</div>`;
    for (let i = 0; i <= bits; i++) {
      const cVal = res.carries[i];
      const isOut = i === 0;
      const isSignIn = i === 1;
      const cls = isOut ? 'col-carry col-carry--out' : 'col-carry';
      const title = isOut
        ? `Перенос из старшего разряда c_${bits} (отбрасывается!)`
        : isSignIn
        ? `Перенос в знаковый разряд c_${bits - 1}`
        : '';
      gridHtml += `<div class="col-cell ${cls} ${cVal ? 'col-carry--active' : ''}" title="${title}">${cVal ? '1' : isOut ? '0' : '·'}</div>`;
    }

    // Row 2: A
    gridHtml += `<div class="col-cell col-label">A</div><div class="col-cell"></div>`;
    for (let i = 0; i < bits; i++) {
      gridHtml += `<div class="col-cell col-bit ${i === 0 ? 'col-bit--sign' : ''}">${res.binA[i]}</div>`;
    }

    // Row 3: B
    gridHtml += `<div class="col-cell col-label">+ B</div><div class="col-cell"></div>`;
    for (let i = 0; i < bits; i++) {
      gridHtml += `<div class="col-cell col-bit ${i === 0 ? 'col-bit--sign' : ''}">${res.binB[i]}</div>`;
    }

    // Separator line spanning all bit columns
    gridHtml += `<div style="grid-column: 1 / span ${cols};" class="col-sep"></div>`;

    // Row 4: Result
    const anyOf = state.adderInputMode === 'unsigned' ? res.unsigned.overflow : res.signed.overflow;
    gridHtml += `<div class="col-cell col-label">Сумма</div>`;
    gridHtml += `<div class="col-cell col-carry col-carry--out" title="Этот бит НЕ помещается в ${bits}-битную сетку">${res.carryOut ? '<s>1</s>' : ''}</div>`;
    for (let i = 0; i < bits; i++) {
      gridHtml += `<div class="col-cell col-bit ${anyOf ? 'col-bit--res-of' : 'col-bit--res'}">${res.binResult[i]}</div>`;
    }

    gridHtml += `</div>`;
    gridHtml += `
      <div style="margin-top:8px;font-size:0.8rem;color:var(--muted);">
        Перенос в старший разряд c<sub>${bits - 1}</sub> = <strong>${res.carryIntoSign}</strong>,
        выпавший перенос c<sub>${bits}</sub> = <strong>${res.carryOut}</strong>.
        ${res.carryOut === 1 && !res.signed.overflow ? '<strong style="color:var(--green);">Выпавший перенос есть, но знакового переполнения нет!</strong>' : ''}
      </div>
    `;
    colMount.innerHTML = gridHtml;

    // Two side-by-side interpretation verdict cards
    const verdictsEl = document.getElementById('adder-verdicts');
    const u = res.unsigned;
    const s = res.signed;

    const uNote = u.overflow
      ? `Сумма ${u.exact} > ${M.maxUnsigned(bits)}: перенос c<sub>${bits}</sub> = 1 отброшен (${u.exact} − ${1 << bits} = ${u.result}).`
      : `Сумма ${u.exact} помещается в 0..${M.maxUnsigned(bits)}, переноса c<sub>${bits}</sub> нет.`;

    let sNote = '';
    if (s.overflow) {
      if (s.a > 0 && s.b > 0) {
        sNote = `Два положительных дали отрицательное (${s.exact} > +${M.maxSigned(bits)}). Пересечена граница +${M.maxSigned(bits)} | ${M.minSigned(bits)}.`;
      } else {
        sNote = `Два отрицательных дали положительное (${s.exact} < ${M.minSigned(bits)}). Пересечена граница ${M.minSigned(bits)} | +${M.maxSigned(bits)}.`;
      }
    } else if (res.carryOut === 1) {
      sNote = `Результат ${s.result} точный! Выпавший перенос c<sub>${bits}</sub> = 1 для знаковых чисел сам по себе НЕ означает переполнение.`;
    } else {
      sNote = `Результат ${s.result} помещается в диапазон ${M.minSigned(bits)}..+${M.maxSigned(bits)}.`;
    }

    verdictsEl.innerHTML = `
      <div class="verdict-card ${u.overflow ? 'verdict-card--of' : 'verdict-card--ok'}">
        <div class="verdict-head">
          <span class="verdict-title">Если числа БЕЗ ЗНАКА</span>
          <span class="badge ${u.overflow ? 'badge--of' : 'badge--ok'}">${u.overflow ? 'Переполнение (CF=1)' : 'Ок (CF=0)'}</span>
        </div>
        <div class="verdict-math">${u.a} + ${u.b} → в сетке: ${u.result} ${u.overflow ? `(точно: ${u.exact})` : ''}</div>
        <div class="verdict-note">${uNote}</div>
      </div>

      <div class="verdict-card ${s.overflow ? 'verdict-card--of' : 'verdict-card--ok'}">
        <div class="verdict-head">
          <span class="verdict-title">Если числа СО ЗНАКОМ (доп. код)</span>
          <span class="badge ${s.overflow ? 'badge--of' : 'badge--ok'}">${s.overflow ? 'Переполнение (OF=1)' : 'Ок (OF=0)'}</span>
        </div>
        <div class="verdict-math">(${s.a}) + (${s.b}) → в сетке: ${s.result > 0 ? '+' + s.result : s.result} ${s.overflow ? `(точно: ${s.exact})` : ''}</div>
        <div class="verdict-note">${sNote}</div>
      </div>
    `;

    // Compact circle showing the addition step
    const adderCircleMode = state.adderInputMode;
    const stepDelta = adderCircleMode === 'unsigned' ? res.unsigned.b : res.signed.b;
    const circleOf = adderCircleMode === 'unsigned' ? res.unsigned.overflow : res.signed.overflow;
    Circle.render(document.getElementById('adder-circle-mount'), {
      bits,
      mode: adderCircleMode,
      currentRaw: res.resultRaw,
      prevRaw: res.rawA,
      stepDelta,
      overflow: circleOf,
      compact: true,
      onSelectRaw: null
    });

    document.getElementById('adder-circle-caption').textContent =
      adderCircleMode === 'unsigned'
        ? `Окружность без знака: старт ${res.unsigned.a}, шаг +${res.unsigned.b} → ${res.unsigned.result}`
        : `Окружность со знаком: старт ${res.signed.a}, шаг ${res.signed.b >= 0 ? '+' + res.signed.b : res.signed.b} → ${res.signed.result}`;
  }

  function renderAll() {
    // Update bit-width buttons
    document.querySelectorAll('[data-bits]').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.bits) === state.bits);
    });

    // Demo banner
    const banner = document.getElementById('demo-banner');
    banner.style.display = isDemo() ? 'flex' : 'none';

    // Update tabs
    document.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === state.activeTab);
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === 'panel-' + state.activeTab);
    });

    renderTabBits();
    renderTabCircle();
    renderTabAdder();
  }

  function init() {
    document.querySelectorAll('[data-bits]').forEach((btn) => {
      btn.addEventListener('click', () => setBits(Number(btn.dataset.bits)));
    });

    document.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeTab = btn.dataset.tab;
        renderAll();
      });
    });

    document.querySelectorAll('[data-circle-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.circleMode = btn.dataset.circleMode;
        if (state.circlePrevRaw !== null && state.circleDelta) {
          state.circleOverflow = checkCircleStepOverflow(
            state.circlePrevRaw,
            state.circleDelta,
            state.bits,
            state.circleMode
          );
        } else {
          state.circleOverflow = false;
        }
        renderTabCircle();
      });
    });

    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
