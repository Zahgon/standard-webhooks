export { Webhook } from "./webhook";

export {
	EmptyWebhookSecretException,
	WebhookSigningException,
	WebhookVerificationException,
} from "./exceptions";

export type { HeaderMap, WebhookHeaders } from "./internal/headers";

// `WebhookBase` is intentionally absent: the original declares it
// package-private "to prevent extension outside this package", and withholding
// it from the entry point is how that restriction carries over. Its four public
// constants are re-exported below so callers keep access to them.
import { WebhookBase } from "./webhookBase";

export const SECRET_PREFIX = WebhookBase.SECRET_PREFIX;
export const UNBRANDED_MSG_ID_KEY = WebhookBase.UNBRANDED_MSG_ID_KEY;
export const UNBRANDED_MSG_SIGNATURE_KEY = WebhookBase.UNBRANDED_MSG_SIGNATURE_KEY;
export const UNBRANDED_MSG_TIMESTAMP_KEY = WebhookBase.UNBRANDED_MSG_TIMESTAMP_KEY;
