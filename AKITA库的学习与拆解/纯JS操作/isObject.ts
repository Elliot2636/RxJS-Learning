// 判断是不是对象 函数也算是对象
// @internal
export function isObject(value: any) {
  const type = typeof value;
  return value != null && (type == 'object' || type == 'function');
}