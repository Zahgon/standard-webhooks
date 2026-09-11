/**
 * Raised when a webhook payload fails verification.
 *
 * Mirrors `com.standardwebhooks.exceptions.WebhookVerificationException`, which extends
 * `java.lang.Exception`. TypeScript has no checked exceptions, so the
 * compile-time obligation to declare or handle it does not carry over; the
 * type identity, which callers branch on, does.
 */
export class WebhookVerificationException extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WebhookVerificationException";
		Object.setPrototypeOf(this, WebhookVerificationException.prototype);
	}
}
