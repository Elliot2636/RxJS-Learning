# windos环境初始化
- `__DEV__` 开发环境
- `enableAkitaProdMode()`函数：删除`window`下的`$$stores`与`$$queries`两个属性(并将`__DEV__`改为false说明进入生产环境？)
``` javascript
import { isBrowser } from './root';
export let __DEV__ = true;
export function enableAkitaProdMode() {
  __DEV__ = false;
  if (isBrowser) {
    delete (window as any).$$stores;
    delete (window as any).$$queries;
  }
}

// @internal
export function isDev() {
  return __DEV__;
}
```

# 初始化 $$stores 与 $$stores
``` typescript
import { Query } from './query';
import { isBrowser } from './root';
import { Store } from './store';

// @internal
export const __stores__: { [storeName: string]: Store<any> } = {};

// @internal
export const __queries__: { [storeName: string]: Query<any> } = {};

if (isBrowser) {
  (window as any).$$stores = __stores__;
  (window as any).$$queries = __queries__;
}

```