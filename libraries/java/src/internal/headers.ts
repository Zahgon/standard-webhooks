/**
 * Case-insensitive, multi-valued header lookup.
 *
 * The original resolves headers out of a `Map<String, List<String>>` by
 * scanning entries with `equalsIgnoreCase` and taking the first value of the
 * matching list, treating a null or empty list as absent. That behaviour is
 * reproduced here over the shapes a Node caller actually has: a `Map`, the
 * platform's `Headers`, or a plain object such as Node's `IncomingHttpHeaders`.
 */

/** A single header's value, in any of the forms a caller may supply. */
export type HeaderValue = string | readonly string[] | undefined;

/** A generic multi-valued header collection. */
export type HeaderMap = ReadonlyMap<string, HeaderValue> | Readonly<Record<string, HeaderValue>>;

/** Any header collection `verify` accepts, including the platform's own type. */
export type WebhookHeaders = HeaderMap | Headers;

function isHeaders(headers: WebhookHeaders): headers is Headers {
	return headers instanceof Headers;
}

function isHeaderMap(headers: HeaderMap): headers is ReadonlyMap<string, HeaderValue> {
	return headers instanceof Map;
}

function firstValue(value: HeaderValue): string | null {
	if (value === undefined) {
		return null;
	}
	if (typeof value === "string") {
		return value;
	}
	const [first] = value;
	return first ?? null;
}

/**
 * Return the first value of the header named `name`, compared
 * case-insensitively, or `null` when it is absent or carries no values.
 */
export function getFirstHeader(headers: WebhookHeaders, name: string): string | null {
	const wanted = name.toLowerCase();

	if (isHeaders(headers)) {
		// `Headers` normalises names to lower case, so the lookup itself is
		// already case-insensitive. It does however *join* repeated values with
		// ", " where the original reads a `List` and takes element 0, so the
		// join has to be undone: `HttpHeaders.map()` would hand the original
		// ["a", "b"] and it would verify against "a".
		//
		// This is the one place the platform type loses information the
		// original had. `Headers` exposes no per-value accessor outside
		// `getSetCookie()`, so a single value that itself contained ", " would
		// be split here — impossible for the three `webhook-*` headers, whose
		// values are an id, an integer, and space-separated base64.
		return firstValue(headers.get(wanted)?.split(", "));
	}

	const entries: Iterable<readonly [string, HeaderValue]> = isHeaderMap(headers)
		? headers
		: Object.entries(headers);

	for (const [key, value] of entries) {
		if (key.toLowerCase() === wanted) {
			const first = firstValue(value);
			if (first !== null) {
				return first;
			}
		}
	}

	return null;
}
