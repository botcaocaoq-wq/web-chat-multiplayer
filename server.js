const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const webpush = require('web-push');

app.use(express.json());
app.use(express.static(__dirname));

// Cấu hình mã khóa thông báo đẩy VAPID tự động
const vapidKeys = webpush.generateVAPIDKeys();
webpush.setVapidDetails('mailto:botcaocaoq@gmail.com', vapidKeys.publicKey, vapidKeys.privateKey);

// Bộ nhớ đệm lưu trữ dữ liệu tạm thời trên RAM Server
let mangTinNhanServer = []; 
let danhSachTaiKhoan = {};   
let danhSachCamServer = {}; // Cấu trúc lưu tên thiết bị: { idSocket: nickname }
let mangThongBaoSubscriptions = []; // ĐÃ THÊM: Lưu danh sách các thiết bị đăng ký nhận thông báo đẩy ngầm

// Định tuyến các trang giao diện (Routing)
app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });
app.get('/camera', (req, res) => { res.sendFile(__dirname + '/index2.html'); });

// ĐÃ THÊM: API trung chuyển mã khóa và lưu thông tin thiết bị nhận thông báo ngầm
app.get('/vapid-public-key', (req, res) => { res.send(vapidKeys.publicKey); });

app.post('/save-subscription', (req, res) => {
    const sub = req.body;
    if (sub && sub.endpoint) mangThongBaoSubscriptions.push(sub);
    res.sendStatus(201);
});

// Tự động quét và xóa sạch tin nhắn lưu trữ của phòng chat sau mỗi 20 phút (1.200.000 mili giây)
setInterval(() => {
    mangTinNhanServer = []; // Xóa rác mảng lưu trữ tin nhắn cũ trên server
    io.emit('lenh_xoa_sach_phong_chat_client'); // Ép tất cả các tab đang mở tự động dọn sạch khung chat tại chỗ
    console.log('Hệ thống tự động: Đã quét sạch rác tin nhắn phòng chat sau 20 phút.');
}, 1200000);
io.on('connection', (socket) => {
    console.log('Thiết bị kết nối: ' + socket.id);

    // 1. Hệ thống xác thực tài khoản phòng chat
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

    // 2. Nhận tin nhắn chat từ Client và tự động bắn thông báo đẩy cho các máy đang tắt web
    socket.on('gui_tin_nhan_server', (data) => {
        mangTinNhanServer.push(data);
        socket.broadcast.emit('nhan_tin_nhan_client', data);

        // ĐÃ THÊM: Đóng gói nội dung thông báo đẩy thời gian thực
        const payload = JSON.stringify({
            title: `Tin nhắn mới từ ${data.ten}`,
            body: data.loai === 'image' ? '[Hình ảnh 📷]' : data.noiDung
        });

        // Quét danh sách, bắn thông báo thẳng về màn hình khóa điện thoại/máy tính của mọi người
        mangThongBaoSubscriptions.forEach(sub => {
            webpush.sendNotification(sub, payload).catch(err => {
                console.error('Lỗi gửi thông báo đến thiết bị:', err.message);
            });
        });
    });

    // Tự động gửi lại lịch sử phòng khi người dùng tải lại trang (F5) hoặc vào sau
    socket.on('lay_lich_su_khi_vao_sau', () => {
        socket.emit('tra_lich_su_cho_nguoi_moi', mangTinNhanServer);
        socket.emit('dong_bo_tat_ca_camera_hieng_tai', danhSachCamServer);
    });

    // Ghi nhận trạng thái đang phát trực tiếp luồng live
    socket.on('xin_phep_bat_camera_server', (data, callback) => {
        danhSachCamServer[socket.id] = data.ten;
        if (callback) callback({ allowed: true });
        socket.broadcast.emit('co_nguoi_vua_bat_camera', { idSocket: socket.id, ten: data.ten });
    });

    // 3. ĐỊNH TUYẾN SIÊU TỐC: Điều phối gói dữ liệu băm nhỏ ảnh Canvas gửi toàn phòng chat
    socket.on('rtc_tin_hieu_chuyen_tiep', (data) => {
        if (data && data.to === 'ALL_ROOM') {
            // Phát quảng bá truyền thẳng luồng ảnh cho mọi người ghép nối ngay lập tức
            socket.broadcast.emit('rtc_tin_hieu_nhan_ve', {
                sender: socket.id,
                type: data.type,
                base64: data.base64,
                isMirror: data.isMirror,
                label: data.label
            });
        }
    });

    // Xử lý gỡ bỏ luồng phát khi người dùng chủ động tắt live
    socket.on('chu_dong_tat_camera_server', () => {
        if (danhSachCamServer[socket.id]) {
            delete danhSachCamServer[socket.id];
            io.emit('co_nguoi_vua_tat_camera', { idSocket: socket.id });
        }
    });

    // Giải phóng hoàn toàn dữ liệu và gỡ luồng stream khi người dùng tắt hẳn tab trình duyệt
    socket.on('disconnect', () => {
        console.log('Thiết bị ngắt kết nối: ' + socket.id);
        if (danhSachCamServer[socket.id]) {
            delete danhSachCamServer[socket.id];
            // Ép xóa bỏ khung hiển thị ảnh của người này trên toàn phòng chat
            io.emit('co_nguoi_vua_tat_camera', { idSocket: socket.id });
        }
    });
});

// Khởi chạy máy chủ Node.js Express trên môi trường Render
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`Server chạy tại: http://localhost:${PORT}`); });
