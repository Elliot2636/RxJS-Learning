#
## 使用的rxjs
``` javascript
import { from, isObservable, of, OperatorFunction, ReplaySubject, Subscription } from 'rxjs';
import { filter, map, skip } from 'rxjs/operators';
```
## 变量
### 对外不可见变量
- `skipStorageUpdate`(跳过存储更新) bool defaultValue:false 作用: ?
- 
## 常量
### 对外不可见常量 前缀为_代表模块内私有
- `_persistStateInit`(持久化状态初始化) object 缓存容量为1的 `ReplaySubject` 是一个被隐藏的 `ReplaySubject` 作用: ?
## 函数
### 导出函数
- `selectPersistStateInit()` 作用: 用于隐藏`_persistStateInit`
- `setSkipStorageUpdate()`  作用: 修改`skipStorageUpdate`
- `getSkipStorageUpdate`  作用: 获取`skipStorageUpdate` 
- `isPromise` 作用: 判断是否是Promise
- `observify` 作用: 将参数转为一个可观察对象(参数若是异步类型调用`from`，否则调用`of`)
- `persistState` 作用: 返回一个符合`PersistState`接口的对象，(见下文源码) [官网返回对象使用链接](https://datorama.github.io/akita/docs/enhancers/persist-state/)
## 接口
- `PersistStateStorage` 作用: 声明`PersistStateStorage`上的方法
  - 三个方法: `getItem` `setItem` 返回类型`(type MaybeAsync<T = any> = Promise<T> | Observable<T> | T;)` `clear` 
- `PersistStateParams` 作用：声明`PersistState`上的接受的参数的具体外貌
  ``` typescript
  export interface PersistStateParams {
    /** 容器key */ 
    key: string;
    /** 在无浏览器环境中开启持久化存储 */
    enableInNonBrowser: boolean;
    /** 要使用的存储策略。 这默认为 LocalStorage，但您可以传递 SessionStorage 或任何实现 StorageEngine API 的内容。 */
    storage: PersistStateStorage;
    /** 自定义反序列化方法。 默认为 JSON.parse */
    deserialize: Function;
    /** 自定义序列化程序, 默认为 JSON.stringify */
    serialize: Function;
    /** 默认情况下，整个状态都保存到存储中，使用此参数仅包含您需要的存储. It can be a store name or a predicate callback.*/
    include: (string | ((storeName: string) => boolean))[];
    /** 默认情况下，整个状态都保存到存储中，使用此参数仅包含您需要的存储 */
    select: PersistStateSelectFn[];
    /**
     * import { persistState, PersistStateSelectFn } from '@datorama/akita';
     * const selectToken: PersistStateSelectFn<AuthState> = (state) => ({ token: state.token });
     * selectToken.storeName = 'auth';
     * persistState({ select: [selectToken] }); 
     *
     */

    preStorageUpdate(storeName: string, state: any): any;

    preStoreUpdate(storeName: string, state: any, initialState: any): any;

    skipStorageUpdate: () => boolean;
    preStorageUpdateOperator: () => OperatorFunction<any, any>; // 如果设置了include，则include中存储的数据更新时候会调用此方法
    /** 是否在PersistState销毁时动态存储 */
    persistOnDestroy: boolean;
  }
  ```
- `PersistState` 三个方法:  `destroy(): void;`  `clear(): void;`  `clearStore(storeName?: string): void;`

## 类型
- `PersistStateSelectFn` 交叉类型 作用：具有两个属性 一个是范型函数 `((store: T) => Partial<T>)` 一个是具有`storeName`，值为`string`类型的对象
- 
## 源码
``` typescript
import { from, isObservable, of, OperatorFunction, ReplaySubject, Subscription } from 'rxjs';
import { filter, map, skip } from 'rxjs/operators';
import { setAction } from './actions';
import { $$addStore, $$deleteStore } from './dispatchers';
import { getValue } from './getValueByString';
import { isFunction } from './isFunction';
import { isNil } from './isNil';
import { isObject } from './isObject';
import { hasLocalStorage, hasSessionStorage, isNotBrowser } from './root';
import { setValue } from './setValueByString';
import { __stores__ } from './stores';
import { HashMap, MaybeAsync } from './types';

let skipStorageUpdate = false;

const _persistStateInit = new ReplaySubject(1);

export function selectPersistStateInit() {
  return _persistStateInit.asObservable();
}

export function setSkipStorageUpdate(skip: boolean) {
  skipStorageUpdate = skip;
}

export function getSkipStorageUpdate() {
  return skipStorageUpdate;
}

export interface PersistStateStorage {
  getItem(key: string): MaybeAsync;

  setItem(key: string, value: any):  // MaybeAsync; MaybeAsync<T = any> = Promise<T> | Observable<T> | T;

  clear(): void;
}

function isPromise(v: any) {
  return v && isFunction(v.then);
}

function observify(asyncOrValue: any) {
  if (isPromise(asyncOrValue) || isObservable(asyncOrValue)) {
    return from(asyncOrValue);
  }

  return of(asyncOrValue);
}

export type PersistStateSelectFn<T = any> = ((store: T) => Partial<T>) & { storeName: string };


export interface PersistState {
  destroy(): void;
  /**
   * @deprecated Use clearStore instead.
   */
  clear(): void;
  clearStore(storeName?: string): void;
}

export function persistState(params?: Partial<PersistStateParams>): PersistState {
  // 默认实现
  const defaults: PersistStateParams = {
    key: 'AkitaStores',
    enableInNonBrowser: false,
    storage: !hasLocalStorage() ? params.storage : localStorage,
    deserialize: JSON.parse,
    serialize: JSON.stringify,
    include: [],
    select: [],
    persistOnDestroy: false,
    preStorageUpdate: function (storeName, state) {
      return state;
    },
    preStoreUpdate: function (storeName, state) {
      return state;
    },
    skipStorageUpdate: getSkipStorageUpdate,
    preStorageUpdateOperator: () => (source) => source,
  };

  // 将参数与默认参数合并
  const { storage, enableInNonBrowser, deserialize, serialize, include, select, key, preStorageUpdate, persistOnDestroy, preStorageUpdateOperator, preStoreUpdate, skipStorageUpdate } = Object.assign(
    {},
    defaults,
    params
  );

  // 如果(不是浏览器环境 && 切在非浏览器环境下没有开启缓存) || 没有指定缓存 直接返回
  if ((isNotBrowser && !enableInNonBrowser) || !storage) return;

  const hasInclude = include.length > 0;
  const hasSelect = select.length > 0;
  // Include与Select的使用方法的区别
  let includeStores: { fns: Function[]; [key: string]: Function[] | string };
  let selectStores: { [key: string]: PersistStateSelectFn };

  // 从这里可以看出Include与Select的区别，Include是多个StoreName对应一个fns Select是一个storeName对应一个selectFn
  if (hasInclude) {
    //   对include数组中的元素挨个操作 最后返回累加对象
    includeStores = include.reduce(
      (acc, path) => {
        if (isFunction(path)) {
          acc.fns.push(path);
        } else {
          const storeName = path.split('.')[0]; //string对象操作 从字符串中去除'.'后返回字符数组 中的首个元素
          acc[storeName] = path;
        }
        return acc;
      },
      { fns: [] }
    );
  }

  if (hasSelect) {
    //  对select数组中的元素挨个操作 最后返回累加对象
    selectStores = select.reduce((acc, selectFn) => {
      acc[selectFn.storeName] = selectFn;

      return acc;
    }, {});
  }

  let stores: HashMap<Subscription> = {}; // interface HashMap<T> {[id: string]: T;}  stores!!! 
  let acc = {};  // ？
  let subscriptions: Subscription[] = []; // 订阅者列表

  const buffer = []; // 缓冲

  // 清空buffer内的缓冲
  function _save(v: any) {
    // 创建一个Observable 并返回一个Subscription对象
    observify(v).subscribe(() => {
      const next = buffer.shift(); // 获取buffer中的首个元素 并移除
      next && _save(next); // 等价于 if(next){_save(next)} 即如果缓冲不为空数组就一直取出 模仿一个出栈操作
    });
  }

  // 当我们使用本地/会话存储时，我们执行序列化，否则我们让传递的存储实现来执行它
  const isLocalStorage = (hasLocalStorage() && storage === localStorage) || (hasSessionStorage() && storage === sessionStorage);

  // 获取storage上的key值 默认为 'AkitaStores' 将其转换为一个Observable对象并且订阅它 当其中发射出新值时候做出处理 (增加新的storageState) getItem为localStorage Api
  observify( storage.getItem(key) ).subscribe((value: any) => {
    let storageState = isObject(value) ? value : deserialize(value || '{}'); // 发出的值若不为object调用反序列化方案将json转为object 默认为 JSON.parse()

    // 查看新流入的值上是否有 '$cache' 属性，如果有将其与指定 storeCache 合并后存入storage
    function save(storeCache) {
      storageState['$cache'] = { ...(storageState['$cache'] || {}), ...storeCache };
      storageState = Object.assign({}, storageState, acc); //这里的acc是什么
      // 压栈
      buffer.push(storage.setItem(key, isLocalStorage ? serialize(storageState) : storageState)); // 序列化后将其再次存入全局storage 如果成功会在buffer中存入undefined
      _save(buffer.shift()); // 先移出存入buffer的undefined值 然后执行缓冲内的
    }


    function subscribe(storeName, path) {
      stores[storeName] = __stores__[storeName] // __stores__导入后应该是一个空值啊 ？？ 这里是什么情况
        ._select((state) => getValue(state, path))
        .pipe(
          skip(1),
          map((store) => {
            if (hasSelect && selectStores[storeName]) {
              return selectStores[storeName](store);
            }

            return store;
          }),
          filter(() => skipStorageUpdate() === false),
          preStorageUpdateOperator()
        )
        .subscribe((data) => {
          acc[storeName] = preStorageUpdate(storeName, data);
          Promise.resolve().then(() => save({ [storeName]: __stores__[storeName]._cache().getValue() }));
        });
    }

    // 保存初始值
    function setInitial(storeName, store, path) {
      if (storeName in storageState) {
        setAction('@PersistState');
        store._setState((state) => {
          return setValue(state, path, preStoreUpdate(storeName, storageState[storeName], state));
        });
        const hasCache = storageState['$cache'] ? storageState['$cache'][storeName] : false;
        __stores__[storeName].setHasCache(hasCache, { restartTTL: true });
      }
    }

    subscriptions.push(
      $$deleteStore.subscribe((storeName) => {
        if (stores[storeName]) {
          if (persistOnDestroy === false) {
            save({ [storeName]: false });
          }
          stores[storeName].unsubscribe();
          delete stores[storeName];
        }
      })
    );

    subscriptions.push(
      $$addStore.subscribe((storeName) => {
        if (storeName === 'router') {
          return;
        }

        const store = __stores__[storeName];
        if (hasInclude) {
          let path = includeStores[storeName];

          if (!path) {
            const passPredicate = includeStores.fns.some((fn) => fn(storeName));
            if (passPredicate) {
              path = storeName;
            } else {
              return;
            }
          }
          setInitial(storeName, store, path);
          subscribe(storeName, path);
        } else {
          setInitial(storeName, store, storeName);
          subscribe(storeName, storeName);
        }
      })
    );

    _persistStateInit.next();
  });

  return {
    destroy() {
      subscriptions.forEach((s) => s.unsubscribe());
      for (let i = 0, keys = Object.keys(stores); i < keys.length; i++) {
        const storeName = keys[i];
        stores[storeName].unsubscribe();
      }
      stores = {};
    },
    clear() {
      storage.clear();
    },
    // 清空store
    clearStore(storeName?: string) {
      if (isNil(storeName)) {
        const value = observify(storage.setItem(key, '{}'));
        value.subscribe();
        return;
      }
      const value = storage.getItem(key);
      observify(value).subscribe((v) => {
        const storageState = deserialize(v || '{}');

        if (storageState[storeName]) {
          delete storageState[storeName];
          const value = observify(storage.setItem(key, serialize(storageState)));
          value.subscribe();
        }
      });
    },
  };
}

```