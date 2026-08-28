# Idempotent catalog seed: ~20 hoodies, variants, and generated placeholder images.

import io
import random
import textwrap

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.utils.text import slugify
from PIL import Image, ImageDraw, ImageFont

from catalog.models import Category, Product, ProductImage, Variant

SIZES = ["S", "M", "L", "XL", "XXL"]
VIEWS = ["Front", "Back", "Detail"]

# (name, category, base_price, [colours], brand colour hex)
HOODIES = [
    ("Midnight Oversized Hoodie", "Oversized", 1799, ["Black", "Charcoal"], "#1c1c1c"),
    ("Cloud Grey Oversized Hoodie", "Oversized", 1799, ["Grey"], "#8a8a8a"),
    ("Storm Blue Oversized Hoodie", "Oversized", 1899, ["Navy", "Steel Blue"], "#2b3a55"),
    ("Olive Drop-Shoulder Hoodie", "Oversized", 1899, ["Olive"], "#5b5f3d"),
    ("Rust Oversized Hoodie", "Oversized", 1799, ["Rust"], "#8a4a2f"),
    ("Classic Zip-Up Hoodie", "Zip-Up", 2199, ["Black", "Grey"], "#232323"),
    ("Navy Zip-Up Hoodie", "Zip-Up", 2299, ["Navy"], "#1e2a44"),
    ("Maroon Zip-Up Hoodie", "Zip-Up", 2299, ["Maroon"], "#5c1f2e"),
    ("Forest Zip-Up Hoodie", "Zip-Up", 2199, ["Forest Green"], "#2f4a34"),
    ("Sand Zip-Up Hoodie", "Zip-Up", 2199, ["Sand"], "#c2a878"),
    ("Skull Graphic Hoodie", "Graphic", 1999, ["Black"], "#141414"),
    ("Tokyo Streets Graphic Hoodie", "Graphic", 1999, ["White", "Black"], "#e8e8e8"),
    ("Retro Sunset Graphic Hoodie", "Graphic", 2099, ["Orange"], "#c2542a"),
    ("Anime Wave Graphic Hoodie", "Graphic", 2099, ["Black"], "#181818"),
    ("Varsity Print Hoodie", "Graphic", 1999, ["Red", "Navy"], "#7a1f1f"),
    ("Essential Black Hoodie", "Essential", 1299, ["Black"], "#101010"),
    ("Essential White Hoodie", "Essential", 1299, ["White"], "#f2f2f2"),
    ("Essential Grey Melange Hoodie", "Essential", 1399, ["Grey Melange"], "#9a9a9a"),
    ("Essential Beige Hoodie", "Essential", 1399, ["Beige"], "#d8c7a8"),
    ("Premium Fleece Hoodie", "Essential", 2999, ["Black", "Charcoal"], "#1a1a1a"),
]


def _text_colour(hex_colour: str) -> str:
    r, g, b = (int(hex_colour[i : i + 2], 16) for i in (1, 3, 5))
    brightness = (r * 299 + g * 587 + b * 114) / 1000
    return "#101010" if brightness > 140 else "#f5f5f5"


def _shift(hex_colour: str, delta: int) -> str:  # lighten/darken so the 3 gallery views differ
    r, g, b = (int(hex_colour[i : i + 2], 16) for i in (1, 3, 5))
    return "#" + "".join(f"{max(0, min(255, c + delta)):02x}" for c in (r, g, b))


def _placeholder_image(name: str, hex_colour: str, view: str) -> ContentFile:
    img = Image.new("RGB", (1200, 1600), hex_colour)
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 64)
    except OSError:
        font = ImageFont.load_default()

    lines = textwrap.wrap(name.upper(), width=14)
    fg = _text_colour(hex_colour)
    line_height = 80
    total_height = line_height * len(lines)
    y = (1600 - total_height) // 2
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        w = bbox[2] - bbox[0]
        draw.text(((1200 - w) // 2, y), line, fill=fg, font=font)
        y += line_height
    draw.text((60, y + 20), view.upper(), fill=fg, font=font)

    draw.text((60, 1500), "APEXWEAR", fill=fg, font=font)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return ContentFile(buf.getvalue(), name=f"{slugify(name)}-{slugify(view)}.png")


class Command(BaseCommand):
    help = "Seed ~20 realistic hoodies with variants and generated placeholder images."

    def handle(self, *args, **options):
        rng = random.Random(42)  # deterministic stock numbers across re-runs
        categories = {}
        for cat_name in dict.fromkeys(h[1] for h in HOODIES):
            categories[cat_name], _ = Category.objects.update_or_create(
                slug=slugify(cat_name), defaults={"name": cat_name}
            )

        created, updated = 0, 0
        for index, (name, cat_name, price, colours, hex_colour) in enumerate(HOODIES):
            slug = slugify(name)
            product, was_created = Product.objects.update_or_create(
                slug=slug,
                defaults={
                    "name": name,
                    "description": f"{name} — soft-brushed fleece, relaxed fit, made for everyday wear.",
                    "category": categories[cat_name],
                    "base_price": price,
                    "mrp": price + (price // 5),  # 20% markup, whole rupees
                },
                # is_active only set on first create — a re-run must not reactivate a disabled hoodie
                create_defaults={
                    "name": name,
                    "description": f"{name} — soft-brushed fleece, relaxed fit, made for everyday wear.",
                    "category": categories[cat_name],
                    "base_price": price,
                    "mrp": price + (price // 5),
                    "is_active": True,
                },
            )
            created += was_created
            updated += not was_created

            existing_positions = set(product.images.values_list("position", flat=True))
            for pos, view in enumerate(VIEWS):
                if pos in existing_positions:
                    continue
                view_colour = _shift(hex_colour, pos * 18)
                ProductImage.objects.create(
                    product=product,
                    image=_placeholder_image(name, view_colour, view),
                    alt=f"{name} — {view}",
                    position=pos,
                )

            for c_index, colour in enumerate(colours):
                for s_index, size in enumerate(SIZES):
                    sku = f"{slug.upper()[:12]}-{colour[:3].upper()}-{size}"
                    # Forced 0/1 stock on the first product gives the stock-lock race test its fixtures.
                    if index == 0 and c_index == 0 and s_index == 0:
                        stock = 0
                    elif index == 0 and c_index == 0 and s_index == 1:
                        stock = 1
                    else:
                        stock = rng.randint(3, 40)
                    Variant.objects.update_or_create(
                        product=product,
                        size=size,
                        colour=colour,
                        defaults={"sku": sku},
                        create_defaults={"sku": sku, "stock": stock},  # never overwrite real inventory
                    )

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded catalog: {created} products created, {updated} updated, "
                f"{len(HOODIES)} total."
            )
        )
