# ── 构建阶段 ──
# ⚠️ NEXT_PUBLIC_* 是构建期内联的，必须在这里以 build args 传入；
#    只在运行期给环境变量不会生效（登录按钮会不出现）。
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=
ARG NEXT_PUBLIC_GITHUB_CLIENT_ID=
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
    NEXT_PUBLIC_GITHUB_CLIENT_ID=$NEXT_PUBLIC_GITHUB_CLIENT_ID

RUN npm run build \
 && cp -r .next/static .next/standalone/.next/ \
 && cp -r public .next/standalone/

# ── 运行阶段 ──
# 只带 standalone 产物：镜像里没有源码、没有 node_modules 全量依赖
FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./

EXPOSE 3000

CMD ["node", "server.js"]
