const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const webpush = require('web-push');

app.use(express.json());
app.use(express.static(__dirname));

// Bộ chìa khóa cố định bảo mật kết hợp với Email của bạn
const publicVapidKey = 'BJh2lbyiHwcl6BmsFmU2V0iRzscv79-rFvScl5B8o2j5AWhC_X2w2E90Wc15t1Xv';
const privateVapidKey = '_X2w2E90Wc15t1XvBJh2lbyiHwcl6BmsFmU2V0iRzsc';

webpush.setVapidDetails(
  'mailto:botcaocaoq@gmail.com', // Email định danh chính thức của bạn để vượt tường lửa điện thoại
  publicVapidKey,
  privateVapidKey
);

let danhSachDangKyThongBao = [];

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Trả về đúng khóa cố định cho trình duyệt nhận diện
app.get('/vapid-public-key', (req, res) => {
    res.send(publicVapidKey);
});

// Lưu thiết bị chạy ngầm của người dùng (máy tính hoặc điện thoại)
app.post('/luu-thong-bao', (req, res) => {
    const subscription = req.body;
    if (!danhSachDangKyThongBao.some(sub => sub.endpoint === subscription.endpoint)) {
        danhSachDangKyThongBao.push(subscription);
    }
    res.status(201).json({});
});

io.on('connection', (socket) => {
    console.log('Có một người chơi vừa kết nối vào phòng!');

    socket.on('gui_tin_nhan_mau', (data) => {
        console.log('Server nhận được tin nhắn từ ' + data.ten + ': ' + data.chu);
        io.emit('tin_nhan_moi_tu_server', data);

        // Tạo nội dung thông báo đẩy ngầm
        const payload = JSON.stringify({
            title: `Tin nhắn mới từ ${data.ten}`,
            body: data.chu
        });

        // Phát thông báo đẩy ngầm đến tất cả các điện thoại đã đăng ký kích hoạt
        danhSachDangKyThongBao.forEach(sub => {
            // TÍNH NĂNG THÔNG MINH: Chỉ gửi thông báo nếu thiết bị đó KHÔNG PHẢI là người vừa ấn nút gửi
            if (sub.endpoint !== data.idNguoiGui) {
                webpush.sendNotification(sub, payload).catch(err => {
                    // Nếu người dùng gỡ cài đặt hoặc chặn thông báo thì xóa thiết bị đó khỏi danh sách
                    if (err.statusCode === 410) {
                        danhSachDangKyThongBao = danhSachDangKyThongBao.filter(s => s.endpoint !== sub.endpoint);
                    }
                });
            }
        });
    });

    socket.on('disconnect', () => {
        console.log('Một người chơi đã thoát.');
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server đang chạy tại cổng: ${PORT}`);
});
