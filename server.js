const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    maxHttpBufferSize: 1e7 // Giới hạn nhận dữ liệu 10MB để nhận được file ảnh chụp từ Webcam
});
const webpush = require('web-push');

app.use(express.json());
app.use(express.static(__dirname));

// Tự động tạo cặp khóa chuẩn VAPID khi khởi động để hệ thống Render không bị lỗi Failed
const vapidKeys = webpush.generateVAPIDKeys();
const publicVapidKey = vapidKeys.publicKey;
const privateVapidKey = vapidKeys.privateKey;

webpush.setVapidDetails('mailto:botcaocaoq@gmail.com', publicVapidKey, privateVapidKey);

// Bộ nhớ lưu trữ tạm thời các phiên chat trên RAM Server
let danhSachDangKyThongBao = [];
let mangTinNhanServer = []; 
let danhSachTaiKhoan = {};   

// Hàm tự động quét dọn xóa sạch tin nhắn cũ sau mỗi 20 phút để server luôn nhẹ, không bị lag
function quetTinNhanQua20Phut() {
    const bayGio = Date.now();
    const haiMuoiPhut = 20 * 60 * 1000; 
    mangTinNhanServer = mangTinNhanServer.filter(tinNhan => (bayGio - tinNhan.thoiGian) < haiMuoiPhut);
}
// Cứ mỗi 5 phút hệ thống tự động chạy kiểm tra bộ nhớ một lần
setInterval(quetTinNhanQua20Phut, 5 * 60 * 1000);

// 1. Đường dẫn mặc định mở trang chat chính (index.html)
app.get('/', (req, res) => { 
    res.sendFile(__dirname + '/index.html'); 
});

// 2. 🛠️ ĐÃ THÊM: Đường dẫn phụ mở trang gánh thử nghiệm Camera (index2.html)
app.get('/camera', (req, res) => {
    res.sendFile(__dirname + '/index2.html');
});

app.get('/vapid-public-key', (req, res) => { res.send(publicVapidKey); });

app.post('/luu-thong-bao', (req, res) => {
    const subscription = req.body;
    if (!danhSachDangKyThongBao.some(sub => sub.endpoint === subscription.endpoint)) {
        danhSachDangKyThongBao.push(subscription);
    }
    res.status(201).json({});
});

// Xử lý các sự kiện realtime kết nối Socket.io
io.on('connection', (socket) => {
    console.log('Có thiết bị kết nối vào phòng chat: ' + socket.id);

    // Xử lý đăng nhập kiểm tra mật khẩu bằng Nickname cụ thể
    socket.on('dang_nhap_he_thong', (data, callback) => {
        const username = data.ten.trim().toLowerCase();
        const password = data.matKhau;

        if (!username || username === "ẩn danh") {
            return callback({ success: false, msg: 'Tên tài khoản không hợp lệ!' });
        }

        if (!danhSachTaiKhoan[username]) {
            // Tên chưa từng tồn tại -> Tự động đăng ký mới với mật khẩu vừa nhập
            danhSachTaiKhoan[username] = password;
            callback({ success: true, isNew: true });
        } else {
            // Tên đã tồn tại trên hệ thống -> Bắt buộc kiểm tra trùng khớp mật khẩu cũ
            if (danhSachTaiKhoan[username] === password) {
                callback({ success: true, isNew: false });
            } else {
                callback({ success: false, msg: 'Sai mật khẩu của tài khoản này!' });
            }
        }
    });

    // Người vào sau (ở cả trang chính lẫn trang camera) tải lại lịch sử tin nhắn trong vòng 20 phút
    socket.on('lay_lich_su_khi_vao_sau', () => {
        quetTinNhanQua20Phut(); 
        socket.emit('tra_lich_su_cho_nguoi_moi', mangTinNhanServer);
    });

    socket.on('gui_tin_nhan_mau', (data) => {
        const tinNhanMoi = {
            loai: data.loai,
            ten: data.ten,
            chu: data.chu,
            thoiGian: Date.now() 
        };

        mangTinNhanServer.push(tinNhanMoi);
        io.emit('tin_nhan_moi_tu_server', tinNhanMoi);

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
http.listen(PORT, () => { console.log(`Server đang vận hành ổn định tại port: ${PORT}`); });
