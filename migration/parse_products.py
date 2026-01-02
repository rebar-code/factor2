
import json
from bs4 import BeautifulSoup

def parse_product_data(product):
    """
    Parses the HTML content in a product's description and original_data fields.
    """
    # Parse description
    description_html = product.get('description', '')
    soup = BeautifulSoup(description_html, 'html.parser')
    product['parsed_description'] = soup.get_text()

    # Parse original_data
    original_data = product.get('original_data', {})
    if not original_data:
        return product

    # Tech Specs
    tech_specs_html = original_data.get('tech_specs', '')
    if tech_specs_html:
        soup = BeautifulSoup(tech_specs_html, 'html.parser')
        
        # Extract links
        links = [a['href'] for a in soup.find_all('a', href=True)]
        original_data['tech_specs_links'] = links
        
        # Extract list items
        list_items = [li.get_text(strip=True) for li in soup.find_all('li')]
        original_data['tech_specs_list'] = list_items

        # Extract divs and spans
        divs = [div.get_text(strip=True) for div in soup.find_all('div')]
        original_data['tech_specs_divs'] = divs


    # Features
    features_html = original_data.get('features', '')
    if features_html:
        soup = BeautifulSoup(features_html, 'html.parser')
        original_data['features_text'] = soup.get_text(strip=True)

    # Extended Info
    extended_info_html = original_data.get('extended_info', '')
    if extended_info_html:
        soup = BeautifulSoup(extended_info_html, 'html.parser')
        original_data['extended_info_text'] = soup.get_text(strip=True)

    product['original_data'] = original_data
    return product

def main():
    """
    Reads the products.json file, parses the data, and saves it to a new file.
    """
    try:
        with open('/Users/jeremy/code/github/factor2/migration/data/products.json', 'r') as f:
            products = json.load(f)
    except FileNotFoundError:
        print("Error: products.json not found.")
        return

    parsed_products = [parse_product_data(p) for p in products]

    with open('parsed_products.json', 'w') as f:
        json.dump(parsed_products, f, indent=2)

    print("Parsed data saved to parsed_products.json")

if __name__ == '__main__':
    main()
