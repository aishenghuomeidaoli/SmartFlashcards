# SmartFlashcards（开源版）

AI 闪卡学习平台的开源内核：**Django 服务端 + Next.js 前端**，目前包含**首页**与 **Google / GitHub 登录**。
其余能力（PDF → 知识资产管道、AI 造卡、FSRS 复习、内容平台、订阅）来自同一套内部实现，按里程碑逐步搬过来。

- 服务端：Django 5.2 + DRF + SimpleJWT，PostgreSQL
- 前端：Next.js 15（App Router，SSR）+ Tailwind 4
- 认证：Google / GitHub OAuth（授权码流程）→ 后端换 JWT → httpOnly cookie，前端中间件自动续期

## 快速开始（Docker）

```bash
cp .env.example .env      # 至少填 POSTGRES_PASSWORD；要登录就填 OAuth 的两个 client id/secret
docker compose up -d --build
```

打开 http://localhost:3000 —— 首页就能看到；未配置 OAuth 时登录页会直接告诉你缺哪些变量。
建 admin 账号：`docker compose exec backend python manage.py createsuperuser`，后台在 http://localhost:8000/admin/ 。

没有 Docker Hub 访问权限时用镜像加速：先把 `daemon.json` 的 `registry-mirrors` 指到一个可用镜像站，
或者直接把 `postgres:17` 等基础镜像从镜像站拉下来 `docker tag` 成本地名字。

## 不使用 Docker 的本地开发

```bash
# 1) 只起数据库
docker compose up -d db

# 2) 后端
cd backend
python3 -m venv .venv && ./.venv/bin/pip install -r requirements/local.txt
cp .env.example .env          # 按注释改（POSTGRES_HOST=127.0.0.1）
./.venv/bin/python manage.py migrate
./.venv/bin/python manage.py runserver 8000

# 3) 前端（另开一个终端）
cd web
npm ci
cp .env.local.example .env.local   # DJANGO_API_BASE 指向后端
npm run dev                         # http://localhost:3000
```

## OAuth 配置

| 提供方 | 在哪里建 | 回调地址填什么 |
|---|---|---|
| Google | Cloud Console → 凭据 → OAuth 2.0 客户端 ID（Web） | `http://localhost:3000/login`（生产填 `https://你的域名/login`）；Google 允许注册多个 |
| GitHub | Settings → Developer settings → OAuth Apps → 新建 | `http://localhost:8000/api/auth/github/callback`（生产填 `https://你的域名/api/auth/github/callback`；也可以直接填 `https://你的域名/login`，两种都支持） |

两条链路的差别（代码里都有注释，这里给结论）：

- **Google**：授权时前端把当下的 `redirect_uri`（`{你访问的 origin}/login`）一起传给后端，所以支持 apex/www/localhost 多入口，服务端不用为每个域名改配置。
- **GitHub**：OAuth App 只能注册**一个**回调地址，且 GitHub 会逐字校验，所以回调地址用 `GITHUB_REDIRECT_URI` 写死，必须与 GitHub 控制台里注册的**逐字一致**。两种注册方式都能用：填后端地址 `https://你的域名/api/auth/github/callback`（后端只把 `code`/`state` 原样转交回前端的 `/login`），或直接填前端的 `https://你的域名/login`（旧 SPA 就是这种注册，`/login` 拿到 `code` 会转给 `/auth/callback`）。无论哪种，换码逻辑都只有一处（`web/src/app/auth/callback/route.ts`）—— 两处各实现一遍迟早会出现"Google 能登、GitHub 登不上"这种只在一边生效的偏差。
- 登录后 JWT 存在 httpOnly cookie（`sfo_access` / `sfo_refresh`），JS 读不到；访问令牌 2 小时、刷新令牌 30 天，`web/src/middleware.ts` 在到期前自动续期。

## 环境变量

完整清单和注释见 `.env.example`（Docker）与 `backend/.env.example` + `web/.env.local.example`（手动跑）。
真正必填的只有 4 类：

| 变量 | 作用 |
|---|---|
| `DJANGO_SECRET_KEY` | Django 密钥，生产必须换成随机串 |
| `POSTGRES_*` | 数据库连接 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google 登录 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub 登录 |

注意两点：

- `NEXT_PUBLIC_*` 是**构建期**内联的：Docker 里通过 build args 传（`docker compose build web` 重建），手动构建时先写好 `web/.env.local`。
- 部署在 nginx 之类的反代后面时，`settings.py` 的 `SECURE_PROXY_SSL_HEADER` 依赖 nginx 发的 `X-Forwarded-Proto`，否则 Django 会把站点当 http，admin 登录会栽在 CSRF 校验上。生产还要把 `SESSION_COOKIE_SECURE` / `CSRF_COOKIE_SECURE` 设为 True。

## 部署（裸机 systemd，参考实现）

前端只在本地构建，服务器不需要 node_modules：

```bash
make web-build                                  # 产出 web/.next/standalone
rsync -a --exclude node_modules --exclude .next --exclude .env.local web/ server:/srv/sfo/web/
rsync -a --exclude .venv --exclude .env backend/ server:/srv/sfo/backend/
```

服务器上：`python3 -m venv .venv && .venv/bin/pip install -r requirements/production.txt`、写好 `backend/.env`、
`python manage.py migrate && python manage.py collectstatic --noinput`，再用两个 systemd 单元：

- `sfo-web`：`gunicorn config.wsgi:application --bind 127.0.0.1:8000`（`WorkingDirectory` 指向 `backend/`，`EnvironmentFile` 指向 `.env`）
- `sfo-next`：`node server.js`（`WorkingDirectory` 指向 `web/.next/standalone`，`Environment` 里给 `PORT=3000`、`HOSTNAME=127.0.0.1`、`DJANGO_API_BASE`、`GITHUB_REDIRECT_URI`、`NODE_ENV=production`）

nginx 侧只要两条转发即可：`/api/ /admin/ /static/ /media/` → `127.0.0.1:8000`，其余 → `127.0.0.1:3000`，并带上
`Host` / `X-Forwarded-For` / `X-Forwarded-Proto` / `X-Forwarded-Host` 四个头（最后两个是 OAuth 与 CSRF 正确工作的前提）。

## 与上游（内部 SaaS 版）的差异

这套代码从内部版本裁剪而来，裁掉的与原因：

| 裁掉的东西 | 原因 |
|---|---|
| PDF → 知识资产管道、AI 造卡、内容平台、订阅、Stripe | 本次范围只要首页 + 登录，后续按里程碑搬 |
| Celery / RabbitMQ / MinIO / Redis | 上面那些功能没了就不需要队列与对象存储 |
| 邀请码（`accepted_invite` 外键、state 里的 invite） | 属于上游商业化逻辑 |
| `UserGeoMiddleware`（GeoIP） | 依赖 GeoLite2 mmdb，自部署者没有这个文件 |
| `config/wsgi.py` 里的 httpx monkey-patch | 那是给 openai SDK 用的，开源版不含 LLM 依赖 |

反过来，这套代码里补了上游没有的几处：

- `SECURE_PROXY_SSL_HEADER` 与 Secure cookie：上游没有，生产环境 admin 的 CSRF 校验其实是坏的
- 静态文件交给 whitenoise：`DEBUG=False` 时 admin 的 CSS/JS 不再 404，自部署不必额外配 nginx alias
- `DATABASES.PASSWORD` 没有默认值：上游默认值是真口令，开源即泄露
- cookie 名带 `sfo_` 前缀：本机同时跑上游项目时（同为 localhost:3000）不会互相顶掉

## 项目结构

```
backend/
  config/            settings / urls / wsgi / asgi
  apps/accounts/     用户模型、OAuth 登录、GitHub 回调中转、JWT 续期、16 个测试
  utils/             ULID 主键工具、DRF 渲染器
web/
  src/app/page.tsx           首页（SSR 营销页）
  src/app/login/             登录页（Google / GitHub 按钮）
  src/app/auth/callback/     OAuth 回调：换 JWT、写 cookie
  src/app/logout/            登出
  src/app/bff/[...path]/     同源 BFF 代理（cookie → Authorization）
  src/lib/{auth,jwt,origin,api}.ts
  src/middleware.ts          访问令牌自动续期
```

## 测试

```bash
cd backend && ./.venv/bin/python manage.py test apps.accounts     # 16 个测试
```

覆盖 OAuth 账号归属的边界：同一邮箱在 Google/GitHub 两种登录方式下的合并规则（只认已验证邮箱，防止别人填你的邮箱接管账号）、
username 撞名、GitHub 不公开邮箱时的占位与补齐、回调中转保真、上游错误透传。

## 许可

MIT，见 [LICENSE](LICENSE)。
