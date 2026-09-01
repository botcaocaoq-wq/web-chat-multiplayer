const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const webpush = require('web-push');

app.use(express.json());
app.use(express.static(__dirname));

// Khởi tạo và thiết lập cặp khóa bảo mật Web-Push VAPID tự động cho máy chủ
const vapidKeys = webpush.generateVAPIDKeys();
webpush.setVapidDetails('mailto:botcaocaoq@gmail.com', vapidKeys.publicKey, vapidKeys.privateKey);

let mangTinNhanServer = []; 
let danhSachTaiKhoan = {};   
let danhSachCamServer = {}; 
let mangThongBaoSubscriptions = []; // Danh sách lưu trữ các thiết bị đăng ký nhận thông báo đẩy ngầm

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });
app.get('/camera', (req, res) => { res.sendFile(__dirname + '/index2.html'); });

// API cung cấp mã khóa public-key phục vụ Push Manager phía client
app.get('/vapid-public-key', (req, res) => { res.send(vapidKeys.publicKey); });

// API lưu giữ thông tin định danh endpoint của thiết bị nhận thông báo ngầm
app.post('/save-subscription', (req, res) => {
    const sub = req.body;
    if (sub && sub.endpoint) mangThongBaoSubscriptions.push(sub);
    res.sendStatus(201);
});

// Cơ chế tự động quét dọn sạch rác dữ liệu phòng chat sau mỗi 20 phút (1.200.000 mili giây)
setInterval(() => {
    mangTinNhanServer = []; 
    io.emit('lenh_xoa_sach_phong_chat_client'); 
    console.log('Hệ thống tự động: Đã quét sạch rác tin nhắn phòng chat sau 20 phút.');
}, 1200000);

io.on('connection', (socket) => {
    console.log('Thiết bị kết nối: ' + socket.id);

    // Xử lý sự kiện đăng nhập và kiểm tra mật khẩu đồng bộ
    socket.on('dang_nhap_he_thong', (data, callback) => {
        const username = data.ten.trim().toLowerCase();
        const password = data.matKhau;
        if (!username || username === "ẩn danh") return callback({ success: false, msg: 'Tên không hợp lệ!' });
        
        if (!danhSachTaiKhoan[username]) {
            danhSachTaiKhoan[username] = password;
            callback({ success: true });
        } else {
            if (danhSachTaiKhoan[username] === password) callback({ success: true });
            else callback({ success: false, msg: 'Sai mật khẩu!' });
        }
    });

    // Nhận tin nhắn chat và tiến hành phát thông báo đẩy Web-Push tới TẤT CẢ mọi người (kể cả online/offline)
    socket.on('gui_tin_nhan_server', (data) => {
        mangTinNhanServer.push(data);
        socket.broadcast.emit('nhan_tin_nhan_client', data);

        // Đóng gói payload nội dung thông báo nổ về màn hình thiết bị
        const payload = JSON.stringify({
            title: `Tin nhắn mới từ ${data.ten}`,
            body: data.loai === 'image' ? '[Hình ảnh 📷]' : data.noiDung
        });

        // Vòng lặp phân phối gửi tín hiệu thông báo đẩy chạy ngầm thời gian thực
        mangThongBaoSubscriptions.forEach(sub => {
            webpush.sendNotification(sub, payload).catch(err => {
                console.error('Lỗi gửi thông báo đến thiết bị:', err.message);
            });
        });
    });

    socket.on('lay_lich_su_khi_vao_sau', () => {
        socket.emit('tra_lich_su_cho_nguoi_moi', mangTinNhanServer);
        socket.emit('dong_bo_tat_ca_camera_hieng_tai', danhSachCamServer);
    });

    socket.on('xin_phep_bat_camera_server', (data, callback) => {
        danhSachCamServer[socket.id] = data.ten;
        if (callback) callback({ allowed: true });
        socket.broadcast.emit('co_nguoi_vua_bat_camera', { idSocket: socket.id, ten: data.ten });
    });

    // CƠ CHẾ ĐIỀU HƯỚNG MẢNG ẢNH: Đóng gói phát quảng bá luồng dữ liệu băm nhỏ từ Canvas
    socket.on('rtc_tin_hieu_chuyen_tiep', (data) => {
        if (data && data.to === 'ALL_ROOM') {
            socket.broadcast.emit('rtc_tin_hieu_nhan_ve', {
                sender: socket.id,
                type: data.type,
                base64: data.base64,
                isMirror: data.isMirror,
                label: data.label
            });
        }
    });

    socket.on('chu_dong_tat_camera_server', () => {
        if (danhSachCamServer[socket.id]) {
            delete danhSachCamServer[socket.id];
            io.emit('co_nguoi_vua_tat_camera', { idSocket: socket.id });
        }
    });

    socket.on('disconnect', () => {
        console.log('Thiết bị ngắt kết nối: ' + socket.id);
        if (danhSachCamServer[socket.id]) {
            delete danhSachCamServer[socket.id];
            io.emit('co_nguoi_vua_tat_camera', { idSocket: socket.id });
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`Server chạy tại port: ${PORT}`); });
