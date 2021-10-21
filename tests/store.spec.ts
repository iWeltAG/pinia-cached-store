import { createPinia, setActivePinia } from 'pinia';
import { defineCachedStore, CachingOptions } from 'pinia-cached-store';
import { encode } from '../src/utils';

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
});

// This testing store saves exactly one value which is calculated from the input
// argument.
function useCalculatingStore(
  calculate: (input: number) => number,
  id: string = 'calculator',
  options: CachingOptions<{ value: number }> | undefined = undefined
) {
  const useStore = defineCachedStore({
    id,

    state: () => ({ value: 0 }),

    async refresh({ input }: { input: number }) {
      this.value = calculate(input);
    },

    caching: options,
  });
  return useStore();
}

describe('a simple store', () => {
  it('correctly performs caching', async () => {
    const calculate = jest.fn((input: number) => 2 * input);
    const store = useCalculatingStore(calculate);

    expect(Object.keys(localStorage)).toHaveLength(0);
    expect(store.value).toBe(0);

    await store.$load({ input: 4 });
    expect(store.value).toBe(8);
    expect(Object.keys(localStorage)).toHaveLength(1);
    expect(calculate).toBeCalledTimes(1);

    await store.$load({ input: 5 });
    expect(store.value).toBe(10);
    expect(Object.keys(localStorage)).toHaveLength(2);
    expect(calculate).toBeCalledTimes(2);

    // Now we should hit the cache.
    await store.$load({ input: 4 });
    expect(store.value).toBe(8);
    expect(Object.keys(localStorage)).toHaveLength(2);
    expect(calculate).toBeCalledTimes(2);

    Object.keys(localStorage).forEach((key) =>
      expect(key).toContain(store.$id)
    );
  });

  it('resets both store and cache', async () => {
    const store = useCalculatingStore((input: number) => input + 3);

    await store.$load({ input: -4 });
    await store.$load({ input: -9 });
    await store.$load({ input: 123 });
    expect(store.value).toBe(126);
    expect(Object.keys(localStorage)).toHaveLength(3);

    store.$reset();
    expect(store.value).toBe(0);

    await store.$load({ input: 99 });
    expect(store.value).toBe(102);
    expect(Object.keys(localStorage)).toHaveLength(4);

    store.$clearCache();
    expect(store.value).toBe(0);
    expect(Object.keys(localStorage)).toHaveLength(0);
  });

  it('transparently resets when refresh errors', async () => {
    const calculate = jest
      .fn()
      .mockImplementationOnce((input: number) => input)
      .mockImplementationOnce(() => {
        throw Error();
      });
    const store = useCalculatingStore(calculate);

    await store.$load({ input: 2 });
    expect(store.value).toBe(2);

    await expect(store.$load({ input: 4 })).rejects.toThrow(
      'Error while refreshing cache'
    );
    expect(store.value).toBe(0);
  });

  it('reloads when the cache expires', async () => {
    const calculate = jest.fn((input: number) => input * input);
    const store = useCalculatingStore(calculate);

    await store.$load({ input: 5 });
    await store.$load({ input: 5 });
    expect(calculate).toBeCalledTimes(1);

    // Move three days into the future
    const fakeDate = Date.now() + 1000 * 60 * 60 * 24 * 3;
    jest.spyOn(Date, 'now').mockImplementation(() => fakeDate);

    await store.$load({ input: 5 });
    expect(calculate).toBeCalledTimes(2);
  });

  it('ignores invalid cache states', async () => {
    const calculate = jest.fn((input: number) => input % 12);
    const store = useCalculatingStore(calculate);

    await store.$load({ input: 24 });
    expect(calculate).toBeCalledTimes(1);

    expect(Object.keys(localStorage)).toHaveLength(1);
    const cacheKey = Object.keys(localStorage)[0];

    localStorage.setItem(cacheKey, 'this is invalid base64 !§$%&/()=?');
    await store.$load({ input: 24 });
    expect(calculate).toBeCalledTimes(2);

    localStorage.setItem(cacheKey, encode({ timestamp: 0, state: null }));
    await store.$load({ input: 24 });
    expect(calculate).toBeCalledTimes(3);

    localStorage.setItem(
      cacheKey,
      encode({ timestamp: null, state: { value: 2 } })
    );
    await store.$load({ input: 24 });
    expect(calculate).toBeCalledTimes(4);
  });
});

describe('multiple stores', () => {
  it('only clear their own cache', async () => {
    const firstStore = useCalculatingStore((input: number) => input, 'first');
    const secondStore = useCalculatingStore(
      (input: number) => -1 * input,
      'second'
    );

    await firstStore.$load({ input: 17 });
    await firstStore.$load({ input: 76 });
    await secondStore.$load({ input: 24 });
    await secondStore.$load({ input: -4 });
    expect(Object.keys(localStorage)).toHaveLength(4);

    secondStore.$clearCache();
    expect(secondStore.value).toBe(0);
    expect(Object.keys(localStorage)).toHaveLength(2);
    for (const key of Object.keys(localStorage)) {
      expect(key).toContain('first');
      expect(key).not.toContain('second');
    }
  });
});

describe('non-specific cache keys', () => {
  it('share a cache', async () => {
    const calculate = jest.fn((input: number) => input / 3);
    const store = useCalculatingStore(calculate, 'calculator', {
      refreshSpecificKey: false,
    });

    await store.$load({ input: 3 });
    await store.$load({ input: 4 });
    await store.$load({ input: 5 });
    // The example doesn't really make sense here because we said .$load() with
    // a value of 5 (so our store should now have 5/3), but in reality we are
    // expecting the first value we loaded because the store uses a single cache
    // key.
    expect(store.value).toBe(1); // From 3 / 3
    expect(Object.keys(localStorage)).toHaveLength(1);

    store.$clearCache();
    await store.$load({ input: 6 });
    expect(store.value).toBe(2); // From 6 / 3
    expect(Object.keys(localStorage)).toHaveLength(1);
  });
});

describe('custom validity checks', () => {
  it('are evaluated', async () => {
    const calculate = jest.fn((input: number) => input);
    const store = useCalculatingStore(calculate, 'calculator', {
      checkValidity(data) {
        // Use the value 1 to simulate an invalid cache which needs to be
        // refetched.
        if (data.value == 1) {
          return false;
        }
        return true;
      },
    });

    await store.$load({ input: 1 });
    expect(calculate).toBeCalledTimes(1);
    await store.$load({ input: 1 });
    // Should have been called again, because we said that the existing value
    // is invalid.
    expect(calculate).toBeCalledTimes(2);

    await store.$load({ input: 2 });
    expect(calculate).toBeCalledTimes(3);
    await store.$load({ input: 2 });
    // The second value should have been loaded from cache as expected.
    expect(calculate).toBeCalledTimes(3);
  });
});
