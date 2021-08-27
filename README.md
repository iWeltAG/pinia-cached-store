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
pi.$load({ iterations: 99999 });

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

onMounted(() => {
  pizza.$load({ pizzaName: 'hawaii' });
});
```

Multiple `$load()` calls (either consecutively or after a page refresh) will
prioritize cached content. Cache entries are considered applicable if they were
created from the same options object as the current call:

```typescript
// This will call refresh() with our objects object:
pizza.$load({ pizzaName: 'hawaii' });
// Here, refresh() is called again, since we have a new options object:
pizza.$load({ pizzaName: 'hawaii', extraCheese: true });
// Again, this will call refresh():
pizza.$load({ pizzaName: 'hawaii' });
// Since this object was passed before, this is loaded from cache:
pizza.$load({ extraCheese: true, pizzaName: 'hawaii' });
```

#### Cache clearing

To remove all entries from local storage corresponding a store, call the
`$clearCache` action. Since this will reset the store to the initial state (the
one returned by the `state` function in the store's definition), you probably
want to load some data again afterwards:

```typescript
pizza.$clearCache();
pizza.$load({ pizzaName: 'margherita' });
```

Note that this will only clear that specific store's cache — those of other
stores are left untouched.

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
- **storage** — Use this option to use a different
  [Storage](https://developer.mozilla.org/en-US/docs/Web/API/Storage) object to
  save the cache. By default, the Browser's local storage is used.

## License

[MIT](https://github.com/iWeltAG/pinia-cached-store/LICENSE)
