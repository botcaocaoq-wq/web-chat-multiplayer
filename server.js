const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    maxHttpBufferSize: 1e7 // Giới hạn nhận dữ liệu 10MB
});
const webpush = require('web-push');

app.use(express.json());
app.use(express.static(__dirname));

// Tự động tạo cặp khóa chuẩn VAPID
const vapidKeys = webpush.generateVAPIDKeys();
const publicVapidKey = vapidKeys.publicKey;
const privateVapidKey = vapidKeys.privateKey;

webpush.setVapidDetails('mailto:botcaocaoq@gmail.com', publicVapidKey, privateVapidKey);

// Lưu trữ dữ liệu trên Server
let danhSachDangKyThongBao = [];
let mangTinNhanServer = []; // Lưu tin nhắn để người vào sau vẫn xem được
let danhSachTaiKhoan = {};   // Lưu dạng { 'ten_dang_nhap': 'mat_khau' }

// Hàm tự động xóa tin nhắn cũ sau 24 giờ
function quetTinNhanQua24Gio() {
    const bayGio = Date.now();
    const haiMuoiBonGio = 24 * 60 * 60 * 1000;
    mangTinNhanServer = mangTinNhanServer.filter(tinNhan => (bayGio - tinNhan.thoiGian) < haiMuoiBonGio);
}
// Chạy quét dọn mỗi 10 phút một lần
setInterval(quetTinNhanQua24Gio, 10 * 60 * 1000);

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });
app.get('/vapid-public-key', (req, res) => { res.send(publicVapidKey); });

app.post('/luu-thong-bao', (req, res) => {
    const subscription = req.body;
    if (!danhSachDangKyThongBao.some(sub => sub.endpoint === subscription.endpoint)) {
        danhSachDangKyThongBao.push(subscription);
    }
    res.status(201).json({});
});

io.on('connection', (socket) => {
    console.log('Có kết nối mới: ' + socket.id);

    // Tính năng 1: Xử lý đăng nhập bằng Nickname + Mật khẩu
    socket.on('dang_nhap_he_thong', (data, callback) => {
        const username = data.ten.trim().toLowerCase();
        const password = data.matKhau;

        if (!username || username === "ẩn danh") {
            return callback({ success: false, msg: 'Tên không hợp lệ!' });
        }

        if (!danhSachTaiKhoan[username]) {
            // Tên chưa tồn tại -> Tự động đăng ký mới
            danhSachTaiKhoan[username] = password;
            callback({ success: true, isNew: true });
        } else {
            // Tên đã tồn tại -> Kiểm tra mật khẩu
            if (danhSachTaiKhoan[username] === password) {
                callback({ success: true, isNew: false });
            } else {
                callback({ success: false, msg: 'Sai mật khẩu của tài khoản này!' });
            }
        }
    });

    // Tính năng 2: Người vào sau tải lại toàn bộ tin nhắn chưa quá 24h
    socket.on('lay_lich_su_khi_vao_sau', () => {
        quetTinNhanQua24Gio(); // Quét lại một lần trước khi gửi dữ liệu cho người mới
        socket.emit('tra_lich_su_cho_nguoi_moi', mangTinNhanServer);
    });

    socket.on('gui_tin_nhan_mau', (data) => {
        const tinNhanMoi = {
            loai: data.loai,
            ten: data.ten,
            chu: data.chu,
            thoiGian: Date.now() // Ghi lại mốc thời gian để tính 24h
        };

        mangTinNhanServer.push(tinNhanMoi);
        io.emit('tin_nhan_moi_tu_server', tinNhanMoi);

        // Phát thông báo đẩy ngầm ngoài màn hình
        let noiDungThongBao = data.loai === 'anh' ? '[Hình ảnh]' : data.chu;
        const payload = JSON.stringify({ title: `Tin nhắn từ ${data.ten}`, body: noiDungThongBao });

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

    socket.on('disconnect', () => { console.log('Một thiết bị đã ngắt kết nối.'); });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`Server chạy tại cổng: ${PORT}`); });
