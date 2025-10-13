# Factor2 Shopify Theme Setup Guide

This guide will help you deploy the Factor2 custom Dawn theme to your Shopify store and import products.

## Prerequisites

- [Shopify CLI](https://shopify.dev/docs/api/shopify-cli) installed
- A Shopify development store or partner account
- Node.js and npm installed

## Installation

### 1. Install Shopify CLI

If you haven't already installed Shopify CLI:

```bash
npm install -g @shopify/cli @shopify/theme
```

### 2. Authenticate with Shopify

```bash
shopify auth login
```

### 3. Connect to Your Store

Navigate to the theme directory:

```bash
cd /Users/jeremy/code/github/factor2
```

Connect to your Shopify store:

```bash
shopify theme dev --store your-store-name.myshopify.com
```

This will start a development server and give you a preview URL.

## Theme Customization

### Custom Sections Created

The following custom sections have been added to the theme:

1. **factor2-announcement.liquid** - Top announcement bar with contact info and quick links
2. **factor2-features.liquid** - 4-column features grid (Fast Shipping, Guarantee, etc.)
3. **factor2-about.liquid** - About section with company info and hours
4. **factor2-categories.liquid** - Category tiles for navigation

### Custom Styling

- **assets/factor2-custom.css** - Contains all Factor2 brand styling (red #cc0000 theme)

### Homepage Layout

The homepage (`templates/index.json`) is configured with:
- Announcement bar with contact information
- Hero banner with company tagline
- Features section
- Featured products (12 products, 4 columns)
- Category tiles
- About section
- Newsletter signup

## Product Import

### Method 1: Using Shopify Admin (Recommended)

1. Log in to your Shopify admin panel
2. Go to **Products** > **Import**
3. Upload the `products.csv` file
4. Map the columns if needed
5. Click **Import products**

### Method 2: Using Shopify CLI (Alternative)

Currently, Shopify CLI doesn't have a direct product import command. You'll need to use the admin panel or GraphQL Admin API.

## Product Data

The `products.csv` file includes 12 Factor2 products:

1. Poly Sheeting sold in net yard - $8.95
2. A-300-8: Thixotropic Agent - $10.95
3. MD-564: Matting Dispersion - $11.95
4. D-109: Cab-O-Sil - $16.95
5. A-310-20: Silicone Fluid - $16.95
6. A-244: Silicone Fluid - $19.95
7. A-315: HD Solution - $35.95
8. A-564: Medical Silicone Adhesive - $38.95
9. Elkem LSR-4301 Silicone Elastomer - $49.95
10. VST-50: VerSilTal Silicone Elastomer - $51.95
11. DG-50-LSR Manual Kit - $119.00
12. A-101: Prosthetic Silicone Elastomer - $135.95

## Theme Deployment

### Push to Development Store

```bash
shopify theme push --unpublished --store your-store-name.myshopify.com
```

### Publish Theme

After testing, publish the theme:

```bash
shopify theme publish
```

Or publish from the Shopify admin:
1. Go to **Online Store** > **Themes**
2. Find your uploaded theme
3. Click **Actions** > **Publish**

## Configuration Steps

After deploying the theme:

### 1. Configure Color Scheme

Go to **Theme Customizer** and set:
- Primary color: #cc0000 (red)
- Button colors to use the red scheme
- Use scheme-3 for newsletter section (dark background)

### 2. Set Up Collections

Create collections in your Shopify admin:
- Silicones
- Adhesive Products
- Cartridge Systems
- All Products (for featured section)

Assign products to appropriate collections.

### 3. Configure Homepage

In the Theme Customizer:

1. **Announcement Bar** - Already configured with contact info
2. **Banner** - Add a background image if desired
3. **Featured Collection** - Select "All Products" or create a "Featured" collection
4. **Categories** - Add links to your collection pages
5. **Newsletter** - Connect to your email marketing service

### 4. Update Navigation

Go to **Online Store** > **Navigation** and edit the "Main menu":

**Add all 18 Factor2 menu items in this exact order:**

1. DEAL OF THE DAY → `/collections/deal-of-the-day`
2. SILICONES → `/collections/silicones`
3. ADHESIVE PRODUCTS → `/collections/adhesive-products`
4. SOLVENTS → `/collections/solvents`
5. CARTRIDGE SYSTEMS → `/collections/cartridge-systems`
6. COLORATION MATERIALS → `/collections/coloration-materials`
7. MOLD MAKING → `/collections/mold-making`
8. MOLD RELEASES → `/collections/mold-releases`
9. SPECIAL FX PRODUCTS → `/collections/special-fx-products`
10. IMPRESSION MATERIALS → `/collections/impression-materials`
11. PRIMERS → `/collections/primers`
12. OCULAR PRODUCTS → `/collections/ocular-products`
13. ACRYLICS → `/collections/acrylics`
14. KITS → `/collections/kits`
15. MAGNETIC COMPONENTS → `/collections/magnetic-components`
16. EQUIPMENT → `/collections/equipment`
17. LAB SUPPLIES / TOOLS → `/collections/lab-supplies-tools`
18. SPECIALTY PRODUCTS → `/collections/specialty-products`

**Note:** The navigation structure is also available in `navigation-structure.json` for reference.

**Create Collections:** Before adding the navigation, create these collections in **Products** > **Collections**. You can create them as manual or automated collections.

## Testing

1. Preview the theme using `shopify theme dev`
2. Test on multiple devices and browsers
3. Verify all links work correctly
4. Test the newsletter signup
5. Test product browsing and cart functionality

## Troubleshooting

### Theme Not Appearing

- Ensure you're connected to the correct store
- Check that the theme was pushed successfully
- Look for errors in the Shopify CLI output

### Products Not Showing

- Verify products were imported successfully
- Check that products are active and available
- Ensure the featured collection is selected in the homepage settings

### Styling Issues

- Clear browser cache
- Check that `factor2-custom.css` is being loaded
- Verify color scheme settings in theme customizer

## Additional Resources

- [Shopify Theme Development Docs](https://shopify.dev/docs/themes)
- [Dawn Theme Documentation](https://github.com/Shopify/dawn)
- [Shopify CLI Reference](https://shopify.dev/docs/api/shopify-cli)

## Support

For questions or issues with the theme customization, refer to the original Factor2 website at https://www.factor2.com for design reference.

## Next Steps

1. Add product images
2. Configure shipping settings
3. Set up payment providers
4. Add more products and collections
5. Configure email notifications
6. Set up analytics
7. Test checkout process

---

**Note**: This theme is based on Shopify's Dawn theme with custom Factor2 branding and sections. All standard Dawn theme functionality remains intact.
