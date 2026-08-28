from rest_framework import serializers

from .models import Category, Product, ProductImage, Variant


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug", "parent"]


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ["id", "image", "alt", "position"]


class VariantSerializer(serializers.ModelSerializer):
    price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = Variant
        fields = ["id", "size", "colour", "sku", "price", "stock"]


class ProductListSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    category = serializers.CharField(source="category.name", read_only=True)
    # From ProductViewSet's Exists() annotation; default=True so an un-annotated Product isn't sold out.
    in_stock = serializers.BooleanField(read_only=True, default=True)

    class Meta:
        model = Product
        fields = ["id", "name", "slug", "category", "base_price", "mrp", "image", "in_stock"]

    def get_image(self, obj):
        first = obj.images.all()[:1]
        if not first:
            return None
        request = self.context.get("request")
        url = first[0].image.url
        return request.build_absolute_uri(url) if request else url


class ProductDetailSerializer(serializers.ModelSerializer):
    images = ProductImageSerializer(many=True, read_only=True)
    variants = VariantSerializer(many=True, read_only=True)
    category = CategorySerializer(read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "category",
            "base_price",
            "mrp",
            "images",
            "variants",
        ]
