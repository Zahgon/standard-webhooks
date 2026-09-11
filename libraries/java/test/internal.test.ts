import { describe, expect, it } from "vitest";

import {
	Webhook,
	EmptyWebhookSecretException,
	WebhookSigningException,
	WebhookVerificationException,
} from "../src/index";
import { decodeBase64, encodeBase64, IllegalBase64CharacterError } from "../src/internal/base64";
import { constantTimeEqual } from "../src/internal/constantTimeEqual";
import { getFirstHeader } from "../src/internal/headers";
import { NumberFormatError, parseLong } from "../src/internal/parseLong";
import { TestScenario } from "./testScenario";

/**
 * Behaviour the original delegated to the Java standard library and that this
 * port now implements itself. It was covered by the JDK's own test suite
 * before; here it needs tests of its own.
 */

describe("decodeBase64 — java.util.Base64.getDecoder() semantics", () => {
	it("decodes the library's default secret to the same 24 bytes", () => {
		const decoded = decodeBase64("MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw");
		expect(decoded.length).toEqual(24);
		expect(encodeBase64(decoded)).toEqual("MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw");
	});

	it("round-trips through the standard alphabet with padding", () => {
		expect(encodeBase64(decodeBase64("TWE="))).toEqual("TWE=");
		expect(encodeBase64(decodeBase64("TQ=="))).toEqual("TQ==");
	});

	it("uses the + and / alphabet rather than base64url", () => {
		const bytes = decodeBase64("++//");
		expect(encodeBase64(bytes)).toEqual("++//");
	});

	it("accepts input without padding, like the JDK decoder", () => {
		expect(Array.from(decodeBase64("TWE"))).toEqual(Array.from(decodeBase64("TWE=")));
	});

	it("rejects characters outside the alphabet instead of skipping them", () => {
		// Node's Buffer.from(..., "base64") silently ignores these.
		expect(() => decodeBase64("!!!!")).toThrow(IllegalBase64CharacterError);
		expect(() => decodeBase64("ab*d")).toThrow(IllegalBase64CharacterError);
		expect(() => decodeBase64("-_-_")).toThrow(IllegalBase64CharacterError);
	});

	it("rejects a trailing group holding a single character", () => {
		expect(() => decodeBase64("TWEA1")).toThrow(IllegalBase64CharacterError);
	});

	it("rejects data appearing after padding", () => {
		expect(() => decodeBase64("TQ==A")).toThrow(IllegalBase64CharacterError);
	});

	it("decodes the empty string to zero bytes", () => {
		expect(decodeBase64("").length).toEqual(0);
	});

	it("rejects more than two padding characters", () => {
		expect(() => decodeBase64("TQ===")).toThrow(IllegalBase64CharacterError);
	});

	it("rejects padding that does not complete a four-character group", () => {
		expect(() => decodeBase64("TQ=")).toThrow(IllegalBase64CharacterError);
	});

	// The message texts below are asserted verbatim because they are what the
	// JDK decoder emits; differential testing against the original caught two
	// of them drifting.
	it("reports the JDK's message text for each rejection", () => {
		expect(() => decodeBase64("!!!!")).toThrow("Illegal base64 character 21");
		expect(() => decodeBase64("ab*d")).toThrow("Illegal base64 character 2a");
		expect(() => decodeBase64("-_-_")).toThrow("Illegal base64 character 2d");
		expect(() => decodeBase64("TWEA1")).toThrow("Last unit does not have enough valid bits");
		expect(() => decodeBase64("TQ==A")).toThrow("Input byte array has incorrect ending byte at 4");
		expect(() => decodeBase64("TQ===")).toThrow("Input byte array has incorrect ending byte at 4");
		expect(() => decodeBase64("TQ=")).toThrow("Input byte array has wrong 4-byte ending unit");
	});

	it("is catchable as a TypeError, the counterpart of IllegalArgumentException", () => {
		expect(() => decodeBase64("!!!!")).toThrow(TypeError);
	});

	// `Base64.getDecoder().decode(String)` encodes to ISO-8859-1 first (anything
	// above U+00FF becomes "?") and reports the offending byte SIGNED, so a
	// non-ASCII character is named by its byte value, not its code point.
	it("names a non-ASCII character by its signed ISO-8859-1 byte", () => {
		expect(() => decodeBase64("AAA\u00e9")).toThrow("Illegal base64 character -17");
		expect(() => decodeBase64("AAA\u00a0")).toThrow("Illegal base64 character -60");
		expect(() => decodeBase64("AAA\u00ff")).toThrow("Illegal base64 character -1");
		expect(() => decodeBase64("AAA\u0080")).toThrow("Illegal base64 character -80");
	});

	it("maps characters above U+00FF to '?' as ISO-8859-1 does", () => {
		expect(() => decodeBase64("AAA\u65e5")).toThrow("Illegal base64 character 3f");
		expect(() => decodeBase64("AAA\u0100")).toThrow("Illegal base64 character 3f");
		expect(() => decodeBase64("AAA\ud83d\ude00")).toThrow("Illegal base64 character 3f");
	});

	it("rejects a single-character input on length, before validating it", () => {
		// The JDK checks the length first, so the message names the length
		// problem even when the character is itself legal.
		const msg = "Input byte[] should at least have 2 bytes for base64 bytes";
		expect(() => decodeBase64("A")).toThrow(msg);
		expect(() => decodeBase64("\u00e9")).toThrow(msg);
		expect(() => decodeBase64("=")).toThrow(msg);
	});

	it("still rejects every non-ASCII character, whatever its byte", () => {
		for (const cp of [0x80, 0xa0, 0xe9, 0xff, 0x100, 0x65e5]) {
			expect(() => decodeBase64("AAA" + String.fromCodePoint(cp))).toThrow(
				IllegalBase64CharacterError,
			);
		}
	});
});

describe("constantTimeEqual — MessageDigest.isEqual semantics", () => {
	const bytes = (s: string) => Buffer.from(s, "utf8");

	it("reports equal content as equal", () => {
		expect(constantTimeEqual(bytes("abcdef"), bytes("abcdef"))).toBe(true);
	});

	it("reports differing content as unequal", () => {
		expect(constantTimeEqual(bytes("abcdef"), bytes("abcdeg"))).toBe(false);
	});

	it("returns false for differing lengths rather than throwing", () => {
		// crypto.timingSafeEqual raises a RangeError here; the JDK returns false.
		expect(constantTimeEqual(bytes("short"), bytes("a much longer value"))).toBe(false);
		expect(constantTimeEqual(bytes("a much longer value"), bytes("short"))).toBe(false);
	});

	it("treats two empty inputs as equal and empty vs non-empty as unequal", () => {
		expect(constantTimeEqual(bytes(""), bytes(""))).toBe(true);
		expect(constantTimeEqual(bytes("x"), bytes(""))).toBe(false);
		expect(constantTimeEqual(bytes(""), bytes("x"))).toBe(false);
	});

	it("treats the identical reference as equal", () => {
		const value = bytes("same");
		expect(constantTimeEqual(value, value)).toBe(true);
	});
});

describe("parseLong — Long.parseLong semantics", () => {
	it("parses plain and signed decimal values", () => {
		expect(parseLong("1614265330")).toEqual(1614265330n);
		expect(parseLong("-42")).toEqual(-42n);
		expect(parseLong("+42")).toEqual(42n);
		expect(parseLong("0")).toEqual(0n);
	});

	it("normalises leading zeros, as the original does before re-signing", () => {
		expect(parseLong("0001614265330")).toEqual(1614265330n);
	});

	it("keeps the full signed 64-bit range exact", () => {
		expect(parseLong("9223372036854775807")).toEqual(9223372036854775807n);
		expect(parseLong("-9223372036854775808")).toEqual(-9223372036854775808n);
	});

	it("rejects values outside the signed 64-bit range", () => {
		expect(() => parseLong("9223372036854775808")).toThrow(NumberFormatError);
		expect(() => parseLong("-9223372036854775809")).toThrow(NumberFormatError);
	});

	it("rejects trailing garbage instead of stopping at it", () => {
		// parseInt("123abc") would return 123.
		expect(() => parseLong("123abc")).toThrow(NumberFormatError);
	});

	it("rejects whitespace, empty input, and non-decimal forms", () => {
		expect(() => parseLong("")).toThrow(NumberFormatError);
		expect(() => parseLong(" 12")).toThrow(NumberFormatError);
		expect(() => parseLong("12 ")).toThrow(NumberFormatError);
		expect(() => parseLong("0x1f")).toThrow(NumberFormatError);
		expect(() => parseLong("1e3")).toThrow(NumberFormatError);
		expect(() => parseLong("1.5")).toThrow(NumberFormatError);
		expect(() => parseLong("+")).toThrow(NumberFormatError);
		expect(() => parseLong("-")).toThrow(NumberFormatError);
	});
});

describe("getFirstHeader — Map<String, List<String>> lookup semantics", () => {
	it("matches case-insensitively", () => {
		const headers = new Map([["WeBhOoK-Id", ["abc"]]]);
		expect(getFirstHeader(headers, "webhook-id")).toEqual("abc");
	});

	it("takes the first value when several are present", () => {
		const headers = new Map([["webhook-signature", ["first", "second"]]]);
		expect(getFirstHeader(headers, "webhook-signature")).toEqual("first");
	});

	it("treats an empty or undefined value list as absent", () => {
		expect(getFirstHeader(new Map([["webhook-id", []]]), "webhook-id")).toBeNull();
		expect(getFirstHeader({ "webhook-id": undefined }, "webhook-id")).toBeNull();
	});

	it("reports a genuinely missing header as absent", () => {
		expect(getFirstHeader(new Map<string, string[]>(), "webhook-id")).toBeNull();
	});

	it("reads plain objects such as Node's IncomingHttpHeaders", () => {
		expect(getFirstHeader({ "Webhook-Id": "abc" }, "webhook-id")).toEqual("abc");
		expect(getFirstHeader({ "webhook-id": ["abc", "def"] }, "webhook-id")).toEqual("abc");
	});

	it("reads the platform's own Headers type", () => {
		const headers = new Headers();
		headers.append("Webhook-Id", "abc");
		expect(getFirstHeader(headers, "webhook-id")).toEqual("abc");
		expect(getFirstHeader(headers, "webhook-signature")).toBeNull();
	});
});

describe("secret handling", () => {
	it("rejects a secret that decodes to zero bytes", () => {
		expect(() => new Webhook("")).toThrow(EmptyWebhookSecretException);
		expect(() => new Webhook(new Uint8Array(0))).toThrow(EmptyWebhookSecretException);
	});

	it("carries the original's message text", () => {
		expect(() => new Webhook("")).toThrow("Webhook secret should not be empty");
	});

	it("rejects a malformed Base64 secret rather than silently emptying it", () => {
		expect(() => new Webhook("whsec_!!!!")).toThrow(IllegalBase64CharacterError);
	});

	it("uses raw bytes verbatim, without prefix stripping or Base64 decoding", () => {
		const scenario = TestScenario.valid();
		const rawKey = decodeBase64(scenario.secret);

		const fromBytes = new Webhook(rawKey);
		const fromString = new Webhook(scenario.secret);

		expect(fromBytes.sign(scenario.id, Number(scenario.timestamp), scenario.payload)).toEqual(
			fromString.sign(scenario.id, Number(scenario.timestamp), scenario.payload),
		);
	});
});

describe("verification error surface", () => {
	const messageOf = (scenario: TestScenario): string => {
		try {
			new Webhook(scenario.secret).verify(scenario.payload, scenario.headersAsMap());
		} catch (error) {
			return (error as Error).message;
		}
		throw new Error("expected verification to fail");
	};

	it("reports missing headers before validating the timestamp", () => {
		const scenario = TestScenario.valid().withOldTimestamp().withMissingId();
		expect(messageOf(scenario)).toEqual("Missing required headers");
	});

	it("reports a non-numeric timestamp as invalid signature headers", () => {
		const scenario = TestScenario.valid();
		scenario.headerMap.set("webhook-timestamp", ["not-a-number"]);
		expect(messageOf(scenario)).toEqual("Invalid Signature Headers");
	});

	it("reports an out-of-tolerance timestamp with the matching direction", () => {
		expect(messageOf(TestScenario.valid().withOldTimestamp())).toEqual(
			"Message timestamp too old",
		);
		expect(messageOf(TestScenario.valid().withFutureTimestamp())).toEqual(
			"Message timestamp too new",
		);
	});

	it("reports an unmatched signature as no matching signature found", () => {
		expect(messageOf(TestScenario.valid().withInvalidSignatureValue())).toEqual(
			"No matching signature found",
		);
		expect(messageOf(TestScenario.valid().withWrongVersion())).toEqual(
			"No matching signature found",
		);
		expect(messageOf(TestScenario.valid().withInvalidSignatureFormat())).toEqual(
			"No matching signature found",
		);
	});

	it("throws WebhookVerificationException for every verification failure", () => {
		expect(() => {
			const scenario = TestScenario.valid().withMissingSignature();
			new Webhook(scenario.secret).verify(scenario.payload, scenario.headersAsMap());
		}).toThrow(WebhookVerificationException);
	});
});

describe("timestamp tolerance boundaries", () => {
	const at = (offsetSeconds: number): string => {
		const scenario = TestScenario.valid();
		const timestamp = String(Math.floor(Date.now() / 1000) + offsetSeconds);
		const webhook = new Webhook(scenario.secret);
		scenario.headerMap.set("webhook-timestamp", [timestamp]);
		scenario.headerMap.set("webhook-signature", [
			webhook.sign(scenario.id, Number(timestamp), scenario.payload),
		]);
		try {
			webhook.verify(scenario.payload, scenario.headersAsMap());
			return "accepted";
		} catch (error) {
			return (error as Error).message;
		}
	};

	it("accepts exactly the 300 second boundary in both directions", () => {
		expect(at(-300)).toEqual("accepted");
		expect(at(300)).toEqual("accepted");
	});

	it("rejects one second beyond the boundary in both directions", () => {
		expect(at(-301)).toEqual("Message timestamp too old");
		expect(at(301)).toEqual("Message timestamp too new");
	});
});

describe("signing failures", () => {
	it("wraps a rejected timestamp in WebhookSigningException", () => {
		const webhook = new Webhook(TestScenario.valid().secret);
		// The original's `sign` takes a `long`; a non-integral value has no
		// counterpart there, and is surfaced through the same exception the JDK
		// path uses when the MAC primitive rejects its input.
		expect(() => webhook.sign("id", 1.5, "payload")).toThrow(WebhookSigningException);
	});
});

describe("signature parsing", () => {
	it("ignores unknown versions rather than rejecting them", () => {
		const scenario = TestScenario.valid();
		scenario.headerMap.set("webhook-signature", [
			`v2,whatever v99,whatever ${scenario.signatureHeader()}`,
		]);
		expect(() => {
			new Webhook(scenario.secret).verify(scenario.payload, scenario.headersAsMap());
		}).not.toThrow();
	});

	it("skips entries without a comma and keeps scanning", () => {
		const scenario = TestScenario.valid();
		scenario.headerMap.set("webhook-signature", [`garbage ${scenario.signatureHeader()}`]);
		expect(() => {
			new Webhook(scenario.secret).verify(scenario.payload, scenario.headersAsMap());
		}).not.toThrow();
	});

	it("signs the payload verbatim, without re-serialising it", () => {
		const scenario = TestScenario.valid();
		const webhook = new Webhook(scenario.secret);
		const spaced = webhook.sign(scenario.id, 1614265330, '{"test": 2432232314}');
		const compact = webhook.sign(scenario.id, 1614265330, '{"test":2432232314}');
		expect(spaced).not.toEqual(compact);
	});

	it("renders the timestamp in base 10 with no separators", () => {
		const webhook = new Webhook(TestScenario.valid().secret);
		expect(webhook.sign("id", 1614265330, "p")).toEqual(webhook.sign("id", 1614265330n, "p"));
	});
});

/**
 * Regression tests for divergences found by differential testing against the
 * compiled original. Each expectation below was recorded from the Java library
 * itself, not derived from the specification.
 */
describe("differential regressions — decodeBase64 message selection", () => {
	// Which rejection the JDK reports depends on how far into the current
	// four-character group the decoder has advanced when it meets padding, not
	// on how many padding characters there are.
	it.each([
		["A===", "Last unit does not have enough valid bits"],
		["v=WOu5Y", "Last unit does not have enough valid bits"],
		["x7Cve=pK", "Last unit does not have enough valid bits"],
		["AA=A", "Input byte array has wrong 4-byte ending unit"],
		["YWJj====", "Input byte array has wrong 4-byte ending unit"],
		["=dKNDSU", "Input byte array has wrong 4-byte ending unit"],
		["C4=#c", "Input byte array has wrong 4-byte ending unit"],
		["TQ==A", "Input byte array has incorrect ending byte at 4"],
	])("rejects %j the way the JDK does", (input, message) => {
		expect(() => decodeBase64(input)).toThrow(IllegalBase64CharacterError);
		expect(() => decodeBase64(input)).toThrow(message);
	});

	it("counts an astral character as a single ISO-8859-1 replacement byte", () => {
		// Java encodes the surrogate pair as one unmappable character, so the
		// decoder sees a single "?" byte and rejects on length, not content.
		expect(() => decodeBase64("\u{1F600}")).toThrow(
			"Input byte[] should at least have 2 bytes for base64 bytes",
		);
		// Two astral characters make two bytes, which then fail on content.
		expect(() => decodeBase64("\u{1F600}\u{1F600}")).toThrow("Illegal base64 character 3f");
	});

	it("still rejects a lone Latin-1 character on length, reporting the signed byte only when long enough", () => {
		expect(() => decodeBase64("é")).toThrow(
			"Input byte[] should at least have 2 bytes for base64 bytes",
		);
		expect(() => decodeBase64("Aé")).toThrow("Illegal base64 character -17");
	});
});

describe("differential regressions — parseLong accepts every Unicode decimal digit", () => {
	// `Character.digit(char, 10)` is not limited to "0".."9", so a timestamp
	// header written in another digit family parses on the original. Rejecting
	// it here would refuse webhooks the original accepts.
	it.each([
		["fullwidth", 0xff10],
		["arabic-indic", 0x0660],
		["extended arabic-indic", 0x06f0],
		["devanagari", 0x0966],
		["bengali", 0x09e6],
		["thai", 0x0e50],
	])("parses %s digits", (_name, zero) => {
		const ascii = "1614265330";
		let rendered = "";
		for (let i = 0; i < ascii.length; i++) {
			rendered += String.fromCharCode(zero + (ascii.charCodeAt(i) - 0x30));
		}
		expect(parseLong(rendered)).toBe(1614265330n);
	});

	it("agrees with the ASCII spelling", () => {
		expect(parseLong("１６１４")).toBe(parseLong("1614"));
	});

	it("rejects supplementary digits, which the char-based JDK overload cannot decode", () => {
		// MATHEMATICAL BOLD DIGIT ONE is a surrogate pair; Character.digit
		// answers -1 for either half.
		expect(() => parseLong("\u{1D7CF}")).toThrow(NumberFormatError);
	});

	it("does not treat a fullwidth plus sign as a sign", () => {
		// The JDK only looks for a sign when the first char is below "0".
		expect(() => parseLong("＋1614")).toThrow(NumberFormatError);
	});

	it("still rejects mixed and malformed input", () => {
		expect(() => parseLong("１a")).toThrow(NumberFormatError);
		expect(() => parseLong("1０".replace("０", " "))).toThrow(NumberFormatError);
	});
});

describe("differential regressions — native Headers takes the first value", () => {
	it("reads the first of repeated values, as HttpHeaders.map() would", () => {
		const headers = new Headers();
		headers.append("webhook-id", "msg_first");
		headers.append("webhook-id", "msg_second");
		// Headers joins repeats; the original reads a List and takes element 0.
		expect(headers.get("webhook-id")).toBe("msg_first, msg_second");
		expect(getFirstHeader(headers, "webhook-id")).toBe("msg_first");
	});

	it("resolves native header names case-insensitively", () => {
		const headers = new Headers({ "Webhook-Id": "msg_1" });
		expect(getFirstHeader(headers, "webhook-id")).toBe("msg_1");
	});

	it("reports an absent native header as null", () => {
		expect(getFirstHeader(new Headers(), "webhook-id")).toBeNull();
	});

	it("verifies through native Headers carrying a repeated id", () => {
		const scenario = TestScenario.valid();
		const webhook = new Webhook(scenario.secret);
		const headers = new Headers();
		headers.append("webhook-id", scenario.id);
		headers.append("webhook-id", "msg_ignored");
		headers.append("webhook-timestamp", scenario.timestamp);
		headers.append("webhook-signature", scenario.signatureHeader());
		expect(() => {
			webhook.verify(scenario.payload, headers);
		}).not.toThrow();
	});
});
