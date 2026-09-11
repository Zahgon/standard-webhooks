import { WebhookBase } from "./webhookBase";

/**
 * A class for verifying and generating webhook signatures.
 *
 * Accepts a secret either as a Base64 string — with or without the `whsec_`
 * prefix — or as raw key bytes, matching the original's two constructors.
 */
export class Webhook extends WebhookBase {
	public constructor(secret: string | Uint8Array) {
		super(secret);
	}
}
