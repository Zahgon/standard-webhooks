import { createHmac } from "node:crypto";

import { decodeBase64 } from "../src/internal/base64";
import type { HeaderMap } from "../src/internal/headers";

/**
 * Shared test utility for creating test payloads with valid signatures.
 *
 * Provides factory methods for common test scenarios that can be reused across
 * the unit suite and the integration suites.
 */
export class TestScenario {
	private static readonly DEFAULT_MSG_ID = "msg_p5jXN8AQM9LWM0D4loKWxJek";
	private static readonly DEFAULT_SECRET = "MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
	private static readonly DEFAULT_PAYLOAD = '{"test": 2432232314}';
	private static readonly SECOND_IN_MS = 1000;
	private static readonly TOLERANCE_IN_MS = 5 * 60 * 1000;

	public id: string;
	public timestamp: string;
	public payload: string;
	public secret: string;
	public signature: string;
	public headerMap: Map<string, string[]>;

	public constructor(timestampInMS: number) {
		this.id = TestScenario.DEFAULT_MSG_ID;
		this.timestamp = String(Math.trunc(timestampInMS / TestScenario.SECOND_IN_MS));
		this.payload = TestScenario.DEFAULT_PAYLOAD;
		this.secret = TestScenario.DEFAULT_SECRET;

		const toSign = `${this.id}.${this.timestamp}.${this.payload}`;
		const hmac = createHmac("sha256", decodeBase64(this.secret));
		hmac.update(Buffer.from(toSign, "utf8"));
		this.signature = hmac.digest("base64");

		this.headerMap = new Map<string, string[]>();
		this.headerMap.set("webhook-id", [this.id]);
		this.headerMap.set("webhook-timestamp", [this.timestamp]);
		this.headerMap.set("webhook-signature", [`v1,${this.signature}`]);
	}

	public headersAsMap(): HeaderMap {
		return new Map(this.headerMap);
	}

	/** The platform's own header type, as a Java 11 caller would supply. */
	public headersAsFetchHeaders(): Headers {
		const headers = new Headers();
		for (const [key, values] of this.headerMap) {
			for (const value of values) {
				headers.append(key, value);
			}
		}
		return headers;
	}

	public signatureHeader(): string {
		return `v1,${this.signature}`;
	}

	// Factory method and builder-style methods for common test scenarios

	/** Creates a valid test payload with current timestamp. */
	public static valid(): TestScenario {
		return new TestScenario(Date.now());
	}

	/** Modifies the timestamp to be too old (beyond tolerance). */
	public withOldTimestamp(): this {
		const timestampInMS = Date.now() - (TestScenario.TOLERANCE_IN_MS + TestScenario.SECOND_IN_MS);
		this.timestamp = String(Math.trunc(timestampInMS / TestScenario.SECOND_IN_MS));
		this.headerMap.set("webhook-timestamp", [this.timestamp]);
		return this;
	}

	/** Modifies the timestamp to be too new (beyond tolerance). */
	public withFutureTimestamp(): this {
		const timestampInMS = Date.now() + TestScenario.TOLERANCE_IN_MS + TestScenario.SECOND_IN_MS;
		this.timestamp = String(Math.trunc(timestampInMS / TestScenario.SECOND_IN_MS));
		this.headerMap.set("webhook-timestamp", [this.timestamp]);
		return this;
	}

	/** Modifies this payload to include multiple signatures (some invalid, one valid). */
	public withMultipleSignatures(): this {
		const multipleSignatures = [
			"v1,Ceo5qEr07ixe2NLpvHk3FH9bwy/WavXrAFQ/9tdO6mc=",
			"v2,Ceo5qEr07ixe2NLpvHk3FH9bwy/WavXrAFQ/9tdO6mc=",
			this.signatureHeader(), // valid signature
			"v1,Ceo5qEr07ixe2NLpvHk3FH9bwy/WavXrAFQ/9tdO6mc=",
		].join(" ");
		this.headerMap.set("webhook-signature", [multipleSignatures]);
		return this;
	}

	/** Removes the webhook-id header. */
	public withMissingId(): this {
		this.headerMap.delete("webhook-id");
		return this;
	}

	/** Removes the webhook-timestamp header. */
	public withMissingTimestamp(): this {
		this.headerMap.delete("webhook-timestamp");
		return this;
	}

	/** Removes the webhook-signature header. */
	public withMissingSignature(): this {
		this.headerMap.delete("webhook-signature");
		return this;
	}

	/** Sets wrong signature version (v2 instead of v1). */
	public withWrongVersion(): this {
		this.headerMap.set("webhook-signature", ["v2,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE="]);
		return this;
	}

	/** Sets invalid signature format (missing version/signature separator). */
	public withInvalidSignatureFormat(): this {
		this.headerMap.set("webhook-signature", ["invalid_signature"]);
		return this;
	}

	/** Sets invalid signature value. */
	public withInvalidSignatureValue(): this {
		this.headerMap.set("webhook-signature", ["v1,invalid_signature"]);
		return this;
	}

	/** Converts headers to mixed case. */
	public withMixedCaseHeaders(): this {
		const mixedCaseHeaders = new Map<string, string[]>();
		mixedCaseHeaders.set("Webhook-Id", this.headerMap.get("webhook-id") ?? []);
		mixedCaseHeaders.set("WEBHOOK-TIMESTAMP", this.headerMap.get("webhook-timestamp") ?? []);
		mixedCaseHeaders.set("webhook-SIGNATURE", this.headerMap.get("webhook-signature") ?? []);
		this.headerMap = mixedCaseHeaders;
		return this;
	}

	/**
	 * Creates a valid test payload with hard-coded known values for testing signing.
	 *
	 * Note that `signature` here holds the already-prefixed `v1,...` form, unlike
	 * the constructor where it holds the bare Base64. That asymmetry is carried
	 * over from the original fixture verbatim: it leaves this factory's
	 * `webhook-signature` header doubly prefixed, which is invisible because the
	 * only test using this factory calls `sign` and never `verify`.
	 */
	public static validSigned(): TestScenario {
		const scenario = TestScenario.valid();

		scenario.secret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
		scenario.id = "msg_p5jXN8AQM9LWM0D4loKWxJek";
		scenario.timestamp = "1614265330";
		scenario.payload = '{"test": 2432232314}';
		scenario.signature = "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=";

		scenario.headerMap = new Map<string, string[]>();
		scenario.headerMap.set("webhook-id", [scenario.id]);
		scenario.headerMap.set("webhook-timestamp", [scenario.timestamp]);
		scenario.headerMap.set("webhook-signature", [`v1,${scenario.signature}`]);

		return scenario;
	}
}
