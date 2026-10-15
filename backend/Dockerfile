FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# 先装依赖：改了业务代码不会让这一层失效
COPY requirements/ requirements/
# 网络受限时可传 --build-arg PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
ARG PIP_INDEX_URL=
RUN pip install --no-cache-dir ${PIP_INDEX_URL:+--index-url "$PIP_INDEX_URL"} \
      -r requirements/production.txt

COPY . .

# collectstatic 在构建期做，静态文件随镜像走。
# 这里的密钥只用于让 settings 能导入，运行期的真密钥由环境变量注入。
RUN DJANGO_SECRET_KEY=build-only POSTGRES_PASSWORD=build-only \
    python manage.py collectstatic --noinput

EXPOSE 8000

CMD ["gunicorn", "config.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "2", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
