import { objectRepresentation } from '../src/utils';

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
