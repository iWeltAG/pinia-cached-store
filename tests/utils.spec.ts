import { encode, decode, objectRepresentation } from '../src/utils';

describe('string encoding and decoding', () => {
  describe('matches base64-encoded input values', () => {
    // This test makes sure that our encode() method yields the same result as
    // just calling btoa() on the input. This is because that was the prior
    // implementation before unicode support and we don't want to invalidate
    // all the caches that already exist.
    for (const input of [
      'Hello',
      { hello: 'world' },
      'The show must go on',
      'Never gonna give you up, 98127389516928375619872635987!!!!',
      '',
    ]) {
      const jsonInput = JSON.stringify(input);

      it(`for '${input}'`, () => {
        expect(encode(input)).toBe(btoa(jsonInput));
        expect(decode(btoa(jsonInput))).toStrictEqual(input);
        expect(decode(encode(input))).toStrictEqual(input);
      });
    }
  });

  describe('works for unicode input', () => {
    for (const input of [
      '💀💀💀 Aarrrrr Pirates! 💀💀💀',
      '☸☹☺☻☼☾☿',
      { theThing: '"`' },
      { whooo: 'Şar' },
    ]) {
      it(`'${input}'`, () => {
        expect(decode(encode(input))).toStrictEqual(input);
      });
    }
  });
});

describe('object representation', () => {
  it('is different for a few examples', () => {
    const objects = [
      { input: 'nothing' },
      { value: 5 },
      { value: 4 },
      { this: { goes: { a: { bit: { deeper: true } } } } },
      { everything: 'nothing', someone: 'no one' },
      { a: 1, b: 2, c: 3, d: 17, e: 5, f: 6 },
    ];
    const objectRepresentations = objects.map(objectRepresentation);
    expect(new Set(objectRepresentations).size).toBe(objects.length);
  });

  it('is the same regardless of order', () => {
    expect(
      new Set(
        [
          { first: 1, second: 2, third: 3 },
          { second: 2, third: 3, first: 1 },
          { third: 3, first: 1, second: 2 },
          { first: 1, third: 3, second: 2 },
          { second: 2, first: 1, third: 3 },
          { third: 3, second: 2, first: 1 },
        ].map(objectRepresentation)
      ).size
    ).toBe(1);

    expect(
      new Set(
        [
          { this: { goes: true, for: false }, deeper: { things: 'too' } },
          { this: { for: false, goes: true }, deeper: { things: 'too' } },
          { deeper: { things: 'too' }, this: { goes: true, for: false } },
          { deeper: { things: 'too' }, this: { for: false, goes: true } },
        ].map(objectRepresentation)
      ).size
    ).toBe(1);
  });
});
