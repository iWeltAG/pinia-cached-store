import {
  DefineStoreOptions,
  StateTree,
  _GettersTree,
  StoreDefinition,
  defineStore,
} from 'pinia';
import { Ref, UnwrapRef } from 'vue-demi';

import { encode, objectRepresentation, decode } from './utils';

const DEFAULT_MAX_AGE = 86400000;

// This type function returns - given a state interface - all the keys that have
// a boolean value.
type ExtractBooleanStateKeys<State extends StateTree> = {
  [K in keyof State]: State[K] extends boolean | Ref<boolean> ? K : never;
}[keyof State];

interface CachedStateTree extends StateTree {
  computedCacheKey?: string;
}

export interface CachingOptions<
  State extends CachedStateTree,
  RefreshPayload = void
> {
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
   * Custom callback for checking if store data is still valid.
   *
   * If provided, this function will be called before already cached data is
   * loaded from the store. If a falsy value is returned here, the data will be
   * discarded and will be refetched.
   *
   * @param data The state that is in the cache and could be loaded.
   * @returns `true` when the state object passed in as `data` is valid, `false`
   *   otherwise.
   */
  checkValidity?: (
    data: UnwrapRef<CachedStateTree>,
    payload: RefreshPayload
  ) => boolean;

  /**
   * This option can be used to add a property to the state that shows whether
   * the store is currently loading data. It should be set to the name of an
   * existing (boolean) option in the state. The caching framework will then
   * automatically update it's value when loading data.
   */
  loadingKey?: ExtractBooleanStateKeys<State>;

  /**
   * Storage object to use. By default, this is `window.localStorage`.
   */
  storage?: Storage | null;
}

export interface CachedStoreOptions<
  Id extends string,
  State extends CachedStateTree,
  Getters extends _GettersTree<State>,
  RefreshOptions,
  RefreshPayload = void
> extends Omit<DefineStoreOptions<Id, State, Getters, {}>, 'state'> {
  // We override the original state to make sure it's non-optional.
  state: () => State;
  // It isn't allowed to define your own actions (yet).
  actions?: never;

  /**
   * Refresh function to populate the store with new data.
   *
   * This function should be implemented to query current, up-to-date
   * information from the backend and set it in the store (using `this`).
   *
   * @param options Contextual information about which data to fetch.
   * @param payload Arbitrary secondary payload.
   */
  refresh(
    this: UnwrapRef<State>,
    options: RefreshOptions,
    payload: RefreshPayload
  ): Promise<void>;

  caching?: CachingOptions<State, RefreshPayload>;
}

interface CachedStoreResultingActions<RefreshOptions, RefreshPayload> {
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
   * @param payload Arbitrary payload to pass on. This argument does not factor
   *   in to the caching key calculation.
   */
  $load(options: RefreshOptions, payload: RefreshPayload): Promise<void>;

  /**
   * Write the current state to the cache.
   *
   * This will happen automatically, so you probably won't need to call this
   * method yourself.
   */
  $flushCache(): void;

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
  state: UnwrapRef<State>;
  timestamp: number;
}

export function defineCachedStore<
  Id extends string,
  State extends CachedStateTree,
  Getters extends _GettersTree<State>,
  RefreshOptions,
  RefreshPayload = void
>(
  options: CachedStoreOptions<
    Id,
    State,
    Getters,
    RefreshOptions,
    RefreshPayload
  >
): StoreDefinition<
  Id,
  State,
  Getters,
  CachedStoreResultingActions<RefreshOptions, RefreshPayload>
> {
  const cachingOptions = options.caching ?? {};
  // Note that the default storage (when undefined is set) evaulates to
  // localStorage, but the user can still set it to null.
  const storage =
    cachingOptions.storage === undefined
      ? window.localStorage
      : cachingOptions.storage;
  const refresh = options.refresh;

  if (
    cachingOptions?.loadingKey &&
    (cachingOptions.loadingKey === 'computedCacheKey' ||
      typeof options.state()[cachingOptions.loadingKey] !== 'boolean')
  ) {
    throw Error('Failed to initialize store: invalid loading key');
  }

  return defineStore({
    ...options,

    actions: {
      async $load(
        refreshOptions: RefreshOptions,
        refreshPayload: RefreshPayload
      ) {
        this.$reset();

        const setLoadingKey = (value: boolean) => {
          if (cachingOptions?.loadingKey) {
            this.$patch({
              [cachingOptions.loadingKey]: value,
            } as Partial<State>);
          }
        };

        const cacheKeySuffix =
          cachingOptions?.refreshSpecificKey ?? true
            ? objectRepresentation(refreshOptions)
            : '0';
        this.computedCacheKey = [
          cachingOptions?.keyPrefix ?? 'store',
          options.id,
          cacheKeySuffix,
        ].join('-');

        const getExistingCacheData = () => {
          if (!this.computedCacheKey) {
            return null;
          }
          // Using || instead of ?? here to also catch empty storage entries.
          const rawCacheData = storage?.getItem(this.computedCacheKey) || null;
          if (rawCacheData === null) {
            return null;
          }
          try {
            const data = decode<CacheData<State>>(rawCacheData);
            if (!isFinite(data.timestamp) || typeof data.state !== 'object') {
              return null;
            }

            // Check whether the data is expired.
            if (
              data.timestamp <
              Date.now() - (cachingOptions?.maxAge ?? DEFAULT_MAX_AGE)
            ) {
              return null;
            }

            // If given, use the user-provided validity check function.
            if (
              cachingOptions?.checkValidity &&
              !cachingOptions.checkValidity(data.state, refreshPayload)
            ) {
              return null;
            }

            return data;
          } catch (error) {
            return null;
          }
        };

        const existingCacheData = getExistingCacheData();
        if (existingCacheData !== null) {
          this.$patch(existingCacheData.state);
          setLoadingKey(false);
          return;
        }

        try {
          setLoadingKey(true);
          await refresh.call(this, refreshOptions, refreshPayload);
        } catch (error: any) {
          storage?.removeItem(this.computedCacheKey);
          setLoadingKey(false);
          throw Error(
            `Error while refreshing cache ${options.id}` +
              (error.message ? `: ${error.message}` : '.')
          );
        }

        this.$flushCache();
        setLoadingKey(false);
      },

      $flushCache() {
        if (!this.computedCacheKey) {
          return;
        }
        const newCacheData: CacheData<State> = {
          state: this.$state,
          timestamp: Date.now(),
        };
        storage?.setItem(this.computedCacheKey, encode(newCacheData));
      },

      $clearCache() {
        for (const key of Object.keys(storage ?? {})) {
          if (
            key.startsWith(
              `${cachingOptions?.keyPrefix ?? 'store'}-${options.id}-`
            )
          ) {
            storage?.removeItem(key);
          }
        }
        this.$reset();
      },
    },
  });
}
