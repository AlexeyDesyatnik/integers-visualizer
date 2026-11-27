/* Interactive SVG Number Circle (Odometer) renderer for 4-bit, 5-bit, and 8-bit demo modes */
(function (global) {
  'use strict';

  const IntLab = (global.IntLab = global.IntLab || {});
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, text) {
    const node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach((k) => node.setAttribute(k, String(attrs[k])));
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  function polar(cx, cy, r, angleDeg) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad)
    };
  }

  function arcPath(cx, cy, r, startDeg, sweepDeg) {
    if (Math.abs(sweepDeg) < 0.01) return '';
    const clampedSweep = Math.max(-359.5, Math.min(359.5, sweepDeg));
    const endDeg = startDeg + clampedSweep;
    const p1 = polar(cx, cy, r, startDeg);
    const p2 = polar(cx, cy, r, endDeg);
    const largeArc = Math.abs(clampedSweep) > 180 ? 1 : 0;
    const sweepFlag = clampedSweep >= 0 ? 1 : 0;
    return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  /**
   * Render a number circle inside container.
   * options:
   *  - bits: 4 | 5 | 8
   *  - mode: 'unsigned' | 'signed'
   *  - currentRaw: number (0 .. 2^bits - 1)
   *  - prevRaw: number | null (for motion arc)
   *  - stepDelta: number | null (signed step taken to reach currentRaw from prevRaw)
   *  - overflow: boolean
   *  - compact: boolean (smaller variant for Adder tab)
   *  - onSelectRaw: function(raw) | null (interactive clicks in 4/5-bit)
   */
  function renderCircle(container, options) {
    const M = IntLab.math;
    const bits = options.bits;
    const mode = options.mode;
    const total = 1 << bits;
    const currentRaw = ((options.currentRaw % total) + total) % total;
    const compact = !!options.compact;

    const size = compact ? 300 : 420;
    const cx = size / 2;
    const cy = size / 2;
    const ringR = compact ? 104 : 146;

    const svg = el('svg', {
      viewBox: `0 0 ${size} ${size}`,
      class: 'circle-svg' + (compact ? ' circle-svg--compact' : '')
    });

    // Subtle background ring
    svg.appendChild(
      el('circle', {
        cx,
        cy,
        r: ringR,
        fill: 'none',
        stroke: '#e2e8f0',
        'stroke-width': compact ? 16 : 22
      })
    );

    // Highlight negative half when in signed mode (bits 2^(n-1) .. 2^n - 1 => angles 180..360)
    if (mode === 'signed') {
      const negHalfPath = arcPath(cx, cy, ringR, 180, 180);
      svg.appendChild(
        el('path', {
          d: negHalfPath,
          fill: 'none',
          stroke: '#fee2e2',
          'stroke-width': compact ? 16 : 22
        })
      );
      const posHalfPath = arcPath(cx, cy, ringR, 0, 180);
      svg.appendChild(
        el('path', {
          d: posHalfPath,
          fill: 'none',
          stroke: '#e0f2fe',
          'stroke-width': compact ? 16 : 22
        })
      );
    }

    // Angle mapping: raw 0 sits just clockwise of 12 o'clock seam so the seam sits cleanly at 0 deg (12 o'clock)
    // and signed seam sits cleanly at 180 deg (6 o'clock)!
    const stepDeg = 360 / total;
    function angleForRaw(raw) {
      return (raw + 0.5) * stepDeg;
    }

    // Draw motion arc if stepDelta is present and non-zero
    if (options.prevRaw !== null && options.prevRaw !== undefined && options.stepDelta) {
      const startDeg = angleForRaw(((options.prevRaw % total) + total) % total);
      const sweepDeg = options.stepDelta * stepDeg;
      const arcR = ringR - (compact ? 16 : 22);
      const pathD = arcPath(cx, cy, arcR, startDeg, sweepDeg);
      if (pathD) {
        svg.appendChild(
          el('path', {
            d: pathD,
            fill: 'none',
            stroke: options.overflow ? '#dc2626' : '#2563eb',
            'stroke-width': compact ? 4 : 5,
            'stroke-linecap': 'round',
            'stroke-dasharray': options.overflow ? '6 4' : 'none'
          })
        );
      }
      // Small start dot
      const pStart = polar(cx, cy, arcR, startDeg);
      svg.appendChild(
        el('circle', {
          cx: pStart.x,
          cy: pStart.y,
          r: compact ? 3.5 : 4.5,
          fill: '#64748b'
        })
      );
    }

    // Draw red overflow seam line!
    // Unsigned seam: 0 deg (12 o'clock, between 2^n-1 and 0)
    // Signed seam: 180 deg (6 o'clock, between 2^(n-1)-1 and -2^(n-1))
    const seamDeg = mode === 'unsigned' ? 0 : 180;
    const seamInner = polar(cx, cy, ringR - (compact ? 22 : 28), seamDeg);
    const seamOuter = polar(cx, cy, ringR + (compact ? 24 : 32), seamDeg);
    svg.appendChild(
      el('line', {
        x1: seamInner.x,
        y1: seamInner.y,
        x2: seamOuter.x,
        y2: seamOuter.y,
        stroke: '#dc2626',
        'stroke-width': 3,
        'stroke-dasharray': '5 3'
      })
    );

    // Seam badge label
    const seamLabelPos = polar(cx, cy, ringR + (compact ? 35 : 47), seamDeg);
    const seamText = mode === 'unsigned'
      ? `Разрыв ${M.maxUnsigned(bits)} | 0`
      : `Разрыв +${M.maxSigned(bits)} | ${M.minSigned(bits)}`;
    svg.appendChild(
      el(
        'text',
        {
          x: seamLabelPos.x,
          y: seamLabelPos.y + (seamDeg === 0 ? 2 : 5),
          'text-anchor': 'middle',
          class: 'circle-seam-label'
        },
        seamText
      )
    );

    // Ticks & labels
    if (bits <= 5) {
      for (let r = 0; r < total; r++) {
        const deg = angleForRaw(r);
        const isCurrent = r === currentRaw;
        const val = mode === 'unsigned' ? r : M.rawToTwos(r, bits);
        const valStr = mode === 'signed' && val > 0 ? '+' + val : String(val);
        const binStr = M.toBinary(r, bits);

        const dotPos = polar(cx, cy, ringR, deg);
        const outerR = ringR + (compact ? 20 : bits === 4 ? 26 : 24);
        const innerR = ringR - (compact ? 20 : bits === 4 ? 30 : 24);
        const labelPos = polar(cx, cy, outerR, deg);
        const binPos = polar(cx, cy, innerR, deg);

        const group = el('g', {
          class: 'circle-node' + (isCurrent ? ' circle-node--active' : '') + (options.onSelectRaw ? ' circle-node--clickable' : '')
        });

        if (options.onSelectRaw) {
          group.addEventListener('click', () => options.onSelectRaw(r));
        }

        // Tick dot
        group.appendChild(
          el('circle', {
            cx: dotPos.x,
            cy: dotPos.y,
            r: isCurrent ? (compact ? 6.5 : 8) : (bits === 4 ? 4 : 3),
            fill: isCurrent
              ? (options.overflow ? '#dc2626' : '#2563eb')
              : (mode === 'signed' && val < 0 ? '#ef4444' : '#475569')
          })
        );

        // Decimal label on outside
        const showDec = !compact || bits === 4 || r % 2 === 0 || isCurrent;
        if (showDec) {
          group.appendChild(
            el(
              'text',
              {
                x: labelPos.x,
                y: labelPos.y + 4,
                'text-anchor': 'middle',
                class: 'circle-dec-label' + (isCurrent ? ' circle-dec-label--active' : '') + (bits === 5 ? ' circle-dec-label--sm' : '')
              },
              valStr
            )
          );
        }

        // Binary label on inside (4-bit always in non-compact; 5-bit for key ticks & current)
        const showBin = !compact && (bits === 4 || isCurrent || r % 4 === 0 || r === total - 1 || r === (total >> 1) - 1);
        if (showBin) {
          group.appendChild(
            el(
              'text',
              {
                x: binPos.x,
                y: binPos.y + 3,
                'text-anchor': 'middle',
                class: 'circle-bin-label' + (isCurrent ? ' circle-bin-label--active' : '')
              },
              binStr
            )
          );
        }

        svg.appendChild(group);
      }
    } else {
      // 8-bit demo ring: 16 major landmarks around circle + exact currentRaw marker
      const landmarks = [0, 32, 64, 96, 127, 128, 160, 192, 224, 255];
      // Minor ticks every 8
      for (let r = 0; r < 256; r += 8) {
        const deg = angleForRaw(r);
        const p1 = polar(cx, cy, ringR - 6, deg);
        const p2 = polar(cx, cy, ringR + 6, deg);
        svg.appendChild(
          el('line', {
            x1: p1.x,
            y1: p1.y,
            x2: p2.x,
            y2: p2.y,
            stroke: '#94a3b8',
            'stroke-width': r % 32 === 0 ? 2 : 1
          })
        );
      }

      landmarks.forEach((r) => {
        const deg = angleForRaw(r);
        // Slightly nudge 127/128 and 255/0 apart visually so labels don't collide
        let labelDeg = deg;
        if (r === 0) labelDeg = 8;
        if (r === 255) labelDeg = 352;
        if (r === 127) labelDeg = 171;
        if (r === 128) labelDeg = 189;

        const val = mode === 'unsigned' ? r : M.rawToTwos(r, 8);
        const valStr = mode === 'signed' && val > 0 ? '+' + val : String(val);
        const lp = polar(cx, cy, ringR + (compact ? 22 : 27), labelDeg);
        svg.appendChild(
          el(
            'text',
            {
              x: lp.x,
              y: lp.y + 4,
              'text-anchor': 'middle',
              class: 'circle-dec-label circle-dec-label--sm'
            },
            valStr
          )
        );
      });

      // Exact marker for currentRaw
      const curDeg = angleForRaw(currentRaw);
      const curPos = polar(cx, cy, ringR, curDeg);
      svg.appendChild(
        el('circle', {
          cx: curPos.x,
          cy: curPos.y,
          r: compact ? 7 : 9,
          fill: options.overflow ? '#dc2626' : '#2563eb',
          stroke: '#ffffff',
          'stroke-width': 2.5
        })
      );
    }

    // Pointer hand from center toward currentRaw
    const handDeg = angleForRaw(currentRaw);
    const handTip = polar(cx, cy, ringR - (compact ? 12 : 16), handDeg);
    const handStart = polar(cx, cy, compact ? 42 : 58, handDeg);
    svg.appendChild(
      el('line', {
        x1: handStart.x,
        y1: handStart.y,
        x2: handTip.x,
        y2: handTip.y,
        stroke: options.overflow ? '#dc2626' : '#2563eb',
        'stroke-width': compact ? 2.5 : 3.5,
        'stroke-linecap': 'round'
      })
    );

    // Center readout plate
    const centerR = compact ? 44 : 62;
    svg.appendChild(
      el('circle', {
        cx,
        cy,
        r: centerR,
        fill: options.overflow ? '#fef2f2' : '#ffffff',
        stroke: options.overflow ? '#dc2626' : '#cbd5e1',
        'stroke-width': 2
      })
    );

    const curVal = mode === 'unsigned' ? currentRaw : M.rawToTwos(currentRaw, bits);
    const curValStr = mode === 'signed' && curVal > 0 ? '+' + curVal : String(curVal);
    const curBin = M.formatBinaryGrouped(M.toBinary(currentRaw, bits));

    svg.appendChild(
      el(
        'text',
        {
          x: cx,
          y: cy - (compact ? 2 : 5),
          'text-anchor': 'middle',
          class: 'circle-center-val' + (compact ? ' circle-center-val--compact' : '') + (options.overflow ? ' circle-center-val--overflow' : '')
        },
        curValStr
      )
    );

    svg.appendChild(
      el(
        'text',
        {
          x: cx,
          y: cy + (compact ? 14 : 18),
          'text-anchor': 'middle',
          class: 'circle-center-bin' + (compact ? ' circle-center-bin--compact' : '')
        },
        curBin
      )
    );

    if (options.overflow) {
      svg.appendChild(
        el(
          'text',
          {
            x: cx,
            y: cy + (compact ? 28 : 36),
            'text-anchor': 'middle',
            class: 'circle-center-alert'
          },
          'ПЕРЕПОЛНЕНИЕ!'
        )
      );
    }

    container.innerHTML = '';
    container.appendChild(svg);
  }

  IntLab.circle = {
    render: renderCircle
  };
})(window);
