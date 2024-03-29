# Cached Pinia Stores

This module defines a factory function that creates read-only
[Pinia](https://pinia.esm.dev/) stores which automatically copy their state to
local storage and can load it from there, omitting the need for subsequent
refetches. The pattern enables a lightweight dataloading system with a global
cache, somewhat similar to what
[React Query](https://react-query.tanstack.com/),
[Apollo](https://www.apollographql.com/docs/react/caching/overview/) or other
libraries provide. Another use case is to cache expensive calculations in a
store. These can then be re-instantiated quickly when the page gets refreshed
without needing to recompute.

As an example of the second aforementioned use case, the following store
calculates Pi to a given precision and stores the value:

```typescript
import { defineCachedStore } from 'pinia-cached-store';

const usePiStore = defineCachedStore({
  id: 'pi',

  state: () => ({
    value: 3.14,
  }),

  async refresh({ iterations }) {
    // This is a simple (and pretty inefficient) Monte Carlo algorithm that
    // estimates Pi. A fixed number of points is randomly distributed inside the
    // square from the origin to [1,1]. We check how many of these points fall
    // into the corresponding quarter-circle and use that to calculate pi.
    let hits = 0;
    for (let i = 0; i < iterations; i++) {
      const x = Math.random();
      const y = Math.random();
      if (x * x + y * y <= 1) {
        hits += 1;
      }
    }
    // For the quarter-circle's area A:
    //   A = pi (since r=1)
    //   A / 4 = hits / iterations
    this.value = (4 * hits) / iterations;
  },
});
```

Later in our app, the store can be used like this:

```typescript
const pi = usePiStore();
// Make sure you are in an async function. Also, feel free to play around with
// this paramter and get different values:
await pi.$load({ iterations: 99999 });

// Somewhere else:
const doublePi = pi.value * 2;
// Or in templates:
// <span>Pi: {{ pi.value }}</span>
```

> Note that since a cached store is read-only, it is no longer possible to
> define actions. That means the store's sole purpose is to merely reflect data
> on a backend or store the output of some computation – the source of truth
> will never be the store itself. Using
> [getters](https://pinia.esm.dev/core-concepts/getters.html) (computed
> properties) is fine, though.

## Installation

Install the package as follows:

```shell
npm install --save-dev pinia-cached-store
# or
yarn add --dev pinia-cached-store
```

Both Vue and Pinia 2 should also be installed as dependencies in your project.

## Usage

For this guide, we will look at the following example store. It takes the name
of a Pizza dish as an input and stores all the required ingredients for making
it. A cached store is defined much like a
[regular Pinia store](https://pinia.esm.dev/core-concepts/#defining-a-store),
and any options can be here as well, except for `actions`, since caching makes a
store read-only. For completeness' sake, we will directly define it in
Typescript. Here is the code for the complete store definition:

```typescript
import { defineCachedStore } from 'pinia-cached-store';
import pizzaApi from 'awesome-pizza-place';

// Users of the store will pass these options when initializing it. We can use
// them to pass around information relevant to what data we want to fetch.
// As another example, a store containing customer data would take something
// like the customer's ID in this options object.
interface PizzaRefreshOptions {
  name: string;
  extraCheese?: boolean;
}

export const usePizzaStore = defineCachedStore({
  id: 'pizza',

  state: () => ({
    toppings: [] as string[],
    sauce: null as string | null,
    cheese: false as boolean | 'extra',
  }),

  async refresh({ name, extraCheese }: PizzaRefreshOptions) {
    this.$state = await pizzaApi.getPizzaByName(name);
    if (this.cheese && extraCheese) {
      this.cheese = 'extra';
    }
  },
});
```

### The refresh callback

A cached store must define an asynchronous function named `refresh` in the top
level. Although it looks and feels like an action, it is explicitly _not_ placed
inside the `actions` object, and you won't be able to call it directly later,
either. The purpose of this function is to populate the state with the correct
data when a user requests it. You must define exactly one argument to this
function, which are the options that you will receive from the user (see
[the _using_ section](#using-the-store) below). This will only be called when
the cache doesn't already contain an entry for the requested options, so you
don't need to do any cache checking here.

Using `this` works exactly the same way as it would inside an action. That means
that you can use methods like
[\$patch](https://pinia.esm.dev/core-concepts/state.html#mutating-the-state) to
overwrite (parts of) the state, as well as setting `this.$state` directly.
Setting individual keys in the state also works as expected.

### Using the store

Once the store is created, you can use it just like any other Pinia store. By
default, cache-enabled stores are created from the `state()` function in their
definition. You can then use the `$load` action to populate the state with data,
depending on what you currently need. This method takes the exact same parameter
object you defined for `refresh` and will update the state accordingly:

```typescript
// Inside setup() of a component:
const pizza = usePizzaStore();

onMounted(async () => {
  await pizza.$load({ pizzaName: 'hawaii' });
});
```

Multiple `$load()` calls (either consecutively or after a page refresh) will
prioritize cached content. Cache entries are considered applicable if they were
created from the same options object as the current call:

```typescript
// This will call refresh() with our objects object:
await pizza.$load({ pizzaName: 'hawaii' });
// Here, refresh() is called again, since we have a new options object:
await pizza.$load({ pizzaName: 'hawaii', extraCheese: true });
// Again, this will call refresh():
await pizza.$load({ pizzaName: 'hawaii' });
// Since this object was passed before, this is loaded from cache:
await pizza.$load({ extraCheese: true, pizzaName: 'hawaii' });
```

#### Cache clearing

To remove all entries from local storage corresponding a store, call the
`$clearCache` action. Since this will reset the store to the initial state (the
one returned by the `state` function in the store's definition), you probably
want to load some data again afterwards:

```typescript
pizza.$clearCache();
await pizza.$load({ pizzaName: 'margherita' });
```

Note that this will only clear that specific store's cache — those of other
stores are left untouched.

### Manual cache writes and SSR

Every cached store has a `$flushCache` method which you can call if you would
like to force the cache to be written to storage. You don't need to do this when
calling `$load`, but there might be other circumstances.

For example, in an SSR environment like Nuxt you might want to calculate the
store's content on the server and store it in the client's local storage while
hydrating. You can use this snippet to start:

```typescript
const useComplicatedStore = defineCachedStore({
  id: 'magic',

  caching: {
    // Don't write to a cache while performing SSR. You'll need to check your
    // SSR framework's docs to find out how to check if SSR is currently
    // running.
    storage: import.meta.env.SSR ? null : window.localStorage,
  },

  state: () => ({ value: 1 }),

  async refresh() {
    this.value = calculateValue();
  },

  // Don't just copy this, read the note below.
  hydrate(storeState, initialState) {
    this.$flushCache();
  },
});
```

Note that you might not even need `hydrate`. If the store is pre-filled from
rendering server-side, there isn't really a need to blindly copy that data to
the user's local storage. An exception to this suggestion would be if you
`$load()` different values into the store during the lifecycle of you app. In
that case it might be beneficial to cache the server-rendered dataset on the
client as well.

You might also want to check out
[Vue's hydration guide](https://ssr.vuejs.org/guide/hydration.html),
[the corresponding Pinia guide](https://pinia.vuejs.org/ssr/), and
[the docs on Pinia's `hydrate` option](https://pinia.vuejs.org/api/interfaces/pinia.DefineStoreOptions.html#hydrate).

#### Secondary payloads

The `$load` method accepts a second argument which will be passed verbatim to
your `refresh` method. You can use this to provide data when refreshing that is
not factored in when calculating a key for caching. Since caches are stored
under a key that depends on what you pass as the first argument, you need to use
the second payload if you have data that isn't part of the state key. This
payload is also passed to `checkValidity`, if provided.

As an example, we could rewrite the pi store from above to use this argument for
the number of iterations. That way we only get one local storage entry if we
call it multiple times (this time with TypeScript):

```typescript
import { defineCachedStore } from 'pinia-cached-store';

const usePiStore = defineCachedStore({
  id: 'pi',

  state: () => ({
    value: 3.14,
    iterations: 0,
  }),

  async refresh(options: {}, iterations: number) {
    this.value = thePiAlgorithmFromAbove(iterations);
    this.iterations = iterations;
  },

  caching: {
    checkValidity(data: { iterations: number }, requestedIterations: number) {
      // Only recalculate when more iterations are requested:
      return iterations >= requestedIterations;
    },
  },
});
```

When calling the store now, a recalculation will only be performed if the number
of iterations requested is higher than that from the last calculation. Further,
local storage will only contain one entry for this store.

### Caching options

The object passed to the store factory function may also contain a set of
options to control the caching behaviour:

```typescript
export const store = defineCachedStore({
  // ...

  caching: {
    keyPrefix: 'myStore',
  },
});
```

Following options are supported (all are optional):

- **keyPrefix** — By default, cache entries are stored into local storage
  entries named `store` followed by the store ID and a base64 representation of
  the provided options. This option can be used to change that prefix to
  something else.
- **refreshSpecificKey** — Set this to `false` to use one cache key for the
  entire store. By default (`true`), different cache entries are created
  depending on the options which `$load` is called with (as described in the
  guide above). Note that disabling this behaviour will effectively invalidate
  options you give to `$load` in a second call because then the cache will be
  used instead (which may have been populated with other arguments).
- **maxAge** — This is the maximum age a cache entry may have before it is
  considered stale and needs to be refetched. Provide this as a number, in
  milliseconds (the default is 86400000, or a day).
- **checkValidity** — In addition to `maxAge`, this option can be used to modify
  how existing cache entries get loaded. It is set to a function that receives
  the (old) data and returns either `true` or `false`, depending on whether it
  should be loaded or discarded and refetched.
- **loadingKey** — Set this to the name of a boolean property defined in `state`
  and it will automatically be set to `true` when loading starts. After loading
  is finished (with or without errors), it will be set back to `false`. The
  property will not be created, it needs to exist in the state already.
- **storage** — Use this option to use a different
  [Storage](https://developer.mozilla.org/en-US/docs/Web/API/Storage) object to
  save the cache. By default, the browser's local storage is used. Make sure to
  handle SSR somehow if you set this option. If you set this to `null`, no
  storage is used and the cache is effectively bypassed.

You can get final caching key that is actually used from the stores'
`computedCacheKey` property. It is set after calling `$load`.

### Error handling

For error logging / handling, you can use Pinia's
[subscription mechanism](https://pinia.esm.dev/core-concepts/actions.html#subscribing-to-actions).
Using a subscription, you can perform additional actions before and after the
load process runs:

```typescript
let isLoading = false;

store.$onAction(({ name, after, onError }) => {
  if (name !== '$load') return;

  isLoading = true;

  after(() => (isLoading = false));
  onError((error) => {
    isLoading = false;
    console.warn(`Error while loading store: ${error}`);
  });
});
```

See the aforementioned documentation for more details. In particular, note that
the subscription lives as long as the component it was created in. Further,
`$onAction` returns a function that can be used to manually terminate the
subscription if necessary.

## License

[MIT](https://github.com/iWeltAG/pinia-cached-store/LICENSE)
