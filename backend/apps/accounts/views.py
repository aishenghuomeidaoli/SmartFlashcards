import logging
from urllib.parse import quote, urlencode
from uuid import uuid4

from django.conf import settings
from django.shortcuts import redirect
from rest_framework import generics, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User
import requests as http_requests
from .serializers import UserSerializer, GitHubAuthSerializer

logger = logging.getLogger(__name__)


class ProviderEmailConflict(Exception):
    """同一个邮箱已经用别的方式注册过，而本次登录又没拿到"已验证"的邮箱 —— 不能就这么并过去"""

    def __init__(self, email: str):
        self.email = email
        super().__init__(email)


def _unique_username(base: str) -> str:
    """username 同样是唯一的：两个人同名（或都叫 weiwei）时不能撞车"""
    base = (base or "").strip()[:140] or "user"
    if not User.objects.filter(username=base).exists():
        return base
    for i in range(2, 100):
        cand = f"{base}-{i}"
        if not User.objects.filter(username=cand).exists():
            return cand
    return f"{base}-{uuid4().hex[:6]}"


def _find_or_create_user(provider_id, provider_field, email, name, avatar, email_verified=False):
    """按 provider id 找人；找不到时用**已验证的邮箱**认领已有账号，最后才新建。

    为什么必须按邮箱兜一层：`email` 是 unique 的，而 Google 和 GitHub 是两套互不相干的 id。
    同一个人拿同一个 Gmail 既登 Google 又登 GitHub 时，只按 provider id 找人会：
      · 撞 email 唯一约束 → 500，登录直接失败
      · 或退化成 `<id>@github.placeholder` → 同一个人的资料变成两个账号、两份各自空着的库
    后者更糟：用户会以为"我上传的东西没了"，而不觉得是登录问题。

    只认 verified 的邮箱：否则任何能让用户随便填邮箱的 provider，都能靠填别人的邮箱接管账号。
    """
    user = User.objects.filter(**{provider_field: provider_id}).first()
    if user is not None:
        updates = []
        if avatar and user.avatar_url != avatar:
            user.avatar_url = avatar
            updates.append("avatar_url")
        # 邮箱只在没被别人占用时才更新，否则会把一次正常登录撞成 500
        if email and user.email.lower() != email.lower():
            if not User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
                user.email = email
                updates.append("email")
        if updates:
            user.save(update_fields=updates)
        return user

    if email and email_verified:
        existing = User.objects.filter(email__iexact=email).first()
        if existing is not None:
            if not getattr(existing, provider_field):
                # 认领：这个邮箱的主人第一次用这种登录方式进来，并到已有账号上
                setattr(existing, provider_field, provider_id)
                if avatar:
                    existing.avatar_url = avatar
                existing.save(update_fields=[provider_field, "avatar_url"])
                logger.info("OAuth 账号合并：%s 新增 %s", email, provider_field)
                return existing
            raise ProviderEmailConflict(email)     # 这种登录方式在这个邮箱上已是别人，不能覆盖

    if email and User.objects.filter(email__iexact=email).exists():
        raise ProviderEmailConflict(email)         # 邮箱被占，且本次登录没拿到验证标记

    user = User.objects.create(**{
        provider_field: provider_id,
        "email": email or f"{provider_id}@oauth.placeholder",
        "username": _unique_username(name or (email.split("@")[0] if email else provider_id)),
        "avatar_url": avatar,
    })
    logger.info("OAuth 新账号：%s (%s)", user.email, provider_field)
    return user


def _email_conflict_response(exc: ProviderEmailConflict, provider: str):
    """邮箱被另一种登录方式占着 —— 把"该怎么办"说清楚，而不是丢一个 500 出去"""
    return Response({
        "error": "Email already registered",
        "detail": (
            f"{exc.email} is already signed up with a different sign-in method. "
            f"Use that one instead — one email is one library, so signing in with "
            f"{provider} would have created a second, empty one."
        ),
    }, status=409)


def _jwt_response(user):
    refresh = RefreshToken.for_user(user)
    return Response({
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": UserSerializer(user).data,
    })


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def google_login(request):
    """Exchange Google OAuth code for user info and return JWT."""
    code = request.data.get("code")
    if not code:
        return Response({"error": "code is required"}, status=400)

    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        return Response({"error": "Google login not configured"}, status=501)

    # Step 1: Exchange code for tokens
    token_resp = http_requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            # 必须与"授权时用的 redirect_uri"完全一致，否则 Google 报 redirect_uri_mismatch。
            # 前端会把实际用的地址带上来（apex / www / localhost 多种入口），
            # 没带才回退到 setting：这样不必为每个域名改服务端配置。
            "redirect_uri": request.data.get("redirect_uri") or settings.GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        },
        timeout=10,
    )
    token_data = token_resp.json()
    access_token = token_data.get("access_token")
    if not access_token:
        logger.warning("Google token exchange failed: %s", token_data)
        # 把上游原始错误带回前端：invalid_client（密钥错）、
        # redirect_uri_mismatch（回调地址没在控制台注册）、invalid_grant（code 过期/已用过）
        # 排查动作完全不同，糊成一句"登录失败"等于没提示
        detail = token_data.get("error_description") or token_data.get("error") or "unknown"
        return Response({"error": "Google authentication failed", "detail": detail}, status=401)

    # Step 2: Fetch user info
    user_resp = http_requests.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    google_user = user_resp.json()
    google_id = str(google_user["id"])
    email = google_user.get("email", "")
    name = google_user.get("name", "")
    avatar = google_user.get("picture", "")

    # verified_email 由 Google 给出：只有它可信，才敢把这次登录并到同邮箱的已有账号上
    try:
        user = _find_or_create_user(
            google_id, "google_id", email, name, avatar,
            email_verified=bool(google_user.get("verified_email")),
        )
    except ProviderEmailConflict as exc:
        return _email_conflict_response(exc, "Google")
    return _jwt_response(user)


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def github_login(request):
    """Exchange GitHub OAuth code for user info and return JWT."""
    serializer = GitHubAuthSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    code = serializer.validated_data["code"]
    client_id = settings.GITHUB_CLIENT_ID
    client_secret = settings.GITHUB_CLIENT_SECRET

    if not client_id or not client_secret:
        return Response({"error": "GitHub login not configured"}, status=501)

    # Step 1: Exchange code for access token
    token_resp = http_requests.post(
        "https://github.com/login/oauth/access_token",
        json={
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
        },
        headers={"Accept": "application/json"},
        timeout=10,
    )
    token_data = token_resp.json()
    access_token = token_data.get("access_token")
    if not access_token:
        logger.warning("GitHub token exchange failed: %s", token_data)
        # 把上游原始错误带回前端：invalid_client（密钥错）、
        # redirect_uri_mismatch（回调地址没在控制台注册）、invalid_grant（code 过期/已用过）
        # 排查动作完全不同，糊成一句"登录失败"等于没提示
        detail = token_data.get("error_description") or token_data.get("error") or "unknown"
        return Response({"error": "GitHub authentication failed", "detail": detail}, status=401)

    # Step 2: Fetch user info from GitHub
    user_resp = http_requests.get(
        "https://api.github.com/user",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        },
        timeout=10,
    )
    gh_user = user_resp.json()
    github_id = str(gh_user["id"])
    email = gh_user.get("email") or ""
    name = gh_user.get("name") or gh_user.get("login") or ""
    avatar = gh_user.get("avatar_url") or ""
    # GitHub 的公开邮箱只能是自己已验证的邮箱，所以非空即可信；但用户常常不公开邮箱，
    # 那时 /user 里就是 null —— 要拿"主邮箱且已验证"必须再查一次 /user/emails。
    # 这个"已验证"标志是敢不敢把本次登录并到同邮箱已有账号上的前提，不能省。
    email_verified = bool(email)
    try:
        em_resp = http_requests.get(
            "https://api.github.com/user/emails",
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
            timeout=10,
        )
        emails = em_resp.json()
        for item in (emails if isinstance(emails, list) else []):
            if item.get("primary") and item.get("verified") and item.get("email"):
                email, email_verified = item["email"], True
                break
    except Exception as exc:            # 拿不到邮箱不该让整次登录失败，退回公开邮箱
        logger.warning("GitHub 邮箱查询失败，退回公开邮箱判断: %s", exc)

    # Step 3: Find or create user
    try:
        user = _find_or_create_user(github_id, "github_id", email, name, avatar,
                                    email_verified=email_verified)
    except ProviderEmailConflict as exc:
        return _email_conflict_response(exc, "GitHub")

    refresh = RefreshToken.for_user(user)
    return Response({
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": UserSerializer(user).data,
    })


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def github_callback(request):
    """GitHub OAuth 的回调中转。

    GitHub 控制台里注册的回调地址是 `https://smartflashcards.online/api/auth/github/callback`
    （走 nginx 的 /api/ → Django），而"用 code 换 token、写 httpOnly cookie"的逻辑在 Next
    （/login → /auth/callback）。这里只把 code/state 原样转交过去 —— 换码逻辑只应该有一份，
    在两处各实现一遍，迟早会出现"Google 能登、GitHub 登不上"这种只在一边生效的偏差。

    顺带把 GitHub 自己回来的错误（用户点了 Cancel、code 过期）也转成前端能显示的提示，
    否则用户只会看到一个空的 404。
    """
    code = request.GET.get("code", "")
    state = request.GET.get("state", "")
    target = f"{settings.FRONTEND_ORIGIN}/login"

    if not code:
        reason = request.GET.get("error_description") or request.GET.get("error") or "no code returned"
        return redirect(f"{target}?error={quote(reason)}")

    return redirect(f"{target}?{urlencode({'code': code, 'state': state})}")


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user
