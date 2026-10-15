from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views

urlpatterns = [
    path("google/", views.google_login, name="google-login"),
    path("github/", views.github_login, name="github-login"),
    # GitHub 控制台注册的回调地址就是这个（无尾斜杠，APPEND_SLASH 不能介入，
    # 否则会先 301 到 /callback/ 再丢一次 state）
    path("github/callback", views.github_callback, name="github-callback"),
    path("me/", views.MeView.as_view(), name="me"),
    path("refresh/", TokenRefreshView.as_view(), name="token-refresh"),
]
