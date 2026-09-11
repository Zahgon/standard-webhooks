/**
 * Constant-time byte comparison matching `java.security.MessageDigest.isEqual`.
 *
 * Node's `crypto.timingSafeEqual` cannot be used directly: it throws a
 * `RangeError` when the two buffers differ in length, whereas the JDK returns
 * `false`. The original library compares a candidate signature against the
 * expected one without pre-checking lengths, so a short or malformed signature
 * must compare unequal rather than raise — the difference is observable as a
 * changed exception type. This is a direct transcription of the JDK algorithm,
 * which folds the length difference into the same accumulator as the byte
 * differences so that no early return leaks timing information.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) {
    return true;
  }

  const lengthA = a.length;
  const lengthB = b.length;

  if (lengthB === 0) {
    return lengthA === 0;
  }

  let result = 0;
  result |= lengthA - lengthB;

  for (let i = 0; i < lengthA; i++) {
    // Clamp the index into `b` without branching: while i < lengthB the shift
    // yields 1 (so indexB === i); once i >= lengthB it yields 0 (so indexB
    // === 0). Every iteration therefore reads a valid index and runs the same
    // work regardless of where the first difference lies.
    const indexB = ((i - lengthB) >>> 31) * i;
    result |= (a[i] ?? 0) ^ (b[indexB] ?? 0);
  }

  return result === 0;
}
