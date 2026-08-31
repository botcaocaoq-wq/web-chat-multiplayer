const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const webpush = require('web-push');

app.use(express.json());
app.use(express.static(__dirname));

// Cấu hình mã khóa thông báo đẩy VAPID
const vapidKeys = webpush.generateVAPIDKeys();
const publicVapidKey = vapidKeys.publicKey;
const privateVapidKey = vapidKeys.privateKey;
webpush.setVapidDetails('mailto:botcaocaoq@gmail.com', publicVapidKey, privateVapidKey);

// Bộ nhớ đệm lưu trữ dữ liệu tạm thời
let mangTinNhanServer = []; 
let danhSachTaiKhoan = {};   
let danhSachCamServer = {}; // Cấu trúc: { idSocket: { ten: 'Nickname', loai: 'camera' hoặc 'screen' } }

// Định tuyến các trang giao diện (Routing)
app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });
app.get('/camera', (req, res) => { res.sendFile(__dirname + '/index2.html'); });
app.get('/vapid-public-key', (req, res) => { res.send(publicVapidKey); });
io.on('connection', (socket) => {
    console.log('Thiết bị kết nối: ' + socket.id);

    // 1. Hệ thống xác thực tài khoản phòng chat
    socket.on('dang_nhap_he_thong', (data, callback) => {
        if (!data || !data.ten) return callback({ success: false, msg: 'Dữ liệu không hợp lệ!' });
        
        const username = data.ten.trim().toLowerCase();
        const password = data.matKhau;
        
        if (!username || username === "ẩn danh") {
            return callback({ success: false, msg: 'Tên không hợp lệ!' });
        }
        
        if (!danhSachTaiKhoan[username]) {
            danhSachTaiKhoan[username] = password;
            callback({ success: true, isNew: true });
        } else {
            if (danhSachTaiKhoan[username] === password) {
                callback({ success: true, isNew: false });
            } else {
                callback({ success: false, msg: 'Sai mật khẩu!' });
            }
        }
    });

    // 2. Đồng bộ tin nhắn chat từ Client (Đã sửa đổi để map chuẩn với hàm guiTinNhan/guiAnhTuDong)
    socket.on('gui_tin_nhan_server', (data) => {
        if (!data) return;
        const tinNhanMoi = { 
            loai: data.loai,        // 'text' hoặc 'image'
            ten: data.ten,          // Nickname người gửi
            noiDung: data.noiDung,  // Văn bản text hoặc chuỗi Base64 của ảnh
            thoiGian: data.thoiGian || Date.now() 
        };
        mangTinNhanServer.push(tinNhanMoi);
        // Gửi quảng bá (Broadcast) cho tất cả các thiết bị khác trong phòng nhận về
        socket.broadcast.emit('nhan_tin_nhan_client', tinNhanMoi);
    });

    // Lấy lịch sử tin nhắn cũ và luồng stream khi người dùng tải lại trang
    socket.on('lay_lich_su_khi_vao_sau', () => {
        socket.emit('tra_lich_su_cho_nguoi_moi', mangTinNhanServer);
        socket.emit('dong_bo_tat_ca_camera_hieng_tai', danhSachCamServer);
    });

    // 3. Quản lý WebRTC: Xin cấp phép mở luồng live (Giới hạn tối đa 4 luồng)
    socket.on('xin_phep_bat_camera_server', (data, callback) => {
        const soLuongCam = Object.keys(danhSachCamServer).length;
        if (soLuongCam >= 4) {
            return callback({ allowed: false, msg: "Phòng đã đầy (Tối đa 4 luồng phát)!" });
        }
        
        // Lưu thông tin định danh luồng phát
        danhSachCamServer[socket.id] = {
            ten: data.ten,
            loai: data.loai || 'camera' // Phân biệt camera phần cứng hoặc screen share
        };
        
        callback({ allowed: true });
        io.emit('co_nguoi_vua_bat_camera', { idSocket: socket.id, ten: data.ten, loai: data.loai });
    });

    // Kênh trung gian điều hướng luồng bắt tay kỹ thuật (Offer, Answer, ICE Candidate)
    socket.on('rtc_tin_hieu_chuyen_tiep', (data) => {
        if (data && data.to) {
            io.to(data.to).emit('rtc_tin_hieu_nhan_ve', {
                sender: socket.id,
                type: data.type,
                sdp: data.sdp,
                candidate: data.candidate
            });
        }
    });

    // Xử lý khi người dùng chủ động tắt camera hoặc đóng chia sẻ màn hình
    socket.on('chu_dong_tat_camera_server', () => {
        if (danhSachCamServer[socket.id]) {
            delete danhSachCamServer[socket.id];
            io.emit('co_nguoi_vua_tat_camera', { idSocket: socket.id });
        }
    });

    // Tự động giải phóng luồng camera khi người dùng đóng tab trình duyệt
    socket.on('disconnect', () => {
        console.log('Thiết bị ngắt kết nối: ' + socket.id);
        if (danhSachCamServer[socket.id]) {
            delete danhSachCamServer[socket.id];
            io.emit('co_nguoi_vua_tat_camera', { idSocket: socket.id });
        }
    });
});

// Khởi chạy máy chủ Node.js Express
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`Server chạy thành công tại port: ${PORT}`); });
