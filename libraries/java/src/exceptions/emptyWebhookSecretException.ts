/**
 * Raised when a webhook secret decodes to zero bytes.
 *
 * Mirrors `com.standardwebhooks.exceptions.EmptyWebhookSecretException`, which extends
 * `java.lang.Exception`. TypeScript has no checked exceptions, so the
 * compile-time obligation to declare or handle it does not carry over; the
 * type identity, which callers branch on, does.
 */
export class EmptyWebhookSecretException extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EmptyWebhookSecretException";
		Object.setPrototypeOf(this, EmptyWebhookSecretException.prototype);
	}
}
