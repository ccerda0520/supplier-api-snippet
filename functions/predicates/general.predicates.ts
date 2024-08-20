import isEqual from 'lodash/fp/isEqual';
import intersection from 'lodash/fp/intersection';
import pick from 'lodash/fp/pick';

export const isEqualOnSharedKeys = (obj1: Record<string, any>, obj2: Record<string, any>) => {
  const sharedKeys = intersection(Object.keys(obj1), Object.keys(obj2));
  const obj1Shared = pick(sharedKeys, obj1);
  const obj2Shared = pick(sharedKeys, obj2);

  return isEqual(obj1Shared, obj2Shared);
};

export const keyExistsAndNotNull = (obj: Record<string, any> | undefined, key: string) => {
  if (typeof obj !== 'object') {
    return false;
  }

  if (!obj.hasOwnProperty(key)) {
    return false;
  }

  return obj.key !== null;
};
