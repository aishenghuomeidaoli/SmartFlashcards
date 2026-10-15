"""Django settings — SmartFlashcards Open Source (sfo)

从完整版（内部 SaaS）里裁出的最小服务端：只保留账号体系（Google / GitHub OAuth + JWT）与 admin。
被裁掉的部分（PDF 管道 / 闪卡 / 订阅 / 内容平台 / Celery / MinIO / GeoIP）见 README 的「与上游的差异」。
"""

from datetime import timedelta
from pathlib import Path

from decouple import Csv, config

BASE_DIR = Path(__file__).resolve().parent.parent

# ── 基础 ──
# 生产必须覆盖：这里的默认值只够本地跑起来，绝不要带默认 SECRET_KEY 上线。
SECRET_KEY = config("DJANGO_SECRET_KEY", default="django-insecure-dev-only")
DEBUG = config("DJANGO_DEBUG", default=True, cast=bool)
ALLOWED_HOSTS = config("ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv())

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "apps.accounts",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    # 静态文件由应用自己服务（见 STORAGES）：DEBUG=False 时不加它，admin 的 CSS/JS 全 404
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ── 数据库 ──
# 只支持 PostgreSQL：User/UserProfile 用 ULID 主键与 JSONField，Postgres 上语义最明确，
# docker compose 里已经带了一个 db 容器。
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": config("POSTGRES_DB", default="smartflashcards"),
        "USER": config("POSTGRES_USER", default="smartflashcards"),
        # 默认值刻意留空：不给任何人一个"能用但危险"的默认口令
        "PASSWORD": config("POSTGRES_PASSWORD", default=""),
        "HOST": config("POSTGRES_HOST", default="127.0.0.1"),
        "PORT": config("POSTGRES_PORT", default="5432"),
        "OPTIONS": {"sslmode": config("POSTGRES_SSLMODE", default="prefer")},
    }
}

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
]

# ── i18n ──
LANGUAGES = [
    ("en", "English"),
    ("zh-CN", "Simplified Chinese"),
]
LOCALE_PATHS = [BASE_DIR / "locale"]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# ── 反向代理 ──
# nginx → gunicorn 是 http，必须显式告诉 Django 外侧其实是 https：
# 少了这条，request.is_secure() 恒为 False，Django 把站点当成 http ——
# 后果一是 admin 登录的 CSRF Origin 校验会把 https://… 判成跨站（403），
# 二是 Secure cookie / 各种 is_secure() 分支全部走错。
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = config("USE_X_FORWARDED_HOST", default=False, cast=bool)
# 多域名/多入口时按需补充（同源请求不需要写在这里）
CSRF_TRUSTED_ORIGINS = config("CSRF_TRUSTED_ORIGINS", default="", cast=Csv())

# 生产默认把会话与 CSRF cookie 限制在 https 上；本地 http 调试时把这两项设 False
SESSION_COOKIE_SECURE = config("SESSION_COOKIE_SECURE", default=not DEBUG, cast=bool)
CSRF_COOKIE_SECURE = config("CSRF_COOKIE_SECURE", default=not DEBUG, cast=bool)

# ── 静态/媒体 ──
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

# 静态文件由 whitenoise 直接由应用服务（压缩 + 长缓存头）。
# 不自部署时也成立：前面有 nginx 时它仍可把 /static/ 交给 Django，无需额外 alias。
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}
WHITENOISE_MAX_AGE = 60 * 60 * 24 * 30 if not DEBUG else 0

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ── 日志 ──
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "WARNING"},
    "loggers": {
        "django.request": {"handlers": ["console"], "level": "ERROR", "propagate": False},
        "apps.accounts": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}

# ── CORS ──
# 走 Next 的 /bff 同源代理时用不到（浏览器只跟 Next 打交道）；
# 保留是为了能从别的端口直接调 API（本地调试、后续别的客户端）。
CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS", default="http://localhost:3000,http://127.0.0.1:3000", cast=Csv()
)
CORS_ALLOW_CREDENTIALS = True

# ── DRF ──
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    # 默认拒绝匿名：需要公开的接口（登录、健康检查）显式写 AllowAny
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_RENDERER_CLASSES": ("utils.renderers.ULIDAwareJSONRenderer",),
}

# ── JWT ──
# 访问令牌 2 小时、刷新令牌 30 天；前端中间件按这个寿命在到期前自动续期
# （web/src/middleware.ts），两边寿命改要一起改。
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=2),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# ── Google OAuth ──
GOOGLE_CLIENT_ID = config("GOOGLE_CLIENT_ID", default="")
GOOGLE_CLIENT_SECRET = config("GOOGLE_CLIENT_SECRET", default="")
# 只作为兜底：前端会把"实际用的 redirect_uri"一起带上来（apex/www/localhost 多入口，
# 服务端不为此改配置）。没带才用这个默认值。
GOOGLE_REDIRECT_URI = config("GOOGLE_REDIRECT_URI", default="http://localhost:3000/login")

# ── GitHub OAuth ──
GITHUB_CLIENT_ID = config("GITHUB_CLIENT_ID", default="")
GITHUB_CLIENT_SECRET = config("GITHUB_CLIENT_SECRET", default="")

# ── 前端地址 ──
# GitHub 的回调是 GitHub 服务器发起的（Host 头不可信），所以 /api/auth/github/callback
# 要把 code 转交回前端时，必须有一个**固定的绝对地址**。Google 那条链路不走这里。
FRONTEND_ORIGIN = config("FRONTEND_ORIGIN", default="http://localhost:3000")
