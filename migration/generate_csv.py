
import json
import csv

def create_shopify_csv(products):
    """
    Creates a Shopify import CSV file from a list of products.
    """
    headers = [
        'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published',
        'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 'Option3 Name', 'Option3 Value',
        'Variant SKU', 'Variant Grams', 'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy',
        'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price', 'Variant Requires Shipping',
        'Variant Taxable', 'Variant Barcode', 'Image Src', 'Image Position', 'Image Alt Text',
        'Metafield: custom.features [multi_line_text_field]',
        'Metafield: custom.technical_specifications [json]',
        'Metafield: custom.datasheet [list.file_reference]',
        'Metafield: custom.extended_information [multi_line_text_field]'
    ]

    with open('shopify_import.csv', 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(headers)

        for product in products:
            handle = product.get('handle', '')
            title = product.get('title', '')
            body_html = product.get('parsed_description', '')
            vendor = product.get('vendor', '')
            product_type = '' # Not in the JSON data
            tags = ','.join(product.get('category_ids', []))
            published = 'true'
            
            # For simplicity, we're not handling variants with options in this script.
            # This would require a more complex logic to handle the options.
            if product.get('option_ids'):
                # Skipping products with options for now
                continue

            sku = product.get('code', '')
            grams = product.get('weight', 0) * 453.592 # Convert lbs to grams
            inventory_qty = product.get('inventory', 0)
            price = product.get('price', 0)
            compare_at_price = product.get('compare_at_price', '')
            barcode = product.get('barcode', '')
            image_src = product.get('image_url', '')
            image_alt_text = product.get('image_alt', '')

            # Metafields
            features = product.get('original_data', {}).get('features_text', '')
            
            tech_specs_divs = product.get('original_data', {}).get('tech_specs_divs', [])
            tech_specs_json = {}
            for item in tech_specs_divs:
                if ':' in item:
                    key, value = item.split(':', 1)
                    tech_specs_json[key.strip()] = value.strip()
            
            datasheet_links = product.get('original_data', {}).get('tech_specs_links', [])
            
            extended_info = product.get('original_data', {}).get('extended_info_text', '')

            row = [
                handle, title, body_html, vendor, product_type, tags, published,
                '', '', '', '', '', '', # Option fields
                sku, grams, 'shopify', inventory_qty, 'deny', 'manual', price, compare_at_price,
                'true', 'true', barcode, image_src, 1, image_alt_text,
                features,
                json.dumps(tech_specs_json) if tech_specs_json else '',
                ','.join(datasheet_links),
                extended_info
            ]
            writer.writerow(row)

def main():
    """
    Reads the parsed_products.json file and generates the Shopify import CSV.
    """
    try:
        with open('parsed_products.json', 'r') as f:
            products = json.load(f)
    except FileNotFoundError:
        print("Error: parsed_products.json not found.")
        return

    create_shopify_csv(products)
    print("Shopify import CSV created: shopify_import.csv")

if __name__ == '__main__':
    main()
