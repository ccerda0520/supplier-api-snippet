import { z } from 'zod';

export function IsZodSchema(obj: any): obj is z.ZodSchema<any, any> {
  if (!obj) return false;
  return 'safeParse' in obj;
}

export function IsZodObject(obj: any): obj is z.ZodObject<any, any> {
  if (!obj) return false;
  return IsZodSchema(obj) && obj._def.typeName === 'ZodObject';
}

export function IsZodOptional(obj: any): obj is z.ZodOptional<any> {
  if (!obj) return false;
  return IsZodSchema(obj) && obj._def.typeName === 'ZodOptional';
}
