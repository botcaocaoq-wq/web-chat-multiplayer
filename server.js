const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    maxHttpBufferSize: 1e7 // Tăng lên 10MB để nhận dữ liệu ảnh Base64
});
const webpush = require('web-push');

app.use(express.json());
app.use(express.static(__dirname));

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
        console.log('Server nhận từ ' + data.ten + ' (' + data.loai + ')');
        
        // Phát lại đầy đủ thông tin tên, loại tin nhắn và dữ liệu cho cả phòng chat
        io.emit('tin_nhan_moi_tu_server', {
            loai: data.loai,
            ten: data.ten,
            chu: data.chu,
            idSocketNguoiGui: data.idSocketNguoiGui
        });

        // Thiết lập nội dung thông báo đẩy khi ẩn tab
        let noiDungThongBao = data.loai === 'anh' ? '[Hình ảnh]' : data.chu;

        const payload = JSON.stringify({
            title: `Tin nhắn mới từ ${data.ten}`,
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
