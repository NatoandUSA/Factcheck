# 🚀 HƯỚNG DẪN TRIỂN KHAI & CẤU HÌNH HẠ TẦNG VPS (OMNISELLER STUDIO)

Tài liệu này hướng dẫn từng bước cấu hình máy chủ VPS (Ubuntu / Debian / Linux) để vận hành hệ thống **OmniSeller Studio** với hiệu năng tối đa, tải trang siêu tốc, bảo mật HTTPS SSL, và không bị gián đoạn dịch vụ 24/7.

---

## 1. YÊU CẦU PHẦN CỨNG & MÔI TRƯỜNG VPS

- **Hệ điều hành**: Ubuntu 22.04 LTS / Ubuntu 24.04 LTS / Debian 12
- **Cấu hình tối thiểu**: 2 CPU Cores, 2GB RAM, 20GB SSD
- **Node.js Runtime**: Node.js `>=22.0.0 <23.0.0` & `npm >=11.1.0`
- **Công cụ hỗ trợ**: `nginx`, `pm2`, `certbot`, `git`

---

## 2. BƯỚC 1: CÀI ĐẶT NODE.JS 22 & PM2 TRÊN VPS

```bash
# Update hệ thống
sudo apt update && sudo apt upgrade -y

# Cài đặt Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx git

# Kiểm tra phiên bản Node.js
node -v   # Phải hiển thị >= v22.x

# Cài đặt PM2 Process Manager toàn cục
sudo npm install -g pm2
```

---

## 3. BƯỚC 2: KHỞI TẠO THƯ MỤC DỮ LIỆU NGOÀI WORKTREE

Để đảm bảo dữ liệu sản xuất không bị xóa nhầm khi `git pull` hoặc cập nhật code:

```bash
sudo mkdir -p /var/lib/omniseller/imports
sudo mkdir -p /etc/omniseller

# Cấp quyền cho user chạy Node (ví dụ: ubuntu hoặc omniseller)
sudo chown -R $USER:$USER /var/lib/omniseller
sudo chown -R $USER:$USER /etc/omniseller

# Tạo file biến môi trường sản xuất
cat << 'EOF' > /etc/omniseller/omniseller.env
NODE_ENV=production
PORT=3001
OMNI_DB_PATH=/var/lib/omniseller/app.db
OMNI_IMPORTS_DIR=/var/lib/omniseller/imports
ALLOWED_ORIGINS=https://app.yourdomain.com
GEMINI_API_KEY=AIzaSyYourActualGeminiApiKeyHere
EOF

chmod 600 /etc/omniseller/omniseller.env
```

---

## 4. BƯỚC 3: CLONE MÃ NGUỒN & BUILD BUNDLE

```bash
cd /var/www
git clone https://github.com/NatoandUSA/Factcheck.git omniseller
cd omniseller

# Cài đặt dependencies và build giao diện
npm ci
npm run build
```

---

## 5. BƯỚC 4: KHỞI CHẠY PM2 PROCESS MANAGER

```bash
# Khởi chạy backend qua PM2 với cấu hình ecosystem
pm2 start ecosystem.config.cjs --env production

# Lưu trạng thái PM2 tự khởi động cùng OS
pm2 save
pm2 startup
```

---

## 6. BƯỚC 5: CẤU HÌNH NGINX REVERSE PROXY & SSL HTTPS

Tạo file cấu hình Nginx `/etc/nginx/sites-available/omniseller`:

```nginx
server {
    listen 80;
    server_name app.yourdomain.com; # Thay bằng tên miền VPS thực tế của bạn

    # Tăng dung lượng file upload tối đa (Cho Cerebro/Magnet Excel)
    client_max_body_size 50M;

    # Nén Gzip tăng tốc tải trang
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

    # Serving Static Frontend Assets (Vite Dist)
    root /var/www/omniseller/dist;
    index index.html;

    # Tối ưu Cache cho Static Assets (/assets/)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, no-transform, immutable";
    }

    # SPA Routing Fallback (Ngăn lỗi 404 khi reload trang)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Reverse Proxy cho API Backend
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

Kích hoạt trang Nginx và cấp HTTPS miễn phí via Certbot:

```bash
sudo ln -s /etc/nginx/sites-available/omniseller /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Cấp chứng chỉ SSL HTTPS Let's Encrypt
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d app.yourdomain.com
```

---

## 7. BƯỚC 6: TỰ ĐỘNG SAO LƯU DATABASE (DAILY BACKUP CRON)

Tạo script sao lưu tự động `/etc/omniseller/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/var/lib/omniseller/backups"
mkdir -p $BACKUP_DIR
DATE=$(date +%Y%m%d_%H%M%S)
cp /var/lib/omniseller/app.db $BACKUP_DIR/app_backup_$DATE.db
# Xóa các bản backup cũ hơn 30 ngày
find $BACKUP_DIR -name "app_backup_*.db" -mtime +30 -exec rm {} \;
```

Cấu hình Cronjob chạy 00:00 hàng ngày:
```bash
crontab -e
# Thêm dòng sau:
0 0 * * * /bin/bash /etc/omniseller/backup.sh > /dev/null 2>&1
```

---

## 8. KIỂM TRA SỨC KHỎE HỆ THỐNG (HEALTH CHECK)

- Kiểm tra Health endpoint: `curl https://app.yourdomain.com/api/health`
- Kiểm tra log PM2: `pm2 logs omniseller-api`
- Kiểm tra trạng thái Nginx: `sudo systemctl status nginx`
