import {
  DefineStoreOptions,
  StateTree,
  GettersTree,
  StoreDefinition,
  defineStore,
} from 'pinia';
import { UnwrapRef } from 'vue';

import { encode, objectRepresentation, decode } from './utils';

export interface CachingOptions {
  /**
   * Custom prefix to use for all local storage entries.
   *
   * This can be used to improve separation when using many different cached
   * stores. The default value is `store`.
   */
  keyPrefix?: string;

  /**
   * Whether to use a different key for each set of refresh options.
   *
   * When this is truthy, multiple `$load()` calls (which will internally use
   * the defined `refresh` method) with different options each use a different
   * cache key. This is useful in situations where multiple independent sets of
   * data should be cached. When this option is falsy, the entire store will use
   * the same key.
   *
   * Note: when this is falsy, only the first set of refresh options will
   * effectively be valid because subsequent `$load()` calls will use the cache,
   * even if completely different options are given. Only when the cache is
   * stale will they be used again.
   *
   * The default value is `true`.
   */
  refreshSpecificKey?: boolean;

  /**
   * Age (in milliseconds) after which cached data is considered stale. If
   * data is older that this value, fresh content will be requested even if
   * the cache is actually populated.
   */
  maxAge?: number;

  /**
   * Storage object to use. By default, this is `window.localStorage`.
   */
  storage?: Storage;
}

export interface CachedStoreOptions<
  RefreshOptions,
  Id extends string,
  State extends StateTree,
  Getters extends GettersTree<State>
> extends DefineStoreOptions<Id, State, Getters, {}> {
  // We override the original state to make sure we always have something to
  // work with.
  state: () => State;

  /**
   * Refresh function to populate the store with new data.
   *
   * This function should be implemented to query current, up-to-date
   * information from the backend and set it in the store (using `this`).
   *
   * @param options Contextual information about which data to fetch.
   */
  refresh(this: UnwrapRef<State>, options: RefreshOptions): Promise<void>;

  caching?: CachingOptions;
}

interface CachedStoreResultingActions<RefreshOptions> {
  /**
   * Populate the store with data matching a given key.
   *
   * When called, this action will do look at the provided options set and do
   * one of the following:
   *
   * - If a matching, valid cache entry for the provided options is found, it
   *   will be loaded.
   * - Otherwise `refresh()` will be called which will fill the store with data
   *   (which normally comes from some remote endpoint). Then, this data is
   *   cached in local storage so subsequent calls with the same parameter can
   *   be handled locally.
   *
   * The `options` parameter has two purposes: first, it serves as the cache
   * key. That means that this object is used to determine whether the resulting
   * state of a previous `$load()` call can be used without needing to refetch
   * new data. It also allow a user to pass information to `refresh()` about the
   * current context, for example a user ID.
   *
   * @param options Contextual information used by the fetching function to get
   *   the correct data. This is also used as a caching key.
   */
  $load(options: RefreshOptions): Promise<void>;

  /**
   * Clear this store's local cache.
   *
   * This will clear cached data for any option sets that match the store's ID.
   * It will also reset that store to the initial state. That means a subsequent
   * `$load()` will be necessary.
   */
  $clearCache(): void;
}

export interface CacheData<State> {
  state: State;
  timestamp: number;
}

export function defineCachedStore<
  RefreshOptions,
  Id extends string,
  State extends StateTree,
  Getters extends GettersTree<State>
>(
  options: CachedStoreOptions<RefreshOptions, Id, State, Getters>
): StoreDefinition<
  Id,
  State,
  Getters,
  CachedStoreResultingActions<RefreshOptions>
> {
  const cachingOptions = options.caching;
  const storage = cachingOptions?.storage ?? window.localStorage;
  const refresh = options.refresh;

  return defineStore({
    id: options.id,
    state: options.state,
    getters: options.getters,

    actions: {
      async $load(refreshOptions: RefreshOptions) {
        this.$reset();

        const cacheKeySuffix =
          cachingOptions?.refreshSpecificKey ?? true
            ? objectRepresentation(refreshOptions)
            : '0';
        const cacheKey = `${cachingOptions?.keyPrefix ?? 'store'}-${
          options.id
        }-${cacheKeySuffix}`;

        const rawCacheData = storage.getItem(cacheKey);

        if (rawCacheData !== null) {
          const cacheData = decode<CacheData<State>>(rawCacheData);
          if (
            cacheData.timestamp >
            Date.now() - (cachingOptions?.maxAge ?? 86400000)
          ) {
            // When a cached value is available and not expired
            // (the default TTL is a day), we can load it.
            this.$patch(cacheData.state);
            return;
          }
        }

        try {
          await refresh.call(this, refreshOptions);
        } catch (error) {
          console.error(`Error while refreshing cache ${options.id}`, error);
          storage.removeItem(cacheKey);
          return;
        }

        // Write back any changes to the cache.
        const cacheData: CacheData<State> = {
          state: this.$state,
          timestamp: Date.now(),
        };
        storage.setItem(cacheKey, encode(cacheData));
      },

      $clearCache() {
        for (const key of Object.keys(storage)) {
          if (
            key.startsWith(
              `${cachingOptions?.keyPrefix ?? 'store'}-${options.id}-`
            )
          ) {
            storage.removeItem(key);
          }
        }
        this.$reset();
      },
    },
  });
}
