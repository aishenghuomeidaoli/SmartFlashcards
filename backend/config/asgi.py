"""ASGI 入口（uvicorn/daphne 用）。

与 wsgi.py 一样：上游的 httpx monkey-patch 随 LLM 依赖一起去掉了。
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

application = get_asgi_application()
