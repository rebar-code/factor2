
import { promises as fs } from 'fs';
import { parse } from 'csv-parse/sync';
import path from 'path';

const DATA_DIR = path.join(__dirname, 'data');
const OLD_SITE_DIR = path.join(__dirname, '..', 'old_site', 'export');

interface Option {
  id: string;
  optioncatid: string;
  optionsdesc: string;
  pricediff: string;
  applytoproductcodes: string;
}

interface OptionCategory {
  id: string;
  optioncategoriesdesc: string;
}

interface ProductOptions {
  [productCode: string]: {
    optionName: string;
    optionValue: string;
    priceDiff: number;
  }[];
}

async function convertProductOptions() {
  console.log('Converting product options...');

  try {
    const optionsContent = await fs.readFile(path.join(OLD_SITE_DIR, 'Options_JF8NF9JREE.csv'), 'utf-8');
    const optionCategoriesContent = await fs.readFile(path.join(OLD_SITE_DIR, 'OptionCategories_USJXRKU2QQ.csv'), 'utf-8');

    const options: Option[] = parse(optionsContent, {
      columns: true,
      skip_empty_lines: true,
    });

    const optionCategories: OptionCategory[] = parse(optionCategoriesContent, {
      columns: true,
      skip_empty_lines: true,
    });

    const categoryMap = new Map<string, string>();
    for (const category of optionCategories) {
      categoryMap.set(category.id, category.optioncategoriesdesc);
    }

    const productOptions: ProductOptions = {};

    for (const option of options) {
      const productCodes = option.applytoproductcodes.split(',').map(pc => pc.trim());
      for (const productCode of productCodes) {
        if (!productCode) continue;

        if (!productOptions[productCode]) {
          productOptions[productCode] = [];
        }

        productOptions[productCode].push({
          optionName: categoryMap.get(option.optioncatid) || '',
          optionValue: option.optionsdesc,
          priceDiff: parseFloat(option.pricediff) || 0,
        });
      }
    }

    await fs.writeFile(path.join(DATA_DIR, 'product-options.json'), JSON.stringify(productOptions, null, 2));
    console.log('✅ Product options converted and saved to migration/data/product-options.json');
  } catch (error) {
    console.error('❌ Error converting product options:', error);
    process.exit(1);
  }
}

convertProductOptions();
