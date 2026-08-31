const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const webpush = require('web-push');

app.use(express.json());
app.use(express.static(__dirname));

// Cấu hình mã khóa thông báo đẩy VAPID
const vapidKeys = webpush.generateVAPIDKeys();
webpush.setVapidDetails('mailto:botcaocaoq@gmail.com', vapidKeys.publicKey, vapidKeys.privateKey);

// Bộ nhớ đệm lưu trữ dữ liệu tạm thời trên bộ nhớ Server
let mangTinNhanServer = []; 
let danhSachTaiKhoan = {};   
let danhSachCamServer = {}; // Cấu trúc lưu tên thiết bị: { idSocket: nickname }

// Định tuyến các trang giao diện (Routing)
app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });
app.get('/camera', (req, res) => { res.sendFile(__dirname + '/index2.html'); });
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

    // 2. Nhận tin nhắn chat từ Client (Text & Ảnh đính kèm đĩa cứng)
    socket.on('gui_tin_nhan_server', (data) => {
        mangTinNhanServer.push(data);
        socket.broadcast.emit('nhan_tin_nhan_client', data);
    });

    // Tự động gửi lại lịch sử phòng khi người dùng tải lại trang (F5)
    socket.on('lay_lich_su_khi_vao_sau', () => {
        socket.emit('tra_lich_su_cho_nguoi_moi', mangTinNhanServer);
        socket.emit('dong_bo_tat_ca_camera_hieng_tai', danhSachCamServer);
    });

    // Ghi nhận trạng thái đang phát trực tiếp màn hình
    socket.on('xin_phep_bat_camera_server', (data, callback) => {
        danhSachCamServer[socket.id] = data.ten;
        callback({ allowed: true });
        // Phát tín hiệu thông báo cho toàn phòng tạo khung trống chờ nạp dữ liệu
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
                label: data.label
            });
        } else if (data && data.to) {
            // Giữ lại cấu trúc trung chuyển p2p dự phòng nếu cần dùng sau này
            io.to(data.to).emit('rtc_tin_hieu_nhan_ve', {
                sender: socket.id,
                type: data.type,
                sdp: data.sdp,
                candidate: data.candidate
            });
        }
    });

    // Xử lý gỡ bỏ luồng phát khi người dùng nhấn nút đóng chia sẻ màn hình
    socket.on('chu_dong_tat_camera_server', () => {
        if (danhSachCamServer[socket.id]) {
            delete danhSachCamServer[socket.id];
            io.emit('co_nguoi_vua_tat_camera', { idSocket: socket.id });
        }
    });

    // Giải phóng hoàn toàn dữ liệu và gỡ luồng stream khi người dùng tắt tab trình duyệt
    socket.on('disconnect', () => {
        console.log('Thiết bị ngắt kết nối: ' + socket.id);
        if (danhSachCamServer[socket.id]) {
            delete danhSachCamServer[socket.id];
            // Ép xóa bỏ khung hiển thị ảnh của người này trên toàn phòng chat
            io.emit('co_nguoi_vua_tat_camera', { idSocket: socket.id });
        }
    });
});

// Khởi chạy máy chủ Node.js Express
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`Server chạy tại: http://localhost:${PORT}`); });
