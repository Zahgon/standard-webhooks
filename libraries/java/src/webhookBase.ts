import { createHmac } from "node:crypto";

import {
	EmptyWebhookSecretException,
	WebhookSigningException,
	WebhookVerificationException,
} from "./exceptions";
import { decodeBase64 } from "./internal/base64";
import { constantTimeEqual } from "./internal/constantTimeEqual";
import { getFirstHeader, type WebhookHeaders } from "./internal/headers";
import { parseLong } from "./internal/parseLong";

/**
 * Base class containing all shared webhook verification logic.
 *
 * Not exported from the package entry point, which is how the original's
 * package-private visibility — "prevent extension outside this package" —
 * carries over: consumers can neither name nor extend this type.
 */
export abstract class WebhookBase {
	public static readonly SECRET_PREFIX = "whsec_";
	public static readonly UNBRANDED_MSG_ID_KEY = "webhook-id";
	public static readonly UNBRANDED_MSG_SIGNATURE_KEY = "webhook-signature";
	public static readonly UNBRANDED_MSG_TIMESTAMP_KEY = "webhook-timestamp";

	private static readonly HMAC_SHA256 = "sha256";
	private static readonly TOLERANCE_IN_SECONDS = 300n; // 5 minutes
	private static readonly SECOND_IN_MS = 1000;

	protected readonly key: Uint8Array;

	protected constructor(secret: string | Uint8Array) {
		if (typeof secret === "string") {
			let sec = secret;
			if (sec.startsWith(WebhookBase.SECRET_PREFIX)) {
				sec = sec.substring(WebhookBase.SECRET_PREFIX.length);
			}
			this.key = decodeBase64(sec);
		} else {
			this.key = secret;
		}

		if (this.key.length === 0) {
			throw new EmptyWebhookSecretException("Webhook secret should not be empty");
		}
	}

	/**
	 * Verify a webhook signature.
	 *
	 * @param payload The webhook payload to verify, signed exactly as given.
	 * @param headers The request headers, resolved case-insensitively.
	 * @throws {WebhookVerificationException} if verification fails.
	 */
	public verify(payload: string, headers: WebhookHeaders): void {
		const msgId = getFirstHeader(headers, WebhookBase.UNBRANDED_MSG_ID_KEY);
		const msgSignature = getFirstHeader(headers, WebhookBase.UNBRANDED_MSG_SIGNATURE_KEY);
		const msgTimestamp = getFirstHeader(headers, WebhookBase.UNBRANDED_MSG_TIMESTAMP_KEY);

		if (msgId === null || msgSignature === null || msgTimestamp === null) {
			throw new WebhookVerificationException("Missing required headers");
		}

		const timestamp = WebhookBase.verifyTimestamp(msgTimestamp);

		let expectedSignature: string;
		try {
			// Base64 never contains a comma, so splitting on it isolates the
			// signature from its "v1," version prefix.
			const signed = this.sign(msgId, timestamp, payload);
			expectedSignature = signed.slice(signed.indexOf(",") + 1);
		} catch (error) {
			if (error instanceof WebhookSigningException) {
				throw new WebhookVerificationException("Failed to generate expected signature");
			}
			throw error;
		}

		const expectedBytes = Buffer.from(expectedSignature, "utf8");

		for (const versionedSignature of msgSignature.split(" ")) {
			const [version, candidate] = versionedSignature.split(",");
			if (candidate === undefined) {
				continue;
			}
			if (version !== "v1") {
				continue;
			}
			if (constantTimeEqual(Buffer.from(candidate, "utf8"), expectedBytes)) {
				return;
			}
		}

		throw new WebhookVerificationException("No matching signature found");
	}

	/**
	 * Sign a payload, returning `v1,<base64>`.
	 *
	 * @param msgId     The message id, signed verbatim.
	 * @param timestamp Whole seconds since the Unix epoch. A `bigint` keeps the
	 *                  full signed 64-bit range of the original's `long` exact.
	 * @param payload   The payload, signed verbatim.
	 * @throws {WebhookSigningException} if the MAC primitive rejects the input.
	 */
	public sign(msgId: string, timestamp: number | bigint, payload: string): string {
		try {
			const seconds = typeof timestamp === "bigint" ? timestamp : BigInt(timestamp);
			const toSign = `${msgId}.${seconds.toString()}.${payload}`;

			const hmac = createHmac(WebhookBase.HMAC_SHA256, this.key);
			hmac.update(Buffer.from(toSign, "utf8"));

			return `v1,${hmac.digest("base64")}`;
		} catch (error) {
			throw new WebhookSigningException(error instanceof Error ? error.message : String(error));
		}
	}

	private static verifyTimestamp(timestampHeader: string): bigint {
		const now = BigInt(Math.floor(Date.now() / WebhookBase.SECOND_IN_MS));

		let timestamp: bigint;
		try {
			timestamp = parseLong(timestampHeader);
		} catch {
			throw new WebhookVerificationException("Invalid Signature Headers");
		}

		if (timestamp < now - WebhookBase.TOLERANCE_IN_SECONDS) {
			throw new WebhookVerificationException("Message timestamp too old");
		}
		if (timestamp > now + WebhookBase.TOLERANCE_IN_SECONDS) {
			throw new WebhookVerificationException("Message timestamp too new");
		}

		return timestamp;
	}
}
