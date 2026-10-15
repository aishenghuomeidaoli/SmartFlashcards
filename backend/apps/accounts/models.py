import ulid
from django.contrib.auth.models import AbstractUser
from django.db import models

from utils.ids import new_ulid


class User(AbstractUser):
    """账号主表。

    与上游（内部 SaaS）的差异：去掉了 `accepted_invite`（邀请码属于上游的商业化逻辑，
    开源版不引入），其余字段保持一致，方便以后往回对齐。
    """

    id = models.CharField(max_length=26, primary_key=True, default=new_ulid, editable=False)
    email = models.EmailField(unique=True)
    # Google / GitHub 两套互不相干的用户 id。同一个人的两条登录路径靠"已验证邮箱"合并
    # （见 views._find_or_create_user），所以两者都必须允许为空。
    google_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    github_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    avatar_url = models.URLField(blank=True, default="")
    stripe_customer_id = models.CharField(max_length=255, blank=True, default="")
    language = models.CharField(max_length=10, blank=True, default="")

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    class Meta:
        db_table = "accounts_user"
        ordering = ["-date_joined"]

    def __str__(self):
        return self.email


# Import UserProfile so Django's migration autodetector can find it
from apps.accounts.profile import UserProfile  # noqa: E402, F401
