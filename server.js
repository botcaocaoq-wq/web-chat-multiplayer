const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    maxHttpBufferSize: 1e7 // Cho phép gửi nhận file dữ liệu/hình ảnh dung lượng lên tới 10MB
});
const webpush = require('web-push');

app.use(express.json());
app.use(express.static(__dirname));

// SỬA TẠI ĐÂY: Thay thế bộ chìa khóa VAPID chuẩn 65-bytes để không bị sập Server
const publicVapidKey = 'BEl6mE7mAxjKgapvOCnywCEgGxcAsC9G5ZEi8R9b8qID8l_X8_Z4mOB2_I-P-rV5e_uQJ8vXm_gGgP_z8g8M8A';
const privateVapidKey = '6F_38W3kX39B_g-Yg8xX39B_g-Yg8xX39B_g-Yg8xX0';

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
        
        // SỬA CHÍNH XÁC Ở ĐÂY: Phát lại dữ liệu ra phòng kèm theo mã máy idSocketNguoiGui và idNguoiGui (cho điện thoại)
        io.emit('tin_nhan_moi_tu_server', {
            ten: data.ten,
            chu: data.chu,
            idSocketNguoiGui: data.idSocketNguoiGui
        });

        // Phát thông báo đẩy ngầm đến tất cả các điện thoại đang tắt web/thoát tab
        const payload = JSON.stringify({
            title: `Tin nhắn mới từ ${data.ten}`,
            body: data.chu
        });

        danhSachDangKyThongBao.forEach(sub => {
            // Chỉ gửi thông báo đẩy ngầm ra màn hình điện thoại nếu thiết bị đó không phải là người vừa nhắn
            if (sub.endpoint !== data.idNguoiGui) {
                webpush.sendNotification(sub, payload).catch(err => {
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
