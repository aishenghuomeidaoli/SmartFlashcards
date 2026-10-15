"""OAuth 账号归属的测试

这块出错的表现有两种，一种吵一种静：email 撞唯一约束 → 登录 500（吵，好查）；
或者同一个人的 Google / GitHub 各建一个账号 → 登进去发现"库是空的"（静，最难查）。
所以把边界都固定下来。
"""

from urllib.parse import parse_qs, urlparse

from django.conf import settings
from django.test import TestCase

from apps.accounts.models import User
from apps.accounts.views import ProviderEmailConflict, _find_or_create_user, _unique_username


class FindOrCreateUserTests(TestCase):
    def test_creates_new_user(self):
        u = _find_or_create_user("g-1", "google_id", "a@example.com", "Alice", "https://av/1",
                                 email_verified=True)
        self.assertEqual(u.email, "a@example.com")
        self.assertEqual(u.google_id, "g-1")
        self.assertEqual(u.avatar_url, "https://av/1")
        self.assertEqual(User.objects.count(), 1)

    def test_same_provider_id_is_idempotent(self):
        a = _find_or_create_user("g-1", "google_id", "a@example.com", "Alice", "",
                                 email_verified=True)
        b = _find_or_create_user("g-1", "google_id", "a@example.com", "Alice", "",
                                 email_verified=True)
        self.assertEqual(a.pk, b.pk)
        self.assertEqual(User.objects.count(), 1)

    def test_verified_email_joins_the_existing_account(self):
        """同一个人的 Google 和 GitHub 必须是同一个账号 —— 否则每边一个空库"""
        google = _find_or_create_user("g-1", "google_id", "a@example.com", "Alice", "",
                                      email_verified=True)
        github = _find_or_create_user("gh-9", "github_id", "a@example.com", "Alice", "",
                                      email_verified=True)
        self.assertEqual(google.pk, github.pk)
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(User.objects.get(pk=google.pk).github_id, "gh-9")

    def test_join_is_case_insensitive(self):
        """邮箱大小写不同不该变成两个账号"""
        a = _find_or_create_user("g-1", "google_id", "A@Example.com", "Alice", "",
                                 email_verified=True)
        b = _find_or_create_user("gh-9", "github_id", "a@example.com", "Alice", "",
                                 email_verified=True)
        self.assertEqual(a.pk, b.pk)

    def test_unverified_email_must_not_join(self):
        """没拿到"已验证"标记就不能并号，否则填别人的邮箱就能接管账号"""
        _find_or_create_user("g-1", "google_id", "a@example.com", "Alice", "",
                             email_verified=True)
        with self.assertRaises(ProviderEmailConflict):
            _find_or_create_user("gh-9", "github_id", "a@example.com", "Mallory", "",
                                 email_verified=False)
        self.assertEqual(User.objects.count(), 1)

    def test_email_taken_by_another_id_of_same_provider(self):
        """同一个邮箱上已经是**另一个** GitHub 账号 —— 不能覆盖"""
        _find_or_create_user("gh-1", "github_id", "a@example.com", "Alice", "",
                             email_verified=True)
        with self.assertRaises(ProviderEmailConflict):
            _find_or_create_user("gh-2", "github_id", "a@example.com", "Someone", "",
                                 email_verified=True)

    def test_private_email_falls_back_to_placeholder(self):
        """GitHub 用户不公开邮箱时不能崩，也不能瞎占一个真邮箱。
        占位域名 .placeholder 不是有效 TLD，永远不会误投到别人的真实邮箱。"""
        u = _find_or_create_user("gh-1", "github_id", "", "Octocat", "", email_verified=False)
        self.assertEqual(u.email, "gh-1@oauth.placeholder")
        self.assertEqual(u.username, "Octocat")

    def test_placeholder_email_is_filled_in_later(self):
        """第一次拿不到邮箱只能占位；之后拿到已验证邮箱要补上，
        否则这个人永远无法再用另一种方式登录被认领到同一个账号"""
        u = _find_or_create_user("gh-1", "github_id", "", "Octocat", "", email_verified=False)
        again = _find_or_create_user("gh-1", "github_id", "octo@example.com", "Octocat", "",
                                     email_verified=True)
        self.assertEqual(again.pk, u.pk)
        self.assertEqual(again.email, "octo@example.com")
        self.assertEqual(User.objects.count(), 1)

    def test_username_collision_gets_a_suffix(self):
        """两个人同名（或都叫 weiwei）不能撞 username 约束"""
        a = _find_or_create_user("g-1", "google_id", "a@example.com", "weiwei", "",
                                 email_verified=True)
        b = _find_or_create_user("g-2", "google_id", "b@example.com", "weiwei", "",
                                 email_verified=True)
        self.assertEqual(User.objects.count(), 2)
        self.assertNotEqual(a.username, b.username)
        self.assertTrue(b.username.startswith("weiwei"))

    def test_existing_user_email_is_not_stolen(self):
        """老账号补资料时，不能把邮箱改成别人正占着的那个（否则 500）"""
        _find_or_create_user("g-1", "google_id", "taken@example.com", "Alice", "",
                             email_verified=True)
        u = _find_or_create_user("gh-1", "github_id", "other@example.com", "Bob", "",
                                 email_verified=True)
        again = _find_or_create_user("gh-1", "github_id", "taken@example.com", "Bob", "",
                                     email_verified=True)
        self.assertEqual(again.pk, u.pk)
        self.assertEqual(again.email, "other@example.com")


class UsernameTests(TestCase):
    def test_unique_username_suffixes(self):
        User.objects.create(email="a@example.com", username="weiwei")
        self.assertEqual(_unique_username("weiwei"), "weiwei-2")
        self.assertEqual(_unique_username("nobody"), "nobody")

    def test_unique_username_handles_empty(self):
        self.assertEqual(_unique_username(""), "user")


def query_of(url: str) -> dict:
    """按解析后的参数比对，不去猜百分号编码（%20 还是 +）"""
    return {k: v[0] for k, v in parse_qs(urlparse(url).query).items()}


class GithubCallbackRelayTests(TestCase):
    """GitHub 控制台注册的回调是 /api/auth/github/callback（走 Django），
    它只把 code/state 转交给前端 /login —— 换码逻辑只有一份。"""

    def test_relays_code_and_state(self):
        resp = self.client.get("/api/auth/github/callback?code=abc123&state=github")
        self.assertEqual(resp.status_code, 302)
        self.assertEqual(resp["Location"],
                         f"{settings.FRONTEND_ORIGIN}/login?code=abc123&state=github")

    def test_relays_state_verbatim(self):
        """state 由前端自己定义（用它区分 provider、带自己的附加信息），
        中转必须原样带回、不做任何解析 —— 后端不该知道 state 的语义"""
        resp = self.client.get("/api/auth/github/callback?code=abc&state=github:extra")
        self.assertEqual(resp.status_code, 302)
        self.assertEqual(query_of(resp["Location"])["state"], "github:extra")

    def test_provider_error_becomes_a_visible_message(self):
        """用户点了 Cancel：要把 GitHub 的原话带回登录页，而不是空 404"""
        resp = self.client.get(
            "/api/auth/github/callback?error=access_denied&error_description=User+denied+request")
        self.assertEqual(resp.status_code, 302)
        self.assertEqual(query_of(resp["Location"])["error"], "User denied request")

    def test_missing_code_says_so(self):
        resp = self.client.get("/api/auth/github/callback")
        self.assertEqual(resp.status_code, 302)
        self.assertEqual(query_of(resp["Location"])["error"], "no code returned")
