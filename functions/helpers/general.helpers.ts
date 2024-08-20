import pickBy from 'lodash/pickBy';
import identity from 'lodash/identity';

export function omitUndefined(object: Record<string, any>) {
  return pickBy(object, identity);
}
