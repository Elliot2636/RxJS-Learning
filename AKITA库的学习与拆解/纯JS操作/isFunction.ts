// 判断是不是函数
// @internal
export function isFunction(value: any): value is Function {
  return typeof value === 'function';
}
