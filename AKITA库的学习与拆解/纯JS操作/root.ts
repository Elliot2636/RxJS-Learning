// 输出两个加载后的常量 isBrowser 与 isNotBrowser 在容器构造中做判断使用
// 若为浏览器 typeof window值为'object'
export const isBrowser = typeof window !== 'undefined';
export const isNotBrowser = !isBrowser;

// export const isNativeScript = typeof global !== 'undefined' && (<any>global).__runtimeVersion !== 'undefined'; TODO is this used?

// 判断是否有localStorage
export const hasLocalStorage = () => {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
};

// 判断是否有sessionStorage
export const hasSessionStorage = () => {
  try {
    return typeof sessionStorage !== 'undefined';
  } catch {
    return false;
  }
};
