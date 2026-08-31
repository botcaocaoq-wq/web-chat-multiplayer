const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const webpush = require('web-push');

app.use(express.json());
app.use(express.static(__dirname));

// THAY ĐỔI Ở ĐÂY: Sử dụng thông tin định danh cố định để các hệ điều hành điện thoại chấp nhận
const publicVapidKey = 'BEl62Ohayw3CaY9A7887_98Z_N3yB56-A8_7G-A_bB_C...'; // Trình duyệt tự sinh, bạn giữ nguyên cơ chế cũ hoặc gõ chuỗi cố định
const privateVapidKey = '...'; 

webpush.setVapidDetails(
  'mailto:your-email@gmail.com', // Thay bằng email thật của bạn để các hãng điện thoại (Google/Apple) xác thực và thông qua tường lửa
  'BEl62Ohayw3CaY9A7887_98Z_N3yB56-A8_7G-A_bB_C...', 
  '...'
);

// Giữ nguyên toàn bộ các đoạn code io.on('connection') và app.post ở phía dưới...
