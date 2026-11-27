/* Core integer encoding & arithmetic engine (4-bit, 5-bit, 8-bit) */
(function (global) {
  'use strict';

  const IntLab = (global.IntLab = global.IntLab || {});

  function maskFor(bits) {
    return (1 << bits) - 1;
  }

  function signBitMask(bits) {
    return 1 << (bits - 1);
  }

  function maxUnsigned(bits) {
    return (1 << bits) - 1;
  }

  function minSigned(bits) {
    return -(1 << (bits - 1));
  }

  function maxSigned(bits) {
    return (1 << (bits - 1)) - 1;
  }

  function toBinary(raw, bits) {
    const v = ((raw % (1 << bits)) + (1 << bits)) & maskFor(bits);
    return v.toString(2).padStart(bits, '0');
  }

  function fromBinary(binStr) {
    return parseInt(binStr, 2);
  }

  function formatBinaryGrouped(binStr) {
    if (binStr.length === 8) {
      return binStr.slice(0, 4) + ' ' + binStr.slice(4);
    }
    return binStr;
  }

  function rawToUnsigned(raw, bits) {
    return raw & maskFor(bits);
  }

  function rawToTwos(raw, bits) {
    const u = raw & maskFor(bits);
    const sign = signBitMask(bits);
    return (u & sign) ? u - (1 << bits) : u;
  }

  function rawToSignMagnitude(raw, bits) {
    const u = raw & maskFor(bits);
    const sign = signBitMask(bits);
    const mag = u & (sign - 1);
    if (u & sign) {
      return { value: -mag, isNegZero: mag === 0, label: mag === 0 ? '-0' : String(-mag) };
    }
    return { value: mag, isNegZero: false, label: mag === 0 ? '+0' : '+' + mag };
  }

  function rawToOnes(raw, bits) {
    const u = raw & maskFor(bits);
    const sign = signBitMask(bits);
    if (u & sign) {
      const inv = (~u) & maskFor(bits);
      return { value: -inv, isNegZero: inv === 0, label: inv === 0 ? '-0' : String(-inv) };
    }
    return { value: u, isNegZero: false, label: u === 0 ? '+0' : '+' + u };
  }

  function signedToRawTwos(val, bits) {
    return ((val % (1 << bits)) + (1 << bits)) & maskFor(bits);
  }

  /**
   * Build step-by-step encoding for a signed value in [-(2^(n-1)), 2^(n-1)-1].
   * Handles both regular negative numbers (e.g. -5) and the edge case -2^(n-1) (e.g. -8, -128).
   */
  function encodeSignedSteps(val, bits) {
    const minS = minSigned(bits);
    const maxS = maxSigned(bits);
    if (val < minS || val > maxS) {
      return null;
    }

    const rawTwos = signedToRawTwos(val, bits);
    const twosBin = toBinary(rawTwos, bits);

    if (val >= 0) {
      const bin = toBinary(val, bits);
      return {
        val,
        bits,
        isNegative: false,
        isMinEdge: false,
        magnitudeBin: bin,
        directBin: bin,
        onesBin: bin,
        twosBin: bin,
        rawTwos: val
      };
    }

    if (val === minS) {
      return {
        val,
        bits,
        isNegative: true,
        isMinEdge: true,
        magnitudeBin: null,
        directBin: null,
        onesBin: null,
        twosBin,
        rawTwos
      };
    }

    const absVal = Math.abs(val);
    const magnitudeBin = toBinary(absVal, bits);
    const directRaw = signBitMask(bits) | absVal;
    const directBin = toBinary(directRaw, bits);
    const onesRaw = (~absVal) & maskFor(bits);
    const onesBin = toBinary(onesRaw, bits);

    return {
      val,
      bits,
      isNegative: true,
      isMinEdge: false,
      magnitudeBin,
      directBin,
      onesBin,
      twosBin,
      rawTwos
    };
  }

  /**
   * Perform n-bit binary addition of two raw bit patterns (0 .. 2^bits - 1).
   * Returns full carry chain, result raw value, and both unsigned & signed interpretations.
   */
  function addRaw(rawA, rawB, bits) {
    const a = rawA & maskFor(bits);
    const b = rawB & maskFor(bits);
    const carries = new Array(bits + 1).fill(0);
    const sumBits = new Array(bits).fill(0);

    let c = 0;
    for (let i = 0; i < bits; i++) {
      const bitA = (a >> i) & 1;
      const bitB = (b >> i) & 1;
      const s = bitA + bitB + c;
      sumBits[bits - 1 - i] = s & 1;
      c = s >> 1;
      carries[bits - 1 - i] = c; // carries[0] is carry-out from MSB (c_n)
    }

    const resultRaw = (a + b) & maskFor(bits);
    const carryOut = carries[0]; // c_n
    const carryIntoSign = carries[1]; // c_{n-1}

    const unsignedA = a;
    const unsignedB = b;
    const unsignedExact = unsignedA + unsignedB;
    const unsignedResult = resultRaw;
    const unsignedOverflow = carryOut === 1;

    const signedA = rawToTwos(a, bits);
    const signedB = rawToTwos(b, bits);
    const signedExact = signedA + signedB;
    const signedResult = rawToTwos(resultRaw, bits);
    const signedOverflow = carryIntoSign !== carryOut;

    return {
      bits,
      rawA: a,
      rawB: b,
      resultRaw,
      binA: toBinary(a, bits),
      binB: toBinary(b, bits),
      binResult: sumBits.join(''),
      carries, // length bits+1: carries[0]=carryOut, carries[1..bits-1]=carry into bit (bits-1..1), carries[bits]=0
      carryOut,
      carryIntoSign,
      unsigned: {
        a: unsignedA,
        b: unsignedB,
        exact: unsignedExact,
        result: unsignedResult,
        overflow: unsignedOverflow
      },
      signed: {
        a: signedA,
        b: signedB,
        exact: signedExact,
        result: signedResult,
        overflow: signedOverflow
      }
    };
  }

  /**
   * Weighted sum breakdown for unsigned and two's complement interpretations.
   */
  function getBitWeights(raw, bits) {
    const u = raw & maskFor(bits);
    const rows = [];
    for (let i = bits - 1; i >= 0; i--) {
      const bit = (u >> i) & 1;
      const power = 1 << i;
      const isMSB = i === bits - 1;
      rows.push({
        index: i,
        bit,
        isMSB,
        unsignedWeight: power,
        signedWeight: isMSB ? -power : power
      });
    }
    return rows;
  }

  IntLab.math = {
    maskFor,
    signBitMask,
    maxUnsigned,
    minSigned,
    maxSigned,
    toBinary,
    fromBinary,
    formatBinaryGrouped,
    rawToUnsigned,
    rawToTwos,
    rawToSignMagnitude,
    rawToOnes,
    signedToRawTwos,
    encodeSignedSteps,
    addRaw,
    getBitWeights
  };
})(window);
