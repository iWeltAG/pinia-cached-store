/**
 * Encode an object to Base64 representation.
 *
 * @param data The object to encode.
 */
export function encode(data: unknown): string {
  const dataString = typeof data === 'string' ? data : JSON.stringify(data);
  return btoa(dataString);
}

/**
 * Decode an object's Base64 representation.
 *
 * @param data The string to decode.
 */
export function decode<T>(data: string): T {
  return JSON.parse(data) as T;
}

/**
 * Encode a given object into a string representation that can be used for
 * addressing cache entries.
 *
 * Currently, this is basically `btoa(JSON.stringify(options))`, although it is
 * guaranteed to be stable regarding property order - so two objects like
 * `{a: 1, b: 2}` and `{b: 2, a: 1}` will produce the same representation.
 * Further, while the current implementation is in fact reversible for most
 * inputs, this property is not guaranteed.
 *
 * @param input The object to encode.
 */
export function objectRepresentation(input: unknown): string {
  // In this first pass we use JSON.stringify to recursively get all keys we
  // encounter, so that they can be sorted later when we actually encode the
  // object for real.
  const keys = new Set<string>();
  JSON.stringify(input, (key, value) => {
    keys.add(key);
    return value;
  });

  const jsonString = JSON.stringify(input, Array.from(keys).sort());
  return encode(jsonString);
}
