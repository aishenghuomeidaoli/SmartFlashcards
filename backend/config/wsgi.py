"""WSGI 入口（gunicorn 用）。

上游这里有一段 httpx 的 monkey-patch（openai SDK 发非 ASCII header 时的 UnicodeEncodeError）。
开源版不含任何 LLM 依赖，所以没有 httpx，那段补丁一并去掉；
将来接入 LLM 功能时再按上游写法加回来。
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

application = get_wsgi_application()
