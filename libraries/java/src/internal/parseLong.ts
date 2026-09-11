/**
 * Strict signed 64-bit integer parsing matching `java.lang.Long.parseLong`.
 *
 * JavaScript's own conversions are unsuitable in both directions: `parseInt`
 * stops at the first non-digit (so `"123abc"` yields `123` instead of
 * failing), while `Number` accepts whitespace, hex, exponents and `Infinity`.
 * Both would let malformed timestamp headers through that the original library
 * rejects with `Invalid Signature Headers`.
 *
 * The result is a `bigint` so the full signed 64-bit range stays exact;
 * `number` would silently lose precision beyond 2^53.
 *
 * Digits are recognised the way `Character.digit(char, 10)` does, which accepts
 * **any** Unicode decimal digit and not just `0`–`9`: a `webhook-timestamp` of
 * `１６１４２６５３３０` in fullwidth digits parses on the original exactly as
 * its ASCII spelling would. Restricting this to ASCII would reject webhooks the
 * original accepts.
 */

const MIN_LONG = -(2n ** 63n);
const MAX_LONG = 2n ** 63n - 1n;

/** Unicode decimal digits, the character class `Character.digit` draws from. */
const DECIMAL_DIGIT = /\p{Nd}/u;

/** Thrown where the JDK would throw `NumberFormatException`. */
export class NumberFormatError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NumberFormatError";
		Object.setPrototypeOf(this, NumberFormatError.prototype);
	}
}

/**
 * The value of a single UTF-16 code unit as `Character.digit(ch, 10)` sees it,
 * or `-1` when it is not a decimal digit.
 *
 * Unicode lays decimal digits out in contiguous runs of ten, zero first, so a
 * digit's value is its distance from the start of its own run. Walking back at
 * most nine places to find that start covers every run in the Basic
 * Multilingual Plane. Supplementary digits are deliberately not reached: the
 * original calls the `char` overload, which cannot decode a surrogate pair and
 * answers `-1` for either half.
 */
function digitValue(code: number): number {
	const character = String.fromCharCode(code);
	if (!DECIMAL_DIGIT.test(character)) {
		return -1;
	}

	// No decimal digit sits below U+0030, so `zero - 1` is always in range.
	let zero = code;
	while (code - zero < 9 && DECIMAL_DIGIT.test(String.fromCharCode(zero - 1))) {
		zero--;
	}

	const value = code - zero;
	return value <= 9 ? value : -1;
}

/**
 * Parse a base-10 signed 64-bit integer.
 *
 * Accepts an optional leading `+` or `-` followed by at least one decimal
 * digit, and nothing else — no whitespace, no radix prefix, no separators.
 * Values outside the signed 64-bit range are rejected, as in the JDK.
 */
export function parseLong(value: string): bigint {
	const length = value.length;
	if (length === 0) {
		throw new NumberFormatError(`For input string: "${value}"`);
	}

	let index = 0;
	let negative = false;

	// The JDK tests `firstChar < '0'` before looking for a sign, so only
	// characters below U+0030 can be one: a fullwidth `＋` is not a sign.
	const firstChar = value.charCodeAt(0);
	if (firstChar < 0x30) {
		if (firstChar === 0x2d) {
			negative = true;
		} else if (firstChar !== 0x2b) {
			throw new NumberFormatError(`For input string: "${value}"`);
		}
		if (length === 1) {
			throw new NumberFormatError(`For input string: "${value}"`);
		}
		index = 1;
	}

	let magnitude = 0n;
	for (; index < length; index++) {
		const digit = digitValue(value.charCodeAt(index));
		if (digit < 0) {
			throw new NumberFormatError(`For input string: "${value}"`);
		}
		magnitude = magnitude * 10n + BigInt(digit);
	}

	const result = negative ? -magnitude : magnitude;
	if (result < MIN_LONG || result > MAX_LONG) {
		throw new NumberFormatError(`For input string: "${value}"`);
	}

	return result;
}
