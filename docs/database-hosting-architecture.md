# OrbitStack Database Hosting

## 1. Kiến trúc tổng thể

Module Database Hosting hoạt động như một control plane riêng nằm trong app Next.js hiện có:

- `Next.js App Router` đóng vai trò API gateway và dashboard UI.
- `Shared MySQL/MariaDB server` chạy trong OpenStack private network.
- `App backend` giữ admin/root credential nội bộ để:
  - tạo database
  - tạo mysql user scoped theo từng user
  - reset password
  - grant / revoke privilege
  - ghi audit log và thống kê usage
- `User VM` chỉ là client kết nối MySQL, không giữ quyền root và không tự tạo DB.

## 2. Production design

### Control plane

- App route:
  - `GET /api/databases`
  - `POST /api/databases`
  - `DELETE /api/databases/:id`
  - `POST /api/databases/:id/reset-password`
  - `GET /api/databases/:id/connection`
  - `GET /api/databases/usage`
- Service layer:
  - `src/lib/mysql-admin.ts`
  - `src/lib/db-name.ts`
  - `src/lib/password.ts`
  - `src/lib/quota.ts`
- UI:
  - `src/app/dashboard/databases/page.tsx`
  - `src/app/databases/page.tsx`
  - `src/components/database/*`

### Data plane

- Một MySQL server riêng trong private subnet.
- App dùng admin user nội bộ.
- Mỗi user có một MySQL account riêng.
- Mỗi user có thể có nhiều database dưới cùng MySQL account.
- Database name theo convention:
  - `gh_<githubUsername>_<dbName>`
- MySQL username:
  - `gh_<githubUsername>`

## 3. Schema nội bộ

Schema metadata được bootstrap tự động vào control database `orbitstack_control`:

- `plans`
- `users`
- `database_accounts`
- `databases`
- `quotas`
- `usage_stats`
- `audit_logs`

Thiết kế hiện tại bám sát yêu cầu multi-tenant:

- `plans` giữ quota mặc định.
- `users` map GitHub user sang app user nội bộ.
- `database_accounts` giữ MySQL username + password reference đã mã hóa.
- `databases` giữ từng DB đã cấp phát.
- `quotas` cho phép override quota riêng theo user.
- `usage_stats` cache usage và active connections.
- `audit_logs` ghi toàn bộ create/delete/reset/view-connection.

## 4. Backend workflow

### Create database

1. Xác thực user qua GitHub session.
2. Validate `name`.
3. Sanitize:
   - lowercase
   - chỉ `[a-z0-9_]`
   - độ dài `3-32`
4. Sinh:
   - `real_db_name`
   - `mysql_username`
5. Kiểm tra:
   - rate limit
   - quota số lượng DB
   - duplicate name
6. Nếu chưa có MySQL account:
   - tạo MySQL user
   - sinh strong password
   - mã hóa password reference
7. `CREATE DATABASE`
8. `GRANT` đúng quyền scoped trên đúng DB
9. Ghi metadata vào `databases`
10. Update `usage_stats`
11. Ghi `audit_logs`
12. Nếu fail ở giữa:
   - revoke / drop DB
   - drop MySQL user nếu account mới vừa tạo

### Delete database

1. Xác thực user
2. Tìm DB thuộc đúng user
3. `REVOKE`
4. `DROP DATABASE`
5. Đánh dấu `deleted`
6. Nếu user không còn DB nào:
   - drop luôn MySQL account
7. Refresh usage
8. Audit log

### Reset password

- Rotate password cho toàn bộ MySQL account của user.
- Vì một MySQL account dùng chung nhiều database, mọi app đang dùng user đó phải cập nhật password mới.

## 5. UI implementation

Route mới:

- `/databases`
- `/dashboard/databases`

Component:

- `CreateDatabaseDialog`
- `DatabaseTable`
- `ConnectionModal`
- `QuotaWidget`
- `DatabaseHostingConsole`

Widget chính:

- Plan hiện tại
- Tổng số DB đã dùng
- Storage used
- Active connections
- Upgrade CTA

Table actions:

- View Connection
- Reset Password
- Delete

Modal connection hiển thị:

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DATABASE_URL`

## 6. Environment variables

```env
# Shared DB admin
DATABASE_HOSTING_ADMIN_HOST=10.0.20.10
DATABASE_HOSTING_ADMIN_PORT=3306
DATABASE_HOSTING_ADMIN_USER=orbitstack_admin
DATABASE_HOSTING_ADMIN_PASSWORD=super_strong_internal_password

# Internal control schema
DATABASE_HOSTING_CONTROL_DATABASE=orbitstack_control

# Host user VMs should connect to
DATABASE_HOSTING_CONNECT_HOST=10.0.20.10
DATABASE_HOSTING_CONNECT_PORT=3306

# Allow pattern for MySQL user host
DATABASE_HOSTING_MYSQL_HOST_ALLOW=10.%

# Quota / defaults
DATABASE_HOSTING_DEFAULT_PLAN=free
DATABASE_HOSTING_CREATE_LIMIT_PER_HOUR=8

# Secret encryption for password reference
# Preferred: 32-byte raw, 64-char hex, or base64 of 32 bytes.
# Fallback: any passphrase is deterministically derived to 32 bytes via SHA-256.
DATABASE_HOSTING_ENCRYPTION_KEY=<strong-secret-passphrase-or-32-byte-key>
```

## 7. Package install

```bash
npm install mysql2
```

## 8. Security best practices

- Không `GRANT ALL ON *.*`
- Không cấp:
  - `SUPER`
  - `FILE`
  - `PROCESS`
  - `SHUTDOWN`
  - `RELOAD`
  - `CREATE USER`
  - `GRANT OPTION`
- Chỉ dùng allow-list privileges theo từng DB.
- Sanitize và escape toàn bộ identifier.
- Password reference mã hóa AES-256-GCM.
- Không log plaintext password.
- Rate limit create/reset endpoint.
- Audit toàn bộ hành động nhạy cảm.
- DB server chỉ mở private access.

## 9. Billing và quota strategy

Plan seed hiện tại:

- Free
  - 1 database
  - 1 GB
  - 10 connections
- Pro
  - 5 databases
  - 20 GB
  - 40 connections
- Business
  - 20 databases
  - 100 GB
  - 120 connections

Billing-ready hướng mở rộng:

- Thêm `subscriptions` table
- Track storage by daily snapshots
- Track connection peaks
- Trigger upgrade prompt khi còn dưới 10% quota
- Suspend DB khi plan hết hạn bằng `suspendUserDatabases()`

## 10. OpenStack networking

Khuyến nghị:

- User VM subnet:
  - `10.0.10.0/24`
- Shared DB subnet:
  - `10.0.20.0/24`
- DB host:
  - `10.0.20.10`

Security Group cho DB server:

- Allow `TCP 3306` from `10.0.10.0/24`
- Optional allow riêng từ từng tenant subnet
- Deny public internet inbound
- Chỉ mở SSH quản trị qua bastion hoặc admin subnet

## 11. Backup strategy

- Daily logical backup:
  - `mysqldump --single-transaction`
- Daily volume snapshot từ OpenStack
- Retention:
  - daily 7 bản
  - weekly 4 bản
  - monthly 3 bản
- Test restore định kỳ vào staging DB server
- Với Business plan:
  - thêm replica read-only hoặc warm standby

## 12. Monitoring strategy

- MySQL metrics:
  - CPU
  - RAM
  - disk usage
  - active connections
  - slow queries
  - aborted connections
- App metrics:
  - create DB success/fail
  - password reset count
  - rate limit hit count
  - per-user quota saturation
- Alerting:
  - Telegram/admin alert khi:
    - storage > 80%
    - active connections spike
    - create failures tăng bất thường
    - slow query backlog

## 13. Deployment guide

1. Tạo VM riêng cho MySQL/MariaDB trong private network.
2. Gắn volume riêng cho data.
3. Hardening MySQL:
   - bind address private
   - disable public bind
   - strong admin password
   - backups
4. Set security groups chỉ cho private VM subnet.
5. Thêm env vào app server.
6. Chạy app:
   - route đầu tiên sẽ tự bootstrap schema `orbitstack_control`
7. Test create DB từ UI trước khi mở cho user thật.

## 14. End-to-end test checklist

### Happy path

1. Login GitHub
2. Tạo VM user
3. Vào `/dashboard/databases`
4. Tạo DB `blog`
5. Lấy connection info
6. SSH vào VM user
7. Kết nối:
   - `mysql -h 10.0.20.10 -u gh_user -p`
8. Tạo table / insert / select trong DB đó

### Quota

1. User Free tạo DB đầu tiên
2. Thử tạo DB thứ 2
3. Kỳ vọng API trả `403`

### Password rotation

1. View connection lần đầu
2. Reset password
3. Kết nối cũ fail
4. Kết nối mới success

### Delete

1. Delete DB
2. Confirm không còn connect vào DB đó
3. Confirm metadata biến mất khỏi list

### Abuse / security

1. Spam create DB > rate limit
2. Kỳ vọng `429`
3. Thử nhập tên DB xấu:
   - `../../root`
   - `DROP_DB`
   - `db-name`
4. Kỳ vọng bị sanitize / reject

## Ghi chú production

Implementation hiện tại đã đi theo cấu trúc production-grade cho control plane và quyền MySQL. Nếu muốn đưa lên mức cloud hosting thương mại hoàn chỉnh hơn, bước tiếp theo nên là:

- chuyển metadata sang Prisma/Drizzle migrations chính thức
- thêm Redis cho rate limit phân tán
- thêm worker/cron cho refresh storage stats định kỳ
- thêm billing/subscription ledger
- thêm replica / backup verification pipeline
