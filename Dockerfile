FROM node:18-bullseye

# تثبيت المتطلبات الضرورية للنظام (ffmpeg, imagemagick, webp)
RUN apt-get update && \
  apt-get install -y \
  ffmpeg \
  imagemagick \
  webp && \
  apt-get upgrade -y && \
  rm -rf /var/lib/apt/lists/*

# إعداد مجلد العمل
WORKDIR /usr/src/app

# نسخ ملفات تعريف المشروع وتثبيت المكاتب
COPY package*.json ./
RUN npm install

# نسخ باقي ملفات البوت
COPY . .

# أمر تشغيل البوت
CMD ["npm", "start"]
