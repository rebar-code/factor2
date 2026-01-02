
async function createProductWithVariants(
  product: Product,
  fileMappings: FileMappings,
  categoryMappings: Map<string, string>,
  productOptions: ProductOptions,
  locationId: string
): Promise<{ id: string; handle: string; variantId?: string } | null> {

  // Replace file URLs in all content
  const description = replaceFileUrls(product.description, fileMappings);
  const features = product.original_data.features;
  const techSpecs = product.original_data.tech_specs;
  const extendedInfo = product.original_data.extended_info;

  // Get Shopify collection IDs
  const collectionIds = product.category_ids
    .map(catId => categoryMappings.get(catId))
    .filter(Boolean) as string[];

  // Convert pounds to grams (Shopify uses grams)
  const weightInGrams = Math.round(product.weight * 453.592);

  const productVariants = productOptions[product.code];
  const hasVariants = productVariants && productVariants.length > 0;

  const input: any = {
    title: product.title,
    handle: product.handle,
    descriptionHtml: description,
    vendor: product.vendor || product.manufacturer || '',
    productType: '',
    status: 'ACTIVE',
    seo: {
      title: product.seo_title || product.title,
      description: product.seo_description || '',
    },
  };

  if (hasVariants) {
    input.options = [...new Set(productVariants.map(v => v.optionName))];
    input.variants = productVariants.map(variant => ({
      options: [variant.optionValue],
      price: (product.price + variant.priceDiff).toFixed(2),
      sku: `${product.code}-${variant.optionValue.replace(/[^a-zA-Z0-9]/g, '')}`,
      barcode: product.barcode || null,
      weight: weightInGrams,
      weightUnit: 'GRAMS',
      inventoryPolicy: 'DENY',
    }));
  } else {
    input.variants = [{
      price: product.price.toFixed(2),
      compareAtPrice: product.compare_at_price && product.compare_at_price > product.price
        ? product.compare_at_price.toFixed(2)
        : null,
      sku: product.code,
      barcode: product.barcode || null,
      weight: weightInGrams,
      weightUnit: 'GRAMS',
      inventoryPolicy: 'DENY',
    }];
  }

  // Prepare media for product image
  const media: any[] = [];
  if (product.image_url) {
    const newImageUrl = fileMappings[product.image_url]?.new_url || product.image_url;
    media.push({
      alt: product.image_alt || product.title,
      mediaContentType: 'IMAGE',
      originalSource: newImageUrl,
    });
  }

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would create product:`, {
      title: input.title,
      handle: input.handle,
      price: product.price,
      collections: collectionIds.length,
      variants: input.variants.length
    });
    return {
      id: `gid://shopify/Product/dry-run-${product.code}`,
      handle: product.handle,
      variantId: `gid://shopify/ProductVariant/dry-run-${product.code}`
    };
  }

  try {
    // Create product with media and variants
    const variables: any = { input };
    if (media.length > 0) {
      variables.media = media;
    }

    const result = await shopifyGraphQL(CREATE_PRODUCT_WITH_VARIANTS_MUTATION, variables);

    if (result.data?.productCreate?.userErrors?.length > 0) {
      console.error(`      ❌ Error creating product:`, result.data.productCreate.userErrors);
      return null;
    }

    const createdProduct = result.data?.productCreate?.product;
    if (!createdProduct) {
      console.error(`      ❌ No product returned`);
      return null;
    }

    console.log(`      ✓ Product created: ${createdProduct.handle}`);

    // Set metafields via REST API
    const productNumericId = createdProduct.id.split('/').pop();
    if (productNumericId) {
        const metafields = [
            { namespace: 'custom', key: 'features', value: features, type: 'multi_line_text_field' },
            { namespace: 'custom', key: 'technical_specifications', value: techSpecs, type: 'json' },
            { namespace: 'custom', key: 'datasheet', value: JSON.stringify(product.original_data.tech_specs_links), type: 'list.file_reference' },
            { namespace: 'custom', key: 'extended_information', value: extendedInfo, type: 'multi_line_text_field' },
            { namespace: 'custom', key: 'volusion_product_code', value: product.code, type: 'single_line_text_field' }
        ];

        for (const metafield of metafields) {
            if (metafield.value) {
                try {
                    await shopifyREST(`/products/${productNumericId}/metafields.json`, 'POST', { metafield });
                    console.log(`      🏷️  Metafield set: ${metafield.key}`);
                } catch (metafieldError: any) {
                    console.log(`      ⚠️  Warning: Failed to set metafield ${metafield.key}:`, metafieldError.message);
                }
            }
        }
    }


    // Assign to collections
    if (collectionIds.length > 0) {
      let assignedCount = 0;
      for (const collectionId of collectionIds) {
        try {
          const collectionResult = await shopifyGraphQL(ASSIGN_TO_COLLECTION_MUTATION, {
            id: collectionId,
            productIds: [createdProduct.id]
          });

          if (collectionResult.data?.collectionAddProducts?.userErrors?.length > 0) {
            console.error(`      ⚠️  Failed to add to collection ${collectionId}:`,
              collectionResult.data.collectionAddProducts.userErrors);
          } else {
            assignedCount++;
          }
        } catch (error: any) {
          console.error(`      ⚠️  Exception adding to collection ${collectionId}:`, error.message);
        }
      }
      console.log(`      🏷️  Assigned to ${assignedCount}/${collectionIds.length} collections`);
    }

    return {
      id: createdProduct.id,
      handle: createdProduct.handle,
      variantId: createdProduct.variants?.edges?.[0]?.node?.id || undefined
    };
  } catch (error: any) {
    console.error(`      ❌ Exception creating product:`, error.message);
    return null;
  }
}
