# استخدم صورة node الرسمية
FROM node:18-slim

# إعداد Puppeteer: تثبيت المتطلبات الأساسية
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    libgbm1 \
    libgtk-3-0 \
    --no-install-recommends && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# إعداد مجلد العمل داخل الكونتينر
WORKDIR /app

# نسخ ملفات المشروع
COPY package*.json ./
RUN npm install

# نسخ بقية ملفات المشروع
COPY . .

# كشف البورت المستخدم (مثلاً 3001)
EXPOSE 3001

# تشغيل التطبيق
CMD ["node", "server.js"]
