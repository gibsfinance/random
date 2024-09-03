import _ from "lodash"

export const log = (pattern: any, ...a: any[]) => {
  if (_.isString(pattern)) {
    console.log(`%o ${pattern}`, ...[new Date()].concat(a))
  } else {
    console.log(`%o`, new Date(), pattern)
  }
}
