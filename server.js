const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    maxHttpBufferSize: 1e7 // Giới hạn 10MB nhận luồng stream siêu tốc
});
const webpush = require('web-push');

app.use(express.json());
app.use(express.static(__dirname));

const vapidKeys = webpush.generateVAPIDKeys();
const publicVapidKey = vapidKeys.publicKey;
const privateVapidKey = vapidKeys.privateKey;
webpush.setVapidDetails('mailto:botcaocaoq@gmail.com', publicVapidKey, privateVapidKey);

let danhSachDangKyThongBao = [];
let mangTinNhanServer = []; 
let danhSachTaiKhoan = {};   

// 🛠️ MỚI: Danh sách quản lý tối đa 4 người đang bật Camera Livestream
let danhSachCamServer = {}; // Lưu dạng { idSocket: nickname }

function quetTinNhanQua20Phut() {
    const bayGio = Date.now();
    const haiMuoiPhut = 20 * 60 * 1000; 
    mangTinNhanServer = mangTinNhanServer.filter(tinNhan => (bayGio - tinNhan.thoiGian) < haiMuoiPhut);
}
setInterval(quetTinNhanQua20Phut, 5 * 60 * 1000);

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });
app.get('/camera', (req, res) => { res.sendFile(__dirname + '/index2.html'); });
app.get('/vapid-public-key', (req, res) => { res.send(publicVapidKey); });

io.on('connection', (socket) => {
    console.log('Thiết bị kết nối: ' + socket.id);

    socket.on('dang_nhap_he_thong', (data, callback) => {
        const username = data.ten.trim().toLowerCase();
        const password = data.matKhau;
        if (!username || username === "ẩn danh") return callback({ success: false, msg: 'Tên không hợp lệ!' });

        if (!danhSachTaiKhoan[username]) {
            danhSachTaiKhoan[username] = password;
            callback({ success: true, isNew: true });
        } else {
            if (danhSachTaiKhoan[username] === password) callback({ success: true, isNew: false });
            else callback({ success: false, msg: 'Sai mật khẩu!' });
        }
    });

    socket.on('lay_lich_su_khi_vao_sau', () => {
        socket.emit('tra_lich_su_cho_nguoi_moi', mangTinNhanServer);
        // 🛠️ MỚI: Gửi danh sách các camera đang phát cho người vào sau đồng bộ giao diện
        socket.emit('dong_bo_tat_ca_camera_hieng_tai', danhSachCamServer);
    });

    // 🛠️ MỚI: Logic xin quyền bật camera (Giới hạn tối đa 4 người)
    socket.on('xin_phep_bat_camera_server', (data, callback) => {
        const soLuongCam = Object.keys(danhSachCamServer).length;
        if (soLuongCam >= 4) {
            return callback({ allowed: false, msg: "Phòng livestream đã đầy (Tối đa 4 người)! Vui lòng đợi người khác tắt cam." });
        }
        // Thêm vào danh sách phát
        danhSachCamServer[socket.id] = data.ten;
        callback({ allowed: true });
        // Phát tín hiệu cho cả server tạo thêm khung video mới
        io.emit('co_nguoi_vua_bat_camera', { idSocket: socket.id, ten: data.ten });
    });

    // 🛠️ MỚI: Trung chuyển luồng dữ liệu Livestream liên tục từ máy phát đến các máy xem
    socket.on('luong_livestream_tu_may_khach', (data) => {
        socket.broadcast.emit('luong_livestream_tu_server_ve', {
            idSocket: socket.id,
            khungHinh: data.khungHinh
        });
    });

    // 🛠️ MỚI: Xử lý khi có người chủ động tắt camera
    socket.on('chu_dong_tat_camera_server', () => {
        if (danhSachCamServer[socket.id]) {
            delete danhSachCamServer[socket.id];
            io.emit('co_nguoi_vua_tat_camera', { idSocket: socket.id });
        }
    });

    socket.on('gui_tin_nhan_mau', (data) => {
        const tinNhanMoi = { loai: data.loai, ten: data.ten, chu: data.chu, thoiGian: Date.now() };
        mangTinNhanServer.push(tinNhanMoi);
        io.emit('tin_nhan_moi_tu_server', tinNhanMoi);
    });

    // Xử lý khi người dùng tắt tab / ngắt kết nối đột ngột
    socket.on('disconnect', () => {
        if (danhSachCamServer[socket.id]) {
            delete danhSachCamServer[socket.id];
            io.emit('co_nguoi_vua_tat_camera', { idSocket: socket.id });
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`Server port: ${PORT}`); });
