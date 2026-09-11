/**
 * Raised when the signing primitive rejects the key or algorithm.
 *
 * Mirrors `com.standardwebhooks.exceptions.WebhookSigningException`, which extends
 * `java.lang.Exception`. TypeScript has no checked exceptions, so the
 * compile-time obligation to declare or handle it does not carry over; the
 * type identity, which callers branch on, does.
 */
export class WebhookSigningException extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WebhookSigningException";
		Object.setPrototypeOf(this, WebhookSigningException.prototype);
	}
}
