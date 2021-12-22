/**
 * Encode an object to Base64 representation.
 *
 * @param data The object to encode.
 */
export function encode(data: unknown): string {
  // Even strings are encoded in JSON form (with quotes) so they can be parsed
  // accordingly again later.
  const dataString = JSON.stringify(data);

  try {
    return btoa(dataString);
  } catch {
    // btoa() may fail if the input contains code points with values above 0xff.
    // In that case, we need to convert the JavaScript UTF-16 string into a
    // string that has only 8-bit code points. See here on MDN:
    // https://developer.mozilla.org/en-US/docs/Web/API/btoa#unicode_strings
    const charCodes = new Uint16Array(dataString.length);
    for (let i = 0; i < charCodes.length; i++) {
      charCodes[i] = dataString.charCodeAt(i);
    }
    const bytes = new Uint8Array(charCodes.buffer);
    let binaryString = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binaryString += String.fromCharCode(bytes[i]);
    }
    console.log(dataString);
    console.log(binaryString);

    // `binaryString` now contains the same content as `dataString` but each
    // code point is split up into two characters. This effectively makes the
    // string twice as long (because it is still stored in UTF-16), but with the
    // property that no character has values larger than 255. For example, an
    // input '\x1234\x5678' would now be converted into the string
    // '\x0012\x0034\x0056\x0078'. The latter is a valid input for btoa() now
    // because of the aforementioned property. In order for decoding to become
    // easier, the output is marked with an exclamation mark so we know we need
    // to do the unicode conversion again (the extra character doesn't really
    // matter because the output is twice as long as it needs to be anyway).
    return '!' + btoa(binaryString);
  }
}

/**
 * Decode an object's Base64 representation.
 *
 * @param data The string to decode.
 */
export function decode<T>(data: string): T {
  let dataString = '';

  // See the comments in encode() for more details here. In short: if the input
  // starts with an exclamation mark, the decoded data contains unicode
  // codepoints over 255, which need to be handled specially because ECMAScript
  // can't cope with them when encoding base64 for some reason.
  if (data.startsWith('!')) {
    const binaryString = atob(data.substring(1));

    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const charCodes = new Uint16Array(bytes.buffer);

    for (let i = 0; i < charCodes.length; i++) {
      dataString += String.fromCharCode(charCodes[i]);
    }
  } else {
    dataString = atob(data);
  }

  return JSON.parse(dataString) as T;
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
