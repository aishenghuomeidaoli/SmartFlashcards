"""
UserProfile — Extensible user dimensions

Provides a generic key-value dimension store attached to each user.
Current dimensions include geo location, but the model is designed
to support any future dimension without schema changes.

Usage:
    user.profile.dimensions = {
        "geo_country": "US",
        "geo_source": "ip_geo",
        "language": "en",
        "plan": "pro",
        "interest:ai": 0.85,
        "referral_source": "google",
    }
    user.profile.save()
"""

import ulid
from django.db import models
from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver
from utils.ids import new_ulid


class UserProfile(models.Model):
    """
    Extensible user attributes — one-to-one with User.

    - geo 相关字段被 denormalize 出来方便查询
    - dimensions 是 JSON 字典，用作通用维度存储
      任何新维度（兴趣标签、设备类型、渠道来源等）直接写入此字段，
      无需改表结构。

    约定：
      dimensions key 使用小写字母，冒号分隔层级
      例如: "geo_country", "geo_source", "interest:ai", "interest:programming"
    """

    id = models.CharField(max_length=26, primary_key=True, default=new_ulid, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )

    # ── 地理位置 (denormalized) ──
    geo_country = models.CharField(
        max_length=10, blank=True, default="",
        help_text="用户所在国家 ISO 代码，如 US, JP",
    )
    geo_source = models.CharField(
        max_length=20, blank=True, default="",
        help_text="地理位置来源: ip_geo / accept_language / manual",
    )
    ip_address = models.GenericIPAddressField(
        blank=True, null=True,
        help_text="最近一次记录的 IP 地址",
    )

    # ── 通用维度存储 ──
    dimensions = models.JSONField(
        default=dict, blank=True,
        help_text="通用维度字典。任意 key-value 维度，无需迁移",
    )

    # ── 时间戳 ──
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "accounts_user_profile"
        verbose_name = "User Profile"
        verbose_name_plural = "User Profiles"

    def __str__(self):
        geo = self.geo_country or "??"
        return f"{self.user.email} [{geo}]"

    # ── 便捷访问器 ──
    def set_dimension(self, key: str, value) -> None:
        """Set a dimension value and save."""
        self.dimensions[key] = value
        self.dimensions = {**self.dimensions}  # trigger JSONField change detection

    def get_dimension(self, key: str, default=None):
        """Get a dimension value."""
        return self.dimensions.get(key, default)

    def update_geo(self, country: str, source: str = "ip_geo",
                   ip_address: str | None = None) -> bool:
        """Update geo location. Returns True if changed."""
        changed = False
        if country and country != self.geo_country:
            self.geo_country = country
            self.geo_source = source
            changed = True
        if ip_address and ip_address != self.ip_address:
            self.ip_address = ip_address
            changed = True
        if changed:
            self.save(update_fields=["geo_country", "geo_source",
                                     "ip_address", "updated_at"])
        return changed


# ── Auto-create profile for new users ──

@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_user_profile(sender, instance, created, **kwargs):
    """Auto-create a UserProfile when a new User is created."""
    if created:
        UserProfile.objects.create(user=instance)


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def save_user_profile(sender, instance, **kwargs):
    """Ensure profile is saved when user is saved."""
    if hasattr(instance, "profile"):
        instance.profile.save()
