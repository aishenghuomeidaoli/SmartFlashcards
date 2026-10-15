.PHONY: help up dev-db down logs migrate superuser test build web-build

help:
	@echo "make up         起全套（db + 后端 + 前端，含迁移）"
	@echo "make dev-db     只起数据库（本机手动跑后端/前端时用）"
	@echo "make down       停掉并删除容器（数据卷保留）"
	@echo "make logs       跟随后端与前端日志"
	@echo "make migrate    在容器里跑迁移"
	@echo "make superuser  在容器里建 admin 超级用户"
	@echo "make test       在容器里跑后端测试"
	@echo "make build      重建镜像"
	@echo "make web-build  本机构建前端 standalone 产物（用于非 Docker 部署）"

up:
	docker compose up -d --build

dev-db:
	docker compose up -d db

down:
	docker compose down

logs:
	docker compose logs -f backend web

migrate:
	docker compose exec backend python manage.py migrate

superuser:
	docker compose exec backend python manage.py createsuperuser

test:
	docker compose exec backend python manage.py test apps.accounts

build:
	docker compose build

# 非 Docker 部署：本机构建前端，只把 .next/standalone 传到服务器（服务器不需要 node_modules）
web-build:
	cd web && npm ci && npm run build \
	  && cp -r .next/static .next/standalone/.next/ \
	  && cp -r public .next/standalone/
