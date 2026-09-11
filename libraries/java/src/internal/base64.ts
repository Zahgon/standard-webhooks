/**
 * Strict Base64 decoding matching `java.util.Base64.getDecoder()`.
 *
 * Node's `Buffer.from(s, "base64")` is deliberately lenient: it silently skips
 * characters outside the alphabet, so `Buffer.from("!!!!", "base64")` yields an
 * empty buffer rather than failing. The original library relies on the JDK
 * decoder rejecting malformed secrets, so that strictness is part of the
 * observable contract and is reimplemented here.
 *
 * Encoding needs no shim: `Buffer.toString("base64")` already produces the
 * standard alphabet with `=` padding, exactly like `Base64.getEncoder()`.
 *
 * This is a direct transcription of the JDK's `Decoder.outLength` and
 * `Decoder.decode0`, not a re-derivation. Which of the four rejection messages
 * applies depends on how far into the current four-character group the decoder
 * has advanced when it meets padding — the `shiftto` cursor below — and a
 * shim that merely counts padding characters picks the wrong message for
 * inputs such as `A===`, `AA=A` and `YWJj====`.
 *
 * Note that `Base64.getDecoder().decode(String)` first encodes its argument as
 * ISO-8859-1 bytes, mapping anything above U+00FF to `?`, and then reports the
 * offending byte as a *signed* value. That is why a secret ending in `é`
 * (U+00E9) is rejected as character `-17` rather than `e9`.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const PAD = 0x3d; // '='
const QUESTION_MARK = 0x3f; // ISO-8859-1 fallback for unmappable characters

/** Marker values used by the JDK's `fromBase64` table. */
const ILLEGAL = -1;
const PADDING = -2;

/**
 * The bytes `Base64.getDecoder().decode(String)` actually decodes: the string
 * encoded as ISO-8859-1, where every code point above U+00FF is replaced by a
 * single `?`.
 *
 * Iteration is by **code point**, so an astral character such as an emoji —
 * two UTF-16 units in JavaScript, one unmappable character to Java's encoder —
 * yields one `?` byte rather than two. That single byte is what makes `"😀"`
 * fail the length check below rather than the character check.
 */
function iso88591Bytes(input: string): Uint8Array {
	const bytes: number[] = [];
	for (const character of input) {
		// Iteration is by code point, so `character` is a whole astral
		// character where applicable; its first UTF-16 unit is then a high
		// surrogate, already above 0xFF and so mapped to "?" like any other
		// unmappable character — one byte, not two.
		const code = character.charCodeAt(0);
		bytes.push(code <= 0xff ? code : QUESTION_MARK);
	}
	return Uint8Array.from(bytes);
}

/** Render a byte the way `Integer.toString(byte, 16)` does — signed. */
function signedHex(byte: number): string {
	return (byte > 0x7f ? byte - 0x100 : byte).toString(16);
}

/** The JDK's `fromBase64` table: value, or {@link ILLEGAL} / {@link PADDING}. */
const DECODE_TABLE: Int8Array = (() => {
	const table = new Int8Array(256).fill(ILLEGAL);
	for (let i = 0; i < ALPHABET.length; i++) {
		table[ALPHABET.charCodeAt(i)] = i;
	}
	table[PAD] = PADDING;
	return table;
})();

/** Thrown for input the JDK decoder would reject with `IllegalArgumentException`. */
export class IllegalBase64CharacterError extends TypeError {
	constructor(message: string) {
		super(message);
		this.name = "IllegalBase64CharacterError";
		Object.setPrototypeOf(this, IllegalBase64CharacterError.prototype);
	}
}

/**
 * Decode standard (RFC 4648 §4) Base64, rejecting anything the JDK rejects.
 *
 * Accepts input with or without `=` padding, mirroring the JDK decoder, but
 * rejects illegal characters, characters after padding, a malformed
 * four-character ending group, and a trailing group holding only a single
 * character.
 */
export function decodeBase64(input: string): Uint8Array {
	const src = iso88591Bytes(input);
	const sl = src.length;

	// `outLength` runs before any character is inspected: it returns early for
	// empty input and rejects a single byte on length alone. That ordering is
	// why "é" is rejected for its length, not its content.
	if (sl === 0) {
		return new Uint8Array(0);
	}
	if (sl < 2) {
		throw new IllegalBase64CharacterError(
			"Input byte[] should at least have 2 bytes for base64 bytes",
		);
	}

	const dst = new Uint8Array(Math.ceil(sl / 4) * 3);

	let sp = 0;
	let dp = 0;
	let bits = 0;
	let shiftto = 18; // position of the first byte of the four-byte atom

	while (sp < sl) {
		const byte = src[sp] ?? 0;
		sp++;
		const value = DECODE_TABLE[byte] ?? ILLEGAL;

		if (value < 0) {
			if (value === PADDING) {
				// shiftto === 18 -> padding where a group should start
				// shiftto === 12 -> a dangling single character, caught below
				// shiftto === 6  -> "xx=" must be followed by exactly one more "="
				if ((shiftto === 6 && (sp === sl || src[sp++] !== PAD)) || shiftto === 18) {
					throw new IllegalBase64CharacterError(
						"Input byte array has wrong 4-byte ending unit",
					);
				}
				break;
			}
			throw new IllegalBase64CharacterError(`Illegal base64 character ${signedHex(byte)}`);
		}

		bits |= value << shiftto;
		shiftto -= 6;

		if (shiftto < 0) {
			dst[dp++] = (bits >> 16) & 0xff;
			dst[dp++] = (bits >> 8) & 0xff;
			dst[dp++] = bits & 0xff;
			shiftto = 18;
			bits = 0;
		}
	}

	// Reached the end of the input, or broke out on padding.
	if (shiftto === 6) {
		dst[dp++] = (bits >> 16) & 0xff;
	} else if (shiftto === 0) {
		dst[dp++] = (bits >> 16) & 0xff;
		dst[dp++] = (bits >> 8) & 0xff;
	} else if (shiftto === 12) {
		throw new IllegalBase64CharacterError("Last unit does not have enough valid bits");
	}

	// Anything left after the padding group is invalid. The JDK reports the
	// cursor without advancing it further.
	if (sp < sl) {
		throw new IllegalBase64CharacterError(
			`Input byte array has incorrect ending byte at ${String(sp)}`,
		);
	}

	return dst.subarray(0, dp);
}

/** Encode bytes as standard Base64 with `=` padding, like `Base64.getEncoder()`. */
export function encodeBase64(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("base64");
}
