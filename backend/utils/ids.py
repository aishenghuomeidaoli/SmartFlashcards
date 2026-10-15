"""
统一的 ID 生成器

为什么需要这个模块：`default=ulid.new` 里的 ulid.new 是 `Api()` 实例的**绑定方法**，
Django 序列化它时会写成 `ulid.api.api.Api.new`（按 __module__ + __qualname__）——
那解析回来是**未绑定的函数**，缺 self、被调用就 TypeError。于是模型默认值和迁移快照
永远不相等，`makemigrations` 每次都会吐出新的 `alter_..._id` 迁移（项目里那些
`0002_alter_carddraft_id...` / `0005_alter_plan_id...` 就是它留下的）。

用一个真正的模块级函数做默认值，序列化路径稳定且可调用，churn 从此结束。
"""

import ulid


def new_ulid() -> str:
    """生成一个新的 ULID 字符串（26 字符，按时间有序）"""
    return str(ulid.new())
