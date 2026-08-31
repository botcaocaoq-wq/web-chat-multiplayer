const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    maxHttpBufferSize: 1e7 // Cho phép truyền ảnh dung lượng tối đa 10MB
});
const webpush = require('web-push');

app.use(express.json());
app.use(express.static(__dirname));

// Tự động tạo cặp khóa chuẩn 65 bytes khi khởi động server
const vapidKeys = webpush.generateVAPIDKeys();
const publicVapidKey = vapidKeys.publicKey;
const privateVapidKey = vapidKeys.privateKey;

webpush.setVapidDetails(
  'mailto:botcaocaoq@gmail.com', 
  publicVapidKey,
  privateVapidKey
);

let danhSachDangKyThongBao = [];

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/vapid-public-key', (req, res) => {
    res.send(publicVapidKey);
});

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
        // ĐỒNG BỘ TẠI ĐÂY: Phát lại toàn bộ object data (gồm loai, noiDung hoặc chu) ra phòng chat
        io.emit('tin_nhan_moi_tu_server', data);

        // Nội dung hiển thị trên thông báo đẩy ngầm ngoài màn hình
        let noiDungThongBao = data.loai === 'anh' ? '[Hình ảnh]' : (data.chu || data.noiDung);

        const payload = JSON.stringify({
            title: `Tin nhắn mới từ phòng chat`,
            body: noiDungThongBao
        });

        danhSachDangKyThongBao.forEach(sub => {
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
