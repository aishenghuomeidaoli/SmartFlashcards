import json
import ulid
from rest_framework.renderers import JSONRenderer


class ULIDEncoder(json.JSONEncoder):
    """DRF JSON encoder that properly serializes ULID objects."""

    def default(self, obj):
        if isinstance(obj, ulid.ULID):
            return str(obj)
        return super().default(obj)


class ULIDAwareJSONRenderer(JSONRenderer):
    """JSON renderer that properly serializes ULID primary keys."""
    encoder_class = ULIDEncoder
