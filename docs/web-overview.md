# Tổng quan web OrbitStack

## 1. Web này dùng để làm gì

OrbitStack là một web control plane nhỏ để thao tác với hạ tầng OpenStack theo kiểu "một chỗ làm nhiều việc". Từ giao diện này, người dùng có thể:

- xem danh sách VM đang có
- tạo VM mới bằng preset hoặc form nhanh
- kết nối GitHub để lấy repo triển khai
- mở terminal SSH ngay trong trình duyệt
- quản lý database hosting cho từng tài khoản GitHub
- quản trị plan và quota database qua một trang admin riêng

Điểm quan trọng là app này không chỉ là frontend. Nó còn đóng vai trò backend trung gian để:

- gọi OpenStack CLI
- xử lý OAuth với GitHub
- làm lớp điều phối cho MySQL database hosting
- trả connection info về cho người dùng

## 2. Các thành phần chính

Hệ thống hiện tại có 3 phần lớn:

1. Web app Next.js
2. SSH WebSocket proxy
3. Telegram bot

### 2.1. Web app Next.js

Các điểm vào chính:

- trang gốc: [src/app/page.tsx](C:/Users/luunh/OneDrive/Desktop/Openstack/src/app/page.tsx:1)
- shell chính: [src/components/DashboardClientShell.tsx](C:/Users/luunh/OneDrive/Desktop/Openstack/src/components/DashboardClientShell.tsx:1)
- dashboard runtime: [src/components/Dashboard.tsx](C:/Users/luunh/OneDrive/Desktop/Openstack/src/components/Dashboard.tsx:1)

App dùng App Router và đặt cả page route lẫn API route trong `src/app`.

### 2.2. SSH WebSocket proxy

- file: [ssh-server.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/ssh-server.ts:1)

Process này chạy song song với Next.js khi dev. Browser không SSH trực tiếp tới VM mà mở WebSocket tới proxy này, sau đó proxy tạo kết nối SSH thật bằng `ssh2`.

Nó chịu trách nhiệm:

- mở terminal trong trình duyệt
- chuyển input/output terminal qua WebSocket
- resize shell theo kích thước giao diện

Mặc định proxy chạy ở cổng `3001`.

### 2.3. Telegram bot

- file: [telegram-bot.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/telegram-bot.ts:1)

Bot này là giao diện phụ, dùng chung logic OpenStack để:

- xem danh sách VM
- tạo VM theo wizard
- xóa VM

Bot không bắt buộc để web hoạt động.

## 3. Các workspace và route chính

Web được chia thành nhiều workspace thay vì dồn vào một trang:

- `/` -> tổng quan, vào tab `mission`
- `/fleet` -> quản lý danh sách VM
- `/launch` -> tạo VM
- `/inspect` -> xem chi tiết VM và thao tác sâu hơn
- `/command` -> xem trạng thái runtime và thông tin điều phối
- `/terminal` -> terminal riêng
- `/databases` -> giao diện database hosting
- `/dashboard/databases` -> route database trong khu dashboard
- `/database-admin` -> trang admin riêng cho database hosting

Phần lớn route dashboard đều dùng lại chung [src/components/Dashboard.tsx](C:/Users/luunh/OneDrive/Desktop/Openstack/src/components/Dashboard.tsx:1) và đổi tab bằng prop `tab`.

## 4. Luồng xác thực GitHub

Các file chính:

- gate UI: [src/components/GitHubAccessGate.tsx](C:/Users/luunh/OneDrive/Desktop/Openstack/src/components/GitHubAccessGate.tsx:1)
- login route: [src/app/api/github/login/route.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/app/api/github/login/route.ts:1)
- callback route: [src/app/api/github/callback/route.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/app/api/github/callback/route.ts:1)
- status route: [src/app/api/github/status/route.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/app/api/github/status/route.ts:1)
- helper OAuth: [src/lib/github-oauth.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/lib/github-oauth.ts:1)

Luồng hoạt động:

1. Người dùng bấm đăng nhập GitHub
2. App redirect sang GitHub OAuth với PKCE
3. GitHub callback về `/api/github/callback`
4. Server đổi `code` lấy access token
5. Token được lưu vào cookie `gh_token`
6. UI gọi `/api/github/status` để biết trình duyệt hiện tại đang đăng nhập bằng tài khoản nào

Lưu ý:

- session GitHub hiện tại là theo cookie từng browser
- app không nên dùng token global theo server process
- nếu request không có `gh_token` thì phải bị coi là chưa đăng nhập

## 5. Luồng OpenStack VM

Phần OpenStack nằm chủ yếu ở:

- helper CLI: [src/lib/openstack.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/lib/openstack.ts:1)
- API tạo VM: [src/app/api/create-vm/route.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/app/api/create-vm/route.ts:1)
- API lấy danh sách VM: [src/app/api/get-instances/route.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/app/api/get-instances/route.ts:1)
- API xóa VM: [src/app/api/delete-vm/route.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/app/api/delete-vm/route.ts:1)
- API phụ trợ: `vm-ip`, `vm-status`, `images`

App hiện không dùng OpenStack SDK mà đi qua CLI:

1. source file `openrc`
2. chạy `openstack ...`
3. parse JSON hoặc text trả về

Hàm trung tâm là `runCLI()` trong [src/lib/openstack.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/lib/openstack.ts:35).

Khi tạo VM, flow thường là:

1. resolve image, flavor, network
2. sinh user-data script tạm
3. gọi `openstack server create`
4. cấu hình hostname, SSH, password và package trong user-data
5. cài thêm Docker, Node.js, Python, MySQL, Redis, Nginx... nếu preset yêu cầu

## 6. Terminal và deploy

Các file liên quan:

- [src/components/TerminalWorkbench.tsx](C:/Users/luunh/OneDrive/Desktop/Openstack/src/components/TerminalWorkbench.tsx:1)
- [src/components/GitHubDeployModal.tsx](C:/Users/luunh/OneDrive/Desktop/Openstack/src/components/GitHubDeployModal.tsx:1)
- [src/lib/terminal-workspace.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/lib/terminal-workspace.ts:1)
- [src/lib/deploy-recipes.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/lib/deploy-recipes.ts:1)

Phần này dùng để:

- giữ trạng thái terminal trên browser
- chuẩn bị deployment plan từ repo GitHub
- lưu snapshot workbench vào `sessionStorage`
- chuyển thông tin triển khai sang terminal để người dùng chạy trên VM

Nói ngắn gọn: đây là workbench hỗ trợ operator thao tác nhanh hơn, chưa phải một hệ CI/CD hoàn chỉnh.

## 7. Database hosting

Đây là module lớn thứ hai sau phần quản lý VM.

### 7.1. Giao diện database cho người dùng

- page: [src/app/databases/page.tsx](C:/Users/luunh/OneDrive/Desktop/Openstack/src/app/databases/page.tsx:1)
- component: [src/components/database/DatabaseHostingConsole.tsx](C:/Users/luunh/OneDrive/Desktop/Openstack/src/components/database/DatabaseHostingConsole.tsx:1)

API chính:

- [src/app/api/databases/route.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/app/api/databases/route.ts:1)
- [src/app/api/databases/usage/route.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/app/api/databases/usage/route.ts:1)
- [src/app/api/databases/[id]/route.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/app/api/databases/[id]/route.ts:1)
- [src/app/api/databases/[id]/connection/route.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/app/api/databases/[id]/connection/route.ts:1)
- [src/app/api/databases/[id]/reset-password/route.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/app/api/databases/[id]/reset-password/route.ts:1)

### 7.2. Trang admin database

- page: [src/app/database-admin/page.tsx](C:/Users/luunh/OneDrive/Desktop/Openstack/src/app/database-admin/page.tsx:1)
- component: [src/components/database-admin/DatabaseAdminConsole.tsx](C:/Users/luunh/OneDrive/Desktop/Openstack/src/components/database-admin/DatabaseAdminConsole.tsx:1)
- API: [src/app/api/database-admin/route.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/app/api/database-admin/route.ts:1)

### 7.3. Logic backend cho database hosting

- file trung tâm: [src/lib/mysql-admin.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/lib/mysql-admin.ts:1)

Module này phụ trách:

- bootstrap schema control database
- đồng bộ user GitHub vào bảng `users`
- seed `plans` và `quotas`
- tạo MySQL user cho từng user nền tảng
- tạo database vật lý
- cấp lại password
- trả connection info
- tổng hợp usage và quota
- phục vụ trang admin đổi plan và quota

Các bảng metadata quan trọng:

- `users`
- `plans`
- `quotas`
- `database_accounts`
- `databases`
- `usage_stats`
- `audit_logs`

Nếu cần đọc sâu phần này, xem thêm:

- [docs/database-hosting-architecture.md](C:/Users/luunh/OneDrive/Desktop/Openstack/docs/database-hosting-architecture.md:1)

## 8. Các helper backend quan trọng

### 8.1. Quy ước tên database

- [src/lib/db-name.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/lib/db-name.ts:1)

Phần này dùng để:

- làm sạch label người dùng nhập
- sinh tên database thật
- sinh MySQL username
- escape identifier an toàn

### 8.2. Mã hóa mật khẩu

- [src/lib/password.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/lib/password.ts:1)

Phần này dùng để:

- sinh password mạnh
- mã hóa và giải mã secret lưu trong control database
- đọc `DATABASE_HOSTING_ENCRYPTION_KEY`

### 8.3. Plan và quota

- [src/lib/quota.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/lib/quota.ts:1)

Đây là nơi định nghĩa các gói mặc định:

- `free`
- `pro`
- `business`

Đồng thời có helper tính quota còn lại cho mỗi user.

## 9. API map rút gọn

### 9.1. GitHub

- `GET /api/github/login`
- `GET /api/github/callback`
- `GET /api/github/status`
- `GET /api/github/repos`
- `GET /api/github/logout`

### 9.2. OpenStack VM

- `POST /api/create-vm`
- `GET /api/get-instances`
- `POST /api/delete-vm`
- `GET /api/vm-ip`
- `GET /api/vm-status/[id]`
- `GET /api/images`

### 9.3. Database hosting

- `GET /api/databases`
- `POST /api/databases`
- `GET /api/databases/usage`
- `DELETE /api/databases/[id]`
- `GET /api/databases/[id]/connection`
- `POST /api/databases/[id]/reset-password`
- `GET /api/database-admin`
- `PATCH /api/database-admin`

## 10. Các biến môi trường quan trọng

### 10.1. OpenStack

- `OPENRC_PATH`
- `OS_USERNAME`
- `OS_PROJECT_NAME`

Được dùng trong [src/lib/openstack.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/lib/openstack.ts:8).

### 10.2. GitHub OAuth

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_CALLBACK_URL`

Được dùng trong [src/lib/github-oauth.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/lib/github-oauth.ts:1).

### 10.3. SSH WebSocket

- `SSH_WS_PORT`

Được dùng trong [ssh-server.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/ssh-server.ts:11).

### 10.4. Database hosting

- `DATABASE_HOSTING_ADMIN_HOST`
- `DATABASE_HOSTING_ADMIN_PORT`
- `DATABASE_HOSTING_ADMIN_USER`
- `DATABASE_HOSTING_ADMIN_PASSWORD`
- `DATABASE_HOSTING_CONTROL_DATABASE`
- `DATABASE_HOSTING_CONNECT_HOST`
- `DATABASE_HOSTING_CONNECT_PORT`
- `DATABASE_HOSTING_MYSQL_HOST_ALLOW`
- `DATABASE_HOSTING_DEFAULT_PLAN`
- `DATABASE_HOSTING_CREATE_LIMIT_PER_HOUR`
- `DATABASE_HOSTING_ENCRYPTION_KEY`
- `DATABASE_HOSTING_ADMIN_GITHUB_USERS`

Nhóm này được đọc chủ yếu trong [src/lib/mysql-admin.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/lib/mysql-admin.ts:199).

## 11. Cách chạy local

Lệnh chính:

```bash
npm run dev
```

Script này chạy đồng thời:

- `next dev`
- `tsx ssh-server.ts`

Trong `package.json` hiện có:

- `npm run dev` -> web + SSH proxy
- `npm run build` -> build Next.js
- `npm run start` -> chạy production build
- `npm run bot` -> chạy Telegram bot

## 12. Những điểm cần chú ý khi vận hành

### 12.1. Đây là control plane động, không chỉ là UI

Rất nhiều API route ở đây gọi trực tiếp ra ngoài:

- OpenStack CLI
- GitHub OAuth và GitHub API
- MySQL admin/control database

Vì vậy lỗi runtime thường nằm ở:

- env
- quyền filesystem
- process ownership
- callback URL
- khả năng kết nối tới OpenStack, GitHub hoặc MySQL

### 12.2. Session GitHub là theo browser

Nếu có hiện tượng người này đăng nhập mà người khác vẫn thấy phiên đó, cần kiểm tra:

- cookie `gh_token`
- browser profile hoặc cửa sổ ẩn danh
- process đang chạy có đúng code mới nhất không

### 12.3. Database hosting phụ thuộc vào hạ tầng MySQL thật

App chỉ là lớp điều phối. Khi tạo, xóa hoặc reset password database, nó phải:

- kết nối được tới MySQL admin host
- có quyền tạo user, tạo database, grant và revoke
- bootstrap control schema thành công

### 12.4. VIP và failover MySQL là bài toán hạ tầng

Nếu app trỏ vào một VIP để failover master/slave thì bản thân VIP phải reachable thật. App không tự sửa được các vấn đề như:

- `allowed-address-pairs`
- ARP hoặc neighbor cache
- port security của OpenStack
- failover hoặc failback của MySQL

## 13. Thứ tự nên đọc code khi onboard

Nếu muốn hiểu repo nhanh, nên đọc theo thứ tự này:

1. [src/app/page.tsx](C:/Users/luunh/OneDrive/Desktop/Openstack/src/app/page.tsx:1)
2. [src/components/DashboardClientShell.tsx](C:/Users/luunh/OneDrive/Desktop/Openstack/src/components/DashboardClientShell.tsx:1)
3. [src/components/Dashboard.tsx](C:/Users/luunh/OneDrive/Desktop/Openstack/src/components/Dashboard.tsx:1)
4. [src/components/GitHubAccessGate.tsx](C:/Users/luunh/OneDrive/Desktop/Openstack/src/components/GitHubAccessGate.tsx:1)
5. [src/lib/openstack.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/lib/openstack.ts:1)
6. [src/lib/mysql-admin.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/src/lib/mysql-admin.ts:1)
7. [ssh-server.ts](C:/Users/luunh/OneDrive/Desktop/Openstack/ssh-server.ts:1)

Thứ tự này giúp người mới nắm được:

- người dùng vào app như thế nào
- dashboard và các workspace được dựng ra sao
- auth GitHub chặn app như thế nào
- backend nói chuyện với OpenStack và MySQL bằng cách nào
- terminal SSH trong browser hoạt động thế nào

## 14. Tóm tắt ngắn

OrbitStack là một web control plane cho OpenStack, GitHub và database hosting.

Nó có 3 lớp chính:

- frontend workbench cho operator
- Next.js API layer cho auth, OpenStack và MySQL
- SSH proxy để mở terminal trong trình duyệt

Nếu cần đào sâu riêng phần database hosting, đọc thêm:

- [docs/database-hosting-architecture.md](C:/Users/luunh/OneDrive/Desktop/Openstack/docs/database-hosting-architecture.md:1)
