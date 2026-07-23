# PEA School Water Safety 2569 — Frontend

## ใช้งานบนเครื่องก่อน

เปิด `index.html` ผ่านเว็บเซิร์ฟเวอร์ เช่น VS Code Live Server ไม่ควรดับเบิลคลิกเปิดด้วย `file://`

## นำขึ้น GitHub Pages

1. สร้าง Repository ใหม่
2. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์ `frontend` ไปที่รากของ Repository
3. เปิด **Settings > Pages**
4. Source เลือก **Deploy from a branch**
5. Branch เลือก `main` และโฟลเดอร์ `/root`
6. กด Save และรอ GitHub สร้าง URL

## ตั้งค่า API

เปิด `config.js` แล้วแก้ `API_URL` เป็น URL `/exec` ของ Deployment ล่าสุด

```javascript
API_URL: 'https://script.google.com/macros/s/DEPLOYMENT_ID/exec'
```

## หมายเหตุเรื่องภาพ

ภาพถูกเก็บใน Google Drive หากองค์กรไม่อนุญาตให้แชร์สาธารณะ ผู้ใช้ต้องลงชื่อเข้าใช้บัญชี Google ที่มีสิทธิ์ จึงจะเปิดภาพได้
