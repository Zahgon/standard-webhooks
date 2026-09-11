TypeScript library for Standard Webhooks

# Example

Verifying a webhook payload:

```typescript
import { Webhook } from "standardwebhooks-java";

const webhook = new Webhook(base64Secret);
webhook.verify(webhookPayload, webhookHeaders);
```

`verify` accepts any multi-valued header collection — a `Map`, a plain object
such as Node's `IncomingHttpHeaders`, or the platform's own `Headers`:

```typescript
webhook.verify(payload, request.headers);          // Node IncomingHttpHeaders
webhook.verify(payload, new Headers({ ... }));     // fetch Headers
webhook.verify(payload, new Map([["webhook-id", ["msg_..."]]]));
```

Signing a payload:

```typescript
const signature = webhook.sign(msgId, timestamp, payload);
// => "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE="
```

# Development

## Requirements

 - Node.js 18+
 - npm

## Installing dependencies

```sh
npm install
```

## Building the library

```sh
npm run build
```

## Running Tests

Unit tests:

```sh
npm test
```

Integration tests, which build the package and exercise the emitted artifact:

```sh
npm run test:integration
```

Everything — lint, type check, unit tests with coverage, integration tests:

```sh
npm run verify
```

## Publishing to npm

```sh
npm publish
```
