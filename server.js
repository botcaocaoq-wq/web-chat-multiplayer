const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const webpush = require('web-push');

app.use(express.json());
app.use(express.static(__dirname));

// Tạo chìa khóa bảo mật để gửi thông báo ngầm
const vapidKeys = webpush.generateVAPIDKeys();
webpush.setVapidDetails(
  'mailto:example@yourdomain.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

let danhSachDangKyThongBao = [];

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Cổng nhận chìa khóa công khai từ trình duyệt
app.get('/vapid-public-key', (req, res) => {
    res.send(vapidKeys.publicKey);
});

// Lưu lại thiết bị của bạn để gửi thông báo kể cả khi tắt web
app.post('/luu-thong-bao', (req, res) => {
    const subscription = req.body;
    if (!danhSachDangKyThongBao.some(sub => sub.endpoint === subscription.endpoint)) {
        danhSachDangKyThongBao.push(subscription);
    }
    res.status(201).json({});
});

io.on('connection', (socket) => {
    socket.on('gui_tin_nhan_mau', (data) => {
        io.emit('tin_nhan_moi_tu_server', data);

        // GỬI THÔNG BÁO NGẦM CHO TẤT CẢ THIẾT BỊ ĐÃ ĐĂNG KÝ (KỂ CẢ KHI HỌ ĐÃ TẮT WEB)
        const payload = JSON.stringify({
            title: `Tin nhắn mới từ ${data.ten}`,
            body: data.chu
        });

        danhSachDangKyThongBao.forEach(sub => {
            webpush.sendNotification(sub, payload).catch(err => {
                // Nếu thiết bị đó không còn tồn tại thì xóa bỏ khỏi danh sách
                if (err.statusCode === 410) {
                    danhSachDangKyThongBao = danhSachDangKyThongBao.filter(s => s.endpoint !== sub.endpoint);
                }
            });
        });
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server đang chạy tại cổng: ${PORT}`);
});
