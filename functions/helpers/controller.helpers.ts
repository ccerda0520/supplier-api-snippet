import { Request } from 'express';
import { z } from 'zod';
import { Pagination } from 'commons-ephesus/schemas/supplier-api/shared.schema';

export function getFullUrl(req: Request): URL {
  return new URL(`${req.protocol}://${req.hostname}${req.originalUrl}`);
}

export function getPagination<T extends any[]>(
  req: Request,
  {
    page_index,
    page_size,
    count,
  }: {
    page_index: number;
    page_size: number;
    count: number;
  },
): Required<z.infer<typeof Pagination>> {
  const next_page_exists = count > (page_index + 1) * page_size;

  let next_page_url: URL | null = null;
  if (next_page_exists) {
    next_page_url = getFullUrl(req);
    next_page_url.searchParams.set('page_index', (page_index + 1).toString());
  }

  return {
    page_size,
    page_index,
    next_page_exists,
    items_total: count,
    next_page_index: next_page_exists ? page_index + 1 : null,
    next_page_url: next_page_url?.toString() ?? null,
    pages_total: Math.ceil(count / page_size),
  };
}
