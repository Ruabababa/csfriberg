# 阿里云 ECS 部署

此部署方式运行一个长期存活的 Express + Socket.IO 进程，适用于阿里云 ECS。前端静态文件和 API 均由同一进程提供，Nginx 只负责 TLS 终止和反向代理。因此浏览器、API Cookie 和 WebSocket 始终使用同一个域名。

生产数据库和 Redis 应分别使用阿里云 RDS PostgreSQL、云数据库 Redis，且仅允许 ECS 通过同一 VPC 访问。不要在同一 ECS 上运行数据库，也不要把 3000、5432 或 6379 暴露到公网。

在中国大陆公网提供网站前，需要完成域名实名认证和 ICP 备案；这是接入大陆 ECS 公网服务的前置条件。

## 服务器准备

使用 Ubuntu 22.04/24.04 ECS，安装 Docker Engine、Docker Compose 插件和 Nginx。安全组只开放 TCP `80`、`443` 和管理用 SSH；应用端口 `3000` 仅绑定在 `127.0.0.1`。

将仓库部署到服务器，例如 `/opt/siegeguess`，并创建权限为 `600` 的 `.env.production`：

```dotenv
NODE_ENV=production
PORT=3000
DB_CLIENT=pg
DB_URL=postgresql://USER:PASSWORD@RDS_PRIVATE_HOST:5432/siegeguess?sslmode=require
DB_POOL_MIN=0
DB_POOL_MAX=10
REDIS_URL=rediss://:PASSWORD@REDIS_PRIVATE_HOST:6379
REDIS_REQUIRED=true
REDIS_PREFIX=siegeguess:production:
JWT_SECRET=replace-with-a-unique-random-value-of-at-least-32-bytes
GUEST_ID_SALT=replace-with-a-different-random-value-of-at-least-32-bytes
CORS_ORIGINS=https://example.com
TRUST_PROXY=true
MULTIPLAYER_ENABLED=true
VITE_MULTIPLAYER_ENABLED=true
SHOW_LEADERBOARD=true
POW_DIFFICULTY=17
```

使用 `openssl rand -base64 48` 分别生成 `JWT_SECRET` 和 `GUEST_ID_SALT`。`.env.production` 已被 Git 忽略，不能提交。

若首发不开放多人，将两个多人变量都设置为 `false`。开启多人时，Redis 必须是可用的 Redis 7.4+ 实例；同一 Redis 前缀下的 Socket.IO adapter 支持未来扩容多个 ECS 实例。

## 初始化与启动

首次针对空的 RDS 数据库运行一次迁移、固定种子导入和管理员创建。命令读取同一份生产环境文件：

```bash
docker compose --env-file .env.production run --rm siegeguess pnpm migrate
docker compose --env-file .env.production run --rm siegeguess pnpm seed
docker compose --env-file .env.production run --rm -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD='replace-this-long-password' siegeguess pnpm create-admin
docker compose --env-file .env.production up -d --build
```

管理员密码只应作为单次命令环境变量提供。启动后检查容器日志和生产前置检查：

```bash
docker compose logs --tail=100 siegeguess
docker compose --env-file .env.production exec siegeguess pnpm check:production
```

每次更改 `VITE_MULTIPLAYER_ENABLED` 都必须重新构建镜像，因为它会被 Vite 编译进浏览器资源：

```bash
docker compose --env-file .env.production up -d --build
```

## Nginx 与 HTTPS

将 `deploy/nginx/siegeguess.conf` 安装为 Nginx 站点配置，并将其中的 `example.com` 改为实际域名。配置显式转发 `Upgrade` 和 `Connection` 头，Socket.IO 的 WebSocket 连接才能正常升级。

签发证书后，将 HTTP 重定向到 HTTPS，并在 HTTPS server 块保留同样的 `location /` 代理配置。应用必须保持 `TRUST_PROXY=true`，才能在 TLS 终止于 Nginx 时正确设置安全 Cookie。

## 运维与回滚

发布前创建 RDS 备份，并定期将备份复制到独立存储：

```bash
docker compose --env-file .env.production exec siegeguess pnpm db:backup
```

镜像发布时保留上一个镜像标签。回滚应用时只回滚容器镜像，不回滚或删除已执行的数据库迁移。RDS 和 Redis 的安全组均应只允许 ECS 私网地址访问。
