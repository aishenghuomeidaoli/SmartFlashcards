"""URL 配置 — 最小集：健康检查 / 账号 / admin。

后续加功能时按 apps/<name>/urls.py 挂进来，前缀风格与上游保持一致（/api/<app>/）。
"""

from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health(request):
    """自部署探活：只回答"进程活着"，不连数据库（DB 就绪判定留给部署脚本）。"""
    return JsonResponse({"status": "ok", "service": "smartflashcards"})


urlpatterns = [
    path("api/health/", health, name="health"),
    path("api/auth/", include("apps.accounts.urls")),
    path("admin/", admin.site.urls),
]
