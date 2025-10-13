# Factor2 Navigation Setup Guide

This guide explains how to set up the main navigation menu to match the Factor2 website.

## Step 1: Create Collections

Before setting up navigation, create these collections in **Shopify Admin > Products > Collections**:

1. Deal of the Day
2. Silicones
3. Adhesive Products
4. Solvents
5. Cartridge Systems
6. Coloration Materials
7. Mold Making
8. Mold Releases
9. Special FX Products
10. Impression Materials
11. Primers
12. Ocular Products
13. Acrylics
14. Kits
15. Magnetic Components
16. Equipment
17. Lab Supplies / Tools
18. Specialty Products

**Tip:** Use "Automated" collections with conditions (e.g., Product type equals "Silicones") to automatically populate collections as you add products.

## Step 2: Configure Main Menu

Go to **Shopify Admin > Online Store > Navigation > Main menu**

### Add Menu Items

Click **Add menu item** for each of the following (in this order):

| Name | Link |
|------|------|
| DEAL OF THE DAY | Collections → Deal of the Day |
| SILICONES | Collections → Silicones |
| ADHESIVE PRODUCTS | Collections → Adhesive Products |
| SOLVENTS | Collections → Solvents |
| CARTRIDGE SYSTEMS | Collections → Cartridge Systems |
| COLORATION MATERIALS | Collections → Coloration Materials |
| MOLD MAKING | Collections → Mold Making |
| MOLD RELEASES | Collections → Mold Releases |
| SPECIAL FX PRODUCTS | Collections → Special FX Products |
| IMPRESSION MATERIALS | Collections → Impression Materials |
| PRIMERS | Collections → Primers |
| OCULAR PRODUCTS | Collections → Ocular Products |
| ACRYLICS | Collections → Acrylics |
| KITS | Collections → Kits |
| MAGNETIC COMPONENTS | Collections → Magnetic Components |
| EQUIPMENT | Collections → Equipment |
| LAB SUPPLIES / TOOLS | Collections → Lab Supplies / Tools |
| SPECIALTY PRODUCTS | Collections → Specialty Products |

## Step 3: Configure Header Settings

Go to **Shopify Admin > Online Store > Themes > Customize**

1. Click on **Header** section
2. Set **Menu** to "Main menu"
3. Set **Menu type** to "Mega" (for desktop) - this works best with many menu items
4. **Color scheme**: Choose a dark scheme or the navigation will use the custom black styling

## Styling

The navigation is styled with:
- **Black background** (#000)
- **White text**
- **Red hover** (#cc0000)
- **Red border** at the bottom of header (#cc0000)
- **Uppercase text**
- **Compact spacing** to fit all items

All styling is in `assets/factor2-custom.css` and is automatically loaded.

## Mobile Navigation

The mobile menu (hamburger menu) automatically uses all menu items with:
- Black background
- White text
- Red highlights on hover
- Uppercase styling

## Testing

After setup:
1. Preview your theme
2. Check that all 18 menu items appear
3. Verify hover effects work (black → red)
4. Test on mobile devices
5. Ensure all links work correctly

## Navigation Structure Reference

The complete navigation structure is available in `navigation-structure.json` if you need to reference it programmatically.

## Troubleshooting

### Menu items not showing
- Make sure the collections exist and are active
- Verify the menu is set in the header section settings
- Clear browser cache

### Styling issues
- Ensure `factor2-custom.css` is loaded (check browser dev tools)
- Verify color scheme is set correctly in theme customizer

### Too many items wrapping
The CSS includes responsive wrapping for many menu items. If items still wrap awkwardly:
- Consider grouping some items into dropdown menus
- Adjust font size in `factor2-custom.css` (line ~19: `font-size: 13px`)

## Optional: Add Dropdown Menus

To add dropdown menus (e.g., subcategories under SILICONES):

1. In **Navigation > Main menu**
2. Click on a menu item (e.g., "SILICONES")
3. Click **Add menu item** under that item
4. Add subcategory items

The CSS includes styling for dropdown menus with white backgrounds and red hover effects.

---

**Note:** All menu item names are in UPPERCASE to match the original Factor2 website branding.
