import { BatchProduct } from 'commons-ephesus/schemas/supplier-api/product.schema';

const productValidBase: BatchProduct = {
  productKey: 'productValid',
  tags: [],
  name: 'productValid',
  active: true,
  options: ['option1'],
  images: [
    { url: 'https://cdn.shopify.com/s/files/1/0718/9263/1853/products/MaroonHat2.jpg?v=1675282132' },
    { url: 'https://cdn.shopify.com/s/files/1/0718/9263/1853/products/MaroonHat.jpg?v=1675282132' },
  ],
  variants: [
    {
      variantKey: 'productValid-1',
      active: true,
      name: 'something',
      sku: 'productValid-1',
      price: {
        amount: 10,
      },
      stock: {
        quantity: 10,
        unlimited: false,
      },
      options: {
        option1: 'value1',
      },
      images: [{ url: 'https://cdn.shopify.com/s/files/1/0718/9263/1853/products/MaroonHat2.jpg?v=1675282132' }],
    },
    {
      variantKey: 'productValid-2',
      active: true,
      name: 'something2',
      sku: 'productValid-2',
      price: {
        amount: 12,
      },
      stock: {
        quantity: 12,
        unlimited: false,
      },
      options: {
        option1: 'value2',
      },
    },
  ],
};

const validProducts: BatchProduct[] = [];
for (let i = 0; i < 10; i++) {
  validProducts.push({
    ...productValidBase,
    productKey: `productValid-${i}`,
    variants: [
      ...productValidBase.variants.map((variant, index) => ({ ...variant, variantKey: `productValid-${i}-${index}` })),
    ],
  });
}

const productInvalidNoProductKey = {
  ...productValidBase,
  productKey: null,
  variants: [
    ...productValidBase.variants.map((variant, index) => ({ ...variant, variantKey: `productValid-noproductkey-1` })),
  ],
};

const productInvalidNoVariantKey = {
  ...productValidBase,
  productKey: 'productInvalidNoVariantKey',
  variants: [...productValidBase.variants.map((variant, index) => ({ ...variant, variantKey: null }))],
};

const productInvalidDuplicateVariantKeys = {
  ...productValidBase,
  productKey: 'productInvalidDuplicateVariantKeys',
  variants: [
    {
      ...productValidBase.variants[0],
      variantKey: 'productInvalidDuplicateVariantKeys-1',
    },
    {
      ...productValidBase.variants[0],
      options: {
        option1: 'value2',
      },
      variantKey: 'productInvalidDuplicateVariantKeys-1',
    },
  ],
};
export const batchSimple = {
  batch: {
    batchDate: new Date(),
    batchName: 'batchSimpleNoErrors',
  },
  products: [validProducts[0]],
};

export const batchMany = {
  batch: {
    batchDate: new Date(),
    batchName: 'batchSimpleNoErrors',
  },
  products: [validProducts[0], validProducts[1], validProducts[2], validProducts[3], validProducts[4]],
};

export const batchTooManyErrors = {
  batch: {
    batchDate: new Date(),
    batchName: 'batchTooManyErrors',
  },
  products: [productInvalidNoProductKey, productInvalidDuplicateVariantKeys],
};

export const batchSuccessWithProductKeyNullError = {
  batch: {
    batchDate: new Date(),
    batchName: 'batchSuccessWithProductKeyNullError',
  },
  products: [validProducts[0], validProducts[1], validProducts[2], productInvalidNoProductKey],
};

export const batchSuccessWithVariantKeyNullError = {
  batch: {
    batchDate: new Date(),
    batchName: 'batchSuccessWithProductKeyNullError',
  },
  products: [validProducts[0], validProducts[1], validProducts[2], validProducts[3], productInvalidNoVariantKey],
};

export const batchSuccessWithProductKeyDuplicateError = {
  batch: {
    batchDate: new Date(),
    batchName: 'batchSuccessWithProductKeyDuplicateError',
  },
  products: [
    validProducts[0],
    validProducts[0],
    validProducts[1],
    validProducts[2],
    validProducts[3],
    validProducts[4],
  ],
};

export const batchSuccessWithVariantKeyDuplicateError = {
  batch: {
    batchDate: new Date(),
    batchName: 'batchSuccessWithVariantKeyDuplicateError',
  },
  products: [
    validProducts[0],
    validProducts[1],
    validProducts[2],
    validProducts[3],
    validProducts[4],
    validProducts[5],
    {
      ...validProducts[5],
      productKey: 'notaduplicatekey',
    },
  ],
};

export const batchSuccessWithProductDuplicateOptionsError = {
  batch: {
    batchDate: new Date(),
    batchName: 'batchSuccessWithProductDuplicateOptionsError',
  },
  products: [
    validProducts[0],
    validProducts[1],
    validProducts[2],
    {
      ...validProducts[3],
      variants: [
        validProducts[3].variants[0],
        {
          ...validProducts[3].variants[0],
          variantKey: 'batchSuccessWithProductDuplicateOptionsError',
        },
      ],
    },
  ],
};

export const batchSuccessWithProductNoProductKeyError = {
  batch: {
    batchDate: new Date(),
    batchName: 'batchSuccessWithProductNoProductKeyError',
  },
  products: [
    validProducts[0],
    validProducts[1],
    validProducts[2],
    {
      ...validProducts[3],
      productKey: undefined,
    },
  ],
};
export const batchSuccessWithProductNoVariantKeyError = {
  batch: {
    batchDate: new Date(),
    batchName: 'batchSuccessWithProductNoProductKeyError',
  },
  products: [
    validProducts[0],
    validProducts[1],
    validProducts[2],
    {
      ...validProducts[3],
      variants: [
        {
          ...validProducts[3].variants[0],
          variantKey: undefined,
        },
      ],
    },
  ],
};
export const batchSuccessWithProductNoOptionsError = {
  batch: {
    batchDate: new Date(),
    batchName: 'batchSuccessWithProductNoOptionsError',
  },
  products: [
    validProducts[0],
    validProducts[1],
    validProducts[2],
    {
      ...validProducts[3],
      options: [],
      variants: [
        {
          ...validProducts[3].variants[0],
          variantKey: 'batchSuccessWithProductNoOptionsError',
        },
      ],
    },
  ],
};
export const batchSuccessWithProductOptionsNullError = {
  batch: {
    batchDate: new Date(),
    batchName: 'batchSuccessWithProductOptionsNullError',
  },
  products: [
    validProducts[0],
    validProducts[1],
    validProducts[2],
    {
      ...validProducts[3],
      options: null,
      variants: [
        {
          ...validProducts[3].variants[0],
          variantKey: 'batchSuccessWithProductOptionsNullError',
        },
      ],
    },
  ],
};
export const batchSuccessWithProductOptionsMissingError = {
  batch: {
    batchDate: new Date(),
    batchName: 'batchSuccessWithProductOptionsMissingError',
  },
  products: [
    validProducts[0],
    validProducts[1],
    validProducts[2],
    {
      ...validProducts[3],
      variants: [
        {
          ...validProducts[3].variants[0],
          variantKey: 'batchSuccessWithProductOptionsMissingError',
          options: { ...validProducts[3].variants[0].options, invalidKey: 'something' },
        },
      ],
    },
  ],
};
export const batchSuccessWithProductOptionsSpecifiedVariantOptionsEmptyError = {
  batch: {
    batchDate: new Date(),
    batchName: 'batchSuccessWithProductOptionsSpecifiedVariantOptionsEmptyError',
  },
  products: [
    validProducts[0],
    validProducts[1],
    validProducts[2],
    {
      ...validProducts[3],
      variants: [
        {
          ...validProducts[3].variants[0],
          variantKey: 'batchSuccessWithProductOptionsSpecifiedVariantOptionsEmptyError',
          options: {},
        },
      ],
    },
  ],
};
export const batchSuccessWithProductOptionsSpecifiedVariantOptionsNullError = {
  batch: {
    batchDate: new Date(),
    batchName: 'batchSuccessWithProductOptionsSpecifiedVariantOptionsNullError',
  },
  products: [
    validProducts[0],
    validProducts[1],
    validProducts[2],
    {
      ...validProducts[3],
      variants: [
        {
          ...validProducts[3].variants[0],
          variantKey: 'batchSuccessWithProductOptionsSpecifiedVariantOptionsNullError',
          options: null,
        },
      ],
    },
  ],
};
export const batchSuccessWithProductOptionsSpecifiedVariantOptionsDontMatchError = {
  batch: {
    batchDate: new Date(),
    batchName: 'batchSuccessWithProductOptionsSpecifiedVariantOptionsDontMatchError',
  },
  products: [
    validProducts[0],
    validProducts[1],
    validProducts[2],
    {
      ...validProducts[3],
      variants: [
        {
          ...validProducts[3].variants[0],
          variantKey: 'batchSuccessWithProductOptionsSpecifiedVariantOptionsDontMatchError',
          options: { ...validProducts[3].variants[0].options, invalidKey: 'something' },
        },
      ],
    },
  ],
};
export const batchSuccessWithProductOptionsSpecifiedVariantOptionsDuplicatedCaseInsensitiveError = {
  batch: {
    batchDate: new Date(),
    batchName: 'batchSuccessWithProductOptionsSpecifiedVariantOptionsDuplicatedCaseInsensitiveError',
  },
  products: [
    validProducts[0],
    validProducts[1],
    validProducts[2],
    {
      ...validProducts[3],
      variants: [
        ...validProducts[3].variants,
        {
          ...validProducts[3].variants[0],
          variantKey: 'batchSuccessWithProductOptionsSpecifiedVariantOptionsDuplicatedCaseInsensitiveError',
          options: {
            ...validProducts[3].variants[0].options,
            option1: validProducts[3].variants[0].options?.option1?.toUpperCase(),
          },
        },
      ],
    },
  ],
};
export const batchSuccessWithProductSpecifiedVariantOptionsMissingError = {
  batch: {
    batchDate: new Date(),
    batchName: 'batchSuccessWithProductSpecifiedVariantOptionsMissingError',
  },
  products: [
    validProducts[0],
    validProducts[1],
    validProducts[2],
    {
      ...validProducts[3],
      options: [...validProducts[3].options, 'Option2'],
      variants: [
        {
          ...validProducts[3].variants[0],
          variantKey: 'batchSuccessWithProductSpecifiedVariantOptionsMissingError',
        },
      ],
    },
  ],
};
